import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc, collection, onSnapshot, db } from '../lib/db';
import { Person } from '../types';
import { RealtimeTag, gaoApi } from '../lib/gaoApi';
import { 
  AssetItem, VehicleItem, CCTVCameraItem, EnvironmentalSensorItem, InfrastructureItem
} from '../lib/trackingLayers';
import { ZoneBounds } from '../components/MapEditorModal';

export interface MapZoneDefinition {
  id: string;
  zoneId: string;
  name: string;
  aliasNames?: string[];
  category: string;
  hazardLevel?: 'normal' | 'warning' | 'critical';
  capacity?: number;
  siteId?: string;
  buildingId?: string;
  floorId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  readerIds?: string[];
  antennaIds?: number[];
  currentOccupancy?: number;
  polygonPoints?: { x: number; y: number }[];
  proximityAlertEnabled?: boolean;
}

export interface ReaderZoneMapping {
  id: string;
  readerId: string;
  antennaPort: number;
  zoneId: string;
  zoneName: string;
}

export interface TrackingContextType {
  activeProject: string;
  setActiveProject: (id: string) => void;
  mode: 'real' | 'demo';
  setMode: (m: 'real' | 'demo') => void;
  wsConnected: boolean;
  liveTags: RealtimeTag[];
  people: Person[];
  assets: AssetItem[];
  vehicles: VehicleItem[];
  cameras: CCTVCameraItem[];
  envSensors: EnvironmentalSensorItem[];
  infrastructure: InfrastructureItem[];
  zones: MapZoneDefinition[];
  zonesDict: Record<string, ZoneBounds>;
  readerMappings: ReaderZoneMapping[];
  mapConfig: any;
  customFloorplan: string | null;
  customSvgSource: string | null;
  isLoading: boolean;
  lastUpdateTimestamp: string | null;
  // Sync handlers
  saveMapConfig: (cfg: any) => Promise<void>;
  saveZone: (zone: Partial<MapZoneDefinition>) => Promise<void>;
  deleteZone: (zoneId: string) => Promise<void>;
  saveCustomZones: (zones: Record<string, ZoneBounds>, floorplanUrl?: string | null, svgSource?: string | null) => Promise<void>;
  saveAsset: (item: AssetItem) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  saveVehicle: (item: VehicleItem) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  saveCamera: (item: CCTVCameraItem) => Promise<void>;
  deleteCamera: (id: string) => Promise<void>;
  saveEnvSensor: (item: EnvironmentalSensorItem) => Promise<void>;
  deleteEnvSensor: (id: string) => Promise<void>;
  saveInfrastructure: (item: InfrastructureItem) => Promise<void>;
  deleteInfrastructure: (id: string) => Promise<void>;
  setCustomFloorplan: (url: string | null) => void;
  setCustomSvgSource: (svg: string | null) => void;
  getZoneByNameOrId: (nameOrId: string) => MapZoneDefinition | undefined;
  refreshLiveState: () => Promise<void>;
  reportManualScan: (tagId: string, location: string, name?: string) => Promise<void>;
}

const TrackingContext = createContext<TrackingContextType | undefined>(undefined);

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

export const SITE_ZONE_WAYPOINTS: { name: string; x: number; y: number; minX: number; maxX: number; minY: number; maxY: number }[] = [
  { name: 'Material Storage', x: 18.0, y: 15.0, minX: 10, maxX: 26, minY: 11, maxY: 23 },
  { name: 'Structure Work Area', x: 50.0, y: 15.0, minX: 40, maxX: 60, minY: 11, maxY: 23 },
  { name: 'Crane Operating Zone', x: 82.0, y: 15.0, minX: 72, maxX: 90, minY: 11, maxY: 23 },
  { name: 'Site Office', x: 18.0, y: 45.0, minX: 10, maxX: 26, minY: 40, maxY: 53 },
  { name: 'Open Work Area', x: 50.0, y: 45.0, minX: 40, maxX: 60, minY: 40, maxY: 53 },
  { name: 'Equipment Parking', x: 82.0, y: 45.0, minX: 72, maxX: 90, minY: 40, maxY: 53 },
  { name: 'Excavation Area', x: 18.0, y: 75.0, minX: 10, maxX: 26, minY: 70, maxY: 83 },
  { name: 'Assembly Point', x: 50.0, y: 75.0, minX: 40, maxX: 60, minY: 70, maxY: 83 },
  { name: 'High Voltage Area', x: 82.0, y: 75.0, minX: 72, maxX: 90, minY: 70, maxY: 83 }
];

const DEFAULT_INITIAL_PEOPLE: Person[] = [
  { id: 'HH-1001', name: 'Viktor', role: 'Site Specialist', tradeCompany: 'Site Logistics JV', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1001', currentZone: 'Material Storage', presenceState: 'IDLE', dwellTime: 45, x: 16.0, y: 14.0, rssi: -62, battery: 94, photoUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1002', name: 'Carlos', role: 'Heavy Handler', tradeCompany: 'Apex Heavy Staging', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1002', currentZone: 'Material Storage', presenceState: 'IDLE', dwellTime: 32, x: 24.5, y: 14.0, rssi: -58, battery: 88, photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1003', name: 'Elena', role: 'Structural Inspector', tradeCompany: 'Apex QA Group', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1003', currentZone: 'Structure Work Area', presenceState: 'IDLE', dwellTime: 18, x: 45.0, y: 22.0, rssi: -65, battery: 92, photoUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1004', name: 'Marcus', role: 'Contractor Lead', tradeCompany: 'Apex Contractors', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1004', currentZone: 'Site Office', presenceState: 'IDLE', dwellTime: 24, x: 18.0, y: 48.0, rssi: -70, battery: 79, photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1005', name: 'Rachel', role: 'Contractor QA', tradeCompany: 'Apex Contractors', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1005', currentZone: 'Site Office', presenceState: 'IDLE', dwellTime: 50, x: 24.5, y: 48.0, rssi: -60, battery: 85, photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1006', name: 'Arthur', role: 'Contractor Ops', tradeCompany: 'Apex Contractors', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1006', currentZone: 'Site Office', presenceState: 'IDLE', dwellTime: 15, x: 22.0, y: 56.0, rssi: -54, battery: 95, photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1007', name: 'David', role: 'Rebar Lead', tradeCompany: 'Apex Steelworks', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1007', currentZone: 'Open Work Area', presenceState: 'IDLE', dwellTime: 28, x: 52.0, y: 44.0, rssi: -64, battery: 91, photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1008', name: 'Tariq', role: 'Heavy Equip Tech', tradeCompany: 'Apex Machinery', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1008', currentZone: 'Equipment Parking', presenceState: 'IDLE', dwellTime: 40, x: 78.0, y: 54.0, rssi: -68, battery: 86, photoUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1009', name: 'Sarah', role: 'Excavation Contractor', tradeCompany: 'Apex Groundworks', ppeStatus: 'COMPLIANT', shiftStatus: 'ON_SITE', trainingStatus: 'COMPLIANT', hardhatTagId: 'HH-1009', currentZone: 'Excavation Area', presenceState: 'IDLE', dwellTime: 30, x: 24.0, y: 78.0, rssi: -66, battery: 89, photoUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] },
  { id: 'HH-1010', name: 'Liam', role: 'Electrical Specialist', tradeCompany: 'VoltTech Power', ppeStatus: 'WARNING', shiftStatus: 'ON_SITE', trainingStatus: 'DUE_SOON', hardhatTagId: 'HH-1010', currentZone: 'High Voltage Area', presenceState: 'IDLE', dwellTime: 22, x: 84.0, y: 78.0, rssi: -61, battery: 93, photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120', lastSeen: new Date(), trail: [] }
];

export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<string>(() => {
    return localStorage.getItem('gao_active_project') || 'metro-tower';
  });

  const [mode, setModeState] = useState<'real' | 'demo'>(() => {
    return (localStorage.getItem('gao_app_mode') as 'real' | 'demo') || 'real';
  });

  const [wsConnected, setWsConnected] = useState(false);
  const [liveTags, setLiveTags] = useState<RealtimeTag[]>([]);
  const [people, setPeople] = useState<Person[]>(DEFAULT_INITIAL_PEOPLE);

  // Entities initialized from persistent MongoDB storage
  const [assets, setAssets] = useState<AssetItem[]>(() => {
    try {
      const saved = localStorage.getItem('gao_db_assets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [vehicles, setVehicles] = useState<VehicleItem[]>(() => {
    try {
      const saved = localStorage.getItem('gao_db_vehicles');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [cameras, setCameras] = useState<CCTVCameraItem[]>(() => {
    try {
      const saved = localStorage.getItem('gao_db_cameras');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [envSensors, setEnvSensors] = useState<EnvironmentalSensorItem[]>(() => {
    try {
      const saved = localStorage.getItem('gao_db_sensors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [infrastructure, setInfrastructure] = useState<InfrastructureItem[]>(() => {
    try {
      const saved = localStorage.getItem('gao_db_infrastructure');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [zones, setZones] = useState<MapZoneDefinition[]>(() => {
    try {
      const saved = localStorage.getItem('gao_db_zones');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [customFloorplan, setCustomFloorplanState] = useState<string | null>(() => {
    return localStorage.getItem('gao_custom_floorplan') || null;
  });

  const [customSvgSource, setCustomSvgSourceState] = useState<string | null>(() => {
    return localStorage.getItem('gao_custom_svg_source') || null;
  });

  const [readerMappings, setReaderMappings] = useState<ReaderZoneMapping[]>([]);
  const [mapConfig, setMapConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const setActiveProject = useCallback((id: string) => {
    setActiveProjectState(id);
    localStorage.setItem('gao_active_project', id);
  }, []);

  const setMode = useCallback((newMode: 'real' | 'demo') => {
    setModeState(newMode);
    localStorage.setItem('gao_app_mode', newMode);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: newMode === 'demo' ? 'enable_demo_mode' : 'disable_demo_mode',
        payload: { mode: newMode }
      }));
    }
  }, []);

  const setCustomFloorplan = useCallback((url: string | null) => {
    setCustomFloorplanState(url);
    if (url) {
      localStorage.setItem('gao_custom_floorplan', url);
    } else {
      localStorage.removeItem('gao_custom_floorplan');
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const setCustomSvgSource = useCallback((svg: string | null) => {
    setCustomSvgSourceState(svg);
    if (svg) {
      localStorage.setItem('gao_custom_svg_source', svg);
    } else {
      localStorage.removeItem('gao_custom_svg_source');
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Helper to find zone by name or zoneId
  const getZoneByNameOrId = useCallback((nameOrId: string): MapZoneDefinition | undefined => {
    if (!nameOrId) return undefined;
    const lower = nameOrId.toLowerCase().trim();
    return zones.find(z => 
      z.zoneId.toLowerCase() === lower || 
      z.id.toLowerCase() === lower || 
      z.name.toLowerCase() === lower ||
      (z.aliasNames && z.aliasNames.some(a => a.toLowerCase() === lower || lower.includes(a.toLowerCase())))
    );
  }, [zones]);

  // Derived dictionary of zone bounds for LiveFloorMap
  const zonesDict = React.useMemo(() => {
    const dict: Record<string, ZoneBounds> = {};
    for (const z of zones) {
      dict[z.name] = {
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        category: z.category,
        hazardLevel: z.hazardLevel,
        capacity: z.capacity,
        polygonPoints: z.polygonPoints,
        proximityAlertEnabled: z.proximityAlertEnabled
      };
      if (z.zoneId && z.zoneId !== z.name) {
        dict[z.zoneId] = dict[z.name];
      }
    }
    return dict;
  }, [zones]);

  // Save full set of custom zones from Map Editor or Custom Map Page
  const saveCustomZones = useCallback(async (
    newZones: Record<string, ZoneBounds>, 
    newFloorplanUrl?: string | null, 
    newSvgSource?: string | null
  ) => {
    const zoneDefinitions: MapZoneDefinition[] = Object.entries(newZones).map(([name, bounds]) => {
      const zoneId = `zone_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
      return {
        id: zoneId,
        zoneId,
        name,
        category: bounds.category || 'GENERAL',
        hazardLevel: bounds.hazardLevel || 'normal',
        capacity: bounds.capacity || 10,
        siteId: activeProject,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        polygonPoints: bounds.polygonPoints,
        proximityAlertEnabled: bounds.proximityAlertEnabled,
        aliasNames: [name]
      };
    });

    setZones(zoneDefinitions);
    localStorage.setItem('gao_db_zones', JSON.stringify(zoneDefinitions));

    if (newFloorplanUrl !== undefined) {
      setCustomFloorplan(newFloorplanUrl);
    }
    if (newSvgSource !== undefined) {
      setCustomSvgSource(newSvgSource);
    }

    try {
      const authHeaders = getAuthHeaders();
      for (const zone of zoneDefinitions) {
        await fetch('/api/data/zones', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(zone)
        });
      }
    } catch {}

    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, [activeProject, setCustomFloorplan, setCustomSvgSource]);

  // Asset CRUD
  const saveAsset = useCallback(async (item: AssetItem) => {
    setAssets(prev => {
      const idx = prev.findIndex(a => a.id === item.id);
      const next = idx >= 0 ? [...prev] : [item, ...prev];
      if (idx >= 0) next[idx] = item;
      localStorage.setItem('gao_db_assets', JSON.stringify(next));
      return next;
    });
    try {
      await fetch('/api/data/assets', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item)
      });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    setAssets(prev => {
      const next = prev.filter(a => a.id !== id);
      localStorage.setItem('gao_db_assets', JSON.stringify(next));
      return next;
    });
    try {
      await fetch(`/api/data/assets/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Vehicle CRUD
  const saveVehicle = useCallback(async (item: VehicleItem) => {
    setVehicles(prev => {
      const idx = prev.findIndex(v => v.id === item.id);
      const next = idx >= 0 ? [...prev] : [item, ...prev];
      if (idx >= 0) next[idx] = item;
      localStorage.setItem('gao_db_vehicles', JSON.stringify(next));
      return next;
    });
    try {
      await fetch('/api/data/vehicles', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item)
      });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const deleteVehicle = useCallback(async (id: string) => {
    setVehicles(prev => {
      const next = prev.filter(v => v.id !== id);
      localStorage.setItem('gao_db_vehicles', JSON.stringify(next));
      return next;
    });
    try {
      await fetch(`/api/data/vehicles/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Camera CRUD
  const saveCamera = useCallback(async (item: CCTVCameraItem) => {
    setCameras(prev => {
      const idx = prev.findIndex(c => c.id === item.id);
      const next = idx >= 0 ? [...prev] : [item, ...prev];
      if (idx >= 0) next[idx] = item;
      localStorage.setItem('gao_db_cameras', JSON.stringify(next));
      return next;
    });
    try {
      await fetch('/api/data/cameras', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item)
      });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const deleteCamera = useCallback(async (id: string) => {
    setCameras(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem('gao_db_cameras', JSON.stringify(next));
      return next;
    });
    try {
      await fetch(`/api/data/cameras/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Sensor CRUD
  const saveEnvSensor = useCallback(async (item: EnvironmentalSensorItem) => {
    setEnvSensors(prev => {
      const idx = prev.findIndex(s => s.id === item.id);
      const next = idx >= 0 ? [...prev] : [item, ...prev];
      if (idx >= 0) next[idx] = item;
      localStorage.setItem('gao_db_sensors', JSON.stringify(next));
      return next;
    });
    try {
      await fetch('/api/data/sensors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item)
      });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const deleteEnvSensor = useCallback(async (id: string) => {
    setEnvSensors(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem('gao_db_sensors', JSON.stringify(next));
      return next;
    });
    try {
      await fetch(`/api/data/sensors/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Infrastructure CRUD
  const saveInfrastructure = useCallback(async (item: InfrastructureItem) => {
    setInfrastructure(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      const next = idx >= 0 ? [...prev] : [item, ...prev];
      if (idx >= 0) next[idx] = item;
      localStorage.setItem('gao_db_infrastructure', JSON.stringify(next));
      return next;
    });
    try {
      await fetch('/api/data/infrastructure', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item)
      });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const deleteInfrastructure = useCallback(async (id: string) => {
    setInfrastructure(prev => {
      const next = prev.filter(i => i.id !== id);
      localStorage.setItem('gao_db_infrastructure', JSON.stringify(next));
      return next;
    });
    try {
      await fetch(`/api/data/infrastructure/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Fetch initial database entities
  const loadDatabaseConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const authHeaders = getAuthHeaders();
      const [zonesRes, mapRes, readersRes, assetsRes, vehiclesRes, peopleRes, visitorsRes] = await Promise.allSettled([
        fetch('/api/data/zones', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch(`/api/data/map_configurations/${activeProject}`, { headers: authHeaders }).then(r => r.ok ? r.json() : null),
        fetch('/api/data/reader_zone_mappings', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/assets', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/vehicles', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/registered_people', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/visitors', { headers: authHeaders }).then(r => r.ok ? r.json() : [])
      ]);

      if (zonesRes.status === 'fulfilled' && Array.isArray(zonesRes.value) && zonesRes.value.length > 0) {
        setZones(zonesRes.value);
        localStorage.setItem('gao_db_zones', JSON.stringify(zonesRes.value));
      }

      if (mapRes.status === 'fulfilled' && mapRes.value) {
        setMapConfig(mapRes.value);
      }

      if (readersRes.status === 'fulfilled' && Array.isArray(readersRes.value)) {
        setReaderMappings(readersRes.value);
      }

      if (assetsRes.status === 'fulfilled' && Array.isArray(assetsRes.value) && assetsRes.value.length > 0) {
        setAssets(assetsRes.value);
        localStorage.setItem('gao_db_assets', JSON.stringify(assetsRes.value));
      }

      if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value) && vehiclesRes.value.length > 0) {
        setVehicles(vehiclesRes.value);
        localStorage.setItem('gao_db_vehicles', JSON.stringify(vehiclesRes.value));
      }

      const rawPeople = (peopleRes.status === 'fulfilled' && Array.isArray(peopleRes.value) && peopleRes.value.length > 0)
        ? peopleRes.value
        : DEFAULT_INITIAL_PEOPLE;
        
      const loadedPeople: Person[] = rawPeople.map((p: any, idx: number) => {
        const id = p.id || p.tagId || p.TagID || `P-${idx + 101}`;
        const defaultWaypoint = SITE_ZONE_WAYPOINTS[idx % SITE_ZONE_WAYPOINTS.length];
        const x = typeof p.x === 'number' && p.x >= 5 && p.x <= 95 ? p.x : defaultWaypoint.x;
        const y = typeof p.y === 'number' && p.y >= 5 && p.y <= 95 ? p.y : defaultWaypoint.y;
        const zone = p.currentZone || p.location || defaultWaypoint.name;

        return {
          id,
          name: p.name || p.personName || 'Personnel',
          role: p.role || 'Field Personnel',
          tradeCompany: p.company || p.tradeCompany || 'Contractor',
          ppeStatus: p.ppeStatus || 'COMPLIANT',
          shiftStatus: p.shiftStatus || 'ON_SITE',
          trainingStatus: p.trainingStatus || 'COMPLIANT',
          hardhatTagId: p.hardhatTagId || p.tagId || p.TagID || id,
          currentZone: zone,
          presenceState: 'IDLE',
          dwellTime: p.dwellTime || 0,
          x,
          y,
          rssi: p.rssi || -65,
          battery: p.battery || 90,
          lastSeen: p.lastSeen ? new Date(p.lastSeen) : new Date(),
          trail: []
        };
      });

      // Include allowed and verified site visitors on the live tracking map
      const activeVisitors: Person[] = (visitorsRes.status === 'fulfilled' && Array.isArray(visitorsRes.value))
        ? visitorsRes.value
            .filter((v: any) => {
              if (!v) return false;
              const status = (v.status || '').trim();
              const idStatus = (v.idVerificationStatus || '').toUpperCase();

              // Block pending approval, denied, rejected, departed, blacklisted, or failed ID visitors
              if (status === 'Pending Approval' || status === 'Denied' || status === 'Rejected' || status === 'Completed' || status === 'Blacklisted' || status === 'Departed') {
                return false;
              }
              if (idStatus === 'FAILED' || idStatus === 'REJECTED') {
                return false;
              }

              // Allowed if active, checked-in, overstayed on site, or approved with verified ID
              if (status === 'Active' || status === 'Checked-in' || status === 'Overstayed') {
                return idStatus !== 'FAILED';
              }
              if (status === 'Approved' && (idStatus === 'VERIFIED' || v.tag)) {
                return true;
              }
              return false;
            })
            .map((v: any, vIdx: number) => {
              const zone = v.location || 'Site Command HQ';
              const defaultPoint = SITE_ZONE_WAYPOINTS[3]; // Site Command HQ
              const x = typeof v.x === 'number' ? v.x : defaultPoint.x;
              const y = typeof v.y === 'number' ? v.y : defaultPoint.y;

              return {
                id: v.id || `VIS-${vIdx + 880}`,
                name: `${v.name} (Visitor)`,
                role: 'Visitor',
                tradeCompany: v.company || 'Auditor / Guest',
                ppeStatus: 'COMPLIANT' as const,
                shiftStatus: 'ON_SITE' as const,
                trainingStatus: 'COMPLIANT' as const,
                hardhatTagId: v.tag || `VIS-TAG-${v.id || vIdx}`,
                currentZone: zone,
                presenceState: 'IDLE' as const,
                dwellTime: v.duration ? parseInt(v.duration) || 25 : 25,
                x,
                y,
                rssi: -58,
                battery: 98,
                lastSeen: v.arrivalTime ? new Date(v.arrivalTime) : new Date(),
                trail: []
              };
            })
        : [];

      setPeople(prev => {
        const existingMap = new Map((prev || []).map(p => [p.id, p]));
        const combined = [...loadedPeople, ...activeVisitors];

        return combined.map(item => {
          const existing = existingMap.get(item.id);
          if (existing) {
            return {
              ...existing,
              name: item.name,
              role: item.role,
              tradeCompany: item.tradeCompany,
              ppeStatus: item.ppeStatus,
              shiftStatus: item.shiftStatus,
              trainingStatus: item.trainingStatus
            };
          }
          return item;
        });
      });
    } catch (err) {
      console.warn('[TrackingContext] Initial config load error:', err);
      setPeople(DEFAULT_INITIAL_PEOPLE);
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  // Save map configuration to DB
  const saveMapConfig = useCallback(async (cfg: any) => {
    try {
      const payload = {
        id: cfg.id || activeProject,
        siteId: activeProject,
        ...cfg,
        updatedAt: new Date().toISOString()
      };
      await fetch('/api/data/map_configurations', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      setMapConfig(payload);
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    } catch (err) {
      console.error('[TrackingContext] Failed to save map config to DB:', err);
      throw err;
    }
  }, [activeProject]);

  // Save zone definition to DB
  const saveZone = useCallback(async (zoneData: Partial<MapZoneDefinition>) => {
    try {
      const zoneId = zoneData.zoneId || zoneData.id || `zone_${Date.now()}`;
      const payload: MapZoneDefinition = {
        id: zoneId,
        zoneId,
        name: zoneData.name || 'Unnamed Zone',
        category: zoneData.category || 'GENERAL',
        hazardLevel: zoneData.hazardLevel || 'normal',
        capacity: zoneData.capacity || 10,
        siteId: zoneData.siteId || activeProject,
        x: zoneData.x ?? 50,
        y: zoneData.y ?? 50,
        width: zoneData.width ?? 20,
        height: zoneData.height ?? 20,
        polygonPoints: zoneData.polygonPoints,
        proximityAlertEnabled: zoneData.proximityAlertEnabled,
        aliasNames: zoneData.aliasNames || [zoneData.name || 'Unnamed Zone'],
        readerIds: zoneData.readerIds || [],
        antennaIds: zoneData.antennaIds || [1]
      };

      await fetch('/api/data/zones', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      setZones(prev => {
        const idx = prev.findIndex(z => z.zoneId === zoneId || z.id === zoneId);
        const next = idx >= 0 ? [...prev] : [...prev, payload];
        if (idx >= 0) next[idx] = payload;
        localStorage.setItem('gao_db_zones', JSON.stringify(next));
        return next;
      });
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    } catch (err) {
      console.error('[TrackingContext] Failed to save zone to DB:', err);
      throw err;
    }
  }, [activeProject]);

  // Delete zone definition from DB
  const deleteZone = useCallback(async (zoneId: string) => {
    try {
      await fetch(`/api/data/zones/${zoneId}`, { method: 'DELETE', headers: getAuthHeaders() });
      setZones(prev => {
        const next = prev.filter(z => z.zoneId !== zoneId && z.id !== zoneId);
        localStorage.setItem('gao_db_zones', JSON.stringify(next));
        return next;
      });
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
    } catch (err) {
      console.error('[TrackingContext] Failed to delete zone from DB:', err);
      throw err;
    }
  }, []);

  // Handler for normalized tag update
  const handleNormalizedTagUpdate = useCallback((tagUpdate: any) => {
    if (!tagUpdate) return;
    const tagId = String(tagUpdate.TagID || tagUpdate.tagId || tagUpdate.id || '').trim();
    if (!tagId) return;

    const locName = String(tagUpdate.Location || tagUpdate.LocationName || tagUpdate.zoneName || tagUpdate.zone || 'Tower Core').trim();
    const timestamp = tagUpdate.Timestamp || tagUpdate.timestamp || new Date().toISOString();
    const rssi = tagUpdate.rssi !== undefined ? Number(tagUpdate.rssi) : -65;
    const readerId = tagUpdate.readerId;

    // Resolve zone coordinates
    const matchedZone = getZoneByNameOrId(tagUpdate.zoneId || locName);
    let targetX = tagUpdate.x !== undefined ? tagUpdate.x : (matchedZone ? Math.round(matchedZone.x + matchedZone.width / 2) : 50);
    let targetY = tagUpdate.y !== undefined ? tagUpdate.y : (matchedZone ? Math.round(matchedZone.y + matchedZone.height / 2) : 50);

    const hashOffset = (tagId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % 7) - 3;
    targetX = Math.max(5, Math.min(95, targetX + hashOffset));
    targetY = Math.max(5, Math.min(95, targetY + hashOffset));

    const normalizedTag: RealtimeTag = {
      TagID: tagId,
      Timestamp: timestamp,
      Location: matchedZone ? matchedZone.name : locName,
      LocationName: matchedZone ? matchedZone.name : locName,
      zoneId: matchedZone ? matchedZone.zoneId : (tagUpdate.zoneId || undefined),
      zoneName: matchedZone ? matchedZone.name : locName,
      personName: tagUpdate.personName,
      personId: tagUpdate.personId,
      x: targetX,
      y: targetY,
      rssi,
      readerId
    };

    setLastUpdateTimestamp(timestamp);

    setLiveTags(prev => {
      const idx = prev.findIndex(t => t.TagID === tagId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = normalizedTag;
        return next;
      }
      return [normalizedTag, ...prev.slice(0, 49)];
    });

    setPeople(prev => {
      const personIdx = prev.findIndex(p => 
        p.hardhatTagId === tagId || 
        p.id === tagId || 
        (tagUpdate.personId && p.id === tagUpdate.personId) ||
        (tagUpdate.personName && p.name.toLowerCase() === tagUpdate.personName.toLowerCase())
      );

      if (personIdx >= 0) {
        const existing = prev[personIdx];
        const hasExplicitCoords = tagUpdate.x !== undefined && tagUpdate.y !== undefined;
        const updatedPerson = {
          ...existing,
          currentZone: matchedZone ? matchedZone.name : locName,
          x: hasExplicitCoords ? targetX : (existing.x || targetX),
          y: hasExplicitCoords ? targetY : (existing.y || targetY),
          rssi,
          lastReader: readerId || existing.lastReader,
          lastSeen: new Date(timestamp)
        };

        const nextPeople = [...prev];
        nextPeople[personIdx] = updatedPerson;
        return nextPeople;
      } else {
        const newPerson: Person = {
          id: tagUpdate.personId || `P-${tagId}`,
          name: tagUpdate.personName || `Worker (Tag ${tagId.slice(-4)})`,
          role: 'Field Personnel',
          tradeCompany: 'Site Contractor',
          ppeStatus: 'COMPLIANT',
          shiftStatus: 'ON_SITE',
          trainingStatus: 'COMPLIANT',
          hardhatTagId: tagId,
          currentZone: matchedZone ? matchedZone.name : locName,
          presenceState: 'IDLE',
          dwellTime: 1,
          x: targetX,
          y: targetY,
          rssi,
          lastReader: readerId,
          photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120',
          lastSeen: new Date(timestamp),
          trail: [{ x: targetX, y: targetY }]
        };

        // Persist new RFID worker detection to MongoDB Atlas
        setDoc(doc(db, 'people', newPerson.id), {
          ...newPerson,
          lastSeen: new Date(timestamp).toISOString()
        }, { merge: true }).catch(() => {});

        return [...prev, newPerson];
      }
    });
  }, [getZoneByNameOrId]);

  // Refresh live state on demand
  const refreshLiveState = useCallback(async () => {
    try {
      const tags = await gaoApi.getTagsInRealtime();
      if (Array.isArray(tags)) {
        for (const t of tags) {
          handleNormalizedTagUpdate(t);
        }
      }
    } catch (err) {
      console.warn('[TrackingContext] Real-time tag refresh notice:', err);
    }
  }, [handleNormalizedTagUpdate]);

  // Manual RFID scan reporting
  const reportManualScan = useCallback(async (tagId: string, location: string, name?: string) => {
    try {
      const payload = {
        TagID: tagId,
        Location: location,
        name: name || 'Manual Worker',
        timestamp: new Date().toISOString()
      };

      await fetch('/api/rfid/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      handleNormalizedTagUpdate(payload);
    } catch (err) {
      console.error('[TrackingContext] Manual scan report error:', err);
    }
  }, [handleNormalizedTagUpdate]);

  // Central WebSocket connection management
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isCleanedUp = false;

    const connectWebSocket = () => {
      if (isCleanedUp) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          ws?.send(JSON.stringify({
            type: mode === 'demo' ? 'enable_demo_mode' : 'disable_demo_mode',
            payload: { mode }
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const msgType = (data.type || '').toLowerCase();

            if (msgType === 'tag_update' || msgType === 'rfid_scan' || msgType === 'tag_location_update') {
              handleNormalizedTagUpdate(data.payload || data);
            } else if (msgType === 'synthetic_rfid_scan' || msgType === 'demo_tag_update') {
              if (mode === 'demo') {
                handleNormalizedTagUpdate(data.payload || data);
              }
            } else if (msgType === 'GetTagsInRealtime_response') {
              if (Array.isArray(data.payload)) {
                for (const item of data.payload) {
                  handleNormalizedTagUpdate(item);
                }
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!isCleanedUp) {
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (!isCleanedUp) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 4000);
        }
      }
    };

    // Real-time MongoDB Atlas Firestore listeners for site assets & infrastructure
    const unsubAssets = onSnapshot(collection(db, 'assets'), (snap) => {
      const items: any[] = snap.docs.map(docSnap => docSnap.data());
      if (items.length > 0) {
        setAssets(items);
        localStorage.setItem('gao_db_assets', JSON.stringify(items));
      }
    });

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap) => {
      const items: any[] = snap.docs.map(docSnap => docSnap.data());
      if (items.length > 0) {
        setVehicles(items);
        localStorage.setItem('gao_db_vehicles', JSON.stringify(items));
      }
    });

    const unsubCameras = onSnapshot(collection(db, 'cameras'), (snap) => {
      const items: any[] = snap.docs.map(docSnap => docSnap.data());
      if (items.length > 0) setCameras(items);
    });

    const unsubSensors = onSnapshot(collection(db, 'sensors'), (snap) => {
      const items: any[] = snap.docs.map(docSnap => docSnap.data());
      if (items.length > 0) setEnvSensors(items);
    });

    connectWebSocket();
    loadDatabaseConfig();

    return () => {
      isCleanedUp = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws) ws.close();
      unsubAssets();
      unsubVehicles();
      unsubCameras();
      unsubSensors();
    };
  }, [loadDatabaseConfig, handleNormalizedTagUpdate, mode]);

  // Periodic fallback polling in real mode
  useEffect(() => {
    const pollInterval = setInterval(() => {
      refreshLiveState();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [refreshLiveState]);

  // 10-second Single-Worker Rotating Movement Engine
  // 1 worker moves for 10 seconds to a different zone point while all other workers rest (IDLE).
  // Then the next worker takes their 10-second turn, and so on.
  useEffect(() => {
    let activeWorkerIndex = 0;
    let ticksInCycle = 0;
    const TICKS_PER_CYCLE = 100; // 100 ticks * 100ms = 10,000ms (10 seconds)
    let isInitialized = false;

    const moveInterval = setInterval(() => {
      ticksInCycle += 1;
      const isNewTurn = ticksInCycle >= TICKS_PER_CYCLE;

      setPeople(prevPeople => {
        if (!prevPeople || prevPeople.length === 0) return prevPeople;

        if (isNewTurn || !isInitialized) {
          if (isNewTurn) {
            ticksInCycle = 0;
            activeWorkerIndex = (activeWorkerIndex + 1) % prevPeople.length;
          }
          isInitialized = true;
        }

        const safeIndex = activeWorkerIndex % prevPeople.length;

        return prevPeople.map((p, idx) => {
          const isMover = idx === safeIndex;

          if (!isMover) {
            // Worker is resting in their current zone
            return {
              ...p,
              presenceState: 'IDLE' as const,
              speed: 0,
              dwellTime: (p.dwellTime || 0) + 1,
              lastSeen: new Date()
            };
          }

          // Active Mover: At the start of their 10s turn, pick a new destination zone different from current
          let startX = (p as any).startX;
          let startY = (p as any).startY;
          let targetX = (p as any).targetX;
          let targetY = (p as any).targetY;
          let targetZone = (p as any).targetZone;

          if (ticksInCycle === 1 || startX === undefined || targetX === undefined || !targetZone) {
            startX = typeof p.x === 'number' ? p.x : 50;
            startY = typeof p.y === 'number' ? p.y : 50;

            const currentZoneName = p.currentZone || '';
            const eligibleZones = SITE_ZONE_WAYPOINTS.filter(
              z => z.name.toLowerCase() !== currentZoneName.toLowerCase()
            );
            const chosenZone = eligibleZones.length > 0
              ? eligibleZones[Math.floor(Math.random() * eligibleZones.length)]
              : SITE_ZONE_WAYPOINTS[Math.floor(Math.random() * SITE_ZONE_WAYPOINTS.length)];

            // Destination coordinate strictly clamped inside zone boundary box
            targetZone = chosenZone.name;
            targetX = Math.round((chosenZone.minX + Math.random() * (chosenZone.maxX - chosenZone.minX)) * 10) / 10;
            targetY = Math.round((chosenZone.minY + Math.random() * (chosenZone.maxY - chosenZone.minY)) * 10) / 10;
          }

          // Interpolate progress across the 100 ticks (10.0 seconds)
          const progress = Math.min(1.0, Math.max(0.0, ticksInCycle / TICKS_PER_CYCLE));
          // Smooth easeInOut sine interpolation for organic human walking
          const easeProgress = 0.5 - Math.cos(progress * Math.PI) / 2;

          const currX = startX + (targetX - startX) * easeProgress;
          const currY = startY + (targetY - startY) * easeProgress;

          const dx = targetX - startX;
          const dy = targetY - startY;
          const heading = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
          const isArrived = progress >= 0.99;

          return {
            ...p,
            x: Math.round(currX * 100) / 100,
            y: Math.round(currY * 100) / 100,
            startX,
            startY,
            targetX,
            targetY,
            targetZone,
            currentZone: progress >= 0.5 ? targetZone : p.currentZone,
            heading,
            speed: isArrived ? 0 : 1.4,
            presenceState: isArrived ? ('IDLE' as const) : ('MOVING' as const),
            dwellTime: isArrived ? (p.dwellTime || 0) + 1 : 0,
            lastSeen: new Date()
          };
        });
      });
    }, 100);

    return () => clearInterval(moveInterval);
  }, []);

  // Listen to cross-tab/cross-component map updates
  useEffect(() => {
    const handleStorageOrDataUpdate = () => {
      try {
        const savedAssets = localStorage.getItem('gao_db_assets');
        if (savedAssets) setAssets(JSON.parse(savedAssets));

        const savedVehicles = localStorage.getItem('gao_db_vehicles');
        if (savedVehicles) setVehicles(JSON.parse(savedVehicles));

        const savedCameras = localStorage.getItem('gao_db_cameras');
        if (savedCameras) setCameras(JSON.parse(savedCameras));

        const savedSensors = localStorage.getItem('gao_db_sensors');
        if (savedSensors) setEnvSensors(JSON.parse(savedSensors));

        const savedZones = localStorage.getItem('gao_db_zones');
        if (savedZones) setZones(JSON.parse(savedZones));

        const savedFloorplan = localStorage.getItem('gao_custom_floorplan');
        if (savedFloorplan !== null) setCustomFloorplanState(savedFloorplan);

        const savedSvg = localStorage.getItem('gao_custom_svg_source');
        if (savedSvg !== null) setCustomSvgSourceState(savedSvg);
      } catch {}
    };

    window.addEventListener('gao_map_data_updated', handleStorageOrDataUpdate);
    window.addEventListener('storage', handleStorageOrDataUpdate);

    return () => {
      window.removeEventListener('gao_map_data_updated', handleStorageOrDataUpdate);
      window.removeEventListener('storage', handleStorageOrDataUpdate);
    };
  }, []);

  return (
    <TrackingContext.Provider
      value={{
        activeProject,
        setActiveProject,
        mode,
        setMode,
        wsConnected,
        liveTags,
        people,
        assets,
        vehicles,
        cameras,
        envSensors,
        infrastructure,
        zones,
        zonesDict,
        readerMappings,
        mapConfig,
        customFloorplan,
        customSvgSource,
        isLoading,
        lastUpdateTimestamp,
        saveMapConfig,
        saveZone,
        deleteZone,
        saveCustomZones,
        saveAsset,
        deleteAsset,
        saveVehicle,
        deleteVehicle,
        saveCamera,
        deleteCamera,
        saveEnvSensor,
        deleteEnvSensor,
        saveInfrastructure,
        deleteInfrastructure,
        setCustomFloorplan,
        setCustomSvgSource,
        getZoneByNameOrId,
        refreshLiveState,
        reportManualScan
      }}
    >
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const context = useContext(TrackingContext);
  if (!context) {
    throw new Error('useTracking must be used within a TrackingProvider');
  }
  return context;
}

