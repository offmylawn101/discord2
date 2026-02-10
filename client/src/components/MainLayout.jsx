import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import ServerList from './ServerList';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import MemberList from './MemberList';
import FriendsPage from './FriendsPage';
import CreateServerModal from './CreateServerModal';
import InviteModal from './InviteModal';
import ServerSettings from './ServerSettings';
import UserSettings from './UserSettings';

export default function MainLayout() {
  const {
    currentServer, currentChannel, fetchServers, selectServer,
    showCreateServer, showInviteModal, showServerSettings, showSettings,
    fetchDms, fetchRelationships,
  } = useStore();
  const navigate = useNavigate();

  // Parse route: /channels/@me or /channels/:serverId/:channelId
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean); // ['channels', ...rest]
  const isHome = parts[1] === '@me';
  const routeServerId = !isHome ? parts[1] : null;

  useEffect(() => {
    fetchServers();
    fetchDms();
    fetchRelationships();
  }, []);

  useEffect(() => {
    if (routeServerId && routeServerId !== currentServer?.id) {
      selectServer(routeServerId).catch(() => navigate('/channels/@me'));
    }
  }, [routeServerId]);

  const showMemberList = currentServer && currentChannel?.type === 'text';

  return (
    <div className="app">
      <ServerList />
      <Sidebar isHome={isHome} />
      {isHome && !currentChannel ? (
        <FriendsPage />
      ) : currentChannel ? (
        <>
          <ChatArea />
          {showMemberList && <MemberList />}
        </>
      ) : (
        <div className="main-content">
          <div className="empty-state">
            <div className="emoji">👋</div>
            <div>Select a channel to start chatting</div>
          </div>
        </div>
      )}
      {showCreateServer && <CreateServerModal />}
      {showInviteModal && <InviteModal />}
      {showServerSettings && <ServerSettings />}
      {showSettings && <UserSettings />}
    </div>
  );
}
