import { getAllConnections, buildHeaders, buildUrl, saveConnection, ApiConnectionConfig } from './connectionsService.js';
import { ingestTelemetry } from './ingestionService.js';

let activePollers: Map<string, NodeJS.Timeout> = new Map();
let isPollerRunning = false;
let globalPollerInterval: NodeJS.Timeout | null = null;

/**
 * Polls a single configured API endpoint
 * Strictly requires connection.enabled !== false, connection.pollingEnabled === true, and valid endpointUrl.
 * On failure, updates error status, logs the error, and NEVER injects synthetic fallback data.
 */
export async function pollSingleConnection(config: ApiConnectionConfig): Promise<void> {
  if (config.enabled === false) {
    return;
  }
  if (!config.endpointUrl || typeof config.endpointUrl !== 'string' || !config.endpointUrl.trim()) {
    console.warn(`[Connection Poller] Skipping "${config.name}": missing or empty endpointUrl`);
    return;
  }

  const targetUrl = buildUrl(config);
  const headers = buildHeaders(config);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const fetchOptions: RequestInit = {
      method: config.method || 'GET',
      headers,
      signal: controller.signal
    };

    if (config.method === 'POST' && config.requestBody) {
      fetchOptions.body = config.requestBody;
    }

    const res = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const rawText = await res.text();
    let parsedJson: any = null;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new Error('Response is not valid JSON format');
    }

    if (!parsedJson || (Array.isArray(parsedJson) && parsedJson.length === 0)) {
      // Empty response: Update connection status without inserting fake data
      const nowIso = new Date().toISOString();
      await saveConnection({
        ...config,
        lastSyncAt: nowIso,
        lastStatus: 'SUCCESS',
        lastError: null,
        updatedAt: nowIso
      });
      return;
    }

    // Pass parsed payload to unified ingestion pipeline
    await ingestTelemetry(parsedJson, `API Poll: ${config.name}`, config.id);
  } catch (err: any) {
    clearTimeout(timeout);
    const errMsg = err.name === 'AbortError' ? 'Request timed out after 15000ms' : (err.message || 'Network unreachable');
    
    // Log failure and update connection metadata without generating fake telemetry
    console.error(`[Connection Poller] Error polling "${config.name}":`, errMsg);
    try {
      const nowIso = new Date().toISOString();
      await saveConnection({
        ...config,
        lastSyncAt: nowIso,
        lastStatus: 'ERROR',
        lastError: errMsg,
        updatedAt: nowIso
      });
    } catch {}
  }
}

/**
 * Iterates through all connections and schedules/reschedules interval loops
 */
export async function syncPollingSchedules(): Promise<void> {
  if (!isPollerRunning) return;

  try {
    const connections = await getAllConnections();
    const activeIds = new Set<string>();

    for (const conn of connections) {
      const isEnabled = conn.enabled !== false && conn.pollingEnabled === true && Boolean(conn.endpointUrl && conn.endpointUrl.trim());
      if (isEnabled) {
        activeIds.add(conn.id);
        const currentIntervalMs = Math.max((conn.pollingIntervalSeconds || 15) * 1000, 5000);

        // Schedule if not already active
        if (!activePollers.has(conn.id)) {
          console.log(`[Connection Poller] Scheduling background poll for "${conn.name}" every ${currentIntervalMs / 1000}s`);
          const timer = setInterval(() => {
            pollSingleConnection(conn).catch(() => {});
          }, currentIntervalMs);
          activePollers.set(conn.id, timer);
          
          // Fire an immediate initial poll in the background
          pollSingleConnection(conn).catch(() => {});
        }
      }
    }

    // Cancel pollers for APIs that are no longer enabled or deleted
    for (const existingId of activePollers.keys()) {
      if (!activeIds.has(existingId)) {
        console.log(`[Connection Poller] Unscheduling poller for connection ID: ${existingId}`);
        clearInterval(activePollers.get(existingId)!);
        activePollers.delete(existingId);
      }
    }
  } catch (err: any) {
    console.error('[Connection Poller] Sync error:', err.message);
  }
}

/**
 * Initializes background polling service
 */
export function startPollingService(): void {
  if (isPollerRunning) return;
  isPollerRunning = true;
  console.log('[Connection Poller] Starting background integration poller service...');

  // Run initial sync
  syncPollingSchedules().catch(() => {});

  // Set a slow interval to periodically scan the DB for config changes (every 20s)
  globalPollerInterval = setInterval(() => {
    syncPollingSchedules().catch(() => {});
  }, 20000);
}

/**
 * Stops all background timers
 */
export function stopPollingService(): void {
  isPollerRunning = false;
  if (globalPollerInterval) {
    clearInterval(globalPollerInterval);
    globalPollerInterval = null;
  }
  for (const timer of activePollers.values()) {
    clearInterval(timer);
  }
  activePollers.clear();
  console.log('[Connection Poller] Background integration poller service stopped.');
}
