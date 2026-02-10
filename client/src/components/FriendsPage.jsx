import React, { useState } from 'react';
import { useStore } from '../store';

export default function FriendsPage() {
  const { relationships, sendFriendRequest, acceptFriend, removeFriend, openDm } = useStore();
  const [tab, setTab] = useState('all');
  const [friendInput, setFriendInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const friends = relationships.filter(r => r.type === 'friend');
  const online = friends.filter(r => r.status !== 'offline');
  const pending = relationships.filter(r => r.type === 'pending_incoming' || r.type === 'pending_outgoing');
  const blocked = relationships.filter(r => r.type === 'blocked');

  const handleAddFriend = async () => {
    setError('');
    setSuccess('');
    // Parse Username#0001 format
    const parts = friendInput.split('#');
    if (parts.length !== 2) {
      setError('Format: Username#0001');
      return;
    }
    try {
      await sendFriendRequest(parts[0], parts[1]);
      setSuccess('Friend request sent!');
      setFriendInput('');
    } catch (err) {
      setError(err.message);
    }
  };

  let displayList = [];
  if (tab === 'all') displayList = friends;
  else if (tab === 'online') displayList = online;
  else if (tab === 'pending') displayList = pending;
  else if (tab === 'blocked') displayList = blocked;

  return (
    <div className="friends-page">
      <div className="friends-header">
        <span style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 16, marginRight: 8 }}>Friends</span>
        <button className={`friends-tab ${tab === 'online' ? 'active' : ''}`} onClick={() => setTab('online')}>Online</button>
        <button className={`friends-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
        <button className={`friends-tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          Pending {pending.length > 0 ? `(${pending.length})` : ''}
        </button>
        <button className={`friends-tab ${tab === 'blocked' ? 'active' : ''}`} onClick={() => setTab('blocked')}>Blocked</button>
        <button className={`friends-tab add-friend ${tab === 'add' ? '' : ''}`} onClick={() => setTab('add')}>Add Friend</button>
      </div>

      <div className="friends-list">
        {tab === 'add' ? (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ color: 'var(--header-primary)', marginBottom: 8, fontSize: 16 }}>ADD FRIEND</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
              You can add friends with their Discord Tag. It's cAsE sEnSiTiVe!
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder="Enter a Username#0001"
                value={friendInput}
                onChange={e => setFriendInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleAddFriend} disabled={!friendInput.trim()}>
                Send Friend Request
              </button>
            </div>
            {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
            {success && <p style={{ color: 'var(--green-360)', fontSize: 14, marginTop: 8 }}>{success}</p>}
          </div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">😶</div>
            <div>{tab === 'pending' ? 'No pending friend requests' : 'No friends to display'}</div>
          </div>
        ) : (
          displayList.map(rel => (
            <div key={rel.target_id} className="friend-item">
              <div className="member-avatar" style={{
                width: 40, height: 40, borderRadius: '50%',
                background: `hsl(${(rel.target_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 600, position: 'relative',
              }}>
                {rel.username?.[0]?.toUpperCase()}
                <div className={`status-dot ${rel.status || 'offline'}`} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 15 }}>
                  {rel.username}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>#{rel.discriminator}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {rel.type === 'pending_incoming' ? 'Incoming Friend Request' :
                   rel.type === 'pending_outgoing' ? 'Outgoing Friend Request' :
                   rel.status || 'Offline'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {rel.type === 'pending_incoming' && (
                  <button className="btn btn-primary" onClick={() => acceptFriend(rel.target_id)} style={{ padding: '4px 12px', fontSize: 13 }}>Accept</button>
                )}
                {rel.type === 'friend' && (
                  <button className="btn btn-secondary" onClick={() => openDm(rel.target_id)} style={{ padding: '4px 12px', fontSize: 13 }}>Message</button>
                )}
                <button className="btn btn-danger" onClick={() => removeFriend(rel.target_id)} style={{ padding: '4px 12px', fontSize: 13 }}>
                  {rel.type === 'friend' ? 'Remove' : rel.type === 'blocked' ? 'Unblock' : 'Cancel'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
