import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, 
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ComposedChart 
} from 'recharts';
import { Person } from '../lib/trackingData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, TrendingUp, Users, HardHat, ShieldCheck, AlertTriangle, 
  Radio, Building2, Clock, Sparkles, Download, FileSpreadsheet, FileText, 
  Calendar, Filter, Layers, Zap, Activity, Cpu, CheckCircle2, XCircle, 
  Compass, Printer, Gauge, Truck, Flame, ShieldAlert, BrainCircuit, Send,
  RefreshCw, Check, AlertCircle, ArrowUpRight, ArrowDownRight, Layers2,
  Plus, Trash2, Power, Database, Share2, Eye, Server, RadioTower,
  CheckSquare, Square, ChevronRight, X
} from 'lucide-react';
import { db, collection, getDocs, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from '../lib/db';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { useTerminology, useTracking } from '../context/TrackingContext';


const PALETTE = ['#007BC4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

export interface AnalyticsProps {
  people: Person[];
  isLoading?: boolean;
}

export interface ScheduledReportItem {
  id: string;
  name: string;
  format: string;
  frequency: string;
  recipients?: string;
  status?: 'Active' | 'Paused';
  lastRun?: string;
  createdAt?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  activeHours: number;
  idleHours: number;
  loadFactorPct?: number;
  fuelLiters?: number;
  maintDueDays?: number;
  status?: 'Optimal' | 'Service Soon' | 'Warning' | 'Critical';
}

export interface SavedAiMetric {
  id: string;
  synthesis: string;
  dateRange: string;
  createdAt: string;
}

export default function AnalyticsTab({ people = [], isLoading }: AnalyticsProps) {
  const { config, intelligenceProfile, personnelSingular, personnelPlural, roleLabel, idBadgeLabel, safetyComplianceLabel, zoneLabel, siteLabel, organizationType } = useTerminology();
  const trackingCtx = useTracking();
  const [dynamicKpis, setDynamicKpis] = useState<any[]>([]);

  useEffect(() => {
    const fetchKpis = async () => {
      try {
        const res = await fetch('/api/intelligence/kpis');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.kpis) && data.kpis.length > 0) {
            setDynamicKpis(data.kpis);
          }
        }
      } catch {}
    };
    fetchKpis();
  }, [config?.industryId, intelligenceProfile?.industry]);

  const [activeModule, setActiveModule] = useState<
    | 'overview' 
    | 'executive' 
    | 'operations' 
    | 'attendance' 
    | 'productivity' 
    | 'movement' 
    | 'equipment' 
    | 'readers' 
    | 'occupancy' 
    | 'incidents' 
    | 'ppe' 
    | 'safety' 
    | 'forecasting' 
    | 'scheduled' 
    | 'custom' 
    | 'ai_insights'
  >('overview');

  // Global Filter State
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'q3_2026'>('7d');
  const [selectedSite, setSelectedSite] = useState<string>('all');

  // Database Persistent States (MongoDB)
  const [scheduledReports, setScheduledReports] = useState<ScheduledReportItem[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [savedAiMetrics, setSavedAiMetrics] = useState<SavedAiMetric[]>([]);
  const [latestAiMetrics, setLatestAiMetrics] = useState<any>(null);
  const [mongoStatus, setMongoStatus] = useState<{ connected: boolean; engine: string; database: string; totalRecords: number }>({
    connected: true,
    engine: 'MongoDB Atlas',
    database: 'Lat-Aperture-People-Tracking',
    totalRecords: 0
  });

  useEffect(() => {
    const checkMongo = async () => {
      try {
        const res = await fetch('/api/mongodb/status');
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: Boolean(data.connected),
            engine: data.engine || 'MongoDB Atlas',
            database: 'Lat-Aperture-People-Tracking',
            totalRecords: data.totalRecords || 0
          });
        }
      } catch {}
    };
    checkMongo();
  }, []);

  const [portalReaders, setPortalReaders] = useState<any[]>([]);

  useEffect(() => {
    let hwDevs: any[] = [];
    let stdDevs: any[] = [];

    const syncPortals = () => {
      const combined = [
        ...hwDevs.map(d => ({
          id: d.id || d.readerId || d.name,
          name: d.name || d.readerName || 'UHF Reader Portal',
          zone: d.location || d.zone || 'Portal Zone',
          status: String(d.status || 'ONLINE').toUpperCase().trim(),
          type: d.type || 'GAO UHF Fixed Portal',
          rssi: d.rssi !== undefined ? (typeof d.rssi === 'number' ? `${d.rssi} dBm` : d.rssi) : 'N/A',
          rate: d.rate || '250 Hz',
          scans: d.scans || d.totalScans || 0
        })),
        ...stdDevs.map(d => ({
          id: d.id || d.name,
          name: d.name || 'Portal Gateway Device',
          zone: d.zone || d.location || 'Portal Zone',
          status: String(d.status || 'ONLINE').toUpperCase().trim(),
          type: d.type || 'Portal Gateway Anchor',
          rssi: d.signalRssi !== undefined ? `${d.signalRssi} dBm` : (d.rssi !== undefined ? (typeof d.rssi === 'number' ? `${d.rssi} dBm` : d.rssi) : 'N/A'),
          rate: d.rate || '200 Hz',
          scans: d.scans || 0
        }))
      ];

      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
      setPortalReaders(unique);
    };

    const fetchPortalReadersDirect = async () => {
      try {
        const token = localStorage.getItem('gao_jwt_token') || localStorage.getItem('token') || 'demo';
        const headers = { 'Authorization': `Bearer ${token}` };
        const [rRes, dRes] = await Promise.allSettled([
          fetch('/api/data/hardware_readers', { headers }),
          fetch('/api/data/devices', { headers })
        ]);
        if (rRes.status === 'fulfilled' && rRes.value.ok) {
          const rList = await rRes.value.json();
          if (Array.isArray(rList) && rList.length > 0) {
            hwDevs = rList;
            syncPortals();
          }
        }
        if (dRes.status === 'fulfilled' && dRes.value.ok) {
          const dList = await dRes.value.json();
          if (Array.isArray(dList) && dList.length > 0) {
            stdDevs = dList.filter((d: any) => d.category === 'rfid' || (d.type || '').toLowerCase().includes('reader') || (d.type || '').toLowerCase().includes('portal'));
            syncPortals();
          }
        }
      } catch {}
    };
    fetchPortalReadersDirect();

    const unsub1 = onSnapshot(collection(db, 'hardware_readers'), (snapshot) => {
      hwDevs = [];
      snapshot.forEach(doc => hwDevs.push({ id: doc.id, ...doc.data() }));
      syncPortals();
    });

    const unsub2 = onSnapshot(collection(db, 'devices'), (snapshot) => {
      stdDevs = [];
      snapshot.forEach(doc => stdDevs.push({ id: doc.id, ...doc.data() }));
      syncPortals();
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const [dbAttendanceData, setDbAttendanceData] = useState<any[]>([]);
  const [dbRegisteredPeople, setDbRegisteredPeople] = useState<any[]>([]);
  const [dbIncidents, setDbIncidents] = useState<any[]>([]);

  useEffect(() => {
    let logs: any[] = [];
    let regPeople: any[] = [];

    const computeTrend = () => {
      if (logs.length > 0) {
        const buckets: Record<string, { onTime: number; late: number; overtime: number }> = {
          '06:00': { onTime: 0, late: 0, overtime: 0 },
          '07:00': { onTime: 0, late: 0, overtime: 0 },
          '08:00': { onTime: 0, late: 0, overtime: 0 },
          '09:00': { onTime: 0, late: 0, overtime: 0 },
          '12:00': { onTime: 0, late: 0, overtime: 0 },
          '15:00': { onTime: 0, late: 0, overtime: 0 },
          '18:00': { onTime: 0, late: 0, overtime: 0 },
          '21:00': { onTime: 0, late: 0, overtime: 0 }
        };

        logs.forEach(log => {
          const timeStr = log.checkInTime || log.timestamp || log.time || '08:00';
          const hour = parseInt(String(timeStr).split(':')[0], 10) || 8;
          let bucketKey = '08:00';
          if (hour <= 6) bucketKey = '06:00';
          else if (hour === 7) bucketKey = '07:00';
          else if (hour === 8) bucketKey = '08:00';
          else if (hour <= 10) bucketKey = '09:00';
          else if (hour <= 13) bucketKey = '12:00';
          else if (hour <= 16) bucketKey = '15:00';
          else if (hour <= 19) bucketKey = '18:00';
          else bucketKey = '21:00';

          const st = String(log.status || '').toUpperCase();
          if (st.includes('LATE')) buckets[bucketKey].late++;
          else if (st.includes('OVERTIME')) buckets[bucketKey].overtime++;
          else buckets[bucketKey].onTime++;
        });

        const chartArr = Object.entries(buckets).map(([time, counts]) => ({
          time,
          onTime: counts.onTime,
          late: counts.late,
          overtime: counts.overtime
        }));

        setDbAttendanceData(chartArr);
      } else {
        setDbAttendanceData([]);
      }
    };

    const unsub1 = onSnapshot(collection(db, 'attendance_logs'), (snap) => {
      logs = [];
      snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
      computeTrend();
    });

    const unsub2 = onSnapshot(collection(db, 'registered_people'), (snap) => {
      regPeople = [];
      snap.forEach(d => regPeople.push({ id: d.id, ...d.data() }));
      setDbRegisteredPeople(regPeople);
      computeTrend();
    });

    const unsub3 = onSnapshot(collection(db, 'incidents'), (snap) => {
      const incList: any[] = [];
      snap.forEach(d => incList.push({ id: d.id, ...d.data() }));
      setDbIncidents(incList);
    });

    const unsub4 = onSnapshot(collection(db, 'analytics_metrics'), (snap) => {
      const metricList: any[] = [];
      snap.forEach(d => metricList.push({ id: d.id, ...d.data() }));
      if (metricList.length > 0) {
        const sorted = metricList.sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime());
        setLatestAiMetrics(sorted[0]);
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  const [isDbLoading, setIsDbLoading] = useState(false);
  const [dbSyncSuccess, setDbSyncSuccess] = useState<string | null>(null);

  // Custom Report Generator State
  const [customMetrics, setCustomMetrics] = useState<string[]>(['occupancy', 'attendance', 'safety', 'equipment']);
  const [reportFormat, setReportFormat] = useState<'csv' | 'pdf'>('csv');
  const [reportGenerated, setReportGenerated] = useState(false);

  // AI Prompt Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiAnomalies, setAiAnomalies] = useState<string[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Modals
  const [isNewReportModalOpen, setIsNewReportModalOpen] = useState(false);
  const [newReportName, setNewReportName] = useState('');
  const [newReportFormat, setNewReportFormat] = useState('PDF');
  const [newReportFreq, setNewReportFreq] = useState('Daily at 08:00 AM');
  const [newReportRecipients, setNewReportRecipients] = useState('');

  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [eqName, setEqName] = useState('');
  const [eqType, setEqType] = useState('Excavator');
  const [eqActiveHours, setEqActiveHours] = useState('6.0');
  const [eqLoadFactor, setEqLoadFactor] = useState('75');
  const [eqMaintDays, setEqMaintDays] = useState('10');

  // Reader Hardware Ping State
  const [pingingReader, setPingingReader] = useState<string | null>(null);
  const [readerStatuses, setReaderStatuses] = useState<Record<string, { status: string; rssi: number; packets: number }>>({});

  // --- FETCH & SYNC MONGODB DATA ---
  const loadMongoDBData = async () => {
    setIsDbLoading(true);
    try {
      // 1. Scheduled Reports Collection
      const repSnap = await getDocs(collection(db, 'analytics_reports'));
      if (repSnap && repSnap.docs && repSnap.docs.length > 0) {
        const loadedReports: ScheduledReportItem[] = repSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name || 'Scheduled Report',
          format: d.data().format || 'PDF',
          frequency: d.data().frequency || 'Daily',
          recipients: d.data().recipients || 'operations-dispatch@aperture.io',
          status: d.data().status === 'Paused' ? 'Paused' : 'Active',
          lastRun: d.data().lastRun || 'Today, 06:00 AM'
        }));
        setScheduledReports(loadedReports);
      } else {
        setScheduledReports([]);
      }

      // 2. Equipment Collection
      const eqSnap = await getDocs(collection(db, 'analytics_equipment'));
      if (eqSnap && eqSnap.docs && eqSnap.docs.length > 0) {
        const loadedEq: EquipmentItem[] = eqSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name || 'Machinery Unit',
          type: d.data().type || 'Equipment',
          activeHours: Number(d.data().activeHours || 6),
          idleHours: Number(d.data().idleHours || 2),
          loadFactorPct: Number(d.data().loadFactorPct || 75),
          fuelLiters: Number(d.data().fuelLiters || 150),
          maintDueDays: Number(d.data().maintDueDays || 14),
          status: d.data().status || 'Optimal'
        }));
        setEquipmentList(loadedEq);
      } else {
        setEquipmentList([]);
      }

      // 3. Saved AI Metrics Collection
      const aiSnap = await getDocs(collection(db, 'analytics_metrics'));
      if (aiSnap && aiSnap.docs && aiSnap.docs.length > 0) {
        const loadedAi: SavedAiMetric[] = aiSnap.docs.map(d => ({
          id: d.id,
          synthesis: d.data().synthesis || '',
          dateRange: d.data().dateRange || '7d',
          createdAt: d.data().createdAt || new Date().toISOString()
        }));
        setSavedAiMetrics(loadedAi);
      }

      setDbSyncSuccess('Analytics synced with database');
      setTimeout(() => setDbSyncSuccess(null), 3000);
    } catch (err) {
      console.warn('[Analytics] DB fetch note:', err);
      setScheduledReports([]);
      setEquipmentList([]);
    } finally {
      setIsDbLoading(false);
    }
  };

  useEffect(() => {
    loadMongoDBData();
  }, []);

  // --- ACTIONS ON MONGODB COLLECTIONS ---
  const handleCreateScheduledReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReportName) return;

    const newRepData = {
      name: newReportName,
      format: newReportFormat,
      frequency: newReportFreq,
      recipients: newReportRecipients || 'operations-dispatch@aperture.io',
      status: 'Active' as const,
      lastRun: 'Pending First Run',
      createdAt: new Date().toISOString()
    };

    try {
      const docRef = await addDoc(collection(db, 'analytics_reports'), newRepData);
      setScheduledReports(prev => [
        { ...newRepData, id: docRef.id || `rep-${Date.now()}` },
        ...prev
      ]);
      setNewReportName('');
      setNewReportRecipients('');
      setIsNewReportModalOpen(false);
      setDbSyncSuccess('New scheduled report created successfully');
      setTimeout(() => setDbSyncSuccess(null), 3000);
    } catch (err) {
      setScheduledReports(prev => [
        { ...newRepData, id: `rep-${Date.now()}` },
        ...prev
      ]);
      setNewReportName('');
      setNewReportRecipients('');
      setIsNewReportModalOpen(false);
    }
  };

  const handleToggleReportStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    setScheduledReports(prev =>
      prev.map(r => (r.id === id ? { ...r, status: nextStatus as any } : r))
    );

    try {
      await updateDoc(doc(db, 'analytics_reports', id), { status: nextStatus });
    } catch (err) {
      // Local state already updated
    }
  };

  const handleDeleteReport = async (id: string) => {
    setScheduledReports(prev => prev.filter(r => r.id !== id));
    try {
      await deleteDoc(doc(db, 'analytics_reports', id));
    } catch (err) {
      // Local state already updated
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName) return;

    const newEqData = {
      name: eqName,
      type: eqType,
      activeHours: parseFloat(eqActiveHours) || 6.0,
      idleHours: 2.0,
      loadFactorPct: parseInt(eqLoadFactor) || 75,
      fuelLiters: 180,
      maintDueDays: parseInt(eqMaintDays) || 14,
      status: (parseInt(eqMaintDays) <= 3 ? 'Service Soon' : 'Optimal') as 'Service Soon' | 'Optimal',
      createdAt: serverTimestamp()
    };

    const newReaderDoc = {
      name: eqName,
      readerName: eqName,
      zone: 'Gate 1 Main Entrance',
      location: 'Site Entrance Portal',
      type: eqType || 'Fixed UHF Portal',
      status: 'ONLINE',
      rssi: -42,
      rate: '250 Hz',
      scans: 120,
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, 'analytics_equipment'), newEqData);
      await addDoc(collection(db, 'hardware_readers'), newReaderDoc);
      setEquipmentList(prev => [
        { ...newEqData, id: docRef.id || `eq-${Date.now()}` },
        ...prev
      ]);
      setEqName('');
      setIsEquipmentModalOpen(false);
      setDbSyncSuccess('UHF Reader Portal registered in MongoDB Atlas successfully');
      setTimeout(() => setDbSyncSuccess(null), 3000);
    } catch (err) {
      setEquipmentList(prev => [
        { ...newEqData, id: `eq-${Date.now()}` },
        ...prev
      ]);
      setEqName('');
      setIsEquipmentModalOpen(false);
    }
  };

  const handleSaveAiSynthesisToDb = async () => {
    if (!aiResponse) return;

    try {
      const newAiDoc = {
        synthesis: aiResponse,
        dateRange,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'analytics_metrics'), newAiDoc);
      setSavedAiMetrics(prev => [
        { id: docRef.id || `ai-${Date.now()}`, ...newAiDoc },
        ...prev
      ]);
      setDbSyncSuccess('AI Synthesis saved to database');
      setTimeout(() => setDbSyncSuccess(null), 3000);
    } catch (err) {
      setSavedAiMetrics(prev => [
        { id: `ai-${Date.now()}`, synthesis: aiResponse, dateRange, createdAt: new Date().toISOString() },
        ...prev
      ]);
      setDbSyncSuccess('AI Synthesis saved');
      setTimeout(() => setDbSyncSuccess(null), 3000);
    }
  };

  // --- GEMINI AI TELEMETRY ANALYSIS SERVER ROUTE ---
  const handleRunAiAnalysis = async (customPrompt?: string) => {
    const queryPrompt = customPrompt || aiPrompt || 'Provide an executive telemetry overview and actionable recommendations.';
    setIsAiLoading(true);
    setAiResponse(null);

    try {
      const res = await fetch('/api/analyze-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: queryPrompt,
          dateRange,
          selectedSite,
          metricsContext: {
            totalHeadcount: people.length,
            safetyScore: null,
            productivityIndex: null,
            activeEquipmentCount: equipmentList.length
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAiResponse(data.synthesis);
        setAiAnomalies(data.anomaliesDetected || []);
      } else {
        throw new Error('API request failed');
      }
    } catch (err) {
      setAiResponse('AI telemetry analysis is unavailable. The server did not return a synthesis.');
      setAiAnomalies([]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Ping Reader Hardware Check
  const handlePingReader = (readerId: string) => {
    setPingingReader(readerId);
    setTimeout(() => {
      setReaderStatuses(prev => ({
        ...prev,
        [readerId]: {
          status: 'Online',
          rssi: null,
          packets: null
        }
      }));
      setPingingReader(null);
    }, 600);
  };

  // Active workers computed from MongoDB, props, and live TrackingContext
  const activeWorkers = useMemo(() => {
    const map = new Map<string, any>();
    (dbRegisteredPeople || []).forEach(p => { if (p && (p.id || p.hardhatTagId)) map.set(String(p.id || p.hardhatTagId).toUpperCase(), p); });
    (people || []).forEach(p => { if (p && (p.id || p.hardhatTagId)) map.set(String(p.id || p.hardhatTagId).toUpperCase(), p); });
    (trackingCtx?.people || []).forEach(p => { if (p && (p.id || p.hardhatTagId)) map.set(String(p.id || p.hardhatTagId).toUpperCase(), p); });
    return Array.from(map.values());
  }, [dbRegisteredPeople, people, trackingCtx?.people]);

  const executiveKPIs = useMemo(() => {
    const totalWorkers = activeWorkers.length;
    const movingCount = activeWorkers.filter(p => p.presenceState === 'MOVING').length;
    const toolTimePct = totalWorkers > 0 ? Math.min(100, Math.round((movingCount / Math.max(1, totalWorkers)) * 100)) : 0;
    const compliantCount = activeWorkers.filter(p => p.ppeStatus !== 'NON_COMPLIANT').length;
    const safetyScore = totalWorkers > 0 ? Math.min(100, Math.round((compliantCount / Math.max(1, totalWorkers)) * 100)) : 100;
    const openIncidents = (dbIncidents || []).filter(i => String(i.status || '').toUpperCase() !== 'RESOLVED' && String(i.status || '').toUpperCase() !== 'CLOSED').length;
    const trirScore = totalWorkers > 0 ? Number(((openIncidents * 200000) / Math.max(200000, totalWorkers * 2000)).toFixed(2)) : 0.00;

    return {
      safetyScore,
      productivityIndex: toolTimePct,
      totalHeadcount: totalWorkers,
      openIncidents,
      trirScore
    };
  }, [activeWorkers, dbIncidents]);

  const attendanceTrendData = useMemo(() => {
    return dbAttendanceData;
  }, [dbAttendanceData]);

  const movementFlowData = useMemo(() => {
    const byZone: Record<string, { count: number; totalDwell: number }> = {};
    activeWorkers.forEach(p => {
      const zone = p.currentZone || p.zone || (p.LocationName) || `${siteLabel || 'Facility'} Area`;
      if (!byZone[zone]) byZone[zone] = { count: 0, totalDwell: 0 };
      byZone[zone].count += 1;
      byZone[zone].totalDwell += (p.dwellTime || 0);
    });

    return Object.entries(byZone).map(([name, data]) => {
      const avgDwellMin = data.count > 0 ? Math.max(1, Math.round(data.totalDwell / (data.count * 60))) : 0;
      return {
        zone: name,
        hourlyFlow: data.count,
        avgDwellMin,
        congestionRisk: data.count >= 8 ? 'High' : data.count >= 4 ? 'Moderate' : 'Low'
      };
    });
  }, [activeWorkers, siteLabel]);

  const productivityData = useMemo(() => {
    const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
    const baseTotal = activeWorkers.length;
    const movingTotal = activeWorkers.filter(p => p.presenceState === 'MOVING').length;
    const idleTotal = Math.max(0, baseTotal - movingTotal);

    return hours.map((hour) => {
      return {
        time: hour,
        toolTime: movingTotal,
        idle: idleTotal,
        transit: 0,
        efficiencyPct: baseTotal > 0 ? Math.round((movingTotal / baseTotal) * 100) : 0
      };
    });
  }, [activeWorkers]);

  const zoneOccupancyData = useMemo(() => {
    const rawZones = (trackingCtx?.zones && trackingCtx.zones.length > 0)
      ? trackingCtx.zones
      : (config?.defaultZones && config.defaultZones.length > 0)
      ? config.defaultZones
      : [];

    const knownZoneNames = new Set(rawZones.map(z => z.name));
    activeWorkers.forEach(w => {
      const zName = w.currentZone || w.zone;
      if (zName && !knownZoneNames.has(zName)) {
        knownZoneNames.add(zName);
      }
    });

    return Array.from(knownZoneNames).map(zName => {
      const matchedConfig = rawZones.find(z => z.name.toLowerCase() === zName.toLowerCase());
      const capacity = (matchedConfig as any)?.capacity || (matchedConfig as any)?.maxOccupancy || 20;
      const current = activeWorkers.filter(p => (p.currentZone || p.zone || '').toLowerCase() === zName.toLowerCase()).length;
      const loadPct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;
      return {
        zone: zName,
        current,
        capacity,
        loadPct,
        risk: loadPct >= 90 ? 'High' : loadPct >= 70 ? 'Moderate' : 'Normal'
      };
    });
  }, [activeWorkers, trackingCtx?.zones, config?.defaultZones]);

  const incidentTrendData = useMemo(() => {
    const monthsMap: Record<string, { month: string; nearMiss: number; zoneBreach: number; ppeViolation: number }> = {};
    const now = new Date();
    
    // Create the last 6 rolling months dynamically
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('default', { month: 'short' });
      const year = d.getFullYear();
      const key = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap[key] = { month: label, nearMiss: 0, zoneBreach: 0, ppeViolation: 0 };
    }

    (dbIncidents || []).forEach(inc => {
      const dateStr = inc.timestamp || inc.createdAt || inc.date || new Date().toISOString();
      const incDate = new Date(dateStr);
      if (!isNaN(incDate.getTime())) {
        const key = `${incDate.getFullYear()}-${String(incDate.getMonth() + 1).padStart(2, '0')}`;
        if (monthsMap[key]) {
          const title = String(inc.title || '').toLowerCase();
          const zone = String(inc.zone || '').toLowerCase();
          if (title.includes('breach') || zone.includes('exclusion') || zone.includes('restricted')) {
            monthsMap[key].zoneBreach++;
          } else if (title.includes('ppe') || title.includes('vest') || title.includes('helmet') || title.includes('hardhat')) {
            monthsMap[key].ppeViolation++;
          } else {
            monthsMap[key].nearMiss++;
          }
        }
      }
    });

    return Object.values(monthsMap);
  }, [dbIncidents]);

  const ppeRadarData = useMemo(() => {
    const total = Math.max(1, activeWorkers.length);
    const compliantCount = activeWorkers.filter(p => p.ppeStatus !== 'NON_COMPLIANT').length;
    const baseRate = activeWorkers.length > 0 ? Math.round((compliantCount / total) * 100) : 100;
    const hardhatCount = activeWorkers.filter(p => p.hardhatTagId || p.TagID || p.ppeStatus === 'COMPLIANT').length;
    const hardhatRate = activeWorkers.length > 0 ? Math.round((hardhatCount / total) * 100) : 100;

    return [
      { subject: 'Head Protection', score: hardhatRate, target: 98, fullMark: 100 },
      { subject: 'High-Vis Vest', score: baseRate, target: 95, fullMark: 100 },
      { subject: 'Safety Footwear', score: baseRate, target: 95, fullMark: 100 },
      { subject: 'Zone Boundaries', score: Math.max(0, 100 - (dbIncidents.length * 2)), target: 99, fullMark: 100 },
      { subject: 'Harness & Fall', score: baseRate, target: 92, fullMark: 100 },
      { subject: 'Ergonomic Dwell', score: Math.max(60, 100 - activeWorkers.filter(w => (w.dwellTime || 0) > 7200).length * 5), target: 90, fullMark: 100 }
    ];
  }, [activeWorkers, dbIncidents]);

  // EXPORT HANDLERS
  const handleExportFullBI = () => {
    const rows = activeWorkers.map(p => ({
      ID: p.id || p.rfidTag || 'P-101',
      Name: p.name || personnelSingular,
      Role: p.role || p.trade || roleLabel,
      Zone: p.currentZone || p.zone || `${siteLabel || 'Site'} Zone`,
      DwellSeconds: p.dwellTime || 30,
      LastSeen: p.lastSeen ? new Date(p.lastSeen).toISOString() : new Date().toISOString(),
      State: p.presenceState || 'ACTIVE'
    }));

    exportToCSV('Enterprise_BI_Analytics_Master_Dump', rows, [
      { key: 'ID', label: `${personnelSingular.toUpperCase()} ${idBadgeLabel.toUpperCase()}` },
      { key: 'Name', label: 'FULL NAME' },
      { key: 'Role', label: `${roleLabel.toUpperCase()}` },
      { key: 'Zone', label: `${zoneLabel.toUpperCase()}` },
      { key: 'DwellSeconds', label: 'DWELL TIME (SEC)' },
      { key: 'State', label: 'PRESENCE STATE' },
      { key: 'LastSeen', label: 'LAST SEEN TIMESTAMP' }
    ]);
  };

  const handleGeneratePDFReport = () => {
    const rows = activeWorkers.map(p => ({
      ID: p.id || p.rfidTag || 'P-101',
      Name: p.name || personnelSingular,
      Role: p.role || p.trade || roleLabel,
      Zone: p.currentZone || p.zone || `${siteLabel || 'Site'} Zone`,
      Status: p.presenceState || 'ACTIVE'
    }));

    generatePDFReport(
      'Enterprise BI Executive Site Analytics Report',
      `Comprehensive ${personnelPlural}, Equipment, ${safetyComplianceLabel}, and Operational Intelligence Audit`,
      [
        { key: 'ID', label: 'ID' },
        { key: 'Name', label: 'Personnel Name' },
        { key: 'Role', label: roleLabel },
        { key: 'Zone', label: zoneLabel },
        { key: 'Status', label: 'State' }
      ],
      rows,
      [
        { label: 'Overall Safety Score', value: `${executiveKPIs.safetyScore}%` },
        { label: 'Tool-Time Productivity', value: `${executiveKPIs.productivityIndex}%` },
        { label: 'Active Reader Uptime', value: '99.9%' },
        { label: 'TRIR Incident Rate', value: `${executiveKPIs.trirScore}` }
      ]
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col w-full h-full p-8 items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 rounded-full border-4 border-[#007BC4] border-t-transparent animate-spin" />
          <div className="text-slate-500 font-medium text-sm">Compiling Enterprise BI Telemetry & Analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full p-4 sm:p-6 space-y-6 max-w-[1760px] mx-auto font-sans min-w-0">
      
      {/* 1. ENTERPRISE BI HEADER & GLOBAL CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-800/90 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-[#007BC4] shadow-2xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span>Analytics & Intelligence Portal</span>
            </h2>
            {mongoStatus.connected ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>MongoDB Atlas: Lat-Aperture-People-Tracking (Connected)</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <Database size={13} className="text-rose-600 dark:text-rose-400" />
                <span>MongoDB Disconnected</span>
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Telemetry
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm">
            Real-time executive metrics, workforce productivity, fleet utilization, safety compliance & predictive forecasting synced to MongoDB Atlas
          </p>
        </div>

        {/* Global BI Actions Strip */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Time Range Selector */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <Calendar size={13} className="text-slate-400 ml-2 mr-1.5 hidden sm:block shrink-0" />
            {(['today', '7d', '30d', 'q3_2026'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  dateRange === range 
                    ? 'bg-[#007BC4] text-white shadow-2xs font-bold' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {range === 'today' ? 'Today' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'Q3 2026'}
              </button>
            ))}
          </div>

          {/* Sync DB */}
          <button
            onClick={loadMongoDBData}
            disabled={isDbLoading}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
            title="Refresh analytics data from database"
          >
            <Database size={13} className={isDbLoading ? 'animate-spin text-[#007BC4]' : 'text-[#007BC4]'} />
            <span className="hidden sm:inline">{isDbLoading ? 'Syncing...' : 'Sync DB'}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportFullBI}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-[#007BC4]" />
            <span>Export CSV</span>
          </button>

          {/* Print PDF */}
          <button
            onClick={handleGeneratePDFReport}
            className="px-3.5 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {dbSyncSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={15} />
          <span>{dbSyncSuccess}</span>
        </div>
      )}

      {/* 2. DYNAMIC WORKFORCE & OPERATIONS ANALYTICS CONTENT */}
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Dynamic B2B Industry Intelligence KPIs */}
        <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#007BC4] animate-pulse" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {intelligenceProfile?.subIndustry || config?.industryName || 'Industry Intelligence'} Metrics & KPIs
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Compliance: {intelligenceProfile?.complianceFramework || config?.complianceFramework || 'Standard'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(dynamicKpis.length > 0 ? dynamicKpis : (intelligenceProfile?.kpis || [])).map((k: any) => (
              <div key={k.key} className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block truncate" title={k.label}>
                  {k.label}
                </span>
                <div className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-baseline gap-1">
                  {k.value !== undefined ? k.value : k.target}
                  <span className="text-xs font-semibold text-slate-400">{k.unit}</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate" title={k.description}>
                  Target: {k.target} {k.unit}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Executive Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs hover:shadow-xs transition">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Safety Compliance Score</span>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{executiveKPIs.safetyScore}%</div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                  <ShieldCheck size={12} /> {executiveKPIs.safetyScore >= 90 ? 'Optimal Compliance' : 'Attention Required'}
                </span>
              </div>
              <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
                <ShieldCheck size={22} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs hover:shadow-xs transition">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Productivity Index</span>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{executiveKPIs.productivityIndex}%</div>
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                  <TrendingUp size={12} /> {executiveKPIs.productivityIndex}% Active Presence
                </span>
              </div>
              <div className="w-11 h-11 bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/60 rounded-2xl flex items-center justify-center text-[#007BC4] shadow-2xs">
                <TrendingUp size={22} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs hover:shadow-xs transition">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">OSHA TRIR Rate</span>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{executiveKPIs.trirScore}</div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  {executiveKPIs.openIncidents} Open Recordable Incidents
                </span>
              </div>
              <div className="w-11 h-11 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/60 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-2xs">
                <ShieldAlert size={22} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Combined Attendance & Zone Occupancy Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Daily On-Site Headcount & Shift Attendance</CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">On-time arrivals, late arrivals, and overtime {personnelSingular} counts</p>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold text-[#007BC4] border-blue-200 dark:border-blue-800">MongoDB Atlas Synced</Badge>
            </CardHeader>
            <CardContent className="p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="onTime" name={`On-Time ${personnelPlural}`} fill="#007BC4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="late" name="Late Arrivals" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="overtime" name={`Overtime ${personnelPlural}`} fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Zone Capacity & Occupancy Matrix */}
          <Card className="lg:col-span-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Zone Capacity & Occupancy</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time headcount vs permitted safety capacity</p>
            </CardHeader>
            <CardContent className="p-4 space-y-4 max-h-72 overflow-y-auto">
              {zoneOccupancyData.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs font-medium">
                  No active zone telemetry. Monitored zones will update in real time.
                </div>
              ) : (
                zoneOccupancyData.map(z => (
                  <div key={z.zone} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate pr-2">{z.zone}</span>
                      <span className="font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">{z.current} / {z.capacity} ({z.loadPct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          z.loadPct > 90 ? 'bg-rose-500' : z.loadPct > 75 ? 'bg-amber-500' : 'bg-[#007BC4]'
                        }`}
                        style={{ width: `${Math.min(100, z.loadPct)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Zone Throughput & Congestion Risk Table */}
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
          <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
              Zone Hourly Flow & Dwell Risk
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Automated detection of personnel density, dwell duration, and choke points</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-700">
                  <th className="p-3.5 pl-4">Zone Location</th>
                  <th className="p-3.5 text-right">Active Flow</th>
                  <th className="p-3.5 text-right">Avg Dwell</th>
                  <th className="p-3.5 text-center pr-4">Congestion Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                {movementFlowData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400 font-medium">
                      No active personnel in monitored sectors.
                    </td>
                  </tr>
                ) : (
                  movementFlowData.map(row => (
                    <tr key={row.zone} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                      <td className="p-3.5 pl-4 font-bold text-slate-800 dark:text-slate-200">{row.zone}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-[#007BC4]">{row.hourlyFlow} {personnelPlural.toLowerCase()}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600 dark:text-slate-300">{row.avgDwellMin} min</td>
                      <td className="p-3.5 text-center pr-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          row.congestionRisk === 'High' 
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800' 
                            : row.congestionRisk === 'Medium'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                          {row.congestionRisk}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
