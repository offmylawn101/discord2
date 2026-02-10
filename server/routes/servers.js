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

module.exports = router;
