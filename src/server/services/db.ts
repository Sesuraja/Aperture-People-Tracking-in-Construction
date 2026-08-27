import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

import { MongoClient, Db, ObjectId } from 'mongodb';
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
  organizations: [],
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

import { generateEventHash, isProductionDataMode, getDataMode } from './dataPolicy.js';

export async function initDatabaseIndexes(): Promise<void> {
  if (!mongoDb) return;
  const indexSpecs = [
    { col: 'rfid_realtime_events', spec: { id: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'tag_history', spec: { id: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'real_time_tags', spec: { TagID: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'live_tags', spec: { TagID: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'hardware_readers', spec: { readerId: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'ai_insights', spec: { id: 1, organizationId: 1 }, options: { unique: true, background: true } }
  ];

  for (const { col, spec, options } of indexSpecs) {
    try {
      await mongoDb.collection(col).createIndex(spec as any, options);
    } catch (err: any) {
      console.warn(`[DB Service] Index initialization note for ${col}:`, err.message);
    }
  }
  console.log('[DB Service] MongoDB deduplication and uniqueness indexes initialized.');
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
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      retryWrites: true,
      retryReads: true
    });
    
    await mongoClient.connect();
    await mongoClient.db().admin().ping();
    mongoDb = mongoClient.db();
    runtimeMongoUri = uri;

    // Persist runtime URI to disk
    try {
      fs.writeFileSync(PERSISTENT_CONFIG_FILE, JSON.stringify({ mongodbUri: uri, updatedAt: new Date().toISOString() }), 'utf-8');
    } catch {}

    console.log(`[DB Service] Successfully connected to MongoDB Atlas database (DATA_MODE=${getDataMode()}).`);

    // Initialize database deduplication indexes (safe, non-data-creating)
    await initDatabaseIndexes();
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
  let connected = isMongoConnected();
  let collectionsCount = 0;
  let totalRecords = 0;
  let collectionsBreakdown: Record<string, number> = {};
  let lastError: string | null = null;

  if (!connected && uri) {
    try {
      await initDatabase(uri);
      connected = isMongoConnected();
    } catch (err: any) {
      lastError = err.message;
    }
  }

  if (connected && mongoDb) {
    try {
      const cols = await mongoDb.listCollections().toArray();
      collectionsCount = cols.length;
      for (const col of cols) {
        try {
          const count = await mongoDb.collection(col.name).estimatedDocumentCount();
          totalRecords += count;
          collectionsBreakdown[col.name] = count;
        } catch {
          try {
            const count = await mongoDb.collection(col.name).countDocuments();
            totalRecords += count;
            collectionsBreakdown[col.name] = count;
          } catch {}
        }
      }
    } catch (err: any) {
      lastError = err.message;
      try {
        await initDatabase(uri);
      } catch {}
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
    if (!lastError) {
      lastError = 'MongoDB is not connected (operating with in-memory fallback)';
    }
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

export async function getCollectionDocs(
  colName: string,
  opts?: { limit?: number; sort?: Record<string, 1 | -1> },
  organizationId?: string
): Promise<any[]> {
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

      const query: any = {};
      if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
        if (organizationId === 'default' || organizationId === 'demo') {
          query.$or = [
            { organizationId: 'default' },
            { organizationId: 'demo' },
            { organizationId: { $exists: false } },
            { organizationId: null },
            { organizationId: '' }
          ];
        } else {
          query.organizationId = organizationId;
        }
      }

      let cursor = mongoDb.collection(colName).find(query);
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
  const items = inMemoryStore[colName] || [];
  if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
    return items.filter((item: any) => 
      (organizationId === 'demo' || organizationId === 'default')
        ? (!item.organizationId || item.organizationId === 'demo' || item.organizationId === 'default')
        : item.organizationId === organizationId
    );
  }
  return items;
}

export async function getDocById(colName: string, id: string, organizationId?: string): Promise<any | null> {
  if (mongoDb) {
    try {
      const idStr = String(id || '').trim();
      const orClauses: any[] = [
        { id: idStr },
        { id: idStr.toUpperCase() },
        { id: idStr.toLowerCase() },
        { hardhatTagId: idStr },
        { hardhatTagId: idStr.toUpperCase() }
      ];
      if (ObjectId.isValid(idStr) && idStr.length === 24) {
        try {
          orClauses.push({ _id: new ObjectId(idStr) });
        } catch {}
      }

      let query: any = { $or: orClauses };
      if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
        if (organizationId === 'default' || organizationId === 'demo') {
          query = {
            $and: [
              { $or: orClauses },
              {
                $or: [
                  { organizationId: 'default' },
                  { organizationId: 'demo' },
                  { organizationId: { $exists: false } },
                  { organizationId: null },
                  { organizationId: '' }
                ]
              }
            ]
          };
        } else {
          query.organizationId = organizationId;
        }
      }

      const doc = await mongoDb.collection(colName).findOne(query);
      if (doc) {
        const { _id, ...rest } = doc;
        const out: any = { id: doc.id || (_id ? _id.toString() : idStr), ...rest };
        return out;
      }
      return null;
    } catch (err) {
      console.error(`[DB Service] Error fetching doc ${id} in ${colName}:`, err);
    }
  }
  const items = inMemoryStore[colName] || [];
  const idLower = String(id || '').toLowerCase().trim();
  const doc = items.find((i: any) => 
    i.id === id || 
    String(i.id || '').toLowerCase().trim() === idLower || 
    String(i.hardhatTagId || '').toLowerCase().trim() === idLower
  );
  if (!doc) return null;
  if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
    const docOrg = doc.organizationId;
    if (docOrg && docOrg !== organizationId && !(docOrg === 'default' && organizationId === 'demo') && !(docOrg === 'demo' && organizationId === 'default')) {
      return null; // IDOR protected: do not return other tenant's document
    }
  }
  return doc;
}

export async function upsertDoc(colName: string, doc: any, organizationId?: string): Promise<any> {
  if (!doc.id) {
    doc.id = `${colName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  const cleanDoc = { ...doc };
  delete (cleanDoc as any)._id;

  // Enforce organizationId on tenant-scoped collections
  if (colName === 'organizations') {
    cleanDoc.organizationId = cleanDoc.id;
  } else if (organizationId) {
    cleanDoc.organizationId = organizationId;
  }

  if (mongoDb) {
    try {
      const idStr = String(cleanDoc.id || '').trim();
      const matchFilter: any = {
        $or: [
          { id: idStr },
          { id: idStr.toUpperCase() },
          { id: idStr.toLowerCase() },
          { hardhatTagId: idStr },
          { hardhatTagId: idStr.toUpperCase() }
        ]
      };
      if (cleanDoc.organizationId && colName !== 'organizations') {
        matchFilter.organizationId = cleanDoc.organizationId;
      }

      await mongoDb.collection(colName).updateOne(
        matchFilter,
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
  const idLower = String(cleanDoc.id || '').toLowerCase().trim();
  const idx = inMemoryStore[colName].findIndex((item: any) => {
    const sameId = item.id === cleanDoc.id || String(item.id || '').toLowerCase().trim() === idLower;
    if (colName !== 'organizations' && cleanDoc.organizationId) {
      return sameId && item.organizationId === cleanDoc.organizationId;
    }
    return sameId;
  });

  if (idx >= 0) {
    inMemoryStore[colName][idx] = cleanDoc;
  } else {
    inMemoryStore[colName].push(cleanDoc);
  }
  return cleanDoc;
}

export async function deleteDocById(colName: string, id: string, organizationId?: string): Promise<boolean> {
  if (mongoDb) {
    try {
      const idStr = String(id || '').trim();
      const orClauses: any[] = [
        { id: idStr },
        { id: idStr.toLowerCase() },
        { id: idStr.toUpperCase() },
        { hardhatTagId: idStr },
        { hardhatTagId: idStr.toUpperCase() },
        { hardhatTagId: idStr.toLowerCase() }
      ];
      if (ObjectId.isValid(idStr) && idStr.length === 24) {
        try {
          orClauses.push({ _id: new ObjectId(idStr) });
        } catch {}
      }
      const filter: any = { $or: orClauses };
      if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
        filter.organizationId = organizationId;
      }
      const result = await mongoDb.collection(colName).deleteMany(filter);
      return (result.deletedCount || 0) > 0;
    } catch (err) {
      console.error(`[DB Service] Error deleting doc ${id} in ${colName}:`, err);
    }
  }

  if (inMemoryStore[colName]) {
    const initLen = inMemoryStore[colName].length;
    const idLower = String(id || '').toLowerCase().trim();
    inMemoryStore[colName] = inMemoryStore[colName].filter((item: any) => {
      const matchesId = (
        item.id === id || 
        String(item.id || '').toLowerCase().trim() === idLower || 
        String(item.hardhatTagId || '').toLowerCase().trim() === idLower
      );
      if (!matchesId) return true; // keep
      if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
        const itemOrg = item.organizationId;
        if (itemOrg && itemOrg !== organizationId) return true; // not matching org, keep (prevent IDOR delete)
      }
      return false; // delete
    });
    return inMemoryStore[colName].length < initLen;
  }
  return false;
}

export async function deleteDocsByFilter(colName: string, predicate: (doc: any) => boolean, organizationId?: string): Promise<number> {
  const docs = await getCollectionDocs(colName, undefined, organizationId);
  const toDelete = docs.filter(predicate);
  let count = 0;

  for (const doc of toDelete) {
    const deleted = await deleteDocById(colName, doc.id, organizationId);
    if (deleted) count++;
  }

  return count;
}

export async function logAuditEvent(event: {
  userId?: string;
  userEmail?: string;
  organizationId?: string;
  action: string;
  resource: string;
  details?: any;
  ip?: string;
}): Promise<void> {
  const orgId = event.organizationId || 'default';
  const auditDoc = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    userId: event.userId || 'system',
    userEmail: event.userEmail || 'system',
    organizationId: orgId,
    action: event.action,
    resource: event.resource,
    details: event.details || {},
    ip: event.ip || 'unknown'
  };

  await upsertDoc('audit_logs', auditDoc, orgId);
}

export async function getAuditLogs(limitCount = 100, organizationId?: string): Promise<any[]> {
  const logs = await getCollectionDocs('audit_logs', undefined, organizationId);
  return logs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limitCount);
}

/**
 * Normalizes multi-protocol real-time stream events (WebSocket, SSE, MQTT, Webhook)
 * to { TagID, Timestamp, Location } structure and performs bulk write to 'rfid_realtime_events' collection.
 */
export async function bulkWriteRfidRealtimeEvents(
  rawEvents: any[],
  protocol: string = 'Multi-Protocol',
  organizationId: string = 'default'
): Promise<{ insertedCount: number; modifiedCount: number; totalProcessed: number }> {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { insertedCount: 0, modifiedCount: 0, totalProcessed: 0 };
  }

  const nowIso = new Date().toISOString();
  let insertedCount = 0;
  let modifiedCount = 0;

  const normalizedDocs = rawEvents.map((raw) => {
    const tagId = String(raw.TagID || raw.tagId || raw.epc || raw.EPC || raw.id || '');
    if (!tagId) return null;
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

    const orgId = raw.organizationId || organizationId;
    const readerId = raw.readerId || raw.ReaderID || 'APERTURE-READER-01';
    const eventHash = raw.externalEventId || raw.eventId || generateEventHash(tagId, timestampMs, location, readerId, orgId);
    const docId = `evt_${tagId}_${eventHash}`;

    return {
      id: docId,
      organizationId: orgId,
      TagID: tagId,
      Timestamp: timestampMs,
      Location: location,
      FirstName: raw.FirstName || raw.firstName || 'Staff',
      LastName: raw.LastName || raw.lastName || 'Member',
      protocol: raw.protocol || protocol,
      rssi: raw.rssi !== undefined ? Number(raw.rssi) : -60,
      readerId,
      antennaPort: raw.antennaPort || raw.antennaId || 1,
      receivedAt: nowIso
    };
  }).filter(Boolean) as any[];

  if (normalizedDocs.length === 0) {
    return { insertedCount: 0, modifiedCount: 0, totalProcessed: 0 };
  }

  console.log(`[INGEST] source=${protocol} batchCount=${normalizedDocs.length} org=${organizationId}`);

  if (mongoDb) {
    try {
      const operations = normalizedDocs.map((doc) => ({
        updateOne: {
          filter: { id: doc.id, organizationId: doc.organizationId },
          update: { $set: doc },
          upsert: true
        }
      }));

      const result = await mongoDb.collection('rfid_realtime_events').bulkWrite(operations, { ordered: false });
      insertedCount = result.upsertedCount || 0;
      modifiedCount = result.modifiedCount || 0;

      // Also mirror/update real_time_tags & live_tags
      await bulkWriteRealtimeTags(normalizedDocs, organizationId);

      return { insertedCount, modifiedCount, totalProcessed: rawEvents.length };
    } catch (err: any) {
      console.error('[DB Service] Error in bulkWriteRfidRealtimeEvents to MongoDB:', err);
    }
  }

  // Fallback in-memory persistence
  for (const doc of normalizedDocs) {
    await upsertDoc('rfid_realtime_events', doc, doc.organizationId);
    await upsertDoc('real_time_tags', doc, doc.organizationId);
    await upsertDoc('live_tags', doc, doc.organizationId);
    insertedCount++;
  }

  return { insertedCount, modifiedCount: 0, totalProcessed: rawEvents.length };
}

/**
 * Bulk writes real-time tag documents into MongoDB collection 'real_time_tags'
 */
export async function bulkWriteRealtimeTags(
  tags: any[],
  organizationId: string = 'default'
): Promise<{ insertedCount: number; updatedCount: number; totalProcessed: number }> {
  if (!Array.isArray(tags) || tags.length === 0) {
    return { insertedCount: 0, updatedCount: 0, totalProcessed: 0 };
  }

  let insertedCount = 0;
  let updatedCount = 0;

  const normalizedTags = tags.map(rawTag => {
    const tagId = rawTag.TagID || rawTag.tagId || rawTag.epc || `TAG_${Date.now()}`;
    const orgId = rawTag.organizationId || organizationId;
    return {
      id: tagId,
      organizationId: orgId,
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
  });

  if (mongoDb) {
    try {
      const operations = normalizedTags.map((docToUpsert) => ({
        updateOne: {
          filter: { TagID: docToUpsert.TagID, organizationId: docToUpsert.organizationId },
          update: { $set: docToUpsert },
          upsert: true
        }
      }));

      const result = await mongoDb.collection('real_time_tags').bulkWrite(operations, { ordered: false });
      insertedCount = result.upsertedCount || 0;
      updatedCount = result.modifiedCount || 0;
      
      // Also mirror to live_tags collection
      for (const t of normalizedTags) {
        await upsertDoc('live_tags', t, t.organizationId);
      }

      return { insertedCount, updatedCount, totalProcessed: tags.length };
    } catch (err: any) {
      console.error('[DB Service] Error during bulkWriteRealtimeTags to MongoDB:', err);
    }
  }

  // Fallback for in-memory store
  for (const cleanDoc of normalizedTags) {
    await upsertDoc('real_time_tags', cleanDoc, cleanDoc.organizationId);
    await upsertDoc('live_tags', cleanDoc, cleanDoc.organizationId);
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

  return { cleanedCount, remainingCount: inMemoryStore['real_time_tags']?.length || 0 };
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


/**
 * Wipes all documents from all tracked collections in MongoDB.
 * Used to reset the database to a blank state (real data only).
 */
export async function wipeAllCollections(organizationId?: string): Promise<{ wipedCollections: Record<string, number>; totalDeleted: number }> {
  const allCollections = [
    'organizations', 'users', 'permissions', 'role_permissions',
    'registered_people', 'people',
    'devices', 'hardware_readers', 'hardware_tag_mappings', 'third_party_apis',
    'visitors', 'visitor_security_list', 'visitor_access_tokens', 'visitor_access_logs',
    'attendance_logs', 'leave_requests', 'shift_schedules',
    'alerts', 'alerts_enterprise', 'alert_rules', 'alert_dispatch_logs', 'emergency_broadcasts',
    'live_tags', 'real_time_tags', 'rfid_realtime_events', 'tag_history',
    'audit_logs', 'settings',
    'incidents_enterprise', 'incidents',
    'zones', 'map_configurations', 'geofences', 'reader_zone_mappings',
    'ai_insights', 'ai_rca_reports', 'ai_hazard_predictions', 'ai_copilot_chats',
    'assets', 'vehicles', 'cameras', 'sensors',
    'maintenance_nodes', 'work_orders', 'technicians', 'schedules',
    'compliance_frameworks', 'retention_policies', 'compliance_reports',
    'analytics_reports', 'analytics_metrics',
    'quick_notes', 'notifications', 'system_events', 'daily_reports',
    'site_configurations', 'shift_assignments', 'training_records', 'ppe_records',
  ];

  const wipedCollections: Record<string, number> = {};
  let totalDeleted = 0;

  if (mongoDb) {
    for (const colName of allCollections) {
      try {
        const filter: any = organizationId ? { organizationId } : {};
        const result = await mongoDb.collection(colName).deleteMany(filter);
        const count = result.deletedCount || 0;
        if (count > 0) {
          wipedCollections[colName] = count;
          totalDeleted += count;
        }
      } catch {
        // Collection may not exist — skip silently
      }
    }
  } else {
    // In-memory wipe
    for (const colName of allCollections) {
      if (inMemoryStore[colName]) {
        const count = inMemoryStore[colName].length;
        inMemoryStore[colName] = [];
        if (count > 0) {
          wipedCollections[colName] = count;
          totalDeleted += count;
        }
      }
    }
  }

  console.log(`[DB Service] wipeAllCollections: Deleted ${totalDeleted} documents across ${Object.keys(wipedCollections).length} collections.`);
  return { wipedCollections, totalDeleted };
}


/**
 * Bootstraps permanent zones and map configurations.
 * Does NOT seed synthetic demo data — all data must exist in MongoDB already.
 */
export async function bootstrapMapAndZoneDefinitions(): Promise<void> {
  // Seeding disabled: only show real MongoDB data.
  // Call seedAllDemoData(true) manually from admin if you want to seed empty collections.
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

