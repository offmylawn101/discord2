import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { api } from './utils/api';
import { connectSocket, disconnectSocket, getSocket } from './utils/socket';
import Login from './components/Login';
import Register from './components/Register';
import MainLayout from './components/MainLayout';

export default function App() {
  const { token, user, setUser, logout } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (token && !user) {
      api.get('/auth/me')
        .then(setUser)
        .catch(() => logout());
    }
  }, [token]);

  useEffect(() => {
    if (token && user) {
      const socket = connectSocket(token);

      socket.on('message_create', (msg) => {
        useStore.getState().addMessage(msg);
      });
      socket.on('message_update', (msg) => {
        useStore.getState().updateMessage(msg);
      });
      socket.on('message_delete', ({ messageId }) => {
        useStore.getState().removeMessage(messageId);
      });
      socket.on('typing_start', ({ channelId, userId, username }) => {
        if (userId !== user.id) {
          useStore.getState().setTypingUser(channelId, userId, username);
        }
      });
      socket.on('presence_update', ({ userId, status }) => {
        useStore.getState().updatePresence(userId, status);
      });
      socket.on('voice_state_update', (data) => {
        const state = useStore.getState();
        if (data.action === 'join' && state.voiceChannel?.id === data.channelId) {
          state.setVoiceParticipants([...state.voiceParticipants.filter(p => p.userId !== data.userId), {
            userId: data.userId, username: data.username, avatar: data.avatar,
            selfMute: data.selfMute, selfDeaf: data.selfDeaf,
          }]);
        } else if (data.action === 'leave' && state.voiceChannel?.id === data.channelId) {
          state.setVoiceParticipants(state.voiceParticipants.filter(p => p.userId !== data.userId));
        } else if (data.action === 'update' && state.voiceChannel?.id === data.channelId) {
          state.setVoiceParticipants(state.voiceParticipants.map(p =>
            p.userId === data.userId ? { ...p, selfMute: data.selfMute, selfDeaf: data.selfDeaf } : p
          ));
        }
      });
      socket.on('voice_participants', ({ channelId, participants }) => {
        const state = useStore.getState();
        if (state.voiceChannel?.id === channelId) {
          state.setVoiceParticipants(participants);
        }
      });
      socket.on('reaction_add', ({ channelId, messageId, userId, emoji }) => {
        const state = useStore.getState();
        if (state.currentChannel?.id === channelId) {
          const messages = state.messages.map(m => {
            if (m.id !== messageId) return m;
            const existing = m.reactions?.find(r => r.emoji === emoji);
            if (existing) {
              return { ...m, reactions: m.reactions.map(r =>
                r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, userId], me: r.me || userId === user.id } : r
              )};
            }
            return { ...m, reactions: [...(m.reactions || []), { emoji, count: 1, users: [userId], me: userId === user.id }] };
          });
          useStore.setState({ messages });
        }
      });
      socket.on('reaction_remove', ({ channelId, messageId, userId, emoji }) => {
        const state = useStore.getState();
        if (state.currentChannel?.id === channelId) {
          const messages = state.messages.map(m => {
            if (m.id !== messageId) return m;
            return { ...m, reactions: (m.reactions || []).map(r =>
              r.emoji === emoji ? { ...r, count: r.count - 1, users: r.users.filter(u => u !== userId), me: userId === user.id ? false : r.me } : r
            ).filter(r => r.count > 0) };
          });
          useStore.setState({ messages });
        }
      });

      return () => disconnectSocket();
    }
  }, [token, user?.id]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const state = useStore.getState();

      // Escape to close modals
      if (e.key === 'Escape') {
        if (state.showChannelSettings) { state.closeChannelSettings(); return; }
        if (state.showSettings) { state.toggleSettings(); return; }
        if (state.showServerSettings) { state.toggleServerSettings(); return; }
        if (state.showCreateServer) { state.toggleCreateServer(); return; }
        if (state.showInviteModal) { state.toggleInviteModal(); return; }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/channels/*" element={<MainLayout />} />
      <Route path="*" element={<Navigate to="/channels/@me" />} />
    </Routes>
  );
}
