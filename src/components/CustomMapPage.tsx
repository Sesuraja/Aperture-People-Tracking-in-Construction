import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Map as MapIcon, Plus, Trash2, Edit3, Save, Upload, Sliders, SlidersHorizontal, Radio, 
  Wrench, Truck, Camera, Thermometer, ShieldCheck, AlertTriangle, Box, Compass, RefreshCw, Check,
  Layers, MapPin, Eye, Settings, HelpCircle, HardHat, User, Building2, Layers3, History, FileCode,
  Sparkles, FileText, ChevronRight, RotateCw, Copy, ShieldAlert, ArrowRight, X, FolderPlus,
  Users, Lock, Unlock, EyeOff, Search, Filter, Flame, Zap, Navigation, Wifi,
  PenTool, Square, Circle, Clock, BellRing, Maximize2, Activity, Info, Database
} from 'lucide-react';
import HardwareConfigModal, { HardwareDevice } from './HardwareConfigModal';
import MapEditorModal, { ZoneBounds } from './MapEditorModal';
import ManageAssetsModal, { GenericAsset, AssetCategoryType } from './ManageAssetsModal';
import { INITIAL_DEVICES, getBlueprintSvg, InteractiveSiteMap } from './LiveFloorMap';
import { AssetItem, VehicleItem, CCTVCameraItem, EnvironmentalSensorItem, INITIAL_ASSETS, INITIAL_VEHICLES, INITIAL_INFRASTRUCTURE, INITIAL_CCTVS, INITIAL_ENV_SENSORS } from '../lib/trackingLayers';
import { doc, setDoc, deleteDoc, collection, onSnapshot, db } from '../lib/db';
import { useTracking, useTerminology } from '../context/TrackingContext';
import { safeStorage } from '../lib/safeStorage';
import { optimizeFloorMapFile } from '../lib/imageOptimizer';

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
  floorId?: string;
}

export const INITIAL_MAP_WORKERS: MapWorkerItem[] = [];

export const DEFAULT_LAYER_CONFIGS: Record<string, MapLayerConfig> = {
  workers: { id: 'workers', name: 'Personnel', category: 'personnel', visible: true, opacity: 1, locked: false, count: 0, iconName: 'User', color: 'bg-emerald-500 text-white' },
  visitors: { id: 'visitors', name: 'Visitors', category: 'personnel', visible: true, opacity: 1, locked: false, count: 0, iconName: 'Users', color: 'bg-blue-500 text-white' },
  contractors: { id: 'contractors', name: 'External Staff', category: 'personnel', visible: true, opacity: 1, locked: false, count: 0, iconName: 'Building2', color: 'bg-indigo-500 text-white' },
  equipment: { id: 'equipment', name: 'Equipment', category: 'equipment', visible: true, opacity: 1, locked: false, count: 0, iconName: 'Box', color: 'bg-amber-500 text-white' },
  vehicles: { id: 'vehicles', name: 'Vehicles', category: 'equipment', visible: true, opacity: 1, locked: false, count: 0, iconName: 'Truck', color: 'bg-orange-500 text-white' },
  rfidReaders: { id: 'rfidReaders', name: 'RFID Readers', category: 'infrastructure', visible: true, opacity: 0.9, locked: false, count: 0, iconName: 'Radio', color: 'bg-purple-500 text-white' },
  gpsDevices: { id: 'gpsDevices', name: 'GPS Devices', category: 'infrastructure', visible: true, opacity: 0.9, locked: false, count: 0, iconName: 'Navigation', color: 'bg-sky-500 text-white' },
  cctvCameras: { id: 'cctvCameras', name: 'CCTV Cameras', category: 'infrastructure', visible: true, opacity: 0.9, locked: false, count: 0, iconName: 'Camera', color: 'bg-teal-500 text-white' },
  hazardZones: { id: 'hazardZones', name: 'Hazard Zones', category: 'zones', visible: true, opacity: 0.8, locked: true, count: 0, iconName: 'AlertTriangle', color: 'bg-rose-500 text-white' },
  restrictedZones: { id: 'restrictedZones', name: 'Restricted Zones', category: 'zones', visible: true, opacity: 0.8, locked: true, count: 0, iconName: 'ShieldAlert', color: 'bg-red-600 text-white' },
  assemblyPoints: { id: 'assemblyPoints', name: 'Assembly Points', category: 'safety', visible: true, opacity: 1, locked: true, count: 0, iconName: 'ShieldCheck', color: 'bg-emerald-600 text-white' },
  fireEquipment: { id: 'fireEquipment', name: 'Fire Equipment', category: 'safety', visible: true, opacity: 1, locked: false, count: 0, iconName: 'Flame', color: 'bg-red-500 text-white' },
  firstAidStations: { id: 'firstAidStations', name: 'First Aid Stations', category: 'safety', visible: true, opacity: 1, locked: false, count: 0, iconName: 'Plus', color: 'bg-emerald-500 text-white' },
  emergencyRoutes: { id: 'emergencyRoutes', name: 'Emergency Routes', category: 'safety', visible: true, opacity: 0.85, locked: true, count: 0, iconName: 'ArrowUpRight', color: 'bg-green-500 text-white' },
  utilities: { id: 'utilities', name: 'Utilities', category: 'civil', visible: true, opacity: 0.8, locked: false, count: 0, iconName: 'Sliders', color: 'bg-yellow-500 text-white' },
  buildings: { id: 'buildings', name: 'Buildings', category: 'civil', visible: true, opacity: 0.95, locked: true, count: 0, iconName: 'Building2', color: 'bg-slate-600 text-white' },
  roads: { id: 'roads', name: 'Roads', category: 'civil', visible: true, opacity: 0.9, locked: true, count: 0, iconName: 'Compass', color: 'bg-stone-600 text-white' },
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
    name: 'Metro Corporate Commercial Complex',
    contractor: 'Enterprise Facility Management',
    dimensions: '200m x 150m (30,000 m²)',
    buildings: [
      {
        id: 'bldg-main',
        name: 'Building A - Main Operations Tower',
        floors: [
          {
            id: 'fl-1',
            name: 'Level 1 - Ground Access & Portal Gate',
            levelNumber: 1,
            activeVersionId: 'ver-1.0',
            versions: [
              {
                id: 'ver-1.0',
                versionNumber: 'v1.0',
                status: 'published',
                createdAt: '2026-08-01 09:00',
                author: 'Facility Operations Lead',
                notes: 'Initial approved facility security clearance map and RFID portal boundaries.',
                zones: {},
                floorplanUrl: null
              }
            ]
          },
          {
            id: 'fl-2',
            name: 'Level 2 - Operations & Engineering Wing',
            levelNumber: 2,
            activeVersionId: 'ver-1.0-l2',
            versions: [
              {
                id: 'ver-1.0-l2',
                versionNumber: 'v1.0',
                status: 'published',
                createdAt: '2026-08-02 11:30',
                author: 'Operations Director',
                notes: 'Level 2 facility operations and security perimeter layout.',
                zones: {},
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
            name: 'Ground Level - Fleet Staging & Parking',
            levelNumber: 1,
            activeVersionId: 'ver-1.0-b2',
            versions: [
              {
                id: 'ver-1.0-b2',
                versionNumber: 'v1.0',
                status: 'published',
                createdAt: '2026-08-03 14:00',
                author: 'G. Hopper (Fleet Manager)',
                notes: 'Fleet vehicle parking and equipment storage area.',
                zones: {},
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
  const { personnelSingular, personnelPlural, roleLabel, idBadgeLabel, safetyComplianceLabel, organizationType } = useTerminology();
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

  const currentSite = sites[activeProject] || sites['metro-tower'] || DEFAULT_SITES['metro-tower'] || {
    id: activeProject,
    name: trackingCtx?.industryConfig?.primarySiteName || 'Active Enterprise Facility',
    contractor: organizationType || 'Enterprise Operations',
    dimensions: '200m x 150m',
    buildings: [{ id: 'bldg-main', name: 'Main Complex', floors: [{ id: 'fl-1', name: 'Level 1 - Main Site', levelNumber: 1, activeVersionId: 'ver-1.0', versions: [{ id: 'ver-1.0', versionNumber: 'v1.0', status: 'published', createdAt: new Date().toISOString(), author: 'System', notes: 'Master map', zones: {}, floorplanUrl: null }] }] }]
  };
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(currentSite.buildings[0]?.id || 'bldg-main');
  const currentBuilding = currentSite.buildings.find(b => b.id === selectedBuildingId) || currentSite.buildings[0];
  const [selectedFloorId, setSelectedFloorId] = useState<string>('all');
  const currentFloor = selectedFloorId === 'all'
    ? (currentBuilding?.floors[0] || { id: 'all', name: 'All Floors', levelNumber: 0, versions: [] })
    : (currentBuilding?.floors.find(f => f.id === selectedFloorId) || currentBuilding?.floors[0]);

  const activeVersion = currentFloor?.versions?.find((v: any) => v.id === (currentFloor as any).activeVersionId) || currentFloor?.versions?.[0];

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [cameras, setCameras] = useState<CCTVCameraItem[]>([]);
  const [envSensors, setEnvSensors] = useState<EnvironmentalSensorItem[]>([]);
  const [hardwareDevices, setHardwareDevices] = useState<HardwareDevice[]>([]);
  const [mapWorkers, setMapWorkers] = useState<MapWorkerItem[]>([]);

  // Live real-time workers synchronized with TrackingContext and filtered by floor
  const activeWorkers: MapWorkerItem[] = useMemo(() => {
    let list = mapWorkers;
    if (trackingCtx?.people && trackingCtx.people.length > 0) {
      list = trackingCtx.people.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        company: (p as any).tradeCompany || (p as any).company || 'Facility Operations',
        x: p.x,
        y: p.y,
        safetyStatus: (p.ppeStatus === 'NON_COMPLIANT' ? 'NON_COMPLIANT' : 'COMPLIANT') as any,
        ppeStatus: p.ppeStatus || 'COMPLIANT',
        currentZone: p.currentZone || 'Main Facility Area',
        hardhatTagId: p.hardhatTagId || p.id,
        certifications: ['Facility Access Pass', 'Safety Clearance'],
        floorId: (p as any).floor || (p as any).floorId || 'fl-1'
      }));
    }

    if (selectedFloorId === 'all') {
      return list;
    }
    return list.filter(w => {
      if (!w.floorId) return true;
      const fNum = selectedFloorId.replace(/[^0-9]/g, '');
      const wFloor = (w.floorId || '').toLowerCase();
      return wFloor === selectedFloorId || wFloor.includes(`floor ${fNum}`) || wFloor.includes(`level ${fNum}`) || wFloor.includes(`l${fNum}`);
    });
  }, [mapWorkers, trackingCtx?.people, selectedFloorId]);

  const [customFloorplan, setCustomFloorplan] = useState<string | null>(() => {
    return trackingCtx?.customFloorplan || (typeof window !== 'undefined' ? localStorage.getItem('gao_custom_floorplan') : null) || activeVersion?.floorplanUrl || null;
  });
  const [customSvgSource, setCustomSvgSource] = useState<string | null>(() => {
    return trackingCtx?.customSvgSource || (typeof window !== 'undefined' ? localStorage.getItem('gao_custom_svg') : null) || activeVersion?.svgSource || null;
  });
  const [customZones, setCustomZones] = useState<Record<string, ZoneBounds>>(() => {
    if (trackingCtx?.zonesDict && Object.keys(trackingCtx.zonesDict).length > 0) return trackingCtx.zonesDict;
    return activeVersion?.zones || {};
  });

  useEffect(() => {
    if (trackingCtx?.customFloorplan && trackingCtx.customFloorplan !== customFloorplan) {
      setCustomFloorplan(trackingCtx.customFloorplan);
    }
    if (trackingCtx?.customSvgSource && trackingCtx.customSvgSource !== customSvgSource) {
      setCustomSvgSource(trackingCtx.customSvgSource);
    }
  }, [trackingCtx?.customFloorplan, trackingCtx?.customSvgSource]);

  const [activeSidebarTab, setActiveSidebarTab] = useState<'layers' | 'readers' | 'inventory' | 'assets' | 'zones' | 'sites'>('layers');
  const [layerConfigs, setLayerConfigs] = useState<Record<string, MapLayerConfig>>(DEFAULT_LAYER_CONFIGS);
  const [mapSearchQuery, setMapSearchQuery] = useState('');

  // Dynamically compute exact layer counts based on active live state
  const dynamicLayerConfigs = useMemo(() => {
    return {
      ...layerConfigs,
      workers: { ...layerConfigs.workers, name: personnelPlural, count: activeWorkers.length },
      visitors: { ...layerConfigs.visitors, count: activeWorkers.filter(w => (w.role || '').toLowerCase().includes('visitor') || (w.name || '').toLowerCase().includes('visitor')).length },
      contractors: { ...layerConfigs.contractors, name: `External ${organizationType}`, count: activeWorkers.filter(w => (w.role || '').toLowerCase().includes('contractor') || (w.company || '').toLowerCase().includes('contractor')).length },
      equipment: { ...layerConfigs.equipment, count: assets.length },
      vehicles: { ...layerConfigs.vehicles, count: vehicles.length },
      rfidReaders: { ...layerConfigs.rfidReaders, count: hardwareDevices.length },
      gpsDevices: { ...layerConfigs.gpsDevices, name: `${idBadgeLabel}s`, count: activeWorkers.filter(w => w.hardhatTagId).length },
      cctvCameras: { ...layerConfigs.cctvCameras, count: cameras.length },
      hazardZones: { ...layerConfigs.hazardZones, count: Object.values(customZones).filter(z => z.hazardLevel === 'critical').length },
      restrictedZones: { ...layerConfigs.restrictedZones, count: Object.values(customZones).filter(z => z.hazardLevel === 'warning' || (z.category || '').includes('RESTRICTED')).length },
      assemblyPoints: { ...layerConfigs.assemblyPoints, count: Object.values(customZones).filter(z => (z.category || '').includes('MUSTER') || (z.category || '').includes('ASSEMBLY')).length },
      fireEquipment: { ...layerConfigs.fireEquipment, count: 0 },
      firstAidStations: { ...layerConfigs.firstAidStations, count: 0 },
      emergencyRoutes: { ...layerConfigs.emergencyRoutes, count: 0 },
      utilities: { ...layerConfigs.utilities, count: 0 },
      buildings: { ...layerConfigs.buildings, count: currentSite.buildings.length },
      roads: { ...layerConfigs.roads, count: 0 },
    };
  }, [layerConfigs, activeWorkers, assets, vehicles, hardwareDevices, cameras, customZones, currentSite, personnelPlural, organizationType, idBadgeLabel]);

  // Overlays State
  const [showDensityHeatmap, setShowDensityHeatmap] = useState(false);
  const [showRestrictedZoneMarkers, setShowRestrictedZoneMarkers] = useState(true);
  const [showProximityAuras, setShowProximityAuras] = useState(true);

  // Clustering State
  const [enableClustering, setEnableClustering] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<MapWorkerItem[] | null>(null);

  // Selected Worker Modal / Detail Drawer
  const [selectedWorker, setSelectedWorker] = useState<MapWorkerItem | null>(null);

  // Geofence & Reader Drawing / Placement Tool Mode
  const [drawToolMode, setDrawToolMode] = useState<'select' | 'place_reader' | 'polygon' | 'rectangle'>('select');
  const [drawnPoints, setDrawnPoints] = useState<{ x: number; y: number }[]>([]);
  const [isSavingGeofenceModalOpen, setIsSavingGeofenceModalOpen] = useState(false);
  const [isManageAssetsOpen, setIsManageAssetsOpen] = useState(false);
  const [isNewDeviceModal, setIsNewDeviceModal] = useState(false);
  
  // Interactive Map Dragging & Coordinates State
  const [draggingDeviceId, setDraggingDeviceId] = useState<string | null>(null);
  const [hoveredDeviceId, setHoveredDeviceId] = useState<string | null>(null);
  const [cursorMapCoords, setCursorMapCoords] = useState<{ x: number; y: number } | null>(null);

  const [geofenceForm, setGeofenceForm] = useState({
    name: '',
    category: 'RESTRICTED ACCESS ZONE',
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
  const floorFileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Zone Occupancy & Alert Calculation Helper
  const calculateZoneMetrics = (zName: string, bounds: ZoneBounds) => {
    const workersInZone = activeWorkers.filter(w => 
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

  // Real-time Database sync for Zones, Geofences, Assets, Personnel, and RFID Readers
  useEffect(() => {
    const fetchDatabaseZones = async () => {
      try {
        const authHeaders = getAuthHeaders();
        const [
          zonesRes, 
          mapRes, 
          peopleRes,
          registeredRes,
          assetsRes, 
          vehiclesRes, 
          camerasRes, 
          sensorsRes,
          devicesRes,
          readersRes,
          sitesRes
        ] = await Promise.allSettled([
          fetch('/api/data/zones', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch(`/api/data/map_configurations/${activeProject}`, { headers: authHeaders }).then(r => r.ok ? r.json() : null),
          fetch('/api/data/people', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/registered_people', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/assets', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/vehicles', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/cameras', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/sensors', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/devices', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/hardware_readers', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/sites', { headers: authHeaders }).then(r => r.ok ? r.json() : [])
        ]);

        if (zonesRes.status === 'fulfilled' && Array.isArray(zonesRes.value)) {
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
          setCustomZones(loadedZones);
        }

        if (mapRes.status === 'fulfilled' && mapRes.value) {
          if (mapRes.value.floorplanUrl) setCustomFloorplan(mapRes.value.floorplanUrl);
          if (mapRes.value.svgSource) setCustomSvgSource(mapRes.value.svgSource);
          if (mapRes.value.zones && typeof mapRes.value.zones === 'object' && Object.keys(mapRes.value.zones).length > 0) {
            setCustomZones(mapRes.value.zones);
          }
        }

        if (sitesRes.status === 'fulfilled' && Array.isArray(sitesRes.value) && sitesRes.value.length > 0) {
          const siteMap: Record<string, SiteData> = {};
          sitesRes.value.forEach((s: any) => {
            if (s && s.id) siteMap[s.id] = s;
          });
          setSites(prev => ({ ...prev, ...siteMap }));
        }

        const rawPeople = [
          ...(peopleRes.status === 'fulfilled' && Array.isArray(peopleRes.value) ? peopleRes.value : []),
          ...(registeredRes.status === 'fulfilled' && Array.isArray(registeredRes.value) ? registeredRes.value : [])
        ];

        if (rawPeople.length > 0) {
          const uniquePeopleMap = new Map<string, any>();
          rawPeople.forEach(p => {
            if (p && p.id && !uniquePeopleMap.has(p.id)) {
              uniquePeopleMap.set(p.id, p);
            }
          });

          const mappedWorkers: MapWorkerItem[] = Array.from(uniquePeopleMap.values()).map((p: any, idx: number) => ({
            id: p.id || `P-${idx + 101}`,
            name: p.name || `${personnelSingular} ${idx + 1}`,
            role: p.role || roleLabel || 'Staff',
            company: p.company || p.tradeCompany || organizationType || 'Operations',
            x: typeof p.x === 'number' ? p.x : 20 + ((idx * 15) % 65),
            y: typeof p.y === 'number' ? p.y : 20 + ((idx * 19) % 60),
            safetyStatus: p.safetyStatus || (p.ppeStatus === 'NON_COMPLIANT' ? 'NON_COMPLIANT' : 'COMPLIANT'),
            ppeStatus: p.ppeStatus || 'COMPLIANT',
            currentZone: p.currentZone || p.location || 'General Facility',
            hardhatTagId: p.hardhatTagId || p.tagId || (p.id?.length > 10 ? p.id : ''),
            certifications: p.certifications || ['Facility Access Pass', 'Safety Clearance']
          }));
          setMapWorkers(mappedWorkers);
        } else {
          setMapWorkers([]);
        }

        if (assetsRes.status === 'fulfilled' && Array.isArray(assetsRes.value)) {
          setAssets(assetsRes.value);
        }

        if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value)) {
          setVehicles(vehiclesRes.value);
        }

        if (camerasRes.status === 'fulfilled' && Array.isArray(camerasRes.value)) {
          setCameras(camerasRes.value);
        }

        if (sensorsRes.status === 'fulfilled' && Array.isArray(sensorsRes.value)) {
          setEnvSensors(sensorsRes.value);
        }

        // Combine hardware devices & RFID readers from MongoDB
        const rawReaders = [
          ...(readersRes.status === 'fulfilled' && Array.isArray(readersRes.value) ? readersRes.value : []),
          ...(devicesRes.status === 'fulfilled' && Array.isArray(devicesRes.value) ? devicesRes.value : [])
        ];

        const loadedDevices: HardwareDevice[] = [];
        const seenReaderIds = new Set<string>();

        rawReaders.forEach((r: any) => {
          const id = r.id || r.readerId;
          if (!id || seenReaderIds.has(id)) return;
          seenReaderIds.add(id);

          loadedDevices.push({
            id,
            name: r.name || `UHF Reader ${id}`,
            macAddress: r.macAddress || `00:1A:79:${id.slice(-4)}`,
            ipAddress: r.ipAddress || '192.168.1.100',
            port: Number(r.port) || 8080,
            x: typeof r.x === 'number' ? r.x : 50,
            y: typeof r.y === 'number' ? r.y : 50,
            zone: r.zone || r.location || r.zoneId || 'Main Entrance',
            type: r.type || r.model || 'UHF Fixed Reader',
            orientation: r.orientation || 'horizontal',
            powerDbm: Number(r.powerDbm) || 30,
            antennaGainDbi: Number(r.antennaGainDbi) || 9,
            frequencyBand: r.frequencyBand || 'US 902-928 MHz UHF',
            scanIntervalMs: Number(r.scanIntervalMs) || 250,
            rssiThreshold: Number(r.rssiThreshold) || 70,
            status: (r.status === 'online' || r.status === 'ONLINE' || r.status === 'Online') ? 'Online' : (r.status === 'maintenance' || r.status === 'Maintenance') ? 'Maintenance' : 'Offline',
            alertsEnabled: r.alertsEnabled || {
              unauthorizedAccess: true,
              ppeViolation: true,
              loiteringDwell: false
            }
          });
        });

        setHardwareDevices(loadedDevices);
      } catch (err) {
        console.warn('Failed to load database items in CustomMapPage:', err);
      }
    };

    fetchDatabaseZones();

    try {
      const unsubMapConfig = onSnapshot(doc(db, 'map_configurations', activeProject), (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          if (d.floorplanUrl) setCustomFloorplan(d.floorplanUrl);
          if (d.svgSource) setCustomSvgSource(d.svgSource);
          if (d.zones && typeof d.zones === 'object') {
            setCustomZones(d.zones);
          }
        }
      });

      const unsubReaders = onSnapshot(collection(db, 'hardware_readers'), (snap) => {
        if (!snap.empty) {
          const rList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setHardwareDevices(prev => {
            const devMap = new Map(prev.map(item => [item.id, item]));
            rList.forEach((r: any) => {
              const id = r.id || r.readerId;
              if (id) {
                devMap.set(id, {
                  ...devMap.get(id),
                  id,
                  name: r.name || id,
                  x: typeof r.x === 'number' ? r.x : (devMap.get(id)?.x ?? 50),
                  y: typeof r.y === 'number' ? r.y : (devMap.get(id)?.y ?? 50),
                  zone: r.zone || r.location || devMap.get(id)?.zone || 'Main Entrance',
                  status: (r.status === 'ONLINE' || r.status === 'Online') ? 'Online' : 'Offline',
                  powerDbm: r.powerDbm || devMap.get(id)?.powerDbm || 30,
                  antennaGainDbi: r.antennaGainDbi || devMap.get(id)?.antennaGainDbi || 9,
                  ipAddress: r.ipAddress || devMap.get(id)?.ipAddress || '192.168.1.100',
                  port: r.port || devMap.get(id)?.port || 8080,
                  macAddress: r.macAddress || devMap.get(id)?.macAddress || '00:1A:79:00',
                  type: r.type || r.model || 'UHF Fixed Reader',
                  orientation: r.orientation || 'horizontal',
                  frequencyBand: r.frequencyBand || 'US 902-928 MHz UHF',
                  scanIntervalMs: r.scanIntervalMs || 250,
                  rssiThreshold: r.rssiThreshold || 70,
                  alertsEnabled: r.alertsEnabled || { unauthorizedAccess: true, ppeViolation: true, loiteringDwell: false }
                });
              }
            });
            return Array.from(devMap.values());
          });
        }
      });

      return () => {
        unsubMapConfig();
        unsubReaders();
      };
    } catch (err) {
      console.warn('MongoDB listeners setup warning:', err);
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
          category: (item.type as any) || 'Equipment',
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
          type: (item.type as any) || 'Fleet Vehicle',
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
          category: (item.type as any) || 'Equipment',
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
          type: (item.type as any) || 'Fleet Vehicle',
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

  // Drawing Tool & Reader Placement Mouse Event Handlers
  const handleMapCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawToolMode === 'select' || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const percentX = Math.max(1, Math.min(99, Math.round((clickX / rect.width) * 100)));
    const percentY = Math.max(1, Math.min(99, Math.round((clickY / rect.height) * 100)));

    if (drawToolMode === 'place_reader') {
      const newDevId = `rdr_${Date.now()}`;
      const firstZone = Object.keys(customZones)[0] || 'Main Portal Gate';
      const newDevice: HardwareDevice = {
        id: newDevId,
        name: `UHF Portal Reader ${hardwareDevices.length + 1}`,
        macAddress: `00:1A:79:${Math.floor(Math.random()*89+10)}:${Math.floor(Math.random()*89+10)}:${Math.floor(Math.random()*89+10)}`,
        ipAddress: `192.168.1.${100 + hardwareDevices.length + 1}`,
        port: 8080,
        x: percentX,
        y: percentY,
        zone: firstZone,
        type: 'UHF Fixed Portal',
        orientation: 'horizontal',
        powerDbm: 30,
        antennaGainDbi: 9,
        frequencyBand: 'US 902-928 MHz UHF',
        scanIntervalMs: 250,
        rssiThreshold: 70,
        status: 'Online',
        alertsEnabled: {
          unauthorizedAccess: true,
          ppeViolation: true,
          loiteringDwell: false
        }
      };

      setHardwareDevices(prev => [...prev, newDevice]);
      setSelectedDeviceForConfig(newDevice);
      setIsNewDeviceModal(true);

      const authHeaders = getAuthHeaders();
      const readerDoc = {
        id: newDevId,
        readerId: newDevId,
        name: newDevice.name,
        location: newDevice.zone,
        zone: newDevice.zone,
        zoneId: newDevice.zone,
        x: percentX,
        y: percentY,
        range: 15,
        powerDbm: 30,
        antennaGainDbi: 9,
        status: 'ONLINE',
        ipAddress: newDevice.ipAddress,
        port: newDevice.port,
        macAddress: newDevice.macAddress,
        type: newDevice.type,
        orientation: newDevice.orientation,
        frequencyBand: newDevice.frequencyBand,
        scanIntervalMs: newDevice.scanIntervalMs,
        rssiThreshold: newDevice.rssiThreshold,
        updatedAt: new Date().toISOString()
      };

      fetch('/api/data/hardware_readers', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(readerDoc)
      }).catch(err => console.warn('Reader save note:', err));

      fetch('/api/data/devices', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newDevice)
      }).catch(err => console.warn('Device save note:', err));

      setDoc(doc(db, 'hardware_readers', newDevId), readerDoc).catch(() => {});

      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
      setSuccessMsg(`RFID Reader placed at (${percentX}%, ${percentY}%) and saved to MongoDB!`);
      setTimeout(() => setSuccessMsg(null), 3500);
      return;
    }

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

  const handleMapMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const percentX = Math.max(1, Math.min(99, Math.round((clickX / rect.width) * 100)));
    const percentY = Math.max(1, Math.min(99, Math.round((clickY / rect.height) * 100)));
    setCursorMapCoords({ x: percentX, y: percentY });

    if (draggingDeviceId) {
      setHardwareDevices(prev => prev.map(d => {
        if (d.id === draggingDeviceId) {
          return { ...d, x: percentX, y: percentY };
        }
        return d;
      }));
    }
  };

  const handleMapMouseUp = () => {
    if (draggingDeviceId) {
      const movedDev = hardwareDevices.find(d => d.id === draggingDeviceId);
      if (movedDev) {
        const authHeaders = getAuthHeaders();
        fetch('/api/data/hardware_readers', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            id: movedDev.id,
            readerId: movedDev.id,
            name: movedDev.name,
            location: movedDev.zone,
            zone: movedDev.zone,
            x: movedDev.x,
            y: movedDev.y,
            powerDbm: movedDev.powerDbm,
            status: movedDev.status === 'Online' ? 'ONLINE' : 'OFFLINE',
            updatedAt: new Date().toISOString()
          })
        }).catch(() => {});

        fetch('/api/data/devices', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(movedDev)
        }).catch(() => {});

        setDoc(doc(db, 'hardware_readers', movedDev.id), {
          id: movedDev.id,
          x: movedDev.x,
          y: movedDev.y,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});

        window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
        setSuccessMsg(`Reader "${movedDev.name}" moved to (${movedDev.x}%, ${movedDev.y}%) and saved!`);
        setTimeout(() => setSuccessMsg(null), 2500);
      }
      setDraggingDeviceId(null);
    }
  };

  const handleSaveReaderFromConfig = async (updated: HardwareDevice) => {
    setHardwareDevices(prev => {
      const idx = prev.findIndex(d => d.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });

    const authHeaders = getAuthHeaders();
    const readerDoc = {
      id: updated.id,
      readerId: updated.id,
      name: updated.name,
      location: updated.zone,
      zone: updated.zone,
      zoneId: updated.zone,
      x: updated.x,
      y: updated.y,
      powerDbm: updated.powerDbm,
      antennaGainDbi: updated.antennaGainDbi,
      status: updated.status === 'Online' ? 'ONLINE' : updated.status === 'Maintenance' ? 'MAINTENANCE' : 'OFFLINE',
      ipAddress: updated.ipAddress,
      port: updated.port,
      macAddress: updated.macAddress,
      type: updated.type,
      orientation: updated.orientation,
      frequencyBand: updated.frequencyBand,
      scanIntervalMs: updated.scanIntervalMs,
      rssiThreshold: updated.rssiThreshold,
      alertsEnabled: updated.alertsEnabled,
      updatedAt: new Date().toISOString()
    };

    try {
      await fetch('/api/data/hardware_readers', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(readerDoc)
      });
      await fetch('/api/data/devices', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(updated)
      });
      await setDoc(doc(db, 'hardware_readers', updated.id), readerDoc, { merge: true });
    } catch (err) {
      console.warn('Reader save error:', err);
    }

    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    window.dispatchEvent(new CustomEvent('gao_project_updated'));
    setSelectedDeviceForConfig(null);
    setIsNewDeviceModal(false);
    setSuccessMsg(`Reader "${updated.name}" coordinates & hardware config saved to MongoDB!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDeleteReader = async (deviceId: string) => {
    setHardwareDevices(prev => prev.filter(d => d.id !== deviceId));
    const authHeaders = getAuthHeaders();
    try {
      await fetch(`/api/data/hardware_readers/${deviceId}`, { method: 'DELETE', headers: authHeaders });
      await fetch(`/api/data/devices/${deviceId}`, { method: 'DELETE', headers: authHeaders });
      await deleteDoc(doc(db, 'hardware_readers', deviceId)).catch(() => {});
      await deleteDoc(doc(db, 'devices', deviceId)).catch(() => {});
    } catch (err) {
      console.warn('Reader delete error:', err);
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    window.dispatchEvent(new CustomEvent('gao_project_updated'));
    setSelectedDeviceForConfig(null);
    setSuccessMsg(`Reader "${deviceId}" deleted from MongoDB.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Save Geofenced Area to Database
  const handleSaveGeofenceToMongoDB = async (e: React.FormEvent) => {
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

    const updatedZones: Record<string, ZoneBounds> = {
      ...customZones,
      [geofenceForm.name]: {
        x, y, width, height,
        category: (geofenceForm.category || "").toUpperCase(),
        hazardLevel: geofenceForm.hazardLevel,
        capacity: Number(geofenceForm.capacity),
        polygonPoints: drawnPoints,
        proximityAlertEnabled: geofenceForm.proximityAlertEnabled
      }
    };

    setCustomZones(updatedZones);

    if (trackingCtx?.saveCustomZones) {
      trackingCtx.saveCustomZones(updatedZones, customFloorplan, customSvgSource).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    window.dispatchEvent(new CustomEvent('gao_project_updated'));

    setIsSavingGeofenceModalOpen(false);
    setDrawnPoints([]);
    setDrawToolMode('select');
    setSuccessMsg(`Geofence "${geofenceForm.name}" saved and synchronized to Live Tracking map!`);
    setTimeout(() => setSuccessMsg(null), 4500);
  };

  const handleDeleteZone = async (zName: string) => {
    const nextZones = { ...customZones };
    delete nextZones[zName];
    setCustomZones(nextZones);

    const zoneId = `zone_${(zName || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    try {
      const authHeaders = getAuthHeaders();
      await fetch(`/api/data/zones/${zoneId}`, { method: 'DELETE', headers: authHeaders });
      await fetch(`/api/data/zones/${zName}`, { method: 'DELETE', headers: authHeaders });
      await fetch(`/api/data/geofences/${zoneId}`, { method: 'DELETE', headers: authHeaders });
      await fetch(`/api/data/geofences/${zName}`, { method: 'DELETE', headers: authHeaders });

      // Update map_configurations in MongoDB so the removed zone is completely purged
      await fetch('/api/data/map_configurations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: activeProject,
          siteId: activeProject,
          floorplanUrl: customFloorplan,
          svgSource: customSvgSource,
          zones: nextZones,
          updatedAt: new Date().toISOString()
        })
      });
    } catch (err) {
      console.warn('Zone deletion warning:', err);
    }

    if (trackingCtx?.deleteZone) {
      trackingCtx.deleteZone(zoneId);
    }
    if (trackingCtx?.saveCustomZones) {
      trackingCtx.saveCustomZones(nextZones, customFloorplan, customSvgSource).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    window.dispatchEvent(new CustomEvent('gao_project_updated'));
    setSuccessMsg(`Zone "${zName}" completely deleted from database & Live Tracking!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const [isUploadingFloorplan, setIsUploadingFloorplan] = useState(false);

  const handleFloorMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFloorplan(true);
    try {
      const optimized = await optimizeFloorMapFile(file);
      const isSvg = optimized.isSvg;

      const newFloorplanUrl = isSvg ? null : optimized.dataUrl;
      const newSvgSource = isSvg ? optimized.dataUrl : null;

      // Immediately update local UI state for instant response (0ms perceived latency)
      setCustomFloorplan(newFloorplanUrl);
      setCustomSvgSource(newSvgSource);

      const mapConfigPayload = {
        id: activeProject,
        siteId: activeProject,
        floorplanUrl: newFloorplanUrl,
        svgSource: newSvgSource,
        zones: customZones,
        updatedAt: new Date().toISOString()
      };

      const authHeaders = getAuthHeaders();

      // 1. Persist map configurations to backend MongoDB
      await Promise.allSettled([
        fetch('/api/data/map_configurations', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(mapConfigPayload)
        }),
        fetch(`/api/data/map_configurations/${activeProject}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(mapConfigPayload)
        }),
        fetch('/api/data/floorplans', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            id: `fp_${activeProject}`,
            siteId: activeProject,
            floorId: selectedFloorId,
            url: newFloorplanUrl || newSvgSource,
            name: file.name,
            updatedAt: new Date().toISOString()
          })
        }),
        setDoc(doc(db, 'map_configurations', activeProject), mapConfigPayload, { merge: true })
      ]);

      // 2. Safe local caching without quota exceptions
      try {
        if (newFloorplanUrl) safeStorage.setItem('gao_custom_floorplan', newFloorplanUrl);
        else safeStorage.removeItem('gao_custom_floorplan');
        if (newSvgSource) safeStorage.setItem('gao_custom_svg', newSvgSource);
        else safeStorage.removeItem('gao_custom_svg');

        const savedProps = JSON.parse(safeStorage.getItem('gao_project_properties') || '{}');
        savedProps[activeProject] = {
          ...(savedProps[activeProject] || {}),
          floorplanUrl: newFloorplanUrl,
          svgSource: newSvgSource,
          customZones
        };
        safeStorage.setItem('gao_project_properties', JSON.stringify(savedProps));
      } catch {}

      // 3. Propagate to Live Tracking Context
      if (trackingCtx?.saveCustomZones) {
        trackingCtx.saveCustomZones(customZones, newFloorplanUrl, newSvgSource).catch(() => {});
      }
      if (trackingCtx?.setCustomFloorplan) {
        trackingCtx.setCustomFloorplan(newFloorplanUrl);
      }

      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
      window.dispatchEvent(new CustomEvent('gao_project_updated'));

      const sizeKb = (optimized.optimizedSize / 1024).toFixed(0);
      setSuccessMsg(`Floor Map Blueprint optimized (${sizeKb} KB) & synchronized to MongoDB Atlas!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to optimize and upload floor map:', err);
      setSuccessMsg(`Upload error: ${err.message || 'Could not process map image'}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } finally {
      setIsUploadingFloorplan(false);
      if (floorFileInputRef.current) {
        floorFileInputRef.current.value = '';
      }
    }
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
      // 1. Delete removed zones from the database API & MongoDB Atlas MongoDB
      const previousZoneNames = Array.from(new Set([
        ...Object.keys(customZones || {}),
        ...(trackingCtx?.zones || []).map(z => z.name),
        ...Object.keys(trackingCtx?.zonesDict || {})
      ]));
      const deletedZoneNames = previousZoneNames.filter(zName => !(zName in updatedZones));
      for (const delName of deletedZoneNames) {
        const delZoneId = `zone_${(delName || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
        await fetch(`/api/data/zones/${delZoneId}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
        await fetch(`/api/data/zones/${delName}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
        await fetch(`/api/data/geofences/${delZoneId}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
        await fetch(`/api/data/geofences/${delName}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
        await deleteDoc(doc(db, 'zones', delZoneId)).catch(() => {});
        await deleteDoc(doc(db, 'zones', delName)).catch(() => {});
        await deleteDoc(doc(db, 'geofences', delZoneId)).catch(() => {});
        await deleteDoc(doc(db, 'geofences', delName)).catch(() => {});
        if (trackingCtx?.deleteZone) {
          trackingCtx.deleteZone(delZoneId).catch(() => {});
        }
      }

      // 2. Save all current zones to the database with permanent zoneIds
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
        await setDoc(doc(db, 'geofences', zoneId), {
          id: zoneId,
          name,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          category: bounds.category || 'GENERAL',
          hazardLevel: bounds.hazardLevel || 'normal',
          capacity: bounds.capacity || 10,
          polygonPoints: bounds.polygonPoints,
          proximityAlertEnabled: bounds.proximityAlertEnabled
        });
      }

      const mapPayload = {
        id: activeProject,
        siteId: activeProject,
        floorplanUrl: newFloorplanUrl || customFloorplan,
        svgSource: newSvgSource || customSvgSource,
        zones: updatedZones,
        updatedAt: new Date().toISOString()
      };

      // Persist full map configuration to database API & MongoDB Atlas MongoDB (overwrite mapPayload to erase deleted keys)
      await fetch('/api/data/map_configurations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(mapPayload)
      });
      await setDoc(doc(db, 'map_configurations', activeProject), mapPayload);

      try {
        const savedProps = JSON.parse(localStorage.getItem('gao_project_properties') || '{}');
        savedProps[activeProject] = {
          ...(savedProps[activeProject] || {}),
          floorplanUrl: newFloorplanUrl || customFloorplan,
          svgSource: newSvgSource || customSvgSource,
          customZones: updatedZones
        };
        localStorage.setItem('gao_project_properties', JSON.stringify(savedProps));
      } catch {}
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
      return { clusters: [], singleWorkers: activeWorkers };
    }

    const radius = 8; // percentage radius on map
    const visitedWorkerIds = new Set<string>();
    const clusters: Array<{ id: string; x: number; y: number; workers: MapWorkerItem[] }> = [];
    const singleWorkers: MapWorkerItem[] = [];

    activeWorkers.forEach((w1, idx) => {
      if (visitedWorkerIds.has(w1.id)) return;

      const nearbyWorkers = activeWorkers.filter(w2 => {
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
  }, [activeWorkers, enableClustering]);

  return (
    <div className="p-4 sm:p-6 w-full max-w-[1760px] mx-auto space-y-6 min-w-0">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-end gap-2.5 flex-wrap">
        <button
          onClick={() => setIsManageAssetsOpen(true)}
          className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition shadow-md"
        >
          <Box size={14} /> Manage Assets & Fleet
        </button>
        <button
          onClick={() => {
            if (drawToolMode === 'place_reader') {
              setDrawToolMode('select');
            } else {
              setDrawToolMode('place_reader');
              setDrawnPoints([]);
              setLayerConfigs(prev => ({ ...prev, rfidReaders: { ...prev.rfidReaders, visible: true } }));
            }
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md ${
            drawToolMode === 'place_reader' 
              ? 'bg-purple-500 text-white ring-2 ring-purple-300 animate-pulse' 
              : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/40'
          }`}
          title="Click on the floor map to drop and position an RFID Reader antenna"
        >
          <Radio size={14} className={drawToolMode === 'place_reader' ? 'animate-spin' : ''} />
          {drawToolMode === 'place_reader' ? 'Active: Click Map to Drop Reader' : '📍 Place / Move RFID Reader'}
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

      {/* Status KPI Metrics Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Active Geofences</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{Object.keys(customZones).length}</div>
            <div className="text-[10px] font-semibold text-slate-500 truncate">
              {Object.values(customZones).filter(z => z.hazardLevel === 'critical').length} High-Hazard Zones
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center font-bold shrink-0">
            <Truck size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Fleet & Assets</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{assets.length + vehicles.length}</div>
            <div className="text-[10px] font-semibold text-slate-500 truncate">
              {vehicles.length} Fleet Vehicles • {assets.length} Assets
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center font-bold shrink-0">
            <Radio size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">RFID Portal Readers</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{hardwareDevices.length}</div>
            <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 truncate">
              {hardwareDevices.filter(d => d.status === 'Online').length} Online Gate Anchors
            </div>
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
            {personnelSingular} Density Heatmap
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
                <button
                  onClick={() => setSelectedFloorId('all')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition col-span-2 ${
                    selectedFloorId === 'all'
                      ? 'bg-[#007BC4] text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  🌐 All Floors (Master Site View)
                </button>
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
            <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
              <button
                onClick={() => setActiveSidebarTab('layers')}
                className={`py-1.5 text-[8.5px] font-extrabold rounded-lg transition ${activeSidebarTab === 'layers' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Layers
              </button>
              <button
                onClick={() => setActiveSidebarTab('readers')}
                className={`py-1.5 text-[8.5px] font-extrabold rounded-lg transition ${activeSidebarTab === 'readers' ? 'bg-white dark:bg-slate-800 text-purple-400 shadow' : 'text-slate-500'}`}
              >
                Readers
              </button>
              <button
                onClick={() => setActiveSidebarTab('zones')}
                className={`py-1.5 text-[8.5px] font-extrabold rounded-lg transition ${activeSidebarTab === 'zones' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Zones
              </button>
              <button
                onClick={() => setActiveSidebarTab('assets')}
                className={`py-1.5 text-[8.5px] font-extrabold rounded-lg transition ${activeSidebarTab === 'assets' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Assets
              </button>
              <button
                onClick={() => setActiveSidebarTab('inventory')}
                className={`py-1.5 text-[8.5px] font-extrabold rounded-lg transition ${activeSidebarTab === 'inventory' ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow' : 'text-slate-500'}`}
              >
                Staff
              </button>
            </div>

            {/* TAB 1: Layers */}
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

                {Object.entries(dynamicLayerConfigs).map(([key, conf]) => (
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

            {/* TAB 2: RFID Readers Manager */}
            {activeSidebarTab === 'readers' && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">RFID Portal Readers ({hardwareDevices.length})</span>
                  <button
                    onClick={() => {
                      setDrawToolMode('place_reader');
                      setLayerConfigs(prev => ({ ...prev, rfidReaders: { ...prev.rfidReaders, visible: true } }));
                    }}
                    className="p-1 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/30 flex items-center gap-1"
                  >
                    <Plus size={12} /> Place New
                  </button>
                </div>

                {hardwareDevices.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                    <Radio size={24} className="mx-auto text-purple-400/60" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No RFID Readers placed on this floor yet.</p>
                    <button
                      onClick={() => {
                        setDrawToolMode('place_reader');
                        setLayerConfigs(prev => ({ ...prev, rfidReaders: { ...prev.rfidReaders, visible: true } }));
                      }}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg transition"
                    >
                      📍 Click to Drop Reader
                    </button>
                  </div>
                ) : (
                  hardwareDevices.map(d => (
                    <div 
                      key={d.id} 
                      className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 group hover:border-purple-500/60 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full ${d.status === 'Online' ? 'bg-emerald-400 animate-pulse' : d.status === 'Maintenance' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                          <span className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{d.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedDeviceForConfig(d);
                              setIsNewDeviceModal(false);
                            }}
                            className="p-1 text-slate-400 hover:text-purple-400 rounded-md hover:bg-purple-500/10 transition"
                            title="Edit Coordinates & Settings"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteReader(d.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-rose-500/10 transition"
                            title="Delete Reader"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-950 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div><span className="text-slate-400">Coord:</span> <span className="text-purple-400 font-bold">X:{d.x}% Y:{d.y}%</span></div>
                        <div><span className="text-slate-400">Power:</span> <span className="text-slate-300 font-bold">{d.powerDbm} dBm</span></div>
                        <div className="col-span-2 truncate"><span className="text-slate-400">Zone:</span> <span className="text-slate-300">{d.zone}</span></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: Zones */}
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

                {Object.keys(customZones).length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                    <p className="text-xs text-slate-400">No geofences created yet. Click Draw to outline a zone.</p>
                  </div>
                ) : (
                  Object.entries(customZones).map(([zName, bounds]: [string, any]) => (
                    <div key={zName} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 group">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{zName}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                            bounds.hazardLevel === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {bounds.hazardLevel || 'normal'}
                          </span>
                          <button
                            onClick={() => handleDeleteZone(zName)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-rose-500/10 transition"
                            title={`Delete zone ${zName}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                        <span>{bounds.category || 'ZONE'}</span>
                        <span>Capacity: {bounds.capacity || 10}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: Assets & Equipment */}
            {activeSidebarTab === 'assets' && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">Assets & Equipment ({assets.length + vehicles.length})</span>
                  <button
                    onClick={() => setIsManageAssetsOpen(true)}
                    className="p-1 bg-[#007BC4]/20 text-[#007BC4] dark:text-sky-300 rounded-lg text-[10px] font-bold hover:bg-[#007BC4]/30 flex items-center gap-1"
                  >
                    <Plus size={12} /> Manage
                  </button>
                </div>

                {assets.length === 0 && vehicles.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                    <p className="text-xs text-slate-400">No assets registered yet. Click Manage to add equipment or assets.</p>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}

            {/* TAB 5: Staff */}
            {activeSidebarTab === 'inventory' && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                <span className="text-xs font-bold text-slate-800 dark:text-white">Active {personnelPlural} ({mapWorkers.length})</span>
                {mapWorkers.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                    <p className="text-xs text-slate-400">No {personnelPlural.toLowerCase()} active on this floor yet.</p>
                  </div>
                ) : (
                  mapWorkers.map(w => {
                    const badge = getSafetyStatusBadge(w.safetyStatus);
                    const BadgeIcon = badge.icon;
                    return (
                      <div 
                        key={w.id} 
                        onClick={() => setSelectedWorker(w)}
                        className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between cursor-pointer hover:border-[#007BC4] transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={14} className="text-slate-400 shrink-0" />
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
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right Column: Live Interactive Vector Map Display */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col h-[720px] relative overflow-hidden">
          {/* Map Top Action Controls */}
          <div className="flex flex-col gap-2.5 mb-3 z-20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold text-[#007BC4] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} /> Digital Twin Vector Map Canvas
                </span>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                  {currentSite.name} — {currentBuilding?.name} ({currentFloor?.name})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  ref={floorFileInputRef} 
                  onChange={handleFloorMapUpload} 
                  accept="image/*,.svg" 
                  className="hidden" 
                />
                
                <button
                  onClick={() => floorFileInputRef.current?.click()}
                  disabled={isUploadingFloorplan}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                  title="Upload custom floor plan or blueprint map for this level"
                >
                  {isUploadingFloorplan ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Optimizing & Saving...
                    </>
                  ) : (
                    <>
                      <Upload size={13} /> Upload Floor Map
                    </>
                  )}
                </button>

                <button
                  onClick={() => setIsMapEditorOpen(true)}
                  className="px-2.5 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                  title="Open visual zone positioning editor"
                >
                  <SlidersHorizontal size={13} /> Edit Layout & Zones
                </button>
              </div>
            </div>

            {/* Floor Navigation Pills Bar & Drawing Tool Controls */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">Floor:</span>
                <button
                  onClick={() => setSelectedFloorId('all')}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-mono font-bold inline-flex items-center justify-center transition border shrink-0 ${
                    selectedFloorId === 'all'
                      ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-sm ring-2 ring-blue-300'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  All Floors
                </button>
                {currentBuilding?.floors.map(floor => {
                  const isSelected = selectedFloorId === floor.id;
                  return (
                    <button
                      key={floor.id}
                      onClick={() => {
                        setSelectedFloorId(floor.id);
                        const v = floor.versions.find(ver => ver.id === floor.activeVersionId) || floor.versions[0];
                        if (v) {
                          setCustomFloorplan(v.floorplanUrl || null);
                          setCustomSvgSource(v.svgSource || null);
                        }
                      }}
                      className={`h-7 px-2.5 rounded-lg text-[10px] font-mono font-bold inline-flex items-center justify-center transition border shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {floor.name.split(' - ')[0] || `Level ${floor.levelNumber}`}
                    </button>
                  );
                })}
              </div>

              {/* Drawing & Placement Tool Controls Bar */}
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-1 rounded-xl">
                <button
                  onClick={() => { setDrawToolMode('select'); setDrawnPoints([]); }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                    drawToolMode === 'select' ? 'bg-[#007BC4] text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Compass size={12} /> Pan/Select
                </button>

                <button
                  onClick={() => { 
                    setDrawToolMode('place_reader'); 
                    setDrawnPoints([]); 
                    setLayerConfigs(prev => ({ ...prev, rfidReaders: { ...prev.rfidReaders, visible: true } }));
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                    drawToolMode === 'place_reader' ? 'bg-purple-500 text-white font-black animate-pulse' : 'text-purple-300 hover:text-purple-200'
                  }`}
                  title="Click map to drop RFID Reader or drag existing readers"
                >
                  <Radio size={12} /> 📍 Place Reader
                </button>

                <button
                  onClick={() => { setDrawToolMode('polygon'); setDrawnPoints([]); }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                    drawToolMode === 'polygon' ? 'bg-amber-500 text-slate-950 font-black' : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <PenTool size={12} /> Draw Polygon
                </button>

                <button
                  onClick={() => { setDrawToolMode('rectangle'); setDrawnPoints([]); }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
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
                      Undo
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
                      <Save size={12} /> Save ({drawnPoints.length} pts)
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Active Tool Helper Status Banner */}
          {drawToolMode === 'place_reader' && (
            <div className="mb-2 px-3 py-1.5 bg-purple-500/15 border border-purple-500/50 text-purple-200 text-xs font-bold rounded-xl flex items-center justify-between z-20 animate-fade-in">
              <span className="flex items-center gap-2">
                <Radio size={14} className="text-purple-400 animate-pulse" />
                <span><strong>Reader Placement Mode:</strong> Click anywhere on the floor map to drop a new RFID Reader antenna. Drag existing readers to adjust (X, Y) coordinates.</span>
                {cursorMapCoords && (
                  <span className="font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-600/40">
                    Cursor: X {cursorMapCoords.x}% • Y {cursorMapCoords.y}%
                  </span>
                )}
              </span>
              <button onClick={() => setDrawToolMode('select')} className="text-purple-300 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}

          {drawToolMode !== 'select' && drawToolMode !== 'place_reader' && (
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
            onMouseMove={handleMapMouseMove}
            onMouseUp={handleMapMouseUp}
            className={`flex-1 relative rounded-xl border border-slate-300 bg-white overflow-hidden shadow-inner select-none ${
              drawToolMode === 'place_reader' ? 'cursor-crosshair' : drawToolMode !== 'select' ? 'cursor-crosshair' : draggingDeviceId ? 'cursor-grabbing' : ''
            }`}
          >
            {/* Blueprint Image, SVG Source, or Enterprise CAD Digital Twin */}
            {customFloorplan && typeof customFloorplan === 'string' && customFloorplan.trim().length > 5 ? (
              <img src={customFloorplan} alt="Custom Blueprint" className="absolute inset-0 w-full h-full object-contain opacity-95 pointer-events-none" />
            ) : customSvgSource ? (
              <div 
                className="absolute inset-0 opacity-80 pointer-events-none overflow-hidden" 
                dangerouslySetInnerHTML={{ __html: customSvgSource }} 
              />
            ) : (
              <InteractiveSiteMap 
                mode="standard"
                activeFloor={currentFloor?.name || 'Floor 1'}
                activeZones={customZones}
                people={activeWorkers.map(w => ({
                  id: w.id,
                  name: w.name,
                  role: w.role,
                  currentZone: w.currentZone,
                  presenceState: 'MOVING' as const,
                  dwellTime: 30,
                  x: w.x,
                  y: w.y,
                  lastSeen: new Date(),
                  trail: []
                }))}
                vehicles={vehicles as any}
                onSelectEntity={(entity) => {
                  if (entity.type === 'person') setSelectedWorker(entity.data as any);
                }}
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
                  {activeWorkers.map(w => (
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
              
              if (isHazard && !dynamicLayerConfigs.restrictedZones?.visible) return null;
              if (isWarning && !dynamicLayerConfigs.hazardZones?.visible) return null;

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
                            {metrics.count} / {metrics.capacity} Personnel
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

            {/* RFID READERS & UHF GATE ANCHORS LAYER */}
            {(dynamicLayerConfigs.rfidReaders?.visible || drawToolMode === 'place_reader') && (
              <>
                {/* SVG Translucent Coverage Range Circles */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
                  <defs>
                    <radialGradient id="readerCoverageGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                      <stop offset="70%" stopColor="#a855f7" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {hardwareDevices.map(d => {
                    const radius = Math.max(35, (d.powerDbm || 30) * 1.8);
                    const isSelected = selectedDeviceForConfig?.id === d.id || hoveredDeviceId === d.id;
                    return (
                      <g key={`svg-rdr-${d.id}`}>
                        <circle
                          cx={`${d.x}%`}
                          cy={`${d.y}%`}
                          r={radius}
                          fill="url(#readerCoverageGlow)"
                          stroke={isSelected ? "#c084fc" : "#a855f7"}
                          strokeWidth={isSelected ? "2" : "1.2"}
                          strokeDasharray={isSelected ? "none" : "5,4"}
                          className={d.status === 'Online' ? 'animate-pulse' : ''}
                        />
                        {/* Antenna Angle Beam Indicator */}
                        <line
                          x1={`${d.x}%`}
                          y1={`${d.y}%`}
                          x2={`${d.x}%`}
                          y2={`${d.y - (radius * 0.12)}%`}
                          stroke="#a855f7"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Interactive Drag-and-Drop RFID Reader Pins */}
                {hardwareDevices.map(d => {
                  const isDragging = draggingDeviceId === d.id;
                  const isSelected = selectedDeviceForConfig?.id === d.id;
                  return (
                    <div
                      key={`rdr-marker-${d.id}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingDeviceId(d.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDeviceForConfig(d);
                        setIsNewDeviceModal(false);
                      }}
                      onMouseEnter={() => setHoveredDeviceId(d.id)}
                      onMouseLeave={() => setHoveredDeviceId(null)}
                      className={`absolute z-35 flex flex-col items-center cursor-grab active:cursor-grabbing group transition-transform ${
                        isDragging ? 'scale-125 z-50 pointer-events-none' : isSelected ? 'scale-115 z-45' : 'hover:scale-110'
                      }`}
                      style={{ left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%, -50%)' }}
                      title={`RFID Reader: ${d.name} (${d.x}%, ${d.y}%) — Click to configure or drag to move`}
                    >
                      {/* Live Dragging / Hover Coordinate Pill */}
                      {(isDragging || hoveredDeviceId === d.id || isSelected) && (
                        <div className="absolute -top-7 px-2 py-0.5 rounded-md bg-purple-950/95 border border-purple-500/80 text-purple-200 text-[9px] font-mono font-black shadow-xl whitespace-nowrap animate-fade-in flex items-center gap-1">
                          <Radio size={10} className="text-purple-400" />
                          <span>{d.name}: X {d.x}% • Y {d.y}%</span>
                        </div>
                      )}

                      {/* Reader Antenna Physical Badge */}
                      <div className={`p-2 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center justify-center transition ${
                        isDragging 
                          ? 'bg-purple-600 text-white border-white ring-4 ring-purple-400/50 shadow-purple-500/50' 
                          : d.status === 'Online'
                          ? 'bg-slate-900/95 text-purple-300 border-purple-500/80 shadow-purple-500/20'
                          : 'bg-slate-800/95 text-slate-400 border-slate-600'
                      }`}>
                        <Radio size={16} className={d.status === 'Online' ? 'text-purple-400 animate-pulse' : ''} />
                        
                        {/* Status LED Dot */}
                        <span className={`w-2.5 h-2.5 rounded-full absolute -top-1 -right-1 border border-slate-900 ${
                          d.status === 'Online' ? 'bg-emerald-400 animate-ping' : d.status === 'Maintenance' ? 'bg-amber-400' : 'bg-rose-500'
                        }`} />
                        <span className={`w-2 h-2 rounded-full absolute -top-1 -right-1 border border-slate-900 ${
                          d.status === 'Online' ? 'bg-emerald-400' : d.status === 'Maintenance' ? 'bg-amber-400' : 'bg-rose-500'
                        }`} />
                      </div>

                      {/* Reader Label Pill */}
                      <div className="mt-1 px-1.5 py-0.2 rounded bg-slate-950/90 border border-slate-800 text-[8px] font-mono font-bold text-white shadow truncate max-w-[100px] text-center">
                        {d.name.replace('UHF Portal Reader ', 'RDR-')}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* LAYER 3: Clustered Map Markers or Individual Workers */}
            {dynamicLayerConfigs.workers?.visible && (
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

                {/* Single Workers & Active Visitors with Personnel Safety Status Badges */}
                {clusteredGroups.singleWorkers.map(w => {
                  const isVisitor = w.role === 'Visitor' || (w.name || '').includes('(Visitor)');
                  const badge = isVisitor ? {
                    label: 'Active Visitor',
                    shortLabel: 'VISITOR',
                    color: '#c084fc',
                    icon: Users,
                    badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
                    pillBg: 'bg-purple-950/90 border-purple-500/80 text-purple-200 shadow-purple-500/20',
                    ping: true
                  } : getSafetyStatusBadge(w.safetyStatus);
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
                      {isVisitor ? <Users size={12} className="text-purple-300" /> : <User size={12} style={{ color: badge.color }} />}
                      <span className="text-[10px] font-extrabold">{w.name}</span>
                      <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase flex items-center gap-0.5 ${badge.badgeClass}`}>
                        <BadgeIcon size={8} />
                        {badge.shortLabel}
                      </span>
                      {badge.ping && (
                        <span className={`w-2 h-2 rounded-full ${isVisitor ? 'bg-purple-400' : 'bg-rose-500'} animate-ping absolute -top-1 -right-1`} />
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Equipment Layer */}
            {dynamicLayerConfigs.equipment?.visible && (
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
            {dynamicLayerConfigs.vehicles?.visible && (
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

            {/* Safety Items: Dynamic Assembly Points from Zones */}
            {dynamicLayerConfigs.assemblyPoints?.visible && (
              <>
                {Object.entries(customZones)
                  .filter(([name, z]) => (z.category || '').includes('MUSTER') || (z.category || '').includes('ASSEMBLY') || name.toLowerCase().includes('muster') || name.toLowerCase().includes('assembly'))
                  .map(([zName, z]) => (
                    <div
                      key={`muster-${zName}`}
                      className="absolute z-20 p-2 rounded-xl bg-emerald-900/90 border border-emerald-500 text-emerald-200 flex items-center gap-1.5 shadow-lg backdrop-blur-sm"
                      style={{ left: `${z.x}%`, top: `${z.y}%` }}
                    >
                      <ShieldCheck size={14} className="text-emerald-400" />
                      <span className="text-[10px] font-black">{zName.toUpperCase()}</span>
                    </div>
                  ))}
              </>
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
                      <Radio size={12} className="text-purple-400" /> Hardware & Safety Key
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded border border-purple-500/50 text-purple-300">
                        <Radio size={10} className="text-purple-400 shrink-0" />
                        <span className="font-bold truncate">RFID UHF Portal</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded border border-emerald-500/50 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-bold truncate">Compliant Worker</span>
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
                          <AlertTriangle size={10} className="text-amber-400" /> Caution / Controlled Area
                        </span>
                        <span className="font-mono text-[8px] opacity-80">Amber Dashed</span>
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
                <PenTool size={18} /> Save Geofenced Area to MongoDB
              </h3>
              <button onClick={() => setIsSavingGeofenceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveGeofenceToMongoDB} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300">Geofence Zone Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. South Wing Restricted Perimeter"
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
                    <option value="RESTRICTED ACCESS ZONE">Restricted Access Zone</option>
                    <option value="SECURITY PERIMETER">Security Perimeter</option>
                    <option value="CONTROLLED OPERATIONS">Controlled Operations</option>
                    <option value="ELECTRICAL & UTILITIES">Electrical & Utilities</option>
                    <option value="EMERGENCY ASSEMBLY POINT">Emergency Assembly Point</option>
                    <option value="LOGISTICS & STORAGE">Logistics & Storage</option>
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
                  <Save size={14} /> Save Geofence to MongoDB
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
                <User size={20} className="text-emerald-400" />
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
                <div className="text-xs font-bold text-slate-300">{idBadgeLabel} Telemetry ID</div>
                <div className="text-sm font-mono text-emerald-400 font-bold">{selectedWorker.hardhatTagId || selectedWorker.id}</div>
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
          availableZones={Object.keys(customZones).length > 0 ? Object.keys(customZones) : ['Main Entrance Gate', 'Core Building Area', 'Equipment Zone']}
          onClose={() => setSelectedDeviceForConfig(null)}
          onSave={handleSaveReaderFromConfig}
          onDelete={handleDeleteReader}
          isNew={isNewDeviceModal}
        />
      )}

      {/* Manage Assets & Equipment Modal */}
      {isManageAssetsOpen && (
        <ManageAssetsModal
          isOpen={isManageAssetsOpen}
          onClose={() => setIsManageAssetsOpen(false)}
          availableZones={Object.keys(customZones).length > 0 ? Object.keys(customZones) : ['Main Complex', 'Material Laydown', 'Site Perimeter']}
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
