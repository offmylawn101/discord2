import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';
import { PERMISSIONS, hasPermission } from '../utils/permissions';

export default function ServerSettings() {
  const {
    currentServer, toggleServerSettings, roles, channels, categories,
    createChannel, createRole, updateRole, selectServer, uploadServerIcon,
    uploadServerBanner, removeServerBanner,
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
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [isPublic, setIsPublic] = useState(!!currentServer?.is_public);
  const [serverDescription, setServerDescription] = useState(currentServer?.description || '');
  const iconInputRef = useRef(null);

  const handleUpdateServer = async () => {
    await api.patch(`/servers/${currentServer.id}`, {
      name: serverName,
      is_public: isPublic,
      description: serverDescription,
    });
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

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      await uploadServerBanner(currentServer.id, file);
      selectServer(currentServer.id);
    } catch (err) {
      console.error('Banner upload error:', err);
    }
    setUploadingBanner(false);
    e.target.value = '';
  };

  const handleRemoveBanner = async () => {
    try {
      await removeServerBanner(currentServer.id);
      selectServer(currentServer.id);
    } catch (err) {
      console.error('Banner remove error:', err);
    }
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
    ['MANAGE_WEBHOOKS', 'Manage Webhooks'],
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
          <button className={`settings-nav-item ${tab === 'emoji' ? 'active' : ''}`} onClick={() => setTab('emoji')}>Emoji</button>
          <button className={`settings-nav-item ${tab === 'channels' ? 'active' : ''}`} onClick={() => setTab('channels')}>Channels</button>
          <button className={`settings-nav-item ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Roles</button>
          <button className={`settings-nav-item ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Members</button>
          <button className={`settings-nav-item ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>Invites</button>
          <button className={`settings-nav-item ${tab === 'bans' ? 'active' : ''}`} onClick={() => setTab('bans')}>Bans</button>
          <button className={`settings-nav-item ${tab === 'webhooks' ? 'active' : ''}`} onClick={() => setTab('webhooks')}>Webhooks</button>
          <button className={`settings-nav-item ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>Events</button>
          <button className={`settings-nav-item ${tab === 'automod' ? 'active' : ''}`} onClick={() => setTab('automod')}>AutoMod</button>
          <button className={`settings-nav-item ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>Audit Log</button>
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

            {/* Server Banner */}
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Server Banner</label>
              {currentServer?.banner ? (
                <div className="server-banner-preview">
                  <img src={currentServer.banner} alt="Server banner" />
                  <div className="banner-actions">
                    <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                      {uploadingBanner ? 'Uploading...' : 'Change Banner'}
                      <input type="file" accept="image/*" hidden onChange={handleBannerUpload} />
                    </label>
                    <button className="btn btn-danger" onClick={handleRemoveBanner}>Remove</button>
                  </div>
                </div>
              ) : (
                <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  {uploadingBanner ? 'Uploading...' : 'Upload Banner'}
                  <input type="file" accept="image/*" hidden onChange={handleBannerUpload} />
                </label>
              )}
            </div>

            {/* Server Description */}
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Server Description</label>
              <textarea
                className="form-input"
                value={serverDescription}
                onChange={e => setServerDescription(e.target.value)}
                placeholder="Tell people about your server..."
                rows={3}
                maxLength={1024}
                style={{ resize: 'vertical', minHeight: 60 }}
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {serverDescription.length}/1024
              </div>
            </div>

            {/* Public Server Toggle */}
            <div style={{
              padding: 16, background: 'var(--bg-secondary)', borderRadius: 8,
              marginBottom: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 15 }}>
                    Public Server
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    Make this server visible in Server Discovery so anyone can find and join it.
                  </div>
                </div>
                <label style={{
                  position: 'relative', display: 'inline-block',
                  width: 44, height: 24, flexShrink: 0, marginLeft: 16,
                }}>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={e => setIsPublic(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: isPublic ? 'var(--green-360)' : 'var(--bg-tertiary)',
                    borderRadius: 12, transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', height: 18, width: 18,
                      left: isPublic ? 22 : 3, bottom: 3,
                      background: 'white', borderRadius: '50%',
                      transition: 'left 0.2s',
                    }} />
                  </span>
                </label>
              </div>
              {isPublic && (
                <div style={{
                  fontSize: 12, color: 'var(--yellow-300)', marginTop: 8,
                  padding: '8px 12px', background: 'rgba(250, 168, 26, 0.1)',
                  borderRadius: 4,
                }}>
                  Your server will be visible to everyone in Server Discovery. Make sure to set a good description and follow the community guidelines.
                </div>
              )}
            </div>

            <button className="btn btn-primary" onClick={handleUpdateServer}>Save Changes</button>
          </>
        )}

        {tab === 'emoji' && <ServerEmojis />}

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
                <button
                  onClick={() => {
                    toggleServerSettings();
                    useStore.getState().openChannelSettings(ch.id);
                  }}
                  style={{
                    width: 28, height: 28, background: 'transparent', border: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-modifier-hover)'; e.currentTarget.style.color = 'var(--text-normal)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  title="Channel Settings"
                >
                  &#9881;
                </button>
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
        {tab === 'webhooks' && <ServerWebhooks />}
        {tab === 'events' && <ServerEventsManager />}
        {tab === 'automod' && <ServerAutoMod />}
        {tab === 'audit' && <ServerAuditLog />}
      </div>
    </div>
  );
}

function ServerMembers() {
  const { members, roles, currentServer, assignRole, setNickname } = useStore();
  const [assigningRole, setAssigningRole] = useState({});
  const [editingNickname, setEditingNickname] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');

  const handleAssignRole = async (userId, roleId) => {
    await assignRole(currentServer.id, userId, roleId);
    useStore.getState().selectServer(currentServer.id);
  };

  const handleNicknameEdit = (member) => {
    setEditingNickname(member.id);
    setNicknameInput(member.nickname || '');
  };

  const handleNicknameSave = async (userId) => {
    try {
      await setNickname(currentServer.id, userId, nicknameInput.trim() || null);
    } catch (err) {
      console.error('Nickname save error:', err);
    }
    setEditingNickname(null);
  };

  const handleNicknameKeyDown = (e, userId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNicknameSave(userId);
    } else if (e.key === 'Escape') {
      setEditingNickname(null);
    }
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
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingNickname === m.id ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  className="form-input"
                  value={nicknameInput}
                  onChange={e => setNicknameInput(e.target.value)}
                  onKeyDown={e => handleNicknameKeyDown(e, m.id)}
                  placeholder={m.username}
                  maxLength={32}
                  autoFocus
                  style={{ fontSize: 13, padding: '2px 6px', flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handleNicknameSave(m.id)}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  Save
                </button>
                <button
                  className="btn"
                  onClick={() => setEditingNickname(null)}
                  style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-tertiary)' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 14 }}>{m.nickname || m.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.username}#{m.discriminator}</div>
                </div>
                <span
                  style={{ cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', marginLeft: 4, opacity: 0.6 }}
                  onClick={() => handleNicknameEdit(m)}
                  title="Edit nickname"
                >
                  &#9998;
                </span>
              </div>
            )}
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

function ServerEmojis() {
  const { currentServer, serverEmojis, uploadEmoji, deleteEmoji, renameEmoji } = useStore();
  const [uploading, setUploading] = useState(false);
  const [newEmojiName, setNewEmojiName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 256 * 1024) {
      setError('File must be under 256KB');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    setFilePreview(URL.createObjectURL(file));
    setError('');
    if (!newEmojiName) {
      const baseName = file.name.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
      setNewEmojiName(baseName);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !newEmojiName.trim()) return;
    const name = newEmojiName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (name.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await uploadEmoji(currentServer.id, name, selectedFile);
      setNewEmojiName('');
      setSelectedFile(null);
      setFilePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleDelete = async (emojiId) => {
    try {
      await deleteEmoji(currentServer.id, emojiId);
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleRename = async (emojiId) => {
    const name = editName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (name.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    try {
      await renameEmoji(currentServer.id, emojiId, name);
      setEditingId(null);
      setEditName('');
    } catch (err) {
      setError(err.message || 'Rename failed');
    }
  };

  const formatDate = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <div className="settings-title">Emoji</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
        Add custom emoji for everyone on this server to use. Emoji must be under 256KB.
      </p>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)', color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Upload section */}
      <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ color: 'var(--header-secondary)', marginBottom: 12, fontSize: 14 }}>Upload Emoji</h4>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div
              style={{
                width: 48, height: 48, borderRadius: 4, background: 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', border: '2px dashed var(--bg-modifier-active)',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {filePreview ? (
                <img src={filePreview} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>+</span>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              hidden
            />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={newEmojiName}
              onChange={e => setNewEmojiName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="emoji_name"
              maxLength={32}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !newEmojiName.trim()}
            style={{ height: 38 }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {newEmojiName && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            Will be used as <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>:{newEmojiName}:</code>
          </div>
        )}
      </div>

      {/* Emoji list */}
      <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>
        Emoji - {serverEmojis.length}
      </h4>
      {serverEmojis.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
          No custom emoji yet. Upload one above!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header row */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 12,
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
          }}>
            <span style={{ width: 40 }}>Image</span>
            <span style={{ flex: 1 }}>Name</span>
            <span style={{ width: 100 }}>Uploaded</span>
            <span style={{ width: 60 }}></span>
          </div>
          {serverEmojis.map(emoji => (
            <div key={emoji.id} style={{
              display: 'flex', alignItems: 'center', padding: '8px 12px',
              background: 'var(--bg-secondary)', borderRadius: 4, gap: 12,
            }}>
              <img
                src={emoji.image_url}
                alt={emoji.name}
                style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }}
              />
              <div style={{ flex: 1 }}>
                {editingId === emoji.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      className="form-input"
                      value={editName}
                      onChange={e => setEditName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(emoji.id);
                        if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                      }}
                      style={{ padding: '2px 6px', fontSize: 13, height: 28 }}
                      autoFocus
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => handleRename(emoji.id)}
                      style={{ padding: '2px 8px', fontSize: 12, height: 28 }}
                    >
                      Save
                    </button>
                    <button
                      className="btn"
                      onClick={() => { setEditingId(null); setEditName(''); }}
                      style={{ padding: '2px 8px', fontSize: 12, height: 28, background: 'var(--bg-tertiary)', color: 'var(--text-normal)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span
                    style={{ cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => { setEditingId(emoji.id); setEditName(emoji.name); }}
                    title="Click to rename"
                  >
                    :{emoji.name}:
                  </span>
                )}
              </div>
              <span style={{ width: 100, fontSize: 12, color: 'var(--text-muted)' }}>
                {formatDate(emoji.created_at)}
              </span>
              <button
                onClick={() => handleDelete(emoji.id)}
                style={{
                  width: 28, height: 28, background: 'transparent', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(237,66,69,0.15)'; e.currentTarget.style.color = '#ED4245'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                title="Delete emoji"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ServerAutoMod() {
  const { currentServer, roles, channels, automodRules, fetchAutomodRules, createAutomodRule, updateAutomodRule, deleteAutomodRule, toggleAutomodRule } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Create form state
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('keyword');
  const [actionType, setActionType] = useState('block');
  const [keywords, setKeywords] = useState('');
  const [maxMessages, setMaxMessages] = useState(5);
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [maxMentions, setMaxMentions] = useState(10);
  const [blockedDomains, setBlockedDomains] = useState('');
  const [allowListDomains, setAllowListDomains] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [alertChannelId, setAlertChannelId] = useState('');
  const [timeoutDuration, setTimeoutDuration] = useState(300);
  const [exemptRoleIds, setExemptRoleIds] = useState([]);
  const [exemptChannelIds, setExemptChannelIds] = useState([]);

  React.useEffect(() => {
    setLoading(true);
    fetchAutomodRules(currentServer.id).finally(() => setLoading(false));
  }, [currentServer.id]);

  const resetForm = () => {
    setName('');
    setTriggerType('keyword');
    setActionType('block');
    setKeywords('');
    setMaxMessages(5);
    setIntervalSeconds(5);
    setMaxMentions(10);
    setBlockedDomains('');
    setAllowListDomains('');
    setCustomMessage('');
    setAlertChannelId('');
    setTimeoutDuration(300);
    setExemptRoleIds([]);
    setExemptChannelIds([]);
    setEditingRule(null);
    setError('');
  };

  const populateForm = (rule) => {
    setName(rule.name);
    setTriggerType(rule.trigger_type);
    setActionType(rule.action_type);
    const tm = rule.trigger_metadata || {};
    const am = rule.action_metadata || {};
    setKeywords((tm.keywords || []).join('\n'));
    setMaxMessages(tm.max_messages || 5);
    setIntervalSeconds(tm.interval_seconds || 5);
    setMaxMentions(tm.max_mentions || 10);
    setBlockedDomains((tm.blocked_domains || []).join('\n'));
    setAllowListDomains((tm.allow_list || []).join('\n'));
    setCustomMessage(am.custom_message || '');
    setAlertChannelId(am.alert_channel_id || '');
    setTimeoutDuration(am.duration_seconds || 300);
    setExemptRoleIds(rule.exempt_roles || []);
    setExemptChannelIds(rule.exempt_channels || []);
  };

  const buildTriggerMetadata = () => {
    switch (triggerType) {
      case 'keyword':
        return {
          keywords: keywords.split('\n').map(k => k.trim()).filter(Boolean),
          regex_patterns: [],
        };
      case 'spam':
        return {
          max_messages: parseInt(maxMessages) || 5,
          interval_seconds: parseInt(intervalSeconds) || 5,
        };
      case 'mention_spam':
        return { max_mentions: parseInt(maxMentions) || 10 };
      case 'link':
        return {
          blocked_domains: blockedDomains.split('\n').map(d => d.trim()).filter(Boolean),
          allow_list: allowListDomains.split('\n').map(d => d.trim()).filter(Boolean),
        };
      default:
        return {};
    }
  };

  const buildActionMetadata = () => {
    switch (actionType) {
      case 'block':
        return { custom_message: customMessage || undefined };
      case 'alert':
        return { alert_channel_id: alertChannelId || undefined };
      case 'timeout':
        return {
          duration_seconds: parseInt(timeoutDuration) || 300,
          alert_channel_id: alertChannelId || undefined,
        };
      default:
        return {};
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }

    setError('');
    try {
      const data = {
        name: name.trim(),
        trigger_type: triggerType,
        trigger_metadata: buildTriggerMetadata(),
        action_type: actionType,
        action_metadata: buildActionMetadata(),
        exempt_roles: exemptRoleIds,
        exempt_channels: exemptChannelIds,
      };

      if (editingRule) {
        await updateAutomodRule(currentServer.id, editingRule.id, data);
      } else {
        await createAutomodRule(currentServer.id, data);
      }
      resetForm();
      setShowCreate(false);
    } catch (err) {
      setError(err.message || 'Failed to save rule');
    }
  };

  const handleDelete = async (ruleId) => {
    try {
      await deleteAutomodRule(currentServer.id, ruleId);
    } catch (err) {
      setError(err.message || 'Failed to delete rule');
    }
  };

  const handleToggle = async (ruleId, currentEnabled) => {
    try {
      await toggleAutomodRule(currentServer.id, ruleId, !currentEnabled);
    } catch (err) {
      setError(err.message || 'Failed to toggle rule');
    }
  };

  const handleEdit = (rule) => {
    populateForm(rule);
    setEditingRule(rule);
    setShowCreate(true);
  };

  const handleExemptRoleToggle = (roleId) => {
    setExemptRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    );
  };

  const handleExemptChannelToggle = (channelId) => {
    setExemptChannelIds(prev =>
      prev.includes(channelId) ? prev.filter(c => c !== channelId) : [...prev, channelId]
    );
  };

  const triggerTypeLabels = {
    keyword: 'Keyword Filter',
    spam: 'Spam Protection',
    mention_spam: 'Mention Spam',
    link: 'Link Filter',
  };

  const actionTypeLabels = {
    block: 'Block Message',
    alert: 'Send Alert',
    timeout: 'Timeout User',
  };

  const actionTypeColors = {
    block: '#ED4245',
    alert: '#FEE75C',
    timeout: '#EB459E',
  };

  const triggerTypeColors = {
    keyword: '#5865F2',
    spam: '#57F287',
    mention_spam: '#FEE75C',
    link: '#EB459E',
  };

  const textChannels = channels.filter(c => c.type === 'text' || c.type === 'announcement');
  const nonDefaultRoles = roles.filter(r => !r.is_default);

  return (
    <>
      <div className="settings-title">AutoMod</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
        Set up automated content moderation rules to keep your server safe.
        Server owners and administrators bypass all AutoMod rules.
      </p>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)', color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!showCreate && (
        <button
          className="btn btn-primary"
          onClick={() => { resetForm(); setShowCreate(true); }}
          style={{ marginBottom: 20 }}
        >
          Create Rule
        </button>
      )}

      {showCreate && (
        <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
          <h4 style={{ color: 'var(--header-secondary)', marginBottom: 12, fontSize: 14 }}>
            {editingRule ? 'Edit Rule' : 'Create Rule'}
          </h4>

          {/* Name */}
          <div className="form-group">
            <label className="form-label">Rule Name</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Block Bad Words"
              maxLength={100}
            />
          </div>

          {/* Trigger Type */}
          <div className="form-group">
            <label className="form-label">Trigger Type</label>
            <select
              className="form-input"
              value={triggerType}
              onChange={e => setTriggerType(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="keyword">Keyword Filter</option>
              <option value="spam">Spam Protection</option>
              <option value="mention_spam">Mention Spam</option>
              <option value="link">Link Filter</option>
            </select>
          </div>

          {/* Trigger Config */}
          {triggerType === 'keyword' && (
            <div className="form-group">
              <label className="form-label">Keywords (one per line)</label>
              <textarea
                className="form-input"
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                placeholder={"badword1\nbadword2\nbadword3"}
                rows={4}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
          )}

          {triggerType === 'spam' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Max Messages</label>
                <input
                  className="form-input"
                  type="number"
                  value={maxMessages}
                  onChange={e => setMaxMessages(e.target.value)}
                  min={2}
                  max={50}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Interval (seconds)</label>
                <input
                  className="form-input"
                  type="number"
                  value={intervalSeconds}
                  onChange={e => setIntervalSeconds(e.target.value)}
                  min={1}
                  max={60}
                />
              </div>
            </div>
          )}

          {triggerType === 'mention_spam' && (
            <div className="form-group">
              <label className="form-label">Max Mentions Per Message</label>
              <input
                className="form-input"
                type="number"
                value={maxMentions}
                onChange={e => setMaxMentions(e.target.value)}
                min={1}
                max={100}
              />
            </div>
          )}

          {triggerType === 'link' && (
            <>
              <div className="form-group">
                <label className="form-label">Blocked Domains (one per line)</label>
                <textarea
                  className="form-input"
                  value={blockedDomains}
                  onChange={e => setBlockedDomains(e.target.value)}
                  placeholder={"spam.com\nmalware.net"}
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Allow List (one per line, optional)</label>
                <textarea
                  className="form-input"
                  value={allowListDomains}
                  onChange={e => setAllowListDomains(e.target.value)}
                  placeholder={"youtube.com\ntwitter.com"}
                  rows={2}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>
            </>
          )}

          {/* Action Type */}
          <div className="form-group">
            <label className="form-label">Action</label>
            <select
              className="form-input"
              value={actionType}
              onChange={e => setActionType(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="block">Block Message</option>
              <option value="alert">Send Alert</option>
              <option value="timeout">Timeout User</option>
            </select>
          </div>

          {/* Action Config */}
          {actionType === 'block' && (
            <div className="form-group">
              <label className="form-label">Custom Block Message (optional)</label>
              <input
                className="form-input"
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                placeholder="Your message was blocked by AutoMod"
              />
            </div>
          )}

          {(actionType === 'alert' || actionType === 'timeout') && (
            <div className="form-group">
              <label className="form-label">Alert Channel</label>
              <select
                className="form-input"
                value={alertChannelId}
                onChange={e => setAlertChannelId(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="">Select a channel...</option>
                {textChannels.map(ch => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
          )}

          {actionType === 'timeout' && (
            <>
              <div className="form-group">
                <label className="form-label">Timeout Duration (seconds)</label>
                <input
                  className="form-input"
                  type="number"
                  value={timeoutDuration}
                  onChange={e => setTimeoutDuration(e.target.value)}
                  min={60}
                  max={604800}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {timeoutDuration >= 3600
                    ? `${Math.floor(timeoutDuration / 3600)}h ${Math.floor((timeoutDuration % 3600) / 60)}m`
                    : `${Math.floor(timeoutDuration / 60)}m ${timeoutDuration % 60}s`}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Custom Block Message (optional)</label>
                <input
                  className="form-input"
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  placeholder="You have been timed out by AutoMod"
                />
              </div>
            </>
          )}

          {/* Exempt Roles */}
          {nonDefaultRoles.length > 0 && (
            <div className="form-group">
              <label className="form-label">Exempt Roles</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {nonDefaultRoles.map(role => (
                  <label
                    key={role.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
                      padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                      background: exemptRoleIds.includes(role.id) ? 'var(--bg-modifier-selected)' : 'var(--bg-tertiary)',
                      color: role.color !== '#99AAB5' ? role.color : 'var(--text-normal)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={exemptRoleIds.includes(role.id)}
                      onChange={() => handleExemptRoleToggle(role.id)}
                      style={{ display: 'none' }}
                    />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: role.color }} />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Exempt Channels */}
          {textChannels.length > 0 && (
            <div className="form-group">
              <label className="form-label">Exempt Channels</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {textChannels.map(ch => (
                  <label
                    key={ch.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
                      padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                      background: exemptChannelIds.includes(ch.id) ? 'var(--bg-modifier-selected)' : 'var(--bg-tertiary)',
                      color: 'var(--text-normal)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={exemptChannelIds.includes(ch.id)}
                      onChange={() => handleExemptChannelToggle(ch.id)}
                      style={{ display: 'none' }}
                    />
                    #{ch.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSubmit}>
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </button>
            <button
              className="btn"
              onClick={() => { resetForm(); setShowCreate(false); }}
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-normal)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Rules */}
      <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>
        Rules - {automodRules.length}
      </h4>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading rules...</div>
      ) : automodRules.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
          No AutoMod rules yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {automodRules.map(rule => (
            <div key={rule.id} style={{
              padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8,
              opacity: rule.enabled ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 15, flex: 1 }}>
                  {rule.name}
                </span>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600,
                  background: `${triggerTypeColors[rule.trigger_type] || '#5865F2'}22`,
                  color: triggerTypeColors[rule.trigger_type] || '#5865F2',
                }}>
                  {triggerTypeLabels[rule.trigger_type] || rule.trigger_type}
                </span>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600,
                  background: `${actionTypeColors[rule.action_type] || '#5865F2'}22`,
                  color: actionTypeColors[rule.action_type] || '#5865F2',
                }}>
                  {actionTypeLabels[rule.action_type] || rule.action_type}
                </span>
              </div>

              {/* Show trigger details */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {rule.trigger_type === 'keyword' && rule.trigger_metadata?.keywords?.length > 0 && (
                  <span>Keywords: {rule.trigger_metadata.keywords.slice(0, 5).join(', ')}{rule.trigger_metadata.keywords.length > 5 ? ` +${rule.trigger_metadata.keywords.length - 5} more` : ''}</span>
                )}
                {rule.trigger_type === 'spam' && (
                  <span>Max {rule.trigger_metadata?.max_messages || 5} messages in {rule.trigger_metadata?.interval_seconds || 5}s</span>
                )}
                {rule.trigger_type === 'mention_spam' && (
                  <span>Max {rule.trigger_metadata?.max_mentions || 10} mentions per message</span>
                )}
                {rule.trigger_type === 'link' && rule.trigger_metadata?.blocked_domains?.length > 0 && (
                  <span>Blocked: {rule.trigger_metadata.blocked_domains.slice(0, 3).join(', ')}{rule.trigger_metadata.blocked_domains.length > 3 ? ` +${rule.trigger_metadata.blocked_domains.length - 3} more` : ''}</span>
                )}
              </div>

              {/* Exemptions */}
              {((rule.exempt_roles?.length > 0) || (rule.exempt_channels?.length > 0)) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {rule.exempt_roles?.length > 0 && (
                    <span>Exempt roles: {rule.exempt_roles.length}</span>
                  )}
                  {rule.exempt_channels?.length > 0 && (
                    <span>Exempt channels: {rule.exempt_channels.length}</span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13,
                  color: rule.enabled ? '#57F287' : 'var(--text-muted)',
                }}>
                  <input
                    type="checkbox"
                    checked={!!rule.enabled}
                    onChange={() => handleToggle(rule.id, rule.enabled)}
                  />
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </label>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => handleEdit(rule)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-link)',
                    cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 4,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  style={{
                    background: 'transparent', border: 'none', color: '#ED4245',
                    cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 4,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(237,66,69,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ServerAuditLog() {
  const { currentServer } = useStore();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  React.useEffect(() => {
    setLoading(true);
    const params = filter ? `?action_type=${filter}` : '';
    api.get(`/servers/${currentServer.id}/audit-log${params}`)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [currentServer.id, filter]);

  const actionLabels = {
    SERVER_UPDATE: 'Updated server',
    CHANNEL_CREATE: 'Created channel',
    CHANNEL_UPDATE: 'Updated channel',
    CHANNEL_DELETE: 'Deleted channel',
    ROLE_CREATE: 'Created role',
    ROLE_UPDATE: 'Updated role',
    ROLE_DELETE: 'Deleted role',
    MEMBER_KICK: 'Kicked member',
    MEMBER_BAN: 'Banned member',
    MEMBER_UNBAN: 'Unbanned member',
    MEMBER_ROLE_UPDATE: 'Updated member roles',
    INVITE_CREATE: 'Created invite',
    MESSAGE_DELETE: 'Deleted message',
    MESSAGE_PIN: 'Pinned message',
  };

  const actionColors = {
    SERVER_UPDATE: '#5865F2',
    CHANNEL_CREATE: '#57F287',
    CHANNEL_UPDATE: '#FEE75C',
    CHANNEL_DELETE: '#ED4245',
    ROLE_CREATE: '#57F287',
    ROLE_UPDATE: '#FEE75C',
    ROLE_DELETE: '#ED4245',
    MEMBER_KICK: '#ED4245',
    MEMBER_BAN: '#ED4245',
    MEMBER_UNBAN: '#57F287',
    MEMBER_ROLE_UPDATE: '#5865F2',
    INVITE_CREATE: '#57F287',
    MESSAGE_DELETE: '#ED4245',
    MESSAGE_PIN: '#FEE75C',
  };

  const formatDate = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div className="settings-title">Audit Log</div>
      <div style={{ marginBottom: 16 }}>
        <select
          className="form-input"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: 200 }}
        >
          <option value="">All Actions</option>
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No audit log entries</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {entries.map(entry => (
            <div key={entry.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
              background: 'var(--bg-secondary)', borderRadius: 4,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: `hsl(${(entry.user_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
              }}>
                {entry.avatar ? (
                  <img src={`/uploads/${entry.avatar}`} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                ) : (
                  entry.username?.[0]?.toUpperCase() || '?'
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 14 }}>{entry.username}</span>
                  <span style={{
                    fontSize: 12, padding: '1px 6px', borderRadius: 3,
                    background: `${actionColors[entry.action] || '#5865F2'}22`,
                    color: actionColors[entry.action] || '#5865F2',
                    fontWeight: 600,
                  }}>
                    {actionLabels[entry.action] || entry.action}
                  </span>
                  {entry.target_type && entry.target_id && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {entry.target_type}: {entry.changes?.name || entry.target_id.slice(0, 8)}
                    </span>
                  )}
                </div>
                {entry.changes && Object.keys(entry.changes).length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {Object.entries(entry.changes).filter(([k, v]) => v !== undefined && v !== null).map(([key, value]) => (
                      <span key={key} style={{ marginRight: 8 }}>{key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                    ))}
                  </div>
                )}
                {entry.reason && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    Reason: {entry.reason}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{formatDate(entry.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ServerEventsManager() {
  const { currentServer, serverEvents, createEvent, updateEvent, deleteEvent, fetchServerEvents } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [eventStatus, setEventStatus] = useState('scheduled');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (currentServer?.id) {
      fetchServerEvents(currentServer.id);
    }
  }, [currentServer?.id]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setEventStatus('scheduled');
    setError('');
    setEditingEvent(null);
  };

  const toLocalDatetime = (isoStr) => {
    const date = new Date(isoStr);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setName(event.name);
    setDescription(event.description || '');
    setStartTime(toLocalDatetime(event.start_time));
    setEndTime(event.end_time ? toLocalDatetime(event.end_time) : '');
    setLocation(event.location || '');
    setEventStatus(event.status || 'scheduled');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Event name is required'); return; }
    if (!startTime) { setError('Start time is required'); return; }

    setSaving(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        description,
        start_time: new Date(startTime).toISOString(),
        end_time: endTime ? new Date(endTime).toISOString() : null,
        location,
      };

      if (editingEvent) {
        data.status = eventStatus;
        await updateEvent(currentServer.id, editingEvent.id, data);
      } else {
        await createEvent(currentServer.id, data);
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Failed to save event');
    }
    setSaving(false);
  };

  const handleDelete = async (eventId) => {
    try {
      await deleteEvent(currentServer.id, eventId);
    } catch (err) {
      setError(err.message || 'Failed to delete event');
    }
  };

  const formatDate = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  const statusColors = {
    scheduled: '#5865F2',
    active: '#57F287',
    completed: '#99AAB5',
    cancelled: '#ED4245',
  };

  return (
    <>
      <div className="settings-title">Events</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
        Create and manage server events. Members can show interest to get reminders.
      </p>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)', color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!showForm && (
        <button
          className="btn btn-primary"
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{ marginBottom: 20 }}
        >
          Create Event
        </button>
      )}

      {showForm && (
        <div style={{
          marginBottom: 20, padding: 16, background: 'var(--bg-secondary)',
          borderRadius: 8, border: '1px solid var(--bg-modifier-active)',
        }}>
          <h4 style={{ color: 'var(--header-secondary)', marginBottom: 12, fontSize: 14 }}>
            {editingEvent ? 'Edit Event' : 'Create Event'}
          </h4>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Event Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What's the event?"
              maxLength={100}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Tell people about this event..."
              rows={3}
              style={{ resize: 'vertical', minHeight: 60 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Start Time *</label>
              <input
                className="form-input"
                type="datetime-local"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">End Time</label>
              <input
                className="form-input"
                type="datetime-local"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Location</label>
            <input
              className="form-input"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Where is it happening?"
            />
          </div>

          {editingEvent && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Status</label>
              <select
                className="form-input"
                value={eventStatus}
                onChange={e => setEventStatus(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="btn"
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-normal)' }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </div>
      )}

      <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>
        All Events ({serverEvents.length})
      </h4>

      {serverEvents.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
          No events yet. Create one above!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[...serverEvents].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)).map(event => (
            <div key={event.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: 'var(--bg-secondary)', borderRadius: 4,
              opacity: event.status === 'cancelled' || event.status === 'completed' ? 0.6 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 14 }}>
                    {event.name}
                  </span>
                  <span style={{
                    fontSize: 11, padding: '1px 6px', borderRadius: 3,
                    background: `${statusColors[event.status] || '#5865F2'}22`,
                    color: statusColors[event.status] || '#5865F2',
                    fontWeight: 600, textTransform: 'capitalize',
                  }}>
                    {event.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {formatDate(event.start_time)}
                  {event.end_time && ` - ${formatDate(event.end_time)}`}
                </div>
                {event.location && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Location: {event.location}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {event.interested_count || 0} interested
                  {event.username && ` | Created by ${event.username}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => handleEdit(event)}
                  style={{
                    background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4,
                    padding: '4px 10px', cursor: 'pointer', color: 'var(--text-normal)',
                    fontSize: 12,
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(event.id)}
                  style={{
                    background: 'rgba(237,66,69,0.1)', border: 'none', borderRadius: 4,
                    padding: '4px 10px', cursor: 'pointer', color: '#ED4245',
                    fontSize: 12,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ServerWebhooks() {
  const { currentServer, channels, webhooks, fetchWebhooks, createWebhook, updateWebhook, deleteWebhook } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [editName, setEditName] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const textChannels = channels.filter(c => c.type === 'text' || c.type === 'announcement');

  React.useEffect(() => {
    setLoading(true);
    fetchWebhooks(currentServer.id).finally(() => setLoading(false));
  }, [currentServer.id]);

  const handleCreate = async () => {
    if (!newChannelId) {
      setError('Please select a channel');
      return;
    }
    setError('');
    try {
      await createWebhook(newChannelId, newName.trim() || undefined);
      setNewName('');
      setNewChannelId('');
      setShowCreate(false);
    } catch (err) {
      setError(err.message || 'Failed to create webhook');
    }
  };

  const handleUpdate = async (webhookId) => {
    if (!editName.trim()) {
      setError('Name cannot be empty');
      return;
    }
    setError('');
    try {
      await updateWebhook(webhookId, { name: editName.trim() });
      setEditingWebhook(null);
      setEditName('');
    } catch (err) {
      setError(err.message || 'Failed to update webhook');
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    setError('');
    try {
      await deleteWebhook(webhookId);
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message || 'Failed to delete webhook');
    }
  };

  const copyToClipboard = (webhook) => {
    const url = webhook.url || `${window.location.origin}/api/webhooks/${webhook.id}/${webhook.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(webhook.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatDate = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <div className="settings-title">Webhooks</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
        Webhooks allow external services to send messages to your server channels.
      </p>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)', color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!showCreate && (
        <button
          className="btn btn-primary"
          onClick={() => { setShowCreate(true); setError(''); }}
          style={{ marginBottom: 20 }}
        >
          Create Webhook
        </button>
      )}

      {showCreate && (
        <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
          <h4 style={{ color: 'var(--header-secondary)', marginBottom: 12, fontSize: 14 }}>
            Create Webhook
          </h4>

          <div className="form-group">
            <label className="form-label">Channel *</label>
            <select
              className="form-input"
              value={newChannelId}
              onChange={e => setNewChannelId(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">Select a channel...</option>
              {textChannels.map(ch => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Captain Hook"
              maxLength={80}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>
              Create
            </button>
            <button
              className="btn"
              onClick={() => { setShowCreate(false); setNewName(''); setNewChannelId(''); setError(''); }}
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-normal)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <h4 style={{ color: 'var(--header-secondary)', marginBottom: 8, fontSize: 14 }}>
        All Webhooks ({webhooks.length})
      </h4>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading webhooks...</div>
      ) : webhooks.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
          No webhooks yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {webhooks.map(webhook => (
            <div key={webhook.id} style={{
              padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: '#5865F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 600, color: 'white',
                }}>
                  {webhook.avatar ? (
                    <img src={webhook.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  ) : (
                    webhook.name?.[0]?.toUpperCase() || 'W'
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingWebhook === webhook.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        className="form-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdate(webhook.id);
                          if (e.key === 'Escape') { setEditingWebhook(null); setEditName(''); }
                        }}
                        style={{ padding: '2px 6px', fontSize: 13, height: 28, flex: 1 }}
                        autoFocus
                        maxLength={80}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => handleUpdate(webhook.id)}
                        style={{ padding: '2px 8px', fontSize: 12, height: 28 }}
                      >
                        Save
                      </button>
                      <button
                        className="btn"
                        onClick={() => { setEditingWebhook(null); setEditName(''); }}
                        style={{ padding: '2px 8px', fontSize: 12, height: 28, background: 'var(--bg-tertiary)', color: 'var(--text-normal)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, color: 'var(--header-primary)', fontSize: 15 }}>
                        {webhook.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        #{webhook.channel_name} &middot; Created by {webhook.creator_username} &middot; {formatDate(webhook.created_at)}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Webhook URL */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 4,
              }}>
                <code style={{
                  flex: 1, fontSize: 12, color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}>
                  {webhook.url || `${window.location.origin}/api/webhooks/${webhook.id}/${webhook.token}`}
                </code>
                <button
                  onClick={() => copyToClipboard(webhook)}
                  style={{
                    background: copiedId === webhook.id ? '#57F287' : 'var(--bg-modifier-active)',
                    border: 'none', borderRadius: 4, padding: '4px 10px',
                    cursor: 'pointer', color: copiedId === webhook.id ? '#fff' : 'var(--text-normal)',
                    fontSize: 12, fontWeight: 600, flexShrink: 0, transition: 'all 0.15s',
                  }}
                >
                  {copiedId === webhook.id ? 'Copied!' : 'Copy URL'}
                </button>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => { setEditingWebhook(webhook.id); setEditName(webhook.name); }}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-link)',
                    cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 4,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Edit
                </button>
                {confirmDelete === webhook.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#ED4245', marginRight: 4 }}>Delete this webhook?</span>
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      style={{
                        background: '#ED4245', border: 'none', borderRadius: 4,
                        padding: '3px 10px', cursor: 'pointer', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{
                        background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4,
                        padding: '3px 10px', cursor: 'pointer', color: 'var(--text-normal)',
                        fontSize: 12,
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(webhook.id)}
                    style={{
                      background: 'transparent', border: 'none', color: '#ED4245',
                      cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 4,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(237,66,69,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
