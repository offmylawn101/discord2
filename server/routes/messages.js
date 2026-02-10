const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');
const { messageLimiter, searchLimiter } = require('../middleware/rateLimit');
const { fetchUrlMeta, extractUrls } = require('../utils/embeds');
const { checkAutomod } = require('../utils/automod');

const router = express.Router();

// File upload setup
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB limit

// Get messages in a channel
router.get('/:channelId/messages', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, after, limit = 50 } = req.query;
    const messageLimit = Math.min(parseInt(limit) || 50, 100);

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Permission check for server channels
    if (channel.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.READ_MESSAGE_HISTORY)) {
        return res.status(403).json({ error: 'Missing permissions' });
      }
    }

    // DM access check
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      const isMember = await db.get('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?', [channelId, req.userId]);
      if (!isMember) return res.status(403).json({ error: 'You are not a member of this DM' });
    }

    let query = `
      SELECT m.*, u.username, u.discriminator, u.avatar, sm.nickname
      FROM messages m
      INNER JOIN users u ON u.id = m.author_id
      LEFT JOIN channels ch ON ch.id = m.channel_id
      LEFT JOIN server_members sm ON sm.server_id = ch.server_id AND sm.user_id = m.author_id
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

    let messages = await db.all(query, params);
    messages.reverse(); // Return in chronological order

    // Batch-load attachments and reactions for all messages
    if (messages.length > 0) {
      const msgIds = messages.map(m => m.id);
      const placeholders = msgIds.map(() => '?').join(',');

      // Batch attachments
      const allAttachments = await db.all(
        `SELECT * FROM attachments WHERE message_id IN (${placeholders})`,
        msgIds
      );
      const attachmentMap = {};
      for (const att of allAttachments) {
        if (!attachmentMap[att.message_id]) attachmentMap[att.message_id] = [];
        attachmentMap[att.message_id].push(att);
      }

      // Batch reactions
      const allReactions = await db.all(
        `SELECT emoji, message_id, COUNT(*) as count, GROUP_CONCAT(user_id) as users
         FROM reactions WHERE message_id IN (${placeholders}) GROUP BY message_id, emoji`,
        msgIds
      );
      const reactionMap = {};
      for (const r of allReactions) {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
        reactionMap[r.message_id].push({
          emoji: r.emoji,
          count: r.count,
          users: r.users.split(','),
          me: r.users.split(',').includes(req.userId),
        });
      }

      // Batch referenced messages (replies)
      const replyIds = messages.filter(m => m.reply_to_id).map(m => m.reply_to_id);
      const replyMap = {};
      if (replyIds.length > 0) {
        const replyPlaceholders = replyIds.map(() => '?').join(',');
        const refs = await db.all(
          `SELECT m.id, m.content, m.author_id, u.username, u.avatar
           FROM messages m INNER JOIN users u ON u.id = m.author_id
           WHERE m.id IN (${replyPlaceholders})`,
          replyIds
        );
        for (const ref of refs) {
          replyMap[ref.id] = ref;
        }
      }

      // Assign to messages
      for (const msg of messages) {
        msg.attachments = attachmentMap[msg.id] || [];
        msg.reactions = reactionMap[msg.id] || [];
        msg.referenced_message = msg.reply_to_id ? (replyMap[msg.reply_to_id] || null) : null;
      }
    }

    // Update read state
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      await db.run(`
        INSERT INTO read_states (user_id, channel_id, last_message_id, mention_count)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(user_id, channel_id) DO UPDATE SET last_message_id = ?, mention_count = 0
      `, [req.userId, channelId, lastMsg.id, lastMsg.id]);
    }

    // Add pagination headers
    if (messages.length > 0) {
      res.set('X-Has-More', messages.length >= messageLimit ? 'true' : 'false');
      res.set('X-First-Id', messages[0].id);
      res.set('X-Last-Id', messages[messages.length - 1].id);
    }

    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message
router.post('/:channelId/messages', authenticate, messageLimiter, upload.array('files', 10), async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, reply_to_id, type = 'default' } = req.body;

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Message must have content or attachments' });
    }

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Permission checks
    if (channel.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.SEND_MESSAGES)) {
        return res.status(403).json({ error: 'Missing SEND_MESSAGES permission' });
      }
    }
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      const isMember = await db.get('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?', [channelId, req.userId]);
      if (!isMember) return res.status(403).json({ error: 'You are not a member of this DM' });
    }

    // Slowmode check
    if (channel.slowmode > 0 && channel.server_id) {
      const server = await db.get('SELECT owner_id FROM servers WHERE id = ?', [channel.server_id]);
      if (server.owner_id !== req.userId) {
        const lastMsg = await db.get(
          'SELECT created_at FROM messages WHERE channel_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 1',
          [channelId, req.userId]
        );
        if (lastMsg) {
          const elapsed = (Date.now() - new Date(lastMsg.created_at).getTime()) / 1000;
          if (elapsed < channel.slowmode) {
            return res.status(429).json({ error: `Slowmode: wait ${Math.ceil(channel.slowmode - elapsed)}s` });
          }
        }
      }
    }

    // AutoMod check for server channels
    if (channel.server_id && content) {
      const automodResult = await checkAutomod(db, req.app.get('io'), channel.server_id, channelId, req.userId, content);
      if (automodResult.blocked) {
        return res.status(403).json({ error: automodResult.reason || 'Message blocked by AutoMod' });
      }
    }

    const messageId = uuidv4();

    await db.transaction(async (tx) => {
      await tx.run(`
        INSERT INTO messages (id, channel_id, author_id, content, type, reply_to_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [messageId, channelId, req.userId, content || '', type, reply_to_id || null]);

      // Handle file attachments
      if (req.files) {
        for (const file of req.files) {
          await tx.run(`
            INSERT INTO attachments (id, message_id, filename, filepath, content_type, size)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [uuidv4(), messageId, file.originalname, file.filename, file.mimetype, file.size]);
        }
      }

      // Update channel's last message
      await tx.run('UPDATE channels SET last_message_id = ? WHERE id = ?', [messageId, channelId]);
    });

    const message = await db.get(`
      SELECT m.*, u.username, u.discriminator, u.avatar, sm.nickname
      FROM messages m
      INNER JOIN users u ON u.id = m.author_id
      LEFT JOIN channels ch ON ch.id = m.channel_id
      LEFT JOIN server_members sm ON sm.server_id = ch.server_id AND sm.user_id = m.author_id
      WHERE m.id = ?
    `, [messageId]);

    message.attachments = await db.all('SELECT * FROM attachments WHERE message_id = ?', [messageId]);
    message.reactions = [];

    if (message.reply_to_id) {
      message.referenced_message = await db.get(`
        SELECT m.id, m.content, m.author_id, u.username, u.avatar
        FROM messages m INNER JOIN users u ON u.id = m.author_id
        WHERE m.id = ?
      `, [message.reply_to_id]);
    }

    // Parse mentions and update mention counts
    const mentionedUserIds = new Set();

    // @everyone and @here
    if (content && (content.includes('@everyone') || content.includes('@here'))) {
      if (channel.server_id) {
        const serverMembers = await db.all('SELECT user_id FROM server_members WHERE server_id = ?', [channel.server_id]);
        for (const m of serverMembers) {
          if (m.user_id !== req.userId) mentionedUserIds.add(m.user_id);
        }
      }
    }

    // @username mentions - match <@userId> pattern
    const userMentionRegex = /<@([a-f0-9-]+)>/g;
    let match;
    while ((match = userMentionRegex.exec(content || '')) !== null) {
      if (match[1] !== req.userId) mentionedUserIds.add(match[1]);
    }

    // @role mentions - match <@&roleId> pattern
    const roleMentionRegex = /<@&([a-f0-9-]+)>/g;
    while ((match = roleMentionRegex.exec(content || '')) !== null) {
      if (channel.server_id) {
        const roleMembers = await db.all(
          'SELECT user_id FROM member_roles WHERE server_id = ? AND role_id = ?',
          [channel.server_id, match[1]]
        );
        for (const m of roleMembers) {
          if (m.user_id !== req.userId) mentionedUserIds.add(m.user_id);
        }
      }
    }

    // Update mention counts in read_states
    for (const uid of mentionedUserIds) {
      await db.run(`
        INSERT INTO read_states (user_id, channel_id, mention_count)
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, channel_id) DO UPDATE SET mention_count = mention_count + 1
      `, [uid, channelId]);
    }

    // Add mentions array to the message response
    message.mentions = Array.from(mentionedUserIds);

    // Generate URL embeds asynchronously
    const urls = extractUrls(content);
    if (urls.length > 0) {
      // Don't block the response - fetch embeds in background
      message.embeds = [];
      setImmediate(async () => {
        try {
          const embeds = [];
          for (const url of urls) {
            const meta = await fetchUrlMeta(url);
            if (meta) embeds.push(meta);
          }
          if (embeds.length > 0) {
            // Broadcast embed update to channel
            const io = req.app.get('io');
            io?.to(`channel:${channelId}`).emit('message_embeds', {
              messageId: message.id,
              channelId,
              embeds,
            });
          }
        } catch (err) {
          console.error('Embed fetch error:', err);
        }
      });
    } else {
      message.embeds = [];
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit message
router.patch('/:channelId/messages/:messageId', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.author_id !== req.userId) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    await db.run('UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?', [content, messageId]);

    const updated = await db.get(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.id = ?
    `, [messageId]);
    updated.attachments = await db.all('SELECT * FROM attachments WHERE message_id = ?', [messageId]);
    updated.reactions = [];

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete message
router.delete('/:channelId/messages/:messageId', authenticate, async (req, res) => {
  try {
    const { channelId, messageId } = req.params;
    const message = await db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);

    // Author can always delete their own messages
    if (message.author_id !== req.userId) {
      // Check MANAGE_MESSAGES permission
      if (channel.server_id) {
        if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_MESSAGES)) {
          return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });
        }
      } else {
        return res.status(403).json({ error: 'You can only delete your own messages in DMs' });
      }
    }

    await db.run('DELETE FROM messages WHERE id = ?', [messageId]);
    res.json({ deleted: true, id: messageId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk delete messages
router.post('/:channelId/messages/bulk-delete', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { message_ids } = req.body;

    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({ error: 'message_ids must be a non-empty array' });
    }
    if (message_ids.length > 100) {
      return res.status(400).json({ error: 'Cannot bulk delete more than 100 messages' });
    }

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Require MANAGE_MESSAGES permission for server channels
    if (channel.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_MESSAGES)) {
        return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });
      }
    } else {
      return res.status(403).json({ error: 'Bulk delete is only available in server channels' });
    }

    // Verify all messages belong to this channel and are less than 14 days old
    const placeholders = message_ids.map(() => '?').join(',');
    const messages = await db.all(
      `SELECT id, channel_id, created_at FROM messages WHERE id IN (${placeholders})`,
      message_ids
    );

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const invalidMessages = [];
    const validIds = [];

    for (const msg of messages) {
      if (msg.channel_id !== channelId) {
        invalidMessages.push({ id: msg.id, reason: 'wrong_channel' });
      } else if (new Date(msg.created_at) < fourteenDaysAgo) {
        invalidMessages.push({ id: msg.id, reason: 'too_old' });
      } else {
        validIds.push(msg.id);
      }
    }

    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid messages to delete', invalidMessages });
    }

    // Delete all valid messages
    const deletePlaceholders = validIds.map(() => '?').join(',');
    await db.run(`DELETE FROM messages WHERE id IN (${deletePlaceholders})`, validIds);

    // Broadcast bulk delete event
    const io = req.app.get('io');
    io?.to(`channel:${channelId}`).emit('bulk_message_delete', { channelId, messageIds: validIds });

    res.json({ deleted: validIds, failed: invalidMessages });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pin message
router.put('/:channelId/pins/:messageId', authenticate, async (req, res) => {
  try {
    const { channelId, messageId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (channel?.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_MESSAGES)) {
        return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });
      }
    }

    await db.run('UPDATE messages SET pinned = 1 WHERE id = ? AND channel_id = ?', [messageId, channelId]);
    res.json({ pinned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unpin message
router.delete('/:channelId/pins/:messageId', authenticate, async (req, res) => {
  try {
    const { channelId, messageId } = req.params;
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (channel?.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_MESSAGES)) {
        return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });
      }
    }

    await db.run('UPDATE messages SET pinned = 0 WHERE id = ? AND channel_id = ?', [messageId, channelId]);
    res.json({ unpinned: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pinned messages
router.get('/:channelId/pins', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = await db.all(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.channel_id = ? AND m.pinned = 1
      ORDER BY m.created_at DESC
    `, [channelId]);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search messages in channel (with FTS)
router.get('/:channelId/messages/search', authenticate, searchLimiter, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { q, limit = 25 } = req.query;
    if (!q) return res.json([]);

    const searchLimit = Math.min(parseInt(limit) || 25, 50);
    let messages;

    if (db.isPg) {
      // PostgreSQL: use tsvector full-text search
      const tsquery = q.split(/\s+/).filter(Boolean).join(' & ');
      messages = await db.all(`
        SELECT m.*, u.username, u.discriminator, u.avatar,
          ts_rank(m.search_vector, to_tsquery('english', $1)) as rank
        FROM messages m INNER JOIN users u ON u.id = m.author_id
        WHERE m.channel_id = $2 AND m.search_vector @@ to_tsquery('english', $1)
        ORDER BY rank DESC, m.created_at DESC LIMIT $3
      `, [tsquery, channelId, searchLimit]);
    } else {
      // SQLite: use FTS5
      messages = await db.all(`
        SELECT m.*, u.username, u.discriminator, u.avatar
        FROM messages m
        INNER JOIN users u ON u.id = m.author_id
        INNER JOIN messages_fts fts ON fts.rowid = m.rowid
        WHERE m.channel_id = ? AND messages_fts MATCH ?
        ORDER BY m.created_at DESC LIMIT ?
      `, [channelId, q, searchLimit]);
    }

    res.json(messages);
  } catch (err) {
    console.error('Search error:', err);
    // Fallback to LIKE search if FTS fails
    try {
      const { channelId } = req.params;
      const { q, limit = 25 } = req.query;
      const searchLimit = Math.min(parseInt(limit) || 25, 50);
      const messages = await db.all(`
        SELECT m.*, u.username, u.discriminator, u.avatar
        FROM messages m INNER JOIN users u ON u.id = m.author_id
        WHERE m.channel_id = ? AND m.content LIKE ?
        ORDER BY m.created_at DESC LIMIT ?
      `, [channelId, `%${q}%`, searchLimit]);
      res.json(messages);
    } catch (fallbackErr) {
      res.status(500).json({ error: 'Search failed' });
    }
  }
});

// Add reaction
router.put('/:channelId/messages/:messageId/reactions/:emoji', authenticate, async (req, res) => {
  try {
    const { channelId, messageId, emoji } = req.params;
    const decodedEmoji = decodeURIComponent(emoji);

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (channel?.server_id) {
      if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.ADD_REACTIONS)) {
        return res.status(403).json({ error: 'Missing ADD_REACTIONS permission' });
      }
    }

    await db.run('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
      [messageId, req.userId, decodedEmoji]);

    res.json({ added: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove reaction
router.delete('/:channelId/messages/:messageId/reactions/:emoji', authenticate, async (req, res) => {
  try {
    const { channelId, messageId, emoji } = req.params;
    const decodedEmoji = decodeURIComponent(emoji);

    await db.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, req.userId, decodedEmoji]);

    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create thread from message
router.post('/:channelId/messages/:messageId/threads', authenticate, async (req, res) => {
  try {
    const { channelId, messageId } = req.params;
    const { name } = req.body;

    const message = await db.get('SELECT * FROM messages WHERE id = ? AND channel_id = ?', [messageId, channelId]);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Check if thread already exists for this message
    const existing = await db.get('SELECT * FROM threads WHERE parent_message_id = ?', [messageId]);
    if (existing) return res.status(400).json({ error: 'Thread already exists for this message' });

    const threadId = uuidv4();
    const threadName = name || message.content?.slice(0, 50) || 'Thread';

    await db.run(`
      INSERT INTO threads (id, channel_id, parent_message_id, name, owner_id)
      VALUES (?, ?, ?, ?, ?)
    `, [threadId, channelId, messageId, threadName, req.userId]);

    // Update the original message to reference the thread
    await db.run('UPDATE messages SET thread_id = ? WHERE id = ?', [threadId, messageId]);

    const thread = await db.get(`
      SELECT t.*, u.username as owner_username
      FROM threads t
      INNER JOIN users u ON u.id = t.owner_id
      WHERE t.id = ?
    `, [threadId]);

    // Notify channel about new thread
    const io = req.app.get('io');
    io?.to(`channel:${channelId}`).emit('thread_create', { ...thread, parent_message: message });

    res.status(201).json(thread);
  } catch (err) {
    console.error('Create thread error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get threads for a channel
router.get('/:channelId/threads', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { archived = '0' } = req.query;

    const threads = await db.all(`
      SELECT t.*, u.username as owner_username,
        (SELECT content FROM messages WHERE id = t.parent_message_id) as parent_content
      FROM threads t
      INNER JOIN users u ON u.id = t.owner_id
      WHERE t.channel_id = ? AND t.archived = ?
      ORDER BY t.last_message_at DESC
    `, [channelId, parseInt(archived)]);

    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get thread messages
router.get('/threads/:threadId/messages', authenticate, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { before, limit = 50 } = req.query;
    const messageLimit = Math.min(parseInt(limit) || 50, 100);

    const thread = await db.get('SELECT * FROM threads WHERE id = ?', [threadId]);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    let query = `
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m
      INNER JOIN users u ON u.id = m.author_id
      WHERE m.thread_id = ?
    `;
    const params = [threadId];

    if (before) {
      query += ' AND m.created_at < (SELECT created_at FROM messages WHERE id = ?)';
      params.push(before);
    }

    query += ' ORDER BY m.created_at ASC LIMIT ?';
    params.push(messageLimit);

    const messages = await db.all(query, params);

    // Batch load attachments
    if (messages.length > 0) {
      const msgIds = messages.map(m => m.id);
      const placeholders = msgIds.map(() => '?').join(',');
      const allAttachments = await db.all(
        `SELECT * FROM attachments WHERE message_id IN (${placeholders})`, msgIds
      );
      const attMap = {};
      for (const att of allAttachments) {
        if (!attMap[att.message_id]) attMap[att.message_id] = [];
        attMap[att.message_id].push(att);
      }
      for (const msg of messages) {
        msg.attachments = attMap[msg.id] || [];
        msg.reactions = [];
      }
    }

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Post message to thread
router.post('/threads/:threadId/messages', authenticate, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const thread = await db.get('SELECT * FROM threads WHERE id = ?', [threadId]);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    if (thread.archived) return res.status(400).json({ error: 'Thread is archived' });

    const messageId = uuidv4();
    await db.run(`
      INSERT INTO messages (id, channel_id, author_id, content, thread_id)
      VALUES (?, ?, ?, ?, ?)
    `, [messageId, thread.channel_id, req.userId, content, threadId]);

    // Update thread metadata
    await db.run(`
      UPDATE threads SET message_count = message_count + 1, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [threadId]);

    const message = await db.get(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m INNER JOIN users u ON u.id = m.author_id
      WHERE m.id = ?
    `, [messageId]);
    message.attachments = [];
    message.reactions = [];

    // Broadcast to thread listeners
    const io = req.app.get('io');
    io?.to(`thread:${threadId}`).emit('thread_message_create', { ...message, threadId });

    // Also notify parent channel about thread activity
    io?.to(`channel:${thread.channel_id}`).emit('thread_update', {
      threadId, message_count: thread.message_count + 1,
      last_message_at: new Date().toISOString(),
      parent_message_id: thread.parent_message_id,
    });

    res.status(201).json(message);
  } catch (err) {
    console.error('Thread message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
