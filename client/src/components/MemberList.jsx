import React, { useState } from 'react';
import { useStore } from '../store';
import UserProfilePopup from './UserProfilePopup';

export default function MemberList() {
  const { members, roles, user } = useStore();
  const [profilePopup, setProfilePopup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter members based on search query
  const filteredMembers = members.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.username?.toLowerCase().includes(q) || m.nickname?.toLowerCase().includes(q);
  });

  // Group members by online/offline and roles
  const onlineMembers = filteredMembers.filter(m => m.status !== 'offline');
  const offlineMembers = filteredMembers.filter(m => m.status === 'offline');

  // Group by highest role
  const hoistRoles = roles.filter(r => r.hoist && !r.is_default).sort((a, b) => b.position - a.position);

  const grouped = {};
  const ungrouped = [];

  for (const member of onlineMembers) {
    let placed = false;
    for (const role of hoistRoles) {
      if (member.roles?.includes(role.id)) {
        if (!grouped[role.id]) grouped[role.id] = { role, members: [] };
        grouped[role.id].members.push(member);
        placed = true;
        break;
      }
    }
    if (!placed) ungrouped.push(member);
  }

  return (
    <div className="member-list">
      <div className="member-search">
        <svg className="member-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.707 20.293l-5.395-5.396A7.946 7.946 0 0018 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8a7.946 7.946 0 004.897-1.688l5.396 5.395a.997.997 0 001.414 0 .999.999 0 000-1.414zM10 16c-3.309 0-6-2.691-6-6s2.691-6 6-6 6 2.691 6 6-2.691 6-6 6z"/>
        </svg>
        <input
          className="member-search-input"
          placeholder="Search members"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="member-search-clear" onClick={() => setSearchQuery('')}>&#x2715;</button>
        )}
      </div>
      {searchQuery && (
        <div className="member-search-count">{filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''} found</div>
      )}
      {/* Hoisted role groups */}
      {hoistRoles.map(role => {
        const group = grouped[role.id];
        if (!group || group.members.length === 0) return null;
        return (
          <div key={role.id}>
            <div className="member-category" style={{ color: role.color !== '#99AAB5' ? role.color : undefined }}>
              {role.name} — {group.members.length}
            </div>
            {group.members.map(m => (
              <MemberItem key={m.id} member={m} role={role} onShowProfile={(e) => setProfilePopup({ userId: m.id, x: e.clientX, y: e.clientY })} />
            ))}
          </div>
        );
      })}

      {/* Online members without hoisted role */}
      {ungrouped.length > 0 && (
        <>
          <div className="member-category">Online — {ungrouped.length}</div>
          {ungrouped.map(m => (
            <MemberItem key={m.id} member={m} onShowProfile={(e) => setProfilePopup({ userId: m.id, x: e.clientX, y: e.clientY })} />
          ))}
        </>
      )}

      {/* Offline */}
      {offlineMembers.length > 0 && (
        <>
          <div className="member-category">Offline — {offlineMembers.length}</div>
          {offlineMembers.map(m => (
            <MemberItem key={m.id} member={m} onShowProfile={(e) => setProfilePopup({ userId: m.id, x: e.clientX, y: e.clientY })} />
          ))}
        </>
      )}
      {profilePopup && (
        <UserProfilePopup
          userId={profilePopup.userId}
          position={{ x: profilePopup.x, y: profilePopup.y }}
          onClose={() => setProfilePopup(null)}
        />
      )}
    </div>
  );
}

function getActivityLabel(type) {
  switch (type) {
    case 'playing': return 'Playing';
    case 'listening': return 'Listening to';
    case 'watching': return 'Watching';
    case 'streaming': return 'Streaming';
    case 'competing': return 'Competing in';
    case 'custom': return '';
    default: return '';
  }
}

function MemberItem({ member, role, onShowProfile }) {
  const avatarColor = `hsl(${(member.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;
  const nameColor = role?.color !== '#99AAB5' ? role?.color : undefined;
  const activity = useStore(s => s.userActivities[member.id]);

  return (
    <div className="member-item" onClick={onShowProfile}>
      <div className="member-avatar" style={{ background: avatarColor }}>
        {member.avatar ? (
          <img src={member.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
        ) : (
          member.username?.[0]?.toUpperCase()
        )}
        <div className={`status-dot ${member.status || 'offline'}`} />
      </div>
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <span className={`member-name ${member.status !== 'offline' ? 'online' : ''}`} style={{ color: nameColor }}>
          {member.nickname || member.username}
        </span>
        {activity && (
          <div className="member-activity">
            <span className="activity-type">{getActivityLabel(activity.type)}</span>{' '}
            <span className="activity-name">{activity.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
