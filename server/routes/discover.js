const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = [
  'Gaming',
  'Music',
  'Education',
  'Science',
  'Entertainment',
  'Technology',
  'Art',
  'Social',
];

// GET /discover/categories - Return category tags
router.get('/categories', authenticate, async (req, res) => {
  res.json(CATEGORIES);
});

// GET /discover - List public servers with pagination, search, and sort
router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.q || '';
    const sort = req.query.sort || 'members';
    const category = req.query.category || '';

    let whereClause = 's.is_public = 1';
    const params = [];

    if (search) {
      whereClause += ' AND (s.name LIKE ? OR s.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      whereClause += ' AND s.description LIKE ?';
      params.push(`%${category}%`);
    }

    let orderBy = 'member_count DESC';
    if (sort === 'recent') {
      orderBy = 's.created_at DESC';
    }

    // Count total matching servers
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM servers s WHERE ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // Fetch servers with member count and online count
    const servers = await db.all(`
      SELECT s.id, s.name, s.icon, s.banner, s.description, s.created_at,
        (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count,
        (SELECT COUNT(*) FROM server_members sm2
         INNER JOIN users u ON u.id = sm2.user_id
         WHERE sm2.server_id = s.id AND u.status IN ('online', 'idle', 'dnd')) as online_count
      FROM servers s
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json({
      servers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Discover list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /discover/:serverId - Get details of a public server
router.get('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    const server = await db.get(`
      SELECT s.id, s.name, s.icon, s.banner, s.description, s.owner_id, s.created_at,
        (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count,
        (SELECT COUNT(*) FROM server_members sm2
         INNER JOIN users u ON u.id = sm2.user_id
         WHERE sm2.server_id = s.id AND u.status IN ('online', 'idle', 'dnd')) as online_count,
        (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id) as channel_count
      FROM servers s
      WHERE s.id = ? AND s.is_public = 1
    `, [serverId]);

    if (!server) {
      return res.status(404).json({ error: 'Server not found or not public' });
    }

    // Check if the requesting user is already a member
    const membership = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    server.is_member = !!membership;

    // Get some featured channels (text channels only, for preview)
    const featuredChannels = await db.all(`
      SELECT id, name, type, topic FROM channels
      WHERE server_id = ? AND type = 'text'
      ORDER BY position LIMIT 5
    `, [serverId]);
    server.featured_channels = featuredChannels;

    res.json(server);
  } catch (err) {
    console.error('Discover detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /discover/:serverId/join - Join a public server directly
router.post('/:serverId/join', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    // Verify server is public
    const server = await db.get('SELECT * FROM servers WHERE id = ? AND is_public = 1', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found or not public' });
    }

    // Check if already a member
    const existing = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (existing) {
      return res.json({ server, already_member: true });
    }

    // Check if banned
    const banned = await db.get(
      'SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (banned) {
      return res.status(403).json({ error: 'You are banned from this server' });
    }

    // Add as member
    await db.run(
      'INSERT INTO server_members (server_id, user_id) VALUES (?, ?)',
      [serverId, req.userId]
    );

    // Assign @everyone role
    const defaultRole = await db.get(
      'SELECT id FROM roles WHERE server_id = ? AND is_default = 1',
      [serverId]
    );
    if (defaultRole) {
      await db.run(
        'INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)',
        [serverId, req.userId, defaultRole.id]
      );
    }

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      const user = await db.get(
        'SELECT id, username, discriminator, avatar, status FROM users WHERE id = ?',
        [req.userId]
      );
      io.to(`server:${serverId}`).emit('member_join', {
        server_id: serverId,
        user,
      });
    }

    res.json({ server, joined: true });
  } catch (err) {
    console.error('Discover join error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
