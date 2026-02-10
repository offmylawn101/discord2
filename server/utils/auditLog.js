const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');

const AUDIT_ACTIONS = {
  SERVER_UPDATE: 'SERVER_UPDATE',
  CHANNEL_CREATE: 'CHANNEL_CREATE',
  CHANNEL_UPDATE: 'CHANNEL_UPDATE',
  CHANNEL_DELETE: 'CHANNEL_DELETE',
  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_UPDATE: 'ROLE_UPDATE',
  ROLE_DELETE: 'ROLE_DELETE',
  MEMBER_KICK: 'MEMBER_KICK',
  MEMBER_BAN: 'MEMBER_BAN',
  MEMBER_UNBAN: 'MEMBER_UNBAN',
  MEMBER_ROLE_UPDATE: 'MEMBER_ROLE_UPDATE',
  INVITE_CREATE: 'INVITE_CREATE',
  MESSAGE_DELETE: 'MESSAGE_DELETE',
  MESSAGE_PIN: 'MESSAGE_PIN',
};

async function logAudit(serverId, userId, action, { targetType = null, targetId = null, changes = {}, reason = '' } = {}) {
  try {
    await db.run(`
      INSERT INTO audit_log (id, server_id, user_id, action, target_type, target_id, changes, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [uuidv4(), serverId, userId, action, targetType, targetId, JSON.stringify(changes), reason]);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = { AUDIT_ACTIONS, logAudit };
