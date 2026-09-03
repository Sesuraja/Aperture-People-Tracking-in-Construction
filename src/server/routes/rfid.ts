import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getCollectionDocs, upsertDoc, logAuditEvent, bulkWriteRealtimeTags, cleanupStaleRealTimeTags } from '../services/db.js';
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
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
  }
  const YYYY = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

// Helper to format date into "yyyy-MM-dd HH:mm:ss.fff" UTC string
export function formatUtcTimestampMs(dateInput?: string | Date | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const base = formatUtcDateTime(d);
  const fff = String(isNaN(d.getTime()) ? 0 : d.getUTCMilliseconds()).padStart(3, '0');
  return `${base}.${fff}`;
}

const scanSchema = z.object({
  tagId: z.string().optional(),
  TagID: z.string().optional(),
  name: z.string().optional(),
  FirstName: z.string().optional(),
  LastName: z.string().optional(),
  role: z.string().optional().default('General Staff'),
  zone: z.string().optional(),
  LocationName: z.string().optional(),
  Location: z.string().optional(),
  status: z.string().optional().default('Active'),
  epc: z.string().optional(),
  rssi: z.number().optional().default(-62),
  antennaId: z.number().optional().default(1),
  readerId: z.string().optional().default('GAO-UHF-READER-01')
});

// 1. GET /api/GetHistoryTotalCount
const handleGetTotalCount = async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';
  try {
    // 1. Check live external cloud server first
    try {
      const upstream = await fetchHistoryTotalCount();
      if (upstream && typeof upstream.totalCount === 'number' && upstream.totalCount > 0) {
        if (req.query.format === 'object') {
          return res.json({ totalCount: upstream.totalCount, count: upstream.totalCount, organizationId: orgId });
        }
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(String(upstream.totalCount));
      }
    } catch (upstreamErr) {
      // Fall through to local DB
    }

    const history = await getCollectionDocs('tag_history', undefined, orgId);
    const total = history.length;
    
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

// 2. GET /api/GetHistoryRecords/{SkipCount}/{TakeCount}
const handleGetHistory = async (req: Request, res: Response) => {
  const skipCount = parseInt(req.params.SkipCount || req.params.skip || (req.query.skip as string) || '0', 10);
  const rawTake = parseInt(req.params.TakeCount || req.params.take || (req.query.take as string) || '50', 10);
  const takeCount = Math.min(Math.max(1, rawTake), 200); // Max value is 200 per GAO spec
  const orgId = (req as any).user?.organizationId || req.body?.organizationId || (req.query.organizationId as string) || 'default';
  const filterDate = (req.query.date as string) || '';

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

    // 1. Check live external cloud server first
    try {
      const liveRecords = await fetchHistoryRecords(skipCount, takeCount);
      if (Array.isArray(liveRecords) && liveRecords.length > 0) {
        const enrichedLive: any[] = [];
        for (const rec of liveRecords) {
          const tagKey = String(rec.TagID || rec.tagId || '').toLowerCase();
          const matched = personMap.get(tagKey);

          const fullName = matched?.name || (rec.FirstName ? `${rec.FirstName} ${rec.LastName || ''}`.trim() : (rec.name || `Personnel ${rec.TagID}`));
          const parts = fullName.split(' ');
          const fName = matched?.firstName || rec.FirstName || parts[0] || '';
          const lName = matched?.lastName || rec.LastName || parts.slice(1).join(' ') || '';
          const role = matched?.role || (matched?.badgeId || matched?.isVisitor ? 'Visitor' : (rec.role || 'Field Personnel'));
          const isVisitor = Boolean(matched?.isVisitor || matched?.badgeId || role.toLowerCase().includes('visitor'));

          const enter = rec.EnterTime || rec.enterTime || new Date().toISOString();
          const leave = rec.LeaveTime || rec.leaveTime || 'ACTIVE';
          const durationMins = calcDurationMins(enter, leave, rec.Duration);

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
            EnterTimeStr: enter,
            LeaveTimeStr: leave,
            Duration: durationMins,
            durationMins
          };
          enrichedLive.push(formattedRec);

          // Persist API log to MongoDB tag_history so real-time API logs are stored and queryable by date
          const docId = `hist_${rec.TagID}_${String(enter).replace(/[: ]/g, '_')}`;
          upsertDoc('tag_history', {
            id: docId,
            organizationId: orgId,
            ...formattedRec,
            timestamp: enter,
            createdAt: new Date()
          }, orgId).catch(() => {});
        }

        // Apply date filter if specified
        let filtered = enrichedLive;
        if (filterDate) {
          filtered = enrichedLive.filter(r => (r.EnterTime && r.EnterTime.includes(filterDate)) || (r.LeaveTime && r.LeaveTime.includes(filterDate)));
        }

        return res.json(filtered);
      }
    } catch (upstreamErr) {
      // Fall through to local DB
    }

    const dbHistory = await getCollectionDocs('tag_history', undefined, orgId);
    const records = dbHistory;

    // Ensure all records strictly match the GAO specification fields with real names and minute durations
    const formattedRecords = records.map((item: any) => {
      const enter = item.EnterTime || item.EnterTimeStr || item.enterTime || item.timestamp || item.createdTime || new Date().toISOString();
      const leave = item.LeaveTime || item.LeaveTimeStr || item.leaveTime || 'ACTIVE';
      const durationMins = calcDurationMins(enter, leave, item.Duration);

      const tagKey = String(item.TagID || item.tagId || item.epc || '').toLowerCase();
      const matched = personMap.get(tagKey);

      const fullName = matched?.name || item.name || item.personName || (item.FirstName ? `${item.FirstName} ${item.LastName || ''}`.trim() : `Personnel ${item.TagID || item.id}`);
      const parts = fullName.split(' ');
      const firstName = matched?.firstName || item.FirstName || item.firstName || parts[0] || '';
      const lastName = matched?.lastName || item.LastName || item.lastName || parts.slice(1).join(' ') || '';
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
        EnterTimeStr: enter,
        LeaveTimeStr: leave,
        Duration: durationMins,
        durationMins
      };
    });

    // Order history data by generated time / EnterTime in descending order
    formattedRecords.sort((a, b) => new Date(b.EnterTime).getTime() - new Date(a.EnterTime).getTime());

    // Filter by date if requested
    let result = formattedRecords;
    if (filterDate) {
      result = formattedRecords.filter(r => (r.EnterTime && r.EnterTime.includes(filterDate)) || (r.LeaveTime && r.LeaveTime.includes(filterDate)));
    }

    // Skip & Take slicing
    const paginated = result.slice(skipCount, skipCount + takeCount);

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
    // 1. Fetch registered people and visitors from MongoDB to map worker names by TagID
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

    let rawTags: any[] = [];

    // 2. Check live external cloud server first
    try {
      const upstreamTags = await fetchTagsInRealtime();
      if (Array.isArray(upstreamTags) && upstreamTags.length > 0) {
        rawTags = upstreamTags;
      }
    } catch (upstreamErr) {
      // Fall through to local DB
    }

    if (rawTags.length === 0) {
      rawTags = await getCollectionDocs('live_tags', undefined, orgId);
    }

    const formattedTags = rawTags.map((item: any) => {
      const ts = item.Timestamp || item.timestamp || item.lastSeen || new Date().toISOString();
      const tagKey = String(item.TagID || item.tagId || item.epc || '').toLowerCase();
      const matched = personMap.get(tagKey);
      const fullName = matched?.name || item.personName || item.name || '';
      const role = matched?.role || item.role || (matched?.badgeId || matched?.isVisitor ? 'Visitor' : 'Field Personnel');
      const company = matched?.tradeCompany || matched?.company || item.tradeCompany || '';

      return {
        TagID: item.TagID || item.tagId || item.epc || '',
        Timestamp: formatUtcTimestampMs(ts),
        Location: item.Location || item.location || item.LocationName || item.zone || 'Active Zone',
        LocationName: item.LocationName || item.Location || item.zone || 'Active Zone',
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
        readerId: item.readerId || 'READER-01',
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


