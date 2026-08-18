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

export const hardwareRouter = Router();

// GET /api/hardware/readers
hardwareRouter.get('/readers', async (req: Request, res: Response) => {
  try {
    await bootstrapDefaultHardware();
    const readers = await getCollectionDocs('hardware_readers');
    return res.json({ success: true, count: readers.length, readers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list hardware readers' });
  }
});

// POST /api/hardware/readers
hardwareRouter.post('/readers', async (req: Request, res: Response) => {
  try {
    const reader: Partial<HardwareReader> = req.body || {};
    if (!reader.name || !reader.readerId) {
      return res.status(400).json({ success: false, error: 'name and readerId are required' });
    }

    const nowIso = new Date().toISOString();
    const savedReader: HardwareReader = {
      id: reader.id || `reader_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
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

    await upsertDoc('hardware_readers', savedReader);
    return res.json({ success: true, message: 'Hardware reader saved in MongoDB', reader: savedReader });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/hardware/readers/:id
hardwareRouter.delete('/readers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteDocById('hardware_readers', id);
    return res.json({ success: deleted, message: deleted ? 'Reader deleted' : 'Reader not found' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hardware/mappings
hardwareRouter.get('/mappings', async (req: Request, res: Response) => {
  try {
    await bootstrapDefaultHardware();
    const mappings = await getCollectionDocs('hardware_tag_mappings');
    return res.json({ success: true, count: mappings.length, mappings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/mappings
hardwareRouter.post('/mappings', async (req: Request, res: Response) => {
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
      ppeRequired: mapping.ppeRequired || ['Hard Hat', 'Safety Boots'],
      status: mapping.status || 'ACTIVE',
      createdAt: mapping.createdAt || nowIso
    };

    await upsertDoc('hardware_tag_mappings', savedMapping);
    return res.json({ success: true, message: 'Tag mapping saved in MongoDB', mapping: savedMapping });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/hardware/mappings/:id
hardwareRouter.delete('/mappings/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteDocById('hardware_tag_mappings', id);
    return res.json({ success: deleted, message: deleted ? 'Mapping removed' : 'Mapping not found' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/scan (Direct Scan Ingestion: Hardware → AI Engine → MongoDB → Dashboard)
hardwareRouter.post('/scan', async (req: Request, res: Response) => {
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
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/test-scan (Interactive scanner tool for Settings tab)
hardwareRouter.post('/test-scan', async (req: Request, res: Response) => {
  try {
    const { readerId, antennaId, tagId, rssi } = req.body || {};
    const effectiveTag = tagId || 'E28011606000020788842D31';
    const effectiveReader = readerId || 'GAO-UHF-818-A';

    const result = await processDirectHardwareScan({
      readerId: effectiveReader,
      antennaId: Number(antennaId) || 1,
      tagId: effectiveTag,
      rssi: rssi !== undefined ? Number(rssi) : -55,
      timestamp: new Date().toISOString(),
      protocol: 'Direct Hardware Test Ping'
    });

    return res.json({
      success: true,
      message: 'Direct hardware scan processed through AI Engine and saved to MongoDB',
      ...result
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hardware/status (Health telemetry summary)
hardwareRouter.get('/status', async (req: Request, res: Response) => {
  try {
    await bootstrapDefaultHardware();
    const readers: HardwareReader[] = await getCollectionDocs('hardware_readers');
    const mappings: TagEntityMapping[] = await getCollectionDocs('hardware_tag_mappings');

    const totalScans = readers.reduce((acc, r) => acc + (r.totalScans || 0), 0);
    const onlineReaders = readers.filter(r => r.status === 'ONLINE' || r.status === 'SCANNING').length;

    return res.json({
      success: true,
      onlineReaders,
      totalReaders: readers.length,
      totalTagMappings: mappings.length,
      totalScansProcessed: totalScans,
      readers
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
