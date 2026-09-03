import { getCollectionDocs, upsertDoc } from './db.js';
import { processTelemetryWithAI, TelemetryPayload } from './aiPipeline.js';

let runtimeHostOverride: string | null = null;
let lastSyncMetadata: {
  lastSyncAt: string | null;
  totalHistoryCount: number;
  realtimeTagsCount: number;
  historyRecordsCount: number;
  lastLatencyMs: number;
  status: 'IDLE' | 'SUCCESS' | 'ERROR';
  error: string | null;
} = {
  lastSyncAt: null,
  totalHistoryCount: 0,
  realtimeTagsCount: 0,
  historyRecordsCount: 0,
  lastLatencyMs: 0,
  status: 'IDLE',
  error: null
};

let lastBatchFingerprint: string = '';
let lastAiProcessedAt: number = 0;

/**
 * Dynamically resolves the API host without hardcoding.
 * Priority:
 * 1. Runtime override (set via API/UI)
 * 2. MongoDB settings document ('people_tracking_api')
 * 3. Environment variable PEOPLE_TRACKING_API_HOST
 * 4. Environment variable APERTURE_RFID_HOST
 * 5. Default fallback ('https://www.i360services.com/peopletrackinguhf')
 */
export async function getPeopleTrackingApiHost(): Promise<string> {
  if (runtimeHostOverride && runtimeHostOverride.trim()) {
    return runtimeHostOverride.trim().replace(/\/+$/, '');
  }

  try {
    const settings = await getCollectionDocs('settings');
    const apiSetting = settings.find((s: any) => s.id === 'people_tracking_api' || s._id === 'people_tracking_api');
    if (apiSetting?.host && typeof apiSetting.host === 'string' && apiSetting.host.trim()) {
      return apiSetting.host.trim().replace(/\/+$/, '');
    }
  } catch {}

  if (process.env.PEOPLE_TRACKING_API_HOST && process.env.PEOPLE_TRACKING_API_HOST.trim()) {
    return process.env.PEOPLE_TRACKING_API_HOST.trim().replace(/\/+$/, '');
  }

  if (process.env.APERTURE_RFID_HOST && process.env.APERTURE_RFID_HOST.trim()) {
    return process.env.APERTURE_RFID_HOST.trim().replace(/\/+$/, '');
  }

  return 'https://www.i360services.com/peopletrackinguhf';
}

/**
 * Updates the API host dynamically without restarting the server or hardcoding
 */
export async function setPeopleTrackingApiHost(newHost: string): Promise<string> {
  const sanitized = (newHost || '').trim().replace(/\/+$/, '');
  if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
    throw new Error('API host must begin with http:// or https://');
  }
  runtimeHostOverride = sanitized;
  try {
    await upsertDoc('settings', {
      id: 'people_tracking_api',
      _id: 'people_tracking_api',
      host: sanitized,
      updatedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.warn('[PeopleTrackingAPI] Failed to persist host to DB:', err.message);
  }
  return sanitized;
}

/**
 * 1. GET ${host}/api/GetHistoryTotalCount
 * Fetches the total number of history records recorded in the UHF system.
 */
export async function fetchHistoryTotalCount(customHost?: string): Promise<{ totalCount: number; raw: string; latencyMs: number }> {
  const host = customHost || await getPeopleTrackingApiHost();
  const url = `${host}/api/GetHistoryTotalCount`;
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' },
      signal: controller.signal
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const raw = (await res.text()).trim();
    const count = parseInt(raw, 10);
    const totalCount = Number.isFinite(count) ? count : 0;

    lastSyncMetadata.totalHistoryCount = totalCount;
    lastSyncMetadata.lastLatencyMs = latencyMs;

    return { totalCount, raw, latencyMs };
  } catch (err: any) {
    clearTimeout(timer);
    const errMsg = err.name === 'AbortError' ? 'Request timed out after 15000ms' : (err.message || 'Unknown network error');
    throw new Error(`Failed to fetch history total count from ${url}: ${errMsg}`);
  }
}

/**
 * 2. GET ${host}/api/GetHistoryRecords/{SkipCount}/{TakeCount}
 * Fetches historical presence and zone transit records.
 */
export async function fetchHistoryRecords(
  skipCount: number = 0,
  takeCount: number = 50,
  customHost?: string
): Promise<any[]> {
  const host = customHost || await getPeopleTrackingApiHost();
  const skip = Math.max(0, Math.floor(skipCount));
  // The max value for TakeCount is 200 per GAO cloud server specification
  const take = Math.min(Math.max(1, Math.floor(takeCount)), 200);
  const url = `${host}/api/GetHistoryRecords/${skip}/${take}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }

    const records = data.map((rec: any, idx: number) => ({
      TagID: String(rec.TagID || rec.tagId || `TAG_HIST_${skip}_${idx}`),
      tagId: String(rec.TagID || rec.tagId || `TAG_HIST_${skip}_${idx}`),
      FirstName: rec.FirstName || rec.firstName || 'Personnel',
      LastName: rec.LastName || rec.lastName || '',
      LocationName: rec.LocationName || rec.Location || rec.location || 'Site Perimeter',
      Location: rec.LocationName || rec.Location || rec.location || 'Site Perimeter',
      EnterTime: rec.EnterTime || rec.enterTime || new Date().toISOString(),
      LeaveTime: rec.LeaveTime || rec.leaveTime || null,
      Duration: typeof rec.Duration === 'number' ? rec.Duration : (parseFloat(rec.Duration) || 0),
      timestamp: rec.EnterTime || new Date().toISOString()
    }));

    // Ensure records are ordered by generated time (EnterTime) in descending order
    records.sort((a, b) => new Date(b.EnterTime).getTime() - new Date(a.EnterTime).getTime());

    return records;
  } catch (err: any) {
    clearTimeout(timer);
    const errMsg = err.name === 'AbortError' ? 'Request timed out after 20000ms' : (err.message || 'Unknown network error');
    throw new Error(`Failed to fetch history records from ${url}: ${errMsg}`);
  }
}

/**
 * Paginates through history records up to maxTotal using TakeCount <= 200.
 * Halts when returned records < takeCount (indicating end of history data in cloud server).
 */
export async function fetchAllHistoryRecordsPaged(
  maxTotal: number = 200,
  batchSize: number = 200,
  customHost?: string
): Promise<any[]> {
  const allRecords: any[] = [];
  let skip = 0;
  const take = Math.min(Math.max(1, batchSize), 200);

  while (allRecords.length < maxTotal) {
    const currentTake = Math.min(take, maxTotal - allRecords.length);
    const batch = await fetchHistoryRecords(skip, currentTake, customHost);
    if (!batch || batch.length === 0) break;
    allRecords.push(...batch);
    if (batch.length < currentTake) {
      // Reached the end of history data in the cloud server
      break;
    }
    skip += batch.length;
  }
  return allRecords;
}

/**
 * 3. GET ${host}/api/GetTagsInRealtime
 * Fetches active real-time tag scans with current location and timestamp.
 * Extracts all current raw data from the tags queue and returns them in descending order of generated time.
 */
export async function fetchTagsInRealtime(customHost?: string): Promise<any[]> {
  const host = customHost || await getPeopleTrackingApiHost();
  const url = `${host}/api/GetTagsInRealtime`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }

    const tags = data.map((tag: any, idx: number) => ({
      TagID: String(tag.TagID || tag.tagId || `TAG_RT_${idx}`),
      tagId: String(tag.TagID || tag.tagId || `TAG_RT_${idx}`),
      Location: String(tag.Location || tag.location || tag.LocationName || 'Active Zone'),
      LocationName: String(tag.Location || tag.location || tag.LocationName || 'Active Zone'),
      Timestamp: tag.Timestamp || tag.timestamp || new Date().toISOString(),
      timestamp: tag.Timestamp || tag.timestamp || new Date().toISOString(),
      FirstName: tag.FirstName || tag.firstName || '',
      LastName: tag.LastName || tag.lastName || ''
    }));

    // Order tag raw data by generated time in descending order
    tags.sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());

    return tags;
  } catch (err: any) {
    clearTimeout(timer);
    const errMsg = err.name === 'AbortError' ? 'Request timed out after 15000ms' : (err.message || 'Unknown network error');
    throw new Error(`Failed to fetch real-time tags from ${url}: ${errMsg}`);
  }
}

/**
 * Master Sync Workflow:
 * 1. Fetches real-time tags and history records from the live external API.
 * 2. Normalizes telemetry and passes it to the Multi-AI Engine (Gemini / ChatGPT / Claude AI).
 * 3. Multi-AI engine generates alerts, incidents, analytics metrics, and AI insights.
 * 4. Persists all generated documents in MongoDB with 10-Day Retention TTL.
 * 5. Broadcasts real-time events to connected dashboard clients via WebSocket & SSE.
 */
export async function syncPeopleTrackingData(options?: {
  syncRealtime?: boolean;
  syncHistory?: boolean;
  historyTake?: number;
  orgId?: string;
}): Promise<{
  success: boolean;
  host: string;
  totalHistoryCount: number;
  realtimeTagsCount: number;
  historyRecordsCount: number;
  aiProcessedCount: number;
  generatedAlerts: number;
  generatedIncidents: number;
  generatedInsights: number;
  latencyMs: number;
  error?: string;
}> {
  const host = await getPeopleTrackingApiHost();
  const startTime = Date.now();
  const doRealtime = options?.syncRealtime !== false;
  const doHistory = options?.syncHistory !== false;
  const historyTake = options?.historyTake || 25;
  const orgId = options?.orgId || 'default';

  let realtimeTags: any[] = [];
  let historyRecords: any[] = [];
  let totalHistoryCount = lastSyncMetadata.totalHistoryCount || 0;

  try {
    // 1. Fetch live total count (non-blocking if it fails)
    try {
      const countRes = await fetchHistoryTotalCount(host);
      totalHistoryCount = countRes.totalCount;
    } catch (e: any) {
      console.warn('[PeopleTrackingAPI] Total count fetch warning:', e.message);
    }

    // 2. Fetch real-time tags
    if (doRealtime) {
      try {
        realtimeTags = await fetchTagsInRealtime(host);
      } catch (e: any) {
        console.warn('[PeopleTrackingAPI] Real-time tags fetch warning:', e.message);
      }
    }

    // 3. Fetch latest history records
    if (doHistory) {
      try {
        historyRecords = await fetchHistoryRecords(0, historyTake, host);
      } catch (e: any) {
        console.warn('[PeopleTrackingAPI] History records fetch warning:', e.message);
      }
    }

    // 4. Combine into normalized TelemetryPayload array
    // 4. Combine into normalized TelemetryPayload array
    // Prioritize the top 20 most recent real-time tags and top 10 history records for AI processing
    const telemetryBatch: TelemetryPayload[] = [];
    const prioritizedTags = realtimeTags.slice(0, 20);
    const prioritizedHistory = historyRecords.slice(0, 10);

    for (const tag of prioritizedTags) {
      telemetryBatch.push({
        TagID: tag.TagID,
        tagId: tag.TagID,
        Location: tag.Location,
        LocationName: tag.Location,
        Timestamp: tag.Timestamp,
        timestamp: tag.Timestamp,
        FirstName: tag.FirstName,
        LastName: tag.LastName,
        source: 'i360_realtime_api',
        orgId
      });
    }

    for (const rec of prioritizedHistory) {
      telemetryBatch.push({
        TagID: rec.TagID,
        tagId: rec.TagID,
        Location: rec.LocationName,
        LocationName: rec.LocationName,
        Timestamp: rec.EnterTime,
        timestamp: rec.EnterTime,
        FirstName: rec.FirstName,
        LastName: rec.LastName,
        EnterTime: rec.EnterTime,
        LeaveTime: rec.LeaveTime,
        Duration: rec.Duration,
        source: 'i360_history_api',
        orgId
      });
    }

    let aiProcessedCount = 0;
    let generatedAlerts = 0;
    let generatedIncidents = 0;
    let generatedInsights = 0;

    // 5. Run through Multi-AI Engine & MongoDB 10-Day Retention pipeline with fingerprint deduplication
    const currentFingerprint = JSON.stringify(telemetryBatch.map(t => `${t.tagId}_${t.Location}_${t.Timestamp}`));
    const isUnchanged = currentFingerprint === lastBatchFingerprint && (Date.now() - lastAiProcessedAt < 30000);

    if (telemetryBatch.length > 0 && !isUnchanged) {
      lastBatchFingerprint = currentFingerprint;
      lastAiProcessedAt = Date.now();
      const aiResult = await processTelemetryWithAI(
        telemetryBatch,
        `i360 People Tracking UHF API (${host})`,
        orgId
      );
      aiProcessedCount = aiResult.processedCount;
      generatedAlerts = aiResult.alerts?.length || 0;
      generatedIncidents = aiResult.incidents?.length || 0;
      generatedInsights = aiResult.insights?.length || 0;
    }

    const latencyMs = Date.now() - startTime;

    // Update internal sync state & cache in MongoDB
    lastSyncMetadata = {
      lastSyncAt: new Date().toISOString(),
      totalHistoryCount,
      realtimeTagsCount: realtimeTags.length,
      historyRecordsCount: historyRecords.length,
      lastLatencyMs: latencyMs,
      status: 'SUCCESS',
      error: null
    };

    try {
      await upsertDoc('settings', {
        id: 'people_tracking_api_status',
        _id: 'people_tracking_api_status',
        host,
        ...lastSyncMetadata,
        updatedAt: new Date().toISOString()
      });
    } catch {}

    return {
      success: true,
      host,
      totalHistoryCount,
      realtimeTagsCount: realtimeTags.length,
      historyRecordsCount: historyRecords.length,
      aiProcessedCount,
      generatedAlerts,
      generatedIncidents,
      generatedInsights,
      latencyMs
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    lastSyncMetadata = {
      ...lastSyncMetadata,
      lastSyncAt: new Date().toISOString(),
      lastLatencyMs: latencyMs,
      status: 'ERROR',
      error: err.message || 'Sync failed'
    };
    return {
      success: false,
      host,
      totalHistoryCount,
      realtimeTagsCount: 0,
      historyRecordsCount: 0,
      aiProcessedCount: 0,
      generatedAlerts: 0,
      generatedIncidents: 0,
      generatedInsights: 0,
      latencyMs,
      error: err.message
    };
  }
}

/**
 * Returns the current cached status of the People Tracking integration
 */
export function getPeopleTrackingSyncStatus() {
  return { ...lastSyncMetadata };
}
