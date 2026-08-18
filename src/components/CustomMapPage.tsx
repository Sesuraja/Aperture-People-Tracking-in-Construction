import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Map as MapIcon, Plus, Trash2, Edit3, Save, Upload, Sliders, Radio, 
  Wrench, Truck, Camera, Thermometer, ShieldCheck, AlertTriangle, Box, Compass, RefreshCw, Check,
  Layers, MapPin, Eye, Settings, HelpCircle, HardHat, Building2, Layers3, History, FileCode,
  Sparkles, FileText, ChevronRight, RotateCw, Copy, ShieldAlert, ArrowRight, X, FolderPlus,
  Users, Lock, Unlock, EyeOff, Search, Filter, Flame, Zap, Navigation, Wifi,
  PenTool, Square, Circle, Clock, BellRing, Maximize2, Activity, Info
} from 'lucide-react';
import HardwareConfigModal, { HardwareDevice } from './HardwareConfigModal';
import MapEditorModal, { ZoneBounds } from './MapEditorModal';
import ManageAssetsModal, { GenericAsset, AssetCategoryType } from './ManageAssetsModal';
import { INITIAL_DEVICES, getBlueprintSvg } from './LiveFloorMap';
import { AssetItem, VehicleItem, CCTVCameraItem, EnvironmentalSensorItem, INITIAL_ASSETS, INITIAL_VEHICLES, INITIAL_INFRASTRUCTURE, INITIAL_CCTVS, INITIAL_ENV_SENSORS } from '../lib/trackingLayers';
import { doc, setDoc, deleteDoc, collection, onSnapshot, db } from '../lib/db';
import { useTracking } from '../context/TrackingContext';

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

export interface MapLayerConfig {
  id: string;
  name: string;
  category: 'personnel' | 'equipment' | 'infrastructure' | 'zones' | 'safety' | 'civil';
  visible: boolean;
  opacity: number;
  locked: boolean;
  count: number;
  iconName: string;
  color: string;
}

export interface MapWorkerItem {
  id: string;
  name: string;
  role: string;
  company: string;
  x: number;
  y: number;
  safetyStatus: 'COMPLIANT' | 'DUE_SOON' | 'NON_COMPLIANT' | 'OVERDUE' | 'PENDING';
  ppeStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'WARNING';
  currentZone?: string;
  hardhatTagId?: string;
  certifications?: string[];
}

export const INITIAL_MAP_WORKERS: MapWorkerItem[] = [
  { id: 'W-101', name: 'Alice Smith', role: 'Steel Fixer Lead', company: 'Apex Structural', x: 55, y: 32, safetyStatus: 'COMPLIANT', ppeStatus: 'COMPLIANT', currentZone: 'Tower Core', hardhatTagId: 'HH-1092', certifications: ['Working at Heights', 'Ironworking L3'] },
  { id: 'W-102', name: 'Marcus Vance', role: 'Scaffolder Lead', company: 'BuildCorp', x: 28, y: 22, safetyStatus: 'NON_COMPLIANT', ppeStatus: 'NON_COMPLIANT', currentZone: 'Scaffold Access Tower', hardhatTagId: 'HH-1088', certifications: ['Advanced Scaffolding (Expired)'] },
  { id: 'W-103', name: 'Carlos Rodriguez', role: 'Rigging Specialist', company: 'Heavy Crane Ltd', x: 82, y: 15, safetyStatus: 'DUE_SOON', ppeStatus: 'COMPLIANT', currentZone: 'Crane Swing Zone', hardhatTagId: 'HH-2041', certifications: ['Crane Rigger Cert (Refresher Due)'] },
  { id: 'W-104', name: 'David Kim', role: 'Concrete Pour Op', company: 'BuildCorp', x: 18, y: 35, safetyStatus: 'COMPLIANT', ppeStatus: 'COMPLIANT', currentZone: 'Excavation Shaft', hardhatTagId: 'HH-1055', certifications: ['Heavy Machinery Safety'] },
  { id: 'W-105', name: 'Elena Rostova', role: 'EHS Safety Officer', company: 'Apex Structural', x: 12, y: 14, safetyStatus: 'COMPLIANT', ppeStatus: 'COMPLIANT', currentZone: 'Muster Point A', hardhatTagId: 'HH-3011', certifications: ['OSHA 30 Master', 'EHS Director'] },
  { id: 'W-106', name: 'James Wilson', role: 'Electrician Lead', company: 'VoltTech Power', x: 48, y: 8, safetyStatus: 'NON_COMPLIANT', ppeStatus: 'NON_COMPLIANT', currentZone: 'High Voltage Area', hardhatTagId: 'HH-4012', certifications: ['Substation High Voltage (PPE Missing)'] },
  { id: 'W-107', name: 'Robert Taylor', role: 'Excavator Operator', company: 'TerraEarth Excavation', x: 22, y: 48, safetyStatus: 'OVERDUE', ppeStatus: 'WARNING', currentZone: 'Excavation Shaft', hardhatTagId: 'HH-1022', certifications: ['Excavator Op (Induction Overdue)'] },
  { id: 'W-108', name: 'Mateo Garcia', role: 'HVAC Technician', company: 'AirCool Solutions', x: 58, y: 38, safetyStatus: 'PENDING', ppeStatus: 'COMPLIANT', currentZone: 'Tower Core', hardhatTagId: 'HH-5001', certifications: ['HVAC Level 1 (Pending Approval)'] },
  { id: 'W-109', name: 'Sarah Jenkins', role: 'Quality Surveyor', company: 'Client Representative', x: 62, y: 30, safetyStatus: 'COMPLIANT', ppeStatus: 'COMPLIANT', currentZone: 'Tower Core', hardhatTagId: 'HH-1002', certifications: ['Site Safety Visitor Pass'] },
  { id: 'W-110', name: 'Liam O\'Connor', role: 'Welding Specialist', company: 'Apex Structural', x: 53, y: 34, safetyStatus: 'COMPLIANT', ppeStatus: 'COMPLIANT', currentZone: 'Tower Core', hardhatTagId: 'HH-1099', certifications: ['Hot Work Certified'] }
];

export const DEFAULT_LAYER_CONFIGS: Record<string, MapLayerConfig> = {
  workers: { id: 'workers', name: 'Workers', category: 'personnel', visible: true, opacity: 1, locked: false, count: 10, iconName: 'HardHat', color: 'bg-emerald-500 text-white' },
  visitors: { id: 'visitors', name: 'Visitors', category: 'personnel', visible: true, opacity: 1, locked: false, count: 5, iconName: 'Users', color: 'bg-blue-500 text-white' },
  contractors: { id: 'contractors', name: 'Contractors', category: 'personnel', visible: true, opacity: 1, locked: false, count: 12, iconName: 'Building2', color: 'bg-indigo-500 text-white' },
  equipment: { id: 'equipment', name: 'Equipment', category: 'equipment', visible: true, opacity: 1, locked: false, count: 8, iconName: 'Box', color: 'bg-amber-500 text-white' },
  vehicles: { id: 'vehicles', name: 'Vehicles', category: 'equipment', visible: true, opacity: 1, locked: false, count: 6, iconName: 'Truck', color: 'bg-orange-500 text-white' },
  rfidReaders: { id: 'rfidReaders', name: 'RFID Readers', category: 'infrastructure', visible: true, opacity: 0.9, locked: false, count: 6, iconName: 'Radio', color: 'bg-purple-500 text-white' },
  gpsDevices: { id: 'gpsDevices', name: 'GPS Devices', category: 'infrastructure', visible: true, opacity: 0.9, locked: false, count: 10, iconName: 'Navigation', color: 'bg-sky-500 text-white' },
  cctvCameras: { id: 'cctvCameras', name: 'CCTV Cameras', category: 'infrastructure', visible: true, opacity: 0.9, locked: false, count: 7, iconName: 'Camera', color: 'bg-teal-500 text-white' },
  hazardZones: { id: 'hazardZones', name: 'Hazard Zones', category: 'zones', visible: true, opacity: 0.8, locked: true, count: 4, iconName: 'AlertTriangle', color: 'bg-rose-500 text-white' },
  restrictedZones: { id: 'restrictedZones', name: 'Restricted Zones', category: 'zones', visible: true, opacity: 0.8, locked: true, count: 3, iconName: 'ShieldAlert', color: 'bg-red-600 text-white' },
  assemblyPoints: { id: 'assemblyPoints', name: 'Assembly Points', category: 'safety', visible: true, opacity: 1, locked: true, count: 2, iconName: 'ShieldCheck', color: 'bg-emerald-600 text-white' },
  fireEquipment: { id: 'fireEquipment', name: 'Fire Equipment', category: 'safety', visible: true, opacity: 1, locked: false, count: 9, iconName: 'Flame', color: 'bg-red-500 text-white' },
  firstAidStations: { id: 'firstAidStations', name: 'First Aid Stations', category: 'safety', visible: true, opacity: 1, locked: false, count: 3, iconName: 'Plus', color: 'bg-emerald-500 text-white' },
  emergencyRoutes: { id: 'emergencyRoutes', name: 'Emergency Routes', category: 'safety', visible: true, opacity: 0.85, locked: true, count: 4, iconName: 'ArrowUpRight', color: 'bg-green-500 text-white' },
  utilities: { id: 'utilities', name: 'Utilities', category: 'civil', visible: true, opacity: 0.8, locked: false, count: 5, iconName: 'Sliders', color: 'bg-yellow-500 text-white' },
  buildings: { id: 'buildings', name: 'Buildings', category: 'civil', visible: true, opacity: 0.95, locked: true, count: 3, iconName: 'Building2', color: 'bg-slate-600 text-white' },
  roads: { id: 'roads', name: 'Roads', category: 'civil', visible: true, opacity: 0.9, locked: true, count: 2, iconName: 'Compass', color: 'bg-stone-600 text-white' },
};

interface CustomMapPageProps {
  activeProject: string;
  setActiveProject: (id: string) => void;
}

export interface MapVersion {
  id: string;
  versionNumber: string;
  status: 'published' | 'draft' | 'archived';
  createdAt: string;
  author: string;
  notes: string;
  zones: Record<string, ZoneBounds>;
  floorplanUrl: string | null;
  svgSource?: string | null;
}

export interface BuildingData {
  id: string;
  name: string;
  floors: Array<{
    id: string;
    name: string;
    levelNumber: number;
    activeVersionId: string;
    versions: MapVersion[];
  }>;
}

export interface SiteData {
  id: string;
  name: string;
  contractor: string;
  dimensions: string;
  buildings: BuildingData[];
}

const DEFAULT_SITES: Record<string, SiteData> = {
  'metro-tower': {
    id: 'metro-tower',
    name: 'Metro Commercial Tower Construction',
    contractor: 'BuildCorp General Contractors',
    dimensions: '200m x 150m (30,000 m²)',
    buildings: [
      {
        id: 'bldg-main',
        name: 'Building A - Commercial Main Tower',
        floors: [
          {
            id: 'fl-1',
            name: 'Level 1 - Ground Access & Gate Portal',
            levelNumber: 1,
            activeVersionId: 'ver-1.0',
            versions: [
              {
                id: 'ver-1.0',
                versionNumber: 'v1.0',
                status: 'published',
                createdAt: '2026-08-01 09:00',
                author: 'Elena Rostova (EHS Lead)',
                notes: 'Initial approved site safety clearance map and RFID gate boundaries.',
                zones: {
                  'Excavation Shaft': { x: 10, y: 15, width: 34, height: 62, category: 'EXCAVATION & SHORING', hazardLevel: 'warning', capacity: 4 },
                  'Tower Core': { x: 51, y: 25, width: 32, height: 50, category: 'CONCRETE REINFORCEMENT', hazardLevel: 'normal', capacity: 10 },
                  'Crane Swing Zone': { x: 80, y: 5, width: 16, height: 42, category: 'CRANE SWING RADIUS', hazardLevel: 'critical', capacity: 3 },
                  'High Voltage Area': { x: 46, y: 5, width: 14, height: 16, category: 'SUBSTATION PERIMETER', hazardLevel: 'critical', capacity: 1 },
                  'Muster Point A': { x: 2, y: 10, width: 8, height: 12, category: 'MUSTER POINT', hazardLevel: 'normal', capacity: 30 }
                },
                floorplanUrl: null
              }
            ]
          },
          {
            id: 'fl-2',
            name: 'Level 2 - Steel Decking & Scaffolding',
            levelNumber: 2,
            activeVersionId: 'ver-1.0-l2',
            versions: [
              {
                id: 'ver-1.0-l2',
                versionNumber: 'v1.0',
                status: 'published',
                createdAt: '2026-08-02 11:30',
                author: 'Marcus Vance',
                notes: 'Level 2 steel decking and scaffold perimeter layout.',
                zones: {
                  'Scaffold Access Tower': { x: 15, y: 10, width: 30, height: 40, category: 'SCAFFOLDING', hazardLevel: 'normal', capacity: 12 },
                  'High Rise Frame Deck': { x: 50, y: 10, width: 45, height: 75, category: 'BUILDING FOOTPRINT', hazardLevel: 'warning', capacity: 20 },
                  'Emergency Evacuation Stair': { x: 5, y: 60, width: 15, height: 25, category: 'EMERGENCY EXIT', hazardLevel: 'normal', capacity: 50 }
                },
                floorplanUrl: null
              }
            ]
          }
        ]
      },
      {
        id: 'bldg-logistics',
        name: 'Building B - Logistics & Equipment Hub',
        floors: [
          {
            id: 'fl-b1-1',
            name: 'Ground Level - Heavy Staging & Parking',
            levelNumber: 1,
            activeVersionId: 'ver-1.0-b2',
            versions: [
              {
                id: 'ver-1.0-b2',
                versionNumber: 'v1.0',
                status: 'published',
                createdAt: '2026-08-03 14:00',
                author: 'G. Hopper (Fleet Manager)',
                notes: 'Heavy machinery parking and material storage laydown.',
                zones: {
                  'Rebar & Steel Laydown': { x: 10, y: 10, width: 40, height: 35, category: 'MATERIAL LAYDOWN', hazardLevel: 'normal', capacity: 15 },
                  'Contractor Parking': { x: 55, y: 10, width: 40, height: 35, category: 'PARKING', hazardLevel: 'normal', capacity: 25 },
                  'Site Office Container': { x: 10, y: 55, width: 30, height: 35, category: 'SITE OFFICE', hazardLevel: 'normal', capacity: 8 }
                },
                floorplanUrl: null
              }
            ]
          }
        ]
      }
    ]
  }
};

export function getSafetyStatusBadge(status: string) {
  if (status === 'COMPLIANT') {
    return {
      label: '✓ COMPLIANT',
      shortLabel: 'COMPLIANT',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500',
      pillBg: 'bg-emerald-950/90 text-emerald-100 border-emerald-500',
      icon: ShieldCheck,
      color: '#10b981',
      ping: false
    };
  }
  if (status === 'DUE_SOON' || status === 'WARNING' || status === 'EXPIRING') {
    return {
      label: '⚠️ REFRESHER DUE',
      shortLabel: 'DUE SOON',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500',
      pillBg: 'bg-amber-950/90 text-amber-200 border-amber-500',
      icon: Clock,
      color: '#f59e0b',
      ping: false
    };
  }
  if (status === 'NON_COMPLIANT' || status === 'OVERDUE' || status === 'EXPIRED' || status === 'FAILED') {
    return {
      label: '⛔ NON-COMPLIANT',
      shortLabel: 'NON-COMPLIANT',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500',
      pillBg: 'bg-rose-950/90 text-rose-200 border-rose-500 ring-2 ring-rose-500/50',
      icon: ShieldAlert,
      color: '#f43f5e',
      ping: true
    };
  }
  return {
    label: '🔄 PENDING',
    shortLabel: 'PENDING',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500',
    pillBg: 'bg-sky-950/90 text-sky-200 border-sky-500',
    icon: RefreshCw,
    color: '#38bdf8',
    ping: false
  };
}

export default function CustomMapPage({ activeProject, setActiveProject }: CustomMapPageProps) {
  const trackingCtx = useTracking();
  // Sites, Buildings, Floors State
  const [sites, setSites] = useState<Record<string, SiteData>>(() => {
    try {
      const saved = localStorage.getItem('gao_custom_sites_v2');
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.warn('Failed to load sites:', err);
    }
    return DEFAULT_SITES;
  });

  const currentSite = sites[activeProject] || sites['metro-tower'] || DEFAULT_SITES['metro-tower'];
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(currentSite.buildings[0]?.id || 'bldg-main');
  const currentBuilding = currentSite.buildings.find(b => b.id === selectedBuildingId) || currentSite.buildings[0];
  const [selectedFloorId, setSelectedFloorId] = useState<string>(currentBuilding?.floors[0]?.id || 'fl-1');
  const currentFloor = currentBuilding?.floors.find(f => f.id === selectedFloorId) || currentBuilding?.floors[0];

  const activeVersion = currentFloor?.versions.find(v => v.id === currentFloor.activeVersionId) || currentFloor?.versions[0];

  const [assets, setAssets] = useState<AssetItem[]>(INITIAL_ASSETS);
  const [vehicles, setVehicles] = useState<VehicleItem[]>(INITIAL_VEHICLES);
  const [cameras, setCameras] = useState<CCTVCameraItem[]>(INITIAL_CCTVS);
  const [envSensors, setEnvSensors] = useState<EnvironmentalSensorItem[]>(INITIAL_ENV_SENSORS);
  const [hardwareDevices, setHardwareDevices] = useState<HardwareDevice[]>(INITIAL_DEVICES);
  const [mapWorkers, setMapWorkers] = useState<MapWorkerItem[]>(INITIAL_MAP_WORKERS);

  const [customFloorplan, setCustomFloorplan] = useState<string | null>(activeVersion?.floorplanUrl || null);
  const [customSvgSource, setCustomSvgSource] = useState<string | null>(activeVersion?.svgSource || null);
  const [customZones, setCustomZones] = useState<Record<string, ZoneBounds>>(activeVersion?.zones || {});

  const [activeSidebarTab, setActiveSidebarTab] = useState<'layers' | 'inventory' | 'assets' | 'zones' | 'sites'>('layers');
  const [layerConfigs, setLayerConfigs] = useState<Record<string, MapLayerConfig>>(DEFAULT_LAYER_CONFIGS);
  const [mapSearchQuery, setMapSearchQuery] = useState('');

  // Overlays State
  const [showDensityHeatmap, setShowDensityHeatmap] = useState(false);
  const [showRestrictedZoneMarkers, setShowRestrictedZoneMarkers] = useState(true);
  const [showProximityAuras, setShowProximityAuras] = useState(true);

  // Clustering State
  const [enableClustering, setEnableClustering] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<MapWorkerItem[] | null>(null);

  // Selected Worker Modal / Detail Drawer
  const [selectedWorker, setSelectedWorker] = useState<MapWorkerItem | null>(null);

  // Geofence Drawing Mode State
  const [drawToolMode, setDrawToolMode] = useState<'select' | 'polygon' | 'rectangle'>('select');
  const [drawnPoints, setDrawnPoints] = useState<{ x: number; y: number }[]>([]);
  const [isSavingGeofenceModalOpen, setIsSavingGeofenceModalOpen] = useState(false);
  const [isManageAssetsOpen, setIsManageAssetsOpen] = useState(false);
  const [geofenceForm, setGeofenceForm] = useState({
    name: '',
    category: 'EXCAVATION & SHORING',
    hazardLevel: 'warning' as 'normal' | 'warning' | 'critical',
    capacity: 5,
    proximityAlertEnabled: true,
    bufferMeters: 5
  });

  // Modals & Interactive Tooltips State
  const [hoveredZoneName, setHoveredZoneName] = useState<string | null>(null);
  const [selectedZoneName, setSelectedZoneName] = useState<string | null>(null);
  const [showLegendOverlay, setShowLegendOverlay] = useState<boolean>(true);
  const [selectedDeviceForConfig, setSelectedDeviceForConfig] = useState<HardwareDevice | null>(null);
  const [isMapEditorOpen, setIsMapEditorOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);

  // Dynamic Zone Occupancy & Alert Calculation Helper
  const calculateZoneMetrics = (zName: string, bounds: ZoneBounds) => {
    const workersInZone = mapWorkers.filter(w => 
      w.currentZone === zName || 
      (w.x >= bounds.x && w.x <= (bounds.x + bounds.width) && w.y >= bounds.y && w.y <= (bounds.y + bounds.height))
    );
    
    const vehiclesInZone = vehicles.filter(v => 
      (v.x >= bounds.x && v.x <= (bounds.x + bounds.width) && v.y >= bounds.y && v.y <= (bounds.y + bounds.height))
    );

    const nonCompliantWorkers = workersInZone.filter(w => w.safetyStatus === 'NON_COMPLIANT' || w.safetyStatus === 'OVERDUE');
    const capacity = bounds.capacity || 10;
    const count = workersInZone.length;
    const isOverCapacity = count > capacity;

    const alerts: string[] = [];
    if (isOverCapacity) {
      alerts.push(`Overcapacity Warning (${count}/${capacity} occupants)`);
    }
    if (nonCompliantWorkers.length > 0) {
      alerts.push(`${nonCompliantWorkers.length} Non-Compliant Personnel Detected`);
    }
    if (bounds.hazardLevel === 'critical') {
      alerts.push('Critical Hazard Zone — High Risk Area');
    }
    if (bounds.proximityAlertEnabled) {
      alerts.push('Proximity Guard Alerting Armed');
    }

    return {
      workersInZone,
      vehiclesInZone,
      nonCompliantWorkers,
      capacity,
      count,
      isOverCapacity,
      alerts
    };
  };

  // Real-time Database sync for Zones, Geofences, Assets, and Personnel
  useEffect(() => {
    const fetchDatabaseZones = async () => {
      try {
        const authHeaders = getAuthHeaders();
        const [
          zonesRes, 
          mapRes, 
          peopleRes, 
          assetsRes, 
          vehiclesRes, 
          camerasRes, 
          sensorsRes,
          devicesRes
        ] = await Promise.allSettled([
          fetch('/api/data/zones', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch(`/api/data/map_configurations/${activeProject}`, { headers: authHeaders }).then(r => r.ok ? r.json() : null),
          fetch('/api/data/registered_people', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/assets', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/vehicles', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/cameras', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/sensors', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/devices', { headers: authHeaders }).then(r => r.ok ? r.json() : [])
        ]);

        if (zonesRes.status === 'fulfilled' && Array.isArray(zonesRes.value) && zonesRes.value.length > 0) {
          const loadedZones: Record<string, ZoneBounds> = {};
          zonesRes.value.forEach((z: any) => {
            if (z && z.name) {
              loadedZones[z.name] = {
                x: z.x,
                y: z.y,
                width: z.width,
                height: z.height,
                category: z.category || 'GENERAL',
                hazardLevel: z.hazardLevel || 'normal',
                capacity: z.capacity || 10,
                proximityAlertEnabled: z.proximityAlertEnabled ?? false,
                polygonPoints: z.polygonPoints
              };
            }
          });
          setCustomZones(prev => ({ ...prev, ...loadedZones }));
        }

        if (mapRes.status === 'fulfilled' && mapRes.value) {
          if (mapRes.value.floorplanUrl) setCustomFloorplan(mapRes.value.floorplanUrl);
          if (mapRes.value.svgSource) setCustomSvgSource(mapRes.value.svgSource);
          if (mapRes.value.zones) setCustomZones(prev => ({ ...prev, ...mapRes.value.zones }));
        }

        if (peopleRes.status === 'fulfilled' && Array.isArray(peopleRes.value) && peopleRes.value.length > 0) {
          const mappedWorkers: MapWorkerItem[] = peopleRes.value.map((p: any, idx: number) => ({
            id: p.id || `W-${idx + 101}`,
            name: p.name || `Personnel ${idx + 1}`,
            role: p.role || 'Field Specialist',
            company: p.company || p.tradeCompany || 'Apex Construction',
            x: typeof p.x === 'number' ? p.x : 20 + ((idx * 15) % 65),
            y: typeof p.y === 'number' ? p.y : 20 + ((idx * 19) % 60),
            safetyStatus: p.safetyStatus || (p.ppeStatus === 'NON_COMPLIANT' ? 'NON_COMPLIANT' : 'COMPLIANT'),
            ppeStatus: p.ppeStatus || 'COMPLIANT',
            currentZone: p.currentZone || p.location || 'Tower Core',
            hardhatTagId: p.hardhatTagId || p.tagId || `HH-${idx + 1000}`,
            certifications: p.certifications || ['Site Safety Pass', 'OSHA 10']
          }));
          setMapWorkers(mappedWorkers);
        }

        if (assetsRes.status === 'fulfilled' && Array.isArray(assetsRes.value) && assetsRes.value.length > 0) {
          setAssets(assetsRes.value);
        }

        if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value) && vehiclesRes.value.length > 0) {
          setVehicles(vehiclesRes.value);
        }

        if (camerasRes.status === 'fulfilled' && Array.isArray(camerasRes.value) && camerasRes.value.length > 0) {
          setCameras(camerasRes.value);
        }

        if (sensorsRes.status === 'fulfilled' && Array.isArray(sensorsRes.value) && sensorsRes.value.length > 0) {
          setEnvSensors(sensorsRes.value);
        }

        if (devicesRes.status === 'fulfilled' && Array.isArray(devicesRes.value) && devicesRes.value.length > 0) {
          setHardwareDevices(devicesRes.value);
        }
      } catch (err) {
        console.warn('Failed to load database items in CustomMapPage:', err);
      }
    };

    fetchDatabaseZones();

    try {
      const unsub = onSnapshot(collection(db, 'geofences'), (snapshot) => {
        const firestoreGeofences: Record<string, ZoneBounds> = {};
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d && d.name) {
            firestoreGeofences[d.name] = {
              x: d.x ?? 20,
              y: d.y ?? 20,
              width: d.width ?? 25,
              height: d.height ?? 20,
              category: d.category || 'CUSTOM GEOFENCE',
              hazardLevel: d.hazardLevel || 'warning',
              capacity: d.capacity || 10,
              proximityAlertEnabled: d.proximityAlertEnabled ?? true,
              polygonPoints: d.polygonPoints || []
            };
          }
        });
        if (Object.keys(firestoreGeofences).length > 0) {
          setCustomZones(prev => ({ ...prev, ...firestoreGeofences }));
        }
      });
      return () => unsub();
    } catch (err) {
      console.warn('Firestore geofences listener setup error:', err);
    }
  }, [activeProject]);

  // Asset CRUD Handlers connected to Database
  const handleSaveAssetFromModal = async (item: GenericAsset) => {
    const authHeaders = getAuthHeaders();
    try {
      if (item.category === 'asset') {
        const assetObj: AssetItem = {
          id: item.id,
          name: item.name,
          category: (item.type as any) || 'Machinery',
          location: item.zone,
          status: (item.status as any) || 'In Use',
          battery: item.batteryLevel ?? 95,
          x: item.x,
          y: item.y,
          assignedWorker: 'Unassigned',
          utilization: 0,
          lastMovement: new Date().toISOString()
        };
        await fetch('/api/data/assets', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(assetObj)
        });
        setAssets(prev => {
          const idx = prev.findIndex(a => a.id === assetObj.id);
          const next = idx >= 0 ? [...prev] : [assetObj, ...prev];
          if (idx >= 0) next[idx] = assetObj;
          return next;
        });
      } else if (item.category === 'vehicle') {
        const vehicleObj: VehicleItem = {
          id: item.id,
          name: item.name,
          type: (item.type as any) || 'Heavy Vehicle',
          location: item.zone,
          status: (item.status as any) || 'Active',
          fuel: item.fuelLevel ?? 85,
          operator: item.operator || 'Assigned Driver',
          x: item.x,
          y: item.y,
          speed: 0
        };
        await fetch('/api/data/vehicles', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(vehicleObj)
        });
        setVehicles(prev => {
          const idx = prev.findIndex(v => v.id === vehicleObj.id);
          const next = idx >= 0 ? [...prev] : [vehicleObj, ...prev];
          if (idx >= 0) next[idx] = vehicleObj;
          return next;
        });
      } else if (item.category === 'camera') {
        const cameraObj: CCTVCameraItem = {
          id: item.id,
          name: item.name,
          zone: item.zone,
          status: (item.status as any) || 'Online',
          aiStatus: (item.aiStatus as any) || 'Active',
          x: item.x,
          y: item.y,
          aiFeatures: [],
          recentEvent: 'No recent events',
          streamResolution: '1080p',
          angle: 0
        };
        await fetch('/api/data/cameras', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(cameraObj)
        });
        setCameras(prev => {
          const idx = prev.findIndex(c => c.id === cameraObj.id);
          const next = idx >= 0 ? [...prev] : [cameraObj, ...prev];
          if (idx >= 0) next[idx] = cameraObj;
          return next;
        });
      } else if (item.category === 'sensor') {
        const sensorObj: EnvironmentalSensorItem = {
          id: item.id,
          name: item.name || `Sensor ${item.id}`,
          zone: item.zone,
          status: (item.status as any) || 'Normal',
          temperature: item.temperature ?? 24,
          gasLevel: (item as any).gasLevel ?? 0,
          dustPM25: item.dustPM25 ?? 15,
          noiseDb: (item as any).noiseDb ?? 50,
          humidity: (item as any).humidity ?? 45,
          x: item.x,
          y: item.y
        };
        await fetch('/api/data/sensors', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(sensorObj)
        });
        setEnvSensors(prev => {
          const idx = prev.findIndex(s => s.id === sensorObj.id);
          const next = idx >= 0 ? [...prev] : [sensorObj, ...prev];
          if (idx >= 0) next[idx] = sensorObj;
          return next;
        });
      }

      // Propagate update in real-time to Live Tracking Context
      if (item.category === 'asset' && trackingCtx?.saveAsset) {
        trackingCtx.saveAsset({
          id: item.id,
          name: item.name,
          category: (item.type as any) || 'Machinery',
          location: item.zone,
          status: (item.status as any) || 'In Use',
          battery: item.batteryLevel ?? 95,
          x: item.x,
          y: item.y,
          assignedWorker: 'Unassigned',
          utilization: 0,
          lastMovement: new Date().toISOString()
        }).catch(() => {});
      } else if (item.category === 'vehicle' && trackingCtx?.saveVehicle) {
        trackingCtx.saveVehicle({
          id: item.id,
          name: item.name,
          type: (item.type as any) || 'Heavy Vehicle',
          location: item.zone,
          status: (item.status as any) || 'Active',
          fuel: item.fuelLevel ?? 85,
          operator: item.operator || 'Assigned Driver',
          x: item.x,
          y: item.y,
          speed: 0
        }).catch(() => {});
      } else if (item.category === 'camera' && trackingCtx?.saveCamera) {
        trackingCtx.saveCamera({
          id: item.id,
          name: item.name,
          zone: item.zone,
          status: (item.status as any) || 'Online',
          aiStatus: (item.aiStatus as any) || 'Active',
          x: item.x,
          y: item.y,
          aiFeatures: [],
          recentEvent: 'No recent events',
          streamResolution: '1080p',
          angle: 0
        }).catch(() => {});
      } else if (item.category === 'sensor' && trackingCtx?.saveEnvSensor) {
        trackingCtx.saveEnvSensor({
          id: item.id,
          name: item.name || `Sensor ${item.id}`,
          zone: item.zone,
          status: (item.status as any) || 'Normal',
          temperature: item.temperature ?? 24,
          gasLevel: (item as any).gasLevel ?? 0,
          dustPM25: item.dustPM25 ?? 15,
          noiseDb: (item as any).noiseDb ?? 50,
          humidity: (item as any).humidity ?? 45,
          x: item.x,
          y: item.y
        }).catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
      window.dispatchEvent(new CustomEvent('gao_project_updated'));
      setSuccessMsg(`Asset "${item.name || item.id}" synchronized to database!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Failed to save asset to database:', err);
    }
  };

  const handleDeleteAssetFromModal = async (id: string, category: AssetCategoryType) => {
    const authHeaders = getAuthHeaders();
    try {
      if (category === 'asset') {
        await fetch(`/api/data/assets/${id}`, { method: 'DELETE', headers: authHeaders });
        setAssets(prev => prev.filter(a => a.id !== id));
      } else if (category === 'vehicle') {
        await fetch(`/api/data/vehicles/${id}`, { method: 'DELETE', headers: authHeaders });
        setVehicles(prev => prev.filter(v => v.id !== id));
      } else if (category === 'camera') {
        await fetch(`/api/data/cameras/${id}`, { method: 'DELETE', headers: authHeaders });
        setCameras(prev => prev.filter(c => c.id !== id));
      } else if (category === 'sensor') {
        await fetch(`/api/data/sensors/${id}`, { method: 'DELETE', headers: authHeaders });
        setEnvSensors(prev => prev.filter(s => s.id !== id));
      }
      if (category === 'asset' && trackingCtx?.deleteAsset) trackingCtx.deleteAsset(id).catch(() => {});
      if (category === 'vehicle' && trackingCtx?.deleteVehicle) trackingCtx.deleteVehicle(id).catch(() => {});
      if (category === 'camera' && trackingCtx?.deleteCamera) trackingCtx.deleteCamera(id).catch(() => {});
      if (category === 'sensor' && trackingCtx?.deleteEnvSensor) trackingCtx.deleteEnvSensor(id).catch(() => {});
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
      window.dispatchEvent(new CustomEvent('gao_project_updated'));
      setSuccessMsg(`Asset "${id}" deleted from database.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Failed to delete asset from database:', err);
    }
  };

  const toggleLayerVisibility = (key: string) => {
    setLayerConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], visible: !prev[key].visible }
    }));
  };

  const setLayerOpacity = (key: string, opacity: number) => {
    setLayerConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], opacity }
    }));
  };

  const handleShowAllLayers = () => {
    setLayerConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], visible: true }; });
      return next;
    });
  };

  const handleHideAllLayers = () => {
    setLayerConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], visible: false }; });
      return next;
    });
  };

  // Drawing Tool Mouse Event Handler
  const handleMapCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawToolMode === 'select' || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const percentX = Math.round((clickX / rect.width) * 100);
    const percentY = Math.round((clickY / rect.height) * 100);

    if (drawToolMode === 'polygon') {
      setDrawnPoints(prev => [...prev, { x: percentX, y: percentY }]);
    } else if (drawToolMode === 'rectangle') {
      if (drawnPoints.length === 0) {
        setDrawnPoints([{ x: percentX, y: percentY }]);
      } else {
        setDrawnPoints(prev => [prev[0], { x: percentX, y: percentY }]);
      }
    }
  };

  // Save Geofenced Area to Database
  const handleSaveGeofenceToFirestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geofenceForm.name.trim() || drawnPoints.length < 2) return;

    let x = 0, y = 0, width = 20, height = 20;
    if (drawToolMode === 'rectangle' && drawnPoints.length >= 2) {
      x = Math.min(drawnPoints[0].x, drawnPoints[1].x);
      y = Math.min(drawnPoints[0].y, drawnPoints[1].y);
      width = Math.abs(drawnPoints[1].x - drawnPoints[0].x) || 10;
      height = Math.abs(drawnPoints[1].y - drawnPoints[0].y) || 10;
    } else {
      const xs = drawnPoints.map(p => p.x);
      const ys = drawnPoints.map(p => p.y);
      x = Math.min(...xs);
      y = Math.min(...ys);
      width = (Math.max(...xs) - Math.min(...xs)) || 10;
      height = (Math.max(...ys) - Math.min(...ys)) || 10;
    }

    const geofenceId = `gf-${Date.now()}`;
    const newGeofenceDoc = {
      id: geofenceId,
      name: geofenceForm.name,
      category: (geofenceForm.category || "").toUpperCase(),
      hazardLevel: geofenceForm.hazardLevel,
      capacity: Number(geofenceForm.capacity),
      proximityAlertEnabled: geofenceForm.proximityAlertEnabled,
      bufferMeters: Number(geofenceForm.bufferMeters),
      x,
      y,
      width,
      height,
      polygonPoints: drawnPoints,
      siteId: activeProject,
      buildingId: selectedBuildingId,
      floorId: selectedFloorId,
      createdAt: new Date().toISOString()
    };

    const authHeaders = getAuthHeaders();
    try {
      await setDoc(doc(db, 'geofences', geofenceId), newGeofenceDoc);
      await fetch('/api/data/geofences', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newGeofenceDoc)
      });
      // Also register as a permanent zone in database
      const zoneId = `zone_${(geofenceForm.name || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
      await fetch('/api/data/zones', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: zoneId,
          zoneId,
          name: geofenceForm.name,
          category: (geofenceForm.category || "").toUpperCase(),
          hazardLevel: geofenceForm.hazardLevel,
          capacity: Number(geofenceForm.capacity),
          proximityAlertEnabled: geofenceForm.proximityAlertEnabled,
          siteId: activeProject,
          x,
          y,
          width,
          height,
          polygonPoints: drawnPoints
        })
      });
    } catch (err) {
      console.warn('Geofence database save warning:', err);
    }

    setCustomZones(prev => ({
      ...prev,
      [geofenceForm.name]: {
        x, y, width, height,
        category: (geofenceForm.category || "").toUpperCase(),
        hazardLevel: geofenceForm.hazardLevel,
        capacity: Number(geofenceForm.capacity),
        polygonPoints: drawnPoints,
        proximityAlertEnabled: geofenceForm.proximityAlertEnabled
      }
    }));

    setIsSavingGeofenceModalOpen(false);
    setDrawnPoints([]);
    setDrawToolMode('select');
    setSuccessMsg(`Geofence "${geofenceForm.name}" saved to database for proximity alerting!`);
    setTimeout(() => setSuccessMsg(null), 4500);
  };

  const handleSaveZonesFromEditor = async (
    updatedZones: Record<string, ZoneBounds>,
    newFloorplanUrl?: string | null,
    newSvgSource?: string | null
  ) => {
    setCustomZones(updatedZones);
    if (newFloorplanUrl !== undefined) setCustomFloorplan(newFloorplanUrl);
    if (newSvgSource !== undefined) setCustomSvgSource(newSvgSource);

    const authHeaders = getAuthHeaders();
    try {
      // Save all zones to the database with permanent zoneIds
      for (const [name, bounds] of Object.entries(updatedZones)) {
        const zoneId = `zone_${(name || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
        await fetch('/api/data/zones', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            id: zoneId,
            zoneId,
            name,
            siteId: activeProject,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            category: bounds.category || 'GENERAL',
            hazardLevel: bounds.hazardLevel || 'normal',
            capacity: bounds.capacity || 10,
            polygonPoints: bounds.polygonPoints,
            proximityAlertEnabled: bounds.proximityAlertEnabled
          })
        });
      }

      // Persist full map configuration to database
      await fetch('/api/data/map_configurations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: activeProject,
          siteId: activeProject,
          floorplanUrl: newFloorplanUrl || customFloorplan,
          svgSource: newSvgSource || customSvgSource,
          zones: updatedZones,
          updatedAt: new Date().toISOString()
        })
      });
    } catch (err) {
      console.warn('Failed to sync map editor changes to database:', err);
    }

    if (trackingCtx?.saveCustomZones) {
      trackingCtx.saveCustomZones(updatedZones, newFloorplanUrl, newSvgSource).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    window.dispatchEvent(new CustomEvent('gao_project_updated'));

    setIsMapEditorOpen(false);
    setSuccessMsg('Map vector zones & site configuration synchronized to database!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Marker Clustering Computation
  const clusteredGroups = useMemo(() => {
    if (!enableClustering) {
      return { clusters: [], singleWorkers: mapWorkers };
    }

    const radius = 8; // percentage radius on map
    const visitedWorkerIds = new Set<string>();
    const clusters: Array<{ id: string; x: number; y: number; workers: MapWorkerItem[] }> = [];
    const singleWorkers: MapWorkerItem[] = [];

    mapWorkers.forEach((w1, idx) => {
      if (visitedWorkerIds.has(w1.id)) return;

      const nearbyWorkers = mapWorkers.filter(w2 => {
        if (visitedWorkerIds.has(w2.id)) return false;
        const dist = Math.sqrt(Math.pow(w2.x - w1.x, 2) + Math.pow(w2.y - w1.y, 2));
        return dist <= radius;
      });

      if (nearbyWorkers.length > 1) {
        nearbyWorkers.forEach(w => visitedWorkerIds.add(w.id));
        const avgX = Math.round(nearbyWorkers.reduce((acc, w) => acc + w.x, 0) / nearbyWorkers.length);
        const avgY = Math.round(nearbyWorkers.reduce((acc, w) => acc + w.y, 0) / nearbyWorkers.length);
        clusters.push({
          id: `cluster-${idx}`,
          x: avgX,
          y: avgY,
          workers: nearbyWorkers
        });
      } else {
        visitedWorkerIds.add(w1.id);
        singleWorkers.push(w1);
      }
    });

    return { clusters, singleWorkers };
  }, [mapWorkers, enableClustering]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#38bdf8] text-xs font-black uppercase tracking-wider mb-1">
              <MapIcon size={16} /> Interactive Construction Site Map Engine
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              {currentSite.name}
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Real-time spatial tracking, interactive vector drawing, toggleable overlays, marker clustering, and Safety Status indicators mirrored directly from the Personnel registry.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsManageAssetsOpen(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition shadow-md"
            >
              <Box size={14} /> Manage Assets & Fleet
            </button>
            <button
              onClick={() => {
                setDrawToolMode('polygon');
                setDrawnPoints([]);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md ${
                drawToolMode === 'polygon' 
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300' 
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
              }`}
            >
              <PenTool size={14} /> Draw Geofence Polygon
            </button>
            <button
              onClick={() => setIsMapEditorOpen(true)}
              className="px-3.5 py-2 bg-[#007BC4] hover:bg-[#0062a0] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md"
            >
              <Edit3 size={14} /> Open Vector Zone Editor
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 rounded-xl flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2 text-xs font-bold">
            <ShieldCheck size={18} className="text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Map Control Toolbar & Overlays Switcher */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Toggleable Overlays */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">Overlays:</span>
          
          <button
            onClick={() => setShowDensityHeatmap(!showDensityHeatmap)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
              showDensityHeatmap 
                ? 'bg-orange-500/20 text-orange-400 border-orange-500' 
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            <Flame size={14} className={showDensityHeatmap ? 'text-orange-400 animate-pulse' : ''} />
            Worker Density Heatmap
          </button>

          <button
            onClick={() => setShowRestrictedZoneMarkers(!showRestrictedZoneMarkers)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
              showRestrictedZoneMarkers 
                ? 'bg-rose-500/20 text-rose-400 border-rose-500' 
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            <ShieldAlert size={14} className={showRestrictedZoneMarkers ? 'text-rose-400' : ''} />
            Restricted Zones Overlay
          </button>

          <button
            onClick={() => setEnableClustering(!enableClustering)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
              enableClustering 
                ? 'bg-sky-500/20 text-sky-400 border-sky-500' 
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            <Users size={14} className={enableClustering ? 'text-sky-400' : ''} />
            Marker Clustering {enableClustering ? '(ON)' : '(OFF)'}
          </button>
        </div>

        {/* Safety Status Color Key */}
        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex-wrap">
          <span className="text-slate-400 font-normal">Safety Status Badges:</span>
          <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Compliant</span>
          <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500" /> Refresher Due</span>
          <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" /> Non-Compliant / Overdue</span>
          <span className="flex items-center gap-1 text-sky-400"><span className="w-2 h-2 rounded-full bg-sky-500" /> Pending</span>
        </div>
      </div>

      {/* Main Grid: Left Navigation / Layers Sidebar & Center/Right Map Surface */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar Controls */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Building & Level</span>
              <span className="text-[10px] font-bold text-[#007BC4] bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">{currentFloor?.name}</span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Select Building</label>
              <select
                value={selectedBuildingId}
                onChange={e => {
                  setSelectedBuildingId(e.target.value);
                  const b = currentSite.buildings.find(b => b.id === e.target.value);
                  if (b && b.floors[0]) setSelectedFloorId(b.floors[0].id);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white"
              >
                {currentSite.buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Select Level / Floor</label>
              <div className="grid grid-cols-2 gap-1.5">
                {currentBuilding?.floors.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFloorId(f.id)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition ${
                      selectedFloorId === f.id 
                        ? 'bg-[#007BC4] text-white shadow-sm' 
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    Level {f.levelNumber}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Tabs */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
              <button
                onClick={() => setActiveSidebarTab('layers')}
                className={`py-1.5 text-[9px] font-extrabold rounded-lg transition ${activeSidebarTab === 'layers' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Layers
              </button>
              <button
                onClick={() => setActiveSidebarTab('zones')}
                className={`py-1.5 text-[9px] font-extrabold rounded-lg transition ${activeSidebarTab === 'zones' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Zones
              </button>
              <button
                onClick={() => setActiveSidebarTab('assets')}
                className={`py-1.5 text-[9px] font-extrabold rounded-lg transition ${activeSidebarTab === 'assets' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Assets
              </button>
              <button
                onClick={() => setActiveSidebarTab('inventory')}
                className={`py-1.5 text-[9px] font-extrabold rounded-lg transition ${activeSidebarTab === 'inventory' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Staff
              </button>
            </div>

            {activeSidebarTab === 'layers' && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                  <span>Toggle Map Layers</span>
                  <div className="flex items-center gap-1">
                    <button onClick={handleShowAllLayers} className="hover:text-sky-400">All</button>
                    <span>/</span>
                    <button onClick={handleHideAllLayers} className="hover:text-sky-400">None</button>
                  </div>
                </div>

                {Object.entries(layerConfigs).map(([key, conf]) => (
                  <div key={key} className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleLayerVisibility(key)}
                        className={`p-1.5 rounded-lg text-white transition ${conf.visible ? conf.color : 'bg-slate-300 dark:bg-slate-700'}`}
                      >
                        {conf.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <span className="text-xs font-bold text-slate-800 dark:text-white">{conf.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold">
                      {conf.count}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeSidebarTab === 'zones' && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">Active Geofences ({Object.keys(customZones).length})</span>
                  <button
                    onClick={() => {
                      setDrawToolMode('polygon');
                      setDrawnPoints([]);
                    }}
                    className="p-1 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/30 flex items-center gap-1"
                  >
                    <Plus size={12} /> Draw
                  </button>
                </div>

                {Object.entries(customZones).map(([zName, bounds]: [string, any]) => (
                  <div key={zName} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{zName}</span>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                        bounds.hazardLevel === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {bounds.hazardLevel || 'normal'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                      <span>{bounds.category || 'ZONE'}</span>
                      <span>Capacity: {bounds.capacity || 10}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeSidebarTab === 'assets' && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">Assets & Machinery ({assets.length + vehicles.length})</span>
                  <button
                    onClick={() => setIsManageAssetsOpen(true)}
                    className="p-1 bg-[#007BC4]/20 text-[#007BC4] dark:text-sky-300 rounded-lg text-[10px] font-bold hover:bg-[#007BC4]/30 flex items-center gap-1"
                  >
                    <Plus size={12} /> Manage
                  </button>
                </div>

                {assets.map(a => (
                  <div key={a.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench size={13} className="text-amber-500 shrink-0" />
                        <span className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{a.name}</span>
                      </div>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase">
                        {a.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                      <span>{a.category} • {a.location}</span>
                      <span>🔋 {a.battery}%</span>
                    </div>
                  </div>
                ))}

                {vehicles.map(v => (
                  <div key={v.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck size={13} className="text-sky-500 shrink-0" />
                        <span className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{v.name}</span>
                      </div>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 uppercase">
                        {v.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                      <span>{v.type} • {v.location}</span>
                      <span>⛽ {v.fuel}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeSidebarTab === 'inventory' && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                <span className="text-xs font-bold text-slate-800 dark:text-white">Active Site Personnel ({mapWorkers.length})</span>
                {mapWorkers.map(w => {
                  const badge = getSafetyStatusBadge(w.safetyStatus);
                  const BadgeIcon = badge.icon;
                  return (
                    <div 
                      key={w.id} 
                      onClick={() => setSelectedWorker(w)}
                      className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between cursor-pointer hover:border-[#007BC4] transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <HardHat size={14} className="text-slate-400 shrink-0" />
                        <div className="truncate">
                          <div className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{w.name}</div>
                          <div className="text-[9px] text-slate-400 truncate">{w.role} • {w.company}</div>
                        </div>
                      </div>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 ${badge.badgeClass}`}>
                        <BadgeIcon size={10} />
                        {badge.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right Column: Live Interactive Vector Map Display */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col h-[720px] relative overflow-hidden">
          {/* Map Top Action Controls */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2 z-20">
            <div>
              <span className="text-xs font-bold text-[#007BC4] uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} /> Digital Twin Vector Map Canvas
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                {currentSite.name} — {currentBuilding?.name} ({currentFloor?.name})
              </h3>
            </div>
            
            {/* Drawing Tool Controls Bar */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-1.5 rounded-xl">
              <button
                onClick={() => { setDrawToolMode('select'); setDrawnPoints([]); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                  drawToolMode === 'select' ? 'bg-[#007BC4] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Compass size={12} /> Pan/Select
              </button>
              <button
                onClick={() => { setDrawToolMode('polygon'); setDrawnPoints([]); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                  drawToolMode === 'polygon' ? 'bg-amber-500 text-slate-950 font-black' : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                <PenTool size={12} /> Draw Polygon
              </button>
              <button
                onClick={() => { setDrawToolMode('rectangle'); setDrawnPoints([]); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                  drawToolMode === 'rectangle' ? 'bg-amber-500 text-slate-950 font-black' : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                <Square size={12} /> Draw Box
              </button>

              {drawnPoints.length > 0 && (
                <>
                  <button
                    onClick={() => setDrawnPoints(prev => prev.slice(0, -1))}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold"
                  >
                    Undo Pt
                  </button>
                  <button
                    onClick={() => setDrawnPoints([])}
                    className="px-2 py-1 bg-rose-900/60 text-rose-300 rounded-lg text-[10px] font-bold hover:bg-rose-900"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setIsSavingGeofenceModalOpen(true)}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-[10px] flex items-center gap-1 shadow animate-pulse"
                  >
                    <Save size={12} /> Save Geofence ({drawnPoints.length} pts)
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Drawing Tool Helper Status Bar */}
          {drawToolMode !== 'select' && (
            <div className="mb-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl flex items-center justify-between z-20">
              <span className="flex items-center gap-1.5">
                <PenTool size={14} /> Click directly on the map surface to add geofence vertices. ({drawnPoints.length} points placed)
              </span>
              <button onClick={() => { setDrawToolMode('select'); setDrawnPoints([]); }} className="text-amber-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Map Canvas Surface */}
          <div 
            ref={mapRef}
            onClick={handleMapCanvasClick}
            className={`flex-1 relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 overflow-hidden shadow-inner select-none ${
              drawToolMode !== 'select' ? 'cursor-crosshair' : ''
            }`}
          >
            {/* SVG Source, Custom Blueprint, or Vector Blueprint Graphic */}
            {customSvgSource ? (
              <div 
                className="absolute inset-0 opacity-50 pointer-events-none overflow-hidden" 
                dangerouslySetInnerHTML={{ __html: customSvgSource }} 
              />
            ) : customFloorplan ? (
              <img src={customFloorplan} alt="Custom Blueprint" className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" />
            ) : (
              <img 
                src={getBlueprintSvg(activeProject, currentSite.name, currentSite.contractor, currentSite.dimensions)} 
                alt="Site Blueprint" 
                className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" 
              />
            )}

            {/* OVERLAY 1: Worker Density Heatmap */}
            {showDensityHeatmap && (
              <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden opacity-80 transition-opacity">
                <svg className="w-full h-full">
                  <defs>
                    <radialGradient id="heatGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                      <stop offset="35%" stopColor="#f59e0b" stopOpacity="0.6" />
                      <stop offset="70%" stopColor="#eab308" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {mapWorkers.map(w => (
                    <circle
                      key={`heat-${w.id}`}
                      cx={`${w.x}%`}
                      cy={`${w.y}%`}
                      r="50"
                      fill="url(#heatGlow)"
                      className="animate-pulse"
                    />
                  ))}
                </svg>
              </div>
            )}

            {/* OVERLAY 2: Interactive Geofenced Zones */}
            {Object.entries(customZones).map(([zName, bounds]: [string, any]) => {
              const isHazard = bounds.hazardLevel === 'critical';
              const isWarning = bounds.hazardLevel === 'warning';
              
              if (isHazard && !layerConfigs.restrictedZones?.visible) return null;
              if (isWarning && !layerConfigs.hazardZones?.visible) return null;

              let zoneColor = 'border-sky-500 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30';
              if (isHazard) zoneColor = 'border-rose-500 bg-rose-500/25 text-rose-300 hover:bg-rose-500/40';
              else if (isWarning) zoneColor = 'border-amber-500 bg-amber-500/20 text-amber-300 hover:bg-amber-500/35';

              const metrics = calculateZoneMetrics(zName, bounds);
              const isHovered = hoveredZoneName === zName;
              const isSelected = selectedZoneName === zName;

              return (
                <div
                  key={`map-zone-${zName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedZoneName(selectedZoneName === zName ? null : zName);
                  }}
                  onMouseEnter={() => setHoveredZoneName(zName)}
                  onMouseLeave={() => setHoveredZoneName(null)}
                  className={`absolute border-2 ${showRestrictedZoneMarkers && isHazard ? 'border-dashed border-rose-500 animate-pulse ring-2 ring-rose-500/30' : 'border-dashed'} rounded-xl p-2 flex flex-col justify-between cursor-pointer transition-all pointer-events-auto z-15 ${zoneColor} ${isSelected ? 'ring-2 ring-white border-solid shadow-2xl scale-[1.01] z-40' : ''}`}
                  style={{
                    left: `${bounds.x}%`,
                    top: `${bounds.y}%`,
                    width: `${bounds.width}%`,
                    height: `${bounds.height}%`,
                    transform: `rotate(${bounds.rotation || 0}deg)`
                  }}
                >
                  <div className="text-[10px] font-black uppercase tracking-wider truncate flex items-center justify-between">
                    <span className="flex items-center gap-1 drop-shadow">
                      {isHazard && <ShieldAlert size={12} className="text-rose-400" />}
                      {zName}
                    </span>
                    <div className="flex items-center gap-1">
                      {metrics.isOverCapacity && (
                        <span className="px-1 py-0.2 bg-rose-600 text-white text-[8px] font-black rounded animate-pulse">
                          OVERCAP
                        </span>
                      )}
                      {bounds.proximityAlertEnabled && (
                        <span className="px-1 py-0.5 bg-rose-950/90 text-rose-200 border border-rose-500/50 text-[8px] font-bold rounded flex items-center gap-0.5 shadow">
                          <BellRing size={8} className="animate-bounce" /> Alert On
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[8px] font-mono opacity-90 mt-auto flex justify-between items-center bg-slate-950/80 px-1.5 py-0.5 rounded backdrop-blur-sm border border-slate-800">
                    <span>{bounds.category || 'ZONE'}</span>
                    <span className={`font-extrabold ${metrics.isOverCapacity ? 'text-rose-400' : 'text-emerald-400'}`}>
                      Occ: {metrics.count} / {metrics.capacity}
                    </span>
                  </div>

                  {/* Interactive Geofence Tooltip Popover */}
                  {(isHovered || isSelected) && (
                    <div 
                      className="absolute left-1/2 -top-2 -translate-y-full -translate-x-1/2 z-50 w-64 bg-slate-900/95 border border-slate-700 text-white rounded-xl p-3 shadow-2xl backdrop-blur-md pointer-events-auto space-y-2 text-left animate-fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div>
                          <div className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                            <Box size={14} /> {zName}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono">{bounds.category || 'GEOFENCE ZONE'}</div>
                        </div>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                          isHazard ? 'bg-rose-500/20 text-rose-300 border-rose-500' : 'bg-amber-500/20 text-amber-300 border-amber-500'
                        }`}>
                          {bounds.hazardLevel || 'normal'}
                        </span>
                      </div>

                      {/* Occupancy Indicator Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-300">Live Zone Occupancy</span>
                          <span className={metrics.isOverCapacity ? 'text-rose-400 font-black' : 'text-emerald-400'}>
                            {metrics.count} / {metrics.capacity} Workers
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                          <div 
                            className={`h-full transition-all ${metrics.isOverCapacity ? 'bg-rose-500' : metrics.count / metrics.capacity > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (metrics.count / metrics.capacity) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Active Alerts List */}
                      <div className="space-y-1">
                        <div className="text-[9px] font-extrabold uppercase text-slate-400">Active Safety Alerts</div>
                        {metrics.alerts.length > 0 ? (
                          metrics.alerts.map((alt, idx) => (
                            <div key={idx} className="text-[10px] font-bold text-rose-300 bg-rose-950/60 border border-rose-800/80 p-1.5 rounded-lg flex items-center gap-1.5">
                              <ShieldAlert size={12} className="text-rose-400 shrink-0" />
                              <span>{alt}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 p-1.5 rounded-lg flex items-center gap-1.5">
                            <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
                            <span>No Active Safety Violations</span>
                          </div>
                        )}
                      </div>

                      {/* Occupants Preview */}
                      {metrics.workersInZone.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-slate-800">
                          <div className="text-[9px] font-extrabold uppercase text-slate-400">Personnel Inside ({metrics.workersInZone.length})</div>
                          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                            {metrics.workersInZone.map(w => {
                              const b = getSafetyStatusBadge(w.safetyStatus);
                              return (
                                <div key={w.id} className="text-[9px] bg-slate-800/80 p-1 rounded flex items-center justify-between border border-slate-700/60">
                                  <span className="font-bold text-white truncate max-w-[120px]">{w.name} ({w.role})</span>
                                  <span className={`text-[7px] font-black px-1 py-0.2 rounded ${b.badgeClass}`}>
                                    {b.shortLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="text-[8px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between items-center">
                        <span>Alerting: {bounds.proximityAlertEnabled ? 'ENABLED' : 'DISABLED'}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedZoneName(null); }}
                          className="text-amber-400 hover:text-white font-bold"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* LIVE DRAWING OVERLAY LAYER */}
            {drawnPoints.length > 0 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
                {drawToolMode === 'polygon' && (
                  <polygon
                    points={drawnPoints.map(p => `${p.x * 12},${p.y * 7.2}`).join(' ')}
                    fill="rgba(245, 158, 11, 0.25)"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeDasharray="6,4"
                  />
                )}
                {drawToolMode === 'rectangle' && drawnPoints.length >= 2 && (
                  <rect
                    x={`${Math.min(drawnPoints[0].x, drawnPoints[1].x)}%`}
                    y={`${Math.min(drawnPoints[0].y, drawnPoints[1].y)}%`}
                    width={`${Math.abs(drawnPoints[1].x - drawnPoints[0].x)}%`}
                    height={`${Math.abs(drawnPoints[1].y - drawnPoints[0].y)}%`}
                    fill="rgba(245, 158, 11, 0.25)"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeDasharray="6,4"
                  />
                )}
                {drawnPoints.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={`${pt.x}%`}
                    cy={`${pt.y}%`}
                    r="6"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                ))}
              </svg>
            )}

            {/* LAYER 3: Clustered Map Markers or Individual Workers */}
            {layerConfigs.workers?.visible && (
              <>
                {/* Clustered Marker Groups */}
                {clusteredGroups.clusters.map(cluster => {
                  const hasNonCompliant = cluster.workers.some(w => w.safetyStatus === 'NON_COMPLIANT' || w.safetyStatus === 'OVERDUE');
                  const hasDueSoon = cluster.workers.some(w => w.safetyStatus === 'DUE_SOON');

                  let borderColor = 'border-emerald-500 bg-emerald-950/90 text-emerald-200';
                  if (hasNonCompliant) {
                    borderColor = 'border-rose-500 bg-rose-950/95 text-rose-200 ring-4 ring-rose-500/40 animate-bounce';
                  } else if (hasDueSoon) {
                    borderColor = 'border-amber-500 bg-amber-950/95 text-amber-200 ring-4 ring-amber-500/20';
                  }

                  return (
                    <div
                      key={cluster.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCluster(cluster.workers);
                      }}
                      className={`absolute z-35 px-3 py-1.5 rounded-full shadow-xl border backdrop-blur-md flex items-center gap-2 cursor-pointer hover:scale-110 transition ${borderColor}`}
                      style={{ left: `${cluster.x}%`, top: `${cluster.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                      <Users size={14} className="text-white" />
                      <span className="text-xs font-black">{cluster.workers.length} Workers</span>
                      {hasNonCompliant && <ShieldAlert size={12} className="text-rose-400" />}
                    </div>
                  );
                })}

                {/* Single Workers with Personnel Safety Status Badges */}
                {clusteredGroups.singleWorkers.map(w => {
                  const badge = getSafetyStatusBadge(w.safetyStatus);
                  const BadgeIcon = badge.icon;
                  return (
                    <div
                      key={w.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWorker(w);
                      }}
                      className={`absolute z-30 px-2.5 py-1 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-1.5 cursor-pointer hover:scale-110 transition ${badge.pillBg}`}
                      style={{ left: `${w.x}%`, top: `${w.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                      <HardHat size={12} style={{ color: badge.color }} />
                      <span className="text-[10px] font-extrabold">{w.name}</span>
                      <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase flex items-center gap-0.5 ${badge.badgeClass}`}>
                        <BadgeIcon size={8} />
                        {badge.shortLabel}
                      </span>
                      {badge.ping && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute -top-1 -right-1" />
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Equipment Layer */}
            {layerConfigs.equipment?.visible && (
              <div>
                {assets.map(a => (
                  <div
                    key={a.id}
                    className="absolute z-20 p-1.5 rounded-lg shadow-md border bg-amber-950/90 text-amber-200 border-amber-600 flex items-center gap-1.5 cursor-pointer"
                    style={{ left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%, -50%)' }}
                  >
                    <Box size={12} className="text-amber-400" />
                    <span className="text-[9px] font-bold">{a.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Vehicles Layer */}
            {layerConfigs.vehicles?.visible && (
              <div>
                {vehicles.map(v => (
                  <div
                    key={v.id}
                    className="absolute z-25 p-1.5 rounded-xl shadow-lg border bg-orange-950/90 text-orange-200 border-orange-500 flex items-center gap-1.5 cursor-pointer"
                    style={{ left: `${v.x}%`, top: `${v.y}%`, transform: 'translate(-50%, -50%)' }}
                  >
                    <Truck size={13} className="text-orange-400" />
                    <span className="text-[9px] font-bold">{v.name} ({v.speed}km/h)</span>
                  </div>
                ))}
              </div>
            )}

            {/* Safety Items (Assembly Points, Fire Equipment) */}
            {layerConfigs.assemblyPoints?.visible && (
              <div
                className="absolute z-20 p-2 rounded-xl bg-emerald-900/80 border border-emerald-500 text-emerald-200 flex items-center gap-1.5"
                style={{ left: '5%', top: '10%' }}
              >
                <ShieldCheck size={14} className="text-emerald-400" />
                <span className="text-[10px] font-black">MUSTER POINT A</span>
              </div>
            )}

            {/* DYNAMIC MAP LEGEND OVERLAY COMPONENT */}
            <div className="absolute bottom-3 right-3 z-40 flex flex-col items-end">
              {showLegendOverlay ? (
                <div className="w-72 bg-slate-900/95 border border-slate-700/90 text-white rounded-2xl p-3.5 shadow-2xl backdrop-blur-md space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-extrabold text-[#38bdf8] flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <Info size={14} /> Interactive Map Legend
                    </span>
                    <button 
                      onClick={() => setShowLegendOverlay(false)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                      title="Minimize Legend"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* Section 1: Heatmap Density Colors */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                      <Flame size={12} className="text-orange-400" /> Density Heatmap Spectrum
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[9px] font-bold text-center">
                      <div className="bg-rose-950/80 border border-rose-500/80 text-rose-300 py-1 rounded">
                        High (&gt;5 workers)
                      </div>
                      <div className="bg-amber-950/80 border border-amber-500/80 text-amber-300 py-1 rounded">
                        Medium (2-4)
                      </div>
                      <div className="bg-blue-950/80 border border-blue-500/80 text-blue-300 py-1 rounded">
                        Low (1 worker)
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Marker Badges & Icons */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                      <HardHat size={12} className="text-amber-400" /> Personnel Safety Status Key
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded border border-emerald-500/50 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-bold truncate">Compliant Tag</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded border border-amber-500/50 text-amber-300">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="font-bold truncate">Refresher Due</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded border border-rose-500/50 text-rose-300">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                        <span className="font-bold truncate">Non-Compliant</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded border border-sky-500/50 text-sky-300">
                        <Users size={10} className="text-sky-400 shrink-0" />
                        <span className="font-bold truncate">Clustered Group</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Geofence Overlay Boundaries */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                      <Box size={12} className="text-sky-400" /> Geofenced Area Overlays
                    </div>
                    <div className="space-y-1 text-[9px]">
                      <div className="flex items-center justify-between bg-slate-800/60 p-1 rounded border-l-2 border-rose-500 text-rose-200">
                        <span className="font-bold flex items-center gap-1">
                          <ShieldAlert size={10} className="text-rose-400" /> Critical Hazard Zone
                        </span>
                        <span className="font-mono text-[8px] opacity-80">Red Dashed</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-800/60 p-1 rounded border-l-2 border-amber-500 text-amber-200">
                        <span className="font-bold flex items-center gap-1">
                          <AlertTriangle size={10} className="text-amber-400" /> Excavation / Caution
                        </span>
                        <span className="font-mono text-[8px] opacity-80">Amber Dashed</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-800/60 p-1 rounded border-l-2 border-rose-500 text-rose-300">
                        <span className="font-bold flex items-center gap-1">
                          <BellRing size={10} className="text-rose-400" /> Proximity Alert Armed
                        </span>
                        <span className="font-mono text-[8px] opacity-80">Siren & Pulsing</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowLegendOverlay(true)}
                  className="px-3 py-1.5 bg-slate-900/90 border border-slate-700 hover:border-sky-500 text-white rounded-xl text-xs font-bold shadow-xl flex items-center gap-1.5 backdrop-blur-md transition hover:scale-105"
                >
                  <Info size={14} className="text-[#38bdf8]" /> Show Map Legend
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: Save Geofenced Area Modal */}
      {isSavingGeofenceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2 text-amber-400">
                <PenTool size={18} /> Save Geofenced Area to Firestore
              </h3>
              <button onClick={() => setIsSavingGeofenceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveGeofenceToFirestore} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300">Geofence Zone Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. South Scaffold Exclusion Perimeter"
                  value={geofenceForm.name}
                  onChange={e => setGeofenceForm({ ...geofenceForm, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300">Zone Category</label>
                  <select
                    value={geofenceForm.category}
                    onChange={e => setGeofenceForm({ ...geofenceForm, category: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="EXCAVATION & SHORING">Excavation & Shoring</option>
                    <option value="CRANE SWING RADIUS">Crane Swing Radius</option>
                    <option value="SUBSTATION PERIMETER">Substation Perimeter</option>
                    <option value="RESTRICTED ZONE">Restricted Zone</option>
                    <option value="MUSTER POINT">Muster Point</option>
                    <option value="MATERIAL LAYDOWN">Material Laydown</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">Hazard Level</label>
                  <select
                    value={geofenceForm.hazardLevel}
                    onChange={e => setGeofenceForm({ ...geofenceForm, hazardLevel: e.target.value as any })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="normal">Normal</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical (Danger)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300">Max Capacity</label>
                  <input
                    type="number"
                    value={geofenceForm.capacity}
                    onChange={e => setGeofenceForm({ ...geofenceForm, capacity: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">Proximity Buffer (m)</label>
                  <input
                    type="number"
                    value={geofenceForm.bufferMeters}
                    onChange={e => setGeofenceForm({ ...geofenceForm, bufferMeters: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Proximity Alert Trigger</div>
                  <div className="text-[10px] text-slate-400">Trigger sirens if non-certified worker enters</div>
                </div>
                <input
                  type="checkbox"
                  checked={geofenceForm.proximityAlertEnabled}
                  onChange={e => setGeofenceForm({ ...geofenceForm, proximityAlertEnabled: e.target.checked })}
                  className="w-4 h-4 accent-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSavingGeofenceModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-slate-950 font-black rounded-xl text-xs hover:bg-amber-400 flex items-center gap-1.5"
                >
                  <Save size={14} /> Save Geofence to Firestore
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Cluster Detail Modal */}
      {selectedCluster && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2 text-sky-400">
                <Users size={18} /> Marker Cluster Details ({selectedCluster.length} Workers)
              </h3>
              <button onClick={() => setSelectedCluster(null)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {selectedCluster.map(w => {
                const badge = getSafetyStatusBadge(w.safetyStatus);
                const BadgeIcon = badge.icon;
                return (
                  <div key={w.id} className="p-3 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">{w.name}</div>
                      <div className="text-[10px] text-slate-400">{w.role} • {w.company}</div>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded flex items-center gap-1 ${badge.badgeClass}`}>
                      <BadgeIcon size={10} />
                      {badge.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedCluster(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Worker Detail Drawer */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HardHat size={20} className="text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold">{selectedWorker.name}</h3>
                  <p className="text-xs text-slate-400">{selectedWorker.role} • {selectedWorker.company}</p>
                </div>
              </div>
              <button onClick={() => setSelectedWorker(null)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Safety Status Badge</span>
                {(() => {
                  const badge = getSafetyStatusBadge(selectedWorker.safetyStatus);
                  const BadgeIcon = badge.icon;
                  return (
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${badge.badgeClass}`}>
                      <BadgeIcon size={14} />
                      {badge.label}
                    </span>
                  );
                })()}
              </div>

              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
                <div className="text-xs font-bold text-slate-300">Hardhat RFID Tag ID</div>
                <div className="text-sm font-mono text-emerald-400 font-bold">{selectedWorker.hardhatTagId || 'HH-1092'}</div>
              </div>

              {selectedWorker.certifications && (
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
                  <div className="text-xs font-bold text-slate-300">Safety Certifications</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedWorker.certifications.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-200 text-[10px] font-extrabold rounded-md">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedWorker(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Canvas Vector Editor Modal */}
      {isMapEditorOpen && (
        <MapEditorModal
          isOpen={isMapEditorOpen}
          onClose={() => setIsMapEditorOpen(false)}
          zones={customZones}
          floorplanUrl={customFloorplan}
          svgSource={customSvgSource}
          onSaveZones={handleSaveZonesFromEditor}
          siteName={currentSite.name}
          buildingName={currentBuilding?.name}
          floorName={currentFloor?.name}
        />
      )}

      {/* Hardware Config Modal */}
      {selectedDeviceForConfig && (
        <HardwareConfigModal
          device={selectedDeviceForConfig}
          isOpen={!!selectedDeviceForConfig}
          availableZones={Object.keys(customZones)}
          onClose={() => setSelectedDeviceForConfig(null)}
          onSave={(updated) => {
            setHardwareDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
            setSelectedDeviceForConfig(null);
            setSuccessMsg(`Hardware gateway "${updated.name}" updated!`);
            setTimeout(() => setSuccessMsg(null), 3000);
          }}
        />
      )}

      {/* Manage Assets & Machinery Modal */}
      {isManageAssetsOpen && (
        <ManageAssetsModal
          isOpen={isManageAssetsOpen}
          onClose={() => setIsManageAssetsOpen(false)}
          availableZones={Object.keys(customZones).length > 0 ? Object.keys(customZones) : ['Tower Core Structure', 'Excavation Shaft', 'Crane Swing Zone', 'Material Laydown']}
          assets={assets}
          vehicles={vehicles}
          cameras={cameras}
          sensors={envSensors}
          onSaveAsset={handleSaveAssetFromModal}
          onDeleteAsset={handleDeleteAssetFromModal}
        />
      )}
    </div>
  );
}
