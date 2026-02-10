require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

const { authenticate } = require('./middleware/auth');
const { globalLimiter, authLimiter } = require('./middleware/rateLimit');
const { authenticateSocket } = require('./middleware/auth');
const { setupSocketHandlers } = require('./socket/handler');

const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const roleRoutes = require('./routes/roles');
const inviteRoutes = require('./routes/invites');
const dmRoutes = require('./routes/dms');
const relationshipRoutes = require('./routes/relationships');
const eventRoutes = require('./routes/events');
const automodRoutes = require('./routes/automod');
const webhookRoutes = require('./routes/webhooks');
const discoverRoutes = require('./routes/discover');
const notificationRoutes = require('./routes/notifications');
const folderRoutes = require('./routes/folders');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 25000,
});

// Redis adapter for multi-process scaling
if (process.env.REDIS_URL) {
  const { createAdapter } = require('@socket.io/redis-adapter');
  const { Redis } = require('ioredis');
  const pub = new Redis(process.env.REDIS_URL);
  const sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  console.log('Socket.IO using Redis adapter');
}

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Security headers (relaxed CSP for SPA)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Gzip compression
app.use(compression());

// Global rate limit on all API routes
app.use('/api', globalLimiter);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '7d',
  immutable: true,
}));

// Serve client build in production
app.use(express.static(path.join(__dirname, '..', 'client', 'dist'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/servers', authenticate, serverRoutes);
app.use('/api/servers', authenticate, channelRoutes);
app.use('/api/servers', authenticate, roleRoutes);
app.use('/api/servers', authenticate, inviteRoutes);
app.use('/api', authenticate, channelRoutes); // For /api/channels/:id routes
app.use('/api', authenticate, messageRoutes); // For /api/:channelId/messages
app.use('/api', authenticate, inviteRoutes);  // For /api/invites/:code
app.use('/api/servers', authenticate, eventRoutes);
app.use('/api', authenticate, automodRoutes);
app.use('/api/dms', authenticate, dmRoutes);
app.use('/api/relationships', authenticate, relationshipRoutes);
app.use('/api/webhooks', webhookRoutes);  // Webhook execution is public (no auth), management routes handle auth internally
app.use('/api', webhookRoutes);          // For /api/servers/:serverId/webhooks and /api/channels/:channelId/webhooks
app.use('/api/discover', discoverRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);
app.use('/api/folders', authenticate, folderRoutes);

// Users search
const db = require('./models/database');
app.get('/api/users/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json([]);
  const users = await db.all(`
    SELECT id, username, discriminator, avatar, status
    FROM users WHERE username LIKE ? LIMIT 20
  `, [`%${q}%`]);
  res.json(users);
});

// Get user by ID
app.get('/api/users/:userId', authenticate, async (req, res) => {
  const user = await db.get('SELECT id, username, discriminator, avatar, status, banner_color, about_me, custom_status, created_at FROM users WHERE id = ?', [req.params.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Catch all - serve client
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// Socket.IO
io.use(authenticateSocket);
setupSocketHandlers(io);

// Make io accessible to routes
app.set('io', io);

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  console.log(`Discord2 server running on port ${PORT}`);
});
