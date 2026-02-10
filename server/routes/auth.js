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

function generateDiscriminator(username) {
  const existing = db.prepare('SELECT discriminator FROM users WHERE username = ? ORDER BY discriminator DESC').all(username);
  if (existing.length === 0) return '0001';
  const last = parseInt(existing[0].discriminator, 10);
  return String(last + 1).padStart(4, '0');
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// Register
router.post('/register', (req, res) => {
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

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const discriminator = generateDiscriminator(username);
    const password_hash = bcrypt.hashSync(password, 12);

    db.prepare(`
      INSERT INTO users (id, username, discriminator, email, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, username, discriminator, email, password_hash);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = generateToken(id);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
router.get('/me', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update current user
router.patch('/me', authenticate, (req, res) => {
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

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload avatar
router.post('/avatar', authenticate, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatarUrl, req.userId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
