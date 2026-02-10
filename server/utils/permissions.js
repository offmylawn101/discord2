// Discord-like permission bitfield system
const PERMISSIONS = {
  // General
  ADMINISTRATOR:          1n << 3n,
  VIEW_CHANNEL:           1n << 10n,
  MANAGE_CHANNELS:        1n << 4n,
  MANAGE_ROLES:           1n << 28n,
  MANAGE_SERVER:          1n << 5n,
  CREATE_INVITE:          1n << 0n,
  CHANGE_NICKNAME:        1n << 26n,
  MANAGE_NICKNAMES:       1n << 27n,
  KICK_MEMBERS:           1n << 1n,
  BAN_MEMBERS:            1n << 2n,
  MANAGE_WEBHOOKS:        1n << 29n,
  VIEW_AUDIT_LOG:         1n << 7n,

  // Text
  SEND_MESSAGES:          1n << 11n,
  SEND_TTS_MESSAGES:      1n << 12n,
  MANAGE_MESSAGES:        1n << 13n,
  EMBED_LINKS:            1n << 14n,
  ATTACH_FILES:           1n << 15n,
  READ_MESSAGE_HISTORY:   1n << 16n,
  MENTION_EVERYONE:       1n << 17n,
  USE_EXTERNAL_EMOJIS:    1n << 18n,
  ADD_REACTIONS:           1n << 6n,
  CREATE_THREADS:         1n << 35n,
  SEND_THREAD_MESSAGES:   1n << 38n,
  MANAGE_THREADS:         1n << 34n,

  // Voice
  CONNECT:                1n << 20n,
  SPEAK:                  1n << 21n,
  MUTE_MEMBERS:           1n << 22n,
  DEAFEN_MEMBERS:         1n << 23n,
  MOVE_MEMBERS:           1n << 24n,
  USE_VAD:                1n << 25n,
  PRIORITY_SPEAKER:       1n << 8n,
  STREAM:                 1n << 9n,
};

// Default permissions for @everyone role
const DEFAULT_PERMISSIONS =
  PERMISSIONS.VIEW_CHANNEL |
  PERMISSIONS.CREATE_INVITE |
  PERMISSIONS.CHANGE_NICKNAME |
  PERMISSIONS.SEND_MESSAGES |
  PERMISSIONS.EMBED_LINKS |
  PERMISSIONS.ATTACH_FILES |
  PERMISSIONS.READ_MESSAGE_HISTORY |
  PERMISSIONS.ADD_REACTIONS |
  PERMISSIONS.USE_EXTERNAL_EMOJIS |
  PERMISSIONS.CONNECT |
  PERMISSIONS.SPEAK |
  PERMISSIONS.USE_VAD |
  PERMISSIONS.STREAM;

// All permissions combined
const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((a, b) => a | b, 0n);

function hasPermission(userPermissions, permission) {
  const perms = BigInt(userPermissions);
  const perm = BigInt(permission);
  // Administrator bypasses all checks
  if ((perms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) return true;
  return (perms & perm) === perm;
}

function computePermissions(db, userId, serverId, channelId = null) {
  // Server owner has all permissions
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!server) return 0n;
  if (server.owner_id === userId) return ALL_PERMISSIONS;

  // Get member's roles
  const memberRoles = db.prepare(`
    SELECT r.permissions, r.position FROM roles r
    INNER JOIN member_roles mr ON mr.role_id = r.id
    WHERE mr.server_id = ? AND mr.user_id = ?
    UNION
    SELECT r.permissions, r.position FROM roles r
    WHERE r.server_id = ? AND r.is_default = 1
  `).all(serverId, userId, serverId);

  if (memberRoles.length === 0) return 0n;

  // Combine role permissions (OR them together)
  let permissions = memberRoles.reduce((acc, role) => acc | BigInt(role.permissions), 0n);

  // Administrator bypasses channel overwrites
  if ((permissions & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }

  // Apply channel permission overwrites if a channel is specified
  if (channelId) {
    const overwrites = db.prepare(`
      SELECT target_type, target_id, allow, deny FROM channel_overwrites
      WHERE channel_id = ?
    `).all(channelId);

    // @everyone role overwrite
    const defaultRole = db.prepare('SELECT id FROM roles WHERE server_id = ? AND is_default = 1').get(serverId);
    if (defaultRole) {
      const everyoneOverwrite = overwrites.find(o => o.target_type === 'role' && o.target_id === defaultRole.id);
      if (everyoneOverwrite) {
        permissions &= ~BigInt(everyoneOverwrite.deny);
        permissions |= BigInt(everyoneOverwrite.allow);
      }
    }

    // Role overwrites (combine all role allows/denies)
    const userRoleIds = db.prepare(`
      SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?
    `).all(serverId, userId).map(r => r.role_id);

    let roleAllow = 0n;
    let roleDeny = 0n;
    for (const overwrite of overwrites) {
      if (overwrite.target_type === 'role' && userRoleIds.includes(overwrite.target_id)) {
        roleAllow |= BigInt(overwrite.allow);
        roleDeny |= BigInt(overwrite.deny);
      }
    }
    permissions &= ~roleDeny;
    permissions |= roleAllow;

    // Member-specific overwrite (highest priority)
    const memberOverwrite = overwrites.find(o => o.target_type === 'member' && o.target_id === userId);
    if (memberOverwrite) {
      permissions &= ~BigInt(memberOverwrite.deny);
      permissions |= BigInt(memberOverwrite.allow);
    }
  }

  return permissions;
}

function checkPermission(db, userId, serverId, channelId, ...requiredPermissions) {
  const perms = computePermissions(db, userId, serverId, channelId);
  for (const perm of requiredPermissions) {
    if (!hasPermission(perms, perm)) return false;
  }
  return true;
}

module.exports = {
  PERMISSIONS,
  DEFAULT_PERMISSIONS,
  ALL_PERMISSIONS,
  hasPermission,
  computePermissions,
  checkPermission,
};
