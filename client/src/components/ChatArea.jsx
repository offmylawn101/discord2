import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';
import { api } from '../utils/api';
import MessageItem from './MessageItem';
import SearchBar from './SearchBar';
import PinnedMessages from './PinnedMessages';

export default function ChatArea() {
  const {
    currentChannel, messages, loadingMessages, sendMessage,
    replyingTo, setReplyingTo, user, typingUsers, toggleInviteModal,
  } = useStore();
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeout = useRef(null);
  const isAtBottom = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
    }
  }, []);

  // Auto-scroll on new messages if we're at bottom
  useEffect(() => {
    if (isAtBottom.current) {
      scrollToBottom(false);
    }
  }, [messages.length]);

  // Reset on channel change
  useEffect(() => {
    setContent('');
    setFiles([]);
    setEditingId(null);
    setHasMore(true);
    isAtBottom.current = true;
    setTimeout(() => scrollToBottom(false), 100);
  }, [currentChannel?.id]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    const threshold = 100;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    // Infinite scroll - load more when scrolled to top
    if (el.scrollTop < 50 && !loadingMore && hasMore && messages.length > 0) {
      loadOlderMessages();
    }
  }, [loadingMore, hasMore, messages]);

  const loadOlderMessages = async () => {
    if (!currentChannel || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestMsg = messages[0];
      const olderMsgs = await api.get(`/${currentChannel.id}/messages?before=${oldestMsg.id}&limit=50`);
      if (olderMsgs.length === 0) {
        setHasMore(false);
      } else {
        // Preserve scroll position
        const el = messagesAreaRef.current;
        const prevHeight = el?.scrollHeight || 0;

        useStore.setState(s => ({
          messages: [...olderMsgs, ...s.messages],
        }));

        // Restore scroll position after render
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = el.scrollHeight - prevHeight;
          }
        });
      }
    } catch (err) {
      console.error('Load older messages error:', err);
    }
    setLoadingMore(false);
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;

    setContent('');
    setFiles([]);
    setReplyingTo(null);
    textareaRef.current?.focus();

    try {
      const msg = await sendMessage(currentChannel.id, trimmed, files.length > 0 ? files : null, replyingTo?.id);
      // Optimistically add to local state immediately
      useStore.getState().addMessage(msg);
      // Broadcast to other users via socket
      const socket = getSocket();
      socket?.emit('message_create', msg);
    } catch (err) {
      console.error('Send message error:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Edit last message with up arrow on empty input
    if (e.key === 'ArrowUp' && !content) {
      const myMessages = messages.filter(m => m.author_id === user.id);
      if (myMessages.length > 0) {
        const lastMsg = myMessages[myMessages.length - 1];
        setEditingId(lastMsg.id);
        setEditContent(lastMsg.content);
      }
      return;
    }

    // Typing indicator
    const socket = getSocket();
    if (socket && currentChannel) {
      if (!typingTimeout.current) {
        socket.emit('typing_start', currentChannel.id);
      }
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        typingTimeout.current = null;
      }, 3000);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
    e.target.value = '';
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) setFiles(prev => [...prev, file]);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  };

  const handleEdit = (msg) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const { editMessage } = useStore.getState();
    await editMessage(currentChannel.id, editingId, editContent);
    const socket = getSocket();
    const updatedMsg = useStore.getState().messages.find(m => m.id === editingId);
    if (updatedMsg) socket?.emit('message_update', updatedMsg);
    setEditingId(null);
    setEditContent('');
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [content]);

  // Get typing users for current channel
  const channelTyping = typingUsers[currentChannel?.id] || {};
  const typingNames = Object.values(channelTyping)
    .filter(t => Date.now() - t.timestamp < 5000)
    .map(t => t.username);

  const channelName = currentChannel?.type === 'dm'
    ? currentChannel?.members?.[0]?.username || 'DM'
    : currentChannel?.name || '';

  // Group messages by author for consecutive messages
  const groupedMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = messages[i - 1];
    const showHeader = !prev ||
      prev.author_id !== msg.author_id ||
      (new Date(msg.created_at) - new Date(prev.created_at)) > 5 * 60 * 1000 ||
      msg.type === 'reply';
    groupedMessages.push({ ...msg, showHeader });
  }

  return (
    <div
      className="main-content"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* Channel Header */}
      <div className="channel-header">
        <span className="hash">
          {currentChannel?.type === 'voice' ? '🔊' : currentChannel?.type === 'dm' ? '@' : '#'}
        </span>
        <span className="name">{channelName}</span>
        {currentChannel?.topic && <span className="topic">{currentChannel.topic}</span>}
        <div className="header-icons">
          {currentChannel?.server_id && (
            <div className="header-icon" onClick={toggleInviteModal} title="Create Invite">📨</div>
          )}
          <div className="header-icon" onClick={() => setShowPins(!showPins)} title="Pinned Messages" style={{ position: 'relative' }}>
            📌
            {showPins && <PinnedMessages onClose={() => setShowPins(false)} />}
          </div>
          {currentChannel?.server_id && (
            <div className="header-icon" onClick={() => {
              const el = document.querySelector('.member-list');
              if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
            }} title="Member List">
              👥
            </div>
          )}
          <SearchBar />
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area" ref={messagesAreaRef} onScroll={handleScroll}>
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            Loading older messages...
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <div style={{ padding: '16px 16px 8px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--header-primary)' }}>
              Welcome to {currentChannel?.type === 'dm' ? 'your DM with ' : '#'}{channelName}!
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
              {currentChannel?.type === 'dm'
                ? 'This is the beginning of your direct message history.'
                : `This is the start of the #${channelName} channel.`}
            </div>
            <div style={{ height: 1, background: 'var(--bg-modifier-active)', margin: '16px 0' }} />
          </div>
        )}
        <div className="messages-start" />
        {loadingMessages ? (
          <div className="loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">💬</div>
            <div>No messages yet. Start the conversation!</div>
          </div>
        ) : (
          groupedMessages.map(msg => (
            <MessageItem
              key={msg.id}
              message={msg}
              showHeader={msg.showHeader}
              isEditing={editingId === msg.id}
              editContent={editContent}
              setEditContent={setEditContent}
              onEditSave={handleEditSave}
              onEditCancel={() => setEditingId(null)}
              onEdit={handleEdit}
              onReply={(m) => { setReplyingTo(m); textareaRef.current?.focus(); }}
              currentUserId={user.id}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <div className="typing-indicator">
        {typingNames.length > 0 && (
          <span>
            <strong>{typingNames.join(', ')}</strong>
            {typingNames.length === 1 ? ' is typing...' : ' are typing...'}
          </span>
        )}
      </div>

      {/* Message Input */}
      <div className="message-input-container">
        {replyingTo && (
          <div className="reply-bar">
            <span>Replying to <strong style={{ color: 'var(--header-primary)' }}>{replyingTo.username}</strong></span>
            <button className="reply-close" onClick={() => setReplyingTo(null)}>✕</button>
          </div>
        )}

        {/* File upload preview */}
        {files.length > 0 && (
          <div className="upload-preview">
            {files.map((file, i) => (
              <div key={i} className="upload-item">
                {file.type?.startsWith('image/') ? (
                  <img className="upload-image-preview" src={URL.createObjectURL(file)} alt="" />
                ) : (
                  <span style={{ fontSize: 20 }}>📄</span>
                )}
                <div>
                  <div className="upload-name">{file.name}</div>
                  <div className="upload-size">{formatFileSize(file.size)}</div>
                </div>
                <button className="upload-remove" onClick={() => removeFile(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="message-input-wrapper">
          <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach files">
            +
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple hidden />
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder={`Message ${currentChannel?.type === 'dm' ? '@' : '#'}${channelName}`}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
          />
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}
