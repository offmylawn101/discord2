import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { onConnectionStateChange } from '../utils/socket';
import { getSocket } from '../utils/socket';
import { requestNotificationPermission } from '../utils/notifications';
import { startIdleDetection, setIdlePreviousStatus } from '../utils/idle';
import ServerList from './ServerList';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import MemberList from './MemberList';
import FriendsPage from './FriendsPage';
import CreateServerModal from './CreateServerModal';
import InviteModal from './InviteModal';
import ServerSettings from './ServerSettings';
import UserSettings from './UserSettings';
import ThreadPanel from './ThreadPanel';
import QuickSwitcher from './QuickSwitcher';
import ChannelSettings from './ChannelSettings';
import EventsPanel from './EventsPanel';
import ServerDiscovery from './ServerDiscovery';
import SearchPanel from './SearchPanel';

export default function MainLayout() {
  const {
    currentServer, currentChannel, fetchServers, selectServer,
    showCreateServer, showInviteModal, showServerSettings, showSettings,
    showQuickSwitcher, toggleQuickSwitcher,
    fetchDms, fetchRelationships, setConnectionState, fetchFolders,
  } = useStore();
  const connectionState = useStore(s => s.connectionState);
  const activeThread = useStore(s => s.activeThread);
  const showSearchPanel = useStore(s => s.showSearchPanel);
  const showEventsPanel = useStore(s => s.showEventsPanel);
  const showDiscover = useStore(s => s.showDiscover);
  const navigate = useNavigate();

  // Track connection state
  useEffect(() => {
    const unsubscribe = onConnectionStateChange((state) => {
      setConnectionState(state);
    });
    return unsubscribe;
  }, []);

  // Handle missed messages from reconnection
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMissedMessages = (data) => {
      const { addMessage } = useStore.getState();
      for (const msg of (data.messages || [])) {
        addMessage(msg);
      }
    };

    socket.on('missed_messages', handleMissedMessages);
    return () => socket.off('missed_messages', handleMissedMessages);
  }, []);

  // Listen for nickname updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNicknameUpdate = ({ userId, nickname }) => {
      useStore.setState(s => ({
        members: s.members.map(m => m.id === userId ? { ...m, nickname } : m),
      }));
    };

    socket.on('nickname_update', handleNicknameUpdate);
    return () => socket.off('nickname_update', handleNicknameUpdate);
  }, []);

  // Listen for server event updates (real-time)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleEventCreate = (event) => {
      useStore.setState(s => {
        if (s.currentServer?.id !== event.server_id) return {};
        if (s.serverEvents.some(e => e.id === event.id)) return {};
        return { serverEvents: [...s.serverEvents, event] };
      });
    };

    const handleEventUpdate = (event) => {
      useStore.setState(s => {
        if (s.currentServer?.id !== event.server_id) return {};
        if (event.deleted) {
          return { serverEvents: s.serverEvents.filter(e => e.id !== event.id) };
        }
        return {
          serverEvents: s.serverEvents.map(e => e.id === event.id ? { ...e, ...event } : e),
        };
      });
    };

    const handleEventRsvp = ({ event_id, user_id, status, interested_count }) => {
      useStore.setState(s => ({
        serverEvents: s.serverEvents.map(e => {
          if (e.id !== event_id) return e;
          const updated = { ...e, interested_count };
          if (user_id === s.user?.id) {
            updated.user_rsvp = status;
          }
          return updated;
        }),
      }));
    };

    socket.on('server_event_create', handleEventCreate);
    socket.on('server_event_update', handleEventUpdate);
    socket.on('server_event_rsvp', handleEventRsvp);
    return () => {
      socket.off('server_event_create', handleEventCreate);
      socket.off('server_event_update', handleEventUpdate);
      socket.off('server_event_rsvp', handleEventRsvp);
    };
  }, []);

  // Parse route: /channels/@me or /channels/:serverId/:channelId
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean); // ['channels', ...rest]
  const isHome = parts[1] === '@me';
  const routeServerId = !isHome ? parts[1] : null;

  const fetchNotificationSettings = useStore(s => s.fetchNotificationSettings);
  const fetchReadStates = useStore(s => s.fetchReadStates);

  useEffect(() => {
    fetchServers();
    fetchDms();
    fetchRelationships();
    fetchNotificationSettings();
    fetchFolders();
    fetchReadStates();
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Auto-idle detection
  useEffect(() => {
    const cleanup = startIdleDetection((idle) => {
      const socket = getSocket();
      const state = useStore.getState();
      if (!socket || !state.user) return;

      if (idle) {
        // Store current status and switch to idle
        const currentStatus = state.user.status;
        if (currentStatus === 'online') {
          setIdlePreviousStatus(currentStatus);
          socket.emit('status_change', 'idle');
          useStore.setState({ user: { ...state.user, status: 'idle' } });
        }
      } else {
        // Restore previous status
        const prevStatus = state.user.status === 'idle' ? 'online' : state.user.status;
        socket.emit('status_change', prevStatus);
        useStore.setState({ user: { ...state.user, status: prevStatus } });
      }
    });

    return cleanup;
  }, []);

  // Global Ctrl+K / Cmd+K for Quick Switcher
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleQuickSwitcher();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleQuickSwitcher]);

  useEffect(() => {
    if (routeServerId && routeServerId !== currentServer?.id) {
      selectServer(routeServerId).catch(() => navigate('/channels/@me'));
    }
  }, [routeServerId]);

  const showMemberList = currentServer && currentChannel?.type === 'text';

  return (
    <div className="app">
      {connectionState !== 'connected' && <ConnectionBanner state={connectionState} />}
      <ServerList />
      {showDiscover ? (
        <ServerDiscovery />
      ) : (
        <>
          <Sidebar isHome={isHome} />
          {isHome && !currentChannel ? (
            <FriendsPage />
          ) : currentChannel ? (
            <>
              <ChatArea />
              {showSearchPanel && <SearchPanel onClose={() => useStore.setState({ showSearchPanel: false })} />}
              {activeThread && !showSearchPanel && <ThreadPanel />}
              {showMemberList && !activeThread && !showSearchPanel && <MemberList />}
            </>
          ) : (
            <div className="main-content">
              <div className="empty-state">
                <div className="emoji">👋</div>
                <div>Select a channel to start chatting</div>
              </div>
            </div>
          )}
        </>
      )}
      {showCreateServer && <CreateServerModal />}
      {showInviteModal && <InviteModal />}
      {showServerSettings && <ServerSettings />}
      {showSettings && <UserSettings />}
      {showQuickSwitcher && <QuickSwitcher />}
      {showEventsPanel && currentServer && (
        <EventsPanel onClose={() => useStore.setState({ showEventsPanel: false })} />
      )}
      <ChannelSettings />
    </div>
  );
}

function ConnectionBanner({ state }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: state === 'connecting' ? '#FAA61A' : '#ED4245',
      color: 'white', padding: '6px 0', textAlign: 'center',
      fontSize: 13, fontWeight: 600,
      animation: 'fadeIn 0.2s ease',
    }}>
      {state === 'connecting' ? (
        <span>Reconnecting...</span>
      ) : (
        <span>Connection lost. Attempting to reconnect...</span>
      )}
    </div>
  );
}
