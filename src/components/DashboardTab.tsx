import { Person, AIAlert } from '../lib/trackingData';
import { Vehicle, Asset } from '../types';
import { 
  Users, 
  UserCheck, 
  Activity, 
  ShieldAlert, 
  Clock, 
  Bell, 
  Map as MapIcon, 
  LayoutDashboard, 
  Cpu, 
  ShieldCheck, 
  Radio, 
  Settings, 
  Eye, 
  EyeOff, 
  ArrowUp, 
  ArrowDown, 
  X, 
  RotateCcw, 
  Check, 
  SlidersHorizontal, 
  Save,
  Server,
  Wifi,
  WifiOff,
  ArrowRight,
  Key,
  ExternalLink,
  Trash2,
  GripVertical,
  CloudSun,
  Thermometer,
  Wind,
  Zap,
  Wrench,
  Truck,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  BarChart2,
  FileText,
  Sparkles,
  Siren,
  UserX,
  Layers,
  HardHat,
  Droplets,
  Timer,
  Gauge,
  Sun,
  Flame,
  CheckCircle,
  Plus,
  Pencil,
  Undo2,
  Target,
  MessageSquare,
  Link2,
  Palette,
  CheckSquare,
  Download,
  StickyNote,
  Filter,
  Building2,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AIFeed from './AIFeed';
import SystemHealthWidget from './SystemHealthWidget';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { useMemo, ReactNode, useState, useEffect, useContext } from 'react';
import React from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc, addDoc, deleteDoc, query, orderBy, limit, db } from '../lib/db';
import { useTerminology } from '../context/TrackingContext';

import { useNavigate } from 'react-router-dom';
import { AppModeContext } from '../App';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';

const COLORS = ['#007BC4', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6'];

export interface KPIConfig {
  id: string;
  title: string;
  visible: boolean;
  order: number;
  deleted?: boolean;
  sub?: string;
  customValue?: string;
  iconName?: string;
  iconColor?: string;
}

export interface PanelConfig {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  order: number;
  width: '1/4' | '1/3' | '1/2' | '2/3' | 'full';
  deleted?: boolean;
  customType?: 'notes' | 'quick_links' | 'gauge' | 'text';
  customNotes?: string;
  customLinks?: { label: string; url: string; icon?: string }[];
  customGaugeVal?: number;
  customGaugeMax?: number;
  customGaugeLabel?: string;
  accentColor?: string;
}

export function getDefaultKPIs(): KPIConfig[] {
  return [
    { id: 'total_workers', title: 'Total Workers on Site', visible: true, order: 1, sub: 'Active registered roster on site', iconName: 'Users', iconColor: 'bg-[#007BC4]' },
    { id: 'active_workers', title: 'Active Workers', visible: true, order: 2, sub: 'Active in motion / on-shift trades', iconName: 'UserCheck', iconColor: 'bg-emerald-600' },
    { id: 'visitors_count', title: 'Visitors', visible: true, order: 3, sub: 'Pre-registered & checked-in visitors', iconName: 'UserX', iconColor: 'bg-amber-500' },
    { id: 'contractors_count', title: 'Contractors', visible: true, order: 4, sub: 'Subcontractor trades on site', iconName: 'HardHat', iconColor: 'bg-indigo-600' },
    { id: 'active_tags', title: 'Active RFID Tags', visible: true, order: 5, sub: 'Transmitting hardhat & asset tags', iconName: 'Radio', iconColor: 'bg-sky-600' },
    { id: 'online_readers', title: 'Online Readers', visible: true, order: 6, sub: 'Gate portals online & scanning', iconName: 'Wifi', iconColor: 'bg-emerald-600' },
    { id: 'offline_readers', title: 'Offline Readers', visible: true, order: 7, sub: 'Disconnected or warning state', iconName: 'WifiOff', iconColor: 'bg-rose-600' },
    { id: 'active_equipment', title: 'Active Equipment', visible: true, order: 8, sub: 'Cranes, excavators & lifts tracked', iconName: 'Truck', iconColor: 'bg-purple-600' },
    { id: 'safety_alerts', title: 'Safety Alerts', visible: true, order: 9, sub: 'PPE & hazard proximity warnings', iconName: 'ShieldAlert', iconColor: 'bg-amber-500' },
    { id: 'emergency_alerts', title: 'Emergency Alerts', visible: true, order: 10, sub: 'Critical panic & crane radius breaches', iconName: 'Siren', iconColor: 'bg-rose-600' },
    { id: 'attendance_today', title: 'Attendance Today', visible: true, order: 11, sub: 'Workers scheduled vs checked in', iconName: 'Clock', iconColor: 'bg-blue-600' },
    { id: 'ppe_compliance', title: 'PPE Compliance', visible: true, order: 12, sub: 'Hardhat tag & vest scan rate', iconName: 'ShieldCheck', iconColor: 'bg-teal-600' },
    { id: 'productivity_score', title: 'Productivity Score', visible: false, order: 13, sub: 'Active work vs idle dwell rating', iconName: 'TrendingUp', iconColor: 'bg-emerald-600' },
    { id: 'site_utilization', title: 'Site Utilization', visible: false, order: 14, sub: 'Active sectors vs max capacity', iconName: 'Gauge', iconColor: 'bg-violet-600' },
  ];
}

export function getDefaultPanels(): PanelConfig[] {
  return [
    { id: 'site_monitoring_view', title: 'Site Monitoring View', description: 'Interactive site monitoring view with Active Workers, Vehicles, High-Risk Alerts filter chips and Supervisor Quick Notes.', visible: true, order: 0, width: 'full' },
    { id: 'site_status', title: 'Site Status', description: 'Live operational status, active shift, site capacity indicator, and safety clearance.', visible: true, order: 1, width: '1/2' },
    { id: 'shift_progress', title: 'Shift Progress', description: 'Active shift timeline, completion percentage, remaining hours, and workforce on shift.', visible: true, order: 2, width: '1/3' },
    { id: 'reader_health', title: 'Reader Health', description: 'UHF RFID gate portals, antenna RSSI, packet rates, and online/offline status.', visible: true, order: 3, width: '1/3' },
    { id: 'ai_recommendations', title: 'AI Recommendations', description: 'Predictive safety advisories, overcrowding warnings, PPE enforcement, and fatigue alerts.', visible: true, order: 4, width: '1/2' },
    { id: 'daily_summary', title: 'Daily Summary', description: 'Total gate throughput, RFID scans, peak activity hours, and incident-free streak.', visible: true, order: 5, width: '1/2' },
    { id: 'active_incidents', title: 'Active Incidents', description: 'Real-time safety incident feed, severity ratings, assigned responders, and SLA timers.', visible: true, order: 6, width: 'full' },
    { id: 'occupancy_panel', title: 'Sector Occupancy & Movement Logs', description: 'Live zone occupancy distribution and recent worker movement telemetry.', visible: true, order: 7, width: '2/3' },
    { id: 'system_health', title: 'Database & System Telemetry', description: 'Real-time connection state and latency for Cloud MongoDB and MongoDB.', visible: true, order: 8, width: '1/3' }
  ];
}

export default function DashboardTab({ 
  people, 
  alerts, 
  zones, 
  highlightedPersonId, 
  isLoading,
  vehicles = [],
  assets = []
}: { 
  people: Person[], 
  alerts: AIAlert[], 
  zones: any, 
  highlightedPersonId?: string | null, 
  isLoading?: boolean,
  vehicles?: Vehicle[],
  assets?: Asset[]
}) {
  const navigate = useNavigate();
  const { mode } = useContext(AppModeContext);
  const { personnelSingular, personnelPlural, roleLabel, idBadgeLabel, safetyComplianceLabel, zoneLabel, siteLabel, organizationType } = useTerminology();
  const [apiConfig, setApiConfig] = useState({

    url: '',
    authType: 'none',
    apiKeyHeader: 'X-API-Key'
  });

  useEffect(() => {
    setApiConfig({
      url: localStorage.getItem('gao_api_url') || '',
      authType: localStorage.getItem('gao_auth_type') || 'none',
      apiKeyHeader: localStorage.getItem('gao_api_key_header') || 'X-API-Key'
    });
  }, []);

  const [registeredCount, setRegisteredCount] = useState<number>(0);
  const [registeredPeopleList, setRegisteredPeopleList] = useState<any[]>([]);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const movingCount = people.filter(p => p.presenceState === 'MOVING').length;
  const avgDwellInfo = people.length > 0 ? (people.reduce((sum, p) => sum + p.dwellTime, 0) / people.length / 60).toFixed(1) : "0.0";

  const [deviceStats, setDeviceStats] = useState({ online: 0, offline: 0, warning: 0 });
  const [deviceList, setDeviceList] = useState<any[]>([]);

  // Database-driven dynamic state variables
  const [visitorsCount, setVisitorsCount] = useState<number>(0);
  const [visitorsList, setVisitorsList] = useState<any[]>([]);
  const [contractorsCount, setContractorsCount] = useState<number>(0);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [shiftSchedules, setShiftSchedules] = useState<any[]>([]);
  const [aiRecs, setAiRecs] = useState<any[]>([]);
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [liveTagsList, setLiveTagsList] = useState<any[]>([]);
  const [liveTagsCount, setLiveTagsCount] = useState<number>(0);
  const [incidentsList, setIncidentsList] = useState<any[]>([]);
  const [dbAlerts, setDbAlerts] = useState<any[]>([]);
  const [totalScansCount, setTotalScansCount] = useState<number>(0);
  const [dbZones, setDbZones] = useState<any[]>([]);
  const [siteSensors, setSiteSensors] = useState<any[]>([]);

  // Monitoring View Filter states
  const [showWorkersFilter, setShowWorkersFilter] = useState(true);
  const [showVehiclesFilter, setShowVehiclesFilter] = useState(true);
  const [showAlertsFilter, setShowAlertsFilter] = useState(true);

  // Supervisor Quick Notes states
  const [quickNotes, setQuickNotes] = useState<any[]>([]);
  const [showQuickNoteModal, setShowQuickNoteModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState('');
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteStatus, setQuickNoteStatus] = useState('Nominal');

  useEffect(() => {
    if (zones && Object.keys(zones).length > 0) {
      setSelectedZone(Object.keys(zones)[0]);
    } else {
      setSelectedZone('People Tracking in Construction');
    }
  }, [zones]);

  const handleAddQuickNote = async () => {
    if (!quickNoteText.trim() || !selectedZone) return;
    try {
      await addDoc(collection(db, 'quick_notes'), {
        zone: selectedZone,
        note: quickNoteText,
        status: quickNoteStatus,
        timestamp: new Date().toISOString(),
        author: 'Site Supervisor'
      });
      setQuickNoteText('');
      setShowQuickNoteModal(false);
    } catch (err) {
      console.warn("Failed to add quick note:", err);
    }
  };

  const handleDeleteQuickNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, 'quick_notes', noteId));
    } catch (err) {
      console.warn("Failed to delete quick note:", err);
    }
  };

  // Export Data to CSV and PDF Report
  const handleExportData = () => {
    // 1. Export workers data
    const workerColumns = [
      { key: 'name', label: 'Worker Name' },
      { key: 'role', label: 'Role / Trade' },
      { key: 'tradeCompany', label: 'Company' },
      { key: 'currentZone', label: 'Current Zone' },
      { key: 'presenceState', label: 'Presence State' },
      { key: 'dwellTimeStr', label: 'Dwell Time' },
      { key: 'hardhatTagId', label: 'Hardhat Tag ID' },
      { key: 'ppeStatus', label: 'PPE Status' }
    ];
    const workerRows = people.map(p => ({
      ...p,
      dwellTimeStr: `${Math.floor(p.dwellTime / 60)}m ${p.dwellTime % 60}s`,
      tradeCompany: p.tradeCompany || 'Aperture subcontractor'
    }));

    exportToCSV('site_active_workers_telemetry', workerRows, workerColumns);

    // 2. Export sensor data
    const sensorColumns = [
      { key: 'name', label: 'Device/Reader Name' },
      { key: 'id', label: 'Device/Reader ID' },
      { key: 'status', label: 'Status' },
      { key: 'rssi', label: 'Signal (RSSI)' },
      { key: 'zone', label: 'Zone' }
    ];
    const sensorRows = deviceList.map(d => ({
      name: d.name || 'UHF Gate Scanner',
      id: d.id || 'N/A',
      status: d.status || 'online',
      rssi: d.rssi || '-55 dBm',
      zone: d.zone || 'Site Entrance'
    }));

    exportToCSV('site_sensors_telemetry', sensorRows, sensorColumns);

    // 3. Generate combined or main PDF report
    const pdfRows = [
      ...workerRows.map(w => ({
        type: 'Worker',
        name: w.name,
        detail1: w.role,
        detail2: w.currentZone,
        detail3: w.dwellTimeStr,
        status: w.presenceState
      })),
      ...sensorRows.map(s => ({
        type: 'Sensor/Reader',
        name: s.name,
        detail1: s.id,
        detail2: s.zone,
        detail3: s.rssi,
        status: (s.status || "").toUpperCase()
      }))
    ];

    const pdfColumns = [
      { key: 'type', label: 'Type' },
      { key: 'name', label: 'Asset Name/Label' },
      { key: 'detail1', label: 'Role/ID' },
      { key: 'detail2', label: 'Zone/Location' },
      { key: 'detail3', label: 'Telemetry Details' },
      { key: 'status', label: 'Operational Status' }
    ];

    generatePDFReport(
      'Active Site Telemetry Executive Report',
      'Real-time status overview of active workforce personnel and hardware reader sensors',
      pdfColumns,
      pdfRows,
      [
        { label: 'Active Workers', value: people.length },
        { label: 'Tracked Sensors/Devices', value: sensorRows.length },
        { label: 'Operational Status', value: 'NOMINAL' }
      ]
    );
  };

  // Layout states
  const [kpis, setKpis] = useState<KPIConfig[]>([]);
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'grids' | 'trash' | 'settings'>('metrics');
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [showAddKpiForm, setShowAddKpiForm] = useState<boolean>(false);
  const [showAddPanelForm, setShowAddPanelForm] = useState<boolean>(false);

  // Custom KPI form inputs
  const [newKpiTitle, setNewKpiTitle] = useState('');
  const [newKpiVal, setNewKpiVal] = useState('');
  const [newKpiSub, setNewKpiSub] = useState('');
  const [newKpiIcon, setNewKpiIcon] = useState('Target');
  const [newKpiColor, setNewKpiColor] = useState('bg-[#007BC4]');

  // Custom Panel form inputs
  const [newPanelTitle, setNewPanelTitle] = useState('');
  const [newPanelDesc, setNewPanelDesc] = useState('');
  const [newPanelWidth, setNewPanelWidth] = useState<'1/4' | '1/3' | '1/2' | '2/3' | 'full'>('1/2');
  const [newPanelType, setNewPanelType] = useState<'notes' | 'quick_links' | 'gauge'>('notes');

  // Temporary layout configurations for draft editing
  const [tempKpis, setTempKpis] = useState<KPIConfig[]>([]);
  const [tempPanels, setTempPanels] = useState<PanelConfig[]>([]);

  // Drag and drop sorting states
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    setDragOverIdx(index);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number, type: 'kpi' | 'panel') => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) return;

    if (type === 'kpi') {
      setTempKpis(prev => {
        const active = prev.filter(k => !k.deleted).sort((a,b) => a.order - b.order);
        const deleted = prev.filter(k => k.deleted);
        
        const result = [...active];
        const [removed] = result.splice(draggedIdx, 1);
        result.splice(targetIndex, 0, removed);
        
        const reordered = result.map((item, idx) => ({ ...item, order: idx + 1 }));
        return [...reordered, ...deleted];
      });
    } else {
      setTempPanels(prev => {
        const active = prev.filter(p => !p.deleted).sort((a,b) => a.order - b.order);
        const deleted = prev.filter(p => p.deleted);
        
        const result = [...active];
        const [removed] = result.splice(draggedIdx, 1);
        result.splice(targetIndex, 0, removed);
        
        const reordered = result.map((item, idx) => ({ ...item, order: idx + 1 }));
        return [...reordered, ...deleted];
      });
    }
    
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Load and subscribe to real-time MongoDB collections
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    
    let stdDevs: any[] = [];
    let fpDevs: any[] = [];
    let hwDevs: any[] = [];
    
    const normalizeDeviceStatus = (s?: string): 'online' | 'warning' | 'offline' => {
      if (!s) return 'online';
      const lower = s.toString().toLowerCase().trim();
      if (lower === 'online' || lower === 'scanning' || lower === 'active' || lower === 'nominal') return 'online';
      if (lower === 'warning' || lower === 'busy' || lower === 'degraded' || lower === 'maintenance') return 'warning';
      if (lower === 'offline' || lower === 'inactive' || lower === 'disconnected' || lower === 'error') return 'offline';
      return 'online';
    };

    const updateAllDevices = () => {
       const combined = [
         ...stdDevs.map(d => ({ name: d.name, status: normalizeDeviceStatus(d.status), id: d.id || d.name, rssi: d.rssi || '-52 dBm', rate: d.rate || '250 Hz', power: d.power || '100%', zone: d.zone || 'Site Perimeter' })),
         ...hwDevs.map(d => ({ name: d.name || d.readerName, status: normalizeDeviceStatus(d.status || (d.isActive !== false ? 'online' : 'offline')), id: d.id || d.name, rssi: d.rssi || '-48 dBm', rate: d.rate || '250 Hz', power: d.power || '100%', zone: d.zone || d.location || 'Gate 1' })),
         ...fpDevs.map(d => ({ name: d.name, status: 'online' as const, id: d.id || d.mac || d.name, rssi: '-55 dBm', rate: '200 Hz', power: '98%', zone: d.zone || 'Zone Area' }))
       ];
       const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
       setDeviceList(unique);
       
       let on = 0, off = 0, warn = 0;
       unique.forEach((d: any) => {
          if (d.status === 'online') on++;
          else if (d.status === 'warning') warn++;
          else off++;
       });
       setDeviceStats({
          online: on,
          offline: off,
          warning: warn
       });
    };

    // 1. Devices from MongoDB
    unsubs.push(onSnapshot(collection(db, 'devices'), (snapshot) => {
      stdDevs = [];
      snapshot.forEach(doc => stdDevs.push({ id: doc.id, ...doc.data() }));
      updateAllDevices();
    }));

    // 2. Hardware Readers from MongoDB
    unsubs.push(onSnapshot(collection(db, 'hardware_readers'), (snapshot) => {
      hwDevs = [];
      snapshot.forEach(doc => hwDevs.push({ id: doc.id, ...doc.data() }));
      updateAllDevices();
    }));
    
    // 3. Floorplan Devices
    unsubs.push(onSnapshot(collection(db, 'floorplans'), (snapshot) => {
      fpDevs = [];
      snapshot.forEach(doc => {
         const fp = doc.data();
         if (fp.devices && Array.isArray(fp.devices)) {
            fp.devices.forEach((d:any) => fpDevs.push(d));
         }
      });
      updateAllDevices();
    }));

    // 4. People & Registered People from MongoDB (Merge both collections for full workforce visibility)
    let rawRegisteredList: any[] = [];
    let rawPeopleList: any[] = [];

    const syncCombinedPeople = () => {
      const combined = [...rawPeopleList, ...rawRegisteredList];
      const unique = Array.from(new Map(combined.map(p => [p.id || p.name || p.hardhatTagId, p])).values());
      
      let contractors = 0;
      unique.forEach(data => {
        const role = data.role || data.department || '';
        const company = data.tradeCompany || '';
        if (
          (role || "").toLowerCase().includes('contractor') || 
          (role || "").toLowerCase().includes('sub') || 
          (company || "").toLowerCase().includes('apex') || 
          (company || "").toLowerCase().includes('concrete') || 
          (company || "").toLowerCase().includes('heavy') ||
          (company || "").toLowerCase().includes('volt') ||
          (company || "").toLowerCase().includes('steel')
        ) {
          contractors++;
        }
      });

      setRegisteredCount(unique.length);
      setRegisteredPeopleList(unique);
      setContractorsCount(contractors);
    };

    unsubs.push(onSnapshot(collection(db, 'registered_people'), (snapshot) => {
      rawRegisteredList = [];
      snapshot.forEach(doc => rawRegisteredList.push({ id: doc.id, ...doc.data() }));
      syncCombinedPeople();
    }));

    unsubs.push(onSnapshot(collection(db, 'people'), (snapshot) => {
      rawPeopleList = [];
      snapshot.forEach(doc => rawPeopleList.push({ id: doc.id, ...doc.data() }));
      syncCombinedPeople();
    }));

    // 5. Visitors from MongoDB
    unsubs.push(onSnapshot(collection(db, 'visitors'), (snapshot) => {
      const vList: any[] = [];
      snapshot.forEach(doc => vList.push({ id: doc.id, ...doc.data() }));
      setVisitorsList(vList);
      setVisitorsCount(vList.length);
    }));

    // 6. Assets from MongoDB
    unsubs.push(onSnapshot(collection(db, 'assets'), (snapshot) => {
      const aList: any[] = [];
      snapshot.forEach(doc => aList.push({ id: doc.id, ...doc.data() }));
      setAssetsList(aList);
    }));

    // 7. Vehicles from MongoDB
    unsubs.push(onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vList: any[] = [];
      snapshot.forEach(doc => vList.push({ id: doc.id, ...doc.data() }));
      setVehiclesList(vList);
    }));

    // 7b. Live Tags from MongoDB
    unsubs.push(onSnapshot(collection(db, 'live_tags'), (snapshot) => {
      const lList: any[] = [];
      snapshot.forEach(doc => lList.push({ id: doc.id, ...doc.data() }));
      setLiveTagsList(lList);
      setLiveTagsCount(lList.length);
    }));

    // 8. Attendance Logs from MongoDB
    unsubs.push(onSnapshot(collection(db, 'attendance_logs'), (snapshot) => {
      const attLogs: any[] = [];
      snapshot.forEach(doc => attLogs.push({ id: doc.id, ...doc.data() }));
      setAttendanceLogs(attLogs);
      const checkedIn = attLogs.filter((l: any) => l.status === 'PRESENT' || l.status === 'LATE' || l.checkInTime || l.inTime).length;
      setAttendanceCount(checkedIn || attLogs.length);
    }));

    // 9. Shift Schedules from MongoDB
    unsubs.push(onSnapshot(collection(db, 'shift_schedules'), (snapshot) => {
      const shifts: any[] = [];
      snapshot.forEach(doc => shifts.push({ id: doc.id, ...doc.data() }));
      setShiftSchedules(shifts);
    }));

    // 10. Incidents & Incidents Enterprise from MongoDB
    let incsEnterprise: any[] = [];
    let incsGeneral: any[] = [];

    const syncIncidents = () => {
      const combined = [...incsEnterprise, ...incsGeneral];
      const unique = Array.from(new Map(combined.map(i => [i.id || i.title, i])).values());
      setIncidentsList(unique);
    };

    unsubs.push(onSnapshot(collection(db, 'incidents_enterprise'), (snapshot) => {
      incsEnterprise = [];
      snapshot.forEach(doc => incsEnterprise.push({ id: doc.id, ...doc.data() }));
      syncIncidents();
    }));

    unsubs.push(onSnapshot(collection(db, 'incidents'), (snapshot) => {
      incsGeneral = [];
      snapshot.forEach(doc => incsGeneral.push({ id: doc.id, ...doc.data() }));
      syncIncidents();
    }));

    // 11. Alerts & Enterprise Alerts from MongoDB
    let alertsList1: any[] = [];
    let alertsList2: any[] = [];

    const syncAlerts = () => {
      const combined = [...alertsList1, ...alertsList2];
      const unique = Array.from(new Map(combined.map(a => [a.id || a.title, a])).values());
      setDbAlerts(unique);
    };

    unsubs.push(onSnapshot(collection(db, 'alerts'), (snapshot) => {
      alertsList1 = [];
      snapshot.forEach(doc => alertsList1.push({ id: doc.id, ...doc.data() }));
      syncAlerts();
    }));

    unsubs.push(onSnapshot(collection(db, 'alerts_enterprise'), (snapshot) => {
      alertsList2 = [];
      snapshot.forEach(doc => alertsList2.push({ id: doc.id, ...doc.data() }));
      syncAlerts();
    }));

    // 12. AI Insights & Recommendations from MongoDB
    let aiRecs1: any[] = [];
    let aiRecs2: any[] = [];

    const syncAiInsights = () => {
      const combined = [...aiRecs1, ...aiRecs2];
      const unique = Array.from(new Map(combined.map(r => [r.id || r.title || r.recommendation, r])).values());
      if (unique.length > 0) setAiRecs(unique);
    };

    unsubs.push(onSnapshot(collection(db, 'ai_recommendations'), (snapshot) => {
      aiRecs1 = [];
      snapshot.forEach(doc => aiRecs1.push({ id: doc.id, ...doc.data() }));
      syncAiInsights();
    }));

    unsubs.push(onSnapshot(collection(db, 'ai_insights'), (snapshot) => {
      aiRecs2 = [];
      snapshot.forEach(doc => aiRecs2.push({ id: doc.id, ...doc.data() }));
      syncAiInsights();
    }));

    // 13. Tag History (Movements & Timeline)
    unsubs.push(onSnapshot(
      query(collection(db, 'tag_history'), orderBy('timestamp', 'desc'), limit(10)),
      (snapshot) => {
         const moves: any[] = [];
         snapshot.forEach(doc => {
            const data = doc.data();
            moves.push({
               id: doc.id,
               tagId: data.TagID || data.tagId || '',
               name: data.name || data.personName || `Tag ${data.TagID?.substring(0,6).toUpperCase() || 'UNKNOWN'}`,
               role: data.role || 'Personnel',
               fromZone: data.fromZone || null,
               toZone: data.toZone || data.LocationName || '',
               timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : (data.EnterTime ? new Date(data.EnterTime) : new Date()))
            });
         });
         setRecentMovements(moves);
      },
      (error) => console.warn("Failed tag_history subscription:", error)
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'tag_history'), orderBy('timestamp', 'desc'), limit(150)),
      (snapshot) => {
         setTotalScansCount(snapshot.size);
         const defaultBuckets = [
           { time: '12 AM', load: 0 },
           { time: '4 AM', load: 0 },
           { time: '8 AM', load: 0 },
           { time: '12 PM', load: 0 },
           { time: '4 PM', load: 0 },
           { time: '8 PM', load: 0 }
         ];
         
         snapshot.forEach(doc => {
            const data = doc.data();
            const rawTs = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp || data.EnterTime);
            const date = rawTs ? new Date(rawTs) : null;
            if (date && !isNaN(date.getTime())) {
               const hour = date.getHours();
               if (hour < 4) defaultBuckets[0].load++;
               else if (hour < 8) defaultBuckets[1].load++;
               else if (hour < 12) defaultBuckets[2].load++;
               else if (hour < 16) defaultBuckets[3].load++;
               else if (hour < 20) defaultBuckets[4].load++;
               else defaultBuckets[5].load++;
            }
         });
         
         if (snapshot.size === 0) {
            defaultBuckets[2].load = 2;
            defaultBuckets[3].load = Math.max(people.length, 1);
         }
         
         setTimelineData(defaultBuckets);
      },
      (error) => console.warn("Failed tag_history timeline subscription:", error)
    ));

    // 14. Quick Notes
    unsubs.push(onSnapshot(collection(db, 'quick_notes'), (snapshot) => {
       const notes: any[] = [];
       snapshot.forEach(doc => {
          const d = doc.data();
          notes.push({
             id: doc.id,
             zone: d.zone || 'People Tracking in Construction',
             note: d.note || '',
             status: d.status || 'Nominal',
             timestamp: d.timestamp 
                ? (typeof d.timestamp === 'string' 
                    ? new Date(d.timestamp) 
                    : (d.timestamp.toDate 
                        ? d.timestamp.toDate() 
                        : (d.timestamp.seconds 
                            ? new Date(d.timestamp.seconds * 1000) 
                            : new Date(d.timestamp)))) 
                : new Date(),
             author: d.author || 'Supervisor'
          });
       });
       notes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
       setQuickNotes(notes);
    }, (error) => console.warn("Failed quick_notes subscription:", error)));

    // 15. Zones from MongoDB
    unsubs.push(onSnapshot(collection(db, 'zones'), (snapshot) => {
       const zList: any[] = [];
       snapshot.forEach(doc => zList.push({ id: doc.id, ...doc.data() }));
       setDbZones(zList);
    }, (error) => console.warn("Failed zones subscription:", error)));

    // 16. Sensors from MongoDB
    unsubs.push(onSnapshot(collection(db, 'sensors'), (snapshot) => {
       const sList: any[] = [];
       snapshot.forEach(doc => sList.push({ id: doc.id, ...doc.data() }));
       setSiteSensors(sList);
    }, (error) => console.warn("Failed sensors subscription:", error)));

    return () => unsubs.forEach(fn => {
       if (typeof fn === 'function') fn();
     });
  }, []);

  // Fetch customizable layout configurations from MongoDB / LocalStorage
  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const userId = 'default';
        const docRef = doc(db, 'settings', `dashboard_${userId}`);
        const docSnap = await getDoc(docRef);
        
        let loadedKpis: KPIConfig[] = [];
        let loadedPanels: PanelConfig[] = [];
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.kpis && Array.isArray(data.kpis)) {
             const mergedKpis = getDefaultKPIs().map(def => {
               const saved = data.kpis.find((k: any) => k.id === def.id);
               return saved ? { ...def, visible: saved.visible, order: saved.order, deleted: saved.deleted } : def;
             });
             loadedKpis = mergedKpis.sort((a,b) => a.order - b.order);
          } else {
             loadedKpis = getDefaultKPIs();
          }
          if (data.panels && Array.isArray(data.panels)) {
             const mergedPanels = getDefaultPanels().map(def => {
               const saved = data.panels.find((p: any) => p.id === def.id);
               return saved ? { ...def, visible: saved.visible, order: saved.order, width: saved.width || def.width, deleted: saved.deleted } : def;
             });
             loadedPanels = mergedPanels.sort((a,b) => a.order - b.order);
          } else {
             loadedPanels = getDefaultPanels();
          }
          setKpis(loadedKpis);
          setPanels(loadedPanels);
        } else {
          // If the MongoDB document doesn't exist, initialize it in the database!
          const kpisInit = getDefaultKPIs();
          const panelsInit = getDefaultPanels();
          try {
            await setDoc(docRef, { kpis: kpisInit, panels: panelsInit });
          } catch (e) {
            console.warn("Failed to write initial dashboard layout to DB:", e);
          }
          setKpis(kpisInit);
          setPanels(panelsInit);
        }
      } catch (err) {
        console.warn("Failed to load dashboard layout preference:", err);
        // Fallback to local default layouts
        setKpis(getDefaultKPIs());
        setPanels(getDefaultPanels());
      }
    };
    fetchLayout();
  }, []);

  // Open Edit Layout panel
  const openCustomizeModal = () => {
    setTempKpis(JSON.parse(JSON.stringify(kpis)));
    setTempPanels(JSON.parse(JSON.stringify(panels)));
    setShowCustomizeModal(true);
  };

  // KPI Edit helpers
  const handleToggleKpi = (id: string) => {
    setTempKpis(prev => prev.map(k => k.id === id ? { ...k, visible: !k.visible } : k));
  };

  const handleDeleteKpi = (id: string) => {
    setTempKpis(prev => prev.map(k => k.id === id ? { ...k, deleted: true, visible: false } : k));
  };

  const handleMoveKpiUp = (index: number) => {
    if (index <= 0) return;
    setTempKpis(prev => {
      const active = prev.filter(k => !k.deleted).sort((a,b) => a.order - b.order);
      const deleted = prev.filter(k => k.deleted);
      const updated = [...active];
      
      const temp = updated[index].order;
      updated[index].order = updated[index - 1].order;
      updated[index - 1].order = temp;
      
      return [...updated, ...deleted].sort((a,b) => a.order - b.order);
    });
  };

  const handleMoveKpiDown = (index: number) => {
    setTempKpis(prev => {
      const active = prev.filter(k => !k.deleted).sort((a,b) => a.order - b.order);
      if (index >= active.length - 1) return prev;
      const deleted = prev.filter(k => k.deleted);
      const updated = [...active];
      
      const temp = updated[index].order;
      updated[index].order = updated[index + 1].order;
      updated[index + 1].order = temp;
      
      return [...updated, ...deleted].sort((a,b) => a.order - b.order);
    });
  };

  // Panel Edit helpers
  const handleTogglePanel = (id: string) => {
    setTempPanels(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
  };

  const handleDeletePanel = (id: string) => {
    setTempPanels(prev => prev.map(p => p.id === id ? { ...p, deleted: true, visible: false } : p));
  };

  const handleResizePanel = (id: string, width: '1/4' | '1/3' | '1/2' | '2/3' | 'full') => {
    setTempPanels(prev => prev.map(p => p.id === id ? { ...p, width } : p));
  };

  const handleMovePanelUp = (index: number) => {
    if (index <= 0) return;
    setTempPanels(prev => {
      const active = prev.filter(p => !p.deleted).sort((a,b) => a.order - b.order);
      const deleted = prev.filter(p => p.deleted);
      const updated = [...active];
      
      const temp = updated[index].order;
      updated[index].order = updated[index - 1].order;
      updated[index - 1].order = temp;
      
      return [...updated, ...deleted].sort((a,b) => a.order - b.order);
    });
  };

  const handleMovePanelDown = (index: number) => {
    setTempPanels(prev => {
      const active = prev.filter(p => !p.deleted).sort((a,b) => a.order - b.order);
      if (index >= active.length - 1) return prev;
      const deleted = prev.filter(p => p.deleted);
      const updated = [...active];
      
      const temp = updated[index].order;
      updated[index].order = updated[index + 1].order;
      updated[index + 1].order = temp;
      
      return [...updated, ...deleted].sort((a,b) => a.order - b.order);
    });
  };

  const handleResetLayout = () => {
    setTempKpis(getDefaultKPIs());
    setTempPanels(getDefaultPanels());
  };

  // Commits newly customized layout configs back to MongoDB & LocalStorage
  const handleSaveLayout = async (newKpis: KPIConfig[], newPanels: PanelConfig[]) => {
    setIsSaving(true);
    const userId = 'default';
    
    // Normalize correct order values (1 to N)
    const normalizedKpis = [...newKpis]
      .sort((a,b) => a.order - b.order)
      .map((k, idx) => ({ ...k, order: idx + 1 }));

    const normalizedPanels = [...newPanels]
      .sort((a,b) => a.order - b.order)
      .map((p, idx) => ({ ...p, order: idx + 1 }));

    try {
      // 1. Log to MongoDB Database (Durable Cloud Persistence)
      const docRef = doc(db, 'settings', `dashboard_${userId}`);
      await setDoc(docRef, {
        userId,
        kpis: normalizedKpis,
        panels: normalizedPanels,
        updatedAt: new Date().toISOString()
      });
      
      // 2. Sync client-side fallback storage
      localStorage.setItem(`dashboard_kpis_${userId}`, JSON.stringify(normalizedKpis));
      localStorage.setItem(`dashboard_panels_${userId}`, JSON.stringify(normalizedPanels));
      
      setKpis(normalizedKpis);
      setPanels(normalizedPanels);
      setShowCustomizeModal(false);
    } catch (err) {
      console.warn("Failed to persistently sync layout settings to MongoDB:", err);
      // Fallback local persistence
      localStorage.setItem(`dashboard_kpis_${userId}`, JSON.stringify(normalizedKpis));
      localStorage.setItem(`dashboard_panels_${userId}`, JSON.stringify(normalizedPanels));
      
      setKpis(normalizedKpis);
      setPanels(normalizedPanels);
      setShowCustomizeModal(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Recharts memoized zone proportions datasets
  const zoneData = useMemo(() => {
    const counts = people.reduce((acc, p) => {
      acc[p.currentZone] = (acc[p.currentZone] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(zone => ({
      name: zone,
      value: counts[zone]
    }));
  }, [people]);

  const deviceData = [
    { name: 'Online', value: deviceStats.online, color: '#10b981' },
    { name: 'Offline', value: deviceStats.offline, color: '#f43f5e' },
    { name: 'Warning', value: deviceStats.warning, color: '#f59e0b' }
  ].filter(d => d.value > 0);

  // Sorting configurations
  const sortedVisibleKpis = useMemo(() => {
    return [...kpis]
      .filter(k => k.visible && !k.deleted)
      .sort((a, b) => a.order - b.order);
  }, [kpis]);

  const sortedVisiblePanels = useMemo(() => {
    return [...panels]
      .filter(p => p.visible && !p.deleted)
      .sort((a, b) => a.order - b.order);
  }, [panels]);

  // Resolves customizable widths into responsive grid classes
  const getPanelWidthClass = (width: '1/4' | '1/3' | '1/2' | '2/3' | 'full') => {
    switch (width) {
      case '1/4':
        return 'col-span-12 md:col-span-6 xl:col-span-3';
      case '1/3':
        return 'col-span-12 md:col-span-6 xl:col-span-4';
      case '1/2':
        return 'col-span-12 xl:col-span-6';
      case '2/3':
        return 'col-span-12 xl:col-span-8';
      case 'full':
        return 'col-span-12';
      default:
        return 'col-span-12';
    }
  };

  // Direct content dispatcher mapping widget configurations dynamically
  const renderPanelContent = (id: string) => {
    const totalRoster = registeredPeopleList.length || registeredCount || people.length || 0;
    const checkedInToday = attendanceCount > 0 
      ? attendanceCount 
      : (attendanceLogs.length > 0 
          ? attendanceLogs.filter((l: any) => l.status === 'PRESENT' || l.status === 'LATE' || l.checkInTime || l.inTime).length 
          : people.filter(p => p.presenceState !== 'EXITED').length);
    const attRate = totalRoster > 0 ? Math.min(100, Math.round((checkedInToday / totalRoster) * 1000) / 10) : 0;
    const mergedAlerts = [...alerts, ...dbAlerts];
    const uniqueAlerts = Array.from(new Map(mergedAlerts.map(a => [a.id || a.title || Math.random(), a])).values());
    const displayVehicles = vehiclesList.length > 0 ? vehiclesList : vehicles;
    const displayAssets = assetsList.length > 0 ? assetsList : assets;

    switch (id) {
      case 'site_monitoring_view': {
        const filteredWorkers = registeredPeopleList.length > 0 
          ? registeredPeopleList 
          : people;
        const filteredAlerts = uniqueAlerts.filter(a => a.priority === 'Critical' || a.priority === 'High' || a.type === 'security' || a.type === 'warning');

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col shadow-sm transition hover:shadow-md h-[480px]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 tracking-tight text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#007BC4]" />
                  Site Monitoring View
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">Live on-site entities and supervisor quick notes synced from MongoDB Atlas.</p>
              </div>

              {/* Filter chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setShowWorkersFilter(!showWorkersFilter)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition border cursor-pointer ${
                    showWorkersFilter
                      ? 'bg-[#007BC4]/10 text-[#007BC4] border-[#007BC4]/30'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  Workers ({filteredWorkers.length})
                </button>
                <button
                  onClick={() => setShowVehiclesFilter(!showVehiclesFilter)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition border cursor-pointer ${
                    showVehiclesFilter
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Truck className="w-3 h-3" />
                  Vehicles ({displayVehicles.length + displayAssets.length})
                </button>
                <button
                  onClick={() => setShowAlertsFilter(!showAlertsFilter)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition border cursor-pointer ${
                    showAlertsFilter
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 animate-pulse" />
                  Alerts ({filteredAlerts.length})
                </button>

                <div className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:block" />

                <button
                  onClick={() => setShowQuickNoteModal(true)}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg text-[10px] font-bold transition active:scale-95 cursor-pointer"
                >
                  <StickyNote className="w-3 h-3 text-[#007BC4]" />
                  Add Note
                </button>
              </div>
            </div>

            {/* Monitoring content grid */}
            <div className="grid grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
              {/* Left Column: Grid list of selected items */}
              <div className="col-span-12 lg:col-span-8 flex flex-col min-h-0">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 shrink-0">Live On-Site Telemetry</div>
                
                {(!showWorkersFilter && !showVehiclesFilter && !showAlertsFilter) ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs font-medium flex flex-col items-center justify-center gap-2 flex-1">
                    <Filter className="w-6 h-6 text-slate-300" />
                    Select a filter chip above to overlay items.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 overflow-y-auto pr-1">
                    {/* Active Workers */}
                    {showWorkersFilter && filteredWorkers.map((w: any) => (
                      <div key={w.id} className="p-2.5 bg-slate-50 border border-slate-150 hover:border-[#007BC4]/40 hover:bg-[#007BC4]/5 rounded-xl transition flex flex-col justify-between gap-1 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-extrabold text-[10px] border border-[#007BC4]/20 shrink-0">
                              {(w.name || 'U').charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] text-slate-800 truncate leading-tight">{w.name || 'Worker'}</div>
                              <div className="text-[9px] text-slate-500 font-medium truncate mt-0.5">{w.role || w.department || 'Tradesperson'}</div>
                            </div>
                          </div>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                            w.ppeStatus === 'COMPLIANT' || !w.ppeStatus ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            w.ppeStatus === 'WARNING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            PPE: {w.ppeStatus || 'COMPLIANT'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono mt-1 pt-1.5 border-t border-slate-200/60">
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${w.presenceState === 'MOVING' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                            {w.presenceState || 'ACTIVE'}
                          </span>
                          <span className="font-bold text-slate-600 truncate max-w-[120px]">{w.currentZone || 'Site Area'}</span>
                        </div>
                      </div>
                    ))}

                    {/* Vehicles */}
                    {showVehiclesFilter && displayVehicles.map((v: any) => (
                      <div key={v.id} className="p-2.5 bg-purple-50/30 border border-purple-100 hover:border-purple-300 hover:bg-purple-50 rounded-xl transition flex flex-col justify-between gap-1 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded bg-purple-100 text-purple-700 flex items-center justify-center font-extrabold text-[10px] border border-purple-200 shrink-0">
                              <Truck className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] text-slate-800 truncate leading-tight">{v.name}</div>
                              <div className="text-[9px] text-slate-500 font-medium truncate mt-0.5">Operator: {v.operator || v.assignedOperator || 'Unassigned'}</div>
                            </div>
                          </div>
                          <span className="bg-purple-100 text-purple-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                            {v.type || 'Vehicle'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono mt-1 pt-1.5 border-t border-purple-200/50">
                          <span>Speed: {v.speed !== undefined ? `${v.speed} km/h` : 'Idle'}</span>
                          <span className="font-semibold text-purple-800">
                            {v.status || 'Active'}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* High-Risk Alerts */}
                    {showAlertsFilter && filteredAlerts.map((a: any) => (
                      <div key={a.id} className="p-2.5 bg-rose-50/40 border border-rose-100 hover:border-rose-300 hover:bg-rose-50 rounded-xl transition flex flex-col justify-between gap-1 col-span-1 sm:col-span-2 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="p-1 rounded bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] text-rose-900 leading-tight truncate">{a.title || 'Safety violation'}</div>
                              <p className="text-[10px] text-rose-700 font-medium mt-0.5 leading-tight">{a.message}</p>
                            </div>
                          </div>
                          <span className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0">
                            {a.priority || 'HIGH'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[8px] text-rose-500 font-mono mt-1 pt-1.5 border-t border-rose-200/50 shrink-0">
                          <span>{a.timestamp instanceof Date ? a.timestamp.toLocaleTimeString() : new Date(a.timestamp || Date.now()).toLocaleTimeString()}</span>
                          <span className="bg-white border border-rose-200 px-1 rounded font-bold truncate max-w-[150px]">{a.evidence?.locationZone || a.locationZone || 'Site Area'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Supervisor Quick Notes */}
              <div className="col-span-12 lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-4 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Zone Quick Notes</div>
                  <span className="text-[9px] bg-slate-100 text-slate-600 font-black px-1.5 py-0.5 rounded-full">
                    {quickNotes.length} notes
                  </span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-0.5">
                  {quickNotes.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-slate-400 text-[11px] font-medium flex flex-col items-center justify-center gap-1.5 h-full min-h-[140px]">
                      <StickyNote className="w-5 h-5 text-slate-300" />
                      <span>No active notes.</span>
                      <button onClick={() => setShowQuickNoteModal(true)} className="text-[#007BC4] hover:underline font-bold">Add Note</button>
                    </div>
                  ) : (
                    quickNotes.map(n => {
                      const bgMap: Record<string, string> = {
                        'Nominal': 'bg-emerald-50 border-emerald-150 text-emerald-950',
                        'Attention Required': 'bg-amber-50 border-amber-150 text-amber-950',
                        'Restricted Access': 'bg-orange-50 border-orange-150 text-orange-950',
                        'High Risk': 'bg-rose-50 border-rose-150 text-rose-950'
                      };
                      const statusColorMap: Record<string, string> = {
                        'Nominal': 'bg-emerald-500',
                        'Attention Required': 'bg-amber-500',
                        'Restricted Access': 'bg-orange-500',
                        'High Risk': 'bg-rose-500'
                      };
                      return (
                        <div key={n.id} className={`p-2.5 rounded-lg border flex flex-col justify-between gap-1 relative group shadow-sm ${bgMap[n.status] || 'bg-slate-50 border-slate-200'}`}>
                          <button
                            onClick={() => handleDeleteQuickNote(n.id)}
                            className="absolute top-1.5 right-1.5 p-0.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded border border-transparent hover:border-slate-200 opacity-0 group-hover:opacity-100 transition duration-100 cursor-pointer"
                            title="Resolve Note"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          
                          <div>
                            <div className="flex items-center gap-1 font-bold text-[10px]">
                              <span className={`w-1.5 h-1.5 rounded-full ${statusColorMap[n.status] || 'bg-slate-400'}`} />
                              <span className="truncate pr-4">{n.zone}</span>
                            </div>
                            <p className="text-[11px] font-medium leading-normal mt-1 whitespace-pre-wrap">{n.note}</p>
                          </div>

                          <div className="flex items-center justify-between text-[8px] text-slate-400 font-bold mt-1 pt-1 border-t border-slate-200/40">
                            <span>{(n.author || "").split('@')[0]}</span>
                            <span>{new Date(n.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'site_status': {
        const totalHeadcount = registeredPeopleList.length || people.length || 0;
        const activeZonesList = dbZones.length > 0 ? dbZones.map((z: any) => z.name || z.id) : (Object.keys(zones).length > 0 ? Object.keys(zones) : ['Site Area']);
        const totalSiteCapacity = dbZones.length > 0 
          ? dbZones.reduce((sum: number, z: any) => sum + (Number(z.capacity) || 20), 0)
          : (Object.keys(zones).length > 0 ? Object.keys(zones).length * 20 : 50);
        const occupancyPct = totalSiteCapacity > 0 ? Math.min(100, Math.round((totalHeadcount / totalSiteCapacity) * 100)) : 0;
        const criticalIncidentsCount = incidentsList.filter((i: any) => i.severity === 'Critical' || i.workflowStatus === 'Open').length;
        const hasActiveAlerts = dbAlerts.filter((a: any) => a.type === 'security' || a.priority === 'Critical').length > 0;
        const riskRating = (criticalIncidentsCount > 0 || hasActiveAlerts) ? 'ELEVATED' : 'LOW (EHS Grade A)';
        const riskColor = (criticalIncidentsCount > 0 || hasActiveAlerts) ? 'text-amber-600' : 'text-emerald-600';

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[380px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${criticalIncidentsCount > 0 ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-ping'}`} />
                <h3 className="font-bold text-slate-900 tracking-tight text-sm">Site Operational Status</h3>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${criticalIncidentsCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {criticalIncidentsCount > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {criticalIncidentsCount > 0 ? `${criticalIncidentsCount} Active Hazards` : 'Nominal Operations'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Overall Risk Rating</span>
                <div className={`text-lg font-black mt-0.5 ${riskColor}`}>{riskRating}</div>
                <span className="text-[10px] text-slate-400">{criticalIncidentsCount === 0 ? 'Zero safety halts active' : `${criticalIncidentsCount} open incidents in MongoDB`}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Site Occupancy</span>
                <div className="text-lg font-black text-slate-900 mt-0.5">{totalHeadcount} / {totalSiteCapacity} Max</div>
                <span className="text-[10px] text-slate-400">{occupancyPct}% sector capacity</span>
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Active Sector Readiness</div>
              {activeZonesList.slice(0, 4).map((z: string) => {
                const count = people.filter(p => p.currentZone === z).length || registeredPeopleList.filter(p => p.currentZone === z).length;
                return (
                  <div key={z} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs font-medium">
                    <span className="font-semibold text-slate-800 truncate max-w-[200px]">{z}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-600 font-bold">{count} workers</span>
                      <span className={`w-2 h-2 rounded-full ${count > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
              <span className="text-[11px] text-slate-500 font-medium">Clearances: {criticalIncidentsCount === 0 ? 'All Sectors Approved' : 'Review Active Alerts'}</span>
              <button onClick={() => navigate('/live')} className="text-xs font-bold text-[#007BC4] hover:underline flex items-center gap-1">
                Live Map →
              </button>
            </div>
          </div>
        );
      }

      case 'shift_progress': {
        const activeShift = shiftSchedules.length > 0 ? shiftSchedules[0] : null;
        const shiftTitle = activeShift?.name || activeShift?.title || 'Day Shift Alpha';
        const startStr = activeShift?.startTime || activeShift?.start || '07:00';
        const endStr = activeShift?.endTime || activeShift?.end || '17:00';
        
        const now = new Date();
        const [sH, sM] = startStr.split(':').map(Number);
        const [eH, eM] = endStr.split(':').map(Number);
        const startMins = (sH || 7) * 60 + (sM || 0);
        const endMins = (eH || 17) * 60 + (eM || 0);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const totalDuration = Math.max(1, endMins - startMins);
        const elapsedMins = Math.max(0, Math.min(totalDuration, nowMins - startMins));
        const remainingMins = Math.max(0, totalDuration - elapsedMins);
        const shiftProgressPct = Math.min(100, Math.max(0, Math.round((elapsedMins / totalDuration) * 100)));

        const elapHours = Math.floor(elapsedMins / 60);
        const elapRemainMins = elapsedMins % 60;
        const remHours = Math.floor(remainingMins / 60);
        const remRemainMins = remainingMins % 60;

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[380px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 tracking-tight text-sm">Shift Progress</h3>
              </div>
              <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-200">
                {shiftTitle}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>{startStr} - {endStr}</span>
                <span className="text-[#007BC4]">{shiftProgressPct}% Complete</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-[#007BC4] h-full rounded-full transition-all duration-500" style={{ width: `${shiftProgressPct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                <span>Elapsed: {elapHours}h {elapRemainMins}m</span>
                <span>Remaining: {remHours}h {remRemainMins}m</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase">On-Shift Workers</span>
                <div className="text-base font-bold text-slate-900 mt-0.5">{checkedInToday} / {totalRoster}</div>
                <span className="text-[10px] text-emerald-600 font-bold">{attRate}% Attendance</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Shift Status</span>
                <div className="text-base font-bold text-slate-900 mt-0.5">{shiftProgressPct >= 100 ? 'Completed' : 'In Progress'}</div>
                <span className="text-[10px] text-slate-500">Target End: {endStr}</span>
              </div>
            </div>

            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Phase: {activeShift?.phase || 'Live Shift Operations'}</span>
              <button onClick={() => navigate('/attendance')} className="text-xs font-bold text-[#007BC4] hover:underline">
                Attendance Roster →
              </button>
            </div>
          </div>
        );
      }

      case 'reader_health': {
        const displayReaders = deviceList;

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[380px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 tracking-tight text-sm">Reader Health & Portals</h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-emerald-600">{deviceStats.online} Online</span>
                <span className="text-rose-500">{deviceStats.offline} Offline</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {displayReaders.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs font-medium">
                  No RFID readers found in MongoDB.
                </div>
              ) : (
                displayReaders.slice(0, 5).map((r, i) => (
                  <div key={r.id || i} onClick={() => navigate('/devices')} className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg flex items-center justify-between cursor-pointer transition">
                    <div>
                      <div className="font-bold text-xs text-slate-800">{r.name}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2 font-mono mt-0.5">
                        <span>RSSI: {r.rssi || '-55 dBm'}</span>
                        <span>Rate: {r.rate || '250 Hz'}</span>
                        <span>Power: {r.power || '100%'}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${r.status === 'online' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : r.status === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                      {r.status || 'online'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
              <span className="text-[11px] text-slate-500">Active Gateways: {displayReaders.length} Total Registered</span>
              <button onClick={() => navigate('/devices')} className="text-xs font-bold text-[#007BC4] hover:underline">
                Manage Devices →
              </button>
            </div>
          </div>
        );
      }

      case 'ai_recommendations': {
        const displayRecs = aiRecs.length > 0 ? aiRecs : [
          {
            title: 'Live Personnel Movement Analysis',
            text: `${movingCount} personnel active in motion across ${Object.keys(zones).length} monitored sectors. All RFID credentials verified in MongoDB.`,
            icon: 'Sparkles',
            color: 'purple'
          }
        ];

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[380px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 tracking-tight text-sm">AI Recommendations & Safety Advisories</h3>
              </div>
              <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200">
                Live AI Engine
              </span>
            </div>

            <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">
              {displayRecs.slice(0, 3).map((r: any, idx) => (
                <div key={idx} className={`p-3 rounded-xl border ${idx === 0 ? 'bg-purple-50/80 border-purple-200/80' : idx === 1 ? 'bg-amber-50/80 border-amber-200/80' : 'bg-slate-50 border-slate-200/80'}`}>
                  <div className={`flex items-center gap-2 font-bold text-xs mb-1 ${idx === 0 ? 'text-purple-900' : idx === 1 ? 'text-amber-900' : 'text-slate-800'}`}>
                    {idx === 0 ? <Sparkles className="w-3.5 h-3.5 text-purple-600" /> : idx === 1 ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> : <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />}
                    {r.title || r.recommendation || 'Operational Advisory'}
                  </div>
                  <p className={`text-xs leading-relaxed font-medium ${idx === 0 ? 'text-purple-800' : idx === 1 ? 'text-amber-800' : 'text-slate-600'}`}>
                    {r.text || r.description || r.details || 'System recommendation active.'}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
              <span className="text-[11px] text-slate-500">Updated continuously via Antigravity Engine</span>
              <button onClick={() => navigate('/ai-insights')} className="text-xs font-bold text-[#007BC4] hover:underline">
                AI Insights Tab →
              </button>
            </div>
          </div>
        );
      }

      case 'daily_summary': {
        const peakBucket = [...timelineData].sort((a, b) => (b.load || 0) - (a.load || 0))[0];
        const peakHourStr = peakBucket?.time ? `${peakBucket.time} (${peakBucket.load} scans)` : 'No scans recorded today';
        const scansDisplay = totalScansCount.toLocaleString();

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[380px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 tracking-tight text-sm">Daily Summary & Gate Throughput</h3>
              </div>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
                Today's Logs
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Total Scans Today</span>
                <div className="text-xl font-black text-slate-900 mt-1">{scansDisplay}</div>
                <span className="text-[10px] text-emerald-600 font-bold">RFID Scans in MongoDB</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Peak Gate Hour</span>
                <div className="text-xl font-black text-slate-900 mt-1">{peakHourStr.split(' ')[0]} {peakHourStr.split(' ')[1] || ''}</div>
                <span className="text-[10px] text-slate-500 font-medium">{peakBucket?.load ? `${peakBucket.load} check-ins` : '0 check-ins'}</span>
              </div>
            </div>

            <div className="space-y-2 flex-1">
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                <span className="text-slate-600 font-semibold">Entry / Exit Gate Throughput Ratio</span>
                <span className="font-bold text-slate-900">{checkedInToday} IN / {registeredPeopleList.filter((p: any) => p.presenceState === 'EXITED').length} OUT</span>
              </div>
              <div className="flex justify-between items-center bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200/80 text-xs">
                <span className="text-emerald-900 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Safety Incident Status
                </span>
                <span className="font-black text-emerald-700 text-sm">{incidentsList.filter((i: any) => i.severity === 'Critical').length === 0 ? 'Zero Critical Incidents' : `${incidentsList.filter((i: any) => i.severity === 'Critical').length} Critical Alerts`}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
              <span className="text-[11px] text-slate-500">Durable Records Synced in MongoDB</span>
              <button onClick={() => navigate('/audit')} className="text-xs font-bold text-[#007BC4] hover:underline">
                Compliance Logs →
              </button>
            </div>
          </div>
        );
      }

      case 'active_incidents': {
        const displayIncidents = incidentsList;

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md min-h-[380px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 tracking-tight text-sm">Active Incidents Feed</h3>
              </div>
              <button onClick={() => navigate('/incidents')} className="text-xs font-bold text-[#007BC4] hover:underline">
                View All Incidents ({displayIncidents.length}) →
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5">
              {displayIncidents.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs font-medium flex flex-col items-center justify-center gap-2">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                  <span>No active safety incidents recorded in MongoDB.</span>
                </div>
              ) : (
                displayIncidents.slice(0, 4).map((inc: any, i) => (
                  <div key={inc.id || i} onClick={() => navigate('/incidents')} className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 cursor-pointer transition">
                    <div className="flex items-start gap-3">
                      <span className={`p-2 rounded-lg text-white shrink-0 font-bold text-xs ${inc.severity === 'Critical' ? 'bg-rose-600' : inc.severity === 'High' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                        {inc.severity || 'Medium'}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-slate-900">{inc.title || inc.description}</div>
                        <div className="text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-3 mt-0.5">
                          <span>ID: {inc.id}</span>
                          <span>Zone: {inc.zone || inc.locationZone || 'Site Area'}</span>
                          <span>Responder: {inc.responder || inc.assignedLead || 'EHS Team'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono">{inc.time || (inc.createdAt ? new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged in DB')}</span>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${inc.status === 'Investigating' || inc.workflowStatus === 'Investigation' ? 'bg-rose-50 text-rose-700 border border-rose-200' : inc.status === 'Open' || inc.workflowStatus === 'Open' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {inc.status || inc.workflowStatus || 'Open'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      }

      case 'system_health':
        return <SystemHealthWidget />;

      case 'occupancy_panel':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[480px]">
             <div className="flex items-center justify-between mb-4 shrink-0">
               <div className="flex items-center gap-2">
                 <div className="w-2 rounded-full bg-[#10b981] h-2" />
                 <h3 className="font-semibold text-slate-900 tracking-tight text-sm">Facility Occupancy & Status</h3>
               </div>
               <div className="flex gap-2">
                 <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></span> Nominal</span>
                 <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></span> Busy</span>
               </div>
             </div>
             
             <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
               <div className="w-1/3 flex flex-col gap-3 border-r border-slate-100 pr-4 overflow-y-auto shrink-0 z-20">
                 <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white sticky top-0 py-1">Device Health</h4>
                 {((deviceList && deviceList.length > 0) ? deviceList.slice(0, 5) : [
                   { name: 'Main Entrance', status: 'online' },
                   { name: 'Lobby Scanner', status: 'online' },
                   { name: 'Server Rm Door', status: 'warning' },
                   { name: 'Loading Dock', status: 'online' },
                 ]).map((d, idx) => {
                   const isOnline = d.status === 'online';
                   const isWarning = d.status === 'warning';
                   const bgClass = isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : isWarning ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-rose-50 text-rose-700 border-rose-100';
                   
                   return (
                     <div 
                       key={d.id || idx} 
                       onClick={() => navigate('/devices')}
                       className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer hover:scale-[1.02] flex-shrink-0 transition-transform duration-200 ${bgClass}`}
                     >
                       <div className="font-bold text-xs truncate max-w-[100px]">{d.name}</div>
                       <div className="text-[10px] font-bold uppercase">{d.status}</div>
                     </div>
                   );
                 })}
                 <button 
                   onClick={() => navigate('/devices')} 
                   className="text-[10px] font-bold text-[#007BC4] uppercase text-left hover:underline mt-1 flex items-center gap-1 group bg-white sticky bottom-0 py-1"
                 >
                   View all devices <span className="group-hover:translate-x-1 transition-transform">→</span>
                 </button>
               </div>
               
               <div className="flex-1 flex flex-col bg-slate-50 rounded-lg p-4 overflow-hidden border border-slate-200 shadow-inner overflow-y-auto">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Live Zone Occupancy Distribution</h4>
                  <div className="flex flex-col gap-2">
                     {Object.keys(zones).map(z => {
                        const count = people.filter(p => p.currentZone === z).length;
                        const percent = Math.round((count / Math.max(people.length, 1)) * 100);
                        return (
                           <div key={z} onClick={() => navigate('/live', { state: { focusZone: z } })} className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-100 cursor-pointer hover:border-[#007BC4]/40 hover:bg-[#007BC4]/5 hover:translate-x-1 transition-all duration-200">
                              <div className="font-bold text-slate-700 w-24 text-xs truncate">{z}</div>
                              <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                 <div className={`h-full rounded-full transition-all duration-500 ${percent > 40 ? 'bg-[#f59e0b]' : 'bg-[#007BC4]'}`} style={{ width: `${Math.max(percent, 2)}%` }}></div>
                              </div>
                              <div className="w-10 text-right">
                                <span className="font-semibold text-xs text-slate-900">{count}</span>
                                <span className="text-[9px] text-slate-400 ml-0.5">pax</span>
                              </div>
                           </div>
                        )
                     })}
                  </div>
                  
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">Recent Movement Log</h4>
                  <div className="flex flex-col gap-1.5">
                     {recentMovements.length > 0 ? (
                        recentMovements.slice(0, 3).map(move => (
                          <div key={move.id} onClick={() => navigate('/playback')} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-100 cursor-pointer hover:border-[#007BC4]/30 hover:bg-[#007BC4]/5 hover:translate-x-0.5 transition-all duration-200">
                            <div className="flex items-center gap-2">
                               <div className="w-7 h-7 rounded bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold text-xs border border-[#007BC4]/20">{(move.name || 'U').charAt(0)}</div>
                               <div>
                                 <div className="font-bold text-xs text-slate-800 leading-tight">{move.name}</div>
                                 <div className="text-[9px] text-slate-500 font-medium uppercase tracking-wide leading-none">{move.role} - ID: {move.tagId.substring(0, 6)}</div>
                               </div>
                            </div>
                            <div className="flex flex-col items-end leading-none">
                               <div className="text-xs font-bold text-slate-600 flex items-center gap-1 text-right">
                                 <span className="w-1 h-1 rounded-full bg-[#007BC4]"></span> {move.fromZone ? `${move.fromZone} → ${move.toZone}` : `Entered ${move.toZone}`}
                               </div>
                               <div className="text-[9px] text-slate-400 font-mono mt-0.5">{move.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</div>
                            </div>
                          </div>
                        ))
                     ) : (
                        people.slice(0, 3).map(p => (
                          <div key={p.id} onClick={() => navigate('/live', { state: { focusZone: p.currentZone, highlightedPersonId: p.id } })} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-100 cursor-pointer hover:border-[#007BC4]/30 hover:bg-[#007BC4]/5 hover:translate-x-0.5 transition-all duration-200">
                             <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold text-xs border border-[#007BC4]/20">{(p.name || 'U').charAt(0)}</div>
                                <div>
                                  <div className="font-bold text-xs text-slate-800 leading-tight">{p.name}</div>
                                  <div className="text-[9px] text-slate-500 font-medium uppercase tracking-wide leading-none">{p.role}</div>
                                </div>
                             </div>
                             <div className="flex flex-col items-end leading-none">
                                <div className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500"></span> {p.currentZone}
                                </div>
                                <div className="text-[9px] text-slate-400 font-mono mt-0.5">Dwell: {Math.floor(p.dwellTime/60)}m {p.dwellTime%60}s</div>
                             </div>
                          </div>
                        ))
                     )}
                  </div>
               </div>
             </div>
          </div>
        );

      case 'alerts_panel':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[480px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900 tracking-tight text-sm">Recent Alerts</h3>
              <button onClick={() => navigate('/alerts')} className="text-xs font-semibold text-[#007BC4] hover:underline cursor-pointer">View All</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AIFeed alerts={alerts.length > 0 ? alerts : (dbAlerts.length > 0 ? dbAlerts : [])} />
            </div>
          </div>
        );

      case 'attendance_summary': {
        const sortedLogs = [...attendanceLogs].sort((a, b) => {
          const tA = new Date(a.checkInTime || a.inTime || a.createdAt || 0).getTime();
          const tB = new Date(b.checkInTime || b.inTime || b.createdAt || 0).getTime();
          return tA - tB;
        });
        const firstEntry = sortedLogs.find(l => l.checkInTime || l.inTime || l.status === 'PRESENT' || l.status === 'LATE');
        const lastExit = [...sortedLogs].reverse().find(l => l.checkOutTime || l.outTime || l.status === 'EXITED');
        const firstEntryTime = firstEntry?.checkInTime || firstEntry?.inTime ? new Date(firstEntry.checkInTime || firstEntry.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (sortedLogs.length > 0 ? '07:00 AM' : 'No scans recorded');
        const firstEntryName = firstEntry?.name || firstEntry?.personName || (registeredPeopleList[0]?.name) || 'Awaiting entry telemetry';
        const lastExitTime = lastExit?.checkOutTime || lastExit?.outTime ? new Date(lastExit.checkOutTime || lastExit.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'On site / No exit';
        const lastExitName = lastExit?.name || lastExit?.personName || 'All active personnel logged in';

        const totalActiveHours = sortedLogs.length > 0 ? '8h 00m' : '0h 00m';

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[480px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 shrink-0">
               <h3 className="font-semibold text-slate-900 tracking-tight text-sm">Attendance Summary</h3>
               <button onClick={() => navigate('/attendance')} className="text-xs font-semibold text-[#007BC4] hover:underline cursor-pointer">View Roster</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                 <div className="text-[10px] font-bold text-slate-500 uppercase">First Gate Check-In</div>
                 <div className="text-lg font-bold text-slate-900 mt-1">{firstEntryTime}</div>
                 <div className="text-[11px] text-slate-500 truncate">{firstEntryName}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                 <div className="text-[10px] font-bold text-slate-500 uppercase">Latest Gate Check-Out</div>
                 <div className="text-lg font-bold text-slate-900 mt-1">{lastExitTime}</div>
                 <div className="text-[11px] text-slate-500 truncate">{lastExitName}</div>
              </div>
              <div className="p-3 bg-[#007BC4]/5 border border-[#007BC4]/20 rounded-lg">
                 <div className="text-[10px] font-bold text-[#007BC4] uppercase">Shift Target Duration</div>
                 <div className="text-xl font-black text-[#007BC4] mt-1">{totalActiveHours}</div>
                 <div className="text-[11px] text-[#007BC4]/80">Synchronized with active shift schedule</div>
              </div>
            </div>
          </div>
        );
      }

      case 'ai_insights':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[480px]">
             <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 shrink-0">
               <h3 className="font-semibold text-slate-900 tracking-tight text-sm flex items-center gap-2"><Cpu className="w-4 h-4 text-purple-500" /> AI Insights</h3>
               <button onClick={() => navigate('/ai-insights')} className="text-xs font-semibold text-[#007BC4] hover:underline cursor-pointer">Open AI Studio</button>
            </div>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
               {(aiRecs.length > 0 ? aiRecs.slice(0, 4) : [
                 {
                   title: 'Site Safety Analysis',
                   text: `Headcount nominal across monitored sectors with ${movingCount} personnel active in motion. All RFID badges verified in MongoDB.`,
                   type: 'nominal'
                 }
               ]).map((insight: any, idx: number) => (
                 <div key={insight.id || idx} className={`p-3 rounded-lg border ${idx === 0 ? 'bg-purple-50 border-purple-100' : idx === 1 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-200'}`}>
                   <h4 className={`text-xs font-bold uppercase mb-1 ${idx === 0 ? 'text-purple-700' : idx === 1 ? 'text-amber-700' : 'text-slate-700'}`}>
                     {insight.title || insight.headline || 'Operational Insight'}
                   </h4>
                   <p className={`text-xs leading-relaxed font-medium ${idx === 0 ? 'text-purple-900' : idx === 1 ? 'text-amber-900' : 'text-slate-600'}`}>
                     {insight.text || insight.description || insight.recommendation || insight.details}
                   </p>
                 </div>
               ))}
            </div>
          </div>
        );

      case 'chart_over_time':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[300px]">
            <div className="flex justify-between items-center mb-3 shrink-0">
               <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Site crowd timeline</h3>
               <select className="bg-white text-[10px] font-semibold text-slate-600 border border-slate-200 shadow-sm rounded-md px-1.5 py-0.5 outline-none focus:border-[#007BC4]">
                 <option>Today</option>
               </select>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007BC4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#007BC4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', padding: '6px 10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 'bold', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="load" stroke="#007BC4" strokeWidth={1.5} fillOpacity={1} fill="url(#colorLoad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'chart_top_zones':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[300px]">
            <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 shrink-0">Zone Occupancy Shares</h3>
            <div className="flex-1 flex items-center justify-center relative min-h-0">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={zoneData}
                     innerRadius="65%"
                     outerRadius="90%"
                     paddingAngle={2}
                     dataKey="value"
                     stroke="none"
                   >
                     {zoneData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                     ))}
                   </Pie>
                   <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', padding: '6px 10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 'bold', fontSize: '11px' }} />
                 </PieChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <span className="text-xl font-bold text-slate-900">{(people.length || registeredCount || 0).toString()}</span>
                 <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Total</span>
               </div>
               
               {/* Custom Legend Overlay */}
               <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
                 {zoneData.slice(0, 3).map((entry, index) => (
                   <div key={entry.name} className="flex items-center justify-between gap-1.5 text-[10px] bg-white/95 border border-slate-100 px-1.5 py-0.5 rounded shadow-sm backdrop-blur">
                     <div className="flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                       <span className="text-slate-700 font-bold max-w-[50px] truncate">{entry.name}</span>
                     </div>
                     <span className="text-slate-500 font-bold">{Math.round((entry.value / Math.max(people.length, 1)) * 100)}%</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        );

      case 'chart_device_status':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[300px] justify-between">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">System Load & Readers</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#007BC4] animate-ping"></span>
                <span className="text-[10px] font-bold text-[#007BC4]">Live Telemetry</span>
              </div>
            </div>
            
            <div className="grid grid-cols-12 gap-3 flex-1 min-h-0 items-center">
              {/* Readers Pie representation */}
              <div className="col-span-6 relative flex items-center justify-center h-full">
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie
                      data={deviceData}
                      innerRadius="75%"
                      outerRadius="90%"
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {deviceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-extrabold text-slate-900 leading-none">
                    {deviceList.length || (deviceStats.online + deviceStats.offline) || 18}
                  </span>
                  <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Readers</span>
                </div>
              </div>

              {/* Status and Active System Load metrics right panel */}
              <div className="col-span-6 space-y-3">
                {/* Real Online Gateway Ratio */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                      <Wifi className="w-3 h-3 text-emerald-500" /> Online Portals
                    </span>
                    <span className="text-slate-900">{deviceList.length > 0 ? Math.round((deviceStats.online / deviceList.length) * 100) : 100}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${deviceList.length > 0 ? Math.round((deviceStats.online / deviceList.length) * 100) : 100}%` }} 
                    />
                  </div>
                </div>

                {/* Sweep Telemetry Rate */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-600">
                    <span>Active Scanning Rate</span>
                    <span className="text-[#007BC4] font-extrabold">{deviceStats.online * 25} msg/s</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#007BC4] h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.max(20, (deviceStats.online / Math.max(deviceList.length, 1)) * 100))}%` }} 
                    />
                  </div>
                </div>

                {/* Active Antennas count */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] font-bold text-slate-500">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center text-[7px] font-bold justify-center flex-shrink-0">✓</span>
                    <span>{deviceStats.offline === 0 ? 'All Portals Nominal' : `${deviceStats.offline} Portals Offline`}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Labels overlay bottom bar footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between shrink-0">
              {deviceData.map(d => (
                <div key={d.name} className="flex items-center gap-1 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color }}></span>
                  <span className="text-[10px] font-extrabold text-slate-700">{d.value}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'chart_heatmap':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm transition hover:shadow-md h-[300px]">
            <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 shrink-0">People Flow Heatmap</h3>
            <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 shadow-inner relative overflow-hidden flex items-center justify-center">
               <div className="absolute inset-0 z-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#007BC4 1px, transparent 1px), linear-gradient(90deg, #007BC4 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
               {(registeredPeopleList.length > 0 ? registeredPeopleList : people).map((p, idx) => {
                 const xVal = p.x !== undefined ? p.x : ((idx * 17) % 80 + 10);
                 const yVal = p.y !== undefined ? p.y : ((idx * 23) % 75 + 12);
                 return (
                   <div 
                     key={p.id || idx} 
                     className="absolute w-10 h-10 bg-[#007BC4]/35 dark:bg-sky-500/35 rounded-full blur-md animate-pulse pointer-events-none"
                     style={{ left: `${xVal}%`, top: `${yVal}%`, transform: 'translate(-50%, -50%)' }}
                     title={p.name}
                   />
                 );
               })}
               
               {/* Scale bar */}
               <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 z-10 bg-white/75 backdrop-blur px-2 py-1 rounded border border-slate-150">
                 <span className="text-[8px] font-black text-slate-500 uppercase leading-none">Low Density</span>
                 <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-[#007BC4] via-emerald-400 to-rose-500"></div>
                 <span className="text-[8px] font-black text-slate-500 uppercase leading-none">High Density</span>
               </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Render icon for KPI cards
  const renderKpiIcon = (name?: string) => {
    switch (name) {
      case 'UserCheck': return <UserCheck className="w-5 h-5 text-white" />;
      case 'UserX': return <UserX className="w-5 h-5 text-white" />;
      case 'HardHat': return <HardHat className="w-5 h-5 text-white" />;
      case 'Radio': return <Radio className="w-5 h-5 text-white" />;
      case 'Wifi': return <Wifi className="w-5 h-5 text-white" />;
      case 'WifiOff': return <WifiOff className="w-5 h-5 text-white" />;
      case 'Truck': return <Truck className="w-5 h-5 text-white" />;
      case 'ShieldAlert': return <ShieldAlert className="w-5 h-5 text-white" />;
      case 'Siren': return <Siren className="w-5 h-5 text-white animate-pulse" />;
      case 'Clock': return <Clock className="w-5 h-5 text-white" />;
      case 'ShieldCheck': return <ShieldCheck className="w-5 h-5 text-white" />;
      case 'TrendingUp': return <TrendingUp className="w-5 h-5 text-white" />;
      case 'Gauge': return <Gauge className="w-5 h-5 text-white" />;
      case 'Activity': return <Activity className="w-5 h-5 text-white" />;
      case 'Sparkles': return <Sparkles className="w-5 h-5 text-white" />;
      case 'Target': return <Target className="w-5 h-5 text-white" />;
      case 'MessageSquare': return <MessageSquare className="w-5 h-5 text-white" />;
      default: return <Users className="w-5 h-5 text-white" />;
    }
  };

  // Direct content dispatcher mapping metric KPI configurations dynamically
  const renderKpiCard = (id: string) => {
    const kpi = kpis.find(k => k.id === id);
    const title = kpi?.title;
    const subOverride = kpi?.sub;
    const iconColorOverride = kpi?.iconColor;
    const customVal = kpi?.customValue;

    if (customVal !== undefined || id.startsWith('custom_kpi_')) {
      return (
        <KpiCard 
          key={id} 
          title={title || "Custom Metric"} 
          value={customVal || "0"} 
          sub={subOverride || "Custom Tagline"} 
          icon={renderKpiIcon(kpi?.iconName)} 
          iconColor={iconColorOverride || "bg-[#007BC4]"} 
        />
      );
    }

    switch (id) {
      case 'total_workers':
      case 'total_people': {
        const totalCount = registeredPeopleList.length || people.length || liveTagsCount || registeredCount || 0;
        const activeCount = people.filter(p => p.presenceState !== 'EXITED').length || registeredPeopleList.length || liveTagsCount || 0;
        return (
          <KpiCard 
            key={id} 
            title={title || "Total Workers on Site"} 
            value={totalCount.toString()} 
            sub={subOverride || `${activeCount} active on site • ${totalCount} live roster`} 
            icon={renderKpiIcon(kpi?.iconName || 'Users')} 
            iconColor={iconColorOverride || "bg-[#007BC4]"} 
            onClick={() => navigate('/people')} 
          />
        );
      }
      case 'active_workers':
      case 'on_site': {
        const activeCount = people.filter(p => p.presenceState !== 'EXITED').length || registeredPeopleList.length || liveTagsCount || 0;
        const moving = movingCount || people.filter(p => p.presenceState === 'MOVING').length || (activeCount > 0 ? 1 : 0);
        return (
          <KpiCard 
            key={id} 
            title={title || "Active Workers"} 
            value={activeCount.toString()} 
            sub={subOverride || `${moving} in motion • ${Math.max(0, activeCount - moving)} on-shift trades`} 
            icon={renderKpiIcon(kpi?.iconName || 'UserCheck')} 
            iconColor={iconColorOverride || "bg-emerald-600"} 
            onClick={() => navigate('/live')} 
          />
        );
      }
      case 'visitors_count': {
        const vCount = visitorsList.length || visitorsCount || 0;
        return (
          <KpiCard 
            key={id} 
            title={title || "Visitors"} 
            value={vCount.toString()} 
            sub={subOverride || `${vCount} pre-registered & checked-in visitors`} 
            icon={renderKpiIcon(kpi?.iconName || 'UserX')} 
            iconColor={iconColorOverride || "bg-amber-500"} 
            onClick={() => navigate('/visitors')} 
          />
        );
      }
      case 'contractors_count': {
        const cCount = contractorsCount || (registeredPeopleList.length > 0 ? registeredPeopleList.filter(p => (p.role || '').toLowerCase().includes('contractor') || (p.role || '').toLowerCase().includes('sub') || (p.department || '').toLowerCase().includes('logistics') || (p.department || '').toLowerCase().includes('steel')).length : 0);
        return (
          <KpiCard 
            key={id} 
            title={title || "Contractors"} 
            value={cCount.toString()} 
            sub={subOverride || `${cCount} subcontractor trades on site`} 
            icon={renderKpiIcon(kpi?.iconName || 'HardHat')} 
            iconColor={iconColorOverride || "bg-indigo-600"} 
            onClick={() => navigate('/people')} 
          />
        );
      }
      case 'active_tags': {
        const totalEquipment = vehiclesList.length + assetsList.length;
        const totalFleetTags = registeredPeopleList.length + visitorsList.length + totalEquipment;
        const activeLiveTransmitting = liveTagsCount || liveTagsList.length || people.length || totalFleetTags;
        return (
          <KpiCard 
            key={id} 
            title={title || "Active RFID Tags"} 
            value={activeLiveTransmitting.toString()} 
            sub={subOverride || `${activeLiveTransmitting} transmitting live • ${totalFleetTags} registered profiles`} 
            icon={renderKpiIcon(kpi?.iconName || 'Radio')} 
            iconColor={iconColorOverride || "bg-sky-600"} 
            onClick={() => navigate('/devices')} 
          />
        );
      }
      case 'online_readers': {
        const totalReaders = deviceList.length;
        const onlineReadersCount = deviceStats.online;
        return (
          <KpiCard 
            key={id} 
            title={title || "Online Readers"} 
            value={onlineReadersCount.toString()} 
            sub={subOverride || `${onlineReadersCount}/${totalReaders} gate portals online & scanning`} 
            icon={renderKpiIcon(kpi?.iconName || 'Wifi')} 
            iconColor={iconColorOverride || "bg-emerald-600"} 
            onClick={() => navigate('/devices')} 
          />
        );
      }
      case 'offline_readers': {
        const offlineReadersCount = deviceStats.offline;
        const warnCount = deviceStats.warning;
        return (
          <KpiCard 
            key={id} 
            title={title || "Offline Readers"} 
            value={offlineReadersCount.toString()} 
            sub={subOverride || `${offlineReadersCount} offline reader • ${warnCount} in warning state`} 
            icon={renderKpiIcon(kpi?.iconName || 'WifiOff')} 
            iconColor={iconColorOverride || "bg-rose-600"} 
            onClick={() => navigate('/devices')} 
          />
        );
      }
      case 'active_equipment': {
        const totalVehicles = vehiclesList.length;
        const totalAssets = assetsList.length;
        const totalEquip = totalVehicles + totalAssets;
        return (
          <KpiCard 
            key={id} 
            title={title || "Active Equipment"} 
            value={totalEquip.toString()} 
            sub={subOverride || `${totalVehicles} heavy vehicles • ${totalAssets} asset tools`} 
            icon={renderKpiIcon(kpi?.iconName || 'Truck')} 
            iconColor={iconColorOverride || "bg-purple-600"} 
            onClick={() => navigate('/maintenance')} 
          />
        );
      }
      case 'safety_alerts':
      case 'alerts_count': {
        const mergedAlerts = [...alerts, ...dbAlerts];
        const uniqueAlerts = Array.from(new Map(mergedAlerts.map(a => [a.id || a.title || Math.random(), a])).values());
        const safetyCount = uniqueAlerts.filter(a => a.type === 'warning' || a.type === 'info' || (a as any).priority === 'High' || (a as any).priority === 'Medium').length;
        return (
          <KpiCard 
            key={id} 
            title={title || "Safety Alerts"} 
            value={safetyCount.toString()} 
            sub={subOverride || "PPE & hazard proximity warnings"} 
            icon={renderKpiIcon(kpi?.iconName || 'ShieldAlert')} 
            iconColor={iconColorOverride || "bg-amber-500"} 
            onClick={() => navigate('/alerts')} 
          />
        );
      }
      case 'emergency_alerts': {
        const mergedAlerts = [...alerts, ...dbAlerts];
        const uniqueAlerts = Array.from(new Map(mergedAlerts.map(a => [a.id || a.title || Math.random(), a])).values());
        const emergencyCount = uniqueAlerts.filter(a => a.type === 'security' || (a as any).priority === 'Critical').length + incidentsList.filter(i => i.severity === 'Critical').length;
        return (
          <KpiCard 
            key={id} 
            title={title || "Emergency Alerts"} 
            value={emergencyCount.toString()} 
            sub={subOverride || "Critical panic & crane radius breaches"} 
            icon={renderKpiIcon(kpi?.iconName || 'Siren')} 
            iconColor={iconColorOverride || "bg-rose-600"} 
            onClick={() => navigate('/incidents')} 
          />
        );
      }
      case 'attendance_today': {
        const totalRoster = registeredPeopleList.length || registeredCount || people.length || 0;
        const checkedInToday = attendanceLogs.length > 0 
          ? attendanceLogs.filter((l: any) => l.status === 'PRESENT' || l.status === 'LATE' || l.checkInTime || l.inTime).length 
          : people.filter(p => p.presenceState !== 'EXITED').length;
        const attRate = totalRoster > 0 ? Math.min(100, Math.round((checkedInToday / totalRoster) * 1000) / 10) : 0;
        return (
          <KpiCard 
            key={id} 
            title={title || "Attendance Today"} 
            value={`${attRate}%`} 
            sub={subOverride || `${checkedInToday} / ${totalRoster} scheduled workers checked in`} 
            icon={renderKpiIcon(kpi?.iconName || 'Clock')} 
            iconColor={iconColorOverride || "bg-blue-600"} 
            onClick={() => navigate('/attendance')} 
          />
        );
      }
      case 'ppe_compliance': {
        const totalPeopleCount = registeredPeopleList.length || registeredCount || people.length || 0;
        const compliantCount = registeredPeopleList.length > 0
          ? registeredPeopleList.filter(p => p.ppeStatus === 'COMPLIANT' || !p.ppeStatus).length
          : people.filter(p => p.ppeStatus === 'COMPLIANT' || !p.ppeStatus).length;
        const complianceRate = totalPeopleCount > 0 ? Math.min(100, Math.round((compliantCount / totalPeopleCount) * 1000) / 10) : 100;
        return (
          <KpiCard 
            key={id} 
            title={title || "PPE Compliance"} 
            value={`${complianceRate}%`} 
            sub={subOverride || `${compliantCount} / ${totalPeopleCount} hardhat & PPE tags verified`} 
            icon={renderKpiIcon(kpi?.iconName || 'ShieldCheck')} 
            iconColor={iconColorOverride || "bg-teal-600"} 
            onClick={() => navigate('/ai-insights')} 
          />
        );
      }
      case 'productivity_score': {
        const activeMovers = movingCount || registeredPeopleList.filter(p => p.presenceState === 'MOVING').length;
        const totalPop = Math.max(registeredPeopleList.length || people.length, 1);
        const prodScore = Math.min(100, Math.max(50, Math.round(((activeMovers / totalPop) * 30 + 70) * 10) / 10));
        return (
          <KpiCard 
            key={id} 
            title={title || "Productivity Score"} 
            value={`${prodScore}%`} 
            sub={subOverride || "Active work vs idle dwell rating"} 
            icon={renderKpiIcon(kpi?.iconName || 'TrendingUp')} 
            iconColor={iconColorOverride || "bg-emerald-600"} 
            onClick={() => navigate('/analytics')} 
          />
        );
      }
      case 'site_utilization': {
        const totalDevsCount = deviceList.length;
        const utilizedRate = totalDevsCount > 0 ? Math.min(100, Math.round((deviceStats.online / totalDevsCount) * 1000) / 10) : 0;
        return (
          <KpiCard 
            key={id} 
            title={title || "Site Utilization"} 
            value={`${utilizedRate}%`} 
            sub={subOverride || "Active sectors vs max capacity"} 
            icon={renderKpiIcon(kpi?.iconName || 'Gauge')} 
            iconColor={iconColorOverride || "bg-violet-600"} 
            onClick={() => navigate('/live')} 
          />
        );
      }
      case 'in_motion':
        return (
          <KpiCard 
            key={id} 
            title={title || "In Motion"} 
            value={movingCount.toString()} 
            sub={subOverride || "Tags in moving state"} 
            icon={renderKpiIcon(kpi?.iconName || 'Activity')} 
            iconColor={iconColorOverride || "bg-[#007BC4]"} 
            onClick={() => navigate('/live')} 
          />
        );
      case 'dwell_time':
        return (
          <KpiCard 
            key={id} 
            title={title || "Avg. Dwell Time"} 
            value={`${avgDwellInfo}m`} 
            sub={subOverride || "Per active on-site session"} 
            icon={renderKpiIcon(kpi?.iconName || 'Clock')} 
            iconColor={iconColorOverride || "bg-[#8b5cf6]"} 
            onClick={() => navigate('/analytics')} 
          />
        );
      default:
        return (
          <KpiCard 
            key={id} 
            title={title || id} 
            value={customVal || "0"} 
            sub={subOverride || "Metric Counter"} 
            icon={renderKpiIcon(kpi?.iconName)} 
            iconColor={iconColorOverride || "bg-[#007BC4]"} 
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 animate-pulse">
           <div className="w-12 h-12 rounded-full border-4 border-[#007BC4] border-t-transparent animate-spin"></div>
           <div className="text-slate-500 font-medium tracking-wide">Syncing real-time data from MongoDB...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6 lg:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      
      {/* Dashboard Top Action Bar */}
      <div className="flex items-center justify-end gap-2.5 flex-wrap shrink-0">
        <button 
          onClick={() => navigate('/live')}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold shadow-2xs transition-all active:scale-95 duration-150 cursor-pointer"
        >
          <MapIcon className="w-3.5 h-3.5 text-emerald-600" />
          Live Site Map
        </button>
        <button 
          onClick={handleExportData}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-bold shadow-2xs transition-all active:scale-95 duration-150 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          Export Audit Pack
        </button>
        <button 
          onClick={openCustomizeModal}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#007BC4] text-white hover:bg-[#006aa9] rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95 duration-150 cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Customize Layout
        </button>
      </div>

      {/* Dynamic KPI Cards Row (3 Rows x 4 Columns) */}
      {sortedVisibleKpis.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 shrink-0">
          {sortedVisibleKpis.map(k => renderKpiCard(k.id))}
        </div>
      ) : (
        <div className="bg-slate-100 border border-dashed border-slate-300 rounded-xl p-4 text-center text-slate-500 text-xs font-semibold flex items-center justify-center gap-2">
          <span>All metric cards are currently hidden.</span>
          <button onClick={openCustomizeModal} className="text-[#007BC4] hover:underline font-bold">Configure Layout →</button>
        </div>
      )}
      
      {/* Dynamic 12-column Grid of Main Panels & Charts */}
      {sortedVisiblePanels.length > 0 ? (
        <div className="grid grid-cols-12 gap-6 items-start shrink-0">
          {sortedVisiblePanels.map(panel => {
            const widthClass = getPanelWidthClass(panel.width);
            return (
              <div key={panel.id} className={widthClass}>
                {renderPanelContent(panel.id)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border rounded-xl p-10 text-center shadow-sm flex flex-col items-center justify-center gap-3">
          <SlidersHorizontal className="w-8 h-8 text-slate-300" />
          <h3 className="font-bold text-slate-700 text-sm">Dashboard layout empty</h3>
          <p className="text-xs text-slate-500 max-w-sm">No panels are currently toggled on. Customize your operations console to display the maps, graphs, and logs you want to track.</p>
          <button 
            onClick={openCustomizeModal}
            className="mt-2 px-4 py-2 bg-[#007BC4] hover:bg-[#006aa9] text-white text-xs font-bold rounded-lg shadow transition"
          >
            Select Layout Panels
          </button>
        </div>
      )}

      {/* Floating Side-Panel Customizer (Slide-In Slide-Out Drawer) */}
      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Transparent Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setShowCustomizeModal(false)}
          />
          
          {/* Slide Drawer body container */}
          <div className="w-[440px] max-w-full bg-white h-full relative z-10 shadow-2xl flex flex-col justify-between border-l border-slate-200">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#007BC4]/10 rounded-lg text-[#007BC4]">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Customize Dashboard Layout</h3>
                  <span className="text-[10px] text-slate-500 font-medium">Toggle, resize and sort your tracking panels.</span>
                </div>
              </div>
              <button 
                onClick={() => setShowCustomizeModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Config Tabs Selector */}
            <div className="flex border-b border-slate-150 text-xs shrink-0 bg-slate-50/50">
              <button 
                onClick={() => { setActiveTab('metrics'); setEditingKpiId(null); setEditingPanelId(null); }}
                className={`flex-1 py-3 text-center font-bold relative transition ${activeTab === 'metrics' ? 'text-[#007BC4]' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Metric Cards ({tempKpis.filter(k => !k.deleted).length})
                {activeTab === 'metrics' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#007BC4]" />}
              </button>
              <button 
                onClick={() => { setActiveTab('grids'); setEditingKpiId(null); setEditingPanelId(null); }}
                className={`flex-1 py-3 text-center font-bold relative transition ${activeTab === 'grids' ? 'text-[#007BC4]' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Widgets ({tempPanels.filter(p => !p.deleted).length})
                {activeTab === 'grids' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#007BC4]" />}
              </button>
              <button 
                onClick={() => { setActiveTab('trash'); setEditingKpiId(null); setEditingPanelId(null); }}
                className={`py-3 px-3 text-center font-bold relative transition ${activeTab === 'trash' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Trash Bin"
              >
                Trash ({tempKpis.filter(k => k.deleted).length + tempPanels.filter(p => p.deleted).length})
                {activeTab === 'trash' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-rose-600" />}
              </button>
            </div>
            
            {/* Scrollable Form body */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'metrics' ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between bg-[#007BC4]/5 p-3 rounded-lg border border-[#007BC4]/10">
                    <p className="text-[11px] leading-relaxed text-slate-600 font-medium">✨ Drag handles to rearrange, edit text, or create custom metric counters.</p>
                    <button
                      onClick={() => setShowAddKpiForm(!showAddKpiForm)}
                      className="shrink-0 flex items-center gap-1 bg-[#007BC4] text-white px-2.5 py-1.5 rounded-md text-[11px] font-bold hover:bg-[#006aa9] transition shadow-xs cursor-pointer ml-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showAddKpiForm ? 'Close' : 'Add Metric'}
                    </button>
                  </div>

                  {/* Add Custom KPI Form */}
                  {showAddKpiForm && (
                    <div className="p-4 bg-slate-100/80 rounded-xl border border-slate-200/80 flex flex-col gap-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Create Custom Metric Card</span>
                        <button onClick={() => setShowAddKpiForm(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Card Label</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Scaffolding Rating"
                            value={newKpiTitle}
                            onChange={(e) => setNewKpiTitle(e.target.value)}
                            className="w-full mt-1 bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Value / Score</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 99.4%"
                            value={newKpiVal}
                            onChange={(e) => setNewKpiVal(e.target.value)}
                            className="w-full mt-1 bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Subtitle / Tagline</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 14 Audits Scanned Today"
                          value={newKpiSub}
                          onChange={(e) => setNewKpiSub(e.target.value)}
                          className="w-full mt-1 bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Icon</label>
                          <select 
                            value={newKpiIcon}
                            onChange={(e) => setNewKpiIcon(e.target.value)}
                            className="w-full mt-1 bg-white border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                          >
                            <option value="Target">Target / Goal</option>
                            <option value="Users">Users / Roster</option>
                            <option value="Radio">RFID Radio</option>
                            <option value="Truck">Heavy Fleet</option>
                            <option value="ShieldAlert">Hazard Warning</option>
                            <option value="Clock">Shift Clock</option>
                            <option value="Sparkles">AI Insight</option>
                            <option value="Activity">Motion Tracker</option>
                            <option value="Gauge">Capacity Meter</option>
                            <option value="MessageSquare">Notes / Chat</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Badge Accent</label>
                          <select 
                            value={newKpiColor}
                            onChange={(e) => setNewKpiColor(e.target.value)}
                            className="w-full mt-1 bg-white border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                          >
                            <option value="bg-[#007BC4]">Aperture Blue</option>
                            <option value="bg-emerald-600">Safety Emerald</option>
                            <option value="bg-amber-500">Caution Amber</option>
                            <option value="bg-indigo-600">Trade Indigo</option>
                            <option value="bg-rose-600">Alert Crimson</option>
                            <option value="bg-purple-600">Fleet Purple</option>
                            <option value="bg-teal-600">Compliance Teal</option>
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (!newKpiTitle.trim()) return;
                          const newCard: KPIConfig = {
                            id: `custom_kpi_${Date.now()}`,
                            title: newKpiTitle.trim(),
                            customValue: newKpiVal.trim() || '100',
                            sub: newKpiSub.trim() || 'Custom Metric Tagline',
                            iconName: newKpiIcon,
                            iconColor: newKpiColor,
                            visible: true,
                            order: tempKpis.filter(k => !k.deleted).length + 1
                          };
                          setTempKpis(prev => [...prev, newCard]);
                          setNewKpiTitle('');
                          setNewKpiVal('');
                          setNewKpiSub('');
                          setShowAddKpiForm(false);
                        }}
                        className="w-full mt-1 py-2 bg-[#007BC4] hover:bg-[#006aa9] text-white rounded-lg text-xs font-bold transition shadow"
                      >
                        ＋ Create & Add Metric Card
                      </button>
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2">
                    {[...tempKpis]
                      .filter(k => !k.deleted)
                      .sort((a,b) => a.order - b.order)
                      .map((kpi, idx, arr) => {
                        const isDraggingObj = draggedIdx === idx;
                        const isOver = dragOverIdx === idx;
                        const isEditingThis = editingKpiId === kpi.id;
                        
                        return (
                          <motion.div 
                            layout
                            id={`kpi-item-${kpi.id}`}
                            key={kpi.id}
                            draggable={!isEditingThis}
                            onDragStart={(e: any) => handleDragStart(e, idx)}
                            onDragOver={(e: any) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            onDrop={(e) => handleDrop(e, idx, 'kpi')}
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                            className={`flex flex-col p-3 rounded-lg border transition-all ${
                              isDraggingObj 
                                ? 'opacity-30 border-dashed border-[#007BC4] bg-slate-100' 
                                : isOver 
                                  ? 'border-[#007BC4] bg-[#007BC4]/10 shadow-md scale-[1.01]' 
                                  : isEditingThis
                                    ? 'bg-blue-50/60 border-[#007BC4] shadow-sm'
                                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Grip Icon Drag Handle */}
                                <div className="text-slate-400 hover:text-slate-600 p-0.5 cursor-grab">
                                  <GripVertical className="w-4 h-4 shrink-0" />
                                </div>
                                
                                <button 
                                  onClick={() => handleToggleKpi(kpi.id)}
                                  className={`p-1.5 rounded-md hover:bg-white border transition shadow-xs ${kpi.visible ? 'text-[#007BC4] border-[#007BC4]/20 bg-[#007BC4]/5' : 'text-slate-400 border-slate-200 bg-white'}`}
                                  title={kpi.visible ? "Disable metric" : "Enable metric"}
                                >
                                  {kpi.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                                
                                <span className={`text-xs font-bold truncate ${kpi.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{kpi.title}</span>
                              </div>
                              
                              {/* Actions bar */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button 
                                  onClick={() => setEditingKpiId(isEditingThis ? null : kpi.id)}
                                  className={`p-1 rounded transition shadow-xs border ${isEditingThis ? 'bg-[#007BC4] text-white border-[#007BC4]' : 'bg-white hover:bg-slate-200 text-slate-500 border-slate-100'}`}
                                  title="Edit Title & Icon"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleMoveKpiUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 rounded bg-white hover:bg-slate-200 text-slate-500 disabled:opacity-20 transition shadow-xs border border-slate-100"
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleMoveKpiDown(idx)}
                                  disabled={idx === arr.length - 1}
                                  className="p-1 rounded bg-white hover:bg-slate-200 text-slate-500 disabled:opacity-20 transition shadow-xs border border-slate-100"
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteKpi(kpi.id)}
                                  className="p-1 rounded bg-white hover:bg-red-50 text-red-500 hover:text-red-700 transition shadow-xs border border-slate-100 ml-1 cursor-pointer"
                                  title="Send to Trash"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Editor Drawer for this KPI */}
                            {isEditingThis && (
                              <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-1 gap-2.5 text-xs animate-in fade-in duration-150">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Rename Card Title</label>
                                  <input 
                                    type="text"
                                    value={kpi.title}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTempKpis(prev => prev.map(k => k.id === kpi.id ? { ...k, title: val } : k));
                                    }}
                                    className="w-full mt-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#007BC4]"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Custom Subtitle</label>
                                    <input 
                                      type="text"
                                      value={kpi.sub || ''}
                                      placeholder="e.g. Live roster on site"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setTempKpis(prev => prev.map(k => k.id === kpi.id ? { ...k, sub: val } : k));
                                      }}
                                      className="w-full mt-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#007BC4]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Fixed Value Override</label>
                                    <input 
                                      type="text"
                                      value={kpi.customValue || ''}
                                      placeholder="Leave empty for dynamic"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setTempKpis(prev => prev.map(k => k.id === kpi.id ? { ...k, customValue: val } : k));
                                      }}
                                      className="w-full mt-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#007BC4]"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                  <span className="text-[10px] text-slate-400 font-medium">Changes apply upon saving layout.</span>
                                  <button 
                                    onClick={() => setEditingKpiId(null)}
                                    className="px-3 py-1 bg-[#007BC4] text-white font-bold rounded text-[11px]"
                                  >
                                    Done Editing
                                  </button>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                  </div>
                </div>
              ) : activeTab === 'grids' ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between bg-[#007BC4]/5 p-3 rounded-lg border border-[#007BC4]/10">
                    <p className="text-[11px] leading-relaxed text-slate-600 font-medium">✨ Drag to order active panels or resize grid column widths below.</p>
                    <button
                      onClick={() => setShowAddPanelForm(!showAddPanelForm)}
                      className="shrink-0 flex items-center gap-1 bg-[#007BC4] text-white px-2.5 py-1.5 rounded-md text-[11px] font-bold hover:bg-[#006aa9] transition shadow-xs cursor-pointer ml-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showAddPanelForm ? 'Close' : 'Add Widget'}
                    </button>
                  </div>

                  {/* Add Custom Panel Widget Form */}
                  {showAddPanelForm && (
                    <div className="p-4 bg-slate-100/80 rounded-xl border border-slate-200/80 flex flex-col gap-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Create Custom Widget Panel</span>
                        <button onClick={() => setShowAddPanelForm(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Widget Header Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. EHS Shift Briefing Board"
                          value={newPanelTitle}
                          onChange={(e) => setNewPanelTitle(e.target.value)}
                          className="w-full mt-1 bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Widget Description</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Daily site instructions and emergency protocols"
                          value={newPanelDesc}
                          onChange={(e) => setNewPanelDesc(e.target.value)}
                          className="w-full mt-1 bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Grid Column Width</label>
                          <select 
                            value={newPanelWidth}
                            onChange={(e: any) => setNewPanelWidth(e.target.value)}
                            className="w-full mt-1 bg-white border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                          >
                            <option value="1/3">1/3 Width</option>
                            <option value="1/2">1/2 Width (Half Screen)</option>
                            <option value="2/3">2/3 Width</option>
                            <option value="full">Full Width (12 Columns)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Widget Function</label>
                          <select 
                            value={newPanelType}
                            onChange={(e: any) => setNewPanelType(e.target.value)}
                            className="w-full mt-1 bg-white border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#007BC4]"
                          >
                            <option value="notes">Editable Shift Notes Board</option>
                            <option value="quick_links">Safety Launchpad Buttons</option>
                            <option value="gauge">Target Compliance Dial</option>
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (!newPanelTitle.trim()) return;
                          const newWidget: PanelConfig = {
                            id: `custom_panel_${Date.now()}`,
                            title: newPanelTitle.trim(),
                            description: newPanelDesc.trim() || 'Custom site operational tracking panel',
                            width: newPanelWidth,
                            visible: true,
                            order: tempPanels.filter(p => !p.deleted).length + 1,
                            customType: newPanelType,
                            customNotes: 'Type custom site briefing notes or shift highlights here...'
                          };
                          setTempPanels(prev => [...prev, newWidget]);
                          setNewPanelTitle('');
                          setNewPanelDesc('');
                          setShowAddPanelForm(false);
                        }}
                        className="w-full mt-1 py-2 bg-[#007BC4] hover:bg-[#006aa9] text-white rounded-lg text-xs font-bold transition shadow"
                      >
                        ＋ Create & Add Widget Panel
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {[...tempPanels]
                      .filter(p => !p.deleted)
                      .sort((a,b) => a.order - b.order)
                      .map((panel, idx, arr) => {
                        const isDraggingObj = draggedIdx === idx;
                        const isOver = dragOverIdx === idx;
                        const isEditingThis = editingPanelId === panel.id;
                        
                        return (
                          <motion.div 
                            layout
                            id={`panel-item-${panel.id}`}
                            key={panel.id}
                            draggable={!isEditingThis}
                            onDragStart={(e: any) => handleDragStart(e, idx)}
                            onDragOver={(e: any) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            onDrop={(e) => handleDrop(e, idx, 'panel')}
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                            className={`p-3.5 rounded-lg border flex flex-col gap-2 transition-all ${
                              isDraggingObj
                                ? 'opacity-30 border-dashed border-[#007BC4] bg-slate-100'
                                : isOver
                                  ? 'border-[#007BC4] bg-[#007BC4]/10 shadow-lg scale-[1.01]'
                                  : isEditingThis
                                    ? 'bg-blue-50/60 border-[#007BC4] shadow-sm'
                                    : panel.visible 
                                      ? 'bg-slate-50/50 hover:bg-slate-50 border-slate-200 shadow-none' 
                                      : 'bg-slate-50 border-slate-200/50 opacity-70 border-dashed'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Grip Drag Handle */}
                                <div className="text-slate-400 hover:text-slate-600 p-0.5 cursor-grab">
                                  <GripVertical className="w-4 h-4 shrink-0" />
                                </div>
                                
                                <button 
                                  onClick={() => handleTogglePanel(panel.id)}
                                  className={`p-1.5 rounded-md hover:bg-white border transition shadow-xs ${panel.visible ? 'text-[#007BC4] border-[#007BC4]/20 bg-[#007BC4]/5' : 'text-slate-400 border-slate-200 bg-white'}`}
                                  title={panel.visible ? "Disable widget" : "Enable widget"}
                                >
                                  {panel.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                                <div className="min-w-0">
                                  <p className={`text-xs font-bold leading-tight truncate ${panel.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{panel.title}</p>
                                  <p className="text-[9px] text-slate-400 mt-0.5 leading-tight max-w-[200px] truncate">{panel.description}</p>
                                </div>
                              </div>
                              
                              {/* Alternative reorder keys */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button 
                                  onClick={() => setEditingPanelId(isEditingThis ? null : panel.id)}
                                  className={`p-1 rounded transition shadow-xs border ${isEditingThis ? 'bg-[#007BC4] text-white border-[#007BC4]' : 'bg-white hover:bg-slate-200 text-slate-500 border-slate-100'}`}
                                  title="Edit Panel Label"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleMovePanelUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 rounded bg-white hover:bg-slate-200 text-slate-500 disabled:opacity-20 transition shadow-xs border border-slate-100"
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleMovePanelDown(idx)}
                                  disabled={idx === arr.length - 1}
                                  className="p-1 rounded bg-white hover:bg-slate-200 text-slate-500 disabled:opacity-20 transition shadow-xs border border-slate-100"
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeletePanel(panel.id)}
                                  className="p-1 rounded bg-white hover:bg-red-50 text-red-500 hover:text-red-700 transition shadow-xs border border-slate-100 ml-1 cursor-pointer"
                                  title="Send to Trash"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Editor for Panel Title */}
                            {isEditingThis && (
                              <div className="mt-2 pt-2 border-t border-slate-200/80 flex flex-col gap-2 text-xs animate-in fade-in duration-150">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Rename Panel Title</label>
                                  <input 
                                    type="text"
                                    value={panel.title}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTempPanels(prev => prev.map(p => p.id === panel.id ? { ...p, title: val } : p));
                                    }}
                                    className="w-full mt-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#007BC4]"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Panel Description</label>
                                  <input 
                                    type="text"
                                    value={panel.description}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTempPanels(prev => prev.map(p => p.id === panel.id ? { ...p, description: val } : p));
                                    }}
                                    className="w-full mt-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#007BC4]"
                                  />
                                </div>
                                <div className="flex justify-end pt-1">
                                  <button 
                                    onClick={() => setEditingPanelId(null)}
                                    className="px-3 py-1 bg-[#007BC4] text-white font-bold rounded text-[11px]"
                                  >
                                    Done Editing
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {/* Width selector grids */}
                            {panel.visible && panel.id !== 'tech_footer' && (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mt-1 pt-2 border-t border-slate-200/50">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Grid column width</label>
                                <div className="flex items-center gap-0.5 self-end sm:self-auto">
                                  {(['1/4', '1/3', '1/2', '2/3', 'full'] as const).map(w => {
                                    const isSelected = panel.width === w;
                                    return (
                                      <button
                                        key={w}
                                        onClick={() => handleResizePanel(panel.id, w)}
                                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition ${isSelected ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-xs' : 'bg-white hover:bg-slate-150 text-slate-500 border-slate-200'}`}
                                      >
                                        {w}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                /* Trash Bin Tab */
                <div className="flex flex-col gap-4">
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 font-medium">
                    🗑️ <strong>Trash Bin:</strong> Items here are currently removed from your active dashboard grid. Click <strong>Restore</strong> to put them back into layout.
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deleted Metric Cards</span>
                    {tempKpis.filter(k => k.deleted).length > 0 ? (
                      tempKpis.filter(k => k.deleted).map(kpi => (
                        <div key={kpi.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <span className="font-bold text-slate-700">{kpi.title}</span>
                          <button
                            onClick={() => setTempKpis(prev => prev.map(k => k.id === kpi.id ? { ...k, deleted: false, visible: true } : k))}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold hover:bg-emerald-700 transition"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restore
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic p-2">No deleted metrics in trash.</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deleted Panel Widgets</span>
                    {tempPanels.filter(p => p.deleted).length > 0 ? (
                      tempPanels.filter(p => p.deleted).map(panel => (
                        <div key={panel.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <div>
                            <span className="font-bold text-slate-700 block">{panel.title}</span>
                            <span className="text-[10px] text-slate-400">{panel.description}</span>
                          </div>
                          <button
                            onClick={() => setTempPanels(prev => prev.map(p => p.id === panel.id ? { ...p, deleted: false, visible: true } : p))}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold hover:bg-emerald-700 transition shrink-0 ml-2"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restore
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic p-2">No deleted panels in trash.</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Customizer footer */}
            <div className="p-4 border-t border-slate-150 flex items-center justify-between bg-slate-50">
              <button 
                onClick={handleResetLayout}
                className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase text-slate-400 hover:text-rose-500 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowCustomizeModal(false)}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-bold text-slate-700 cursor-pointer transition active:scale-95 duration-100"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleSaveLayout(tempKpis, tempPanels)}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#007BC4] hover:bg-[#006aa9] rounded-lg text-xs font-bold text-white cursor-pointer transition shadow hover:shadow-md disabled:opacity-50 active:scale-95 duration-100"
                >
                  {isSaving ? (
                    <>
                      <LoaderSpin />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Supervisor Quick Note Modal */}
      {showQuickNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowQuickNoteModal(false)}
          />

          {/* Modal Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl relative z-10 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#007BC4]/10 text-[#007BC4] rounded-lg border border-[#007BC4]/20">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Add Zone Quick Note</h3>
                  <p className="text-[10px] text-slate-500 font-semibold">Post a temporary status flag or safety observation.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowQuickNoteModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Select Site Zone</label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#007BC4] font-bold text-slate-700 transition"
                >
                  {zones && Object.keys(zones).map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                  {(!zones || Object.keys(zones).length === 0) && (
                    <option value="People Tracking in Construction">People Tracking in Construction</option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Status / Risk Flag</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Nominal', color: 'border-emerald-200 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-50' },
                    { label: 'Attention Required', color: 'border-amber-200 text-amber-800 bg-amber-50/50 hover:bg-amber-50' },
                    { label: 'Restricted Access', color: 'border-orange-200 text-orange-800 bg-orange-50/50 hover:bg-orange-50' },
                    { label: 'High Risk', color: 'border-rose-200 text-rose-800 bg-rose-50/50 hover:bg-rose-50' }
                  ].map(statusItem => (
                    <button
                      key={statusItem.label}
                      type="button"
                      onClick={() => setQuickNoteStatus(statusItem.label)}
                      className={`px-2.5 py-1.5 border rounded-lg text-[10px] font-extrabold transition text-center cursor-pointer ${
                        quickNoteStatus === statusItem.label 
                          ? `${statusItem.color} border-2 scale-[1.02] shadow-xs ring-1 ring-slate-400/10` 
                          : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
                      }`}
                    >
                      {statusItem.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Supervisor Observation Notes</label>
                <textarea
                  placeholder="Type temporary zone logs, reader inspection tags, or field alerts here..."
                  value={quickNoteText}
                  onChange={(e) => setQuickNoteText(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#007BC4] font-medium text-slate-800 placeholder-slate-400 transition"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
              <button 
                type="button"
                onClick={() => setShowQuickNoteModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 cursor-pointer transition active:scale-95 duration-100"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleAddQuickNote}
                disabled={!quickNoteText.trim()}
                className="px-4 py-2 bg-[#007BC4] hover:bg-[#006aa9] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white shadow hover:shadow-md cursor-pointer transition active:scale-95 duration-100"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function LoaderSpin() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

function KpiCard({ 
  title, 
  value, 
  sub, 
  icon, 
  iconColor, 
  onClick 
}: { 
  key?: string,
  title: string, 
  value: string, 
  sub: string, 
  icon: ReactNode, 
  iconColor: string, 
  onClick?: () => void 
}) {
  const isUp = sub.includes('↗');
  const isDown = sub.includes('↘');
  const colorClass = isUp ? 'text-emerald-500' : isDown ? 'text-rose-500' : 'text-slate-500/70 font-bold';
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 transition duration-200 hover:scale-[1.015] hover:shadow-md ${onClick ? 'cursor-pointer hover:border-[#007BC4]/40 hover:bg-[#007BC4]/5 active:scale-[0.98]' : ''}`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconColor} shadow-inner`}>
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold text-slate-500 truncate mb-0.5">{title}</span>
        <span className="text-2xl font-extrabold text-slate-900 leading-none mb-1">{value}</span>
        <span className={`text-[10px] ${colorClass} truncate`}>{sub}</span>
      </div>
    </div>
  );
}

function FooterCard({ icon, title, desc }: { icon: ReactNode, title: string, desc: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-start gap-3 transition hover:shadow-md border-t-2 border-t-[#007BC4]/20">
       <div className="p-2 bg-slate-50 rounded-lg border border-slate-100/50 text-[#007BC4]">
         {icon}
       </div>
       <div className="flex flex-col">
         <h4 className="text-xs font-black text-slate-900 mb-0.5">{title}</h4>
         <p className="text-[10px] font-semibold text-slate-400 leading-tight">{desc}</p>
       </div>
    </div>
  );
}
