const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '..', '..', 'discord2.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      discriminator TEXT NOT NULL DEFAULT '0001',
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      banner_color TEXT DEFAULT '#5865F2',
      about_me TEXT DEFAULT '',
      status TEXT DEFAULT 'offline' CHECK(status IN ('online','idle','dnd','invisible','offline')),
      custom_status TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Servers (Guilds)
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT NULL,
      banner TEXT DEFAULT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT DEFAULT '',
      system_channel_id TEXT DEFAULT NULL,
      default_role_id TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Roles
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#99AAB5',
      hoist INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      permissions BIGINT DEFAULT 0,
      mentionable INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Channel categories
    CREATE TABLE IF NOT EXISTS channel_categories (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Channels
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES channel_categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      topic TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text','voice','announcement','dm','group_dm')),
      position INTEGER DEFAULT 0,
      slowmode INTEGER DEFAULT 0,
      nsfw INTEGER DEFAULT 0,
      bitrate INTEGER DEFAULT 64000,
      user_limit INTEGER DEFAULT 0,
      last_message_id TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Channel permission overwrites
    CREATE TABLE IF NOT EXISTS channel_overwrites (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('role','member')),
      target_id TEXT NOT NULL,
      allow BIGINT DEFAULT 0,
      deny BIGINT DEFAULT 0
    );

    -- Server members
    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT DEFAULT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      muted INTEGER DEFAULT 0,
      deafened INTEGER DEFAULT 0,
      PRIMARY KEY (server_id, user_id)
    );

    -- Member roles junction table
    CREATE TABLE IF NOT EXISTS member_roles (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (server_id, user_id, role_id),
      FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      type TEXT DEFAULT 'default' CHECK(type IN ('default','reply','system','pin')),
      reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      thread_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
      pinned INTEGER DEFAULT 0,
      edited_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Message attachments
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      content_type TEXT DEFAULT 'application/octet-stream',
      size INTEGER DEFAULT 0,
      width INTEGER DEFAULT NULL,
      height INTEGER DEFAULT NULL
    );

    -- Message reactions
    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, user_id, emoji)
    );

    -- DM channels (conversations between users)
    CREATE TABLE IF NOT EXISTS dm_members (
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (channel_id, user_id)
    );

    -- Server invites
    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      max_uses INTEGER DEFAULT 0,
      uses INTEGER DEFAULT 0,
      max_age INTEGER DEFAULT 86400,
      temporary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT NULL
    );

    -- Voice states
    CREATE TABLE IF NOT EXISTS voice_states (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
      self_mute INTEGER DEFAULT 0,
      self_deaf INTEGER DEFAULT 0,
      server_mute INTEGER DEFAULT 0,
      server_deaf INTEGER DEFAULT 0,
      streaming INTEGER DEFAULT 0,
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, channel_id)
    );

    -- Message read states
    CREATE TABLE IF NOT EXISTS read_states (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      last_message_id TEXT DEFAULT NULL,
      mention_count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, channel_id)
    );

    -- User relationships (friends, blocked)
    CREATE TABLE IF NOT EXISTS relationships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('friend','blocked','pending_incoming','pending_outgoing')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, target_id)
    );

    -- Typing indicators (ephemeral, but stored for sync)
    CREATE TABLE IF NOT EXISTS typing_states (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, channel_id)
    );

    -- Bans
    CREATE TABLE IF NOT EXISTS bans (
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT DEFAULT '',
      banned_by TEXT NOT NULL REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (server_id, user_id)
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      changes TEXT DEFAULT '{}',
      reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);
    CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_member_roles_user ON member_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
    CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_invites_server ON invites(server_id);
    CREATE INDEX IF NOT EXISTS idx_voice_states_channel ON voice_states(channel_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_server ON audit_log(server_id, created_at);
  `);
}

initialize();

module.exports = db;
