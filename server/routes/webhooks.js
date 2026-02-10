const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');

const router = express.Router();

// GET /servers/:serverId/webhooks - List all webhooks for a server
router.get('/servers/:serverId/webhooks', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    // Check membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    // Check permission
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_WEBHOOKS)) {
      return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
    }

    const webhooks = await db.all(`
      SELECT w.*, c.name as channel_name, u.username as creator_username
      FROM webhooks w
      INNER JOIN channels c ON c.id = w.channel_id
      INNER JOIN users u ON u.id = w.created_by
      WHERE w.server_id = ?
      ORDER BY w.created_at DESC
    `, [serverId]);

    res.json(webhooks);
  } catch (err) {
    console.error('List server webhooks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /channels/:channelId/webhooks - List webhooks for a channel
router.get('/channels/:channelId/webhooks', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.server_id) return res.status(400).json({ error: 'Webhooks are only available in server channels' });

    // Check permission
    if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_WEBHOOKS)) {
      return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
    }

    const webhooks = await db.all(`
      SELECT w.*, c.name as channel_name, u.username as creator_username
      FROM webhooks w
      INNER JOIN channels c ON c.id = w.channel_id
      INNER JOIN users u ON u.id = w.created_by
      WHERE w.channel_id = ?
      ORDER BY w.created_at DESC
    `, [channelId]);

    res.json(webhooks);
  } catch (err) {
    console.error('List channel webhooks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /channels/:channelId/webhooks - Create a webhook
router.post('/channels/:channelId/webhooks', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, avatar } = req.body;

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.server_id) return res.status(400).json({ error: 'Webhooks are only available in server channels' });
    if (channel.type !== 'text' && channel.type !== 'announcement') {
      return res.status(400).json({ error: 'Webhooks can only be created in text or announcement channels' });
    }

    // Check permission
    if (!await checkPermission(db, req.userId, channel.server_id, channelId, PERMISSIONS.MANAGE_WEBHOOKS)) {
      return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
    }

    const webhookId = uuidv4();
    const webhookToken = uuidv4();
    const webhookName = name?.trim() || 'Captain Hook';

    await db.run(`
      INSERT INTO webhooks (id, channel_id, server_id, name, avatar, token, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [webhookId, channelId, channel.server_id, webhookName, avatar || null, webhookToken, req.userId]);

    const webhook = await db.get(`
      SELECT w.*, c.name as channel_name, u.username as creator_username
      FROM webhooks w
      INNER JOIN channels c ON c.id = w.channel_id
      INNER JOIN users u ON u.id = w.created_by
      WHERE w.id = ?
    `, [webhookId]);

    // Include the full webhook URL
    const protocol = req.protocol;
    const host = req.get('host');
    webhook.url = `${protocol}://${host}/api/webhooks/${webhookId}/${webhookToken}`;

    res.status(201).json(webhook);
  } catch (err) {
    console.error('Create webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /webhooks/:webhookId - Update webhook name/avatar
router.patch('/:webhookId', authenticate, async (req, res) => {
  try {
    const { webhookId } = req.params;
    const { name, avatar } = req.body;

    const webhook = await db.get('SELECT * FROM webhooks WHERE id = ?', [webhookId]);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    // Check permission
    if (!await checkPermission(db, req.userId, webhook.server_id, webhook.channel_id, PERMISSIONS.MANAGE_WEBHOOKS)) {
      return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim() || 'Captain Hook');
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(webhookId);
    await db.run(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await db.get(`
      SELECT w.*, c.name as channel_name, u.username as creator_username
      FROM webhooks w
      INNER JOIN channels c ON c.id = w.channel_id
      INNER JOIN users u ON u.id = w.created_by
      WHERE w.id = ?
    `, [webhookId]);

    const protocol = req.protocol;
    const host = req.get('host');
    updated.url = `${protocol}://${host}/api/webhooks/${webhookId}/${updated.token}`;

    res.json(updated);
  } catch (err) {
    console.error('Update webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /webhooks/:webhookId - Delete a webhook
router.delete('/:webhookId', authenticate, async (req, res) => {
  try {
    const { webhookId } = req.params;

    const webhook = await db.get('SELECT * FROM webhooks WHERE id = ?', [webhookId]);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    // Check permission
    if (!await checkPermission(db, req.userId, webhook.server_id, webhook.channel_id, PERMISSIONS.MANAGE_WEBHOOKS)) {
      return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
    }

    await db.run('DELETE FROM webhooks WHERE id = ?', [webhookId]);

    res.json({ deleted: true, id: webhookId });
  } catch (err) {
    console.error('Delete webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /webhooks/:webhookId/:token - Execute webhook (PUBLIC - no auth required)
router.post('/:webhookId/:token', async (req, res) => {
  try {
    const { webhookId, token } = req.params;
    const { content, username, avatar_url } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const webhook = await db.get('SELECT * FROM webhooks WHERE id = ? AND token = ?', [webhookId, token]);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found or invalid token' });

    // Verify the channel still exists
    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [webhook.channel_id]);
    if (!channel) return res.status(404).json({ error: 'Webhook channel no longer exists' });

    const messageId = uuidv4();
    const displayName = username?.trim() || webhook.name;

    // We need a real user to satisfy the foreign key on messages.author_id.
    // Use the webhook creator as the author_id.
    const authorId = webhook.created_by;

    await db.run(`
      INSERT INTO messages (id, channel_id, author_id, content, type)
      VALUES (?, ?, ?, ?, 'default')
    `, [messageId, webhook.channel_id, authorId, content.trim()]);

    // Update channel's last message
    await db.run('UPDATE channels SET last_message_id = ? WHERE id = ?', [messageId, webhook.channel_id]);

    // Fetch the created message with author info
    const message = await db.get(`
      SELECT m.*, u.username, u.discriminator, u.avatar
      FROM messages m
      INNER JOIN users u ON u.id = m.author_id
      WHERE m.id = ?
    `, [messageId]);

    message.attachments = [];
    message.reactions = [];

    // Override display fields for webhook appearance
    message.webhook_id = webhook.id;
    message.username = displayName;
    if (avatar_url) {
      message.avatar = avatar_url;
    }

    // Emit via Socket.IO
    const io = req.app.get('io');
    if (io) {
      const enrichedMessage = {
        ...message,
        server_id: channel.server_id || null,
        webhook_id: webhook.id,
      };
      io.to(`channel:${webhook.channel_id}`).emit('message_create', enrichedMessage);
      if (channel.server_id) {
        io.to(`server:${channel.server_id}`).emit('message_create', enrichedMessage);
      }
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Execute webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
