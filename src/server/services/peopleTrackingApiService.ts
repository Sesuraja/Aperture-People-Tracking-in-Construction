import { getCollectionDocs, upsertDoc, bulkWriteRealtimeTags, savePlaybackSnapshot, bulkUpsertDocs, getDocById } from './db.js';
import { processTelemetryWithAI, TelemetryPayload } from './aiPipeline.js';
import { isRealTelemetryTag } from './dataPolicy.js';
import { broadcastWebSocketEvent } from './websocket.js';
import { broadcastSseEvent } from './sse.js';

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
 * Dynamically resolves the API host.
 * Priority:
 * 1. Environment variable PEOPLE_TRACKING_API_HOST (.env)
 * 2. Environment variable APERTURE_RFID_HOST (.env)
 * 3. Runtime override (set via API/UI)
 */
export async function getPeopleTrackingApiHost(): Promise<string> {
  if (runtimeHostOverride && runtimeHostOverride.trim()) {
    return runtimeHostOverride.trim().replace(/\/+$/, '');
  }

  if (process.env.PEOPLE_TRACKING_API_HOST && process.env.PEOPLE_TRACKING_API_HOST.trim()) {
    return process.env.PEOPLE_TRACKING_API_HOST.trim().replace(/\/+$/, '');
  }

  if (process.env.APERTURE_RFID_HOST && process.env.APERTURE_RFID_HOST.trim()) {
    return process.env.APERTURE_RFID_HOST.trim().replace(/\/+$/, '');
  }

  return '';
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
  if (!host) {
    throw new Error('API host URL is not configured. Please define PEOPLE_TRACKING_API_HOST in your .env file.');
  }
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
  if (!host) {
    throw new Error('API host URL is not configured. Please define PEOPLE_TRACKING_API_HOST in your .env file.');
  }
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

    const validItems = data.filter((rec: any) => rec && (rec.TagID || rec.tagId));
    const records = validItems.map((rec: any) => {
      const tid = String(rec.TagID || rec.tagId).trim();
      return {
        TagID: tid,
        tagId: tid,
        FirstName: rec.FirstName || rec.firstName || '',
        LastName: rec.LastName || rec.lastName || '',
        LocationName: rec.LocationName || rec.Location || rec.location || 'Site Perimeter',
        Location: rec.LocationName || rec.Location || rec.location || 'Site Perimeter',
        EnterTime: rec.EnterTime || rec.enterTime || new Date().toISOString(),
        LeaveTime: rec.LeaveTime || rec.leaveTime || null,
        Duration: typeof rec.Duration === 'number' ? rec.Duration : (parseFloat(rec.Duration) || 0),
        timestamp: rec.EnterTime || new Date().toISOString()
      };
    });

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
  if (!host) {
    throw new Error('API host URL is not configured. Please define PEOPLE_TRACKING_API_HOST in your .env file.');
  }
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
    const rawTags = Array.isArray(data) ? data : [];
    const validTags = rawTags.filter((tag: any) => tag && (tag.TagID || tag.tagId) && isRealTelemetryTag(tag.TagID || tag.tagId));

    if (validTags.length === 0) {
      // If hardware scanner queue is temporarily empty, check MongoDB live_tags for verified real telemetry tags
      const liveDocs = await getCollectionDocs('live_tags', 'default').catch(() => []);
      const realLiveDocs = (liveDocs || []).filter((t: any) => isRealTelemetryTag(t.TagID || t.tagId || t.id));
      if (realLiveDocs.length > 0) {
        return realLiveDocs.map((t: any) => ({
          TagID: String(t.TagID || t.tagId || t.id).trim(),
          tagId: String(t.TagID || t.tagId || t.id).trim(),
          Location: String(t.Location || t.location || t.LocationName || 'Site Area'),
          LocationName: String(t.Location || t.location || t.LocationName || 'Site Area'),
          Timestamp: t.Timestamp || t.timestamp || new Date().toISOString(),
          timestamp: t.Timestamp || t.timestamp || new Date().toISOString(),
          FirstName: t.FirstName || t.firstName || '',
          LastName: t.LastName || t.lastName || '',
          status: 'Active'
        }));
      }

      // If live_tags is empty, dynamically load all distinct real tags from external API cloud history records
      const latestHistory = await fetchHistoryRecords(0, 50, host).catch(() => []);
      const realHistory = (latestHistory || []).filter((r: any) => r && isRealTelemetryTag(r.TagID || r.tagId));
      const seen = new Set<string>();
      const distinctTags: any[] = [];
      for (const r of realHistory) {
        const tid = String(r.TagID || r.tagId).trim();
        if (!seen.has(tid)) {
          seen.add(tid);
          distinctTags.push({
            TagID: tid,
            tagId: tid,
            Location: String(r.LocationName || r.Location || 'Site Area'),
            LocationName: String(r.LocationName || r.Location || 'Site Area'),
            Timestamp: r.EnterTime || new Date().toISOString(),
            timestamp: r.EnterTime || new Date().toISOString(),
            FirstName: r.FirstName || '',
            LastName: r.LastName || '',
            status: 'Active'
          });
        }
      }
      if (distinctTags.length > 0) {
        return distinctTags;
      }

      return [];
    }

    const tags = validTags.map((tag: any) => {
      const tid = String(tag.TagID || tag.tagId).trim();
      return {
        TagID: tid,
        tagId: tid,
        Location: String(tag.Location || tag.location || tag.LocationName || 'Active Zone'),
        LocationName: String(tag.Location || tag.location || tag.LocationName || 'Active Zone'),
        Timestamp: tag.Timestamp || tag.timestamp || new Date().toISOString(),
        timestamp: tag.Timestamp || tag.timestamp || new Date().toISOString(),
        FirstName: tag.FirstName || tag.firstName || '',
        LastName: tag.LastName || tag.lastName || ''
      };
    });

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
 * Automatically syncs any incoming API telemetry records to all MongoDB collections:
 * 1. history_records, tag_history, history, playback_history
 * 2. registered_people, people (auto-registers new personnel, updates currentZone/presence/lastSeen)
 * 3. devices (auto-registers active hardhat tags and readers with battery, location, assigned worker)
 * 4. hardware_readers (auto-registers reader portals)
 * 5. zones (auto-registers any new zones discovered in the API)
 * 6. attendance_logs (auto-generates / updates employee timecards with firstIn, lastOut, status)
 * 7. live_tags, real_time_tags
 * 8. Broadcasts tag_update_bulk and data_updated via WebSocket & SSE
 */
export async function autoSyncTelemetryToMongoDB(items: any[], orgId: string = 'default'): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;

  const validItems = items.filter(r => r && (r.TagID || r.tagId) && isRealTelemetryTag(r.TagID || r.tagId));
  if (validItems.length === 0) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const tenDaysLater = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  const historyDocs: any[] = [];
  const tagMap = new Map<string, any>();
  const locationSet = new Set<string>();

  for (const rec of validItems) {
    const tid = String(rec.TagID || rec.tagId).trim();
    const loc = String(rec.LocationName || rec.Location || rec.location || 'Site Area').trim();
    const enter = String(rec.EnterTime || rec.enterTime || rec.Timestamp || rec.timestamp || nowIso);
    const leave = String(rec.LeaveTime || rec.leaveTime || 'ACTIVE');
    const fn = String(rec.FirstName || rec.firstName || '').trim();
    const ln = String(rec.LastName || rec.lastName || '').trim();
    const fullName = (fn || ln) ? `${fn} ${ln}`.trim() : (rec.name || `Personnel ${tid.slice(-6).toUpperCase()}`);

    if (loc) locationSet.add(loc);

    const docId = `hist_${tid}_${enter.replace(/[: ]/g, '_')}`;
    historyDocs.push({
      id: docId,
      _id: docId,
      organizationId: orgId,
      TagID: tid,
      tagId: tid,
      FirstName: fn,
      LastName: ln,
      name: fullName,
      LocationName: loc,
      Location: loc,
      EnterTime: enter,
      LeaveTime: leave,
      EnterTimeStr: enter,
      LeaveTimeStr: leave,
      Duration: typeof rec.Duration === 'number' ? rec.Duration : (parseFloat(rec.Duration) || 0),
      durationMins: typeof rec.durationMins === 'number' ? rec.durationMins : (typeof rec.Duration === 'number' ? Math.round(rec.Duration * 60 * 10) / 10 : 10),
      timestamp: enter,
      createdAt: nowIso,
      expireAt: tenDaysLater
    });

    if (!tagMap.has(tid) || new Date(enter).getTime() >= new Date(tagMap.get(tid).enter).getTime()) {
      tagMap.set(tid, {
        tid,
        loc,
        enter,
        leave,
        fn,
        ln,
        fullName,
        duration: rec.Duration || 0
      });
    }
  }

  // Bulk save history records
  if (historyDocs.length > 0) {
    await bulkUpsertDocs('tag_history', historyDocs, orgId).catch(() => {});
    await bulkUpsertDocs('history_records', historyDocs, orgId).catch(() => {});
    await bulkUpsertDocs('history', historyDocs, orgId).catch(() => {});
  }

  // 2. Auto-register / update workforce in registered_people & people
  const existingPeople = await getCollectionDocs('registered_people', undefined, orgId).catch(() => []);
  const existingMap = new Map<string, any>();
  existingPeople.forEach((p: any) => {
    if (p.id) existingMap.set(String(p.id).toLowerCase(), p);
    if (p.tagId) existingMap.set(String(p.tagId).toLowerCase(), p);
    if (p.hardhatTagId) existingMap.set(String(p.hardhatTagId).toLowerCase(), p);
  });

  const existingZones = await getCollectionDocs('zones', undefined, orgId).catch(() => []);
  const zoneNames = new Set(existingZones.map((z: any) => (z.name || z.id || '').toLowerCase().replace(/[^a-z0-9]/g, '')));

  for (const [tid, item] of tagMap.entries()) {
    const existing = existingMap.get(tid.toLowerCase());
    const workerName = item.fullName && !item.fullName.startsWith('Personnel ') ? item.fullName : (existing?.name || item.fullName);
    const workerRole = existing?.role || 'Field Personnel';
    const workerCompany = existing?.tradeCompany || existing?.company || 'Field Team';

    const personDoc = {
      ...(existing || {}),
      id: tid,
      _id: tid,
      tagId: tid,
      hardhatTagId: tid,
      organizationId: orgId,
      firstName: item.fn || existing?.firstName || '',
      lastName: item.ln || existing?.lastName || '',
      name: workerName,
      role: workerRole,
      company: workerCompany,
      tradeCompany: workerCompany,
      currentZone: item.loc,
      location: item.loc,
      shiftStatus: existing?.shiftStatus || 'ON_SITE',
      presenceState: 'ACTIVE',
      safetyScore: existing?.safetyScore || 98,
      ppeStatus: existing?.ppeStatus || 'COMPLIANT',
      trainingStatus: existing?.trainingStatus || 'COMPLIANT',
      status: 'ACTIVE',
      lastSeen: item.enter,
      updatedAt: nowIso,
      createdAt: existing?.createdAt || nowIso,
      expireAt: tenDaysLater
    };

    await upsertDoc('registered_people', personDoc, orgId).catch(() => {});
    await upsertDoc('people', personDoc, orgId).catch(() => {});

    // 3. Auto-register Tag as an Active Device in 'devices'
    const deviceDoc = {
      id: tid,
      _id: tid,
      deviceId: tid,
      name: `${workerName}'s Tag`,
      tagId: tid,
      category: 'TAG',
      type: 'UHF RFID Hardhat Tag',
      status: 'Active',
      battery: 95,
      rssi: -60,
      location: item.loc,
      currentZone: item.loc,
      assignedWorker: workerName,
      assignedWorkerId: tid,
      lastSeen: item.enter,
      organizationId: orgId,
      updatedAt: nowIso,
      createdAt: nowIso,
      expireAt: tenDaysLater
    };
    await upsertDoc('devices', deviceDoc, orgId).catch(() => {});

    // 4. Auto-generate Attendance timecard in 'attendance_logs'
    const enterDate = new Date(item.enter);
    const timeStr = !isNaN(enterDate.getTime()) ? enterDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '08:00 AM';
    const dateStr = !isNaN(enterDate.getTime()) ? enterDate.toISOString().split('T')[0] : nowIso.split('T')[0];

    const attDoc = {
      id: `att_${tid}`,
      _id: `att_${tid}`,
      personId: tid,
      rfidTagId: tid,
      name: workerName,
      role: workerRole,
      company: workerCompany,
      department: existing?.department || 'Operations',
      siteZone: item.loc,
      shift: 'Day Shift (07:00-15:30)',
      firstIn: timeStr,
      lastOut: item.leave || 'ACTIVE',
      breakDurationMins: 0,
      totalHoursStr: 'Active On-Site',
      totalMins: Math.round((parseFloat(item.duration) || 0.1) * 60) || 60,
      overtimeHours: 0,
      isLate: false,
      isOvertime: false,
      geoStatus: 'IN_GEO_FENCE',
      status: 'PRESENT',
      hourlyRate: 35,
      punchType: 'RFID_AUTO',
      gateLocation: item.loc,
      date: dateStr,
      updatedAt: nowIso,
      organizationId: orgId,
      createdAt: nowIso,
      expireAt: tenDaysLater
    };
    await upsertDoc('attendance_logs', attDoc, orgId).catch(() => {});

    // 5. Update live_tags
    const liveTagDoc = {
      id: tid,
      _id: tid,
      TagID: tid,
      tagId: tid,
      organizationId: orgId,
      Location: item.loc,
      LocationName: item.loc,
      Timestamp: item.enter,
      timestamp: item.enter,
      FirstName: item.fn,
      LastName: item.ln,
      name: workerName,
      role: workerRole,
      status: 'Active',
      updatedAt: nowIso,
      expireAt: tenDaysLater
    };
    await upsertDoc('live_tags', liveTagDoc, orgId).catch(() => {});
    await upsertDoc('real_time_tags', liveTagDoc, orgId).catch(() => {});
  }

  // 6. Auto-register hardware readers and zones
  for (const loc of locationSet) {
    const clean = loc.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const readerId = `GAO-UHF-PORTAL-${clean}`;
    const readerDoc = {
      id: readerId,
      _id: readerId,
      readerId,
      name: `Fixed UHF Portal (${loc})`,
      category: 'READER',
      type: 'UHF Fixed Portal',
      status: 'Online',
      location: loc,
      zoneId: loc,
      organizationId: orgId,
      lastSeen: nowIso,
      updatedAt: nowIso,
      createdAt: nowIso
    };
    await upsertDoc('hardware_readers', readerDoc, orgId).catch(() => {});
    await upsertDoc('devices', readerDoc, orgId).catch(() => {});

    // Auto-create zone if not present
    const cleanLower = loc.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!zoneNames.has(cleanLower)) {
      zoneNames.add(cleanLower);
      const zoneId = `zone_${cleanLower}`;
      await upsertDoc('zones', {
        id: zoneId,
        _id: zoneId,
        zoneId,
        name: loc,
        category: 'OPERATIONAL',
        hazardLevel: 'normal',
        capacity: 25,
        siteId: 'metro-tower',
        x: 20,
        y: 20,
        width: 30,
        height: 30,
        organizationId: orgId,
        updatedAt: nowIso
      }, orgId).catch(() => {});
    }
  }

  // 7. Broadcast real-time notifications to connected clients
  const updatedCollections = [
    'history_records', 'tag_history', 'history',
    'registered_people', 'people', 'devices', 'hardware_readers',
    'attendance_logs', 'zones', 'live_tags', 'real_time_tags'
  ];
  broadcastWebSocketEvent('tag_update_bulk', historyDocs.slice(0, 50), orgId);
  broadcastWebSocketEvent('data_updated', { collections: updatedCollections }, orgId);
  broadcastSseEvent('data_updated', { collections: updatedCollections }, orgId);
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

    // 2. Fetch real-time tags and persist to MongoDB
    if (doRealtime) {
      try {
        realtimeTags = await fetchTagsInRealtime(host);
        if (realtimeTags.length > 0) {
          await bulkWriteRealtimeTags(realtimeTags, orgId).catch(() => {});
        }
      } catch (e: any) {
        console.warn('[PeopleTrackingAPI] Real-time tags fetch warning:', e.message);
      }
    }

    // 3. Fetch latest history records and persist to MongoDB
    if (doHistory) {
      try {
        historyRecords = await fetchHistoryRecords(0, historyTake, host);
      } catch (e: any) {
        console.warn('[PeopleTrackingAPI] History records fetch warning:', e.message);
      }
    }

    // Comprehensive automatic storage to all MongoDB collections for ANY incoming API records
    const combinedIncoming = [...realtimeTags, ...historyRecords];
    if (combinedIncoming.length > 0) {
      await autoSyncTelemetryToMongoDB(combinedIncoming, orgId).catch(err => {
        console.warn('[PeopleTrackingAPI] autoSyncTelemetryToMongoDB note:', err.message);
      });
    }

    // If real-time tags are temporarily empty from live reader, fallback to latest known active history events
    if (doRealtime && realtimeTags.length === 0 && historyRecords.length > 0) {
      const realHistory = historyRecords.filter(r => r && r.TagID && isRealTelemetryTag(r.TagID));
      const seen = new Set<string>();
      const distinctFallbackTags: any[] = [];
      for (const r of realHistory) {
        const tid = String(r.TagID || r.tagId).trim();
        if (!seen.has(tid)) {
          seen.add(tid);
          distinctFallbackTags.push({
            id: tid,
            TagID: tid,
            tagId: tid,
            organizationId: orgId,
            Location: r.LocationName || r.Location || 'Site Area',
            LocationName: r.LocationName || r.Location || 'Site Area',
            Timestamp: r.EnterTime || new Date().toISOString(),
            timestamp: r.EnterTime || new Date().toISOString(),
            FirstName: r.FirstName || '',
            LastName: r.LastName || '',
            createdAt: new Date(),
            expireAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
          });
        }
      }
      if (distinctFallbackTags.length > 0) {
        realtimeTags = distinctFallbackTags;
        await bulkWriteRealtimeTags(realtimeTags, orgId).catch(() => {});
        for (const tag of distinctFallbackTags) {
          await upsertDoc('live_tags', tag, orgId).catch(() => {});
        }
      }
    }

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
