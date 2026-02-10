import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const pickerRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimeout = useRef(null);

  // Load trending on mount
  useEffect(() => {
    loadTrending();
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const loadTrending = async () => {
    setLoading(true);
    try {
      const data = await api.get('/gif/trending?limit=30');
      setGifs(data.gifs || []);
      setMessage(data.message || '');
    } catch {}
    setLoading(false);
  };

  const handleSearch = useCallback((q) => {
    setQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) {
      loadTrending();
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get(`/gif/search?q=${encodeURIComponent(q)}&limit=30`);
        setGifs(data.gifs || []);
        setMessage(data.message || '');
      } catch {}
      setLoading(false);
    }, 400); // Debounce
  }, []);

  const handleSelect = (gif) => {
    // Send the GIF URL as a message
    onSelect(gif.url);
    onClose();
  };

  return (
    <div className="gif-picker" ref={pickerRef}>
      <div className="gif-picker-header">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search GIFs..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
          className="gif-search-input"
        />
      </div>

      <div className="gif-picker-content">
        {loading && gifs.length === 0 ? (
          <div className="gif-loading">Loading GIFs...</div>
        ) : gifs.length === 0 ? (
          <div className="gif-empty">
            {message || 'No GIFs found'}
          </div>
        ) : (
          <div className="gif-grid">
            {gifs.map(gif => (
              <div key={gif.id} className="gif-item" onClick={() => handleSelect(gif)}>
                <img
                  src={gif.preview || gif.url}
                  alt={gif.title}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="gif-picker-footer">
        <span className="gif-powered-by">Powered by Tenor</span>
      </div>
    </div>
  );
}
