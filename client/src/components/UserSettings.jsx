import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';

export default function UserSettings() {
  const { user, setUser, toggleSettings, logout, uploadAvatar, messageDisplay, setMessageDisplay } = useStore();
  const [tab, setTab] = useState('account');
  const [username, setUsername] = useState(user?.username || '');
  const [aboutMe, setAboutMe] = useState(user?.about_me || '');
  const [bannerColor, setBannerColor] = useState(user?.banner_color || '#5865F2');
  const [status, setStatus] = useState(user?.custom_status || '');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef(null);

  const handleSave = async () => {
    try {
      const updated = await api.patch('/auth/me', {
        username: username || undefined,
        about_me: aboutMe,
        banner_color: bannerColor,
        custom_status: status,
      });
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      console.error('Avatar upload error:', err);
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="settings-page">
      <div className="settings-nav">
        <div className="settings-nav-inner">
          <div className="settings-nav-category">User Settings</div>
          <button className={`settings-nav-item ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>My Account</button>
          <button className={`settings-nav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
          <div className="settings-nav-category" style={{ marginTop: 16 }}>App Settings</div>
          <button className={`settings-nav-item ${tab === 'appearance' ? 'active' : ''}`} onClick={() => setTab('appearance')}>Appearance</button>
          <button className={`settings-nav-item ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}>Notifications</button>
          <button className={`settings-nav-item ${tab === 'keybinds' ? 'active' : ''}`} onClick={() => setTab('keybinds')}>Keybinds</button>
          <div style={{ marginTop: 8 }} />
          <button
            className="settings-nav-item"
            style={{ color: 'var(--red-400)' }}
            onClick={() => { toggleSettings(); logout(); }}
          >
            Log Out
          </button>
        </div>
      </div>

      <div className="settings-content">
        <button className="settings-close" onClick={toggleSettings}>✕</button>

        {tab === 'account' && (
          <>
            <div className="settings-title">My Account</div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ height: 100, background: bannerColor }} />
              <div style={{ padding: '0 16px 16px', position: 'relative' }}>
                <div
                  style={{
                    width: 80, height: 80, borderRadius: '50%', background: bannerColor,
                    border: '6px solid var(--bg-secondary)', position: 'absolute', top: -40,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32, fontWeight: 700, color: 'white', cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                  onClick={() => avatarInputRef.current?.click()}
                  title="Change Avatar"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    user?.username?.[0]?.toUpperCase()
                  )}
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.15s', fontSize: 11, fontWeight: 600,
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0}
                  >
                    {uploading ? '...' : 'CHANGE'}
                  </div>
                </div>
                <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarUpload} hidden />
                <div style={{ paddingTop: 48 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--header-primary)' }}>
                    {user?.username}<span style={{ color: 'var(--text-muted)' }}>#{user?.discriminator}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={user?.email || ''} readOnly style={{ opacity: 0.6 }} />
            </div>
          </>
        )}

        {tab === 'profile' && (
          <>
            <div className="settings-title">Profile</div>

            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="form-label">Avatar</label>
                  <button className="btn btn-primary" onClick={() => avatarInputRef.current?.click()}>
                    {uploading ? 'Uploading...' : 'Change Avatar'}
                  </button>
                  <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarUpload} hidden />
                </div>

                <div className="form-group">
                  <label className="form-label">About Me</label>
                  <textarea
                    className="form-input"
                    value={aboutMe}
                    onChange={e => setAboutMe(e.target.value)}
                    rows={4}
                    maxLength={190}
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{aboutMe.length}/190</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Banner Color</label>
                  <input type="color" value={bannerColor} onChange={e => setBannerColor(e.target.value)} style={{ cursor: 'pointer' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Custom Status</label>
                  <input className="form-input" value={status} onChange={e => setStatus(e.target.value)} placeholder="What's on your mind?" maxLength={128} />
                </div>
              </div>

              {/* Preview card */}
              <div style={{
                width: 300, background: 'var(--bg-tertiary)', borderRadius: 8, overflow: 'hidden', flexShrink: 0,
              }}>
                <div style={{ height: 60, background: bannerColor }} />
                <div style={{ padding: '0 12px 12px', position: 'relative' }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: '50%', background: bannerColor,
                    border: '4px solid var(--bg-tertiary)', position: 'absolute', top: -30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700, color: 'white', overflow: 'hidden',
                  }}>
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      user?.username?.[0]?.toUpperCase()
                    )}
                  </div>
                  <div style={{ paddingTop: 36 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--header-primary)' }}>
                      {username || user?.username}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>#{user?.discriminator}</div>
                    {status && <div style={{ fontSize: 13, color: 'var(--text-normal)', marginTop: 4 }}>{status}</div>}
                    <div style={{ height: 1, background: 'var(--bg-modifier-active)', margin: '8px 0' }} />
                    {aboutMe && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--header-secondary)', marginBottom: 4 }}>About Me</div>
                        <div style={{ fontSize: 13, color: 'var(--text-normal)', lineHeight: 1.3 }}>{aboutMe}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'appearance' && (
          <>
            <div className="settings-title">Appearance</div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Dark theme is the only theme. As it should be.</p>
            <div className="settings-section">
              <h3 style={{ color: 'var(--header-primary)', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Message Display</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Choose how messages are displayed in chat.
              </p>
              <div className="message-display-options">
                <div
                  className={`display-option ${messageDisplay === 'cozy' ? 'active' : ''}`}
                  onClick={() => setMessageDisplay('cozy')}
                >
                  <div className="display-option-preview cozy-preview">
                    <div className="preview-avatar" />
                    <div className="preview-lines">
                      <div className="preview-name" />
                      <div className="preview-text" />
                      <div className="preview-text short" />
                    </div>
                  </div>
                  <span>Cozy</span>
                </div>
                <div
                  className={`display-option ${messageDisplay === 'compact' ? 'active' : ''}`}
                  onClick={() => setMessageDisplay('compact')}
                >
                  <div className="display-option-preview compact-preview">
                    <div className="preview-line"><span className="preview-time" /><span className="preview-name-inline" /><span className="preview-text-inline" /></div>
                    <div className="preview-line"><span className="preview-time" /><span className="preview-text-inline full" /></div>
                    <div className="preview-line"><span className="preview-time" /><span className="preview-name-inline" /><span className="preview-text-inline" /></div>
                  </div>
                  <span>Compact</span>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <div className="settings-title">Notifications</div>
            <NotificationSettings />
          </>
        )}

        {tab === 'keybinds' && (
          <>
            <div className="settings-title">Keybinds</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Escape', 'Close modal / Cancel editing'],
                ['Enter', 'Send message'],
                ['Shift + Enter', 'New line in message'],
                ['Arrow Up', 'Edit last message (when input is empty)'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                  <span style={{ color: 'var(--text-normal)', fontSize: 14 }}>{desc}</span>
                  <kbd style={{
                    padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: 4,
                    fontSize: 13, fontFamily: 'monospace', color: 'var(--header-primary)',
                    border: '1px solid var(--bg-modifier-active)',
                  }}>{key}</kbd>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
          <button className="btn btn-secondary" onClick={toggleSettings}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const {
    notificationsEnabled, desktopNotifications, soundEnabled, mentionNotifications
  } = useStore();
  const store = useStore;

  const requestPerms = async () => {
    const { requestNotificationPermission } = await import('../utils/notifications');
    const granted = await requestNotificationPermission();
    if (!granted) {
      alert('Notification permission was denied. Please enable it in your browser settings.');
    }
  };

  const toggleSetting = (key) => {
    store.setState({ [key]: !store.getState()[key] });
  };

  const settingRow = (label, description, key, value) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 0', borderBottom: '1px solid var(--bg-modifier-active)',
    }}>
      <div>
        <div style={{ fontWeight: 500, color: 'var(--header-primary)', fontSize: 15 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
      </div>
      <div
        onClick={() => toggleSetting(key)}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
          background: value ? '#57F287' : 'var(--bg-tertiary)',
          position: 'relative', transition: 'background 0.15s',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          position: 'absolute', top: 2,
          left: value ? 22 : 2,
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
    </div>
  );

  return (
    <div>
      <button className="btn btn-primary" onClick={requestPerms} style={{ marginBottom: 16 }}>
        Enable Desktop Notifications
      </button>

      {settingRow(
        'Enable Notifications',
        'Receive notifications for all new messages',
        'notificationsEnabled',
        notificationsEnabled
      )}
      {settingRow(
        'Desktop Notifications',
        'Show browser desktop notifications for new messages',
        'desktopNotifications',
        desktopNotifications
      )}
      {settingRow(
        'Notification Sounds',
        'Play a sound when receiving messages',
        'soundEnabled',
        soundEnabled
      )}
      {settingRow(
        'Always Notify on Mentions',
        'Always receive notifications when you are @mentioned, even if other notifications are disabled',
        'mentionNotifications',
        mentionNotifications
      )}
    </div>
  );
}
