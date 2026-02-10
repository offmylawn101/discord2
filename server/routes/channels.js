const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');
const cache = require('../utils/cache');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLog');

const router = express.Router();

// Create channel
router.post('/:serverId/channels', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
      return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
    }

    const { name, type = 'text', category_id, topic, slowmode, nsfw, bitrate, user_limit } = req.body;
    if (!name || name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Channel name must be 1-100 characters' });
    }

    // Get next position
    const lastChannel = await db.get(
      'SELECT MAX(position) as maxPos FROM channels WHERE server_id = ? AND category_id IS ?',
      [serverId, category_id || null]
    );
    const position = (lastChannel?.maxPos ?? -1) + 1;

    const id = uuidv4();
    // Normalize name for text channels (lowercase, replace spaces with hyphens)
    const channelName = type === 'text' ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : name;

    await db.run(`
      INSERT INTO channels (id, server_id, category_id, name, type, position, topic, slowmode, nsfw, bitrate, user_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, serverId, category_id || null, channelName, type, position,
        topic || '', slowmode || 0, nsfw ? 1 : 0, bitrate || 64000, user_limit || 0]);

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [id]);
    await cache.delPattern(`server:${serverId}:*`);

    await logAudit(serverId, req.userId, AUDIT_ACTIONS.CHANNEL_CREATE, {
      targetType: 'channel', targetId: channel.id,
      changes: { name: channel.name, type: channel.type },
    });

    res.status(201).json(channel);
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category
router.post('/:serverId/categories', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
      return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
    }

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const lastCat = await db.get('SELECT MAX(position) as maxPos FROM channel_categories WHERE server_id = ?', [serverId]);
    const position = (lastCat?.maxPos ?? -1) + 1;

    const id = uuidv4();
    await db.run('INSERT INTO channel_categories (id, server_id, name, position) VALUES (?, ?, ?, ?)', [id, serverId, name, position]);

    const category = await db.get('SELECT * FROM channel_categories WHERE id = ?', [id]);
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update channel
router.patch('/channels/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_CHANNELS)) {
        return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      }
    }

    const { name, topic, slowmode, nsfw, bitrate, user_limit, position, category_id } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (topic !== undefined) { updates.push('topic = ?'); values.push(topic); }
    if (slowmode !== undefined) { updates.push('slowmode = ?'); values.push(slowmode); }
    if (nsfw !== undefined) { updates.push('nsfw = ?'); values.push(nsfw ? 1 : 0); }
    if (bitrate !== undefined) { updates.push('bitrate = ?'); values.push(bitrate); }
    if (user_limit !== undefined) { updates.push('user_limit = ?'); values.push(user_limit); }
    if (position !== undefined) { updates.push('position = ?'); values.push(position); }
    if (category_id !== undefined) { updates.push('category_id = ?'); values.push(category_id); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(channelId);

    await db.run(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`, values);
    if (channel.server_id) {
      await cache.delPattern(`server:${channel.server_id}:*`);

      await logAudit(channel.server_id, req.userId, AUDIT_ACTIONS.CHANNEL_UPDATE, {
        targetType: 'channel', targetId: channelId,
        changes: { name, topic, slowmode, nsfw, bitrate, user_limit, position, category_id },
      });
    }
    const updated = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch reorder channels
router.patch('/:serverId/channels/reorder', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
      return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
    }

    const { channels } = req.body; // [{ id, position, category_id }]
    if (!Array.isArray(channels)) return res.status(400).json({ error: 'channels array required' });

    await db.transaction(async (tx) => {
      for (const ch of channels) {
        await tx.run('UPDATE channels SET position = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND server_id = ?',
          [ch.position, ch.category_id ?? null, ch.id, serverId]);
      }
    });

    const updated = await db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY position', [serverId]);
    await cache.delPattern(`server:${serverId}:*`);
    res.json(updated);
  } catch (err) {
    console.error('Channel reorder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel
router.delete('/channels/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_CHANNELS)) {
        return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      }
    }

    await db.run('DELETE FROM channels WHERE id = ?', [channelId]);
    if (channel.server_id) {
      await cache.delPattern(`server:${channel.server_id}:*`);

      await logAudit(channel.server_id, req.userId, AUDIT_ACTIONS.CHANNEL_DELETE, {
        targetType: 'channel', targetId: channelId,
        changes: { name: channel.name, type: channel.type },
      });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get channel permission overwrites
router.get('/channels/:channelId/overwrites', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel || !channel.server_id) return res.status(404).json({ error: 'Channel not found' });

    if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const overwrites = await db.all('SELECT * FROM channel_overwrites WHERE channel_id = ?', [channelId]);
    res.json(overwrites);
  } catch (err) {
    console.error('Get overwrites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update channel permission overwrites
router.put('/channels/:channelId/overwrites/:targetId', authenticate, async (req, res) => {
  try {
    const { channelId, targetId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel || !channel.server_id) return res.status(404).json({ error: 'Channel not found' });

    if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const { target_type, allow, deny } = req.body;
    if (!target_type || !['role', 'member'].includes(target_type)) {
      return res.status(400).json({ error: 'target_type must be role or member' });
    }

    const existing = await db.get('SELECT id FROM channel_overwrites WHERE channel_id = ? AND target_id = ?', [channelId, targetId]);
    if (existing) {
      await db.run('UPDATE channel_overwrites SET allow = ?, deny = ? WHERE id = ?',
        [(allow || 0).toString(), (deny || 0).toString(), existing.id]);
    } else {
      const id = uuidv4();
      await db.run('INSERT INTO channel_overwrites (id, channel_id, target_type, target_id, allow, deny) VALUES (?, ?, ?, ?, ?, ?)',
        [id, channelId, target_type, targetId, (allow || 0).toString(), (deny || 0).toString()]);
    }

    const overwrites = await db.all('SELECT * FROM channel_overwrites WHERE channel_id = ?', [channelId]);
    res.json(overwrites);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel permission overwrite
router.delete('/channels/:channelId/overwrites/:targetId', authenticate, async (req, res) => {
  try {
    const { channelId, targetId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel || !channel.server_id) return res.status(404).json({ error: 'Channel not found' });

    if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    await db.run('DELETE FROM channel_overwrites WHERE channel_id = ? AND target_id = ?', [channelId, targetId]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current voice participants for a channel
router.get('/channels/:channelId/voice-states', authenticate, async (req, res) => {
  try {
    const states = await db.all(`
      SELECT vs.*, u.username, u.avatar, u.status
      FROM voice_states vs
      INNER JOIN users u ON u.id = vs.user_id
      WHERE vs.channel_id = ?
    `, [req.params.channelId]);
    res.json(states);
  } catch (err) {
    console.error('Get voice states error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
