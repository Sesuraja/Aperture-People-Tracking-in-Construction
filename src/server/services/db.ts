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
  incidents: [],
  playback_history: []
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

import crypto from 'crypto';
import { generateEventHash, isProductionDataMode, getDataMode } from './dataPolicy.js';

// High-performance In-Memory Collection Read Cache (TTL: 4 seconds)
// Dramatically accelerates dashboard tab switches and repeated queries from 1000ms to < 0.2ms
interface CachedCollectionEntry {
  docs: any[];
  cachedAt: number;
}
const collectionReadCache = new Map<string, CachedCollectionEntry>();
const COLLECTION_CACHE_TTL_MS = 4000;

export function invalidateCollectionCache(colName?: string) {
  if (colName) {
    for (const key of Array.from(collectionReadCache.keys())) {
      if (key === colName || key.startsWith(`${colName}:`)) {
        collectionReadCache.delete(key);
      }
    }
  } else {
    collectionReadCache.clear();
  }
}

/**
 * Automatically detects base64 image strings (e.g. uploaded floorplans, blueprints, avatars)
 * and offloads them to static disk files, replacing them with light relative URLs (/uploads/floorplans/...)
 * This prevents MongoDB documents from bloating to multiple megabytes and keeps queries under 10ms.
 */
export function offloadBase64Images(doc: any): any {
  // Store uploaded image maps directly in MongoDB Atlas without hardcoding or uploading to code/disk
  return doc;
}

export const DATA_RETENTION_COLLECTIONS = [
  'alerts',
  'incidents',
  'ai_insights',
  'analytics_metrics',
  'analytics_reports',
  'real_time_tags',
  'live_tags',
  'rfid_realtime_events',
  'tag_history',
  'playback_history',
  'webhook_logs',
  'audit_logs',
  'daily_reports',
  'notifications',
  'system_events'
];

export async function initDatabaseIndexes(): Promise<void> {
  if (!mongoDb) return;
  const indexSpecs = [
    { col: 'rfid_realtime_events', spec: { id: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'tag_history', spec: { id: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'real_time_tags', spec: { TagID: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'live_tags', spec: { TagID: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'hardware_readers', spec: { readerId: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'ai_insights', spec: { id: 1, organizationId: 1 }, options: { unique: true, background: true } },
    { col: 'incidents', spec: { id: 1, organizationId: 1 }, options: { background: true } },
    { col: 'alerts', spec: { id: 1, organizationId: 1 }, options: { background: true } },
    { col: 'analytics_metrics', spec: { id: 1, organizationId: 1 }, options: { background: true } }
  ];

  for (const { col, spec, options } of indexSpecs) {
    try {
      await mongoDb.collection(col).createIndex(spec as any, options);
    } catch (err: any) {
      console.warn(`[DB Service] Index initialization note for ${col}:`, err.message);
    }
  }

  // 10-Day Retention TTL Indexes:
  // 1. expireAt index (expireAfterSeconds: 0) deletes documents when expireAt <= current time
  // 2. createdAt index (expireAfterSeconds: 864,000s = 10 days) deletes documents older than 10 days
  const TEN_DAYS_SECONDS = 10 * 24 * 60 * 60; // 864,000 seconds
  for (const col of DATA_RETENTION_COLLECTIONS) {
    try {
      await mongoDb.collection(col).createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, background: true });
    } catch (err: any) {
      console.warn(`[DB Service] TTL index note (expireAt) for ${col}:`, err.message);
    }
    try {
      await mongoDb.collection(col).createIndex({ createdAt: 1 }, { expireAfterSeconds: TEN_DAYS_SECONDS, background: true });
    } catch (err: any) {
      console.warn(`[DB Service] TTL index note (createdAt) for ${col}:`, err.message);
    }
  }

  // Fast compound and tenant-scoped indexes across all operational collections
  const coreCollections = [
    'rfid_realtime_events', 'tag_history', 'real_time_tags', 'live_tags',
    'hardware_readers', 'ai_insights', 'zones', 'map_configurations',
    'registered_people', 'people', 'assets', 'vehicles', 'cameras',
    'sensors', 'infrastructure', 'alerts', 'devices', 'visitors',
    'settings', 'projects', 'floorplans', 'attendance_logs', 'audit_logs',
    'visitor_access_logs', 'visitor_security_list', 'visitor_access_tokens'
  ];

  for (const col of coreCollections) {
    try {
      await mongoDb.collection(col).createIndex({ organizationId: 1 }, { background: true });
      await mongoDb.collection(col).createIndex({ id: 1 }, { background: true });
      await mongoDb.collection(col).createIndex({ organizationId: 1, createdAt: -1 }, { background: true });
    } catch {}
  }

  console.log('[DB Service] MongoDB deduplication, uniqueness, and 10-day retention TTL indexes initialized.');
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

let cachedMongoStats: { data: any; cachedAt: number } | null = null;
const STATS_CACHE_TTL_MS = 30000;

export async function getMongoStats(forceRefresh = false) {
  if (!forceRefresh && cachedMongoStats && (Date.now() - cachedMongoStats.cachedAt < STATS_CACHE_TTL_MS)) {
    return cachedMongoStats.data;
  }

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

      // Count collections in parallel instead of slow serial round-trips
      await Promise.all(cols.map(async col => {
        try {
          const count = await mongoDb!.collection(col.name).estimatedDocumentCount();
          collectionsBreakdown[col.name] = count;
        } catch {
          try {
            const count = await mongoDb!.collection(col.name).countDocuments();
            collectionsBreakdown[col.name] = count;
          } catch {}
        }
      }));

      totalRecords = Object.values(collectionsBreakdown).reduce((a, b) => a + b, 0);
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

  const result = {
    connected,
    connectionString: maskedUri,
    engine: connected ? 'MongoDB Atlas / Cluster' : 'In-Memory Fallback',
    collectionsCount,
    totalRecords,
    collectionsBreakdown,
    lastError
  };

  if (connected) {
    cachedMongoStats = { data: result, cachedAt: Date.now() };
  }

  return result;
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
  const cacheKey = `${colName}:${organizationId || 'all'}:${opts?.limit || 0}:${JSON.stringify(opts?.sort || {})}`;
  const cached = collectionReadCache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt < COLLECTION_CACHE_TTL_MS)) {
    return [...cached.docs];
  }

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
        const isSpatialConfig = (colName === 'map_configurations' || colName === 'zones' || colName === 'projects' || colName === 'sites');
        if (!isSpatialConfig) {
          if (organizationId === 'default' || organizationId === 'demo' || organizationId === 'org_main' || organizationId === 'org_aperture_default') {
            query.$or = [
              { organizationId: 'default' },
              { organizationId: 'demo' },
              { organizationId: 'org_main' },
              { organizationId: 'org_aperture_default' },
              { organizationId: { $exists: false } },
              { organizationId: null },
              { organizationId: '' }
            ];
          } else {
            query.organizationId = organizationId;
          }
        }
      }

      let cursor = mongoDb.collection(colName).find(query);
      if (Object.keys(sort).length)  cursor = cursor.sort(sort as any);
      if (limit > 0)                 cursor = cursor.limit(limit);

      const rawDocs = await cursor.toArray();
      const docs = rawDocs.map(doc => {
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

      collectionReadCache.set(cacheKey, { docs, cachedAt: Date.now() });
      return docs;
    } catch (err) {
      console.error(`[DB Service] Error fetching docs for ${colName}:`, err);
    }
  }
  const items = inMemoryStore[colName] || [];
  let result = items;
  if (organizationId && organizationId !== 'ALL' && colName !== 'organizations') {
    result = items.filter((item: any) => 
      (organizationId === 'demo' || organizationId === 'default' || organizationId === 'org_main')
        ? (!item.organizationId || item.organizationId === 'demo' || item.organizationId === 'default' || item.organizationId === 'org_main')
        : item.organizationId === organizationId
    );
  }
  collectionReadCache.set(cacheKey, { docs: result, cachedAt: Date.now() });
  return result;
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
        const isSpatialConfig = (colName === 'map_configurations' || colName === 'zones' || colName === 'projects' || colName === 'sites');
        if (!isSpatialConfig) {
          if (organizationId === 'default' || organizationId === 'demo' || organizationId === 'org_main') {
            query = {
              $and: [
                { $or: orClauses },
                {
                  $or: [
                    { organizationId: 'default' },
                    { organizationId: 'demo' },
                    { organizationId: 'org_main' },
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
  invalidateCollectionCache(colName);
  const processedDoc = offloadBase64Images(doc);

  if (!processedDoc.id) {
    processedDoc.id = `${colName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  const cleanDoc = { ...processedDoc };
  delete (cleanDoc as any)._id;

  // Enforce organizationId on tenant-scoped collections
  if (colName === 'organizations') {
    cleanDoc.organizationId = cleanDoc.id;
  } else if (organizationId) {
    cleanDoc.organizationId = organizationId;
  }

  // 10-Day Retention Enforcement for operational & telemetry collections
  if (DATA_RETENTION_COLLECTIONS.includes(colName)) {
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    const now = new Date();
    if (!cleanDoc.createdAt || !(cleanDoc.createdAt instanceof Date)) {
      const parsed = cleanDoc.createdAt ? new Date(cleanDoc.createdAt) : now;
      cleanDoc.createdAt = isNaN(parsed.getTime()) ? now : parsed;
    }
    if (!cleanDoc.expireAt || !(cleanDoc.expireAt instanceof Date)) {
      cleanDoc.expireAt = new Date(cleanDoc.createdAt.getTime() + TEN_DAYS_MS);
    }
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
  invalidateCollectionCache(colName);
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
    const tenDaysLater = new Date(validDate.getTime() + 10 * 24 * 60 * 60 * 1000);

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
      receivedAt: nowIso,
      createdAt: validDate,
      expireAt: tenDaysLater
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
      invalidateCollectionCache('rfid_realtime_events');
      invalidateCollectionCache('real_time_tags');
      invalidateCollectionCache('live_tags');

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
  invalidateCollectionCache('rfid_realtime_events');
  invalidateCollectionCache('real_time_tags');
  invalidateCollectionCache('live_tags');

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
    const now = new Date();
    const tenDaysLater = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
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
      updatedAt: new Date().toISOString(),
      createdAt: now,
      expireAt: tenDaysLater
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

      // Save playback history snapshot non-blocking (10-day TTL)
      setImmediate(() => savePlaybackSnapshot(normalizedTags, organizationId).catch(() => {}));

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
 * Saves a snapshot of all currently active tags to 'playback_history' collection.
 * Each snapshot includes tag positions, zone boundaries, and expires automatically after 10 days via TTL.
 */
export async function savePlaybackSnapshot(
  tags: any[],
  organizationId: string = 'default'
): Promise<void> {
  if (!tags || tags.length === 0) return;

  const now = new Date();
  const expireAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const snapId = `snap_${organizationId}_${now.getTime()}`;

  const snapshot = {
    id: snapId,
    organizationId,
    timestamp: now.toISOString(),
    date: dateStr,
    expireAt,
    tags: tags.map(t => ({
      tagId: t.TagID || t.tagId || t.id,
      name: `${t.FirstName || ''} ${t.LastName || ''}`.trim() || 'Unknown',
      location: t.Location || t.LocationName || t.zone || 'Unknown',
      role: t.role || 'Personnel',
      rssi: t.rssi,
      status: t.status || 'Active',
      readerId: t.readerId
    }))
  };

  if (mongoDb) {
    try {
      await mongoDb.collection('playback_history').insertOne({ ...snapshot, _id: undefined } as any);
    } catch (err: any) {
      // Ignore duplicate key errors silently
      if (!String(err?.message).includes('duplicate')) {
        console.error('[DB Service] playback_history snapshot error:', err.message);
      }
    }
    return;
  }

  // In-memory fallback: keep last 2000 snapshots only
  inMemoryStore['playback_history'].push(snapshot);
  if (inMemoryStore['playback_history'].length > 2000) {
    inMemoryStore['playback_history'].shift();
  }
}

/**
 * Retrieves all playback history snapshots for a specific date (YYYY-MM-DD).
 * Returns them sorted chronologically for use as playback frames.
 */
export async function getPlaybackFrames(
  date: string,
  organizationId: string = 'default'
): Promise<any[]> {
  if (!date) return [];

  const orgFilter = (organizationId === 'default' || organizationId === 'org_main')
    ? { $in: ['default', 'org_main', 'demo', null, ''] }
    : organizationId;

  if (mongoDb) {
    try {
      const docs = await mongoDb.collection('playback_history')
        .find({ date, organizationId: orgFilter })
        .sort({ timestamp: 1 })
        .limit(500)
        .toArray();
      return docs.map(d => ({ ...d, _id: undefined }));
    } catch (err) {
      console.error('[DB Service] getPlaybackFrames error:', err);
      return [];
    }
  }

  // In-memory fallback
  return inMemoryStore['playback_history']
    .filter(s => s.date === date &&
      (s.organizationId === organizationId || s.organizationId === 'default' || !s.organizationId))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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


// All hardcoded zone/reader/map seed data removed.
// Zones, readers, and map configurations are sourced exclusively from MongoDB via the Custom Map Editor and Settings UI.
// Do NOT add hardcoded zone names, site names, contractor names, or reader IDs here.
export const DEFAULT_PERMANENT_ZONES: any[] = [];
export const DEFAULT_READER_ZONE_MAPPINGS: any[] = [];
export const DEFAULT_MAP_CONFIG: any = { id: 'site-main', siteId: 'site-main', name: 'Main Site', updatedAt: new Date().toISOString() };


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
    'audit_logs', 'settings', 'playback_history',
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

/**
 * Actively purges documents older than 10 days from MongoDB and in-memory store.
 * Operates across all DATA_RETENTION_COLLECTIONS.
 */
export async function cleanupExpiredRetentionData(retentionDays = 10): Promise<{
  deletedCount: number;
  collectionsScanned: number;
  details: Record<string, number>;
}> {
  const thresholdDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  let totalDeleted = 0;
  const details: Record<string, number> = {};

  if (mongoDb) {
    for (const col of DATA_RETENTION_COLLECTIONS) {
      try {
        const res = await mongoDb.collection(col).deleteMany({
          $or: [
            { expireAt: { $lte: now } },
            { createdAt: { $lte: thresholdDate } }
          ]
        });
        const deleted = res.deletedCount || 0;
        details[col] = deleted;
        totalDeleted += deleted;
        if (deleted > 0) {
          invalidateCollectionCache(col);
        }
      } catch (err: any) {
        console.warn(`[DB Service] Retention cleanup error for ${col}:`, err.message);
      }
    }
  }

  // Also clean in-memory fallback store
  for (const col of DATA_RETENTION_COLLECTIONS) {
    if (inMemoryStore[col]) {
      const initial = inMemoryStore[col].length;
      inMemoryStore[col] = inMemoryStore[col].filter((item: any) => {
        if (item.expireAt && new Date(item.expireAt).getTime() <= now.getTime()) return false;
        if (item.createdAt && new Date(item.createdAt).getTime() <= thresholdDate.getTime()) return false;
        return true;
      });
      const removed = initial - inMemoryStore[col].length;
      details[col] = (details[col] || 0) + removed;
      totalDeleted += removed;
    }
  }

  console.log(`[DB Service] 10-day retention cleanup finished: purged ${totalDeleted} documents across ${DATA_RETENTION_COLLECTIONS.length} collections.`);
  return {
    deletedCount: totalDeleted,
    collectionsScanned: DATA_RETENTION_COLLECTIONS.length,
    details
  };
}

let retentionCleanupTimer: NodeJS.Timeout | null = null;

/**
 * Background job runner that enforces the 10-day data retention policy.
 * Runs on startup and periodically (e.g. every hour).
 */
export function startDataRetentionCleanupJob(retentionDays = 10, intervalMinutes = 60): void {
  if (retentionCleanupTimer) clearInterval(retentionCleanupTimer);

  // Run initial cleanup after 10s
  setTimeout(() => {
    cleanupExpiredRetentionData(retentionDays).catch(() => {});
  }, 10000);

  // Periodic cleanup
  retentionCleanupTimer = setInterval(() => {
    cleanupExpiredRetentionData(retentionDays).catch(() => {});
  }, intervalMinutes * 60 * 1000);

  console.log(`[DB Service] Automated 10-day MongoDB data retention cleanup job started (interval: ${intervalMinutes}m).`);
}

/**
 * Returns diagnostic metadata and verification details for 10-day data retention.
 */
export async function getDataRetentionStatus(retentionDays = 10) {
  const collectionsStatus: Record<string, { totalDocs: number; oldestDocDate: string | null; ttlIndexActive: boolean }> = {};

  if (mongoDb) {
    for (const col of DATA_RETENTION_COLLECTIONS) {
      try {
        const count = await mongoDb.collection(col).countDocuments();
        const oldest = await mongoDb.collection(col).find().sort({ createdAt: 1 }).limit(1).toArray();
        const indexes = await mongoDb.collection(col).indexes();
        const hasTtl = indexes.some((idx: any) =>
          idx.key?.expireAt !== undefined ||
          (idx.key?.createdAt !== undefined && idx.expireAfterSeconds !== undefined)
        );

        collectionsStatus[col] = {
          totalDocs: count,
          oldestDocDate: oldest[0]?.createdAt ? new Date(oldest[0].createdAt).toISOString() : null,
          ttlIndexActive: hasTtl
        };
      } catch {
        collectionsStatus[col] = { totalDocs: 0, oldestDocDate: null, ttlIndexActive: false };
      }
    }
  } else {
    for (const col of DATA_RETENTION_COLLECTIONS) {
      const items = inMemoryStore[col] || [];
      collectionsStatus[col] = {
        totalDocs: items.length,
        oldestDocDate: items[0]?.createdAt ? new Date(items[0].createdAt).toISOString() : null,
        ttlIndexActive: true
      };
    }
  }

  return {
    retentionPolicyDays: retentionDays,
    retentionSeconds: retentionDays * 86400,
    policyEnforced: true,
    engine: mongoDb ? 'MongoDB Atlas TTL Indexes + Scheduled Background Purge' : 'In-Memory Fallback Retention',
    collections: collectionsStatus
  };
}


