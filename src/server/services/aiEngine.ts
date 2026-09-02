import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { getTenantIntelligenceProfile, evaluateDeterministicRules } from './industryIntelligenceEngine.js';

export type AIProviderName = 'gemini' | 'chatgpt' | 'openai' | 'claude' | 'anthropic' | 'auto';

export interface TelemetryContextItem {
  tagId: string;
  location: string;
  timestamp: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: string;
  rssi?: number;
  readerId?: string;
  organizationId?: string;
  [key: string]: any;
}

export interface GeneratedAlert {
  id?: string;
  type: string;
  title: string;
  message: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  targetZone: string;
  tagId: string;
  personName: string;
  triggerSiren: boolean;
  timestamp?: string;
  resolved: boolean;
}

export interface GeneratedIncident {
  id?: string;
  title: string;
  category: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Investigating' | 'Resolved';
  locationZone: string;
  personnelName: string;
  tagId: string;
  description: string;
  timestamp?: string;
  aiScore: number;
}

export interface GeneratedAnalytics {
  id?: string;
  timestamp: string;
  totalTracked: number;
  averageRiskScore: number;
  overallComplianceScore: number;
  zoneOccupancy: Record<string, number>;
  activityBreakdown: Record<string, number>;
  anomalyCount: number;
  criticalAlertsCount: number;
  highRiskCount: number;
  aiEngineUsed: string;
  summary: string;
}

export interface GeneratedAIInsight {
  id?: string;
  title: string;
  category: string;
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  tagId?: string;
  personName?: string;
  location?: string;
  actionableRecommendation?: string;
  timestamp?: string;
}

export interface MultiAIAnalysisResult {
  aiEngine: string;
  model: string;
  processedCount: number;
  perTagAnalysis: {
    tagId: string;
    location: string;
    timestamp: string;
    personName: string;
    aiRiskScore: number;
    aiRiskLevel: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    aiComplianceScore: number;
    aiActivityInferred: string;
    aiInsight: string;
    aiAnomaly: { title: string; description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } | null;
  }[];
  alerts: GeneratedAlert[];
  incidents: GeneratedIncident[];
  analytics: GeneratedAnalytics;
  insights: GeneratedAIInsight[];
}

const aiEngineDecisionSchema = z.object({
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

// Runtime provider configuration
let configuredProvider: AIProviderName = 'auto';
let runtimeOpenAiKey: string | null = null;
let runtimeClaudeKey: string | null = null;
let runtimeGeminiKey: string | null = null;

export function setRuntimeAiKeys(keys: {
  provider?: AIProviderName;
  geminiKey?: string;
  openAiKey?: string;
  claudeKey?: string;
}) {
  if (keys.provider) configuredProvider = keys.provider;
  if (keys.geminiKey !== undefined) runtimeGeminiKey = keys.geminiKey?.trim() || null;
  if (keys.openAiKey !== undefined) runtimeOpenAiKey = keys.openAiKey?.trim() || null;
  if (keys.claudeKey !== undefined) runtimeClaudeKey = keys.claudeKey?.trim() || null;
}

export function getAiConfigStatus() {
  const geminiKey = runtimeGeminiKey || process.env.GEMINI_API_KEY || '';
  const openAiKey = runtimeOpenAiKey || process.env.OPENAI_API_KEY || '';
  const claudeKey = runtimeClaudeKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';

  const active = resolveActiveProvider();

  return {
    configuredProvider,
    activeProvider: active.provider,
    activeModel: active.model,
    hasGeminiKey: Boolean(geminiKey && geminiKey.trim()),
    hasOpenAiKey: Boolean(openAiKey && openAiKey.trim()),
    hasClaudeKey: Boolean(claudeKey && claudeKey.trim()),
    supportedProviders: ['gemini', 'chatgpt', 'claude']
  };
}

export function resolveActiveProvider(): { provider: 'gemini' | 'chatgpt' | 'claude' | 'deterministic'; model: string } {
  const geminiKey = runtimeGeminiKey || process.env.GEMINI_API_KEY || '';
  const openAiKey = runtimeOpenAiKey || process.env.OPENAI_API_KEY || '';
  const claudeKey = runtimeClaudeKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';

  const requested = (configuredProvider || process.env.AI_PROVIDER || 'auto').toLowerCase().trim();

  if ((requested === 'chatgpt' || requested === 'openai') && openAiKey) {
    return { provider: 'chatgpt', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
  }
  if ((requested === 'claude' || requested === 'anthropic') && claudeKey) {
    return { provider: 'claude', model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022' };
  }
  if (requested === 'gemini' && geminiKey) {
    return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' };
  }

  // Auto-selection based on available keys
  if (geminiKey) {
    return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' };
  }
  if (openAiKey) {
    return { provider: 'chatgpt', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
  }
  if (claudeKey) {
    return { provider: 'claude', model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022' };
  }

  return { provider: 'deterministic', model: 'industry-rule-engine-v2' };
}

function parseCleanJsonResponse(text: string): any {
  const cleaned = text.trim();
  const jsonStr = cleaned.startsWith('```')
    ? cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    : cleaned;
  return JSON.parse(jsonStr);
}

/**
 * Call Gemini AI Model
 */
async function callGeminiEngine(apiKey: string, model: string, context: any): Promise<z.infer<typeof aiEngineDecisionSchema>> {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are an industrial safety & personnel telemetry AI analyzer. Analyze this worker telemetry event using only the supplied context. Do not invent facts. Return alert and incident as null unless the evidence supports them.

Telemetry Context:
${JSON.stringify(context, null, 2)}

Return strictly valid JSON with this exact schema:
{
  "aiRiskScore": number between 0 and 100,
  "aiRiskLevel": "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "aiComplianceScore": number between 0 and 100,
  "aiActivityInferred": string,
  "aiAnomaly": { "title": string, "description": string, "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } | null,
  "aiInsight": string,
  "alert": { "category": string, "title": string, "message": string, "priority": "Critical" | "High" | "Medium" | "Low", "triggerSiren": boolean } | null,
  "incident": { "category": string, "title": string, "description": string, "severity": "Critical" | "High" | "Medium" | "Low" } | null
}`;

  const candidateModels = [model, 'gemini-2.5-flash', 'gemini-1.5-flash'].filter((v, i, a) => a.indexOf(v) === i);
  let lastError: any = null;

  for (const m of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const parsed = parseCleanJsonResponse(response.text || '');
      return aiEngineDecisionSchema.parse(parsed);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini candidate models failed');
}

/**
 * Call OpenAI ChatGPT Model
 */
async function callChatGptEngine(apiKey: string, model: string, context: any): Promise<z.infer<typeof aiEngineDecisionSchema>> {
  const prompt = `You are an industrial safety & personnel telemetry AI analyzer. Analyze this worker telemetry event using only the supplied context. Do not invent facts. Return alert and incident as null unless the evidence supports them.

Telemetry Context:
${JSON.stringify(context, null, 2)}

Return strictly valid JSON matching this schema:
{
  "aiRiskScore": number (0-100),
  "aiRiskLevel": "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "aiComplianceScore": number (0-100),
  "aiActivityInferred": string,
  "aiAnomaly": { "title": string, "description": string, "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } | null,
  "aiInsight": string,
  "alert": { "category": string, "title": string, "message": string, "priority": "Critical" | "High" | "Medium" | "Low", "triggerSiren": boolean } | null,
  "incident": { "category": string, "title": string, "description": string, "severity": "Critical" | "High" | "Medium" | "Low" } | null
}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an advanced industrial RFID and IoT telemetry AI safety engine. Always return JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const parsed = parseCleanJsonResponse(content);
  return aiEngineDecisionSchema.parse(parsed);
}

/**
 * Call Anthropic Claude AI Model
 */
async function callClaudeEngine(apiKey: string, model: string, context: any): Promise<z.infer<typeof aiEngineDecisionSchema>> {
  const prompt = `You are an industrial safety & personnel telemetry AI analyzer. Analyze this worker telemetry event using only the supplied context. Do not invent facts. Return alert and incident as null unless the evidence supports them.

Telemetry Context:
${JSON.stringify(context, null, 2)}

Return strictly a valid JSON object matching this schema:
{
  "aiRiskScore": number (0-100),
  "aiRiskLevel": "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "aiComplianceScore": number (0-100),
  "aiActivityInferred": string,
  "aiAnomaly": { "title": string, "description": string, "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } | null,
  "aiInsight": string,
  "alert": { "category": string, "title": string, "message": string, "priority": "Critical" | "High" | "Medium" | "Low", "triggerSiren": boolean } | null,
  "incident": { "category": string, "title": string, "description": string, "severity": "Critical" | "High" | "Medium" | "Low" } | null
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic Claude API error ${res.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const parsed = parseCleanJsonResponse(text);
  return aiEngineDecisionSchema.parse(parsed);
}

/**
 * Unified AI Engine Execution for a single telemetry event
 */
export async function analyzeTelemetryItemWithAI(
  item: TelemetryContextItem,
  orgId: string = 'default',
  registeredPeople: any[] = []
): Promise<{
  decision: z.infer<typeof aiEngineDecisionSchema>;
  aiEngineUsed: string;
  modelUsed: string;
  fullName: string;
  matchedPerson: any;
}> {
  const tagId = item.tagId;
  const matchedPerson = registeredPeople.find((person: any) =>
    [person.tagId, person.TagID, person.badgeId, person.hardhatTagId, person.id]
      .filter(Boolean)
      .some((id: string) => String(id).toLowerCase() === tagId.toLowerCase())
  ) || null;

  const firstName = item.firstName || matchedPerson?.firstName || matchedPerson?.name?.split(' ')[0] || '';
  const lastName = item.lastName || matchedPerson?.lastName || matchedPerson?.name?.split(' ').slice(1).join(' ') || '';
  const fullName = item.fullName || `${firstName} ${lastName}`.trim() || 'Field Personnel';

  // 1. Initial baseline from Deterministic Rule Engine
  const tenantProfile = await getTenantIntelligenceProfile(orgId);
  const deterministicEval = evaluateDeterministicRules(tenantProfile, {
    tagId,
    location: item.location,
    personName: fullName,
    role: item.role || matchedPerson?.role || 'Field Personnel',
    rssi: item.rssi
  });

  let decision: z.infer<typeof aiEngineDecisionSchema> = {
    aiRiskScore: deterministicEval.aiRiskScore,
    aiRiskLevel: deterministicEval.aiRiskLevel,
    aiComplianceScore: deterministicEval.aiComplianceScore,
    aiActivityInferred: deterministicEval.aiActivityInferred,
    aiAnomaly: deterministicEval.aiAnomaly,
    aiInsight: deterministicEval.aiInsight,
    alert: deterministicEval.triggeredAlert,
    incident: deterministicEval.triggeredIncident
  };

  const active = resolveActiveProvider();
  let aiEngineUsed = active.provider;
  let modelUsed = active.model;

  const eventContext = {
    telemetry: item,
    matchedPerson: matchedPerson ? {
      name: fullName,
      role: matchedPerson.role,
      department: matchedPerson.department,
      certifications: matchedPerson.certifications
    } : null,
    zone: item.location,
    readerId: item.readerId,
    industryContext: {
      industry: tenantProfile.industry,
      siteLabel: tenantProfile.terminology.siteLabel
    }
  };

  try {
    if (active.provider === 'gemini') {
      const apiKey = runtimeGeminiKey || process.env.GEMINI_API_KEY || '';
      if (apiKey) {
        decision = await callGeminiEngine(apiKey, active.model, eventContext);
      }
    } else if (active.provider === 'chatgpt') {
      const apiKey = runtimeOpenAiKey || process.env.OPENAI_API_KEY || '';
      if (apiKey) {
        decision = await callChatGptEngine(apiKey, active.model, eventContext);
      }
    } else if (active.provider === 'claude') {
      const apiKey = runtimeClaudeKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
      if (apiKey) {
        decision = await callClaudeEngine(apiKey, active.model, eventContext);
      }
    }
  } catch (err: any) {
    console.warn(`[AI Engine] ${active.provider} generation fallback to deterministic engine:`, err.message);
    aiEngineUsed = 'deterministic (fallback)';
    modelUsed = 'industry-rule-engine-v2';
  }

  return { decision, aiEngineUsed, modelUsed, fullName, matchedPerson };
}

/**
 * Batch Analysis of Telemetry Data:
 * Generates:
 * 1. Alerts
 * 2. Incidents
 * 3. Analytics (aggregate KPIs, zone distribution, compliance)
 * 4. AI Insights
 */
export async function analyzeTelemetryBatchWithAI(
  items: TelemetryContextItem[],
  orgId: string = 'default',
  registeredPeople: any[] = []
): Promise<MultiAIAnalysisResult> {
  const active = resolveActiveProvider();
  const perTagAnalysis: MultiAIAnalysisResult['perTagAnalysis'] = [];
  const alerts: GeneratedAlert[] = [];
  const incidents: GeneratedIncident[] = [];
  const insights: GeneratedAIInsight[] = [];

  const zoneOccupancy: Record<string, number> = {};
  const activityBreakdown: Record<string, number> = {};
  let totalRiskScore = 0;
  let totalComplianceScore = 0;
  let highRiskCount = 0;
  let anomalyCount = 0;
  let primaryEngineUsed = active.provider;
  let primaryModelUsed = active.model;
  const tenantProfile = await getTenantIntelligenceProfile(orgId);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    let decision: z.infer<typeof aiEngineDecisionSchema>;
    let aiEngineUsed = primaryEngineUsed;
    let modelUsed = primaryModelUsed;
    let fullName = item.fullName || 'Personnel';

    // Deep AI analysis for first 3 items or any zone with potential hazards; deterministic engine for remainder
    if (idx < 3 || (item.location && /hazard|danger|crane|confined|trench|perimeter|restricted/i.test(item.location))) {
      const itemRes = await analyzeTelemetryItemWithAI(item, orgId, registeredPeople);
      decision = itemRes.decision;
      aiEngineUsed = itemRes.aiEngineUsed;
      modelUsed = itemRes.modelUsed;
      fullName = itemRes.fullName;
      primaryEngineUsed = aiEngineUsed;
      primaryModelUsed = modelUsed;
    } else {
      const deterministicEval = evaluateDeterministicRules(tenantProfile, {
        tagId: item.tagId,
        location: item.location,
        personName: fullName,
        role: item.role || 'Field Personnel',
        rssi: item.rssi
      });
      decision = {
        aiRiskScore: deterministicEval.aiRiskScore,
        aiRiskLevel: deterministicEval.aiRiskLevel,
        aiComplianceScore: deterministicEval.aiComplianceScore,
        aiActivityInferred: deterministicEval.aiActivityInferred,
        aiAnomaly: deterministicEval.aiAnomaly,
        aiInsight: deterministicEval.aiInsight,
        alert: deterministicEval.triggeredAlert,
        incident: deterministicEval.triggeredIncident
      };
    }

    const loc = item.location || 'General Site';
    zoneOccupancy[loc] = (zoneOccupancy[loc] || 0) + 1;

    const activity = decision.aiActivityInferred || 'Active Duty';
    activityBreakdown[activity] = (activityBreakdown[activity] || 0) + 1;

    totalRiskScore += decision.aiRiskScore;
    totalComplianceScore += decision.aiComplianceScore;

    if (decision.aiRiskLevel === 'HIGH' || decision.aiRiskLevel === 'CRITICAL') {
      highRiskCount++;
    }
    if (decision.aiAnomaly) {
      anomalyCount++;
    }

    perTagAnalysis.push({
      tagId: item.tagId,
      location: item.location,
      timestamp: item.timestamp,
      personName: fullName,
      aiRiskScore: decision.aiRiskScore,
      aiRiskLevel: decision.aiRiskLevel,
      aiComplianceScore: decision.aiComplianceScore,
      aiActivityInferred: decision.aiActivityInferred,
      aiInsight: decision.aiInsight,
      aiAnomaly: decision.aiAnomaly
    });

    // 1. Alerts Generation
    if (decision.alert) {
      alerts.push({
        id: `alert_${item.tagId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: decision.alert.category,
        title: decision.alert.title,
        message: decision.alert.message,
        priority: decision.alert.priority,
        targetZone: item.location,
        tagId: item.tagId,
        personName: fullName,
        triggerSiren: decision.alert.triggerSiren,
        timestamp: item.timestamp || new Date().toISOString(),
        resolved: false
      });
    }

    // 2. Incidents Generation
    if (decision.incident) {
      incidents.push({
        id: `inc_${item.tagId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: decision.incident.title,
        category: decision.incident.category,
        severity: decision.incident.severity,
        status: 'Open',
        locationZone: item.location,
        personnelName: fullName,
        tagId: item.tagId,
        description: decision.incident.description,
        timestamp: item.timestamp || new Date().toISOString(),
        aiScore: decision.aiRiskScore
      });
    }

    // 3. AI Insights Generation: Generated for anomalies, hazard zones, and elevated risk events
    if (decision.aiAnomaly || decision.aiRiskLevel === 'HIGH' || decision.aiRiskLevel === 'CRITICAL') {
      insights.push({
        id: `insight_${item.tagId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: decision.aiAnomaly?.title || `Operational Telemetry Alert: ${decision.aiActivityInferred}`,
        category: decision.aiActivityInferred,
        impact: decision.aiRiskLevel === 'SAFE' ? 'LOW' : decision.aiRiskLevel,
        description: decision.aiInsight || `Telemetry evaluated for ${fullName} in ${item.location}. Compliance score: ${decision.aiComplianceScore}%.`,
        tagId: item.tagId,
        personName: fullName,
        location: item.location,
        actionableRecommendation: decision.alert ? decision.alert.message : `Continuous tracking active for ${fullName} in ${item.location}.`,
        timestamp: item.timestamp || new Date().toISOString()
      });
    }
  }

  const count = items.length || 1;
  const avgRisk = Math.round((totalRiskScore / count) * 10) / 10;
  const avgCompliance = Math.round((totalComplianceScore / count) * 10) / 10;

  // 4. Analytics Generation
  const analytics: GeneratedAnalytics = {
    id: `analytics_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    totalTracked: items.length,
    averageRiskScore: avgRisk,
    overallComplianceScore: avgCompliance,
    zoneOccupancy,
    activityBreakdown,
    anomalyCount,
    criticalAlertsCount: alerts.filter(a => a.priority === 'Critical').length,
    highRiskCount,
    aiEngineUsed: `${primaryEngineUsed} (${primaryModelUsed})`,
    summary: `Analyzed ${items.length} telemetry records using ${primaryEngineUsed}. Site compliance at ${avgCompliance}%, risk score average ${avgRisk}. Detected ${alerts.length} alert(s), ${incidents.length} incident(s), and ${insights.length} insight(s).`
  };

  return {
    aiEngine: primaryEngineUsed,
    model: primaryModelUsed,
    processedCount: items.length,
    perTagAnalysis,
    alerts,
    incidents,
    analytics,
    insights
  };
}
