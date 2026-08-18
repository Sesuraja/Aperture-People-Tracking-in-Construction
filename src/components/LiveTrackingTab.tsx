import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Person, Asset, Vehicle, CameraDevice, EnvSensor } from '../types';
import LiveFloorMap, { MapMode, ReaderDevice, AccessGate, MaterialAsset, VisibleLayers } from './LiveFloorMap';
import LiveTrackingContextDrawer, { SelectedEntity } from './LiveTrackingContextDrawer';
import { 
  Search, AlertTriangle, UserCheck, Building2, X,
  Layers, Users, Maximize2, Minimize2, Truck, HardHat, Camera, Thermometer,
  Radio, Navigation, Eye, EyeOff, Map as MapIcon, Layout, ShieldAlert, Activity,
  Database, Info, Terminal, Zap, ChevronDown, Filter, Settings, Bell, Flame,
  Box, Warehouse, MoreVertical, SlidersHorizontal, Trash2, BarChart3, ShieldCheck, Check,
  FileText, PenTool, Volume2, VolumeX, BellRing, Wifi, WifiOff
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import ManageWorkforceModal from './ManageWorkforceModal';
import { db, collection, onSnapshot, doc } from '../lib/db';
import { ZoneBounds } from './MapEditorModal';
import { HardwareDevice } from './HardwareConfigModal';
import { generatePDFReport } from '../lib/exportUtils';
import { useWebSocket } from '../lib/useWebSocket';
import { useTracking } from '../context/TrackingContext';

// Mock additional entities for enterprise view
const MOCK_READERS: ReaderDevice[] = [
  { id: 'RDR-001', name: 'West Gate Reader', x: 5, y: 50, range: 12, health: 98, status: 'online' },
  { id: 'RDR-002', name: 'Crane Area Reader', x: 85, y: 30, range: 15, health: 94, status: 'online' },
  { id: 'RDR-003', name: 'Core Shaft Reader', x: 65, y: 50, range: 10, health: 82, status: 'online' },
  { id: 'RDR-004', name: 'Storage Yard Reader', x: 30, y: 80, range: 20, health: 100, status: 'online' },
];

const MOCK_GATES: AccessGate[] = [
  { id: 'GAT-01', name: 'Main Vehicle Entry', x: 2, y: 50, status: 'locked' },
  { id: 'GAT-02', name: 'Staff Turnstile West', x: 2, y: 55, status: 'unlocked' },
  { id: 'GAT-03', name: 'Staff Turnstile East', x: 98, y: 50, status: 'locked' },
];

const MOCK_MATERIALS: MaterialAsset[] = [
  { id: 'MAT-101', name: 'Structural Steel Bundles', type: 'Steel', x: 25, y: 75 },
  { id: 'MAT-102', name: 'Concrete Formwork', type: 'Wood', x: 45, y: 40 },
  { id: 'MAT-103', name: 'Piping Assemblies', type: 'PVC/Copper', x: 15, y: 30 },
];

export interface ProjectProperties {
  id: string;
  name: string;
  contractor: string;
  sizeSqFt: number;
  dimensions: string;
  floorplanUrl: string;
  localPeople?: Person[];
  customZones?: Record<string, ZoneBounds>;
  hardwareDevices?: HardwareDevice[];
}

const INITIAL_PROJECT_PROPERTIES: Record<string, ProjectProperties> = {
  'metro-tower': {
    id: 'metro-tower',
    name: 'Metro Commercial Tower Site',
    contractor: 'Apex Construction JV',
    sizeSqFt: 350000,
    dimensions: '250m x 180m',
    floorplanUrl: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&q=80&w=1200',
    customZones: {
      'Excavation Shaft': { x: 10, y: 15, width: 34, height: 62, category: 'EXCAVATION & SHORING', hazardLevel: 'warning' },
      'Tower Core': { x: 51, y: 25, width: 32, height: 50, category: 'CONCRETE REINFORCEMENT' },
      'Crane Swing Zone': { x: 80, y: 5, width: 16, height: 42, category: 'CRANE SWING RADIUS', hazardLevel: 'critical' },
      'High Voltage Area': { x: 46, y: 5, width: 14, height: 16, category: 'SUBSTATION PERIMETER', hazardLevel: 'critical' },
      'Muster Point A': { x: 2, y: 10, width: 8, height: 12, category: 'MUSTER POINT' }
    }
  }
};

export default function LiveTrackingTab({ 
  people: propPeople, 
  assets: propAssets,
  vehicles: propVehicles,
  zones: defaultZones, 
  highlightedPersonId, 
  activeProject: propActiveProject,
  setActiveProject: propSetActiveProject
}: { 
  people: Person[]; 
  assets: Asset[];
  vehicles: Vehicle[];
  zones: Record<string, {x:number; y:number; width:number; height:number}>; 
  highlightedPersonId?: string | null; 
  activeProject?: string;
  setActiveProject?: (id: string) => void;
}) {
  const location = useLocation();
  const focusZone = location.state?.focusZone || null;
  const [localActiveProject, setLocalActiveProject] = useState('metro-tower');
  const activeProject = propActiveProject !== undefined ? propActiveProject : localActiveProject;

  const currentProject = INITIAL_PROJECT_PROPERTIES[activeProject] || INITIAL_PROJECT_PROPERTIES['metro-tower'];

  const [localProjectProps, setLocalProjectProps] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('gao_project_properties');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed[activeProject] || null;
      }
    } catch (e) {
      console.warn('Failed to parse local project properties:', e);
    }
    return null;
  });

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem('gao_project_properties');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed[activeProject]) {
            setLocalProjectProps(parsed[activeProject]);
          }
        }
      } catch (e) {
        console.warn('Failed to update local project properties:', e);
      }
    };
    handleUpdate();
    window.addEventListener('gao_project_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('gao_project_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [activeProject]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [isWorkforceModalOpen, setIsWorkforceModalOpen] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'people' | 'assets' | 'hardware' | 'zones'>('people');
  const [mapMode, setMapMode] = useState<MapMode>('standard');
  const [activeFloor, setActiveFloor] = useState('Floor 3');
  const [timelineTime, setTimelineTime] = useState('NOW (Live)');
  const [isReplaying, setIsReplaying] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<string>('ALL');
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);

  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    workers: true,
    assets: false,
    vehicles: true,
    readers: false,
    zones: true,
    cameras: false,
    sensors: false,
    heatmapOverlay: false,
  });
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  
  const [dbPeople, setDbPeople] = useState<Person[]>([]);
  const [dbAssets, setDbAssets] = useState<Asset[]>([]);
  const [dbVehicles, setDbVehicles] = useState<Vehicle[]>([]);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [sensors, setSensors] = useState<EnvSensor[]>([]);
  const [projectMeta, setProjectMeta] = useState<any>(null);
  const [mongoDbStatus, setMongoDbStatus] = useState<{ connected: boolean; storageType?: string; error?: string | null }>({
    connected: true,
    storageType: 'mongodb'
  });

  useEffect(() => {
    const checkMongoStatus = async () => {
      try {
        const res = await fetch('/api/mongodb/status');
        if (res.ok) {
          const data = await res.json();
          setMongoDbStatus(data);
        }
      } catch (e) {
        setMongoDbStatus({ connected: false, storageType: 'in-memory', error: 'Network error' });
      }
    };
    checkMongoStatus();
    const interval = setInterval(checkMongoStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const trackingCtx = useTracking();

  // Combine TrackingContext real live RFID tags/people with any DB items, prioritizing live moving propPeople
  const people = useMemo(() => {
    if (propPeople && propPeople.length > 0) {
      const combined = [...propPeople];
      (trackingCtx?.people || []).forEach(tp => {
        if (!combined.find(p => p.id === tp.id || p.hardhatTagId === tp.hardhatTagId)) {
          combined.push(tp);
        }
      });
      dbPeople.forEach(dbP => {
        if (!combined.find(p => p.id === dbP.id || p.hardhatTagId === dbP.hardhatTagId)) {
          combined.push(dbP);
        }
      });
      return combined;
    }

    const trackingPeople = trackingCtx?.people || [];
    const combined = [...trackingPeople];
    
    // Merge dbPeople if not already included
    dbPeople.forEach(dbP => {
      if (!combined.find(p => p.id === dbP.id || p.hardhatTagId === dbP.hardhatTagId)) {
        combined.push(dbP);
      }
    });

    return combined;
  }, [trackingCtx?.people, dbPeople, propPeople]);

  // Custom Geofences & Capacity Thresholds
  const [customZonesState, setCustomZonesState] = useState<Record<string, any>>(() => {
    return defaultZones && Object.keys(defaultZones).length > 0 ? defaultZones : {
      'Excavation Shaft': { x: 10, y: 15, width: 34, height: 62, category: 'EXCAVATION & SHORING', hazardLevel: 'warning', maxCapacity: 4 },
      'Tower Core': { x: 51, y: 25, width: 32, height: 50, category: 'CONCRETE REINFORCEMENT', hazardLevel: 'standard', maxCapacity: 10 },
      'Crane Swing Zone': { x: 80, y: 5, width: 16, height: 42, category: 'CRANE SWING RADIUS', hazardLevel: 'critical', maxCapacity: 3 },
      'Muster Point A': { x: 2, y: 10, width: 8, height: 12, category: 'MUSTER POINT', hazardLevel: 'standard', maxCapacity: 30 }
    };
  });

  const [zoneCapacities, setZoneCapacities] = useState<Record<string, number>>({
    'Crane Swing Zone': 3,
    'Excavation Shaft': 4,
    'Tower Core': 10,
    'Muster Point A': 30,
  });

  // Geofence Drawing State
  const [isDrawingGeofence, setIsDrawingGeofence] = useState(false);

  // Emergency SOS & Audio Alarm Mute State
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const lastAlarmAudioTimeRef = React.useRef<number>(0);
  const [emergencySosState, setEmergencySosState] = useState<{
    active: boolean;
    workerId?: string;
    workerName?: string;
    zone?: string;
    timestamp?: string;
    x?: number;
    y?: number;
  } | null>(null);

  // Audio Emergency Alarm Synthesizer (throttled & mute-aware)
  const playEmergencyAudioAlarm = useCallback((overrideMute: boolean = false) => {
    if (isAudioMuted && !overrideMute) return;
    const now = Date.now();
    // Throttle sound synthesis to at most once every 15 seconds
    if (now - lastAlarmAudioTimeRef.current < 15000 && !overrideMute) return;
    lastAlarmAudioTimeRef.current = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn('Audio synthesis not supported or blocked:', e);
    }
  }, [isAudioMuted]);

  // Real-time WebSocket listener for Live Tracking & Zero-Latency Safety Feeds
  const handleLiveTrackingWSMessage = useCallback((msg: any) => {
    if (msg.type === 'safety_alert' || msg.type === 'trigger_safety_alert') {
      playEmergencyAudioAlarm(false);
      const p = msg.payload || {};
      setEmergencySosState({
        active: true,
        workerName: p.title || 'WS Safety SOS Alert',
        zone: p.location || 'Site Perimeter',
        timestamp: new Date().toLocaleTimeString()
      });
      setIsEmergencyMode(true);
      setMapMode('evacuation');
    }
  }, [playEmergencyAudioAlarm]);

  const { isConnected: isWsConnected, triggerSafetyAlert: wsTriggerSafetyAlert, broadcastTagMovement } = useWebSocket(handleLiveTrackingWSMessage);

  const activeZones = useMemo(() => {
    if (trackingCtx?.zonesDict && Object.keys(trackingCtx.zonesDict).length > 0) {
      return trackingCtx.zonesDict;
    }
    return projectMeta?.customZones || localProjectProps?.customZones || currentProject.customZones || customZonesState;
  }, [trackingCtx?.zonesDict, projectMeta, localProjectProps, currentProject, customZonesState]);

  // Over Capacity Check
  const overCapacityZones = useMemo(() => {
    return Object.entries(activeZones).filter(([zName, bounds]: [string, any]) => {
      const count = people.filter(p => p.currentZone && (p.currentZone || "").toLowerCase() === (zName || "").toLowerCase()).length;
      const cap = zoneCapacities[zName] || bounds.maxCapacity || 8;
      return count > cap;
    });
  }, [activeZones, people, zoneCapacities]);

  // Toggle Emergency SOS
  const handleToggleEmergencySOS = () => {
    if (emergencySosState?.active) {
      setEmergencySosState(null);
      setIsEmergencyMode(false);
      setMapMode('standard');
    } else {
      playEmergencyAudioAlarm(true);
      const targetWorker: Person = people.find(p => p.ppeStatus === 'NON_COMPLIANT' || p.currentZone === 'Crane Swing Zone') || people[0] || {
        id: 'W-104',
        name: 'John Smith',
        role: 'Steelworker',
        currentZone: 'Crane Swing Zone',
        presenceState: 'MOVING',
        dwellTime: 45,
        x: 82,
        y: 35,
        lastSeen: new Date(),
        trail: []
      };

      setEmergencySosState({
        active: true,
        workerId: targetWorker.id,
        workerName: targetWorker.name,
        zone: targetWorker.currentZone || 'Crane Swing Zone',
        timestamp: new Date().toLocaleTimeString(),
        x: targetWorker.x,
        y: targetWorker.y
      });
      setIsEmergencyMode(true);
      setMapMode('evacuation');
      setSelectedEntity({
        type: 'person',
        data: targetWorker
      });
    }
  };

  // Save new geofence
  const handleSaveCustomGeofence = (newZone: { name: string; bounds: { x: number; y: number; width: number; height: number }; hazardLevel: string; maxCapacity: number }) => {
    setCustomZonesState(prev => ({
      ...prev,
      [newZone.name]: {
        ...newZone.bounds,
        category: 'CUSTOM GEOFENCE',
        hazardLevel: newZone.hazardLevel,
        maxCapacity: newZone.maxCapacity
      }
    }));
    setZoneCapacities(prev => ({
      ...prev,
      [newZone.name]: newZone.maxCapacity
    }));
    setIsDrawingGeofence(false);
  };

  // Export Daily Attendance PDF Log
  const handleExportAttendancePDF = () => {
    const complianceRate = Math.round(((people.length - overCapacityZones.length) / Math.max(1, people.length)) * 100);
    const pdfColumns = [
      { key: 'id', label: 'WORKER ID' },
      { key: 'name', label: 'NAME' },
      { key: 'role', label: 'ROLE' },
      { key: 'trade', label: 'TRADE / DEPT' },
      { key: 'zone', label: 'GEOFENCE ZONE' },
      { key: 'ppe', label: 'PPE STATUS' },
      { key: 'checkIn', label: 'CHECK-IN TIME' }
    ];
    const pdfRows = people.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role || 'Worker',
      trade: (p as any).trade || (p as any).department || 'Construction',
      zone: p.currentZone || 'Unassigned Zone',
      ppe: p.ppeStatus || 'COMPLIANT',
      checkIn: (p as any).checkInTime || '07:00 AM'
    }));
    const pdfMetrics = [
      { label: "Active Onsite Workers", value: people.length.toString() },
      { label: "Monitored Geofences", value: Object.keys(activeZones).length.toString() },
      { label: "Over-Capacity Alerts", value: overCapacityZones.length.toString() },
      { label: "Shift Compliance Rate", value: `${complianceRate}%` }
    ];

    generatePDFReport(
      "GAO RFID Shift Attendance & Zone Presence Report",
      `Project: ${currentProject.name} | Contractor: ${currentProject.contractor} | Date: ${new Date().toLocaleDateString()}`,
      pdfColumns,
      pdfRows,
      pdfMetrics
    );
  };

  const localAssets = useMemo(() => {
    if (localProjectProps?.assets && Array.isArray(localProjectProps.assets)) {
      return localProjectProps.assets;
    }
    return [];
  }, [localProjectProps]);

  const localVehicles = useMemo(() => {
    if (localProjectProps?.vehicles && Array.isArray(localProjectProps.vehicles)) {
      return localProjectProps.vehicles;
    }
    return [];
  }, [localProjectProps]);

  const assets = useMemo(() => {
    if (trackingCtx?.assets && trackingCtx.assets.length > 0) {
      return trackingCtx.assets;
    }
    if (dbAssets && dbAssets.length > 0) {
      return dbAssets;
    }
    return localAssets;
  }, [trackingCtx?.assets, dbAssets, localAssets]);

  const vehicles = useMemo(() => {
    if (trackingCtx?.vehicles && trackingCtx.vehicles.length > 0) {
      return trackingCtx.vehicles;
    }
    if (dbVehicles && dbVehicles.length > 0) {
      return dbVehicles;
    }
    return localVehicles;
  }, [trackingCtx?.vehicles, dbVehicles, localVehicles]);

  const localHardwareDevices = useMemo(() => {
    if (localProjectProps?.hardwareDevices && Array.isArray(localProjectProps.hardwareDevices)) {
      return localProjectProps.hardwareDevices;
    }
    return [];
  }, [localProjectProps]);

  const readers = useMemo(() => {
    const customDevs = (projectMeta?.hardwareDevices || localHardwareDevices || [])
      .filter((d: any) => d && (d.type?.toLowerCase().includes('reader') || d.type?.toLowerCase().includes('rfid')))
      .map((d: any) => ({
        id: d.id,
        name: d.name,
        x: d.x,
        y: d.y,
        range: d.antennaGainDbi ? Math.max(8, d.antennaGainDbi * 1.5) : 12,
        health: d.status === 'Online' ? 100 : d.status === 'Maintenance' ? 60 : 0,
        status: d.status === 'Online' ? 'online' : 'offline',
        ipAddress: d.ipAddress,
        macAddress: d.macAddress
      }));

    return customDevs.length > 0 ? customDevs : MOCK_READERS;
  }, [projectMeta, localHardwareDevices]);

  useEffect(() => {
    const unsubProject = onSnapshot(doc(db, 'projects', activeProject), (snap: any) => {
      if (snap.exists()) setProjectMeta(snap.data());
    });
    const unsubPeople = onSnapshot(collection(db, 'people'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbPeople(items.filter((p: any) => !p.projectId || p.projectId === activeProject));
    });
    const unsubAssets = onSnapshot(collection(db, 'assets'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbAssets(items.filter((a: any) => !a.projectId || a.projectId === activeProject));
    });
    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbVehicles(items.filter((v: any) => !v.projectId || v.projectId === activeProject));
    });
    const unsubCameras = onSnapshot(collection(db, 'cameras'), (snap: any) => setCameras(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))));
    const unsubSensors = onSnapshot(collection(db, 'sensors'), (snap: any) => setSensors(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))));

    const handleRealTimeMapUpdate = () => {
      try {
        const savedAssets = localStorage.getItem('gao_db_assets');
        if (savedAssets) setDbAssets(JSON.parse(savedAssets));
        const savedVehicles = localStorage.getItem('gao_db_vehicles');
        if (savedVehicles) setDbVehicles(JSON.parse(savedVehicles));
      } catch {}
    };

    window.addEventListener('gao_map_data_updated', handleRealTimeMapUpdate);
    window.addEventListener('gao_project_updated', handleRealTimeMapUpdate);
    window.addEventListener('storage', handleRealTimeMapUpdate);

    return () => {
      unsubProject(); unsubPeople(); unsubAssets(); unsubVehicles(); unsubCameras(); unsubSensors();
      window.removeEventListener('gao_map_data_updated', handleRealTimeMapUpdate);
      window.removeEventListener('gao_project_updated', handleRealTimeMapUpdate);
      window.removeEventListener('storage', handleRealTimeMapUpdate);
    };
  }, [activeProject]);

  useEffect(() => {
    if (highlightedPersonId) {
      const found = people.find(p => p.id === highlightedPersonId);
      if (found) setSelectedEntity({ type: 'person', data: found });
    }
  }, [highlightedPersonId, people]);

  const filteredPeople = useMemo(() => {
    if (!searchQuery) return people;
    const q = (searchQuery || "").toLowerCase();
    return people.filter(p => 
      (p.name || "").toLowerCase().includes(q) || (p.id || "").toLowerCase().includes(q) || 
      (p.role || "").toLowerCase().includes(q) || (p.currentZone || "").toLowerCase().includes(q) ||
      (p.hardhatTagId || "").toLowerCase().includes(q)
    );
  }, [people, searchQuery]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery) return assets;
    const q = (searchQuery || "").toLowerCase();
    return assets.filter(a =>
      (a.name || "").toLowerCase().includes(q) || (a.id || "").toLowerCase().includes(q) ||
      ((a as any).category || (a as any).type || "").toLowerCase().includes(q) ||
      ((a as any).location || "").toLowerCase().includes(q)
    );
  }, [assets, searchQuery]);

  const filteredVehicles = useMemo(() => {
    if (!searchQuery) return vehicles;
    const q = (searchQuery || "").toLowerCase();
    return vehicles.filter(v =>
      (v.name || "").toLowerCase().includes(q) || (v.id || "").toLowerCase().includes(q) ||
      (v.type || "").toLowerCase().includes(q) ||
      ((v as any).operator || "").toLowerCase().includes(q)
    );
  }, [vehicles, searchQuery]);

  const FLOOR_OPTIONS = useMemo(() => [
    { id: 'ALL', label: 'All Levels', short: 'All Floors', desc: 'Composite Master Site Map' },
    { id: 'Floor 1', label: 'Level 1 - Ground Logistics', short: 'L1 Ground', desc: 'Main Gate & Logistics' },
    { id: 'Floor 2', label: 'Level 2 - Substation & MEP', short: 'L2 Substation', desc: '440V High Voltage' },
    { id: 'Floor 3', label: 'Level 3 - Concrete Slab', short: 'L3 Rebar', desc: 'Core Slab & Pour' },
    { id: 'Floor 4', label: 'Level 4 - Steel Framing', short: 'L4 Framing', desc: 'Interior Risers' },
    { id: 'Floor 5', label: 'Level 5 - Facade Deck', short: 'L5 Facade', desc: 'Mast Climber Deck' },
    { id: 'Floor 6', label: 'Level 6 - Penthouse', short: 'L6 Penthouse', desc: 'Lift Motor Room' },
    { id: 'Floor 7', label: 'Level 7 - Tower Core & Crane', short: 'L7 Crane Core', desc: 'Crane Radius' },
  ], []);

  const getWorkerFloor = useCallback((p: Person): string => {
    if ((p as any).floor) return (p as any).floor;
    if ((p as any).currentFloor) return (p as any).currentFloor;
    const zone = (p.currentZone || '').toLowerCase();
    const role = (p.role || '').toLowerCase();
    if (zone.includes('crane') || zone.includes('tower core') || role.includes('crane')) return 'Floor 7';
    if (zone.includes('penthouse') || zone.includes('chiller') || zone.includes('elevator')) return 'Floor 6';
    if (zone.includes('facade') || zone.includes('glazing') || zone.includes('scaffold') || role.includes('scaffold')) return 'Floor 5';
    if (zone.includes('framing') || zone.includes('drywall') || zone.includes('mep')) return 'Floor 4';
    if (zone.includes('concrete') || zone.includes('rebar') || role.includes('concrete')) return 'Floor 3';
    if (zone.includes('voltage') || zone.includes('substation') || role.includes('electric')) return 'Floor 2';
    return 'Floor 1';
  }, []);

  const displayedPeople = useMemo(() => {
    let result = filteredPeople;
    if (selectedTrade !== 'ALL') {
      const tradeLower = (selectedTrade || "").toLowerCase();
      result = result.filter(p => (p.role || "").toLowerCase().includes(tradeLower));
    }
    if (activeFloor !== 'ALL') {
      result = result.filter(p => getWorkerFloor(p) === activeFloor);
    }
    return result;
  }, [filteredPeople, selectedTrade, activeFloor, getWorkerFloor]);

  const floorWorkerCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: people.length };
    FLOOR_OPTIONS.forEach(f => {
      if (f.id !== 'ALL') {
        counts[f.id] = people.filter(p => getWorkerFloor(p) === f.id).length;
      }
    });
    return counts;
  }, [people, FLOOR_OPTIONS, getWorkerFloor]);

  const TRADE_OPTIONS = useMemo(() => {
    const list = [
      { id: 'ALL', label: 'All Trades', icon: '👷' },
      { id: 'Electrician', label: 'Electricians', icon: '⚡' },
      { id: 'Steelworker', label: 'Steelworkers', icon: '🏗️' },
      { id: 'Scaffolder', label: 'Scaffolders', icon: '🪜' },
      { id: 'Inspector', label: 'Inspectors', icon: '📋' },
      { id: 'Concrete', label: 'Concrete Crew', icon: '🧱' },
      { id: 'EHS', label: 'EHS Officers', icon: '🛡️' },
      { id: 'Operator', label: 'Heavy Operators', icon: '🚜' },
    ];
    return list.map(t => {
      const count = t.id === 'ALL' 
        ? people.length 
        : people.filter(p => (p.role || "").toLowerCase().includes((t.id || "").toLowerCase())).length;
      return { ...t, count };
    });
  }, [people]);

  const highRiskZoneCount = people.filter(p => 
    p.currentZone === 'Crane Swing Zone' || p.currentZone === 'Excavation Shaft'
  ).length;

  return (
    <div className="w-full flex flex-col bg-slate-50 p-4 md:p-6 max-w-[1800px] mx-auto min-h-screen space-y-4 font-sans transition-all">
      
      {/* 1. TOP BAR DASHBOARD HEADER */}
      <div className="bg-white rounded-2xl p-4 md:px-5 md:py-3.5 shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        {/* Project Branding & Site Location */}
        <div className="flex items-center gap-3.5 xl:border-r xl:border-slate-200 xl:pr-6 shrink-0">
          <div className="w-11 h-11 bg-[#007BC4] rounded-2xl text-white inline-flex items-center justify-center shrink-0 shadow-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none whitespace-nowrap">
                {projectMeta?.name || currentProject.name}
              </h1>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                Live 2D Map
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mt-1 whitespace-nowrap">
               <span className="inline-flex items-center gap-1"><MapIcon className="w-3.5 h-3.5 text-[#007BC4]" /> Area A Sector 4</span>
               <span className="text-slate-300">•</span>
               <span className="inline-flex items-center gap-1 text-slate-600 font-medium"><Info className="w-3.5 h-3.5 text-slate-400" /> {currentProject.contractor}</span>
            </div>
          </div>
        </div>

        {/* Search Bar with Autocomplete & Dynamic Focus */}
        <div className="flex-1 flex items-center min-w-0 max-w-xl relative w-full xl:w-auto">
          <div className="w-full h-10 flex items-center bg-slate-100/90 border border-slate-200 rounded-xl overflow-hidden focus-within:bg-white focus-within:ring-2 focus-within:ring-[#007BC4]/30 focus-within:border-[#007BC4] transition-all">
            <div className="pl-3.5 text-slate-400 flex items-center justify-center shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Workers, Hardhats, Equipment, Vehicles..."
              className="bg-transparent pl-2.5 pr-8 py-2 text-xs font-bold text-slate-900 outline-none w-full placeholder:text-slate-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Top Header Action Buttons Cluster */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <span className={`h-10 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border shadow-2xs shrink-0 select-none ${
            isWsConnected 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
          }`}>
            {isWsConnected ? <Wifi className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" /> : <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            <span className="hidden lg:inline whitespace-nowrap">{isWsConnected ? 'Telemetry Live' : 'Syncing...'}</span>
          </span>

          <span className={`h-10 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border shadow-2xs shrink-0 select-none ${
            mongoDbStatus.connected && mongoDbStatus.storageType === 'mongodb'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
              : 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800'
          }`}
          title={mongoDbStatus.connected ? 'MongoDB Telemetry Database Connected' : 'Local In-Memory Telemetry Database Active'}
          >
            <Database className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">{mongoDbStatus.connected && mongoDbStatus.storageType === 'mongodb' ? 'MongoDB Online' : 'DB Engine Active'}</span>
          </span>

          <button 
            onClick={handleExportAttendancePDF}
            className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold shadow-2xs inline-flex items-center justify-center gap-2 shrink-0 transition cursor-pointer"
            title="Generate and Download Shift Attendance & Zone Presence PDF Log"
          >
            <FileText className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="hidden md:inline whitespace-nowrap">PDF Log</span>
          </button>

          <button
            onClick={() => setIsDrawingGeofence(!isDrawingGeofence)}
            className={`h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 transition shadow-2xs border cursor-pointer ${
              isDrawingGeofence 
                ? 'bg-[#007BC4] text-white border-[#007BC4] ring-2 ring-sky-300' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
            }`}
            title="Draw custom geofence polygon directly on map"
          >
            <PenTool className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="hidden md:inline whitespace-nowrap">{isDrawingGeofence ? 'Drawing Mode' : 'Draw Zone'}</span>
          </button>

          <button
            onClick={() => setIsAudioMuted(prev => !prev)}
            className={`h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 transition shadow-2xs border cursor-pointer ${
              isAudioMuted 
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300' 
                : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-400'
            }`}
            title={isAudioMuted ? 'Audio Siren Muted (Click to Unmute Siren)' : 'Audio Siren Unmuted (Click to Mute Siren)'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-slate-500 shrink-0" /> : <Volume2 className="w-4 h-4 text-amber-700 animate-pulse shrink-0" />}
            <span className="hidden sm:inline whitespace-nowrap">{isAudioMuted ? 'Muted' : 'Siren On'}</span>
          </button>

          <button
            onClick={() => {
              wsTriggerSafetyAlert(
                '🚨 REAL-TIME EMERGENCY SOS: Hardhat Fall / Panic Triggered',
                'Zone B - Scaffold L3',
                'critical'
              );
              handleToggleEmergencySOS();
            }}
            className={`h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 shrink-0 transition shadow-sm whitespace-nowrap cursor-pointer ${
              emergencySosState?.active || isEmergencyMode 
                ? 'bg-rose-600 text-white ring-4 ring-rose-400 animate-pulse' 
                : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white border border-rose-500'
            }`}
          >
            <ShieldAlert className="w-4 h-4 animate-bounce shrink-0" />
            <span>{emergencySosState?.active ? 'ALARM ACTIVE' : 'EMERGENCY SOS'}</span>
          </button>
        </div>
      </div>

      {/* 2. KPI STATUS DASHBOARD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Personnel Onsite', val: people.length, icon: Users, color: 'text-[#007BC4]', bg: 'bg-blue-50' },
          { label: 'Heavy Equipment', val: vehicles.length, icon: Truck, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Tracked Geofences', val: Object.keys(activeZones).length, icon: Layout, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Hazard Breaches', val: highRiskZoneCount, icon: AlertTriangle, color: highRiskZoneCount > 0 ? 'text-rose-600' : 'text-slate-400', bg: highRiskZoneCount > 0 ? 'bg-rose-50 animate-pulse' : 'bg-slate-50' },
          { label: 'System Health', val: '99%', icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-50' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
             <div className={`p-3 ${kpi.bg} ${kpi.color} rounded-xl shrink-0`}><kpi.icon className="w-5 h-5" /></div>
             <div className="flex flex-col min-w-0">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">{kpi.label}</div>
                <div className="text-xl font-black text-slate-900 leading-none mt-0.5">{kpi.val}</div>
             </div>
          </div>
        ))}
      </div>

      {/* 3. MAIN WORKSPACE ENGINE */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch h-[calc(100vh-320px)] min-h-[600px]">
        
        {/* LEFT NAV PANEL - Lists */}
        <div className={`${isMapFullScreen ? 'hidden' : 'w-full xl:w-80'} bg-white rounded-2xl border border-slate-200 shadow-md flex flex-col overflow-hidden shrink-0`}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
             <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">System Entities</h2>
             <button className="text-slate-400 hover:text-slate-600"><SlidersHorizontal className="w-4 h-4" /></button>
          </div>
          
          <div className="flex bg-slate-50 border-b border-slate-100">
            {[
              { id: 'people', icon: UserCheck, label: 'Workers' },
              { id: 'assets', icon: Box, label: 'Assets' },
              { id: 'hardware', icon: Radio, label: 'Readers' },
              { id: 'zones', icon: Layout, label: 'Zones' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider flex flex-col items-center gap-1 transition ${
                  activeTab === tab.id ? 'bg-white text-sky-600 border-b-2 border-sky-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-white">
             {activeTab === 'people' && filteredPeople.map(p => (
                <div key={p.id} onClick={() => setSelectedEntity({ type: 'person', data: p })} className="group p-2 rounded-xl hover:bg-sky-50 cursor-pointer transition border border-transparent hover:border-sky-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs">
                       {(p.name || 'W').substring(0, 1)}
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-900">{p.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">{p.role}</div>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${p.ppeStatus === 'NON_COMPLIANT' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                </div>
              ))}

              {activeTab === 'assets' && (
                <div className="space-y-4 p-2">
                   {filteredAssets.length > 0 && (
                     <>
                       <div className="text-[10px] font-black text-slate-400 uppercase border-b pb-1">Site Equipment & Tools ({filteredAssets.length})</div>
                       {filteredAssets.map(a => (
                         <div 
                           key={a.id} 
                           onClick={() => setSelectedEntity({ 
                             type: 'asset', 
                             data: { 
                               id: a.id, 
                               name: a.name, 
                               category: (a as any).category || 'Power Tool', 
                               location: (a as any).location || 'Active Construction Zone', 
                               assignedWorker: (a as any).assignedWorker || 'Unassigned', 
                               status: (a.status || 'Operating') as 'Operating' | 'Standby' | 'Maintenance' | 'Offline', 
                               utilization: 85, 
                               lastMovement: 'Just now', 
                               battery: a.battery || 90, 
                               x: a.x || 50, 
                               y: a.y || 50 
                             } 
                           })} 
                           className="flex items-center justify-between p-2 hover:bg-emerald-50 rounded-lg cursor-pointer transition border border-transparent hover:border-emerald-100"
                         >
                            <div className="flex items-center gap-2">
                               <HardHat className="w-4 h-4 text-emerald-600" />
                               <div>
                                 <span className="text-xs font-bold text-slate-900 block leading-tight">{a.name}</span>
                                 <span className="text-[9px] text-slate-400 font-mono">{(a as any).category || (a as any).type || 'Equipment'}</span>
                               </div>
                            </div>
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              {a.status?.toUpperCase() || 'ONLINE'}
                            </span>
                         </div>
                       ))}
                     </>
                   )}

                   {filteredVehicles.length > 0 && (
                     <>
                       <div className="text-[10px] font-black text-slate-400 uppercase border-b pb-1 mt-2">Heavy Vehicles ({filteredVehicles.length})</div>
                       {filteredVehicles.map(v => (
                         <div 
                           key={v.id} 
                           onClick={() => setSelectedEntity({ 
                             type: 'vehicle', 
                             data: { 
                               id: v.id, 
                               name: v.name, 
                               type: (v as any).type || 'Hydraulic Excavator', 
                               operator: (v as any).operator || 'Certified Operator', 
                               location: (v as any).location || 'Excavation Sector', 
                               speed: v.speed || 0, 
                               direction: 90, 
                               status: (v.status || 'Active') as 'Active' | 'Maintenance' | 'Idling' | 'Parked', 
                               fuel: 88, 
                               x: v.x || 30, 
                               y: v.y || 40 
                             } 
                           })} 
                           className="flex items-center justify-between p-2 hover:bg-amber-50 rounded-lg cursor-pointer transition border border-transparent hover:border-amber-100"
                         >
                            <div className="flex items-center gap-2">
                               <Truck className="w-4 h-4 text-amber-600" />
                               <div>
                                 <span className="text-xs font-bold text-slate-900 block leading-tight">{v.name}</span>
                                 <span className="text-[9px] text-slate-400 font-mono">{v.type || 'Vehicle'}</span>
                               </div>
                            </div>
                            <span className={`text-[9px] font-black ${v.status === 'Active' || v.status === 'Moving' ? 'text-emerald-600' : 'text-slate-400'}`}>
                               {v.status?.toUpperCase() || 'ONLINE'}
                            </span>
                         </div>
                       ))}
                     </>
                   )}

                   <div className="text-[10px] font-black text-slate-400 uppercase border-b pb-1 mt-4">Structural Materials</div>
                   {MOCK_MATERIALS.map(m => (
                     <div 
                       key={m.id} 
                       onClick={() => setSelectedEntity({ 
                         type: 'asset', 
                         data: { 
                           id: m.id, 
                           name: m.name, 
                           category: 'Material Pallet', 
                           location: 'Material Yard B', 
                           assignedWorker: 'Logistics Team', 
                           status: 'Standby', 
                           utilization: 10, 
                           lastMovement: '1 hour ago', 
                           battery: 100, 
                           x: m.x, 
                           y: m.y 
                         } 
                       })} 
                       className="flex items-center justify-between p-2 hover:bg-indigo-50 rounded-lg cursor-pointer border border-transparent hover:border-indigo-100"
                     >
                        <div className="flex items-center gap-2">
                           <Box className="w-4 h-4 text-indigo-600" />
                           <span className="text-xs font-bold text-slate-900">{m.name}</span>
                        </div>
                        <span className="text-[9px] font-black text-slate-400">STATIC</span>
                     </div>
                   ))}
                </div>
              )}

              {activeTab === 'hardware' && (
                 <div className="space-y-3 p-2">
                   <div className="text-[10px] font-black text-slate-400 uppercase border-b pb-1">GAO RFID Readers</div>
                   {readers.map(r => (
                     <div 
                       key={r.id} 
                       onClick={() => setSelectedEntity({
                         type: 'infrastructure',
                         data: {
                           id: r.id,
                           name: r.name,
                           type: 'UHF RFID Reader',
                           location: 'Portal Sector West',
                           ipAddress: r.ipAddress || '10.0.1.12',
                           macAddress: r.macAddress || 'AA:BB:CC:DD:EE:11',
                           status: r.status === 'online' ? 'Online' : 'Offline',
                           signalRssi: -55,
                           battery: r.health,
                           x: r.x,
                           y: r.y
                         }
                       })}
                       className="p-2.5 bg-slate-50 hover:bg-indigo-50/50 rounded-xl border border-slate-200 cursor-pointer transition"
                     >
                        <div className="flex items-center justify-between mb-1">
                           <div className="flex items-center gap-2">
                              <Radio className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="text-xs font-black text-slate-900">{r.name}</span>
                           </div>
                           <span className={`w-2 h-2 rounded-full ${r.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                           <span>Health: <span className="text-slate-800 font-extrabold">{r.health}%</span></span>
                           <span>Range: <span className="text-indigo-600 font-extrabold">{r.range}m</span></span>
                        </div>
                     </div>
                   ))}

                   {cameras.length > 0 && (
                     <>
                       <div className="text-[10px] font-black text-slate-400 uppercase border-b pb-1 mt-4">CCTV AI Cameras</div>
                       {cameras.map(c => (
                         <div 
                           key={c.id} 
                           onClick={() => setSelectedEntity({
                             type: 'camera',
                             data: {
                               id: c.id,
                               name: c.name,
                               zone: 'Building Core',
                               status: c.status === 'offline' ? 'Offline' : 'Online',
                               aiStatus: 'Active',
                               aiFeatures: ['PPE Optical Check', 'Geofence Breach', 'Facial Rec'],
                               recentEvent: 'PPE Verification OK',
                               streamResolution: '4K UltraHD',
                               x: c.x,
                               y: c.y,
                               angle: 45
                             }
                           })}
                           className="p-2.5 bg-slate-50 hover:bg-purple-50/50 rounded-xl border border-slate-200 cursor-pointer transition flex items-center justify-between"
                         >
                            <div className="flex items-center gap-2">
                               <Camera className="w-3.5 h-3.5 text-purple-600" />
                               <span className="text-xs font-black text-slate-900">{c.name}</span>
                            </div>
                            <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">4K AI</span>
                         </div>
                       ))}
                     </>
                   )}
                 </div>
              )}

              {activeTab === 'zones' && (
                 <div className="space-y-3 p-2">
                   <div className="text-[10px] font-black text-slate-400 uppercase border-b pb-1">Geofenced Site Zones</div>
                   {Object.entries(projectMeta?.customZones || currentProject.customZones || defaultZones).map(([zName, zBounds]: [string, any]) => {
                     const isHazard = zBounds.hazardLevel === 'critical' || zBounds.hazardLevel === 'warning';
                     const occupantCount = people.filter(p => p.currentZone === zName).length;

                     return (
                       <div 
                         key={zName} 
                         onClick={() => setSelectedEntity({
                           type: 'infrastructure',
                           data: {
                             id: `zone-${zName.replace(/\s+/g, '-').toLowerCase()}`,
                             name: zName,
                             type: 'UHF RFID Reader',
                             location: zName,
                             ipAddress: '192.168.10.100',
                             macAddress: 'FF:EE:DD:CC:BB:AA',
                             status: isHazard ? 'Warning' : 'Online',
                             signalRssi: -50,
                             battery: 100,
                             x: zBounds.x,
                             y: zBounds.y
                           }
                         })}
                         className={`p-3 rounded-xl border transition cursor-pointer ${
                           isHazard ? 'bg-rose-50/60 border-rose-200 hover:bg-rose-100/80' : 'bg-slate-50 border-slate-200 hover:bg-sky-50'
                         }`}
                       >
                          <div className="flex items-center justify-between mb-1">
                             <span className="text-xs font-black text-slate-900">{zName}</span>
                             <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                               isHazard ? 'bg-rose-600 text-white' : 'bg-sky-100 text-sky-700'
                             }`}>
                               {isHazard ? 'Hazard' : 'Active'}
                             </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                             <span>Category: <span className="text-slate-800">{zBounds.category || 'General'}</span></span>
                             <span className="text-sky-600 font-extrabold">{occupantCount} Workers</span>
                          </div>
                       </div>
                     );
                   })}
                 </div>
              )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100">
             <button onClick={() => setIsWorkforceModalOpen(true)} className="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg hover:bg-slate-800 transition">
                <Settings className="w-4 h-4" /> System Calibration
             </button>
          </div>
        </div>

        {/* CENTER INTERACTIVE MAP CANVAS */}
        <div className={`transition-all duration-300 ${
          isMapFullScreen 
            ? 'fixed inset-0 z-50 bg-slate-950 rounded-none border-none flex flex-col h-screen w-screen p-0' 
            : 'flex-1 bg-white rounded-2xl border border-slate-200 shadow-md flex flex-col overflow-hidden'
        }`}>
          {/* Map Mode Selector Top Bar & Layer Controls */}
          <div className="p-2.5 bg-white border-b border-slate-100 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 shrink-0">
             <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0 scroll-smooth flex-1 min-w-0">
                {[
                  { id: 'standard', label: '2D Layout', icon: MapIcon },
                  { id: 'bim', label: 'Digital Twin', icon: Warehouse },
                  { id: 'satellite', label: 'Satellite', icon: MapIcon },
                  { id: 'heatmap', label: 'Heat Map', icon: Activity },
                  { id: 'coverage', label: 'RFID Coverage', icon: Radio },
                  { id: 'evacuation', label: 'Evacuation', icon: ShieldAlert },
                  { id: 'asset', label: 'Asset Tracking', icon: Box },
                  { id: 'hardware', label: 'Health Status', icon: Zap },
                  { id: 'productivity', label: 'Productivity', icon: BarChart3 },
                  { id: 'security', label: 'Security', icon: ShieldCheck },
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setMapMode(mode.id as MapMode)}
                    className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition whitespace-nowrap inline-flex items-center justify-center gap-1.5 shrink-0 ${
                      mapMode === mode.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <mode.icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{mode.label}</span>
                  </button>
                ))}
             </div>
             
             {/* Layer Control Dropdown & Fullscreen Toggle */}
             <div className="flex items-center gap-2 pl-2 border-l border-slate-200 shrink-0">
                {/* Full Screen Toggle Button */}
                <button
                  onClick={() => setIsMapFullScreen(!isMapFullScreen)}
                  className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition shadow-sm shrink-0 ${
                    isMapFullScreen 
                      ? 'bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-300' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={isMapFullScreen ? 'Exit Full Screen' : 'Expand Map to Full Screen'}
                >
                  {isMapFullScreen ? <Minimize2 className="w-3.5 h-3.5 shrink-0" /> : <Maximize2 className="w-3.5 h-3.5 shrink-0" />}
                  <span className="hidden sm:inline whitespace-nowrap">{isMapFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
                    className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition shadow-sm shrink-0 ${
                      isLayerMenuOpen || Object.values(visibleLayers).some(v => v === false) || visibleLayers.heatmapOverlay
                        ? 'bg-sky-600 text-white ring-2 ring-sky-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>Layers</span>
                    <span className="px-1.5 py-0.5 bg-black/20 rounded-full text-[9px] font-black leading-none">
                      {Object.values(visibleLayers).filter(Boolean).length}/8
                    </span>
                    <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isLayerMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Layer Control Popover */}
                  {isLayerMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 uppercase tracking-tight">
                          <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                          <span>Map Visibility Layers</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setVisibleLayers({ workers: true, assets: true, vehicles: true, readers: true, zones: true, cameras: true, sensors: true, heatmapOverlay: true })}
                            className="text-[10px] font-bold text-sky-600 hover:underline px-2 py-0.5 rounded hover:bg-sky-50 transition"
                          >
                            All On
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => setVisibleLayers({ workers: false, assets: false, vehicles: false, readers: false, zones: false, cameras: false, sensors: false, heatmapOverlay: false })}
                            className="text-[10px] font-bold text-slate-400 hover:underline px-2 py-0.5 rounded hover:bg-slate-100 transition"
                          >
                            Hide All
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {[
                          { key: 'workers', label: 'Personnel & Workers', icon: Users, color: 'text-sky-600 bg-sky-50 border-sky-200', count: people.length },
                          { key: 'assets', label: 'Equipment & Materials', icon: Box, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', count: assets.length + MOCK_MATERIALS.length },
                          { key: 'vehicles', label: 'Heavy Machinery', icon: Truck, color: 'text-amber-600 bg-amber-50 border-amber-200', count: vehicles.length },
                           { key: 'readers', label: 'RFID Readers & Gates', icon: Radio, color: 'text-indigo-600 bg-indigo-50 border-indigo-200', count: readers.length + MOCK_GATES.length },
                          { key: 'zones', label: 'Geofenced Safety Zones', icon: Layout, color: 'text-sky-700 bg-sky-50 border-sky-200', count: Object.keys(defaultZones).length },
                          { key: 'cameras', label: 'AI CCTV Cameras', icon: Camera, color: 'text-purple-600 bg-purple-50 border-purple-200', count: cameras.length },
                          { key: 'sensors', label: 'EHS Environmental Sensors', icon: Thermometer, color: 'text-rose-600 bg-rose-50 border-rose-200', count: sensors.length },
                          { key: 'heatmapOverlay', label: 'Worker Density Heatmap', icon: Flame, color: 'text-rose-600 bg-rose-50 border-rose-200', count: `${people.length} density points` },
                        ].map((layer) => {
                          const isVisible = visibleLayers[layer.key as keyof VisibleLayers] ?? true;
                          const LayerIcon = layer.icon;

                          return (
                            <button
                              key={layer.key}
                              onClick={() => setVisibleLayers(prev => ({ ...prev, [layer.key]: !isVisible }))}
                              className={`w-full flex items-center justify-between p-2 rounded-xl transition border text-left ${
                                isVisible 
                                  ? 'bg-slate-50 border-slate-200 hover:bg-sky-50/50' 
                                  : 'bg-white border-transparent opacity-50 hover:opacity-80'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className={`p-1.5 rounded-lg border ${layer.color}`}>
                                  <LayerIcon className="w-3.5 h-3.5 shrink-0" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-800">{layer.label}</div>
                                  <div className="text-[9px] font-semibold text-slate-400">{layer.count} items active</div>
                                </div>
                              </div>

                              <div className={`w-5 h-5 rounded-md inline-flex items-center justify-center transition ${
                                isVisible ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-400'
                              }`}>
                                {isVisible ? <Check className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 inline-flex items-center gap-1.5 shrink-0">
                   <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                   <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest hidden sm:inline whitespace-nowrap">Live Connect</span>
                </div>
             </div>
          </div>

          {/* Trade Filter Pills & Floor Levels Row */}
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
              <div className="h-7 inline-flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 pr-2.5 border-r border-slate-200">
                <Filter className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>Trades:</span>
              </div>
              <div className="flex items-center gap-1.5">
                {TRADE_OPTIONS.map(trade => {
                  const isSelected = selectedTrade === trade.id;
                  return (
                    <button
                      key={trade.id}
                      onClick={() => setSelectedTrade(trade.id)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-bold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm border shrink-0 ${
                        isSelected
                          ? 'bg-sky-600 text-white border-sky-600 ring-2 ring-sky-300'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <span>{trade.icon}</span>
                      <span>{trade.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {trade.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floor Selector (All Floors & Floor 1 to Floor 7) */}
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar py-0.5">
              <div className="h-7 inline-flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Floor Maps:</span>
              </div>
              {FLOOR_OPTIONS.map(floor => {
                const isSelected = activeFloor === floor.id;
                const count = floorWorkerCounts[floor.id] ?? 0;
                return (
                  <button
                    key={floor.id}
                    onClick={() => setActiveFloor(floor.id)}
                    className={`h-7 px-2.5 rounded-lg text-[10px] font-mono font-bold inline-flex items-center justify-center gap-1.5 transition border shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                    title={floor.desc}
                  >
                    <span>{floor.short}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeline Replay Scrubber Bar */}
          <div className="px-3 py-2 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 text-xs font-mono">
            <div className="flex items-center gap-2.5 shrink-0">
              <button 
                onClick={() => setIsReplaying(!isReplaying)}
                className="h-6 px-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-md text-[10px] font-black uppercase tracking-wider text-white transition inline-flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>{isReplaying ? '⏸ PAUSE' : '▶ REPLAY'}</span>
              </button>
              <span className="text-[11px] font-bold text-sky-400">Timeline: {timelineTime}</span>
            </div>
            <div className="flex-1 max-w-md flex items-center gap-3">
              <span className="text-[9px] text-slate-400 shrink-0">08:00 AM</span>
              <input 
                type="range" 
                min="0" 
                max="100" 
                defaultValue="100"
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val < 20) setTimelineTime('08:30 AM');
                  else if (val < 40) setTimelineTime('10:00 AM');
                  else if (val < 60) setTimelineTime('11:45 AM');
                  else if (val < 80) setTimelineTime('02:15 PM');
                  else setTimelineTime('NOW (Live)');
                }}
              />
              <span className="text-[9px] font-bold text-emerald-400 whitespace-nowrap shrink-0">NOW (Live)</span>
            </div>
            <div className="text-[10px] text-slate-400 hidden lg:block shrink-0">
              15-min path history loaded
            </div>
          </div>

          {/* Emergency SOS Persistent Active Alert Banner */}
          {emergencySosState?.active && (
            <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-xl border-b border-rose-700 animate-pulse z-40">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-300 animate-bounce shrink-0" />
                <div>
                  <div className="text-xs font-black uppercase tracking-wider">
                    🚨 EMERGENCY SOS ACTIVE — WORKER AT RISK
                  </div>
                  <div className="text-[11px] font-bold text-rose-100">
                    Worker: {emergencySosState.workerName} ({emergencySosState.workerId}) | Zone: {emergencySosState.zone} | Triggered: {emergencySosState.timestamp}
                  </div>
                </div>
              </div>
              <button
                onClick={handleToggleEmergencySOS}
                className="h-8 px-3.5 bg-white hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-black uppercase tracking-wider shadow-md inline-flex items-center justify-center gap-1.5 transition shrink-0"
              >
                SILENCE & RESOLVE ALARM
              </button>
            </div>
          )}

          <div className="flex-1 relative bg-slate-100 flex flex-col xl:flex-row gap-4 items-stretch overflow-visible p-2">
{/* Floating Search Overlay */}
            <div className="absolute top-3 right-3 z-50 w-64" style={{boxShadow:'0 2px 8px rgba(0,0,0,0.1)'}}>
              <div className="flex items-center bg-white bg-opacity-90 border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-sky-500/50">
                <Search className="w-4 h-4 ml-2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search Workers, Hardhats, Equipment, Vehicles..."
                  className="flex-1 bg-transparent py-1 pl-2 pr-8 text-sm placeholder:text-slate-400 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="p-1 mr-1 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 relative h-full rounded-2xl overflow-hidden shadow-inner border border-slate-200 bg-white">
              <LiveFloorMap 
                people={displayedPeople}
                assets={assets as any}
                vehicles={vehicles as any}
                cameras={cameras}
                envSensors={sensors}
                readers={readers}
                gates={MOCK_GATES}
                materials={MOCK_MATERIALS}
                zones={activeZones}
                highlightedPersonId={selectedEntity?.type === 'person' ? selectedEntity.data.id : highlightedPersonId}
                initialFocusZone={focusZone}
                floorplanUrl={trackingCtx?.customFloorplan || projectMeta?.floorplanUrl || localProjectProps?.floorplanUrl || currentProject.floorplanUrl}
                svgSource={trackingCtx?.customSvgSource}
                onSelectEntity={(entity) => setSelectedEntity(entity)}
                customZones={activeZones}
                projectId={projectMeta?.id || currentProject.id}
                projectName={projectMeta?.name || currentProject.name}
                contractor={projectMeta?.contractor || currentProject.contractor}
                dimensions={projectMeta?.dimensions || currentProject.dimensions}
                mode={mapMode}
                activeFloor={activeFloor}
                visibleLayers={visibleLayers}
                zoneCapacities={zoneCapacities}
                emergencySosState={emergencySosState}
                isDrawingGeofence={isDrawingGeofence}
                onSaveCustomGeofence={handleSaveCustomGeofence}
                onCancelDrawing={() => setIsDrawingGeofence(false)}
              />
            </div>
          </div>
        </div>
      </div>

      <LiveTrackingContextDrawer 
        onClose={() => setSelectedEntity(null)}
        entity={selectedEntity}
      />

      <ManageWorkforceModal
        isOpen={isWorkforceModalOpen}
        onClose={() => setIsWorkforceModalOpen(false)}
        people={people}
        availableZones={Object.keys(defaultZones)}
        onAddPerson={() => {}} 
        onUpdatePerson={() => {}} 
        onDeletePerson={() => {}}
      />
    </div>
  );
}

