import React, { useState } from 'react';
import { useStore } from '../store';

export default function CreateServerModal() {
  const { toggleCreateServer, createServer, joinServer } = useStore();
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createServer(name.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Extract code from full URL or use as-is
      let code = inviteCode.trim();
      if (code.includes('/')) {
        code = code.split('/').pop();
      }
      await joinServer(code);
      toggleCreateServer();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && toggleCreateServer()}>
      <div className="modal">
        {!mode ? (
          <>
            <div className="modal-title">Create or Join a Server</div>
            <div className="modal-subtitle">Your server is where you and your friends hang out.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                className="btn btn-primary btn-full"
                onClick={() => setMode('create')}
                style={{ padding: 16, fontSize: 16 }}
              >
                Create My Own
              </button>
              <button
                className="btn btn-full"
                onClick={() => setMode('join')}
                style={{ padding: 16, fontSize: 16, background: 'var(--bg-secondary)', color: 'var(--text-normal)' }}
              >
                Join a Server
              </button>
            </div>
          </>
        ) : mode === 'create' ? (
          <>
            <div className="modal-title">Customize your server</div>
            <div className="modal-subtitle">Give your new server a personality with a name.</div>
            {error && <p className="error-text" style={{ textAlign: 'center', marginBottom: 8 }}>{error}</p>}

            <div className="form-group">
              <label className="form-label">Server Name</label>
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="My Awesome Server"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setMode(null)}>Back</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">Join a Server</div>
            <div className="modal-subtitle">Enter an invite below to join an existing server.</div>
            {error && <p className="error-text" style={{ textAlign: 'center', marginBottom: 8 }}>{error}</p>}

            <div className="form-group">
              <label className="form-label">Invite Link or Code</label>
              <input
                className="form-input"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="https://discord2.app/invite/hTKzmak or hTKzmak"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setMode(null)}>Back</button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={loading || !inviteCode.trim()}>
                {loading ? 'Joining...' : 'Join Server'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
