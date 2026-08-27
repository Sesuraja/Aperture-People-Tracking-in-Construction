import { Router, Response } from 'express';
import {
  getCollectionDocs,
  getDocById,
  upsertDoc,
  deleteDocById,
  isMongoConnected,
  logAuditEvent
} from '../services/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

export const dataRouter = Router();

// Require authenticated session for all /api/data/* endpoints
dataRouter.use(requireAuth);

// GET /api/data/stats
dataRouter.get('/stats', async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId || 'demo';
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
  const orgId = req.user?.organizationId || 'demo';
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

// GET /api/data/:collection/:id
dataRouter.get('/:collection/:id', async (req: AuthRequest, res: Response) => {
  const { collection, id } = req.params;
  const orgId = req.user?.organizationId || 'demo';
  try {
    const doc = await getDocById(collection, id, orgId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    return res.json(doc);
  } catch (err: any) {
    console.error(`[Data Route] Error fetching doc ${id} in ${collection}:`, err);
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/data/:collection (upsert)
dataRouter.post('/:collection', async (req: AuthRequest, res: Response) => {
  const { collection } = req.params;
  const user = req.user;
  const orgId = user?.organizationId || 'demo';

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  try {
    const saved = await upsertDoc(collection, body, orgId);

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
  const orgId = user?.organizationId || 'demo';

  // IDOR check: if updating existing doc, ensure it belongs to the tenant
  const existingDoc = await getDocById(collection, id, orgId);
  const allExisting = await getDocById(collection, id, 'ALL');
  if (allExisting && (!existingDoc || (allExisting.organizationId && allExisting.organizationId !== orgId))) {
    return res.status(404).json({ error: 'Document not found or belongs to another organization' });
  }

  const body = req.body || {};
  body.id = id;

  try {
    const saved = await upsertDoc(collection, body, orgId);

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
  const { collection, id } = req.params;
  const user = req.user;
  const orgId = user?.organizationId || 'demo';

  try {
    const deleted = await deleteDocById(collection, id, orgId);

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
