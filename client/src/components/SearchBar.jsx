import React, { useState, useRef, useEffect } from 'react';
import { api } from '../utils/api';
import { useStore } from '../store';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { currentChannel } = useStore();
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
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!currentChannel) return;
      setLoading(true);
      setOpen(true);
      try {
        const res = await api.get(`/${currentChannel.id}/messages/search?q=${encodeURIComponent(value)}`);
        setResults(res);
      } catch {
        // Fallback: filter loaded messages client-side
        const messages = useStore.getState().messages;
        const filtered = messages.filter(m =>
          m.content?.toLowerCase().includes(value.toLowerCase())
        ).slice(-20).reverse();
        setResults(filtered);
      }
      setLoading(false);
    }, 300);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="search-bar" ref={searchRef}>
      <input
        className="search-input"
        placeholder="Search"
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
            results.map(msg => (
              <div key={msg.id} className="search-result-item" onClick={() => {
                // Scroll to message in chat
                const el = document.querySelector(`[data-message-id="${msg.id}"]`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.style.background = 'rgba(88, 101, 242, 0.15)';
                  setTimeout(() => { el.style.background = ''; }, 2000);
                }
                setOpen(false);
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: `hsl(${(msg.author_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                }}>
                  {msg.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="search-result-content">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="search-result-author">{msg.username}</span>
                    <span className="search-result-date">{formatDate(msg.created_at)}</span>
                  </div>
                  <div className="search-result-text">{msg.content}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
