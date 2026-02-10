import { create } from 'zustand';
import { api } from './utils/api';
import { getSocket } from './utils/socket';
import { playMessageSound, playMentionSound, showNotification, updateTitleBadge } from './utils/notifications';

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

  // Emojis
  serverEmojis: [],

  // Events
  serverEvents: [],
  showEventsPanel: false,

  // Messages
  currentChannel: null,
  messages: [],
  loadingMessages: false,

  // Threads
  activeThread: null,
  threadMessages: [],
  loadingThread: false,

  // DMs
  dmChannels: [],
  currentDm: null,

  // Voice
  voiceChannel: null,
  voiceParticipants: [],
  voiceState: { selfMute: false, selfDeaf: false },
  voiceUsers: {}, // { channelId: [{ user_id, username, avatar, self_mute, self_deaf }] }

  // Quick Switcher
  recentChannels: [],
  showQuickSwitcher: false,

  // Friends
  relationships: [],

  // Link embeds
  messageEmbeds: {}, // { messageId: [embeds] }

  // Unread tracking
  unreadChannels: {}, // { channelId: { count: number, lastMessageId: string } }
  unreadServers: {},  // { serverId: count }

  // Read states (server-persisted)
  readStates: {}, // { channelId: lastReadMessageId }
  lastReadMessageId: null, // for current channel - the message ID that was last read before opening

  // Connection
  connectionState: 'disconnected', // 'connected', 'connecting', 'disconnected'
  setConnectionState: (state) => set({ connectionState: state }),

  // Read state actions
  fetchReadStates: async () => {
    try {
      const states = await api.get('/read-states/bulk');
      set({ readStates: states || {} });
    } catch {}
  },

  ackChannel: async (channelId, messageId) => {
    if (!channelId || !messageId) return;
    try {
      await api.post(`/channels/${channelId}/read-ack`, { messageId });
      set(s => ({
        readStates: { ...s.readStates, [channelId]: messageId },
        unreadChannels: (() => {
          const uc = { ...s.unreadChannels };
          delete uc[channelId];
          return uc;
        })(),
      }));
    } catch {}
  },

  markServerAsRead: async (serverId) => {
    const state = get();
    const serverChannels = state.channels.filter(c => c.server_id === serverId);
    for (const ch of serverChannels) {
      const lastMsg = state.unreadChannels[ch.id]?.lastMessageId;
      if (lastMsg) {
        await get().ackChannel(ch.id, lastMsg);
      }
    }
  },

  // Channel Settings
  showChannelSettings: null, // channelId or null
  channelOverwrites: {}, // { channelId: [overwrites] }

  openChannelSettings: (channelId) => set({ showChannelSettings: channelId }),
  closeChannelSettings: () => set({ showChannelSettings: null }),

  fetchChannelOverwrites: async (channelId) => {
    try {
      const overwrites = await api.get(`/channels/${channelId}/overwrites`);
      set(s => ({
        channelOverwrites: { ...s.channelOverwrites, [channelId]: overwrites },
      }));
      return overwrites;
    } catch {
      return [];
    }
  },

  updateChannelOverwrite: async (channelId, targetId, targetType, allow, deny) => {
    const overwrites = await api.put(`/channels/${channelId}/overwrites/${targetId}`, {
      target_type: targetType,
      allow: allow.toString(),
      deny: deny.toString(),
    });
    set(s => ({
      channelOverwrites: { ...s.channelOverwrites, [channelId]: overwrites },
    }));
    return overwrites;
  },

  deleteChannelOverwrite: async (channelId, targetId) => {
    await api.delete(`/channels/${channelId}/overwrites/${targetId}`);
    set(s => ({
      channelOverwrites: {
        ...s.channelOverwrites,
        [channelId]: (s.channelOverwrites[channelId] || []).filter(o => o.target_id !== targetId),
      },
    }));
  },

  // Bulk message selection
  bulkSelectMode: false,
  selectedMessages: new Set(),
  toggleBulkSelect: () => set(s => ({ bulkSelectMode: !s.bulkSelectMode, selectedMessages: new Set() })),
  toggleMessageSelect: (messageId) => set(s => {
    const next = new Set(s.selectedMessages);
    if (next.has(messageId)) next.delete(messageId);
    else if (next.size < 100) next.add(messageId);
    return { selectedMessages: next };
  }),
  selectAllMessages: () => set(s => {
    const ids = new Set(s.messages.map(m => m.id).slice(0, 100));
    return { selectedMessages: ids };
  }),
  clearSelection: () => set({ selectedMessages: new Set() }),
  bulkDeleteMessages: async (channelId) => {
    const ids = Array.from(get().selectedMessages);
    if (ids.length === 0) return;
    try {
      await api.post(`/${channelId}/messages/bulk-delete`, { message_ids: ids });
      set(s => ({
        messages: s.messages.filter(m => !s.selectedMessages.has(m.id)),
        selectedMessages: new Set(),
        bulkSelectMode: false,
      }));
    } catch (err) {
      console.error('Bulk delete error:', err);
      throw err;
    }
  },
  removeBulkMessages: (messageIds) => {
    const idSet = new Set(messageIds);
    set(s => ({
      messages: s.messages.filter(m => !idSet.has(m.id)),
    }));
  },

  // Discover
  discoverServers: [],
  discoverLoading: false,
  discoverTotal: 0,
  discoverPage: 1,
  showDiscover: false,
  toggleDiscover: () => set(s => ({
    showDiscover: !s.showDiscover,
    currentServer: s.showDiscover ? s.currentServer : null,
    currentChannel: s.showDiscover ? s.currentChannel : null,
    currentDm: s.showDiscover ? s.currentDm : null,
  })),

  fetchDiscoverServers: async (params = {}) => {
    set({ discoverLoading: true });
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', params.page);
      if (params.limit) query.set('limit', params.limit);
      if (params.q) query.set('q', params.q);
      if (params.sort) query.set('sort', params.sort);
      if (params.category) query.set('category', params.category);
      const qs = query.toString();
      const result = await api.get(`/discover${qs ? `?${qs}` : ''}`);
      set({
        discoverServers: result.servers || [],
        discoverTotal: result.total || 0,
        discoverPage: result.page || 1,
        discoverLoading: false,
      });
      return result;
    } catch (err) {
      set({ discoverLoading: false });
      console.error('Fetch discover servers error:', err);
      return { servers: [], total: 0 };
    }
  },

  fetchDiscoverServerDetail: async (serverId) => {
    try {
      return await api.get(`/discover/${serverId}`);
    } catch (err) {
      console.error('Fetch discover server detail error:', err);
      return null;
    }
  },

  joinDiscoverServer: async (serverId) => {
    try {
      // Use the existing join endpoint - we need an invite or direct join
      // For public servers, we create a special join endpoint
      const result = await api.post(`/discover/${serverId}/join`);
      if (result.server) {
        get().fetchServers();
      }
      return result;
    } catch (err) {
      console.error('Join discover server error:', err);
      throw err;
    }
  },

  // Bookmarks
  bookmarks: [],
  showBookmarks: false,

  fetchBookmarks: async () => {
    try {
      const bookmarks = await api.get('/bookmarks');
      set({ bookmarks: bookmarks || [] });
    } catch {
      set({ bookmarks: [] });
    }
  },

  toggleBookmark: async (messageId) => {
    const state = get();
    const existing = state.bookmarks.find(b => b.message_id === messageId);
    if (existing) {
      await api.delete(`/bookmarks/${messageId}`);
      set(s => ({ bookmarks: s.bookmarks.filter(b => b.message_id !== messageId) }));
    } else {
      await api.post('/bookmarks', { messageId });
      // Re-fetch to get full bookmark data with message info
      const bookmarks = await api.get('/bookmarks');
      set({ bookmarks: bookmarks || [] });
    }
  },

  toggleBookmarksPanel: () => set(s => ({ showBookmarks: !s.showBookmarks })),

  isBookmarked: (messageId) => {
    return get().bookmarks.some(b => b.message_id === messageId);
  },

  // Search
  showSearchPanel: false,
  toggleSearchPanel: () => set(s => ({ showSearchPanel: !s.showSearchPanel })),

  // UI
  showSettings: false,
  showServerSettings: false,
  showCreateServer: false,
  showInviteModal: false,
  replyingTo: null,
  typingUsers: {},
  // Notification settings
  notificationsEnabled: true,
  desktopNotifications: true,
  soundEnabled: true,
  mentionNotifications: true, // Always notify on mentions even if other notifs disabled

  // Per-server/channel notification settings
  notificationSettings: {}, // keyed by `${targetType}:${targetId}`

  fetchNotificationSettings: async () => {
    try {
      const settings = await api.get('/notifications/settings');
      const mapped = {};
      for (const s of settings) {
        mapped[`${s.target_type}:${s.target_id}`] = s;
      }
      set({ notificationSettings: mapped });
    } catch {
      // Ignore errors on load
    }
  },

  updateNotificationSetting: async (targetType, targetId, settings) => {
    try {
      const result = await api.put(`/notifications/settings/${targetType}/${targetId}`, settings);
      set(s => ({
        notificationSettings: {
          ...s.notificationSettings,
          [`${targetType}:${targetId}`]: result,
        },
      }));
      return result;
    } catch (err) {
      console.error('Error updating notification setting:', err);
      throw err;
    }
  },

  resetNotificationSetting: async (targetType, targetId) => {
    try {
      await api.delete(`/notifications/settings/${targetType}/${targetId}`);
      set(s => {
        const notificationSettings = { ...s.notificationSettings };
        delete notificationSettings[`${targetType}:${targetId}`];
        return { notificationSettings };
      });
    } catch (err) {
      console.error('Error resetting notification setting:', err);
      throw err;
    }
  },

  isChannelMuted: (channelId) => {
    const state = get();
    // Check channel-level mute
    const channelSetting = state.notificationSettings[`channel:${channelId}`];
    if (channelSetting?.muted) {
      // Check if mute has expired
      if (channelSetting.mute_until) {
        if (new Date(channelSetting.mute_until) > new Date()) return true;
      } else {
        return true;
      }
    }
    // Check parent server mute
    const channel = state.channels.find(c => c.id === channelId);
    if (channel?.server_id) {
      const serverSetting = state.notificationSettings[`server:${channel.server_id}`];
      if (serverSetting?.muted) {
        if (serverSetting.mute_until) {
          if (new Date(serverSetting.mute_until) > new Date()) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  },

  isServerMuted: (serverId) => {
    const state = get();
    const serverSetting = state.notificationSettings[`server:${serverId}`];
    if (serverSetting?.muted) {
      if (serverSetting.mute_until) {
        return new Date(serverSetting.mute_until) > new Date();
      }
      return true;
    }
    return false;
  },

  getNotifyLevel: (channelId, serverId) => {
    const state = get();
    // Channel-level overrides server-level
    const channelSetting = state.notificationSettings[`channel:${channelId}`];
    if (channelSetting && channelSetting.notify_level !== 'default') {
      return channelSetting.notify_level;
    }
    // Fall back to server-level
    if (serverId) {
      const serverSetting = state.notificationSettings[`server:${serverId}`];
      if (serverSetting && serverSetting.notify_level !== 'default') {
        return serverSetting.notify_level;
      }
    }
    return 'all'; // Default behavior: notify for all messages
  },

  // Server Folders
  serverFolders: [],

  fetchFolders: async () => {
    try {
      const folders = await api.get('/folders');
      set({ serverFolders: folders || [] });
    } catch {}
  },

  createFolder: async (name, color, serverIds) => {
    const folder = await api.post('/folders', { name, color, server_ids: serverIds });
    set(s => ({ serverFolders: [...s.serverFolders, folder] }));
    return folder;
  },

  updateFolder: async (folderId, data) => {
    const folder = await api.patch(`/folders/${folderId}`, data);
    set(s => ({ serverFolders: s.serverFolders.map(f => f.id === folderId ? folder : f) }));
    return folder;
  },

  deleteFolder: async (folderId) => {
    await api.delete(`/folders/${folderId}`);
    set(s => ({ serverFolders: s.serverFolders.filter(f => f.id !== folderId) }));
  },

  addServerToFolder: async (folderId, serverId) => {
    const state = get();
    const folder = state.serverFolders.find(f => f.id === folderId);
    if (!folder || folder.server_ids.includes(serverId)) return;
    const newIds = [...folder.server_ids, serverId];
    return get().updateFolder(folderId, { server_ids: newIds });
  },

  removeServerFromFolder: async (folderId, serverId) => {
    const state = get();
    const folder = state.serverFolders.find(f => f.id === folderId);
    if (!folder) return;
    const newIds = folder.server_ids.filter(id => id !== serverId);
    return get().updateFolder(folderId, { server_ids: newIds });
  },

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
      serverEmojis: data.emojis || [],
      currentDm: null,
    });
    // Fetch server events
    api.get(`/servers/${serverId}/events`).then(events => {
      set({ serverEvents: events || [] });
    }).catch(() => set({ serverEvents: [] }));
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
    // Store the last read message ID before we open the channel
    const lastRead = get().readStates[channel.id] || null;
    set({ currentChannel: channel, messages: [], loadingMessages: true, replyingTo: null, lastReadMessageId: lastRead });
    // Track recent channels for quick switcher
    set(s => {
      const entry = { ...channel, server_id: channel.server_id || s.currentServer?.id, _visitedAt: Date.now() };
      const filtered = s.recentChannels.filter(c => c.id !== channel.id);
      return { recentChannels: [entry, ...filtered].slice(0, 8) };
    });
    // Clear unread for this channel
    set(s => {
      const unreadChannels = { ...s.unreadChannels };
      delete unreadChannels[channel.id];
      return { unreadChannels };
    });
    // Update title badge
    setTimeout(() => {
      const state = get();
      const remaining = Object.values(state.unreadChannels).reduce((sum, ch) => sum + (ch.count || 0), 0);
      updateTitleBadge(remaining);
    }, 0);
    // Join socket room for this channel (leave previous)
    const socket = getSocket();
    if (socket) {
      if (prev?.id && prev.id !== channel.id) socket.emit('leave_channel', prev.id);
      socket.emit('join_channel', channel.id);
    }
    try {
      const messages = await api.get(`/${channel.id}/messages`);
      set({ messages, loadingMessages: false });
      // Ack with the latest message (messages are sorted oldest-first, so last element is newest)
      if (messages.length > 0) {
        get().ackChannel(channel.id, messages[messages.length - 1].id);
      }
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

  reorderCategories: async (serverId, categoryUpdates) => {
    // Optimistically update local state
    set(s => {
      const categories = s.categories.map(cat => {
        const update = categoryUpdates.find(u => u.id === cat.id);
        return update ? { ...cat, position: update.position } : cat;
      });
      return { categories };
    });
    try {
      const updated = await api.patch(`/servers/${serverId}/categories/reorder`, { categories: categoryUpdates });
      set({ categories: updated });
    } catch (err) {
      // Revert on error by re-fetching
      const data = await api.get(`/servers/${serverId}`);
      set({ categories: data.categories || [] });
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
        const current = unreadChannels[message.channel_id] || { count: 0, mentions: 0 };
        const mentionCount = (message.mentions && message.mentions.includes(s.user?.id)) ? 1 : 0;
        unreadChannels[message.channel_id] = {
          count: current.count + 1,
          lastMessageId: message.id,
          mentions: (current.mentions || 0) + mentionCount,
        };

        // Also track server-level unread
        const unreadServers = { ...s.unreadServers };
        if (message.server_id) {
          unreadServers[message.server_id] = (unreadServers[message.server_id] || 0) + 1;
        }

        return { unreadChannels, unreadServers };
      });

      // Notifications
      if (message.author_id !== state.user?.id) {
        const isMentioned = message.mentions && message.mentions.includes(state.user?.id);

        // Check per-channel/server notification settings
        const channelMuted = state.isChannelMuted(message.channel_id);
        const notifyLevel = state.getNotifyLevel(message.channel_id, message.server_id);
        const suppressEveryone = (() => {
          const cs = state.notificationSettings[`channel:${message.channel_id}`];
          if (cs?.suppress_everyone) return true;
          if (message.server_id) {
            const ss = state.notificationSettings[`server:${message.server_id}`];
            if (ss?.suppress_everyone) return true;
          }
          return false;
        })();

        // Determine if this message should trigger a notification
        const isEveryoneMention = message.content && (message.content.includes('@everyone') || message.content.includes('@here'));
        const effectiveMention = isMentioned || (isEveryoneMention && !suppressEveryone);

        let shouldNotify = false;
        if (!channelMuted) {
          if (notifyLevel === 'all') shouldNotify = true;
          else if (notifyLevel === 'mentions') shouldNotify = effectiveMention;
          else if (notifyLevel === 'nothing') shouldNotify = false;
        }

        // Sound
        if (state.soundEnabled && shouldNotify) {
          if (effectiveMention) {
            playMentionSound();
          } else if (state.notificationsEnabled) {
            playMessageSound();
          }
        }

        // Desktop notification
        if (state.desktopNotifications && shouldNotify && (state.notificationsEnabled || (state.mentionNotifications && effectiveMention))) {
          const channelName = message.channel_name || message.channel_id?.slice(0, 8);
          showNotification(
            effectiveMention ? `${message.username} mentioned you` : message.username,
            {
              body: message.content?.slice(0, 100) || '(attachment)',
              tag: `msg-${message.channel_id}`, // Group by channel
            }
          );
        }

        // Update title badge
        const totalUnread = Object.values(get().unreadChannels).reduce((sum, ch) => sum + (ch.count || 0), 0) + 1;
        updateTitleBadge(totalUnread);
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

  // Thread actions
  openThread: async (thread) => {
    set({ activeThread: thread, threadMessages: [], loadingThread: true });
    const socket = getSocket();
    socket?.emit('thread_join', thread.id);
    try {
      const messages = await api.get(`/threads/${thread.id}/messages`);
      set({ threadMessages: messages, loadingThread: false });
    } catch {
      set({ loadingThread: false });
    }
  },

  closeThread: () => {
    const thread = get().activeThread;
    if (thread) {
      const socket = getSocket();
      socket?.emit('thread_leave', thread.id);
    }
    set({ activeThread: null, threadMessages: [] });
  },

  createThread: async (channelId, messageId, name) => {
    const thread = await api.post(`/${channelId}/messages/${messageId}/threads`, { name });
    set({ activeThread: thread, threadMessages: [], loadingThread: false });
    const socket = getSocket();
    socket?.emit('thread_join', thread.id);
    return thread;
  },

  sendThreadMessage: async (threadId, content) => {
    const msg = await api.post(`/threads/${threadId}/messages`, { content });
    set(s => ({
      threadMessages: [...s.threadMessages, msg],
    }));
    return msg;
  },

  addThreadMessage: (message) => {
    set(s => {
      if (s.activeThread?.id !== message.threadId) return {};
      if (s.threadMessages.some(m => m.id === message.id)) return {};
      return { threadMessages: [...s.threadMessages, message] };
    });
  },

  // Link embed actions
  setMessageEmbeds: (messageId, embeds) => {
    set(s => ({
      messageEmbeds: { ...s.messageEmbeds, [messageId]: embeds },
    }));
  },

  // Reaction actions
  pinMessage: async (channelId, messageId) => {
    await api.put(`/${channelId}/pins/${messageId}`);
    set(s => ({
      messages: s.messages.map(m => m.id === messageId ? { ...m, pinned: 1 } : m),
    }));
  },

  unpinMessage: async (channelId, messageId) => {
    await api.delete(`/${channelId}/pins/${messageId}`);
    set(s => ({
      messages: s.messages.map(m => m.id === messageId ? { ...m, pinned: 0 } : m),
    }));
  },

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
    // Track DM in recent channels for quick switcher
    set(s => {
      const entry = { ...dm, _isDm: true, _visitedAt: Date.now() };
      const filtered = s.recentChannels.filter(c => c.id !== dm.id);
      return { recentChannels: [entry, ...filtered].slice(0, 8) };
    });
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

  fetchVoiceStates: async (channelId) => {
    try {
      const states = await api.get(`/channels/${channelId}/voice-states`);
      set(s => ({ voiceUsers: { ...s.voiceUsers, [channelId]: states } }));
    } catch {}
  },

  joinVoice: (channelId) => {
    const socket = getSocket();
    const state = get();
    if (!socket || !state.currentServer) return;

    // Leave current voice channel first
    if (state.voiceChannel) {
      socket.emit('voice_leave', { channelId: state.voiceChannel.id });
    }

    const channel = state.channels.find(c => c.id === channelId);
    socket.emit('voice_join', { channelId, serverId: state.currentServer.id });
    set({ voiceChannel: channel, voiceState: { selfMute: false, selfDeaf: false } });
  },

  leaveVoice: () => {
    const socket = getSocket();
    const state = get();
    if (!socket || !state.voiceChannel) return;
    socket.emit('voice_leave', { channelId: state.voiceChannel.id });
    set({ voiceChannel: null, voiceParticipants: [], voiceState: { selfMute: false, selfDeaf: false } });
  },

  toggleMute: () => {
    const socket = getSocket();
    const state = get();
    if (!socket || !state.voiceChannel) return;
    const newMute = !state.voiceState.selfMute;
    socket.emit('voice_state', { channelId: state.voiceChannel.id, selfMute: newMute, selfDeaf: state.voiceState.selfDeaf });
    set({ voiceState: { ...state.voiceState, selfMute: newMute } });
  },

  toggleDeafen: () => {
    const socket = getSocket();
    const state = get();
    if (!socket || !state.voiceChannel) return;
    const newDeaf = !state.voiceState.selfDeaf;
    const newMute = newDeaf ? true : state.voiceState.selfMute;
    socket.emit('voice_state', { channelId: state.voiceChannel.id, selfMute: newMute, selfDeaf: newDeaf });
    set({ voiceState: { selfMute: newMute, selfDeaf: newDeaf } });
  },

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

  // Nickname
  setNickname: async (serverId, userId, nickname) => {
    const isSelf = userId === get().user.id;
    const endpoint = isSelf
      ? `/servers/${serverId}/members/@me/nickname`
      : `/servers/${serverId}/members/${userId}/nickname`;
    await api.patch(endpoint, { nickname: nickname || null });
    set(s => ({
      members: s.members.map(m => m.id === userId ? { ...m, nickname: nickname || null } : m),
    }));
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

  // Server banner upload
  uploadServerBanner: async (serverId, file) => {
    const formData = new FormData();
    formData.append('banner', file);
    const result = await api.upload(`/servers/${serverId}/banner`, formData);
    set(s => ({
      servers: s.servers.map(sv => sv.id === serverId ? { ...sv, banner: result.banner } : sv),
      currentServer: s.currentServer?.id === serverId ? { ...s.currentServer, banner: result.banner } : s.currentServer,
    }));
    return result;
  },

  removeServerBanner: async (serverId) => {
    await api.delete(`/servers/${serverId}/banner`);
    set(s => ({
      servers: s.servers.map(sv => sv.id === serverId ? { ...sv, banner: null } : sv),
      currentServer: s.currentServer?.id === serverId ? { ...s.currentServer, banner: null } : s.currentServer,
    }));
  },

  // Emoji actions
  uploadEmoji: async (serverId, name, file) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('name', name);
    const emoji = await api.upload(`/servers/${serverId}/emojis`, formData);
    set(s => ({ serverEmojis: [...s.serverEmojis, emoji] }));
    return emoji;
  },

  deleteEmoji: async (serverId, emojiId) => {
    await api.delete(`/servers/${serverId}/emojis/${emojiId}`);
    set(s => ({ serverEmojis: s.serverEmojis.filter(e => e.id !== emojiId) }));
  },

  renameEmoji: async (serverId, emojiId, name) => {
    const emoji = await api.patch(`/servers/${serverId}/emojis/${emojiId}`, { name });
    set(s => ({ serverEmojis: s.serverEmojis.map(e => e.id === emojiId ? emoji : e) }));
    return emoji;
  },

  // Event actions
  fetchServerEvents: async (serverId) => {
    try {
      const events = await api.get(`/servers/${serverId}/events`);
      set({ serverEvents: events || [] });
    } catch {
      set({ serverEvents: [] });
    }
  },

  createEvent: async (serverId, data) => {
    const event = await api.post(`/servers/${serverId}/events`, data);
    set(s => ({ serverEvents: [...s.serverEvents, event] }));
    return event;
  },

  updateEvent: async (serverId, eventId, data) => {
    const event = await api.patch(`/servers/${serverId}/events/${eventId}`, data);
    set(s => ({
      serverEvents: s.serverEvents.map(e => e.id === eventId ? event : e),
    }));
    return event;
  },

  deleteEvent: async (serverId, eventId) => {
    await api.delete(`/servers/${serverId}/events/${eventId}`);
    set(s => ({
      serverEvents: s.serverEvents.filter(e => e.id !== eventId),
    }));
  },

  toggleRsvp: async (serverId, eventId) => {
    const result = await api.put(`/servers/${serverId}/events/${eventId}/rsvp`);
    set(s => ({
      serverEvents: s.serverEvents.map(e =>
        e.id === eventId
          ? { ...e, user_rsvp: result.user_rsvp, interested_count: result.interested_count }
          : e
      ),
    }));
    return result;
  },

  toggleEventsPanel: () => set(s => ({ showEventsPanel: !s.showEventsPanel })),

  // AutoMod
  automodRules: [],

  fetchAutomodRules: async (serverId) => {
    try {
      const rules = await api.get(`/servers/${serverId}/automod/rules`);
      set({ automodRules: rules || [] });
    } catch {
      set({ automodRules: [] });
    }
  },

  createAutomodRule: async (serverId, data) => {
    const rule = await api.post(`/servers/${serverId}/automod/rules`, data);
    set(s => ({ automodRules: [rule, ...s.automodRules] }));
    return rule;
  },

  updateAutomodRule: async (serverId, ruleId, data) => {
    const rule = await api.patch(`/servers/${serverId}/automod/rules/${ruleId}`, data);
    set(s => ({
      automodRules: s.automodRules.map(r => r.id === ruleId ? rule : r),
    }));
    return rule;
  },

  deleteAutomodRule: async (serverId, ruleId) => {
    await api.delete(`/servers/${serverId}/automod/rules/${ruleId}`);
    set(s => ({
      automodRules: s.automodRules.filter(r => r.id !== ruleId),
    }));
  },

  toggleAutomodRule: async (serverId, ruleId, enabled) => {
    const rule = await api.patch(`/servers/${serverId}/automod/rules/${ruleId}`, { enabled });
    set(s => ({
      automodRules: s.automodRules.map(r => r.id === ruleId ? rule : r),
    }));
    return rule;
  },

  // Webhooks
  webhooks: [],

  fetchWebhooks: async (serverId) => {
    try {
      const webhooks = await api.get(`/servers/${serverId}/webhooks`);
      set({ webhooks: webhooks || [] });
    } catch {
      set({ webhooks: [] });
    }
  },

  createWebhook: async (channelId, name) => {
    const webhook = await api.post(`/channels/${channelId}/webhooks`, { name });
    set(s => ({ webhooks: [...s.webhooks, webhook] }));
    return webhook;
  },

  updateWebhook: async (webhookId, data) => {
    const webhook = await api.patch(`/webhooks/${webhookId}`, data);
    set(s => ({
      webhooks: s.webhooks.map(w => w.id === webhookId ? webhook : w),
    }));
    return webhook;
  },

  deleteWebhook: async (webhookId) => {
    await api.delete(`/webhooks/${webhookId}`);
    set(s => ({
      webhooks: s.webhooks.filter(w => w.id !== webhookId),
    }));
  },

  // UI
  toggleSettings: () => set(s => ({ showSettings: !s.showSettings })),
  toggleServerSettings: () => set(s => ({ showServerSettings: !s.showServerSettings })),
  toggleCreateServer: () => set(s => ({ showCreateServer: !s.showCreateServer })),
  toggleInviteModal: () => set(s => ({ showInviteModal: !s.showInviteModal })),
  toggleQuickSwitcher: () => set(s => ({ showQuickSwitcher: !s.showQuickSwitcher })),
  setReplyingTo: (msg) => set({ replyingTo: msg }),
}));
