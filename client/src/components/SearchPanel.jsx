import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';

export default function SearchPanel({ onClose }) {
  const currentServer = useStore(s => s.currentServer);
  const members = useStore(s => s.members);
  const channels = useStore(s => s.channels);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    from: '',
    has: '',
    in: '',
    before: '',
    after: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = useCallback(async (newOffset = 0) => {
    if (!query.trim() && !filters.from && !filters.has) return;
    if (!currentServer) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (filters.from) params.set('from', filters.from);
      if (filters.has) params.set('has', filters.has);
      if (filters.in) params.set('in', filters.in);
      if (filters.before) params.set('before', filters.before);
      if (filters.after) params.set('after', filters.after);
      params.set('limit', '25');
      params.set('offset', String(newOffset));

      const data = await api.get(`/servers/${currentServer.id}/search?${params}`);
      setResults(data.messages);
      setTotal(data.total);
      setOffset(newOffset);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setLoading(false);
  }, [query, filters, currentServer]);

  const handleSubmit = (e) => {
    e.preventDefault();
    doSearch(0);
  };

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <h3>Search</h3>
        <button className="search-panel-close" onClick={onClose}>&times;</button>
      </div>

      <form onSubmit={handleSubmit} className="search-panel-form">
        <div className="search-panel-input-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search messages..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-panel-input"
          />
          <button type="submit" className="search-panel-go" disabled={loading}>
            {loading ? '...' : 'Search'}
          </button>
        </div>

        <button type="button" className="search-filter-toggle" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? 'Hide Filters' : 'Filters'} &#9662;
        </button>

        {showFilters && (
          <div className="search-filters">
            <div className="search-filter-row">
              <label>From user:</label>
              <select value={filters.from} onChange={e => setFilters(f => ({...f, from: e.target.value}))}>
                <option value="">Anyone</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.nickname || m.username}</option>)}
              </select>
            </div>
            <div className="search-filter-row">
              <label>In channel:</label>
              <select value={filters.in} onChange={e => setFilters(f => ({...f, in: e.target.value}))}>
                <option value="">All channels</option>
                {channels.filter(c => c.type === 'text').map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
            <div className="search-filter-row">
              <label>Has:</label>
              <select value={filters.has} onChange={e => setFilters(f => ({...f, has: e.target.value}))}>
                <option value="">Anything</option>
                <option value="file">File</option>
                <option value="image">Image</option>
                <option value="link">Link</option>
              </select>
            </div>
            <div className="search-filter-row">
              <label>Before:</label>
              <input type="date" value={filters.before} onChange={e => setFilters(f => ({...f, before: e.target.value}))} />
            </div>
            <div className="search-filter-row">
              <label>After:</label>
              <input type="date" value={filters.after} onChange={e => setFilters(f => ({...f, after: e.target.value}))} />
            </div>
          </div>
        )}
      </form>

      {/* Results */}
      <div className="search-results">
        {total > 0 && <div className="search-results-count">{total} result{total !== 1 ? 's' : ''}</div>}

        {results.map(msg => (
          <div key={msg.id} className="search-result-item" onClick={() => {
            const { selectChannel } = useStore.getState();
            const ch = channels.find(c => c.id === msg.channel_id);
            if (selectChannel && ch) selectChannel(ch);
            onClose();
          }}>
            <div className="search-result-channel">#{msg.channel_name}</div>
            <div className="search-result-message">
              <div className="search-result-avatar" style={{ background: `hsl(${(msg.author_id || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360}, 60%, 50%)` }}>
                {msg.avatar ? <img src={msg.avatar.startsWith('/') ? msg.avatar : `/uploads/${msg.avatar}`} alt="" /> : (msg.username?.[0] || '?').toUpperCase()}
              </div>
              <div className="search-result-content">
                <div className="search-result-header">
                  <span className="search-result-author">{msg.username}</span>
                  <span className="search-result-date">{new Date(msg.created_at).toLocaleDateString()}</span>
                </div>
                <div className="search-result-text">{highlightMatch(msg.content, query)}</div>
              </div>
            </div>
          </div>
        ))}

        {results.length === 0 && !loading && total === 0 && query && (
          <div className="search-no-results">No results found</div>
        )}

        {/* Pagination */}
        {total > 25 && (
          <div className="search-pagination">
            <button disabled={offset === 0} onClick={() => doSearch(offset - 25)}>Previous</button>
            <span>Page {Math.floor(offset / 25) + 1} of {Math.ceil(total / 25)}</span>
            <button disabled={offset + 25 >= total} onClick={() => doSearch(offset + 25)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i}>{part}</mark>
      : part
  );
}
