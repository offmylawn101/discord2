import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export default function ServerList() {
  const {
    servers, currentServer, selectServer, toggleCreateServer,
    toggleDiscover, showDiscover, unreadServers,
    serverFolders, fetchFolders, createFolder, deleteFolder,
    addServerToFolder, removeServerFromFolder, updateFolder,
  } = useStore();
  const navigate = useNavigate();
  const isHome = !currentServer && !showDiscover;
  const [expandedFolders, setExpandedFolders] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [editingFolder, setEditingFolder] = useState(null);

  useEffect(() => { fetchFolders(); }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // Group servers: those in folders vs standalone
  const folderedServerIds = new Set(serverFolders.flatMap(f => f.server_ids));
  const standaloneServers = servers.filter(s => !folderedServerIds.has(s.id));

  // Build ordered list
  const renderItems = [];

  const sortedFolders = [...serverFolders].sort((a, b) => a.position - b.position);

  // Render folders first in order, then standalone servers
  for (const folder of sortedFolders) {
    const folderServers = folder.server_ids.map(id => servers.find(s => s.id === id)).filter(Boolean);
    if (folderServers.length === 0) continue;

    const isExpanded = expandedFolders[folder.id];
    const hasUnread = folderServers.some(s => unreadServers[s.id] > 0 && currentServer?.id !== s.id);
    const hasActive = folderServers.some(s => currentServer?.id === s.id);

    renderItems.push(
      <div key={`folder-${folder.id}`} className="server-folder-wrapper">
        {/* Folder icon - collapsed shows mini icons */}
        <div className="server-icon-wrapper">
          {hasActive && <div className="server-pill" style={{ height: 40 }} />}
          {hasUnread && !hasActive && <div className="server-pill" style={{ height: 8 }} />}
          <div
            className={`server-folder ${isExpanded ? 'expanded' : ''} ${hasActive ? 'active' : ''}`}
            style={{ background: isExpanded ? `${folder.color}33` : 'var(--bg-tertiary)' }}
            onClick={() => toggleFolder(folder.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ type: 'folder', folderId: folder.id, folder, x: e.clientX, y: e.clientY });
            }}
            title={folder.name}
          >
            {isExpanded ? (
              <span style={{ fontSize: 12, color: folder.color, fontWeight: 600 }}>{folder.name.slice(0, 3)}</span>
            ) : (
              <div className="folder-mini-icons">
                {folderServers.slice(0, 4).map(s => (
                  <div key={s.id} className="folder-mini-icon">
                    {s.icon ? <img src={s.icon} alt="" /> : s.name[0]}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Expanded folder contents */}
        {isExpanded && (
          <div className="server-folder-contents" style={{ borderLeft: `2px solid ${folder.color}`, marginLeft: 20, paddingLeft: 4 }}>
            {folderServers.map(server => renderServerIcon(server))}
          </div>
        )}
      </div>
    );
  }

  // Then standalone servers
  for (const server of standaloneServers) {
    renderItems.push(renderServerIcon(server));
  }

  function renderServerIcon(server) {
    const isActive = currentServer?.id === server.id;
    const unreadCount = unreadServers[server.id] || 0;
    const hasUnread = unreadCount > 0 && !isActive;

    return (
      <div key={server.id} className={`server-icon-wrapper ${isActive ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}`}>
        <div className="server-pill" />
        <div
          className={`server-icon ${isActive ? 'active' : ''}`}
          onClick={() => {
            useStore.setState({ showDiscover: false });
            selectServer(server.id);
            navigate(`/channels/${server.id}`);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ type: 'server', serverId: server.id, server, x: e.clientX, y: e.clientY });
          }}
          title={server.name}
        >
          {server.icon ? (
            <img src={server.icon} alt={server.name} />
          ) : (
            server.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          )}
          {hasUnread && (
            <div className="notification-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="server-list">
      {/* Home button */}
      <div className="server-icon-wrapper">
        {isHome && <div className="server-pill" style={{ height: 40 }} />}
        <div
          className={`server-icon home ${isHome ? 'active' : ''}`}
          onClick={() => {
            useStore.setState({ currentServer: null, currentChannel: null, currentDm: null, showDiscover: false });
            navigate('/channels/@me');
          }}
          title="Direct Messages"
        >
          <svg width="28" height="20" viewBox="0 0 28 20">
            <path fill="currentColor" d="M23.0212 1.67671C21.3107 0.879656 19.5079 0.318797 17.6584 0C17.4062 0.461742 17.1749 0.934541 16.9708 1.4184C15.003 1.12145 12.9974 1.12145 11.0292 1.4184C10.8251 0.934541 10.5765 0.461742 10.3416 0C8.49067 0.318797 6.68647 0.879656 4.97867 1.67671C1.56183 6.78844 0.642221 11.7751 1.10162 16.6915C3.10024 18.1606 5.19681 19.0685 7.25985 19.6839C7.81978 18.9106 8.30866 18.0795 8.72426 17.2024C7.87931 16.9108 7.07321 16.5382 6.31073 16.094C6.50756 15.9536 6.69993 15.8059 6.88588 15.6572C11.2009 17.6485 15.8741 17.6485 20.1416 15.6572C20.3287 15.8059 20.5211 15.9536 20.7168 16.094C19.9528 16.5382 19.1451 16.9108 18.3018 17.2024C18.7174 18.0795 19.2063 18.9106 19.7651 19.6839C21.8293 19.0685 23.9271 18.1606 25.9256 16.6915C26.4628 11.0168 25.0508 6.07032 23.0212 1.67671ZM9.68041 13.6383C8.39326 13.6383 7.33575 12.4618 7.33575 11.0168C7.33575 9.5718 8.37164 8.39528 9.68041 8.39528C10.9892 8.39528 12.0467 9.5718 12.0253 11.0168C12.0253 12.4618 10.9892 13.6383 9.68041 13.6383ZM17.3196 13.6383C16.0325 13.6383 14.975 12.4618 14.975 11.0168C14.975 9.5718 16.0109 8.39528 17.3196 8.39528C18.6284 8.39528 19.6859 9.5718 19.6646 11.0168C19.6646 12.4618 18.6284 13.6383 17.3196 13.6383Z" />
          </svg>
        </div>
      </div>

      <div className="server-separator" />

      {renderItems}

      <div className="server-separator" />

      {/* Add server */}
      <div className="server-icon-wrapper">
        <div
          className="server-icon add"
          onClick={toggleCreateServer}
          title="Add a Server"
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 11.1111H12.8889V4H11.1111V11.1111H4V12.8889H11.1111V20H12.8889V12.8889H20V11.1111Z" />
          </svg>
        </div>
      </div>

      {/* Explore / Discover servers */}
      <div className="server-icon-wrapper">
        <div
          className={`server-icon add ${showDiscover ? 'active' : ''}`}
          onClick={toggleDiscover}
          title="Explore Public Servers"
          style={showDiscover ? { background: 'var(--green-360)', color: 'white', borderRadius: 16 } : {}}
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" />
            <path fill="currentColor" d="M14.829 9.172l-4.656 1.999-1.999 4.657 4.656-1.999 1.999-4.657zm-2.829 4.243c-.781 0-1.414-.633-1.414-1.414 0-.782.633-1.415 1.414-1.415.782 0 1.415.633 1.415 1.415 0 .781-.633 1.414-1.415 1.414z" />
          </svg>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="server-context-menu" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}>
          {contextMenu.type === 'server' && (
            <>
              <div className="context-menu-header">{contextMenu.server.name}</div>
              {serverFolders.length > 0 && !folderedServerIds.has(contextMenu.serverId) && (
                serverFolders.map(f => (
                  <button key={f.id} onClick={() => { addServerToFolder(f.id, contextMenu.serverId); setContextMenu(null); }}>
                    Add to {f.name}
                  </button>
                ))
              )}
              {folderedServerIds.has(contextMenu.serverId) && (
                <button onClick={() => {
                  const folder = serverFolders.find(f => f.server_ids.includes(contextMenu.serverId));
                  if (folder) removeServerFromFolder(folder.id, contextMenu.serverId);
                  setContextMenu(null);
                }}>Remove from Folder</button>
              )}
              {!folderedServerIds.has(contextMenu.serverId) && (
                <button onClick={() => {
                  createFolder('New Folder', '#5865F2', [contextMenu.serverId]);
                  setContextMenu(null);
                }}>Create Folder</button>
              )}
            </>
          )}
          {contextMenu.type === 'folder' && (
            <>
              <div className="context-menu-header">{contextMenu.folder.name}</div>
              <button onClick={() => { setEditingFolder(contextMenu.folderId); setContextMenu(null); }}>Edit Folder</button>
              <button onClick={() => { deleteFolder(contextMenu.folderId); setContextMenu(null); }} style={{ color: '#ED4245' }}>Delete Folder</button>
            </>
          )}
        </div>
      )}

      {/* Folder Edit Modal */}
      {editingFolder && <FolderEditModal folderId={editingFolder} onClose={() => setEditingFolder(null)} />}
    </div>
  );
}

function FolderEditModal({ folderId, onClose }) {
  const { serverFolders, updateFolder } = useStore();
  const folder = serverFolders.find(f => f.id === folderId);
  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || '#5865F2');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!folder) return null;

  const COLORS = ['#5865F2', '#ED4245', '#FEE75C', '#57F287', '#EB459E', '#3498DB', '#E67E22', '#9B59B6'];

  return (
    <div className="folder-edit-overlay">
      <div className="folder-edit-modal" ref={ref}>
        <h3>Edit Folder</h3>
        <label>Name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={32} />
        <label>Color</label>
        <div className="folder-color-picker">
          {COLORS.map(c => (
            <div
              key={c}
              className={`folder-color-swatch ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="folder-edit-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { updateFolder(folderId, { name, color }); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}
