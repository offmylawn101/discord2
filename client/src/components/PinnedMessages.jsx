import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';

export default function PinnedMessages({ onClose }) {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentChannel, unpinMessage } = useStore();
  const panelRef = useRef(null);

  useEffect(() => {
    if (currentChannel) {
      api.get(`/${currentChannel.id}/pins`)
        .then(setPins)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [currentChannel?.id]);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleUnpin = async (messageId) => {
    const socket = getSocket();
    await unpinMessage(currentChannel.id, messageId);
    socket?.emit('message_unpin', { channelId: currentChannel.id, messageId });
    setPins(prev => prev.filter(p => p.id !== messageId));
  };

  const handleJump = (messageId) => {
    onClose();
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = 'var(--bg-modifier-active)';
      setTimeout(() => { el.style.background = ''; }, 2000);
    }
  };

  const formatTime = (d) => {
    const date = new Date(d);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="pinned-panel" ref={panelRef}>
      <div className="pinned-header">Pinned Messages</div>
      {loading ? (
        <div className="pinned-empty">Loading...</div>
      ) : pins.length === 0 ? (
        <div className="pinned-empty">
          <div style={{ fontSize: 32, marginBottom: 8 }}>📌</div>
          <div>This channel doesn't have any pinned messages... yet.</div>
        </div>
      ) : (
        pins.map(pin => (
          <div key={pin.id} className="pinned-message">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: `hsl(${(pin.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600,
              }}>
                {pin.username?.[0]?.toUpperCase()}
              </div>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--header-primary)' }}>{pin.username}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(pin.created_at)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleUnpin(pin.id); }}
                title="Unpin Message"
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 16, padding: '0 4px', lineHeight: 1,
                }}
                onMouseEnter={e => e.target.style.color = 'var(--text-danger)'}
                onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-normal)', lineHeight: 1.4 }}>{pin.content}</div>
            <div
              onClick={() => handleJump(pin.id)}
              style={{
                fontSize: 12, color: 'var(--text-link)', cursor: 'pointer',
                marginTop: 4, fontWeight: 500,
              }}
            >
              Jump to message
            </div>
          </div>
        ))
      )}
    </div>
  );
}
