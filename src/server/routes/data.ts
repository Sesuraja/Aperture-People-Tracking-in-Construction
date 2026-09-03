import { Router, Response } from 'express';
import {
  getCollectionDocs,
  getDocById,
  upsertDoc,
  deleteDocById,
  isMongoConnected,
  logAuditEvent,
  getPlaybackFrames
} from '../services/db.js';
import { optionalAuth, AuthRequest } from '../middleware/auth.js';

export const dataRouter = Router();

// Allow authenticated session or default tenant session for /api/data/* endpoints
dataRouter.use(optionalAuth);

// GET /api/data/playback_frames?date=YYYY-MM-DD
// Returns all chronological tag position snapshots for the given date (used by PlaybackTab)
dataRouter.get('/playback_frames', async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId || 'default';
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  try {
    const frames = await getPlaybackFrames(date, orgId);
    return res.json({ date, organizationId: orgId, frames, count: frames.length });
  } catch (err: any) {
    console.error('[Data Route] getPlaybackFrames error:', err);
    return res.status(500).json({ error: 'Failed to fetch playback frames' });
  }
});


// GET /api/data/stats
dataRouter.get('/stats', async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId || 'default';
  try {
    const people = await getCollectionDocs('registered_people', undefined, orgId);
    const devices = await getCollectionDocs('devices', undefined, orgId);
    const visitors = await getCollectionDocs('visitors', undefined, orgId);
    const tags = await getCollectionDocs('live_tags', undefined, orgId);
    const alerts = await getCollectionDocs('alerts', undefined, orgId);

    return res.json({
      registeredPeopleCount: people.length,
      devicesCount: devices.length,
      visitorsCount: visitors.length,
      liveTagsCount: tags.length,
      alertsCount: alerts.length,
      organizationId: orgId,
      dbStatus: isMongoConnected() ? 'connected' : 'in_memory_fallback'
    });
  } catch (err: any) {
    console.error('[Data Route] Get stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/data/:collection
dataRouter.get('/:collection', async (req: AuthRequest, res: Response) => {
  const { collection } = req.params;
  const orgId = req.user?.organizationId || 'default';
  const allowed = [
    'organizations', 'registered_people', 'devices', 'visitors', 'alerts',
    'live_tags', 'real_time_tags', 'rfid_realtime_events', 'tag_history', 'settings', 'projects', 'floorplans',
    'visitor_security_list', 'visitor_access_tokens', 'visitor_access_logs',
    'attendance_logs', 'leave_requests', 'shift_schedules',
    'alerts_enterprise', 'alert_rules', 'alert_dispatch_logs', 'emergency_broadcasts',
    'incidents_enterprise', 'audit_logs', 'users', 'permissions', 'role_permissions',
    'analytics_reports', 'analytics_metrics', 'analytics_equipment',
    'ai_recommendations', 'incidents', 'ai_rca_reports', 'ai_hazard_predictions',
    'ai_insights', 'ai_copilot_chats',
    'assets', 'vehicles', 'cameras', 'sensors', 'infrastructure', 'maintenance_nodes', 'work_orders',
    'technicians', 'schedules', 'compliance_frameworks', 'retention_policies', 'compliance_reports',
    'people', 'personnel', 'zones', 'geofences', 'map_configurations', 'reader_zone_mappings',
    'quick_notes', 'hardware_readers', 'hardware_tag_mappings', 'third_party_apis',
    'site_configurations', 'shift_assignments', 'training_records', 'ppe_records',
    'notifications', 'system_events', 'daily_reports'
  ];

  const isAllowed = allowed.includes(collection) || collection.startsWith('gao_') || /^[a-zA-Z0-9_-]+$/.test(collection);
  if (!isAllowed) {
    return res.status(400).json({ error: `Invalid or restricted collection: ${collection}` });
  }

  try {
    const docs = await getCollectionDocs(collection, undefined, orgId);
    return res.json(docs);
  } catch (err: any) {
    console.error(`[Data Route] Error fetching collection ${collection}:`, err);
    return res.status(500).json({ error: `Failed to fetch collection ${collection}` });
  }
});

// GET /api/data/floorplan_image/:id - streams floorplan image directly from MongoDB (Binary BSON or base64)
const serveFloorplanImageHandler = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.organizationId || 'default';

  try {
    const config = (await getDocById('map_configurations', id, orgId)) || 
                   (await getDocById('floorplans', id, orgId)) || 
                   (await getDocById('floorplans', `fp_${id}`, orgId));
    if (!config) {
      return res.status(404).send('Floorplan not found');
    }

    // Check if stored as raw Binary / Buffer in MongoDB
    const binary = config.imageBinary || config.floorplanBinary || config.binaryData;
    if (binary) {
      let buffer: Buffer | null = null;
      if (Buffer.isBuffer(binary)) {
        buffer = binary;
      } else if (binary && typeof binary.buffer === 'object' && binary.buffer) {
        buffer = Buffer.from(binary.buffer);
      } else if (binary && typeof binary.value === 'function') {
        buffer = Buffer.from(binary.value());
      }

      if (buffer && buffer.length > 0) {
        res.setHeader('Content-Type', config.contentType || 'image/webp');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    const raw = config.floorplanData || config.imageData || config.floorplanUrl || config.url;
    if (!raw) {
      return res.status(404).send('No image data in floorplan');
    }

    if (typeof raw === 'string' && raw.startsWith('data:image/')) {
      const match = raw.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1] === 'svg+xml' ? 'image/svg+xml' : `image/${match[1]}`;
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    if (typeof raw === 'string' && raw.startsWith('<svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(raw);
    }

    if (typeof raw === 'string' && (raw.startsWith('/') || raw.startsWith('http'))) {
      return res.redirect(raw);
    }

    return res.status(400).send('Invalid image format');
  } catch (err: any) {
    console.error('[Data Route] Error serving floorplan image from MongoDB:', err);
    return res.status(500).send('Error serving image');
  }
};

dataRouter.get('/floorplan_image/:id', serveFloorplanImageHandler);
dataRouter.get('/map_configurations/:id/image', serveFloorplanImageHandler);
dataRouter.get('/floorplans/:id/image', serveFloorplanImageHandler);

// GET /api/data/:collection/:id
dataRouter.get('/:collection/:id', async (req: AuthRequest, res: Response) => {
  const { collection, id } = req.params;
  const orgId = req.user?.organizationId || 'default';
  try {
    const doc = await getDocById(collection, id, orgId);
    if (!doc) {
      if (collection === 'map_configurations') {
        return res.json({ id, siteId: id });
      }
      return res.status(404).json({ error: 'Document not found' });
    }
    return res.json(doc);
  } catch (err: any) {
    console.error(`[Data Route] Error fetching doc ${id} in ${collection}:`, err);
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/data/zones/batch - handles saving custom zones & floorplan configuration cleanly
dataRouter.post('/zones/batch', async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId || 'default';
  const { zones, floorplanUrl, svgSource, activeProject } = req.body || {};

  try {
    const savedZones = [];
    if (Array.isArray(zones)) {
      for (const z of zones) {
        if (z && (z.id || z.zoneId || z.name)) {
          const zoneId = z.id || z.zoneId || `zone_${(z.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
          const cleanZone = { ...z, id: zoneId, zoneId };
          const saved = await upsertDoc('zones', cleanZone, orgId);
          savedZones.push(saved);
        }
      }
    }

    // If floorplanUrl or svgSource provided, update map_configurations without polluting zones collection
    if (floorplanUrl || svgSource) {
      const projId = activeProject || 'metro-tower';
      const existingConfig = (await getDocById('map_configurations', projId, orgId)) || {};
      const updatedConfig = {
        ...existingConfig,
        id: projId,
        siteId: projId,
        ...(floorplanUrl ? { floorplanUrl } : {}),
        ...(svgSource ? { svgSource } : {}),
        updatedAt: new Date().toISOString()
      };
      await upsertDoc('map_configurations', updatedConfig, orgId);
    }

    return res.json({ success: true, count: savedZones.length, zones: savedZones });
  } catch (err: any) {
    console.error('[Data Route] Error saving zones batch:', err);
    return res.status(500).json({ error: 'Failed to save zones batch' });
  }
});

// POST /api/data/:collection (upsert)
dataRouter.post('/:collection', async (req: AuthRequest, res: Response) => {
  const { collection } = req.params;
  const user = req.user;
  const orgId = user?.organizationId || 'default';

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  try {
    const saved = await upsertDoc(collection, body, orgId);

    // Sync dual workforce collections: registered_people <-> people in MongoDB
    if (collection === 'registered_people') {
      await upsertDoc('people', { ...body, id: body.id || saved.id }, orgId).catch(() => {});
    } else if (collection === 'people') {
      await upsertDoc('registered_people', { ...body, id: body.id || saved.id }, orgId).catch(() => {});
    } else if (collection === 'devices') {
      if (body.category === 'rfid' || String(body.type || '').toLowerCase().includes('reader')) {
        await upsertDoc('hardware_readers', {
          id: body.id || saved.id,
          readerId: body.id || saved.id,
          name: body.name,
          location: body.location,
          zone: body.location,
          status: (body.status || 'ONLINE').toUpperCase(),
          type: body.type || 'UHF Fixed Portal',
          ipAddress: body.ip || body.ipAddress,
          macAddress: body.mac || body.macAddress
        }, orgId).catch(() => {});
      }
    } else if (collection === 'hardware_readers') {
      await upsertDoc('devices', {
        id: body.id || saved.id,
        name: body.name || `GAO Reader ${body.id || saved.id}`,
        category: 'rfid',
        type: body.type || 'UHF RFID Reader Gateway',
        location: body.location || body.zone || 'Site Portal',
        status: (body.status || 'online').toLowerCase(),
        ip: body.ipAddress || body.ip || '192.168.1.101',
        mac: body.macAddress || body.mac || '00:1A:79:39:63:43'
      }, orgId).catch(() => {});
    }

    await logAuditEvent({
      userId: user?.id || 'client',
      userEmail: user?.email || 'client',
      organizationId: orgId,
      action: `UPSERT_${collection.toUpperCase()}_DOC`,
      resource: collection,
      details: { docId: saved.id },
      ip: req.ip
    });

    return res.json(saved);
  } catch (err: any) {
    console.error(`[Data Route] Error upserting in ${collection}:`, err);
    return res.status(500).json({ error: `Failed to save document in ${collection}` });
  }
});

// POST /api/data/:collection/:id
dataRouter.post('/:collection/:id', async (req: AuthRequest, res: Response) => {
  const { collection, id } = req.params;
  const user = req.user;
  const orgId = user?.organizationId || 'default';

  // IDOR check: if updating existing doc, ensure it belongs to the tenant
  const isSpatialConfig = ['map_configurations', 'zones', 'projects', 'sites', 'floorplans'].includes(collection);
  if (!isSpatialConfig) {
    const existingDoc = await getDocById(collection, id, orgId);
    const allExisting = await getDocById(collection, id, 'ALL');
    const DEFAULT_ORGS = ['default', 'demo', 'org_main', 'org_aperture_default'];
    const isBothDefault = DEFAULT_ORGS.includes(allExisting?.organizationId) && DEFAULT_ORGS.includes(orgId);
    if (allExisting && !existingDoc && !isBothDefault && allExisting.organizationId && allExisting.organizationId !== orgId) {
      return res.status(404).json({ error: 'Document not found or belongs to another organization' });
    }
  }

  const body = req.body || {};
  body.id = id;

  try {
    const saved = await upsertDoc(collection, body, orgId);

    // Sync dual workforce collections: registered_people <-> people in MongoDB
    if (collection === 'registered_people') {
      await upsertDoc('people', { ...body, id: id || body.id }, orgId).catch(() => {});
    } else if (collection === 'people') {
      await upsertDoc('registered_people', { ...body, id: id || body.id }, orgId).catch(() => {});
    } else if (collection === 'devices') {
      if (body.category === 'rfid' || String(body.type || '').toLowerCase().includes('reader')) {
        await upsertDoc('hardware_readers', {
          id: id || body.id,
          readerId: id || body.id,
          name: body.name,
          location: body.location,
          zone: body.location,
          status: (body.status || 'ONLINE').toUpperCase(),
          type: body.type || 'UHF Fixed Portal',
          ipAddress: body.ip || body.ipAddress,
          macAddress: body.mac || body.macAddress
        }, orgId).catch(() => {});
      }
    } else if (collection === 'hardware_readers') {
      await upsertDoc('devices', {
        id: id || body.id,
        name: body.name || `GAO Reader ${id || body.id}`,
        category: 'rfid',
        type: body.type || 'UHF RFID Reader Gateway',
        location: body.location || body.zone || 'Site Portal',
        status: (body.status || 'online').toLowerCase(),
        ip: body.ipAddress || body.ip || '192.168.1.101',
        mac: body.macAddress || body.mac || '00:1A:79:39:63:43'
      }, orgId).catch(() => {});
    }

    await logAuditEvent({
      userId: user?.id || 'client',
      userEmail: user?.email || 'client',
      organizationId: orgId,
      action: `UPDATE_${collection.toUpperCase()}_DOC`,
      resource: collection,
      details: { docId: id },
      ip: req.ip
    });

    return res.json(saved);
  } catch (err: any) {
    console.error(`[Data Route] Error updating doc ${id} in ${collection}:`, err);
    return res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/data/:collection/:id
dataRouter.delete('/:collection/:id', async (req: AuthRequest, res: Response) => {
  const collection = req.params.collection;
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
  const user = req.user;
  const orgId = user?.organizationId || 'default';

  try {
    let deleted = await deleteDocById(collection, id, orgId);

    // Sync deletion across mirror/related collections
    if (collection === 'registered_people') {
      const pDel = await deleteDocById('people', id, orgId).catch(() => false);
      if (pDel) deleted = true;
    } else if (collection === 'people') {
      const rDel = await deleteDocById('registered_people', id, orgId).catch(() => false);
      if (rDel) deleted = true;
    } else if (collection === 'devices' || collection === 'hardware_readers') {
      const mirrorDel = await deleteDocById(collection === 'devices' ? 'hardware_readers' : 'devices', id, orgId).catch(() => false);
      const tagMapDel = await deleteDocById('hardware_tag_mappings', id, orgId).catch(() => false);
      const liveDel = await deleteDocById('live_tags', id, orgId).catch(() => false);
      if (mirrorDel || tagMapDel || liveDel) deleted = true;
    }

    await logAuditEvent({
      userId: user?.id || 'client',
      userEmail: user?.email || 'client',
      organizationId: orgId,
      action: `DELETE_${collection.toUpperCase()}_DOC`,
      resource: collection,
      details: { docId: id, success: deleted },
      ip: req.ip
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Document not found or belongs to another organization' });
    }

    return res.json({ message: 'Document deleted successfully', id });
  } catch (err: any) {
    console.error(`[Data Route] Error deleting doc ${id} in ${collection}:`, err);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
});
