const express = require('express');
const crypto = require('crypto');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');

const router = express.Router();

function generateInviteCode() {
  return crypto.randomBytes(4).toString('base64url');
}

// Create invite
router.post('/:channelId/invites', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel || !channel.server_id) return res.status(404).json({ error: 'Channel not found' });

    if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.CREATE_INVITE)) {
      return res.status(403).json({ error: 'Missing CREATE_INVITE permission' });
    }

    const { max_uses = 0, max_age = 86400, temporary = false } = req.body;

    const code = generateInviteCode();
    const expires_at = max_age > 0 ? new Date(Date.now() + max_age * 1000).toISOString() : null;

    await db.run(`
      INSERT INTO invites (code, server_id, channel_id, inviter_id, max_uses, max_age, temporary, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [code, channel.server_id, channelId, req.userId, max_uses, max_age, temporary ? 1 : 0, expires_at]);

    const invite = await db.get(`
      SELECT i.*, s.name as server_name, s.icon as server_icon, c.name as channel_name,
             u.username as inviter_username
      FROM invites i
      INNER JOIN servers s ON s.id = i.server_id
      INNER JOIN channels c ON c.id = i.channel_id
      INNER JOIN users u ON u.id = i.inviter_id
      WHERE i.code = ?
    `, [code]);

    res.status(201).json(invite);
  } catch (err) {
    console.error('Create invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get invite info
router.get('/invites/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const invite = await db.get(`
      SELECT i.*, s.name as server_name, s.icon as server_icon, s.description as server_description,
             c.name as channel_name, u.username as inviter_username,
             (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
      FROM invites i
      INNER JOIN servers s ON s.id = i.server_id
      INNER JOIN channels c ON c.id = i.channel_id
      INNER JOIN users u ON u.id = i.inviter_id
      WHERE i.code = ?
    `, [code]);

    if (!invite) return res.status(404).json({ error: 'Invite not found or expired' });

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await db.run('DELETE FROM invites WHERE code = ?', [code]);
      return res.status(404).json({ error: 'Invite has expired' });
    }

    res.json(invite);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Use invite (join server)
router.post('/invites/:code', authenticate, async (req, res) => {
  try {
    const { code } = req.params;
    const invite = await db.get('SELECT * FROM invites WHERE code = ?', [code]);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await db.run('DELETE FROM invites WHERE code = ?', [code]);
      return res.status(404).json({ error: 'Invite has expired' });
    }

    // Check max uses
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
      return res.status(410).json({ error: 'Invite has reached maximum uses' });
    }

    // Check if banned
    const banned = await db.get('SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?', [invite.server_id, req.userId]);
    if (banned) return res.status(403).json({ error: 'You are banned from this server' });

    // Check if already member
    const existing = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [invite.server_id, req.userId]);
    if (existing) {
      const server = await db.get('SELECT * FROM servers WHERE id = ?', [invite.server_id]);
      return res.json({ server, already_member: true });
    }

    await db.transaction(async (tx) => {
      // Add as member
      await tx.run('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)', [invite.server_id, req.userId]);

      // Assign @everyone role
      const defaultRole = await tx.get('SELECT id FROM roles WHERE server_id = ? AND is_default = 1', [invite.server_id]);
      if (defaultRole) {
        await tx.run('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)',
          [invite.server_id, req.userId, defaultRole.id]);
      }

      // Increment uses
      await tx.run('UPDATE invites SET uses = uses + 1 WHERE code = ?', [code]);
    });

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [invite.server_id]);
    res.json({ server, joined: true });
  } catch (err) {
    console.error('Use invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get server invites
router.get('/:serverId/invites', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const invites = await db.all(`
      SELECT i.*, u.username as inviter_username, c.name as channel_name
      FROM invites i
      INNER JOIN users u ON u.id = i.inviter_id
      INNER JOIN channels c ON c.id = i.channel_id
      WHERE i.server_id = ?
    `, [serverId]);
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete invite
router.delete('/invites/:code', authenticate, async (req, res) => {
  try {
    const { code } = req.params;
    const invite = await db.get('SELECT * FROM invites WHERE code = ?', [code]);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    // Inviter or server managers can delete
    if (invite.inviter_id !== req.userId) {
      if (!await checkPermission(db, req.userId, invite.server_id, null, PERMISSIONS.MANAGE_SERVER)) {
        return res.status(403).json({ error: 'Missing permission to delete this invite' });
      }
    }

    await db.run('DELETE FROM invites WHERE code = ?', [code]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
