import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';
import { createPortal } from 'react-dom';

export default function ProfileCard({ userId, position, onClose }) {
  const [profile, setProfile] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [cardStyle, setCardStyle] = useState({ visibility: 'hidden' });
  const cardRef = useRef(null);
  const { roles, members, currentServer, openDm, user } = useStore();

  useEffect(() => {
    api.get(`/users/${userId}`).then(setProfile).catch(() => {});

    // Get roles from members list
    const member = members.find(m => m.id === userId);
    if (member && roles.length > 0) {
      const memberRoles = roles.filter(r => member.roles?.includes(r.id) && !r.is_default);
      setUserRoles(memberRoles);
    }
  }, [userId]);

  // Position card after it renders so we know its actual height
  useEffect(() => {
    if (!cardRef.current || !position || !profile) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const cardW = rect.width || 340;
    const cardH = rect.height || 400;
    const pad = 8;

    let left = position.x;
    let top = position.y;

    // If card would go off right edge, show to left of the anchor
    if (left + cardW + pad > window.innerWidth) {
      left = position.anchorLeft - cardW - pad;
    }
    // If still off left edge, clamp to left
    if (left < pad) left = pad;

    // If card would go off bottom, shift up
    if (top + cardH + pad > window.innerHeight) {
      top = window.innerHeight - cardH - pad;
    }
    // If off top, clamp
    if (top < pad) top = pad;

    setCardStyle({ left, top, visibility: 'visible' });
  }, [position, profile]);

  useEffect(() => {
    const handler = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!profile) return null;

  const avatarColor = `hsl(${(userId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;
  const bannerColor = profile.banner_color || avatarColor;

  const card = (
    <div className="profile-popover" ref={cardRef} style={cardStyle}>
      <div className="profile-banner" style={{ background: bannerColor }} />
      <div className="profile-avatar-wrapper">
        <div className="profile-avatar-large" style={{ background: avatarColor }}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          ) : (
            profile.username?.[0]?.toUpperCase()
          )}
        </div>
      </div>
      <div className="profile-body">
        <div className="profile-username">{profile.username}</div>
        <div className="profile-tag">#{profile.discriminator}</div>

        {profile.custom_status && (
          <div style={{ fontSize: 13, color: 'var(--text-normal)', marginTop: 4 }}>
            {profile.custom_status}
          </div>
        )}

        {profile.about_me && (
          <div className="profile-section">
            <div className="profile-section-title">About Me</div>
            <div className="profile-about">{profile.about_me}</div>
          </div>
        )}

        <div className="profile-section">
          <div className="profile-section-title">Member Since</div>
          <div style={{ fontSize: 13, color: 'var(--text-normal)' }}>
            {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {userRoles.length > 0 && (
          <div className="profile-section">
            <div className="profile-section-title">Roles</div>
            <div className="profile-roles">
              {userRoles.map(r => (
                <span key={r.id} className="profile-role-tag">
                  <span className="profile-role-dot" style={{ background: r.color !== '#99AAB5' ? r.color : 'var(--text-muted)' }} />
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {userId !== user?.id && (
          <div className="profile-actions">
            <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={() => { openDm(userId); onClose(); }}>
              Send Message
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Render via portal so it's not clipped by overflow:hidden ancestors
  return createPortal(card, document.body);
}
