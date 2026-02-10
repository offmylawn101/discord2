const express = require('express');
const router = express.Router();

// Built-in trending GIF categories (these are direct image URLs from popular free sources)
const CATEGORIES = [
  { name: 'Trending', tag: 'trending' },
  { name: 'Reactions', tag: 'reactions' },
  { name: 'Celebrate', tag: 'celebrate' },
  { name: 'Love', tag: 'love' },
  { name: 'Sad', tag: 'sad' },
  { name: 'Angry', tag: 'angry' },
  { name: 'Funny', tag: 'funny' },
  { name: 'Dance', tag: 'dance' },
];

// GET /gif/categories
router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

// GET /gif/search?q=term&limit=20
// Proxy to Tenor if TENOR_API_KEY is set, otherwise return empty
router.get('/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  const tenorKey = process.env.TENOR_API_KEY;

  if (tenorKey && q) {
    try {
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${tenorKey}&limit=${limit}&media_filter=gif,tinygif`;
      const response = await fetch(url);
      const data = await response.json();
      const gifs = (data.results || []).map(r => ({
        id: r.id,
        title: r.title || r.content_description || '',
        url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || '',
        preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || '',
        width: r.media_formats?.gif?.dims?.[0] || 200,
        height: r.media_formats?.gif?.dims?.[1] || 200,
      }));
      return res.json({ gifs });
    } catch (err) {
      console.error('Tenor search failed:', err);
    }
  }

  // Fallback: return empty results with a message
  res.json({ gifs: [], message: q ? 'Set TENOR_API_KEY for GIF search' : 'Type to search GIFs' });
});

// GET /gif/trending?limit=20
router.get('/trending', async (req, res) => {
  const { limit = 20 } = req.query;
  const tenorKey = process.env.TENOR_API_KEY;

  if (tenorKey) {
    try {
      const url = `https://tenor.googleapis.com/v2/featured?key=${tenorKey}&limit=${limit}&media_filter=gif,tinygif`;
      const response = await fetch(url);
      const data = await response.json();
      const gifs = (data.results || []).map(r => ({
        id: r.id,
        title: r.title || r.content_description || '',
        url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || '',
        preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || '',
        width: r.media_formats?.gif?.dims?.[0] || 200,
        height: r.media_formats?.gif?.dims?.[1] || 200,
      }));
      return res.json({ gifs });
    } catch (err) {
      console.error('Tenor trending failed:', err);
    }
  }

  res.json({ gifs: [], message: 'Set TENOR_API_KEY for trending GIFs' });
});

module.exports = router;
