const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

// GET / - list user's bookmarks with message data
router.get('/', authenticate, async (req, res) => {
  const bookmarks = await db.all(`
    SELECT b.*, m.content, m.author_id, m.created_at as message_created_at,
           u.username as author_username, u.avatar as author_avatar,
           c.name as channel_name, c.id as channel_id, s.name as server_name, s.id as server_id
    FROM bookmarks b
    JOIN messages m ON b.message_id = m.id
    JOIN users u ON m.author_id = u.id
    JOIN channels c ON m.channel_id = c.id
    LEFT JOIN servers s ON c.server_id = s.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `, [req.userId]);
  res.json(bookmarks);
});

// POST / - bookmark a message
router.post('/', authenticate, async (req, res) => {
  const { messageId, note } = req.body;
  if (!messageId) return res.status(400).json({ error: 'messageId is required' });
  const id = uuidv4();
  try {
    await db.run(
      'INSERT INTO bookmarks (id, user_id, message_id, note) VALUES (?, ?, ?, ?)',
      [id, req.userId, messageId, note || '']
    );
    res.json({ id, message_id: messageId, note: note || '' });
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.code === '23505') {
      return res.status(409).json({ error: 'Already bookmarked' });
    }
    throw err;
  }
});

// DELETE /:messageId - remove bookmark
router.delete('/:messageId', authenticate, async (req, res) => {
  await db.run(
    'DELETE FROM bookmarks WHERE user_id = ? AND message_id = ?',
    [req.userId, req.params.messageId]
  );
  res.json({ success: true });
});

// GET /check/:messageId - check if bookmarked
router.get('/check/:messageId', authenticate, async (req, res) => {
  const bookmark = await db.get(
    'SELECT id FROM bookmarks WHERE user_id = ? AND message_id = ?',
    [req.userId, req.params.messageId]
  );
  res.json({ bookmarked: !!bookmark });
});

module.exports = router;
