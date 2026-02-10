import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';
import { renderMarkdown } from '../utils/markdown';

export default function ThreadPanel() {
  const { activeThread, threadMessages, loadingThread, closeThread, sendThreadMessage, user } = useStore();
  const [content, setContent] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [threadMessages.length]);

  useEffect(() => {
    setContent('');
  }, [activeThread?.id]);

  // Listen for thread messages
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (msg) => {
      useStore.getState().addThreadMessage(msg);
    };
    socket.on('thread_message_create', handler);
    return () => socket.off('thread_message_create', handler);
  }, []);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || !activeThread) return;
    setContent('');
    try {
      await sendThreadMessage(activeThread.id, trimmed);
    } catch (err) {
      console.error('Thread send error:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeThread) return null;

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      width: 420, borderLeft: '1px solid var(--bg-modifier-active)',
      background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        height: 48, padding: '0 16px', display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--bg-modifier-active)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, marginRight: 8 }}>&#x1F9F5;</span>
        <span style={{ fontWeight: 600, color: 'var(--header-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeThread.name || 'Thread'}
        </span>
        <button
          onClick={closeThread}
          style={{
            background: 'none', border: 'none', color: 'var(--interactive-normal)',
            cursor: 'pointer', fontSize: 18, padding: 4,
          }}
        >
          &#x2715;
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loadingThread ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>Loading thread...</div>
        ) : threadMessages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>No messages in this thread yet. Start the conversation!</div>
        ) : (
          threadMessages.map(msg => {
            const avatarColor = `hsl(${(msg.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;
            return (
              <div key={msg.id} style={{ display: 'flex', gap: 12, padding: '4px 16px', marginBottom: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600, marginTop: 2,
                }}>
                  {msg.avatar ? (
                    <img src={`/uploads/${msg.avatar}`} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  ) : (
                    msg.username?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: avatarColor }}>{msg.username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(msg.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-normal)', lineHeight: 1.4 }}>
                    {renderMarkdown(msg.content)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
        <div style={{
          background: 'var(--channeltextarea-background)', borderRadius: 8,
          display: 'flex', alignItems: 'center', padding: '0 12px',
        }}>
          <textarea
            ref={textareaRef}
            style={{
              flex: 1, background: 'none', border: 'none', color: 'var(--text-normal)',
              fontSize: 14, padding: '10px 0', resize: 'none', outline: 'none',
              fontFamily: 'inherit', maxHeight: 120,
            }}
            placeholder="Message thread..."
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>
      </div>
    </div>
  );
}
