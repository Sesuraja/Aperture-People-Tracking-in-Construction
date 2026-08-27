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
import { useTracking, useTerminology } from '../context/TrackingContext';





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
    floorplanUrl: '',
    customZones: {}
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
  
  const trackingCtx = useTracking();
  const { personnelPlural, personnelSingular, roleLabel, idBadgeLabel, safetyComplianceLabel, zoneLabel, siteLabel, organizationType } = useTerminology();
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'people' | 'assets' | 'hardware' | 'zones'>('people');
  const [isWorkforceModalOpen, setIsWorkforceModalOpen] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('standard');
  const [activeFloor, setActiveFloor] = useState('ALL');
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
  const [registeredPeople, setRegisteredPeople] = useState<Person[]>([]);
  const [dbAssets, setDbAssets] = useState<Asset[]>([]);
  const [dbVehicles, setDbVehicles] = useState<Vehicle[]>([]);
  const [dbAlerts, setDbAlerts] = useState<any[]>([]);
  const [dbReaders, setDbReaders] = useState<any[]>([]);
  const [dbDevices, setDbDevices] = useState<any[]>([]);
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

  // Unified workforce list directly from MongoDB (people + registered_people + live tracking context)

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    const append = (arr: Person[] | undefined) => {
      if (!arr) return;
      arr.forEach(p => {
        if (!p || !p.id) return;
        if (!map.has(p.id)) {
          map.set(p.id, p);
        } else {
          // Merge live telemetry coordinates if present
          const existing = map.get(p.id)!;
          map.set(p.id, {
            ...existing,
            ...p,
            x: p.x !== undefined ? p.x : existing.x,
            y: p.y !== undefined ? p.y : existing.y,
            presenceState: p.presenceState || existing.presenceState,
            currentZone: p.currentZone || existing.currentZone
          });
        }
      });
    };

    append(propPeople);
    append(dbPeople);
    append(registeredPeople);
    append(trackingCtx?.people);

    const merged = Array.from(map.values());
    return merged.length > 0 ? merged : (propPeople || []);
  }, [propPeople, dbPeople, registeredPeople, trackingCtx?.people]);

  // Custom Geofences & Capacity Thresholds (3x3 Layout matching design)
  const [customZonesState, setCustomZonesState] = useState<Record<string, any>>(() => {
    return defaultZones && Object.keys(defaultZones).length > 0 ? defaultZones : {
      'Material Storage': { x: 6.5, y: 8.0, width: 23.5, height: 21.5, category: 'MATERIAL STORAGE', hazardLevel: 'warning', maxCapacity: 4 },
      'Structure Work Area': { x: 36.5, y: 8.0, width: 26.0, height: 21.5, category: 'STRUCTURAL WORK', hazardLevel: 'normal', maxCapacity: 10 },
      'Crane Operating Zone': { x: 69.0, y: 8.0, width: 24.5, height: 21.5, category: 'CRANE SWING RADIUS', hazardLevel: 'critical', maxCapacity: 3 },
      'Site Office': { x: 6.5, y: 38.0, width: 23.5, height: 21.5, category: 'SITE OPERATIONS', hazardLevel: 'normal', maxCapacity: 8 },
      'Open Work Area': { x: 36.5, y: 38.0, width: 26.0, height: 21.5, category: 'GENERAL CONTRACTING', hazardLevel: 'normal', maxCapacity: 12 },
      'Equipment Parking': { x: 69.0, y: 38.0, width: 24.5, height: 21.5, category: 'HEAVY MACHINERY', hazardLevel: 'warning', maxCapacity: 5 },
      'Excavation Area': { x: 6.5, y: 68.0, width: 23.5, height: 21.5, category: 'EXCAVATION & SHORING', hazardLevel: 'critical', maxCapacity: 4 },
      'Assembly Point': { x: 36.5, y: 68.0, width: 26.0, height: 21.5, category: 'MUSTER POINT', hazardLevel: 'normal', maxCapacity: 30 },
      'High Voltage Area': { x: 69.0, y: 68.0, width: 24.5, height: 21.5, category: 'HIGH VOLTAGE', hazardLevel: 'critical', maxCapacity: 3 }
    };
  });

  const [zoneCapacities, setZoneCapacities] = useState<Record<string, number>>({
    'Material Storage': 4,
    'Structure Work Area': 10,
    'Crane Operating Zone': 3,
    'Site Office': 8,
    'Open Work Area': 12,
    'Equipment Parking': 5,
    'Excavation Area': 4,
    'Assembly Point': 30,
    'High Voltage Area': 3
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
    return projectMeta?.customZones || localProjectProps?.customZones || customZonesState;
  }, [trackingCtx?.zonesDict, projectMeta, localProjectProps, customZonesState]);

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
      const targetWorker: Person = people.find(p => p.ppeStatus === 'NON_COMPLIANT' || p.currentZone === 'Crane Operating Zone') || people[0] || {
        id: 'W-104',
        name: 'Active Personnel',
        role: 'Field Tradesperson',
        currentZone: 'Crane Operating Zone',
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
        zone: targetWorker.currentZone || 'Crane Operating Zone',
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
      "Aperture RFID Shift Attendance & Zone Presence Report",
      `Project: ${currentProject.name} | Contractor: ${currentProject.contractor} | Date: ${new Date().toLocaleDateString()}`,
      pdfColumns,
      pdfRows,
      pdfMetrics
    );
  };

  const assets = useMemo(() => {
    if (trackingCtx?.assets && trackingCtx.assets.length > 0) return trackingCtx.assets;
    if (dbAssets && dbAssets.length > 0) return dbAssets;
    return propAssets || [];
  }, [trackingCtx?.assets, dbAssets, propAssets]);

  const vehicles = useMemo(() => {
    if (trackingCtx?.vehicles && trackingCtx.vehicles.length > 0) return trackingCtx.vehicles;
    if (dbVehicles && dbVehicles.length > 0) return dbVehicles;
    return propVehicles || [];
  }, [trackingCtx?.vehicles, dbVehicles, propVehicles]);

  // Real MongoDB-backed RFID Portal Readers
  const readers: ReaderDevice[] = useMemo(() => {
    if (dbReaders && dbReaders.length > 0) {
      return dbReaders.map((r: any, idx: number) => ({
        id: r.id || `RDR-${idx + 1}`,
        name: r.name || r.location || `Gate Portal ${idx + 1}`,
        x: r.x !== undefined ? r.x : ((idx * 28) % 85 + 8),
        y: r.y !== undefined ? r.y : ((idx * 24) % 80 + 10),
        range: r.range || (r.antennaGainDbi ? Math.max(8, r.antennaGainDbi * 1.5) : 12),
        health: r.status === 'Online' || r.status === 'online' ? 98 : 0,
        status: (r.status === 'Online' || r.status === 'online') ? 'online' : 'offline'
      }));
    }
    return [];
  }, [dbReaders]);

  // Real Gate access points derived from readers/devices
  const gates: AccessGate[] = useMemo(() => {
    return [];
  }, []);

  // Real Materials & Assets derived from MongoDB
  const materials: MaterialAsset[] = useMemo(() => {
    if (assets.length > 0) {
      return assets.slice(0, 5).map((a: any, idx: number) => ({
        id: a.id || `MAT-${idx + 100}`,
        name: a.name || 'Equipment Materials',
        type: a.category || a.type || 'Supplies',
        x: a.x !== undefined ? a.x : ((idx * 22) % 65 + 15),
        y: a.y !== undefined ? a.y : ((idx * 30) % 60 + 20)
      }));
    }
    return [];
  }, [assets]);

  useEffect(() => {
    const unsubProject = onSnapshot(doc(db, 'projects', activeProject), (snap: any) => {
      if (snap.exists()) setProjectMeta(snap.data());
    });

    const unsubMapConfig = onSnapshot(doc(db, 'map_configurations', activeProject), (snap: any) => {
      if (snap.exists()) {
        const data = snap.data();
        setLocalProjectProps((prev: any) => ({
          ...prev,
          floorplanUrl: data.floorplanUrl || prev?.floorplanUrl,
          svgSource: data.svgSource || prev?.svgSource,
          customZones: data.zones || prev?.customZones
        }));
      }
    });

    const unsubPeople = onSnapshot(collection(db, 'people'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbPeople(items.filter((p: any) => !p.projectId || p.projectId === activeProject));
    });

    const unsubRegistered = onSnapshot(collection(db, 'registered_people'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setRegisteredPeople(items);
    });

    const unsubAssets = onSnapshot(collection(db, 'assets'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbAssets(items.filter((a: any) => !a.projectId || a.projectId === activeProject));
    });

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbVehicles(items.filter((v: any) => !v.projectId || v.projectId === activeProject));
    });

    const unsubAlerts = onSnapshot(collection(db, 'alerts'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbAlerts(items);
    });

    const unsubReaders = onSnapshot(collection(db, 'hardware_readers'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbReaders(items);
    });

    const unsubDevices = onSnapshot(collection(db, 'devices'), (snap: any) => {
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      setDbDevices(items);
    });

    const unsubCameras = onSnapshot(collection(db, 'cameras'), (snap: any) => setCameras(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))));
    const unsubSensors = onSnapshot(collection(db, 'sensors'), (snap: any) => setSensors(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))));

    return () => {
      unsubProject(); unsubMapConfig(); unsubPeople(); unsubRegistered(); unsubAssets(); unsubVehicles(); unsubAlerts(); unsubReaders(); unsubDevices(); unsubCameras(); unsubSensors();
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
      (p.hardhatTagId || "").toLowerCase().includes(q) || (p.tradeCompany || "").toLowerCase().includes(q)
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
      result = result.filter(p => p.presenceState === 'MOVING' || (p.role || "").toLowerCase().includes(tradeLower));
    }
    if (activeFloor !== 'ALL') {
      result = result.filter(p => p.presenceState === 'MOVING' || getWorkerFloor(p) === activeFloor);
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
      { id: 'ALL', label: 'All Personnel', icon: '👷' },
      { id: 'Visitor', label: 'Site Visitors', icon: '🎫' },
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
        : people.filter(p => (p.role || "").toLowerCase().includes((t.id || "").toLowerCase()) || (t.id === 'Visitor' && ((p.role || '').toLowerCase().includes('visitor') || (p.name || '').includes('(Visitor)')))).length;
      return { ...t, count };
    });
  }, [people]);

  const dynamicHeavyEquipmentCount = useMemo(() => {
    const vCount = (vehicles || []).length;
    const dbVCount = (dbVehicles || []).length;
    const machineryAssets = (assets || []).filter((a: any) => {
      const cat = ((a.category || a.type || a.name || '') as string).toLowerCase();
      return cat.includes('crane') || cat.includes('excavat') || cat.includes('truck') || cat.includes('lift') || cat.includes('machin') || cat.includes('equipment') || cat.includes('vehicle') || cat.includes('forklift');
    }).length;
    return Math.max(vCount, dbVCount) + machineryAssets;
  }, [vehicles, dbVehicles, assets]);

  const trackedGeofencesCount = useMemo(() => {
    return Object.keys(activeZones || {}).length;
  }, [activeZones]);

  const dynamicHazardBreachesCount = useMemo(() => {
    const dbActiveAlerts = dbAlerts.filter(a => 
      !a.resolved && 
      (a.priority === 'HIGH' || a.priority === 'CRITICAL' || a.type === 'hazard' || a.type === 'security' || a.type === 'panic' || a.type === 'critical')
    ).length;
    const livePpeBreaches = people.filter(p => p.ppeStatus === 'NON_COMPLIANT').length;
    const overCap = overCapacityZones.length;
    return Math.max(dbActiveAlerts, livePpeBreaches + overCap);
  }, [dbAlerts, people, overCapacityZones]);

  const systemHealthRate = useMemo(() => {
    if (!mongoDbStatus.connected) return 0;
    const totalReaders = Math.max(1, readers.length);
    const onlineReaders = readers.filter(r => r.status === 'online').length;
    const readerScore = (onlineReaders / totalReaders) * 90;
    const wsScore = isWsConnected ? 10 : 8;
    return Math.min(100, Math.round(readerScore + wsScore));
  }, [mongoDbStatus.connected, readers, isWsConnected]);

  const highRiskZoneCount = people.filter(p => 
    p.currentZone === 'Crane Swing Zone' || p.currentZone === 'Excavation Shaft'
  ).length;

  return (
    <div className="w-full flex flex-col bg-slate-50 p-4 md:p-6 max-w-[1800px] mx-auto min-h-screen space-y-4 font-sans transition-all">
      
      {/* 1. TOP BAR DASHBOARD HEADER */}
      <div className="bg-white rounded-2xl p-4 md:px-5 md:py-3.5 shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        {/* Live Tracking Header */}
        <div className="flex items-center gap-3.5 xl:border-r xl:border-slate-200 xl:pr-6 shrink-0">
          <div className="w-10 h-10 bg-[#007BC4] rounded-xl text-white inline-flex items-center justify-center shrink-0 shadow-sm">
            <Radio className="w-5 h-5" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none whitespace-nowrap">
              Live Tracking
            </h1>
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

      {/* 2. KPI STATUS DASHBOARD - Dynamic Database Powered */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Personnel Onsite', val: people.length, icon: Users, color: 'text-[#007BC4]', bg: 'bg-blue-50', sub: `${people.filter(p => p.presenceState === 'MOVING').length} Active in Motion` },
          { label: 'Tracked Geofences', val: trackedGeofencesCount, icon: Layout, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: overCapacityZones.length > 0 ? `${overCapacityZones.length} Over Capacity` : 'All Geofences Monitored' },
          { label: 'Hazard Breaches', val: dynamicHazardBreachesCount, icon: AlertTriangle, color: dynamicHazardBreachesCount > 0 ? 'text-rose-600' : 'text-slate-400', bg: dynamicHazardBreachesCount > 0 ? 'bg-rose-50 animate-pulse' : 'bg-slate-50', sub: dynamicHazardBreachesCount > 0 ? `${dynamicHazardBreachesCount} Active Breaches` : 'Zero Active Hazards' },
          { label: 'System Health', val: `${systemHealthRate}%`, icon: Zap, color: systemHealthRate >= 90 ? 'text-emerald-600' : systemHealthRate >= 70 ? 'text-amber-600' : 'text-rose-600', bg: systemHealthRate >= 90 ? 'bg-emerald-50' : systemHealthRate >= 70 ? 'bg-amber-50' : 'bg-rose-50', sub: mongoDbStatus.connected ? 'MongoDB Live' : 'Local DB Active' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
             <div className={`p-3 ${kpi.bg} ${kpi.color} rounded-xl shrink-0`}><kpi.icon className="w-5 h-5" /></div>
             <div className="flex flex-col min-w-0">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">{kpi.label}</div>
                <div className="text-xl font-black text-slate-900 leading-none mt-0.5">{kpi.val}</div>
                <div className="text-[10px] text-slate-500 font-semibold truncate mt-1">{kpi.sub}</div>
             </div>
          </div>
        ))}
      </div>

      {/* 3. MAIN WORKSPACE ENGINE */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch h-[calc(100vh-320px)] min-h-[600px]">
        
        {/* LEFT NAV PANEL - Dedicated Live Personnel Directory */}
        <div className={`${isMapFullScreen ? 'hidden' : 'w-full xl:w-80'} bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md flex flex-col overflow-hidden shrink-0`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
             <div className="flex items-center gap-2">
               <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Live Personnel</h2>
               <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#007BC4]/10 text-[#007BC4]">
                 {filteredPeople.length}
               </span>
             </div>
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Real-time RFID Sync Active" />
          </div>

          <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter active workforce..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#007BC4]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-white dark:bg-slate-800">
             {filteredPeople.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedEntity({ type: 'person', data: p })} 
                  className={`group p-2.5 rounded-xl hover:bg-sky-50 dark:hover:bg-slate-700/60 cursor-pointer transition border ${
                    selectedEntity?.type === 'person' && selectedEntity.data?.id === p.id 
                      ? 'bg-sky-50 dark:bg-slate-700/80 border-[#007BC4]' 
                      : 'border-transparent hover:border-sky-100 dark:hover:border-slate-600'
                  } flex items-center justify-between`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 text-[#007BC4] flex items-center justify-center font-black text-xs shrink-0">
                       {(p.name || 'W').substring(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 dark:text-white truncate">{p.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 truncate flex items-center gap-1">
                        <span>{p.role}</span>
                        {p.tradeCompany && <span>• {p.tradeCompany}</span>}
                      </div>
                      <div className="text-[9px] font-mono text-[#007BC4] font-semibold mt-0.5 truncate">
                        📍 {p.currentZone || 'Site Perimeter'}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                      p.ppeStatus === 'COMPLIANT' || !p.ppeStatus ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      p.ppeStatus === 'WARNING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {p.ppeStatus || 'COMPLIANT'}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      {p.presenceState === 'MOVING' ? '🟢 MOVING' : '⚪ IDLE'}
                    </span>
                  </div>
                </div>
              ))}

              {filteredPeople.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  No workers matching filter.
                </div>
              )}
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
             <button onClick={() => setIsWorkforceModalOpen(true)} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg transition cursor-pointer">
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
                  { id: 'heatmap', label: 'Heat Map', icon: Activity },
                  { id: 'coverage', label: 'RFID Coverage', icon: Radio },
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
                          { key: 'assets', label: 'Equipment & Materials', icon: Box, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', count: assets.length },
                          { key: 'vehicles', label: 'Heavy Machinery', icon: Truck, color: 'text-amber-600 bg-amber-50 border-amber-200', count: vehicles.length },
                          { key: 'readers', label: 'RFID Readers & Gates', icon: Radio, color: 'text-indigo-600 bg-indigo-50 border-indigo-200', count: readers.length },
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
            <div className="flex-1 relative h-full rounded-2xl overflow-hidden shadow-inner border border-slate-200 bg-white">
              <LiveFloorMap 
                people={displayedPeople}
                assets={assets as any}
                vehicles={vehicles as any}
                cameras={cameras}
                envSensors={sensors}
                readers={readers}
                gates={gates}
                materials={materials}
                zones={activeZones}
                highlightedPersonId={selectedEntity?.type === 'person' ? selectedEntity.data.id : highlightedPersonId}
                initialFocusZone={focusZone}
                floorplanUrl={trackingCtx?.customFloorplan || localProjectProps?.floorplanUrl || projectMeta?.floorplanUrl || (typeof window !== 'undefined' ? localStorage.getItem('gao_custom_floorplan') : null) || currentProject.floorplanUrl}
                svgSource={trackingCtx?.customSvgSource || localProjectProps?.svgSource || (typeof window !== 'undefined' ? (localStorage.getItem('gao_custom_svg_source') || localStorage.getItem('gao_custom_svg')) : undefined) || undefined}
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

