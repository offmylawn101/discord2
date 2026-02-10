import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export default function QuickSwitcher() {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const {
    servers,
    channels,
    dmChannels,
    currentServer,
    recentChannels,
    selectServer,
    selectChannel,
    selectDm,
    toggleQuickSwitcher,
  } = useStore();

  // Auto-focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build the full list of all channels across all servers
  // We only have channels for the current server loaded, so we use recentChannels
  // plus current server channels and DMs
  const allChannels = useMemo(() => {
    return (channels || []).map(ch => ({
      id: ch.id,
      name: ch.name,
      type: ch.type || 'text',
      serverId: currentServer?.id,
      serverName: currentServer?.name,
      kind: 'channel',
    }));
  }, [channels, currentServer]);

  const allDms = useMemo(() => {
    return (dmChannels || []).map(dm => ({
      id: dm.id,
      name: dm.recipients?.map(r => r.username).join(', ') || dm.name || 'Unknown',
      kind: 'dm',
      dm,
    }));
  }, [dmChannels]);

  const allServers = useMemo(() => {
    return (servers || []).map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      kind: 'server',
    }));
  }, [servers]);

  const recentItems = useMemo(() => {
    return (recentChannels || []).map(ch => {
      if (ch._isDm) {
        return {
          id: ch.id,
          name: ch.recipients?.map(r => r.username).join(', ') || ch.name || 'Unknown',
          kind: 'dm',
          dm: ch,
        };
      }
      const server = servers.find(s => s.id === ch.server_id);
      return {
        id: ch.id,
        name: ch.name,
        type: ch.type || 'text',
        serverId: ch.server_id,
        serverName: server?.name || '',
        kind: 'channel',
      };
    });
  }, [recentChannels, servers]);

  // Filter results based on query
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Show recent items when no query
      if (recentItems.length > 0) {
        return [{ category: 'Recent', items: recentItems }];
      }
      // Fallback: show some channels and DMs
      const sections = [];
      if (allChannels.length > 0) {
        sections.push({ category: 'Channels', items: allChannels.slice(0, 5) });
      }
      if (allDms.length > 0) {
        sections.push({ category: 'Direct Messages', items: allDms.slice(0, 5) });
      }
      return sections;
    }

    // Prefix filtering
    let searchChannels = true;
    let searchDms = true;
    let searchServers = true;
    let searchQuery = q;

    if (q.startsWith('#')) {
      searchDms = false;
      searchServers = false;
      searchQuery = q.slice(1).trim();
    } else if (q.startsWith('@')) {
      searchChannels = false;
      searchServers = false;
      searchQuery = q.slice(1).trim();
    } else if (q.startsWith('*')) {
      searchChannels = false;
      searchDms = false;
      searchQuery = q.slice(1).trim();
    }

    const sections = [];

    if (searchChannels) {
      const matched = allChannels.filter(ch =>
        ch.name.toLowerCase().includes(searchQuery)
      );
      if (matched.length > 0) {
        sections.push({ category: 'Channels', items: matched.slice(0, 10) });
      }
    }

    if (searchDms) {
      const matched = allDms.filter(dm =>
        dm.name.toLowerCase().includes(searchQuery)
      );
      if (matched.length > 0) {
        sections.push({ category: 'Direct Messages', items: matched.slice(0, 10) });
      }
    }

    if (searchServers) {
      const matched = allServers.filter(s =>
        s.name.toLowerCase().includes(searchQuery)
      );
      if (matched.length > 0) {
        sections.push({ category: 'Servers', items: matched.slice(0, 10) });
      }
    }

    return sections;
  }, [query, allChannels, allDms, allServers, recentItems]);

  // Flatten results for keyboard navigation
  const flatItems = useMemo(() => {
    return results.flatMap(section => section.items);
  }, [results]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle selection
  const handleSelect = useCallback((item) => {
    toggleQuickSwitcher();

    if (item.kind === 'channel') {
      if (item.serverId) {
        selectServer(item.serverId).then(() => {
          // After server loads, select the channel
          const state = useStore.getState();
          const ch = state.channels.find(c => c.id === item.id);
          if (ch) {
            selectChannel(ch);
          }
          navigate(`/channels/${item.serverId}/${item.id}`);
        });
      }
    } else if (item.kind === 'dm') {
      selectDm(item.dm);
      navigate('/channels/@me');
    } else if (item.kind === 'server') {
      selectServer(item.id);
      navigate(`/channels/${item.id}`);
    }
  }, [toggleQuickSwitcher, selectServer, selectChannel, selectDm, navigate]);

  // Keyboard handler
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleQuickSwitcher();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) {
        handleSelect(flatItems[selectedIndex]);
      }
      return;
    }
  }, [flatItems, selectedIndex, handleSelect, toggleQuickSwitcher]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector('.quick-switcher-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e) => {
    if (e.target.classList.contains('quick-switcher-overlay')) {
      toggleQuickSwitcher();
    }
  }, [toggleQuickSwitcher]);

  // Build rendered items with category tracking
  let flatIndex = 0;

  const modal = (
    <div className="quick-switcher-overlay" onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <div className="quick-switcher-container">
        <div className="quick-switcher-input-wrapper">
          <input
            ref={inputRef}
            className="quick-switcher-input"
            type="text"
            placeholder="Where would you like to go?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="quick-switcher-results" ref={listRef}>
          {results.length === 0 && query.trim() && (
            <div className="quick-switcher-empty">
              No results found.
            </div>
          )}
          {results.map((section) => (
            <div key={section.category}>
              <div className="quick-switcher-category">
                {section.category}
              </div>
              {section.items.map((item) => {
                const idx = flatIndex++;
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className={`quick-switcher-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="quick-switcher-item-icon">
                      {item.kind === 'channel' && item.type === 'voice' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3a1 1 0 0 0-1-1h-.09a1 1 0 0 0-.713.305L6.382 6.602a.5.5 0 0 1-.353.146H3.5A1.5 1.5 0 0 0 2 8.248v7.504A1.5 1.5 0 0 0 3.5 17.252h2.529a.5.5 0 0 1 .353.146l3.795 3.697A1 1 0 0 0 10.91 22H11a1 1 0 0 0 1-1V3z"/>
                          <path d="M16.554 5.367a1 1 0 0 1 1.28-.633A8.98 8.98 0 0 1 21 12a8.98 8.98 0 0 1-3.167 6.866 1 1 0 1 1-1.246-1.566A6.98 6.98 0 0 0 19 12a6.98 6.98 0 0 0-2.413-5.3 1 1 0 0 1-.033-1.333z"/>
                          <path d="M14.312 8.404a1 1 0 0 1 1.18-.784A4.99 4.99 0 0 1 17 12a4.99 4.99 0 0 1-1.508 3.38 1 1 0 0 1-1.396-1.434A2.99 2.99 0 0 0 15 12a2.99 2.99 0 0 0-.904-2.146 1 1 0 0 1 .216-1.45z"/>
                        </svg>
                      )}
                      {item.kind === 'channel' && item.type !== 'voice' && (
                        <span className="quick-switcher-hash">#</span>
                      )}
                      {item.kind === 'dm' && (
                        <span className="quick-switcher-at">@</span>
                      )}
                      {item.kind === 'server' && (
                        <span className="quick-switcher-server-icon">
                          {item.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="quick-switcher-item-name">{item.name}</span>
                    {item.kind === 'channel' && item.serverName && (
                      <span className="quick-switcher-item-meta">{item.serverName}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="quick-switcher-footer">
          <span className="quick-switcher-tip">
            <kbd>↑↓</kbd> to navigate <kbd>Enter</kbd> to select <kbd>Esc</kbd> to close
          </span>
          <span className="quick-switcher-tip-hint">
            Tip: <code>#</code> channels <code>@</code> DMs <code>*</code> servers
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
