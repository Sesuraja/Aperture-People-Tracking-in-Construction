import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import {
  getPeopleTrackingApiHost,
  setPeopleTrackingApiHost,
  fetchHistoryTotalCount,
  fetchHistoryRecords,
  fetchTagsInRealtime,
  syncPeopleTrackingData
} from '../src/server/services/peopleTrackingApiService.js';
import { externalPeopleTrackingRouter } from '../src/server/routes/externalPeopleTracking.js';
import { initDatabase, getCollectionDocs } from '../src/server/services/db.js';

describe('External People Tracking UHF API Integration & Multi-AI Workflow', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    await initDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/external-tracking', externalPeopleTrackingRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('TEST 1: Dynamically resolves API host without hardcoding and supports runtime reconfiguration', async () => {
    const originalHost = await getPeopleTrackingApiHost();
    expect(originalHost).toBeDefined();
    expect(originalHost.startsWith('http')).toBe(true);

    // Dynamic reconfiguration
    const tempHost = 'https://custom-tracking-gateway.aperture.io/api';
    await setPeopleTrackingApiHost(tempHost);
    expect(await getPeopleTrackingApiHost()).toBe(tempHost);

    // Restore to original
    await setPeopleTrackingApiHost(originalHost);
    expect(await getPeopleTrackingApiHost()).toBe(originalHost);
  });

  it('TEST 2: Calls live GET ${host}/api/GetHistoryTotalCount and returns total records count', async () => {
    const result = await fetchHistoryTotalCount();
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThan(0);
    console.log(`[Test] Live total history count from server: ${result.totalCount.toLocaleString()} records`);
  });

  it('TEST 3: Calls live GET ${host}/api/GetTagsInRealtime and returns array of active tags ordered by time descending', async () => {
    const tags = await fetchTagsInRealtime();
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);

    const firstTag = tags[0];
    expect(firstTag.TagID).toBeDefined();
    expect(firstTag.Location).toBeDefined();
    expect(firstTag.Timestamp).toBeDefined();

    // Verify ordering by generated time in descending order
    if (tags.length > 1) {
      const time0 = new Date(tags[0].Timestamp).getTime();
      const time1 = new Date(tags[1].Timestamp).getTime();
      expect(time0).toBeGreaterThanOrEqual(time1);
    }
    console.log(`[Test] Live real-time tags received: ${tags.length} tags in descending order (sample: ${firstTag.TagID} in ${firstTag.Location})`);
  });

  it('TEST 4: Calls live GET ${host}/api/GetHistoryRecords/{SkipCount}/{TakeCount} clamped to max 200 in descending order', async () => {
    // Test with requested 250 -> clamped to max 200 per GAO spec
    const records = await fetchHistoryRecords(0, 250);
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThanOrEqual(200);

    const firstRec = records[0];
    expect(firstRec.TagID).toBeDefined();
    expect(firstRec.LocationName).toBeDefined();
    expect(firstRec.EnterTime).toBeDefined();

    // Verify ordering by generated time (EnterTime) in descending order
    if (records.length > 1) {
      const time0 = new Date(records[0].EnterTime).getTime();
      const time1 = new Date(records[1].EnterTime).getTime();
      expect(time0).toBeGreaterThanOrEqual(time1);
    }

    console.log(`[Test] Live history records received: ${records.length} records in descending order (sample: ${firstRec.TagID} entered ${firstRec.LocationName})`);
  });

  it('TEST 5: Master sync runs through Multi-AI Engine, persists with 10-Day Retention, and updates status', async () => {
    const syncRes = await syncPeopleTrackingData({
      syncRealtime: true,
      syncHistory: true,
      historyTake: 10,
      orgId: 'test_org_i360_sync'
    });

    expect(syncRes.success).toBe(true);
    expect(syncRes.totalHistoryCount).toBeGreaterThan(0);
    expect(syncRes.realtimeTagsCount).toBeGreaterThan(0);
    expect(syncRes.aiProcessedCount).toBeGreaterThan(0);
    console.log(`[Test] Sync completed: ${syncRes.aiProcessedCount} telemetry items analyzed with AI (${syncRes.generatedAlerts} alerts, ${syncRes.generatedIncidents} incidents)`);

    // Verify 10-day retention timestamps in MongoDB
    const liveTags = await getCollectionDocs('live_tags', undefined, 'test_org_i360_sync');
    expect(liveTags.length).toBeGreaterThan(0);

    const sampleDoc = liveTags[0];
    expect(sampleDoc.createdAt).toBeDefined();
    expect(sampleDoc.expireAt).toBeDefined();

    const createdAtMs = new Date(sampleDoc.createdAt).getTime();
    const expireAtMs = new Date(sampleDoc.expireAt).getTime();
    const retentionDays = (expireAtMs - createdAtMs) / (1000 * 60 * 60 * 24);

    expect(retentionDays).toBeCloseTo(10, 0); // 10 days retention
  });

  it('TEST 6: Exposes full suite of REST API endpoints for frontend and external clients', async () => {
    // 1. Config endpoint
    const resConfig = await fetch(`${baseUrl}/api/external-tracking/config`);
    expect(resConfig.status).toBe(200);
    const bodyConfig = await resConfig.json();
    expect(bodyConfig.success).toBe(true);
    expect(bodyConfig.host).toBeDefined();

    // 2. History total count endpoint
    const resCount = await fetch(`${baseUrl}/api/external-tracking/history-total-count`);
    expect(resCount.status).toBe(200);
    const bodyCount = await resCount.json();
    expect(bodyCount.success).toBe(true);
    expect(bodyCount.totalCount).toBeGreaterThan(0);

    // 3. Tags realtime endpoint
    const resTags = await fetch(`${baseUrl}/api/external-tracking/tags-realtime`);
    expect(resTags.status).toBe(200);
    const bodyTags = await resTags.json();
    expect(bodyTags.success).toBe(true);
    expect(Array.isArray(bodyTags.tags)).toBe(true);

    // 4. History records endpoint
    const resHistory = await fetch(`${baseUrl}/api/external-tracking/history-records?skip=0&take=5`);
    expect(resHistory.status).toBe(200);
    const bodyHistory = await resHistory.json();
    expect(bodyHistory.success).toBe(true);
    expect(Array.isArray(bodyHistory.records)).toBe(true);
  });
});
