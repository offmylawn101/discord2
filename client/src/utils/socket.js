import { io } from 'socket.io-client';

let socket = null;
let connectionState = 'disconnected'; // 'connected', 'connecting', 'disconnected'
let stateListeners = new Set();
let lastConnectedAt = null;

function notifyStateChange(state) {
  connectionState = state;
  for (const listener of stateListeners) {
    listener(state);
  }
}

export function onConnectionStateChange(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function getConnectionState() {
  return connectionState;
}

export function connectSocket(token) {
  if (socket?.connected) return socket;

  notifyStateChange('connecting');

  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
    const wasConnected = lastConnectedAt;
    lastConnectedAt = Date.now();
    notifyStateChange('connected');

    // If reconnecting, request missed messages
    if (wasConnected) {
      socket.emit('request_missed_messages', { since: wasConnected });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    notifyStateChange('disconnected');
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnection attempt ${attempt}`);
    notifyStateChange('connecting');
  });

  socket.on('reconnect', () => {
    console.log('Socket reconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    notifyStateChange('disconnected');
  });

  // Handle missed messages response
  socket.on('missed_messages', (data) => {
    console.log(`Received ${data.messages?.length || 0} missed messages`);
    // This event will be handled by the store setup in MainLayout
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    lastConnectedAt = null;
    notifyStateChange('disconnected');
  }
}
