import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';
import { PERMISSIONS } from '../utils/permissions';

export default function ServerSettings() {
  const {
    currentServer, toggleServerSettings, roles, channels, categories,
    createChannel, createRole, updateRole, selectServer, uploadServerIcon,
  } = useStore();
  const [tab, setTab] = useState('overview');
  const [serverName, setServerName] = useState(currentServer?.name || '');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [newChannelCategory, setNewChannelCategory] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865F2');
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePerms, setRolePerms] = useState({});
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconInputRef = useRef(null);

  const handleUpdateServer = async () => {
    await api.patch(`/servers/${currentServer.id}`, { name: serverName });
    selectServer(currentServer.id);
  };

  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      await uploadServerIcon(currentServer.id, file);
      selectServer(currentServer.id);
    } catch (err) {
      console.error('Icon upload error:', err);
    }
    setUploadingIcon(false);
    e.target.value = '';
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    await createChannel(currentServer.id, newChannelName.trim(), newChannelType, newChannelCategory || null);
    setNewChannelName('');
    selectServer(currentServer.id);
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    await createRole(currentServer.id, { name: newRoleName, color: newRoleColor });
    setNewRoleName('');
    selectServer(currentServer.id);
  };

  const handleUpdateRolePerms = async (roleId) => {
    const perms = rolePerms[roleId] || {};
    let permBits = 0n;
    for (const [key, enabled] of Object.entries(perms)) {
      if (enabled && PERMISSIONS[key]) {
        permBits |= PERMISSIONS[key];
      }
    }
    await updateRole(currentServer.id, roleId, { permissions: permBits.toString() });
    selectServer(currentServer.id);
  };

  const permList = [
    ['ADMINISTRATOR', 'Administrator'],
    ['MANAGE_SERVER', 'Manage Server'],
    ['MANAGE_CHANNELS', 'Manage Channels'],
    ['MANAGE_ROLES', 'Manage Roles'],
    ['MANAGE_MESSAGES', 'Manage Messages'],
    ['KICK_MEMBERS', 'Kick Members'],
    ['BAN_MEMBERS', 'Ban Members'],
    ['CREATE_INVITE', 'Create Invite'],
    ['SEND_MESSAGES', 'Send Messages'],
    ['ATTACH_FILES', 'Attach Files'],
    ['ADD_REACTIONS', 'Add Reactions'],
    ['CONNECT', 'Connect (Voice)'],
    ['SPEAK', 'Speak (Voice)'],
    ['MUTE_MEMBERS', 'Mute Members (Voice)'],
    ['DEAFEN_MEMBERS', 'Deafen Members (Voice)'],
    ['MOVE_MEMBERS', 'Move Members (Voice)'],
    ['MENTION_EVERYONE', 'Mention Everyone'],
    ['MANAGE_NICKNAMES', 'Manage Nicknames'],
    ['VIEW_CHANNEL', 'View Channels'],
    ['READ_MESSAGE_HISTORY', 'Read Message History'],
  ];

  return (
    <div className="settings-page">
      <div className="settings-nav">
        <div className="settings-nav-inner">
          <div className="settings-nav-category">{currentServer?.name}</div>
          <button className={`settings-nav-item ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`settings-nav-item ${tab === 'channels' ? 'active' : ''}`} onClick={() => setTab('channels')}>Channels</button>
          <button className={`settings-nav-item ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Roles</button>
          <button className={`settings-nav-item ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Members</button>
          <button className={`settings-nav-item ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>Invites</button>
          <button className={`settings-nav-item ${tab === 'bans' ? 'active' : ''}`} onClick={() => setTab('bans')}>Bans</button>
        </div>
      </div>

      <div className="settings-content">
        <button className="settings-close" onClick={toggleServerSettings}>✕</button>

        {tab === 'overview' && (
          <>
            <div className="settings-title">Server Overview</div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%', background: 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', flexShrink: 0, position: 'relative',
              }} onClick={() => iconInputRef.current?.click()}>
                {currentServer?.icon ? (
                  <img src={currentServer.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 36, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {currentServer?.name?.[0]?.toUpperCase()}
                  </span>
                )}
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.15s', fontSize: 12, fontWeight: 600, color: 'white',
                  flexDirection: 'column', gap: 2,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
                >
                  {uploadingIcon ? '...' : 'CHANGE ICON'}
                </div>
                <input type="file" ref={iconInputRef} accept="image/*" onChange={handleIconUpload} hidden />
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="form-label">Server Name</label>
                  <input className="form-input" value={serverName} onChange={e => setServerName(e.target.value)} />
                </div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleUpdateServer}>Save Changes</button>
          </>
        )}

        {tab === 'channels' && (
          <>
            <div className="settings-title">Channels</div>
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>Create Channel</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Name</label>
                  <input className="form-input" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="new-channel" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={newChannelType} onChange={e => setNewChannelType(e.target.value)} style={{ cursor: 'pointer' }}>
                    <option value="text">Text</option>
                    <option value="voice">Voice</option>
                    <option value="announcement">Announcement</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={newChannelCategory} onChange={e => setNewChannelCategory(e.target.value)} style={{ cursor: 'pointer' }}>
                    <option value="">None</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={handleCreateChannel} style={{ height: 38 }}>Create</button>
              </div>
            </div>

            <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>Existing Channels</h4>
            {channels.map(ch => (
              <div key={ch.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, gap: 8 }}>
                <span style={{ color: 'var(--channel-icon)' }}>{ch.type === 'voice' ? '🔊' : '#'}</span>
                <span style={{ flex: 1 }}>{ch.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ch.type}</span>
              </div>
            ))}
          </>
        )}

        {tab === 'roles' && (
          <>
            <div className="settings-title">Roles</div>
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>Create Role</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Name</label>
                  <input className="form-input" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Role Name" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Color</label>
                  <input type="color" value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)} style={{ height: 38, width: 50, cursor: 'pointer', background: 'transparent', border: 'none' }} />
                </div>
                <button className="btn btn-primary" onClick={handleCreateRole} style={{ height: 38 }}>Create</button>
              </div>
            </div>

            <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>Existing Roles</h4>
            {roles.map(role => (
              <div key={role.id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', padding: '8px 12px',
                    background: selectedRole === role.id ? 'var(--bg-modifier-selected)' : 'var(--bg-secondary)',
                    borderRadius: 4, cursor: 'pointer', gap: 8,
                  }}
                  onClick={() => {
                    setSelectedRole(selectedRole === role.id ? null : role.id);
                    // Parse current permissions
                    const perms = BigInt(role.permissions || '0');
                    const parsed = {};
                    for (const [key] of permList) {
                      if (PERMISSIONS[key]) {
                        parsed[key] = (perms & PERMISSIONS[key]) === PERMISSIONS[key];
                      }
                    }
                    setRolePerms(prev => ({ ...prev, [role.id]: parsed }));
                  }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: role.color }} />
                  <span style={{ flex: 1, color: role.color !== '#99AAB5' ? role.color : 'var(--text-normal)' }}>{role.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Position: {role.position}</span>
                </div>

                {selectedRole === role.id && !role.is_default && (
                  <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '0 0 4px 4px' }}>
                    <h5 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>Permissions</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {permList.map(([key, label]) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-normal)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={rolePerms[role.id]?.[key] || false}
                            onChange={e => setRolePerms(prev => ({
                              ...prev,
                              [role.id]: { ...prev[role.id], [key]: e.target.checked },
                            }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button className="btn btn-primary" onClick={() => handleUpdateRolePerms(role.id)} style={{ marginTop: 12 }}>
                      Save Permissions
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'members' && <ServerMembers />}
        {tab === 'invites' && <ServerInvites />}
        {tab === 'bans' && <ServerBans />}
      </div>
    </div>
  );
}

function ServerMembers() {
  const { members, roles, currentServer, assignRole } = useStore();
  const [assigningRole, setAssigningRole] = useState({});

  const handleAssignRole = async (userId, roleId) => {
    await assignRole(currentServer.id, userId, roleId);
    useStore.getState().selectServer(currentServer.id);
  };

  return (
    <>
      <div className="settings-title">Members ({members.length})</div>
      {members.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `hsl(${(m.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
            fontSize: 14, fontWeight: 600,
          }}>
            {m.username?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 14 }}>{m.nickname || m.username}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.username}#{m.discriminator}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {m.roles?.map(rid => {
              const r = roles.find(role => role.id === rid);
              return r ? (
                <span key={rid} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', color: r.color !== '#99AAB5' ? r.color : 'var(--text-muted)' }}>
                  {r.name}
                </span>
              ) : null;
            })}
          </div>
          <select
            className="form-input"
            style={{ width: 140, fontSize: 12, padding: 4 }}
            value=""
            onChange={e => e.target.value && handleAssignRole(m.id, e.target.value)}
          >
            <option value="">Add role...</option>
            {roles.filter(r => !r.is_default && !m.roles?.includes(r.id)).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}

function ServerInvites() {
  const { currentServer } = useStore();
  const [invites, setInvites] = useState([]);

  React.useEffect(() => {
    api.get(`/servers/${currentServer.id}/invites`).then(setInvites).catch(() => {});
  }, [currentServer.id]);

  return (
    <>
      <div className="settings-title">Invites</div>
      {invites.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No active invites</div>
      ) : (
        invites.map(inv => (
          <div key={inv.code} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, gap: 8 }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--text-link)' }}>{inv.code}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>#{inv.channel_name}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>by {inv.inviter_username}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{inv.uses} uses</span>
          </div>
        ))
      )}
    </>
  );
}

function ServerBans() {
  const { currentServer } = useStore();
  const [bans, setBans] = useState([]);

  React.useEffect(() => {
    api.get(`/servers/${currentServer.id}/bans`).then(setBans).catch(() => {});
  }, [currentServer.id]);

  return (
    <>
      <div className="settings-title">Bans</div>
      {bans.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No bans</div>
      ) : (
        bans.map(ban => (
          <div key={ban.user_id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{ban.username}#{ban.discriminator}</span>
            {ban.reason && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>- {ban.reason}</span>}
          </div>
        ))
      )}
    </>
  );
}
