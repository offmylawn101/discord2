import React from 'react';
import { useStore } from '../store';
import { getSocket } from '../utils/socket';

export default function VoicePanel() {
  const { voiceChannel, voiceState, setVoiceState, setVoiceChannel, setVoiceParticipants } = useStore();

  if (!voiceChannel) return null;

  const toggleMute = () => {
    const newState = { ...voiceState, selfMute: !voiceState.selfMute };
    setVoiceState(newState);
    const socket = getSocket();
    socket?.emit('voice_state', { channelId: voiceChannel.id, ...newState });
  };

  const toggleDeaf = () => {
    const newDeaf = !voiceState.selfDeaf;
    const newState = { selfDeaf: newDeaf, selfMute: newDeaf ? true : voiceState.selfMute };
    setVoiceState(newState);
    const socket = getSocket();
    socket?.emit('voice_state', { channelId: voiceChannel.id, ...newState });
  };

  const disconnect = () => {
    const socket = getSocket();
    socket?.emit('voice_leave', { channelId: voiceChannel.id });
    setVoiceChannel(null);
    setVoiceParticipants([]);
  };

  return (
    <div className="voice-panel">
      <div className="voice-info">
        <div>
          <div className="voice-status">Voice Connected</div>
          <div className="voice-channel-name">{voiceChannel.name}</div>
        </div>
      </div>
      <div className="voice-controls" style={{ display: 'flex', gap: 4, padding: '4px 8px' }}>
        <button
          className={`voice-btn ${voiceState.selfMute ? 'active' : ''}`}
          onClick={toggleMute}
          title={voiceState.selfMute ? 'Unmute' : 'Mute'}
        >
          {voiceState.selfMute ? '🔇' : '🎙'}
        </button>
        <button
          className={`voice-btn ${voiceState.selfDeaf ? 'active' : ''}`}
          onClick={toggleDeaf}
          title={voiceState.selfDeaf ? 'Undeafen' : 'Deafen'}
        >
          {voiceState.selfDeaf ? '🔈' : '🎧'}
        </button>
        <button className="voice-btn" onClick={disconnect} title="Disconnect" style={{ background: 'var(--red-400)', color: 'white' }}>
          📞
        </button>
      </div>
    </div>
  );
}
