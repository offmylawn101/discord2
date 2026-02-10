const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get user's DM channels
router.get('/', authenticate, (req, res) => {
  try {
    const channels = db.prepare(`
      SELECT c.*, dm.user_id as member_id
      FROM channels c
      INNER JOIN dm_members dm ON dm.channel_id = c.id
      WHERE c.id IN (SELECT channel_id FROM dm_members WHERE user_id = ?)
      AND c.type IN ('dm', 'group_dm')
    `).all(req.userId);

    // Group by channel, attach members
    const channelMap = {};
    for (const row of channels) {
      if (!channelMap[row.id]) {
        const { member_id, ...channel } = row;
        channelMap[row.id] = { ...channel, members: [] };
      }
      if (row.member_id !== req.userId) {
        const user = db.prepare('SELECT id, username, discriminator, avatar, status FROM users WHERE id = ?').get(row.member_id);
        if (user) channelMap[row.id].members.push(user);
      }
    }

    res.json(Object.values(channelMap));
  } catch (err) {
    console.error('Get DMs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or get DM channel with a user
router.post('/', authenticate, (req, res) => {
  try {
    const { recipient_id } = req.body;
    if (!recipient_id) return res.status(400).json({ error: 'recipient_id is required' });
    if (recipient_id === req.userId) return res.status(400).json({ error: 'Cannot DM yourself' });

    const recipient = db.prepare('SELECT id, username, discriminator, avatar, status FROM users WHERE id = ?').get(recipient_id);
    if (!recipient) return res.status(404).json({ error: 'User not found' });

    // Check for existing DM
    const existingChannel = db.prepare(`
      SELECT dm1.channel_id FROM dm_members dm1
      INNER JOIN dm_members dm2 ON dm2.channel_id = dm1.channel_id
      INNER JOIN channels c ON c.id = dm1.channel_id
      WHERE dm1.user_id = ? AND dm2.user_id = ? AND c.type = 'dm'
    `).get(req.userId, recipient_id);

    if (existingChannel) {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(existingChannel.channel_id);
      channel.members = [recipient];
      return res.json(channel);
    }

    // Create new DM channel
    const channelId = uuidv4();
    const create = db.transaction(() => {
      db.prepare(`
        INSERT INTO channels (id, name, type) VALUES (?, ?, 'dm')
      `).run(channelId, `dm-${req.userId}-${recipient_id}`);

      db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)').run(channelId, req.userId);
      db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)').run(channelId, recipient_id);
    });

    create();

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    channel.members = [recipient];
    res.status(201).json(channel);
  } catch (err) {
    console.error('Create DM error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create group DM
router.post('/group', authenticate, (req, res) => {
  try {
    const { recipient_ids, name } = req.body;
    if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length < 1) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    const channelId = uuidv4();
    const allMembers = [req.userId, ...recipient_ids];

    const create = db.transaction(() => {
      db.prepare(`
        INSERT INTO channels (id, name, type) VALUES (?, ?, 'group_dm')
      `).run(channelId, name || 'Group DM');

      for (const userId of allMembers) {
        db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)').run(channelId, userId);
      }
    });

    create();

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    channel.members = db.prepare(`
      SELECT u.id, u.username, u.discriminator, u.avatar, u.status
      FROM dm_members dm INNER JOIN users u ON u.id = dm.user_id
      WHERE dm.channel_id = ? AND dm.user_id != ?
    `).all(channelId, req.userId);

    res.status(201).json(channel);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
