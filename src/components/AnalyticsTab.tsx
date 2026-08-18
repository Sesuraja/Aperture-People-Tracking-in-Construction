import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, 
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ComposedChart 
} from 'recharts';
import { Person } from '../lib/simulation';
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
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from '../lib/db';

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
  recipients: string;
  status: 'Active' | 'Paused';
  lastRun: string;
  createdAt?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  activeHours: number;
  idleHours: number;
  loadFactorPct: number;
  fuelLiters: number;
  maintDueDays: number;
  status: 'Optimal' | 'Service Soon' | 'Warning' | 'Critical';
}

export interface SavedAiMetric {
  id: string;
  synthesis: string;
  dateRange: string;
  createdAt: string;
}

const DEFAULT_SCHEDULED_REPORTS: ScheduledReportItem[] = [
  { id: 'rep-1', name: 'Daily EHS & Safety Compliance Summary', format: 'PDF', frequency: 'Daily at 06:00 AM', recipients: 'ehs-team@buildcorp.com', status: 'Active', lastRun: 'Today, 06:00 AM' },
  { id: 'rep-2', name: 'Weekly Executive Operations & Headcount Digest', format: 'PDF + CSV', frequency: 'Mondays at 08:00 AM', recipients: 'execs@buildcorp.com', status: 'Active', lastRun: 'Aug 14, 2026' },
  { id: 'rep-3', name: 'Subcontractor Attendance & Overtime Ledger', format: 'CSV', frequency: 'Weekly on Friday 05:00 PM', recipients: 'payroll@buildcorp.com', status: 'Active', lastRun: 'Aug 11, 2026' },
  { id: 'rep-4', name: 'Equipment Heavy Machinery Runtime & Maintenance Log', format: 'PDF', frequency: 'Monthly 1st Day', recipients: 'fleet@buildcorp.com', status: 'Active', lastRun: 'Aug 01, 2026' }
];

const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  { id: 'eq-1', name: 'Tower Crane TC-01 (Potain MDT 389)', type: 'Crane', activeHours: 7.2, idleHours: 0.8, loadFactorPct: 84, fuelLiters: 180, maintDueDays: 14, status: 'Optimal' },
  { id: 'eq-2', name: 'CAT 336 Heavy Crawler Excavator', type: 'Excavator', activeHours: 6.5, idleHours: 1.5, loadFactorPct: 78, fuelLiters: 240, maintDueDays: 3, status: 'Service Soon' },
  { id: 'eq-3', name: 'Mobile Rough Terrain Crane MC-02', type: 'Crane', activeHours: 4.8, idleHours: 3.2, loadFactorPct: 62, fuelLiters: 130, maintDueDays: 22, status: 'Optimal' },
  { id: 'eq-4', name: 'Schwing Stetter Concrete Pumping Rig', type: 'Pump', activeHours: 5.5, idleHours: 2.5, loadFactorPct: 90, fuelLiters: 195, maintDueDays: 8, status: 'Optimal' },
  { id: 'eq-5', name: 'Bobcat T770 Compact Track Loader', type: 'Loader', activeHours: 6.1, idleHours: 1.9, loadFactorPct: 72, fuelLiters: 110, maintDueDays: 18, status: 'Optimal' }
];

export default function AnalyticsTab({ people = [], isLoading }: AnalyticsProps) {
  // Navigation / Module Selection
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

  // Database Persistent States (MongoDB) with Default Synthetic Fallbacks
  const [scheduledReports, setScheduledReports] = useState<ScheduledReportItem[]>(DEFAULT_SCHEDULED_REPORTS);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(DEFAULT_EQUIPMENT);
  const [savedAiMetrics, setSavedAiMetrics] = useState<SavedAiMetric[]>([
    {
      id: 'ai-init-1',
      synthesis: 'Morning shift entry peak at 08:12 AM with 96.8% compliance. Rigging & Electrical trades demonstrated 84%+ tool-time productivity.',
      dateRange: '7d',
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ]);
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

  // Reader Hardware Ping Simulation State
  const [pingingReader, setPingingReader] = useState<string | null>(null);
  const [readerStatuses, setReaderStatuses] = useState<Record<string, { status: string; rssi: number; packets: number }>>({
    'RDR-01': { status: 'Online', rssi: -42, packets: 142 },
    'GW-02': { status: 'Online', rssi: -55, packets: 88 },
    'GPS-01': { status: 'Online', rssi: -38, packets: 200 },
    'GW-03': { status: 'Warning', rssi: -78, packets: 41 }
  });

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
          recipients: d.data().recipients || 'admin@buildcorp.com',
          status: d.data().status === 'Paused' ? 'Paused' : 'Active',
          lastRun: d.data().lastRun || 'Today, 06:00 AM'
        }));
        setScheduledReports(loadedReports);
      } else {
        setScheduledReports(DEFAULT_SCHEDULED_REPORTS);
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
        setEquipmentList(DEFAULT_EQUIPMENT);
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
      console.warn('[Analytics] Using synthetic fallback data:', err);
      setScheduledReports(DEFAULT_SCHEDULED_REPORTS);
      setEquipmentList(DEFAULT_EQUIPMENT);
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
      recipients: newReportRecipients || 'ehs-team@buildcorp.com',
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

    try {
      const docRef = await addDoc(collection(db, 'analytics_equipment'), newEqData);
      setEquipmentList(prev => [
        { ...newEqData, id: docRef.id || `eq-${Date.now()}` },
        ...prev
      ]);
      setEqName('');
      setIsEquipmentModalOpen(false);
      setDbSyncSuccess('Equipment record added successfully');
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
            totalHeadcount: people.length || 48,
            safetyScore: 98.4,
            productivityIndex: 92.1,
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
      // Fallback response with rich synthetic analysis
      setAiResponse(
        `🤖 Gemini Enterprise BI Synthesis (${(dateRange || "").toUpperCase()}):\n\n` +
        `1. Workforce Dynamics & Shift Attendance:\n` +
        `   • Morning shift turnstile entry peaked at 08:12 AM with 96.8% on-time arrival rate.\n` +
        `   • Ironworking and Electrical trades recorded 84%+ active tool-time efficiency with minimal choke points.\n\n` +
        `2. Safety Index & PPE Compliance:\n` +
        `   • 0 lost-time incidents recorded across the site. Safety helmet & vest compliance is at 99.2%.\n` +
        `   • Sub-Basement B1 Trench reached 93% zone capacity threshold at 11:30 AM — auto-alert successfully cleared staging perimeter.\n\n` +
        `3. Heavy Machinery & Infrastructure:\n` +
        `   • Heavy machinery fleet operated at 84% average load factor with 7.2h active runtime.\n` +
        `   • Gateway GW-03 in Sub-Basement B1 exhibits battery degradation (32%) — scheduled for battery hot-swap during night shift.\n\n` +
        `4. Executive Recommendations:\n` +
        `   • Maintain current 12-minute staggered crew shifts to prevent gate turnstile bottlenecks.\n` +
        `   • Authorize scheduled preventative maintenance for CAT 336 Excavator before upcoming heavy pour phase.`
      );
      setAiAnomalies([
        'Sub-Basement B1 Trench 93% capacity threshold reached',
        'Reader GW-03 battery level degraded to 32%'
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Ping Reader Simulation
  const handlePingReader = (readerId: string) => {
    setPingingReader(readerId);
    setTimeout(() => {
      setReaderStatuses(prev => ({
        ...prev,
        [readerId]: {
          status: 'Online',
          rssi: Math.floor(Math.random() * 20) - 55,
          packets: Math.floor(Math.random() * 80) + 100
        }
      }));
      setPingingReader(null);
    }, 600);
  };

  // --- DYNAMIC MULTI-TIMEFRAME DATASETS ---
  const multiplier = useMemo(() => {
    switch (dateRange) {
      case 'today': return 1.0;
      case '7d': return 1.15;
      case '30d': return 1.35;
      case 'q3_2026': return 1.5;
      default: return 1.0;
    }
  }, [dateRange]);

  const executiveKPIs = useMemo(() => {
    const totalWorkers = people.length || 48;
    const movingCount = people.filter(p => p.presenceState === 'MOVING').length;
    const movingPct = totalWorkers > 0 ? Math.round((movingCount / totalWorkers) * 100) : 78;

    return {
      safetyScore: (98.4 * (multiplier > 1.2 ? 0.99 : 1)).toFixed(1),
      productivityIndex: Math.min(99, Math.round(88 + movingPct * 0.1)),
      costSavings: dateRange === 'today' ? '$4,800' : dateRange === '7d' ? '$34,200' : dateRange === '30d' ? '$142,500' : '$425,000',
      activeSites: 4,
      totalHeadcount: totalWorkers,
      shiftCompliance: 96.8,
      trirScore: 0.12,
      dartScore: 0.04
    };
  }, [people, dateRange, multiplier]);

  const attendanceTrendData = useMemo(() => [
    { time: '06:00', onTime: Math.round(12 * multiplier), late: 1, absent: 0, overtime: 0 },
    { time: '07:00', onTime: Math.round(38 * multiplier), late: 3, absent: 1, overtime: 0 },
    { time: '08:00', onTime: Math.round(45 * multiplier), late: 5, absent: 2, overtime: 1 },
    { time: '09:00', onTime: Math.round(48 * multiplier), late: 6, absent: 2, overtime: 2 },
    { time: '12:00', onTime: Math.round(46 * multiplier), late: 6, absent: 2, overtime: 4 },
    { time: '15:00', onTime: Math.round(44 * multiplier), late: 6, absent: 2, overtime: 8 },
    { time: '18:00', onTime: Math.round(22 * multiplier), late: 2, absent: 2, overtime: 12 },
    { time: '21:00', onTime: Math.round(8 * multiplier), late: 0, absent: 0, overtime: 6 }
  ], [multiplier]);

  const movementFlowData = [
    { zone: 'Main Entrance Turnstile', hourlyFlow: 140, avgDwellMin: 2, congestionRisk: 'Low' },
    { zone: 'Tower Core Structure Level 2', hourlyFlow: 88, avgDwellMin: 185, congestionRisk: 'Medium' },
    { zone: 'Deep Excavation Sector B', hourlyFlow: 62, avgDwellMin: 210, congestionRisk: 'Low' },
    { zone: 'Laydown Yard & Material Depot', hourlyFlow: 110, avgDwellMin: 45, congestionRisk: 'Low' },
    { zone: 'Sub-Basement B1 Trench', hourlyFlow: 34, avgDwellMin: 140, congestionRisk: 'High' },
    { zone: 'Site Welfare & Command Hub', hourlyFlow: 95, avgDwellMin: 30, congestionRisk: 'Low' }
  ];

  const productivityData = [
    { role: 'Rigging Crew', toolTimePct: 82, transitPct: 11, idlePct: 7 },
    { role: 'Steel Fixers', toolTimePct: 79, transitPct: 14, idlePct: 7 },
    { role: 'Electricians', toolTimePct: 86, transitPct: 9, idlePct: 5 },
    { role: 'Concrete Finishers', toolTimePct: 88, transitPct: 8, idlePct: 4 },
    { role: 'Safety Inspectors', toolTimePct: 91, transitPct: 7, idlePct: 2 },
    { role: 'General Laborers', toolTimePct: 72, transitPct: 18, idlePct: 10 }
  ];

  const readerHealthData = [
    { id: 'RDR-01', name: 'Main Gate Turnstile RFID Portal', type: 'Fixed UHF RFID 915MHz', uptimePct: 99.98 },
    { id: 'GW-02', name: 'Tower Core Scaffold BLE Gateway', type: 'BLE 5.3 AoA Directional', uptimePct: 99.91 },
    { id: 'GPS-01', name: 'RTK GPS Base Station Alpha', type: 'GPS Differential RTK', uptimePct: 100.0 },
    { id: 'GW-03', name: 'Sub-Basement B1 Trench Gateway', type: 'BLE Mesh Enclosure', uptimePct: 98.40 }
  ];

  const zoneOccupancyData = [
    { zone: 'Tower Core Reinforcement', current: 18, capacity: 25, loadPct: 72, risk: 'Normal' },
    { zone: 'Crane Swing Exclusion Radius', current: 8, capacity: 10, loadPct: 80, risk: 'Moderate' },
    { zone: 'Deep Excavation Shaft', current: 14, capacity: 15, loadPct: 93, risk: 'High' },
    { zone: 'Ground Turnstile Laydown', current: 22, capacity: 60, loadPct: 36, risk: 'Normal' },
    { zone: 'Site Welfare Command Center', current: 10, capacity: 30, loadPct: 33, risk: 'Normal' }
  ];

  const incidentTrendData = [
    { month: 'Mar 2026', nearMiss: 4, zoneBreach: 2, ppeViolation: 8, slipFall: 1 },
    { month: 'Apr 2026', nearMiss: 3, zoneBreach: 1, ppeViolation: 6, slipFall: 0 },
    { month: 'May 2026', nearMiss: 2, zoneBreach: 3, ppeViolation: 4, slipFall: 1 },
    { month: 'Jun 2026', nearMiss: 1, zoneBreach: 0, ppeViolation: 3, slipFall: 0 },
    { month: 'Jul 2026', nearMiss: 2, zoneBreach: 1, ppeViolation: 2, slipFall: 0 },
    { month: 'Aug 2026', nearMiss: 0, zoneBreach: 0, ppeViolation: 1, slipFall: 0 }
  ];

  const ppeComplianceData = [
    { subject: 'Safety Helmet', score: 99.2, target: 100 },
    { subject: 'High-Vis Vest', score: 98.5, target: 100 },
    { subject: 'Steel-Toe Boots', score: 99.8, target: 100 },
    { subject: 'Safety Glasses', score: 94.2, target: 95 },
    { subject: 'Fall Harness', score: 97.6, target: 100 },
    { subject: 'Gas Mask', score: 92.0, target: 90 }
  ];

  const forecastData = [
    { day: 'Mon Aug 17', predictedWorkers: 54, optimalEquipment: 4, riskFactor: 'Low' },
    { day: 'Tue Aug 18', predictedWorkers: 62, optimalEquipment: 5, riskFactor: 'Medium (Concrete Pour)' },
    { day: 'Wed Aug 19', predictedWorkers: 68, optimalEquipment: 5, riskFactor: 'High (Crane Lift Phase)' },
    { day: 'Thu Aug 20', predictedWorkers: 60, optimalEquipment: 4, riskFactor: 'Medium' },
    { day: 'Fri Aug 21', predictedWorkers: 52, optimalEquipment: 3, riskFactor: 'Low' },
    { day: 'Sat Aug 22', predictedWorkers: 28, optimalEquipment: 2, riskFactor: 'Low (Weekend Shift)' }
  ];

  // EXPORT HANDLERS
  const handleExportFullBI = () => {
    const rows = (people.length > 0 ? people : [
      { id: 'P-101', name: 'Marcus Vance', role: 'Crane Operator', currentZone: 'Crane Swing Zone', dwellTime: 45, presenceState: 'MOVING', lastSeen: new Date() },
      { id: 'P-102', name: 'Sarah Connor', role: 'Site Supervisor', currentZone: 'Tower Core', dwellTime: 32, presenceState: 'MOVING', lastSeen: new Date() },
      { id: 'P-103', name: 'Carlos Mendez', role: 'Safety Engineer', currentZone: 'Excavation Shaft', dwellTime: 18, presenceState: 'IDLE', lastSeen: new Date() }
    ]).map(p => ({
      ID: p.id,
      Name: p.name,
      Role: p.role,
      Zone: p.currentZone,
      DwellSeconds: p.dwellTime,
      LastSeen: p.lastSeen ? new Date(p.lastSeen).toISOString() : '',
      State: p.presenceState
    }));

    exportToCSV('Enterprise_BI_Analytics_Master_Dump', rows, [
      { key: 'ID', label: 'WORKER ID' },
      { key: 'Name', label: 'FULL NAME' },
      { key: 'Role', label: 'ROLE / TRADE' },
      { key: 'Zone', label: 'CURRENT ZONE' },
      { key: 'DwellSeconds', label: 'DWELL TIME (SEC)' },
      { key: 'State', label: 'PRESENCE STATE' },
      { key: 'LastSeen', label: 'LAST SEEN TIMESTAMP' }
    ]);
  };

  const handleGeneratePDFReport = () => {
    const rows = (people.length > 0 ? people : [
      { id: 'P-101', name: 'Marcus Vance', role: 'Crane Operator', currentZone: 'Crane Swing Zone', presenceState: 'MOVING' },
      { id: 'P-102', name: 'Sarah Connor', role: 'Site Supervisor', currentZone: 'Tower Core', presenceState: 'MOVING' },
      { id: 'P-103', name: 'Carlos Mendez', role: 'Safety Engineer', currentZone: 'Excavation Shaft', presenceState: 'IDLE' }
    ]).map(p => ({
      ID: p.id,
      Name: p.name,
      Role: p.role,
      Zone: p.currentZone,
      Status: p.presenceState
    }));

    generatePDFReport(
      'Enterprise BI Executive Site Analytics Report',
      'Comprehensive Workforce, Equipment, PPE, and Safety Intelligence Audit',
      [
        { key: 'ID', label: 'ID' },
        { key: 'Name', label: 'Personnel Name' },
        { key: 'Role', label: 'Role' },
        { key: 'Zone', label: 'Active Zone' },
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
    <div className="flex flex-col w-full min-h-full p-4 md:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      
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
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Telemetry
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm">
            Real-time executive metrics, workforce productivity, fleet utilization, safety compliance & predictive forecasting
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

      {/* 2. STICKY ENTERPRISE HEAD MENU & DOMAIN NAVIGATION */}
      <div className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md pt-1 pb-2 space-y-2 border-b border-slate-200/80 dark:border-slate-800">
        
        {/* Tier 1: Primary Category Tabs */}
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-1.5 shadow-2xs flex items-center gap-1.5 overflow-x-auto">
          {[
            {
              id: 'overview',
              label: 'Executive & Overview',
              icon: Building2,
              modules: ['overview', 'executive']
            },
            {
              id: 'operations',
              label: 'Workforce & Operations',
              icon: Zap,
              modules: ['operations', 'attendance', 'productivity', 'movement']
            },
            {
              id: 'equipment',
              label: 'Fleet & Gateways',
              icon: Truck,
              modules: ['equipment', 'readers']
            },
            {
              id: 'safety',
              label: 'Safety, PPE & OSHA',
              icon: ShieldCheck,
              modules: ['occupancy', 'incidents', 'ppe', 'safety']
            },
            {
              id: 'forecasting',
              label: 'Forecasting & AI',
              icon: Compass,
              modules: ['forecasting', 'ai_insights']
            },
            {
              id: 'scheduled',
              label: 'Reports & Builder',
              icon: FileText,
              modules: ['scheduled', 'custom']
            }
          ].map(category => {
            const Icon = category.icon;
            const isCategoryActive = category.modules.includes(activeModule);
            return (
              <button
                key={category.id}
                onClick={() => setActiveModule(category.modules[0] as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 select-none cursor-pointer whitespace-nowrap ${
                  isCategoryActive
                    ? 'bg-[#007BC4] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon size={15} className={isCategoryActive ? 'text-white' : 'text-slate-400'} />
                <span>{category.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tier 2: Sub-Module Navigation Pills for Selected Category */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline shrink-0">
            View Module:
          </span>
          {[
            { id: 'overview', label: 'Master Overview', icon: Layers2 },
            { id: 'executive', label: 'Executive KPIs', icon: Building2 },
            { id: 'operations', label: 'Operations Feed', icon: Zap },
            { id: 'attendance', label: 'Attendance Shifts', icon: Clock },
            { id: 'productivity', label: 'Tool-Time Productivity', icon: TrendingUp },
            { id: 'movement', label: 'Flow & Congestion', icon: Activity },
            { id: 'equipment', label: 'Machinery Load', icon: Truck },
            { id: 'readers', label: 'Reader Gateways', icon: Radio },
            { id: 'occupancy', label: 'Zone Occupancy', icon: Users },
            { id: 'incidents', label: 'Incident Trends', icon: ShieldAlert },
            { id: 'ppe', label: 'PPE Compliance', icon: HardHat },
            { id: 'safety', label: 'Safety & OSHA', icon: ShieldCheck },
            { id: 'forecasting', label: 'Predictive Forecasting', icon: Compass },
            { id: 'scheduled', label: 'Scheduled Reports', icon: Calendar },
            { id: 'custom', label: 'Custom Builder', icon: Filter },
            { id: 'ai_insights', label: 'AI Copilot Assistant', icon: BrainCircuit }
          ].map(mod => {
            const Icon = mod.icon;
            const active = activeModule === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => setActiveModule(mod.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 select-none cursor-pointer whitespace-nowrap ${
                  active 
                    ? 'bg-blue-50 text-[#007BC4] border border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700 font-bold shadow-2xs' 
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon size={13} className={active ? 'text-[#007BC4] dark:text-blue-300' : 'text-slate-400'} />
                <span>{mod.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. DYNAMIC MODULE CONTENTS */}

      {/* --- MODULE A: MASTER OVERVIEW & EXECUTIVE KPIs --- */}
      {(activeModule === 'overview' || activeModule === 'executive') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Executive Top Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs hover:shadow-xs transition">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Safety Compliance Score</span>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{executiveKPIs.safetyScore}%</div>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <ArrowUpRight size={12} /> +1.2% vs target
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
                    <ArrowUpRight size={12} /> +3.4% tool-time efficiency
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
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Estimated Cost Savings</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{executiveKPIs.costSavings}</div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Idle reduction optimization</span>
                </div>
                <div className="w-11 h-11 bg-purple-50 dark:bg-purple-950/50 border border-purple-200/60 dark:border-purple-800/60 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-2xs">
                  <Zap size={22} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs hover:shadow-xs transition">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">OSHA TRIR Rate</span>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{executiveKPIs.trirScore}</div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Industry Avg: 2.40</span>
                </div>
                <div className="w-11 h-11 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/60 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-2xs">
                  <Gauge size={22} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Combined Productivity & Attendance Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Daily On-Site Headcount & Shift Attendance</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">On-time arrivals, late arrivals, and overtime worker counts</p>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold text-[#007BC4] border-blue-200 dark:border-blue-800">Live RFID Feeds</Badge>
              </CardHeader>
              <CardContent className="p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="onTime" name="On-Time Workers" fill="#007BC4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="late" name="Late Arrivals" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="overtime" name="Overtime Crew" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-700/60">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">PPE Safety Radar Compliance</CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time computer vision & EHS inspection rates</p>
              </CardHeader>
              <CardContent className="p-4 h-72 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={ppeComplianceData}>
                    <PolarGrid stroke="#e2e8f0" strokeOpacity={0.6} />
                    <PolarAngleAxis dataKey="subject" stroke="#64748b" fontSize={10} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} fontSize={9} stroke="#94a3b8" />
                    <Radar name="Actual Score %" dataKey="score" stroke="#007BC4" fill="#007BC4" fillOpacity={0.45} />
                    <Radar name="Safety Target %" dataKey="target" stroke="#10B981" fill="#10B981" fillOpacity={0.15} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* --- MODULE B: OPERATIONS & PRODUCTIVITY --- */}
      {(activeModule === 'operations' || activeModule === 'productivity' || activeModule === 'attendance') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Tool Time Efficiency by Trade */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Trade Productivity Breakdown (% Tool-Time)</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active wrench time vs material transit and idle waiting</p>
                </div>
                <Badge variant="outline" className="text-[#007BC4] font-bold border-blue-200 dark:border-blue-800">Target: &gt;75%</Badge>
              </CardHeader>
              <CardContent className="p-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productivityData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" strokeOpacity={0.5} />
                    <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={11} />
                    <YAxis dataKey="role" type="category" stroke="#64748b" fontSize={11} width={120} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="toolTimePct" name="Active Tool Time %" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="transitPct" name="Transit / Walking %" stackId="a" fill="#007BC4" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="idlePct" name="Idle / Waiting %" stackId="a" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Zone Throughput & Congestion */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                  Zone Hourly Throughput & Dwell Risk
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Automated detection of personnel density and bottleneck choke points</p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-700">
                      <th className="p-3.5 pl-4">Zone Location</th>
                      <th className="p-3.5 text-right">Hourly Flow</th>
                      <th className="p-3.5 text-right">Avg Dwell</th>
                      <th className="p-3.5 text-center pr-4">Congestion Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {movementFlowData.map(row => (
                      <tr key={row.zone} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3.5 pl-4 font-bold text-slate-800 dark:text-slate-200">{row.zone}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-[#007BC4]">{row.hourlyFlow} p/hr</td>
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
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* --- MODULE C: EQUIPMENT & READER HEALTH --- */}
      {(activeModule === 'equipment' || activeModule === 'readers' || activeModule === 'movement') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Equipment Heavy Machinery Matrix */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Truck size={16} className="text-[#007BC4]" /> Heavy Machinery Utilization & Telemetry
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Runtime hours, load factor, and predictive maintenance schedules</p>
                </div>
                <button
                  onClick={() => setIsEquipmentModalOpen(true)}
                  className="px-3 py-1.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Plus size={14} /> Log Machinery
                </button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-700">
                      <th className="p-3.5 pl-4">Equipment Unit</th>
                      <th className="p-3.5 text-right">Runtime</th>
                      <th className="p-3.5 text-right">Load %</th>
                      <th className="p-3.5 text-center">Service Due</th>
                      <th className="p-3.5 text-center pr-4">Health Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {equipmentList.map(eq => (
                      <tr key={eq.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3.5 pl-4">
                          <strong className="text-slate-800 dark:text-slate-200 block text-xs">{eq.name}</strong>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{eq.type}</span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">{eq.activeHours} hrs</td>
                        <td className="p-3.5 text-right font-mono font-bold text-[#007BC4]">{eq.loadFactorPct}%</td>
                        <td className="p-3.5 text-center font-mono text-slate-600 dark:text-slate-400">{eq.maintDueDays} days</td>
                        <td className="p-3.5 text-center pr-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            eq.status === 'Service Soon' 
                              ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' 
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                          }`}>
                            {eq.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Reader Network Health */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Radio size={16} className="text-emerald-500" /> RFID & BLE Gateway Network Health
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Signal strength (RSSI), packet rates, and active ping diagnostics</p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-700">
                      <th className="p-3.5 pl-4">Gateway Node</th>
                      <th className="p-3.5">Hardware Type</th>
                      <th className="p-3.5 text-right">RSSI Signal</th>
                      <th className="p-3.5 text-right">Packets/s</th>
                      <th className="p-3.5 text-center pr-4">Diagnostic Test</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {readerHealthData.map(rdr => {
                      const dynamicState = readerStatuses[rdr.id] || { status: 'Online', rssi: -45, packets: 120 };
                      const isPinging = pingingReader === rdr.id;
                      return (
                        <tr key={rdr.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                          <td className="p-3.5 pl-4">
                            <strong className="text-slate-800 dark:text-slate-200 block text-xs">{rdr.name}</strong>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{rdr.id}</span>
                          </td>
                          <td className="p-3.5 text-slate-500 dark:text-slate-400">{rdr.type}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">{dynamicState.rssi} dBm</td>
                          <td className="p-3.5 text-right font-mono font-bold text-[#007BC4]">{dynamicState.packets}</td>
                          <td className="p-3.5 text-center pr-4">
                            <button
                              onClick={() => handlePingReader(rdr.id)}
                              disabled={isPinging}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-[10px] transition flex items-center gap-1 mx-auto cursor-pointer shadow-2xs"
                            >
                              <RadioTower size={12} className={isPinging ? 'animate-pulse text-[#007BC4]' : 'text-slate-500'} />
                              <span>{isPinging ? 'Testing...' : 'Ping Node'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* --- MODULE D: SAFETY, PPE & INCIDENT TRENDS --- */}
      {(activeModule === 'incidents' || activeModule === 'ppe' || activeModule === 'safety' || activeModule === 'occupancy') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Incident Trends Chart */}
            <Card className="lg:col-span-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">6-Month Safety Incident & Near-Miss Reduction Trend</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tracking near misses, PPE violations, and unauthorized zone breaches</p>
                </div>
                <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 font-bold">-75% Incident Reduction</Badge>
              </CardHeader>
              <CardContent className="p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={incidentTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Area type="monotone" dataKey="ppeViolation" name="PPE Violations" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="nearMiss" name="Near Misses" stroke="#007BC4" fill="#007BC4" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="zoneBreach" name="Zone Breaches" stroke="#EF4444" fill="#EF4444" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Zone Capacity Matrix */}
            <Card className="lg:col-span-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Zone Capacity & Thresholds</CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time headcount vs permitted safety occupancy</p>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {zoneOccupancyData.map(z => (
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
                        style={{ width: `${z.loadPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* --- MODULE E: PREDICTIVE FORECASTING --- */}
      {activeModule === 'forecasting' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Compass size={16} className="text-[#007BC4]" /> 7-Day Predictive Staffing & Risk Forecast Model
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Machine learning projection for workforce demand, heavy machinery allocations, and shift risk</p>
            </CardHeader>
            <CardContent className="p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="predictedWorkers" name="Predicted Workforce Headcount" fill="#007BC4" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="optimalEquipment" name="Required Machinery Units" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- MODULE F: SCHEDULED REPORTS & CUSTOM REPORT BUILDER --- */}
      {(activeModule === 'scheduled' || activeModule === 'custom') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Scheduled Reports List */}
          {activeModule === 'scheduled' && (
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar size={16} className="text-[#007BC4]" /> Scheduled Automated Enterprise Reports
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Recurring dispatch schedules for compliance, executive digests, and payroll</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsNewReportModalOpen(true)}
                    className="px-3 py-1.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus size={14} /> Schedule New Report
                  </button>
                  <button 
                    onClick={handleGeneratePDFReport}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Run PDF Now
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100 dark:border-slate-700">
                      <th className="p-3.5 pl-4">Report Title</th>
                      <th className="p-3.5">Format</th>
                      <th className="p-3.5">Frequency</th>
                      <th className="p-3.5">Recipient List</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {scheduledReports.map(rep => (
                      <tr key={rep.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3.5 pl-4 font-bold text-slate-800 dark:text-slate-200 text-xs">{rep.name}</td>
                        <td className="p-3.5 font-mono font-bold text-[#007BC4]">{rep.format}</td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">{rep.frequency}</td>
                        <td className="p-3.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{rep.recipients}</td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleToggleReportStatus(rep.id, rep.status)}
                            className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] transition cursor-pointer ${
                              rep.status === 'Active' 
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' 
                                : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {rep.status}
                          </button>
                        </td>
                        <td className="p-3.5 text-center pr-4 flex items-center justify-center gap-1.5">
                          <button
                            onClick={handleGeneratePDFReport}
                            title="Run Report"
                            className="p-1.5 text-[#007BC4] hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteReport(rep.id)}
                            title="Delete Report"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Interactive Custom Report Builder */}
          {activeModule === 'custom' && (
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
              <CardHeader className="border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Filter size={16} className="text-[#007BC4]" /> Interactive Custom Report Builder
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Assemble bespoke telemetry data fields, filter by zone or time range, and export instantly</p>
              </CardHeader>
              <CardContent className="p-5 space-y-5 text-xs">
                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-2.5">Select Metrics & Columns to Include:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {[
                      { id: 'occupancy', label: 'Zone Occupancy & Density' },
                      { id: 'attendance', label: 'Shift Attendance & Punches' },
                      { id: 'safety', label: 'Safety & PPE Compliance Scores' },
                      { id: 'equipment', label: 'Equipment Hours & Load Factor' },
                      { id: 'readers', label: 'Reader Signal RSSI & Packets' },
                      { id: 'incidents', label: 'Near-Miss & Breach Violations' }
                    ].map(item => {
                      const isChecked = customMetrics.includes(item.id);
                      return (
                        <label 
                          key={item.id} 
                          className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer font-semibold transition ${
                            isChecked 
                              ? 'bg-blue-50/70 border-blue-200 text-[#007BC4] dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300' 
                              : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              if (e.target.checked) setCustomMetrics([...customMetrics, item.id]);
                              else setCustomMetrics(customMetrics.filter(m => m !== item.id));
                            }}
                            className="rounded accent-[#007BC4] w-4 h-4 cursor-pointer"
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-800 dark:text-slate-200 block">Export Format:</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setReportFormat('csv')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          reportFormat === 'csv' 
                            ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-xs' 
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        CSV Spreadsheet
                      </button>
                      <button
                        onClick={() => setReportFormat('pdf')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          reportFormat === 'pdf' 
                            ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-xs' 
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        Printable PDF Document
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (reportFormat === 'csv') handleExportFullBI();
                      else handleGeneratePDFReport();
                      setReportGenerated(true);
                    }}
                    className="px-5 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Generate & Download Report</span>
                  </button>
                </div>

                {reportGenerated && (
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Custom report generated and downloaded successfully.</span>
                    </div>
                    <button onClick={() => setReportGenerated(false)} className="text-emerald-700 hover:text-emerald-900">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* --- MODULE G: AI INSIGHTS (GEMINI INTEGRATION WITH MONGODB PERSISTENCE) --- */}
      {activeModule === 'ai_insights' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BrainCircuit size={18} className="text-[#007BC4]" /> Gemini Enterprise AI Telemetry Assistant
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Powered by Google Gemini 3.6 Flash — analyze workforce bottlenecks, tool-time anomalies, and safety hazards</p>
              </div>
              {aiResponse && (
                <button
                  onClick={handleSaveAiSynthesisToDb}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Database size={14} /> Save to Database
                </button>
              )}
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              
              {/* Quick Prompt Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Quick Analysis Queries:</span>
                {[
                  'Analyze Sub-Basement B1 Congestion',
                  'Evaluate Machinery Runtime Efficiency',
                  'Forecast Weekend Shift Safety Hazards',
                  'Subcontractor Tool-Time Audit'
                ].map(chip => (
                  <button
                    key={chip}
                    onClick={() => {
                      setAiPrompt(chip);
                      handleRunAiAnalysis(chip);
                    }}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Highlight workforce bottlenecks in Tower Alpha or forecast safety risks..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRunAiAnalysis()}
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#007BC4] text-slate-800 dark:text-slate-100"
                />
                <button
                  onClick={() => handleRunAiAnalysis()}
                  disabled={isAiLoading}
                  className="px-5 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isAiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>Synthesize Insights</span>
                </button>
              </div>

              {aiResponse && (
                <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-xs font-mono whitespace-pre-wrap leading-relaxed border border-slate-800 shadow-inner">
                  {aiResponse}
                </div>
              )}

              {/* Saved MongoDB AI Synthesis Records */}
              {savedAiMetrics.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
                    <Database size={14} className="text-[#007BC4]" /> Historical Saved AI Insights ({savedAiMetrics.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {savedAiMetrics.map(item => (
                      <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mb-1">
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                          <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-[#007BC4] font-bold rounded">Range: {item.dateRange}</span>
                        </div>
                        <p className="line-clamp-2 font-mono text-slate-700 dark:text-slate-300">{item.synthesis}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      )}

      {/* --- MODAL: SCHEDULE NEW REPORT --- */}
      {isNewReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar size={18} className="text-[#007BC4]" /> Schedule Automated Report
              </h3>
              <button onClick={() => setIsNewReportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleCreateScheduledReport} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Report Title:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Subcontractor Night Shift Audit"
                  value={newReportName}
                  onChange={e => setNewReportName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#007BC4] text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Format:</label>
                  <select
                    value={newReportFormat}
                    onChange={e => setNewReportFormat(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="PDF">PDF Document</option>
                    <option value="CSV">CSV Spreadsheet</option>
                    <option value="PDF + CSV">PDF + CSV Bundle</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Frequency:</label>
                  <select
                    value={newReportFreq}
                    onChange={e => setNewReportFreq(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="Daily at 06:00 AM">Daily at 06:00 AM</option>
                    <option value="Weekly on Mondays">Weekly on Mondays</option>
                    <option value="Monthly 1st Day">Monthly 1st Day</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Recipient Email(s):</label>
                <input
                  type="email"
                  placeholder="safety@buildcorp.com"
                  value={newReportRecipients}
                  onChange={e => setNewReportRecipients(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#007BC4] text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsNewReportModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: LOG MACHINERY --- */}
      {isEquipmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck size={18} className="text-[#007BC4]" /> Log Heavy Machinery Unit
              </h3>
              <button onClick={() => setIsEquipmentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddEquipment} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Equipment Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Komatsu PC490 Excavator"
                  value={eqName}
                  onChange={e => setEqName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#007BC4] text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Type:</label>
                  <select
                    value={eqType}
                    onChange={e => setEqType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="Crane">Tower Crane</option>
                    <option value="Excavator">Excavator</option>
                    <option value="Pump">Concrete Pump</option>
                    <option value="Loader">Wheel / Track Loader</option>
                    <option value="Forklift">Rough Terrain Forklift</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Active Runtime (hrs):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={eqActiveHours}
                    onChange={e => setEqActiveHours(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Load Factor %:</label>
                  <input
                    type="number"
                    value={eqLoadFactor}
                    onChange={e => setEqLoadFactor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Maint. Due (Days):</label>
                  <input
                    type="number"
                    value={eqMaintDays}
                    onChange={e => setEqMaintDays(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs"
                >
                  Save Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
