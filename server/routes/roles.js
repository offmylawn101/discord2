const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');

const router = express.Router();

// Create role
router.post('/:serverId/roles', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const { name = 'new role', color = '#99AAB5', hoist = false, permissions = '0', mentionable = false } = req.body;

    const lastRole = db.prepare('SELECT MAX(position) as maxPos FROM roles WHERE server_id = ?').get(serverId);
    const position = (lastRole?.maxPos ?? 0) + 1;

    const id = uuidv4();
    db.prepare(`
      INSERT INTO roles (id, server_id, name, color, hoist, position, permissions, mentionable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, serverId, name, color, hoist ? 1 : 0, position, permissions.toString(), mentionable ? 1 : 0);

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
    res.status(201).json(role);
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role
router.patch('/:serverId/roles/:roleId', authenticate, (req, res) => {
  try {
    const { serverId, roleId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const { name, color, hoist, permissions, mentionable, position } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (hoist !== undefined) { updates.push('hoist = ?'); values.push(hoist ? 1 : 0); }
    if (permissions !== undefined) { updates.push('permissions = ?'); values.push(permissions.toString()); }
    if (mentionable !== undefined) { updates.push('mentionable = ?'); values.push(mentionable ? 1 : 0); }
    if (position !== undefined) { updates.push('position = ?'); values.push(position); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(roleId, serverId);
    db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE id = ? AND server_id = ?`).run(...values);

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete role
router.delete('/:serverId/roles/:roleId', authenticate, (req, res) => {
  try {
    const { serverId, roleId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_default) return res.status(400).json({ error: 'Cannot delete the @everyone role' });

    db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign role to member
router.put('/:serverId/members/:userId/roles/:roleId', authenticate, (req, res) => {
  try {
    const { serverId, userId, roleId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const member = db.prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    db.prepare('INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)')
      .run(serverId, userId, roleId);

    res.json({ assigned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove role from member
router.delete('/:serverId/members/:userId/roles/:roleId', authenticate, (req, res) => {
  try {
    const { serverId, userId, roleId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?')
      .run(serverId, userId, roleId);

    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update member nickname
router.patch('/:serverId/members/:userId', authenticate, (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { nickname } = req.body;

    // Users can change their own nickname
    if (userId !== req.userId) {
      if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_NICKNAMES)) {
        return res.status(403).json({ error: 'Missing MANAGE_NICKNAMES permission' });
      }
    } else {
      if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.CHANGE_NICKNAME)) {
        return res.status(403).json({ error: 'Missing CHANGE_NICKNAME permission' });
      }
    }

    db.prepare('UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?')
      .run(nickname || null, serverId, userId);

    const member = db.prepare(`
      SELECT u.id, u.username, u.discriminator, u.avatar, u.status, sm.nickname, sm.joined_at
      FROM server_members sm INNER JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ? AND sm.user_id = ?
    `).get(serverId, userId);

    res.json(member);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Kick member
router.delete('/:serverId/members/:userId', authenticate, (req, res) => {
  try {
    const { serverId, userId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.KICK_MEMBERS)) {
      return res.status(403).json({ error: 'Missing KICK_MEMBERS permission' });
    }

    const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
    if (userId === server.owner_id) {
      return res.status(400).json({ error: 'Cannot kick the server owner' });
    }

    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
    res.json({ kicked: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ban member
router.put('/:serverId/bans/:userId', authenticate, (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { reason = '' } = req.body;

    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.BAN_MEMBERS)) {
      return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
    }

    const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
    if (userId === server.owner_id) {
      return res.status(400).json({ error: 'Cannot ban the server owner' });
    }

    db.prepare('INSERT OR REPLACE INTO bans (server_id, user_id, reason, banned_by) VALUES (?, ?, ?, ?)')
      .run(serverId, userId, reason, req.userId);
    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);

    res.json({ banned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unban member
router.delete('/:serverId/bans/:userId', authenticate, (req, res) => {
  try {
    const { serverId, userId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.BAN_MEMBERS)) {
      return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
    }

    db.prepare('DELETE FROM bans WHERE server_id = ? AND user_id = ?').run(serverId, userId);
    res.json({ unbanned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bans
router.get('/:serverId/bans', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.BAN_MEMBERS)) {
      return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
    }

    const bans = db.prepare(`
      SELECT b.*, u.username, u.discriminator, u.avatar
      FROM bans b INNER JOIN users u ON u.id = b.user_id
      WHERE b.server_id = ?
    `).all(serverId);
    res.json(bans);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
