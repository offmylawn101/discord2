import React from 'react';
import { useStore } from '../store';

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a3.5 3.5 0 00-3.5 3.5v5a3.5 3.5 0 007 0v-5A3.5 3.5 0 0012 2z"/>
      <path d="M19 10.5a1 1 0 00-2 0 5 5 0 01-10 0 1 1 0 00-2 0 7 7 0 006 6.93V20H8a1 1 0 000 2h8a1 1 0 000-2h-3v-2.57a7 7 0 006-6.93z"/>
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#ED4245">
      <path d="M12 2a3.5 3.5 0 00-3.5 3.5v5a3.5 3.5 0 005.684 2.734L12 11.05V5.5A3.5 3.5 0 0012 2z"/>
      <path d="M2.7 3.7a1 1 0 011.4-1.4l17 17a1 1 0 01-1.4 1.4L2.7 3.7z"/>
      <path d="M19 10.5a1 1 0 00-2 0c0 .886-.231 1.72-.637 2.442l1.46 1.46A6.97 6.97 0 0019 10.5zM5 10.5a1 1 0 00-2 0 7 7 0 006 6.93V20H8a1 1 0 000 2h8a1 1 0 000-2h-3v-2.57c.836-.12 1.627-.389 2.348-.782l-1.46-1.46A4.98 4.98 0 0112 15.5a5 5 0 01-5-5 1 1 0 00-2 0z"/>
    </svg>
  );
}

function HeadphoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12v4.5A3.5 3.5 0 005.5 20H8v-8H4.07A7.93 7.93 0 0112 4a7.93 7.93 0 017.93 8H16v8h2.5a3.5 3.5 0 003.5-3.5V12c0-5.52-4.48-10-10-10z"/>
    </svg>
  );
}

function HeadphoneOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#ED4245">
      <path d="M12 2C6.48 2 2 6.48 2 12v4.5A3.5 3.5 0 005.5 20H8v-8H4.07A7.93 7.93 0 0112 4a7.93 7.93 0 017.93 8H16v8h2.5a3.5 3.5 0 003.5-3.5V12c0-5.52-4.48-10-10-10z"/>
      <path d="M2.7 3.7a1 1 0 011.4-1.4l17 17a1 1 0 01-1.4 1.4L2.7 3.7z" fill="#ED4245"/>
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.92 3.1a1.25 1.25 0 001.96-.86V12.2c0-4.8-5.95-8.59-10.28-8.59S1.72 7.39 1.72 12.19v3.02c0 1.06 1.15 1.72 1.96.86z"/>
    </svg>
  );
}

export default function VoicePanel() {
  const voiceChannel = useStore(s => s.voiceChannel);
  const voiceState = useStore(s => s.voiceState);
  const leaveVoice = useStore(s => s.leaveVoice);
  const toggleMute = useStore(s => s.toggleMute);
  const toggleDeafen = useStore(s => s.toggleDeafen);

  if (!voiceChannel) return null;

  return (
    <div className="voice-panel">
      <div className="voice-panel-info">
        <div className="voice-connected-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#43B581">
            <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z"/>
            <path d="M14 9.00304C14 9.00304 16 10.003 16 12.003C16 14.003 14 15.003 14 15.003" stroke="#43B581" strokeWidth="2" fill="none"/>
            <path d="M17 6.00304C17 6.00304 20 8.00304 20 12.003C20 16.003 17 18.003 17 18.003" stroke="#43B581" strokeWidth="2" fill="none"/>
          </svg>
          <span className="voice-connected-text">Voice Connected</span>
        </div>
        <span className="voice-channel-name">{voiceChannel.name}</span>
      </div>

      <div className="voice-panel-controls">
        <button
          className={`voice-control-btn ${voiceState.selfMute ? 'active' : ''}`}
          onClick={toggleMute}
          title={voiceState.selfMute ? 'Unmute' : 'Mute'}
        >
          {voiceState.selfMute ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button
          className={`voice-control-btn ${voiceState.selfDeaf ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={voiceState.selfDeaf ? 'Undeafen' : 'Deafen'}
        >
          {voiceState.selfDeaf ? <HeadphoneOffIcon /> : <HeadphoneIcon />}
        </button>
        <button className="voice-control-btn disconnect" onClick={leaveVoice} title="Disconnect">
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  );
}

// Small mute/deaf icons used in sidebar voice user list
export function MicOffSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#ED4245">
      <path d="M12 2a3.5 3.5 0 00-3.5 3.5v5a3.5 3.5 0 005.684 2.734L12 11.05V5.5A3.5 3.5 0 0012 2z"/>
      <path d="M2.7 3.7a1 1 0 011.4-1.4l17 17a1 1 0 01-1.4 1.4L2.7 3.7z"/>
    </svg>
  );
}

export function HeadphoneOffSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#ED4245">
      <path d="M12 2C6.48 2 2 6.48 2 12v4.5A3.5 3.5 0 005.5 20H8v-8H4.07A7.93 7.93 0 0112 4a7.93 7.93 0 017.93 8H16v8h2.5a3.5 3.5 0 003.5-3.5V12c0-5.52-4.48-10-10-10z"/>
      <path d="M2.7 3.7a1 1 0 011.4-1.4l17 17a1 1 0 01-1.4 1.4L2.7 3.7z"/>
    </svg>
  );
}
