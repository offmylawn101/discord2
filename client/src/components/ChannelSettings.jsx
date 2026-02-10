import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';
import { PERMISSIONS } from '../utils/permissions';

const CHANNEL_PERM_LIST = [
  ['VIEW_CHANNEL', 'View Channel'],
  ['SEND_MESSAGES', 'Send Messages'],
  ['MANAGE_MESSAGES', 'Manage Messages'],
  ['ATTACH_FILES', 'Attach Files'],
  ['ADD_REACTIONS', 'Add Reactions'],
  ['READ_MESSAGE_HISTORY', 'Read Message History'],
  ['MENTION_EVERYONE', 'Mention Everyone'],
  ['CONNECT', 'Connect (Voice)'],
  ['SPEAK', 'Speak (Voice)'],
  ['MUTE_MEMBERS', 'Mute Members'],
  ['DEAFEN_MEMBERS', 'Deafen Members'],
  ['CREATE_INVITE', 'Create Invites'],
  ['MANAGE_CHANNELS', 'Manage Channel'],
];

// States for each permission: 'allow', 'deny', 'inherit'
function parseOverwritePerms(allow, deny) {
  const allowBig = BigInt(allow || '0');
  const denyBig = BigInt(deny || '0');
  const perms = {};
  for (const [key] of CHANNEL_PERM_LIST) {
    const bit = PERMISSIONS[key];
    if (!bit) continue;
    if ((allowBig & bit) === bit) {
      perms[key] = 'allow';
    } else if ((denyBig & bit) === bit) {
      perms[key] = 'deny';
    } else {
      perms[key] = 'inherit';
    }
  }
  return perms;
}

function buildAllowDeny(permStates) {
  let allow = 0n;
  let deny = 0n;
  for (const [key, state] of Object.entries(permStates)) {
    const bit = PERMISSIONS[key];
    if (!bit) continue;
    if (state === 'allow') {
      allow |= bit;
    } else if (state === 'deny') {
      deny |= bit;
    }
  }
  return { allow, deny };
}

export default function ChannelSettings() {
  const showChannelSettings = useStore(s => s.showChannelSettings);
  const closeChannelSettings = useStore(s => s.closeChannelSettings);
  const channels = useStore(s => s.channels);
  const roles = useStore(s => s.roles);
  const members = useStore(s => s.members);
  const currentServer = useStore(s => s.currentServer);
  const fetchChannelOverwrites = useStore(s => s.fetchChannelOverwrites);
  const updateChannelOverwrite = useStore(s => s.updateChannelOverwrite);
  const deleteChannelOverwrite = useStore(s => s.deleteChannelOverwrite);
  const selectServer = useStore(s => s.selectServer);

  const [tab, setTab] = useState('overview');
  const [overwrites, setOverwrites] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [permStates, setPermStates] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Overview fields
  const [channelName, setChannelName] = useState('');
  const [channelTopic, setChannelTopic] = useState('');
  const [channelSlowmode, setChannelSlowmode] = useState(0);
  const [channelNsfw, setChannelNsfw] = useState(false);

  // Add role/member dropdown
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [addType, setAddType] = useState('role'); // 'role' or 'member'

  const channelId = showChannelSettings;
  const channel = channels.find(c => c.id === channelId);

  useEffect(() => {
    if (channelId) {
      setTab('overview');
      setSelectedTarget(null);
      setError('');
      setSuccess('');
      loadOverwrites();
      // Populate overview fields
      const ch = channels.find(c => c.id === channelId);
      if (ch) {
        setChannelName(ch.name || '');
        setChannelTopic(ch.topic || '');
        setChannelSlowmode(ch.slowmode || 0);
        setChannelNsfw(!!ch.nsfw);
      }
    }
  }, [channelId]);

  const loadOverwrites = async () => {
    if (!channelId) return;
    const ow = await fetchChannelOverwrites(channelId);
    setOverwrites(ow || []);
  };

  const handleSelectTarget = (overwrite) => {
    setSelectedTarget(overwrite);
    setPermStates(parseOverwritePerms(overwrite.allow, overwrite.deny));
    setError('');
    setSuccess('');
  };

  const handleTogglePerm = (key) => {
    setPermStates(prev => {
      const current = prev[key] || 'inherit';
      // Cycle: inherit -> allow -> deny -> inherit
      const next = current === 'inherit' ? 'allow' : current === 'allow' ? 'deny' : 'inherit';
      return { ...prev, [key]: next };
    });
    setSuccess('');
  };

  const handleSetPerm = (key, state) => {
    setPermStates(prev => ({
      ...prev,
      [key]: prev[key] === state ? 'inherit' : state,
    }));
    setSuccess('');
  };

  const handleSave = async () => {
    if (!selectedTarget || !channelId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { allow, deny } = buildAllowDeny(permStates);
      await updateChannelOverwrite(
        channelId,
        selectedTarget.target_id,
        selectedTarget.target_type,
        allow,
        deny
      );
      // Refresh the overwrites
      const ow = await fetchChannelOverwrites(channelId);
      setOverwrites(ow || []);
      // Update selectedTarget with new values
      const updated = (ow || []).find(o => o.target_id === selectedTarget.target_id);
      if (updated) {
        setSelectedTarget(updated);
      }
      setSuccess('Permissions saved successfully');
    } catch (err) {
      setError(err.message || 'Failed to save permissions');
    }
    setSaving(false);
  };

  const handleDeleteOverwrite = async () => {
    if (!selectedTarget || !channelId) return;
    setSaving(true);
    setError('');
    try {
      await deleteChannelOverwrite(channelId, selectedTarget.target_id);
      setSelectedTarget(null);
      setPermStates({});
      const ow = await fetchChannelOverwrites(channelId);
      setOverwrites(ow || []);
    } catch (err) {
      setError(err.message || 'Failed to delete overwrite');
    }
    setSaving(false);
  };

  const handleAddOverwrite = async (targetId, targetType) => {
    if (!channelId) return;
    setShowAddDropdown(false);
    setError('');
    try {
      await updateChannelOverwrite(channelId, targetId, targetType, 0n, 0n);
      const ow = await fetchChannelOverwrites(channelId);
      setOverwrites(ow || []);
      // Auto-select the new overwrite
      const newOw = (ow || []).find(o => o.target_id === targetId);
      if (newOw) {
        handleSelectTarget(newOw);
      }
    } catch (err) {
      setError(err.message || 'Failed to add overwrite');
    }
  };

  const handleSaveOverview = async () => {
    if (!channelId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/channels/${channelId}`, {
        name: channelName,
        topic: channelTopic,
        slowmode: channelSlowmode,
        nsfw: channelNsfw,
      });
      if (currentServer) {
        await selectServer(currentServer.id);
      }
      setSuccess('Channel settings saved');
    } catch (err) {
      setError(err.message || 'Failed to save channel');
    }
    setSaving(false);
  };

  if (!channelId || !channel) return null;

  // Find names for overwrites
  const getTargetName = (ow) => {
    if (ow.target_type === 'role') {
      const role = roles.find(r => r.id === ow.target_id);
      return role?.name || 'Unknown Role';
    } else {
      const member = members.find(m => m.id === ow.target_id);
      return member?.nickname || member?.username || 'Unknown Member';
    }
  };

  const getTargetColor = (ow) => {
    if (ow.target_type === 'role') {
      const role = roles.find(r => r.id === ow.target_id);
      return role?.color && role.color !== '#99AAB5' ? role.color : null;
    }
    return null;
  };

  // Roles/members not yet having overwrites
  const existingTargetIds = overwrites.map(o => o.target_id);
  const availableRoles = roles.filter(r => !existingTargetIds.includes(r.id));
  const availableMembers = members.filter(m => !existingTargetIds.includes(m.id));

  return (
    <div className="channel-settings-page">
      <div className="channel-settings-sidebar">
        <div className="channel-settings-sidebar-inner">
          <div className="settings-nav-category"># {channel.name}</div>
          <button
            className={`settings-nav-item ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            className={`settings-nav-item ${tab === 'permissions' ? 'active' : ''}`}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>
        </div>
      </div>

      <div className="channel-settings-content">
        <button className="settings-close" onClick={closeChannelSettings}>&#10005;</button>

        {tab === 'overview' && (
          <>
            <div className="settings-title">Overview</div>

            {error && (
              <div style={{
                padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)',
                color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13,
              }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{
                padding: '8px 12px', background: 'rgba(35, 165, 89, 0.15)',
                color: '#57F287', borderRadius: 4, marginBottom: 12, fontSize: 13,
              }}>
                {success}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Channel Name</label>
              <input
                className="form-input"
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Channel Topic</label>
              <input
                className="form-input"
                value={channelTopic}
                onChange={e => setChannelTopic(e.target.value)}
                placeholder="Set a channel topic"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Slowmode (seconds)</label>
              <select
                className="form-input"
                value={channelSlowmode}
                onChange={e => setChannelSlowmode(Number(e.target.value))}
                style={{ cursor: 'pointer' }}
              >
                <option value={0}>Off</option>
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
                <option value={120}>2m</option>
                <option value={300}>5m</option>
                <option value={600}>10m</option>
              </select>
            </div>

            <div className="form-group">
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                fontSize: 14, color: 'var(--text-normal)',
              }}>
                <input
                  type="checkbox"
                  checked={channelNsfw}
                  onChange={e => setChannelNsfw(e.target.checked)}
                />
                NSFW Channel
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Users will be warned before viewing content in this channel.
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveOverview}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        )}

        {tab === 'permissions' && (
          <>
            <div className="settings-title">Channel Permissions</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
              Customize permissions for specific roles or members in this channel.
              These overwrites take priority over server-level role permissions.
            </p>

            {error && (
              <div style={{
                padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)',
                color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13,
              }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{
                padding: '8px 12px', background: 'rgba(35, 165, 89, 0.15)',
                color: '#57F287', borderRadius: 4, marginBottom: 12, fontSize: 13,
              }}>
                {success}
              </div>
            )}

            <div style={{ display: 'flex', gap: 16 }}>
              {/* Left: Targets list */}
              <div style={{
                width: 200, minWidth: 200, background: 'var(--bg-secondary)',
                borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  color: 'var(--text-muted)', padding: '4px 8px', letterSpacing: '0.02em',
                }}>
                  Roles / Members
                </div>

                <div className="overwrite-targets-list">
                  {overwrites.map(ow => (
                    <button
                      key={ow.target_id}
                      className={`overwrite-target-item ${selectedTarget?.target_id === ow.target_id ? 'active' : ''}`}
                      onClick={() => handleSelectTarget(ow)}
                    >
                      {ow.target_type === 'role' ? (
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: getTargetColor(ow) || 'var(--text-muted)', flexShrink: 0,
                        }} />
                      ) : (
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: `hsl(${(ow.target_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 600, flexShrink: 0,
                        }}>
                          {getTargetName(ow)?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: getTargetColor(ow) || undefined,
                      }}>
                        {getTargetName(ow)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Add Role/Member button */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px' }}
                    onClick={() => setShowAddDropdown(!showAddDropdown)}
                  >
                    + Add Role / Member
                  </button>

                  {showAddDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--background-floating)', borderRadius: 4,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 100,
                      maxHeight: 300, overflowY: 'auto', marginTop: 4,
                    }}>
                      {/* Tab switcher */}
                      <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-modifier-active)' }}>
                        <button
                          style={{
                            flex: 1, padding: '8px 0', background: 'transparent', border: 'none',
                            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                            color: addType === 'role' ? 'var(--header-primary)' : 'var(--text-muted)',
                            borderBottom: addType === 'role' ? '2px solid var(--brand-500)' : '2px solid transparent',
                          }}
                          onClick={() => setAddType('role')}
                        >
                          Roles
                        </button>
                        <button
                          style={{
                            flex: 1, padding: '8px 0', background: 'transparent', border: 'none',
                            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                            color: addType === 'member' ? 'var(--header-primary)' : 'var(--text-muted)',
                            borderBottom: addType === 'member' ? '2px solid var(--brand-500)' : '2px solid transparent',
                          }}
                          onClick={() => setAddType('member')}
                        >
                          Members
                        </button>
                      </div>

                      <div style={{ padding: 4 }}>
                        {addType === 'role' ? (
                          availableRoles.length === 0 ? (
                            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                              No more roles to add
                            </div>
                          ) : (
                            availableRoles.map(role => (
                              <button
                                key={role.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                                  width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
                                  borderRadius: 4, fontFamily: 'inherit', fontSize: 13,
                                  color: role.color && role.color !== '#99AAB5' ? role.color : 'var(--text-normal)',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => handleAddOverwrite(role.id, 'role')}
                              >
                                <div style={{
                                  width: 10, height: 10, borderRadius: '50%',
                                  background: role.color || 'var(--text-muted)',
                                }} />
                                {role.name}
                              </button>
                            ))
                          )
                        ) : (
                          availableMembers.length === 0 ? (
                            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                              No more members to add
                            </div>
                          ) : (
                            availableMembers.map(member => (
                              <button
                                key={member.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                                  width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
                                  borderRadius: 4, fontFamily: 'inherit', fontSize: 13,
                                  color: 'var(--text-normal)',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-modifier-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => handleAddOverwrite(member.id, 'member')}
                              >
                                <div style={{
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: `hsl(${(member.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 10, fontWeight: 600,
                                }}>
                                  {member.username?.[0]?.toUpperCase() || '?'}
                                </div>
                                {member.nickname || member.username}
                              </button>
                            ))
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Permission grid */}
              <div style={{ flex: 1 }}>
                {selectedTarget ? (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 16,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {selectedTarget.target_type === 'role' ? (
                          <div style={{
                            width: 14, height: 14, borderRadius: '50%',
                            background: getTargetColor(selectedTarget) || 'var(--text-muted)',
                          }} />
                        ) : null}
                        <span style={{
                          fontSize: 16, fontWeight: 600,
                          color: getTargetColor(selectedTarget) || 'var(--header-primary)',
                        }}>
                          {getTargetName(selectedTarget)}
                        </span>
                        <span style={{
                          fontSize: 12, padding: '2px 6px', borderRadius: 4,
                          background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                        }}>
                          {selectedTarget.target_type}
                        </span>
                      </div>
                    </div>

                    {/* Legend */}
                    <div style={{
                      display: 'flex', gap: 16, marginBottom: 16, fontSize: 12,
                      color: 'var(--text-muted)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#57F287', fontSize: 16, fontWeight: 700 }}>&#10003;</span>
                        Allow
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#ED4245', fontSize: 16, fontWeight: 700 }}>&#10005;</span>
                        Deny
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 16, fontWeight: 700 }}>/</span>
                        Inherit
                      </div>
                    </div>

                    {/* Permission rows */}
                    <div style={{
                      background: 'var(--bg-secondary)', borderRadius: 8, padding: '4px 16px',
                    }}>
                      {CHANNEL_PERM_LIST.map(([key, label]) => {
                        const state = permStates[key] || 'inherit';
                        return (
                          <div className="perm-row" key={key}>
                            <div className="perm-row-label">{label}</div>
                            <div className="perm-row-toggles">
                              <button
                                className={`perm-toggle-btn allow ${state === 'allow' ? 'active' : ''}`}
                                onClick={() => handleSetPerm(key, 'allow')}
                                title="Allow"
                              >
                                &#10003;
                              </button>
                              <button
                                className={`perm-toggle-btn inherit ${state === 'inherit' ? 'active' : ''}`}
                                onClick={() => handleSetPerm(key, 'inherit')}
                                title="Inherit"
                              >
                                /
                              </button>
                              <button
                                className={`perm-toggle-btn deny ${state === 'deny' ? 'active' : ''}`}
                                onClick={() => handleSetPerm(key, 'deny')}
                                title="Deny"
                              >
                                &#10005;
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div style={{
                      display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between',
                    }}>
                      <button
                        className="btn btn-danger"
                        onClick={handleDeleteOverwrite}
                        disabled={saving}
                        style={{ fontSize: 13 }}
                      >
                        Delete Overwrite
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save Permissions'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: 300, color: 'var(--text-muted)',
                    gap: 8,
                  }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" style={{ opacity: 0.5 }}>
                      <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
                    </svg>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Select a Role or Member</div>
                    <div style={{ fontSize: 14 }}>
                      Choose a role or member from the left to edit their permission overwrites.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
