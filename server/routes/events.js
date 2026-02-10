const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { PERMISSIONS, checkPermission } = require('../utils/permissions');
const cache = require('../utils/cache');

const router = express.Router();

// GET /servers/:serverId/events - List upcoming events
router.get('/:serverId/events', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { status } = req.query;

    // Verify membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    let query;
    let params;

    if (status === 'all') {
      query = `
        SELECT se.*, u.username, u.discriminator, u.avatar
        FROM server_events se
        INNER JOIN users u ON u.id = se.creator_id
        WHERE se.server_id = ?
        ORDER BY se.start_time ASC
      `;
      params = [serverId];
    } else {
      query = `
        SELECT se.*, u.username, u.discriminator, u.avatar
        FROM server_events se
        INNER JOIN users u ON u.id = se.creator_id
        WHERE se.server_id = ? AND se.status IN ('scheduled', 'active')
        ORDER BY se.start_time ASC
      `;
      params = [serverId];
    }

    const events = await db.all(query, params);

    // Get current user's RSVPs for these events
    if (events.length > 0) {
      const eventIds = events.map(e => e.id);
      const placeholders = eventIds.map(() => '?').join(',');
      const rsvps = await db.all(
        `SELECT event_id, status FROM event_rsvps WHERE user_id = ? AND event_id IN (${placeholders})`,
        [req.userId, ...eventIds]
      );
      const rsvpMap = {};
      for (const r of rsvps) {
        rsvpMap[r.event_id] = r.status;
      }
      for (const event of events) {
        event.user_rsvp = rsvpMap[event.id] || null;
      }
    }

    res.json(events);
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /servers/:serverId/events - Create event
router.post('/:serverId/events', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const { name, description, start_time, end_time, location } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Event name is required' });
    }
    if (!start_time) {
      return res.status(400).json({ error: 'Start time is required' });
    }

    const eventId = uuidv4();
    await db.run(`
      INSERT INTO server_events (id, server_id, creator_id, name, description, start_time, end_time, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      serverId,
      req.userId,
      name.trim(),
      description || '',
      start_time,
      end_time || null,
      location || '',
    ]);

    const event = await db.get(`
      SELECT se.*, u.username, u.discriminator, u.avatar
      FROM server_events se
      INNER JOIN users u ON u.id = se.creator_id
      WHERE se.id = ?
    `, [eventId]);

    event.user_rsvp = null;

    await cache.del(`server:${serverId}:detail`);

    // Broadcast to server
    const io = req.app.get('io');
    io?.to(`server:${serverId}`).emit('server_event_create', event);

    res.status(201).json(event);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /servers/:serverId/events/:eventId - Update event
router.patch('/:serverId/events/:eventId', authenticate, async (req, res) => {
  try {
    const { serverId, eventId } = req.params;

    if (!await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER)) {
      return res.status(403).json({ error: 'Missing MANAGE_SERVER permission' });
    }

    const event = await db.get(
      'SELECT * FROM server_events WHERE id = ? AND server_id = ?',
      [eventId, serverId]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const { name, description, start_time, end_time, location, status } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (start_time !== undefined) { updates.push('start_time = ?'); values.push(start_time); }
    if (end_time !== undefined) { updates.push('end_time = ?'); values.push(end_time || null); }
    if (location !== undefined) { updates.push('location = ?'); values.push(location); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(eventId);
    await db.run(`UPDATE server_events SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await db.get(`
      SELECT se.*, u.username, u.discriminator, u.avatar
      FROM server_events se
      INNER JOIN users u ON u.id = se.creator_id
      WHERE se.id = ?
    `, [eventId]);

    // Get user's RSVP
    const rsvp = await db.get(
      'SELECT status FROM event_rsvps WHERE event_id = ? AND user_id = ?',
      [eventId, req.userId]
    );
    updated.user_rsvp = rsvp?.status || null;

    await cache.del(`server:${serverId}:detail`);

    const io = req.app.get('io');
    io?.to(`server:${serverId}`).emit('server_event_update', updated);

    res.json(updated);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /servers/:serverId/events/:eventId - Delete event
router.delete('/:serverId/events/:eventId', authenticate, async (req, res) => {
  try {
    const { serverId, eventId } = req.params;

    const event = await db.get(
      'SELECT * FROM server_events WHERE id = ? AND server_id = ?',
      [eventId, serverId]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Allow creator or anyone with MANAGE_SERVER
    const hasPermission = await checkPermission(db, req.userId, serverId, null, PERMISSIONS.MANAGE_SERVER);
    if (!hasPermission && event.creator_id !== req.userId) {
      return res.status(403).json({ error: 'Missing permission to delete this event' });
    }

    await db.run('DELETE FROM server_events WHERE id = ?', [eventId]);
    await cache.del(`server:${serverId}:detail`);

    const io = req.app.get('io');
    io?.to(`server:${serverId}`).emit('server_event_update', { id: eventId, deleted: true, server_id: serverId });

    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /servers/:serverId/events/:eventId/rsvp - Toggle RSVP
router.put('/:serverId/events/:eventId/rsvp', authenticate, async (req, res) => {
  try {
    const { serverId, eventId } = req.params;

    // Verify membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    const event = await db.get(
      'SELECT * FROM server_events WHERE id = ? AND server_id = ?',
      [eventId, serverId]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Check if already RSVP'd
    const existing = await db.get(
      'SELECT * FROM event_rsvps WHERE event_id = ? AND user_id = ?',
      [eventId, req.userId]
    );

    let newStatus;
    if (existing && existing.status === 'interested') {
      // Remove RSVP
      await db.run(
        'DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?',
        [eventId, req.userId]
      );
      await db.run(
        'UPDATE server_events SET interested_count = MAX(0, interested_count - 1) WHERE id = ?',
        [eventId]
      );
      newStatus = null;
    } else {
      // Add RSVP
      if (existing) {
        await db.run(
          'UPDATE event_rsvps SET status = ? WHERE event_id = ? AND user_id = ?',
          ['interested', eventId, req.userId]
        );
      } else {
        await db.run(
          'INSERT INTO event_rsvps (event_id, user_id, status) VALUES (?, ?, ?)',
          [eventId, req.userId, 'interested']
        );
      }
      await db.run(
        'UPDATE server_events SET interested_count = interested_count + 1 WHERE id = ?',
        [eventId]
      );
      newStatus = 'interested';
    }

    const updated = await db.get('SELECT * FROM server_events WHERE id = ?', [eventId]);

    const io = req.app.get('io');
    io?.to(`server:${serverId}`).emit('server_event_rsvp', {
      event_id: eventId,
      user_id: req.userId,
      status: newStatus,
      interested_count: updated.interested_count,
    });

    res.json({
      event_id: eventId,
      user_rsvp: newStatus,
      interested_count: updated.interested_count,
    });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /servers/:serverId/events/:eventId/rsvps - List RSVPs
router.get('/:serverId/events/:eventId/rsvps', authenticate, async (req, res) => {
  try {
    const { serverId, eventId } = req.params;

    // Verify membership
    const member = await db.get(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member of this server' });

    const rsvps = await db.all(`
      SELECT er.*, u.username, u.discriminator, u.avatar
      FROM event_rsvps er
      INNER JOIN users u ON u.id = er.user_id
      WHERE er.event_id = ? AND er.status = 'interested'
      ORDER BY er.created_at ASC
    `, [eventId]);

    res.json(rsvps);
  } catch (err) {
    console.error('Get RSVPs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
