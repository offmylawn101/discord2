const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, DEFAULT_PERMISSIONS, checkPermission } = require('../utils/permissions');
const cache = require('../utils/cache');

const router = express.Router();

// Server icon upload setup
const iconStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads', 'icons'),
  filename: (req, file, cb) => cb(null, `${req.params.serverId}-${Date.now()}${path.extname(file.originalname)}`),
});
const iconUpload = multer({ storage: iconStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only images are allowed'));
}});

// Create server
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name || name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Server name must be 2-100 characters' });
    }

    const serverId = uuidv4();
    const roleId = uuidv4();
    const generalCategoryId = uuidv4();
    const textChannelId = uuidv4();
    const voiceChannelId = uuidv4();

    await db.transaction(async (tx) => {
      // Create server
      await tx.run(`
        INSERT INTO servers (id, name, icon, owner_id)
        VALUES (?, ?, ?, ?)
      `, [serverId, name, icon || null, req.userId]);

      // Create @everyone role
      await tx.run(`
        INSERT INTO roles (id, server_id, name, color, position, permissions, is_default)
        VALUES (?, ?, '@everyone', '#99AAB5', 0, ?, 1)
      `, [roleId, serverId, DEFAULT_PERMISSIONS.toString()]);

      // Update server's default role
      await tx.run('UPDATE servers SET default_role_id = ? WHERE id = ?', [roleId, serverId]);

      // Create default category
      await tx.run(`
        INSERT INTO channel_categories (id, server_id, name, position)
        VALUES (?, ?, 'Text Channels', 0)
      `, [generalCategoryId, serverId]);

      // Create #general text channel
      await tx.run(`
        INSERT INTO channels (id, server_id, category_id, name, type, position)
        VALUES (?, ?, ?, 'general', 'text', 0)
      `, [textChannelId, serverId, generalCategoryId]);

      // Create General voice channel
      await tx.run(`
        INSERT INTO channels (id, server_id, category_id, name, type, position)
        VALUES (?, ?, ?, 'General', 'voice', 1)
      `, [voiceChannelId, serverId, generalCategoryId]);

      // Set system channel
      await tx.run('UPDATE servers SET system_channel_id = ? WHERE id = ?', [textChannelId, serverId]);

      // Add owner as member
      await tx.run(`
        INSERT INTO server_members (server_id, user_id)
        VALUES (?, ?)
      `, [serverId, req.userId]);

      // Assign @everyone role to owner
      await tx.run(`
        INSERT INTO member_roles (server_id, user_id, role_id)
        VALUES (?, ?, ?)
      `, [serverId, req.userId, roleId]);
    });

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    const channels = await db.all('SELECT * FROM channels WHERE server_id = ?', [serverId]);
    const roles = await db.all('SELECT * FROM roles WHERE server_id = ?', [serverId]);
    const categories = await db.all('SELECT * FROM channel_categories WHERE server_id = ?', [serverId]);

    res.status(201).json({ ...server, channels, roles, categories });
  } catch (err) {
    console.error('Create server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's servers
router.get('/', authenticate, async (req, res) => {
  try {
    const servers = await db.all(`
      SELECT s.* FROM servers s
      INNER JOIN server_members sm ON sm.server_id = s.id
      WHERE sm.user_id = ?
      ORDER BY s.created_at
    `, [req.userId]);
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get server by ID (with full data)
router.get('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const member = await db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!member) return res.status(403).json({ error: 'You are not a member of this server' });

    // Try cache first
    const cacheKey = `server:${serverId}:detail`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const channels = await db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY position', [serverId]);
    const categories = await db.all('SELECT * FROM channel_categories WHERE server_id = ? ORDER BY position', [serverId]);
    const roles = await db.all('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC', [serverId]);
    const members = await db.all(`
      SELECT u.id, u.username, u.discriminator, u.avatar, u.status, u.custom_status,
             sm.nickname, sm.joined_at, sm.muted, sm.deafened
      FROM server_members sm
      INNER JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ?
    `, [serverId]);

    // Get member roles
    for (const m of members) {
      const memberRoles = await db.all('SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?', [serverId, m.id]);
      m.roles = memberRoles.map(r => r.role_id);
    }

    const responseData = { ...server, channels, categories, roles, members };
    await cache.set(cacheKey, responseData, 60); // 1 minute TTL
    res.json(responseData);
  } catch (err) {
    console.error('Get server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update server
router.patch('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const { name, icon, banner, description, system_channel_id } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
    if (banner !== undefined) { updates.push('banner = ?'); values.push(banner); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (system_channel_id !== undefined) { updates.push('system_channel_id = ?'); values.push(system_channel_id); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(serverId);

    await db.run(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`, values);
    await cache.del(`server:${serverId}:detail`);
    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete server
router.delete('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Only the server owner can delete the server' });
    }

    await db.run('DELETE FROM servers WHERE id = ?', [serverId]);
    await cache.del(`server:${serverId}:detail`);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload server icon
router.post('/:serverId/icon', authenticate, iconUpload.single('icon'), async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const iconUrl = `/uploads/icons/${req.file.filename}`;
    await db.run('UPDATE servers SET icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [iconUrl, serverId]);
    await cache.del(`server:${serverId}:detail`);
    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    res.json(server);
  } catch (err) {
    console.error('Server icon upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave server
router.delete('/:serverId/members/@me', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const server = await db.get('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.owner_id === req.userId) {
      return res.status(400).json({ error: 'Server owner cannot leave. Transfer ownership or delete the server.' });
    }

    await db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    res.json({ left: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server-wide message search
router.get('/:serverId/search', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { q, channel_id, author_id, has, before, after, limit = 25 } = req.query;
    if (!q) return res.json({ messages: [], total: 0 });

    // Verify membership
    const member = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const searchLimit = Math.min(parseInt(limit) || 25, 50);
    let messages;

    if (db.isPg) {
      const tsquery = q.split(/\s+/).filter(Boolean).join(' & ');
      let pgSql = `
        SELECT m.*, u.username, u.discriminator, u.avatar, c.name as channel_name,
          ts_rank(m.search_vector, to_tsquery('english', $1)) as rank
        FROM messages m
        INNER JOIN users u ON u.id = m.author_id
        INNER JOIN channels c ON c.id = m.channel_id
        WHERE c.server_id = $2 AND m.search_vector @@ to_tsquery('english', $1)
      `;
      const params = [tsquery, serverId];
      let paramIdx = 3;

      if (channel_id) {
        pgSql += ` AND m.channel_id = $${paramIdx}`;
        params.push(channel_id);
        paramIdx++;
      }
      if (author_id) {
        pgSql += ` AND m.author_id = $${paramIdx}`;
        params.push(author_id);
        paramIdx++;
      }
      if (has === 'link') pgSql += ` AND m.content LIKE '%http%'`;
      if (has === 'file') pgSql += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id)`;
      if (before) {
        pgSql += ` AND m.created_at < $${paramIdx}`;
        params.push(before);
        paramIdx++;
      }
      if (after) {
        pgSql += ` AND m.created_at > $${paramIdx}`;
        params.push(after);
        paramIdx++;
      }

      pgSql += ` ORDER BY rank DESC, m.created_at DESC LIMIT $${paramIdx}`;
      params.push(searchLimit);

      messages = await db.all(pgSql, params);
    } else {
      // SQLite with FTS5
      let sql = `
        SELECT m.*, u.username, u.discriminator, u.avatar, c.name as channel_name
        FROM messages m
        INNER JOIN users u ON u.id = m.author_id
        INNER JOIN channels c ON c.id = m.channel_id
        INNER JOIN messages_fts fts ON fts.rowid = m.rowid
        WHERE c.server_id = ? AND messages_fts MATCH ?
      `;
      const params = [serverId, q];

      if (channel_id) {
        sql += ' AND m.channel_id = ?';
        params.push(channel_id);
      }
      if (author_id) {
        sql += ' AND m.author_id = ?';
        params.push(author_id);
      }
      if (has === 'link') sql += ` AND m.content LIKE '%http%'`;
      if (has === 'file') sql += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id)`;
      if (before) {
        sql += ' AND m.created_at < ?';
        params.push(before);
      }
      if (after) {
        sql += ' AND m.created_at > ?';
        params.push(after);
      }

      sql += ' ORDER BY m.created_at DESC LIMIT ?';
      params.push(searchLimit);

      messages = await db.all(sql, params);
    }

    res.json({ messages, total: messages.length });
  } catch (err) {
    console.error('Server search error:', err);
    // Fallback to LIKE
    try {
      const { serverId } = req.params;
      const { q, limit = 25 } = req.query;
      const searchLimit = Math.min(parseInt(limit) || 25, 50);
      const messages = await db.all(`
        SELECT m.*, u.username, u.discriminator, u.avatar, c.name as channel_name
        FROM messages m
        INNER JOIN users u ON u.id = m.author_id
        INNER JOIN channels c ON c.id = m.channel_id
        WHERE c.server_id = ? AND m.content LIKE ?
        ORDER BY m.created_at DESC LIMIT ?
      `, [serverId, `%${q}%`, searchLimit]);
      res.json({ messages, total: messages.length });
    } catch (fallbackErr) {
      res.status(500).json({ error: 'Search failed' });
    }
  }
});

// Get server members (paginated)
router.get('/:serverId/members', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { after, limit = 50 } = req.query;
    const memberLimit = Math.min(parseInt(limit) || 50, 100);

    const member = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    let query = `
      SELECT u.id, u.username, u.discriminator, u.avatar, u.status, u.custom_status,
             sm.nickname, sm.joined_at
      FROM server_members sm
      INNER JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ?
    `;
    const params = [serverId];

    if (after) {
      query += ' AND u.username > ?';
      params.push(after);
    }

    query += ' ORDER BY u.username ASC LIMIT ?';
    params.push(memberLimit + 1); // Fetch one extra to determine if there are more

    let members = await db.all(query, params);
    const hasMore = members.length > memberLimit;
    if (hasMore) members = members.slice(0, memberLimit);

    // Attach roles for each member
    if (members.length > 0) {
      const userIds = members.map(m => m.id);
      const placeholders = userIds.map(() => '?').join(',');
      const memberRoles = await db.all(
        `SELECT mr.user_id, r.id, r.name, r.color, r.position, r.hoist
         FROM member_roles mr
         INNER JOIN roles r ON r.id = mr.role_id
         WHERE mr.server_id = ? AND mr.user_id IN (${placeholders})
         ORDER BY r.position DESC`,
        [serverId, ...userIds]
      );
      const roleMap = {};
      for (const mr of memberRoles) {
        if (!roleMap[mr.user_id]) roleMap[mr.user_id] = [];
        roleMap[mr.user_id].push({ id: mr.id, name: mr.name, color: mr.color, position: mr.position, hoist: mr.hoist });
      }
      for (const m of members) {
        m.roles = roleMap[m.id] || [];
      }
    }

    res.json({
      members,
      has_more: hasMore,
      next_cursor: hasMore ? members[members.length - 1].username : null,
    });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
