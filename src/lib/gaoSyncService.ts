import { collection, doc, setDoc, serverTimestamp, getDoc, db } from './db';
import { gaoApi, RealtimeTag } from './gaoApi';
import { globalWsClient, ConnectionStatus } from './realtimeClients';

let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

// Exponential Backoff Retry Strategy configuration for WebSocket Connections:
// Reconnect progression: 1s, 2s, 4s, 8s, then steady interval (16s)
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000];
const STEADY_RETRY_INTERVAL_MS = 16000;

let wsReconnectAttemptCount = 0;
let wsStatus: ConnectionStatus = 'Disconnected';
let wsHealthListeners: Array<(status: ConnectionStatus, retryDelayMs: number, attempt: number) => void> = [];

export function getWsBackoffDelay(attempt: number): number {
  if (attempt < BACKOFF_SCHEDULE_MS.length) {
    return BACKOFF_SCHEDULE_MS[attempt];
  }
  return STEADY_RETRY_INTERVAL_MS;
}

export function subscribeWsHealth(
  callback: (status: ConnectionStatus, retryDelayMs: number, attempt: number) => void
): () => void {
  wsHealthListeners.push(callback);
  callback(wsStatus, getWsBackoffDelay(wsReconnectAttemptCount), wsReconnectAttemptCount);
  
  return () => {
    wsHealthListeners = wsHealthListeners.filter((cb) => cb !== callback);
  };
}

function notifyHealthListeners(status: ConnectionStatus, attempt: number) {
  wsStatus = status;
  wsReconnectAttemptCount = attempt;
  const currentDelay = getWsBackoffDelay(attempt);
  wsHealthListeners.forEach((cb) => cb(status, currentDelay, attempt));
}

// Hook globalWsClient status to manage exponential backoff tracking
globalWsClient.onStatus((status, _msg) => {
  if (status === 'Connected') {
    wsReconnectAttemptCount = 0;
    notifyHealthListeners('Connected', 0);
  } else if (status === 'Reconnecting' || status === 'Connecting') {
    const attempt = globalWsClient.getReconnectAttempt();
    notifyHealthListeners('Reconnecting', attempt);
  } else {
    const attempt = globalWsClient.getReconnectAttempt();
    notifyHealthListeners(status, attempt);
  }
});

export function startGaoSync() {
  if (isSyncing) return;
  isSyncing = true;
  console.log('GAO Realtime Sync Service active (push-only)');

  // Ensure WebSocket connection is active for real incoming reader events
  globalWsClient.connect();
}

export function stopGaoSync() {
  isSyncing = false;
  console.log('GAO Realtime Sync Service stopped');
}

