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

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: 'default',
      email: 'sigmund.t.d@gaostaff.com',
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

export const INITIAL_PROJECT_ZONES: Record<string, Record<string, { x: number; y: number; width: number; height: number }>> = {
  'metro-tower': {
    'Deep Excavation Shaft': { x: 10, y: 15, width: 34, height: 62 },
    'Tower Core Structure': { x: 51, y: 25, width: 32, height: 50 },
    'Heavy Crane & Exclusion Area': { x: 80, y: 5, width: 16, height: 42 },
    'High Voltage Area': { x: 46, y: 5, width: 14, height: 16 }
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
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/global'));

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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'alerts'));
    
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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'floorplans'));
    
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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'registered_people'));
    
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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'assets'));

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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles'));

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

                    addDoc(collection(db, 'alerts'), {
                        type: 'info',
                        message: `System tracked new tag: ${tag.TagID.substring(0, 8)} at ${tag.Location}`,
                        timestamp: new Date()
                    }).catch(error => handleFirestoreError(error, OperationType.WRITE, 'alerts'));

                    // Store real history log
                    addDoc(collection(db, 'tag_history'), {
                        TagID: p.id,
                        name: p.name,
                        role: p.role,
                        fromZone: null,
                        toZone: targetZone,
                        timestamp: new Date()
                    }).catch(() => {});

                } else {
                    p.lastSeen = new Date(tag.Timestamp + "Z");
                    p.name = pName;
                    p.role = pRole;
                    if (p.currentZone !== targetZone) {
                        const oldZone = p.currentZone;
                        p.currentZone = targetZone;
                        p.dwellTime = 0;
                        p.presenceState = 'MOVING';
                        
                        p.x = rect.x + rect.width / 2;
                        p.y = rect.y + rect.height / 2;
                        
                        addDoc(collection(db, 'tag_history'), {
                            TagID: p.id,
                            name: p.name,
                            role: p.role,
                            fromZone: oldZone,
                            toZone: targetZone,
                            timestamp: new Date()
                        }).catch(() => {});
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
                      }).catch(error => handleFirestoreError(error, OperationType.WRITE, 'alerts'));
                   }
                }
             });

             nextPeople.forEach(p => {
               p.dwellTime += 2; 

               p.trail = p.trail || [];
               p.trail.push({ x: p.x, y: p.y });
               if (p.trail.length > 60) p.trail.shift();

               const zoneRect = getZoneRect(p.currentZone, activeProjectId, dynamicZones);
               const targetX = zoneRect.x + Math.random() * zoneRect.width;
               const targetY = zoneRect.y + Math.random() * zoneRect.height;
               
               p.x += (targetX - p.x) * 0.1;
               p.y += (targetY - p.y) * 0.1;

               if (Math.abs(targetX - p.x) < 2 && Math.abs(targetY - p.y) < 2) {
                  p.presenceState = 'IDLE';
               } else {
                  p.presenceState = 'MOVING';
               }
             });

             return nextPeople;
           });
         } catch (e: any) {
           console.warn('Realtime tag sync warning:', e?.message || e);
         }
       };

       interval = setInterval(syncRealtime, 2000);
    } else if (mode === 'demo') {
       setIsLoading(false);

       // Initial demo workforce fallback
       const DEMO_WORKERS: Person[] = [
         { id: 'HH-1092', name: 'Marcus Vance', role: 'EHS Safety Director', currentZone: 'Tower Core Structure', presenceState: 'MOVING', dwellTime: 420, x: 55, y: 35, lastSeen: new Date(), trail: [] },
         { id: 'HH-2041', name: 'Elena Rostova', role: 'Structural Engineer', currentZone: 'Tower Core Structure', presenceState: 'IDLE', dwellTime: 650, x: 62, y: 48, lastSeen: new Date(), trail: [] },
         { id: 'HH-3309', name: 'David Kim', role: 'Formwork Lead', currentZone: 'Deep Excavation Shaft', presenceState: 'MOVING', dwellTime: 210, x: 22, y: 38, lastSeen: new Date(), trail: [] },
         { id: 'HH-5112', name: 'Carlos Mendez', role: 'Tower Crane Operator', currentZone: 'Heavy Crane & Exclusion Area', presenceState: 'IDLE', dwellTime: 1200, x: 86, y: 18, lastSeen: new Date(), trail: [] },
         { id: 'HH-6221', name: 'Aisha Patel', role: 'Lead Electrician', currentZone: 'High Voltage Area', presenceState: 'MOVING', dwellTime: 180, x: 50, y: 10, lastSeen: new Date(), trail: [] },
         { id: 'HH-7405', name: 'Lucas Sterling', role: 'Heavy Rigging Tech', currentZone: 'Heavy Crane & Exclusion Area', presenceState: 'MOVING', dwellTime: 340, x: 88, y: 32, lastSeen: new Date(), trail: [] },
         { id: 'HH-8991', name: 'Wei Zhang', role: 'Excavator Operator', currentZone: 'Deep Excavation Shaft', presenceState: 'IDLE', dwellTime: 890, x: 18, y: 55, lastSeen: new Date(), trail: [] },
         { id: 'HH-9023', name: 'Sarah Jenkins', role: 'QA Inspector', currentZone: 'Tower Core Structure', presenceState: 'MOVING', dwellTime: 150, x: 68, y: 30, lastSeen: new Date(), trail: [] },
         { id: 'HH-4412', name: 'Tariq Al-Mansoor', role: 'Scaffold Crew Lead', currentZone: 'Tower Core Structure', presenceState: 'MOVING', dwellTime: 510, x: 58, y: 60, lastSeen: new Date(), trail: [] },
         { id: 'HH-1188', name: 'Priya Sharma', role: 'Structural Welder', currentZone: 'Tower Core Structure', presenceState: 'IDLE', dwellTime: 720, x: 74, y: 42, lastSeen: new Date(), trail: [] },
         { id: 'HH-2290', name: 'James Wilson', role: 'Concrete Finisher', currentZone: 'Deep Excavation Shaft', presenceState: 'MOVING', dwellTime: 310, x: 30, y: 25, lastSeen: new Date(), trail: [] },
         { id: 'HH-3381', name: 'Liam O\'Connor', role: 'Site Surveyor', currentZone: 'Tower Core Structure', presenceState: 'MOVING', dwellTime: 190, x: 52, y: 65, lastSeen: new Date(), trail: [] }
       ];

       const DEMO_ASSETS: Asset[] = [
         { id: 'AST-01', name: 'CAT 336 Excavator', type: 'Heavy Machinery', x: 25, y: 40, status: 'In Use', battery: 94 },
         { id: 'AST-02', name: 'Potain MDT 389 Tower Crane', type: 'Lifting Equipment', x: 86, y: 20, status: 'Operating', battery: 100 },
         { id: 'AST-03', name: 'Cummins 250kVA Generator', type: 'Power Equipment', x: 55, y: 45, status: 'Active', battery: 82 },
         { id: 'AST-04', name: 'Miller Big Blue Welder', type: 'Welding Unit', x: 70, y: 50, status: 'Idle', battery: 88 }
       ];

       const DEMO_VEHICLES: Vehicle[] = [
         { id: 'VEH-01', name: 'Mack Concrete Mixer #4', type: 'Concrete Mixer', x: 28, y: 35, speed: 4, status: 'Unloading' },
         { id: 'VEH-02', name: 'CAT 950M Wheel Loader', type: 'Earthmover', x: 20, y: 50, speed: 8, status: 'Moving' },
         { id: 'VEH-03', name: 'Ford F-250 Safety Unit', type: 'Emergency Response', x: 60, y: 35, speed: 0, status: 'Standby' }
       ];

        // Asynchronously pull initial seed data directly from MongoDB database
        const initDemoDataFromMongo = async () => {
          try {
            const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
            const authHeaders = {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`
            };

            const [peopleRes, assetsRes, vehiclesRes] = await Promise.all([
              fetch('/api/data/registered_people', { headers: authHeaders }).catch(() => null),
              fetch('/api/data/assets', { headers: authHeaders }).catch(() => null),
              fetch('/api/data/vehicles', { headers: authHeaders }).catch(() => null)
            ]);

           if (peopleRes && peopleRes.ok) {
             const data = await peopleRes.json();
             if (Array.isArray(data) && data.length > 0) {
               const zonesList = getZonesForProject(activeProjectId);
               const mapped = data.map((p: any, idx: number) => {
                 const zone = p.currentZone || zonesList[idx % zonesList.length] || 'Tower Core Structure';
                 const rect = getZoneRect(zone, activeProjectId, dynamicZones);
                 return {
                   id: p.id || p.hardhatTagId || `W-${idx + 1}`,
                   name: p.name || `Worker ${idx + 1}`,
                   role: p.role || 'Field Personnel',
                   tradeCompany: p.tradeCompany || 'Apex Construction',
                   ppeStatus: p.ppeStatus || 'COMPLIANT',
                   shiftStatus: p.shiftStatus || 'ON_SITE',
                   trainingStatus: p.trainingStatus || 'COMPLIANT',
                   hardhatTagId: p.hardhatTagId || p.id,
                   currentZone: zone,
                   presenceState: 'MOVING' as any,
                   dwellTime: 120 + idx * 45,
                   x: rect.x + 2 + Math.random() * (rect.width - 4),
                   y: rect.y + 2 + Math.random() * (rect.height - 4),
                   lastSeen: new Date(),
                   trail: []
                 };
               });
               if (isMounted) setPeople(mapped);
             } else {
               if (isMounted) setPeople(prev => prev.length === 0 ? DEMO_WORKERS : prev);
             }
           } else {
             if (isMounted) setPeople(prev => prev.length === 0 ? DEMO_WORKERS : prev);
           }

           if (assetsRes && assetsRes.ok) {
             const data = await assetsRes.json();
             if (Array.isArray(data) && data.length > 0 && isMounted) {
               setAssets(data);
             } else if (isMounted) {
               setAssets(prev => prev.length === 0 ? DEMO_ASSETS : prev);
             }
           }

           if (vehiclesRes && vehiclesRes.ok) {
             const data = await vehiclesRes.json();
             if (Array.isArray(data) && data.length > 0 && isMounted) {
               setVehicles(data);
             } else if (isMounted) {
               setVehicles(prev => prev.length === 0 ? DEMO_VEHICLES : prev);
             }
           }
         } catch {
           if (isMounted) {
             setPeople(prev => prev.length === 0 ? DEMO_WORKERS : prev);
             setAssets(prev => prev.length === 0 ? DEMO_ASSETS : prev);
             setVehicles(prev => prev.length === 0 ? DEMO_VEHICLES : prev);
           }
         }
       };

       initDemoDataFromMongo();

       // Active Simulation Loop in Demo Mode
       // Active Realistic Human Walking Simulation Loop in Demo Mode
        const demoSimulationTick = () => {
          if (!isMounted) return;

          setPeople(prevPeople => {
            const zonesList = getZonesForProject(activeProjectId);
            return prevPeople.map(person => {
              const updated = { ...person };
              updated.dwellTime = (updated.dwellTime || 0) + 1;
              updated.lastSeen = new Date();

              // Chance of moving to a new destination zone (every ~20 seconds of activity)
              if (Math.random() < 0.03 && zonesList.length > 1) {
                const otherZones = zonesList.filter(z => z !== updated.currentZone);
                const newZone = otherZones[Math.floor(Math.random() * otherZones.length)];
                updated.currentZone = newZone;
                updated.dwellTime = 0;
                updated.presenceState = 'MOVING';
                delete updated.targetX;
                delete updated.targetY;
              }

              const zoneRect = getZoneRect(updated.currentZone, activeProjectId, dynamicZones);

              // Select new realistic waypoint target when reaching destination or idle timeout
              if (
                updated.targetX === undefined ||
                updated.targetY === undefined ||
                (Math.hypot(updated.targetX - updated.x, updated.targetY - updated.y) < 1.5)
              ) {
                if (Math.random() < 0.35 && (updated.idleRemaining || 0) <= 0) {
                  // Person stops to work/rest
                  updated.presenceState = 'IDLE';
                  updated.idleRemaining = Math.floor(Math.random() * 4) + 2; // stay idle for 2-5 ticks
                } else if ((updated.idleRemaining || 0) > 0) {
                  updated.idleRemaining = (updated.idleRemaining || 1) - 1;
                  updated.presenceState = 'IDLE';
                } else {
                  // Pick new waypoint in current zone
                  updated.targetX = zoneRect.x + 3 + Math.random() * (zoneRect.width - 6);
                  updated.targetY = zoneRect.y + 3 + Math.random() * (zoneRect.height - 6);
                  updated.presenceState = 'MOVING';
                }
              }

              if (updated.presenceState === 'MOVING' && updated.targetX !== undefined && updated.targetY !== undefined) {
                const dx = updated.targetX - updated.x;
                const dy = updated.targetY - updated.y;
                const distance = Math.hypot(dx, dy);

                if (distance > 0.1) {
                  const walkingSpeed = 0.5 + Math.random() * 0.3; // natural human walk pace (meters per tick)
                  const step = Math.min(walkingSpeed, distance);
                  
                  // Compute heading in degrees
                  const heading = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
                  updated.heading = heading;
                  updated.speed = Math.round((step * 1.2) * 10) / 10;

                  // Move smoothly towards target
                  updated.x = updated.x + (dx / distance) * step;
                  updated.y = updated.y + (dy / distance) * step;
                }
              } else {
                updated.speed = 0;
              }

              // Keep strictly within zone bounds
              updated.x = Math.max(zoneRect.x + 0.5, Math.min(zoneRect.x + zoneRect.width - 0.5, updated.x));
              updated.y = Math.max(zoneRect.y + 0.5, Math.min(zoneRect.y + zoneRect.height - 0.5, updated.y));

              // Update smooth breadcrumb trail
              updated.trail = updated.trail ? [...updated.trail] : [];
              if (updated.presenceState === 'MOVING') {
                updated.trail.push({ x: Math.round(updated.x * 100) / 100, y: Math.round(updated.y * 100) / 100 });
                if (updated.trail.length > 25) updated.trail.shift();
              }

              return updated;
            });
          });

         setVehicles(prevVehicles => {
           const zonesList = getZonesForProject(activeProjectId);
           return prevVehicles.map(vehicle => {
             const updated = { ...vehicle };
             
             const getZoneIdFromId = (id: string, zones: string[]): string => {
               if (zones.length === 0) return '';
               let hash = 0;
               for (let i = 0; i < id.length; i++) {
                 hash = id.charCodeAt(i) + ((hash << 5) - hash);
               }
               const index = Math.abs(hash) % zones.length;
               return zones[index];
             };

             const currentZone = getZoneIdFromId(vehicle.id, zonesList);
             const zoneRect = getZoneRect(currentZone, activeProjectId, dynamicZones);
             
             const anchorX = zoneRect.x + 5 + (Math.abs(vehicle.id.charCodeAt(0) * 12) % (zoneRect.width - 10));
             const anchorY = zoneRect.y + 5 + (Math.abs((vehicle.id.charCodeAt(1) || 0) * 7) % (zoneRect.height - 10));

             const targetX = anchorX + Math.sin(Date.now() / 4000 + vehicle.id.charCodeAt(0)) * 10;
             const targetY = anchorY + Math.cos(Date.now() / 4000 + (vehicle.id.charCodeAt(1) || 0)) * 10;

             updated.x = updated.x + (targetX - updated.x) * 0.05;
             updated.y = updated.y + (targetY - updated.y) * 0.05;

             updated.speed = Math.sin(Date.now() / 5000) > 0 ? Math.floor(5 + Math.random() * 5) : 0;
             updated.status = updated.speed > 0 ? 'Moving' : 'Idle';

             return updated;
           });
         });

         setAssets(prevAssets => {
           const zonesList = getZonesForProject(activeProjectId);
           return prevAssets.map(asset => {
             const updated = { ...asset };
             updated.battery = Math.max(0, (updated.battery || 100) - (Math.random() < 0.05 ? 1 : 0));
             
             const getZoneIdFromId = (id: string, zones: string[]): string => {
               if (zones.length === 0) return '';
               let hash = 0;
               for (let i = 0; i < id.length; i++) {
                 hash = id.charCodeAt(i) + ((hash << 5) - hash);
               }
               const index = Math.abs(hash) % zones.length;
               return zones[index];
             };

             const currentZone = getZoneIdFromId(asset.id, zonesList);
             const zoneRect = getZoneRect(currentZone, activeProjectId, dynamicZones);
             
             const anchorX = zoneRect.x + 5 + (Math.abs(asset.id.charCodeAt(0) * 12) % (zoneRect.width - 10));
             const anchorY = zoneRect.y + 5 + (Math.abs((asset.id.charCodeAt(1) || 0) * 7) % (zoneRect.height - 10));

             const targetX = anchorX + Math.sin(Date.now() / 8000 + asset.id.charCodeAt(0)) * 2;
             const targetY = anchorY + Math.cos(Date.now() / 8000 + (asset.id.charCodeAt(1) || 0)) * 2;

             updated.x = updated.x + (targetX - updated.x) * 0.02;
             updated.y = updated.y + (targetY - updated.y) * 0.02;

             return updated;
           });
         });
       };

       interval = setInterval(demoSimulationTick, 1800);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [mode, activeProjectId, dynamicZones]);

  return { people, assets, vehicles, alerts, ZONES: dynamicZones, isLoading };
}


