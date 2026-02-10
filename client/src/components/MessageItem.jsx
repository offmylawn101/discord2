import React, { useState } from 'react';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';
import { renderMarkdown } from '../utils/markdown';
import EmojiPicker from './EmojiPicker';
import ProfileCard from './ProfileCard';
import ImageLightbox from './ImageLightbox';
import ContextMenu from './ContextMenu';

export default function MessageItem({
  message, showHeader, isEditing, editContent, setEditContent,
  onEditSave, onEditCancel, onEdit, onReply, currentUserId,
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showProfile, setShowProfile] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const { addReaction, removeReaction, deleteMessage, currentChannel } = useStore();

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today at ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
    return `${d.toLocaleDateString()} ${time}`;
  };

  const handleReaction = async (emoji) => {
    const existing = message.reactions?.find(r => r.emoji === emoji && r.me);
    const socket = getSocket();
    if (existing) {
      await removeReaction(currentChannel.id, message.id, emoji);
      socket?.emit('reaction_remove', { channelId: currentChannel.id, messageId: message.id, emoji });
    } else {
      await addReaction(currentChannel.id, message.id, emoji);
      socket?.emit('reaction_add', { channelId: currentChannel.id, messageId: message.id, emoji });
    }
    setShowEmoji(false);
  };

  const handleDelete = async () => {
    const socket = getSocket();
    await deleteMessage(currentChannel.id, message.id);
    socket?.emit('message_delete', { channelId: currentChannel.id, messageId: message.id });
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    const items = [
      { label: 'Reply', icon: '↩', action: () => onReply(message) },
      { label: 'Add Reaction', icon: '😀', action: () => setShowEmoji(true) },
      { label: 'Copy Text', icon: '📋', action: () => navigator.clipboard.writeText(message.content) },
      { label: 'Copy Message ID', icon: '#', action: () => navigator.clipboard.writeText(message.id) },
    ];
    if (message.author_id === currentUserId) {
      items.push({ separator: true });
      items.push({ label: 'Edit Message', icon: '✏', action: () => onEdit(message) });
      items.push({ label: 'Delete Message', icon: '🗑', danger: true, action: handleDelete });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleAvatarClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setShowProfile({ x: rect.right + 8, y: rect.top, anchorLeft: rect.left });
  };

  const avatarColor = `hsl(${(message.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;

  return (
    <div
      className={`message-group ${showHeader ? 'has-header' : ''}`}
      data-message-id={message.id}
      onContextMenu={handleContextMenu}
    >
      {showHeader ? (
        <div className="message-avatar" style={{ background: avatarColor }} onClick={handleAvatarClick}>
          {message.avatar ? (
            <img src={message.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          ) : (
            message.username?.[0]?.toUpperCase() || '?'
          )}
        </div>
      ) : (
        <div style={{ width: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="message-compact-time" style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0, transition: 'opacity 0.1s' }}>
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      <div className="message-body">
        {/* Reply reference */}
        {message.referenced_message && (
          <div className="message-reply-ref">
            <span style={{ fontSize: 16 }}>↩</span>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              background: `hsl(${(message.referenced_message.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700,
            }}>
              {message.referenced_message.username?.[0]?.toUpperCase()}
            </div>
            <span className="reply-author">{message.referenced_message.username}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.referenced_message.content?.slice(0, 80)}
            </span>
          </div>
        )}

        {showHeader && (
          <div className="message-header">
            <span className="author" style={{ color: avatarColor }} onClick={handleAvatarClick}>{message.username}</span>
            <span className="timestamp">{formatTime(message.created_at)}</span>
          </div>
        )}

        {isEditing ? (
          <div>
            <textarea
              className="form-input"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave(); }
                if (e.key === 'Escape') onEditCancel();
              }}
              style={{ minHeight: 40, fontSize: 15, resize: 'vertical' }}
              autoFocus
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              escape to <span style={{ color: 'var(--text-link)', cursor: 'pointer' }} onClick={onEditCancel}>cancel</span> · enter to <span style={{ color: 'var(--text-link)', cursor: 'pointer' }} onClick={onEditSave}>save</span>
            </div>
          </div>
        ) : (
          <div className="message-content">
            {renderMarkdown(message.content)}
            {message.edited_at && <span className="edited"> (edited)</span>}
          </div>
        )}

        {/* Attachments */}
        {message.attachments?.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map(att => {
              if (att.content_type?.startsWith('image/')) {
                return (
                  <img
                    key={att.id}
                    src={`/uploads/${att.filepath}`}
                    alt={att.filename}
                    onClick={() => setLightboxImage({ src: `/uploads/${att.filepath}`, filename: att.filename })}
                  />
                );
              }
              if (att.content_type?.startsWith('video/')) {
                return (
                  <video key={att.id} controls style={{ maxWidth: 400, maxHeight: 300, borderRadius: 8 }}>
                    <source src={`/uploads/${att.filepath}`} type={att.content_type} />
                  </video>
                );
              }
              if (att.content_type?.startsWith('audio/')) {
                return (
                  <div key={att.id} className="message-attachment-file">
                    <div>
                      <div className="filename">{att.filename}</div>
                      <audio controls style={{ marginTop: 4 }}>
                        <source src={`/uploads/${att.filepath}`} type={att.content_type} />
                      </audio>
                    </div>
                  </div>
                );
              }
              return (
                <div key={att.id} className="message-attachment-file">
                  <div style={{ fontSize: 28, marginRight: 4 }}>📄</div>
                  <div>
                    <div className="filename">
                      <a href={`/uploads/${att.filepath}`} target="_blank" rel="noopener">{att.filename}</a>
                    </div>
                    <div className="filesize">{formatFileSize(att.size)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="message-reactions">
            {message.reactions.map(r => (
              <button
                key={r.emoji}
                className={`reaction ${r.me ? 'me' : ''}`}
                onClick={() => handleReaction(r.emoji)}
                title={`${r.count} reaction${r.count !== 1 ? 's' : ''}`}
              >
                <span>{r.emoji}</span>
                <span className="count">{r.count}</span>
              </button>
            ))}
            <button
              className="reaction"
              onClick={() => setShowEmoji(!showEmoji)}
              style={{ opacity: 0.5, fontSize: 12 }}
              title="Add Reaction"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Message actions toolbar */}
      <div className="message-actions">
        <button className="message-action-btn" onClick={() => setShowEmoji(!showEmoji)} title="Add Reaction">😀</button>
        <button className="message-action-btn" onClick={() => onReply(message)} title="Reply">↩</button>
        {message.author_id === currentUserId && (
          <button className="message-action-btn" onClick={() => onEdit(message)} title="Edit">✏</button>
        )}
        {message.author_id === currentUserId && (
          <button className="message-action-btn" onClick={handleDelete} title="Delete">🗑</button>
        )}
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div style={{ position: 'absolute', top: -16, right: 16, zIndex: 200 }}>
          <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmoji(false)} />
        </div>
      )}

      {/* Profile card */}
      {showProfile && (
        <ProfileCard
          userId={message.author_id}
          position={showProfile}
          onClose={() => setShowProfile(null)}
        />
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          filename={lightboxImage.filename}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}
