import { create } from 'zustand';
import { api } from './utils/api';
import { getSocket } from './utils/socket';

// Notification sound
let notifAudio = null;
function playNotificationSound() {
  try {
    if (!notifAudio) {
      notifAudio = new Audio('data:audio/wav;base64,UklGRl9vT19teleXNpcyBpcyBub3QgYSByZWFsIHdhdiBmaWxl');
      // Use a simple oscillator beep instead
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      return;
    }
    notifAudio.currentTime = 0;
    notifAudio.play().catch(() => {});
  } catch {}
}

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  token: localStorage.getItem('token'),

  // Servers
  servers: [],
  currentServer: null,
  channels: [],
  categories: [],
  roles: [],
  members: [],

  // Messages
  currentChannel: null,
  messages: [],
  loadingMessages: false,

  // DMs
  dmChannels: [],
  currentDm: null,

  // Voice
  voiceChannel: null,
  voiceParticipants: [],
  voiceState: { selfMute: false, selfDeaf: false },

  // Friends
  relationships: [],

  // Unread tracking
  unreadChannels: {}, // { channelId: { count: number, lastMessageId: string } }
  unreadServers: {},  // { serverId: count }

  // UI
  showSettings: false,
  showServerSettings: false,
  showCreateServer: false,
  showInviteModal: false,
  replyingTo: null,
  typingUsers: {},
  notificationsEnabled: true,

  // Auth actions
  setUser: (user) => set({ user }),
  setToken: (token) => {
    localStorage.setItem('token', token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, servers: [], currentServer: null, currentChannel: null, messages: [] });
  },

  // Server actions
  fetchServers: async () => {
    const servers = await api.get('/servers');
    set({ servers });
  },

  selectServer: async (serverId) => {
    const data = await api.get(`/servers/${serverId}`);
    set({
      currentServer: data,
      channels: data.channels || [],
      categories: data.categories || [],
      roles: data.roles || [],
      members: data.members || [],
      currentDm: null,
    });
    // Clear unread for this server
    set(s => {
      const unreadServers = { ...s.unreadServers };
      delete unreadServers[serverId];
      return { unreadServers };
    });
    // Auto-select first text channel
    const firstText = (data.channels || []).find(c => c.type === 'text');
    if (firstText) {
      get().selectChannel(firstText);
    }
  },

  createServer: async (name) => {
    const server = await api.post('/servers', { name });
    set(s => ({ servers: [...s.servers, server], showCreateServer: false }));
    get().selectServer(server.id);
  },

  // Channel actions
  selectChannel: async (channel) => {
    const prev = get().currentChannel;
    set({ currentChannel: channel, messages: [], loadingMessages: true, replyingTo: null });
    // Clear unread for this channel
    set(s => {
      const unreadChannels = { ...s.unreadChannels };
      delete unreadChannels[channel.id];
      return { unreadChannels };
    });
    // Join socket room for this channel (leave previous)
    const socket = getSocket();
    if (socket) {
      if (prev?.id && prev.id !== channel.id) socket.emit('leave_channel', prev.id);
      socket.emit('join_channel', channel.id);
    }
    try {
      const messages = await api.get(`/${channel.id}/messages`);
      set({ messages, loadingMessages: false });
    } catch {
      set({ loadingMessages: false });
    }
  },

  createChannel: async (serverId, name, type = 'text', categoryId = null) => {
    const channel = await api.post(`/servers/${serverId}/channels`, {
      name,
      type,
      category_id: categoryId,
    });
    set(s => ({ channels: [...s.channels, channel] }));
    return channel;
  },

  reorderChannels: async (serverId, channelUpdates) => {
    // Optimistically update local state
    set(s => {
      const channels = s.channels.map(ch => {
        const update = channelUpdates.find(u => u.id === ch.id);
        return update ? { ...ch, position: update.position, category_id: update.category_id } : ch;
      });
      return { channels };
    });
    try {
      const updated = await api.patch(`/servers/${serverId}/channels/reorder`, { channels: channelUpdates });
      set({ channels: updated });
    } catch (err) {
      // Revert on error by re-fetching
      const data = await api.get(`/servers/${serverId}`);
      set({ channels: data.channels || [] });
    }
  },

  // Message actions
  sendMessage: async (channelId, content, files = null, replyToId = null) => {
    if (files && files.length > 0) {
      const formData = new FormData();
      if (content) formData.append('content', content);
      if (replyToId) formData.append('reply_to_id', replyToId);
      for (const f of files) formData.append('files', f);
      return api.upload(`/${channelId}/messages`, formData);
    }
    return api.post(`/${channelId}/messages`, {
      content,
      reply_to_id: replyToId,
    });
  },

  editMessage: async (channelId, messageId, content) => {
    const msg = await api.patch(`/${channelId}/messages/${messageId}`, { content });
    set(s => ({
      messages: s.messages.map(m => m.id === messageId ? { ...m, ...msg } : m),
    }));
  },

  deleteMessage: async (channelId, messageId) => {
    await api.delete(`/${channelId}/messages/${messageId}`);
  },

  addMessage: (message) => {
    const state = get();
    if (state.currentChannel?.id === message.channel_id) {
      // In the current channel - add to messages
      set(s => {
        if (s.messages.some(m => m.id === message.id)) return {};
        return { messages: [...s.messages, message] };
      });
    } else {
      // Not in this channel - mark as unread
      set(s => {
        const unreadChannels = { ...s.unreadChannels };
        const current = unreadChannels[message.channel_id] || { count: 0 };
        unreadChannels[message.channel_id] = { count: current.count + 1, lastMessageId: message.id };

        // Also track server-level unread
        const unreadServers = { ...s.unreadServers };
        if (message.server_id) {
          unreadServers[message.server_id] = (unreadServers[message.server_id] || 0) + 1;
        }

        return { unreadChannels, unreadServers };
      });

      // Play notification sound
      if (state.notificationsEnabled && message.author_id !== state.user?.id) {
        playNotificationSound();
      }
    }
  },

  updateMessage: (message) => {
    set(s => ({
      messages: s.messages.map(m => m.id === message.id ? { ...m, ...message } : m),
    }));
  },

  removeMessage: (messageId) => {
    set(s => ({
      messages: s.messages.filter(m => m.id !== messageId),
    }));
  },

  // Reaction actions
  addReaction: async (channelId, messageId, emoji) => {
    await api.put(`/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  },

  removeReaction: async (channelId, messageId, emoji) => {
    await api.delete(`/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  },

  // DM actions
  fetchDms: async () => {
    const dmChannels = await api.get('/dms');
    set({ dmChannels });
  },

  openDm: async (recipientId) => {
    const channel = await api.post('/dms', { recipient_id: recipientId });
    set(s => {
      const exists = s.dmChannels.some(d => d.id === channel.id);
      return {
        dmChannels: exists ? s.dmChannels : [...s.dmChannels, channel],
        currentDm: channel,
        currentServer: null,
        currentChannel: channel,
        messages: [],
      };
    });
    get().selectChannel(channel);
  },

  selectDm: (dm) => {
    set({ currentDm: dm, currentServer: null });
    get().selectChannel(dm);
  },

  // Friends
  fetchRelationships: async () => {
    const relationships = await api.get('/relationships');
    set({ relationships });
  },

  sendFriendRequest: async (username, discriminator) => {
    await api.post('/relationships', { username, discriminator });
    get().fetchRelationships();
  },

  acceptFriend: async (targetId) => {
    await api.put(`/relationships/${targetId}`);
    get().fetchRelationships();
  },

  removeFriend: async (targetId) => {
    await api.delete(`/relationships/${targetId}`);
    get().fetchRelationships();
  },

  // Invite actions
  createInvite: async (channelId) => {
    return api.post(`/${channelId}/invites`, {});
  },

  joinServer: async (code) => {
    const result = await api.post(`/invites/${code}`);
    if (result.server) {
      get().fetchServers();
      get().selectServer(result.server.id);
    }
    return result;
  },

  // Voice
  setVoiceChannel: (channel) => set({ voiceChannel: channel }),
  setVoiceParticipants: (participants) => set({ voiceParticipants: participants }),
  setVoiceState: (state) => set(s => ({ voiceState: { ...s.voiceState, ...state } })),

  // Role actions
  createRole: async (serverId, data) => {
    const role = await api.post(`/servers/${serverId}/roles`, data);
    set(s => ({ roles: [...s.roles, role] }));
    return role;
  },

  updateRole: async (serverId, roleId, data) => {
    const role = await api.patch(`/servers/${serverId}/roles/${roleId}`, data);
    set(s => ({ roles: s.roles.map(r => r.id === roleId ? role : r) }));
    return role;
  },

  assignRole: async (serverId, userId, roleId) => {
    await api.put(`/servers/${serverId}/members/${userId}/roles/${roleId}`);
  },

  // Typing
  setTypingUser: (channelId, userId, username) => {
    set(s => ({
      typingUsers: {
        ...s.typingUsers,
        [channelId]: {
          ...s.typingUsers[channelId],
          [userId]: { username, timestamp: Date.now() },
        },
      },
    }));
    // Auto-clear after 5 seconds
    setTimeout(() => {
      set(s => {
        const channelTyping = { ...s.typingUsers[channelId] };
        delete channelTyping[userId];
        return { typingUsers: { ...s.typingUsers, [channelId]: channelTyping } };
      });
    }, 5000);
  },

  // Presence
  updatePresence: (userId, status) => {
    set(s => ({
      members: s.members.map(m => m.id === userId ? { ...m, status } : m),
    }));
  },

  // Avatar upload
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const user = await api.upload('/auth/avatar', formData);
    set({ user });
    return user;
  },

  // Server icon upload
  uploadServerIcon: async (serverId, file) => {
    const formData = new FormData();
    formData.append('icon', file);
    const server = await api.upload(`/servers/${serverId}/icon`, formData);
    set(s => ({
      servers: s.servers.map(sv => sv.id === serverId ? { ...sv, icon: server.icon } : sv),
      currentServer: s.currentServer?.id === serverId ? { ...s.currentServer, icon: server.icon } : s.currentServer,
    }));
    return server;
  },

  // UI
  toggleSettings: () => set(s => ({ showSettings: !s.showSettings })),
  toggleServerSettings: () => set(s => ({ showServerSettings: !s.showServerSettings })),
  toggleCreateServer: () => set(s => ({ showCreateServer: !s.showCreateServer })),
  toggleInviteModal: () => set(s => ({ showInviteModal: !s.showInviteModal })),
  setReplyingTo: (msg) => set({ replyingTo: msg }),
}));
