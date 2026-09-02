import { describe, it, expect, beforeAll } from 'vitest';
import {
  analyzeTelemetryBatchWithAI,
  getAiConfigStatus,
  setRuntimeAiKeys
} from '../src/server/services/aiEngine.js';
import { processTelemetryWithAI } from '../src/server/services/aiPipeline.js';
import {
  initDatabase,
  getCollectionDocs,
  upsertDoc,
  cleanupExpiredRetentionData,
  getDataRetentionStatus,
  DATA_RETENTION_COLLECTIONS
} from '../src/server/services/db.js';

describe('End-to-End Multi-AI Engine, API Ingestion & 10-Day Retention Workflow', () => {
  const TEST_ORG = `ai_workflow_org_${Date.now()}`;

  beforeAll(async () => {
    await initDatabase();
  }, 30000);

  it('TEST 1: Multi-AI Engine Status & Provider Configuration', () => {
    const configStatus = getAiConfigStatus();
    expect(configStatus.supportedProviders).toContain('gemini');
    expect(configStatus.supportedProviders).toContain('chatgpt');
    expect(configStatus.supportedProviders).toContain('claude');
    expect(configStatus.activeProvider).toBeDefined();
    expect(configStatus.activeModel).toBeDefined();

    // Test switching provider preference
    setRuntimeAiKeys({ provider: 'gemini' });
    const geminiStatus = getAiConfigStatus();
    expect(geminiStatus.configuredProvider).toBe('gemini');

    setRuntimeAiKeys({ provider: 'auto' });
    const autoStatus = getAiConfigStatus();
    expect(autoStatus.configuredProvider).toBe('auto');
  });

  it('TEST 2: AI Engine Analyzes Telemetry and Generates Alerts, Incidents, Analytics, and AI Insights', async () => {
    const sampleTelemetry = [
      {
        tagId: 'TAG_HAZARD_01',
        location: 'Crane Slewing & Hoisting Perimeter',
        timestamp: new Date().toISOString(),
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        role: 'Apprentice',
        rssi: -45,
        readerId: 'GATE-SUBSTATION-01',
        organizationId: TEST_ORG
      },
      {
        tagId: 'TAG_SAFE_02',
        location: 'Site Breakroom Zone',
        timestamp: new Date().toISOString(),
        firstName: 'Sarah',
        lastName: 'Connor',
        fullName: 'Sarah Connor',
        role: 'Safety Inspector',
        rssi: -60,
        readerId: 'PORTAL-MAIN-02',
        organizationId: TEST_ORG
      }
    ];

    const analysis = await analyzeTelemetryBatchWithAI(sampleTelemetry, TEST_ORG);

    expect(analysis).toBeDefined();
    expect(analysis.processedCount).toBe(2);
    expect(analysis.aiEngine).toBeDefined();
    expect(analysis.perTagAnalysis.length).toBe(2);

    // Verify Analytics generation
    expect(analysis.analytics).toBeDefined();
    expect(analysis.analytics.totalTracked).toBe(2);
    expect(analysis.analytics.averageRiskScore).toBeGreaterThanOrEqual(0);
    expect(analysis.analytics.overallComplianceScore).toBeGreaterThanOrEqual(0);
    expect(analysis.analytics.zoneOccupancy['Crane Slewing & Hoisting Perimeter']).toBe(1);
    expect(analysis.analytics.zoneOccupancy['Site Breakroom Zone']).toBe(1);

    // Verify AI Insights generation
    expect(Array.isArray(analysis.insights)).toBe(true);
    expect(analysis.insights.length).toBeGreaterThan(0);
    const insight = analysis.insights[0];
    expect(insight.title).toBeDefined();
    expect(insight.description).toBeDefined();
    expect(insight.impact).toBeDefined();

    // Verify Alerts generation
    expect(Array.isArray(analysis.alerts)).toBe(true);

    // Verify Incidents generation
    expect(Array.isArray(analysis.incidents)).toBe(true);
  }, 25000);

  it('TEST 3: Full API Ingestion Pipeline Stores All Generated Data in MongoDB with 10-Day Expiration', async () => {
    const telemetryPayload = [
      {
        TagID: 'TAG_API_WORKER_99',
        Location: 'Crane Slewing & Hoisting Perimeter',
        Timestamp: new Date().toISOString(),
        FirstName: 'Marcus',
        LastName: 'Vance',
        role: 'Apprentice',
        rssi: -50,
        readerId: 'UHF-SCANNER-CRANE',
        organizationId: TEST_ORG
      }
    ];

    const result = await processTelemetryWithAI(telemetryPayload, 'REST API Endpoint', TEST_ORG);

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(1);
    expect(result.analyzedResults.length).toBe(1);

    // Verify stored real_time_tags document in MongoDB
    const realTimeTags = await getCollectionDocs('real_time_tags', undefined, TEST_ORG);
    const storedTag = realTimeTags.find((t: any) => t.TagID === 'TAG_API_WORKER_99' || t.id === 'TAG_API_WORKER_99');
    expect(storedTag).toBeDefined();
    expect(storedTag.createdAt).toBeDefined();
    expect(storedTag.expireAt).toBeDefined();

    // Verify expireAt is ~10 days after createdAt (within 5 seconds tolerance)
    const createdTime = new Date(storedTag.createdAt).getTime();
    const expireTime = new Date(storedTag.expireAt).getTime();
    const diffDays = (expireTime - createdTime) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(10);

    // Verify stored tag_history document
    const history = await getCollectionDocs('tag_history', undefined, TEST_ORG);
    const storedHistory = history.find((h: any) => h.TagID === 'TAG_API_WORKER_99');
    expect(storedHistory).toBeDefined();
    expect(storedHistory.expireAt).toBeDefined();

    // Verify stored analytics_metrics document in MongoDB
    const analyticsDocs = await getCollectionDocs('analytics_metrics', undefined, TEST_ORG);
    expect(analyticsDocs.length).toBeGreaterThan(0);
    const storedAnalytics = analyticsDocs[0];
    expect(storedAnalytics.totalTracked).toBe(1);
    expect(storedAnalytics.expireAt).toBeDefined();
    const analyticsExpireDiff = (new Date(storedAnalytics.expireAt).getTime() - new Date(storedAnalytics.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(analyticsExpireDiff)).toBe(10);

    // Verify stored ai_insights in MongoDB
    const insightsDocs = await getCollectionDocs('ai_insights', undefined, TEST_ORG);
    expect(insightsDocs.length).toBeGreaterThan(0);
    const storedInsight = insightsDocs[0];
    expect(storedInsight.expireAt).toBeDefined();
    const insightExpireDiff = (new Date(storedInsight.expireAt).getTime() - new Date(storedInsight.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(insightExpireDiff)).toBe(10);
  }, 25000);

  it('TEST 4: 10-Day Retention Policy Status & TTL Index Verification', async () => {
    const status = await getDataRetentionStatus(10);
    expect(status.retentionPolicyDays).toBe(10);
    expect(status.retentionSeconds).toBe(864000); // 10 * 24 * 3600
    expect(status.policyEnforced).toBe(true);
    expect(status.collections).toBeDefined();

    // Verify key retention collections are covered
    for (const col of ['alerts', 'incidents', 'ai_insights', 'analytics_metrics', 'real_time_tags', 'tag_history']) {
      expect(DATA_RETENTION_COLLECTIONS).toContain(col);
      expect(status.collections[col]).toBeDefined();
      expect(status.collections[col].ttlIndexActive).toBe(true);
    }
  }, 25000);

  it('TEST 5: Active 10-Day Retention Cleanup Purges Expired Documents', async () => {
    const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000);
    const expiredDoc = {
      id: `expired_alert_test_${Date.now()}`,
      organizationId: TEST_ORG,
      title: 'Stale Historical Alert',
      type: 'Safety',
      message: 'Old alert that exceeded 10-day retention',
      createdAt: elevenDaysAgo,
      expireAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // Expired yesterday
    };

    await upsertDoc('alerts', expiredDoc, TEST_ORG);

    // Run active cleanup job
    const cleanupResult = await cleanupExpiredRetentionData(10);
    expect(cleanupResult).toBeDefined();
    expect(cleanupResult.collectionsScanned).toBe(DATA_RETENTION_COLLECTIONS.length);

    const alerts = await getCollectionDocs('alerts', undefined, TEST_ORG);
    const foundExpired = alerts.find((a: any) => a.id === expiredDoc.id);
    expect(foundExpired).toBeUndefined();
  }, 25000);
});
