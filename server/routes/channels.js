const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');

const router = express.Router();

// Create channel
router.post('/:serverId/channels', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
      return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
    }

    const { name, type = 'text', category_id, topic, slowmode, nsfw, bitrate, user_limit } = req.body;
    if (!name || name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Channel name must be 1-100 characters' });
    }

    // Get next position
    const lastChannel = db.prepare(
      'SELECT MAX(position) as maxPos FROM channels WHERE server_id = ? AND category_id IS ?'
    ).get(serverId, category_id || null);
    const position = (lastChannel?.maxPos ?? -1) + 1;

    const id = uuidv4();
    // Normalize name for text channels (lowercase, replace spaces with hyphens)
    const channelName = type === 'text' ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : name;

    db.prepare(`
      INSERT INTO channels (id, server_id, category_id, name, type, position, topic, slowmode, nsfw, bitrate, user_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, serverId, category_id || null, channelName, type, position,
           topic || '', slowmode || 0, nsfw ? 1 : 0, bitrate || 64000, user_limit || 0);

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    res.status(201).json(channel);
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category
router.post('/:serverId/categories', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
      return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
    }

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const lastCat = db.prepare('SELECT MAX(position) as maxPos FROM channel_categories WHERE server_id = ?').get(serverId);
    const position = (lastCat?.maxPos ?? -1) + 1;

    const id = uuidv4();
    db.prepare('INSERT INTO channel_categories (id, server_id, name, position) VALUES (?, ?, ?, ?)').run(id, serverId, name, position);

    const category = db.prepare('SELECT * FROM channel_categories WHERE id = ?').get(id);
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update channel
router.patch('/channels/:channelId', authenticate, (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.server_id) {
      if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_CHANNELS)) {
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

    db.prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch reorder channels
router.patch('/:serverId/channels/reorder', authenticate, (req, res) => {
  try {
    const { serverId } = req.params;
    if (!checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_CHANNELS)) {
      return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
    }

    const { channels } = req.body; // [{ id, position, category_id }]
    if (!Array.isArray(channels)) return res.status(400).json({ error: 'channels array required' });

    const stmt = db.prepare('UPDATE channels SET position = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND server_id = ?');
    const reorder = db.transaction((items) => {
      for (const ch of items) {
        stmt.run(ch.position, ch.category_id ?? null, ch.id, serverId);
      }
    });
    reorder(channels);

    const updated = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position').all(serverId);
    res.json(updated);
  } catch (err) {
    console.error('Channel reorder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel
router.delete('/channels/:channelId', authenticate, (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.server_id) {
      if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_CHANNELS)) {
        return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      }
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update channel permission overwrites
router.put('/channels/:channelId/overwrites/:targetId', authenticate, (req, res) => {
  try {
    const { channelId, targetId } = req.params;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel || !channel.server_id) return res.status(404).json({ error: 'Channel not found' });

    if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    const { target_type, allow, deny } = req.body;
    if (!target_type || !['role', 'member'].includes(target_type)) {
      return res.status(400).json({ error: 'target_type must be role or member' });
    }

    const existing = db.prepare('SELECT id FROM channel_overwrites WHERE channel_id = ? AND target_id = ?').get(channelId, targetId);
    if (existing) {
      db.prepare('UPDATE channel_overwrites SET allow = ?, deny = ? WHERE id = ?')
        .run((allow || 0).toString(), (deny || 0).toString(), existing.id);
    } else {
      const id = uuidv4();
      db.prepare('INSERT INTO channel_overwrites (id, channel_id, target_type, target_id, allow, deny) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, channelId, target_type, targetId, (allow || 0).toString(), (deny || 0).toString());
    }

    const overwrites = db.prepare('SELECT * FROM channel_overwrites WHERE channel_id = ?').all(channelId);
    res.json(overwrites);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel permission overwrite
router.delete('/channels/:channelId/overwrites/:targetId', authenticate, (req, res) => {
  try {
    const { channelId, targetId } = req.params;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel || !channel.server_id) return res.status(404).json({ error: 'Channel not found' });

    if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
    }

    db.prepare('DELETE FROM channel_overwrites WHERE channel_id = ? AND target_id = ?').run(channelId, targetId);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
