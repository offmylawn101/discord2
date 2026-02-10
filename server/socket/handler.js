const db = require('../models/database');

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();
// Track voice connections: channelId -> Map<userId, { socketId, selfMute, selfDeaf }>
const voiceConnections = new Map();

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`User connected: ${userId} (socket: ${socket.id})`);

    // Track this socket
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Set user online
    db.prepare('UPDATE users SET status = ? WHERE id = ? AND status = ?').run('online', userId, 'offline');

    // Join user's server rooms and DM rooms
    const servers = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(userId);
    for (const s of servers) {
      socket.join(`server:${s.server_id}`);
    }
    const dms = db.prepare('SELECT channel_id FROM dm_members WHERE user_id = ?').all(userId);
    for (const dm of dms) {
      socket.join(`channel:${dm.channel_id}`);
    }

    // Broadcast presence update
    const user = db.prepare('SELECT id, username, discriminator, avatar, status, custom_status FROM users WHERE id = ?').get(userId);
    for (const s of servers) {
      io.to(`server:${s.server_id}`).emit('presence_update', { userId, status: user.status, custom_status: user.custom_status });
    }

    // --- Channel events ---

    socket.on('join_channel', (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on('leave_channel', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    // --- Message events ---

    socket.on('message_create', (message) => {
      // Look up server_id for the channel
      const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(message.channel_id);
      const enrichedMessage = { ...message, server_id: channel?.server_id || null };

      // Broadcast to channel
      io.to(`channel:${message.channel_id}`).emit('message_create', enrichedMessage);

      // Also broadcast to server room for unread tracking
      if (channel?.server_id) {
        socket.to(`server:${channel.server_id}`).emit('message_create', enrichedMessage);
      }
    });

    socket.on('message_update', (message) => {
      io.to(`channel:${message.channel_id}`).emit('message_update', message);
    });

    socket.on('message_delete', ({ channelId, messageId }) => {
      io.to(`channel:${channelId}`).emit('message_delete', { channelId, messageId });
    });

    // --- Typing ---

    socket.on('typing_start', (channelId) => {
      socket.to(`channel:${channelId}`).emit('typing_start', {
        channelId,
        userId,
        username: user.username,
      });
    });

    // --- Reactions ---

    socket.on('reaction_add', ({ channelId, messageId, emoji }) => {
      io.to(`channel:${channelId}`).emit('reaction_add', {
        channelId,
        messageId,
        userId,
        emoji,
      });
    });

    socket.on('reaction_remove', ({ channelId, messageId, emoji }) => {
      io.to(`channel:${channelId}`).emit('reaction_remove', {
        channelId,
        messageId,
        userId,
        emoji,
      });
    });

    // --- Voice ---

    socket.on('voice_join', ({ channelId, serverId }) => {
      if (!voiceConnections.has(channelId)) {
        voiceConnections.set(channelId, new Map());
      }

      const channelVoice = voiceConnections.get(channelId);

      // Leave any existing voice channel first
      for (const [chId, connections] of voiceConnections) {
        if (connections.has(userId)) {
          connections.delete(userId);
          io.to(`voice:${chId}`).emit('voice_state_update', {
            channelId: chId,
            userId,
            action: 'leave',
          });
          socket.leave(`voice:${chId}`);

          // Clean up empty channels
          if (connections.size === 0) voiceConnections.delete(chId);

          // Remove voice state from DB
          db.prepare('DELETE FROM voice_states WHERE user_id = ? AND channel_id = ?').run(userId, chId);
        }
      }

      // Join new channel
      channelVoice.set(userId, {
        socketId: socket.id,
        selfMute: false,
        selfDeaf: false,
      });

      socket.join(`voice:${channelId}`);

      // Store voice state
      db.prepare(`
        INSERT OR REPLACE INTO voice_states (user_id, channel_id, server_id)
        VALUES (?, ?, ?)
      `).run(userId, channelId, serverId || null);

      // Notify others in the voice channel
      io.to(`voice:${channelId}`).emit('voice_state_update', {
        channelId,
        userId,
        username: user.username,
        avatar: user.avatar,
        action: 'join',
        selfMute: false,
        selfDeaf: false,
      });

      // Send existing participants to the new joiner
      const participants = [];
      for (const [uid, state] of channelVoice) {
        if (uid !== userId) {
          const u = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(uid);
          participants.push({
            userId: uid,
            username: u?.username,
            avatar: u?.avatar,
            selfMute: state.selfMute,
            selfDeaf: state.selfDeaf,
            socketId: state.socketId,
          });
        }
      }
      socket.emit('voice_participants', { channelId, participants });

      // Broadcast voice state to server
      if (serverId) {
        io.to(`server:${serverId}`).emit('voice_channel_update', {
          channelId,
          users: Array.from(channelVoice.keys()),
        });
      }
    });

    socket.on('voice_leave', ({ channelId }) => {
      const channelVoice = voiceConnections.get(channelId);
      if (!channelVoice) return;

      channelVoice.delete(userId);
      socket.leave(`voice:${channelId}`);

      db.prepare('DELETE FROM voice_states WHERE user_id = ? AND channel_id = ?').run(userId, channelId);

      io.to(`voice:${channelId}`).emit('voice_state_update', {
        channelId,
        userId,
        action: 'leave',
      });

      // Get server for broadcast
      const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
      if (channel?.server_id) {
        io.to(`server:${channel.server_id}`).emit('voice_channel_update', {
          channelId,
          users: Array.from(channelVoice.keys()),
        });
      }

      if (channelVoice.size === 0) voiceConnections.delete(channelId);
    });

    socket.on('voice_state', ({ channelId, selfMute, selfDeaf }) => {
      const channelVoice = voiceConnections.get(channelId);
      if (!channelVoice || !channelVoice.has(userId)) return;

      channelVoice.get(userId).selfMute = selfMute;
      channelVoice.get(userId).selfDeaf = selfDeaf;

      db.prepare('UPDATE voice_states SET self_mute = ?, self_deaf = ? WHERE user_id = ? AND channel_id = ?')
        .run(selfMute ? 1 : 0, selfDeaf ? 1 : 0, userId, channelId);

      io.to(`voice:${channelId}`).emit('voice_state_update', {
        channelId,
        userId,
        action: 'update',
        selfMute,
        selfDeaf,
      });
    });

    // WebRTC signaling
    socket.on('webrtc_offer', ({ targetUserId, offer, channelId }) => {
      const channelVoice = voiceConnections.get(channelId);
      if (!channelVoice) return;
      const target = channelVoice.get(targetUserId);
      if (target) {
        io.to(target.socketId).emit('webrtc_offer', { fromUserId: userId, offer, channelId });
      }
    });

    socket.on('webrtc_answer', ({ targetUserId, answer, channelId }) => {
      const channelVoice = voiceConnections.get(channelId);
      if (!channelVoice) return;
      const target = channelVoice.get(targetUserId);
      if (target) {
        io.to(target.socketId).emit('webrtc_answer', { fromUserId: userId, answer, channelId });
      }
    });

    socket.on('webrtc_ice_candidate', ({ targetUserId, candidate, channelId }) => {
      const channelVoice = voiceConnections.get(channelId);
      if (!channelVoice) return;
      const target = channelVoice.get(targetUserId);
      if (target) {
        io.to(target.socketId).emit('webrtc_ice_candidate', { fromUserId: userId, candidate, channelId });
      }
    });

    // --- Status ---

    socket.on('status_change', (status) => {
      const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
      if (!validStatuses.includes(status)) return;
      const dbStatus = status === 'invisible' ? 'offline' : status;
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(dbStatus, userId);
      const servers = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(userId);
      for (const s of servers) {
        io.to(`server:${s.server_id}`).emit('presence_update', { userId, status: dbStatus });
      }
    });

    // --- Server events ---

    socket.on('server_join', (serverId) => {
      socket.join(`server:${serverId}`);
    });

    socket.on('server_leave', (serverId) => {
      socket.leave(`server:${serverId}`);
    });

    // --- Disconnect ---

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId} (socket: ${socket.id})`);

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          // Set offline
          db.prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', userId);

          // Broadcast offline status
          const servers = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(userId);
          for (const s of servers) {
            io.to(`server:${s.server_id}`).emit('presence_update', { userId, status: 'offline' });
          }
        }
      }

      // Clean up voice connections
      for (const [channelId, connections] of voiceConnections) {
        if (connections.has(userId)) {
          connections.delete(userId);
          io.to(`voice:${channelId}`).emit('voice_state_update', {
            channelId,
            userId,
            action: 'leave',
          });

          db.prepare('DELETE FROM voice_states WHERE user_id = ? AND channel_id = ?').run(userId, channelId);

          const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
          if (channel?.server_id) {
            io.to(`server:${channel.server_id}`).emit('voice_channel_update', {
              channelId,
              users: Array.from(connections.keys()),
            });
          }

          if (connections.size === 0) voiceConnections.delete(channelId);
        }
      }
    });
  });
}

module.exports = { setupSocketHandlers, onlineUsers, voiceConnections };
