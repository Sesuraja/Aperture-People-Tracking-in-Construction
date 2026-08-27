import { Router, Request, Response } from 'express';
import { 
  seedAllDemoData, 
  getCollectionDocs, 
  upsertDoc,
  wipeAllCollections
} from '../services/db.js';

import { broadcastWebSocketEvent } from '../services/websocket.js';
import {
  startMockGaoSimulator,
  stopMockGaoSimulator,
  getMockGaoStatus,
  setMockReaderOnline,
  simulateReaderReconnect,
  injectUnknownTag,
} from '../services/mockGaoAdapter.js';
import type { SimulatorConfig } from '../../lib/gaoNativeTypes.js';

export const demoRouter = Router();

/**
 * GET /api/demo/status
 * Returns current count of seeded records across all key demo collections
 */
demoRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const collections = [
      'registered_people',
      'incidents_enterprise',
      'incidents',
      'alerts_enterprise',
      'alerts',
      'alert_rules',
      'emergency_broadcasts',
      'devices',
      'audit_logs',
      'compliance_frameworks',
      'retention_policies',
      'visitors',
      'visitor_security_list',
      'work_orders',
      'maintenance_nodes',
      'attendance_logs',
      'shift_schedules',
      'leave_requests',
      'assets',
      'vehicles',
      'zones',
      'geofences',
      'real_time_tags',
      'live_tags',
      'tag_history',
      'ai_insights'
    ];

    const counts: Record<string, number> = {};
    for (const col of collections) {
      const docs = await getCollectionDocs(col);
      counts[col] = docs.length;
    }

    res.json({
      success: true,
      status: 'active',
      mode: 'demo_synthetic',
      timestamp: new Date().toISOString(),
      counts
    });
  } catch (err: any) {
    console.error('[Demo Router] Error fetching demo status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/seed
 * Forces re-seeding of all synthetic datasets into MongoDB (currently disabled)
 */
demoRouter.post('/seed', async (req: Request, res: Response) => {
  try {
    const { force = true } = req.body || {};
    const result = await seedAllDemoData(Boolean(force));

    res.json({
      success: result.success,
      message: 'Demo data seeding is disabled. Database runs on real API data only.',
      seededCollections: result.seededCollections
    });
  } catch (err: any) {
    console.error('[Demo Router] Error seeding demo data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/wipe-all
 * Wipes ALL documents from all collections — resets MongoDB to blank state.
 * After this, only real RFID hardware data will appear in the dashboard.
 */
demoRouter.post('/wipe-all', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body || {};
    console.log('[Demo Router] Wipe-all requested. OrganizationId filter:', organizationId || 'ALL');

    const result = await wipeAllCollections(organizationId);

    broadcastWebSocketEvent('DB_WIPED', {
      timestamp: new Date().toISOString(),
      message: `Database wiped. ${result.totalDeleted} documents deleted across ${Object.keys(result.wipedCollections).length} collections.`
    });

    res.json({
      success: true,
      message: `Database wiped. ${result.totalDeleted} total documents deleted.`,
      totalDeleted: result.totalDeleted,
      wipedCollections: result.wipedCollections
    });
  } catch (err: any) {
    console.error('[Demo Router] Error wiping database:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * GET /api/demo/realtime
 * Returns live tag data from MongoDB real_time_tags collection.
 * Used by the frontend in demo mode instead of hardcoded client-side arrays.
 * Simulates movement by slightly randomizing timestamps on each call.
 */
demoRouter.get('/realtime', async (req: Request, res: Response) => {
  try {
    let tags = await getCollectionDocs('real_time_tags');

    // If no tags seeded yet, auto-seed and try again
    if (!tags || tags.length === 0) {
      await seedAllDemoData(false);
      tags = await getCollectionDocs('real_time_tags');
    }

    // Simulate live movement — update timestamps and slightly vary locations
    const now = new Date().toISOString();
    const zones = [
      'Site Office & Welfare Container',
      'Structure & Scaffolding (L1-L4)',
      'Excavation & Foundation Pit',
      'Heavy Crane & Exclusion Area',
      'Gate 1 / Main Access Gate',
      'Material Laydown & Loading',
      'High Voltage Area',
      'Confined Shaft & Tunneling'
    ];

    // Cycle active zone based on current time (every 15 seconds, rotate for realism)
    const cycleIndex = Math.floor(Date.now() / 15000) % zones.length;

    const liveTags = tags.map((tag: any, idx: number) => {
      // Every 15s, one worker rotates to a new zone
      const activeZone = (idx === cycleIndex % tags.length)
        ? zones[(zones.indexOf(tag.Location || tag.LocationName || zones[0]) + 1) % zones.length]
        : (tag.Location || tag.LocationName || zones[idx % zones.length]);

      return {
        ...tag,
        Timestamp: now,
        Location: activeZone,
        LocationName: activeZone,
        rssi: -55 - Math.floor(Math.random() * 25),
        lastSyncAt: now
      };
    });

    res.json(liveTags);
  } catch (err: any) {
    console.error('[Demo Router] Error fetching demo realtime tags:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/demo/history/count
 * Returns the total count of tag history records from MongoDB.
 * Used by gaoApi.getHistoryTotalCount() in demo mode.
 */
demoRouter.get('/history/count', async (req: Request, res: Response) => {
  try {
    let records = await getCollectionDocs('tag_history');

    // Auto-seed if empty
    if (!records || records.length === 0) {
      await seedAllDemoData(false);
      records = await getCollectionDocs('tag_history');
    }

    res.json({ totalCount: records.length, count: records.length });
  } catch (err: any) {
    console.error('[Demo Router] Error fetching history count:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/demo/history/records
 * Returns paginated tag history records from MongoDB.
 * Used by gaoApi.getHistoryRecords(skip, take) in demo mode.
 * Query params: skip (default 0), take (default 10)
 */
demoRouter.get('/history/records', async (req: Request, res: Response) => {
  try {
    const skip = parseInt(String(req.query.skip || '0'), 10);
    const take = parseInt(String(req.query.take || '10'), 10);

    let records = await getCollectionDocs('tag_history');

    // Auto-seed if empty
    if (!records || records.length === 0) {
      await seedAllDemoData(false);
      records = await getCollectionDocs('tag_history');
    }

    // Sort by EnterTime descending and paginate
    const sorted = [...records].sort((a: any, b: any) => {
      const ta = new Date(a.EnterTime || a.EnterTimeStr || 0).getTime();
      const tb = new Date(b.EnterTime || b.EnterTimeStr || 0).getTime();
      return tb - ta;
    });

    const page = sorted.slice(skip, skip + take);

    // Normalize to GAO format
    const normalized = page.map((r: any) => ({
      TagID: r.TagID || r.tagId || '',
      FirstName: r.FirstName || r.firstName || '',
      LastName: r.LastName || r.lastName || '',
      LocationName: r.LocationName || r.Location || r.location || '',
      EnterTime: r.EnterTime || r.EnterTimeStr || '',
      EnterTimeStr: r.EnterTimeStr || r.EnterTime || '',
      LeaveTime: r.LeaveTime || r.LeaveTimeStr || '',
      LeaveTimeStr: r.LeaveTimeStr || r.LeaveTime || '',
      Duration: r.Duration || 0
    }));

    res.json(normalized);
  } catch (err: any) {
    console.error('[Demo Router] Error fetching history records:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/demo/ai-insights
 * Returns AI insights from MongoDB for demo mode.
 */
demoRouter.get('/ai-insights', async (req: Request, res: Response) => {
  try {
    let insights = await getCollectionDocs('ai_insights');

    // Auto-seed if empty
    if (!insights || insights.length === 0) {
      await seedAllDemoData(false);
      insights = await getCollectionDocs('ai_insights');
    }

    const sorted = [...insights].sort((a: any, b: any) => {
      return new Date(b.createdAt || b.timestamp || 0).getTime() - new Date(a.createdAt || a.timestamp || 0).getTime();
    });

    res.json(sorted);
  } catch (err: any) {
    console.error('[Demo Router] Error fetching demo AI insights:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/event
 * Triggers interactive simulation events (SOS, Geofence breach, Turnstile punch, Incident)
 */
demoRouter.post('/event', async (req: Request, res: Response) => {
  try {
    const { eventType, details } = req.body;

    if (eventType === 'sos_alarm') {
      const sosAlert = {
        id: `ALT-SOS-${Date.now().toString().slice(-4)}`,
        type: 'security',
        category: 'Emergency',
        priority: 'Critical',
        status: 'In Progress',
        title: 'EMERGENCY: Man-Down / SOS Button Triggered',
        message: details?.message || 'Worker Marcus Vance (HH-1092) pressed SOS panic tag button in Deep Excavation Shaft.',
        timestamp: new Date().toISOString(),
        assignedTo: 'Marcus Vance (EHS Director)',
        assignedRole: 'EHS Lead Officer',
        assignedAt: new Date().toISOString(),
        aiSummary: {
          rootCause: 'Immediate man-down or duress trigger signal received over UHF frequency 915 MHz.',
          threatScore: 98,
          recommendedActions: [
            'Sound sector emergency buzzer immediately.',
            'Deploy first responder medical kit to Deep Excavation West Bench.',
            'Dispatch safety team lead to confirm worker status.'
          ]
        },
        evidence: {
          locationZone: 'Deep Excavation Shaft',
          rfidReaderId: 'DEV-02',
          rssiDbm: -58,
          telemetryLog: '[SOS_PANIC_ACTIVE] RSSI: -58dBm | Accelerometer Impact: 3.8G | Battery: 94%'
        }
      };

      await upsertDoc('alerts_enterprise', sosAlert);
      await upsertDoc('alerts', {
        id: sosAlert.id,
        type: 'security',
        message: sosAlert.message,
        timestamp: sosAlert.timestamp,
        location: 'Deep Excavation Shaft',
        resolved: false
      });

      broadcastWebSocketEvent('ALERT_EVENT', sosAlert);

      return res.json({ success: true, event: sosAlert });
    }

    if (eventType === 'geofence_breach') {
      const breachAlert = {
        id: `ALT-GEO-${Date.now().toString().slice(-4)}`,
        type: 'warning',
        category: 'Safety',
        priority: 'High',
        status: 'Open',
        title: 'GEOFENCE BREACH: Uncertified Personnel in Exclusion Zone',
        message: details?.message || 'Worker David Kim entered Heavy Crane & Exclusion Area without certified rigger credentials.',
        timestamp: new Date().toISOString(),
        assignedTo: 'Elena Rostova (Field Safety Lead)',
        aiSummary: {
          rootCause: 'Proximity violation within active 25-ton lifting radius during tower crane slew cycle.',
          threatScore: 88,
          recommendedActions: [
            'Alert crane operator Carlos Mendez to hold slew rotation.',
            'Trigger localized exclusion zone strobe lights.'
          ]
        },
        evidence: {
          locationZone: 'Heavy Crane & Exclusion Area',
          rfidReaderId: 'DEV-04',
          rssiDbm: -64
        }
      };

      await upsertDoc('alerts_enterprise', breachAlert);
      broadcastWebSocketEvent('ALERT_EVENT', breachAlert);

      return res.json({ success: true, event: breachAlert });
    }

    if (eventType === 'attendance_punch') {
      const worker = DEFAULT_PEOPLE[Math.floor(Math.random() * DEFAULT_PEOPLE.length)];
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const punch = {
        id: `att_${Date.now()}`,
        tagId: worker.hardhatTagId,
        rfidTagId: worker.hardhatTagId,
        personId: worker.id,
        name: worker.name,
        role: worker.role,
        trade: worker.role,
        company: worker.tradeCompany || 'Apex Construction',
        department: worker.department || 'Field Operations',
        siteZone: worker.currentZone || 'Structure & Scaffolding (L1-L4)',
        shift: 'Day Shift (07:00-15:30)',
        firstIn: timeStr,
        lastOut: '--:--',
        breakDurationMins: 45,
        totalHoursStr: '7h 30m',
        totalMins: 450,
        overtimeHours: 0,
        isLate: false,
        isOvertime: false,
        geoStatus: 'IN_GEO_FENCE',
        status: 'PRESENT',
        hourlyRate: 45,
        punchType: 'RFID_AUTO',
        gateLocation: 'Gate 1 - North Gatehouse',
        date: now.toISOString().split('T')[0],
        timestamp: now.toISOString(),
        updatedAt: now.toISOString(),
        verified: true,
        verificationMethod: 'UHF Long-Range Passive RFID'
      };

      await upsertDoc('attendance_logs', punch);
      broadcastWebSocketEvent('ATTENDANCE_PUNCH', punch);

      return res.json({ success: true, punch });
    }

    res.status(400).json({ success: false, error: `Unknown eventType: ${eventType}` });
  } catch (err: any) {
    console.error('[Demo Router] Error triggering demo event:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// GAO216031A SIMULATOR ROUTES
// These routes control the MockGAO216031AAdapter.
// All events generated by the simulator flow through the existing pipeline:
// processDirectHardwareScan() → processTelemetryWithAI() → MongoDB → WebSocket
// ============================================================================

/**
 * POST /api/demo/gao-simulator/start
 * Start the GAO216031A Mock Simulator with optional config overrides.
 *
 * Body (all optional):
 *   intervalMs      — read interval in ms (default: 500)
 *   rssiMin         — min RSSI dBm (default: -75)
 *   rssiMax         — max RSSI dBm (default: -40)
 *   scenario        — 'construction_site_movement' | 'random' | 'restricted_zone_breach' | 'lone_worker' | 'mass_evacuation'
 *   dedupWindowMs   — dedup window in ms (default: 30000)
 */
demoRouter.post('/gao-simulator/start', async (req: Request, res: Response) => {
  try {
    const {
      intervalMs,
      rssiMin,
      rssiMax,
      scenario,
      dedupWindowMs,
      unknownTagEnabled,
      unknownTagIntervalMs,
    } = req.body || {};

    const configOverride: Partial<SimulatorConfig> = {};
    if (typeof intervalMs === 'number' && intervalMs >= 100) configOverride.intervalMs = intervalMs;
    if (typeof rssiMin === 'number') configOverride.rssiMin = rssiMin;
    if (typeof rssiMax === 'number') configOverride.rssiMax = rssiMax;
    if (scenario) configOverride.scenario = scenario;
    if (typeof dedupWindowMs === 'number') configOverride.dedupWindowMs = dedupWindowMs;
    if (typeof unknownTagEnabled === 'boolean') configOverride.unknownTagEnabled = unknownTagEnabled;
    if (typeof unknownTagIntervalMs === 'number') configOverride.unknownTagIntervalMs = unknownTagIntervalMs;

    await startMockGaoSimulator(Object.keys(configOverride).length > 0 ? configOverride : undefined);

    const status = getMockGaoStatus();
    return res.json({
      success: true,
      message: 'GAO216031A Mock Simulator started. Events are flowing through the existing Aperture ingestion pipeline.',
      simulated: true,
      status,
    });
  } catch (err: any) {
    console.error('[Demo Router] Error starting GAO simulator:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/gao-simulator/stop
 * Stop the GAO216031A Mock Simulator.
 */
demoRouter.post('/gao-simulator/stop', async (req: Request, res: Response) => {
  try {
    await stopMockGaoSimulator();
    const status = getMockGaoStatus();
    return res.json({
      success: true,
      message: 'GAO216031A Mock Simulator stopped.',
      simulated: true,
      status,
    });
  } catch (err: any) {
    console.error('[Demo Router] Error stopping GAO simulator:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/demo/gao-simulator/status
 * Returns current simulator status including per-reader health.
 */
demoRouter.get('/gao-simulator/status', async (req: Request, res: Response) => {
  try {
    const status = getMockGaoStatus();
    return res.json({ success: true, simulated: true, ...status });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/gao-simulator/reader-toggle
 * Toggle a specific simulated reader online or offline.
 * Also supports simulating a reconnect cycle.
 *
 * Body:
 *   readerId  — required, e.g. "GAO-MOCK-001"
 *   online    — boolean (true = ONLINE, false = OFFLINE)
 *   reconnect — boolean (if true, runs OFFLINE → RECONNECTING → ONLINE cycle)
 */
demoRouter.post('/gao-simulator/reader-toggle', async (req: Request, res: Response) => {
  try {
    const { readerId, online, reconnect } = req.body || {};
    if (!readerId) {
      return res.status(400).json({ success: false, error: 'readerId is required' });
    }

    if (reconnect) {
      await simulateReaderReconnect(readerId);
      return res.json({
        success: true,
        message: `Simulated reconnect cycle started for ${readerId}: OFFLINE → RECONNECTING → ONLINE`,
        simulated: true,
      });
    }

    if (typeof online !== 'boolean') {
      return res.status(400).json({ success: false, error: 'online (boolean) or reconnect (boolean) is required' });
    }

    await setMockReaderOnline(readerId, online);
    return res.json({
      success: true,
      message: `Reader ${readerId} set to ${online ? 'ONLINE' : 'OFFLINE'}`,
      simulated: true,
      readerId,
      online,
    });
  } catch (err: any) {
    console.error('[Demo Router] Error toggling reader:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/gao-simulator/inject-unknown
 * Inject a single unknown tag event (EPC with no entity mapping).
 * This exercises the "Unknown Tag" detection path in the safety pipeline.
 */
demoRouter.post('/gao-simulator/inject-unknown', async (req: Request, res: Response) => {
  try {
    await injectUnknownTag();
    return res.json({
      success: true,
      message: 'Unknown/unassigned RFID tag event injected into the ingestion pipeline.',
      simulated: true,
      epc: 'E28068940000501234567899',
    });
  } catch (err: any) {
    console.error('[Demo Router] Error injecting unknown tag:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
