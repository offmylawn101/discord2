const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, DEFAULT_PERMISSIONS, checkPermission } = require('../utils/permissions');

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
router.post('/', authenticate, (req, res) => {
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

    const createServer = db.transaction(() => {
      // Create server
      db.prepare(`
        INSERT INTO servers (id, name, icon, owner_id)
        VALUES (?, ?, ?, ?)
      `).run(serverId, name, icon || null, req.userId);

      // Create @everyone role
      db.prepare(`
        INSERT INTO roles (id, server_id, name, color, position, permissions, is_default)
        VALUES (?, ?, '@everyone', '#99AAB5', 0, ?, 1)
      `).run(roleId, serverId, DEFAULT_PERMISSIONS.toString());

      // Update server's default role
      db.prepare('UPDATE servers SET default_role_id = ? WHERE id = ?').run(roleId, serverId);

      // Create default category
      db.prepare(`
        INSERT INTO channel_categories (id, server_id, name, position)
        VALUES (?, ?, 'Text Channels', 0)
      `).run(generalCategoryId, serverId);

      // Create #general text channel
      db.prepare(`
        INSERT INTO channels (id, server_id, category_id, name, type, position)
        VALUES (?, ?, ?, 'general', 'text', 0)
      `).run(textChannelId, serverId, generalCategoryId);

      // Create General voice channel
      db.prepare(`
        INSERT INTO channels (id, server_id, category_id, name, type, position)
        VALUES (?, ?, ?, 'General', 'voice', 1)
      `).run(voiceChannelId, serverId, generalCategoryId);

      // Set system channel
      db.prepare('UPDATE servers SET system_channel_id = ? WHERE id = ?').run(textChannelId, serverId);

      // Add owner as member
      db.prepare(`
        INSERT INTO server_members (server_id, user_id)
        VALUES (?, ?)
      `).run(serverId, req.userId);

      // Assign @everyone role to owner
      db.prepare(`
        INSERT INTO member_roles (server_id, user_id, role_id)
        VALUES (?, ?, ?)
      `).run(serverId, req.userId, roleId);
    });

    createServer();

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    const channels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(serverId);
    const roles = db.prepare('SELECT * FROM roles WHERE server_id = ?').all(serverId);
    const categories = db.prepare('SELECT * FROM channel_categories WHERE server_id = ?').all(serverId);

    res.status(201).json({ ...server, channels, roles, categories });
  } catch (err) {
    console.error('Create server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's servers
router.get('/', authenticate, (req, res) => {
  try {
    const servers = db.prepare(`
      SELECT s.* FROM servers s
      INNER JOIN server_members sm ON sm.server_id = s.id
      WHERE sm.user_id = ?
      ORDER BY s.created_at
    `).all(req.userId);
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get server by ID (with full data)
router.get('/:serverId', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    const member = db.prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!member) return res.status(403).json({ error: 'You are not a member of this server' });

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const channels = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position').all(serverId);
    const categories = db.prepare('SELECT * FROM channel_categories WHERE server_id = ? ORDER BY position').all(serverId);
    const roles = db.prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC').all(serverId);
    const members = db.prepare(`
      SELECT u.id, u.username, u.discriminator, u.avatar, u.status, u.custom_status,
             sm.nickname, sm.joined_at, sm.muted, sm.deafened
      FROM server_members sm
      INNER JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ?
    `).all(serverId);

    // Get member roles
    for (const m of members) {
      m.roles = db.prepare('SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?')
        .all(serverId, m.id).map(r => r.role_id);
    }

    res.json({ ...server, channels, categories, roles, members });
  } catch (err) {
    console.error('Get server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update server
router.patch('/:serverId', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
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

    db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete server
router.delete('/:serverId', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Only the server owner can delete the server' });
    }

    db.prepare('DELETE FROM servers WHERE id = ?').run(serverId);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload server icon
router.post('/:serverId/icon', authenticate, iconUpload.single('icon'), (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const iconUrl = `/uploads/icons/${req.file.filename}`;
    db.prepare('UPDATE servers SET icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(iconUrl, serverId);
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    res.json(server);
  } catch (err) {
    console.error('Server icon upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave server
router.delete('/:serverId/members/@me', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.owner_id === req.userId) {
      return res.status(400).json({ error: 'Server owner cannot leave. Transfer ownership or delete the server.' });
    }

    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, req.userId);
    res.json({ left: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
