import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc, collection, onSnapshot, db } from '../lib/db';
import { Person } from '../types';
import { RealtimeTag, gaoApi } from '../lib/gaoApi';
import { 
  AssetItem, VehicleItem, CCTVCameraItem, EnvironmentalSensorItem, InfrastructureItem
} from '../lib/trackingLayers';
import { ZoneBounds } from '../components/MapEditorModal';
import { IndustryConfig, IndustryTerminology, INDUSTRY_PRESETS } from '../constants/industryPresets';
import { 
  IndustryIntelligenceProfile, 
  INDUSTRY_PRESET_PROFILES, 
  IndustryType 
} from '../types/industryIntelligence';
import { safeStorage } from '../lib/safeStorage';

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
  // Dynamic Industry & Terminology
  industryConfig: IndustryConfig;
  setIndustryConfig: React.Dispatch<React.SetStateAction<IndustryConfig>>;
  updateIndustryConfig: (cfg: Partial<IndustryConfig>) => Promise<void>;
  applyIndustryPreset: (presetId: string) => Promise<void>;
  intelligenceProfile: IndustryIntelligenceProfile;
  setIntelligenceProfile: React.Dispatch<React.SetStateAction<IndustryIntelligenceProfile>>;
  updateIntelligenceProfile: (profile: Partial<IndustryIntelligenceProfile>) => Promise<void>;
  applyIntelligencePreset: (industry: IndustryType) => Promise<void>;
  t: (key: keyof IndustryTerminology | string, fallback?: string) => string;
  customRoles: string[];
  saveRoles: (roles: string[]) => Promise<void>;
  customSubcontractors: string[];
  saveSubcontractors: (subs: string[]) => Promise<void>;
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

export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<string>(() => {
    return localStorage.getItem('gao_active_project') || 'metro-tower';
  });

  const [industryConfig, setIndustryConfig] = useState<IndustryConfig>(() => {
    try {
      const saved = localStorage.getItem('gao_industry_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.industryId && parsed.terminology) return parsed;
      }
    } catch {}
    return INDUSTRY_PRESETS.construction;
  });

  const [intelligenceProfile, setIntelligenceProfile] = useState<IndustryIntelligenceProfile>(() => {
    try {
      const saved = localStorage.getItem('gao_intelligence_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.industry) return parsed;
      }
    } catch {}
    const preset = INDUSTRY_PRESET_PROFILES[industryConfig.industryId as IndustryType] || INDUSTRY_PRESET_PROFILES.construction;
    return {
      ...preset,
      tenantId: 'default'
    };
  });

  const [customRoles, setCustomRoles] = useState<string[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_custom_roles');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return industryConfig.defaultRoles || INDUSTRY_PRESETS.construction.defaultRoles;
  });

  const [customSubcontractors, setCustomSubcontractors] = useState<string[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_custom_subcontractors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return industryConfig.defaultDepartments || INDUSTRY_PRESETS.construction.defaultDepartments;
  });

  const [wsConnected, setWsConnected] = useState(false);
  const [liveTags, setLiveTags] = useState<RealtimeTag[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  // Real-time listener for MongoDB Industry Configuration
  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'settings', 'industry_config'), (snap) => {
        if (snap.exists()) {
          const remoteData = snap.data() as IndustryConfig;
          if (remoteData && remoteData.industryId) {
            setIndustryConfig(prev => {
              const merged: IndustryConfig = {
                ...prev,
                ...remoteData,
                terminology: {
                  ...prev.terminology,
                  ...(remoteData.terminology || {})
                }
              };
              safeStorage.setItem('gao_industry_config', JSON.stringify(merged));
              return merged;
            });
            if (remoteData.defaultRoles && Array.isArray(remoteData.defaultRoles)) {
              setCustomRoles(remoteData.defaultRoles);
              safeStorage.setItem('gao_custom_roles', JSON.stringify(remoteData.defaultRoles));
            }
            if (remoteData.defaultDepartments && Array.isArray(remoteData.defaultDepartments)) {
              setCustomSubcontractors(remoteData.defaultDepartments);
              safeStorage.setItem('gao_custom_subcontractors', JSON.stringify(remoteData.defaultDepartments));
            }
          }
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn('[TrackingContext] Firestore/MongoDB settings listener:', e);
    }
  }, []);

  // Fetch Industry Config from Backend REST on Mount
  useEffect(() => {
    const fetchIndustrySettings = async () => {
      try {
        const res = await fetch('/api/data/settings/industry_config', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data && data.industryId) {
            setIndustryConfig(data);
            safeStorage.setItem('gao_industry_config', JSON.stringify(data));
            if (data.defaultRoles) {
              setCustomRoles(data.defaultRoles);
              safeStorage.setItem('gao_custom_roles', JSON.stringify(data.defaultRoles));
            }
            if (data.defaultDepartments) {
              setCustomSubcontractors(data.defaultDepartments);
              safeStorage.setItem('gao_custom_subcontractors', JSON.stringify(data.defaultDepartments));
            }
          }
        }
      } catch {}
    };
    fetchIndustrySettings();
  }, []);

  // Fetch B2B Industry Intelligence Profile on Mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/intelligence/profile', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data && data.profile) {
            setIntelligenceProfile(data.profile);
            safeStorage.setItem('gao_intelligence_profile', JSON.stringify(data.profile));
          }
        }
      } catch {}
    };
    fetchProfile();
  }, []);

  // Dynamic Industry Intelligence Engine Profile Handlers
  const updateIntelligenceProfile = useCallback(async (profileUpdate: Partial<IndustryIntelligenceProfile>) => {
    setIntelligenceProfile(prev => {
      const next: IndustryIntelligenceProfile = {
        ...prev,
        ...profileUpdate,
        updatedAt: new Date().toISOString()
      };
      safeStorage.setItem('gao_intelligence_profile', JSON.stringify(next));
      return next;
    });

    try {
      await fetch('/api/intelligence/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(profileUpdate)
      });
    } catch (e) {
      console.warn('[TrackingContext] Failed to persist intelligence profile to backend:', e);
    }
  }, []);

  const applyIntelligencePreset = useCallback(async (industry: IndustryType) => {
    const preset = INDUSTRY_PRESET_PROFILES[industry] || INDUSTRY_PRESET_PROFILES.construction;
    const fullProfile: IndustryIntelligenceProfile = {
      ...preset,
      tenantId: 'default',
      updatedAt: new Date().toISOString()
    };
    setIntelligenceProfile(fullProfile);
    safeStorage.setItem('gao_intelligence_profile', JSON.stringify(fullProfile));

    try {
      await fetch('/api/intelligence/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(fullProfile)
      });
    } catch (e) {
      console.warn('[TrackingContext] Failed to apply intelligence preset:', e);
    }
  }, []);

  // Terminology helper: t('personnelSingular') -> returns e.g. "Nurse", "Miner", "Worker"
  const t = useCallback((key: keyof IndustryTerminology | string, fallback?: string): string => {
    if (industryConfig?.terminology && (key in industryConfig.terminology)) {
      return (industryConfig.terminology as any)[key] || fallback || key;
    }
    return fallback || key;
  }, [industryConfig]);

  // Update and persist industry configuration
  const updateIndustryConfig = useCallback(async (cfg: Partial<IndustryConfig>) => {
    setIndustryConfig(prev => {
      const next: IndustryConfig = {
        ...prev,
        ...cfg,
        terminology: {
          ...prev.terminology,
          ...(cfg.terminology || {})
        },
        updatedAt: new Date().toISOString()
      };
      safeStorage.setItem('gao_industry_config', JSON.stringify(next));
      return next;
    });

    try {
      await setDoc(doc(db, 'settings', 'industry_config'), cfg, { merge: true });
      await fetch('/api/data/settings/industry_config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(cfg)
      });
      // Also notify AI endpoints of updated persona
      await fetch('/api/ai/update-industry', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          industryId: cfg.industryId || industryConfig.industryId,
          personaPrompt: cfg.aiPersonaPrompt || industryConfig.aiPersonaPrompt,
          complianceFramework: cfg.complianceFramework || industryConfig.complianceFramework
        })
      }).catch(() => {});
    } catch (e) {
      console.warn('[TrackingContext] Failed to persist industry config to MongoDB:', e);
    }
  }, [industryConfig]);

  // 1-Click Apply Industry Preset
  const applyIndustryPreset = useCallback(async (presetId: string) => {
    const preset = INDUSTRY_PRESETS[presetId] || INDUSTRY_PRESETS.construction;
    const fullConfig: IndustryConfig = {
      ...preset,
      updatedAt: new Date().toISOString()
    };
    setIndustryConfig(fullConfig);
    safeStorage.setItem('gao_industry_config', JSON.stringify(fullConfig));
    setCustomRoles(fullConfig.defaultRoles);
    safeStorage.setItem('gao_custom_roles', JSON.stringify(fullConfig.defaultRoles));

    try {
      await setDoc(doc(db, 'settings', 'industry_config'), fullConfig);
      await fetch('/api/data/settings/industry_config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(fullConfig)
      });
      // Also update global settings app title & site
      await setDoc(doc(db, 'settings', 'global'), {
        companyName: fullConfig.appTitle,
        siteLocation: fullConfig.primarySiteName,
        complianceFrameworks: fullConfig.complianceFramework
      }, { merge: true });

      // Notify AI server
      await fetch('/api/ai/update-industry', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          industryId: fullConfig.industryId,
          personaPrompt: fullConfig.aiPersonaPrompt,
          complianceFramework: fullConfig.complianceFramework
        })
      }).catch(() => {});
    } catch (e) {
      console.warn('[TrackingContext] Apply preset DB error:', e);
    }
  }, []);

  const saveRoles = useCallback(async (roles: string[]) => {
    setCustomRoles(roles);
    safeStorage.setItem('gao_custom_roles', JSON.stringify(roles));
    await updateIndustryConfig({ defaultRoles: roles });
  }, [updateIndustryConfig]);

  const saveSubcontractors = useCallback(async (subs: string[]) => {
    setCustomSubcontractors(subs);
    safeStorage.setItem('gao_custom_subcontractors', JSON.stringify(subs));
    await updateIndustryConfig({ defaultDepartments: subs });
  }, [updateIndustryConfig]);

  // Entities initialized from persistent MongoDB storage
  const [assets, setAssets] = useState<AssetItem[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_db_assets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [vehicles, setVehicles] = useState<VehicleItem[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_db_vehicles');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [cameras, setCameras] = useState<CCTVCameraItem[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_db_cameras');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [envSensors, setEnvSensors] = useState<EnvironmentalSensorItem[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_db_sensors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [infrastructure, setInfrastructure] = useState<InfrastructureItem[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_db_infrastructure');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [zones, setZones] = useState<MapZoneDefinition[]>(() => {
    try {
      const saved = safeStorage.getItem('gao_db_zones');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [customFloorplan, setCustomFloorplanState] = useState<string | null>(() => {
    return safeStorage.getItem('gao_custom_floorplan') || null;
  });

  const [customSvgSource, setCustomSvgSourceState] = useState<string | null>(() => {
    return safeStorage.getItem('gao_custom_svg_source') || null;
  });

  const [readerMappings, setReaderMappings] = useState<ReaderZoneMapping[]>([]);
  const [mapConfig, setMapConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const setActiveProject = useCallback((id: string) => {
    setActiveProjectState(id);
    safeStorage.setItem('gao_active_project', id);
  }, []);

  const setCustomFloorplan = useCallback((url: string | null) => {
    setCustomFloorplanState(url);
    if (url) {
      safeStorage.setItem('gao_custom_floorplan', url);
    } else {
      safeStorage.removeItem('gao_custom_floorplan');
    }
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  const setCustomSvgSource = useCallback((svg: string | null) => {
    setCustomSvgSourceState(svg);
    if (svg) {
      safeStorage.setItem('gao_custom_svg_source', svg);
    } else {
      safeStorage.removeItem('gao_custom_svg_source');
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
    safeStorage.setItem('gao_db_zones', JSON.stringify(zoneDefinitions));

    if (newFloorplanUrl !== undefined) {
      setCustomFloorplanState(newFloorplanUrl);
      if (newFloorplanUrl) safeStorage.setItem('gao_custom_floorplan', newFloorplanUrl);
      else safeStorage.removeItem('gao_custom_floorplan');
    }

    if (newSvgSource !== undefined) {
      setCustomSvgSourceState(newSvgSource);
      if (newSvgSource) safeStorage.setItem('gao_custom_svg_source', newSvgSource);
      else safeStorage.removeItem('gao_custom_svg_source');
    }

    try {
      await fetch('/api/data/zones/batch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          zones: zoneDefinitions,
          floorplanUrl: newFloorplanUrl,
          svgSource: newSvgSource
        })
      });
    } catch {}

    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, [activeProject]);

  const saveZone = useCallback(async (zone: Partial<MapZoneDefinition>) => {
    if (!zone.name && !zone.zoneId) return;
    const zoneId = zone.zoneId || `zone_${(zone.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const completeZone: MapZoneDefinition = {
      id: zone.id || zoneId,
      zoneId,
      name: zone.name || zoneId,
      category: zone.category || 'GENERAL',
      hazardLevel: zone.hazardLevel || 'normal',
      capacity: zone.capacity || 10,
      siteId: zone.siteId || activeProject,
      x: zone.x ?? 10,
      y: zone.y ?? 10,
      width: zone.width ?? 20,
      height: zone.height ?? 20,
      readerIds: zone.readerIds || [],
      antennaIds: zone.antennaIds || [],
      polygonPoints: zone.polygonPoints,
      proximityAlertEnabled: zone.proximityAlertEnabled
    };

    setZones(prev => {
      const idx = prev.findIndex(z => z.id === completeZone.id || z.zoneId === completeZone.zoneId);
      const next = idx >= 0 ? [...prev] : [...prev, completeZone];
      if (idx >= 0) next[idx] = completeZone;
      safeStorage.setItem('gao_db_zones', JSON.stringify(next));
      return next;
    });

    try {
      await fetch('/api/data/zones', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(completeZone)
      });
    } catch {}

    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, [activeProject]);

  const deleteZone = useCallback(async (zoneId: string) => {
    setZones(prev => {
      const next = prev.filter(z => z.id !== zoneId && z.zoneId !== zoneId);
      safeStorage.setItem('gao_db_zones', JSON.stringify(next));
      return next;
    });
    try {
      await fetch(`/api/data/zones/${zoneId}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {}
    window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
  }, []);

  // Asset CRUD
  const saveAsset = useCallback(async (item: AssetItem) => {
    setAssets(prev => {
      const idx = prev.findIndex(a => a.id === item.id);
      const next = idx >= 0 ? [...prev] : [item, ...prev];
      if (idx >= 0) next[idx] = item;
      safeStorage.setItem('gao_db_assets', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_assets', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_vehicles', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_vehicles', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_cameras', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_cameras', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_sensors', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_sensors', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_infrastructure', JSON.stringify(next));
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
      safeStorage.setItem('gao_db_infrastructure', JSON.stringify(next));
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
      const [zonesRes, mapRes, readersRes, assetsRes, vehiclesRes, peopleRes, visitorsRes, camerasRes, sensorsRes, infraRes, liveTagsRes] = await Promise.allSettled([
        fetch('/api/data/zones', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch(`/api/data/map_configurations/${activeProject}`, { headers: authHeaders }).then(r => r.ok ? r.json() : null),
        fetch('/api/data/reader_zone_mappings', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/assets', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/vehicles', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/registered_people', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/visitors', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/cameras', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/sensors', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/infrastructure', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
        fetch('/api/data/live_tags', { headers: authHeaders }).then(r => r.ok ? r.json() : [])
      ]);

      if (zonesRes.status === 'fulfilled' && Array.isArray(zonesRes.value)) {
        setZones(zonesRes.value);
        safeStorage.setItem('gao_db_zones', JSON.stringify(zonesRes.value));
      }

      if (mapRes.status === 'fulfilled' && mapRes.value) {
        setMapConfig(mapRes.value);
        if (mapRes.value.floorplanUrl) {
          setCustomFloorplanState(mapRes.value.floorplanUrl);
          safeStorage.setItem('gao_custom_floorplan', mapRes.value.floorplanUrl);
        }
        if (mapRes.value.svgSource) {
          setCustomSvgSourceState(mapRes.value.svgSource);
          safeStorage.setItem('gao_custom_svg_source', mapRes.value.svgSource);
        }
      }

      if (readersRes.status === 'fulfilled' && Array.isArray(readersRes.value)) {
        setReaderMappings(readersRes.value);
      }

      if (assetsRes.status === 'fulfilled' && Array.isArray(assetsRes.value)) {
        setAssets(assetsRes.value);
        safeStorage.setItem('gao_db_assets', JSON.stringify(assetsRes.value));
      }

      if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value)) {
        setVehicles(vehiclesRes.value);
        safeStorage.setItem('gao_db_vehicles', JSON.stringify(vehiclesRes.value));
      }

      if (camerasRes.status === 'fulfilled' && Array.isArray(camerasRes.value)) {
        setCameras(camerasRes.value);
        safeStorage.setItem('gao_db_cameras', JSON.stringify(camerasRes.value));
      }

      if (sensorsRes.status === 'fulfilled' && Array.isArray(sensorsRes.value)) {
        setEnvSensors(sensorsRes.value);
        safeStorage.setItem('gao_db_sensors', JSON.stringify(sensorsRes.value));
      }

      if (infraRes.status === 'fulfilled' && Array.isArray(infraRes.value)) {
        setInfrastructure(infraRes.value);
        safeStorage.setItem('gao_db_infrastructure', JSON.stringify(infraRes.value));
      }

      const rawPeople = (peopleRes.status === 'fulfilled' && Array.isArray(peopleRes.value))
        ? peopleRes.value
        : [];
        
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

      if (liveTagsRes.status === 'fulfilled' && Array.isArray(liveTagsRes.value)) {
        liveTagsRes.value.forEach((tag: any) => {
          handleNormalizedTagUpdate(tag);
        });
      }
    } catch (err) {
      console.warn('[TrackingContext] Initial config load error:', err);
      setPeople([]);
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
          lastSeen: new Date(timestamp),
          trail: [{ x: targetX, y: targetY }]
        };

        // Return UI in-memory representation without writing to people collection
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

  const handleTagUpdateRef = useRef(handleNormalizedTagUpdate);
  useEffect(() => {
    handleTagUpdateRef.current = handleNormalizedTagUpdate;
  }, [handleNormalizedTagUpdate]);

  const refreshLiveStateRef = useRef(refreshLiveState);
  useEffect(() => {
    refreshLiveStateRef.current = refreshLiveState;
  }, [refreshLiveState]);

  // Initial load of database entities (runs on mount and when activeProject changes)
  useEffect(() => {
    loadDatabaseConfig();
  }, [loadDatabaseConfig]);

  // Central WebSocket connection management (mounted once, auto-reconnects on drop)
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
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const msgType = (data.type || '').toLowerCase();

            if (msgType === 'tag_update' || msgType === 'rfid_scan' || msgType === 'tag_location_update') {
              handleTagUpdateRef.current(data.payload || data);
            } else if (msgType === 'gettagsinrealtime_response') {
              if (Array.isArray(data.payload)) {
                for (const item of data.payload) {
                  handleTagUpdateRef.current(item);
                }
              }
            } else if (msgType === 'data_updated' || msgType === 'tag_update_bulk' || msgType === 'analytics_updated') {
              window.dispatchEvent(new CustomEvent('gao_refresh_data'));
              window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
              refreshLiveStateRef.current();
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!isCleanedUp) {
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, 4000);
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

    connectWebSocket();

    return () => {
      isCleanedUp = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws) ws.close();
    };
  }, []);

  // Real-time MongoDB Atlas listeners for site assets & infrastructure (mounted once)
  useEffect(() => {
    const unsubAssets = onSnapshot(collection(db, 'assets'), (snap) => {
      const items: any[] = snap.docs.map(docSnap => docSnap.data());
      if (items.length > 0) {
        setAssets(items);
        safeStorage.setItem('gao_db_assets', JSON.stringify(items));
      }
    });

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap) => {
      const items: any[] = snap.docs.map(docSnap => docSnap.data());
      if (items.length > 0) {
        setVehicles(items);
        safeStorage.setItem('gao_db_vehicles', JSON.stringify(items));
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

    return () => {
      unsubAssets();
      unsubVehicles();
      unsubCameras();
      unsubSensors();
    };
  }, []);

  // Periodic fallback polling in real mode (only when WebSocket is NOT connected)
  useEffect(() => {
    if (wsConnected) return;

    const pollInterval = setInterval(() => {
      refreshLiveStateRef.current();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [wsConnected]);

  // No automatic movement simulation: positions & events are exclusively driven by real MongoDB records / real RFID & GPS hardware feeds.

  // Listen to cross-tab/cross-component map updates
  useEffect(() => {
    const handleStorageOrDataUpdate = () => {
      try {
        const savedAssets = safeStorage.getItem('gao_db_assets');
        if (savedAssets) setAssets(JSON.parse(savedAssets));

        const savedVehicles = safeStorage.getItem('gao_db_vehicles');
        if (savedVehicles) setVehicles(JSON.parse(savedVehicles));

        const savedCameras = safeStorage.getItem('gao_db_cameras');
        if (savedCameras) setCameras(JSON.parse(savedCameras));

        const savedSensors = safeStorage.getItem('gao_db_sensors');
        if (savedSensors) setEnvSensors(JSON.parse(savedSensors));

        const savedZones = safeStorage.getItem('gao_db_zones');
        if (savedZones) setZones(JSON.parse(savedZones));

        const savedFloorplan = safeStorage.getItem('gao_custom_floorplan');
        if (savedFloorplan !== null) setCustomFloorplanState(savedFloorplan);

        const savedSvg = safeStorage.getItem('gao_custom_svg_source');
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
        industryConfig,
        setIndustryConfig,
        updateIndustryConfig,
        applyIndustryPreset,
        intelligenceProfile,
        setIntelligenceProfile,
        updateIntelligenceProfile,
        applyIntelligencePreset,
        t,
        customRoles,
        saveRoles,
        customSubcontractors,
        saveSubcontractors,
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

export function useTerminology() {
  const { 
    industryConfig, 
    intelligenceProfile, 
    updateIntelligenceProfile, 
    applyIntelligencePreset, 
    t, 
    updateIndustryConfig, 
    applyIndustryPreset, 
    customRoles, 
    saveRoles, 
    customSubcontractors, 
    saveSubcontractors 
  } = useTracking();
  return {
    ...industryConfig.terminology,
    t,
    config: industryConfig,
    intelligenceProfile,
    updateIntelligenceProfile,
    applyIntelligencePreset,
    roles: customRoles,
    saveRoles,
    subcontractors: customSubcontractors,
    saveSubcontractors,
    updateConfig: updateIndustryConfig,
    applyPreset: applyIndustryPreset
  };
}


