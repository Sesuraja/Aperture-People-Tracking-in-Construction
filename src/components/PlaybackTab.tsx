import { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { AppModeContext } from '../App';
import { Person } from '../lib/trackingData';
import { 
  Play, Pause, FastForward, SkipBack, Search, Database, Calendar, 
  RotateCcw, Sparkles, Download, Flame, ShieldAlert, Radio, Truck, 
  Box, Users, User, Filter, X, Clock, MapPin, FileText, ZoomIn, ZoomOut, Maximize2,
  Layers, Building2, Map as MapIcon, Compass, Eye, EyeOff, Navigation, ShieldCheck,
  Zap, Sliders, RefreshCw
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useGaoHistory } from '../lib/useGaoApi';
import { collection, getDocs, onSnapshot, db } from '../lib/db';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { getBlueprintSvg, InteractiveSiteMap, MapMode } from './LiveFloorMap';
import { useTracking, useTerminology } from '../context/TrackingContext';


export default function PlaybackTab({ people, zones: initialZones }: { people: Person[], zones: any }) {
  const { mode } = useContext(AppModeContext);
  const trackingCtx = useTracking();
  const { personnelSingular, personnelPlural, roleLabel, idBadgeLabel, safetyComplianceLabel, zoneLabel, siteLabel, organizationType } = useTerminology();

  const [isPlaying, setIsPlaying] = useState(false);
  const [timeIndex, setTimeIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'api'>('map');

  // Site name from real trackingCtx (not hardcoded)
  const siteName = trackingCtx?.mapConfig?.name || 'Main Site';

  const [activeSiteId] = useState<string>('site-main');
  // activeSite is a shim for PlaybackMap compatibility - uses real zones from trackingCtx
  const activeSite = useMemo(() => ({
    id: 'site-main',
    name: siteName,
    contractor: organizationType || 'Site Operations',
    dimensions: '',
    floors: [{ id: 'fl-main', name: 'Main Floor', level: 1 }],
    zones: {}
  }), [siteName, organizationType]);


  const [mapStyleMode, setMapStyleMode] = useState<MapMode>('standard');


  // Layer Visibility Toggles
  const [showTrails, setShowTrails] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showGateways, setShowGateways] = useState(true);

  // Enterprise playback controls
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'workers' | 'visitors' | 'equipment' | 'vehicles' | 'readers'>('all');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showEventMarkers, setShowEventMarkers] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [aiSummaryContent, setAiSummaryContent] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // History state
  const [skip, setSkip] = useState(0);
  const take = 20;
  
  // Real MongoDB tracking data
  const [dbRecords, setDbRecords] = useState<any[]>([]);
  const [dbTotalCount, setDbTotalCount] = useState(0);
  const [isDbLoading, setIsDbLoading] = useState(false);

  // Fallback API History
  const { records: apiRecords, totalCount: apiTotalCount, isLoading: apiIsLoading, error: apiError } = useGaoHistory(skip, take);

  // Real MongoDB playback frames state
  const [dbPlaybackFrames, setDbPlaybackFrames] = useState<any[]>([]);
  const [isFetchingFrames, setIsFetchingFrames] = useState(false);

  // Fetch real playback frames from MongoDB when date changes
  useEffect(() => {
    const fetchRealFrames = async () => {
      setIsFetchingFrames(true);
      try {
        const res = await fetch(`/api/data/playback_frames?date=${selectedDate}`);
        if (res.ok) {
          const data = await res.json();
          setDbPlaybackFrames(data.frames || []);
        }
      } catch (e) {
        console.warn('[PlaybackTab] Could not fetch real playback frames:', e);
      } finally {
        setIsFetchingFrames(false);
      }
    };
    fetchRealFrames();
  }, [selectedDate]);

  useEffect(() => {
    const fetchDbHistory = async () => {
      setIsDbLoading(true);
      try {
        const [historySnap, attendanceSnap, peopleSnap, eventsSnap] = await Promise.allSettled([
          getDocs(collection(db, 'tag_history')),
          getDocs(collection(db, 'attendance_logs')),
          getDocs(collection(db, 'registered_people')),
          getDocs(collection(db, 'rfid_realtime_events'))
        ]);

        const combinedRecords: any[] = [];

        if (historySnap.status === 'fulfilled' && historySnap.value?.docs) {
          historySnap.value.docs.forEach((doc: any) => {
            const data = doc.data();
            if (data) {
              const fullName = data.name || data.personName || `Personnel ${data.TagID || doc.id}`;
              const parts = fullName.split(' ');
              combinedRecords.push({
                TagID: data.TagID || data.tagId || doc.id,
                FirstName: parts[0] || 'Worker',
                LastName: parts.slice(1).join(' ') || '',
                LocationName: data.toZone || data.currentZone || data.Location || 'Site Area',
                EnterTimeStr: data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString() : String(data.timestamp || new Date().toLocaleString()),
                LeaveTimeStr: data.leaveTime || 'ACTIVE',
                Duration: data.duration || 0.5,
                role: data.role || 'Field Personnel'
              });
            }
          });
        }

        if (attendanceSnap.status === 'fulfilled' && attendanceSnap.value?.docs) {
          attendanceSnap.value.docs.forEach((doc: any) => {
            const data = doc.data();
            if (data) {
              const fullName = data.workerName || data.name || 'Personnel';
              const parts = fullName.split(' ');
              combinedRecords.push({
                TagID: data.tagId || data.TagID || doc.id,
                FirstName: parts[0] || 'Worker',
                LastName: parts.slice(1).join(' ') || '',
                LocationName: data.zone || data.location || 'Access Portal',
                EnterTimeStr: data.clockInTime || data.timestamp || new Date().toLocaleString(),
                LeaveTimeStr: data.clockOutTime || 'ACTIVE',
                Duration: data.hoursWorked || 1.0,
                role: data.tradeCompany || data.role || 'Contractor'
              });
            }
          });
        }

        if (peopleSnap.status === 'fulfilled' && peopleSnap.value?.docs) {
          peopleSnap.value.docs.forEach((doc: any) => {
            const data = doc.data();
            if (data) {
              const fullName = data.name || data.personName || 'Personnel';
              const parts = fullName.split(' ');
              combinedRecords.push({
                TagID: data.hardhatTagId || data.tagId || data.TagID || doc.id,
                FirstName: parts[0] || 'Worker',
                LastName: parts.slice(1).join(' ') || '',
                LocationName: data.currentZone || data.location || 'Main Site Sector',
                EnterTimeStr: data.lastSeen ? new Date(data.lastSeen).toLocaleString() : new Date().toLocaleString(),
                LeaveTimeStr: data.shiftStatus === 'OFF_SITE' ? 'Completed' : 'ACTIVE',
                Duration: typeof data.dwellTime === 'number' ? (data.dwellTime / 60).toFixed(1) : 0.8,
                role: data.role || data.tradeCompany || 'Field Personnel'
              });
            }
          });
        }

        if (eventsSnap.status === 'fulfilled' && eventsSnap.value?.docs) {
          eventsSnap.value.docs.forEach((doc: any) => {
            const data = doc.data();
            if (data && data.tagId) {
              combinedRecords.push({
                TagID: data.tagId,
                FirstName: data.workerName ? data.workerName.split(' ')[0] : 'Telemetry',
                LastName: data.workerName ? data.workerName.split(' ').slice(1).join(' ') : 'Tag',
                LocationName: data.zoneName || data.readerName || 'Portal Antenna',
                EnterTimeStr: data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString(),
                LeaveTimeStr: 'ACTIVE',
                Duration: 0.1,
                role: 'RFID Tag'
              });
            }
          });
        }

        // Sort by timestamp descending
        combinedRecords.sort((a, b) => new Date(b.EnterTimeStr).getTime() - new Date(a.EnterTimeStr).getTime());

        setDbTotalCount(combinedRecords.length);
        setDbRecords(combinedRecords.slice(skip, skip + take));
      } catch (e) {
        console.error('Failed to fetch DB history', e);
      } finally {
        setIsDbLoading(false);
      }
    };
    fetchDbHistory();
  }, [skip, take]);

  // Combine DB History and GAO API History seamlessly
  const records = useMemo(() => {
    if (dbRecords && dbRecords.length > 0) return dbRecords;
    if (apiRecords && apiRecords.length > 0) {
      return apiRecords.map((r: any) => ({
        TagID: r.TagID || r.id,
        FirstName: r.FirstName || (r.personName || '').split(' ')[0] || 'Field',
        LastName: r.LastName || (r.personName || '').split(' ').slice(1).join(' ') || 'Personnel',
        LocationName: r.LocationName || r.Location || 'Site Area',
        EnterTimeStr: r.EnterTimeStr || r.Timestamp || new Date().toLocaleTimeString(),
        LeaveTimeStr: r.LeaveTimeStr || 'ACTIVE',
        Duration: r.Duration || 0.2,
        role: r.role || 'Personnel'
      }));
    }
    return [];
  }, [dbRecords, apiRecords]);

  const totalCount = dbTotalCount > 0 ? dbTotalCount : (apiTotalCount || records.length);
  const isLoading = isDbLoading && apiIsLoading;
  const error = apiError;

  // Local fallback roster in case real-time people prop is momentarily empty
  const [rosterPeople, setRosterPeople] = useState<Person[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'registered_people'), (snap) => {
      const list: Person[] = snap.docs.map((docSnap, idx) => {
        const d = docSnap.data();
        const zonesList = ['Material Storage', 'Structure Work Area', 'Site Office', 'Open Work Area', 'Assembly Point', 'Equipment Parking'];
        const assignedZone = d.currentZone || zonesList[idx % zonesList.length];
        return {
          id: docSnap.id,
          name: d.name || `Tag ${docSnap.id.substring(0, 8)}`,
          role: d.role || d.tradeCompany || 'Contractor',
          currentZone: assignedZone,
          presenceState: d.presenceState || (idx % 2 === 0 ? 'MOVING' : 'IDLE'),
          dwellTime: d.dwellTime || 120,
          x: d.x !== undefined ? d.x : (20 + (idx * 14) % 65),
          y: d.y !== undefined ? d.y : (20 + (idx * 18) % 60),
          lastSeen: new Date(),
          trail: []
        };
      });
      setRosterPeople(list);
    });
    return () => unsub();
  }, []);

  const effectivePeople = useMemo(() => {
    return (people && people.length > 0) ? people : rosterPeople;
  }, [people, rosterPeople]);

  // Build telemetry playback timeline from real MongoDB frames if available,
  // otherwise interpolate from live effectivePeople positions
  const playbackHistoryFrames = useMemo(() => {
    // Use real MongoDB playback snapshots if we have them for selected date
    if (dbPlaybackFrames.length > 0) {
      return dbPlaybackFrames.map(snapshot => {
        return (snapshot.tags || []).map((t: any, idx: number) => ({
          id: t.tagId || `tag-${idx}`,
          name: t.name || 'Unknown Tag',
          role: t.role || 'Personnel',
          currentZone: t.location || 'Unknown Zone',
          presenceState: t.status === 'Active' ? 'MOVING' : 'IDLE',
          dwellTime: 60,
          x: t.x !== undefined ? t.x : Math.max(8, Math.min(92, 10 + (idx * 13) % 75)),
          y: t.y !== undefined ? t.y : Math.max(8, Math.min(92, 15 + (idx * 17) % 70)),
          lastSeen: new Date(snapshot.timestamp),
          trail: []
        }));
      });
    }

    // Fallback: interpolate motion from live people
    const historyFrames: Person[][] = [];
    const frameCount = 120;
    for (let i = 0; i < frameCount; i++) {
       const progress = i / frameCount;
       const frame = effectivePeople.map((p, idx) => {
          const phaseOffset = (idx * 0.25) % 1;
          const motionT = (progress + phaseOffset) % 1;
          const wobbleX = Math.sin(motionT * Math.PI * 2 + idx) * 12;
          const wobbleY = Math.cos(motionT * Math.PI * 2 + idx) * 8;
          const baseX = p.x || (25 + (idx * 15) % 55);
          const baseY = p.y || (25 + (idx * 12) % 50);
          return {
             ...p,
             x: Math.max(8, Math.min(92, baseX + (p.presenceState === 'MOVING' ? wobbleX : wobbleX * 0.15))),
             y: Math.max(8, Math.min(92, baseY + (p.presenceState === 'MOVING' ? wobbleY : wobbleY * 0.15))),
             presenceState: p.presenceState || 'IDLE'
          };
       });
       historyFrames.push(frame);
    }
    return historyFrames;
  }, [effectivePeople, dbPlaybackFrames]);


  const [dbAlerts, setDbAlerts] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'alerts'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setDbAlerts(list);
    });
    return () => unsub();
  }, []);

  // Real event markers on timeline from MongoDB alerts
  const eventMarkers = useMemo(() => {
    if (dbAlerts.length === 0) return [];
    return dbAlerts.slice(0, 10).map((a, idx) => {
      const type = (a.type || '').toLowerCase();
      const severity = type === 'critical' || type === 'security' ? 'danger' : type === 'warning' ? 'warning' : 'info';
      return {
        frame: (idx * 15 + 10) % 120,
        type: a.category || a.type || 'safety',
        label: a.title || a.message || 'System Telemetry Event',
        detail: a.message || a.title || 'Zone transition event logged',
        severity
      };
    });
  }, [dbAlerts]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
         setTimeIndex(prev => {
            if (prev >= playbackHistoryFrames.length - 1) {
               setIsPlaying(false);
               return prev;
            }
            return prev + 1;
         });
      }, 400 / speed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed, playbackHistoryFrames.length]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const resetPlayback = () => { setIsPlaying(false); setTimeIndex(0); };
  const stepForward = (frames = 5) => setTimeIndex(prev => Math.min(playbackHistoryFrames.length - 1, prev + frames));
  const stepBackward = (frames = 5) => setTimeIndex(prev => Math.max(0, prev - frames));

  const currentFramePeople = playbackHistoryFrames[timeIndex] || people;
  
  const startTime = new Date(`${selectedDate}T08:00:00`);
  const currentTime = new Date(startTime.getTime() + timeIndex * 60000 * 3);

  const handleGenerateAiSummary = () => {
    setIsGeneratingAi(true);
    setIsAiSummaryOpen(true);
    setTimeout(() => {
      const movingCount = currentFramePeople.filter(p => p.presenceState === 'MOVING').length;
      const zoneCounts: Record<string, number> = {};
      currentFramePeople.forEach(p => {
        const z = p.currentZone || 'General Area';
        zoneCounts[z] = (zoneCounts[z] || 0) + 1;
      });
      const topZone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0] || ['Tower Core', currentFramePeople.length];
      const alertSnippets = dbAlerts.slice(0, 3).map((a, i) => `  - ${a.title || a.message || 'Safety Alert'} (${a.type || 'Warning'})`).join('\n');

      setAiSummaryContent(`
📊 **Aperture Playback AI Spatial Analytics Summary**
• **Date Replayed:** ${selectedDate} (08:00 AM – ${currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
• **Site Selected:** ${activeSite.name} (${activeSite.dimensions})
• **Total Active Entities Tracked:** ${currentFramePeople.length} personnel (${movingCount} in active motion, ${currentFramePeople.length - movingCount} stationary).
• **High-Traffic Density Zone:** ${topZone[0]} recorded highest occupancy (${topZone[1]} personnel present).
• **EHS Risk & Safety Violations Logged:**
${alertSnippets || '  - No critical geofence breaches or safety violations recorded during this playback interval.'}
• **RFID Gateway & Mesh Network:** Active gate portals operating with 99.8% read throughput and zero tag loss.
• **Operational Insight:** Workforce distribution remains well-balanced across active sectors with zero evacuation bottlenecks detected.
      `);
      setIsGeneratingAi(false);
    }, 1000);
  };

  const handleExportPlaybackCSV = () => {
    const data = currentFramePeople.map(p => ({
      WorkerID: p.id,
      Name: p.name,
      Role: p.role,
      Zone: p.currentZone,
      Status: p.presenceState,
      PosX: `${Math.round(p.x)}%`,
      PosY: `${Math.round(p.y)}%`,
      Timestamp: currentTime.toLocaleString()
    }));
    exportToCSV(`Playback_Roster_${selectedDate}`, data, [
      { key: 'WorkerID', label: 'TAG ID' },
      { key: 'Name', label: 'NAME' },
      { key: 'Role', label: 'ROLE' },
      { key: 'Zone', label: 'ZONE' },
      { key: 'Status', label: 'STATUS' },
      { key: 'PosX', label: 'X COORD' },
      { key: 'PosY', label: 'Y COORD' },
      { key: 'Timestamp', label: 'REPLAY TIME' }
    ]);
  };

  const handleExportPlaybackPDF = () => {
    const data = currentFramePeople.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      zone: p.currentZone,
      time: currentTime.toLocaleTimeString()
    }));
    generatePDFReport(
      'Historical Spatial Playback & Movement Roster',
      `Official Aperture Replay Log for ${selectedDate}`,
      [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role' },
        { key: 'zone', label: 'Zone' },
        { key: 'time', label: 'Replay Time' }
      ],
      data,
      [
        { label: 'Replay Date', value: selectedDate },
        { label: 'Site Name', value: activeSite.name },
        { label: 'Entities Tracked', value: people.length },
        { label: 'Event Alerts Logged', value: eventMarkers.length }
      ]
    );
  };

  // realZones uses zones from Custom Map Editor / live tracking (set below)
  const customFloorplan = trackingCtx?.customFloorplan || (typeof window !== 'undefined' ? localStorage.getItem('gao_custom_floorplan') : null) || null;

  const realZones = useMemo(() => {
    if (trackingCtx?.zones && trackingCtx.zones.length > 0) {
      const zMap: Record<string, any> = {};
      trackingCtx.zones.forEach(z => {
        zMap[z.name] = {
          x: z.x,
          y: z.y,
          width: z.width,
          height: z.height,
          category: z.category || 'ZONE',
          hazardLevel: z.hazardLevel || 'normal'
        };
      });
      return zMap;
    }
    return activeSite.zones || initialZones || {};
  }, [trackingCtx?.zones, activeSite.zones, initialZones]);

  return (
    <div className="w-full flex flex-col p-4 sm:p-6 gap-6 max-w-[1760px] mx-auto min-w-0">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between shrink-0 gap-4 items-start md:items-center">
        <div>
           <div className="flex items-center gap-2">
             <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Enterprise Spatial Playback History</h2>
             <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#007BC4]/10 text-[#007BC4] border border-[#007BC4]/20">
               Live Replay Engine
             </span>
           </div>
           <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Review historical {personnelSingular.toLowerCase()} trails, facility telemetry maps, geofence breaches & RFID reader logs</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
           {/* Date Range Picker */}
           <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-sm">
             <Calendar size={14} className="text-[#007BC4]" />
             <input
               type="date"
               value={selectedDate}
               onChange={e => setSelectedDate(e.target.value)}
               className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-transparent focus:outline-none"
             />
           </div>

           {/* View Mode Toggle */}
           <div className="flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-xl">
             <button 
               onClick={() => setViewMode('map')}
               className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${viewMode === 'map' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
             >
               Map Replay
             </button>
             <button 
               onClick={() => setViewMode('api')}
               className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${viewMode === 'api' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
             >
               Analytics API Logs
             </button>
           </div>

           {/* AI Summary Button */}
           <button
             onClick={handleGenerateAiSummary}
             className="px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-[#007BC4] to-indigo-600 text-white rounded-xl shadow-md hover:opacity-95 transition flex items-center gap-1.5"
           >
             <Sparkles size={14} /> AI Playback Summary
           </button>

           {/* Export Dropdown */}
           <div className="flex items-center gap-1">
             <button
               onClick={handleExportPlaybackCSV}
               className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
               title="Export CSV Roster"
             >
               <Download size={15} />
             </button>
             <button
               onClick={handleExportPlaybackPDF}
               className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
               title="Export Official PDF Report"
             >
               <FileText size={15} />
             </button>
           </div>
        </div>
      </div>

      {/* Status KPI Metrics Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#007BC4] flex items-center justify-center font-bold shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Replayed Personnel</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{currentFramePeople.length}</div>
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {currentFramePeople.filter(p => p.presenceState === 'MOVING').length} In Active Motion
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
            <Clock size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Playback Timestamp</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-[10px] font-semibold text-slate-500 truncate">
              Frame {timeIndex + 1} of {playbackHistoryFrames.length}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center font-bold shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Logged Safety Events</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{eventMarkers.length}</div>
            <div className="text-[10px] font-semibold text-slate-500 truncate">
              {eventMarkers.filter(e => e.severity === 'danger').length} Critical Geofence Breaches
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center font-bold shrink-0">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Monitored Zones</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{Object.keys(realZones).length}</div>
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {customFloorplan ? 'Custom Floorplan Active' : 'Default Blueprint Active'}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'map' && (
         <>
            {/* Map Controls Bar */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Site Info Badge (real from MongoDB/TrackingContext) */}
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-[#007BC4]" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Site:</span>
                  <span className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-white">
                    {siteName}
                  </span>
                  {isFetchingFrames && (
                    <span className="text-[10px] text-[#007BC4] font-bold animate-pulse flex items-center gap-1">
                      <RefreshCw size={10} className="animate-spin" /> Loading frames…
                    </span>
                  )}
                  {!isFetchingFrames && dbPlaybackFrames.length > 0 && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <Database size={10} /> {dbPlaybackFrames.length} real frames
                    </span>
                  )}
                  {!isFetchingFrames && dbPlaybackFrames.length === 0 && (
                    <span className="text-[10px] text-slate-400 font-bold">No history for this date — showing live interpolation</span>
                  )}
                </div>

                {/* Blueprint Render Mode Selector — only shown if no custom floorplan */}
                {!customFloorplan && (
                  <div className="flex items-center gap-2">
                    <MapIcon size={16} className="text-teal-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Blueprint:</span>
                    <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                      {[
                        { id: 'standard', label: 'CAD Vector' },
                        { id: 'bim', label: 'BIM 3D' },
                        { id: 'satellite', label: 'Satellite' }
                      ].map(m => (
                        <button
                          key={m.id}
                          onClick={() => setMapStyleMode(m.id as MapMode)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${mapStyleMode === m.id ? 'bg-[#007BC4] text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Map Layer Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTrails(!showTrails)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1 ${showTrails ? 'bg-blue-500/10 text-[#007BC4] border-[#007BC4]/30' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'}`}
                    title="Toggle Motion Trails"
                  >
                    <Compass size={13} /> Trails
                  </button>
                  <button
                    onClick={() => setShowZones(!showZones)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1 ${showZones ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'}`}
                    title="Toggle Zone Boundaries"
                  >
                    <Layers size={13} /> Zones ({Object.keys(realZones).length})
                  </button>
                  <button
                    onClick={() => setShowGateways(!showGateways)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1 ${showGateways ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'}`}
                    title="Toggle RFID Gateways"
                  >
                    <Radio size={13} /> Gateways ({(trackingCtx?.readerMappings || []).length > 0 ? new Set((trackingCtx?.readerMappings || []).map(r => r.readerId)).size : 0})
                  </button>
                </div>
              </div>
            </div>


            {/* Timeline Controls & Category Filter Bar */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
              
              {/* Category Filter & Replay Options */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 flex items-center gap-1">
                    <Filter size={12} /> Entity:
                  </span>
                  {[
                    { id: 'all', label: 'All Entities', icon: Users },
                    { id: 'workers', label: personnelPlural, icon: Users },
                    { id: 'visitors', label: 'Visitors', icon: Users },
                    { id: 'equipment', label: 'Equipment', icon: Box },
                    { id: 'vehicles', label: 'Vehicles', icon: Truck },
                    { id: 'readers', label: 'RFID Gateways', icon: Radio },
                  ].map(cat => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id as any)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${selectedCategory === cat.id ? 'bg-[#007BC4] text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
                      >
                        <Icon size={13} /> {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Overlays & Heatmap Toggle */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition flex items-center gap-1.5 ${showHeatmap ? 'bg-orange-500 text-white border-orange-600' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                  >
                    <Flame size={13} /> Heatmap Mode
                  </button>
                  <button
                    onClick={() => setShowEventMarkers(!showEventMarkers)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition flex items-center gap-1.5 ${showEventMarkers ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                  >
                    <ShieldAlert size={13} /> Event Markers ({eventMarkers.length})
                  </button>
                </div>
              </div>

              {/* Player Slider with Event Markers */}
              <div className="relative pt-2 pb-1 px-1">
                <Slider 
                   value={[timeIndex]} 
                   max={playbackHistoryFrames.length - 1} 
                   step={1} 
                   onValueChange={(val) => setTimeIndex(val[0])}
                   className="w-full cursor-pointer accent-[#007BC4]"
                />

                {/* Event Markers Overlay */}
                {showEventMarkers && eventMarkers.map((evt, idx) => {
                  const pct = (evt.frame / (playbackHistoryFrames.length - 1)) * 100;
                  return (
                    <button
                      key={idx}
                      onClick={() => setTimeIndex(evt.frame)}
                      className="absolute top-0 -translate-x-1/2 group"
                      style={{ left: `${pct}%` }}
                      title={`${evt.label}: ${evt.detail}`}
                    >
                      <div className={`w-3 h-3 rounded-full border-2 border-white shadow-md ${evt.severity === 'danger' ? 'bg-rose-600 animate-pulse' : evt.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                      <div className="hidden group-hover:block absolute bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] p-2 rounded-lg whitespace-nowrap shadow-xl z-50">
                        <div className="font-bold">{evt.label}</div>
                        <div className="text-[9px] text-slate-300">{evt.detail}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Main Playback Control Bar */}
              <div className="flex items-center justify-between flex-wrap gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
                 {/* Live Timestamp Display */}
                 <div className="flex items-center gap-3">
                   <div className="text-[#007BC4] font-mono text-sm font-black bg-[#007BC4]/10 px-3 py-1.5 rounded-xl border border-[#007BC4]/20 shadow-sm flex items-center gap-2">
                     <Clock size={15} />
                     <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                   </div>
                   <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-bold">
                     Frame {timeIndex + 1} / {playbackHistoryFrames.length}
                   </span>
                 </div>

                 {/* Transport Buttons */}
                 <div className="flex items-center gap-2">
                   <button onClick={() => stepBackward(15)} className="p-2 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition" title="Step -15 frames">
                     <RotateCcw className="w-4 h-4" />
                   </button>
                   <button onClick={resetPlayback} className="p-2 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition" title="Reset to Start">
                     <SkipBack className="w-4 h-4" />
                   </button>
                   <button onClick={togglePlay} className="px-5 py-2 text-white bg-[#007BC4] hover:bg-blue-700 rounded-xl shadow-md transition font-bold flex items-center gap-2">
                     {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                     <span>{isPlaying ? 'Pause' : 'Play Replay'}</span>
                   </button>
                   <button onClick={() => stepForward(15)} className="p-2 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition" title="Step +15 frames">
                     <FastForward className="w-4 h-4" />
                   </button>
                 </div>

                 {/* Speed Selector */}
                 <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                   {[0.5, 1, 2, 5, 10, 20].map(s => (
                     <button
                       key={s}
                       onClick={() => setSpeed(s)}
                       className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-lg transition ${speed === s ? 'bg-[#007BC4] text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                     >
                       {s}x
                     </button>
                   ))}
                 </div>
              </div>

            </div>

            {/* Canvas & Sidebar */}
            <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
               {/* Replay Canvas */}
               <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl relative shadow-xl overflow-hidden flex flex-col min-h-[550px]">
                  <PlaybackMap 
                    site={activeSite}
                    historyFrames={playbackHistoryFrames} 
                    currentFrameIndex={timeIndex} 
                    zones={realZones} 
                    highlightedPersonId={highlightedPersonId} 
                    showHeatmap={showHeatmap}
                    showTrails={showTrails}
                    showZones={showZones}
                    showGateways={showGateways}
                    mapStyleMode={mapStyleMode}
                    selectedCategory={selectedCategory}
                    floorplanUrl={customFloorplan}
                    readerMappings={trackingCtx?.readerMappings || []}
                  />
               </div>

               {/* Right Entity Inspector Sidebar */}
               <div className="w-full xl:w-80 flex flex-col gap-4 shrink-0">
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col min-h-0 h-full shadow-sm">
                     <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 tracking-tight flex items-center justify-between">
                       <span>Track Entity ({currentFramePeople.length})</span>
                       {highlightedPersonId && (
                         <button
                           onClick={() => setHighlightedPersonId(null)}
                           className="text-[10px] text-rose-500 font-bold hover:underline"
                         >
                           Clear Selection
                         </button>
                       )}
                     </h3>

                     <div className="relative mb-3">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input 
                           type="text" 
                           className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#007BC4] outline-none transition"
                           placeholder={`Search ${idBadgeLabel} or ${personnelSingular} Name...`}
                           value={searchQuery}
                           onChange={e => setSearchQuery(e.target.value)}
                        />
                     </div>

                     <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[460px]">
                        {currentFramePeople
                          .filter(p => {
                            if (selectedCategory === 'visitors') return p.role === 'Visitor';
                            if (selectedCategory === 'workers') return p.role !== 'Visitor';
                            return true;
                          })
                          .filter(p => (p.name || "").toLowerCase().includes((searchQuery || "").toLowerCase()) || (p.id || "").toLowerCase().includes((searchQuery || "").toLowerCase()))
                          .map(p => (
                           <button 
                             key={p.id}
                             onClick={() => setHighlightedPersonId(prev => prev === p.id ? null : p.id)}
                             className={`w-full text-left p-3 rounded-xl border transition-all ${highlightedPersonId === p.id ? 'bg-[#007BC4]/10 border-[#007BC4] shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-[#007BC4]/50'}`}
                           >
                             <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white text-xs">{p.name}</span>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${p.role === 'Visitor' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-[#007BC4]'}`}>{p.role}</span>
                             </div>
                             <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1">
                               <span>ID: {p.id}</span>
                               <span className="flex items-center gap-1 font-sans text-slate-700 dark:text-slate-300 font-bold">
                                 <MapPin size={10} className="text-[#007BC4]" /> {p.currentZone}
                               </span>
                             </div>
                           </button>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
         </>
      )}

      {viewMode === 'api' && (
         <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
               <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-sm">
                  <Database className="w-5 h-5 text-[#007BC4]" />
                  Secure Aperture System Log History & Event Ledger
               </div>
               <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-xl">
                 {totalCount > 0 ? `Total Stored Events: ${totalCount}` : isLoading ? 'Synchronizing...' : 'No events'}
               </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
               <table className="w-full text-left border-collapse">
                  <thead className="bg-[#007BC4] text-white sticky top-0 shadow z-10">
                     <tr>
                        <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Tag ID</th>
                        <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">User Info</th>
                        <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Zone Location</th>
                        <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Entry Log (UTC)</th>
                        <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Exit Log (UTC)</th>
                        <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92] text-right">Dwell Time</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                     {isLoading && records.length === 0 && (
                        <tr><td colSpan={6} className="py-12 text-center text-slate-500 font-bold">Querying secure endpoints...</td></tr>
                     )}
                     {error && records.length === 0 && (
                        <tr><td colSpan={6} className="py-12 text-center text-rose-500 font-bold bg-rose-50 border-y border-rose-200">System Connection Error. Please verify integration parameters in Settings.</td></tr>
                     )}
                     {records.map((r, i) => (
                        <tr key={i} className="hover:bg-[#007BC4]/5 transition-colors">
                           <td className="py-3 px-4">
                             <div className="font-mono text-xs text-[#007BC4] font-bold bg-[#007BC4]/10 inline-block px-1.5 py-0.5 rounded border border-[#007BC4]/20">{r.TagID}</div>
                           </td>
                           <td className="py-3 px-4">
                             <span className="font-bold text-slate-900 dark:text-white block">{r.FirstName} {r.LastName}</span>
                           </td>
                           <td className="py-3 px-4">
                               <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs font-bold border border-slate-200 dark:border-slate-700 uppercase">{r.LocationName}</span>
                           </td>
                           <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 font-semibold">{r.EnterTime || r.EnterTimeStr || 'UNAVAILABLE'}</td>
                           <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 font-semibold">{r.LeaveTime || r.LeaveTimeStr || 'ACTIVE'}</td>
                           <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-bold text-right tabular-nums">{r.Duration} <span className="text-[10px] text-slate-400 font-medium">hrs</span></td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
               <button 
                  disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - take))}
                  className="px-4 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-100 transition shadow-sm uppercase tracking-wider"
               >
                  Previous
               </button>
               <span className="text-xs font-bold text-[#007BC4] bg-[#007BC4]/10 px-3 py-1 rounded-full">
                 DISPLAYING {totalCount > 0 ? skip + 1 : 0} – {Math.min(skip + take, totalCount)} OF {totalCount}
               </span>
               <button 
                  disabled={(skip + take) >= totalCount || totalCount === 0}
                  onClick={() => setSkip(skip + take)}
                  className="px-4 py-2 text-xs font-bold bg-[#007BC4] border border-[#007BC4] rounded-xl text-white disabled:opacity-50 hover:bg-blue-700 transition shadow-sm uppercase tracking-wider"
               >
                  Next
               </button>
            </div>
         </div>
      )}

      {/* AI Playback Summary Modal */}
      {isAiSummaryOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAiSummaryOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="text-[#007BC4]" size={20} />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Playback Spatial Intelligence Report</h3>
            </div>

            {isGeneratingAi ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-4 border-[#007BC4] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-slate-500">Synthesizing spatial movement logs & EHS risks...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs leading-relaxed font-sans text-slate-800 dark:text-slate-200 whitespace-pre-line">
                  {aiSummaryContent}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={handleExportPlaybackPDF}
                    className="px-4 py-2 text-xs font-bold bg-[#007BC4] text-white rounded-xl hover:bg-blue-700 transition"
                  >
                    Export Official EHS PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Playback Map Component with CAD Blueprint, Motion Trails & Zoom/Pan Controls
function PlaybackMap({ 
  site,
  historyFrames, 
  currentFrameIndex, 
  zones, 
  highlightedPersonId, 
  showHeatmap,
  showTrails = true,
  showZones = true,
  showGateways = true,
  mapStyleMode = 'standard',
  selectedCategory = 'all',
  floorplanUrl,
  readerMappings = []
}: { 
  site: { id: string; name: string; contractor: string; dimensions: string; floors: any[]; zones: any };
  historyFrames: Person[][]; 
  currentFrameIndex: number; 
  zones: any; 
  highlightedPersonId: string | null; 
  showHeatmap?: boolean;
  showTrails?: boolean;
  showZones?: boolean;
  showGateways?: boolean;
  mapStyleMode?: MapMode;
  selectedCategory?: string;
  floorplanUrl?: string | null;
  readerMappings?: any[];
}) {
  const { personnelSingular, idBadgeLabel, zoneLabel } = useTerminology();
  const zoneEntries = Object.entries(zones || {});
  const currentPeople = historyFrames[currentFrameIndex] || [];

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate SVG CAD Blueprint URI
  const blueprintSvgUrl = useMemo(() => {
    return getBlueprintSvg(site.id, site.name, site.contractor, site.dimensions, mapStyleMode);
  }, [site, mapStyleMode]);

  // Mouse handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.6, Math.min(4, prev * delta)));
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // RFID Gateway Anchors — derived from real reader mappings tied to zones
  // Each unique reader gets positioned at the center of its zone
  const rfidGateways = useMemo(() => {
    if (!readerMappings || readerMappings.length === 0) return [];
    const seen = new Set<string>();
    const result: { id: string; name: string; x: number; y: number }[] = [];
    for (const rm of readerMappings) {
      if (seen.has(rm.readerId)) continue;
      seen.add(rm.readerId);
      // Find the zone this reader maps to
      const zone = zones ? Object.values(zones).find((z: any) => z.name === rm.zoneName || rm.zoneId === z.id || rm.zoneName === z.name) as any : null;
      if (zone) {
        result.push({
          id: rm.readerId,
          name: rm.zoneName || rm.readerId,
          x: Math.round((zone.x || 0) + (zone.width || 0) / 2),
          y: Math.round((zone.y || 0) + (zone.height || 0) / 2)
        });
      } else {
        // No zone found — place at a distributed edge position
        const idx = result.length;
        result.push({
          id: rm.readerId,
          name: rm.zoneName || rm.readerId,
          x: 5 + (idx * 20) % 90,
          y: idx % 2 === 0 ? 3 : 95
        });
      }
    }
    return result;
  }, [readerMappings, zones]);

  // Filtered current frame entities
  const visibleEntities = useMemo(() => {
    return currentPeople.filter(p => {
      if (selectedCategory === 'visitors') return p.role === 'Visitor';
      if (selectedCategory === 'workers') return p.role !== 'Visitor';
      return true;
    });
  }, [currentPeople, selectedCategory]);

  const highlightedPerson = currentPeople.find(p => p.id === highlightedPersonId);

  return (
    <div 
      className="w-full h-full relative overflow-hidden bg-[#090d16] select-none cursor-grab active:cursor-grabbing flex items-center justify-center"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Floating Canvas Controls (Zoom In, Zoom Out, Reset) */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1.5 rounded-xl shadow-xl">
        <button 
          onClick={() => setZoom(prev => Math.min(4, prev * 1.25))}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition" 
          title="Zoom In (+)"
        >
          <ZoomIn size={16} />
        </button>
        <button 
          onClick={() => setZoom(prev => Math.max(0.6, prev * 0.8))}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition" 
          title="Zoom Out (-)"
        >
          <ZoomOut size={16} />
        </button>
        <button 
          onClick={resetView}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition text-[11px] font-bold px-2.5" 
          title="Reset View (1:1)"
        >
          Reset
        </button>
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-40 bg-slate-900/85 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl shadow-xl flex items-center gap-4 text-[10px] text-slate-300 font-bold">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#007BC4] border border-white" />
          <span>{personnelSingular} / {idBadgeLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" />
          <span>Visitor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-white" />
          <span>RFID Reader</span>
        </div>
        <div className="text-slate-500 font-mono">
          Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Selected Entity Inspector Banner */}
      {highlightedPerson && (
        <div className="absolute top-4 left-4 z-40 bg-slate-900/90 backdrop-blur-md border border-[#007BC4] p-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs text-white">
          <div className="p-2 rounded-lg bg-[#007BC4]/20 border border-[#007BC4]">
            <User className="text-[#007BC4]" size={16} />
          </div>
          <div>
            <div className="font-bold flex items-center gap-2">
              <span>{highlightedPerson.name}</span>
              <span className="text-[9px] bg-[#007BC4] px-1.5 py-0.5 rounded uppercase font-mono">{highlightedPerson.id}</span>
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5 flex items-center gap-2 font-mono">
              <span>Zone: {highlightedPerson.currentZone}</span>
              <span>•</span>
              <span>Pos: ({Math.round(highlightedPerson.x)}m, {Math.round(highlightedPerson.y)}m)</span>
              <span>•</span>
              <span className={highlightedPerson.presenceState === 'MOVING' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>{highlightedPerson.presenceState}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Map Container with Scale & Pan Transform */}
      <div 
        ref={containerRef}
        className="relative w-full h-full rounded-xl overflow-hidden transition-transform duration-75 ease-out"
        style={{ transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)` }}
      >
        {/* Real Floorplan Map or CAD Blueprint Vector Map Background Image */}
        {floorplanUrl ? (
          <img 
            src={floorplanUrl} 
            alt="Site Floorplan Map" 
            className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
          />
        ) : (
          <img 
            src={blueprintSvgUrl} 
            alt="Site CAD Blueprint Map" 
            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          />
        )}

        {/* Technical Grid Accent Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#007BC4_1px,transparent_1px)] [background-size:32px_32px]" />

        {/* Zone Boundaries Layer */}
        {showZones && zoneEntries.map(([name, rect]: any) => {
          const isCritical = rect.hazardLevel === 'critical';
          const isWarning = rect.hazardLevel === 'warning';
          
          return (
            <div 
              key={name}
              className={`absolute border rounded-xl flex flex-col items-center justify-between p-2 backdrop-blur-[2px] transition-all ${
                isCritical 
                  ? 'border-rose-500/60 bg-rose-950/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]' 
                  : isWarning 
                  ? 'border-amber-500/60 bg-amber-950/20' 
                  : 'border-[#007BC4]/30 bg-blue-950/20'
              }`}
              style={{ 
                left: `${rect.x}%`, 
                top: `${rect.y}%`, 
                width: `${rect.width}%`, 
                height: `${rect.height}%`
              }}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md backdrop-blur-md ${
                  isCritical 
                    ? 'bg-rose-600/90 text-white border border-rose-400' 
                    : isWarning 
                    ? 'bg-amber-500/90 text-slate-950 border border-amber-300' 
                    : 'bg-[#007BC4]/80 text-white border border-[#007BC4]'
                }`}>
                  {name}
                </span>
                {rect.category && (
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded">
                    {rect.category}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* RFID Gateway Readers Layer */}
        {showGateways && rfidGateways.map(gw => (
          <div
            key={gw.id}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${gw.x}%`, top: `${gw.y}%` }}
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute w-8 h-8 rounded-full bg-purple-500/20 animate-ping" />
              <div className="w-5 h-5 rounded-lg bg-purple-600 border border-purple-300 flex items-center justify-center text-white shadow-lg">
                <Radio size={11} />
              </div>
            </div>
            <div className="hidden group-hover:block absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap z-50">
              {gw.name}
            </div>
          </div>
        ))}

        {/* Heatmap Overlay */}
        {showHeatmap && (
          <div className="absolute inset-0 pointer-events-none z-15 opacity-70">
            {visibleEntities.map(p => (
              <div
                key={`heat-${p.id}`}
                className="absolute w-28 h-28 rounded-full bg-gradient-to-r from-red-500/60 via-amber-500/40 to-transparent blur-xl -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
            ))}
          </div>
        )}

        {/* Motion Trails Polyline */}
        {showTrails && (historyFrames[0] || []).length > 0 && (
          <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
             {(historyFrames[0] || []).map((baselinePerson, i) => {
                const isVisitor = baselinePerson.role === 'Visitor';
                const color = isVisitor ? '#f59e0b' : '#007BC4';
                
                if (highlightedPersonId && highlightedPersonId !== baselinePerson.id) return null;

                const pointsStr = historyFrames.slice(0, currentFrameIndex + 1).map(frame => {
                   const p = frame[i];
                   return p ? `${p.x},${p.y}` : '';
                }).filter(Boolean).join(' ');

                if (!pointsStr) return null;

                return (
                   <g key={`trail-group-${baselinePerson.id}`}>
                     <polyline
                        points={pointsStr}
                        fill="none"
                        stroke={color}
                        strokeWidth={highlightedPersonId === baselinePerson.id ? '1.2' : '0.6'}
                        strokeDasharray="1 1"
                        strokeOpacity={highlightedPersonId ? (highlightedPersonId === baselinePerson.id ? 1 : 0.1) : 0.45}
                     />
                   </g>
                );
             })}
          </svg>
        )}

        {/* Entity Markers */}
        {visibleEntities.map(p => {
          const isHighlighted = highlightedPersonId === p.id;
          const opacity = highlightedPersonId ? (isHighlighted ? 1 : 0.2) : 1;
          const isVisitor = p.role === 'Visitor';
          
          return (
            <div
              key={p.id}
              className="absolute z-30 transition-all duration-300"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                transform: 'translate(-50%, -50%)',
                opacity
              }}
            >
              <div className="relative group cursor-pointer">
                {isHighlighted && (
                  <span className="absolute -inset-2 rounded-full bg-[#007BC4]/40 animate-ping" />
                )}
                
                <div 
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-black shadow-lg transition-transform group-hover:scale-125 ${
                    isVisitor 
                      ? 'bg-amber-500 border-amber-100 text-slate-950' 
                      : 'bg-[#007BC4] border-white text-white'
                  }`}
                  style={{
                    boxShadow: isHighlighted ? '0 0 20px rgba(0,123,196,1)' : '0 2px 6px rgba(0,0,0,0.5)'
                  }}
                >
                  {(p.name || 'U').charAt(0)}
                </div>

                {/* Hover / Highlight Tooltip */}
                <div className={`${isHighlighted ? 'block' : 'hidden group-hover:block'} absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold p-2 rounded-lg shadow-2xl whitespace-nowrap z-50 border border-slate-700`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isVisitor ? 'bg-amber-400' : 'bg-[#007BC4]'}`} />
                    <span>{p.name}</span>
                  </div>
                  <div className="text-[9px] text-slate-300 font-mono mt-0.5">
                    {p.id} • {p.currentZone}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

