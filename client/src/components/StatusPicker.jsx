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

export default function StatusPicker({ onClose }) {
  const { user, setUser } = useStore();
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
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
