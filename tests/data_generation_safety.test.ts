import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isProductionDataMode,
  isDemoDataMode,
  getDataMode,
  validateTelemetrySource,
  generateEventHash
} from '../src/server/services/dataPolicy.js';
import {
  initDatabase,
  wipeAllCollections,
  getCollectionDocs,
  bulkWriteRfidRealtimeEvents
} from '../src/server/services/db.js';
import { processTelemetryWithAI } from '../src/server/services/aiPipeline.js';
import { ingestTelemetry } from '../src/server/services/ingestionService.js';
import { pollSingleConnection } from '../src/server/services/connectionPoller.js';

describe('Automatic Data Generation Prevention & Ingestion Safety', () => {
  const TEST_ORG = `safety_org_${Date.now()}`;

  beforeAll(async () => {
    await wipeAllCollections(TEST_ORG);
  }, 30000);

  afterAll(async () => {
    await wipeAllCollections(TEST_ORG);
  }, 30000);

  it('TEST 1: DATA_MODE defaults to production and rejects synthetic data sources', () => {
    expect(isProductionDataMode()).toBe(true);
    expect(isDemoDataMode()).toBe(false);
    expect(getDataMode()).toBe('production');

    // Test rejection of fake/synthetic/demo sources
    const demoCheck = validateTelemetrySource('demo_generator');
    expect(demoCheck.valid).toBe(false);
    expect(demoCheck.error).toContain('disabled in production mode');

    const simCheck = validateTelemetrySource('simulation_stream');
    expect(simCheck.valid).toBe(false);

    const mockCheck = validateTelemetrySource('mock_rfid_source');
    expect(mockCheck.valid).toBe(false);

    // Test acceptance of valid real sources
    const realHardware = validateTelemetrySource('rfid_hardware');
    expect(realHardware.valid).toBe(true);

    const realApi = validateTelemetrySource('api');
    expect(realApi.valid).toBe(true);

    const realMqtt = validateTelemetrySource('mqtt');
    expect(realMqtt.valid).toBe(true);
  });

  it('TEST 2: Empty collections remain empty on initialization with ZERO business records', async () => {
    const EMPTY_ORG = `test_empty_org_${Date.now()}`;
    await wipeAllCollections(EMPTY_ORG);
    await initDatabase();

    const people = await getCollectionDocs('personnel', undefined, EMPTY_ORG);
    const rfidEvents = await getCollectionDocs('rfid_realtime_events', undefined, EMPTY_ORG);
    const history = await getCollectionDocs('tag_history', undefined, EMPTY_ORG);
    const insights = await getCollectionDocs('ai_insights', undefined, EMPTY_ORG);
    const incidents = await getCollectionDocs('incidents', undefined, EMPTY_ORG);
    const liveTags = await getCollectionDocs('live_tags', undefined, EMPTY_ORG);

    expect(people.length).toBe(0);
    expect(rfidEvents.length).toBe(0);
    expect(history.length).toBe(0);
    expect(insights.length).toBe(0);
    expect(incidents.length).toBe(0);
    expect(liveTags.length).toBe(0);
  }, 25000);

  it('TEST 3: Ingestion service ignores empty payloads without creating records', async () => {
    const ORG_3 = `safety_org_t3_${Date.now()}`;
    const res1 = await ingestTelemetry([], 'RFID Reader', 'conn_01');
    expect(res1.recordsProcessed).toBe(0);

    const res2 = await ingestTelemetry(null, 'RFID Reader', 'conn_01');
    expect(res2.recordsProcessed).toBe(0);

    const events = await getCollectionDocs('rfid_realtime_events', undefined, ORG_3);
    expect(events.length).toBe(0);
  }, 25000);

  it('TEST 4: Ingestion service rejects synthetic data sources in production mode', async () => {
    const ORG_4 = `safety_org_t4_${Date.now()}`;
    const fakePayload = [{ TagID: 'FAKE_TAG_99', Location: 'Zone 1', Timestamp: '2026-08-27T10:00:00Z', organizationId: ORG_4 }];
    const result = await ingestTelemetry(fakePayload, 'demo_simulator');

    expect(result.success).toBe(false);
    expect(result.recordsProcessed).toBe(0);

    const events = await getCollectionDocs('rfid_realtime_events', undefined, ORG_4);
    expect(events.length).toBe(0);
  }, 25000);

  it('TEST 5: Single real telemetry scan creates exactly the intended records', async () => {
    const ORG_5 = `safety_org_t5_${Date.now()}`;
    const realPayload = {
      TagID: 'UHF-REAL-001',
      Location: 'Structure Work Area',
      Timestamp: '2026-08-27T10:00:00.000Z',
      FirstName: 'John',
      LastName: 'Doe',
      rssi: -55,
      readerId: 'RDR-001',
      organizationId: ORG_5
    };

    const res = await processTelemetryWithAI(realPayload, 'RFID Hardware Reader', ORG_5);
    expect(res.success).toBe(true);
    expect(res.processedCount).toBe(1);

    const liveTags = await getCollectionDocs('live_tags', undefined, ORG_5);
    const realtimeTags = await getCollectionDocs('real_time_tags', undefined, ORG_5);
    const rfidEvents = await getCollectionDocs('rfid_realtime_events', undefined, ORG_5);
    const tagHistory = await getCollectionDocs('tag_history', undefined, ORG_5);
    const aiInsights = await getCollectionDocs('ai_insights', undefined, ORG_5);

    expect(liveTags.length).toBe(1);
    expect(liveTags[0].TagID).toBe('UHF-REAL-001');
    expect(realtimeTags.length).toBe(1);
    expect(rfidEvents.length).toBe(1);
    expect(tagHistory.length).toBe(1);

    // Routine safe nominal scan should NOT generate an AI insight document
    expect(aiInsights.length).toBe(0);
  }, 25000);

  it('TEST 6: Submitting the exact same event twice deduplicates and does NOT create duplicate records', async () => {
    const ORG_6 = `safety_org_t6_${Date.now()}`;
    const identicalEvent = {
      TagID: 'UHF-REAL-002',
      Location: 'Material Storage',
      Timestamp: '2026-08-27T10:30:00.000Z',
      FirstName: 'Alice',
      LastName: 'Smith',
      rssi: -58,
      readerId: 'RDR-002',
      organizationId: ORG_6
    };

    // First ingestion
    await processTelemetryWithAI(identicalEvent, 'RFID Gateway', ORG_6);
    // Duplicate second ingestion
    await processTelemetryWithAI(identicalEvent, 'RFID Gateway', ORG_6);

    const rfidEvents = await getCollectionDocs('rfid_realtime_events', undefined, ORG_6);
    const tagHistory = await getCollectionDocs('tag_history', undefined, ORG_6);
    const liveTags = await getCollectionDocs('live_tags', undefined, ORG_6);

    expect(liveTags.length).toBe(1);
    expect(rfidEvents.length).toBe(1); // Deduplicated!
    expect(tagHistory.length).toBe(1); // Deduplicated!
  }, 25000);

  it('TEST 7: Deterministic event hash produces identical hash for identical input', () => {
    const hash1 = generateEventHash('TAG-001', '2026-08-27T12:00:00Z', 'Zone A', 'RDR-1', 'org-1');
    const hash2 = generateEventHash('TAG-001', '2026-08-27T12:00:00Z', 'Zone A', 'RDR-1', 'org-1');
    const hash3 = generateEventHash('TAG-001', '2026-08-27T12:00:01Z', 'Zone A', 'RDR-1', 'org-1');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('TEST 8: Connection poller failure does not create synthetic fallback records', async () => {
    const ORG_8 = `safety_org_t8_${Date.now()}`;
    const failingConfig = {
      id: 'failing_api_conn',
      name: 'Non Existent Sensor API',
      endpointUrl: 'http://localhost:59999/non-existent-api',
      method: 'GET' as const,
      authType: 'none' as const,
      enabled: true,
      pollingEnabled: true
    };

    await pollSingleConnection(failingConfig);

    const rfidEvents = await getCollectionDocs('rfid_realtime_events', undefined, ORG_8);
    const liveTags = await getCollectionDocs('live_tags', undefined, ORG_8);
    const tagHistory = await getCollectionDocs('tag_history', undefined, ORG_8);

    expect(rfidEvents.length).toBe(0);
    expect(liveTags.length).toBe(0);
    expect(tagHistory.length).toBe(0);
  }, 25000);

  it('TEST 9: Bulk real-time stream ingestion deduplicates identical payloads', async () => {
    const ORG_9 = `safety_org_t9_${Date.now()}`;
    const rawBatch = [
      { TagID: 'BATCH-001', Location: 'Assembly Point', timestamp: '2026-08-27T11:00:00.000Z', organizationId: ORG_9 },
      { TagID: 'BATCH-002', Location: 'Site Office', timestamp: '2026-08-27T11:00:00.000Z', organizationId: ORG_9 }
    ];

    // First bulk write
    const res1 = await bulkWriteRfidRealtimeEvents(rawBatch, 'WebSocket Stream', ORG_9);
    expect(res1.insertedCount).toBe(2);

    // Second identical bulk write
    const res2 = await bulkWriteRfidRealtimeEvents(rawBatch, 'WebSocket Stream', ORG_9);
    
    const allEvents = await getCollectionDocs('rfid_realtime_events', undefined, ORG_9);
    expect(allEvents.length).toBe(2); // Still exactly 2 events, no duplication!
  }, 25000);
});
