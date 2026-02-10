const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Avatar upload setup
const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads', 'avatars'),
  filename: (req, file, cb) => cb(null, `${req.userId}-${Date.now()}${path.extname(file.originalname)}`),
});
const avatarUpload = multer({ storage: avatarStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only images are allowed'));
}});

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function generateDiscriminator(username) {
  const existing = await db.all('SELECT discriminator FROM users WHERE username = ? ORDER BY discriminator DESC', [username]);
  if (existing.length === 0) return '0001';
  const last = parseInt(existing[0].discriminator, 10);
  return String(last + 1).padStart(4, '0');
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (username.length < 2 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be 2-32 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingEmail = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const discriminator = await generateDiscriminator(username);
    const password_hash = bcrypt.hashSync(password, 12);

    await db.run(`
      INSERT INTO users (id, username, discriminator, email, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `, [id, username, discriminator, email, password_hash]);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    const token = generateToken(id);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const activity = await db.get('SELECT type, name, details, started_at FROM user_activities WHERE user_id = ?', [req.userId]);
    res.json({ ...sanitizeUser(user), activity: activity || null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set/clear current user activity
router.put('/me/activity', authenticate, async (req, res) => {
  try {
    const { type, name, details } = req.body;
    const validTypes = ['playing', 'streaming', 'listening', 'watching', 'competing', 'custom'];

    // Empty body or missing type/name => clear activity
    if (!type || !name) {
      await db.run('DELETE FROM user_activities WHERE user_id = ?', [req.userId]);
      return res.json({ activity: null });
    }

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid activity type' });
    }

    if (db.isPg) {
      await db.run(`
        INSERT INTO user_activities (user_id, type, name, details, started_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET type = ?, name = ?, details = ?, started_at = CURRENT_TIMESTAMP
      `, [req.userId, type, name, details || '', type, name, details || '']);
    } else {
      await db.run(`
        INSERT OR REPLACE INTO user_activities (user_id, type, name, details, started_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [req.userId, type, name, details || '']);
    }

    const activity = await db.get('SELECT type, name, details, started_at FROM user_activities WHERE user_id = ?', [req.userId]);
    res.json({ activity });
  } catch (err) {
    console.error('Activity update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update current user
router.patch('/me', authenticate, async (req, res) => {
  try {
    const { username, avatar, banner_color, about_me, custom_status } = req.body;
    const updates = [];
    const values = [];

    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
    if (banner_color !== undefined) { updates.push('banner_color = ?'); values.push(banner_color); }
    if (about_me !== undefined) { updates.push('about_me = ?'); values.push(about_me); }
    if (custom_status !== undefined) { updates.push('custom_status = ?'); values.push(custom_status); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.userId);

    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload avatar
router.post('/avatar', authenticate, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await db.run('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [avatarUrl, req.userId]);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile with mutual servers and friends
router.get('/users/:userId/profile', authenticate, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, avatar, banner_color, about_me, custom_status, status, created_at FROM users WHERE id = ?',
      [req.params.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get mutual servers
    const mutualServers = await db.all(`
      SELECT s.id, s.name, s.icon FROM servers s
      INNER JOIN members m1 ON m1.server_id = s.id AND m1.user_id = ?
      INNER JOIN members m2 ON m2.server_id = s.id AND m2.user_id = ?
    `, [req.userId, req.params.userId]);

    // Get mutual friends
    const mutualFriends = await db.all(`
      SELECT u.id, u.username, u.avatar, u.status FROM users u
      INNER JOIN relationships r1 ON r1.user_id = ? AND r1.target_id = u.id AND r1.type = 'friend'
      INNER JOIN relationships r2 ON r2.user_id = ? AND r2.target_id = u.id AND r2.type = 'friend'
    `, [req.userId, req.params.userId]);

    res.json({ ...user, mutualServers, mutualFriends });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/users/:userId/note - Get note about a user
router.get('/users/:userId/note', authenticate, async (req, res) => {
  try {
    const note = await db.get(
      'SELECT content, updated_at FROM user_notes WHERE user_id = ? AND target_id = ?',
      [req.userId, req.params.userId]
    );
    res.json(note || { content: '' });
  } catch (err) {
    console.error('Get note error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /auth/users/:userId/note - Set note about a user
router.put('/users/:userId/note', authenticate, async (req, res) => {
  try {
    const { content } = req.body;

    if (db.isPg) {
      await db.run(`
        INSERT INTO user_notes (user_id, target_id, content, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, target_id) DO UPDATE SET content = ?, updated_at = CURRENT_TIMESTAMP
      `, [req.userId, req.params.userId, content || '', content || '']);
    } else {
      await db.run(`
        INSERT OR REPLACE INTO user_notes (user_id, target_id, content, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, [req.userId, req.params.userId, content || '']);
    }

    res.json({ content: content || '', updated_at: new Date().toISOString() });
  } catch (err) {
    console.error('Set note error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
