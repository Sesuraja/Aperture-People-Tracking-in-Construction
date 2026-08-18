import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let runtimeMongoUri: string | null = null;

const PERSISTENT_CONFIG_FILE = path.join(process.cwd(), '.mongo_runtime.json');

// Load any runtime configured MongoDB URI from disk on startup
try {
  if (fs.existsSync(PERSISTENT_CONFIG_FILE)) {
    const raw = fs.readFileSync(PERSISTENT_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.mongodbUri) {
      runtimeMongoUri = parsed.mongodbUri;
    }
  }
} catch (e) {
  // Ignore filesystem cache error
}

// Transient in-memory store for dev fallback when MongoDB is not connected
const inMemoryStore: Record<string, any[]> = {
  users: [],
  permissions: [],
  role_permissions: [],
  registered_people: [],
  devices: [],
  hardware_readers: [],
  hardware_tag_mappings: [],
  third_party_apis: [],
  visitors: [],
  visitor_security_list: [],
  visitor_access_tokens: [],
  visitor_access_logs: [],
  attendance_logs: [],
  leave_requests: [],
  shift_schedules: [],
  alerts: [],
  alerts_enterprise: [],
  alert_rules: [],
  alert_dispatch_logs: [],
  emergency_broadcasts: [],
  live_tags: [],
  real_time_tags: [],
  rfid_realtime_events: [],
  tag_history: [],
  audit_logs: [],
  settings: [],
  incidents_enterprise: [],
  zones: [],
  map_configurations: [],
  geofences: [],
  reader_zone_mappings: [],
  people: [],
  ai_insights: [],
  incidents: []
};

export function sanitizeMongoUri(rawUri?: string): string {
  if (!rawUri || typeof rawUri !== 'string') return '';
  let uri = rawUri.trim();
  // Strip surrounding quotes if accidentally pasted
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
}

export function getMongoUri(): string {
  const uri = runtimeMongoUri || process.env.MONGODB_URI || "";
  return sanitizeMongoUri(uri);
}

export async function initDatabase(customUri?: string): Promise<void> {
  const rawUri = customUri || getMongoUri();
  const uri = sanitizeMongoUri(rawUri);

  if (!uri) {
    console.warn('[DB Service] MONGODB_URI not set in environment or settings. Operating with transient in-memory storage.');
    return;
  }

  try {
    if (mongoClient) {
      try { await mongoClient.close(); } catch {}
      mongoClient = null;
      mongoDb = null;
    }
    
    mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
      socketTimeoutMS: 15000,
      maxPoolSize: 10
    });
    
    await mongoClient.connect();
    await mongoClient.db().admin().ping();
    mongoDb = mongoClient.db();
    runtimeMongoUri = uri;

    // Persist runtime URI to disk
    try {
      fs.writeFileSync(PERSISTENT_CONFIG_FILE, JSON.stringify({ mongodbUri: uri, updatedAt: new Date().toISOString() }), 'utf-8');
    } catch {}

    console.log('[DB Service] Successfully connected to MongoDB database.');
  } catch (err: any) {
    console.error('[DB Service] Failed to connect to MongoDB:', err.message);
    console.warn('[DB Service] Operating with in-memory storage fallback.');
    mongoClient = null;
    mongoDb = null;
  } finally {
    await bootstrapMapAndZoneDefinitions();
  }
}

export function isMongoConnected(): boolean {
  return mongoDb !== null;
}

export function getDbStatus() {
  const uri = getMongoUri();
  return {
    connected: isMongoConnected(),
    provider: isMongoConnected() ? 'mongodb' : 'in_memory',
    uri: uri ? uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'None (In-Memory Fallback)'
  };
}

export async function getMongoStats() {
  const uri = getMongoUri();
  const connected = isMongoConnected();
  let collectionsCount = 0;
  let totalRecords = 0;
  let collectionsBreakdown: Record<string, number> = {};
  let lastError: string | null = null;

  if (connected && mongoDb) {
    try {
      const cols = await mongoDb.listCollections().toArray();
      collectionsCount = cols.length;
      for (const col of cols) {
        try {
          const count = await mongoDb.collection(col.name).countDocuments();
          totalRecords += count;
          collectionsBreakdown[col.name] = count;
        } catch {}
      }
    } catch (err: any) {
      lastError = err.message;
    }
  } else {
    // In-memory breakdown for fallback inspection
    for (const [key, items] of Object.entries(inMemoryStore)) {
      if (items.length > 0) {
        collectionsBreakdown[key] = items.length;
        totalRecords += items.length;
      }
    }
    collectionsCount = Object.keys(collectionsBreakdown).length;
    lastError = 'MongoDB is not connected (operating with in-memory fallback)';
  }

  const maskedUri = uri ? uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : '';

  return {
    connected,
    connectionString: maskedUri,
    engine: connected ? 'MongoDB Atlas / Cluster' : 'In-Memory Fallback',
    collectionsCount,
    totalRecords,
    collectionsBreakdown,
    lastError
  };
}

export async function testMongoConnection(uriInput: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const uri = sanitizeMongoUri(uriInput);
  if (!uri) {
    return { success: false, error: 'MongoDB connection string cannot be empty' };
  }

  let tempClient: MongoClient | null = null;
  const startTime = Date.now();
  try {
    tempClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000
    });
    await tempClient.connect();
    await tempClient.db().admin().ping();
    const latencyMs = Date.now() - startTime;
    await tempClient.close();
    return { success: true, latencyMs };
  } catch (err: any) {
    if (tempClient) {
      try { await tempClient.close(); } catch {}
    }
    return { success: false, error: err.message || 'Failed to connect to MongoDB instance. Check credentials, network access, or IP whitelist.' };
  }
}

export async function reconnectDatabase(newUriInput: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const newUri = sanitizeMongoUri(newUriInput);
  try {
    const testResult = await testMongoConnection(newUri);
    if (!testResult.success) {
      return { success: false, error: testResult.error || 'Connection test failed with provided URI' };
    }
    await initDatabase(newUri);
    if (isMongoConnected()) {
      return { success: true, latencyMs: testResult.latencyMs };
    } else {
      return { success: false, error: 'Could not initialize MongoDB session with provided URI' };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reconnect to MongoDB' };
  }
}

export async function getCollectionDocs(colName: string, opts?: { limit?: number; sort?: Record<string, 1 | -1> }): Promise<any[]> {
  if (mongoDb) {
    try {
      // Per-collection default limits to prevent timeouts on very large collections
      const DEFAULT_LIMITS: Record<string, number> = {
        ai_insights:    500,
        audit_logs:     1000,
        incidents:      2000,
        incidents_enterprise: 500,
        rfid_realtime_events: 500,
        tag_history:    500,
      };
      const limit  = opts?.limit  ?? DEFAULT_LIMITS[colName] ?? 0;   // 0 = no limit
      const sort   = opts?.sort   ?? (DEFAULT_LIMITS[colName] ? { createdAt: -1 } : {});

      let cursor = mongoDb.collection(colName).find({});
      if (Object.keys(sort).length)  cursor = cursor.sort(sort as any);
      if (limit > 0)                 cursor = cursor.limit(limit);

      const docs = await cursor.toArray();
      return docs.map(doc => {
        const { _id, ...rest } = doc;
        const out: any = { id: doc.id || (_id ? _id.toString() : undefined), ...rest };
        // Normalise duplicate TagID / tagId keys written by different ingestion paths
        if (colName === 'live_tags' || colName === 'real_time_tags' || colName === 'rfid_realtime_events') {
          if (out.TagID !== undefined && out.tagId !== undefined) {
            out.TagID = out.TagID || out.tagId;   // keep canonical uppercase version
            delete out.tagId;
          }
        }
        return out;
      });
    } catch (err) {
      console.error(`[DB Service] Error fetching docs for ${colName}:`, err);
    }
  }
  return inMemoryStore[colName] || [];
}


export async function getDocById(colName: string, id: string): Promise<any | null> {
  if (mongoDb) {
    try {
      const doc = await mongoDb.collection(colName).findOne({ id });
      if (doc) {
        const { _id, ...rest } = doc;
        return { id: doc.id, ...rest };
      }
      return null;
    } catch (err) {
      console.error(`[DB Service] Error fetching doc ${id} in ${colName}:`, err);
    }
  }
  const items = inMemoryStore[colName] || [];
  return items.find((i: any) => i.id === id) || null;
}

export async function upsertDoc(colName: string, doc: any): Promise<any> {
  if (!doc.id) {
    doc.id = `${colName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  const cleanDoc = { ...doc };
  delete (cleanDoc as any)._id;

  if (mongoDb) {
    try {
      await mongoDb.collection(colName).updateOne(
        { id: cleanDoc.id },
        { $set: cleanDoc },
        { upsert: true }
      );
      return cleanDoc;
    } catch (err) {
      console.error(`[DB Service] Error upserting doc in ${colName}:`, err);
    }
  }

  if (!inMemoryStore[colName]) {
    inMemoryStore[colName] = [];
  }
  const idx = inMemoryStore[colName].findIndex((item: any) => item.id === cleanDoc.id);
  if (idx >= 0) {
    inMemoryStore[colName][idx] = cleanDoc;
  } else {
    inMemoryStore[colName].push(cleanDoc);
  }
  return cleanDoc;
}

export async function deleteDocById(colName: string, id: string): Promise<boolean> {
  if (mongoDb) {
    try {
      const result = await mongoDb.collection(colName).deleteOne({ id });
      return result.deletedCount > 0;
    } catch (err) {
      console.error(`[DB Service] Error deleting doc ${id} in ${colName}:`, err);
    }
  }

  if (inMemoryStore[colName]) {
    const initLen = inMemoryStore[colName].length;
    inMemoryStore[colName] = inMemoryStore[colName].filter((item: any) => item.id !== id);
    return inMemoryStore[colName].length < initLen;
  }
  return false;
}

export async function deleteDocsByFilter(colName: string, predicate: (doc: any) => boolean): Promise<number> {
  const docs = await getCollectionDocs(colName);
  const toDelete = docs.filter(predicate);
  let count = 0;

  for (const doc of toDelete) {
    const deleted = await deleteDocById(colName, doc.id);
    if (deleted) count++;
  }

  return count;
}

export async function logAuditEvent(event: {
  userId?: string;
  userEmail?: string;
  action: string;
  resource: string;
  details?: any;
  ip?: string;
}): Promise<void> {
  const auditDoc = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    userId: event.userId || 'system',
    userEmail: event.userEmail || 'system',
    action: event.action,
    resource: event.resource,
    details: event.details || {},
    ip: event.ip || 'unknown'
  };

  await upsertDoc('audit_logs', auditDoc);
}

export async function getAuditLogs(limitCount = 100): Promise<any[]> {
  const logs = await getCollectionDocs('audit_logs');
  return logs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limitCount);
}

/**
 * Normalizes multi-protocol real-time stream events (WebSocket, SSE, MQTT, Webhook)
 * to { TagID, Timestamp, Location } structure and performs bulk write to 'rfid_realtime_events' collection.
 */
export async function bulkWriteRfidRealtimeEvents(rawEvents: any[], protocol: string = 'Multi-Protocol'): Promise<{ insertedCount: number; modifiedCount: number; totalProcessed: number }> {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { insertedCount: 0, modifiedCount: 0, totalProcessed: 0 };
  }

  const nowIso = new Date().toISOString();
  let insertedCount = 0;
  let modifiedCount = 0;

  const normalizedDocs = rawEvents.map((raw) => {
    const tagId = String(raw.TagID || raw.tagId || raw.epc || raw.EPC || raw.id || `TAG_${Date.now()}`);
    const location = String(raw.Location || raw.location || raw.LocationName || raw.zone || raw.Zone || 'Zone1');
    const rawTime = raw.Timestamp || raw.timestamp || raw.EnterTime || raw.time || nowIso;
    const d = new Date(rawTime);
    const validDate = isNaN(d.getTime()) ? new Date() : d;

    // ISO & GAO formatted timestamp string
    const YYYY = validDate.getUTCFullYear();
    const MM = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(validDate.getUTCDate()).padStart(2, '0');
    const hh = String(validDate.getUTCHours()).padStart(2, '0');
    const mm = String(validDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(validDate.getUTCSeconds()).padStart(2, '0');
    const fff = String(validDate.getUTCMilliseconds()).padStart(3, '0');
    const timestampMs = `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}.${fff}`;

    const docId = `evt_${tagId}_${validDate.getTime()}_${Math.random().toString(36).substring(2, 6)}`;

    return {
      id: docId,
      TagID: tagId,
      Timestamp: timestampMs,
      Location: location,
      FirstName: raw.FirstName || raw.firstName || 'Staff',
      LastName: raw.LastName || raw.lastName || 'Member',
      protocol: raw.protocol || protocol,
      rssi: raw.rssi !== undefined ? Number(raw.rssi) : -60,
      readerId: raw.readerId || raw.ReaderID || 'APERTURE-READER-01',
      antennaPort: raw.antennaPort || raw.antennaId || 1,
      receivedAt: nowIso
    };
  });

  if (mongoDb) {
    try {
      const operations = normalizedDocs.map((doc) => ({
        updateOne: {
          filter: { id: doc.id },
          update: { $set: doc },
          upsert: true
        }
      }));

      const result = await mongoDb.collection('rfid_realtime_events').bulkWrite(operations, { ordered: false });
      insertedCount = result.upsertedCount || 0;
      modifiedCount = result.modifiedCount || 0;

      // Also mirror/update real_time_tags & live_tags
      await bulkWriteRealtimeTags(normalizedDocs);

      return { insertedCount, modifiedCount, totalProcessed: rawEvents.length };
    } catch (err: any) {
      console.error('[DB Service] Error in bulkWriteRfidRealtimeEvents to MongoDB:', err);
    }
  }

  // Fallback in-memory persistence
  for (const doc of normalizedDocs) {
    await upsertDoc('rfid_realtime_events', doc);
    await upsertDoc('real_time_tags', doc);
    await upsertDoc('live_tags', doc);
    insertedCount++;
  }

  return { insertedCount, modifiedCount: 0, totalProcessed: rawEvents.length };
}

/**
 * Bulk writes real-time tag documents into MongoDB collection 'real_time_tags'
 */
export async function bulkWriteRealtimeTags(tags: any[]): Promise<{ insertedCount: number; updatedCount: number; totalProcessed: number }> {
  if (!Array.isArray(tags) || tags.length === 0) {
    return { insertedCount: 0, updatedCount: 0, totalProcessed: 0 };
  }

  let insertedCount = 0;
  let updatedCount = 0;

  if (mongoDb) {
    try {
      const operations = tags.map((rawTag) => {
        const tagId = rawTag.TagID || rawTag.tagId || rawTag.epc || `TAG_${Date.now()}`;
        const docToUpsert = {
          id: tagId,
          TagID: tagId,
          Timestamp: rawTag.Timestamp || new Date().toISOString(),
          Location: rawTag.Location || rawTag.LocationName || rawTag.zone || 'Zone1',
          FirstName: rawTag.FirstName || 'Staff',
          LastName: rawTag.LastName || 'User',
          rssi: rawTag.rssi !== undefined ? Number(rawTag.rssi) : -60,
          status: rawTag.status || 'Active',
          lastSyncAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        return {
          updateOne: {
            filter: { TagID: tagId },
            update: { $set: docToUpsert },
            upsert: true
          }
        };
      });

      const result = await mongoDb.collection('real_time_tags').bulkWrite(operations, { ordered: false });
      insertedCount = result.upsertedCount || 0;
      updatedCount = result.modifiedCount || 0;
      
      // Also mirror to live_tags collection
      for (const t of tags) {
        await upsertDoc('live_tags', t);
      }

      return { insertedCount, updatedCount, totalProcessed: tags.length };
    } catch (err: any) {
      console.error('[DB Service] Error during bulkWriteRealtimeTags to MongoDB:', err);
    }
  }

  // Fallback for in-memory store
  for (const t of tags) {
    const tagId = t.TagID || t.tagId || t.epc || `TAG_${Date.now()}`;
    const cleanDoc = {
      id: tagId,
      TagID: tagId,
      Timestamp: t.Timestamp || new Date().toISOString(),
      Location: t.Location || t.LocationName || t.zone || 'Zone1',
      FirstName: t.FirstName || 'Staff',
      LastName: t.LastName || 'User',
      rssi: t.rssi !== undefined ? Number(t.rssi) : -60,
      status: t.status || 'Active',
      lastSyncAt: new Date().toISOString()
    };
    await upsertDoc('real_time_tags', cleanDoc);
    await upsertDoc('live_tags', cleanDoc);
    updatedCount++;
  }

  return { insertedCount: tags.length, updatedCount, totalProcessed: tags.length };
}

/**
 * Periodically cleans up stale real-time tag data older than specified threshold (minutes) from MongoDB 'real_time_tags'
 */
export async function cleanupStaleRealTimeTags(maxAgeMinutes: number = 60): Promise<{ cleanedCount: number; remainingCount: number }> {
  const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  let cleanedCount = 0;

  console.log(`[DB Service] Running stale real-time tags cleanup (Threshold: ${maxAgeMinutes} mins / Cutoff: ${cutoffTime.toISOString()})...`);

  if (mongoDb) {
    try {
      const filter = {
        $or: [
          { Timestamp: { $lt: cutoffTime.toISOString() } },
          { lastSyncAt: { $lt: cutoffTime.toISOString() } }
        ]
      };

      const result = await mongoDb.collection('real_time_tags').deleteMany(filter);
      cleanedCount = result.deletedCount || 0;
      
      const remainingCount = await mongoDb.collection('real_time_tags').countDocuments();
      console.log(`[DB Service] Cleaned up ${cleanedCount} stale real-time tags from MongoDB. Remaining: ${remainingCount}`);
      return { cleanedCount, remainingCount };
    } catch (err: any) {
      console.error('[DB Service] Error cleaning up stale real-time tags in MongoDB:', err);
    }
  }

  // In-memory cleanup fallback
  if (inMemoryStore['real_time_tags']) {
    const initialLen = inMemoryStore['real_time_tags'].length;
    inMemoryStore['real_time_tags'] = inMemoryStore['real_time_tags'].filter((doc: any) => {
      const ts = new Date(doc.Timestamp || doc.lastSyncAt || doc.timestamp || Date.now());
      return !isNaN(ts.getTime()) && ts.getTime() >= cutoffTime.getTime();
    });
    cleanedCount = initialLen - inMemoryStore['real_time_tags'].length;
  }

  const remainingCount = (inMemoryStore['real_time_tags'] || []).length;
  return { cleanedCount, remainingCount };
}

export const DEFAULT_PERMANENT_ZONES = [
  {
    id: 'zone_excavation_shaft',
    zoneId: 'zone_excavation_shaft',
    name: 'Excavation & Foundation Pit',
    aliasNames: ['Excavation Shaft', 'Excavation & Foundation Pit', 'Deep Excavation Shaft', 'Zone2'],
    category: 'EXCAVATION & SHORING',
    hazardLevel: 'warning',
    capacity: 8,
    siteId: 'metro-tower',
    x: 10,
    y: 15,
    width: 34,
    height: 62,
    readerIds: ['RDR-002', 'GAO-UHF-READER-02'],
    antennaIds: [1]
  },
  {
    id: 'zone_tower_core',
    zoneId: 'zone_tower_core',
    name: 'Structure & Scaffolding (L1-L4)',
    aliasNames: ['Tower Core', 'Structure & Scaffolding (L1-L4)', 'Tower Core Structure', 'Zone1', 'd6'],
    category: 'CONCRETE REINFORCEMENT',
    hazardLevel: 'normal',
    capacity: 25,
    siteId: 'metro-tower',
    x: 51,
    y: 25,
    width: 32,
    height: 50,
    readerIds: ['RDR-003', 'GAO-UHF-READER-01'],
    antennaIds: [1]
  },
  {
    id: 'zone_crane_area',
    zoneId: 'zone_crane_area',
    name: 'Heavy Crane & Exclusion Area',
    aliasNames: ['Crane Swing Zone', 'Heavy Crane & Exclusion Area', 'd8', 'Crane Exclusion'],
    category: 'CRANE SWING RADIUS',
    hazardLevel: 'critical',
    capacity: 4,
    siteId: 'metro-tower',
    x: 80,
    y: 5,
    width: 16,
    height: 42,
    readerIds: ['RDR-002', 'GAO-UHF-READER-03'],
    antennaIds: [1]
  },
  {
    id: 'zone_high_voltage',
    zoneId: 'zone_high_voltage',
    name: 'High Voltage Area',
    aliasNames: ['High Voltage Area', 'Substation Area', 'Substation Perimeter'],
    category: 'SUBSTATION PERIMETER',
    hazardLevel: 'critical',
    capacity: 2,
    siteId: 'metro-tower',
    x: 46,
    y: 5,
    width: 14,
    height: 16,
    readerIds: ['RDR-003', 'GAO-UHF-READER-03'],
    antennaIds: [2]
  },
  {
    id: 'zone_gate_1',
    zoneId: 'zone_gate_1',
    name: 'Gate 1 / Main Access Gate',
    aliasNames: ['Gate 1', 'Main Access Gate', 'Gate 1 Turnstile', 'Muster Point A'],
    category: 'MUSTER POINT & ACCESS',
    hazardLevel: 'normal',
    capacity: 50,
    siteId: 'metro-tower',
    x: 2,
    y: 10,
    width: 12,
    height: 16,
    readerIds: ['RDR-001', 'GAO-UHF-READER-01'],
    antennaIds: [1]
  },
  {
    id: 'zone_material_laydown',
    zoneId: 'zone_material_laydown',
    name: 'Material Laydown & Loading',
    aliasNames: ['Material Laydown & Loading', 'Storage Yard', 'Storage Yard Reader'],
    category: 'MATERIAL STORAGE',
    hazardLevel: 'normal',
    capacity: 15,
    siteId: 'metro-tower',
    x: 20,
    y: 75,
    width: 30,
    height: 20,
    readerIds: ['RDR-004', 'GAO-UHF-READER-01'],
    antennaIds: [2]
  },
  {
    id: 'zone_site_office',
    zoneId: 'zone_site_office',
    name: 'Site Office & Welfare Container',
    aliasNames: ['Site Office', 'Welfare Container', 'Site Office & Welfare Container'],
    category: 'ADMINISTRATION',
    hazardLevel: 'normal',
    capacity: 30,
    siteId: 'metro-tower',
    x: 5,
    y: 40,
    width: 15,
    height: 25,
    readerIds: ['RDR-001'],
    antennaIds: [2]
  },
  {
    id: 'zone_confined_shaft',
    zoneId: 'zone_confined_shaft',
    name: 'Confined Shaft & Tunneling',
    aliasNames: ['Confined Shaft', 'Tunneling', 'Confined Shaft & Tunneling'],
    category: 'CONFINED SPACE',
    hazardLevel: 'critical',
    capacity: 4,
    siteId: 'metro-tower',
    x: 60,
    y: 75,
    width: 25,
    height: 20,
    readerIds: ['RDR-003'],
    antennaIds: [2]
  }
];

export const DEFAULT_READER_ZONE_MAPPINGS = [
  { id: 'GAO-UHF-READER-01_1', readerId: 'GAO-UHF-READER-01', antennaPort: 1, zoneId: 'zone_tower_core', zoneName: 'Structure & Scaffolding (L1-L4)' },
  { id: 'GAO-UHF-READER-01_2', readerId: 'GAO-UHF-READER-01', antennaPort: 2, zoneId: 'zone_material_laydown', zoneName: 'Material Laydown & Loading' },
  { id: 'GAO-UHF-READER-02_1', readerId: 'GAO-UHF-READER-02', antennaPort: 1, zoneId: 'zone_excavation_shaft', zoneName: 'Excavation & Foundation Pit' },
  { id: 'GAO-UHF-READER-02_2', readerId: 'GAO-UHF-READER-02', antennaPort: 2, zoneId: 'zone_site_office', zoneName: 'Site Office & Welfare Container' },
  { id: 'GAO-UHF-READER-03_1', readerId: 'GAO-UHF-READER-03', antennaPort: 1, zoneId: 'zone_crane_area', zoneName: 'Heavy Crane & Exclusion Area' },
  { id: 'GAO-UHF-READER-03_2', readerId: 'GAO-UHF-READER-03', antennaPort: 2, zoneId: 'zone_high_voltage', zoneName: 'High Voltage Area' },
  { id: 'RDR-001_1', readerId: 'RDR-001', antennaPort: 1, zoneId: 'zone_gate_1', zoneName: 'Gate 1 / Main Access Gate' },
  { id: 'RDR-001_2', readerId: 'RDR-001', antennaPort: 2, zoneId: 'zone_site_office', zoneName: 'Site Office & Welfare Container' },
  { id: 'RDR-002_1', readerId: 'RDR-002', antennaPort: 1, zoneId: 'zone_crane_area', zoneName: 'Heavy Crane & Exclusion Area' },
  { id: 'RDR-002_2', readerId: 'RDR-002', antennaPort: 2, zoneId: 'zone_excavation_shaft', zoneName: 'Excavation & Foundation Pit' },
  { id: 'RDR-003_1', readerId: 'RDR-003', antennaPort: 1, zoneId: 'zone_tower_core', zoneName: 'Structure & Scaffolding (L1-L4)' },
  { id: 'RDR-003_2', readerId: 'RDR-003', antennaPort: 2, zoneId: 'zone_confined_shaft', zoneName: 'Confined Shaft & Tunneling' },
  { id: 'RDR-004_1', readerId: 'RDR-004', antennaPort: 1, zoneId: 'zone_material_laydown', zoneName: 'Material Laydown & Loading' }
];

export const DEFAULT_MAP_CONFIG = {
  id: 'metro-tower',
  siteId: 'metro-tower',
  name: 'Metro Commercial Tower Site',
  contractor: 'Apex Construction JV',
  sizeSqFt: 350000,
  dimensions: '250m x 180m',
  floorplanUrl: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&q=80&w=1200',
  buildings: [
    {
      id: 'bldg-main',
      name: 'Main Tower Structure',
      floors: [
        {
          id: 'fl-1',
          name: 'Ground Floor & Podiums',
          levelNumber: 1,
          activeVersionId: 'v-1.0',
          versions: [
            {
              id: 'v-1.0',
              versionNumber: '1.0',
              status: 'published',
              createdAt: new Date().toISOString(),
              author: 'System Initializer',
              notes: 'Initial synchronized site blueprint vector definitions',
              zones: DEFAULT_PERMANENT_ZONES.reduce((acc: any, z) => {
                acc[z.name] = {
                  zoneId: z.zoneId,
                  x: z.x,
                  y: z.y,
                  width: z.width,
                  height: z.height,
                  category: z.category,
                  hazardLevel: z.hazardLevel,
                  capacity: z.capacity
                };
                return acc;
              }, {}),
              floorplanUrl: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&q=80&w=1200'
            }
          ]
        }
      ]
    }
  ],
  updatedAt: new Date().toISOString()
};

export const DEFAULT_PEOPLE = [
  {
    id: 'HH-1092',
    hardhatTagId: 'HH-1092',
    name: 'Marcus Vance',
    role: 'Safety Officer (EHS)',
    tradeCompany: 'Aperture EHS Lead',
    phone: '+1 (555) 019-2831',
    certifications: 'OSHA 30, First Aid Lead, Crane Rigging',
    ppeStatus: 'COMPLIANT',
    shiftStatus: 'ON_SITE',
    trainingStatus: 'COMPLIANT',
    lastTrainingDate: '2026-06-10',
    trainingCourse: 'OSHA 30 & Master EHS Refresher',
    department: 'Safety & EHS',
    currentZone: 'Site Office & Welfare Container'
  },
  {
    id: 'HH-2041',
    hardhatTagId: 'HH-2041',
    name: 'Elena Rostova',
    role: 'Structural Engineer',
    tradeCompany: 'Apex Structural',
    phone: '+1 (555) 019-8822',
    certifications: 'OSHA 30, Scaffolding L3',
    ppeStatus: 'COMPLIANT',
    shiftStatus: 'ON_SITE',
    trainingStatus: 'COMPLIANT',
    lastTrainingDate: '2026-05-20',
    trainingCourse: 'OSHA 30 Structural Safety',
    department: 'Structural Engineering',
    currentZone: 'Structure & Scaffolding (L1-L4)'
  },
  {
    id: 'HH-3309',
    hardhatTagId: 'HH-3309',
    name: 'David Kim',
    role: 'General Subcontractor',
    tradeCompany: 'ConcreteWorks',
    phone: '+1 (555) 019-4411',
    certifications: 'OSHA 10, Confined Space',
    ppeStatus: 'WARNING',
    shiftStatus: 'ON_SITE',
    trainingStatus: 'DUE_SOON',
    lastTrainingDate: '2025-08-12',
    trainingCourse: 'Confined Space Renewal',
    department: 'Formwork & Pouring',
    currentZone: 'Excavation & Foundation Pit'
  },
  {
    id: 'HH-4820',
    hardhatTagId: 'HH-4820',
    name: 'Sarah Jenkins',
    role: 'Site Inspector / Visitor',
    tradeCompany: 'City Building Dept',
    phone: '+1 (555) 019-9900',
    certifications: 'Visitor Safety Clearance',
    ppeStatus: 'COMPLIANT',
    shiftStatus: 'ON_SITE',
    trainingStatus: 'COMPLIANT',
    lastTrainingDate: '2026-04-01',
    trainingCourse: 'Visitor Site Induction',
    department: 'Compliance Inspection',
    currentZone: 'Site Office & Welfare Container'
  },
  {
    id: 'HH-5112',
    hardhatTagId: 'HH-5112',
    name: 'Carlos Mendez',
    role: 'Heavy Equipment Operator',
    tradeCompany: 'Heavy Rigging Co',
    phone: '+1 (555) 019-7733',
    certifications: 'Tower Crane Master, OSHA 30',
    ppeStatus: 'COMPLIANT',
    shiftStatus: 'ON_SITE',
    trainingStatus: 'OVERDUE',
    lastTrainingDate: '2024-11-05',
    trainingCourse: 'Tower Crane Master Renewal',
    department: 'Crane Operations',
    currentZone: 'Heavy Crane & Exclusion Area'
  }
];

export const DEFAULT_VISITORS = [
  {
    id: 'VIS-881',
    name: 'Sven Lindqvist',
    company: 'City Structural Audit Dept',
    host: 'marcus.vance@buildcorp.com',
    email: 'sven.l@citygov.org',
    phone: '+1 (555) 019-1234',
    status: 'Approved',
    time: '10:00 AM (Today)',
    tag: 'Not Assigned',
    location: 'Gate 1 Gatehouse',
    duration: 'Pending Check-In',
    path: [],
    vehiclePlate: 'CITY-992',
    vehicleType: 'Sedan',
    parkingBay: 'Bay P-01',
    purpose: 'Site Structural Audit',
    idVerificationStatus: 'VERIFIED',
    idDocType: 'Driver License',
    idDocNumber: 'DL-881239',
    qrCodeRef: 'QR-SVEN-4321',
    approvalRemarks: 'Approved by EHS Director Marcus Vance'
  },
  {
    id: 'VIS-880',
    name: 'David Chen',
    company: 'Apex Scaffold Solutions',
    host: 'elena.rostova@apexstructural.com',
    email: 'david.chen@apexscaffold.com',
    phone: '+1 (555) 019-5566',
    status: 'Active',
    time: 'Arrived 08:30 AM',
    tag: 'HH-TEMP-880',
    location: 'Structure & Scaffolding (L1-L4)',
    duration: '1h 45m',
    path: ['Gate 1 Gatehouse', 'Site Office', 'Structure & Scaffolding (L1-L4)'],
    vehiclePlate: 'APEX-88',
    vehicleType: 'Pickup Truck',
    parkingBay: 'Bay P-02',
    purpose: 'Scaffolding Safety Inspection',
    idVerificationStatus: 'VERIFIED',
    idDocType: 'Work ID',
    idDocNumber: 'APEX-5421',
    qrCodeRef: 'QR-DAVI-1289',
    arrivalTime: Date.now() - 3600000 * 2,
    approvalRemarks: 'Scaffold inspection and crew briefing'
  },
  {
    id: 'VIS-879',
    name: 'Carlos Mendez',
    company: 'VoltCraft Electrical',
    host: 'marcus.vance@buildcorp.com',
    email: 'carlos@voltcraft.com',
    phone: '+1 (555) 019-8833',
    status: 'Active',
    time: 'Arrived 09:15 AM',
    tag: 'HH-TEMP-879',
    location: 'High Voltage Area',
    duration: '1h',
    path: ['Gate 1 Gatehouse', 'High Voltage Area'],
    vehiclePlate: 'VOLT-772',
    vehicleType: 'Cargo Van',
    parkingBay: 'Bay V-05',
    purpose: 'Substation Wiring and Certification',
    idVerificationStatus: 'VERIFIED',
    idDocType: 'Electrician License',
    idDocNumber: 'ELEC-9938',
    qrCodeRef: 'QR-CARL-9844',
    arrivalTime: Date.now() - 3600000,
    approvalRemarks: 'Substation validation'
  },
  {
    id: 'VIS-878',
    name: 'Frank Reynolds',
    company: 'Titan Machinery Services',
    host: 'elena.rostova@apexstructural.com',
    email: 'frank.r@titanmachinery.com',
    phone: '+1 (555) 019-1122',
    status: 'Overstayed',
    time: 'Arrived 07:00 AM',
    tag: 'HH-TEMP-878',
    location: 'Heavy Crane & Exclusion Area',
    duration: '5h 30m',
    path: ['Gate 1 Gatehouse', 'Heavy Crane & Exclusion Area'],
    vehiclePlate: 'TITAN-1',
    vehicleType: 'Heavy Truck',
    parkingBay: 'Bay H-01',
    purpose: 'Crane Maintenance',
    idVerificationStatus: 'VERIFIED',
    idDocType: 'Heavy Equipment Cert',
    idDocNumber: 'TITAN-928',
    qrCodeRef: 'QR-FRAN-3891',
    isOverstayed: true,
    arrivalTime: Date.now() - 3600000 * 5.5,
    approvalRemarks: 'Warning: Exceeded 4-hour max safety duration constraint!'
  },
  {
    id: 'VIS-877',
    name: 'Dr. Sarah Lin',
    company: 'Geotech Soil Testing',
    host: 'marcus.vance@buildcorp.com',
    email: 'slin@geotech.io',
    phone: '+1 (555) 019-4455',
    status: 'Pending Approval',
    time: '01:30 PM (Today)',
    tag: 'Not Assigned',
    location: 'Gate 1 Gatehouse',
    duration: 'Pending Approval',
    path: [],
    vehiclePlate: 'GEO-109',
    vehicleType: 'SUV',
    parkingBay: 'Bay P-03',
    purpose: 'Basement Soil Core Samples',
    idVerificationStatus: 'PENDING',
    idDocType: 'Passport',
    idDocNumber: 'US-99218',
    qrCodeRef: 'QR-SARA-8721',
    approvalRemarks: 'Awaiting host safety verification'
  },
  {
    id: 'VIS-876',
    name: 'Jose Rodriguez',
    company: 'ReadyMix Concrete',
    host: 'elena.rostova@apexstructural.com',
    email: 'jose@readymix.com',
    phone: '+1 (555) 019-7788',
    status: 'Pre-Registered',
    time: '03:00 PM (Tomorrow)',
    tag: 'Not Assigned',
    location: 'Pre-Registered',
    duration: 'Not Checked In',
    path: [],
    vehiclePlate: 'MIX-204',
    vehicleType: 'Cement Mixer',
    parkingBay: 'Bay M-01',
    purpose: 'Foundation Concrete Pouring',
    idVerificationStatus: 'PENDING',
    idDocType: 'Commercial License',
    idDocNumber: 'CDL-2049',
    qrCodeRef: 'QR-JOSE-1102',
    approvalRemarks: 'Scheduled delivery window authorized'
  },
  {
    id: 'VIS-875',
    name: 'Victor Vance',
    company: 'Rogue Contracting Group',
    host: 'unknown',
    email: 'victor@unknown.com',
    phone: '+1 (555) 999-0000',
    status: 'Denied',
    time: 'Denied Entry Today',
    tag: 'Access Forbidden',
    location: 'Turned Away',
    duration: 'No Entry',
    path: [],
    vehiclePlate: 'BAD-303',
    vehicleType: 'SUV',
    parkingBay: 'None',
    purpose: 'Unannounced Entry Attempt',
    idVerificationStatus: 'FAILED',
    idDocType: 'None Presented',
    idDocNumber: 'N/A',
    qrCodeRef: 'None',
    approvalRemarks: 'CRITICAL SECURITY BLOCK: Match found on EHS Blacklist database!'
  }
];

export const DEFAULT_SECURITY_LIST = [
  { id: 'BLK-001', name: 'Victor Vance', company: 'Rogue Contracting Group', type: 'BLACKLIST', reason: 'Unlicensed site entry & unsafe behavior violations', addedBy: 'Marcus Vance (EHS Director)', addedDate: '2026-05-15', riskLevel: 'CRITICAL' },
  { id: 'BLK-002', name: 'Alex Mercer', company: 'Titan Concrete Services', type: 'BLACKLIST', reason: 'Repeated structural safety and PPE bypass citations', addedBy: 'Elena Rostova', addedDate: '2026-06-20', riskLevel: 'HIGH' },
  { id: 'WHT-001', name: 'Dr. Sarah Lin', company: 'Geotechnical Soil Testing', type: 'WHITELIST', reason: 'Authorized soil scientist with advanced site clearance', addedBy: 'Site Management', addedDate: '2026-04-10' },
  { id: 'WHT-002', name: 'Sven Lindqvist', company: 'City Structural Audit Dept', type: 'WHITELIST', reason: 'Senior structural auditor with city inspector authority', addedBy: 'EHS Director', addedDate: '2026-07-01' }
];

export const DEFAULT_MAINTENANCE_NODES = [
  {
    id: 'R-07',
    name: 'Gate 1 Access Turnstile Gateway',
    type: 'UHF RFID Reader',
    location: 'Gate 1 Access Turnstile (Zone A)',
    zoneId: 'zone-a',
    signal: 45,
    battery: null,
    health: 65,
    prediction: 'RF Impedance Drift - Antenna Re-alignment Required in 14 Days',
    status: 'Warning',
    lastServiceDate: '2026-06-15',
    nextServiceDue: '2026-08-20',
    temperatureC: 44.2,
    vibrationMmS: 1.8,
    technicianAssigned: 'David Vance',
    notes: 'Primary worker access turnstile node'
  },
  {
    id: 'R-12',
    name: 'Confined Shaft & Tunnel Anchor',
    type: 'BLE AoA Gateway',
    location: 'Sub-Basement Shaft B2 (Zone B)',
    zoneId: 'zone-b',
    signal: 98,
    battery: 85,
    health: 99,
    prediction: 'Nominal Operation - All Telemetry Healthy',
    status: 'Healthy',
    lastServiceDate: '2026-07-28',
    nextServiceDue: '2026-10-28',
    temperatureC: 32.5,
    vibrationMmS: 0.4,
    notes: 'Monitors tunneling crew beacon tags'
  },
  {
    id: 'R-44',
    name: 'Material Laydown & Crane Node',
    type: 'LoRaWAN Field Node',
    location: 'Laydown Yard & Crane Depot',
    zoneId: 'zone-d',
    signal: 22,
    battery: 15,
    health: 30,
    prediction: 'Battery Depletion Imminent in 3 Days',
    status: 'Critical',
    lastServiceDate: '2026-04-10',
    nextServiceDue: '2026-08-10',
    temperatureC: 51.0,
    vibrationMmS: 4.2,
    technicianAssigned: 'Elena Rostova',
    notes: 'Solar backup panel dirty, battery running low'
  },
  {
    id: 'R-01',
    name: 'Main Construction Site Gate Portal',
    type: 'High-Speed RFID Reader',
    location: 'Main Site Entrance Gate',
    zoneId: 'zone-a',
    signal: 95,
    battery: null,
    health: 98,
    prediction: 'Nominal Operation - Optical lens clean',
    status: 'Healthy',
    lastServiceDate: '2026-07-01',
    nextServiceDue: '2026-10-01',
    temperatureC: 36.8,
    vibrationMmS: 0.8,
    notes: 'High throughput main access portal'
  },
  {
    id: 'R-19',
    name: 'Scaffold Tower Alpha Gateway',
    type: 'BLE Mesh Repeater',
    location: 'Tower Alpha Floor 14',
    zoneId: 'zone-c',
    signal: 78,
    battery: 62,
    health: 84,
    prediction: 'Minor RF Noise Floor Rise - Schedule Check in 30 Days',
    status: 'Healthy',
    lastServiceDate: '2026-05-20',
    nextServiceDue: '2026-09-01',
    temperatureC: 39.1,
    vibrationMmS: 1.1,
    notes: 'High elevation wind exposure node'
  },
  {
    id: 'R-33',
    name: 'Excavation Sector AI Vision Cam',
    type: 'Edge AI Edge Processor',
    location: 'Excavation Sector Trench',
    zoneId: 'zone-e',
    signal: 88,
    battery: null,
    health: 72,
    prediction: 'Dust Accumulation on Lens Sensor - Cleaning Recommended',
    status: 'Warning',
    lastServiceDate: '2026-06-30',
    nextServiceDue: '2026-08-15',
    temperatureC: 48.5,
    vibrationMmS: 2.9,
    technicianAssigned: 'Marcus Brody',
    notes: 'Dusty environment near heavy excavation machinery'
  }
];

export const DEFAULT_WORK_ORDERS = [
  {
    id: 'WO-2026-089',
    nodeId: 'R-44',
    nodeName: 'Material Laydown & Crane Node',
    title: 'Emergency Battery & Solar Panel Servicing',
    category: 'Battery Replacement',
    priority: 'P1 - Critical',
    status: 'In Progress',
    assignedTech: 'Elena Rostova',
    createdDate: '2026-08-06',
    dueDate: '2026-08-08',
    estimatedHours: 2.5,
    description: 'Replace Li-Ion battery pack and clean solar glass cover. Test charge controller voltage.',
    partsRequired: 'Li-Ion Battery Pack 12V 20Ah, Solar Glass Wipes, Contact Cleaner'
  },
  {
    id: 'WO-2026-074',
    nodeId: 'R-07',
    nodeName: 'Gate 1 Access Turnstile Gateway',
    title: 'UHF Antenna Phase & VSWR Calibration',
    category: 'Antenna Re-alignment',
    priority: 'P2 - High',
    status: 'Open',
    assignedTech: 'David Vance',
    createdDate: '2026-08-05',
    dueDate: '2026-08-12',
    estimatedHours: 1.5,
    description: 'Re-align directional antenna panel to 45 deg angle and re-tune RF power to 28 dBm.',
    partsRequired: 'Antenna Mounting Bracket, Coaxial Jumper Cables'
  },
  {
    id: 'WO-2026-062',
    nodeId: 'R-33',
    nodeName: 'Excavation Sector AI Vision Cam',
    title: 'Optical Enclosure Cleaning & Fan Filter Swap',
    category: 'Cleaning & Calibration',
    priority: 'P3 - Medium',
    status: 'Pending Parts',
    assignedTech: 'Marcus Brody',
    createdDate: '2026-08-02',
    dueDate: '2026-08-10',
    estimatedHours: 1.0,
    description: 'Wipe camera optics dome with isopropyl solution and replace dusty intake filter mesh.',
    partsRequired: 'HEPA Micro Filter Mesh (Qty 2), Anti-static wipes'
  },
  {
    id: 'WO-2026-041',
    nodeId: 'R-01',
    nodeName: 'Main Construction Site Gate Portal',
    title: 'Quarterly Firmware & Security Patch Rollout',
    category: 'Firmware Reflash',
    priority: 'P4 - Low',
    status: 'Completed',
    assignedTech: 'David Vance',
    createdDate: '2026-07-28',
    dueDate: '2026-07-30',
    estimatedHours: 0.8,
    description: 'Applied firmware v3.8.2 patch for enhanced TLS 1.3 socket security.',
    resolutionNotes: 'Updated via remote OTA without site downtime. All test tags validated 100%.',
    completedDate: '2026-07-29'
  }
];

export const DEFAULT_TECHNICIANS = [
  { id: 'tech-1', name: 'David Vance', role: 'Senior RF & Hardware Specialist', status: 'Available', phone: '+1 (555) 234-5678', specialization: 'RFID / Antenna Tuning / Gate Portals', activeWorkOrders: 1 },
  { id: 'tech-2', name: 'Elena Rostova', role: 'Field Electronics Technician', status: 'On-site Repair', phone: '+1 (555) 876-5432', specialization: 'Batteries / Solar Power / IoT Nodes', activeWorkOrders: 1 },
  { id: 'tech-3', name: 'Marcus Brody', role: 'Vision & Systems Specialist', status: 'Available', phone: '+1 (555) 345-6789', specialization: 'AI Cameras / Optical Sensors / Network', activeWorkOrders: 1 },
  { id: 'tech-4', name: 'Aisha Patel', role: 'Telemetry & Safety Engineer', status: 'In Transit', phone: '+1 (555) 987-6543', specialization: 'Gas Sensors / BLE Anchors / Confined Space', activeWorkOrders: 0 }
];

export const DEFAULT_SCHEDULES = [
  { id: 'SCH-01', title: 'Monthly Antenna Signal Sweep & Impedance Check', targetNodeCategory: 'UHF RFID Reader', frequencyDays: 30, lastRun: '2026-07-10', nextRun: '2026-08-10', assignedTech: 'David Vance', active: true },
  { id: 'SCH-02', title: 'Quarterly Battery Health & Solar Charge Controller Inspection', targetNodeCategory: 'LoRaWAN Field Node', frequencyDays: 90, lastRun: '2026-05-15', nextRun: '2026-08-15', assignedTech: 'Elena Rostova', active: true },
  { id: 'SCH-03', title: 'Bi-Weekly AI Optical Camera Lens Cleaning', targetNodeCategory: 'Edge AI Edge Processor', frequencyDays: 14, lastRun: '2026-07-25', nextRun: '2026-08-08', assignedTech: 'Marcus Brody', active: true }
];

export const DEFAULT_ATTENDANCE_LOGS = [
  {
    id: 'att_01',
    personId: 'HH-1092',
    name: 'Marcus Vance',
    role: 'Safety Officer (EHS)',
    company: 'Aperture EHS Lead',
    department: 'Safety & EHS',
    siteZone: 'Site Office & Welfare Container',
    shift: 'Day Shift (07:00-15:30)',
    firstIn: '06:45',
    lastOut: '--:--',
    breakDurationMins: 45,
    totalHoursStr: '7h 15m',
    totalMins: 435,
    overtimeHours: 0,
    isLate: false,
    isOvertime: false,
    rfidTagId: 'HH-1092',
    geoStatus: 'IN_GEO_FENCE',
    status: 'PRESENT',
    hourlyRate: 55,
    punchType: 'RFID_AUTO',
    gateLocation: 'Gate 1 - North Gatehouse',
    date: '2026-08-17',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'att_02',
    personId: 'HH-2041',
    name: 'Elena Rostova',
    role: 'Structural Engineer',
    company: 'Apex Structural',
    department: 'Structural Engineering',
    siteZone: 'Structure & Scaffolding (L1-L4)',
    shift: 'Day Shift (07:00-15:30)',
    firstIn: '06:58',
    lastOut: '--:--',
    breakDurationMins: 45,
    totalHoursStr: '7h 02m',
    totalMins: 422,
    overtimeHours: 0,
    isLate: false,
    isOvertime: false,
    rfidTagId: 'HH-2041',
    geoStatus: 'IN_GEO_FENCE',
    status: 'PRESENT',
    hourlyRate: 50,
    punchType: 'RFID_AUTO',
    gateLocation: 'Gate 1 - North Gatehouse',
    date: '2026-08-17',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'att_03',
    personId: 'HH-3309',
    name: 'David Kim',
    role: 'General Subcontractor',
    company: 'ConcreteWorks',
    department: 'Formwork & Pouring',
    siteZone: 'Excavation & Foundation Pit',
    shift: 'Day Shift (07:00-15:30)',
    firstIn: '07:15',
    lastOut: '--:--',
    breakDurationMins: 45,
    totalHoursStr: '6h 45m',
    totalMins: 405,
    overtimeHours: 0,
    isLate: true,
    isOvertime: false,
    rfidTagId: 'HH-3309',
    geoStatus: 'BEACON_VERIFIED',
    status: 'LATE',
    hourlyRate: 40,
    punchType: 'RFID_AUTO',
    gateLocation: 'Gate 1 - South Gatehouse',
    date: '2026-08-17',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'att_04',
    personId: 'HH-5112',
    name: 'Carlos Mendez',
    role: 'Heavy Equipment Operator',
    company: 'Heavy Rigging Co',
    department: 'Crane Operations',
    siteZone: 'Heavy Crane & Exclusion Area',
    shift: 'Swing OT (15:00-23:30)',
    firstIn: '--:--',
    lastOut: '--:--',
    breakDurationMins: 45,
    totalHoursStr: '0h 00m',
    totalMins: 0,
    overtimeHours: 0,
    isLate: false,
    isOvertime: false,
    rfidTagId: 'HH-5112',
    geoStatus: 'OUT_OF_BOUNDS',
    status: 'ABSENT',
    hourlyRate: 45,
    punchType: 'RFID_AUTO',
    date: '2026-08-17',
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_LEAVE_REQUESTS = [
  {
    id: 'LV-001',
    personId: 'HH-3309',
    name: 'David Kim',
    department: 'Formwork & Pouring',
    type: 'Medical Leave',
    startDate: '2026-08-20',
    endDate: '2026-08-22',
    reason: 'Dental Surgery & Post-Op Recovery',
    status: 'APPROVED',
    approvedBy: 'Marcus Vance (EHS Director)',
    createdAt: new Date().toISOString()
  },
  {
    id: 'LV-002',
    personId: 'HH-5112',
    name: 'Carlos Mendez',
    department: 'Crane Operations',
    type: 'Safety Training',
    startDate: '2026-08-25',
    endDate: '2026-08-25',
    reason: 'Annual Advanced Tower Crane Competency Refresher',
    status: 'PENDING',
    approvedBy: 'Site Management',
    createdAt: new Date().toISOString()
  }
];

export const DEFAULT_SHIFT_SCHEDULES = [
  { id: 'SH-01', personId: 'HH-1092', name: 'Marcus Vance', department: 'Safety & EHS', shift: 'Day Shift (07:00-15:30)', overtimeAuthorized: true, maxOtHours: 4, notes: 'Direct safety audit supervision and site EHS leadership' },
  { id: 'SH-02', personId: 'HH-2041', name: 'Elena Rostova', department: 'Structural Engineering', shift: 'Day Shift (07:00-15:30)', overtimeAuthorized: true, maxOtHours: 2, notes: 'Inspect concrete pours and verify joint alignments' },
  { id: 'SH-03', personId: 'HH-3309', name: 'David Kim', department: 'Formwork & Pouring', shift: 'Day Shift (07:00-15:30)', overtimeAuthorized: false, maxOtHours: 0, notes: 'Standard concrete pouring crew shift assignment' },
  { id: 'SH-04', personId: 'HH-5112', name: 'Carlos Mendez', department: 'Crane Operations', shift: 'Swing OT (15:00-23:30)', overtimeAuthorized: true, maxOtHours: 6, notes: 'Evening crane lift ops for structural steel delivery' }
];

export const DEFAULT_ALERTS = [
  {
    id: 'alt_01',
    type: 'security',
    message: 'High Risk Hazard Alert: Unannounced entry attempted by unauthorized person matching blacklist database.',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    location: 'Gate 1 Gatehouse',
    resolved: false
  },
  {
    id: 'alt_02',
    type: 'warning',
    message: 'EHS Warning: Visitor David Chen overstayed 2-hour duration threshold in high-risk Structure Sector.',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    location: 'Structure & Scaffolding (L1-L4)',
    resolved: false
  },
  {
    id: 'alt_03',
    type: 'warning',
    message: 'Telemetry Warning: Material Laydown LoRaWAN Field Node battery low (15%). Servicing required.',
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    location: 'Laydown Yard & Crane Depot',
    resolved: false
  }
];

export const DEFAULT_INCIDENTS_ENTERPRISE = [
  {
    id: 'INC-2026-081',
    title: 'Near Miss: Crane Boom Proximity to Overhead Scaffolding During Steel Lift',
    category: 'Near Miss',
    severity: 'Critical',
    threatScore: 91,
    reportedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    locationZone: 'Heavy Crane & Exclusion Area',
    reportedBy: 'Field Safety Officer (Marcus Vance)',
    assignedOfficer: 'Marcus Vance (EHS Director)',
    workflowStatus: 'Under Investigation',
    incidentType: 'Machinery / Crane Proximity Hazard',
    oshaClassification: 'OSHA 1926.1400 Cranes & Derricks Subpart CC',
    description: 'During scheduled girder lift #4 at 10:45 AM, Potain MDT 389 top-slewing boom passed within 1.8 meters of scaffolding level 6, violating the 3.0-meter minimum exclusionary safety boundary. Slew limit warning sensor actuated.',
    equipmentInvolved: 'Potain MDT 389 Top-Slewing Tower Crane',
    hazardClass: 'High Kinetic Energy / Struck-by Exclusion',
    injuredPersonnelCount: 0,
    weatherConditions: 'Clear, 24°C, Wind: 14 knots SW',
    probableRootCause: 'Crane slew encoder micro-drift coupled with blind spot on north scaffolding perimeter.',
    correctiveActions: [
      { id: 'ca-1', actionItem: 'Recalibrate crane electronic slew limit encoders and test auto-cut relays.', assignedTo: 'Frank Reynolds (Equipment Manager)', dueDate: '2026-08-18', status: 'In Progress' },
      { id: 'ca-2', actionItem: 'Install high-visibility visual proximity beacon on Scaffolding Corner L6.', assignedTo: 'Elena Rostova (Field Safety Lead)', dueDate: '2026-08-19', status: 'Open' },
      { id: 'ca-3', actionItem: 'Conduct mandatory crane rigging safety stand-down with crane crew.', assignedTo: 'Marcus Vance (EHS Director)', dueDate: '2026-08-18', status: 'Completed', completedDate: '2026-08-17' }
    ],
    witnessStatements: [
      { id: 'ws-1', witnessName: 'Carlos Mendez', witnessRole: 'Crane Operator', company: 'Apex Rigging Ltd', recordedAt: new Date(Date.now() - 3600000 * 3).toISOString(), interviewedBy: 'Marcus Vance', statement: 'I felt the slew slowdown engage, but visual line-of-sight to the scaffold corner was slightly obstructed by the concrete pillar sun shadow. The acoustic horn sounded as expected.' }
    ],
    attachments: [
      { id: 'att-1', fileName: 'crane_boom_proximity_telemetry_log.pdf', fileType: 'Document', fileUrl: 'crane_boom_telemetry.pdf', fileSize: '1.4 MB', uploadedAt: new Date(Date.now() - 3600000 * 4).toISOString(), uploadedBy: 'EHS Inspector' },
      { id: 'att-2', fileName: 'site_cctv_frame_crane_near_miss.jpg', fileType: 'Photo', fileUrl: 'site_cctv_crane.jpg', fileSize: '2.8 MB', uploadedAt: new Date(Date.now() - 3600000 * 4).toISOString(), uploadedBy: 'Marcus Vance' }
    ],
    timeline: [
      { id: 'tm-1', timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), title: 'RFID Proximity Alarm Actuated', description: 'Sensor gateway DEV-04 detected crane boom breaching 2m buffer zone.', actor: 'System Automated Monitor' },
      { id: 'tm-2', timestamp: new Date(Date.now() - 3600000 * 4.8).toISOString(), title: 'Lift Immediately Suspended', description: 'Rigger signalled emergency stop. Load lowered securely to laydown ground.', actor: 'Carlos Mendez (Crane Op)' },
      { id: 'tm-3', timestamp: new Date(Date.now() - 3600000 * 3).toISOString(), title: 'EHS Investigation Initiated', description: 'Marcus Vance arrived at site and interviewed crew.', actor: 'Marcus Vance (EHS Director)' }
    ],
    aiAnalysis: {
      aiSummary: 'AI root cause model correlates high solar glare with encoder micro-drift as key contributing factors. Slew limiter intervention prevented physical impact.',
      probableRootCause: 'Encoder sensor drift (0.8°) combined with optical line-of-sight obstruction from tower core shadow.',
      contributingFactors: [
        'Crane slew encoder offset of 0.8 degrees requiring routine zero-point recalibration.',
        'High ambient solar glare reducing operator depth perception at 10:45 AM.',
        'Scaffold netting vibration creating acoustic sensor false-positives.'
      ],
      capaRecommendations: [
        'Deploy redundant LiDAR collision prevention sensor on crane jib tip.',
        'Enforce mandatory spotter with dual UHF radio on Scaffolding Level 6 during all girder lifts.',
        'Update BIM digital twin collision boundary to 4.0 meters.'
      ],
      severityScore: 91,
      regulatoryImpact: 'OSHA 1926 Subpart CC Review - Zero recordable injury, Near Miss documented.'
    }
  },
  {
    id: 'INC-2026-079',
    title: 'Fall Hazard: Missing Mid-Rail Guard and Incomplete Toe-Board on Scaffold L4',
    category: 'Fall from Height',
    severity: 'High',
    threatScore: 82,
    reportedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    locationZone: 'Tower Core Structure',
    reportedBy: 'Elena Rostova (Structural Engineer)',
    assignedOfficer: 'Elena Rostova (Field Safety Lead)',
    workflowStatus: 'CAPA In Progress',
    incidentType: 'Scaffolding Guardrail Deficiency',
    oshaClassification: 'OSHA 1926.451 Scaffolds General Requirements',
    description: 'During morning structural inspection of Tower Core Level 4, two sections of tubular steel scaffolding were found without intermediate mid-rails and missing yellow toe-boards above the active pedestrian walkway.',
    equipmentInvolved: 'Modular Steel Tube & Clamp Scaffolding',
    hazardClass: 'Fall Hazard / Dropped Object Danger',
    injuredPersonnelCount: 0,
    weatherConditions: 'Overcast, 21°C',
    probableRootCause: 'Subcontractor crew removed guardrails to hoist plywood sheets and failed to re-attach before shift departure.',
    correctiveActions: [
      { id: 'ca-10', actionItem: 'Install standard OSHA compliant steel mid-rails and 4-inch toe-boards.', assignedTo: 'Scaffold Crew Lead (Tariq Al-Mansoor)', dueDate: '2026-08-17', status: 'Completed', completedDate: '2026-08-17' },
      { id: 'ca-11', actionItem: 'Issue safety infraction notice and re-train formwork carpentry subcontractor.', assignedTo: 'Elena Rostova', dueDate: '2026-08-19', status: 'In Progress' }
    ],
    witnessStatements: [
      { id: 'ws-10', witnessName: 'David Kim', witnessRole: 'Formwork Lead', company: 'Metro Concrete Works', recordedAt: new Date(Date.now() - 3600000 * 20).toISOString(), interviewedBy: 'Elena Rostova', statement: 'The night shift removed the mid-rail to unload rebar bundles. We acknowledge the mistake and have corrected the safety protocol.' }
    ],
    attachments: [
      { id: 'att-10', fileName: 'scaffold_l4_midrail_inspection.jpg', fileType: 'Photo', fileUrl: 'scaffold_l4_photo.jpg', fileSize: '2.1 MB', uploadedAt: new Date(Date.now() - 3600000 * 22).toISOString(), uploadedBy: 'Elena Rostova' }
    ],
    timeline: [
      { id: 'tm-10', timestamp: new Date(Date.now() - 3600000 * 24).toISOString(), title: 'Safety Audit Walkthrough Defect Logged', description: 'Deficiency tagged with Red Scaffold Tag.', actor: 'Elena Rostova' },
      { id: 'tm-11', timestamp: new Date(Date.now() - 3600000 * 18).toISOString(), title: 'Mid-rail Replaced & Certified', description: 'Green Scaffold Tag issued after physical verification.', actor: 'Tariq Al-Mansoor' }
    ],
    aiAnalysis: {
      aiSummary: 'High potential severity mitigated by early discovery during routine pre-shift walk. System recommend RFID tags on modular scaffold gates.',
      probableRootCause: 'Procedural shortcut by night shift material hoisting team.',
      contributingFactors: ['Lack of physical lock on removable scaffold gate.', 'Inadequate handover between night and morning shifts.'],
      capaRecommendations: ['Mandate digital lockout/tagout (LOTO) for scaffold modifications.'],
      severityScore: 82,
      regulatoryImpact: 'OSHA 1926.451 Compliant after immediate corrective rectification.'
    }
  },
  {
    id: 'INC-2026-072',
    title: 'Trenching Safety: Minor Soil Sloughing on Deep Excavation West Bench',
    category: 'Trenching & Shoring',
    severity: 'High',
    threatScore: 78,
    reportedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    locationZone: 'Deep Excavation Shaft',
    reportedBy: 'Site Geotechnical Tech (David Kim)',
    assignedOfficer: 'Marcus Vance (EHS Director)',
    workflowStatus: 'Under Investigation',
    incidentType: 'Trench Wall Stability',
    oshaClassification: 'OSHA 1926.652 Requirements for Protective Systems',
    description: 'Following 35mm localized rainfall, geotechnical sensor GEOS-04 recorded 12mm ground displacement on the un-shored west bench of Deep Excavation Shaft. Trench box immediately deployed.',
    equipmentInvolved: 'Hydraulic Trench Shield Box & Shoring Struts',
    hazardClass: 'Cave-in Hazard / Soil Liquefaction',
    injuredPersonnelCount: 0,
    weatherConditions: 'Heavy Rain previous day, 18°C',
    probableRootCause: 'Surface water runoff saturation in Type B sandy-clay soil layers.',
    correctiveActions: [
      { id: 'ca-20', actionItem: 'Install surface water diversion berm and electric sump pump along west trench lip.', assignedTo: 'Lucas Sterling', dueDate: '2026-08-16', status: 'Completed', completedDate: '2026-08-16' }
    ],
    witnessStatements: [],
    attachments: [],
    timeline: [
      { id: 'tm-20', timestamp: new Date(Date.now() - 3600000 * 48).toISOString(), title: 'Soil Sensor Alarm Triggered', description: 'Displacement threshold >10mm alerted EHS control center.', actor: 'Automated IoT Sensor' }
    ],
    aiAnalysis: {
      aiSummary: 'Predictive soil saturation model accurately forecasted sloughing risk. Protective trench box prevented worker hazard.',
      probableRootCause: 'Hydrostatic pressure increase from localized heavy precipitation.',
      contributingFactors: ['Surface drainage slope directing rainwater toward west trench lip.'],
      capaRecommendations: ['Install continuous IoT hydrostatic pressure telemetry on deep excavation perimeter.'],
      severityScore: 78,
      regulatoryImpact: 'OSHA 1926.652 Protective System Standards Maintained.'
    }
  }
];

export const DEFAULT_ALERT_RULES = [
  { id: 'RULE-01', name: 'Confined Space Loitering Limit (>45m)', category: 'Safety', priority: 'Critical', condition: 'DwellTime > 45min in Confined Shaft', action: 'Trigger Siren & SMS Safety Lead', enabled: true },
  { id: 'RULE-02', name: 'Deep Excavation Max Occupancy (>12 Workers)', category: 'Safety', priority: 'High', condition: 'ZoneOccupancy > 12 in Deep Excavation Shaft', action: 'Display Warning Banner & Notify Supervisor', enabled: true },
  { id: 'RULE-03', name: 'Uncertified Entry to High Voltage Switchgear', category: 'Security', priority: 'Critical', condition: 'TagRole != Certified Electrician in High Voltage Area', action: 'Lock Turnstile & Sound Audible Beep', enabled: true },
  { id: 'RULE-04', name: 'Vehicle Speed Limit Corridor (>15 km/h)', category: 'Equipment', priority: 'Medium', condition: 'VehicleVelocity > 15 km/h in Laydown Corridor', action: 'Log Telemetry & Flash Amber Strobe', enabled: true },
  { id: 'RULE-05', name: 'Visitor Overstay in Heavy Crane Sector (>30m)', category: 'Visitor', priority: 'High', condition: 'VisitorTag in Crane Exclusion Zone > 30min', action: 'Alert Escort Officer & Security Desk', enabled: true }
];

export const DEFAULT_EMERGENCY_BROADCASTS = [
  {
    id: 'BC-2026-04',
    title: 'Site-wide High Wind Alert: Tower Crane Operations Suspended',
    message: 'Sustained wind gusts exceeded 26 knots at 120m elevation. All crane hoist operations suspended. Secure material bundles and clear exclusion zones immediately.',
    severity: 'High',
    initiatedBy: 'Marcus Vance (EHS Director)',
    initiatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: 'Active',
    acknowledgedCount: 42,
    totalTargetCount: 42,
    targetZones: ['Heavy Crane & Exclusion Area', 'Tower Core Structure', 'Laydown Yard & Crane Depot']
  },
  {
    id: 'BC-2026-03',
    title: 'Monthly Site Emergency Evacuation Drill Completed',
    message: 'Simulated fire alarm drill at Tower Core. Total evacuation time: 3m 42s. 100% workforce accounted for at Muster Point Alpha.',
    severity: 'Medium',
    initiatedBy: 'Elena Rostova (Field Safety Lead)',
    initiatedAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    status: 'Resolved',
    acknowledgedCount: 48,
    totalTargetCount: 48,
    targetZones: ['All Zones']
  }
];

export const DEFAULT_DEVICES = [
  {
    id: 'DEV-01',
    name: 'Gate 1 UHF Long-Range Portal Reader',
    category: 'rfid',
    type: 'UHF Fixed 4-Port Reader Gateway',
    location: 'Main Gate 1 North',
    zoneId: 'zone-a',
    status: 'online',
    ip: '192.168.10.101',
    mac: '00:1A:2B:3C:4D:01',
    firmware: 'v3.8.2',
    latestFirmware: 'v3.8.2',
    signalRssi: -54,
    coverageRadiusMeters: 25,
    temperatureC: 36.2,
    cpuUsagePct: 18,
    memoryUsagePct: 35,
    pingMs: 8,
    uptime: '14d 6h',
    lastPing: 'Just now',
    calibrationStatus: 'Calibrated',
    otaStatus: 'Up to Date',
    powerSource: 'PoE',
    notes: 'Main personnel turnstile portal with bi-directional RF arrays'
  },
  {
    id: 'DEV-02',
    name: 'Deep Excavation Shaft Gate Portal',
    category: 'rfid',
    type: 'UHF Fixed Hazardous Location Reader',
    location: 'Deep Excavation Shaft Entry',
    zoneId: 'Deep Excavation Shaft',
    status: 'online',
    ip: '192.168.10.102',
    mac: '00:1A:2B:3C:4D:02',
    firmware: 'v3.8.2',
    latestFirmware: 'v3.8.2',
    signalRssi: -62,
    coverageRadiusMeters: 30,
    temperatureC: 38.5,
    cpuUsagePct: 24,
    memoryUsagePct: 42,
    pingMs: 12,
    uptime: '9d 14h',
    lastPing: 'Just now',
    calibrationStatus: 'Calibrated',
    otaStatus: 'Up to Date',
    powerSource: 'AC 220V',
    notes: 'IP67 waterproof enclosure for underground excavation portal'
  },
  {
    id: 'DEV-03',
    name: 'Tower Core Structure L1 Access Portal',
    category: 'rfid',
    type: 'UHF Fixed Reader + BLE Anchor',
    location: 'Tower Core Elevator Lobby',
    zoneId: 'Tower Core Structure',
    status: 'online',
    ip: '192.168.10.103',
    mac: '00:1A:2B:3C:4D:03',
    firmware: 'v3.8.2',
    latestFirmware: 'v3.8.2',
    signalRssi: -58,
    coverageRadiusMeters: 20,
    temperatureC: 34.0,
    cpuUsagePct: 15,
    memoryUsagePct: 30,
    pingMs: 7,
    uptime: '22d 2h',
    lastPing: 'Just now',
    calibrationStatus: 'Calibrated',
    otaStatus: 'Up to Date',
    powerSource: 'PoE',
    notes: 'High throughput vertical access core'
  },
  {
    id: 'DEV-04',
    name: 'Crane Laydown & Heavy Exclusion Gateway',
    category: 'rfid',
    type: 'Autonomous Solar LoRaWAN & UHF Gateway',
    location: 'Crane Depot Laydown Area',
    zoneId: 'Heavy Crane & Exclusion Area',
    status: 'online',
    ip: '192.168.10.104',
    mac: '00:1A:2B:3C:4D:04',
    firmware: 'v3.8.2',
    latestFirmware: 'v3.8.2',
    signalRssi: -68,
    coverageRadiusMeters: 45,
    temperatureC: 41.2,
    cpuUsagePct: 29,
    memoryUsagePct: 48,
    pingMs: 15,
    uptime: '18d 11h',
    lastPing: 'Just now',
    calibrationStatus: 'Calibrated',
    otaStatus: 'Up to Date',
    powerSource: 'Solar + Battery',
    notes: 'Solar powered field gateway with 100Ah backup battery'
  },
  {
    id: 'DEV-05',
    name: 'High Voltage Switchgear BLE Mesh Repeater',
    category: 'ble',
    type: 'Intrinsically Safe BLE 5.2 Anchor',
    location: 'High Voltage Transformer Station',
    zoneId: 'High Voltage Area',
    status: 'online',
    ip: '192.168.10.105',
    mac: '00:1A:2B:3C:4D:05',
    firmware: 'v3.8.0',
    latestFirmware: 'v3.8.2',
    signalRssi: -52,
    coverageRadiusMeters: 18,
    temperatureC: 33.8,
    cpuUsagePct: 12,
    memoryUsagePct: 25,
    pingMs: 6,
    uptime: '30d 0h',
    lastPing: 'Just now',
    calibrationStatus: 'Calibrated',
    otaStatus: 'Update Available',
    powerSource: 'PoE',
    notes: 'Monitors arc-flash safety zones and electrical clearance'
  },
  {
    id: 'DEV-06',
    name: 'Tower Scaffolding Edge AI Vision Camera',
    category: 'ai_camera',
    type: 'Edge AI PPE & Fall Detection Optical Unit',
    location: 'Tower Core Scaffold Level 4',
    zoneId: 'Tower Core Structure',
    status: 'online',
    ip: '192.168.10.106',
    mac: '00:1A:2B:3C:4D:06',
    firmware: 'v4.1.0',
    latestFirmware: 'v4.1.0',
    signalRssi: -59,
    coverageRadiusMeters: 35,
    temperatureC: 43.1,
    cpuUsagePct: 62,
    memoryUsagePct: 68,
    pingMs: 11,
    uptime: '7d 4h',
    lastPing: 'Just now',
    calibrationStatus: 'Calibrated',
    otaStatus: 'Up to Date',
    powerSource: 'PoE',
    notes: 'Runs real-time YOLO hardhat, harness, and high-visibility vest AI detector'
  }
];

export const DEFAULT_AUDIT_LOGS = [
  {
    id: 'AUD-901',
    timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
    actor: 'Marcus Vance',
    actorRole: 'EHS Director',
    action: 'Safety Rule Threshold Updated',
    category: 'System Config',
    severity: 'Info',
    details: 'Adjusted Confined Space loitering threshold from 60min to 45min in accordance with summer heat protocol.',
    ipAddress: '192.168.1.45',
    hash: '8f4ad9e1c4b72183e910248ad67ef4019a2b84dc7e2213',
    status: 'Verified'
  },
  {
    id: 'AUD-902',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    actor: 'Marcus Vance',
    actorRole: 'EHS Director',
    action: 'Emergency Broadcast Triggered',
    category: 'Emergency Muster',
    severity: 'Critical',
    details: 'Broadcasted site-wide High Wind Advisory across Heavy Crane and Tower Core zones.',
    ipAddress: '192.168.1.45',
    hash: 'c2b731a490f8423e817bcde14829304728dca910293847',
    status: 'Verified'
  },
  {
    id: 'AUD-903',
    timestamp: new Date(Date.now() - 3600000 * 14).toISOString(),
    actor: 'System AI Engine',
    actorRole: 'Automated Compliance Auditor',
    action: 'ISO 45001 Monthly Compliance Report Generated',
    category: 'Data Export',
    severity: 'Info',
    details: 'Executed cryptographic verification on 1,420 worker time punches and 28 incident reports. Zero discrepancies found.',
    ipAddress: '127.0.0.1',
    hash: 'a981ef0239487123984712983471092837401928374019',
    status: 'Verified'
  },
  {
    id: 'AUD-904',
    timestamp: new Date(Date.now() - 3600000 * 28).toISOString(),
    actor: 'Gate 1 Security Lead',
    actorRole: 'Security Officer',
    action: 'Visitor Security Watchlist Updated',
    category: 'Security Claim',
    severity: 'Security Alert',
    details: 'Added unauthorized contractor entity to automated RFID turnstile access denial list.',
    ipAddress: '192.168.1.12',
    hash: '3e5188b394817293847192837410928374019283740192',
    status: 'Verified'
  }
];

export const DEFAULT_COMPLIANCE_FRAMEWORKS = [
  {
    id: 'CF-01',
    title: 'OSHA 1926 Safety & Health Regulations for Construction',
    authority: 'Occupational Safety and Health Administration (US DOL)',
    category: 'Worker Safety & Fall Protection',
    complianceScore: 97.4,
    status: 'Compliant',
    mandatoryRequirement: 'Mandatory continuous fall protection tracking, crane radius demarcation, and air monitoring.',
    lastAuditDate: '2026-08-01',
    nextAuditDue: '2026-09-01',
    assignedAuditor: 'Marcus Vance (EHS Director)',
    evidenceCount: 48,
    requirements: [
      { id: 'req-1', code: '1926.451', description: 'Scaffold mid-rails, guardrails, and toe-boards inspected daily.', status: 'Pass', lastChecked: '2026-08-17' },
      { id: 'req-2', code: '1926.1400', description: 'Crane exclusionary zones digitally geofenced with RFID sensors.', status: 'Pass', lastChecked: '2026-08-17' },
      { id: 'req-3', code: '1926.652', description: 'Trench shoring boxes and continuous soil moisture tracking active.', status: 'Pass', lastChecked: '2026-08-17' }
    ]
  },
  {
    id: 'CF-02',
    title: 'ISO 45001:2018 Occupational Health & Safety Management',
    authority: 'International Organization for Standardization',
    category: 'Enterprise EHS System',
    complianceScore: 95.8,
    status: 'Compliant',
    mandatoryRequirement: 'Documented risk assessment, CAPA lifecycle management, and tamper-evident audit logging.',
    lastAuditDate: '2026-07-15',
    nextAuditDue: '2026-10-15',
    assignedAuditor: 'Elena Rostova (Field Safety Lead)',
    evidenceCount: 62,
    requirements: [
      { id: 'req-10', code: 'Clause 6.1', description: 'AI-assisted root cause hazard identification and proactive mitigation.', status: 'Pass', lastChecked: '2026-08-17' },
      { id: 'req-11', code: 'Clause 10.2', description: 'Nonconformity and corrective action resolution tracking.', status: 'Pass', lastChecked: '2026-08-17' }
    ]
  }
];

export const DEFAULT_RETENTION_POLICIES = [
  { id: 'POL-01', dataType: 'Real-time Tag Telemetry & GPS Coordinates', retentionPeriodDays: 90, autoPurge: true, encryptionType: 'AES-256 GCM', lastPurgeDate: '2026-08-01', storageLocation: 'Encrypted Cloud Firestore' },
  { id: 'POL-02', dataType: 'Workplace Incidents & Root Cause Analysis', retentionPeriodDays: 2555, autoPurge: false, encryptionType: 'AES-256 + Immutable WORM', lastPurgeDate: 'Never (7-Year OSHA Mandatory)', storageLocation: 'Enterprise WORM Storage' },
  { id: 'POL-03', dataType: 'Worker Attendance & Time Punches', retentionPeriodDays: 1095, autoPurge: true, encryptionType: 'AES-256', lastPurgeDate: '2026-08-01', storageLocation: 'Payroll Archive Storage' },
  { id: 'POL-04', dataType: 'Visitor Access Logs & NDA Signatures', retentionPeriodDays: 365, autoPurge: true, encryptionType: 'AES-256', lastPurgeDate: '2026-08-01', storageLocation: 'Visitor Records Database' }
];

export const DEFAULT_ASSETS = [
  { id: 'AST-01', name: 'CAT 336 Hydraulic Excavator', category: 'Heavy Machinery', zoneId: 'Deep Excavation Shaft', location: 'Deep Excavation Shaft', status: 'In Use', batteryLevel: 94, assignedOperator: 'Wei Zhang', tagId: 'AST-336-CAT', lastSeen: new Date().toISOString() },
  { id: 'AST-02', name: 'Potain MDT 389 Top-Slewing Tower Crane', category: 'Lifting Equipment', zoneId: 'Heavy Crane & Exclusion Area', location: 'Heavy Crane & Exclusion Area', status: 'Operating', batteryLevel: 100, assignedOperator: 'Carlos Mendez', tagId: 'AST-CRANE-01', lastSeen: new Date().toISOString() },
  { id: 'AST-03', name: 'Cummins 250kVA Mobile Diesel Generator', category: 'Power Equipment', zoneId: 'Laydown Yard & Crane Depot', location: 'Laydown Yard & Crane Depot', status: 'Active', batteryLevel: 82, assignedOperator: 'Lucas Sterling', tagId: 'AST-GEN-250', lastSeen: new Date().toISOString() },
  { id: 'AST-04', name: 'Miller Big Blue 800X Arc Welder', category: 'Welding Unit', zoneId: 'Tower Core Structure', location: 'Tower Core Structure', status: 'Idle', batteryLevel: 88, assignedOperator: 'Priya Sharma', tagId: 'AST-WELD-04', lastSeen: new Date().toISOString() }
];

export const DEFAULT_VEHICLES = [
  { id: 'VEH-01', name: 'Mack Granite Ready-Mix Concrete Truck #4', type: 'Concrete Mixer', licensePlate: 'CON-8841', zoneId: 'Laydown Yard & Crane Depot', location: 'Laydown Yard & Crane Depot', speedKmh: 0, status: 'Unloading', driverName: 'Frank Reynolds', tagId: 'VEH-MACK-04', lastSeen: new Date().toISOString() },
  { id: 'VEH-02', name: 'CAT 950M Wheel Loader', type: 'Earthmover', licensePlate: 'CAT-9502', zoneId: 'Deep Excavation Shaft', location: 'Deep Excavation Shaft', speedKmh: 6, status: 'Moving', driverName: 'Wei Zhang', tagId: 'VEH-CAT-950', lastSeen: new Date().toISOString() },
  { id: 'VEH-03', name: 'Ford F-250 Site Safety & EHS Emergency Unit', type: 'Emergency Response', licensePlate: 'EHS-001', zoneId: 'Main Gate 1 North', location: 'Main Gate 1 North', speedKmh: 0, status: 'Standby', driverName: 'Marcus Vance', tagId: 'VEH-EHS-01', lastSeen: new Date().toISOString() }
];

/**
 * Comprehensive Seeder that populates ALL database collections with synthetic demo data
 */
export async function seedAllDemoData(force: boolean = false): Promise<{ success: boolean; seededCollections: Record<string, number> }> {
  const result: Record<string, number> = {};
  
  const seedCollection = async (colName: string, defaultData: any[]) => {
    let count = 0;
    if (mongoDb) {
      try {
        count = await mongoDb.collection(colName).countDocuments({}, { limit: 1 });
      } catch {
        count = 0;
      }
    } else {
      count = (inMemoryStore[colName] || []).length;
    }

    if (force || count === 0) {
      if (mongoDb && defaultData.length > 0) {
        try {
          const ops = defaultData.map(item => ({
            updateOne: {
              filter: { id: item.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` },
              update: { $set: item },
              upsert: true
            }
          }));
          await mongoDb.collection(colName).bulkWrite(ops, { ordered: false });
        } catch {
          for (const item of defaultData) {
            await upsertDoc(colName, item);
          }
        }
      } else {
        for (const item of defaultData) {
          await upsertDoc(colName, item);
        }
      }
      result[colName] = defaultData.length;
    } else {
      result[colName] = count;
    }
  };

  try {
    await seedCollection('zones', DEFAULT_PERMANENT_ZONES);
    await seedCollection('geofences', DEFAULT_PERMANENT_ZONES);
    await seedCollection('reader_zone_mappings', DEFAULT_READER_ZONE_MAPPINGS);
    await seedCollection('registered_people', DEFAULT_PEOPLE);
    await seedCollection('visitors', DEFAULT_VISITORS);
    await seedCollection('visitor_security_list', DEFAULT_SECURITY_LIST);
    await seedCollection('maintenance_nodes', DEFAULT_MAINTENANCE_NODES);
    await seedCollection('work_orders', DEFAULT_WORK_ORDERS);
    await seedCollection('technicians', DEFAULT_TECHNICIANS);
    await seedCollection('schedules', DEFAULT_SCHEDULES);
    await seedCollection('attendance_logs', DEFAULT_ATTENDANCE_LOGS);
    await seedCollection('leave_requests', DEFAULT_LEAVE_REQUESTS);
    await seedCollection('shift_schedules', DEFAULT_SHIFT_SCHEDULES);
    await seedCollection('alerts', DEFAULT_ALERTS);
    await seedCollection('incidents_enterprise', DEFAULT_INCIDENTS_ENTERPRISE);
    await seedCollection('alert_rules', DEFAULT_ALERT_RULES);
    await seedCollection('emergency_broadcasts', DEFAULT_EMERGENCY_BROADCASTS);
    await seedCollection('devices', DEFAULT_DEVICES);
    await seedCollection('audit_logs', DEFAULT_AUDIT_LOGS);
    await seedCollection('compliance_frameworks', DEFAULT_COMPLIANCE_FRAMEWORKS);
    await seedCollection('retention_policies', DEFAULT_RETENTION_POLICIES);
    await seedCollection('assets', DEFAULT_ASSETS);
    await seedCollection('vehicles', DEFAULT_VEHICLES);

    // Map config
    await upsertDoc('map_configurations', DEFAULT_MAP_CONFIG);

    // --- Seed Real-Time Tags from DEFAULT_PEOPLE ---
    const DEFAULT_LIVE_TAGS = DEFAULT_PEOPLE.map((p) => {
      const zoneMap: Record<string, string> = {
        'Site Office & Welfare Container': 'zone_site_office',
        'Structure & Scaffolding (L1-L4)': 'zone_tower_core',
        'Excavation & Foundation Pit': 'zone_excavation_shaft',
        'Heavy Crane & Exclusion Area': 'zone_crane_area',
        'High Voltage Area': 'zone_high_voltage',
        'Gate 1 / Main Access Gate': 'zone_gate_1',
        'Material Laydown & Loading': 'zone_material_laydown',
        'Confined Shaft & Tunneling': 'zone_confined_shaft',
      };
      const zoneId = zoneMap[p.currentZone] || 'zone_tower_core';
      return {
        id: p.hardhatTagId,
        TagID: p.hardhatTagId,
        Timestamp: new Date().toISOString(),
        Location: p.currentZone,
        LocationName: p.currentZone,
        FirstName: p.name.split(' ')[0],
        LastName: p.name.split(' ').slice(1).join(' ') || '',
        personName: p.name,
        personId: p.id,
        zoneId,
        rssi: -60 - Math.floor(Math.random() * 20),
        status: 'Active',
        aiRiskLevel: 'SAFE',
        aiRiskScore: 10 + Math.floor(Math.random() * 30),
        lastSyncAt: new Date().toISOString()
      };
    });
    await seedCollection('real_time_tags', DEFAULT_LIVE_TAGS);
    await seedCollection('live_tags', DEFAULT_LIVE_TAGS);

    // --- Seed Tag History Records ---
    const now = Date.now();
    const DEFAULT_TAG_HISTORY = DEFAULT_PEOPLE.flatMap((p, pIdx) => {
      const zones = [p.currentZone, 'Gate 1 / Main Access Gate', 'Site Office & Welfare Container'];
      return zones.map((zone, zIdx) => {
        const enterOffset = (pIdx * 3 + zIdx + 1) * 3600000;
        const enterTime = new Date(now - enterOffset);
        const leaveTime = new Date(now - enterOffset + (30 + Math.random() * 90) * 60000);
        return {
          id: `hist_${p.hardhatTagId}_${zIdx}`,
          TagID: p.hardhatTagId,
          FirstName: p.name.split(' ')[0],
          LastName: p.name.split(' ').slice(1).join(' ') || '',
          personName: p.name,
          personId: p.id,
          LocationName: zone,
          EnterTime: enterTime.toISOString(),
          EnterTimeStr: enterTime.toISOString(),
          LeaveTime: leaveTime.toISOString(),
          LeaveTimeStr: leaveTime.toISOString(),
          Duration: Math.round((leaveTime.getTime() - enterTime.getTime()) / 60000),
          createdAt: new Date().toISOString()
        };
      });
    });
    await seedCollection('tag_history', DEFAULT_TAG_HISTORY);

    // --- Seed AI Insights ---
    const DEFAULT_AI_INSIGHTS = [
      {
        id: 'ai_insight_demo_001',
        title: 'AI Analysis: Heavy Crane & Exclusion Area (HIGH)',
        category: 'Safety & Risk Alert',
        impact: 'HIGH',
        description: 'AI Alert: Restricted exclusion zone boundary crossed at Heavy Crane & Exclusion Area. Interlock verification initiated. Carlos Mendez (Tower Crane Operator) detected within active lift radius. Verify crane lift permit sign-off.',
        tagId: 'HH-5112',
        personName: 'Carlos Mendez',
        location: 'Heavy Crane & Exclusion Area',
        executiveSummary: 'Active UHF hardhat RFID personnel scans show high site compliance (94.2%) across Metro Commercial Tower. Real-time telemetry detected an unauthorized entry near the Heavy Crane Swing Exclusion Radius.',
        safetyComplianceScore: 94,
        anomalies: [
          { tagId: 'HH-5112', name: 'Carlos Mendez (Tower Crane Operator)', zone: 'Heavy Crane & Exclusion Area', severity: 'HIGH', title: 'Crane Exclusion Radius — Active Lift Proximity', description: 'Tag detected within active 25-ton lift arc without active overhead lift permit validation.' }
        ],
        riskForecasts: [
          { zone: 'Heavy Crane & Exclusion Area', riskScore: 78, trend: 'Increasing', mainFactor: 'High density during afternoon steel truss hoisting operations' },
          { zone: 'Excavation & Foundation Pit', riskScore: 42, trend: 'Decreasing', mainFactor: 'Shoring reinforcement complete with verified gas monitoring' }
        ],
        recommendations: ['Enforce badge verification at Heavy Crane Swing Radius boundary.', 'Stagger subcontractor shift changes to relieve scaffolding choke points.'],
        source: 'Heuristic Construction Safety Engine',
        timestamp: new Date(now - 3600000).toISOString(),
        createdAt: new Date(now - 3600000).toISOString()
      },
      {
        id: 'ai_insight_demo_002',
        title: 'AI Analysis: Excavation & Foundation Pit (MEDIUM)',
        category: 'Safety & Risk Alert',
        impact: 'MEDIUM',
        description: 'AI Info: Confined space entry registered in Excavation & Foundation Pit. Environmental sensors active. Automated welfare ping scheduled for David Kim.',
        tagId: 'HH-3309',
        personName: 'David Kim',
        location: 'Excavation & Foundation Pit',
        executiveSummary: 'Lone worker welfare timer active in deep excavation shaft. Gas monitoring and shoring stability telemetry remain nominal.',
        safetyComplianceScore: 88,
        anomalies: [
          { tagId: 'HH-3309', name: 'David Kim (General Subcontractor)', zone: 'Excavation & Foundation Pit', severity: 'MEDIUM', title: 'Confined Space Lone Worker Dwell', description: 'Worker stationary in deep excavation shaft for extended period. Welfare check protocol activated.' }
        ],
        riskForecasts: [
          { zone: 'Excavation & Foundation Pit', riskScore: 54, trend: 'Stable', mainFactor: 'Lone worker dwell time monitoring active' }
        ],
        recommendations: ['Verify voice-comms contact with lone worker.', 'Enforce 20-minute maximum lone worker dwell limit in confined zones.'],
        source: 'Heuristic Construction Safety Engine',
        timestamp: new Date(now - 7200000).toISOString(),
        createdAt: new Date(now - 7200000).toISOString()
      },
      {
        id: 'ai_insight_demo_003',
        title: 'AI Analysis: Site Office & Welfare Container (SAFE)',
        category: 'Operational Info',
        impact: 'SAFE',
        description: 'Normal worker tag telemetry recorded at Site Office & Welfare Container. All safety threshold indicators nominal for Marcus Vance (EHS Director).',
        tagId: 'HH-1092',
        personName: 'Marcus Vance',
        location: 'Site Office & Welfare Container',
        executiveSummary: 'All active UHF hardhat RFID scans indicate normal operations. Safety compliance score 97%. Zero active incidents across monitored zones.',
        safetyComplianceScore: 97,
        anomalies: [],
        riskForecasts: [
          { zone: 'Site Office & Welfare Container', riskScore: 8, trend: 'Stable', mainFactor: 'Normal administrative operations' }
        ],
        recommendations: ['Continue scheduled safety audits.', 'Maintain RFID reader calibration schedule.'],
        source: 'Heuristic Construction Safety Engine',
        timestamp: new Date(now - 1800000).toISOString(),
        createdAt: new Date(now - 1800000).toISOString()
      }
    ];
    await seedCollection('ai_insights', DEFAULT_AI_INSIGHTS);

    // --- Seed Incidents (separate from incidents_enterprise) ---
    const DEFAULT_INCIDENTS = [
      {
        id: 'inc_demo_001',
        title: 'Crane Exclusion Radius Entry — Unverified Permit',
        category: 'Exclusion Zone Breach',
        severity: 'High',
        status: 'Open',
        locationZone: 'Heavy Crane & Exclusion Area',
        personnelName: 'Carlos Mendez',
        tagId: 'HH-5112',
        description: 'UHF RFID hardhat tag HH-5112 detected within active crane lift radius without high-risk permit verification.',
        timestamp: new Date(now - 3600000).toISOString(),
        aiScore: 88,
        createdAt: new Date(now - 3600000).toISOString()
      }
    ];
    await seedCollection('incidents', DEFAULT_INCIDENTS);

    console.log('[DB Service] Successfully seeded all enterprise demo collections with rich synthetic data.');
    return { success: true, seededCollections: result };

  } catch (err: any) {
    console.error('[DB Service] Error during comprehensive demo seeding:', err.message);
    return { success: false, seededCollections: result };
  }
}

/**
 * Bootstraps permanent zones, map configurations, registered people, and demo data in DB.
 * Only seeds collections if they are currently empty (existing.length === 0).
 */
export async function bootstrapMapAndZoneDefinitions(): Promise<void> {
  try {
    await seedAllDemoData(false);
  } catch (err: any) {
    console.warn('[DB Service] Warning during map & zone bootstrapping:', err.message);
  }
}

/**
 * Background job runner that runs real-time tag cleanup periodically (e.g. every 15 minutes)
 */
let cleanupTimer: any = null;
export function startRealTimeTagsCleanupJob(intervalMinutes: number = 15, maxAgeMinutes: number = 60) {
  if (cleanupTimer) return;

  console.log(`[DB Service] Starting periodic real-time tags background cleanup job (Interval: ${intervalMinutes}m, MaxAge: ${maxAgeMinutes}m)`);
  
  // Run once on start
  cleanupStaleRealTimeTags(maxAgeMinutes).catch(err => console.error('[DB Service] Cleanup job initial run error:', err));

  cleanupTimer = setInterval(() => {
    cleanupStaleRealTimeTags(maxAgeMinutes).catch(err => console.error('[DB Service] Cleanup job periodic run error:', err));
  }, intervalMinutes * 60 * 1000);
}

