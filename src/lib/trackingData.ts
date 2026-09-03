import { useState, useEffect, useRef } from 'react';
import { gaoApi, RealtimeTag } from './gaoApi';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, db } from './db';
import { Person, Asset, Vehicle, AIAlert, PresenceState } from '../types';

export type { Person, Asset, Vehicle, AIAlert, PresenceState };
export type Zone = 'People Tracking in Construction';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface DbErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

function handleDbError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: DbErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.warn('Database Operation Notice: ', JSON.stringify(errInfo));
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

export const INITIAL_PROJECT_ZONES: Record<string, Record<string, { x: number; y: number; width: number; height: number }>> = {
  'metro-tower': {
    'Material Storage': { x: 6.5, y: 8.0, width: 23.5, height: 21.5 },
    'Structure Work Area': { x: 36.5, y: 8.0, width: 26.0, height: 21.5 },
    'Crane Operating Zone': { x: 69.0, y: 8.0, width: 24.5, height: 21.5 },
    'Site Office': { x: 6.5, y: 38.0, width: 23.5, height: 21.5 },
    'Open Work Area': { x: 36.5, y: 38.0, width: 26.0, height: 21.5 },
    'Equipment Parking': { x: 69.0, y: 38.0, width: 24.5, height: 21.5 },
    'Excavation Area': { x: 6.5, y: 68.0, width: 23.5, height: 21.5 },
    'Assembly Point': { x: 36.5, y: 68.0, width: 26.0, height: 21.5 },
    'High Voltage Area': { x: 69.0, y: 68.0, width: 24.5, height: 21.5 }
  },
  'highrise-phase2': {
    'Structural Frame Sector A': { x: 18, y: 22, width: 30, height: 56 },
    'Structural Frame Sector B': { x: 52, y: 22, width: 30, height: 56 },
    'Exterior Scaffolding Perimeter': { x: 15, y: 15, width: 70, height: 70 }
  }
};

export function getZonesForProject(projectId: string): string[] {
  try {
    const saved = localStorage.getItem('gao_project_properties');
    if (saved) {
      const parsed = JSON.parse(saved);
      const proj = parsed[projectId];
      if (proj && proj.customZones) {
        const keys = Object.keys(proj.customZones);
        if (keys.length > 0) return keys;
      }
    }
  } catch (e) {
    console.warn('Failed to read custom zones from localStorage:', e);
  }

  const staticZones = INITIAL_PROJECT_ZONES[projectId];
  if (staticZones) {
    return Object.keys(staticZones);
  }
  return ['People Tracking in Construction'];
}



export function normalizeZoneName(location?: string | null, projectId: string = 'metro-tower', dynamicZones?: Record<string, any>): string {
  if (!location) return 'People Tracking in Construction';
  const cleanLoc = location.trim();
  const cleanLocLower = cleanLoc.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Check dynamicZones first
  if (dynamicZones && Object.keys(dynamicZones).length > 0) {
    const matched = Object.keys(dynamicZones).find(z => {
      const zLower = z.toLowerCase().replace(/[^a-z0-9]/g, '');
      return zLower === cleanLocLower || zLower.includes(cleanLocLower) || cleanLocLower.includes(zLower);
    });
    if (matched) return matched;
  }

  const zones = getZonesForProject(projectId);
  if (zones.includes(cleanLoc)) {
    return cleanLoc;
  }
  const matched = zones.find(z => {
    const zLower = z.toLowerCase().replace(/[^a-z0-9]/g, '');
    return zLower === cleanLocLower || zLower.includes(cleanLocLower) || cleanLocLower.includes(zLower);
  });
  if (matched) return matched;

  return cleanLoc || zones[0] || 'People Tracking in Construction';
}

const DEFAULT_ROOM_BOUNDS: Record<string, { x: number; y: number; width: number; height: number }> = {
  'People Tracking in Construction': { x: 5, y: 5, width: 90, height: 90 }
};

export function getZoneRect(zoneName: string, projectId: string = 'metro-tower', dynamicZones?: Record<string, any>) {
  const cleanNameLower = (zoneName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (dynamicZones && Object.keys(dynamicZones).length > 0) {
    if (dynamicZones[zoneName]) return dynamicZones[zoneName];
    const match = Object.entries(dynamicZones).find(([k]) => {
      const kLower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return kLower === cleanNameLower || kLower.includes(cleanNameLower) || cleanNameLower.includes(kLower);
    });
    if (match) return match[1];
  }

  try {
    const saved = localStorage.getItem('gao_project_properties');
    if (saved) {
      const parsed = JSON.parse(saved);
      const proj = parsed[projectId];
      if (proj && proj.customZones) {
        if (proj.customZones[zoneName]) return proj.customZones[zoneName];
        const match = Object.entries(proj.customZones).find(([k]) => {
          const kLower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          return kLower === cleanNameLower || kLower.includes(cleanNameLower) || cleanNameLower.includes(kLower);
        });
        if (match) return match[1];
      }
    }
  } catch (e) {
    console.warn(e);
  }

  const staticZones = INITIAL_PROJECT_ZONES[projectId];
  if (staticZones) {
    if (staticZones[zoneName]) return staticZones[zoneName];
    const match = Object.entries(staticZones).find(([k]) => {
      const kLower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return kLower === cleanNameLower || kLower.includes(cleanNameLower) || cleanNameLower.includes(kLower);
    });
    if (match) return match[1];
  }

  return DEFAULT_ROOM_BOUNDS['People Tracking in Construction'];
}

const ZONES: Record<string, { x: number; y: number; width: number; height: number }> = {
  ...DEFAULT_ROOM_BOUNDS
};

export function useTrackingData(mode: 'real' | null, activeProjectId: string = 'metro-tower') {
  const [people, setPeople] = useState<Person[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [alerts, setAlerts] = useState<AIAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dynamic thresholds
  const loiteringThresholdRef = useRef(300);
  const maxZoneCapacityRef = useRef(15);
  const dynamicZonesRef = useRef<Record<string, any>>({});
  const registeredPeopleRef = useRef<Record<string, {name: string, role: string}>>({});
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  const [dynamicZones, setDynamicZones] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!mode) return;
    
    let isMounted = true;
    let interval: NodeJS.Timeout;

    if (mode === 'real') {
       setIsLoading(false);
       
        const parseTagTimestamp = (ts: string) => {
          if (!ts) return new Date();
          try {
            const iso = ts.trim().replace(' ', 'T');
            const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
            if (!isNaN(d.getTime())) return d;
            const fallback = new Date(ts);
            if (!isNaN(fallback.getTime())) return fallback;
          } catch {}
          return new Date();
        };

        const syncRealtime = async () => {
          if (!isMounted) return;
          try {
            const liveTags = await gaoApi.getTagsInRealtime();
            
            const latestTagInfo: Record<string, any> = {};
            liveTags.forEach(tag => {
               const tid = String(tag.TagID || (tag as any).tagId || (tag as any).id || '').trim();
               if (tid) {
                 latestTagInfo[tid] = tag;
                 latestTagInfo[tid.toLowerCase()] = tag;
                 latestTagInfo[tid.toUpperCase()] = tag;
               }
            });

            setPeople((prev) => {
              const nextPeople = [...prev];

              if (Object.keys(latestTagInfo).length === 0) return nextPeople;

              liveTags.forEach(tag => {
                 const tid = String(tag.TagID || (tag as any).tagId || (tag as any).id || '').trim();
                 if (!tid) return;

                 const tidLower = tid.toLowerCase();
                 let p = nextPeople.find(x => 
                   (x.id && x.id.toLowerCase() === tidLower) || 
                   (x.hardhatTagId && x.hardhatTagId.toLowerCase() === tidLower) ||
                   ((x as any).tagId && String((x as any).tagId).toLowerCase() === tidLower)
                 );

                 const targetZone = normalizeZoneName(tag.Location || tag.LocationName, activeProjectIdRef.current, dynamicZonesRef.current);
                 const rect = getZoneRect(targetZone, activeProjectIdRef.current, dynamicZonesRef.current);
                 
                 const hashOffset = (tid.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % 7) - 3;
                 const targetX = tag.x !== undefined ? tag.x : Math.max(5, Math.min(95, rect.x + (rect.width || 20) / 2 + hashOffset));
                 const targetY = tag.y !== undefined ? tag.y : Math.max(5, Math.min(95, rect.y + (rect.height || 20) / 2 + hashOffset));

                 const registered = registeredPeopleRef.current[tid] || registeredPeopleRef.current[tidLower] || registeredPeopleRef.current[tid.toUpperCase()];
                 const pName = registered ? registered.name : (tag.personName || tag.name || `Tag ${tid.substring(0, 8).toUpperCase()}`);
                 const pRole = registered ? registered.role : (tag.role || 'Field Personnel');
                 const parsedDate = parseTagTimestamp(tag.Timestamp);

                 if (!p) {
                    p = {
                      id: tid,
                      hardhatTagId: tid,
                      name: pName,
                      role: pRole,
                      currentZone: targetZone,
                      presenceState: 'ACTIVE',
                      dwellTime: 0,
                      x: targetX,
                      y: targetY,
                      lastSeen: parsedDate,
                      rssi: tag.rssi,
                      lastReader: tag.readerId,
                      trail: [{ x: targetX, y: targetY }]
                    };
                    nextPeople.push(p);
                 } else {
                    p.lastSeen = parsedDate;
                    if (pName && !pName.startsWith('Tag ')) p.name = pName;
                    if (pRole) p.role = pRole;
                    if (tag.rssi !== undefined) p.rssi = tag.rssi;
                    if (tag.readerId) p.lastReader = tag.readerId;

                    const zoneChanged = p.currentZone !== targetZone;
                    if (zoneChanged) {
                        p.currentZone = targetZone;
                        p.dwellTime = 0;
                        p.presenceState = 'MOVING';
                        p.x = targetX;
                        p.y = targetY;
                        const currTrail = p.trail || [];
                        p.trail = [...currTrail.slice(-9), { x: targetX, y: targetY }];
                    } else if (tag.x !== undefined && tag.y !== undefined) {
                        p.x = tag.x;
                        p.y = tag.y;
                    } else if (p.x === undefined || p.y === undefined) {
                        p.x = targetX;
                        p.y = targetY;
                    }
                 }
              });

              // Calculate occupancy bounds 
              const currentOccupancy: Record<string, number> = {};
              nextPeople.forEach(p => {
                 const registered = registeredPeopleRef.current[p.id] || registeredPeopleRef.current[p.id?.toLowerCase()] || registeredPeopleRef.current[p.hardhatTagId || ''];
                 if (registered) {
                    if (registered.name && !p.name.startsWith('Tag ')) p.name = registered.name;
                    p.role = registered.role;
                 }
                 currentOccupancy[p.currentZone] = (currentOccupancy[p.currentZone] || 0) + 1;
              });

              return nextPeople;
            });
          } catch (e: any) {
            console.warn('Realtime tag sync warning:', e?.message || e);
          }
        };

        syncRealtime();
        interval = setInterval(syncRealtime, 1000);
    }

     return () => {
       isMounted = false;
       if (interval) clearInterval(interval);
     };
  }, [mode, activeProjectId, dynamicZones]);

  return { people, assets, vehicles, alerts, ZONES: dynamicZones, isLoading };
}

// Alias for backwards compatibility
export const useSimulation = useTrackingData;
