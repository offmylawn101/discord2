const db = require('../models/database');
const { PERMISSIONS, computePermissions } = require('./permissions');

// In-memory cache for automod rules (per server)
const rulesCache = new Map(); // serverId -> { rules, timestamp }
const CACHE_TTL = 60 * 1000; // 60 seconds

// In-memory spam tracking: userId -> [{ timestamp, serverId }]
const spamTracker = new Map();

// Cleanup old spam entries periodically (every 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [userId, entries] of spamTracker) {
    const filtered = entries.filter(e => now - e.timestamp < 60000);
    if (filtered.length === 0) {
      spamTracker.delete(userId);
    } else {
      spamTracker.set(userId, filtered);
    }
  }
}, 30000);

/**
 * Get cached automod rules for a server
 */
async function getRules(serverId) {
  const cached = rulesCache.get(serverId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.rules;
  }

  const rules = await db.all(
    'SELECT * FROM automod_rules WHERE server_id = ? AND enabled = 1',
    [serverId]
  );

  // Parse JSON fields
  for (const rule of rules) {
    try { rule._triggerMeta = JSON.parse(rule.trigger_metadata || '{}'); } catch { rule._triggerMeta = {}; }
    try { rule._actionMeta = JSON.parse(rule.action_metadata || '{}'); } catch { rule._actionMeta = {}; }
    try { rule._exemptRoles = JSON.parse(rule.exempt_roles || '[]'); } catch { rule._exemptRoles = []; }
    try { rule._exemptChannels = JSON.parse(rule.exempt_channels || '[]'); } catch { rule._exemptChannels = []; }
  }

  rulesCache.set(serverId, { rules, timestamp: Date.now() });
  return rules;
}

/**
 * Invalidate the rules cache for a server
 */
function invalidateCache(serverId) {
  rulesCache.delete(serverId);
}

/**
 * Check if user is exempt from automod (server owner or ADMINISTRATOR)
 */
async function isExempt(serverId, userId) {
  const server = await db.get('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
  if (server && server.owner_id === userId) return true;

  const perms = await computePermissions(db, userId, serverId);
  return (perms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR;
}

/**
 * Check if user has an exempt role for a specific rule
 */
async function hasExemptRole(serverId, userId, exemptRoles) {
  if (!exemptRoles || exemptRoles.length === 0) return false;

  const memberRoles = await db.all(
    'SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?',
    [serverId, userId]
  );
  const userRoleIds = memberRoles.map(r => r.role_id);
  return exemptRoles.some(rid => userRoleIds.includes(rid));
}

/**
 * Check keyword trigger
 */
function checkKeyword(content, meta) {
  const lower = content.toLowerCase();

  // Check keywords
  if (meta.keywords && meta.keywords.length > 0) {
    for (const kw of meta.keywords) {
      if (kw && lower.includes(kw.toLowerCase())) {
        return { triggered: true, matched: kw };
      }
    }
  }

  // Check regex patterns
  if (meta.regex_patterns && meta.regex_patterns.length > 0) {
    for (const pattern of meta.regex_patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(content);
        if (match) {
          return { triggered: true, matched: match[0] };
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  return { triggered: false };
}

/**
 * Check spam trigger (message rate limiting)
 */
function checkSpam(userId, serverId, meta) {
  const maxMessages = meta.max_messages || 5;
  const intervalSeconds = meta.interval_seconds || 5;
  const now = Date.now();
  const windowMs = intervalSeconds * 1000;

  // Get user's recent messages
  const entries = spamTracker.get(userId) || [];
  const recentInServer = entries.filter(
    e => e.serverId === serverId && now - e.timestamp < windowMs
  );

  // Add current message
  entries.push({ timestamp: now, serverId });
  spamTracker.set(userId, entries);

  // +1 because we just added the current message
  if (recentInServer.length + 1 > maxMessages) {
    return { triggered: true, matched: `${recentInServer.length + 1} messages in ${intervalSeconds}s` };
  }

  return { triggered: false };
}

/**
 * Check mention spam trigger
 */
function checkMentionSpam(content, meta) {
  const maxMentions = meta.max_mentions || 10;

  // Count user mentions <@userId>
  const userMentions = (content.match(/<@[!&]?[a-f0-9-]+>/g) || []).length;

  // Count @everyone and @here
  const everyoneMentions = (content.match(/@(everyone|here)/g) || []).length;

  const totalMentions = userMentions + everyoneMentions;

  if (totalMentions > maxMentions) {
    return { triggered: true, matched: `${totalMentions} mentions (max ${maxMentions})` };
  }

  return { triggered: false };
}

/**
 * Check link trigger
 */
function checkLink(content, meta) {
  // Extract URLs from content
  const urlRegex = /https?:\/\/[^\s<>]+/gi;
  const urls = content.match(urlRegex) || [];

  if (urls.length === 0) return { triggered: false };

  const blockedDomains = (meta.blocked_domains || []).map(d => d.toLowerCase());
  const allowList = (meta.allow_list || []).map(d => d.toLowerCase());

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.toLowerCase();

      // If there's a blocked domains list, check against it
      if (blockedDomains.length > 0) {
        const isBlocked = blockedDomains.some(bd =>
          domain === bd || domain.endsWith('.' + bd)
        );
        const isAllowed = allowList.some(ad =>
          domain === ad || domain.endsWith('.' + ad)
        );

        if (isBlocked && !isAllowed) {
          return { triggered: true, matched: domain };
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return { triggered: false };
}

/**
 * Execute an automod action
 */
async function executeAction(io, rule, serverId, channelId, userId, matchInfo) {
  const actionMeta = rule._actionMeta;
  const reason = actionMeta.custom_message || `AutoMod: ${rule.name} - matched "${matchInfo}"`;

  if (rule.action_type === 'block') {
    return { blocked: true, reason };
  }

  if (rule.action_type === 'alert') {
    // Send alert to configured channel
    const alertChannelId = actionMeta.alert_channel_id;
    if (alertChannelId && io) {
      io.to(`channel:${alertChannelId}`).emit('automod_alert', {
        rule_name: rule.name,
        trigger_type: rule.trigger_type,
        user_id: userId,
        channel_id: channelId,
        matched: matchInfo,
        timestamp: new Date().toISOString(),
      });
    }
    return { blocked: false };
  }

  if (rule.action_type === 'timeout') {
    // Block the message and send alert
    const alertChannelId = actionMeta.alert_channel_id;
    if (alertChannelId && io) {
      io.to(`channel:${alertChannelId}`).emit('automod_alert', {
        rule_name: rule.name,
        trigger_type: rule.trigger_type,
        user_id: userId,
        channel_id: channelId,
        matched: matchInfo,
        timeout_duration: actionMeta.duration_seconds || 300,
        timestamp: new Date().toISOString(),
      });
    }
    return { blocked: true, reason };
  }

  return { blocked: false };
}

/**
 * Main automod check function
 * Called before a message is inserted into the database
 */
async function checkAutomod(db, io, serverId, channelId, userId, content) {
  // No content to check
  if (!content || !content.trim()) {
    return { blocked: false };
  }

  // Server owners and administrators bypass automod
  if (await isExempt(serverId, userId)) {
    return { blocked: false };
  }

  // Get enabled rules for this server
  const rules = await getRules(serverId);
  if (rules.length === 0) {
    return { blocked: false };
  }

  for (const rule of rules) {
    // Check channel exemptions
    if (rule._exemptChannels.includes(channelId)) {
      continue;
    }

    // Check role exemptions
    if (await hasExemptRole(serverId, userId, rule._exemptRoles)) {
      continue;
    }

    let result = { triggered: false };

    switch (rule.trigger_type) {
      case 'keyword':
        result = checkKeyword(content, rule._triggerMeta);
        break;
      case 'spam':
        result = checkSpam(userId, serverId, rule._triggerMeta);
        break;
      case 'mention_spam':
        result = checkMentionSpam(content, rule._triggerMeta);
        break;
      case 'link':
        result = checkLink(content, rule._triggerMeta);
        break;
    }

    if (result.triggered) {
      const actionResult = await executeAction(io, rule, serverId, channelId, userId, result.matched);
      if (actionResult.blocked) {
        return actionResult;
      }
    }
  }

  return { blocked: false };
}

module.exports = { checkAutomod, invalidateCache };
