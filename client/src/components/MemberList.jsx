import React from 'react';
import { useStore } from '../store';

export default function MemberList() {
  const { members, roles, openDm, user } = useStore();

  // Group members by online/offline and roles
  const onlineMembers = members.filter(m => m.status !== 'offline');
  const offlineMembers = members.filter(m => m.status === 'offline');

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
              <MemberItem key={m.id} member={m} role={role} onDm={() => m.id !== user.id && openDm(m.id)} />
            ))}
          </div>
        );
      })}

      {/* Online members without hoisted role */}
      {ungrouped.length > 0 && (
        <>
          <div className="member-category">Online — {ungrouped.length}</div>
          {ungrouped.map(m => (
            <MemberItem key={m.id} member={m} onDm={() => m.id !== user.id && openDm(m.id)} />
          ))}
        </>
      )}

      {/* Offline */}
      {offlineMembers.length > 0 && (
        <>
          <div className="member-category">Offline — {offlineMembers.length}</div>
          {offlineMembers.map(m => (
            <MemberItem key={m.id} member={m} onDm={() => m.id !== user.id && openDm(m.id)} />
          ))}
        </>
      )}
    </div>
  );
}

function MemberItem({ member, role, onDm }) {
  const avatarColor = `hsl(${(member.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`;
  const nameColor = role?.color !== '#99AAB5' ? role?.color : undefined;

  return (
    <div className="member-item" onClick={onDm}>
      <div className="member-avatar" style={{ background: avatarColor }}>
        {member.avatar ? (
          <img src={member.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
        ) : (
          member.username?.[0]?.toUpperCase()
        )}
        <div className={`status-dot ${member.status || 'offline'}`} />
      </div>
      <span className={`member-name ${member.status !== 'offline' ? 'online' : ''}`} style={{ color: nameColor }}>
        {member.nickname || member.username}
      </span>
    </div>
  );
}
