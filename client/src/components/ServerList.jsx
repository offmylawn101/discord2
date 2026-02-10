import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export default function ServerList() {
  const { servers, currentServer, selectServer, toggleCreateServer, toggleDiscover, showDiscover, unreadServers } = useStore();
  const navigate = useNavigate();
  const isHome = !currentServer && !showDiscover;

  return (
    <div className="server-list">
      {/* Home button */}
      <div className="server-icon-wrapper">
        {isHome && <div className="server-pill" style={{ height: 40 }} />}
        <div
          className={`server-icon home ${isHome ? 'active' : ''}`}
          onClick={() => {
            useStore.setState({ currentServer: null, currentChannel: null, currentDm: null, showDiscover: false });
            navigate('/channels/@me');
          }}
          title="Direct Messages"
        >
          <svg width="28" height="20" viewBox="0 0 28 20">
            <path fill="currentColor" d="M23.0212 1.67671C21.3107 0.879656 19.5079 0.318797 17.6584 0C17.4062 0.461742 17.1749 0.934541 16.9708 1.4184C15.003 1.12145 12.9974 1.12145 11.0292 1.4184C10.8251 0.934541 10.5765 0.461742 10.3416 0C8.49067 0.318797 6.68647 0.879656 4.97867 1.67671C1.56183 6.78844 0.642221 11.7751 1.10162 16.6915C3.10024 18.1606 5.19681 19.0685 7.25985 19.6839C7.81978 18.9106 8.30866 18.0795 8.72426 17.2024C7.87931 16.9108 7.07321 16.5382 6.31073 16.094C6.50756 15.9536 6.69993 15.8059 6.88588 15.6572C11.2009 17.6485 15.8741 17.6485 20.1416 15.6572C20.3287 15.8059 20.5211 15.9536 20.7168 16.094C19.9528 16.5382 19.1451 16.9108 18.3018 17.2024C18.7174 18.0795 19.2063 18.9106 19.7651 19.6839C21.8293 19.0685 23.9271 18.1606 25.9256 16.6915C26.4628 11.0168 25.0508 6.07032 23.0212 1.67671ZM9.68041 13.6383C8.39326 13.6383 7.33575 12.4618 7.33575 11.0168C7.33575 9.5718 8.37164 8.39528 9.68041 8.39528C10.9892 8.39528 12.0467 9.5718 12.0253 11.0168C12.0253 12.4618 10.9892 13.6383 9.68041 13.6383ZM17.3196 13.6383C16.0325 13.6383 14.975 12.4618 14.975 11.0168C14.975 9.5718 16.0109 8.39528 17.3196 8.39528C18.6284 8.39528 19.6859 9.5718 19.6646 11.0168C19.6646 12.4618 18.6284 13.6383 17.3196 13.6383Z" />
          </svg>
        </div>
      </div>

      <div className="server-separator" />

      {servers.map(server => {
        const isActive = currentServer?.id === server.id;
        const unreadCount = unreadServers[server.id] || 0;
        const hasUnread = unreadCount > 0 && !isActive;

        return (
          <div key={server.id} className={`server-icon-wrapper ${isActive ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}`}>
            <div className="server-pill" />
            <div
              className={`server-icon ${isActive ? 'active' : ''}`}
              onClick={() => {
                useStore.setState({ showDiscover: false });
                selectServer(server.id);
                navigate(`/channels/${server.id}`);
              }}
              title={server.name}
            >
              {server.icon ? (
                <img src={server.icon} alt={server.name} />
              ) : (
                server.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              )}
              {hasUnread && (
                <div className="notification-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="server-separator" />

      {/* Add server */}
      <div className="server-icon-wrapper">
        <div
          className="server-icon add"
          onClick={toggleCreateServer}
          title="Add a Server"
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 11.1111H12.8889V4H11.1111V11.1111H4V12.8889H11.1111V20H12.8889V12.8889H20V11.1111Z" />
          </svg>
        </div>
      </div>

      {/* Explore / Discover servers */}
      <div className="server-icon-wrapper">
        <div
          className={`server-icon add ${showDiscover ? 'active' : ''}`}
          onClick={toggleDiscover}
          title="Explore Public Servers"
          style={showDiscover ? { background: 'var(--green-360)', color: 'white', borderRadius: 16 } : {}}
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" />
            <path fill="currentColor" d="M14.829 9.172l-4.656 1.999-1.999 4.657 4.656-1.999 1.999-4.657zm-2.829 4.243c-.781 0-1.414-.633-1.414-1.414 0-.782.633-1.415 1.414-1.415.782 0 1.415.633 1.415 1.415 0 .781-.633 1.414-1.415 1.414z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
