import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../utils/api';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

export default function EventsPanel({ onClose }) {
  const {
    currentServer, serverEvents, user, members, roles,
    createEvent, deleteEvent, toggleRsvp, updateEvent,
  } = useStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showRsvps, setShowRsvps] = useState(null);
  const [rsvpList, setRsvpList] = useState([]);

  // Check if user can manage events
  const canManage = (() => {
    if (!currentServer || !user) return false;
    if (currentServer.owner_id === user.id) return true;
    const member = members.find(m => m.id === user.id);
    if (!member) return false;
    const memberRoles = (member.roles || []).map(rid => {
      const role = roles.find(r => r.id === rid || r.id === rid);
      return role;
    }).filter(Boolean);
    for (const role of memberRoles) {
      if (hasPermission(role.permissions || '0', PERMISSIONS.MANAGE_SERVER)) return true;
      if (hasPermission(role.permissions || '0', PERMISSIONS.ADMINISTRATOR)) return true;
    }
    return false;
  })();

  const resetForm = () => {
    setName('');
    setDescription('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setError('');
    setEditingEvent(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Event name is required'); return; }
    if (!startTime) { setError('Start time is required'); return; }

    setCreating(true);
    setError('');
    try {
      if (editingEvent) {
        await updateEvent(currentServer.id, editingEvent.id, {
          name: name.trim(),
          description,
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : null,
          location,
        });
      } else {
        await createEvent(currentServer.id, {
          name: name.trim(),
          description,
          start_time: new Date(startTime).toISOString(),
          end_time: endTime ? new Date(endTime).toISOString() : null,
          location,
        });
      }
      resetForm();
      setShowCreateForm(false);
    } catch (err) {
      setError(err.message || 'Failed to save event');
    }
    setCreating(false);
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setName(event.name);
    setDescription(event.description || '');
    setStartTime(toLocalDatetime(event.start_time));
    setEndTime(event.end_time ? toLocalDatetime(event.end_time) : '');
    setLocation(event.location || '');
    setShowCreateForm(true);
  };

  const handleDelete = async (eventId) => {
    try {
      await deleteEvent(currentServer.id, eventId);
    } catch (err) {
      console.error('Delete event error:', err);
    }
  };

  const handleRsvp = async (eventId) => {
    try {
      await toggleRsvp(currentServer.id, eventId);
    } catch (err) {
      console.error('RSVP error:', err);
    }
  };

  const handleShowRsvps = async (eventId) => {
    if (showRsvps === eventId) {
      setShowRsvps(null);
      setRsvpList([]);
      return;
    }
    try {
      const list = await api.get(`/servers/${currentServer.id}/events/${eventId}/rsvps`);
      setRsvpList(list);
      setShowRsvps(eventId);
    } catch {
      setRsvpList([]);
      setShowRsvps(eventId);
    }
  };

  const formatEventDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const toLocalDatetime = (isoStr) => {
    const date = new Date(isoStr);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const isPast = (dateStr) => {
    return new Date(dateStr) < new Date();
  };

  const now = new Date();
  const sortedEvents = [...serverEvents].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const upcomingEvents = sortedEvents.filter(e => e.status !== 'cancelled' && e.status !== 'completed');
  const pastEvents = sortedEvents.filter(e => e.status === 'cancelled' || e.status === 'completed');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, animation: 'fadeIn 0.15s ease',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 580, maxHeight: '80vh', background: 'var(--bg-primary)',
        borderRadius: 8, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--bg-modifier-active)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="var(--text-normal)" strokeWidth="2"/>
            <path d="M3 10h18" stroke="var(--text-normal)" strokeWidth="2"/>
            <path d="M8 2v4M16 2v4" stroke="var(--text-normal)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 18, color: 'var(--header-primary)' }}>Events</span>
          {canManage && !showCreateForm && (
            <button
              className="btn btn-primary"
              onClick={() => { resetForm(); setShowCreateForm(true); }}
              style={{ fontSize: 13, padding: '6px 16px' }}
            >
              Create Event
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1,
            }}
          >
            X
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          {/* Create/Edit Form */}
          {showCreateForm && (
            <div style={{
              marginBottom: 16, padding: 16, background: 'var(--bg-secondary)',
              borderRadius: 8, border: '1px solid var(--bg-modifier-active)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: 'var(--header-primary)' }}>
                {editingEvent ? 'Edit Event' : 'New Event'}
              </div>

              {error && (
                <div style={{
                  padding: '8px 12px', background: 'rgba(237,66,69,0.15)',
                  color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Event Name *</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="What's the event?"
                  maxLength={100}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Tell people about the event..."
                  rows={3}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Start Time *</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">End Time</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="Where is it happening?"
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn"
                  onClick={() => { setShowCreateForm(false); resetForm(); }}
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-normal)', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={creating}
                  style={{ padding: '8px 16px' }}
                >
                  {creating ? 'Saving...' : editingEvent ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </div>
          )}

          {/* Events List */}
          {upcomingEvents.length === 0 && !showCreateForm && (
            <div style={{
              textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', opacity: 0.5 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No Upcoming Events</div>
              <div style={{ fontSize: 14 }}>
                {canManage ? 'Create an event to let your server know what\'s happening!' : 'There are no upcoming events scheduled.'}
              </div>
            </div>
          )}

          {upcomingEvents.map(event => (
            <EventCard
              key={event.id}
              event={event}
              canManage={canManage}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRsvp={handleRsvp}
              onShowRsvps={handleShowRsvps}
              showRsvps={showRsvps === event.id}
              rsvpList={showRsvps === event.id ? rsvpList : []}
              formatDate={formatEventDate}
              isPast={isPast(event.end_time || event.start_time)}
              userId={user?.id}
            />
          ))}

          {pastEvents.length > 0 && (
            <>
              <div style={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                color: 'var(--text-muted)', padding: '16px 0 8px',
                borderTop: upcomingEvents.length > 0 ? '1px solid var(--bg-modifier-active)' : 'none',
                marginTop: upcomingEvents.length > 0 ? 12 : 0,
              }}>
                Past Events
              </div>
              {pastEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  canManage={canManage}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRsvp={handleRsvp}
                  onShowRsvps={handleShowRsvps}
                  showRsvps={showRsvps === event.id}
                  rsvpList={showRsvps === event.id ? rsvpList : []}
                  formatDate={formatEventDate}
                  isPast={true}
                  userId={user?.id}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EventCard({
  event, canManage, onEdit, onDelete, onRsvp, onShowRsvps,
  showRsvps, rsvpList, formatDate, isPast, userId,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isInterested = event.user_rsvp === 'interested';
  const isCreator = event.creator_id === userId;
  const isCancelled = event.status === 'cancelled';

  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: 8, padding: 16,
      marginBottom: 8, opacity: isPast || isCancelled ? 0.6 : 1,
      border: '1px solid var(--bg-modifier-active)',
      transition: 'opacity 0.15s',
    }}>
      {/* Status badge */}
      {(isCancelled || event.status === 'active') && (
        <div style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700,
          padding: '2px 8px', borderRadius: 3, marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: '0.5px',
          background: isCancelled ? 'rgba(237,66,69,0.15)' : 'rgba(87,242,135,0.15)',
          color: isCancelled ? '#ED4245' : '#57F287',
        }}>
          {isCancelled ? 'Cancelled' : 'Live Now'}
        </div>
      )}

      {/* Date */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: isPast ? 'var(--text-muted)' : '#5865F2',
        marginBottom: 4, textTransform: 'uppercase',
      }}>
        {formatDate(event.start_time)}
        {event.end_time && (
          <span style={{ fontWeight: 400, textTransform: 'none' }}> - {formatDate(event.end_time)}</span>
        )}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 18, fontWeight: 700, color: 'var(--header-primary)',
        marginBottom: 4,
      }}>
        {event.name}
      </div>

      {/* Description */}
      {event.description && (
        <div style={{
          fontSize: 14, color: 'var(--text-normal)', marginBottom: 8,
          lineHeight: 1.4, whiteSpace: 'pre-wrap',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {event.description}
        </div>
      )}

      {/* Location */}
      {event.location && (
        <div style={{
          fontSize: 13, color: 'var(--text-muted)', marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          {event.location}
        </div>
      )}

      {/* Footer: Creator + Interested + Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--bg-modifier-active)',
      }}>
        {/* Creator */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Created by <span style={{ color: 'var(--text-normal)', fontWeight: 500 }}>
            {event.username || 'Unknown'}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Interested count */}
        <button
          onClick={() => onShowRsvps(event.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px',
          }}
          title="View interested members"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#FEE75C' }}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          {event.interested_count || 0} interested
        </button>

        {/* RSVP Button */}
        {!isPast && !isCancelled && (
          <button
            onClick={() => onRsvp(event.id)}
            style={{
              background: isInterested ? 'var(--brand-500)' : 'var(--bg-tertiary)',
              color: isInterested ? 'white' : 'var(--text-normal)',
              border: 'none', borderRadius: 4, padding: '6px 12px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => {
              if (!isInterested) e.currentTarget.style.background = 'var(--bg-modifier-active)';
            }}
            onMouseLeave={e => {
              if (!isInterested) e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {isInterested ? 'Interested' : 'Interested?'}
          </button>
        )}

        {/* Admin actions */}
        {canManage && (
          <div style={{ display: 'flex', gap: 4 }}>
            {!isCancelled && (
              <button
                onClick={() => onEdit(event)}
                style={{
                  background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4,
                  padding: '6px 8px', cursor: 'pointer', color: 'var(--text-muted)',
                  fontSize: 12, display: 'flex', alignItems: 'center',
                }}
                title="Edit event"
              >
                Edit
              </button>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4,
                  padding: '6px 8px', cursor: 'pointer', color: 'var(--text-muted)',
                  fontSize: 12,
                }}
                title="Delete event"
              >
                Delete
              </button>
            ) : (
              <button
                onClick={() => { onDelete(event.id); setConfirmDelete(false); }}
                style={{
                  background: 'rgba(237,66,69,0.15)', border: 'none', borderRadius: 4,
                  padding: '6px 8px', cursor: 'pointer', color: '#ED4245',
                  fontSize: 12, fontWeight: 600,
                }}
                onMouseLeave={() => setConfirmDelete(false)}
              >
                Confirm Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* RSVP List */}
      {showRsvps && (
        <div style={{
          marginTop: 8, padding: '8px 0', borderTop: '1px solid var(--bg-modifier-active)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 6,
          }}>
            Interested Members ({rsvpList.length})
          </div>
          {rsvpList.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              No one has shown interest yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rsvpList.map(r => (
                <div key={r.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: `hsl(${(r.user_id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 60%, 50%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: 'white', flexShrink: 0,
                  }}>
                    {r.avatar ? (
                      <img src={r.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      r.username?.[0]?.toUpperCase() || '?'
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-normal)' }}>
                    {r.username}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
