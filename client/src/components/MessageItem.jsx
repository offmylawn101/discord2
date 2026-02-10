import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';
import { renderMarkdown } from '../utils/markdown';
import { api } from '../utils/api';
import EmojiPicker from './EmojiPicker';
import UserProfilePopup from './UserProfilePopup';
import ImageLightbox from './ImageLightbox';
import ContextMenu from './ContextMenu';

export default function MessageItem({
  message, showHeader, isEditing, editContent, setEditContent,
  onEditSave, onEditCancel, onEdit, onReply, currentUserId,
  bulkSelectMode, isSelected, onMessageSelect,
  onJumpToMessage, isHighlighted, compact,
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showProfile, setShowProfile] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [editHistory, setEditHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const editHistoryRef = useRef(null);
  const [reactionPopover, setReactionPopover] = useState(null);
  const [loadingReactors, setLoadingReactors] = useState(false);
  const reactionHoverTimeout = useRef(null);
  const { addReaction, removeReaction, deleteMessage, pinMessage, unpinMessage, currentChannel, toggleBookmark, isBookmarked } = useStore();
  const bookmarked = useStore(s => s.bookmarks.some(b => b.message_id === message.id));

  useEffect(() => {
    if (showEditHistory && editHistory.length === 0) {
      setLoadingHistory(true);
      api.get(`/messages/${message.channel_id}/messages/${message.id}/edits`)
        .then(edits => {
          setEditHistory(edits);
          setLoadingHistory(false);
        })
        .catch(() => setLoadingHistory(false));
    }
  }, [showEditHistory]);

  useEffect(() => {
    if (!showEditHistory) return;
    const handleClickOutside = (e) => {
      if (editHistoryRef.current && !editHistoryRef.current.contains(e.target)) {
        setShowEditHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEditHistory]);
  useEffect(() => {
    return () => clearTimeout(reactionHoverTimeout.current);
  }, []);

  const embeds = useStore(s => s.messageEmbeds[message.id]);

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

  const handlePin = async () => {
    const socket = getSocket();
    if (message.pinned) {
      await unpinMessage(currentChannel.id, message.id);
      socket?.emit('message_unpin', { channelId: currentChannel.id, messageId: message.id });
    } else {
      await pinMessage(currentChannel.id, message.id);
      socket?.emit('message_pin', { channelId: currentChannel.id, messageId: message.id });
    }
  };

  const handleBookmark = async () => {
    try {
      await toggleBookmark(message.id);
    } catch (err) {
      console.error('Bookmark error:', err);
    }
  };

  const handleBulkClick = (e) => {
    if (bulkSelectMode && onMessageSelect) {
      e.preventDefault();
      e.stopPropagation();
      onMessageSelect(message.id, e.shiftKey);
    }
  };

  const handleReactionHover = async (e, reaction) => {
    clearTimeout(reactionHoverTimeout.current);
    const target = e.currentTarget;
    reactionHoverTimeout.current = setTimeout(async () => {
      const rect = target.getBoundingClientRect();
      setLoadingReactors(true);
      setReactionPopover({ emoji: reaction.emoji, users: [], x: rect.left, y: rect.top - 8 });
      try {
        const users = await api.get(`/messages/${message.channel_id}/messages/${message.id}/reactions/${encodeURIComponent(reaction.emoji)}`);
        setReactionPopover(prev => prev?.emoji === reaction.emoji ? { ...prev, users } : prev);
      } catch {}
      setLoadingReactors(false);
    }, 300);
  };

  const handleReactionLeave = () => {
    clearTimeout(reactionHoverTimeout.current);
    reactionHoverTimeout.current = setTimeout(() => {
      setReactionPopover(null);
    }, 200);
  };

  const handleContextMenu = (e) => {
    if (bulkSelectMode) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const items = [
      { label: 'Reply', icon: '↩', action: () => onReply(message) },
      { label: 'Add Reaction', icon: '😀', action: () => setShowEmoji(true) },
      { label: 'Copy Text', icon: '📋', action: () => navigator.clipboard.writeText(message.content) },
      { label: 'Copy Message ID', icon: '#', action: () => navigator.clipboard.writeText(message.id) },
      { separator: true },
      { label: message.pinned ? 'Unpin Message' : 'Pin Message', icon: '📌', action: handlePin },
      { label: bookmarked ? 'Remove Bookmark' : 'Bookmark Message', icon: '🔖', action: handleBookmark },
    ];
    if (message.author_id === currentUserId) {
      items.push({ separator: true });
      items.push({ label: 'Edit Message', icon: '✏', action: () => onEdit(message) });
      items.push({ label: 'Delete Message', icon: '🗑', danger: true, action: handleDelete });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleAvatarClick = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setShowProfile({ x: rect.right + 8, y: rect.top });
  };

  const handleCreateThread = async () => {
    const { createThread, currentChannel } = useStore.getState();
    if (currentChannel) {
      const threadName = message.content?.slice(0, 40) || 'Thread';
      await createThread(currentChannel.id, message.id, threadName);
    }
  };

  const handleOpenThread = () => {
    const { openThread } = useStore.getState();
    openThread({ id: message.thread_id, parent_message_id: message.id, channel_id: message.channel_id });
  };

  const avatarColor = `hsl(${(message.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;

  return (
    <div
      id={`message-${message.id}`}
      className={`message-group ${showHeader ? 'has-header' : ''} ${compact ? 'compact' : ''} ${bulkSelectMode ? 'bulk-select-active' : ''} ${isSelected ? 'bulk-selected' : ''} ${isHighlighted ? 'message-highlighted' : ''}`}
      data-message-id={message.id}
      onContextMenu={handleContextMenu}
      onClick={handleBulkClick}
      style={bulkSelectMode ? { cursor: 'pointer' } : undefined}
    >
      {bulkSelectMode && (
        <div className="bulk-checkbox-container" style={{
          width: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: -8,
        }}>
          <div className="bulk-checkbox" style={{
            width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isSelected ? '#5865F2' : 'transparent',
            borderColor: isSelected ? '#5865F2' : 'var(--text-muted)',
            transition: 'all 0.15s ease',
          }}>
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>
      )}
      {compact ? (
        <span className="compact-timestamp">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ) : showHeader ? (
        <div className="message-avatar" style={{ background: avatarColor }} onClick={bulkSelectMode ? undefined : handleAvatarClick}>
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
          <div className="message-reply-ref" onClick={() => onJumpToMessage?.(message.referenced_message.id)} style={{ cursor: 'pointer' }}>
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

        {(showHeader || compact) && (
          <div className="message-header" style={compact ? { display: 'inline' } : undefined}>
            <span className="author" style={{ color: avatarColor, fontSize: compact ? 13 : undefined }} onClick={handleAvatarClick}>
              {message.nickname || message.username}
            </span>
            {message.nickname && !compact && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4, fontWeight: 400 }} title={`${message.username}#${message.discriminator}`}>
                {message.username}
              </span>
            )}
            {!compact && <span className="timestamp">{formatTime(message.created_at)}</span>}
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
        ) : message.type === 'poll' ? (
          <div className="message-content" style={{ position: 'relative' }}>
            {/* Poll content is shown in the PollDisplay component below */}
          </div>
        ) : (
          <div className="message-content" style={{ position: 'relative' }}>
            {renderMarkdown(message.content)}
            {message.edited_at && (
              <span
                className="message-edited"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEditHistory(!showEditHistory);
                  setEditHistory([]);
                }}
                title={`Last edited: ${new Date(message.edited_at).toLocaleString()}`}
              >
                {' '}(edited)
              </span>
            )}
            {showEditHistory && (
              <div className="edit-history-popup" ref={editHistoryRef}>
                <div className="edit-history-header">
                  <span>Edit History</span>
                  <button onClick={() => setShowEditHistory(false)}>&times;</button>
                </div>
                {loadingHistory ? (
                  <div className="edit-history-loading">Loading...</div>
                ) : editHistory.length === 0 ? (
                  <div className="edit-history-empty">No edit history available</div>
                ) : (
                  <div className="edit-history-list">
                    <div className="edit-history-item current">
                      <div className="edit-history-timestamp">Current version</div>
                      <div className="edit-history-content">{message.content}</div>
                    </div>
                    {editHistory.map(edit => (
                      <div key={edit.id} className="edit-history-item">
                        <div className="edit-history-timestamp">
                          {new Date(edit.edited_at).toLocaleString()}
                        </div>
                        <div className="edit-history-content">{edit.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Poll display */}
        {message.type === 'poll' && message.poll && (
          <PollDisplay poll={message.poll} messageId={message.id} />
        )}

        {/* Thread indicator */}
        {message.thread_id && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
              padding: '4px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text-link)',
              fontWeight: 500,
            }}
            onClick={handleOpenThread}
          >
            <span style={{ fontSize: 14 }}>&#x1F9F5;</span>
            <span>View Thread</span>
          </div>
        )}

        {/* Attachments */}
        {message.attachments?.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map(att => {
              if (att.content_type?.startsWith('image/')) {
                const allImages = message.attachments
                  ?.filter(a => a.content_type?.startsWith('image/'))
                  .map(a => ({ src: `/uploads/${a.filepath}`, filename: a.filename })) || [];
                const clickedIndex = allImages.findIndex(img => img.src === `/uploads/${att.filepath}`);
                return (
                  <img
                    key={att.id}
                    src={`/uploads/${att.filepath}`}
                    alt={att.filename}
                    onClick={() => setLightboxImage({ src: `/uploads/${att.filepath}`, filename: att.filename, images: allImages, initialIndex: clickedIndex })}
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

        {/* Link Embeds */}
        {embeds && embeds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {embeds.map((embed, idx) => (
              <div key={idx} style={{
                borderLeft: `4px solid ${embed.color || '#5865F2'}`,
                borderRadius: 4, background: 'var(--bg-secondary)',
                padding: 12, maxWidth: 520,
              }}>
                {embed.siteName && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {embed.favicon && <img src={embed.favicon} alt="" style={{ width: 16, height: 16, borderRadius: 2 }} onError={e => e.target.style.display='none'} />}
                    {embed.siteName}
                  </div>
                )}
                {embed.title && (
                  <a href={embed.url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'block', color: 'var(--text-link)', fontWeight: 600,
                    fontSize: 15, marginBottom: 4, textDecoration: 'none',
                  }}>
                    {embed.title}
                  </a>
                )}
                {embed.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-normal)', lineHeight: 1.4, marginBottom: embed.image ? 8 : 0 }}>
                    {embed.description}
                  </div>
                )}
                {embed.image && embed.type !== 'image' && (
                  <img
                    src={embed.image}
                    alt=""
                    style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4, marginTop: 4 }}
                    onError={e => e.target.style.display='none'}
                  />
                )}
                {embed.type === 'image' && (
                  <img
                    src={embed.image}
                    alt=""
                    style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4 }}
                    onError={e => e.target.style.display='none'}
                  />
                )}
                {!embed.siteName && embed.domain && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {embed.domain}
                  </div>
                )}
              </div>
            ))}
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
                onMouseEnter={(e) => handleReactionHover(e, r)}
                onMouseLeave={handleReactionLeave}
                title={r.me ? (r.count > 1 ? `You and ${r.count - 1} other${r.count > 2 ? 's' : ''}` : 'You reacted') : `${r.count} reaction${r.count > 1 ? 's' : ''}`}
              >
                <span className="reaction-emoji">{r.emoji}</span>
                <span className="reaction-count">{r.count}</span>
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
            {reactionPopover && (
              <div
                className="reaction-popover"
                style={{ left: reactionPopover.x, top: reactionPopover.y }}
                onMouseEnter={() => clearTimeout(reactionHoverTimeout.current)}
                onMouseLeave={() => setReactionPopover(null)}
              >
                <div className="reaction-popover-header">
                  <span className="reaction-popover-emoji">{reactionPopover.emoji}</span>
                  <span className="reaction-popover-count">{reactionPopover.users.length || ''}</span>
                </div>
                <div className="reaction-popover-users">
                  {loadingReactors ? (
                    <div className="reaction-popover-loading">Loading...</div>
                  ) : (
                    reactionPopover.users.map(u => (
                      <div key={u.id} className="reaction-popover-user">
                        <div className="reaction-popover-avatar" style={{
                          background: `hsl(${u.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`
                        }}>
                          {u.avatar ? <img src={u.avatar} alt="" /> : u.username?.[0]?.toUpperCase()}
                        </div>
                        <span>{u.username}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message actions toolbar - hidden during bulk select */}
      {!bulkSelectMode && (
        <div className="message-actions">
          {/* Quick Reactions */}
          <div className="quick-reactions">
            {(JSON.parse(localStorage.getItem('recentEmojis') || '[]').length > 0
              ? JSON.parse(localStorage.getItem('recentEmojis') || '[]').slice(0, 6)
              : ['👍', '❤️', '😂', '😮', '😢', '🔥']
            ).map((emoji, i) => (
              <button
                key={i}
                className="quick-reaction-btn"
                onClick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="quick-reactions-divider" />
          <button className="message-action-btn" onClick={() => setShowEmoji(!showEmoji)} title="Add Reaction">😀</button>
          <button className="message-action-btn" onClick={() => onReply(message)} title="Reply">↩</button>
          <button className="message-action-btn" onClick={handlePin} title={message.pinned ? 'Unpin Message' : 'Pin Message'} style={message.pinned ? { color: 'var(--brand-500)' } : {}}>📌</button>
          <button className="message-action-btn" onClick={handleBookmark} title={bookmarked ? 'Remove Bookmark' : 'Bookmark Message'} style={bookmarked ? { color: '#faa81a' } : {}}>🔖</button>
          {!message.thread_id && (
            <button className="message-action-btn" onClick={handleCreateThread} title="Create Thread">&#x1F9F5;</button>
          )}
          {message.thread_id && (
            <button className="message-action-btn" onClick={handleOpenThread} title="View Thread">&#x1F9F5;</button>
          )}
          {message.author_id === currentUserId && (
            <button className="message-action-btn" onClick={() => onEdit(message)} title="Edit">✏</button>
          )}
          {message.author_id === currentUserId && (
            <button className="message-action-btn" onClick={handleDelete} title="Delete">🗑</button>
          )}
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div style={{ position: 'absolute', top: -16, right: 16, zIndex: 200 }}>
          <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmoji(false)} />
        </div>
      )}

      {/* Profile popup */}
      {showProfile && (
        <UserProfilePopup
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
          images={lightboxImage.images}
          initialIndex={lightboxImage.initialIndex}
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

function PollDisplay({ poll, messageId }) {
  const { votePoll, updatePollInMessage } = useStore();
  const [voting, setVoting] = React.useState(null);

  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);

  const handleVote = async (optionId) => {
    if (voting) return;
    setVoting(optionId);
    try {
      const updatedPoll = await votePoll(poll.id, optionId);
      updatePollInMessage(messageId, updatedPoll);
    } catch (err) {
      console.error('Vote error:', err);
    }
    setVoting(null);
  };

  return (
    <div className="poll-display">
      <div className="poll-question">
        <span className="poll-icon">📊</span>
        {poll.question}
      </div>
      <div className="poll-options">
        {poll.options.map((option) => {
          const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
          const isVoted = option.voted;
          return (
            <div
              key={option.id}
              className={`poll-option ${isVoted ? 'voted' : ''} ${voting === option.id ? 'voting' : ''}`}
              onClick={() => handleVote(option.id)}
            >
              <div className="poll-option-fill" style={{ width: `${percentage}%` }} />
              <div className="poll-option-content">
                <span className="poll-option-text">
                  {isVoted && <span className="poll-check">&#10003;</span>}
                  {option.text}
                </span>
                <span className="poll-option-percent">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="poll-footer">
        <span className="poll-vote-count">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
        {poll.allows_multiple && <span className="poll-multi-badge">Multiple choice</span>}
      </div>
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
