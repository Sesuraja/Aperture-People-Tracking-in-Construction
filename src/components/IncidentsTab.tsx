import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ShieldAlert, AlertTriangle, CheckCircle2, Clock, Search, 
  Filter, RefreshCw, Download, ArrowRight, X, User, MapPin, 
  Sparkles, Layers, Activity, Calendar, Compass, AlertCircle, 
  Check, ChevronLeft, ChevronRight, BarChart2, Eye, History,
  TrendingUp, TrendingDown, Info, Copy, CheckSquare, Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import { useTerminology, useTracking } from '../context/TrackingContext';
import { gaoApi, HistoryRecord } from '../lib/gaoApi';
import { exportToCSV, ExportColumn } from '../lib/exportUtils';
import { db, doc, setDoc, batchSetDocs, collection, onSnapshot, serverTimestamp } from '../lib/db';
import {
  RawApiHistoryRecord,
  NormalizedEvent,
  EventType,
  EventSeverity,
  analyzeApiEvents,
  calculateKPIs,
  buildPersonMovementTimeline,
  calculateZoneBaselines,
  ZoneBaseline,
  PersonTimelineStep,
  formatDuration
} from '../lib/incidentIntelligence';

type ActiveViewTab = 'ledger' | 'anomalies' | 'zones' | 'timeline';

export interface IncidentsTabProps {
  people?: any[];
}

export default function IncidentsTab({ people: propPeople = [] }: IncidentsTabProps = {}) {
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
  const activeSubIndustry = intelligenceProfile?.subIndustry || config?.name || 'General Operations';

  // Live workforce registry from MongoDB registered_people
  const [dbPeople, setDbPeople] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'registered_people'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data) list.push({ id: d.id, ...data });
      });
      setDbPeople(list);
    });
    return () => unsub();
  }, []);

  const peopleRegistry = useMemo(() => {
    const map = new Map<string, any>();
    const contextPeople = trackingCtx?.people || [];
    [...propPeople, ...contextPeople, ...dbPeople].forEach(p => {
      if (!p) return;
      if (p.id) map.set(String(p.id).toLowerCase(), p);
      if (p.tagId) map.set(String(p.tagId).toLowerCase(), p);
      if (p.TagID) map.set(String(p.TagID).toLowerCase(), p);
      if (p.hardhatTagId) map.set(String(p.hardhatTagId).toLowerCase(), p);
      if (p.epc) map.set(String(p.epc).toLowerCase(), p);
    });
    return map;
  }, [propPeople, trackingCtx?.people, dbPeople]);

  // Raw API Data State
  const [rawRecords, setRawRecords] = useState<RawApiHistoryRecord[]>([]);
  const [totalSystemCount, setTotalSystemCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchBatchSize, setFetchBatchSize] = useState<number>(200);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<ActiveViewTab>('ledger');

  // Filters State
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'morning' | 'afternoon' | 'night'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<'All' | EventSeverity>('All');
  const [eventTypeFilter, setEventTypeFilter] = useState<'All' | EventType>('All');
  const [anomalyStatusFilter, setAnomalyStatusFilter] = useState<'all' | 'anomalies_only' | 'normal_only'>('all');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('All');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('All');

  // Detail Modal / Drawer State
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null);

  // Person Movement Timeline State
  const [selectedPersonTagId, setSelectedPersonTagId] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Copied feedback toast
  const [copiedTagId, setCopiedTagId] = useState<string | null>(null);

  // MongoDB Atlas Persistence State
  const [mongoIncidentMeta, setMongoIncidentMeta] = useState<Record<string, { status?: string; notes?: string }>>({});
  const [isMongoSynced, setIsMongoSynced] = useState<boolean>(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Auto-clear action toast
  useEffect(() => {
    if (actionToast) {
      const t = setTimeout(() => setActionToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [actionToast]);

  // Subscribe to MongoDB incidents collection in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'incidents'), (snapshot) => {
      const metaMap: Record<string, any> = {};
      snapshot.docs.forEach(d => {
        const data = d.data();
        if (data.eventId) metaMap[data.eventId] = data;
        else if (data.id) metaMap[data.id] = data;
      });
      setMongoIncidentMeta(metaMap);
    }, () => {});
    return () => unsub();
  }, []);

  /**
   * 1. Fetch Real Data from People-Tracking API
   */
  const loadApiData = useCallback(async (take: number = fetchBatchSize, showRefreshingState = false) => {
    if (showRefreshingState) setIsRefreshing(true);
    else setIsLoading(true);
    setApiError(null);

    try {
      const [records, count] = await Promise.all([
        gaoApi.getHistoryRecords(0, take),
        gaoApi.getHistoryTotalCount()
      ]);

      setRawRecords(Array.isArray(records) ? records : []);
      setTotalSystemCount(count || records.length);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('[IncidentsTab] Failed to fetch API records:', err);
      setApiError(err.message || 'Unable to connect to people tracking API endpoint.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchBatchSize]);

  useEffect(() => {
    loadApiData(fetchBatchSize);
  }, [loadApiData, fetchBatchSize]);

  /**
   * 2. Analyze API Events through the Normalization & AI Intelligence Engine
   * Memoized to prevent expensive recalculation on unrelated renders.
   */
  const analyzedEvents = useMemo(() => {
    return analyzeApiEvents(rawRecords, {
      industry: activeIndustry,
      subIndustry: activeSubIndustry,
      zoneLabel,
      personnelSingular,
      personnelPlural,
      siteLabel,
      people: peopleRegistry
    });
  }, [rawRecords, activeIndustry, activeSubIndustry, zoneLabel, personnelSingular, personnelPlural, siteLabel, peopleRegistry]);

  // 2.1 Auto-sync detected anomalies from real API telemetry to MongoDB Atlas in a single batch
  const lastSyncedAnomaliesHashRef = useRef<string>('');
  useEffect(() => {
    if (analyzedEvents.length === 0) return;
    const anomalies = analyzedEvents.filter(e => e.isAnomaly);
    if (anomalies.length === 0) return;

    const hash = anomalies.map(a => `${a.id}_${a.severityScore}`).join('|');
    if (lastSyncedAnomaliesHashRef.current === hash) return;
    lastSyncedAnomaliesHashRef.current = hash;

    const docsToSync = anomalies.map(evt => {
      const docId = `inc_${evt.id}`;
      return {
        id: docId,
        eventId: evt.id,
        tagId: evt.tagId,
        personName: evt.personName,
        zone: evt.locationName,
        eventType: evt.eventType,
        severity: evt.severity,
        severityScore: evt.severityScore,
        enterTime: evt.enterTime,
        leaveTime: evt.leaveTime,
        durationFormatted: evt.durationFormatted,
        anomalyReason: evt.anomalyReason,
        isAnomaly: true,
        source: 'REAL_TIME_API_HISTORY',
        status: mongoIncidentMeta[evt.id]?.status || 'OPEN',
        updatedAt: new Date().toISOString()
      };
    });

    batchSetDocs('incidents', docsToSync).then(() => {
      setIsMongoSynced(true);
    }).catch(err => {
      console.warn('[IncidentsTab] batchSetDocs anomalies error:', err);
    });
  }, [analyzedEvents, mongoIncidentMeta]);

  /**
   * 3. Distinct Zones & Personnel for Filter Dropdowns
   */
  const uniqueZones = useMemo(() => {
    const set = new Set<string>();
    analyzedEvents.forEach(e => {
      if (e.locationName) set.add(e.locationName);
    });
    return Array.from(set).sort();
  }, [analyzedEvents]);

  const uniquePeople = useMemo(() => {
    const map = new Map<string, string>();
    analyzedEvents.forEach(e => {
      if (!map.has(e.tagId)) {
        map.set(e.tagId, e.personName);
      }
    });
    return Array.from(map.entries()).map(([tagId, name]) => ({ tagId, name }));
  }, [analyzedEvents]);

  /**
   * 4. Zone Baselines for Zone Analysis & Drawer
   */
  const zoneBaselines = useMemo(() => {
    return calculateZoneBaselines(analyzedEvents);
  }, [analyzedEvents]);

  /**
   * 5. Filter Engine (Operates strictly on actual normalized API data)
   */
  const filteredEvents = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    return analyzedEvents.filter(event => {
      // Date filter
      if (dateFilter === 'today') {
        if (!event.enterTime.startsWith(todayStr)) return false;
      } else if (dateFilter === 'yesterday') {
        if (!event.enterTime.startsWith(yesterdayStr)) return false;
      } else if (dateFilter === 'custom' && customDate) {
        if (!event.enterTime.startsWith(customDate)) return false;
      }

      // Time / Shift filter (based on EnterTime hour)
      if (shiftFilter !== 'all') {
        const hour = event.enterDate.getHours();
        if (shiftFilter === 'morning' && (hour < 6 || hour >= 14)) return false;
        if (shiftFilter === 'afternoon' && (hour < 14 || hour >= 22)) return false;
        if (shiftFilter === 'night' && (hour >= 6 && hour < 22)) return false;
      }

      // Zone filter
      if (selectedZoneFilter !== 'All' && event.locationName !== selectedZoneFilter) {
        return false;
      }

      // Person / Tag filter
      if (selectedPersonFilter !== 'All' && event.tagId !== selectedPersonFilter) {
        return false;
      }

      // Severity filter
      if (severityFilter !== 'All' && event.severity !== severityFilter) {
        return false;
      }

      // Event Type filter
      if (eventTypeFilter !== 'All' && event.eventType !== eventTypeFilter) {
        return false;
      }

      // AI Anomaly Status filter
      if (anomalyStatusFilter === 'anomalies_only' && !event.isAnomaly) {
        return false;
      }
      if (anomalyStatusFilter === 'normal_only' && event.isAnomaly) {
        return false;
      }

      // Text search (Person name, Tag ID, Location)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = event.personName.toLowerCase().includes(q);
        const matchesTag = event.tagId.toLowerCase().includes(q);
        const matchesZone = event.locationName.toLowerCase().includes(q);
        if (!matchesName && !matchesTag && !matchesZone) return false;
      }

      return true;
    });
  }, [
    analyzedEvents,
    dateFilter,
    customDate,
    shiftFilter,
    selectedZoneFilter,
    selectedPersonFilter,
    severityFilter,
    eventTypeFilter,
    anomalyStatusFilter,
    searchQuery
  ]);

  /**
   * 6. Dynamic KPI Calculation (calculated directly from API data, not hardcoded)
   */
  const kpis = useMemo(() => {
    return calculateKPIs(filteredEvents);
  }, [filteredEvents]);

  /**
   * 7. Pagination
   */
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage, pageSize]);

  // Reset page if filtered list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    dateFilter,
    customDate,
    shiftFilter,
    selectedZoneFilter,
    selectedPersonFilter,
    severityFilter,
    eventTypeFilter,
    anomalyStatusFilter,
    searchQuery,
    pageSize
  ]);

  /**
   * 8. Timeline for Selected Person
   */
  const personTimelineSteps = useMemo(() => {
    if (!selectedPersonTagId) return [];
    return buildPersonMovementTimeline(analyzedEvents, selectedPersonTagId);
  }, [analyzedEvents, selectedPersonTagId]);

  const selectedPersonMeta = useMemo(() => {
    if (!selectedPersonTagId) return null;
    const ev = analyzedEvents.find(e => e.tagId === selectedPersonTagId);
    return {
      name: ev?.personName || `Personnel (${selectedPersonTagId.slice(-6)})`,
      tagId: selectedPersonTagId
    };
  }, [analyzedEvents, selectedPersonTagId]);

  /**
   * 9. Zone Analytics Data for Recharts
   */
  const zoneChartData = useMemo(() => {
    const stats: { zone: string; eventCount: number; avgDurationMinutes: number; anomalyCount: number }[] = [];
    zoneBaselines.forEach((base, zoneName) => {
      const zoneEvents = filteredEvents.filter(e => e.locationName === zoneName);
      const anomalies = zoneEvents.filter(e => e.isAnomaly).length;
      stats.push({
        zone: zoneName,
        eventCount: zoneEvents.length,
        avgDurationMinutes: base.meanDurationMinutes,
        anomalyCount: anomalies
      });
    });
    return stats.sort((a, b) => b.eventCount - a.eventCount);
  }, [zoneBaselines, filteredEvents]);

  /**
   * 10. Top AI Anomalies Highlight List
   */
  const anomalyHighlights = useMemo(() => {
    return filteredEvents
      .filter(e => e.isAnomaly)
      .slice(0, 4);
  }, [filteredEvents]);

  /**
   * Clipboard Copy Helper
   */
  const handleCopyTag = (tagId: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tagId);
      setCopiedTagId(tagId);
      setTimeout(() => setCopiedTagId(null), 2000);
    }
  };

  /**
   * CSV Export Handler
   */
  const handleExportCsv = () => {
    if (filteredEvents.length === 0) {
      alert('No events available to export.');
      return;
    }

    const exportRows = filteredEvents.map(e => ({
      Severity: e.severity,
      EventType: e.eventType,
      Person: e.personName,
      TagID: e.tagId,
      Zone: e.locationName,
      EnterTime: e.enterTime,
      LeaveTime: e.leaveTime,
      DurationMinutes: e.durationMinutes,
      DurationFormatted: e.durationFormatted,
      IsAnomaly: e.isAnomaly ? 'Yes' : 'No',
      AIConfidence: e.explanation.confidence > 0 ? `${e.explanation.confidence}%` : 'N/A',
      WhatHappened: e.explanation.whatHappened,
      Evidence: e.explanation.evidence,
      RecommendedAction: e.explanation.recommendedAction
    }));

    const columns: ExportColumn[] = [
      { key: 'Severity', label: 'Severity' },
      { key: 'EventType', label: 'Event Type' },
      { key: 'Person', label: 'Person' },
      { key: 'TagID', label: 'Tag ID' },
      { key: 'Zone', label: `${zoneLabel} Name` },
      { key: 'EnterTime', label: 'Enter Time' },
      { key: 'LeaveTime', label: 'Leave Time' },
      { key: 'DurationFormatted', label: 'Duration' },
      { key: 'IsAnomaly', label: 'AI Anomaly' },
      { key: 'AIConfidence', label: 'Confidence' },
      { key: 'Evidence', label: 'Evidence' },
      { key: 'RecommendedAction', label: 'Recommended Action' }
    ];

    exportToCSV(`Event_Intelligence_${activeIndustry}`, exportRows, columns);
  };

  /**
   * Reset all filters helper
   */
  const handleResetFilters = () => {
    setDateFilter('all');
    setCustomDate('');
    setShiftFilter('all');
    setSearchQuery('');
    setSeverityFilter('All');
    setEventTypeFilter('All');
    setAnomalyStatusFilter('all');
    setSelectedZoneFilter('All');
    setSelectedPersonFilter('All');
  };

  const isAnyFilterActive = 
    dateFilter !== 'all' || 
    shiftFilter !== 'all' || 
    searchQuery.trim() !== '' || 
    severityFilter !== 'All' || 
    eventTypeFilter !== 'All' || 
    anomalyStatusFilter !== 'all' || 
    selectedZoneFilter !== 'All' || 
    selectedPersonFilter !== 'All';

  // Severity color maps
  const getSeverityBadgeClass = (severity: EventSeverity) => {
    switch (severity) {
      case 'Critical':
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30';
      case 'Warning':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30';
      case 'Low':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700';
    }
  };

  const getEventTypeBadgeClass = (type: EventType) => {
    switch (type) {
      case 'Long Visit':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
      case 'Short Visit':
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20';
      case 'Repeated Visit':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20';
      case 'Unusual Activity':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Event & Incident Intelligence
                </h1>
                <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider bg-[#007BC4]/10 text-[#007BC4] border-[#007BC4]/30">
                  {activeIndustry} · {activeSubIndustry}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Statistical movement anomaly detection and continuous event intelligence derived from real RFID telemetry
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* MongoDB Atlas Persistence Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-400 text-xs font-semibold">
            <Database size={13} className="text-indigo-600 dark:text-indigo-400" />
            <span>MongoDB Atlas: {isMongoSynced ? 'Persisted' : 'Syncing'}</span>
          </div>

          {/* Connection Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>API Online · {totalSystemCount.toLocaleString()} Total Records</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadApiData(fetchBatchSize, true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition shadow-xs disabled:opacity-50"
            title="Refresh latest telemetry from API"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-[#007BC4]' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCsv}
            disabled={filteredEvents.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#007BC4] hover:bg-[#006cae] text-white text-xs font-medium transition shadow-xs disabled:opacity-50"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Action Toast Notification */}
      {actionToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>{actionToast}</span>
          </div>
          <button onClick={() => setActionToast(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* API Error Notification */}
      {apiError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1 text-xs">
            <p className="font-semibold">Telemetry API Ingestion Notice</p>
            <p className="mt-0.5 text-rose-700 dark:text-rose-300">{apiError}</p>
          </div>
          <button
            onClick={() => loadApiData(fetchBatchSize, true)}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-rose-600 text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. DYNAMIC KPI CARDS (Calculated strictly from API data) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Events */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Events</span>
            <Activity size={15} className="text-[#007BC4]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.totalEvents.toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">In current filter scope</p>
        </div>

        {/* Unique People */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Unique {personnelPlural}</span>
            <User size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.uniquePeople}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Distinct RFID tags identified</p>
        </div>

        {/* Active Zones */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active {zoneLabel}s</span>
            <MapPin size={15} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.activeZones}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Physical areas with movement</p>
        </div>

        {/* AI Anomalies */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">AI Anomalies</span>
            <Sparkles size={15} className={kpis.aiAnomalies > 0 ? 'text-amber-500 animate-bounce' : 'text-slate-400'} />
          </div>
          <div className={`text-2xl font-bold ${kpis.aiAnomalies > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.aiAnomalies}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {kpis.totalEvents > 0 ? `${((kpis.aiAnomalies / kpis.totalEvents) * 100).toFixed(1)}% anomaly rate` : '0%'}
          </p>
        </div>

        {/* Average Duration */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Average Dwell</span>
            <Clock size={15} className="text-cyan-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.averageDurationFormatted}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Per zone visit</p>
        </div>

        {/* Total Dwell Time */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Dwell</span>
            <TrendingUp size={15} className="text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.totalDwellFormatted}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Cumulative occupancy time</p>
        </div>
      </div>

      {/* 3. NAVIGATION VIEW SWITCHER */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'ledger'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Activity size={15} />
            <span>Event Ledger ({filteredEvents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('anomalies')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'anomalies'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles size={15} />
            <span>AI Anomaly Center</span>
            {kpis.aiAnomalies > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'anomalies' ? 'bg-white text-[#007BC4]' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {kpis.aiAnomalies}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('zones')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'zones'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart2 size={15} />
            <span>{zoneLabel} Analysis</span>
          </button>

          {selectedPersonTagId && (
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                activeTab === 'timeline'
                  ? 'bg-[#007BC4] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <History size={15} />
              <span>{personnelSingular} Timeline ({selectedPersonMeta?.name})</span>
            </button>
          )}
        </div>

        {/* Dataset Depth Selector */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:inline">Telemetry Batch:</span>
          <select
            value={fetchBatchSize}
            onChange={(e) => {
              const newSize = parseInt(e.target.value, 10);
              setFetchBatchSize(newSize);
              loadApiData(newSize, true);
            }}
            className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium"
          >
            <option value={100}>100 records</option>
            <option value={200}>200 records (Standard)</option>
            <option value={500}>500 records</option>
            <option value={1000}>1,000 records</option>
          </select>
        </div>
      </div>

      {/* 4. FILTERS SECTION (Real API filtering) */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Filter size={14} className="text-[#007BC4]" />
            <span>Filter Event Intelligence</span>
            {isAnyFilterActive && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-50 text-[#007BC4] text-[10px] font-semibold border border-blue-200">
                Active Filter Applied
              </span>
            )}
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1"
            >
              <X size={12} />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${personnelSingular.toLowerCase()}, tag, ${zoneLabel.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-[#007BC4] text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Date Filter */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="all">Date: All Available</option>
              <option value="today">Date: Today</option>
              <option value="yesterday">Date: Yesterday</option>
              <option value="custom">Date: Specific Date...</option>
            </select>
          </div>

          {/* Custom Date Input if selected */}
          {dateFilter === 'custom' && (
            <div>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>
          )}

          {/* Shift / Time Range Filter */}
          <div>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="all">Shift: All Hours (24h)</option>
              <option value="morning">Morning Shift (06:00 - 14:00)</option>
              <option value="afternoon">Afternoon Shift (14:00 - 22:00)</option>
              <option value="night">Night Shift (22:00 - 06:00)</option>
            </select>
          </div>

          {/* Zone Dropdown */}
          <div>
            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="All">{zoneLabel}: All {zoneLabel}s ({uniqueZones.length})</option>
              {uniqueZones.map((z) => (
                <option key={z} value={z}>{zoneLabel}: {z}</option>
              ))}
            </select>
          </div>

          {/* Person Dropdown */}
          <div>
            <select
              value={selectedPersonFilter}
              onChange={(e) => setSelectedPersonFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="All">{personnelSingular}: All ({uniquePeople.length})</option>
              {uniquePeople.map((p) => (
                <option key={p.tagId} value={p.tagId}>{p.name} ({p.tagId.slice(-6)})</option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="All">Severity: All Levels</option>
              <option value="Critical">Severity: Critical</option>
              <option value="Warning">Severity: Warning</option>
              <option value="Low">Severity: Low / Info</option>
              <option value="Normal">Severity: Normal</option>
            </select>
          </div>

          {/* Event Type Filter */}
          <div>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="All">Event Type: All Types</option>
              <option value="Zone Visit">Type: Zone Visit (Standard)</option>
              <option value="Short Visit">Type: Short Visit</option>
              <option value="Long Visit">Type: Long Visit</option>
              <option value="Repeated Visit">Type: Repeated Visit</option>
              <option value="Unusual Activity">Type: Unusual Activity</option>
            </select>
          </div>

          {/* AI Anomaly Status Filter */}
          <div>
            <select
              value={anomalyStatusFilter}
              onChange={(e) => setAnomalyStatusFilter(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="all">AI Status: All Events</option>
              <option value="anomalies_only">AI Status: Anomalies Only</option>
              <option value="normal_only">AI Status: Normal Events</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. TAB VIEW 1: EVENT INTELLIGENCE LEDGER (Primary Table) */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* AI Anomaly Highlights Banner (Top 4 Anomalies) */}
          {anomalyHighlights.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  <Sparkles size={14} className="text-amber-600 animate-spin" />
                  <span>AI Anomaly Highlights ({kpis.aiAnomalies} Detected in current scope)</span>
                </div>
                <button
                  onClick={() => setActiveTab('anomalies')}
                  className="text-xs text-amber-700 dark:text-amber-300 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <span>View Anomaly Center</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {anomalyHighlights.map((anom) => (
                  <div
                    key={anom.id}
                    onClick={() => setSelectedEvent(anom)}
                    className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-500/20 hover:border-amber-500/50 cursor-pointer transition shadow-2xs hover:shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0.2 ${getSeverityBadgeClass(anom.severity)}`}>
                        {anom.severity}
                      </Badge>
                      <span className="text-[10px] font-mono text-slate-400">
                        {anom.durationFormatted}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {anom.personName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {zoneLabel} {anom.locationName} · {anom.eventType}
                    </p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 line-clamp-2 leading-tight">
                      {anom.explanation.whatHappened}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MAIN EVENT INTELLIGENCE TABLE */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Telemetry Movement Ledger
                </h3>
                <p className="text-xs text-slate-500">
                  Showing {paginatedEvents.length} of {filteredEvents.length} filtered movement events
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  className="text-xs px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/75 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-500">
                    <TableHead className="w-24">Severity</TableHead>
                    <TableHead className="w-32">Event Type</TableHead>
                    <TableHead>{personnelSingular}</TableHead>
                    <TableHead className="w-36">Tag ID</TableHead>
                    <TableHead>{zoneLabel}</TableHead>
                    <TableHead>Enter Time</TableHead>
                    <TableHead>Leave Time</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="w-32">AI Status</TableHead>
                    <TableHead className="w-20 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading skeleton rows
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={10} className="py-4 text-center">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : paginatedEvents.length === 0 ? (
                    // Empty State
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-slate-500">
                        <div className="max-w-xs mx-auto space-y-2">
                          <Activity size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
                          <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                            No movement events found
                          </p>
                          <p className="text-xs text-slate-400">
                            {isAnyFilterActive ? 'Try adjusting your search criteria or resetting filters.' : 'Waiting for incoming telemetry records from people tracking API.'}
                          </p>
                          {isAnyFilterActive && (
                            <button
                              onClick={handleResetFilters}
                              className="mt-2 px-3 py-1.5 rounded-lg bg-[#007BC4] text-white text-xs font-medium"
                            >
                              Clear Filters
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEvents.map((evt) => (
                      <TableRow
                        key={evt.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition ${
                          evt.isAnomaly ? 'bg-amber-500/[0.03]' : ''
                        }`}
                        onClick={() => setSelectedEvent(evt)}
                      >
                        {/* Severity */}
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${getSeverityBadgeClass(evt.severity)}`}>
                            {evt.severity}
                          </Badge>
                        </TableCell>

                        {/* Event Type */}
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-medium px-2 py-0.5 ${getEventTypeBadgeClass(evt.eventType)}`}>
                            {evt.eventType}
                          </Badge>
                        </TableCell>

                        {/* Person Name (Clickable to Timeline) */}
                        <TableCell>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPersonTagId(evt.tagId);
                              setActiveTab('timeline');
                            }}
                            className="font-medium text-xs text-slate-900 dark:text-white hover:text-[#007BC4] dark:hover:text-[#007BC4] flex items-center gap-1.5 group text-left"
                            title={`Click to view movement timeline for ${evt.personName}`}
                          >
                            <span className="w-5 h-5 rounded-full bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center text-[10px] font-bold shrink-0">
                              {evt.personName.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="underline-offset-2 group-hover:underline">
                              {evt.personName}
                            </span>
                          </button>
                        </TableCell>

                        {/* Tag ID with copy button */}
                        <TableCell>
                          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                            <span title={evt.tagId}>{evt.tagId.slice(-8)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyTag(evt.tagId);
                              }}
                              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              title="Copy Tag ID"
                            >
                              {copiedTagId === evt.tagId ? (
                                <Check size={11} className="text-emerald-500" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </div>
                        </TableCell>

                        {/* Zone */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <MapPin size={11} className="text-[#007BC4]" />
                            {evt.locationName}
                          </span>
                        </TableCell>

                        {/* Enter Time */}
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {evt.enterTime}
                        </TableCell>

                        {/* Leave Time */}
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {evt.isOngoing ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                              Active in {zoneLabel}
                            </span>
                          ) : (
                            evt.leaveTime
                          )}
                        </TableCell>

                        {/* Duration */}
                        <TableCell className="text-right text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                          {evt.durationFormatted}
                        </TableCell>

                        {/* AI Status */}
                        <TableCell>
                          {evt.isAnomaly ? (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                              <Sparkles size={12} className="text-amber-500 shrink-0" />
                              <span>Anomaly ({evt.explanation.confidence}%)</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                              <span>Normal</span>
                            </div>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(evt);
                            }}
                            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-[#007BC4] transition"
                            title="Inspect Event Intelligence"
                          >
                            <Eye size={14} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <div>
                  Page {currentPage} of {totalPages} ({filteredEvents.length} events)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-2 font-medium">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. TAB VIEW 2: AI ANOMALY CENTER */}
      {activeTab === 'anomalies' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-[#007BC4]" />
                  <span>AI Anomaly Center · {activeIndustry.toUpperCase()}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Statistical deviations and pattern recognition based strictly on people tracking timestamps and dwell durations.
                </p>
              </div>
              <Badge variant="outline" className="text-xs self-start sm:self-auto font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300">
                {kpis.aiAnomalies} Anomalies Identified
              </Badge>
            </div>

            {/* Anomaly Grid */}
            {filteredEvents.filter(e => e.isAnomaly).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Zero Anomalies Detected
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  All recorded movement dwell times and entrance frequencies currently conform to historical baseline metrics.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {filteredEvents.filter(e => e.isAnomaly).map((anom) => (
                  <div
                    key={anom.id}
                    onClick={() => setSelectedEvent(anom)}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#007BC4] dark:hover:border-[#007BC4] bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer transition shadow-xs hover:shadow-md space-y-3"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getSeverityBadgeClass(anom.severity)}`}>
                          {anom.severity}
                        </Badge>
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getEventTypeBadgeClass(anom.eventType)}`}>
                          {anom.eventType}
                        </Badge>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#007BC4]">
                        Confidence: {anom.explanation.confidence}%
                      </span>
                    </div>

                    {/* Person & Zone */}
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {anom.personName}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px] block">
                          Tag: {anom.tagId}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {zoneLabel}: {anom.locationName}
                        </span>
                        <span className="text-slate-500 text-[11px] block">
                          Dwell: {anom.durationFormatted}
                        </span>
                      </div>
                    </div>

                    {/* What Happened */}
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 text-xs">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {anom.explanation.whatHappened}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-1">
                        <strong className="text-slate-700 dark:text-slate-300">Evidence:</strong> {anom.explanation.evidence}
                      </p>
                    </div>

                    {/* Recommended Action */}
                    <div className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                      <Info size={14} className="text-[#007BC4] shrink-0 mt-0.5" />
                      <p className="text-[11px]">
                        <strong>Recommended Next Step:</strong> {anom.explanation.recommendedAction}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. TAB VIEW 3: ZONE ANALYSIS */}
      {activeTab === 'zones' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart2 size={18} className="text-[#007BC4]" />
                <span>{zoneLabel} Movement Distribution & Statistical Baselines</span>
              </h3>
              <p className="text-xs text-slate-500">
                Comparative analysis of traffic density, average dwell times, and anomaly rates across {zoneLabel.toLowerCase()}s.
              </p>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-64 w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="zone" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      border: 'none',
                      color: '#f8fafc',
                      fontSize: '12px'
                    }}
                    formatter={(value: any, name: any) => [
                      name === 'eventCount' ? `${value} visits` : `${value}m average`,
                      name === 'eventCount' ? 'Total Visits' : 'Avg Dwell Duration'
                    ]}
                  />
                  <Bar dataKey="eventCount" name="eventCount" fill="#007BC4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgDurationMinutes" name="avgDurationMinutes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Zone Baselines Table */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                    <TableHead>{zoneLabel} Name</TableHead>
                    <TableHead className="text-right">Total Visits</TableHead>
                    <TableHead className="text-right">Unique People</TableHead>
                    <TableHead className="text-right">Median Dwell</TableHead>
                    <TableHead className="text-right">Mean Dwell</TableHead>
                    <TableHead className="text-right">Std Dev (σ)</TableHead>
                    <TableHead className="text-center">Data Sufficiency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zoneChartData.map((stat) => {
                    const base = zoneBaselines.get(stat.zone);
                    return (
                      <TableRow key={stat.zone} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs">
                        <TableCell className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <MapPin size={12} className="text-[#007BC4]" />
                          {stat.zone}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {stat.eventCount}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600 dark:text-slate-400">
                          {base?.uniquePeopleCount || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                          {base ? formatDuration(base.medianDurationMinutes) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600 dark:text-slate-400">
                          {base ? formatDuration(base.meanDurationMinutes) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {base ? formatDuration(base.stdDevDurationMinutes) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {base?.hasSufficientData ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border-emerald-300">
                              Established (n={base.eventCount})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 border-amber-300">
                              Insufficient Data (&lt; 3 visits)
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB VIEW 4: PERSON MOVEMENT TIMELINE */}
      {activeTab === 'timeline' && selectedPersonTagId && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            {/* Person Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold text-lg">
                  {selectedPersonMeta?.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedPersonMeta?.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span>Tag ID: {selectedPersonTagId}</span>
                    <button
                      onClick={() => handleCopyTag(selectedPersonTagId)}
                      className="hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <span className="text-slate-400 block">Total Visits</span>
                  <span className="font-bold text-slate-800 dark:text-white text-sm">
                    {personTimelineSteps.length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelectedPersonTagId(null);
                    setActiveTab('ledger');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Close Timeline
                </button>
              </div>
            </div>

            {/* Sequential Breadcrumb Trail */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/60 mb-6">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Chronological Transit Breadcrumb Sequence:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                {personTimelineSteps.map((step, idx) => (
                  <React.Fragment key={idx}>
                    <span className={`px-2 py-1 rounded border ${
                      step.isAnomaly
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}>
                      {step.transitionSummary}
                    </span>
                    {idx < personTimelineSteps.length - 1 && (
                      <ArrowRight size={12} className="text-slate-400 shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Detailed Timeline Step Cards */}
            <div className="space-y-3 relative before:absolute before:left-5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
              {personTimelineSteps.map((step) => (
                <div key={step.stepNumber} className="relative pl-10">
                  {/* Timeline bullet */}
                  <div className={`absolute left-3 top-3 w-4 h-4 rounded-full border-2 transform -translate-x-1/2 flex items-center justify-center ${
                    step.isAnomaly
                      ? 'bg-amber-500 border-white dark:border-slate-900'
                      : 'bg-[#007BC4] border-white dark:border-slate-900'
                  }`} />

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-xs transition">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-500">
                          Step #{step.stepNumber} · {step.timeString}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.2 ${getSeverityBadgeClass(step.severity)}`}>
                          {step.severity}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.2 ${getEventTypeBadgeClass(step.eventType)}`}>
                          {step.eventType}
                        </Badge>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                        Dwell: {step.durationFormatted}
                      </span>
                    </div>

                    <div className="mt-2 text-xs flex flex-wrap items-center justify-between text-slate-600 dark:text-slate-400">
                      <div>
                        <strong>Entered:</strong> {step.enterTime} &nbsp;|&nbsp; <strong>Left:</strong> {step.leaveTime}
                      </div>
                      <div className="text-slate-500">
                        {zoneLabel}: <span className="font-semibold text-slate-800 dark:text-slate-200">{step.zone}</span>
                      </div>
                    </div>

                    {step.transitGapMinutes !== undefined && (
                      <p className="text-[10px] text-slate-400 mt-1 italic">
                        Elapsed transit interval from previous zone: {step.transitGapMinutes} min(s)
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. EVENT DETAIL DRAWER / MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-xs px-2.5 py-0.5 ${getSeverityBadgeClass(selectedEvent.severity)}`}>
                    {selectedEvent.severity}
                  </Badge>
                  <Badge variant="outline" className={`text-xs px-2.5 py-0.5 ${getEventTypeBadgeClass(selectedEvent.eventType)}`}>
                    {selectedEvent.eventType}
                  </Badge>
                  {selectedEvent.isAnomaly && (
                    <Badge variant="outline" className="text-xs px-2.5 py-0.5 bg-amber-500/15 text-amber-600 border-amber-500/30 font-bold">
                      Confidence: {selectedEvent.explanation.confidence}%
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedEvent.personName}
                </h3>
                <p className="text-xs font-mono text-slate-400">
                  Tag ID: {selectedEvent.tagId} &nbsp;|&nbsp; {zoneLabel}: {selectedEvent.locationName}
                </p>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Time & Duration Breakdown */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Entry Timestamp</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5 block">
                  {selectedEvent.enterTime}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Exit Timestamp</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5 block">
                  {selectedEvent.leaveTime}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Duration</span>
                <span className="font-mono font-bold text-[#007BC4] text-xs mt-0.5 block">
                  {selectedEvent.durationFormatted} ({selectedEvent.durationMinutes.toFixed(2)} min)
                </span>
              </div>
            </div>

            {/* AI Explanation Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                <Sparkles size={14} className="text-[#007BC4]" />
                <span>AI Anomaly & Pattern Reasoning</span>
              </div>

              {selectedEvent.explanation.isInsufficientData ? (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs">
                  <p className="font-bold">
                    Insufficient historical data for reliable anomaly detection.
                  </p>
                  <p className="text-[11px] mt-1 text-amber-700 dark:text-amber-300">
                    {zoneLabel} {selectedEvent.locationName} currently has fewer than 3 recorded events. A statistically valid baseline requires continuous telemetry.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-300">What Happened:</span>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {selectedEvent.explanation.whatHappened}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-300">Evidence:</span>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {selectedEvent.explanation.evidence}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-300">Historical Comparison:</span>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {selectedEvent.explanation.historicalComparison}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-300">Statistical Trigger:</span>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {selectedEvent.explanation.whyUnusual}
                    </p>
                  </div>
                </div>
              )}

              {/* Recommended Action */}
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                <span className="font-bold block">Recommended Next Step ({activeIndustry}):</span>
                <p className="mt-0.5 text-[11px] text-blue-800 dark:text-blue-300">
                  {selectedEvent.explanation.recommendedAction}
                </p>
              </div>
            </div>

            {/* MongoDB Persistence Status in Modal */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-semibold">
                <Database size={14} className="text-indigo-600" />
                <span>MongoDB Incident Record:</span>
                <span className="font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-100 dark:border-indigo-800">
                  {mongoIncidentMeta[selectedEvent.id]?.status || 'OPEN'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['OPEN', 'INVESTIGATING', 'RESOLVED'] as const).map(st => (
                  <button
                    key={st}
                    onClick={async () => {
                      const docId = `inc_${selectedEvent.id}`;
                      await setDoc(doc(db, 'incidents', docId), {
                        id: docId,
                        eventId: selectedEvent.id,
                        status: st,
                        updatedAt: serverTimestamp()
                      });
                      setActionToast(`Updated incident ${selectedEvent.id} to "${st}" in MongoDB Atlas.`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                      (mongoIncidentMeta[selectedEvent.id]?.status || 'OPEN') === st
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Mark {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => {
                  setSelectedPersonTagId(selectedEvent.tagId);
                  setSelectedEvent(null);
                  setActiveTab('timeline');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
              >
                <History size={14} />
                <span>View Complete Movement Timeline</span>
              </button>

              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-1.5 rounded-lg bg-[#007BC4] hover:bg-[#006cae] text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
