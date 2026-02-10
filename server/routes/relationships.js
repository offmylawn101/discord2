const express = require('express');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get relationships (friends list)
router.get('/', authenticate, async (req, res) => {
  try {
    const relationships = await db.all(`
      SELECT r.*, u.username, u.discriminator, u.avatar, u.status, u.custom_status
      FROM relationships r
      INNER JOIN users u ON u.id = r.target_id
      WHERE r.user_id = ?
    `, [req.userId]);
    res.json(relationships);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send friend request
router.post('/', authenticate, async (req, res) => {
  try {
    const { username, discriminator } = req.body;

    const target = await db.get('SELECT id FROM users WHERE username = ? AND discriminator = ?', [username, discriminator]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });

    // Check if already friends or pending
    const existing = await db.get('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?', [req.userId, target.id]);
    if (existing) {
      if (existing.type === 'friend') return res.status(400).json({ error: 'Already friends' });
      if (existing.type === 'pending_outgoing') return res.status(400).json({ error: 'Friend request already sent' });
      if (existing.type === 'blocked') return res.status(400).json({ error: 'User is blocked' });
    }

    // Check if they sent us a request
    const incoming = await db.get('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?', [target.id, req.userId]);
    if (incoming && incoming.type === 'pending_outgoing') {
      // Auto-accept: they already sent us a request
      await db.transaction(async (tx) => {
        await tx.run('UPDATE relationships SET type = ? WHERE user_id = ? AND target_id = ?', ['friend', target.id, req.userId]);
        await tx.run('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)', [req.userId, target.id, 'friend']);
      });
      return res.json({ type: 'friend', accepted: true });
    }

    await db.transaction(async (tx) => {
      await tx.run('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)', [req.userId, target.id, 'pending_outgoing']);
      await tx.run('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)', [target.id, req.userId, 'pending_incoming']);
    });

    res.json({ type: 'pending_outgoing' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept friend request
router.put('/:targetId', authenticate, async (req, res) => {
  try {
    const { targetId } = req.params;

    const rel = await db.get('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?', [req.userId, targetId]);
    if (!rel || rel.type !== 'pending_incoming') {
      return res.status(400).json({ error: 'No pending friend request from this user' });
    }

    await db.transaction(async (tx) => {
      await tx.run('UPDATE relationships SET type = ? WHERE user_id = ? AND target_id = ?', ['friend', req.userId, targetId]);
      await tx.run('UPDATE relationships SET type = ? WHERE user_id = ? AND target_id = ?', ['friend', targetId, req.userId]);
    });

    res.json({ type: 'friend' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove friend / cancel request / unblock
router.delete('/:targetId', authenticate, async (req, res) => {
  try {
    const { targetId } = req.params;

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM relationships WHERE user_id = ? AND target_id = ?', [req.userId, targetId]);
      await tx.run('DELETE FROM relationships WHERE user_id = ? AND target_id = ?', [targetId, req.userId]);
    });

    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Block user
router.put('/:targetId/block', authenticate, async (req, res) => {
  try {
    const { targetId } = req.params;

    await db.transaction(async (tx) => {
      await tx.run('INSERT OR REPLACE INTO relationships (user_id, target_id, type) VALUES (?, ?, ?)', [req.userId, targetId, 'blocked']);
      // Remove their relationship with us
      await tx.run('DELETE FROM relationships WHERE user_id = ? AND target_id = ?', [targetId, req.userId]);
    });

    res.json({ type: 'blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
