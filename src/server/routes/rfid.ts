import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { 
  getCollectionDocs, 
  countCollectionDocs,
  upsertDoc, 
  logAuditEvent, 
  bulkWriteRealtimeTags, 
  cleanupStaleRealTimeTags,
  bulkUpsertDocs,
  getDocById
} from '../services/db.js';
import { broadcastSseEvent } from '../services/sse.js';
import { broadcastWebSocketEvent } from '../services/websocket.js';
import { processTelemetryWithAI } from '../services/aiPipeline.js';
import { 
  fetchHistoryTotalCount, 
  fetchHistoryRecords, 
  fetchTagsInRealtime 
} from '../services/peopleTrackingApiService.js';

export const rfidRouter = Router();

// Helper to format date into "yyyy-MM-dd HH:mm:ss" UTC string
export function formatUtcDateTime(dateInput?: string | Date | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Helper to format date into "yyyy-MM-dd HH:mm:ss.fff" UTC string
export function formatUtcTimestampMs(dateInput?: string | Date | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const base = formatUtcDateTime(d);
  const fff = String(isNaN(d.getTime()) ? 0 : d.getUTCMilliseconds()).padStart(3, '0');
  return `${base}.${fff}`;
}

const realtimeTagSchema = z.object({
  TagID: z.string().min(1, 'TagID is required'),
  Location: z.string().optional(),
  LocationName: z.string().optional(),
  Timestamp: z.string().optional(),
  name: z.string().optional(),
  FirstName: z.string().optional(),
  LastName: z.string().optional(),
  role: z.string().optional().default('General Staff'),
  zone: z.string().optional(),
  status: z.string().optional().default('Active'),
  epc: z.string().optional(),
  rssi: z.number().optional().default(-62),
  antennaId: z.number().optional().default(1),
  readerId: z.string().optional().default('GAO-UHF-READER-01')
});
const scanSchema = realtimeTagSchema.extend({
  tagId: z.string().optional()
});

// High-performance in-memory cache for external RFID history & count
const HISTORY_CACHE_TTL_MS = 15000; // 15 seconds fresh cache
const FAST_UPSTREAM_TIMEOUT_MS = 15000; // 15 seconds upstream race timeout
const historyRecordsCache = new Map<string, { timestamp: number; data: any[] }>();
let historyCountCache: { timestamp: number; count: number } | null = null;
let cachedGlobalTz: { tz: string; timestamp: number } | null = null;

// 1. GET /api/GetHistoryTotalCount
const handleGetTotalCount = async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';

  // Fast-path: return cached count if fresh
  if (historyCountCache && (Date.now() - historyCountCache.timestamp < HISTORY_CACHE_TTL_MS)) {
    if (req.query.format === 'object') {
      return res.json({ totalCount: historyCountCache.count, count: historyCountCache.count, organizationId: orgId, cached: true });
    }
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(String(historyCountCache.count));
  }

  try {
    // 1. Check live external cloud server first (with 15-second upstream race)
    try {
      const upstream = await Promise.race([
        fetchHistoryTotalCount(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Upstream total count timeout after 15000ms')), FAST_UPSTREAM_TIMEOUT_MS))
      ]);
      if (upstream && typeof upstream.totalCount === 'number' && upstream.totalCount > 0) {
        historyCountCache = { timestamp: Date.now(), count: upstream.totalCount };
        if (req.query.format === 'object') {
          return res.json({ totalCount: upstream.totalCount, count: upstream.totalCount, organizationId: orgId });
        }
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(String(upstream.totalCount));
      }
    } catch (upstreamErr) {
      // Fall through to local DB
    }

    const total = await countCollectionDocs('tag_history', orgId);
    historyCountCache = { timestamp: Date.now(), count: total };
    
    // According to GAO spec: Response body is plain number e.g. 100 with application/json header
    if (req.query.format === 'object') {
      return res.json({ totalCount: total, count: total, organizationId: orgId });
    }
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(String(total));
  } catch (err: any) {
    console.error('[RFID Route] History count error:', err);
    return res.status(500).json({ error: 'Failed to fetch history count' });
  }
};

rfidRouter.get('/GetHistoryTotalCount', handleGetTotalCount);
rfidRouter.get('/history/count', handleGetTotalCount);

// Helper to resolve timezone and format date string on the server
function resolveServerTimezone(tz?: string): { iana: string; label: string } {
  const str = String(tz || '').trim().toLowerCase();
  if (!str || str.includes('system') || str.includes('local') || str.includes('browser') || str === 'auto') {
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: local, timeZoneName: 'short' }).formatToParts(new Date());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      return { iana: local, label: tzPart?.value || 'LOCAL' };
    } catch {
      return { iana: 'UTC', label: 'UTC' };
    }
  }
  if (str.includes('eastern') || str.includes('edt') || str.includes('est') || str === 'america/new_york') return { iana: 'America/New_York', label: 'EDT' };
  if (str.includes('central') || str.includes('cst') || str.includes('cdt') || str === 'america/chicago') return { iana: 'America/Chicago', label: 'CST' };
  if (str.includes('mountain') || str.includes('mst') || str.includes('mdt') || str === 'america/denver') return { iana: 'America/Denver', label: 'MST' };
  if (str.includes('pacific') || str.includes('pst') || str.includes('pdt') || str === 'america/los_angeles') return { iana: 'America/Los_Angeles', label: 'PST' };
  if (str.includes('ist') || str.includes('india') || str.includes('kolkata') || str === 'asia/kolkata') return { iana: 'Asia/Kolkata', label: 'IST' };
  if (str.includes('cet') || str.includes('cest') || str === 'europe/paris') return { iana: 'Europe/Paris', label: 'CET' };
  if (str.includes('jst') || str.includes('tokyo') || str === 'asia/tokyo') return { iana: 'Asia/Tokyo', label: 'JST' };
  if (str.includes('aest') || str.includes('sydney') || str === 'australia/sydney') return { iana: 'Australia/Sydney', label: 'AEST' };
  if (str.includes('gmt') || str.includes('london') || str.includes('bst')) return { iana: 'Europe/London', label: 'GMT' };
  if (str.includes('utc') || str === 'etc/utc') return { iana: 'UTC', label: 'UTC' };
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return { iana: tz!, label: tzPart?.value || tz! };
  } catch {
    return { iana: 'UTC', label: 'UTC' };
  }
}

function formatHistoryInTz(isoDate: string, iana: string, label: string): string {
  if (!isoDate || isoDate === 'ACTIVE' || isoDate === 'Recent' || isoDate === '—') return isoDate;
  try {
    const raw = String(isoDate).trim();
    let d = new Date(raw);
    if (isNaN(d.getTime())) {
      const fixed = raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z');
      d = new Date(fixed);
    }
    if (isNaN(d.getTime())) return isoDate;
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: iana });
    const timeStr = d.toLocaleTimeString('en-US', {
      timeZone: iana,
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${dateStr} ${timeStr} ${label}`;
  } catch {
    return isoDate;
  }
}

// 2. GET /api/GetHistoryRecords/{SkipCount}/{TakeCount}
const handleGetHistory = async (req: Request, res: Response) => {
  const skipCount = parseInt(req.params.SkipCount || req.params.skip || (req.query.skip as string) || '0', 10);
  const rawTake = parseInt(req.params.TakeCount || req.params.take || (req.query.take as string) || '50', 10);
  const takeCount = Math.min(Math.max(1, rawTake), 200); // Max value is 200 per GAO spec
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';
  const filterDate = (req.query.date as string) || '';

  // Resolve requested or configured system timezone
  const reqTz = (req.query.timezone as string) || (req.headers['x-timezone'] as string) || '';
  let effectiveTz = reqTz;
  if (!effectiveTz) {
    if (cachedGlobalTz && (Date.now() - cachedGlobalTz.timestamp < 60000)) {
      effectiveTz = cachedGlobalTz.tz;
    } else {
      try {
        const globalSettings = await getDocById('settings', 'global', orgId);
        effectiveTz = globalSettings?.systemTimezone || '';
      } catch {}
      cachedGlobalTz = { tz: effectiveTz || 'UTC', timestamp: Date.now() };
    }
  }
  const { iana, label } = resolveServerTimezone(effectiveTz);
  res.setHeader('X-Timezone', iana);
  res.setHeader('X-Timezone-Label', label);

  const cacheKey = `${orgId}_${skipCount}_${takeCount}_${iana}_${filterDate}`;
  const cached = historyRecordsCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp < HISTORY_CACHE_TTL_MS)) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached.data);
  }
  res.setHeader('X-Cache', 'MISS');

  try {
    // Fetch registered people and visitors to enrich real names and roles
    const [peopleList, visitorsList] = await Promise.all([
      getCollectionDocs('registered_people', undefined, orgId).catch(() => []),
      getCollectionDocs('visitors', undefined, orgId).catch(() => [])
    ]);

    const personMap = new Map<string, any>();
    peopleList.forEach((p: any) => {
      if (p.id) personMap.set(String(p.id).toLowerCase(), p);
      if (p.hardhatTagId) personMap.set(String(p.hardhatTagId).toLowerCase(), p);
      if (p.tagId) personMap.set(String(p.tagId).toLowerCase(), p);
      if (p.TagID) personMap.set(String(p.TagID).toLowerCase(), p);
    });
    visitorsList.forEach((v: any) => {
      if (v.id) personMap.set(String(v.id).toLowerCase(), v);
      if (v.badgeId) personMap.set(String(v.badgeId).toLowerCase(), v);
      if (v.tagId) personMap.set(String(v.tagId).toLowerCase(), v);
      if (v.TagID) personMap.set(String(v.TagID).toLowerCase(), v);
    });

    // Helper to calculate duration in minutes
    const calcDurationMins = (enter: string, leave: string, fallback?: number | string): number => {
      if (enter && leave && leave !== 'ACTIVE') {
        const eD = new Date(enter).getTime();
        const lD = new Date(leave).getTime();
        if (!isNaN(eD) && !isNaN(lD) && lD >= eD) {
          return Math.round(((lD - eD) / 60000) * 10) / 10;
        }
      }
      if (fallback !== undefined && fallback !== null) {
        const num = parseFloat(String(fallback));
        if (!isNaN(num)) {
          return num < 5 ? Math.round(num * 60 * 10) / 10 : Math.round(num * 10) / 10;
        }
      }
      return 0.5;
    };

    // 1. Check live external cloud server first (with 15-second upstream race)
    try {
      const liveRecords = await Promise.race([
        fetchHistoryRecords(skipCount, takeCount),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Upstream API timeout after 15000ms')), 15000))
      ]);

      if (Array.isArray(liveRecords) && liveRecords.length > 0) {
        const enrichedLive: any[] = [];
        for (const rec of liveRecords) {
          const tagKey = String(rec.TagID || rec.tagId || '').toLowerCase();
          const matched = personMap.get(tagKey);

          let fullName = '';
          let fName = '';
          let lName = '';
          if (matched?.name && matched.name.trim() && matched.name !== 'Personnel' && matched.name !== 'Unknown' && matched.name !== 'John') {
            fullName = matched.name.trim();
            fName = matched.firstName || fullName.split(' ')[0] || '';
            lName = matched.lastName || fullName.split(' ').slice(1).join(' ') || '';
          } else if (matched?.firstName && matched?.lastName) {
            fName = matched.firstName;
            lName = matched.lastName;
            fullName = `${fName} ${lName}`;
          } else if (rec.FirstName && rec.LastName) {
            fName = rec.FirstName;
            lName = rec.LastName;
            fullName = `${rec.FirstName} ${rec.LastName}`.trim();
          } else if (rec.name && rec.name.trim() && rec.name !== 'Personnel' && rec.name !== 'Unknown') {
            fullName = rec.name.trim();
            fName = fullName.split(' ')[0] || '';
            lName = fullName.split(' ').slice(1).join(' ') || '';
          } else if (rec.FirstName || rec.firstName) {
            fName = rec.FirstName || rec.firstName;
            fullName = fName;
          } else {
            fullName = `Personnel ${rec.TagID || ''}`;
          }
          const role = matched?.role || (matched?.badgeId || matched?.isVisitor ? 'Visitor' : (rec.role || 'Field Personnel'));
          const isVisitor = Boolean(matched?.isVisitor || matched?.badgeId || role.toLowerCase().includes('visitor'));

          const enter = rec.EnterTime || rec.enterTime || new Date().toISOString();
          const leave = rec.LeaveTime || rec.leaveTime || 'ACTIVE';
          const durationMins = calcDurationMins(enter, leave, rec.Duration);
          const enterStr = formatHistoryInTz(enter, iana, label);
          const leaveStr = (leave && leave !== 'ACTIVE') ? formatHistoryInTz(leave, iana, label) : leave;

          const formattedRec = {
            TagID: rec.TagID || rec.tagId || '',
            FirstName: fName,
            LastName: lName,
            name: fullName,
            role,
            isVisitor,
            category: isVisitor ? 'visitors' : 'workers',
            LocationName: rec.LocationName || rec.Location || rec.location || 'Site Area',
            EnterTime: enter,
            LeaveTime: leave,
            EnterTimeStr: enterStr,
            LeaveTimeStr: leaveStr,
            EnterTimeIso: enter,
            LeaveTimeIso: leave,
            timezone: iana,
            timezoneLabel: label,
            Duration: durationMins,
            durationMins
          };
          enrichedLive.push(formattedRec);
        }

        // Bulk persist API logs to MongoDB tag_history in a single high-performance operation
        const docsToPersist = enrichedLive.map(rec => ({
          id: `hist_${rec.TagID}_${String(rec.EnterTime).replace(/[: ]/g, '_')}`,
          organizationId: orgId,
          ...rec,
          timestamp: rec.EnterTime,
          createdAt: new Date()
        }));
        bulkUpsertDocs('tag_history', docsToPersist, orgId).catch(err => {
          console.warn('[RFID Route] Async bulkUpsertDocs error for tag_history:', err.message);
        });

        // Apply date filter if specified
        let filtered = enrichedLive;
        if (filterDate) {
          filtered = enrichedLive.filter(r => 
            (r.EnterTime && r.EnterTime.includes(filterDate)) || 
            (r.EnterTimeStr && r.EnterTimeStr.includes(filterDate)) ||
            (r.LeaveTime && r.LeaveTime.includes(filterDate)) ||
            (r.LeaveTimeStr && r.LeaveTimeStr.includes(filterDate))
          );
        }

        historyRecordsCache.set(cacheKey, { timestamp: Date.now(), data: filtered });
        return res.json(filtered);
      }
    } catch (upstreamErr) {
      // Fall through to stale cache if available, or local DB
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        return res.json(cached.data);
      }
    }

    const dbHistory = await getCollectionDocs('tag_history', { limit: Math.max(takeCount + skipCount, 200), sort: { createdAt: -1 } }, orgId);
    const records = dbHistory;

    // Ensure all records strictly match the GAO specification fields with real names and minute durations
    const formattedRecords = records.map((item: any) => {
      const enter = item.EnterTime || item.EnterTimeStr || item.enterTime || item.timestamp || item.createdTime || new Date().toISOString();
      const leave = item.LeaveTime || item.LeaveTimeStr || item.leaveTime || 'ACTIVE';
      const durationMins = calcDurationMins(enter, leave, item.Duration);
      const enterStr = formatHistoryInTz(enter, iana, label);
      const leaveStr = (leave && leave !== 'ACTIVE') ? formatHistoryInTz(leave, iana, label) : leave;

      const tagKey = String(item.TagID || item.tagId || item.epc || '').toLowerCase();
      const matched = personMap.get(tagKey);

      let fullName = '';
      let firstName = '';
      let lastName = '';
      if (matched?.name && matched.name.trim() && matched.name !== 'Personnel' && matched.name !== 'Unknown' && matched.name !== 'John') {
        fullName = matched.name.trim();
        firstName = matched.firstName || fullName.split(' ')[0] || '';
        lastName = matched.lastName || fullName.split(' ').slice(1).join(' ') || '';
      } else if (matched?.firstName && matched?.lastName) {
        firstName = matched.firstName;
        lastName = matched.lastName;
        fullName = `${firstName} ${lastName}`;
      } else if (item.FirstName && item.LastName) {
        firstName = item.FirstName;
        lastName = item.LastName;
        fullName = `${item.FirstName} ${item.LastName}`.trim();
      } else if (item.name && item.name.trim() && item.name !== 'Personnel' && item.name !== 'Unknown') {
        fullName = item.name.trim();
        firstName = fullName.split(' ')[0] || '';
        lastName = fullName.split(' ').slice(1).join(' ') || '';
      } else if (item.FirstName || item.firstName) {
        firstName = item.FirstName || item.firstName;
        fullName = firstName;
      } else {
        fullName = `Personnel ${item.TagID || item.tagId || ''}`;
      }
      const role = matched?.role || item.role || (matched?.badgeId || matched?.isVisitor ? 'Visitor' : 'Field Personnel');
      const isVisitor = Boolean(matched?.isVisitor || matched?.badgeId || role.toLowerCase().includes('visitor'));

      return {
        TagID: item.TagID || item.tagId || item.epc || '',
        FirstName: firstName,
        LastName: lastName,
        name: fullName,
        role,
        isVisitor,
        category: isVisitor ? 'visitors' : 'workers',
        LocationName: item.LocationName || item.locationName || item.zone || item.Location || 'Site Area',
        EnterTime: enter,
        LeaveTime: leave,
        EnterTimeStr: enterStr,
        LeaveTimeStr: leaveStr,
        EnterTimeIso: enter,
        LeaveTimeIso: leave,
        timezone: iana,
        timezoneLabel: label,
        Duration: durationMins,
        durationMins
      };
    });

    // Order history data by generated time / EnterTime in descending order
    formattedRecords.sort((a, b) => new Date(b.EnterTime).getTime() - new Date(a.EnterTime).getTime());

    // Filter by date if requested
    let result = formattedRecords;
    if (filterDate) {
      result = formattedRecords.filter(r => 
        (r.EnterTime && r.EnterTime.includes(filterDate)) || 
        (r.EnterTimeStr && r.EnterTimeStr.includes(filterDate)) ||
        (r.LeaveTime && r.LeaveTime.includes(filterDate)) ||
        (r.LeaveTimeStr && r.LeaveTimeStr.includes(filterDate))
      );
    }

    // Skip & Take slicing
    const paginated = result.slice(skipCount, skipCount + takeCount);
    historyRecordsCache.set(cacheKey, { timestamp: Date.now(), data: paginated });

    return res.json(paginated);
  } catch (err: any) {
    console.error('[RFID Route] GetHistoryRecords error:', err);
    return res.status(500).json({ error: 'Failed to fetch history records' });
  }
};

rfidRouter.get('/GetHistoryRecords/:SkipCount/:TakeCount', handleGetHistory);
rfidRouter.get('/GetHistoryRecords/:skip/:take', handleGetHistory);
rfidRouter.get('/GetHistoryRecords', handleGetHistory);
rfidRouter.get('/history', handleGetHistory);

// 3. GET /api/GetTagsInRealtime
const handleGetRealtime = async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';

  try {
    // 1. Fetch registered people, people directory, and visitors from MongoDB to map worker names by TagID
    const [registeredList, peopleList, visitorsList] = await Promise.all([
      getCollectionDocs('registered_people', undefined, orgId).catch(() => []),
      getCollectionDocs('people', undefined, orgId).catch(() => []),
      getCollectionDocs('visitors', undefined, orgId).catch(() => [])
    ]);

    const personMap = new Map<string, any>();
    const allWorkforce = [...(registeredList || []), ...(peopleList || [])];
    allWorkforce.forEach((p: any) => {
      if (!p) return;
      const keys = [p.id, p.hardhatTagId, p.tagId, p.TagID].filter(Boolean);
      keys.forEach((k: any) => {
        const s = String(k).trim();
        personMap.set(s.toLowerCase(), p);
        personMap.set(s.toUpperCase(), p);
        personMap.set(s, p);
      });
    });
    visitorsList.forEach((v: any) => {
      if (!v) return;
      const keys = [v.id, v.badgeId, v.tagId, v.TagID].filter(Boolean);
      keys.forEach((k: any) => {
        const s = String(k).trim();
        personMap.set(s.toLowerCase(), v);
        personMap.set(s.toUpperCase(), v);
        personMap.set(s, v);
      });
    });

    let rawTags: any[] = [];

    // 2. Check live external cloud server first (with 3500ms timeout race)
    try {
      const upstreamTags = await Promise.race([
        fetchTagsInRealtime(),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Upstream real-time tags timeout after 3500ms')), 3500))
      ]);
      if (Array.isArray(upstreamTags) && upstreamTags.length > 0) {
        rawTags = upstreamTags;
        // Asynchronously persist real-time tags and active history into MongoDB with 7-day retention
        bulkWriteRealtimeTags(upstreamTags, orgId).catch(() => {});
      }
    } catch {
      // Fall through to local DB
    }

    if (rawTags.length === 0) {
      rawTags = await getCollectionDocs('live_tags', undefined, orgId);
    }

    const formattedTags = rawTags.map((item: any) => {
      const ts = item.Timestamp || item.timestamp || item.lastSeen || new Date().toISOString();
      const rawTagStr = String(item.TagID || item.tagId || item.epc || '').trim();
      const tagKey = rawTagStr.toLowerCase();
      const matched = personMap.get(tagKey) || personMap.get(rawTagStr) || personMap.get(rawTagStr.toUpperCase());
      let fullName = '';
      let fn = '';
      let ln = '';
      if (matched?.name && String(matched.name).trim() && (matched.isCustomProfile || (!matched.name.startsWith('Tag ') && matched.name !== 'Unknown'))) {
        fullName = String(matched.name).trim();
        fn = matched.firstName || fullName.split(' ')[0] || '';
        ln = matched.lastName || fullName.split(' ').slice(1).join(' ') || '';
      } else if (matched?.firstName && matched?.lastName) {
        fn = matched.firstName;
        ln = matched.lastName;
        fullName = `${fn} ${ln}`;
      } else if (item.personName && item.personName.trim()) {
        fullName = item.personName.trim();
        fn = fullName.split(' ')[0] || '';
        ln = fullName.split(' ').slice(1).join(' ') || '';
      } else if (item.name && item.name.trim()) {
        fullName = item.name.trim();
        fn = fullName.split(' ')[0] || '';
        ln = fullName.split(' ').slice(1).join(' ') || '';
      } else if (item.FirstName || item.firstName) {
        fn = String(item.FirstName || item.firstName).trim();
        ln = String(item.LastName || item.lastName || '').trim();
        fullName = ln ? `${fn} ${ln}` : fn;
      } else {
        fullName = `Tag ${item.TagID || item.tagId || ''}`;
      }

      const role = matched?.role || item.role || (matched?.badgeId || matched?.isVisitor ? 'Visitor' : 'Field Personnel');
      const company = matched?.tradeCompany || matched?.company || item.tradeCompany || item.company || '';

      return {
        TagID: item.TagID || item.tagId || item.epc || '',
        Timestamp: formatUtcTimestampMs(ts),
        Location: item.Location || item.location || item.LocationName || item.zone || 'Active Zone',
        LocationName: item.LocationName || item.Location || item.zone || 'Active Zone',
        FirstName: fn,
        LastName: ln,
        personName: fullName,
        name: fullName,
        role,
        tradeCompany: company,
        company,
        personId: matched?.id || item.personId || null,
        zoneId: item.zoneId || null,
        zoneName: item.zoneName || item.Location || item.LocationName || '',
        x: item.x,
        y: item.y,
        rssi: item.rssi || -60,
        readerId: item.readerId || '',
        antennaId: item.antennaId || 1
      };
    });

    // Order tag raw data by generated time in descending order
    formattedTags.sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());

    return res.json(formattedTags);
  } catch (err: any) {
    console.error('[RFID Route] GetTagsInRealtime error:', err);
    return res.status(500).json({ error: 'Failed to fetch realtime tags' });
  }
};

rfidRouter.get('/GetTagsInRealtime', handleGetRealtime);
rfidRouter.get('/realtime', handleGetRealtime);

// Middleware for verifying device API key or token on RFID hardware ingestion endpoints
function requireDeviceApiKey(req: Request, res: Response, next: () => void) {
  const configuredKey = process.env.GAO_DEVICE_API_KEY || process.env.RFID_READER_API_KEY || process.env.APERTURE_RFID_API_KEY;
  if (!configuredKey) {
    return next();
  }

  const providedKey =
    (req.headers['x-gao-api-key'] as string) ||
    (req.headers['x-api-key'] as string) ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    (req.query.apiKey as string) ||
    (req.query.key as string);

  if (providedKey === configuredKey) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: Invalid or missing RFID Device API Key (X-GAO-API-Key header required)'
  });
}

// POST /api/rfid/scan - Post new tag scans into system
rfidRouter.post('/scan', requireDeviceApiKey, async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';
  const parseResult = scanSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid RFID scan payload',
      details: parseResult.error.issues
    });
  }

  const data = parseResult.data;
  const tagId = data.TagID || data.tagId || data.epc || '';
  const location = data.Location || data.LocationName || data.zone || '';
  const firstName = data.FirstName || (data.name ? data.name.split(' ')[0] : '');
  const lastName = data.LastName || (data.name ? data.name.split(' ').slice(1).join(' ') : '');
  
  const now = new Date();

  try {
    const scanPayload = {
      TagID: tagId,
      organizationId: orgId,
      Location: location,
      FirstName: firstName,
      LastName: lastName,
      role: data.role,
      status: data.status,
      rssi: data.rssi,
      readerId: data.readerId
    };

    const aiResult = await processTelemetryWithAI(scanPayload, 'HTTP API Scan', orgId);

    await logAuditEvent({
      organizationId: orgId,
      action: 'RFID_SCAN_EVENT',
      resource: 'rfid',
      details: { TagID: tagId, worker: `${firstName} ${lastName}`, Location: location, organizationId: orgId },
      ip: req.ip
    });

    return res.json({
      message: 'Scan recorded and analyzed by AI Engine successfully',
      organizationId: orgId,
      scanRecord: aiResult.analyzedResults[0]
    });
  } catch (err: any) {
    console.error('[RFID Route] Scan post error:', err);
    return res.status(500).json({ error: 'Failed to record RFID scan' });
  }
});

// POST /api/rfid/realtime-tags/bulk - Process raw incoming WebSocket tag streams and perform bulk write to MongoDB 'real_time_tags'
rfidRouter.post('/realtime-tags/bulk', requireDeviceApiKey, async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';
  try {
    const rawTags = req.body?.tags || req.body?.data || (Array.isArray(req.body) ? req.body : [req.body]);
    if (!Array.isArray(rawTags) || rawTags.length === 0) {
      return res.status(400).json({ error: 'Array of tag records required in body' });
    }

    const aiResult = await processTelemetryWithAI(rawTags, 'HTTP Bulk Stream', orgId);

    return res.json({
      success: true,
      organizationId: orgId,
      message: `Successfully processed AI analysis & bulk write of ${aiResult.processedCount} tags into MongoDB collections.`,
      analyzedResults: aiResult.analyzedResults
    });
  } catch (err: any) {
    console.error('[RFID Route] Bulk write error:', err);
    return res.status(500).json({ error: 'Failed to perform bulk write to real_time_tags' });
  }
});

rfidRouter.post('/bulk-ingest', requireDeviceApiKey, async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';
  try {
    const rawTags = req.body?.tags || req.body?.data || (Array.isArray(req.body) ? req.body : [req.body]);
    const aiResult = await processTelemetryWithAI(rawTags, 'Bulk Ingest Stream', orgId);
    return res.json({ success: true, organizationId: orgId, processedCount: aiResult.processedCount, analyzedResults: aiResult.analyzedResults });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed bulk ingest' });
  }
});

// POST /api/rfid/realtime-tags/cleanup - Cleanup stale real-time data from MongoDB 'real_time_tags'
rfidRouter.post('/realtime-tags/cleanup', requireDeviceApiKey, async (req: Request, res: Response) => {
  try {
    const maxAgeMinutes = Number(req.body?.maxAgeMinutes || req.query?.maxAgeMinutes || 60);
    const result = await cleanupStaleRealTimeTags(maxAgeMinutes);
    return res.json({
      success: true,
      message: `Successfully cleaned up ${result.cleanedCount} stale real-time tag documents older than ${maxAgeMinutes} minutes.`,
      result
    });
  } catch (err: any) {
    console.error('[RFID Route] Cleanup route error:', err);
    return res.status(500).json({ error: 'Failed to execute stale real-time tags cleanup' });
  }
});


