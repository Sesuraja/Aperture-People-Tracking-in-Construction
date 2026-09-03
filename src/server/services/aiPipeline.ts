import { z } from 'zod';
import { upsertDoc, getCollectionDocs, getDocById } from './db.js';
import { generateEventHash, validateTelemetrySource } from './dataPolicy.js';
import {
  analyzeTelemetryBatchWithAI,
  TelemetryContextItem,
  GeneratedAlert,
  GeneratedIncident,
  GeneratedAnalytics,
  GeneratedAIInsight,
  MultiAIAnalysisResult
} from './aiEngine.js';
import { broadcastWebSocketEvent } from './websocket.js';
import { broadcastSseEvent } from './sse.js';

const recentAlertsCooldown = new Map<string, number>();
const recentTagLocationHistory = new Map<string, { location: string; timestamp: number }>();

export interface TelemetryPayload {
  TagID?: string;
  tagId?: string;
  epc?: string;
  id?: string;
  Location?: string;
  location?: string;
  LocationName?: string;
  zone?: string;
  Timestamp?: string;
  timestamp?: string;
  FirstName?: string;
  firstName?: string;
  LastName?: string;
  lastName?: string;
  rssi?: number;
  readerId?: string;
  antennaId?: number;
  [key: string]: any;
}

export interface AIAnalysisResult {
  tagId: string;
  location: string;
  timestamp: string;
  firstName: string;
  lastName: string;
  aiRiskScore: number;
  aiRiskLevel: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  aiComplianceScore: number;
  aiActivityInferred: string;
  aiAnomaly: { title: string; description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } | null;
  aiInsight: string;
}

export interface ProcessTelemetryResult {
  success: boolean;
  processedCount: number;
  analyzedResults: AIAnalysisResult[];
  alerts?: GeneratedAlert[];
  incidents?: GeneratedIncident[];
  analytics?: GeneratedAnalytics;
  insights?: GeneratedAIInsight[];
  aiEngine?: string;
  error?: string;
}

/**
 * End-to-end Multi-AI Telemetry Ingestion Pipeline:
 * Ingest from API → Analyze with Multi-AI Engine (Gemini, ChatGPT, or Claude AI)
 * → Generate Alerts, Incidents, Analytics, Insights
 * → Persist to MongoDB with 10-day retention
 * → Broadcast via WebSocket & SSE for real-time dashboard display
 */
export async function processTelemetryWithAI(
  payloads: TelemetryPayload | TelemetryPayload[],
  sourceProtocol: string = 'API Key Server',
  organizationId: string = 'default'
): Promise<ProcessTelemetryResult> {
  const sourceValidation = validateTelemetrySource(sourceProtocol);
  if (!sourceValidation.valid) {
    return { success: false, processedCount: 0, analyzedResults: [], error: sourceValidation.error };
  }

  const people = await getCollectionDocs('personnel', undefined, organizationId);
  const registeredPeople = people.length > 0 ? people : await getCollectionDocs('registered_people', undefined, organizationId);
  const items = Array.isArray(payloads) ? payloads : [payloads];

  if (items.length === 0) {
    return { success: true, processedCount: 0, analyzedResults: [] };
  }

  // 1. Normalize items into structured TelemetryContextItems
  const contextItems: TelemetryContextItem[] = [];
  for (const item of items) {
    const tagId = String(item?.TagID || item?.tagId || item?.epc || item?.EPC || item?.id || '').trim();
    if (!tagId) {
      return { success: false, processedCount: 0, analyzedResults: [], error: 'Telemetry event is missing a tag identifier.' };
    }

    const orgId = String(item.organizationId || organizationId);
    const timestamp = String(item.Timestamp || item.timestamp || item.EnterTime || new Date().toISOString());
    const location = String(item.Location || item.location || item.LocationName || item.zone || 'Site Zone 1');
    const readerId = String(item.readerId || item.ReaderID || 'READER-01');

    const matchedPerson = registeredPeople.find((person: any) =>
      [person.tagId, person.TagID, person.badgeId, person.hardhatTagId, person.id]
        .filter(Boolean)
        .some((id: string) => String(id).toLowerCase() === tagId.toLowerCase())
    ) || null;

    const firstName = String(item.FirstName || item.firstName || matchedPerson?.firstName || matchedPerson?.name?.split(' ')[0] || '');
    const lastName = String(item.LastName || item.lastName || matchedPerson?.lastName || matchedPerson?.name?.split(' ').slice(1).join(' ') || '');
    const fullName = `${firstName} ${lastName}`.trim();

    contextItems.push({
      ...item,
      tagId,
      location,
      timestamp,
      readerId,
      organizationId: orgId,
      firstName,
      lastName,
      fullName: fullName || 'Personnel',
      role: item.role || matchedPerson?.role || 'Field Personnel',
      rssi: item.rssi !== undefined ? Number(item.rssi) : -60
    });
  }

  // 2. Execute Multi-AI Engine Analysis (Gemini, ChatGPT, Claude AI, or Rule Engine)
  const analysisResult: MultiAIAnalysisResult = await analyzeTelemetryBatchWithAI(
    contextItems,
    organizationId,
    registeredPeople
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const tenDaysLater = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const analyzedResults: AIAnalysisResult[] = [];

  // 3. Persist Tag Telemetry & AI Scores to MongoDB with 10-day retention
  for (let i = 0; i < contextItems.length; i++) {
    const item = contextItems[i];
    const tagAnalysis = analysisResult.perTagAnalysis[i];
    const tagId = item.tagId;
    const orgId = item.organizationId || organizationId;
    const eventHash = String(item.externalEventId || item.eventId || generateEventHash(tagId, item.timestamp, item.location, item.readerId, orgId));

    const analysis: AIAnalysisResult = {
      tagId,
      location: item.location,
      timestamp: item.timestamp,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      aiRiskScore: tagAnalysis?.aiRiskScore ?? 0,
      aiRiskLevel: tagAnalysis?.aiRiskLevel ?? 'SAFE',
      aiComplianceScore: tagAnalysis?.aiComplianceScore ?? 100,
      aiActivityInferred: tagAnalysis?.aiActivityInferred ?? 'Active Duty',
      aiAnomaly: tagAnalysis?.aiAnomaly ?? null,
      aiInsight: tagAnalysis?.aiInsight ?? 'Normal operational status'
    };

    analyzedResults.push(analysis);

    const tagDocument = {
      id: tagId,
      organizationId: orgId,
      TagID: tagId,
      Timestamp: item.timestamp,
      Location: item.location,
      LocationName: item.location,
      FirstName: item.firstName,
      LastName: item.lastName,
      sourceProtocol,
      readerId: item.readerId,
      rssi: item.rssi,
      ...analysis,
      aiEngine: analysisResult.aiEngine,
      lastSyncAt: nowIso,
      createdAt: now,
      expireAt: tenDaysLater
    };

    await upsertDoc('real_time_tags', tagDocument, orgId);
    await upsertDoc('live_tags', tagDocument, orgId);
    // Throttle tag_history & rfid_realtime_events so continuous unchanged detection doesn't bloat MongoDB
    const lastHist = recentTagLocationHistory.get(tagId);
    const locChanged = !lastHist || lastHist.location !== item.location;
    const timeElapsed = !lastHist || (Date.now() - lastHist.timestamp > 300000); // 5 min interval

    if (locChanged || timeElapsed) {
      recentTagLocationHistory.set(tagId, { location: item.location, timestamp: Date.now() });

      await upsertDoc('rfid_realtime_events', {
        id: `evt_${tagId}_${eventHash}`,
        eventId: eventHash,
        ...tagDocument,
        receivedAt: nowIso,
        createdAt: now,
        expireAt: tenDaysLater
      }, orgId);

      await upsertDoc('tag_history', {
        id: `hist_${tagId}_${eventHash}`,
        eventId: eventHash,
        organizationId: orgId,
        TagID: tagId,
        FirstName: item.firstName,
        LastName: item.lastName,
        LocationName: item.location,
        EnterTime: item.timestamp,
        LeaveTime: item.timestamp,
        ...tagDocument,
        createdAt: now,
        expireAt: tenDaysLater
      }, orgId);
    }

    // 3b. Update registered_people & people ONLY if the person already exists in MongoDB (Do NOT auto-create fake/new workers)
    const existingPerson = (await getDocById('registered_people', tagId, orgId)) || (await getDocById('people', tagId, orgId));
    const personName = existingPerson?.name || item.personName || item.name || (item.fullName || (item.firstName ? `${item.firstName} ${item.lastName || ''}`.trim() : `Tag ${tagId}`));
    const personRole = existingPerson?.role || (item.role && item.role !== 'General Staff' ? item.role : 'Field Specialist');
    const personCompany = existingPerson?.tradeCompany || existingPerson?.company || item.company || 'Direct RFID / Ingested Data';

    if (existingPerson) {
      const updatedPersonDoc = {
        ...existingPerson,
        currentZone: item.location || existingPerson.currentZone || 'Site Perimeter',
        location: item.location || existingPerson.location || 'Site Perimeter',
        shiftStatus: existingPerson.shiftStatus || 'ON_SITE',
        presenceState: 'ACTIVE',
        lastSeen: item.timestamp || nowIso,
        updatedAt: nowIso
      };
      await upsertDoc('registered_people', updatedPersonDoc, orgId);
      await upsertDoc('people', updatedPersonDoc, orgId);
    }

    // 3c. Persist to attendance_logs (so Attendance tab displays live on-site workforce telemetry)
    const enterDate = new Date(item.timestamp || now);
    const timeStr = enterDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const attendanceDoc = {
      id: `att_${tagId}`,
      personId: tagId,
      rfidTagId: tagId,
      name: personName,
      role: personRole,
      company: personCompany,
      department: 'Operations',
      siteZone: item.location || 'Site Perimeter',
      shift: 'Day Shift (07:00-15:30)',
      firstIn: timeStr,
      lastOut: 'ACTIVE',
      breakDurationMins: 0,
      totalHoursStr: 'Active On-Site',
      totalMins: 60,
      overtimeHours: 0,
      isLate: false,
      isOvertime: false,
      geoStatus: 'IN_GEO_FENCE',
      status: 'PRESENT',
      hourlyRate: 35,
      punchType: 'RFID_AUTO',
      gateLocation: item.location || 'Main Site Access Turnstile',
      date: enterDate.toISOString().split('T')[0],
      updatedAt: nowIso,
      organizationId: orgId,
      createdAt: now,
      expireAt: tenDaysLater
    };
    await upsertDoc('attendance_logs', attendanceDoc, orgId);

    // Broadcast individual tag position to WebSocket
    broadcastWebSocketEvent('tag_update', tagDocument, orgId);
    broadcastSseEvent('tag_update', tagDocument, orgId);
  }

  // 4. Persist Generated Alerts to MongoDB & Broadcast with 3-minute Cooldown
  for (const alert of analysisResult.alerts) {
    const alertCooldownKey = `${alert.tagId || 'all'}_${alert.title || alert.type}_${alert.targetZone || 'all'}`;
    const nowMs = Date.now();
    const lastAlertTime = recentAlertsCooldown.get(alertCooldownKey) || 0;

    const alertDoc = {
      ...alert,
      id: alert.id || `alert_${alert.tagId || 'tag'}_${(alert.title || 'alert').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30)}`,
      organizationId,
      updatedAt: nowIso,
      createdAt: now,
      expireAt: tenDaysLater
    };

    // If less than 3 minutes since last alert of this type for this tag, update existing doc without spamming new WS notifications
    if (nowMs - lastAlertTime < 180000) {
      await upsertDoc('alerts', alertDoc, organizationId);
    } else {
      recentAlertsCooldown.set(alertCooldownKey, nowMs);
      await upsertDoc('alerts', alertDoc, organizationId);
      broadcastWebSocketEvent('alert_created', alertDoc, organizationId);
      broadcastSseEvent('alert_created', alertDoc, organizationId);
    }
  }

  // 5. Persist Generated Incidents to MongoDB & Broadcast
  for (const incident of analysisResult.incidents) {
    const incDoc = {
      ...incident,
      organizationId,
      createdAt: now,
      expireAt: tenDaysLater
    };
    await upsertDoc('incidents', incDoc, organizationId);

    // Also persist with normalized enterprise structure for IncidentsTab
    const enterpriseIncDoc = {
      id: incident.id,
      title: incident.title || 'Live Telemetry Incident',
      category: incident.category || 'Exclusion Zone Breach',
      severity: incident.severity || 'Medium',
      workflowStatus: incident.status === 'Closed' ? 'Closed' : 'Open',
      locationZone: incident.locationZone || 'Site Perimeter',
      reportedBy: 'GAO RFID Live AI Telemetry',
      assignedOfficer: 'Operations Duty Lead',
      assignedRole: 'Safety Lead',
      reportedAt: incident.timestamp || nowIso,
      description: incident.description || 'Live hardware telemetry incident detected from external API.',
      correctiveActions: [],
      witnessStatements: [],
      attachments: [],
      timeline: [
        {
          id: `tl_${Date.now()}`,
          timestamp: incident.timestamp || nowIso,
          title: 'Live API Telemetry Triggered',
          description: incident.description || 'Hardware scan registered threshold event.',
          actor: 'Live UHF RFID Stream'
        }
      ],
      aiAnalysis: {
        aiSummary: incident.description || 'Real-time telemetry incident processed by AI Rule Engine.',
        probableRootCause: 'Zone threshold event detected by live antenna portal.',
        contributingFactors: ['Live worker presence'],
        capaRecommendations: ['Verify zone clearance and badge status'],
        severityScore: incident.severity === 'Critical' ? 90 : incident.severity === 'High' ? 75 : 50,
        regulatoryImpact: 'Standard Safety Protocol Review'
      },
      organizationId,
      createdAt: now,
      expireAt: tenDaysLater
    };
    await upsertDoc('incidents_enterprise', enterpriseIncDoc, organizationId);

    broadcastWebSocketEvent('incident_created', incDoc, organizationId);
    broadcastSseEvent('incident_created', incDoc, organizationId);
  }

  // 6. Persist Generated AI Insights to MongoDB & Broadcast
  for (const insight of analysisResult.insights) {
    const insightDoc = {
      ...insight,
      organizationId,
      aiEngine: analysisResult.aiEngine,
      createdAt: now,
      expireAt: tenDaysLater
    };
    await upsertDoc('ai_insights', insightDoc, organizationId);
    broadcastWebSocketEvent('ai_insight_created', insightDoc, organizationId);
    broadcastSseEvent('ai_insight_created', insightDoc, organizationId);
  }

  // 7. Persist Analytics Metrics & Reports to MongoDB & Broadcast
  const analyticsDoc = {
    ...analysisResult.analytics,
    organizationId,
    createdAt: now,
    expireAt: tenDaysLater
  };
  await upsertDoc('analytics_metrics', analyticsDoc, organizationId);
  await upsertDoc('analytics_reports', analyticsDoc, organizationId);
  broadcastWebSocketEvent('analytics_updated', analyticsDoc, organizationId);
  broadcastSseEvent('analytics_updated', analyticsDoc, organizationId);

  // 8. Broadcast data update notifications for all dashboard collections
  const updatedCollections = ['real_time_tags', 'live_tags', 'registered_people', 'people', 'attendance_logs', 'alerts', 'incidents', 'ai_insights', 'analytics_metrics', 'tag_history'];
  broadcastWebSocketEvent('data_updated', { collections: updatedCollections }, organizationId);
  broadcastSseEvent('data_updated', { collections: updatedCollections }, organizationId);

  return {
    success: true,
    processedCount: analyzedResults.length,
    analyzedResults,
    alerts: analysisResult.alerts,
    incidents: analysisResult.incidents,
    analytics: analysisResult.analytics,
    insights: analysisResult.insights,
    aiEngine: analysisResult.aiEngine
  };
}
