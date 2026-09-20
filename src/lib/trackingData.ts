import { useState, useEffect, useRef } from 'react';
import { gaoApi, RealtimeTag } from './gaoApi';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, db, getAuthHeaders } from './db';
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
  { name: 'Zone 1', x: 42.5, y: 27.5, minX: 20, maxX: 65, minY: 10, maxY: 45 },
  { name: 'Zone 2', x: 42.5, y: 80.0, minX: 20, maxX: 65, minY: 70, maxY: 90 }
];

export const INITIAL_PROJECT_ZONES: Record<string, Record<string, { x: number; y: number; width: number; height: number }>> = {
  'metro-tower': {
    'Zone 1': { x: 20, y: 10, width: 45, height: 35 },
    'Zone 2': { x: 20, y: 70, width: 45, height: 20 },
    'Zone1': { x: 20, y: 10, width: 45, height: 35 },
    'Zone2': { x: 20, y: 70, width: 45, height: 20 }
  },
  'highrise-phase2': {
    'Zone 1': { x: 20, y: 10, width: 45, height: 35 },
    'Zone 2': { x: 20, y: 70, width: 45, height: 20 }
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
    fetch('/api/zones')
      .then(res => res.ok ? res.json() : [])
      .then((zoneList: any[]) => {
        if (Array.isArray(zoneList) && zoneList.length > 0) {
          const dict: Record<string, any> = {};
          zoneList.forEach(z => {
            dict[z.name || z.id] = {
              x: z.x ?? 20,
              y: z.y ?? 20,
              width: z.width ?? 25,
              height: z.height ?? 20,
              category: z.category || 'ZONE',
              hazardLevel: z.hazardLevel || 'normal'
            };
          });
          setDynamicZones(dict);
          dynamicZonesRef.current = dict;
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchRegisteredPeople = () => {
      const authHeaders = getAuthHeaders();
      Promise.all([
        fetch('/api/data/registered_people', { headers: authHeaders }).then(res => res.ok ? res.json() : []),
        fetch('/api/data/people', { headers: authHeaders }).then(res => res.ok ? res.json() : [])
      ])
        .then(([regList, peoList]: [any[], any[]]) => {
          const combined = [
            ...(Array.isArray(regList) ? regList : []),
            ...(Array.isArray(peoList) ? peoList : [])
          ];
          if (combined.length > 0) {
            // Sort so that custom profiles and recent updates are processed last (overwriting defaults)
            combined.sort((a, b) => {
              const aCustom = Boolean(a.isCustomProfile);
              const bCustom = Boolean(b.isCustomProfile);
              if (aCustom !== bCustom) return aCustom ? 1 : -1;
              const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
              const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
              return aTime - bTime;
            });

            const map: Record<string, { name: string; role: string; tradeCompany?: string; department?: string }> = {};
            combined.forEach(p => {
              if (!p || !p.name) return;
              const entry = {
                name: String(p.name).trim(),
                role: p.role || 'Field Personnel',
                tradeCompany: p.tradeCompany || p.company,
                department: p.department
              };
              const identifiers = [p.id, p.hardhatTagId, p.tagId, p.TagID, (p as any)._id].filter(Boolean);
              identifiers.forEach(id => {
                const s = String(id).trim();
                if (s) {
                  map[s] = entry;
                  map[s.toLowerCase()] = entry;
                  map[s.toUpperCase()] = entry;
                }
              });
            });
            registeredPeopleRef.current = map;

            // Immediately synchronize current people state with latest custom names
            setPeople(prev => prev.map(person => {
              const tid = String(person.hardhatTagId || (person as any).tagId || person.id || '').trim();
              const reg = map[tid] || map[tid.toLowerCase()] || map[tid.toUpperCase()];
              if (reg && reg.name && person.name !== reg.name) {
                return { ...person, name: reg.name, role: reg.role || person.role };
              }
              return person;
            }));
          }
        })
        .catch(() => {});
    };

    fetchRegisteredPeople();
    window.addEventListener('gao_data_updated', fetchRegisteredPeople);
    window.addEventListener('gao_refresh_data', fetchRegisteredPeople);
    window.addEventListener('gao_map_data_updated', fetchRegisteredPeople);
    return () => {
      window.removeEventListener('gao_data_updated', fetchRegisteredPeople);
      window.removeEventListener('gao_refresh_data', fetchRegisteredPeople);
      window.removeEventListener('gao_map_data_updated', fetchRegisteredPeople);
    };
  }, []);

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

        let isSyncInProgress = false;
        const syncRealtime = async () => {
          if (!isMounted || isSyncInProgress) return;
          isSyncInProgress = true;
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
                 const apiName = tag.personName || tag.name || ((tag as any).FirstName ? `${(tag as any).FirstName} ${(tag as any).LastName || ''}`.trim() : '');
                 const pName = registered?.name || (apiName || `Tag ${tid.substring(0, 8).toUpperCase()}`);
                 const pRole = registered?.role || (tag.role || 'Field Personnel');
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
                    if (registered?.name) {
                      p.name = registered.name;
                    } else if (pName && !pName.startsWith('Tag ')) {
                      p.name = pName;
                    }
                    if (registered?.role) {
                      p.role = registered.role;
                    } else if (pRole) {
                      p.role = pRole;
                    }
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
          } finally {
            isSyncInProgress = false;
          }
        };

        syncRealtime();
        interval = setInterval(syncRealtime, 2500);
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
