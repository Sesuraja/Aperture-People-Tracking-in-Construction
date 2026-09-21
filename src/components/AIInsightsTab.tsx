import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  BrainCircuit, 
  TrendingUp, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Users, 
  MapPin, 
  Activity, 
  Filter, 
  Search, 
  RefreshCw, 
  Download, 
  ArrowRight, 
  ChevronRight, 
  X, 
  Send, 
  Bot, 
  Database, 
  ShieldAlert, 
  Layers, 
  Radio, 
  Info, 
  Lightbulb, 
  Zap, 
  BarChart3, 
  ExternalLink, 
  ArrowUpRight, 
  HelpCircle, 
  Check, 
  Copy, 
  MessageSquare, 
  Terminal,
  ShieldCheck,
  FileText,
  Compass,
  CornerDownRight,
  TrendingDown,
  User,
  Sliders
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTerminology, useTracking } from '../context/TrackingContext';
import { gaoApi, HistoryRecord } from '../lib/gaoApi';
import { exportToCSV, ExportColumn } from '../lib/exportUtils';
import { formatEdtTime } from '../lib/dateTimeUtils';
import { db, doc, setDoc, batchSetDocs, addDoc, collection, onSnapshot, serverTimestamp } from '../lib/db';
import {
  RawMovementRecord,
  NormalizedMovementEvent,
  normalizeRecords,
  formatDurationHuman,
  convertRealtimeTagsToMovementRecords
} from '../lib/movementAnalytics';
import {
  generateAIInsights,
  queryAskAperture,
  auditDataQuality,
  AIInsightItem,
  AIInsightsSummary,
  DataQualityAuditResult,
  InsightCategory,
  InsightSeverity,
  InsightConfidence,
  GroundedQueryResult,
  DataDistinction
} from '../lib/aiInsightsEngine';

export interface AIInsightsTabProps {
  people?: any[];
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  isGrounded?: boolean;
  confidence?: 'High' | 'Medium' | 'Low';
  supportingMetrics?: Record<string, string | number>;
  suggestedFollowUps?: string[];
  timestamp: string;
}

type SectionTab = 
  | 'all'
  | 'critical'
  | 'emerging'
  | 'person'
  | 'zone'
  | 'duration'
  | 'trend'
  | 'ask_aperture'
  | 'data_quality'
  | 'evidence';

export default function AIInsightsTab({ people = [] }: AIInsightsTabProps) {
  const navigate = useNavigate();
  const trackingCtx = useTracking();

  const { 
    config, 
    intelligenceProfile, 
    zoneLabel = 'Zone', 
    personnelSingular = 'Personnel', 
    personnelPlural = 'Personnel',
    siteLabel = 'Facility'
  } = useTerminology();

  const activeIndustry = intelligenceProfile?.industry || config?.industryId || 'construction';
  const activeSubIndustry = intelligenceProfile?.subIndustry || config?.subIndustry || config?.industryName || 'Operations Intelligence';
  const complianceFramework = intelligenceProfile?.complianceFramework || 'OSHA / ISO 45001 Telemetry Standards';

  // Live workforce registry from MongoDB registered_people, people & REST fallback
  const [dbPeople, setDbPeople] = useState<any[]>([]);
  useEffect(() => {
    const listMap = new Map<string, any>();
    const updateList = () => setDbPeople(Array.from(listMap.values()));

    const unsubReg = onSnapshot(collection(db, 'registered_people'), (snapshot) => {
      snapshot.forEach(d => {
        const data = d.data();
        if (data) listMap.set(d.id, { id: d.id, ...data });
      });
      updateList();
    });

    const unsubPpl = onSnapshot(collection(db, 'people'), (snapshot) => {
      snapshot.forEach(d => {
        const data = d.data();
        if (data) listMap.set(d.id, { id: d.id, ...data });
      });
      updateList();
    });

    // REST fallback for complete offline/online coverage
    Promise.allSettled([
      fetch('/api/data/registered_people').then(r => r.ok ? r.json() : []),
      fetch('/api/data/people').then(r => r.ok ? r.json() : [])
    ]).then(results => {
      results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          res.value.forEach(p => {
            if (p && (p.id || p.tagId || p.TagID || p.hardhatTagId)) {
              listMap.set(p.id || p.tagId || p.TagID || p.hardhatTagId, p);
            }
          });
        }
      });
      updateList();
    }).catch(() => {});

    return () => {
      unsubReg();
      unsubPpl();
    };
  }, []);

  const peopleRegistry = useMemo(() => {
    const map = new Map<string, any>();
    const contextPeople = trackingCtx?.people || [];
    [...people, ...contextPeople, ...dbPeople].forEach(p => {
      if (!p) return;
      if (p.id) map.set(String(p.id).toLowerCase(), p);
      if (p.tagId) map.set(String(p.tagId).toLowerCase(), p);
      if (p.TagID) map.set(String(p.TagID).toLowerCase(), p);
      if (p.hardhatTagId) map.set(String(p.hardhatTagId).toLowerCase(), p);
      if (p.epc) map.set(String(p.epc).toLowerCase(), p);
    });
    return map;
  }, [people, trackingCtx?.people, dbPeople]);

  // ---------------------------------------------------------------------------
  // 1. DATA STATE & API INGESTION
  // ---------------------------------------------------------------------------
  const [rawRecords, setRawRecords] = useState<RawMovementRecord[]>([]);
  const [totalSystemCount, setTotalSystemCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState<number>(200);
  const [lastAnalysisTimestamp, setLastAnalysisTimestamp] = useState<string>('');

  // MongoDB Atlas Persistence State
  const [isMongoSynced, setIsMongoSynced] = useState<boolean>(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Auto-clear action toast
  useEffect(() => {
    if (actionToast) {
      const timer = setTimeout(() => setActionToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [actionToast]);

  const loadTelemetry = useCallback(async (takeCount: number = batchSize) => {
    setIsRefreshing(true);
    setApiError(null);
    try {
      const [records, count, liveTags] = await Promise.all([
        gaoApi.getHistoryRecords(0, takeCount),
        gaoApi.getHistoryTotalCount().catch(() => 0),
        gaoApi.getTagsInRealtime().catch(() => [])
      ]);
      const validRecords = Array.isArray(records) ? records : [];

      // Convert all active real-time workers & RFID tags into active ongoing records
      const allLiveTagSources = [
        ...(Array.isArray(liveTags) ? liveTags : []),
        ...(Array.isArray(trackingCtx?.liveTags) ? trackingCtx.liveTags : [])
      ];
      const activeWorkforce = trackingCtx?.people || people;

      const activeLiveRecords = convertRealtimeTagsToMovementRecords(
        allLiveTagSources,
        activeWorkforce,
        peopleRegistry
      );

      // Prepend active real-time records so the AI engine evaluates active on-site workers
      const combinedRecords = [...activeLiveRecords, ...validRecords];
      const totalCount = Math.max(count || 0, validRecords.length) + activeLiveRecords.length;

      setRawRecords(combinedRecords);
      setTotalSystemCount(totalCount);
      setLastAnalysisTimestamp(formatEdtTime(new Date()));
    } catch (err: any) {
      console.error('[AI Insights] Telemetry fetch error:', err);
      setApiError(err?.message || 'Failed to fetch people-tracking telemetry records');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [batchSize, trackingCtx?.liveTags, trackingCtx?.people, people, peopleRegistry]);

  useEffect(() => {
    loadTelemetry(batchSize);

    const interval = setInterval(() => {
      loadTelemetry(batchSize);
    }, 12000);

    const handleDataRefresh = () => {
      loadTelemetry(batchSize);
    };

    window.addEventListener('gao_data_updated', handleDataRefresh);
    window.addEventListener('gao_refresh_data', handleDataRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gao_data_updated', handleDataRefresh);
      window.removeEventListener('gao_refresh_data', handleDataRefresh);
    };
  }, [loadTelemetry, batchSize]);

  // ---------------------------------------------------------------------------
  // 2. NORMALIZATION & AI INSIGHTS PIPELINE
  // ---------------------------------------------------------------------------
  const normalizedEvents = useMemo(() => {
    return normalizeRecords(rawRecords, peopleRegistry, {
      industry: activeIndustry,
      subIndustry: activeSubIndustry,
      zoneLabel,
      personnelSingular,
      personnelPlural,
      siteLabel
    });
  }, [rawRecords, peopleRegistry, activeIndustry, activeSubIndustry, zoneLabel, personnelSingular, personnelPlural, siteLabel]);

  const insightsSummary: AIInsightsSummary = useMemo(() => {
    return generateAIInsights(rawRecords, {
      industry: activeIndustry,
      subIndustry: activeSubIndustry,
      zoneLabel,
      personnelSingular,
      personnelPlural,
      siteLabel,
      complianceFramework,
      people: peopleRegistry
    });
  }, [rawRecords, activeIndustry, activeSubIndustry, zoneLabel, personnelSingular, personnelPlural, siteLabel, complianceFramework, peopleRegistry]);

  // Auto-sync generated AI insights and Data Quality Audit to MongoDB Atlas in a single batch
  const lastSyncedInsightsHashRef = useRef<string>('');
  useEffect(() => {
    if (rawRecords.length === 0 || insightsSummary.insights.length === 0) return;

    const hash = `${rawRecords.length}_${insightsSummary.insights.length}_${insightsSummary.insights.map(i => i.id).join('|')}`;
    if (lastSyncedInsightsHashRef.current === hash) return;
    lastSyncedInsightsHashRef.current = hash;

    // Persist all generated insights to MongoDB ai_insights collection in a single batch
    const docsToSync = insightsSummary.insights.map(item => ({
      id: item.id,
      category: item.category,
      severity: item.severity,
      severityScore: item.severityScore,
      title: item.title,
      summary: item.summary,
      affectedPerson: item.affectedPerson,
      affectedTagId: item.affectedTagId,
      affectedZone: item.affectedZone,
      currentValue: item.currentValue,
      baselineValue: item.baselineValue,
      difference: item.difference,
      confidence: item.confidence,
      confidenceScore: item.confidenceScore,
      evidence: item.evidence,
      recommendedAction: item.recommendedAction,
      source: 'REAL_TIME_API_HISTORY',
      updatedAt: new Date().toISOString()
    }));

    batchSetDocs('ai_insights', docsToSync).then(() => {
      setIsMongoSynced(true);
    }).catch(err => {
      console.warn('[AI Insights] batchSetDocs ai_insights error:', err);
    });

    // Persist Data Quality Audit to MongoDB analytics_metrics
    setDoc(doc(db, 'analytics_metrics', 'data_quality_audit'), {
      ...insightsSummary.dataQualityAudit,
      source: 'REAL_TIME_API_HISTORY',
      auditedAt: new Date().toISOString()
    }).catch(() => {});
  }, [rawRecords.length, insightsSummary.insights]);

  // ---------------------------------------------------------------------------
  // 3. FILTER & NAVIGATION STATE
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<SectionTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<'all' | 'medium_high' | 'high_only'>('all');
  const [timeRange, setTimeRange] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Insight for Detail Drawer
  const [selectedInsight, setSelectedInsight] = useState<AIInsightItem | null>(null);

  // ---------------------------------------------------------------------------
  // 4. FILTERED INSIGHTS COMPUTATION
  // ---------------------------------------------------------------------------
  const filteredInsights = useMemo(() => {
    return insightsSummary.insights.filter(item => {
      // 1. Tab-based filtering
      if (activeTab === 'critical' && item.severity !== 'Critical' && item.severity !== 'High') return false;
      if (activeTab === 'emerging' && item.category !== 'Emerging Pattern') return false;
      if (activeTab === 'person' && item.category !== 'Person Activity Anomaly' && item.category !== 'Repeated Visits') return false;
      if (activeTab === 'zone' && item.category !== 'Zone Activity Anomaly') return false;
      if (activeTab === 'duration' && item.category !== 'Unusual Duration') return false;
      if (activeTab === 'trend' && item.category !== 'Trend') return false;

      // 2. Category Filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;

      // 3. Severity Filter
      if (selectedSeverity !== 'all' && item.severity !== selectedSeverity) return false;

      // 4. Confidence Filter
      if (selectedConfidence === 'high_only' && item.confidence !== 'High') return false;
      if (selectedConfidence === 'medium_high' && item.confidence === 'Low') return false;

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = item.title.toLowerCase().includes(q);
        const summaryMatch = item.summary.toLowerCase().includes(q);
        const personMatch = (item.affectedPerson || '').toLowerCase().includes(q);
        const tagMatch = (item.affectedTagId || '').toLowerCase().includes(q);
        const zoneMatch = (item.affectedZone || '').toLowerCase().includes(q);
        const evidenceMatch = item.evidence.toLowerCase().includes(q);
        if (!titleMatch && !summaryMatch && !personMatch && !tagMatch && !zoneMatch && !evidenceMatch) {
          return false;
        }
      }

      return true;
    });
  }, [insightsSummary.insights, activeTab, selectedCategory, selectedSeverity, selectedConfidence, searchQuery]);

  // ---------------------------------------------------------------------------
  // 5. "ASK APERTURE" CHAT STATE
  // ---------------------------------------------------------------------------
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'init-msg',
      sender: 'assistant',
      text: `👋 **Welcome to Ask Aperture**\n\nI am your evidence-based Telemetry Intelligence Assistant, directly connected to **${normalizedEvents.length} live RFID movement records** across **${siteLabel}**.\n\nAsk me anything about movement volume, dwell durations, visitor frequencies, or detected anomalies. Every answer is strictly grounded in real API records with zero hallucinations.`,
      isGrounded: true,
      confidence: 'High',
      suggestedFollowUps: [
        `Which ${zoneLabel.toLowerCase()} had the most activity?`,
        `Who visited most frequently?`,
        `Which ${zoneLabel.toLowerCase()} has the longest average dwell time?`,
        `What unusual patterns were detected today?`,
        `Show data quality audit`
      ],
      timestamp: formatEdtTime(new Date(), { includeSeconds: false })
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'ask_aperture') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isThinking, activeTab]);

  const handleAskQuestion = (questionText?: string) => {
    const q = (questionText || chatInput).trim();
    if (!q || isThinking) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: formatEdtTime(new Date(), { includeSeconds: false })
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (!questionText) setChatInput('');
    setIsThinking(true);

    setTimeout(() => {
      const result: GroundedQueryResult = queryAskAperture(q, rawRecords, insightsSummary.insights, {
        industry: activeIndustry,
        subIndustry: activeSubIndustry,
        zoneLabel,
        personnelPlural,
        personnelSingular,
        siteLabel,
        complianceFramework,
        people: peopleRegistry
      });

      const botMsg: ChatMessage = {
        id: `msg-bot-${Date.now()}`,
        sender: 'assistant',
        text: result.answer,
        isGrounded: result.isGrounded,
        confidence: result.confidence,
        supportingMetrics: result.supportingMetrics,
        suggestedFollowUps: result.suggestedFollowUps,
        timestamp: formatEdtTime(new Date(), { includeSeconds: false })
      };

      setChatMessages(prev => [...prev, botMsg]);
      setIsThinking(false);

      // Persist to MongoDB ai_copilot_chats
      addDoc(collection(db, 'ai_copilot_chats'), {
        question: q,
        answer: result.answer,
        isGrounded: result.isGrounded,
        confidence: result.confidence,
        supportingMetrics: result.supportingMetrics,
        source: 'REAL_TIME_API_HISTORY',
        timestamp: serverTimestamp()
      }).catch(() => {});
    }, 350);
  };

  // ---------------------------------------------------------------------------
  // 6. CSV EXPORT HANDLER
  // ---------------------------------------------------------------------------
  const handleExportCSV = () => {
    if (insightsSummary.insights.length === 0) return;
    const columns: ExportColumn[] = [
      { key: 'category', label: 'Category' },
      { key: 'severity', label: 'Severity' },
      { key: 'title', label: 'Title' },
      { key: 'currentValue', label: 'Current Value' },
      { key: 'baselineValue', label: 'Baseline Value' },
      { key: 'difference', label: 'Difference' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'affectedPerson', label: 'Affected Person' },
      { key: 'affectedZone', label: 'Affected Zone' },
      { key: 'evidence', label: 'Evidence' },
      { key: 'recommendedAction', label: 'Recommended Action' }
    ];

    const rows = insightsSummary.insights.map(i => ({
      category: i.category,
      severity: i.severity,
      title: i.title,
      currentValue: i.currentValue,
      baselineValue: i.baselineValue,
      difference: i.difference,
      confidence: `${i.confidence} (${i.confidenceScore}%)`,
      affectedPerson: i.affectedPerson || 'N/A',
      affectedZone: i.affectedZone || 'N/A',
      evidence: i.evidence,
      recommendedAction: i.recommendedAction
    }));

    exportToCSV('Aperture_AI_Insights_Report', rows, columns);
  };

  // ---------------------------------------------------------------------------
  // 7. HELPER BADGE STYLES
  // ---------------------------------------------------------------------------
  const getSeverityBadge = (severity: InsightSeverity) => {
    switch (severity) {
      case 'Critical':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          CRITICAL
        </span>;
      case 'High':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          HIGH
        </span>;
      case 'Medium':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          MEDIUM
        </span>;
      case 'Low':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30">
          LOW
        </span>;
      case 'Informational':
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          INFO
        </span>;
    }
  };

  const getConfidenceBadge = (confidence: InsightConfidence, score: number) => {
    const color = confidence === 'High' 
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      : confidence === 'Medium'
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${color}`}>
        <Sparkles size={11} />
        {confidence} ({score}%)
      </span>
    );
  };

  const getDataDistinctionBadge = (distinction: DataDistinction) => {
    switch (distinction) {
      case 'Real API event':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">RAW API TELEMETRY</span>;
      case 'Statistical anomaly':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">STATISTICAL ANOMALY</span>;
      case 'Derived metric':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">DERIVED METRIC</span>;
      case 'AI interpretation':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50">AI INTERPRETATION</span>;
    }
  };

  // ---------------------------------------------------------------------------
  // 8. RENDER VIEW
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 w-full max-w-[1760px] mx-auto pb-20 min-w-0 p-4 sm:p-6 text-slate-900 dark:text-slate-100">

      {/* 1. HEADER & STATUS BAR */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400">
              <BrainCircuit size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                AI Insights & Predictions
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Evidence-based intelligence analyzing live people-movement API telemetry across {siteLabel}.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Industry Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 text-xs">
            <Layers size={14} className="text-slate-400" />
            <span className="font-bold capitalize text-slate-700 dark:text-slate-300">{activeSubIndustry}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 dark:text-slate-400 font-medium">{activeIndustry}</span>
          </div>

          {/* Telemetry Record Count Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Radio size={14} className="animate-pulse text-emerald-500" />
            <span>Telemetry Feed</span>
            <span className="font-mono font-bold bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-[11px]">
              {normalizedEvents.length.toLocaleString()} events
            </span>
          </div>

          {/* Batch Size Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-2.5 py-1">
            <span className="text-[11px] font-semibold text-slate-500">Scan:</span>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isRefreshing}
              aria-label="Select Telemetry Batch Size"
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 border-none outline-none cursor-pointer"
            >
              <option value={100} className="dark:bg-slate-900">100 records</option>
              <option value={250} className="dark:bg-slate-900">250 records</option>
              <option value={500} className="dark:bg-slate-900">500 records</option>
              <option value={1000} className="dark:bg-slate-900">1,000 records</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadTelemetry(batchSize)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Analyzing...' : 'Re-Run Pipeline'}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            disabled={insightsSummary.insights.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 transition shadow-2xs cursor-pointer disabled:opacity-40"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Action Toast Notification */}
      {actionToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>{actionToast}</span>
          </div>
          <button onClick={() => setActionToast(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. DYNAMIC INDUSTRY CONTEXT BANNER */}
      <div className="bg-gradient-to-r from-indigo-50/70 via-slate-50 to-blue-50/70 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-indigo-950/40 border border-indigo-100 dark:border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold">
            <Compass size={15} />
            <span className="uppercase tracking-wider font-mono">Dynamic Industry Adaptation Active</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-medium">
            AI anomaly thresholds and interpretations calibrate dynamically to **{activeSubIndustry}** ({activeIndustry}) and **{complianceFramework}**. Under no circumstances does the engine fabricate variables beyond real people-movement telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-[11px]">
            Spatial Unit: <strong>{zoneLabel}</strong>
          </span>
          <span className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-[11px]">
            Personnel Unit: <strong>{personnelPlural}</strong>
          </span>
          <span className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-[11px]">
            Facility: <strong>{siteLabel}</strong>
          </span>
        </div>
      </div>

      {/* 3. SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        
        {/* Total Insights */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Insights</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {insightsSummary.totalInsights}
          </div>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Mathematical anomalies detected
          </p>
        </div>

        {/* Critical & High */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Critical / High</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-xl">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
            {insightsSummary.criticalAndHighCount}
          </div>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Substantial statistical deviations
          </p>
        </div>

        {/* Emerging Patterns */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Emerging Patterns</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
            {insightsSummary.emergingPatternsCount}
          </div>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Accelerating movement shifts
          </p>
        </div>

        {/* Average Confidence */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Avg Confidence</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {insightsSummary.averageConfidenceScore}%
          </div>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Based on sample size &amp; std dev
          </p>
        </div>

        {/* Data Quality Health */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-2 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Data Quality</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
              <Database size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
            {insightsSummary.dataQualityScore}%
          </div>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Telemetry integrity score
          </p>
        </div>

      </div>

      {/* 4. VIEW SELECTION TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800 text-xs scrollbar-none font-bold">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sparkles size={14} />
          All Insights ({insightsSummary.totalInsights})
        </button>

        <button
          onClick={() => setActiveTab('critical')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'critical'
              ? 'bg-rose-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle size={14} />
          Critical &amp; High ({insightsSummary.criticalAndHighCount})
        </button>

        <button
          onClick={() => setActiveTab('emerging')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'emerging'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <TrendingUp size={14} />
          Emerging Patterns ({insightsSummary.emergingPatternsCount})
        </button>

        <button
          onClick={() => setActiveTab('person')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'person'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users size={14} />
          {personnelSingular} Insights
        </button>

        <button
          onClick={() => setActiveTab('zone')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'zone'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MapPin size={14} />
          {zoneLabel} Insights
        </button>

        <button
          onClick={() => setActiveTab('duration')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'duration'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Clock size={14} />
          Duration Outliers
        </button>

        <button
          onClick={() => setActiveTab('trend')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'trend'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Activity size={14} />
          Trends &amp; Velocity
        </button>

        <button
          onClick={() => setActiveTab('ask_aperture')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ask_aperture'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Bot size={14} />
          Ask Aperture (AI Query)
        </button>

        <button
          onClick={() => setActiveTab('data_quality')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'data_quality'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Database size={14} />
          Data Quality ({insightsSummary.dataQualityScore}%)
        </button>

        <button
          onClick={() => setActiveTab('evidence')}
          className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'evidence'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText size={14} />
          Evidence Log
        </button>
      </div>

      {/* 5. FILTER BAR (when viewing insight cards) */}
      {activeTab !== 'ask_aperture' && activeTab !== 'data_quality' && activeTab !== 'evidence' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          
          <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search insights by person, tag, ${zoneLabel.toLowerCase()}, or keyword...`}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-indigo-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear Search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by Insight Category"
              className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="Unusual Duration">Unusual Duration</option>
              <option value="Repeated Visits">Repeated Visits</option>
              <option value="Zone Activity Anomaly">Zone Activity Anomaly</option>
              <option value="Person Activity Anomaly">Person Activity Anomaly</option>
              <option value="Time Pattern Anomaly">Time Pattern Anomaly</option>
              <option value="Emerging Pattern">Emerging Pattern</option>
              <option value="Trend">Trend Insights</option>
              <option value="Data Quality">Data Quality</option>
            </select>

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              aria-label="Filter by Severity"
              className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="Critical">Critical Only</option>
              <option value="High">High Severity</option>
              <option value="Medium">Medium Severity</option>
              <option value="Low">Low Severity</option>
              <option value="Informational">Informational</option>
            </select>

            {/* Confidence Filter */}
            <select
              value={selectedConfidence}
              onChange={(e) => setSelectedConfidence(e.target.value as any)}
              aria-label="Filter by Confidence"
              className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="all">All Confidence</option>
              <option value="medium_high">Medium &amp; High</option>
              <option value="high_only">High Confidence Only</option>
            </select>
          </div>

          {/* Active Count & Reset */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Showing <strong>{filteredInsights.length}</strong> of {insightsSummary.totalInsights}
            </span>
            {(searchQuery || selectedCategory !== 'all' || selectedSeverity !== 'all' || selectedConfidence !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedSeverity('all');
                  setSelectedConfidence('all');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* 6. MAIN CONTENT DISPLAY (SUB-VIEWS) */}
      {/* ----------------------------------------------------------------------- */}

      {/* VIEW A: INSIGHT CARDS GRID */}
      {activeTab !== 'ask_aperture' && activeTab !== 'data_quality' && activeTab !== 'evidence' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <RefreshCw size={32} className="animate-spin text-indigo-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Analyzing Movement Telemetry...</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Computing historical baselines, transit frequencies, dwell z-scores, and cross-zone patterns.
              </p>
            </div>
          ) : filteredInsights.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                {rawRecords.length === 0 
                  ? 'No Telemetry Records Available'
                  : 'No Significant AI Insights Detected'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {rawRecords.length === 0
                  ? 'More historical data is required to identify reliable patterns. Ensure RFID readers are actively publishing telemetry.'
                  : 'All evaluated movement events conform to baseline standards. No statistical anomalies exceed detection thresholds under current filters.'}
              </p>
              {(searchQuery || selectedCategory !== 'all' || selectedSeverity !== 'all' || selectedConfidence !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedSeverity('all');
                    setSelectedConfidence('all');
                    setActiveTab('all');
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-2xl text-xs font-bold shadow-sm"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredInsights.map(insight => (
                <div
                  key={insight.id}
                  onClick={() => setSelectedInsight(insight)}
                  className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-3xl p-5 shadow-2xs hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4"
                >
                  {/* Top Header: Category & Severity */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {insight.category}
                        </span>
                        {getDataDistinctionBadge(insight.dataDistinction)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {getSeverityBadge(insight.severity)}
                      </div>
                    </div>

                    {/* Title & Summary */}
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition leading-snug">
                        {insight.title}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 font-medium">
                        {insight.summary}
                      </p>
                    </div>

                    {/* Target Entities */}
                    {(insight.affectedPerson || insight.affectedZone) && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        {insight.affectedPerson && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                            <User size={11} />
                            {insight.affectedPerson}
                          </span>
                        )}
                        {insight.affectedZone && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <MapPin size={11} />
                            {insight.affectedZone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Middle: Metric Comparison Box */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-xs grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Current</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {insight.currentValue}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Baseline</span>
                      <span className="font-mono font-medium text-slate-600 dark:text-slate-400 truncate block">
                        {insight.baselineValue}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Difference</span>
                      <span className={`font-mono font-black truncate block ${
                        insight.difference.startsWith('+') ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {insight.difference}
                      </span>
                    </div>
                  </div>

                  {/* Evidence Snippet */}
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-850/50 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">Evidence:</span>
                    <p className="line-clamp-2 italic">{insight.evidence}</p>
                  </div>

                  {/* Recommendation Snippet */}
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/50 dark:border-amber-900/30 flex items-start gap-1.5">
                    <Lightbulb size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900 dark:text-amber-300 block mb-0.5">Recommendation:</span>
                      <p className="line-clamp-2">{insight.recommendedAction}</p>
                    </div>
                  </div>

                  {/* Bottom Footer: Confidence & Click Action */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      {getConfidenceBadge(insight.confidence, insight.confidenceScore)}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">
                      Inspect Details
                      <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW B: "ASK APERTURE" NATURAL LANGUAGE GROUNDED QUERY ASSISTANT */}
      {activeTab === 'ask_aperture' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                <Bot size={24} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Ask Aperture
                  <span className="text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Grounded in Real Telemetry
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Ask analytical questions about real movement data. The engine responds exclusively using verified telemetry records.
                </p>
              </div>
            </div>

            <button
              onClick={() => setChatMessages([chatMessages[0]])}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer"
            >
              Reset Chat
            </button>
          </div>

          {/* Suggestion Chips */}
          <div className="space-y-2">
            <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">Suggested Operational Queries:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                `Which ${zoneLabel.toLowerCase()} had the most activity?`,
                `Who visited most frequently?`,
                `Which ${zoneLabel.toLowerCase()} has the longest average dwell time?`,
                `What unusual patterns were detected today?`,
                `Compare today's activity with yesterday`,
                `Show data quality audit`
              ].map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAskQuestion(chip)}
                  disabled={isThinking}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="space-y-4 max-h-[500px] overflow-y-auto p-4 bg-slate-50/60 dark:bg-slate-950/40 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            {chatMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Bot size={16} />
                  </div>
                )}

                <div className={`space-y-2 max-w-[85%] sm:max-w-[75%] ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white p-3.5 rounded-2xl rounded-tr-xs text-xs font-medium'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl rounded-tl-xs text-xs space-y-3 shadow-2xs'
                }`}>
                  <div className="whitespace-pre-wrap leading-relaxed font-sans">
                    {msg.text}
                  </div>

                  {/* Supporting Metrics Card (if present) */}
                  {msg.supportingMetrics && Object.keys(msg.supportingMetrics).length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      {Object.entries(msg.supportingMetrics).map(([key, val]) => (
                        <div key={key}>
                          <span className="block text-[10px] uppercase font-bold text-slate-400 truncate">{key}</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs truncate block">{val}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Follow up chips */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Follow-up:</span>
                      {msg.suggestedFollowUps.map((fUp, fIdx) => (
                        <button
                          key={fIdx}
                          onClick={() => handleAskQuestion(fUp)}
                          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          "{fUp}"{fIdx < msg.suggestedFollowUps!.length - 1 ? ' ·' : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Message timestamp & Grounding badge */}
                  <div className={`flex items-center justify-between gap-2 pt-1 text-[10px] ${
                    msg.sender === 'user' ? 'text-indigo-100' : 'text-slate-400'
                  }`}>
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'assistant' && msg.isGrounded && (
                      <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check size={11} />
                        Verified Telemetry Grounded
                      </span>
                    )}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                    <User size={16} />
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3 justify-start items-center text-xs text-slate-500 font-medium p-2">
                <Bot size={16} className="text-indigo-600 animate-spin" />
                <span>Aperture is analyzing real telemetry records...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Ask a question (e.g., "Which ${zoneLabel.toLowerCase()} had the most activity?", "Who visited most frequently?")...`}
              disabled={isThinking}
              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-indigo-500 font-medium"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isThinking}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Send size={14} />
              <span>Ask</span>
            </button>
          </form>
        </div>
      )}

      {/* VIEW C: DATA QUALITY AUDIT */}
      {activeTab === 'data_quality' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Telemetry Data Quality &amp; Integrity Audit
                <Badge variant="outline" className={`font-mono font-bold ${
                  insightsSummary.dataQualityScore >= 90 
                    ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' 
                    : 'text-amber-600 bg-amber-500/10 border-amber-500/20'
                }`}>
                  {insightsSummary.dataQualityScore}% Score
                </Badge>
              </h2>
              <p className="text-xs text-slate-500">
                Audited {insightsSummary.dataQualityAudit.totalRecordsChecked} raw people-tracking records for field completeness, timestamp order, and duplicates.
              </p>
            </div>
            
            <button
              onClick={() => loadTelemetry(batchSize)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <RefreshCw size={12} />
              Re-Audit Telemetry
            </button>
          </div>

          {/* Metric Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Checked</span>
              <div className="text-xl font-black text-slate-800 dark:text-white font-mono">
                {insightsSummary.dataQualityAudit.totalRecordsChecked}
              </div>
              <span className="text-[11px] font-medium text-slate-500">API Events</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Missing Names</span>
              <div className={`text-xl font-black font-mono ${
                insightsSummary.dataQualityAudit.issuesFound.missingNames > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
              }`}>
                {insightsSummary.dataQualityAudit.issuesFound.missingNames}
              </div>
              <span className="text-[11px] font-medium text-slate-500">Blank First/Last</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Bad Timestamps</span>
              <div className={`text-xl font-black font-mono ${
                insightsSummary.dataQualityAudit.issuesFound.malformedTimestamps > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
              }`}>
                {insightsSummary.dataQualityAudit.issuesFound.malformedTimestamps}
              </div>
              <span className="text-[11px] font-medium text-slate-500">Inverted or invalid</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Missing Zones</span>
              <div className={`text-xl font-black font-mono ${
                insightsSummary.dataQualityAudit.issuesFound.missingZones > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
              }`}>
                {insightsSummary.dataQualityAudit.issuesFound.missingZones}
              </div>
              <span className="text-[11px] font-medium text-slate-500">Undefined location</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Invalid Durations</span>
              <div className={`text-xl font-black font-mono ${
                insightsSummary.dataQualityAudit.issuesFound.invalidDurations > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
              }`}>
                {insightsSummary.dataQualityAudit.issuesFound.invalidDurations}
              </div>
              <span className="text-[11px] font-medium text-slate-500">Negative or NaN</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Duplicates</span>
              <div className={`text-xl font-black font-mono ${
                insightsSummary.dataQualityAudit.issuesFound.duplicateRecords > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
              }`}>
                {insightsSummary.dataQualityAudit.issuesFound.duplicateRecords}
              </div>
              <span className="text-[11px] font-medium text-slate-500">Exact duplicate scans</span>
            </div>

          </div>

          {/* Audit Details */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit Verification Trail:</span>
            <div className="space-y-1.5">
              {insightsSummary.dataQualityAudit.details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
                  <CheckCircle2 size={15} className="text-indigo-500 shrink-0 mt-0.5" />
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW D: EVIDENCE & TELEMETRY STREAM */}
      {activeTab === 'evidence' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Real Telemetry Evidence Stream
                <Badge variant="outline" className="font-mono text-xs">
                  {normalizedEvents.length} Events Analyzed
                </Badge>
              </h2>
              <p className="text-xs text-slate-500">
                Ground-truth API telemetry feeding the statistical AI baseline models.
              </p>
            </div>

            <button
              onClick={() => navigate('/analytics')}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Open Aggregated Analytics
              <ExternalLink size={13} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                <TableRow>
                  <TableHead className="text-xs font-bold">Tag ID</TableHead>
                  <TableHead className="text-xs font-bold">{personnelSingular} Name</TableHead>
                  <TableHead className="text-xs font-bold">{zoneLabel} Location</TableHead>
                  <TableHead className="text-xs font-bold">Enter Time</TableHead>
                  <TableHead className="text-xs font-bold">Leave Time</TableHead>
                  <TableHead className="text-xs font-bold">Duration</TableHead>
                  <TableHead className="text-xs font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs font-medium divide-y divide-slate-100 dark:divide-slate-800">
                {normalizedEvents.slice(0, 50).map((evt, idx) => (
                  <TableRow key={evt.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <TableCell className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {evt.tagId}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900 dark:text-white">
                      {evt.personName}
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        {evt.locationName}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-slate-600 dark:text-slate-400">
                      {evt.enterTime}
                    </TableCell>
                    <TableCell className="font-mono text-slate-600 dark:text-slate-400">
                      {evt.leaveTime}
                    </TableCell>
                    <TableCell className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {evt.durationFormatted}
                    </TableCell>
                    <TableCell>
                      {evt.isOngoing ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Active In Zone
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                          Completed
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {normalizedEvents.length > 50 && (
            <p className="text-[11px] text-slate-400 text-center font-medium">
              Showing recent 50 of {normalizedEvents.length.toLocaleString()} telemetry events. Use Analytics for complete tabular filtering.
            </p>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* 7. INSIGHT DETAIL PANEL / MODAL (WHEN AN INSIGHT IS CLICKED) */}
      {/* ----------------------------------------------------------------------- */}
      {selectedInsight && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-7 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedInsight(null)}
              aria-label="Close Insight Details"
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Modal Header */}
            <div className="space-y-2 pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {selectedInsight.category}
                </span>
                {getSeverityBadge(selectedInsight.severity)}
                {getDataDistinctionBadge(selectedInsight.dataDistinction)}
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                {selectedInsight.title}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Detected at: {selectedInsight.detectedAt} · Confidence: <strong>{selectedInsight.confidence} ({selectedInsight.confidenceScore}%)</strong>
              </p>
            </div>

            {/* Metric Comparison Card */}
            <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Current Value</span>
                <span className="font-mono font-black text-slate-900 dark:text-white text-sm block mt-0.5">
                  {selectedInsight.currentValue}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Historical Baseline</span>
                <span className="font-mono font-bold text-slate-600 dark:text-slate-400 text-sm block mt-0.5">
                  {selectedInsight.baselineValue}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Deviation</span>
                <span className={`font-mono font-black text-sm block mt-0.5 ${
                  selectedInsight.difference.startsWith('+') ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'
                }`}>
                  {selectedInsight.difference}
                </span>
              </div>
            </div>

            {/* 5-Section Explainability Breakdown */}
            <div className="space-y-4 text-xs">
              
              {/* 1. What Happened */}
              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Info size={14} className="text-indigo-500" />
                  What happened?
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  {selectedInsight.whatHappened}
                </p>
              </div>

              {/* 2. Evidence */}
              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileText size={14} className="text-blue-500" />
                  Evidence (Telemetry Data)
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 font-mono text-[11px]">
                  {selectedInsight.evidence}
                </p>
              </div>

              {/* 3. Comparison */}
              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Activity size={14} className="text-teal-500" />
                  Baseline Comparison
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  {selectedInsight.comparison}
                </p>
              </div>

              {/* 4. Why it matters */}
              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <HelpCircle size={14} className="text-amber-500" />
                  Why it matters
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  {selectedInsight.whyItMatters}
                </p>
              </div>

              {/* 5. Recommended action */}
              <div className="space-y-1">
                <span className="font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-amber-500" />
                  Recommended Action (Conservative &amp; Grounded)
                </span>
                <p className="text-amber-900 dark:text-amber-200 leading-relaxed font-semibold bg-amber-50 dark:bg-amber-950/30 p-3.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                  {selectedInsight.recommendedAction}
                </p>
              </div>

            </div>

            {/* MongoDB Directives & Logging Actions */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-semibold">
                <Database size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span>MongoDB Atlas:</span>
                <span className="font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-100 dark:border-indigo-800">
                  {isMongoSynced ? 'Persisted' : 'Syncing'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    await addDoc(collection(db, 'ai_recommendations'), {
                      title: selectedInsight.title,
                      category: selectedInsight.category,
                      impact: selectedInsight.severity,
                      description: selectedInsight.summary,
                      actionableSteps: selectedInsight.recommendedAction,
                      source: 'REAL_TIME_API_HISTORY',
                      createdAt: serverTimestamp()
                    });
                    setActionToast(`Saved directive "${selectedInsight.title}" to MongoDB Atlas.`);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={12} />
                  Save Directive to MongoDB
                </button>
                <button
                  onClick={async () => {
                    await addDoc(collection(db, 'incidents'), {
                      title: selectedInsight.title,
                      severity: selectedInsight.severity,
                      zone: selectedInsight.affectedZone || siteLabel || 'General Area',
                      description: selectedInsight.whatHappened,
                      tagId: selectedInsight.affectedTagId || 'N/A',
                      personName: selectedInsight.affectedPerson || 'N/A',
                      timestamp: selectedInsight.detectedAt || serverTimestamp(),
                      status: 'OPEN',
                      source: 'REAL_TIME_API_HISTORY'
                    });
                    setActionToast(`Logged incident "${selectedInsight.title}" to MongoDB Atlas.`);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldAlert size={12} className="text-amber-500" />
                  Log to Incidents Collection
                </button>
              </div>
            </div>

            {/* Supporting Events Mini-Table */}
            {selectedInsight.relatedEvents && selectedInsight.relatedEvents.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] uppercase font-bold text-slate-400">Supporting Telemetry Records:</span>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <Table className="text-[11px]">
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                      <TableRow>
                        <TableHead className="p-2">Tag ID</TableHead>
                        <TableHead className="p-2">Name</TableHead>
                        <TableHead className="p-2">Zone</TableHead>
                        <TableHead className="p-2">Enter Time</TableHead>
                        <TableHead className="p-2">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInsight.relatedEvents.slice(0, 5).map((e, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="p-2 font-mono">{e.tagId}</TableCell>
                          <TableCell className="p-2 font-semibold">{e.personName}</TableCell>
                          <TableCell className="p-2">{e.locationName}</TableCell>
                          <TableCell className="p-2 font-mono text-slate-500">{e.enterTime}</TableCell>
                          <TableCell className="p-2 font-mono font-bold">{e.durationFormatted}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Cross-Page Navigation Links */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400">Cross-Page Drill-Down:</span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setSelectedInsight(null);
                    navigate('/analytics');
                  }}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <BarChart3 size={12} />
                  View in Analytics
                </button>
                <button
                  onClick={() => {
                    setSelectedInsight(null);
                    navigate('/incidents');
                  }}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <ShieldAlert size={12} />
                  View Incident Intelligence
                </button>
                <button
                  onClick={() => {
                    setSelectedInsight(null);
                    navigate('/people');
                  }}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Users size={12} />
                  View Personnel Roster
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
