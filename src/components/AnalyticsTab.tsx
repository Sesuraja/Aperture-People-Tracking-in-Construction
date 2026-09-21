import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  BarChart3, Users, Clock, Activity, MapPin, Calendar, 
  Search, Filter, RefreshCw, Download, Sparkles, TrendingUp, 
  ArrowRight, X, User, ChevronLeft, ChevronRight, Copy, Check, 
  Eye, History, ArrowUpRight, ArrowDownRight, Compass, Info,
  CheckCircle2, Layers, AlertCircle, Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend 
} from 'recharts';
import { useTerminology, useTracking } from '../context/TrackingContext';
import { gaoApi, HistoryRecord } from '../lib/gaoApi';
import { exportToCSV, ExportColumn } from '../lib/exportUtils';
import { db, doc, setDoc, batchSetDocs, collection, onSnapshot, serverTimestamp } from '../lib/db';
import {
  RawMovementRecord,
  NormalizedMovementEvent,
  AnalyticsKPIs,
  HourlyTrafficData,
  DailyTrafficData,
  ZoneAnalyticsSummary,
  PersonAnalyticsSummary,
  DurationAnalytics,
  AIObservation,
  normalizeRecords,
  calculateKPIs,
  calculateHourlyTraffic,
  calculateDailyTraffic,
  calculateZoneAnalytics,
  calculatePersonAnalytics,
  calculateDurationAnalytics,
  generateAIObservations,
  formatDurationHuman
} from '../lib/movementAnalytics';

export interface AnalyticsProps {
  people?: any[];
  isLoading?: boolean;
}

type TrendViewMode = 'hourly_volume' | 'unique_people' | 'hourly_dwell' | 'daily_trend';
type ActiveSectionTab = 'overview' | 'time' | 'zones' | 'people' | 'duration' | 'ai_observations';

export default function AnalyticsTab({ people = [], isLoading: externalLoading }: AnalyticsProps) {
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
  const activeSubIndustry = intelligenceProfile?.subIndustry || config?.subIndustry || config?.industryName || 'General Operations';

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

  // Raw API Data State
  const [rawRecords, setRawRecords] = useState<RawMovementRecord[]>([]);
  const [totalSystemCount, setTotalSystemCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fetchBatchSize, setFetchBatchSize] = useState<number>(200);
  const [isMongoSynced, setIsMongoSynced] = useState<boolean>(false);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<ActiveSectionTab>('overview');
  const [trendMode, setTrendMode] = useState<TrendViewMode>('hourly_volume');

  // Filters State
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'morning' | 'afternoon' | 'night'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('All');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('All');

  // Interactive Drill-Down Modals
  const [drillDownPersonTag, setDrillDownPersonTag] = useState<string | null>(null);
  const [drillDownZoneName, setDrillDownZoneName] = useState<string | null>(null);

  // Pagination for tables
  const [peoplePage, setPeoplePage] = useState<number>(1);
  const [peoplePageSize, setPeoplePageSize] = useState<number>(10);
  const [zonePage, setZonePage] = useState<number>(1);
  const [zonePageSize, setZonePageSize] = useState<number>(10);

  // Copy feedback
  const [copiedTagId, setCopiedTagId] = useState<string | null>(null);

  /**
   * 1. Load Telemetry Data from People-Tracking API
   */
  const loadData = useCallback(async (take: number = fetchBatchSize, showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setApiError(null);

    try {
      const [records, count] = await Promise.all([
        gaoApi.getHistoryRecords(0, take),
        gaoApi.getHistoryTotalCount()
      ]);

      setRawRecords(Array.isArray(records) ? records : []);
      setTotalSystemCount(count || records.length);
    } catch (err: any) {
      console.error('[AnalyticsTab] Error fetching API data:', err);
      setApiError(err.message || 'Unable to connect to people-tracking API endpoint.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchBatchSize]);

  useEffect(() => {
    loadData(fetchBatchSize);
  }, [loadData, fetchBatchSize]);

  /**
   * 2. Normalize raw records via movementAnalytics engine
   */
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

  /**
   * 3. Distinct Zones & Personnel for Filter Dropdowns
   */
  const uniqueZones = useMemo(() => {
    const set = new Set<string>();
    normalizedEvents.forEach(e => {
      if (e.locationName) set.add(e.locationName);
    });
    return Array.from(set).sort();
  }, [normalizedEvents]);

  const uniquePeopleList = useMemo(() => {
    const map = new Map<string, string>();
    normalizedEvents.forEach(e => {
      if (!map.has(e.tagId)) {
        map.set(e.tagId, e.personName);
      }
    });
    return Array.from(map.entries()).map(([tagId, name]) => ({ tagId, name }));
  }, [normalizedEvents]);

  /**
   * 4. Filtering Engine (Operates strictly on actual normalized API data)
   */
  const filteredEvents = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    return normalizedEvents.filter(evt => {
      // Date filter
      if (dateRange === 'today') {
        if (!evt.enterTime.startsWith(todayStr)) return false;
      } else if (dateRange === 'yesterday') {
        if (!evt.enterTime.startsWith(yesterdayStr)) return false;
      } else if (dateRange === '7d') {
        if (evt.dateString < sevenDaysAgoStr) return false;
      } else if (dateRange === '30d') {
        if (evt.dateString < thirtyDaysAgoStr) return false;
      } else if (dateRange === 'custom') {
        if (customStartDate && evt.dateString < customStartDate) return false;
        if (customEndDate && evt.dateString > customEndDate) return false;
      }

      // Time / Shift filter
      if (shiftFilter !== 'all') {
        const hour = evt.hourOfDay;
        if (shiftFilter === 'morning' && (hour < 6 || hour >= 14)) return false;
        if (shiftFilter === 'afternoon' && (hour < 14 || hour >= 22)) return false;
        if (shiftFilter === 'night' && (hour >= 6 && hour < 22)) return false;
      }

      // Zone filter
      if (selectedZoneFilter !== 'All' && evt.locationName !== selectedZoneFilter) {
        return false;
      }

      // Person filter
      if (selectedPersonFilter !== 'All' && evt.tagId !== selectedPersonFilter) {
        return false;
      }

      // Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = evt.personName.toLowerCase().includes(q);
        const matchesTag = evt.tagId.toLowerCase().includes(q);
        const matchesZone = evt.locationName.toLowerCase().includes(q);
        if (!matchesName && !matchesTag && !matchesZone) return false;
      }

      return true;
    });
  }, [
    normalizedEvents,
    dateRange,
    customStartDate,
    customEndDate,
    shiftFilter,
    selectedZoneFilter,
    selectedPersonFilter,
    searchQuery
  ]);

  /**
   * 5. Dynamic Calculations derived from Filtered Events
   */
  const kpis: AnalyticsKPIs = useMemo(() => {
    return calculateKPIs(filteredEvents);
  }, [filteredEvents]);

  const hourlyTraffic: HourlyTrafficData[] = useMemo(() => {
    return calculateHourlyTraffic(filteredEvents);
  }, [filteredEvents]);

  const dailyTraffic: DailyTrafficData[] = useMemo(() => {
    return calculateDailyTraffic(filteredEvents);
  }, [filteredEvents]);

  const zoneAnalytics: ZoneAnalyticsSummary[] = useMemo(() => {
    return calculateZoneAnalytics(filteredEvents);
  }, [filteredEvents]);

  const personAnalytics: PersonAnalyticsSummary[] = useMemo(() => {
    return calculatePersonAnalytics(filteredEvents);
  }, [filteredEvents]);

  const durationAnalytics: DurationAnalytics = useMemo(() => {
    return calculateDurationAnalytics(filteredEvents);
  }, [filteredEvents]);

  const aiObservations: AIObservation[] = useMemo(() => {
    return generateAIObservations(filteredEvents, {
      industry: activeIndustry,
      subIndustry: activeSubIndustry,
      zoneLabel,
      personnelSingular,
      personnelPlural,
      siteLabel
    });
  }, [filteredEvents, activeIndustry, activeSubIndustry, zoneLabel, personnelSingular, personnelPlural, siteLabel]);

  // Auto-sync calculated analytics intelligence to MongoDB Atlas
  const lastSyncedAnalyticsHashRef = useRef<string>('');
  useEffect(() => {
    if (rawRecords.length === 0 || normalizedEvents.length === 0) return;

    const hash = `${rawRecords.length}_${kpis.totalEvents}_${kpis.uniquePeople}_${aiObservations.length}`;
    if (lastSyncedAnalyticsHashRef.current === hash) return;
    lastSyncedAnalyticsHashRef.current = hash;

    // 1. Persist aggregated traffic metrics snapshot to MongoDB
    setDoc(doc(db, 'analytics_metrics', 'movement_summary'), {
      totalEvents: kpis.totalEvents,
      uniquePeople: kpis.uniquePeople,
      activeZones: kpis.activeZones,
      averageDurationMinutes: kpis.averageDurationMinutes,
      totalDwellMinutes: kpis.totalDwellMinutes,
      repeatVisitors: kpis.repeatVisitors,
      hourlyTraffic: hourlyTraffic.slice(0, 24),
      zoneAnalytics: zoneAnalytics.map(z => ({ 
        zone: z.zone, 
        visits: z.totalVisits, 
        uniquePeople: z.uniquePeople, 
        avgDuration: z.avgDurationFormatted 
      })),
      source: 'REAL_TIME_API_HISTORY',
      persistedAt: new Date().toISOString()
    }).catch(() => {});

    // 2. Persist AI observations in ONE single batch call
    if (aiObservations.length > 0) {
      const obsToSync = aiObservations.map(obs => ({
        id: `obs_${obs.id}`,
        ...obs,
        source: 'REAL_TIME_API_HISTORY',
        updatedAt: new Date().toISOString()
      }));
      batchSetDocs('ai_recommendations', obsToSync).then(() => {
        setIsMongoSynced(true);
      }).catch(err => {
        console.warn('[AnalyticsTab] batchSetDocs ai_recommendations error:', err);
      });
    }
  }, [rawRecords.length, normalizedEvents.length, kpis.totalEvents, kpis.uniquePeople, aiObservations.length]);

  // Reset pagination on filter changes
  useEffect(() => {
    setPeoplePage(1);
    setZonePage(1);
  }, [dateRange, shiftFilter, selectedZoneFilter, selectedPersonFilter, searchQuery]);

  // People Table Pagination
  const totalPeoplePages = Math.max(1, Math.ceil(personAnalytics.length / peoplePageSize));
  const paginatedPeople = useMemo(() => {
    const start = (peoplePage - 1) * peoplePageSize;
    return personAnalytics.slice(start, start + peoplePageSize);
  }, [personAnalytics, peoplePage, peoplePageSize]);

  // Zone Table Pagination
  const totalZonePages = Math.max(1, Math.ceil(zoneAnalytics.length / zonePageSize));
  const paginatedZones = useMemo(() => {
    const start = (zonePage - 1) * zonePageSize;
    return zoneAnalytics.slice(start, start + zonePageSize);
  }, [zoneAnalytics, zonePage, zonePageSize]);

  // Person Drill-Down Events
  const drillDownPersonEvents = useMemo(() => {
    if (!drillDownPersonTag) return [];
    return normalizedEvents
      .filter(e => e.tagId.toLowerCase() === drillDownPersonTag.toLowerCase())
      .sort((a, b) => a.enterDate.getTime() - b.enterDate.getTime());
  }, [normalizedEvents, drillDownPersonTag]);

  const drillDownPersonMeta = useMemo(() => {
    if (!drillDownPersonTag) return null;
    const p = personAnalytics.find(x => x.tagId === drillDownPersonTag);
    return p || { name: `Personnel (${drillDownPersonTag.slice(-6)})`, tagId: drillDownPersonTag };
  }, [personAnalytics, drillDownPersonTag]);

  // Zone Drill-Down Data
  const drillDownZoneMeta = useMemo(() => {
    if (!drillDownZoneName) return null;
    return zoneAnalytics.find(z => z.zone === drillDownZoneName) || null;
  }, [zoneAnalytics, drillDownZoneName]);

  const drillDownZoneHourly = useMemo(() => {
    if (!drillDownZoneName) return [];
    const zoneEvents = normalizedEvents.filter(e => e.locationName === drillDownZoneName);
    return calculateHourlyTraffic(zoneEvents);
  }, [normalizedEvents, drillDownZoneName]);

  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedTagId(text);
      setTimeout(() => setCopiedTagId(null), 2000);
    }
  };

  const handleResetFilters = () => {
    setDateRange('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setShiftFilter('all');
    setSearchQuery('');
    setSelectedZoneFilter('All');
    setSelectedPersonFilter('All');
  };

  const isAnyFilterActive = 
    dateRange !== 'all' || 
    shiftFilter !== 'all' || 
    searchQuery.trim() !== '' || 
    selectedZoneFilter !== 'All' || 
    selectedPersonFilter !== 'All';

  const handleExportCsv = () => {
    if (filteredEvents.length === 0) {
      alert('No analytics records available to export.');
      return;
    }

    const exportRows = filteredEvents.map(e => ({
      Person: e.personName,
      TagID: e.tagId,
      Zone: e.locationName,
      EnterTime: e.enterTime,
      LeaveTime: e.leaveTime,
      DurationMinutes: e.durationMinutes,
      DurationFormatted: e.durationFormatted,
      HourOfDay: e.hourOfDay,
      Date: e.dateString
    }));

    const columns: ExportColumn[] = [
      { key: 'Person', label: personnelSingular },
      { key: 'TagID', label: 'Tag ID' },
      { key: 'Zone', label: zoneLabel },
      { key: 'EnterTime', label: 'Enter Time' },
      { key: 'LeaveTime', label: 'Leave Time' },
      { key: 'DurationMinutes', label: 'Duration (mins)' },
      { key: 'DurationFormatted', label: 'Duration' },
      { key: 'HourOfDay', label: 'Hour (0-23)' },
      { key: 'Date', label: 'Date' }
    ];

    exportToCSV(`Movement_Analytics_${activeIndustry}`, exportRows, columns);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold">
              <BarChart3 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Movement & Traffic Analytics
                </h1>
                <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider bg-[#007BC4]/10 text-[#007BC4] border-[#007BC4]/30">
                  {activeIndustry} · {activeSubIndustry}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Multi-dimensional people flow, zone occupancy density, and dwell duration analytics derived strictly from real API telemetry
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Telemetry Active · {totalSystemCount.toLocaleString()} Records</span>
          </div>

          <button
            onClick={() => loadData(fetchBatchSize, true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition shadow-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-[#007BC4]' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

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

      {/* Error alert */}
      {apiError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1 text-xs">
            <p className="font-semibold">Telemetry API Ingestion Error</p>
            <p className="mt-0.5 text-rose-700 dark:text-rose-300">{apiError}</p>
          </div>
          <button
            onClick={() => loadData(fetchBatchSize, true)}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-rose-600 text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. DYNAMIC KPI CARDS (Calculated from API Data) */}
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
          <p className="text-[10px] text-slate-400 mt-1">Movement transits analyzed</p>
        </div>

        {/* Unique People */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Unique {personnelPlural}</span>
            <Users size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.uniquePeople}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Distinct Tag IDs detected</p>
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
          <p className="text-[10px] text-slate-400 mt-1">Distinct physical locations</p>
        </div>

        {/* Average Duration */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Average Duration</span>
            <Clock size={15} className="text-cyan-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.averageDurationFormatted}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Mean dwell per visit</p>
        </div>

        {/* Total Dwell Time */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Dwell Time</span>
            <TrendingUp size={15} className="text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.totalDwellFormatted}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Cumulative occupancy sum</p>
        </div>

        {/* Repeat Visitors */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Repeat Visitors</span>
            <History size={15} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {isLoading ? <span className="inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : kpis.repeatVisitors}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {kpis.uniquePeople > 0 ? `${Math.round((kpis.repeatVisitors / kpis.uniquePeople) * 100)}% of personnel` : '0%'}
          </p>
        </div>
      </div>

      {/* 3. FILTERS BAR */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Filter size={14} className="text-[#007BC4]" />
            <span>Filter Analytics Scope</span>
            {isAnyFilterActive && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-50 text-[#007BC4] text-[10px] font-semibold border border-blue-200">
                Active Filter
              </span>
            )}
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1"
            >
              <X size={12} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
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

          {/* Date Range Selector */}
          <div>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="all">Date: All Available</option>
              <option value="today">Date: Today</option>
              <option value="yesterday">Date: Yesterday</option>
              <option value="7d">Date: Last 7 Days</option>
              <option value="30d">Date: Last 30 Days</option>
              <option value="custom">Date: Custom Range...</option>
            </select>
          </div>

          {/* Custom Dates if selected */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                title="Start Date"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                title="End Date"
              />
            </div>
          )}

          {/* Time / Shift Range Selector */}
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

          {/* Zone Filter */}
          <div>
            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="All">{zoneLabel}: All {zoneLabel}s ({uniqueZones.length})</option>
              {uniqueZones.map(z => (
                <option key={z} value={z}>{zoneLabel}: {z}</option>
              ))}
            </select>
          </div>

          {/* Person Filter */}
          <div>
            <select
              value={selectedPersonFilter}
              onChange={(e) => setSelectedPersonFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007BC4]"
            >
              <option value="All">{personnelSingular}: All ({uniquePeopleList.length})</option>
              {uniquePeopleList.map(p => (
                <option key={p.tagId} value={p.tagId}>{p.name} ({p.tagId.slice(-6)})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. SECTION TABS */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 size={15} />
            <span>Dashboard Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('time')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'time'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar size={15} />
            <span>Time & Trend Analysis</span>
          </button>

          <button
            onClick={() => setActiveTab('zones')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'zones'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MapPin size={15} />
            <span>{zoneLabel} Analytics ({zoneAnalytics.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('people')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'people'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users size={15} />
            <span>{personnelSingular} Activity ({personAnalytics.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('duration')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'duration'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Clock size={15} />
            <span>Duration Distribution</span>
          </button>

          <button
            onClick={() => setActiveTab('ai_observations')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'ai_observations'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles size={15} className="text-amber-500" />
            <span>AI Observations ({aiObservations.filter(o => !o.insufficientData).length})</span>
          </button>
        </div>

        {/* Telemetry Record Selector */}
        <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
          <span className="hidden sm:inline">Telemetry Scope:</span>
          <select
            value={fetchBatchSize}
            onChange={(e) => {
              const sz = parseInt(e.target.value, 10);
              setFetchBatchSize(sz);
              loadData(sz, true);
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

      {/* 5. TAB 1: DASHBOARD OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* AI Observation Highlights */}
          {aiObservations.length > 0 && !aiObservations[0].insufficientData && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                  <Sparkles size={15} className="text-[#007BC4]" />
                  <span>AI Movement Intelligence Observations</span>
                </div>
                <button
                  onClick={() => setActiveTab('ai_observations')}
                  className="text-xs text-[#007BC4] font-semibold hover:underline flex items-center gap-1"
                >
                  <span>View All Observations</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {aiObservations.slice(0, 4).map((obs) => (
                  <div key={obs.id} className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                        {obs.metric}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-300">
                        {obs.change}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">
                      {obs.currentValue}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight">
                      {obs.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dual Charts Grid: Activity Trend & Zone Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Activity Trend */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Hourly Movement Flow
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Distribution of entries and unique {personnelPlural.toLowerCase()} across 24h cycle
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px]">
                  <button
                    onClick={() => setTrendMode('hourly_volume')}
                    className={`px-2 py-1 rounded font-medium ${trendMode === 'hourly_volume' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-white' : 'text-slate-500'}`}
                  >
                    Volume
                  </button>
                  <button
                    onClick={() => setTrendMode('unique_people')}
                    className={`px-2 py-1 rounded font-medium ${trendMode === 'unique_people' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-white' : 'text-slate-500'}`}
                  >
                    Personnel
                  </button>
                </div>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyTraffic} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hourlyColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#007BC4" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#007BC4" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="hourLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#f8fafc', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [val, name === 'eventCount' ? 'Movement Events' : 'Distinct People']}
                    />
                    <Area
                      type="monotone"
                      dataKey={trendMode === 'hourly_volume' ? 'eventCount' : 'uniquePeople'}
                      name={trendMode === 'hourly_volume' ? 'eventCount' : 'uniquePeople'}
                      stroke="#007BC4"
                      fillOpacity={1}
                      fill="url(#hourlyColor)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Zone Activity */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {zoneLabel} Traffic & Occupancy
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Total transit volume and mean dwell per {zoneLabel.toLowerCase()}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('zones')}
                  className="text-xs text-[#007BC4] font-semibold hover:underline flex items-center gap-1"
                >
                  <span>Detailed Table</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={zoneAnalytics.slice(0, 6)} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="zone" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#f8fafc', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [
                        name === 'totalVisits' ? `${val} visits` : `${val} mins avg`,
                        name === 'totalVisits' ? 'Total Visits' : 'Average Dwell'
                      ]}
                    />
                    <Bar dataKey="totalVisits" name="totalVisits" fill="#007BC4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avgDurationMinutes" name="avgDurationMinutes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Quick Previews: Top People & Duration Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Personnel by Visits */}
            <div className="lg:col-span-2 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Active {personnelPlural} Highlights
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Highest movement frequency recorded in current filter scope
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('people')}
                  className="text-xs text-[#007BC4] font-semibold hover:underline"
                >
                  View All ({personAnalytics.length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px] uppercase text-slate-500">
                      <TableHead>{personnelSingular}</TableHead>
                      <TableHead>Tag ID</TableHead>
                      <TableHead className="text-right">Total Visits</TableHead>
                      <TableHead className="text-right">{zoneLabel}s Visited</TableHead>
                      <TableHead className="text-right">Average Dwell</TableHead>
                      <TableHead className="text-right">Total Dwell</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personAnalytics.slice(0, 5).map((p) => (
                      <TableRow 
                        key={p.tagId}
                        onClick={() => setDrillDownPersonTag(p.tagId)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs"
                      >
                        <TableCell className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center text-[10px] font-bold shrink-0">
                            {p.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span>{p.name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-slate-500">
                          {p.tagId.slice(-8)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {p.totalVisits}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600 dark:text-slate-400">
                          {p.distinctZonesCount}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600 dark:text-slate-400">
                          {p.avgDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-[#007BC4]">
                          {p.totalDwellFormatted}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Dwell Breakdown Mini Card */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Duration Profile
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dwell time distribution across all records
                </p>
              </div>

              <div className="space-y-2 pt-1">
                {durationAnalytics.distribution.map((b) => (
                  <div key={b.range} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">{b.label}</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{b.count} ({b.percentage}%)</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div 
                        className="h-full bg-[#007BC4] rounded-full" 
                        style={{ width: `${b.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">Median Duration:</span>
                <span className="font-bold text-slate-800 dark:text-white font-mono">
                  {durationAnalytics.medianDurationFormatted}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB 2: TIME & TREND ANALYSIS */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          {/* View Mode Controls */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar size={18} className="text-[#007BC4]" />
                  <span>Time Series & Traffic Heat Trends</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Continuous chronological movement telemetry aggregated across diurnal intervals.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setTrendMode('hourly_volume')}
                  className={`px-3 py-1.5 rounded-md transition ${trendMode === 'hourly_volume' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold' : 'text-slate-500'}`}
                >
                  Events by Hour
                </button>
                <button
                  onClick={() => setTrendMode('unique_people')}
                  className={`px-3 py-1.5 rounded-md transition ${trendMode === 'unique_people' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold' : 'text-slate-500'}`}
                >
                  {personnelPlural} by Hour
                </button>
                <button
                  onClick={() => setTrendMode('hourly_dwell')}
                  className={`px-3 py-1.5 rounded-md transition ${trendMode === 'hourly_dwell' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold' : 'text-slate-500'}`}
                >
                  Avg Dwell by Hour
                </button>
                <button
                  onClick={() => setTrendMode('daily_trend')}
                  className={`px-3 py-1.5 rounded-md transition ${trendMode === 'daily_trend' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold' : 'text-slate-500'}`}
                >
                  Events by Day
                </button>
              </div>
            </div>

            {/* Time Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {trendMode === 'daily_trend' ? (
                  <BarChart data={dailyTraffic} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#f8fafc', fontSize: '12px' }}
                      formatter={(val: any, name: any) => [val, name === 'eventCount' ? 'Movement Events' : 'Total Dwell Minutes']}
                    />
                    <Bar dataKey="eventCount" name="eventCount" fill="#007BC4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={hourlyTraffic} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="timeColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={trendMode === 'hourly_dwell' ? '#8b5cf6' : '#007BC4'} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={trendMode === 'hourly_dwell' ? '#8b5cf6' : '#007BC4'} stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#f8fafc', fontSize: '12px' }}
                      formatter={(val: any) => [
                        trendMode === 'hourly_dwell' ? `${val} mins` : val,
                        trendMode === 'hourly_volume' ? 'Events' : trendMode === 'unique_people' ? 'Distinct People' : 'Avg Dwell Duration'
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey={
                        trendMode === 'hourly_volume' 
                          ? 'eventCount' 
                          : trendMode === 'unique_people' 
                          ? 'uniquePeople' 
                          : 'avgDurationMinutes'
                      }
                      stroke={trendMode === 'hourly_dwell' ? '#8b5cf6' : '#007BC4'}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#timeColor)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB 3: ZONE ANALYTICS TABLE */}
      {activeTab === 'zones' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin size={18} className="text-[#007BC4]" />
                  <span>{zoneLabel} Movement Ledger & Analytics</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Full aggregate traffic breakdown, baseline dwell metrics, and repeat visitor cadence across all physical {zoneLabel.toLowerCase()}s. Click any row for deep-dive.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Rows:</span>
                <select
                  value={zonePageSize}
                  onChange={(e) => setZonePageSize(parseInt(e.target.value, 10))}
                  className="text-xs px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] uppercase tracking-wider text-slate-500">
                    <TableHead>{zoneLabel} Name</TableHead>
                    <TableHead className="text-right">Total Visits</TableHead>
                    <TableHead className="text-right">Unique People</TableHead>
                    <TableHead className="text-right">Repeat Visitors</TableHead>
                    <TableHead className="text-right">Average Dwell</TableHead>
                    <TableHead className="text-right">Min Dwell</TableHead>
                    <TableHead className="text-right">Max Dwell</TableHead>
                    <TableHead className="text-right">Total Dwell</TableHead>
                    <TableHead>First Activity</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedZones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                        No {zoneLabel.toLowerCase()} records match current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedZones.map((z) => (
                      <TableRow
                        key={z.zone}
                        onClick={() => setDrillDownZoneName(z.zone)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs transition"
                      >
                        <TableCell className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <MapPin size={12} className="text-[#007BC4]" />
                          {z.zone}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-white">
                          {z.totalVisits}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600 dark:text-slate-400">
                          {z.uniquePeople}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          {z.repeatVisitors}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-[#007BC4]">
                          {z.avgDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {z.minDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {z.maxDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {z.totalDwellFormatted}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                          {z.firstActivity}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                          {z.lastActivity}
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrillDownZoneName(z.zone);
                            }}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-[#007BC4]"
                            title="Inspect Zone Analytics"
                          >
                            <Eye size={13} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalZonePages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>Page {zonePage} of {totalZonePages}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZonePage(p => Math.max(1, p - 1))}
                    disabled={zonePage === 1}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => setZonePage(p => Math.min(totalZonePages, p + 1))}
                    disabled={zonePage === totalZonePages}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. TAB 4: PEOPLE ACTIVITY TABLE */}
      {activeTab === 'people' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users size={18} className="text-[#007BC4]" />
                  <span>{personnelSingular} Movement Activity & Dwell Ledger</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Per-tag visit counts, dwell statistics, and multi-zone mobility. Click any row to view complete movement history.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Rows:</span>
                <select
                  value={peoplePageSize}
                  onChange={(e) => setPeoplePageSize(parseInt(e.target.value, 10))}
                  className="text-xs px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] uppercase tracking-wider text-slate-500">
                    <TableHead>{personnelSingular}</TableHead>
                    <TableHead>Tag ID</TableHead>
                    <TableHead className="text-right">Total Visits</TableHead>
                    <TableHead className="text-right">{zoneLabel}s Visited</TableHead>
                    <TableHead className="text-right">Average Dwell</TableHead>
                    <TableHead className="text-right">Min Dwell</TableHead>
                    <TableHead className="text-right">Max Dwell</TableHead>
                    <TableHead className="text-right">Total Dwell</TableHead>
                    <TableHead>First Activity</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-center">History</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPeople.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                        No {personnelSingular.toLowerCase()} records match current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPeople.map((p) => (
                      <TableRow
                        key={p.tagId}
                        onClick={() => setDrillDownPersonTag(p.tagId)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs transition"
                      >
                        <TableCell className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center text-[10px] font-bold shrink-0">
                            {p.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span>{p.name}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                            <span>{p.tagId.slice(-8)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(p.tagId);
                              }}
                              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              title="Copy Tag ID"
                            >
                              {copiedTagId === p.tagId ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-white">
                          {p.totalVisits}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600 dark:text-slate-400">
                          {p.distinctZonesCount}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-[#007BC4]">
                          {p.avgDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {p.minDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {p.maxDurationFormatted}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {p.totalDwellFormatted}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                          {p.firstActivity}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                          {p.lastActivity}
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrillDownPersonTag(p.tagId);
                            }}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-[#007BC4]"
                            title="View Movement Timeline"
                          >
                            <History size={13} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPeoplePages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>Page {peoplePage} of {totalPeoplePages}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPeoplePage(p => Math.max(1, p - 1))}
                    disabled={peoplePage === 1}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => setPeoplePage(p => Math.min(totalPeoplePages, p + 1))}
                    disabled={peoplePage === totalPeoplePages}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. TAB 5: DURATION DISTRIBUTION */}
      {activeTab === 'duration' && (
        <div className="space-y-6">
          {/* Duration Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Median Dwell</span>
              <span className="text-2xl font-bold font-mono text-[#007BC4]">
                {durationAnalytics.medianDurationFormatted}
              </span>
              <p className="text-[10px] text-slate-400 mt-1">50th percentile of visits</p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Average Dwell</span>
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {durationAnalytics.avgDurationFormatted}
              </span>
              <p className="text-[10px] text-slate-400 mt-1">Arithmetic mean of all visits</p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Shortest Visit</span>
              <span className="text-2xl font-bold font-mono text-emerald-600">
                {durationAnalytics.minDurationFormatted}
              </span>
              <p className="text-[10px] text-slate-400 mt-1">Minimum recorded dwell</p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Longest Visit</span>
              <span className="text-2xl font-bold font-mono text-purple-600">
                {durationAnalytics.maxDurationFormatted}
              </span>
              <p className="text-[10px] text-slate-400 mt-1">Maximum recorded dwell</p>
            </div>
          </div>

          {/* Distribution Bar Chart */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Dwell Duration Bucket Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Categorization of visit dwell times from quick transit swipes to prolonged stays
            </p>

            <div className="h-60 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationAnalytics.distribution} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#f8fafc', fontSize: '12px' }}
                    formatter={(val: any) => [`${val} visits`, 'Visit Count']}
                  />
                  <Bar dataKey="count" name="count" fill="#007BC4" radius={[4, 4, 0, 0]}>
                    {durationAnalytics.distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#06b6d4' : index === 4 ? '#8b5cf6' : '#007BC4'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Shortest vs Longest Records */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Shortest */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Top 5 Shortest Visits (Transits)
              </h4>
              <div className="space-y-2">
                {durationAnalytics.shortestVisits.map((e, idx) => (
                  <div key={e.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">{e.personName}</span>
                      <span className="text-slate-400 text-[11px]">{zoneLabel} {e.locationName} · {e.enterTime}</span>
                    </div>
                    <span className="font-mono font-bold text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-200">
                      {e.durationFormatted}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Longest */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Top 5 Longest Visits (Extended Stays)
              </h4>
              <div className="space-y-2">
                {durationAnalytics.longestVisits.map((e, idx) => (
                  <div key={e.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">{e.personName}</span>
                      <span className="text-slate-400 text-[11px]">{zoneLabel} {e.locationName} · {e.enterTime}</span>
                    </div>
                    <span className="font-mono font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200">
                      {e.durationFormatted}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. TAB 6: AI OBSERVATIONS */}
      {activeTab === 'ai_observations' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles size={18} className="text-[#007BC4]" />
                <span>Evidence-Based AI Movement Observations</span>
              </h3>
              <p className="text-xs text-slate-500">
                Mathematical deviations and pattern discoveries derived strictly from real API timestamps and dwell metrics.
              </p>
            </div>

            {aiObservations.length === 0 || aiObservations[0].insufficientData ? (
              <div className="py-12 text-center space-y-2">
                <AlertCircle size={32} className="mx-auto text-amber-500" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Insufficient Historical Data
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  A statistically valid comparison requires at least 5 movement records in the active filter scope.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiObservations.map((obs) => (
                  <div key={obs.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                        {obs.metric}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-300">
                          {obs.change}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {obs.confidence}% Confidence
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400 text-[10px] uppercase block">Observed Metric</span>
                        <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{obs.currentValue}</span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400 text-[10px] uppercase block">Comparative Baseline</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300 mt-0.5 block">{obs.baselineValue}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-blue-50/60 dark:bg-blue-950/30 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900">
                      <strong className="text-blue-900 dark:text-blue-200 block mb-0.5">Statistical Reasoning:</strong>
                      {obs.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. MODAL: PERSON MOVEMENT HISTORY */}
      {drillDownPersonTag && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User size={18} className="text-[#007BC4]" />
                  <span>{drillDownPersonMeta?.name}</span>
                </h3>
                <p className="text-xs font-mono text-slate-400">
                  Tag ID: {drillDownPersonTag} · {drillDownPersonEvents.length} Recorded Visits
                </p>
              </div>
              <button
                onClick={() => setDrillDownPersonTag(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sequential Breadcrumb Trail */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Chronological Movement Path:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                {drillDownPersonEvents.map((evt, idx) => {
                  const hh = String(evt.enterDate.getHours()).padStart(2, '0');
                  const mm = String(evt.enterDate.getMinutes()).padStart(2, '0');
                  const ss = String(evt.enterDate.getSeconds()).padStart(2, '0');
                  return (
                    <React.Fragment key={evt.id}>
                      <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                        {`${hh}:${mm}:${ss}`} → {evt.locationName}
                      </span>
                      {idx < drillDownPersonEvents.length - 1 && (
                        <ArrowRight size={11} className="text-slate-400 shrink-0" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* List of individual visits */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {drillDownPersonEvents.map((e, idx) => (
                <div key={e.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      #{idx + 1} · {zoneLabel}: {e.locationName}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {e.enterTime} &nbsp;→&nbsp; {e.leaveTime}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-[#007BC4] bg-[#007BC4]/10 px-2 py-0.5 rounded">
                    {e.durationFormatted}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setDrillDownPersonTag(null)}
                className="px-4 py-1.5 rounded-lg bg-[#007BC4] hover:bg-[#006cae] text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12. MODAL: DETAILED ZONE ANALYTICS */}
      {drillDownZoneName && drillDownZoneMeta && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin size={18} className="text-[#007BC4]" />
                  <span>{zoneLabel}: {drillDownZoneName}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Total Visits: {drillDownZoneMeta.totalVisits} · Unique People: {drillDownZoneMeta.uniquePeople}
                </p>
              </div>
              <button
                onClick={() => setDrillDownZoneName(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dwell Metrics */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 text-[10px] uppercase block">Average Dwell</span>
                <span className="font-bold font-mono text-[#007BC4] text-sm mt-0.5 block">
                  {drillDownZoneMeta.avgDurationFormatted}
                </span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 text-[10px] uppercase block">Total Dwell</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white text-sm mt-0.5 block">
                  {drillDownZoneMeta.totalDwellFormatted}
                </span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 text-[10px] uppercase block">Repeat Visitors</span>
                <span className="font-bold font-mono text-amber-600 text-sm mt-0.5 block">
                  {drillDownZoneMeta.repeatVisitors}
                </span>
              </div>
            </div>

            {/* Hourly Profile for this zone */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Hourly Entry Distribution for {drillDownZoneName}
              </span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillDownZoneHourly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="hourLabel" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#f8fafc', fontSize: '11px' }}
                      formatter={(val: any) => [`${val} visits`, 'Visits']}
                    />
                    <Bar dataKey="eventCount" fill="#007BC4" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setDrillDownZoneName(null)}
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
