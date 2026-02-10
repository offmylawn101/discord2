import React, { useState, useRef, useEffect } from 'react';
import { api } from '../utils/api';
import { useStore } from '../store';

function parseSearchFilters(query) {
  const filters = {};
  let cleanQuery = query;

  // Extract from:username
  const fromMatch = cleanQuery.match(/from:(\S+)/i);
  if (fromMatch) {
    filters.author = fromMatch[1];
    cleanQuery = cleanQuery.replace(fromMatch[0], '');
  }

  // Extract in:channel
  const inMatch = cleanQuery.match(/in:(\S+)/i);
  if (inMatch) {
    filters.channel = inMatch[1];
    cleanQuery = cleanQuery.replace(inMatch[0], '');
  }

  // Extract has:link or has:file
  const hasMatch = cleanQuery.match(/has:(link|file|image)/i);
  if (hasMatch) {
    filters.has = hasMatch[1].toLowerCase();
    cleanQuery = cleanQuery.replace(hasMatch[0], '');
  }

  // Extract before:date and after:date
  const beforeMatch = cleanQuery.match(/before:(\S+)/i);
  if (beforeMatch) {
    filters.before = beforeMatch[1];
    cleanQuery = cleanQuery.replace(beforeMatch[0], '');
  }
  const afterMatch = cleanQuery.match(/after:(\S+)/i);
  if (afterMatch) {
    filters.after = afterMatch[1];
    cleanQuery = cleanQuery.replace(afterMatch[0], '');
  }

  return { query: cleanQuery.trim(), filters };
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const { currentChannel, currentServer, channels } = useStore();
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (value) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setTotal(0);
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setOpen(true);
      try {
        const { query: cleanQ, filters } = parseSearchFilters(value);
        if (!cleanQ) { setResults([]); setTotal(0); setLoading(false); return; }

        if (currentServer) {
          // Server-wide search
          const params = new URLSearchParams({ q: cleanQ });
          if (filters.author) {
            // Find author ID by username
            const members = useStore.getState().members;
            const member = members.find(m => m.username?.toLowerCase() === filters.author.toLowerCase());
            if (member) params.set('author_id', member.id);
          }
          if (filters.channel) {
            const ch = channels.find(c => c.name?.toLowerCase() === filters.channel.toLowerCase());
            if (ch) params.set('channel_id', ch.id);
          }
          if (filters.has) params.set('has', filters.has);
          if (filters.before) params.set('before', filters.before);
          if (filters.after) params.set('after', filters.after);

          const res = await api.get(`/servers/${currentServer.id}/search?${params}`);
          setResults(res.messages || []);
          setTotal(res.total || 0);
        } else if (currentChannel) {
          // Channel search (DMs)
          const res = await api.get(`/${currentChannel.id}/messages/search?q=${encodeURIComponent(cleanQ)}`);
          setResults(res);
          setTotal(res.length);
        }
      } catch {
        // Fallback: filter loaded messages client-side
        const messages = useStore.getState().messages;
        const filtered = messages.filter(m =>
          m.content?.toLowerCase().includes(value.toLowerCase())
        ).slice(-20).reverse();
        setResults(filtered);
        setTotal(filtered.length);
      }
      setLoading(false);
    }, 300);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="search-bar" ref={searchRef}>
      <input
        className="search-input"
        placeholder={currentServer ? 'Search server' : 'Search'}
        value={query}
        onChange={e => handleSearch(e.target.value)}
        onFocus={() => query && setOpen(true)}
      />
      {open && (
        <div className="search-results">
          {loading ? (
            <div className="search-empty">Searching...</div>
          ) : results.length === 0 ? (
            <div className="search-empty">No results found</div>
          ) : (
            <>
              {total > 0 && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--bg-modifier-active)' }}>
                  {total} result{total !== 1 ? 's' : ''}
                </div>
              )}
              {results.map(msg => (
                <div key={msg.id} className="search-result-item" onClick={() => {
                  // If in server and result is from different channel, navigate to it
                  if (msg.channel_id && msg.channel_id !== currentChannel?.id) {
                    const ch = channels.find(c => c.id === msg.channel_id);
                    if (ch) useStore.getState().selectChannel(ch);
                  }
                  // Try to scroll to message
                  setTimeout(() => {
                    const el = document.querySelector(`[data-message-id="${msg.id}"]`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.style.background = 'rgba(88, 101, 242, 0.15)';
                      setTimeout(() => { el.style.background = ''; }, 2000);
                    }
                  }, 300);
                  setOpen(false);
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `hsl(${(msg.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {msg.avatar ? (
                      <img src={`/uploads/${msg.avatar}`} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                    ) : (
                      msg.username?.[0]?.toUpperCase() || '?'
                    )}
                  </div>
                  <div className="search-result-content">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span className="search-result-author">{msg.username}</span>
                      {msg.channel_name && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>in #{msg.channel_name}</span>
                      )}
                      <span className="search-result-date">{formatDate(msg.created_at)}</span>
                    </div>
                    <div className="search-result-text">{msg.content}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
