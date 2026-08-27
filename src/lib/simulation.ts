import { useState, useEffect, useRef } from 'react';
import { gaoApi, RealtimeTag } from './gaoApi';
import { collection, addDoc, query, orderBy, limit, onSnapshot, doc, serverTimestamp, getDoc, setDoc, db } from './db';
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

export function useSimulation(mode: 'real' | 'demo' | null, activeProjectId: string = 'metro-tower') {
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

  // Helper to add fake alerts in demo mode
  const addDemoAlert = (type: 'security' | 'warning' | 'info', message: string) => {
     const newAlert: AIAlert = { id: Math.random().toString(), type, message, timestamp: new Date() };
     setAlerts(prev => [newAlert, ...prev].slice(0, 15));
     
     // In real mode, persist to db
     addDoc(collection(db, 'alerts'), {
        type,
        message,
        timestamp: serverTimestamp(),
        resolved: false
     }).catch(() => {});
  };

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
       const mapped: Record<string, {name: string, role: string}> = {};
       const list: any[] = [];
       snapshot.forEach(doc => {
          const data = doc.data();
          mapped[doc.id] = { name: data.name, role: data.role || data.department || 'Employee' };
          list.push({ id: doc.id, ...data });
       });
       registeredPeopleRef.current = mapped;

       if (mode === 'demo') {
         setPeople(prevPeople => {
           const existingMap = new Map(prevPeople.map(p => [p.id, p]));
           const zonesList = getZonesForProject(activeProjectId);

           return list.map(item => {
             const existing = existingMap.get(item.id);
             if (existing) {
               return {
                 ...existing,
                 name: item.name,
                 role: item.role || item.department || 'Employee',
               };
             } else {
               const targetZone = item.currentZone && zonesList.includes(item.currentZone)
                 ? item.currentZone
                 : zonesList[Math.floor(Math.random() * zonesList.length)];
               const rect = getZoneRect(targetZone, activeProjectId, dynamicZones);
               return {
                 id: item.id,
                 name: item.name,
                 role: item.role || item.department || 'Employee',
                 currentZone: targetZone,
                 presenceState: 'MOVING' as const,
                 dwellTime: 0,
                 x: rect.x + Math.random() * rect.width,
                 y: rect.y + Math.random() * rect.height,
                 lastSeen: new Date(),
                 trail: []
               };
             }
           });
         });
       }
    }, (err) => handleDbError(err, OperationType.LIST, 'registered_people'));
    
    // Listen to Assets from Firebase
    const assetsQuery = collection(db, 'assets');
    const unsubscribeAssets = onSnapshot(assetsQuery, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      if (mode === 'real') {
        setAssets(items);
      } else if (mode === 'demo') {
        setAssets(prevAssets => {
          const existingMap = new Map(prevAssets.map(a => [a.id, a]));
          const zonesList = getZonesForProject(activeProjectId);
          return items.map(item => {
            const existing = existingMap.get(item.id);
            if (existing) {
              return {
                ...existing,
                name: item.name,
                type: item.category || item.type || 'Equipment',
                status: item.status
              };
            } else {
              const targetZone = item.zoneId && zonesList.includes(item.zoneId)
                ? item.zoneId
                : zonesList[Math.floor(Math.random() * zonesList.length)];
              const rect = getZoneRect(targetZone, activeProjectId, dynamicZones);
              return {
                id: item.id,
                name: item.name,
                type: item.category || item.type || 'Equipment',
                x: rect.x + Math.random() * rect.width,
                y: rect.y + Math.random() * rect.height,
                status: item.status || 'Active',
                battery: item.batteryLevel !== undefined ? item.batteryLevel : 100
              };
            }
          });
        });
      }
    }, (err) => handleDbError(err, OperationType.LIST, 'assets'));

    // Listen to Vehicles from Firebase
    const vehiclesQuery = collection(db, 'vehicles');
    const unsubscribeVehicles = onSnapshot(vehiclesQuery, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      if (mode === 'real') {
        setVehicles(items);
      } else if (mode === 'demo') {
        setVehicles(prevVehicles => {
          const existingMap = new Map(prevVehicles.map(v => [v.id, v]));
          const zonesList = getZonesForProject(activeProjectId);
          return items.map(item => {
            const existing = existingMap.get(item.id);
            if (existing) {
              return {
                ...existing,
                name: item.name,
                type: item.type || 'Vehicle',
                status: item.status,
                speed: item.speedKmh !== undefined ? item.speedKmh : existing.speed
              };
            } else {
              const targetZone = item.zoneId && zonesList.includes(item.zoneId)
                ? item.zoneId
                : zonesList[Math.floor(Math.random() * zonesList.length)];
              const rect = getZoneRect(targetZone, activeProjectId, dynamicZones);
              return {
                id: item.id,
                name: item.name,
                type: item.type || 'Vehicle',
                x: rect.x + Math.random() * rect.width,
                y: rect.y + Math.random() * rect.height,
                speed: item.speedKmh !== undefined ? item.speedKmh : 0,
                status: item.status || 'Active'
              };
            }
          });
        });
      }
    }, (err) => handleDbError(err, OperationType.LIST, 'vehicles'));

    return () => {
       unsubscribeSettings();
       unsubscribeAlerts();
       unsubscribeFloorplans();
       unsubscribeRegistered();
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
                const pName = registered ? registered.name : `Tag ${tag.TagID.substring(0, 6).toUpperCase()}`;
                const pRole = registered ? registered.role : 'Visitor';

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
                     lastSeen: new Date(tag.Timestamp + "Z"),
                     trail: []
                   };
                   nextPeople.push(p);
                } else {
                   p.lastSeen = new Date(tag.Timestamp + "Z");
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

             Object.entries(currentOccupancy).forEach(([zone, count]) => {
                const limit = occupancyLimitsRef.current[zone];
                if (limit && count > limit) {
                   const now = Date.now();
                   const lastAlerted = alertedZonesRef.current[zone] || 0;
                   if (now - lastAlerted > 60000) {
                      alertedZonesRef.current[zone] = now;
                      addDoc(collection(db, 'alerts'), {
                        type: 'warning',
                        message: `OVERCAPACITY: ${zone} exceeded max occupancy of ${limit}. Currently ${count}.`,
                        timestamp: new Date()
                      }).catch(error => handleDbError(error, OperationType.WRITE, 'alerts'));
                   }
                }
             });

              return nextPeople;
           });
         } catch (e: any) {
           console.warn('Realtime tag sync warning:', e?.message || e);
         }
       };

       interval = setInterval(syncRealtime, 5000);
    } else if (mode === 'demo') {
       setIsLoading(false);

       // Load data from MongoDB via REST API — no hardcoded fallback data
       const loadFromMongo = async () => {
         if (!isMounted) return;
         try {
           const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
           const authHeaders = {
             'Accept': 'application/json',
             'Authorization': `Bearer ${token}`
           };

           const [peopleRes, visitorsRes, assetsRes, vehiclesRes] = await Promise.all([
             fetch('/api/data/registered_people', { headers: authHeaders }).catch(() => null),
             fetch('/api/data/visitors', { headers: authHeaders }).catch(() => null),
             fetch('/api/data/assets', { headers: authHeaders }).catch(() => null),
             fetch('/api/data/vehicles', { headers: authHeaders }).catch(() => null)
           ]);

            if (peopleRes && peopleRes.ok) {
              const data = await peopleRes.json();
              let visitorsData: any[] = [];
              if (visitorsRes && visitorsRes.ok) {
                try {
                  const rawVis = await visitorsRes.json();
                  if (Array.isArray(rawVis)) visitorsData = rawVis;
                } catch {}
              }

              if (Array.isArray(data) && isMounted) {
                setPeople(prev => {
                  const existingMap = new Map((prev || []).map(p => [p.id, p]));
                  
                  // Map registered workforce
                  const workersList = data.map((p: any, idx: number) => {
                    const id = p.id || p.hardhatTagId || `W-${idx + 1}`;
                    const existing = existingMap.get(id);
                    const defaultWaypoint = SITE_ZONE_WAYPOINTS[idx % SITE_ZONE_WAYPOINTS.length];
                    const zone = p.currentZone || (existing?.currentZone) || defaultWaypoint.name;
                    const x = typeof p.x === 'number' && p.x >= 5 && p.x <= 95 ? p.x : (existing ? existing.x : defaultWaypoint.x);
                    const y = typeof p.y === 'number' && p.y >= 5 && p.y <= 95 ? p.y : (existing ? existing.y : defaultWaypoint.y);
                    return {
                      id,
                      name: p.name || `Worker ${idx + 1}`,
                      role: p.role || 'Field Personnel',
                      tradeCompany: p.tradeCompany,
                      ppeStatus: p.ppeStatus,
                      shiftStatus: p.shiftStatus,
                      trainingStatus: p.trainingStatus,
                      hardhatTagId: p.hardhatTagId || p.id,
                      currentZone: zone,
                      presenceState: (existing?.presenceState || 'IDLE') as any,
                      dwellTime: p.dwellTime || (existing?.dwellTime) || 0,
                      x,
                      y,
                      lastSeen: p.lastSeen ? new Date(p.lastSeen) : (existing?.lastSeen || new Date()),
                      trail: existing?.trail || []
                    };
                  });

                  // Map allowed and verified site visitors only
                  const activeVisitorsList = visitorsData
                    .filter((v: any) => {
                      if (!v) return false;
                      const status = (v.status || '').trim();
                      const idStatus = (v.idVerificationStatus || '').toUpperCase();

                      if (status === 'Pending Approval' || status === 'Denied' || status === 'Rejected' || status === 'Completed' || status === 'Blacklisted' || status === 'Departed') {
                        return false;
                      }
                      if (idStatus === 'FAILED' || idStatus === 'REJECTED') {
                        return false;
                      }
                      if (status === 'Active' || status === 'Checked-in' || status === 'Overstayed') {
                        return idStatus !== 'FAILED';
                      }
                      if (status === 'Approved' && (idStatus === 'VERIFIED' || v.tag)) {
                        return true;
                      }
                      return false;
                    })
                    .map((v: any, vIdx: number) => {
                      const id = v.id || `VIS-${vIdx + 880}`;
                      const existing = existingMap.get(id);
                      const zone = v.location || 'Site Command HQ';
                      const defaultPoint = SITE_ZONE_WAYPOINTS[3];
                      const x = typeof v.x === 'number' ? v.x : (existing ? existing.x : defaultPoint.x);
                      const y = typeof v.y === 'number' ? v.y : (existing ? existing.y : defaultPoint.y);
                      return {
                        id,
                        name: `${v.name} (Visitor)`,
                        role: 'Visitor',
                        tradeCompany: v.company || 'Auditor / Guest',
                        ppeStatus: 'COMPLIANT' as const,
                        shiftStatus: 'ON_SITE' as const,
                        trainingStatus: 'COMPLIANT' as const,
                        hardhatTagId: v.tag || `VIS-TAG-${v.id || vIdx}`,
                        currentZone: zone,
                        presenceState: (existing?.presenceState || 'IDLE') as any,
                        dwellTime: v.duration ? parseInt(v.duration) || 20 : 20,
                        x,
                        y,
                        lastSeen: v.arrivalTime ? new Date(v.arrivalTime) : (existing?.lastSeen || new Date()),
                        trail: existing?.trail || []
                      };
                    });

                  return [...workersList, ...activeVisitorsList];
                });
              }
            }

           if (assetsRes && assetsRes.ok) {
             const data = await assetsRes.json();
             if (Array.isArray(data) && isMounted) {
               setAssets(data);
             }
           }

           if (vehiclesRes && vehiclesRes.ok) {
             const data = await vehiclesRes.json();
             if (Array.isArray(data) && isMounted) {
               setVehicles(data);
             }
           }
         } catch (e) {
           console.warn('MongoDB data load warning:', e);
         }
       };

        loadFromMongo();
        interval = setInterval(loadFromMongo, 6000);
     }

     return () => {
       isMounted = false;
       if (interval) clearInterval(interval);
     };
  }, [mode, activeProjectId, dynamicZones]);

  return { people, assets, vehicles, alerts, ZONES: dynamicZones, isLoading };
}


