const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');

const router = express.Router();

// File upload setup
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB limit

// Get messages in a channel
router.get('/:channelId/messages', authenticate, (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, after, limit = 50 } = req.query;
    const messageLimit = Math.min(parseInt(limit) || 50, 100);

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Permission check for server channels
    if (channel.server_id) {
      if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.READ_MESSAGE_HISTORY)) {
        return res.status(403).json({ error: 'Missing permissions' });
      }
    }

    // DM access check
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      const isMember = db.prepare('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?').get(channelId, req.userId);
      if (!isMember) return res.status(403).json({ error: 'You are not a member of this DM' });
    }

    let query = `
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m
      INNER JOIN users u ON u.id = m.author_id
      WHERE m.channel_id = ?
    `;
    const params = [channelId];

    if (before) {
      query += ' AND m.created_at < (SELECT created_at FROM messages WHERE id = ?)';
      params.push(before);
    } else if (after) {
      query += ' AND m.created_at > (SELECT created_at FROM messages WHERE id = ?)';
      params.push(after);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(messageLimit);

    let messages = db.prepare(query).all(...params);
    messages.reverse(); // Return in chronological order

    // Attach reactions and attachments
    for (const msg of messages) {
      msg.attachments = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(msg.id);
      const reactions = db.prepare(`
        SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as users
        FROM reactions WHERE message_id = ? GROUP BY emoji
      `).all(msg.id);
      msg.reactions = reactions.map(r => ({
        emoji: r.emoji,
        count: r.count,
        users: r.users.split(','),
        me: r.users.split(',').includes(req.userId),
      }));

      // If it's a reply, get the referenced message
      if (msg.reply_to_id) {
        msg.referenced_message = db.prepare(`
          SELECT m.id, m.content, m.author_id, u.username, u.avatar
          FROM messages m INNER JOIN users u ON u.id = m.author_id
          WHERE m.id = ?
        `).get(msg.reply_to_id);
      }
    }

    // Update read state
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      db.prepare(`
        INSERT INTO read_states (user_id, channel_id, last_message_id, mention_count)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(user_id, channel_id) DO UPDATE SET last_message_id = ?, mention_count = 0
      `).run(req.userId, channelId, lastMsg.id, lastMsg.id);
    }

    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message
router.post('/:channelId/messages', authenticate, upload.array('files', 10), (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, reply_to_id, type = 'default' } = req.body;

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Message must have content or attachments' });
    }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Permission checks
    if (channel.server_id) {
      if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.SEND_MESSAGES)) {
        return res.status(403).json({ error: 'Missing SEND_MESSAGES permission' });
      }
    }
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      const isMember = db.prepare('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?').get(channelId, req.userId);
      if (!isMember) return res.status(403).json({ error: 'You are not a member of this DM' });
    }

    // Slowmode check
    if (channel.slowmode > 0 && channel.server_id) {
      const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
      if (server.owner_id !== req.userId) {
        const lastMsg = db.prepare(
          'SELECT created_at FROM messages WHERE channel_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 1'
        ).get(channelId, req.userId);
        if (lastMsg) {
          const elapsed = (Date.now() - new Date(lastMsg.created_at).getTime()) / 1000;
          if (elapsed < channel.slowmode) {
            return res.status(429).json({ error: `Slowmode: wait ${Math.ceil(channel.slowmode - elapsed)}s` });
          }
        }
      }
    }

    const messageId = uuidv4();

    const createMessage = db.transaction(() => {
      db.prepare(`
        INSERT INTO messages (id, channel_id, author_id, content, type, reply_to_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(messageId, channelId, req.userId, content || '', type, reply_to_id || null);

      // Handle file attachments
      if (req.files) {
        for (const file of req.files) {
          db.prepare(`
            INSERT INTO attachments (id, message_id, filename, filepath, content_type, size)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), messageId, file.originalname, file.filename, file.mimetype, file.size);
        }
      }

      // Update channel's last message
      db.prepare('UPDATE channels SET last_message_id = ? WHERE id = ?').run(messageId, channelId);
    });

    createMessage();

    const message = db.prepare(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.id = ?
    `).get(messageId);

    message.attachments = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);
    message.reactions = [];

    if (message.reply_to_id) {
      message.referenced_message = db.prepare(`
        SELECT m.id, m.content, m.author_id, u.username, u.avatar
        FROM messages m INNER JOIN users u ON u.id = m.author_id
        WHERE m.id = ?
      `).get(message.reply_to_id);
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit message
router.patch('/:channelId/messages/:messageId', authenticate, (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.author_id !== req.userId) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    db.prepare('UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, messageId);

    const updated = db.prepare(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.id = ?
    `).get(messageId);
    updated.attachments = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);
    updated.reactions = [];

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete message
router.delete('/:channelId/messages/:messageId', authenticate, (req, res) => {
  try {
    const { channelId, messageId } = req.params;
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);

    // Author can always delete their own messages
    if (message.author_id !== req.userId) {
      // Check MANAGE_MESSAGES permission
      if (channel.server_id) {
        if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_MESSAGES)) {
          return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });
        }
      } else {
        return res.status(403).json({ error: 'You can only delete your own messages in DMs' });
      }
    }

    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    res.json({ deleted: true, id: messageId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pin message
router.put('/:channelId/pins/:messageId', authenticate, (req, res) => {
  try {
    const { channelId, messageId } = req.params;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (channel?.server_id) {
      if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_MESSAGES)) {
        return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });
      }
    }

    db.prepare('UPDATE messages SET pinned = 1 WHERE id = ? AND channel_id = ?').run(messageId, channelId);
    res.json({ pinned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pinned messages
router.get('/:channelId/pins', authenticate, (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = db.prepare(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.channel_id = ? AND m.pinned = 1
      ORDER BY m.created_at DESC
    `).all(channelId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search messages in channel
router.get('/:channelId/messages/search', authenticate, (req, res) => {
  try {
    const { channelId } = req.params;
    const { q } = req.query;
    if (!q) return res.json([]);

    const messages = db.prepare(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.channel_id = ? AND m.content LIKE ?
      ORDER BY m.created_at DESC LIMIT 25
    `).all(channelId, `%${q}%`);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add reaction
router.put('/:channelId/messages/:messageId/reactions/:emoji', authenticate, (req, res) => {
  try {
    const { channelId, messageId, emoji } = req.params;
    const decodedEmoji = decodeURIComponent(emoji);

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (channel?.server_id) {
      if (!checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.ADD_REACTIONS)) {
        return res.status(403).json({ error: 'Missing ADD_REACTIONS permission' });
      }
    }

    db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
      .run(messageId, req.userId, decodedEmoji);

    res.json({ added: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove reaction
router.delete('/:channelId/messages/:messageId/reactions/:emoji', authenticate, (req, res) => {
  try {
    const { channelId, messageId, emoji } = req.params;
    const decodedEmoji = decodeURIComponent(emoji);

    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(messageId, req.userId, decodedEmoji);

    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
