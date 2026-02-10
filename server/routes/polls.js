const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

// Create poll (attached to a message)
router.post('/', authenticate, async (req, res) => {
  try {
    const { channelId, question, options, allowsMultiple } = req.body;
    if (!question || !options || options.length < 2 || options.length > 10) {
      return res.status(400).json({ error: 'Need 2-10 options' });
    }

    // Create the message first
    const messageId = uuidv4();
    await db.run(
      'INSERT INTO messages (id, channel_id, author_id, content, type) VALUES (?, ?, ?, ?, ?)',
      [messageId, channelId, req.userId, question, 'poll']
    );

    // Update channel's last message
    await db.run('UPDATE channels SET last_message_id = ? WHERE id = ?', [messageId, channelId]);

    // Create poll
    const pollId = uuidv4();
    await db.run(
      'INSERT INTO polls (id, message_id, question, allows_multiple) VALUES (?, ?, ?, ?)',
      [pollId, messageId, question, allowsMultiple ? 1 : 0]
    );

    // Create options
    for (let i = 0; i < options.length; i++) {
      await db.run(
        'INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?)',
        [uuidv4(), pollId, options[i], i]
      );
    }

    // Fetch complete poll data to return
    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
    const pollOptions = await db.all('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY position', [pollId]);
    const author = await db.get('SELECT id, username, avatar, discriminator FROM users WHERE id = ?', [req.userId]);

    const result = {
      id: messageId,
      channel_id: channelId,
      author_id: req.userId,
      content: question,
      type: 'poll',
      created_at: new Date().toISOString(),
      username: author.username,
      avatar: author.avatar,
      discriminator: author.discriminator,
      attachments: [],
      reactions: [],
      poll: {
        id: pollId,
        question,
        allows_multiple: !!allowsMultiple,
        options: pollOptions.map(o => ({ ...o, votes: 0, voters: [] })),
        total_votes: 0,
      },
    };

    // Emit via socket - use message_create to match the established event pattern
    const io = req.app.get('io');
    if (io) {
      // Also get the server_id for the channel for proper routing
      const channel = await db.get('SELECT server_id FROM channels WHERE id = ?', [channelId]);
      const enrichedResult = { ...result, server_id: channel?.server_id || null };
      io.to(`channel:${channelId}`).emit('message_create', enrichedResult);
      if (channel?.server_id) {
        io.to(`server:${channel.server_id}`).emit('message_create', enrichedResult);
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Create poll error:', err);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Vote on a poll
router.post('/:pollId/vote', authenticate, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionId } = req.body;

    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    // Check if allows multiple
    if (!poll.allows_multiple) {
      // Remove existing vote
      await db.run('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?', [pollId, req.userId]);
    }

    // Check if already voted for this option
    const existing = await db.get(
      'SELECT id FROM poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?',
      [pollId, optionId, req.userId]
    );

    if (existing) {
      // Remove vote (toggle)
      await db.run('DELETE FROM poll_votes WHERE id = ?', [existing.id]);
    } else {
      await db.run(
        'INSERT INTO poll_votes (id, poll_id, option_id, user_id) VALUES (?, ?, ?, ?)',
        [uuidv4(), pollId, optionId, req.userId]
      );
    }

    // Return updated poll data
    const options = await db.all('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY position', [pollId]);
    const votes = await db.all('SELECT option_id, user_id FROM poll_votes WHERE poll_id = ?', [pollId]);

    const optionData = options.map(o => ({
      ...o,
      votes: votes.filter(v => v.option_id === o.id).length,
      voted: votes.some(v => v.option_id === o.id && v.user_id === req.userId),
    }));

    const result = {
      id: poll.id,
      question: poll.question,
      allows_multiple: !!poll.allows_multiple,
      options: optionData,
      total_votes: [...new Set(votes.map(v => v.user_id))].length,
    };

    // Emit update
    const message = await db.get('SELECT channel_id FROM messages WHERE id = ?', [poll.message_id]);
    const io = req.app.get('io');
    if (io && message) {
      io.to(`channel:${message.channel_id}`).emit('poll_update', { messageId: poll.message_id, poll: result });
    }

    res.json(result);
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// Get poll data for a message
router.get('/:pollId', authenticate, async (req, res) => {
  try {
    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [req.params.pollId]);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const options = await db.all('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY position', [poll.id]);
    const votes = await db.all('SELECT option_id, user_id FROM poll_votes WHERE poll_id = ?', [poll.id]);

    res.json({
      id: poll.id,
      question: poll.question,
      allows_multiple: !!poll.allows_multiple,
      options: options.map(o => ({
        ...o,
        votes: votes.filter(v => v.option_id === o.id).length,
        voted: votes.some(v => v.option_id === o.id && v.user_id === req.userId),
      })),
      total_votes: [...new Set(votes.map(v => v.user_id))].length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get poll' });
  }
});

module.exports = router;
