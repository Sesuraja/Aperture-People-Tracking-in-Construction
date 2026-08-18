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
  console.log('Started GAO to Firestore Sync Service');

  // Ensure WebSocket connection is active
  globalWsClient.connect();

  syncInterval = setInterval(async () => {
    try {
      const tags = await gaoApi.getTagsInRealtime();
      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        if (tags && !Array.isArray(tags)) {
          console.warn('Realtime tags synchronization returned non-array:', tags);
        }
        return;
      }
      
      const batchPromises = tags.map(async (tag: RealtimeTag) => {
        const tagRef = doc(db, 'live_tags', tag.TagID);
        // Use setDoc with merge: true to avoid duplicates and update latest state
        await setDoc(tagRef, {
          TagID: tag.TagID,
          Location: tag.Location,
          Timestamp: tag.Timestamp,
          lastSeen: serverTimestamp()
        }, { merge: true });
      });

      await Promise.allSettled(batchPromises);
    } catch (e) {
      console.error('Error syncing GAO data to Firestore:', e);
    }
  }, 3000); // Poll every 3 seconds
}

export function stopGaoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  isSyncing = false;
  console.log('Stopped GAO to Firestore Sync Service');
}

