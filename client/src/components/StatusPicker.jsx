import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';
import { getSocket } from '../utils/socket';
import { setIdlePreviousStatus } from '../utils/idle';

const STATUSES = [
  { value: 'online', label: 'Online', color: '#23a559', desc: '' },
  { value: 'idle', label: 'Idle', color: '#faa81a', desc: '' },
  { value: 'dnd', label: 'Do Not Disturb', color: '#f23f43', desc: 'You will not receive desktop notifications.' },
  { value: 'invisible', label: 'Invisible', color: '#80848e', desc: 'You will not appear online, but have full access.' },
];

const ACTIVITY_TYPES = [
  { value: 'playing', label: 'Playing' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'listening', label: 'Listening to' },
  { value: 'watching', label: 'Watching' },
  { value: 'competing', label: 'Competing in' },
];

export default function StatusPicker({ onClose }) {
  const { user, setUser } = useStore();
  const setActivity = useStore(s => s.setActivity);
  const clearActivity = useStore(s => s.clearActivity);
  const userActivities = useStore(s => s.userActivities);
  const currentActivity = userActivities[user?.id] || null;

  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [activityType, setActivityType] = useState(currentActivity?.type || 'playing');
  const [activityName, setActivityName] = useState(currentActivity?.name || '');
  const [activityDetails, setActivityDetails] = useState(currentActivity?.details || '');
  const pickerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleStatusChange = async (status) => {
    try {
      const updated = await api.patch('/auth/me', { custom_status: user.custom_status });
      // In a real app we'd have a dedicated status endpoint
      // For now, we update locally and emit via socket
      setUser({ ...user, status });
      const socket = getSocket();
      socket?.emit('status_change', status);
      // Track this as the user's intentional status for idle detection
      if (status !== 'idle') {
        setIdlePreviousStatus(status);
      }
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCustomStatus = async () => {
    try {
      const updated = await api.patch('/auth/me', { custom_status: customStatus });
      setUser(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetActivity = async () => {
    if (!activityName.trim()) return;
    try {
      await setActivity(activityType, activityName.trim(), activityDetails.trim());
      setShowActivityPicker(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearActivity = async () => {
    try {
      await clearActivity();
      setActivityName('');
      setActivityDetails('');
      setShowActivityPicker(false);
    } catch (err) {
      console.error(err);
    }
  };

  const activityLabel = (type) => {
    const found = ACTIVITY_TYPES.find(t => t.value === type);
    return found ? found.label : '';
  };

  return (
    <div className="status-picker" ref={pickerRef}>
      <div style={{ padding: '4px 8px 8px', borderBottom: '1px solid var(--bg-modifier-active)' }}>
        <input
          className="form-input"
          placeholder="Set a custom status"
          value={customStatus}
          onChange={e => setCustomStatus(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCustomStatus()}
          style={{ fontSize: 13, padding: '6px 8px' }}
        />
      </div>

      {/* Activity section */}
      <div style={{ borderBottom: '1px solid var(--bg-modifier-active)' }}>
        <button
          className="status-option"
          onClick={() => setShowActivityPicker(!showActivityPicker)}
          style={{ width: '100%' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M6 6h4v4H6V6zm8 0h4v4h-4V6zM6 14h4v4H6v-4zm8 0h4v4h-4v-4z" />
          </svg>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div className="status-label">
              {currentActivity
                ? `${activityLabel(currentActivity.type)} ${currentActivity.name}`
                : 'Set Activity'
              }
            </div>
            {currentActivity?.details && (
              <div className="status-desc">{currentActivity.details}</div>
            )}
          </div>
          <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>{showActivityPicker ? '\u25B2' : '\u25BC'}</span>
        </button>

        {showActivityPicker && (
          <div style={{ padding: '8px 12px 12px' }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Activity Type
              </label>
              <select
                value={activityType}
                onChange={e => setActivityType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--input-background)',
                  border: 'none',
                  borderRadius: 4,
                  color: 'var(--text-normal)',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {ACTIVITY_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Activity Name
              </label>
              <input
                className="form-input"
                placeholder="e.g. Minecraft, Spotify..."
                value={activityName}
                onChange={e => setActivityName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetActivity()}
                style={{ fontSize: 13, padding: '6px 8px', width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Details (optional)
              </label>
              <input
                className="form-input"
                placeholder="e.g. In-Game, Album name..."
                value={activityDetails}
                onChange={e => setActivityDetails(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetActivity()}
                style={{ fontSize: 13, padding: '6px 8px', width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSetActivity}
                disabled={!activityName.trim()}
                style={{
                  flex: 1, padding: '6px 12px',
                  background: 'var(--brand-500)', color: 'white',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  opacity: !activityName.trim() ? 0.5 : 1,
                }}
              >
                Set
              </button>
              {currentActivity && (
                <button
                  onClick={handleClearActivity}
                  style={{
                    flex: 1, padding: '6px 12px',
                    background: 'var(--bg-modifier-active)', color: 'var(--text-normal)',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {STATUSES.map(s => (
        <button key={s.value} className="status-option" onClick={() => handleStatusChange(s.value)}>
          <div className="status-indicator" style={{ background: s.color }} />
          <div>
            <div className="status-label">{s.label}</div>
            {s.desc && <div className="status-desc">{s.desc}</div>}
          </div>
        </button>
      ))}
    </div>
  );
}
