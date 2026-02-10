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
    members, bulkSelectMode, selectedMessages, toggleBulkSelect,
    toggleMessageSelect, selectAllMessages, clearSelection, bulkDeleteMessages,
    removeBulkMessages, currentServer, toggleSearchPanel,
  } = useStore();
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [pinCount, setPinCount] = useState(0);
  const [showMembers, setShowMembers] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartPos = useRef(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeout = useRef(null);
  const isAtBottom = useRef(true);
  const lastClickedIndex = useRef(null);

  // Check if current user has MANAGE_MESSAGES permission
  const canManageMessages = (() => {
    if (!currentServer || !user) return false;
    // Server owner always has permission
    if (currentServer.owner_id === user.id) return true;
    // Check roles for MANAGE_MESSAGES (1 << 13 = 8192) or ADMINISTRATOR (1 << 3 = 8)
    const memberEntry = members?.find(m => m.id === user.id);
    if (!memberEntry?.roles) return false;
    const MANAGE_MESSAGES = 1n << 13n;
    const ADMINISTRATOR = 1n << 3n;
    for (const role of memberEntry.roles) {
      const perms = BigInt(role.permissions || 0);
      if ((perms & ADMINISTRATOR) === ADMINISTRATOR) return true;
      if ((perms & MANAGE_MESSAGES) === MANAGE_MESSAGES) return true;
    }
    return false;
  })();

  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      await bulkDeleteMessages(currentChannel.id);
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
    setBulkDeleting(false);
  };

  const handleMessageSelect = (messageId, shiftKey) => {
    if (!bulkSelectMode) return;
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (shiftKey && lastClickedIndex.current !== null && lastClickedIndex.current !== msgIndex) {
      // Range select
      const start = Math.min(lastClickedIndex.current, msgIndex);
      const end = Math.max(lastClickedIndex.current, msgIndex);
      const rangeIds = messages.slice(start, end + 1).map(m => m.id);
      const state = useStore.getState();
      const next = new Set(state.selectedMessages);
      for (const id of rangeIds) {
        if (next.size < 100) next.add(id);
      }
      useStore.setState({ selectedMessages: next });
    } else {
      toggleMessageSelect(messageId);
    }
    lastClickedIndex.current = msgIndex;
  };

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
    lastClickedIndex.current = null;
    // Exit bulk select mode on channel change
    if (bulkSelectMode) {
      useStore.setState({ bulkSelectMode: false, selectedMessages: new Set() });
    }
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

  // Convert :emojiName: shortcodes to <:emojiName:emojiId> format
  const convertEmojiShortcodes = (text) => {
    const emojis = useStore.getState().serverEmojis || [];
    if (emojis.length === 0) return text;
    return text.replace(/:([a-zA-Z0-9_]{2,32}):/g, (match, name) => {
      const emoji = emojis.find(e => e.name === name);
      if (emoji) return `<:${emoji.name}:${emoji.id}>`;
      return match;
    });
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;

    setContent('');
    setFiles([]);
    setReplyingTo(null);
    textareaRef.current?.focus();

    // Convert emoji shortcodes before sending
    const processedContent = convertEmojiShortcodes(trimmed);

    try {
      const msg = await sendMessage(currentChannel.id, processedContent, files.length > 0 ? files : null, replyingTo?.id);
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
    // Mention picker keyboard navigation
    if (showMentionPicker && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionPicker(false);
        setMentionQuery('');
        mentionStartPos.current = null;
        return;
      }
    }

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

  // Mention picker: compute filtered members
  const specialItems = [
    { id: '__everyone__', username: 'everyone', special: true },
    { id: '__here__', username: 'here', special: true },
  ];
  const filteredMembers = (() => {
    if (!showMentionPicker) return [];
    const q = mentionQuery.toLowerCase();
    const specials = specialItems.filter(s =>
      !q || s.username.startsWith(q)
    );
    const memberResults = (members || []).filter(m =>
      m.id !== user?.id && (
        !q ||
        m.username?.toLowerCase().includes(q) ||
        m.nickname?.toLowerCase().includes(q)
      )
    ).slice(0, 10);
    return [...specials, ...memberResults];
  })();

  const handleContentChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(value);

    // Detect @ mention trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      setShowMentionPicker(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
      mentionStartPos.current = cursorPos - atMatch[0].length;
    } else {
      setShowMentionPicker(false);
      setMentionQuery('');
      mentionStartPos.current = null;
    }
  };

  const insertMention = (member) => {
    const ta = textareaRef.current;
    if (!ta || mentionStartPos.current === null) return;
    const before = content.slice(0, mentionStartPos.current);
    const after = content.slice(ta.selectionStart);
    let insertion;
    if (member.special) {
      insertion = `@${member.username} `;
    } else {
      insertion = `<@${member.id}> `;
    }
    const newContent = before + insertion + after;
    setContent(newContent);
    setShowMentionPicker(false);
    setMentionQuery('');
    mentionStartPos.current = null;
    // Focus and set cursor position after insertion
    requestAnimationFrame(() => {
      if (ta) {
        const pos = before.length + insertion.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  // Formatting toolbar helpers
  const applyFormat = (prefix, suffix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
    setContent(newText);
    setTimeout(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    }, 0);
  };

  const applyLinePrefix = (prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    if (selected) {
      const lines = selected.split('\n');
      const prefixed = lines.map((line, i) => {
        if (prefix === '1. ') {
          return `${i + 1}. ${line}`;
        }
        return prefix + line;
      }).join('\n');
      const newText = text.substring(0, start) + prefixed + text.substring(end);
      setContent(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + prefixed.length);
      }, 0);
    } else {
      const newText = text.substring(0, start) + prefix + text.substring(end);
      setContent(newText);
      setTimeout(() => {
        textarea.focus();
        const pos = start + prefix.length;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    }
  };

  const applyCodeBlock = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const prefix = '```\n';
    const suffix = '\n```';
    const newText = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
    setContent(newText);
    setTimeout(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    }, 0);
  };

  const applyLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    if (selected) {
      const newText = text.substring(0, start) + '[' + selected + '](url)' + text.substring(end);
      setContent(newText);
      setTimeout(() => {
        textarea.focus();
        // Select "url" so user can type the URL
        const urlStart = start + selected.length + 2;
        textarea.setSelectionRange(urlStart, urlStart + 3);
      }, 0);
    } else {
      const newText = text.substring(0, start) + '[link text](url)' + text.substring(end);
      setContent(newText);
      setTimeout(() => {
        textarea.focus();
        // Select "link text" so user can type
        textarea.setSelectionRange(start + 1, start + 10);
      }, 0);
    }
  };

  // Listen for message embeds
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = ({ messageId, embeds }) => {
      useStore.getState().setMessageEmbeds(messageId, embeds);
    };
    socket.on('message_embeds', handler);
    return () => socket.off('message_embeds', handler);
  }, []);

  // Fetch pin count on channel change
  useEffect(() => {
    if (currentChannel) {
      api.get(`/${currentChannel.id}/pins`)
        .then(pins => setPinCount(pins.length))
        .catch(() => setPinCount(0));
    } else {
      setPinCount(0);
    }
  }, [currentChannel?.id]);

  // Listen for pin/unpin socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlePin = ({ channelId, messageId }) => {
      if (channelId === currentChannel?.id) {
        useStore.setState(s => ({
          messages: s.messages.map(m => m.id === messageId ? { ...m, pinned: 1 } : m),
        }));
        setPinCount(prev => prev + 1);
      }
    };

    const handleUnpin = ({ channelId, messageId }) => {
      if (channelId === currentChannel?.id) {
        useStore.setState(s => ({
          messages: s.messages.map(m => m.id === messageId ? { ...m, pinned: 0 } : m),
        }));
        setPinCount(prev => Math.max(0, prev - 1));
      }
    };

    socket.on('message_pin', handlePin);
    socket.on('message_unpin', handleUnpin);
    return () => {
      socket.off('message_pin', handlePin);
      socket.off('message_unpin', handleUnpin);
    };
  }, [currentChannel?.id]);

  // Listen for bulk_message_delete socket event
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleBulkDelete = ({ channelId, messageIds }) => {
      if (channelId === currentChannel?.id) {
        removeBulkMessages(messageIds);
      }
    };

    socket.on('bulk_message_delete', handleBulkDelete);
    return () => socket.off('bulk_message_delete', handleBulkDelete);
  }, [currentChannel?.id]);

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
          {currentChannel?.server_id && canManageMessages && (
            <div
              className="header-icon"
              onClick={toggleBulkSelect}
              title={bulkSelectMode ? 'Exit Select Mode' : 'Select Messages'}
              style={bulkSelectMode ? { background: 'var(--brand-500)', color: 'white', borderRadius: 4 } : {}}
            >
              ☑
            </div>
          )}
          {currentChannel?.server_id && (
            <div className="header-icon" onClick={toggleInviteModal} title="Create Invite">📨</div>
          )}
          {currentChannel?.server_id && (
            <div className="header-icon" onClick={() => useStore.getState().toggleEventsPanel()} title="Events">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M3 10h18" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          )}
          <div className="header-icon" onClick={() => setShowPins(!showPins)} title="Pinned Messages" style={{ position: 'relative' }}>
            📌
            {pinCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: 'var(--brand-500)', color: 'white',
                borderRadius: '50%', minWidth: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, padding: '0 3px',
              }}>
                {pinCount}
              </span>
            )}
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
          {currentChannel?.server_id && (
            <div className="header-icon" onClick={toggleSearchPanel} title="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.707 20.293l-5.395-5.396A7.946 7.946 0 0018 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8a7.946 7.946 0 004.897-1.688l5.396 5.395a.997.997 0 001.414 0 .999.999 0 000-1.414zM10 16c-3.309 0-6-2.691-6-6s2.691-6 6-6 6 2.691 6 6-2.691 6-6 6z"/>
              </svg>
            </div>
          )}
          <SearchBar />
        </div>
      </div>

      {/* Bulk Select Toolbar */}
      {bulkSelectMode && (
        <div className="bulk-action-toolbar">
          <span className="bulk-count">{selectedMessages.size} selected</span>
          <button className="bulk-btn bulk-select-all" onClick={selectAllMessages}>
            Select All
          </button>
          <button
            className="bulk-btn bulk-delete"
            onClick={handleBulkDelete}
            disabled={selectedMessages.size === 0 || bulkDeleting}
          >
            {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedMessages.size})`}
          </button>
          <button className="bulk-btn bulk-cancel" onClick={toggleBulkSelect}>
            Cancel
          </button>
        </div>
      )}

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
              bulkSelectMode={bulkSelectMode}
              isSelected={selectedMessages.has(msg.id)}
              onMessageSelect={handleMessageSelect}
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

        {showMentionPicker && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0,
            background: 'var(--bg-floating)', borderRadius: 8, padding: 4,
            maxHeight: 200, overflowY: 'auto', boxShadow: '0 0 16px rgba(0,0,0,.3)',
            marginBottom: 4, zIndex: 100,
          }}>
            <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Members
            </div>
            {filteredMembers.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 4, cursor: 'pointer',
                  background: i === mentionIndex ? 'var(--bg-modifier-selected)' : 'transparent',
                }}
                onClick={() => insertMention(m)}
                onMouseEnter={() => setMentionIndex(i)}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: m.special ? 'var(--brand-500)' : `hsl(${(m.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0,
                  color: 'white',
                }}>
                  {m.special ? '@' : m.avatar ? <img src={`/uploads/${m.avatar}`} style={{ width: 24, height: 24, borderRadius: '50%' }} /> : m.username?.[0]?.toUpperCase()}
                </div>
                <span style={{ fontWeight: 500 }}>{m.nickname || m.username}</span>
                {!m.special && m.discriminator && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{m.discriminator}</span>}
              </div>
            ))}
            {filteredMembers.length === 0 && (
              <div style={{ padding: '8px', fontSize: 13, color: 'var(--text-muted)' }}>No members found</div>
            )}
          </div>
        )}

        <div className={`formatting-toolbar${replyingTo || files.length > 0 ? ' no-top-radius' : ''}`}>
          <button className="format-btn" onClick={() => applyFormat('**', '**')} title="Bold (Ctrl+B)">
            <span className="format-bold">B</span>
          </button>
          <button className="format-btn" onClick={() => applyFormat('*', '*')} title="Italic (Ctrl+I)">
            <span className="format-italic">I</span>
          </button>
          <button className="format-btn" onClick={() => applyFormat('__', '__')} title="Underline (Ctrl+U)">
            <span className="format-underline">U</span>
          </button>
          <button className="format-btn" onClick={() => applyFormat('~~', '~~')} title="Strikethrough">
            <span className="format-strike">S</span>
          </button>
          <div className="format-divider" />
          <button className="format-btn" onClick={() => applyFormat('`', '`')} title="Inline Code">
            <span className="format-code">&lt;/&gt;</span>
          </button>
          <button className="format-btn" onClick={applyCodeBlock} title="Code Block">
            <span className="format-code">```</span>
          </button>
          <div className="format-divider" />
          <button className="format-btn" onClick={() => applyFormat('||', '||')} title="Spoiler">
            ||
          </button>
          <button className="format-btn" onClick={() => applyLinePrefix('> ')} title="Quote">
            &gt;
          </button>
          <div className="format-divider" />
          <button className="format-btn" onClick={applyLink} title="Link">
            link
          </button>
          <button className="format-btn" onClick={() => applyLinePrefix('1. ')} title="Ordered List">
            1.
          </button>
          <button className="format-btn" onClick={() => applyLinePrefix('- ')} title="Unordered List">
            &#8226;
          </button>
        </div>

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
            onChange={handleContentChange}
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
