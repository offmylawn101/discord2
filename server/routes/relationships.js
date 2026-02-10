const express = require('express');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get relationships (friends list)
router.get('/', authenticate, (req, res) => {
  try {
    const relationships = db.prepare(`
      SELECT r.*, u.username, u.discriminator, u.avatar, u.status, u.custom_status
      FROM relationships r
      INNER JOIN users u ON u.id = r.target_id
      WHERE r.user_id = ?
    `).all(req.userId);
    res.json(relationships);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send friend request
router.post('/', authenticate, (req, res) => {
  try {
    const { username, discriminator } = req.body;

    const target = db.prepare('SELECT id FROM users WHERE username = ? AND discriminator = ?').get(username, discriminator);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });

    // Check if already friends or pending
    const existing = db.prepare('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?').get(req.userId, target.id);
    if (existing) {
      if (existing.type === 'friend') return res.status(400).json({ error: 'Already friends' });
      if (existing.type === 'pending_outgoing') return res.status(400).json({ error: 'Friend request already sent' });
      if (existing.type === 'blocked') return res.status(400).json({ error: 'User is blocked' });
    }

    // Check if they sent us a request
    const incoming = db.prepare('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?').get(target.id, req.userId);
    if (incoming && incoming.type === 'pending_outgoing') {
      // Auto-accept: they already sent us a request
      const accept = db.transaction(() => {
        db.prepare('UPDATE relationships SET type = ? WHERE user_id = ? AND target_id = ?').run('friend', target.id, req.userId);
        db.prepare('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)').run(req.userId, target.id, 'friend');
      });
      accept();
      return res.json({ type: 'friend', accepted: true });
    }

    const send = db.transaction(() => {
      db.prepare('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)').run(req.userId, target.id, 'pending_outgoing');
      db.prepare('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)').run(target.id, req.userId, 'pending_incoming');
    });
    send();

    res.json({ type: 'pending_outgoing' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept friend request
router.put('/:targetId', authenticate, (req, res) => {
  try {
    const { targetId } = req.params;

    const rel = db.prepare('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?').get(req.userId, targetId);
    if (!rel || rel.type !== 'pending_incoming') {
      return res.status(400).json({ error: 'No pending friend request from this user' });
    }

    const accept = db.transaction(() => {
      db.prepare('UPDATE relationships SET type = ? WHERE user_id = ? AND target_id = ?').run('friend', req.userId, targetId);
      db.prepare('UPDATE relationships SET type = ? WHERE user_id = ? AND target_id = ?').run('friend', targetId, req.userId);
    });
    accept();

    res.json({ type: 'friend' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove friend / cancel request / unblock
router.delete('/:targetId', authenticate, (req, res) => {
  try {
    const { targetId } = req.params;

    const remove = db.transaction(() => {
      db.prepare('DELETE FROM relationships WHERE user_id = ? AND target_id = ?').run(req.userId, targetId);
      db.prepare('DELETE FROM relationships WHERE user_id = ? AND target_id = ?').run(targetId, req.userId);
    });
    remove();

    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Block user
router.put('/:targetId/block', authenticate, (req, res) => {
  try {
    const { targetId } = req.params;

    const block = db.transaction(() => {
      db.prepare('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)').run(req.userId, targetId, 'blocked');
      // Remove their relationship with us
      db.prepare('DELETE FROM relationships WHERE user_id = ? AND target_id = ?').run(targetId, req.userId);
    });
    block();

    res.json({ type: 'blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
