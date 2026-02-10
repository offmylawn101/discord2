const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimit');
const { PERMISSIONS, DEFAULT_PERMISSIONS, checkPermission } = require('../utils/permissions');
const cache = require('../utils/cache');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLog');

const router = express.Router();

const fs = require('fs');

// Server icon upload setup
const iconStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads', 'icons'),
  filename: (req, file, cb) => cb(null, `${req.params.serverId}-${Date.now()}${path.extname(file.originalname)}`),
});
const iconUpload = multer({ storage: iconStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only images are allowed'));
}});

// Emoji upload setup
const emojiDir = path.join(__dirname, '..', '..', 'uploads', 'emojis');
if (!fs.existsSync(emojiDir)) fs.mkdirSync(emojiDir, { recursive: true });

const emojiStorage = multer.diskStorage({
  destination: emojiDir,
  filename: (req, file, cb) => {
    const emojiId = uuidv4();
    req.emojiId = emojiId;
    cb(null, `${emojiId}${path.extname(file.originalname)}`);
  },
});
const emojiUpload = multer({
  storage: emojiStorage,
  limits: { fileSize: 256 * 1024 }, // 256KB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed for emojis'));
  },
});

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

    const emojis = await db.all('SELECT * FROM server_emojis WHERE server_id = ? ORDER BY created_at', [serverId]);

    const responseData = { ...server, channels, categories, roles, members, emojis };
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

    const { name, icon, banner, description, system_channel_id, is_public } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
    if (banner !== undefined) { updates.push('banner = ?'); values.push(banner); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (system_channel_id !== undefined) { updates.push('system_channel_id = ?'); values.push(system_channel_id); }
    if (is_public !== undefined) { updates.push('is_public = ?'); values.push(is_public ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(serverId);

    await db.run(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`, values);
    await cache.del(`server:${serverId}:detail`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.SERVER_UPDATE, {
      targetType: 'server', targetId: serverId,
      changes: { name, description, is_public },
    });

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
router.get('/:serverId/search', authenticate, searchLimiter, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { q, from, has, before, after, in: inChannel, limit = 25, offset = 0 } = req.query;
    if (!q && !from && !has) return res.json({ messages: [], total: 0, offset: 0, limit: 25 });

    // Verify membership
    const member = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const searchLimit = Math.min(parseInt(limit) || 25, 50);
    const searchOffset = parseInt(offset) || 0;

    let conditions = ['c.server_id = ?'];
    let params = [serverId];

    // Text search
    if (q) {
      conditions.push('m.content LIKE ?');
      params.push(`%${q}%`);
    }

    // From user filter
    if (from) {
      conditions.push('m.author_id = ?');
      params.push(from);
    }

    // Has filter (file, image, link)
    if (has === 'file' || has === 'image') {
      conditions.push("m.attachments IS NOT NULL AND m.attachments != '[]'");
    } else if (has === 'link') {
      conditions.push("m.content LIKE '%http%'");
    }

    // Date filters
    if (before) {
      conditions.push('m.created_at < ?');
      params.push(before);
    }
    if (after) {
      conditions.push('m.created_at > ?');
      params.push(after);
    }

    // Channel filter
    if (inChannel) {
      conditions.push('m.channel_id = ?');
      params.push(inChannel);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.get(`
      SELECT COUNT(*) as total FROM messages m
      INNER JOIN channels c ON c.id = m.channel_id
      WHERE ${whereClause}
    `, params);

    // Get results
    const messages = await db.all(`
      SELECT m.*, u.username, u.avatar, c.name as channel_name
      FROM messages m
      INNER JOIN users u ON u.id = m.author_id
      INNER JOIN channels c ON c.id = m.channel_id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, searchLimit, searchOffset]);

    res.json({ messages, total: countResult.total, offset: searchOffset, limit: searchLimit });
  } catch (err) {
    console.error('Server search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Set own nickname
router.patch('/:serverId/members/@me/nickname', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { nickname } = req.body;

    const member = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.CHANGE_NICKNAME)) {
      return res.status(403).json({ error: 'Missing CHANGE_NICKNAME permission' });
    }

    const cleanNickname = nickname && nickname.trim() ? nickname.trim() : null;
    if (cleanNickname && (cleanNickname.length < 1 || cleanNickname.length > 32)) {
      return res.status(400).json({ error: 'Nickname must be 1-32 characters' });
    }

    await db.run('UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?', [cleanNickname, serverId, req.userId]);
    await cache.del(`server:${serverId}:detail`);

    const io = req.app.get('io');
    io?.to(`server:${serverId}`).emit('nickname_update', { serverId, userId: req.userId, nickname: cleanNickname });

    res.json({ userId: req.userId, nickname: cleanNickname });
  } catch (err) {
    console.error('Set own nickname error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set another member's nickname (admin)
router.patch('/:serverId/members/:userId/nickname', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { nickname } = req.body;

    const requesterMember = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!requesterMember) return res.status(403).json({ error: 'Not a member of this server' });

    const targetMember = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]);
    if (!targetMember) return res.status(404).json({ error: 'Target user is not a member of this server' });

    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_NICKNAMES)) {
      return res.status(403).json({ error: 'Missing MANAGE_NICKNAMES permission' });
    }

    const cleanNickname = nickname && nickname.trim() ? nickname.trim() : null;
    if (cleanNickname && (cleanNickname.length < 1 || cleanNickname.length > 32)) {
      return res.status(400).json({ error: 'Nickname must be 1-32 characters' });
    }

    await db.run('UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?', [cleanNickname, serverId, userId]);
    await cache.del(`server:${serverId}:detail`);

    const io = req.app.get('io');
    io?.to(`server:${serverId}`).emit('nickname_update', { serverId, userId, nickname: cleanNickname });

    res.json({ userId, nickname: cleanNickname });
  } catch (err) {
    console.error('Set member nickname error:', err);
    res.status(500).json({ error: 'Internal server error' });
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

// Get audit log
router.get('/:serverId/audit-log', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { before, limit = 50, action_type } = req.query;
    const logLimit = Math.min(parseInt(limit) || 50, 100);

    // Check permission
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.VIEW_AUDIT_LOG)) {
      return res.status(403).json({ error: 'Missing permission to view audit log' });
    }

    let query = `
      SELECT al.*, u.username, u.discriminator, u.avatar
      FROM audit_log al
      INNER JOIN users u ON u.id = al.user_id
      WHERE al.server_id = ?
    `;
    const params = [serverId];

    if (action_type) {
      query += ' AND al.action = ?';
      params.push(action_type);
    }
    if (before) {
      query += ' AND al.created_at < ?';
      params.push(before);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(logLimit);

    const entries = await db.all(query, params);

    // Parse changes JSON
    for (const entry of entries) {
      try {
        entry.changes = JSON.parse(entry.changes || '{}');
      } catch {
        entry.changes = {};
      }
    }

    res.json(entries);
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Emoji Endpoints ============

// Get server emojis
router.get('/:serverId/emojis', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const member = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.userId]);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const emojis = await db.all('SELECT * FROM server_emojis WHERE server_id = ? ORDER BY created_at', [serverId]);
    res.json(emojis);
  } catch (err) {
    console.error('Get emojis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload new emoji
router.post('/:serverId/emojis', authenticate, emojiUpload.single('image'), async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      // Clean up uploaded file if permission denied
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const name = (req.body.name || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!name || name.length < 2 || name.length > 32) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Emoji name must be 2-32 alphanumeric characters' });
    }

    // Check for duplicate name in this server
    const existing = await db.get('SELECT id FROM server_emojis WHERE server_id = ? AND name = ?', [serverId, name]);
    if (existing) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'An emoji with this name already exists' });
    }

    const emojiId = req.emojiId;
    const imageUrl = `/uploads/emojis/${req.file.filename}`;
    const animated = req.file.mimetype === 'image/gif' ? 1 : 0;

    await db.run(
      'INSERT INTO server_emojis (id, server_id, name, image_url, uploader_id, animated) VALUES (?, ?, ?, ?, ?, ?)',
      [emojiId, serverId, name, imageUrl, req.userId, animated]
    );

    await cache.del(`server:${serverId}:detail`);

    const emoji = await db.get('SELECT * FROM server_emojis WHERE id = ?', [emojiId]);
    res.status(201).json(emoji);
  } catch (err) {
    console.error('Upload emoji error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rename emoji
router.patch('/:serverId/emojis/:emojiId', authenticate, async (req, res) => {
  try {
    const { serverId, emojiId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const emoji = await db.get('SELECT * FROM server_emojis WHERE id = ? AND server_id = ?', [emojiId, serverId]);
    if (!emoji) return res.status(404).json({ error: 'Emoji not found' });

    const name = (req.body.name || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!name || name.length < 2 || name.length > 32) {
      return res.status(400).json({ error: 'Emoji name must be 2-32 alphanumeric characters' });
    }

    // Check for duplicate name
    const duplicate = await db.get('SELECT id FROM server_emojis WHERE server_id = ? AND name = ? AND id != ?', [serverId, name, emojiId]);
    if (duplicate) return res.status(400).json({ error: 'An emoji with this name already exists' });

    await db.run('UPDATE server_emojis SET name = ? WHERE id = ?', [name, emojiId]);
    await cache.del(`server:${serverId}:detail`);

    const updated = await db.get('SELECT * FROM server_emojis WHERE id = ?', [emojiId]);
    res.json(updated);
  } catch (err) {
    console.error('Rename emoji error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete emoji
router.delete('/:serverId/emojis/:emojiId', authenticate, async (req, res) => {
  try {
    const { serverId, emojiId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const emoji = await db.get('SELECT * FROM server_emojis WHERE id = ? AND server_id = ?', [emojiId, serverId]);
    if (!emoji) return res.status(404).json({ error: 'Emoji not found' });

    // Delete the file
    const filePath = path.join(__dirname, '..', '..', emoji.image_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.run('DELETE FROM server_emojis WHERE id = ?', [emojiId]);
    await cache.del(`server:${serverId}:detail`);

    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete emoji error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reorder categories
router.patch('/:serverId/categories/reorder', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { categories } = req.body; // [{ id, position }]

    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories must be an array' });
    }

    const server = await db.get('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    if (server.owner_id !== req.userId) {
      if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
        return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      }
    }

    for (const cat of categories) {
      await db.run('UPDATE channel_categories SET position = ? WHERE id = ? AND server_id = ?', [cat.position, cat.id, serverId]);
    }

    const updated = await db.all('SELECT * FROM channel_categories WHERE server_id = ? ORDER BY position', [serverId]);
    await cache.del(`server:${serverId}:detail`);

    const io = req.app.get('io');
    if (io) io.to(`server:${serverId}`).emit('categories_reorder', updated);

    res.json(updated);
  } catch (err) {
    console.error('Reorder categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
