import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { api } from '../utils/api';

function calculatePosition(position, popupRef) {
  const pad = 8;
  const popupWidth = 340;
  const el = popupRef.current;
  const popupHeight = el ? el.getBoundingClientRect().height : 400;

  let left = position.x;
  let top = position.y;

  // If would go off right edge, flip to left side of click
  if (left + popupWidth + pad > window.innerWidth) {
    left = position.x - popupWidth - pad;
  }
  // Clamp to left edge
  if (left < pad) left = pad;

  // If would go off bottom, shift up
  if (top + popupHeight + pad > window.innerHeight) {
    top = window.innerHeight - popupHeight - pad;
  }
  // Clamp to top
  if (top < pad) top = pad;

  return { left, top };
}

export default function UserProfilePopup({ userId, position, onClose }) {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [loading, setLoading] = useState(true);
  const [popupStyle, setPopupStyle] = useState({ visibility: 'hidden' });
  const popupRef = useRef(null);
  const { user, members, roles, openDm } = useStore();

  useEffect(() => {
    api.get(`/auth/users/${userId}/profile`).then(data => {
      setProfile(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  // Position popup after profile loads and renders
  useEffect(() => {
    if (!popupRef.current || !position || loading) return;
    const pos = calculatePosition(position, popupRef);
    setPopupStyle({ left: pos.left, top: pos.top, visibility: 'visible' });
  }, [position, profile, loading, activeTab]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (loading) {
    const loadStyle = {
      left: position.x,
      top: position.y,
    };
    // Adjust loading spinner position if offscreen
    if (loadStyle.left + 340 + 8 > window.innerWidth) {
      loadStyle.left = position.x - 340 - 8;
    }
    if (loadStyle.left < 8) loadStyle.left = 8;
    if (loadStyle.top + 200 + 8 > window.innerHeight) {
      loadStyle.top = window.innerHeight - 200 - 8;
    }
    if (loadStyle.top < 8) loadStyle.top = 8;

    return createPortal(
      <div className="user-profile-popup" style={loadStyle} ref={popupRef}>
        <div className="profile-popup-loading">
          <div className="profile-popup-spinner" />
        </div>
      </div>,
      document.body
    );
  }

  if (!profile) return null;

  // Get member roles in current server
  const memberEntry = members.find(m => m.id === userId);
  const memberRoles = memberEntry?.roles
    ? roles.filter(r => memberEntry.roles.includes(r.id) && !r.is_default).sort((a, b) => b.position - a.position)
    : [];

  const avatarColor = `hsl(${(userId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;

  const popup = (
    <div className="user-profile-popup" ref={popupRef} style={popupStyle}>
      {/* Banner */}
      <div className="profile-popup-banner" style={{ background: profile.banner_color || '#5865F2' }} />

      {/* Avatar */}
      <div className="profile-popup-avatar-wrapper">
        <div className="profile-popup-avatar" style={{ background: avatarColor }}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            profile.username?.[0]?.toUpperCase()
          )}
        </div>
        <div className={`status-dot ${profile.status || 'offline'}`} />
      </div>

      {/* Username + custom status */}
      <div className="profile-popup-header">
        <h3>{memberEntry?.nickname || profile.username}</h3>
        {memberEntry?.nickname && (
          <span className="profile-popup-username">{profile.username}</span>
        )}
        {!memberEntry?.nickname && profile.username && (
          <span className="profile-popup-username" />
        )}
        {profile.custom_status && (
          <div className="profile-popup-custom-status">{profile.custom_status}</div>
        )}
      </div>

      {/* Divider + Body */}
      <div className="profile-popup-body">
        {/* Tabs */}
        <div className="profile-popup-tabs">
          <button className={activeTab === 'about' ? 'active' : ''} onClick={() => setActiveTab('about')}>
            About Me
          </button>
          {memberRoles.length > 0 && (
            <button className={activeTab === 'roles' ? 'active' : ''} onClick={() => setActiveTab('roles')}>
              Roles
            </button>
          )}
          <button className={activeTab === 'mutuals' ? 'active' : ''} onClick={() => setActiveTab('mutuals')}>
            Mutual Servers
          </button>
        </div>

        {activeTab === 'about' && (
          <div className="profile-popup-about">
            {profile.about_me ? (
              <p>{profile.about_me}</p>
            ) : (
              <p className="muted">No bio set</p>
            )}
            <div className="profile-popup-since">
              <span>Member since</span>
              <span>{new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="profile-popup-roles">
            {memberRoles.map(role => (
              <span
                key={role.id}
                className="profile-role-badge"
                style={{ borderColor: role.color !== '#99AAB5' ? role.color : '#555' }}
              >
                <span className="role-dot" style={{ background: role.color !== '#99AAB5' ? role.color : '#555' }} />
                {role.name}
              </span>
            ))}
          </div>
        )}

        {activeTab === 'mutuals' && (
          <div className="profile-popup-mutuals">
            {profile.mutualServers?.length > 0 ? (
              profile.mutualServers.map(s => (
                <div key={s.id} className="mutual-server-item">
                  <div className="mutual-server-icon">
                    {s.icon ? <img src={s.icon} alt="" /> : s.name?.[0]?.toUpperCase()}
                  </div>
                  <span>{s.name}</span>
                </div>
              ))
            ) : (
              <p className="muted">No mutual servers</p>
            )}
            {profile.mutualFriends?.length > 0 && (
              <>
                <h4 className="profile-popup-mutual-friends-header">
                  Mutual Friends &mdash; {profile.mutualFriends.length}
                </h4>
                {profile.mutualFriends.map(f => (
                  <div key={f.id} className="mutual-friend-item">
                    <div
                      className="mutual-friend-avatar"
                      style={{ background: `hsl(${(f.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)` }}
                    >
                      {f.avatar ? <img src={f.avatar} alt="" /> : f.username?.[0]?.toUpperCase()}
                    </div>
                    <span>{f.username}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {userId !== user?.id && (
        <div className="profile-popup-actions">
          <button onClick={() => { openDm(userId); onClose(); }}>Message</button>
        </div>
      )}
    </div>
  );

  return createPortal(popup, document.body);
}
