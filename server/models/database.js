const path = require('path');

const isPg = !!process.env.DATABASE_URL;

let pool, sqlite;

if (isPg) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} else {
  const Database = require('better-sqlite3');
  sqlite = new Database(path.join(__dirname, '..', '..', 'discord2.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
}

// Convert ? placeholders to $1, $2, ... for PostgreSQL
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Convert SQLite-isms to PostgreSQL equivalents
function adaptSql(sql) {
  let s = sql;
  // INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  if (/INSERT\s+OR\s+IGNORE/i.test(sql)) {
    // Already replaced INSERT OR IGNORE INTO, now add ON CONFLICT
    if (!s.includes('ON CONFLICT')) {
      s = s.replace(/(VALUES\s*\([^)]+\))/i, '$1 ON CONFLICT DO NOTHING');
    }
  }
  // INSERT OR REPLACE -> handled per-query with proper upserts
  // GROUP_CONCAT -> STRING_AGG
  s = s.replace(/GROUP_CONCAT\((\w+)\)/gi, "STRING_AGG($1::text, ',')");
  s = s.replace(/GROUP_CONCAT\((\w+\.\w+)\)/gi, "STRING_AGG($1::text, ',')");
  return s;
}

const db = {
  isPg,

  async get(sql, params = []) {
    if (isPg) {
      const res = await pool.query(toPgSql(adaptSql(sql)), params);
      return res.rows[0] || undefined;
    }
    return sqlite.prepare(sql).get(...params);
  },

  async all(sql, params = []) {
    if (isPg) {
      const res = await pool.query(toPgSql(adaptSql(sql)), params);
      return res.rows;
    }
    return sqlite.prepare(sql).all(...params);
  },

  async run(sql, params = []) {
    if (isPg) {
      const res = await pool.query(toPgSql(adaptSql(sql)), params);
      return { changes: res.rowCount, lastInsertRowid: null };
    }
    return sqlite.prepare(sql).run(...params);
  },

  async exec(sql) {
    if (isPg) {
      await pool.query(sql);
    } else {
      sqlite.exec(sql);
    }
  },

  async transaction(fn) {
    if (isPg) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          async get(sql, params = []) {
            const res = await client.query(toPgSql(adaptSql(sql)), params);
            return res.rows[0] || undefined;
          },
          async all(sql, params = []) {
            const res = await client.query(toPgSql(adaptSql(sql)), params);
            return res.rows;
          },
          async run(sql, params = []) {
            const res = await client.query(toPgSql(adaptSql(sql)), params);
            return { changes: res.rowCount };
          },
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // SQLite: wrap synchronous transaction
      return fn({
        get: async (sql, params = []) => sqlite.prepare(sql).get(...params),
        all: async (sql, params = []) => sqlite.prepare(sql).all(...params),
        run: async (sql, params = []) => sqlite.prepare(sql).run(...params),
      });
    }
  },

  async close() {
    if (isPg) await pool.end();
    else sqlite?.close();
  },
};

// Schema initialization
async function initialize() {
  if (isPg) {
    await pool.query(`
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT NULL,
        banner TEXT DEFAULT NULL,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT DEFAULT '',
        system_channel_id TEXT DEFAULT NULL,
        default_role_id TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

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
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS channel_categories (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS channel_overwrites (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('role','member')),
        target_id TEXT NOT NULL,
        allow BIGINT DEFAULT 0,
        deny BIGINT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname TEXT DEFAULT NULL,
        joined_at TIMESTAMP DEFAULT NOW(),
        muted INTEGER DEFAULT 0,
        deafened INTEGER DEFAULT 0,
        PRIMARY KEY (server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS member_roles (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (server_id, user_id, role_id),
        FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        type TEXT DEFAULT 'default' CHECK(type IN ('default','reply','system','pin')),
        reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        thread_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
        pinned INTEGER DEFAULT 0,
        edited_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

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

      CREATE TABLE IF NOT EXISTS reactions (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id, emoji)
      );

      CREATE TABLE IF NOT EXISTS dm_members (
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (channel_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_uses INTEGER DEFAULT 0,
        uses INTEGER DEFAULT 0,
        max_age INTEGER DEFAULT 86400,
        temporary INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
        self_mute INTEGER DEFAULT 0,
        self_deaf INTEGER DEFAULT 0,
        server_mute INTEGER DEFAULT 0,
        server_deaf INTEGER DEFAULT 0,
        streaming INTEGER DEFAULT 0,
        connected_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS read_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        last_message_id TEXT DEFAULT NULL,
        mention_count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS relationships (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('friend','blocked','pending_incoming','pending_outgoing')),
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, target_id)
      );

      CREATE TABLE IF NOT EXISTS typing_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS bans (
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT DEFAULT '',
        banned_by TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        changes TEXT DEFAULT '{}',
        reason TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

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
  } else {
    sqlite.exec(`
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
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT NULL, banner TEXT DEFAULT NULL,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, description TEXT DEFAULT '',
        system_channel_id TEXT DEFAULT NULL, default_role_id TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL, color TEXT DEFAULT '#99AAB5', hoist INTEGER DEFAULT 0, position INTEGER DEFAULT 0,
        permissions BIGINT DEFAULT 0, mentionable INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS channel_categories (
        id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL, position INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY, server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES channel_categories(id) ON DELETE SET NULL,
        name TEXT NOT NULL, topic TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text','voice','announcement','dm','group_dm')),
        position INTEGER DEFAULT 0, slowmode INTEGER DEFAULT 0, nsfw INTEGER DEFAULT 0,
        bitrate INTEGER DEFAULT 64000, user_limit INTEGER DEFAULT 0, last_message_id TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS channel_overwrites (
        id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('role','member')), target_id TEXT NOT NULL,
        allow BIGINT DEFAULT 0, deny BIGINT DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname TEXT DEFAULT NULL, joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        muted INTEGER DEFAULT 0, deafened INTEGER DEFAULT 0, PRIMARY KEY (server_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS member_roles (
        server_id TEXT NOT NULL, user_id TEXT NOT NULL,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (server_id, user_id, role_id),
        FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        type TEXT DEFAULT 'default' CHECK(type IN ('default','reply','system','pin')),
        reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        thread_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
        pinned INTEGER DEFAULT 0, edited_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL, filepath TEXT NOT NULL,
        content_type TEXT DEFAULT 'application/octet-stream', size INTEGER DEFAULT 0,
        width INTEGER DEFAULT NULL, height INTEGER DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS reactions (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id, emoji)
      );
      CREATE TABLE IF NOT EXISTS dm_members (
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (channel_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_uses INTEGER DEFAULT 0, uses INTEGER DEFAULT 0, max_age INTEGER DEFAULT 86400,
        temporary INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS voice_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
        self_mute INTEGER DEFAULT 0, self_deaf INTEGER DEFAULT 0,
        server_mute INTEGER DEFAULT 0, server_deaf INTEGER DEFAULT 0, streaming INTEGER DEFAULT 0,
        connected_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, channel_id)
      );
      CREATE TABLE IF NOT EXISTS read_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        last_message_id TEXT DEFAULT NULL, mention_count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, channel_id)
      );
      CREATE TABLE IF NOT EXISTS relationships (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('friend','blocked','pending_incoming','pending_outgoing')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, target_id)
      );
      CREATE TABLE IF NOT EXISTS typing_states (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, channel_id)
      );
      CREATE TABLE IF NOT EXISTS bans (
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT DEFAULT '', banned_by TEXT NOT NULL REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (server_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL, target_type TEXT, target_id TEXT, changes TEXT DEFAULT '{}',
        reason TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
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
}

initialize().catch(err => {
  console.error('Database initialization error:', err);
  process.exit(1);
});

module.exports = db;
