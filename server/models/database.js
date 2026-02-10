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
        is_public INTEGER DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        parent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_count INTEGER DEFAULT 0,
        last_message_at TIMESTAMP DEFAULT NOW(),
        archived INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_threads_channel ON threads(channel_id);
      CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent_message_id);

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
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
      CREATE INDEX IF NOT EXISTS idx_dm_members_user ON dm_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_dm_members_channel ON dm_members(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_overwrites_channel ON channel_overwrites(channel_id);
      CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
      CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id);

      CREATE TABLE IF NOT EXISTS message_edits (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        edited_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id);

      -- Add is_public column if not exists (migration for existing DBs)
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_public INTEGER DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_servers_public ON servers(is_public);

      -- Full-text search index
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector;
      CREATE INDEX IF NOT EXISTS idx_messages_search ON messages USING GIN(search_vector);

      CREATE TABLE IF NOT EXISTS server_emojis (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        animated INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_server_emojis_server ON server_emojis(server_id);

      CREATE TABLE IF NOT EXISTS server_events (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        location TEXT DEFAULT '',
        image TEXT DEFAULT NULL,
        status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
        interested_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_server_events_server ON server_events(server_id, start_time);

      CREATE TABLE IF NOT EXISTS event_rsvps (
        event_id TEXT NOT NULL REFERENCES server_events(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'interested' CHECK(status IN ('interested','not_interested')),
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (event_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS automod_rules (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        trigger_type TEXT NOT NULL CHECK(trigger_type IN ('keyword','spam','mention_spam','link')),
        trigger_metadata TEXT DEFAULT '{}',
        action_type TEXT NOT NULL CHECK(action_type IN ('block','alert','timeout')),
        action_metadata TEXT DEFAULT '{}',
        exempt_roles TEXT DEFAULT '[]',
        exempt_channels TEXT DEFAULT '[]',
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_automod_rules_server ON automod_rules(server_id);

      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Captain Hook',
        avatar TEXT DEFAULT NULL,
        token TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhooks_channel ON webhooks(channel_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_server ON webhooks(server_id);

      CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('server', 'channel')),
        target_id TEXT NOT NULL,
        muted INTEGER DEFAULT 0,
        mute_until TIMESTAMP DEFAULT NULL,
        suppress_everyone INTEGER DEFAULT 0,
        suppress_roles INTEGER DEFAULT 0,
        notify_level TEXT DEFAULT 'default' CHECK(notify_level IN ('all', 'mentions', 'nothing', 'default')),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, target_type, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_notification_settings_user ON notification_settings(user_id);

      CREATE TABLE IF NOT EXISTS server_folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Folder',
        color TEXT DEFAULT '#5865F2',
        server_ids TEXT DEFAULT '[]',
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_server_folders_user ON server_folders(user_id);

      -- Trigger to auto-update search vector
      CREATE OR REPLACE FUNCTION messages_search_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS messages_search_trigger ON messages;
      CREATE TRIGGER messages_search_trigger
        BEFORE INSERT OR UPDATE OF content ON messages
        FOR EACH ROW EXECUTE FUNCTION messages_search_update();

      -- Backfill existing messages
      UPDATE messages SET search_vector = to_tsvector('english', COALESCE(content, '')) WHERE search_vector IS NULL;
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
        is_public INTEGER DEFAULT 0,
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
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        parent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_count INTEGER DEFAULT 0,
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_threads_channel ON threads(channel_id);
      CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent_message_id);
      CREATE TABLE IF NOT EXISTS server_emojis (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        animated INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_server_emojis_server ON server_emojis(server_id);
      CREATE TABLE IF NOT EXISTS server_events (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        location TEXT DEFAULT '',
        image TEXT DEFAULT NULL,
        status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
        interested_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_server_events_server ON server_events(server_id, start_time);
      CREATE TABLE IF NOT EXISTS event_rsvps (
        event_id TEXT NOT NULL REFERENCES server_events(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'interested' CHECK(status IN ('interested','not_interested')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS automod_rules (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        trigger_type TEXT NOT NULL CHECK(trigger_type IN ('keyword','spam','mention_spam','link')),
        trigger_metadata TEXT DEFAULT '{}',
        action_type TEXT NOT NULL CHECK(action_type IN ('block','alert','timeout')),
        action_metadata TEXT DEFAULT '{}',
        exempt_roles TEXT DEFAULT '[]',
        exempt_channels TEXT DEFAULT '[]',
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_automod_rules_server ON automod_rules(server_id);
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Captain Hook',
        avatar TEXT DEFAULT NULL,
        token TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_webhooks_channel ON webhooks(channel_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_server ON webhooks(server_id);
      CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('server', 'channel')),
        target_id TEXT NOT NULL,
        muted INTEGER DEFAULT 0,
        mute_until DATETIME DEFAULT NULL,
        suppress_everyone INTEGER DEFAULT 0,
        suppress_roles INTEGER DEFAULT 0,
        notify_level TEXT DEFAULT 'default' CHECK(notify_level IN ('all', 'mentions', 'nothing', 'default')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, target_type, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_notification_settings_user ON notification_settings(user_id);
      CREATE TABLE IF NOT EXISTS server_folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Folder',
        color TEXT DEFAULT '#5865F2',
        server_ids TEXT DEFAULT '[]',
        position INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_server_folders_user ON server_folders(user_id);
      CREATE TABLE IF NOT EXISTS message_edits (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        edited_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id);
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
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
      CREATE INDEX IF NOT EXISTS idx_dm_members_user ON dm_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_dm_members_channel ON dm_members(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_overwrites_channel ON channel_overwrites(channel_id);
      CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
      CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id);
    `);

    // FTS5 virtual table for full-text search (separate exec because virtual tables don't support IF NOT EXISTS in all cases)
    try {
      sqlite.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content=messages, content_rowid=rowid);
      `);
    } catch (e) {
      // Table may already exist
    }

    // Add is_public column if not exists (migration for existing DBs)
    try {
      sqlite.exec(`ALTER TABLE servers ADD COLUMN is_public INTEGER DEFAULT 0`);
    } catch (e) {
      // Column may already exist
    }

    // Add message_edits table if not exists (migration for existing DBs)
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS message_edits (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          edited_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id);
      `);
    } catch (e) {
      // Table may already exist
    }

    // Triggers to keep FTS in sync (use try/catch since CREATE TRIGGER IF NOT EXISTS not supported in older SQLite)
    try {
      sqlite.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF content ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
      `);
    } catch (e) {
      // Triggers may already exist
    }
  }
}

initialize().catch(err => {
  console.error('Database initialization error:', err);
  process.exit(1);
});

module.exports = db;
