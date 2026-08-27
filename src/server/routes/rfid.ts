import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getCollectionDocs, upsertDoc, logAuditEvent, bulkWriteRealtimeTags, cleanupStaleRealTimeTags } from '../services/db.js';
import { broadcastSseEvent } from '../services/sse.js';
import { broadcastWebSocketEvent } from '../services/websocket.js';
import { processTelemetryWithAI } from '../services/aiPipeline.js';

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

  try {
    const dbHistory = await getCollectionDocs('tag_history', undefined, orgId);
    const records = dbHistory;

    // Ensure all records strictly match the GAO specification fields
    const formattedRecords = records.map((item: any) => {
      const enter = item.EnterTime || item.EnterTimeStr || item.enterTime || item.timestamp || item.createdTime || new Date().toISOString();
      const leave = item.LeaveTime || item.LeaveTimeStr || item.leaveTime || new Date().toISOString();
      
      const enterDate = new Date(enter);
      const leaveDate = new Date(leave);
      const diffMs = Math.max(0, leaveDate.getTime() - enterDate.getTime());
      const durationHours = item.Duration !== undefined ? Number(item.Duration) : Math.round((diffMs / 3600000) * 10) / 10;

      const firstName = item.FirstName || item.firstName || (item.name ? item.name.split(' ')[0] : '');
      const lastName = item.LastName || item.lastName || (item.name ? item.name.split(' ').slice(1).join(' ') : '');

      const enterStr = formatUtcDateTime(enterDate);
      const leaveStr = formatUtcDateTime(leaveDate);

      return {
        TagID: item.TagID || item.tagId || item.epc || '',
        FirstName: firstName,
        LastName: lastName,
        LocationName: item.LocationName || item.locationName || item.zone || item.Location || '',
        EnterTime: enterStr,
        LeaveTime: leaveStr,
        EnterTimeStr: enterStr,
        LeaveTimeStr: leaveStr,
        Duration: durationHours
      };
    });

    // Order history data by generated time / EnterTime in descending order
    formattedRecords.sort((a, b) => new Date(b.EnterTime).getTime() - new Date(a.EnterTime).getTime());

    // Skip & Take slicing
    const paginated = formattedRecords.slice(skipCount, skipCount + takeCount);

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
    const liveTags = await getCollectionDocs('live_tags', undefined, orgId);
    const tagsToProcess = liveTags;

    const formattedTags = tagsToProcess.map((item: any) => {
      const ts = item.Timestamp || item.timestamp || item.lastSeen || new Date().toISOString();
      return {
        TagID: item.TagID || item.tagId || item.epc || '',
        Timestamp: formatUtcTimestampMs(ts),
        Location: item.Location || item.location || item.LocationName || item.zone || '',
        LocationName: item.LocationName || item.Location || item.zone || '',
        personName: item.personName || item.name || '',
        personId: item.personId || null,
        zoneId: item.zoneId || null,
        zoneName: item.zoneName || item.Location || '',
        x: item.x,
        y: item.y,
        rssi: item.rssi,
        readerId: item.readerId,
        antennaId: item.antennaId
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


