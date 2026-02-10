const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');

const router = express.Router();

// GET /notifications/settings - Get all notification settings for authenticated user
router.get('/settings', async (req, res) => {
  try {
    const settings = await db.all(
      'SELECT * FROM notification_settings WHERE user_id = ?',
      [req.userId]
    );
    res.json(settings);
  } catch (err) {
    console.error('Error fetching notification settings:', err);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// GET /notifications/settings/:targetType/:targetId - Get settings for a specific server/channel
router.get('/settings/:targetType/:targetId', async (req, res) => {
  try {
    const { targetType, targetId } = req.params;

    if (!['server', 'channel'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid target type. Must be "server" or "channel".' });
    }

    const setting = await db.get(
      'SELECT * FROM notification_settings WHERE user_id = ? AND target_type = ? AND target_id = ?',
      [req.userId, targetType, targetId]
    );

    res.json(setting || {
      target_type: targetType,
      target_id: targetId,
      muted: 0,
      mute_until: null,
      suppress_everyone: 0,
      suppress_roles: 0,
      notify_level: 'default',
    });
  } catch (err) {
    console.error('Error fetching notification setting:', err);
    res.status(500).json({ error: 'Failed to fetch notification setting' });
  }
});

// PUT /notifications/settings/:targetType/:targetId - Upsert notification settings
router.put('/settings/:targetType/:targetId', async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { muted, mute_until, suppress_everyone, suppress_roles, notify_level } = req.body;

    if (!['server', 'channel'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid target type. Must be "server" or "channel".' });
    }

    if (notify_level && !['all', 'mentions', 'nothing', 'default'].includes(notify_level)) {
      return res.status(400).json({ error: 'Invalid notify level.' });
    }

    // Check if setting already exists
    const existing = await db.get(
      'SELECT id FROM notification_settings WHERE user_id = ? AND target_type = ? AND target_id = ?',
      [req.userId, targetType, targetId]
    );

    if (existing) {
      // Update existing
      await db.run(
        `UPDATE notification_settings SET
          muted = COALESCE(?, muted),
          mute_until = ?,
          suppress_everyone = COALESCE(?, suppress_everyone),
          suppress_roles = COALESCE(?, suppress_roles),
          notify_level = COALESCE(?, notify_level)
        WHERE id = ?`,
        [
          muted != null ? (muted ? 1 : 0) : null,
          mute_until !== undefined ? mute_until : null,
          suppress_everyone != null ? (suppress_everyone ? 1 : 0) : null,
          suppress_roles != null ? (suppress_roles ? 1 : 0) : null,
          notify_level || null,
          existing.id,
        ]
      );

      const updated = await db.get('SELECT * FROM notification_settings WHERE id = ?', [existing.id]);
      return res.json(updated);
    }

    // Create new
    const id = uuidv4();
    await db.run(
      `INSERT INTO notification_settings (id, user_id, target_type, target_id, muted, mute_until, suppress_everyone, suppress_roles, notify_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.userId,
        targetType,
        targetId,
        muted ? 1 : 0,
        mute_until || null,
        suppress_everyone ? 1 : 0,
        suppress_roles ? 1 : 0,
        notify_level || 'default',
      ]
    );

    const created = await db.get('SELECT * FROM notification_settings WHERE id = ?', [id]);
    res.json(created);
  } catch (err) {
    console.error('Error upserting notification setting:', err);
    res.status(500).json({ error: 'Failed to update notification setting' });
  }
});

// DELETE /notifications/settings/:targetType/:targetId - Reset to defaults (delete the row)
router.delete('/settings/:targetType/:targetId', async (req, res) => {
  try {
    const { targetType, targetId } = req.params;

    if (!['server', 'channel'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid target type. Must be "server" or "channel".' });
    }

    await db.run(
      'DELETE FROM notification_settings WHERE user_id = ? AND target_type = ? AND target_id = ?',
      [req.userId, targetType, targetId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting notification setting:', err);
    res.status(500).json({ error: 'Failed to reset notification setting' });
  }
});

module.exports = router;
