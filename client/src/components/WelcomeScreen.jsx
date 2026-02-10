import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

export default function WelcomeScreen({ serverId, onClose }) {
  const { currentServer, channels, fetchWelcomeScreen, selectChannel, welcomeScreen } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (serverId) {
      setLoading(true);
      fetchWelcomeScreen(serverId).finally(() => setLoading(false));
    }
  }, [serverId]);

  if (loading) return null;
  if (!welcomeScreen || !welcomeScreen.enabled) return null;

  const server = currentServer;
  const welcomeChannels = welcomeScreen.welcome_channels || [];

  const handleChannelClick = (channelId) => {
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      selectChannel(channel);
    }
    handleDismiss();
  };

  const handleDismiss = () => {
    localStorage.setItem(`welcomeScreenDismissed_${serverId}`, 'true');
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleDismiss();
    }
  };

  return (
    <div className="welcome-screen-overlay" onClick={handleOverlayClick}>
      <div className="welcome-screen-modal">
        {/* Header with server info */}
        <div className="welcome-screen-header">
          {server?.banner ? (
            <div className="welcome-screen-banner">
              <img src={server.banner} alt="" />
              <div className="welcome-screen-banner-overlay" />
            </div>
          ) : (
            <div className="welcome-screen-banner-placeholder" />
          )}
          <div className="welcome-screen-server-info">
            {server?.icon ? (
              <img className="welcome-screen-icon" src={server.icon} alt="" />
            ) : (
              <div className="welcome-screen-icon welcome-screen-icon-fallback">
                {server?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <h1 className="welcome-screen-title">
              Welcome to {server?.name}
            </h1>
            {welcomeScreen.description && (
              <p className="welcome-screen-description">
                {welcomeScreen.description}
              </p>
            )}
          </div>
        </div>

        {/* Channel list */}
        {welcomeChannels.length > 0 && (
          <div className="welcome-screen-channels">
            {welcomeChannels.map((wc, i) => {
              const channel = channels.find(c => c.id === wc.channelId);
              if (!channel) return null;
              return (
                <div
                  key={wc.channelId || i}
                  className="welcome-screen-channel"
                  onClick={() => handleChannelClick(wc.channelId)}
                >
                  <div className="welcome-screen-channel-emoji">
                    {wc.emoji || '#'}
                  </div>
                  <div className="welcome-screen-channel-info">
                    <div className="welcome-screen-channel-name">
                      {channel.name}
                    </div>
                    {wc.description && (
                      <div className="welcome-screen-channel-desc">
                        {wc.description}
                      </div>
                    )}
                  </div>
                  <div className="welcome-screen-channel-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Close button */}
        <button className="welcome-screen-close" onClick={handleDismiss}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
