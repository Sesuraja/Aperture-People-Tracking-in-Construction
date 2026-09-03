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

export function normalizeZoneName(location?: string | null, projectId: string = 'metro-tower'): string {
  const zones = getZonesForProject(projectId);
  if (location && zones.includes(location)) {
    return location;
  }
  if (location) {
    const matched = zones.find(z => z.toLowerCase().includes(location.toLowerCase()) || location.toLowerCase().includes(z.toLowerCase()));
    if (matched) return matched;
  }
  return zones[0] || 'People Tracking in Construction';
}

const DEFAULT_ROOM_BOUNDS: Record<string, { x: number; y: number; width: number; height: number }> = {
  'People Tracking in Construction': { x: 5, y: 5, width: 90, height: 90 }
};

export function getZoneRect(zoneName: string, projectId: string = 'metro-tower', dynamicZones?: Record<string, any>) {
  if (dynamicZones && dynamicZones[zoneName]) {
    return dynamicZones[zoneName];
  }

  try {
    const saved = localStorage.getItem('gao_project_properties');
    if (saved) {
      const parsed = JSON.parse(saved);
      const proj = parsed[projectId];
      if (proj && proj.customZones && proj.customZones[zoneName]) {
        return proj.customZones[zoneName];
      }
    }
  } catch (e) {
    console.warn(e);
  }

  const staticZones = INITIAL_PROJECT_ZONES[projectId];
  if (staticZones && staticZones[zoneName]) {
    return staticZones[zoneName];
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
  const idleAlertThresholdRef = useRef(3600);
  const occupancyLimitsRef = useRef<Record<string, number>>({});
  const alertedZonesRef = useRef<Record<string, number>>({});
  
  const registeredPeopleRef = useRef<Record<string, {name: string, role: string}>>({});

  const [dynamicZones, setDynamicZones] = useState<Record<string, { x: number; y: number; width: number; height: number }>>(ZONES);

  useEffect(() => {
    if (!mode) return;

    // Listen to settings changes globally
    const settingsRef = doc(db, 'settings', 'global');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.loiteringThreshold !== undefined) loiteringThresholdRef.current = data.loiteringThreshold;
        if (data.idleAlertThreshold !== undefined) idleAlertThresholdRef.current = data.idleAlertThreshold;
        if (data.occupancyThresholds) occupancyLimitsRef.current = data.occupancyThresholds;
      }
    }, (err) => handleDbError(err, OperationType.GET, 'settings/global'));

    // Listen to real alerts from the database
    const alertQuery = query(collection(db, 'alerts'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeAlerts = onSnapshot(alertQuery, (snapshot) => {
       const fetchedAlerts: AIAlert[] = [];
       snapshot.forEach(doc => {
          const data = doc.data();
          fetchedAlerts.push({
             id: doc.id,
             type: data.type,
             message: data.message,
             timestamp: data.timestamp?.toDate() || new Date(),
             resolved: data.resolved
          });
       });
       setAlerts(fetchedAlerts);
    }, (err) => handleDbError(err, OperationType.LIST, 'alerts'));
    
    // Listen to floor plans to generate zones based on devices placed
    const floorplansQuery = query(collection(db, 'floorplans'));
    const unsubscribeFloorplans = onSnapshot(floorplansQuery, (snapshot) => {
       const newZones: Record<string, {x:number, y:number, width:number, height:number}> = { ...ZONES };
       snapshot.forEach(doc => {
          const plan = doc.data();
          if (plan.devices && Array.isArray(plan.devices)) {
             plan.devices.forEach((dev: any) => {
                newZones[dev.name] = {
                   x: dev.x - 10,
                   y: dev.y - 10,
                   width: 20,
                   height: 20
                };
             });
          }
       });
       setDynamicZones(newZones);
    }, (err) => handleDbError(err, OperationType.LIST, 'floorplans'));
    
    const registeredQuery = query(collection(db, 'registered_people'));
    const unsubscribeRegistered = onSnapshot(registeredQuery, (snapshot) => {
       const mapped: Record<string, {name: string, role: string}> = { ...registeredPeopleRef.current };
       const registeredList: Person[] = [];
       snapshot.forEach(doc => {
          const data = doc.data();
          const pName = data.name || data.workerName || data.personName || '';
          const pRole = data.role || data.tradeCompany || data.department || 'Employee';
          if (pName) {
            const entry = { name: pName, role: pRole };
            if (doc.id) {
              mapped[doc.id] = entry;
              mapped[doc.id.toLowerCase()] = entry;
              mapped[doc.id.toUpperCase()] = entry;
            }
            if (data.hardhatTagId) {
              mapped[String(data.hardhatTagId)] = entry;
              mapped[String(data.hardhatTagId).toLowerCase()] = entry;
              mapped[String(data.hardhatTagId).toUpperCase()] = entry;
            }
            if (data.tagId) {
              mapped[String(data.tagId)] = entry;
              mapped[String(data.tagId).toLowerCase()] = entry;
              mapped[String(data.tagId).toUpperCase()] = entry;
            }
            if (data.TagID) {
              mapped[String(data.TagID)] = entry;
              mapped[String(data.TagID).toLowerCase()] = entry;
              mapped[String(data.TagID).toUpperCase()] = entry;
            }
          }
          const zName = data.currentZone || 'Site Office';
          const rect = getZoneRect(zName, activeProjectId, dynamicZones);
          registeredList.push({
            id: doc.id,
            hardhatTagId: data.hardhatTagId || doc.id,
            name: pName || `Tag ${doc.id.substring(0, 8).toUpperCase()}`,
            role: pRole,
            currentZone: zName,
            presenceState: data.presenceState || 'IDLE',
            dwellTime: data.dwellTime || 0,
            x: data.x !== undefined ? data.x : (rect.x + rect.width / 2),
            y: data.y !== undefined ? data.y : (rect.y + rect.height / 2),
            lastSeen: data.lastSeen ? new Date(data.lastSeen) : new Date(),
            battery: data.battery !== undefined ? data.battery : 92,
            trail: []
          });
       });
       registeredPeopleRef.current = mapped;
       setPeople(prev => {
         if (prev.length === 0 && registeredList.length > 0) {
           return registeredList;
         }
         return prev.map(p => {
           const key = p.id;
           const tagKey = p.hardhatTagId || p.id;
           const reg = mapped[key] || mapped[key?.toLowerCase()] || mapped[key?.toUpperCase()] ||
                       mapped[tagKey] || mapped[tagKey?.toLowerCase()] || mapped[tagKey?.toUpperCase()];
           if (reg && reg.name) {
             return { ...p, name: reg.name, role: reg.role || p.role };
           }
           return p;
         });
       });
    }, (err) => handleDbError(err, OperationType.LIST, 'registered_people'));

    const peopleColQuery = query(collection(db, 'people'));
    const unsubscribePeople = onSnapshot(peopleColQuery, (snapshot) => {
      if (!snapshot.empty) {
        const mapped: Record<string, {name: string, role: string}> = { ...registeredPeopleRef.current };
        const pList: Person[] = snapshot.docs.map(doc => {
          const d = doc.data();
          const pName = d.name || d.workerName || d.personName || '';
          const pRole = d.role || d.tradeCompany || 'Field Personnel';
          if (pName) {
            const entry = { name: pName, role: pRole };
            if (doc.id) {
              mapped[doc.id] = entry;
              mapped[doc.id.toLowerCase()] = entry;
              mapped[doc.id.toUpperCase()] = entry;
            }
            if (d.hardhatTagId) {
              mapped[String(d.hardhatTagId)] = entry;
              mapped[String(d.hardhatTagId).toLowerCase()] = entry;
              mapped[String(d.hardhatTagId).toUpperCase()] = entry;
            }
            if (d.tagId) {
              mapped[String(d.tagId)] = entry;
              mapped[String(d.tagId).toLowerCase()] = entry;
              mapped[String(d.tagId).toUpperCase()] = entry;
            }
          }
          const zName = d.currentZone || 'Site Office';
          const rect = getZoneRect(zName, activeProjectId, dynamicZones);
          return {
            id: doc.id,
            hardhatTagId: d.hardhatTagId || doc.id,
            name: pName || `Tag ${doc.id.substring(0, 8).toUpperCase()}`,
            role: pRole,
            currentZone: zName,
            presenceState: d.presenceState || 'IDLE',
            dwellTime: d.dwellTime || 0,
            x: d.x !== undefined ? d.x : (rect.x + rect.width / 2),
            y: d.y !== undefined ? d.y : (rect.y + rect.height / 2),
            lastSeen: d.lastSeen ? new Date(d.lastSeen) : new Date(),
            battery: d.battery !== undefined ? d.battery : 90,
            trail: []
          };
        });
        registeredPeopleRef.current = mapped;
        setPeople(prev => {
          if (prev.length === 0) return pList;
          return prev.map(p => {
            const key = p.id;
            const tagKey = p.hardhatTagId || p.id;
            const reg = mapped[key] || mapped[key?.toLowerCase()] || mapped[key?.toUpperCase()] ||
                        mapped[tagKey] || mapped[tagKey?.toLowerCase()] || mapped[tagKey?.toUpperCase()];
            if (reg && reg.name) {
              return { ...p, name: reg.name, role: reg.role || p.role };
            }
            return p;
          });
        });
      }
    }, (err) => handleDbError(err, OperationType.LIST, 'people'));
    
    // Listen to Assets from database
    const assetsQuery = collection(db, 'assets');
    const unsubscribeAssets = onSnapshot(assetsQuery, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setAssets(items);
    }, (err) => handleDbError(err, OperationType.LIST, 'assets'));

    // Listen to Vehicles from database
    const vehiclesQuery = collection(db, 'vehicles');
    const unsubscribeVehicles = onSnapshot(vehiclesQuery, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setVehicles(items);
    }, (err) => handleDbError(err, OperationType.LIST, 'vehicles'));

    return () => {
       unsubscribeSettings();
       unsubscribeAlerts();
       unsubscribeFloorplans();
       unsubscribeRegistered();
       unsubscribePeople();
       unsubscribeAssets();
       unsubscribeVehicles();
    };
  }, [mode]);

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
               if (tag.TagID) {
                 latestTagInfo[tag.TagID] = tag;
               }
            });

            setPeople((prev) => {
              const nextPeople = [...prev];

              if (Object.keys(latestTagInfo).length === 0) return nextPeople;

              Object.values(latestTagInfo).forEach(tag => {
                 let p = nextPeople.find(x => x.id === tag.TagID);
                 let targetZone = normalizeZoneName(tag.Location, activeProjectId);
                 const rect = getZoneRect(targetZone, activeProjectId, dynamicZones);
                 
                 const registered = registeredPeopleRef.current[tag.TagID];
                 const pName = registered ? registered.name : (tag.personName || `Tag ${tag.TagID.substring(0, 8).toUpperCase()}`);
                 const pRole = registered ? registered.role : (tag.role || 'Personnel');
                 const parsedDate = parseTagTimestamp(tag.Timestamp);

                 if (!p) {
                    p = {
                      id: tag.TagID,
                      name: pName,
                      role: pRole,
                      currentZone: targetZone,
                      presenceState: 'IDLE',
                      dwellTime: 0,
                      x: rect.x + rect.width / 2,
                      y: rect.y + rect.height / 2,
                      lastSeen: parsedDate,
                      trail: []
                    };
                    nextPeople.push(p);
                 } else {
                    p.lastSeen = parsedDate;
                    p.name = pName;
                    p.role = pRole;
                    if (p.currentZone !== targetZone) {
                        p.currentZone = targetZone;
                        p.dwellTime = 0;
                        p.presenceState = 'IDLE';
                    }
                 }
              });

              // Calculate occupancy bounds 
              const currentOccupancy: Record<string, number> = {};
              nextPeople.forEach(p => {
                 const registered = registeredPeopleRef.current[p.id];
                 if (registered) {
                    p.name = registered.name;
                    p.role = registered.role;
                 }
                 currentOccupancy[p.currentZone] = (currentOccupancy[p.currentZone] || 0) + 1;
              });

              // Occupancy calculated in memory for UI presentation without creating synthetic alert records
              return nextPeople;
            });
          } catch (e: any) {
            console.warn('Realtime tag sync warning:', e?.message || e);
          }
        };

        syncRealtime();
        // 1-second real-time update loop
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
