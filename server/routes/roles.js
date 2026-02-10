const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');
const cache = require('../utils/cache');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLog');

const router = express.Router();

// Create role
router.post('/:serverId/roles', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const { name = 'new role', color = '#99AAB5', hoist = false, permissions = '0', mentionable = false } = req.body;

    const lastRole = await db.get('SELECT MAX(position) as maxPos FROM roles WHERE server_id = ?', [serverId]);
    const position = (lastRole?.maxPos ?? 0) + 1;

    const id = uuidv4();
    await db.run(`
      INSERT INTO roles (id, server_id, name, color, hoist, position, permissions, mentionable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, serverId, name, color, hoist ? 1 : 0, position, permissions.toString(), mentionable ? 1 : 0]);

    const role = await db.get('SELECT * FROM roles WHERE id = ?', [id]);
    await cache.delPattern(`perms:*:${serverId}:*`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.ROLE_CREATE, {
      targetType: 'role', targetId: role.id,
      changes: { name: role.name },
    });

    res.status(201).json(role);
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role
router.patch('/:serverId/roles/:roleId', authenticate, async (req, res) => {
  try {
    const { serverId, roleId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
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
    await db.run(`UPDATE roles SET ${updates.join(', ')} WHERE id = ? AND server_id = ?`, values);
    await cache.delPattern(`perms:*:${serverId}:*`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.ROLE_UPDATE, {
      targetType: 'role', targetId: roleId,
      changes: req.body,
    });

    const role = await db.get('SELECT * FROM roles WHERE id = ?', [roleId]);
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete role
router.delete('/:serverId/roles/:roleId', authenticate, async (req, res) => {
  try {
    const { serverId, roleId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const role = await db.get('SELECT * FROM roles WHERE id = ? AND server_id = ?', [roleId, serverId]);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_default) return res.status(400).json({ error: 'Cannot delete the @everyone role' });

    await db.run('DELETE FROM roles WHERE id = ?', [roleId]);
    await cache.delPattern(`perms:*:${serverId}:*`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.ROLE_DELETE, {
      targetType: 'role', targetId: roleId,
    });

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign role to member
router.put('/:serverId/members/:userId/roles/:roleId', authenticate, async (req, res) => {
  try {
    const { serverId, userId, roleId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const role = await db.get('SELECT * FROM roles WHERE id = ? AND server_id = ?', [roleId, serverId]);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const member = await db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await db.run('INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)',
      [serverId, userId, roleId]);
    await cache.delPattern(`perms:*:${serverId}:*`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.MEMBER_ROLE_UPDATE, {
      targetType: 'member', targetId: userId,
      changes: { role_id: roleId, action: 'add' },
    });

    res.json({ assigned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove role from member
router.delete('/:serverId/members/:userId/roles/:roleId', authenticate, async (req, res) => {
  try {
    const { serverId, userId, roleId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    await db.run('DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?',
      [serverId, userId, roleId]);
    await cache.delPattern(`perms:*:${serverId}:*`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.MEMBER_ROLE_UPDATE, {
      targetType: 'member', targetId: userId,
      changes: { role_id: roleId, action: 'remove' },
    });

    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update member nickname
router.patch('/:serverId/members/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { nickname } = req.body;

    // Users can change their own nickname
    if (userId !== req.userId) {
      if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_NICKNAMES)) {
        return res.status(403).json({ error: 'Missing MANAGE_NICKNAMES permission' });
      }
    } else {
      if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.CHANGE_NICKNAME)) {
        return res.status(403).json({ error: 'Missing CHANGE_NICKNAME permission' });
      }
    }

    await db.run('UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?',
      [nickname || null, serverId, userId]);

    const member = await db.get(`
      SELECT u.id, u.username, u.discriminator, u.avatar, u.status, sm.nickname, sm.joined_at
      FROM server_members sm INNER JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ? AND sm.user_id = ?
    `, [serverId, userId]);

    res.json(member);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Kick member
router.delete('/:serverId/members/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.KICK_MEMBERS)) {
      return res.status(403).json({ error: 'Missing KICK_MEMBERS permission' });
    }

    const server = await db.get('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
    if (userId === server.owner_id) {
      return res.status(400).json({ error: 'Cannot kick the server owner' });
    }

    await db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.MEMBER_KICK, {
      targetType: 'member', targetId: userId,
    });

    res.json({ kicked: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ban member
router.put('/:serverId/bans/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { reason = '' } = req.body;

    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.BAN_MEMBERS)) {
      return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
    }

    const server = await db.get('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
    if (userId === server.owner_id) {
      return res.status(400).json({ error: 'Cannot ban the server owner' });
    }

    await db.run('INSERT OR REPLACE INTO bans (server_id, user_id, reason, banned_by) VALUES (?, ?, ?, ?)',
      [serverId, userId, reason, req.userId]);
    await db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.MEMBER_BAN, {
      targetType: 'member', targetId: userId,
      changes: { reason },
    });

    res.json({ banned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unban member
router.delete('/:serverId/bans/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.BAN_MEMBERS)) {
      return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
    }

    await db.run('DELETE FROM bans WHERE server_id = ? AND user_id = ?', [serverId, userId]);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.MEMBER_UNBAN, {
      targetType: 'member', targetId: userId,
    });

    res.json({ unbanned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bans
router.get('/:serverId/bans', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.BAN_MEMBERS)) {
      return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
    }

    const bans = await db.all(`
      SELECT b.*, u.username, u.discriminator, u.avatar
      FROM bans b INNER JOIN users u ON u.id = b.user_id
      WHERE b.server_id = ?
    `, [serverId]);
    res.json(bans);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
