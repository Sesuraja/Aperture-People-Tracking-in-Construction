import { Router, Request, Response } from 'express';
import {
  getCollectionDocs,
  upsertDoc,
  deleteDocById
} from '../services/db.js';
import {
  processDirectHardwareScan,
  bootstrapDefaultHardware,
  HardwareReader,
  TagEntityMapping
} from '../services/hardwareIntegrationService.js';
import {
  validateGaoNativeEvent,
  mapGaoNativeToDirect,
  parseGaoNativeBody,
} from '../services/gaoEventMapper.js';

import { optionalAuth, verifyToken } from '../middleware/auth.js';

export const hardwareRouter = Router();

function getReqOrgId(req: Request): string {
  if ((req as any).user?.organizationId) {
    return (req as any).user.organizationId;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded?.organizationId) return decoded.organizationId;
  }
  return req.body?.organizationId || (req.query.organizationId as string) || 'default';
}

// ===========================================================================
// 1. HARDWARE INGESTION WEBHOOKS (Direct pushes from physical RFID Readers)
// ===========================================================================

// POST /api/hardware/gao-native (GAO 216031A Native JSON Push)
hardwareRouter.post('/gao-native', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const events = parseGaoNativeBody(req.body);
    if (events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Request body must be a GaoNativeEvent object or array of GaoNativeEvent objects'
      });
    }

    const readerIdOverride = (req.query.readerId as string) || undefined;
    const results: any[] = [];

    for (const rawEvent of events) {
      // DEBUG: Log raw event to diagnose EPC field name from the reader
      console.log('[GAO-Native] Received event fields:', JSON.stringify(rawEvent));
      const validation = validateGaoNativeEvent(rawEvent);
      if (!validation.valid) {
        console.warn('[GAO-Native] Validation failed:', validation.errors, '| epc value:', (rawEvent as any).epc);
        results.push({ success: false, epc: (rawEvent as any).epc, errors: validation.errors });
        continue;
      }

      // Use ?readerId query param, or fall back to serialno/customcode from the GAO event
      const apertureReaderId = readerIdOverride || rawEvent.serialno || rawEvent.customcode || '100EHH8325020026';
      const scanPayload = mapGaoNativeToDirect(rawEvent, apertureReaderId, 'gao216031a');

      try {
        const result = await processDirectHardwareScan(scanPayload, orgId);
        results.push({
          success: true,
          epc: rawEvent.epc,
          readerId: apertureReaderId,
          antenna: rawEvent.ant,
          ...result
        });
      } catch (innerErr: any) {
        results.push({ success: false, epc: rawEvent.epc, error: innerErr.message });
      }
    }

    const allOk = results.every(r => r.success);
    return res.status(allOk ? 200 : 207).json({
      success: allOk,
      processedCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results,
      organizationId: orgId
    });
  } catch (err: any) {
    console.error('[Hardware Router] GAO native ingestion error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/scan (Generic Hardware Scan Push)
hardwareRouter.post('/scan', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const { readerId, antennaId, tagId, rssi, timestamp, protocol } = req.body || {};
    if (!tagId) {
      return res.status(400).json({ success: false, error: 'tagId is required' });
    }

    const result = await processDirectHardwareScan({
      readerId: readerId || 'GAO-UHF-DEFAULT',
      antennaId: Number(antennaId) || 1,
      tagId: String(tagId),
      rssi: rssi !== undefined ? Number(rssi) : -60,
      timestamp: timestamp || new Date().toISOString(),
      protocol: protocol || 'Direct RFID Push'
    }, orgId);

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// 2. MANAGEMENT & ADMIN ROUTES (Supports optional auth / tenant session)
// ===========================================================================
hardwareRouter.use(optionalAuth);

// GET /api/hardware/readers
hardwareRouter.get('/readers', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const readers = await getCollectionDocs('hardware_readers', undefined, orgId);
    return res.json({ success: true, count: readers.length, readers, organizationId: orgId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list hardware readers' });
  }
});

// POST /api/hardware/readers
hardwareRouter.post('/readers', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const reader: Partial<HardwareReader> = req.body || {};
    if (!reader.name || !reader.readerId) {
      return res.status(400).json({ success: false, error: 'name and readerId are required' });
    }

    const nowIso = new Date().toISOString();
    const savedReader: HardwareReader = {
      id: reader.id || reader.readerId || `reader_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      readerId: reader.readerId,
      name: reader.name,
      model: reader.model || 'GAO UHF 4-Port Fixed Reader',
      ipAddress: reader.ipAddress || '192.168.1.100',
      port: Number(reader.port) || 8080,
      protocol: reader.protocol || 'HTTP Push',
      powerDbm: Number(reader.powerDbm) || 30,
      sensitivityDbm: Number(reader.sensitivityDbm) || -70,
      status: reader.status || 'ONLINE',
      antennas: reader.antennas || [
        { port: 1, name: 'Antenna 1', zoneId: 'zone_1', zoneName: 'Zone 1 - Main Entrance', direction: 'IN', powerDbm: 30 }
      ],
      totalScans: reader.totalScans || 0,
      lastPingAt: nowIso,
      notes: reader.notes || '',
      createdAt: reader.createdAt || nowIso,
      updatedAt: nowIso
    };

    await upsertDoc('hardware_readers', savedReader, orgId);
    await upsertDoc('devices', {
      id: savedReader.id,
      name: savedReader.name,
      category: 'rfid',
      type: savedReader.model,
      location: savedReader.antennas?.[0]?.zoneName || 'Facility Portal',
      zoneId: savedReader.antennas?.[0]?.zoneId || 'portal-1',
      status: savedReader.status.toLowerCase(),
      ip: savedReader.ipAddress,
      mac: savedReader.readerId,
      firmware: 'v4.19.2',
      latestFirmware: 'v4.19.2',
      signalRssi: -50,
      coverageRadiusMeters: 35,
      temperatureC: 38,
      cpuUsagePct: 20,
      memoryUsagePct: 35,
      pingMs: 8,
      uptime: 'Active',
      lastPing: 'Just now',
      calibrationStatus: 'Calibrated',
      otaStatus: 'Up to Date',
      powerSource: 'PoE',
      organizationId: orgId,
      updatedAt: nowIso
    }, orgId).catch(() => {});

    return res.json({ success: true, message: 'Hardware reader saved in MongoDB', reader: savedReader });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/hardware/readers/:id
hardwareRouter.delete('/readers/:id', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const rawId = req.params.id;
    const id = decodeURIComponent(rawId);
    const deletedHw = await deleteDocById('hardware_readers', id, orgId);
    const deletedDev = await deleteDocById('devices', id, orgId);
    await deleteDocById('hardware_tag_mappings', id, orgId).catch(() => {});
    await deleteDocById('live_tags', id, orgId).catch(() => {});
    const deleted = deletedHw || deletedDev;
    return res.json({ success: deleted, message: deleted ? 'Reader deleted successfully' : 'Reader not found' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hardware/mappings
hardwareRouter.get('/mappings', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const mappings = await getCollectionDocs('hardware_tag_mappings', undefined, orgId);
    return res.json({ success: true, count: mappings.length, mappings, organizationId: orgId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/mappings
hardwareRouter.post('/mappings', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const mapping: Partial<TagEntityMapping> = req.body || {};
    if (!mapping.tagId || !mapping.entityName) {
      return res.status(400).json({ success: false, error: 'tagId and entityName are required' });
    }

    const nowIso = new Date().toISOString();
    const savedMapping: TagEntityMapping = {
      id: mapping.id || `map_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      tagId: mapping.tagId.trim(),
      entityType: mapping.entityType || 'PERSONNEL',
      entityId: mapping.entityId || `ID-${Date.now().toString().slice(-4)}`,
      entityName: mapping.entityName.trim(),
      roleOrTrade: mapping.roleOrTrade || 'General Staff',
      department: mapping.department || 'Operations',
      assignedZone: mapping.assignedZone || 'All Zones',
      status: mapping.status || 'ACTIVE',
      createdAt: mapping.createdAt || nowIso
    };

    await upsertDoc('hardware_tag_mappings', savedMapping, orgId);
    return res.json({ success: true, message: 'Tag mapping saved in MongoDB', mapping: savedMapping });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/hardware/mappings/:id
hardwareRouter.delete('/mappings/:id', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const rawId = req.params.id;
    const id = decodeURIComponent(rawId);
    const deleted = await deleteDocById('hardware_tag_mappings', id, orgId);
    return res.json({ success: deleted, message: deleted ? 'Mapping removed' : 'Mapping not found' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/scan (Direct Scan Ingestion: Hardware → AI Engine → MongoDB → Dashboard)
hardwareRouter.post('/scan', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const { readerId, antennaId, tagId, rssi, timestamp, protocol } = req.body || {};
    if (!tagId) {
      return res.status(400).json({ success: false, error: 'tagId is required' });
    }

    const result = await processDirectHardwareScan({
      readerId: readerId || 'GAO-UHF-DEFAULT',
      antennaId: Number(antennaId) || 1,
      tagId: String(tagId),
      rssi: rssi !== undefined ? Number(rssi) : -60,
      timestamp: timestamp || new Date().toISOString(),
      protocol: protocol || 'Direct RFID Push'
    }, orgId);

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hardware/status (Health telemetry summary)
hardwareRouter.get('/status', async (req: Request, res: Response) => {
  const orgId = getReqOrgId(req);
  try {
    const readers: HardwareReader[] = await getCollectionDocs('hardware_readers', undefined, orgId);
    const mappings: TagEntityMapping[] = await getCollectionDocs('hardware_tag_mappings', undefined, orgId);

    const totalScans = readers.reduce((acc, r) => acc + (r.totalScans || 0), 0);
    const onlineReaders = readers.filter(r => r.status === 'ONLINE' || r.status === 'SCANNING').length;

    return res.json({
      success: true,
      onlineReaders,
      totalReaders: readers.length,
      totalTagMappings: mappings.length,
      totalScansProcessed: totalScans,
      readers,
      organizationId: orgId
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
