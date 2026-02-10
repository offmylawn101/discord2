import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';
import { PERMISSIONS, hasPermission } from '../utils/permissions';
import VoicePanel, { MicOffSmall, HeadphoneOffSmall } from './VoicePanel';
import StatusPicker from './StatusPicker';

// Bell-slash SVG icon for muted indicator
function BellSlashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C9.37 5.13 8.1 6.21 7.46 7.6L18 18z"
        fill="currentColor"
      />
      <path d="M3.27 3L2 4.27l2.92 2.92C4.34 8.36 4 9.62 4 11v5l-2 2v1h15.73l2 2L21.27 19.73 3.27 3z" fill="currentColor" />
    </svg>
  );
}

export default function Sidebar({ isHome }) {
  const {
    user, currentServer, channels, categories, currentChannel,
    dmChannels, currentDm, selectChannel, selectDm,
    toggleServerSettings, toggleSettings, logout,
    voiceChannel, unreadChannels, reorderChannels, reorderCategories,
    voiceUsers, joinVoice, fetchVoiceStates,
    members, roles,
  } = useStore();
  const navigate = useNavigate();
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null); // { id, type: 'channel'|'category', categoryId }
  const [dropTarget, setDropTarget] = useState(null); // { id, position: 'before'|'after', type: 'channel'|'category', categoryId }

  // Server notification context menu state
  const [serverContextMenu, setServerContextMenu] = useState(null); // { x, y }

  // Permission check: can user manage channels?
  const canManageChannels = (() => {
    if (!currentServer || !user) return false;
    if (currentServer.owner_id === user.id) return true;
    const memberEntry = members?.find(m => m.id === user.id);
    if (!memberEntry?.roles) return false;
    const MANAGE_CHANNELS = 1n << 4n;
    const ADMINISTRATOR = 1n << 3n;
    for (const roleId of memberEntry.roles) {
      const role = roles.find(r => r.id === roleId);
      if (!role) continue;
      const perms = BigInt(role.permissions || 0);
      if (perms & ADMINISTRATOR || perms & MANAGE_CHANNELS) return true;
    }
    return false;
  })();

  // Listen for categories_reorder socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentServer) return;
    const handleCategoriesReorder = (updated) => {
      useStore.setState({ categories: updated });
    };
    socket.on('categories_reorder', handleCategoriesReorder);
    return () => socket.off('categories_reorder', handleCategoriesReorder);
  }, [currentServer?.id]);

  const toggleCategory = (id) => {
    setCollapsedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const statusColor = {
    online: 'var(--green-360)',
    idle: 'var(--yellow-300)',
    dnd: 'var(--red-400)',
    invisible: 'var(--text-muted)',
    offline: 'var(--text-muted)',
  }[user?.status || 'online'];

  // Channel drag handlers
  const handleChannelDragStart = (e, channel) => {
    if (!canManageChannels) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', channel.id);
    setDraggedItem({ id: channel.id, type: 'channel', categoryId: channel.category_id });
  };

  const handleChannelDragOver = (e, channel) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.type !== 'channel') return;
    if (channel.id === draggedItem.id) return;
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position = e.clientY < mid ? 'before' : 'after';
    setDropTarget({ id: channel.id, position, type: 'channel', categoryId: channel.category_id });
  };

  const handleChannelDrop = (e, targetChannel) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.type !== 'channel') { handleDragEnd(); return; }
    if (draggedItem.id === targetChannel.id) { handleDragEnd(); return; }

    const allChannels = [...channels].sort((a, b) => a.position - b.position);
    const targetCategoryId = dropTarget?.categoryId ?? targetChannel.category_id;

    // Get channels in the target category, excluding the dragged one
    const categoryChannels = allChannels.filter(c => (c.category_id || null) === (targetCategoryId || null) && c.id !== draggedItem.id);

    const draggedChannel = allChannels.find(c => c.id === draggedItem.id);
    if (!draggedChannel) { handleDragEnd(); return; }

    // Find insert index
    const targetIdx = categoryChannels.findIndex(c => c.id === targetChannel.id);
    const insertIdx = dropTarget?.position === 'after' ? targetIdx + 1 : targetIdx;

    // Insert at new position
    categoryChannels.splice(insertIdx, 0, draggedChannel);

    // Build update payload for the target category
    const updates = categoryChannels.map((c, i) => ({
      id: c.id,
      position: i,
      category_id: targetCategoryId,
    }));

    // If channel moved between categories, also renumber the source category
    if ((draggedChannel.category_id || null) !== (targetCategoryId || null)) {
      const sourceChannels = allChannels.filter(c => (c.category_id || null) === (draggedChannel.category_id || null) && c.id !== draggedItem.id);
      sourceChannels.forEach((c, i) => {
        updates.push({ id: c.id, position: i, category_id: c.category_id });
      });
    }

    if (currentServer) {
      reorderChannels(currentServer.id, updates);
    }

    handleDragEnd();
  };

  // Category drag handlers
  const handleCategoryDragStart = (e, category) => {
    if (!canManageChannels) { e.preventDefault(); return; }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', category.id);
    setDraggedItem({ id: category.id, type: 'category' });
  };

  const handleCategoryDragOver = (e, category) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.type !== 'category') return;
    if (category.id === draggedItem.id) return;
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position = e.clientY < mid ? 'before' : 'after';
    setDropTarget({ id: category.id, position, type: 'category' });
  };

  const handleCategoryDrop = (e, targetCategory) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem || draggedItem.type !== 'category') { handleDragEnd(); return; }
    if (draggedItem.id === targetCategory.id) { handleDragEnd(); return; }

    const sorted = [...categories].sort((a, b) => a.position - b.position);
    const dragged = sorted.find(c => c.id === draggedItem.id);
    if (!dragged) { handleDragEnd(); return; }

    const filtered = sorted.filter(c => c.id !== draggedItem.id);
    const targetIdx = filtered.findIndex(c => c.id === targetCategory.id);
    const insertIdx = dropTarget?.position === 'after' ? targetIdx + 1 : targetIdx;
    filtered.splice(insertIdx, 0, dragged);

    const updates = filtered.map((c, i) => ({ id: c.id, position: i }));

    if (currentServer) {
      reorderCategories(currentServer.id, updates);
    }

    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  // Close context menus on outside click
  useEffect(() => {
    if (!serverContextMenu) return;
    const handler = () => setServerContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [serverContextMenu]);

  // Listen for voice_state_update socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleVoiceUpdate = ({ channelId, userId, username, avatar, action, selfMute, selfDeaf }) => {
      useStore.setState(s => {
        const current = s.voiceUsers[channelId] || [];
        if (action === 'leave') {
          return { voiceUsers: { ...s.voiceUsers, [channelId]: current.filter(u => u.user_id !== userId) } };
        }
        if (action === 'update') {
          return { voiceUsers: { ...s.voiceUsers, [channelId]: current.map(u => u.user_id === userId ? { ...u, self_mute: selfMute, self_deaf: selfDeaf } : u) } };
        }
        // action === 'join'
        const existing = current.find(u => u.user_id === userId);
        if (existing) {
          return { voiceUsers: { ...s.voiceUsers, [channelId]: current.map(u => u.user_id === userId ? { ...u, self_mute: selfMute || false, self_deaf: selfDeaf || false } : u) } };
        }
        return { voiceUsers: { ...s.voiceUsers, [channelId]: [...current, { user_id: userId, username, avatar, self_mute: selfMute || false, self_deaf: selfDeaf || false }] } };
      });
    };

    socket.on('voice_state_update', handleVoiceUpdate);
    return () => socket.off('voice_state_update', handleVoiceUpdate);
  }, []);

  // Fetch initial voice states for voice channels when server changes
  useEffect(() => {
    if (!currentServer) return;
    const voiceChannels = channels.filter(c => c.type === 'voice');
    voiceChannels.forEach(vc => {
      fetchVoiceStates(vc.id);
    });
  }, [currentServer?.id, channels.length]);

  const handleServerHeaderContextMenu = (e) => {
    e.preventDefault();
    setServerContextMenu({ x: e.clientX, y: e.clientY });
  };

  const userPanel = (
    <div className="user-panel" style={{ position: 'relative' }}>
      <div
        className="avatar"
        style={{ background: user?.banner_color || 'var(--brand-500)', position: 'relative', cursor: 'pointer' }}
        onClick={() => setShowStatusPicker(!showStatusPicker)}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          user?.username?.[0]?.toUpperCase()
        )}
        <div className="status-dot" style={{
          background: statusColor,
          position: 'absolute', bottom: -2, right: -2,
          width: 10, height: 10, borderRadius: '50%',
          border: '2px solid var(--bg-tertiary)',
        }} />
      </div>
      <div className="user-info">
        <div className="name">{user?.username}</div>
        <div className="tag">{user?.custom_status || `#${user?.discriminator}`}</div>
      </div>
      <div className="panel-buttons">
        <button className="panel-btn" onClick={toggleSettings} title="User Settings">⚙</button>
        {isHome && <button className="panel-btn" onClick={logout} title="Log Out">↪</button>}
      </div>
      {showStatusPicker && <StatusPicker onClose={() => setShowStatusPicker(false)} />}
    </div>
  );

  if (isHome) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <input
            className="form-input"
            placeholder="Find or start a conversation"
            style={{ height: 28, fontSize: 13, padding: '0 8px' }}
            readOnly
          />
        </div>
        <div className="dm-list">
          <div
            className={`dm-item ${!currentDm ? 'active' : ''}`}
            onClick={() => {
              useStore.setState({ currentDm: null, currentChannel: null });
              navigate('/channels/@me');
            }}
          >
            <div className="dm-avatar" style={{ background: 'var(--brand-500)', color: 'white' }}>👥</div>
            <div className="dm-name">Friends</div>
          </div>

          <div style={{ padding: '16px 8px 4px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--channel-icon)' }}>
            Direct Messages
          </div>

          {dmChannels.map(dm => {
            const member = dm.members?.[0];
            const unread = unreadChannels[dm.id];
            const avatarColor = `hsl(${(member?.id || dm.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;
            return (
              <div
                key={dm.id}
                className={`dm-item ${currentDm?.id === dm.id ? 'active' : ''}`}
                onClick={() => {
                  selectDm(dm);
                  navigate('/channels/@me');
                }}
              >
                <div className="dm-avatar" style={{ background: avatarColor, position: 'relative' }}>
                  {member?.avatar ? (
                    <img src={member.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    member?.username?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <div className="dm-name" style={unread ? { color: 'var(--header-primary)', fontWeight: 600 } : {}}>
                  {member?.username || 'Unknown'}
                </div>
                {unread && unread.count > 0 && (
                  <div style={{
                    minWidth: 16, height: 16, borderRadius: 8, background: 'var(--red-400)',
                    fontSize: 11, fontWeight: 700, color: 'white', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '0 4px', marginLeft: 'auto',
                  }}>
                    {unread.count}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {voiceChannel && <VoicePanel />}
        {userPanel}
      </div>
    );
  }

  // Server sidebar
  // Group channels by category
  const categorized = {};
  const uncategorized = [];
  for (const ch of channels) {
    if (ch.category_id) {
      if (!categorized[ch.category_id]) categorized[ch.category_id] = [];
      categorized[ch.category_id].push(ch);
    } else {
      uncategorized.push(ch);
    }
  }

  const channelClickHandler = (ch) => {
    if (ch.type === 'text' || ch.type === 'announcement') {
      selectChannel(ch);
    } else if (ch.type === 'voice') {
      // Toggle voice: if already in this channel, leave; otherwise join
      if (voiceChannel?.id === ch.id) {
        useStore.getState().leaveVoice();
      } else {
        joinVoice(ch.id);
      }
    }
  };

  return (
    <div className="sidebar">
      <div
        className="sidebar-header"
        onClick={toggleServerSettings}
        onContextMenu={handleServerHeaderContextMenu}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          {currentServer?.name || 'Server'}
          <ServerMuteIndicator serverId={currentServer?.id} />
        </span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>▼</span>
      </div>

      {serverContextMenu && currentServer && (
        <ServerContextMenu
          serverId={currentServer.id}
          x={serverContextMenu.x}
          y={serverContextMenu.y}
          onClose={() => setServerContextMenu(null)}
        />
      )}

      <SidebarEventsIndicator />

      <div className="channel-list">
        {/* Uncategorized channels */}
        {uncategorized
          .sort((a, b) => a.position - b.position)
          .map(ch => (
          <ChannelItem
            key={ch.id}
            channel={ch}
            active={currentChannel?.id === ch.id}
            onClick={() => channelClickHandler(ch)}
            isDragging={draggedItem?.type === 'channel' && draggedItem?.id === ch.id}
            dropTarget={dropTarget?.type === 'channel' && dropTarget?.id === ch.id ? dropTarget.position : null}
            onDragStart={(e) => handleChannelDragStart(e, ch)}
            onDragOver={(e) => handleChannelDragOver(e, ch)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleChannelDrop(e, ch)}
            canDrag={canManageChannels}
          />
        ))}

        {/* Categorized channels */}
        {[...categories].sort((a, b) => a.position - b.position).map(cat => (
          <div key={cat.id} className="category">
            <div
              className={`category-header ${draggedItem?.type === 'category' && draggedItem?.id === cat.id ? 'dragging' : ''} ${dropTarget?.type === 'category' && dropTarget?.id === cat.id ? 'drop-' + dropTarget.position : ''}`}
              onClick={() => toggleCategory(cat.id)}
              draggable={canManageChannels}
              onDragStart={(e) => handleCategoryDragStart(e, cat)}
              onDragOver={(e) => handleCategoryDragOver(e, cat)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleCategoryDrop(e, cat)}
              onDragLeave={() => {
                if (dropTarget?.type === 'category' && dropTarget?.id === cat.id) {
                  setDropTarget(null);
                }
              }}
            >
              <span className={`category-arrow ${collapsedCategories[cat.id] ? 'collapsed' : ''}`}>▼</span>
              {cat.name}
            </div>
            {!collapsedCategories[cat.id] && (categorized[cat.id] || [])
              .sort((a, b) => a.position - b.position)
              .map(ch => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  active={currentChannel?.id === ch.id}
                  onClick={() => channelClickHandler(ch)}
                  isDragging={draggedItem?.type === 'channel' && draggedItem?.id === ch.id}
                  dropTarget={dropTarget?.type === 'channel' && dropTarget?.id === ch.id ? dropTarget.position : null}
                  onDragStart={(e) => handleChannelDragStart(e, ch)}
                  onDragOver={(e) => handleChannelDragOver(e, ch)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleChannelDrop(e, ch)}
                  canDrag={canManageChannels}
                />
              ))}
          </div>
        ))}
      </div>

      {voiceChannel && <VoicePanel />}
      {userPanel}
    </div>
  );
}

// Small mute indicator next to server name
function ServerMuteIndicator({ serverId }) {
  const isServerMuted = useStore(s => s.isServerMuted);
  if (!serverId || !isServerMuted(serverId)) return null;
  return (
    <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }} title="Server muted">
      <BellSlashIcon size={14} />
    </span>
  );
}

// Server right-click context menu with notification settings
function ServerContextMenu({ serverId, x, y, onClose }) {
  const notificationSettings = useStore(s => s.notificationSettings);
  const updateNotificationSetting = useStore(s => s.updateNotificationSetting);
  const resetNotificationSetting = useStore(s => s.resetNotificationSetting);
  const isServerMuted = useStore(s => s.isServerMuted);
  const markServerAsRead = useStore(s => s.markServerAsRead);
  const [showNotifSettings, setShowNotifSettings] = useState(false);

  const serverSetting = notificationSettings[`server:${serverId}`] || {};
  const muted = isServerMuted(serverId);

  const handleToggleMute = async (e) => {
    e.stopPropagation();
    await updateNotificationSetting('server', serverId, { muted: !muted });
    onClose();
  };

  const handleNotifyLevel = async (level) => {
    await updateNotificationSetting('server', serverId, { notify_level: level });
    setShowNotifSettings(false);
    onClose();
  };

  const handleToggleSuppressEveryone = async () => {
    await updateNotificationSetting('server', serverId, {
      suppress_everyone: serverSetting.suppress_everyone ? 0 : 1,
    });
  };

  const handleToggleSuppressRoles = async () => {
    await updateNotificationSetting('server', serverId, {
      suppress_roles: serverSetting.suppress_roles ? 0 : 1,
    });
  };

  // Position the menu below cursor, adjusting if near edges
  const menuStyle = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 10000,
    background: 'var(--bg-floating)',
    borderRadius: 4,
    padding: '6px 0',
    minWidth: 200,
    boxShadow: '0 8px 16px rgba(0,0,0,0.24)',
    border: '1px solid var(--bg-tertiary)',
  };

  const itemStyle = {
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--text-normal)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <div style={menuStyle} onClick={e => e.stopPropagation()}>
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={(e) => {
          e.stopPropagation();
          markServerAsRead(serverId);
          onClose();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>Mark All as Read</span>
      </div>

      <div style={{ height: 1, background: 'var(--bg-modifier-accent)', margin: '4px 0' }} />

      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={handleToggleMute}
      >
        <BellSlashIcon size={16} />
        <span>{muted ? 'Unmute Server' : 'Mute Server'}</span>
      </div>

      <div style={{ height: 1, background: 'var(--bg-modifier-accent)', margin: '4px 0' }} />

      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={(e) => { e.stopPropagation(); setShowNotifSettings(!showNotifSettings); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        <span>Notification Settings</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>{showNotifSettings ? '▲' : '▼'}</span>
      </div>

      {showNotifSettings && (
        <div style={{ padding: '4px 12px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Notify Level
          </div>
          {[
            { value: 'all', label: 'All Messages' },
            { value: 'mentions', label: 'Only @mentions' },
            { value: 'nothing', label: 'Nothing' },
            { value: 'default', label: 'Default' },
          ].map(opt => (
            <div
              key={opt.value}
              style={{
                padding: '6px 8px', fontSize: 12, borderRadius: 3, cursor: 'pointer',
                color: (serverSetting.notify_level || 'default') === opt.value ? 'white' : 'var(--text-normal)',
                background: (serverSetting.notify_level || 'default') === opt.value ? 'var(--brand-500)' : 'transparent',
              }}
              onMouseEnter={e => {
                if ((serverSetting.notify_level || 'default') !== opt.value) e.currentTarget.style.background = 'var(--bg-modifier-hover)';
              }}
              onMouseLeave={e => {
                if ((serverSetting.notify_level || 'default') !== opt.value) e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => handleNotifyLevel(opt.value)}
            >
              {opt.label}
            </div>
          ))}

          <div style={{ height: 1, background: 'var(--bg-modifier-accent)', margin: '8px 0' }} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: 'var(--text-normal)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!serverSetting.suppress_everyone}
              onChange={handleToggleSuppressEveryone}
              style={{ accentColor: 'var(--brand-500)' }}
            />
            Suppress @everyone and @here
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: 'var(--text-normal)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!serverSetting.suppress_roles}
              onChange={handleToggleSuppressRoles}
              style={{ accentColor: 'var(--brand-500)' }}
            />
            Suppress all role @mentions
          </label>
        </div>
      )}
    </div>
  );
}

function ChannelItem({ channel, active, onClick, isDragging, dropTarget, onDragStart, onDragOver, onDragEnd, onDrop, canDrag }) {
  const voiceChannel = useStore(s => s.voiceChannel);
  const channelVoiceUsers = useStore(s => s.voiceUsers[channel.id]) || [];
  const unread = useStore(s => s.unreadChannels[channel.id]);
  const openChannelSettings = useStore(s => s.openChannelSettings);
  const currentServer = useStore(s => s.currentServer);
  const user = useStore(s => s.user);
  const isChannelMuted = useStore(s => s.isChannelMuted);
  const hasUnread = unread && unread.count > 0;
  const muted = isChannelMuted(channel.id);

  // Channel notification context menu
  const [contextMenu, setContextMenu] = useState(null);

  // Check if user is owner or has MANAGE_CHANNELS/MANAGE_ROLES
  const isOwner = currentServer?.owner_id === user?.id;
  const userPerms = BigInt(user?.permissions || '0');
  const canManage = isOwner || hasPermission(userPerms, PERMISSIONS.MANAGE_CHANNELS) || hasPermission(userPerms, PERMISSIONS.MANAGE_ROLES);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className={`channel-item ${active ? 'active' : ''} ${hasUnread ? 'unread' : ''} ${isDragging ? 'dragging' : ''} ${dropTarget === 'before' ? 'drop-before' : ''} ${dropTarget === 'after' ? 'drop-after' : ''}`}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        draggable={canDrag}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        style={{
          opacity: isDragging ? 0.4 : muted ? 0.4 : 1,
        }}
      >
        <span className="channel-icon">
          {channel.type === 'voice' ? (
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6 8.00004H3C2.447 8.00004 2 8.44704 2 9.00004V15C2 15.553 2.447 16 3 16H6L10.293 20.704C10.579 20.99 11.009 21.075 11.383 20.921C11.757 20.767 12 20.404 12 20V4.00004C12 3.59604 11.757 3.23304 11.383 3.07904Z"/><path fill="currentColor" d="M20.707 7.29304L19.293 8.70704L21.586 11L19.293 13.293L20.707 14.707L23 12.414L20.707 7.29304Z"/></svg>
          ) : channel.type === 'announcement' ? '📢' : (
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3504L15.4104 9H9.41045Z"/></svg>
          )}
        </span>
        <span className="channel-name">{channel.name}</span>
        {muted && (
          <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginLeft: 4 }} title="Muted">
            <BellSlashIcon size={12} />
          </span>
        )}
        {unread?.mentions > 0 && (
          <span style={{
            background: '#ED4245', color: 'white', borderRadius: 8,
            padding: '0 5px', fontSize: 11, fontWeight: 700, minWidth: 16,
            height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: 'auto', flexShrink: 0,
          }}>
            {unread.mentions}
          </span>
        )}
        {hasUnread && !active && !unread?.mentions && <div className="unread-badge" />}
        {(isOwner || canManage) && channel.server_id && (
          <span
            className="channel-settings-gear"
            onClick={(e) => {
              e.stopPropagation();
              openChannelSettings(channel.id);
            }}
            title="Edit Channel"
            style={{
              display: 'none',
              width: 16, height: 16,
              color: 'var(--channel-icon)',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: 'auto',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-normal)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--channel-icon)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
          </span>
        )}
      </div>
      {contextMenu && channel.server_id && (
        <ChannelContextMenu
          channelId={channel.id}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
      {channel.type === 'voice' && channelVoiceUsers.length > 0 && (
        <div className="voice-users">
          {channelVoiceUsers.map(vu => {
            const avatarColor = `hsl(${(vu.user_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;
            return (
              <div key={vu.user_id} className="voice-user-item">
                <div className="voice-user-avatar" style={{ background: avatarColor }}>
                  {vu.avatar ? (
                    <img src={vu.avatar} alt="" />
                  ) : (
                    vu.username?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <span className="voice-user-name">{vu.username}</span>
                <div className="voice-user-icons">
                  {vu.self_mute && <MicOffSmall />}
                  {vu.self_deaf && <HeadphoneOffSmall />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Channel right-click context menu with notification options
function ChannelContextMenu({ channelId, x, y, onClose }) {
  const notificationSettings = useStore(s => s.notificationSettings);
  const updateNotificationSetting = useStore(s => s.updateNotificationSetting);
  const isChannelMuted = useStore(s => s.isChannelMuted);
  const unreadChannels = useStore(s => s.unreadChannels);
  const ackChannel = useStore(s => s.ackChannel);
  const [showNotifLevel, setShowNotifLevel] = useState(false);

  const channelSetting = notificationSettings[`channel:${channelId}`] || {};
  const muted = isChannelMuted(channelId);
  const hasUnread = unreadChannels[channelId]?.count > 0;

  const handleToggleMute = async (e) => {
    e.stopPropagation();
    await updateNotificationSetting('channel', channelId, { muted: !muted });
    onClose();
  };

  const handleNotifyLevel = async (level) => {
    await updateNotificationSetting('channel', channelId, { notify_level: level });
    setShowNotifLevel(false);
    onClose();
  };

  const menuStyle = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 10000,
    background: 'var(--bg-floating)',
    borderRadius: 4,
    padding: '6px 0',
    minWidth: 180,
    boxShadow: '0 8px 16px rgba(0,0,0,0.24)',
    border: '1px solid var(--bg-tertiary)',
  };

  const itemStyle = {
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--text-normal)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <div style={menuStyle} onClick={e => e.stopPropagation()}>
      {hasUnread && (
        <>
          <div
            style={itemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={(e) => {
              e.stopPropagation();
              const lastMsgId = unreadChannels[channelId]?.lastMessageId;
              if (lastMsgId) ackChannel(channelId, lastMsgId);
              onClose();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>Mark as Read</span>
          </div>
          <div style={{ height: 1, background: 'var(--bg-modifier-accent)', margin: '4px 0' }} />
        </>
      )}
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={handleToggleMute}
      >
        <BellSlashIcon size={16} />
        <span>{muted ? 'Unmute Channel' : 'Mute Channel'}</span>
      </div>

      <div style={{ height: 1, background: 'var(--bg-modifier-accent)', margin: '4px 0' }} />

      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={(e) => { e.stopPropagation(); setShowNotifLevel(!showNotifLevel); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        <span>Notification Override</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>{showNotifLevel ? '▲' : '▼'}</span>
      </div>

      {showNotifLevel && (
        <div style={{ padding: '4px 12px 8px' }}>
          {[
            { value: 'default', label: 'Use Server Default' },
            { value: 'all', label: 'All Messages' },
            { value: 'mentions', label: 'Only @mentions' },
            { value: 'nothing', label: 'Nothing' },
          ].map(opt => (
            <div
              key={opt.value}
              style={{
                padding: '6px 8px', fontSize: 12, borderRadius: 3, cursor: 'pointer',
                color: (channelSetting.notify_level || 'default') === opt.value ? 'white' : 'var(--text-normal)',
                background: (channelSetting.notify_level || 'default') === opt.value ? 'var(--brand-500)' : 'transparent',
              }}
              onMouseEnter={e => {
                if ((channelSetting.notify_level || 'default') !== opt.value) e.currentTarget.style.background = 'var(--bg-modifier-hover)';
              }}
              onMouseLeave={e => {
                if ((channelSetting.notify_level || 'default') !== opt.value) e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => handleNotifyLevel(opt.value)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarEventsIndicator() {
  const serverEvents = useStore(s => s.serverEvents);
  const toggleEventsPanel = useStore(s => s.toggleEventsPanel);

  // Filter to upcoming scheduled/active events
  const now = new Date();
  const upcoming = serverEvents.filter(e =>
    (e.status === 'scheduled' || e.status === 'active') &&
    new Date(e.end_time || e.start_time) >= now
  );

  if (upcoming.length === 0) return null;

  const nextEvent = upcoming.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
  const nextDate = new Date(nextEvent.start_time);
  const isToday = nextDate.toDateString() === now.toDateString();
  const isTomorrow = nextDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();

  let timeLabel;
  if (nextEvent.status === 'active') {
    timeLabel = 'Happening now';
  } else if (isToday) {
    timeLabel = `Today at ${nextDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (isTomorrow) {
    timeLabel = `Tomorrow at ${nextDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else {
    timeLabel = nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div
      onClick={toggleEventsPanel}
      style={{
        padding: '8px 12px', margin: '0 8px 4px',
        background: 'var(--bg-secondary)', borderRadius: 4,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-active)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="var(--text-muted)" strokeWidth="2"/>
          <path d="M3 10h18" stroke="var(--text-muted)" strokeWidth="2"/>
          <path d="M8 2v4M16 2v4" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-normal)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {nextEvent.name}
        </span>
        {upcoming.length > 1 && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
            background: 'var(--bg-tertiary)', borderRadius: 8,
            padding: '0 5px', height: 16, display: 'flex',
            alignItems: 'center', flexShrink: 0,
          }}>
            +{upcoming.length - 1}
          </span>
        )}
      </div>
      <div style={{
        fontSize: 11, color: nextEvent.status === 'active' ? '#57F287' : 'var(--text-muted)',
        marginTop: 2,
        fontWeight: nextEvent.status === 'active' ? 600 : 400,
      }}>
        {timeLabel}
      </div>
    </div>
  );
}
