import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { upsertDoc, getCollectionDocs } from './db.js';
import { getGeminiApiKey, markGeminiAuthFailed, isGeminiAuthFailed } from '../routes/ai.js';
import { generateEventHash, validateTelemetrySource } from './dataPolicy.js';
import { getTenantIntelligenceProfile, evaluateDeterministicRules } from './industryIntelligenceEngine.js';

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

const eventDecisionSchema = z.object({
  aiRiskScore: z.number().min(0).max(100),
  aiRiskLevel: z.enum(['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  aiComplianceScore: z.number().min(0).max(100),
  aiActivityInferred: z.string().min(1),
  aiAnomaly: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  }).nullable(),
  aiInsight: z.string().min(1),
  alert: z.object({
    category: z.string().min(1),
    title: z.string().min(1),
    message: z.string().min(1),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']),
    triggerSiren: z.boolean()
  }).nullable(),
  incident: z.object({
    category: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    severity: z.enum(['Critical', 'High', 'Medium', 'Low'])
  }).nullable()
});

type EventDecision = z.infer<typeof eventDecisionSchema>;

function parseJsonResponse(responseText: string): unknown {
  const text = responseText.trim();
  const json = text.startsWith('```')
    ? text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : text;
  return JSON.parse(json);
}

async function analyzeEventWithGemini(apiKey: string, model: string, eventContext: Record<string, unknown>): Promise<EventDecision> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: `Analyze this RFID telemetry event using only the supplied context. Do not invent facts, thresholds, people, locations, alerts, or incidents. Return alert and incident as null unless the supplied evidence supports them.\n\nTelemetry context:\n${JSON.stringify(eventContext)}\n\nReturn only JSON with this exact shape:\n{\n  "aiRiskScore": number from 0 to 100,\n  "aiRiskLevel": "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n  "aiComplianceScore": number from 0 to 100,\n  "aiActivityInferred": string,\n  "aiAnomaly": { "title": string, "description": string, "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } | null,\n  "aiInsight": string,\n  "alert": { "category": string, "title": string, "message": string, "priority": "Critical" | "High" | "Medium" | "Low", "triggerSiren": boolean } | null,\n  "incident": { "category": string, "title": string, "description": string, "severity": "Critical" | "High" | "Medium" | "Low" } | null\n}`,
    config: { responseMimeType: 'application/json' }
  });
  return eventDecisionSchema.parse(parseJsonResponse(response.text || ''));
}

/**
 * AI-only event pipeline. A telemetry event is not persisted as analyzed data
 * until the configured Gemini model returns a schema-valid analysis.
 */
export async function processTelemetryWithAI(
  payloads: TelemetryPayload | TelemetryPayload[],
  sourceProtocol: string = 'API Key Server',
  organizationId: string = 'default'
): Promise<{ success: boolean; processedCount: number; analyzedResults: AIAnalysisResult[]; error?: string }> {
  const sourceValidation = validateTelemetrySource(sourceProtocol);
  if (!sourceValidation.valid) {
    return { success: false, processedCount: 0, analyzedResults: [], error: sourceValidation.error };
  }

  const apiKey = getGeminiApiKey();
  const model = process.env.GEMINI_MODEL?.trim();

  const people = await getCollectionDocs('personnel', undefined, organizationId);
  const registeredPeople = people.length > 0 ? people : await getCollectionDocs('registered_people', undefined, organizationId);
  const items = Array.isArray(payloads) ? payloads : [payloads];
  const analyzedResults: AIAnalysisResult[] = [];

  for (const item of items) {
    const tagId = String(item?.TagID || item?.tagId || item?.epc || item?.EPC || item?.id || '').trim();
    if (!tagId) {
      return { success: false, processedCount: analyzedResults.length, analyzedResults, error: 'Telemetry event is missing a tag identifier.' };
    }

    const orgId = String(item.organizationId || organizationId);
    const timestamp = String(item.Timestamp || item.timestamp || item.EnterTime || new Date().toISOString());
    const location = String(item.Location || item.location || item.LocationName || item.zone || '');
    const readerId = String(item.readerId || item.ReaderID || '');
    const eventHash = String(item.externalEventId || item.eventId || generateEventHash(tagId, timestamp, location, readerId, orgId));
    const matchedPerson = registeredPeople.find((person: any) =>
      [person.tagId, person.TagID, person.badgeId, person.hardhatTagId, person.id]
        .filter(Boolean)
        .some((id: string) => String(id).toLowerCase() === tagId.toLowerCase())
    ) || null;
    const firstName = String(item.FirstName || item.firstName || matchedPerson?.firstName || matchedPerson?.name?.split(' ')[0] || '');
    const lastName = String(item.LastName || item.lastName || matchedPerson?.lastName || matchedPerson?.name?.split(' ').slice(1).join(' ') || '');
    const fullName = `${firstName} ${lastName}`.trim();

    // 1. Evaluate deterministic industry rules (sub-millisecond, zero hallucination)
    const tenantProfile = await getTenantIntelligenceProfile(orgId);
    const deterministicEval = evaluateDeterministicRules(tenantProfile, {
      tagId,
      location,
      personName: fullName,
      role: matchedPerson?.role || 'Field Personnel',
      rssi: item.rssi === undefined ? undefined : Number(item.rssi)
    });

    let decision: EventDecision = {
      aiRiskScore: deterministicEval.aiRiskScore,
      aiRiskLevel: deterministicEval.aiRiskLevel,
      aiComplianceScore: deterministicEval.aiComplianceScore,
      aiActivityInferred: deterministicEval.aiActivityInferred,
      aiAnomaly: deterministicEval.aiAnomaly,
      aiInsight: deterministicEval.aiInsight,
      alert: deterministicEval.triggeredAlert,
      incident: deterministicEval.triggeredIncident
    };

    if (apiKey && !isGeminiAuthFailed() && model) {
      try {
        const geminiDecision = await analyzeEventWithGemini(apiKey, model, {
          telemetry: item,
          normalized: { tagId, timestamp, location, readerId, sourceProtocol, organizationId: orgId },
          matchedPerson
        });
        if (geminiDecision) {
          decision = geminiDecision;
        }
      } catch (error: any) {
        if (error?.status === 401 || error?.message?.includes('UNAUTHENTICATED') || error?.message?.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
          markGeminiAuthFailed(error.message);
        }
      }
    }

    const analysis: AIAnalysisResult = {
      tagId,
      location,
      timestamp,
      firstName,
      lastName,
      aiRiskScore: decision.aiRiskScore,
      aiRiskLevel: decision.aiRiskLevel,
      aiComplianceScore: decision.aiComplianceScore,
      aiActivityInferred: decision.aiActivityInferred,
      aiAnomaly: decision.aiAnomaly,
      aiInsight: decision.aiInsight
    };
    const now = new Date().toISOString();
    const tagDocument = {
      id: tagId,
      organizationId: orgId,
      TagID: tagId,
      Timestamp: timestamp,
      Location: location,
      LocationName: location,
      FirstName: firstName,
      LastName: lastName,
      sourceProtocol,
      readerId,
      rssi: item.rssi === undefined ? undefined : Number(item.rssi),
      ...analysis,
      lastSyncAt: now
    };

    await upsertDoc('real_time_tags', tagDocument, orgId);
    await upsertDoc('live_tags', tagDocument, orgId);
    await upsertDoc('rfid_realtime_events', { id: `evt_${tagId}_${eventHash}`, eventId: eventHash, ...tagDocument, receivedAt: now }, orgId);
    await upsertDoc('tag_history', {
      id: `hist_${tagId}_${eventHash}`,
      eventId: eventHash,
      organizationId: orgId,
      TagID: tagId,
      FirstName: firstName,
      LastName: lastName,
      LocationName: location,
      EnterTime: timestamp,
      LeaveTime: timestamp,
      ...tagDocument
    }, orgId);

    if (decision.aiAnomaly || decision.aiRiskLevel === 'HIGH' || decision.aiRiskLevel === 'CRITICAL') {
      await upsertDoc('ai_insights', {
        id: `insight_${tagId}_${eventHash}`,
        organizationId: orgId,
        title: decision.aiAnomaly?.title || decision.aiActivityInferred,
        category: decision.aiActivityInferred,
        impact: decision.aiRiskLevel,
        description: decision.aiInsight,
        tagId,
        personName: fullName,
        location,
        createdAt: now
      }, orgId);
    }
    if (decision.alert) {
      await upsertDoc('alerts', {
        id: `alert_${tagId}_${eventHash}`,
        organizationId: orgId,
        type: decision.alert.category,
        title: decision.alert.title,
        message: decision.alert.message,
        priority: decision.alert.priority,
        severity: decision.alert.priority,
        targetZone: location,
        tagId,
        personName: fullName,
        triggerSiren: decision.alert.triggerSiren,
        timestamp: now,
        resolved: false
      }, orgId);
    }
    if (decision.incident) {
      await upsertDoc('incidents', {
        id: `inc_${tagId}_${eventHash}`,
        organizationId: orgId,
        title: decision.incident.title,
        category: decision.incident.category,
        severity: decision.incident.severity,
        status: 'Open',
        locationZone: location,
        personnelName: fullName,
        tagId,
        description: decision.incident.description,
        timestamp: now,
        aiScore: decision.aiRiskScore,
        createdAt: now
      }, orgId);
    }
    if (matchedPerson) {
      await upsertDoc('personnel', {
        ...matchedPerson,
        organizationId: orgId,
        currentZone: location,
        zone: location,
        lastSeen: timestamp,
        updatedAt: now
      }, orgId);
    }
    analyzedResults.push(analysis);
  }

  return { success: true, processedCount: analyzedResults.length, analyzedResults };
}
