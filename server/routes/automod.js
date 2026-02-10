const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');
const { invalidateCache } = require('../utils/automod');
const { logAudit, AUDIT_ACTIONS } = require('../utils/auditLog');

const router = express.Router();

const VALID_TRIGGER_TYPES = ['keyword', 'spam', 'mention_spam', 'link'];
const VALID_ACTION_TYPES = ['block', 'alert', 'timeout'];

// GET /servers/:serverId/automod/rules - List all automod rules
router.get('/servers/:serverId/automod/rules', async (req, res) => {
  try {
    const { serverId } = req.params;

    // Check membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    // Check permission
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const rules = await db.all(
      'SELECT * FROM automod_rules WHERE server_id = ? ORDER BY created_at DESC',
      [serverId]
    );

    // Parse JSON fields for response
    for (const rule of rules) {
      try { rule.trigger_metadata = JSON.parse(rule.trigger_metadata || '{}'); } catch { rule.trigger_metadata = {}; }
      try { rule.action_metadata = JSON.parse(rule.action_metadata || '{}'); } catch { rule.action_metadata = {}; }
      try { rule.exempt_roles = JSON.parse(rule.exempt_roles || '[]'); } catch { rule.exempt_roles = []; }
      try { rule.exempt_channels = JSON.parse(rule.exempt_channels || '[]'); } catch { rule.exempt_channels = []; }
    }

    res.json(rules);
  } catch (err) {
    console.error('Get automod rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /servers/:serverId/automod/rules - Create a new automod rule
router.post('/servers/:serverId/automod/rules', async (req, res) => {
  try {
    const { serverId } = req.params;

    // Check membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    // Check permission
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const {
      name, trigger_type, trigger_metadata,
      action_type, action_metadata,
      exempt_roles, exempt_channels, enabled,
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Rule name is required' });
    }
    if (!VALID_TRIGGER_TYPES.includes(trigger_type)) {
      return res.status(400).json({ error: `Invalid trigger type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` });
    }
    if (!VALID_ACTION_TYPES.includes(action_type)) {
      return res.status(400).json({ error: `Invalid action type. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` });
    }

    const ruleId = uuidv4();
    const triggerMeta = JSON.stringify(trigger_metadata || {});
    const actionMeta = JSON.stringify(action_metadata || {});
    const exemptRolesJson = JSON.stringify(exempt_roles || []);
    const exemptChannelsJson = JSON.stringify(exempt_channels || []);
    const isEnabled = enabled !== undefined ? (enabled ? 1 : 0) : 1;

    await db.run(`
      INSERT INTO automod_rules (id, server_id, name, enabled, trigger_type, trigger_metadata, action_type, action_metadata, exempt_roles, exempt_channels, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [ruleId, serverId, name.trim(), isEnabled, trigger_type, triggerMeta, action_type, actionMeta, exemptRolesJson, exemptChannelsJson, req.userId]);

    // Invalidate automod cache for this server
    invalidateCache(serverId);

    const rule = await db.get('SELECT * FROM automod_rules WHERE id = ?', [ruleId]);
    try { rule.trigger_metadata = JSON.parse(rule.trigger_metadata || '{}'); } catch { rule.trigger_metadata = {}; }
    try { rule.action_metadata = JSON.parse(rule.action_metadata || '{}'); } catch { rule.action_metadata = {}; }
    try { rule.exempt_roles = JSON.parse(rule.exempt_roles || '[]'); } catch { rule.exempt_roles = []; }
    try { rule.exempt_channels = JSON.parse(rule.exempt_channels || '[]'); } catch { rule.exempt_channels = []; }

    res.status(201).json(rule);
  } catch (err) {
    console.error('Create automod rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /servers/:serverId/automod/rules/:ruleId - Update an automod rule
router.patch('/servers/:serverId/automod/rules/:ruleId', async (req, res) => {
  try {
    const { serverId, ruleId } = req.params;

    // Check membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    // Check permission
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    // Verify rule exists and belongs to this server
    const existing = await db.get(
      'SELECT * FROM automod_rules WHERE id = ? AND server_id = ?',
      [ruleId, serverId]
    );
    if (!existing) return res.status(404).json({ error: 'Automod rule not found' });

    const {
      name, trigger_type, trigger_metadata,
      action_type, action_metadata,
      exempt_roles, exempt_channels, enabled,
    } = req.body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Rule name cannot be empty' });
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (trigger_type !== undefined) {
      if (!VALID_TRIGGER_TYPES.includes(trigger_type)) {
        return res.status(400).json({ error: `Invalid trigger type` });
      }
      updates.push('trigger_type = ?');
      values.push(trigger_type);
    }
    if (trigger_metadata !== undefined) {
      updates.push('trigger_metadata = ?');
      values.push(JSON.stringify(trigger_metadata));
    }
    if (action_type !== undefined) {
      if (!VALID_ACTION_TYPES.includes(action_type)) {
        return res.status(400).json({ error: `Invalid action type` });
      }
      updates.push('action_type = ?');
      values.push(action_type);
    }
    if (action_metadata !== undefined) {
      updates.push('action_metadata = ?');
      values.push(JSON.stringify(action_metadata));
    }
    if (exempt_roles !== undefined) {
      updates.push('exempt_roles = ?');
      values.push(JSON.stringify(exempt_roles));
    }
    if (exempt_channels !== undefined) {
      updates.push('exempt_channels = ?');
      values.push(JSON.stringify(exempt_channels));
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(ruleId);
    await db.run(`UPDATE automod_rules SET ${updates.join(', ')} WHERE id = ?`, values);

    // Invalidate automod cache
    invalidateCache(serverId);

    const rule = await db.get('SELECT * FROM automod_rules WHERE id = ?', [ruleId]);
    try { rule.trigger_metadata = JSON.parse(rule.trigger_metadata || '{}'); } catch { rule.trigger_metadata = {}; }
    try { rule.action_metadata = JSON.parse(rule.action_metadata || '{}'); } catch { rule.action_metadata = {}; }
    try { rule.exempt_roles = JSON.parse(rule.exempt_roles || '[]'); } catch { rule.exempt_roles = []; }
    try { rule.exempt_channels = JSON.parse(rule.exempt_channels || '[]'); } catch { rule.exempt_channels = []; }

    res.json(rule);
  } catch (err) {
    console.error('Update automod rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /servers/:serverId/automod/rules/:ruleId - Delete an automod rule
router.delete('/servers/:serverId/automod/rules/:ruleId', async (req, res) => {
  try {
    const { serverId, ruleId } = req.params;

    // Check membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    // Check permission
    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    // Verify rule exists and belongs to this server
    const existing = await db.get(
      'SELECT * FROM automod_rules WHERE id = ? AND server_id = ?',
      [ruleId, serverId]
    );
    if (!existing) return res.status(404).json({ error: 'Automod rule not found' });

    await db.run('DELETE FROM automod_rules WHERE id = ?', [ruleId]);

    // Invalidate automod cache
    invalidateCache(serverId);

    res.json({ deleted: true, id: ruleId });
  } catch (err) {
    console.error('Delete automod rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
