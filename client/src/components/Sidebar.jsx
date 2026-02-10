import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';
import { PERMISSIONS, hasPermission } from '../utils/permissions';
import VoicePanel from './VoicePanel';
import StatusPicker from './StatusPicker';

export default function Sidebar({ isHome }) {
  const {
    user, currentServer, channels, categories, currentChannel,
    dmChannels, currentDm, selectChannel, selectDm,
    toggleServerSettings, toggleSettings, logout,
    voiceChannel, unreadChannels, reorderChannels,
  } = useStore();
  const navigate = useNavigate();
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [dragChannelId, setDragChannelId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, position: 'above' | 'below' }

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

  // Drag handlers
  const handleDragStart = (e, channel) => {
    setDragChannelId(channel.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', channel.id);
  };

  const handleDragOver = (e, channel) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (channel.id === dragChannelId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';
    setDropTarget({ id: channel.id, position });
  };

  const handleDragEnd = () => {
    setDragChannelId(null);
    setDropTarget(null);
  };

  const handleDrop = (e, targetChannel) => {
    e.preventDefault();
    const draggedId = dragChannelId;
    if (!draggedId || draggedId === targetChannel.id) {
      handleDragEnd();
      return;
    }

    const draggedChannel = channels.find(c => c.id === draggedId);
    if (!draggedChannel) { handleDragEnd(); return; }

    // Get channels in the same category as the target
    const targetCatId = targetChannel.category_id || null;
    const sameCatChannels = channels
      .filter(c => (c.category_id || null) === targetCatId && c.id !== draggedId)
      .sort((a, b) => a.position - b.position);

    // Insert dragged channel at the right position
    const targetIdx = sameCatChannels.findIndex(c => c.id === targetChannel.id);
    const insertIdx = dropTarget?.position === 'above' ? targetIdx : targetIdx + 1;
    sameCatChannels.splice(insertIdx, 0, { ...draggedChannel, category_id: targetCatId });

    // Build position updates
    const updates = sameCatChannels.map((ch, i) => ({
      id: ch.id,
      position: i,
      category_id: targetCatId,
    }));

    if (currentServer) {
      reorderChannels(currentServer.id, updates);
    }

    handleDragEnd();
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
      handleVoiceClick(ch);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header" onClick={toggleServerSettings}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentServer?.name || 'Server'}
        </span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>▼</span>
      </div>

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
            isDragging={dragChannelId === ch.id}
            dropTarget={dropTarget?.id === ch.id ? dropTarget.position : null}
            onDragStart={(e) => handleDragStart(e, ch)}
            onDragOver={(e) => handleDragOver(e, ch)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, ch)}
          />
        ))}

        {/* Categorized channels */}
        {categories.map(cat => (
          <div key={cat.id} className="category">
            <div className="category-header" onClick={() => toggleCategory(cat.id)}>
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
                  isDragging={dragChannelId === ch.id}
                  dropTarget={dropTarget?.id === ch.id ? dropTarget.position : null}
                  onDragStart={(e) => handleDragStart(e, ch)}
                  onDragOver={(e) => handleDragOver(e, ch)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, ch)}
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

function handleVoiceClick(channel) {
  const socket = getSocket();
  const state = useStore.getState();

  if (state.voiceChannel?.id === channel.id) {
    socket?.emit('voice_leave', { channelId: channel.id });
    state.setVoiceChannel(null);
    state.setVoiceParticipants([]);
  } else {
    if (state.voiceChannel) {
      socket?.emit('voice_leave', { channelId: state.voiceChannel.id });
    }
    state.setVoiceChannel(channel);
    state.setVoiceState({ selfMute: false, selfDeaf: false });
    socket?.emit('voice_join', { channelId: channel.id, serverId: channel.server_id });
  }
}

function ChannelItem({ channel, active, onClick, isDragging, dropTarget, onDragStart, onDragOver, onDragEnd, onDrop }) {
  const voiceChannel = useStore(s => s.voiceChannel);
  const voiceParticipants = useStore(s => s.voiceParticipants);
  const unread = useStore(s => s.unreadChannels[channel.id]);
  const openChannelSettings = useStore(s => s.openChannelSettings);
  const currentServer = useStore(s => s.currentServer);
  const user = useStore(s => s.user);
  const isVoiceActive = channel.type === 'voice' && voiceChannel?.id === channel.id;
  const hasUnread = unread && unread.count > 0;

  // Check if user is owner or has MANAGE_CHANNELS/MANAGE_ROLES
  const isOwner = currentServer?.owner_id === user?.id;
  const userPerms = BigInt(user?.permissions || '0');
  const canManage = isOwner || hasPermission(userPerms, PERMISSIONS.MANAGE_CHANNELS) || hasPermission(userPerms, PERMISSIONS.MANAGE_ROLES);

  return (
    <>
      <div
        className={`channel-item ${active ? 'active' : ''} ${hasUnread ? 'unread' : ''} ${isDragging ? 'dragging' : ''}`}
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        style={{
          opacity: isDragging ? 0.4 : 1,
          borderTop: dropTarget === 'above' ? '2px solid var(--brand-500)' : undefined,
          borderBottom: dropTarget === 'below' ? '2px solid var(--brand-500)' : undefined,
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
      {isVoiceActive && voiceParticipants.length > 0 && (
        <div className="voice-users">
          {voiceParticipants.map(p => (
            <div key={p.userId} className="voice-user">
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ opacity: 0.6 }}>
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
              </svg>
              <span>{p.username}</span>
              {p.selfMute && <span title="Muted" style={{ fontSize: 12, opacity: 0.6 }}>🔇</span>}
              {p.selfDeaf && <span title="Deafened" style={{ fontSize: 12, opacity: 0.6 }}>🔈</span>}
            </div>
          ))}
        </div>
      )}
    </>
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
