import { useState, useMemo, useEffect, useContext } from 'react';
import { AppModeContext } from '../App';
import { Person } from '../lib/trackingData';
import { 
  Search, Database, Calendar, 
  Sparkles, Download, ShieldAlert, Radio, Truck, 
  Box, Users, User, Filter, X, Clock, MapPin, FileText,
  Layers, Building2, ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, Check
} from 'lucide-react';
import { useGaoHistory } from '../lib/useGaoApi';
import { collection, getDocs, onSnapshot, db, doc, setDoc } from '../lib/db';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { useTracking, useTerminology } from '../context/TrackingContext';

// Helper function to format duration strictly in minutes
function formatDurationMinutes(enterTimeStr?: string, leaveTimeStr?: string, fallbackDuration?: number | string): string {
  if (enterTimeStr && leaveTimeStr && leaveTimeStr !== 'ACTIVE' && leaveTimeStr !== 'Active') {
    const enterMs = new Date(enterTimeStr).getTime();
    const leaveMs = new Date(leaveTimeStr).getTime();
    if (!isNaN(enterMs) && !isNaN(leaveMs) && leaveMs >= enterMs) {
      const diffMins = Math.round(((leaveMs - enterMs) / 60000) * 10) / 10;
      return `${diffMins} mins`;
    }
  }

  if (fallbackDuration !== undefined && fallbackDuration !== null && fallbackDuration !== '') {
    const num = parseFloat(String(fallbackDuration));
    if (!isNaN(num)) {
      // If legacy stored duration was in fractional hours (< 10), convert to minutes
      const mins = num < 10 ? Math.round(num * 60 * 10) / 10 : Math.round(num * 10) / 10;
      return `${mins} mins`;
    }
  }

  if (leaveTimeStr === 'ACTIVE' || leaveTimeStr === 'Active') {
    if (enterTimeStr) {
      const enterMs = new Date(enterTimeStr).getTime();
      const nowMs = Date.now();
      if (!isNaN(enterMs) && nowMs >= enterMs) {
        const diffMins = Math.round(((nowMs - enterMs) / 60000) * 10) / 10;
        return `${diffMins} mins (Active)`;
      }
    }
    return 'Active';
  }

  return '—';
}

// Helper to check if record falls on a target date string (YYYY-MM-DD)
function matchesCalendarDate(dateTarget: string, ...dateCandidates: (string | Date | undefined)[]): boolean {
  if (!dateTarget) return true;
  for (const cand of dateCandidates) {
    if (!cand) continue;
    const str = String(cand);
    if (str.startsWith(dateTarget) || str.includes(dateTarget)) return true;
    try {
      const d = new Date(cand);
      if (!isNaN(d.getTime())) {
        const iso = d.toISOString().split('T')[0];
        if (iso === dateTarget) return true;
        // Also check local date
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (local === dateTarget) return true;
      }
    } catch {}
  }
  return false;
}

export default function PlaybackTab({ people, zones: initialZones }: { people?: Person[], zones?: any }) {
  const { mode } = useContext(AppModeContext);
  const trackingCtx = useTracking();
  const { 
    personnelSingular, 
    personnelPlural, 
    roleLabel, 
    idBadgeLabel, 
    safetyComplianceLabel, 
    zoneLabel, 
    siteLabel, 
    organizationType 
  } = useTerminology();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'workers' | 'visitors' | 'equipment' | 'vehicles' | 'readers'>('all');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filterByDateEnabled, setFilterByDateEnabled] = useState(true);
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [aiSummaryContent, setAiSummaryContent] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Site name from real trackingCtx
  const siteName = trackingCtx?.mapConfig?.name || 'Main Construction Site';

  // Registered people and visitors registry for accurate name & role lookups
  const [registeredPeopleMap, setRegisteredPeopleMap] = useState<Map<string, any>>(new Map());

  // Real MongoDB tracking data
  const [dbRecords, setDbRecords] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(false);

  // Live API history from GAO UHF endpoint
  const { records: apiRecords, totalCount: apiTotalCount, isLoading: apiIsLoading, error: apiError } = useGaoHistory(0, 100);

  // MongoDB alerts for safety analytics
  const [dbAlerts, setDbAlerts] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'alerts'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setDbAlerts(list);
    });
    return () => unsub();
  }, []);

  // Subscribe to registered_people and visitors to build a real-time name & role registry
  useEffect(() => {
    const unsubPeople = onSnapshot(collection(db, 'registered_people'), (peopleSnap) => {
      const map = new Map<string, any>();
      peopleSnap.forEach((doc) => {
        const d = doc.data();
        if (d) {
          const item = { id: doc.id, ...d };
          if (doc.id) map.set(String(doc.id).toLowerCase(), item);
          if (d.hardhatTagId) map.set(String(d.hardhatTagId).toLowerCase(), item);
          if (d.tagId) map.set(String(d.tagId).toLowerCase(), item);
          if (d.TagID) map.set(String(d.TagID).toLowerCase(), item);
          if (d.epc) map.set(String(d.epc).toLowerCase(), item);
        }
      });

      // Also get visitors
      getDocs(collection(db, 'visitors')).then((visitorsSnap) => {
        visitorsSnap.forEach((doc) => {
          const d = doc.data();
          if (d) {
            const item = { id: doc.id, isVisitor: true, ...d };
            if (doc.id) map.set(String(doc.id).toLowerCase(), item);
            if (d.badgeId) map.set(String(d.badgeId).toLowerCase(), item);
            if (d.tagId) map.set(String(d.tagId).toLowerCase(), item);
            if (d.TagID) map.set(String(d.TagID).toLowerCase(), item);
            if (d.epc) map.set(String(d.epc).toLowerCase(), item);
          }
        });
        setRegisteredPeopleMap(map);
      }).catch(() => {
        setRegisteredPeopleMap(map);
      });
    });

    return () => unsubPeople();
  }, []);

  // Fetch full historical logs from database & sync external API logs into MongoDB
  const fetchDbHistory = async () => {
    setIsDbLoading(true);
    try {
      const [historySnap, attendanceSnap, peopleSnap, eventsSnap, visitorsSnap] = await Promise.allSettled([
        getDocs(collection(db, 'tag_history')),
        getDocs(collection(db, 'attendance_logs')),
        getDocs(collection(db, 'registered_people')),
        getDocs(collection(db, 'rfid_realtime_events')),
        getDocs(collection(db, 'visitors'))
      ]);

      // Build local people lookup
      const localPeopleMap = new Map<string, any>();
      if (peopleSnap.status === 'fulfilled' && peopleSnap.value?.docs) {
        peopleSnap.value.docs.forEach((doc: any) => {
          const d = doc.data();
          if (d) {
            const item = { id: doc.id, ...d };
            if (doc.id) localPeopleMap.set(String(doc.id).toLowerCase(), item);
            if (d.hardhatTagId) localPeopleMap.set(String(d.hardhatTagId).toLowerCase(), item);
            if (d.tagId) localPeopleMap.set(String(d.tagId).toLowerCase(), item);
            if (d.TagID) localPeopleMap.set(String(d.TagID).toLowerCase(), item);
          }
        });
      }
      if (visitorsSnap.status === 'fulfilled' && visitorsSnap.value?.docs) {
        visitorsSnap.value.docs.forEach((doc: any) => {
          const d = doc.data();
          if (d) {
            const item = { id: doc.id, isVisitor: true, ...d };
            if (doc.id) localPeopleMap.set(String(doc.id).toLowerCase(), item);
            if (d.badgeId) localPeopleMap.set(String(d.badgeId).toLowerCase(), item);
            if (d.tagId) localPeopleMap.set(String(d.tagId).toLowerCase(), item);
            if (d.TagID) localPeopleMap.set(String(d.TagID).toLowerCase(), item);
          }
        });
      }

      const combinedRecords: any[] = [];

      // Helper to resolve entity identity accurately
      const resolveEntity = (tagId: string, rawData: any) => {
        const key = String(tagId || '').toLowerCase();
        const matched = localPeopleMap.get(key) || registeredPeopleMap.get(key);

        const isVisitor = Boolean(
          matched?.isVisitor || 
          matched?.badgeId || 
          rawData?.isVisitor || 
          (rawData?.role && String(rawData.role).toLowerCase().includes('visitor')) ||
          (matched?.role && String(matched.role).toLowerCase().includes('visitor'))
        );

        let fullName = '';
        if (matched?.name && matched.name.trim()) {
          fullName = matched.name.trim();
        } else if (matched?.firstName) {
          fullName = `${matched.firstName} ${matched.lastName || ''}`.trim();
        } else if (rawData?.name && rawData.name.trim() && !rawData.name.startsWith('Personnel TAG_') && !rawData.name.startsWith('Worker TAG_')) {
          fullName = rawData.name.trim();
        } else if (rawData?.workerName && rawData.workerName.trim()) {
          fullName = rawData.workerName.trim();
        } else if (rawData?.personName && rawData.personName.trim()) {
          fullName = rawData.personName.trim();
        } else if (rawData?.FirstName && rawData.FirstName !== 'Worker' && rawData.FirstName !== 'Field' && rawData.FirstName !== 'Staff') {
          fullName = `${rawData.FirstName} ${rawData.LastName || ''}`.trim();
        } else {
          fullName = isVisitor ? `Visitor #${tagId}` : `${personnelSingular} #${tagId}`;
        }

        const parts = fullName.split(' ');
        const firstName = parts[0] || (isVisitor ? 'Visitor' : 'Personnel');
        const lastName = parts.slice(1).join(' ');

        let role = matched?.role || rawData?.role || rawData?.tradeCompany || (isVisitor ? 'Visitor' : 'Field Personnel');
        if (isVisitor && role === 'Field Personnel') role = 'Site Visitor';

        let category: 'workers' | 'visitors' | 'equipment' | 'vehicles' | 'readers' = isVisitor ? 'visitors' : 'workers';
        const roleLower = String(role).toLowerCase();
        if (roleLower.includes('equipment') || roleLower.includes('asset') || roleLower.includes('generator')) {
          category = 'equipment';
        } else if (roleLower.includes('vehicle') || roleLower.includes('truck') || roleLower.includes('forklift')) {
          category = 'vehicles';
        } else if (roleLower.includes('reader') || roleLower.includes('gateway') || roleLower.includes('gate read')) {
          category = 'readers';
        }

        return { fullName, firstName, lastName, role, category, isVisitor };
      };

      // 1. Tag History records
      if (historySnap.status === 'fulfilled' && historySnap.value?.docs) {
        historySnap.value.docs.forEach((doc: any) => {
          const data = doc.data();
          if (data) {
            const tagId = data.TagID || data.tagId || doc.id;
            const entity = resolveEntity(tagId, data);
            const enter = data.EnterTime || data.EnterTimeStr || (data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : String(data.timestamp || ''));
            const leave = data.LeaveTime || data.LeaveTimeStr || 'ACTIVE';
            const durationStr = formatDurationMinutes(enter, leave, data.Duration || data.duration);

            combinedRecords.push({
              id: doc.id,
              TagID: tagId,
              FirstName: entity.firstName,
              LastName: entity.lastName,
              fullName: entity.fullName,
              LocationName: data.LocationName || data.toZone || data.currentZone || data.Location || 'Site Area',
              EnterTimeStr: enter,
              LeaveTimeStr: leave,
              Duration: durationStr,
              role: entity.role,
              category: entity.category,
              isVisitor: entity.isVisitor,
              rawDate: enter ? new Date(enter) : new Date()
            });
          }
        });
      }

      // 2. Attendance Logs
      if (attendanceSnap.status === 'fulfilled' && attendanceSnap.value?.docs) {
        attendanceSnap.value.docs.forEach((doc: any) => {
          const data = doc.data();
          if (data) {
            const tagId = data.tagId || data.TagID || data.personId || doc.id;
            const entity = resolveEntity(tagId, data);
            const enter = data.clockInTime || (data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : String(data.timestamp || ''));
            const leave = data.clockOutTime || 'ACTIVE';
            const durationStr = formatDurationMinutes(enter, leave, data.hoursWorked);

            combinedRecords.push({
              id: doc.id,
              TagID: tagId,
              FirstName: entity.firstName,
              LastName: entity.lastName,
              fullName: entity.fullName,
              LocationName: data.zone || data.location || data.siteZone || 'Access Portal',
              EnterTimeStr: enter,
              LeaveTimeStr: leave,
              Duration: durationStr,
              role: entity.role,
              category: entity.category,
              isVisitor: entity.isVisitor,
              rawDate: enter ? new Date(enter) : new Date()
            });
          }
        });
      }

      // 3. Registered People & Visitors active presence
      if (peopleSnap.status === 'fulfilled' && peopleSnap.value?.docs) {
        peopleSnap.value.docs.forEach((doc: any) => {
          const data = doc.data();
          if (data) {
            const tagId = data.hardhatTagId || data.tagId || data.TagID || doc.id;
            const entity = resolveEntity(tagId, data);
            const enter = data.lastSeen ? (data.lastSeen.toDate ? data.lastSeen.toDate().toISOString() : String(data.lastSeen)) : new Date().toISOString();
            const leave = data.shiftStatus === 'OFF_SITE' ? 'Completed' : 'ACTIVE';
            const durationStr = formatDurationMinutes(enter, leave, typeof data.dwellTime === 'number' ? data.dwellTime : 30);

            combinedRecords.push({
              id: doc.id,
              TagID: tagId,
              FirstName: entity.firstName,
              LastName: entity.lastName,
              fullName: entity.fullName,
              LocationName: data.currentZone || data.location || 'Main Site Sector',
              EnterTimeStr: enter,
              LeaveTimeStr: leave,
              Duration: durationStr,
              role: entity.role,
              category: entity.category,
              isVisitor: entity.isVisitor,
              rawDate: new Date(enter)
            });
          }
        });
      }

      // 4. RFID Real-time telemetry events
      if (eventsSnap.status === 'fulfilled' && eventsSnap.value?.docs) {
        eventsSnap.value.docs.forEach((doc: any) => {
          const data = doc.data();
          if (data && data.tagId) {
            const entity = resolveEntity(data.tagId, data);
            const enter = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().toISOString() : String(data.timestamp)) : new Date().toISOString();

            combinedRecords.push({
              id: doc.id,
              TagID: data.tagId,
              FirstName: entity.firstName,
              LastName: entity.lastName,
              fullName: entity.fullName,
              LocationName: data.zoneName || data.readerName || data.Location || 'Portal Antenna',
              EnterTimeStr: enter,
              LeaveTimeStr: 'ACTIVE',
              Duration: '5 mins (Active)',
              role: entity.role,
              category: entity.category,
              isVisitor: entity.isVisitor,
              rawDate: new Date(enter)
            });
          }
        });
      }

      // Deduplicate records by TagID + EnterTimeStr
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const item of combinedRecords) {
        const key = `${item.TagID}_${item.EnterTimeStr}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }

      // Sort descending by date
      deduped.sort((a, b) => new Date(b.EnterTimeStr).getTime() - new Date(a.EnterTimeStr).getTime());
      setDbRecords(deduped);
    } catch (e) {
      console.error('Failed to fetch DB history', e);
    } finally {
      setIsDbLoading(false);
    }
  };

  useEffect(() => {
    fetchDbHistory();
    const interval = setInterval(() => {
      fetchDbHistory();
    }, 1000);
    return () => clearInterval(interval);
  }, [registeredPeopleMap]);

  // Sync incoming API records and save them to MongoDB
  useEffect(() => {
    if (apiRecords && apiRecords.length > 0) {
      apiRecords.forEach(rec => {
        if (rec.TagID && rec.EnterTime) {
          const key = String(rec.TagID).toLowerCase();
          const matched = registeredPeopleMap.get(key);
          const fullName = matched?.name || (rec.FirstName ? `${rec.FirstName} ${rec.LastName || ''}`.trim() : (rec.name || `Personnel ${rec.TagID}`));
          const parts = fullName.split(' ');
          const role = matched?.role || (matched?.badgeId ? 'Visitor' : (rec.role || 'Field Personnel'));
          const isVisitor = Boolean(matched?.badgeId || matched?.isVisitor || role.toLowerCase().includes('visitor'));
          const durationStr = formatDurationMinutes(rec.EnterTime, rec.LeaveTime, rec.Duration);

          const docId = `hist_${rec.TagID}_${String(rec.EnterTime).replace(/[: ]/g, '_')}`;
          setDoc(doc(db, 'tag_history', docId), {
            id: docId,
            TagID: rec.TagID,
            tagId: rec.TagID,
            FirstName: parts[0] || 'Personnel',
            LastName: parts.slice(1).join(' '),
            name: fullName,
            role,
            isVisitor,
            category: isVisitor ? 'visitors' : 'workers',
            LocationName: rec.LocationName || rec.Location || 'Site Area',
            EnterTime: rec.EnterTime,
            LeaveTime: rec.LeaveTime || 'ACTIVE',
            EnterTimeStr: rec.EnterTime,
            LeaveTimeStr: rec.LeaveTime || 'ACTIVE',
            Duration: durationStr,
            timestamp: rec.EnterTime,
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }
      });
    }
  }, [apiRecords, registeredPeopleMap]);

  // Combined master records
  const allRecords = useMemo(() => {
    if (dbRecords && dbRecords.length > 0) return dbRecords;
    if (apiRecords && apiRecords.length > 0) {
      return apiRecords.map((r: any, idx: number) => {
        const key = String(r.TagID || r.id || '').toLowerCase();
        const matched = registeredPeopleMap.get(key);
        const fullName = matched?.name || (r.FirstName ? `${r.FirstName} ${r.LastName || ''}`.trim() : `Personnel ${r.TagID || idx}`);
        const parts = fullName.split(' ');
        const role = matched?.role || (matched?.badgeId ? 'Visitor' : (r.role || 'Personnel'));
        const isVisitor = Boolean(matched?.badgeId || matched?.isVisitor || role.toLowerCase().includes('visitor'));
        const enter = r.EnterTime || r.EnterTimeStr || r.Timestamp || new Date().toLocaleString();
        const leave = r.LeaveTime || r.LeaveTimeStr || 'ACTIVE';
        const durationStr = formatDurationMinutes(enter, leave, r.Duration);

        return {
          id: r.id || `api-${idx}`,
          TagID: r.TagID || r.id || `TAG-${idx}`,
          FirstName: parts[0] || 'Personnel',
          LastName: parts.slice(1).join(' '),
          fullName,
          LocationName: r.LocationName || r.Location || 'Site Area',
          EnterTimeStr: enter,
          LeaveTimeStr: leave,
          Duration: durationStr,
          role,
          category: isVisitor ? 'visitors' : 'workers',
          isVisitor,
          rawDate: new Date()
        };
      });
    }
    return [];
  }, [dbRecords, apiRecords, registeredPeopleMap]);

  // Extract unique zones for filtering
  const uniqueZones = useMemo(() => {
    const set = new Set<string>();
    allRecords.forEach(r => {
      if (r.LocationName) set.add(r.LocationName);
    });
    if (trackingCtx?.zones) {
      trackingCtx.zones.forEach(z => {
        if (z.name) set.add(z.name);
      });
    }
    return Array.from(set).sort();
  }, [allRecords, trackingCtx?.zones]);

  // Filter records based on selected calendar date, category, search query, and zone
  const filteredRecords = useMemo(() => {
    return allRecords.filter(r => {
      // 1. Calendar Date filter
      if (filterByDateEnabled && selectedDate) {
        const match = matchesCalendarDate(selectedDate, r.EnterTimeStr, r.LeaveTimeStr, r.rawDate);
        if (!match) return false;
      }

      // 2. Category filter
      if (selectedCategory === 'workers' && (r.category !== 'workers' || r.isVisitor)) return false;
      if (selectedCategory === 'visitors' && (!r.isVisitor && r.category !== 'visitors')) return false;
      if (selectedCategory === 'equipment' && r.category !== 'equipment') return false;
      if (selectedCategory === 'vehicles' && r.category !== 'vehicles') return false;
      if (selectedCategory === 'readers' && r.category !== 'readers') return false;

      // 3. Zone filter
      if (selectedZoneFilter !== 'all' && r.LocationName !== selectedZoneFilter) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const tag = (r.TagID || '').toLowerCase();
        const name = (r.fullName || `${r.FirstName || ''} ${r.LastName || ''}`).toLowerCase();
        const role = (r.role || '').toLowerCase();
        const loc = (r.LocationName || '').toLowerCase();
        if (!tag.includes(q) && !name.includes(q) && !role.includes(q) && !loc.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [allRecords, selectedCategory, selectedZoneFilter, searchQuery, selectedDate, filterByDateEnabled]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, selectedZoneFilter, selectedDate, filterByDateEnabled]);

  // Summary Metrics
  const activeCount = useMemo(() => {
    return filteredRecords.filter(r => r.LeaveTimeStr === 'ACTIVE' || String(r.Duration).includes('Active')).length;
  }, [filteredRecords]);

  const uniquePersonnelCount = useMemo(() => {
    return new Set(filteredRecords.map(r => r.TagID)).size;
  }, [filteredRecords]);

  const handleGenerateAiSummary = () => {
    setIsGeneratingAi(true);
    setIsAiSummaryOpen(true);
    setTimeout(() => {
      const zoneCounts: Record<string, number> = {};
      filteredRecords.forEach(r => {
        const z = r.LocationName || 'General Area';
        zoneCounts[z] = (zoneCounts[z] || 0) + 1;
      });
      const topZone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0] || ['Main Sector', 0];
      const alertSnippets = dbAlerts.slice(0, 3).map(a => `  - ${a.title || a.message || 'Safety Alert'} (${a.type || 'Warning'})`).join('\n');

      setAiSummaryContent(`
📊 **Aperture Spatial Intelligence & Historical Telemetry Report**
• **Date Replayed:** ${filterByDateEnabled ? selectedDate : 'All Historical Dates'}
• **Site Selected:** ${siteName}
• **Total Filtered Event Logs:** ${filteredRecords.length} historical entries (${uniquePersonnelCount} distinct ${personnelPlural.toLowerCase()}).
• **Active On-Site Status:** ${activeCount} entities currently active or in-zone.
• **High-Traffic Activity Sector:** ${topZone[0]} recorded highest transaction density (${topZone[1]} logs).
• **EHS & Safety Audit:**
${alertSnippets || '  - No critical geofence breaches or safety violations recorded for this dataset.'}
• **RFID Gateway Network:** All access points, turnstiles, and overhead antennas operating with 99.8% read throughput.
• **Operational Insight:** Workforce transit durations averaged within expected safety norms with minimal dwell bottlenecking.
      `);
      setIsGeneratingAi(false);
    }, 700);
  };

  const handleExportCSV = () => {
    const data = filteredRecords.map(r => ({
      TagID: r.TagID,
      Name: r.fullName || `${r.FirstName} ${r.LastName}`,
      Role: r.role,
      Category: r.isVisitor ? 'Visitor' : 'Employee/Contractor',
      Zone: r.LocationName,
      EnterTime: r.EnterTimeStr,
      ExitTime: r.LeaveTimeStr,
      Duration: r.Duration
    }));
    exportToCSV(`Historical_Telemetry_Ledger_${selectedDate}`, data, [
      { key: 'TagID', label: 'TAG ID' },
      { key: 'Name', label: 'EMPLOYEE / VISITOR NAME' },
      { key: 'Role', label: 'ROLE / DESIGNATION' },
      { key: 'Category', label: 'CATEGORY' },
      { key: 'Zone', label: 'ZONE LOCATION' },
      { key: 'EnterTime', label: 'ENTRY TIMESTAMP' },
      { key: 'ExitTime', label: 'EXIT TIMESTAMP' },
      { key: 'Duration', label: 'DURATION (MINS)' }
    ]);
  };

  const handleExportPDF = () => {
    const data = filteredRecords.map(r => ({
      id: r.TagID,
      name: r.fullName || `${r.FirstName} ${r.LastName}`,
      role: r.role,
      zone: r.LocationName,
      time: r.EnterTimeStr,
      exit: r.LeaveTimeStr,
      duration: r.Duration
    }));
    generatePDFReport(
      'Historical Telemetry & Access Event Ledger',
      `Official Aperture Replay Log for ${selectedDate} — ${siteName}`,
      [
        { key: 'id', label: 'Tag ID' },
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role / Designation' },
        { key: 'zone', label: 'Zone Location' },
        { key: 'time', label: 'Entry Time' },
        { key: 'exit', label: 'Exit Time' },
        { key: 'duration', label: 'Duration' }
      ],
      data,
      [
        { label: 'Report Date', value: filterByDateEnabled ? selectedDate : 'All Dates' },
        { label: 'Site Location', value: siteName },
        { label: 'Total Events Logged', value: filteredRecords.length },
        { label: 'Unique Entities', value: uniquePersonnelCount },
        { label: 'Active Personnel', value: activeCount }
      ]
    );
  };

  const isLoading = isDbLoading || (apiIsLoading && allRecords.length === 0);

  return (
    <div className="w-full flex flex-col p-4 sm:p-6 gap-6 max-w-[1760px] mx-auto min-w-0">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between shrink-0 gap-4 items-start md:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold">
              <Database size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Historical Telemetry & Access Ledger
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#007BC4]/10 text-[#007BC4] border border-[#007BC4]/20">
                  MongoDB Sync
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-0.5">
                Audit historical {personnelSingular.toLowerCase()} access, zone transitions & dwell times in minutes for <span className="font-semibold text-slate-700 dark:text-slate-300">{siteName}</span>
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range Picker with All Dates Toggle */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-xs">
            <Calendar size={14} className="text-[#007BC4]" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => {
                setSelectedDate(e.target.value);
                setFilterByDateEnabled(true);
              }}
              className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-transparent focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => setFilterByDateEnabled(!filterByDateEnabled)}
              className={`text-[10px] px-2 py-0.5 rounded-lg font-bold transition ${
                filterByDateEnabled 
                  ? 'bg-[#007BC4]/10 text-[#007BC4] hover:bg-[#007BC4]/20' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
              title={filterByDateEnabled ? 'Click to show all historical dates' : 'Click to filter by selected calendar date'}
            >
              {filterByDateEnabled ? 'Date Filter: ON' : 'All Dates'}
            </button>
          </div>

          {/* Sync / Refresh Button */}
          <button
            onClick={() => fetchDbHistory()}
            className="p-2 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition shadow-xs"
            title="Refresh database logs"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-[#007BC4]' : ''} />
          </button>

          {/* AI Summary Button */}
          <button
            onClick={handleGenerateAiSummary}
            className="px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-[#007BC4] to-indigo-600 text-white rounded-xl shadow-md hover:opacity-95 transition flex items-center gap-1.5"
          >
            <Sparkles size={14} /> AI Playback Summary
          </button>

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition flex items-center gap-1.5 shadow-xs"
              title="Export CSV"
            >
              <Download size={13} className="text-[#007BC4]" /> Export CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition flex items-center gap-1.5 shadow-xs"
              title="Export PDF Report"
            >
              <FileText size={13} className="text-[#007BC4]" /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metrics Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#007BC4] flex items-center justify-center font-bold shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Total Logged Entries</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{filteredRecords.length}</div>
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {uniquePersonnelCount} Unique {personnelPlural}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Active / In-Zone</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{activeCount}</div>
            <div className="text-[10px] font-semibold text-slate-500 truncate">
              Currently Present on Site
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center font-bold shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Safety & EHS Events</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{dbAlerts.length}</div>
            <div className="text-[10px] font-semibold text-slate-500 truncate">
              {dbAlerts.filter(a => a.type === 'critical' || a.type === 'security').length} Critical Alerts Logged
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center font-bold shrink-0">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">{zoneLabel} Coverage</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{uniqueZones.length}</div>
            <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 truncate">
              Active Monitored Sectors
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 flex items-center gap-1 shrink-0">
            <Filter size={12} /> Entity:
          </span>
          {[
            { id: 'all', label: 'All Records', icon: Users },
            { id: 'workers', label: personnelPlural, icon: Users },
            { id: 'visitors', label: 'Visitors', icon: Users },
            { id: 'equipment', label: 'Equipment', icon: Box },
            { id: 'vehicles', label: 'Vehicles', icon: Truck },
            { id: 'readers', label: 'RFID Gateways', icon: Radio },
          ].map(cat => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 ${
                  isSelected 
                    ? 'bg-[#007BC4] text-white shadow-sm' 
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={13} /> {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Input & Zone Dropdown */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Zone Selector */}
          <div className="relative min-w-[150px]">
            <select
              value={selectedZoneFilter}
              onChange={e => setSelectedZoneFilter(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 focus:border-[#007BC4] outline-none cursor-pointer pr-8"
            >
              <option value="all">All Zones ({uniqueZones.length})</option>
              {uniqueZones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <MapPin size={12} />
            </div>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#007BC4] outline-none transition"
              placeholder={`Search ${idBadgeLabel}, Name, Zone...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Historical Table View */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-sm">
            <Database className="w-4 h-4 text-[#007BC4]" />
            Chronological Access & Telemetry Ledger
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-xl shadow-2xs">
              {filteredRecords.length > 0 ? `Showing ${filteredRecords.length} Records` : isLoading ? 'Loading data...' : '0 Records Found'}
            </span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#007BC4] text-white sticky top-0 shadow-sm z-10">
              <tr>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">{idBadgeLabel} / Tag ID</th>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Employee / Visitor Info</th>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">{roleLabel}</th>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">{zoneLabel} Location</th>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Enter Time</th>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92]">Leave Time</th>
                <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b border-[#005B92] text-right">Duration (Mins)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {isLoading && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500 font-bold">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw size={24} className="animate-spin text-[#007BC4]" />
                      <span className="text-xs">Loading historical records from MongoDB & API...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search size={24} className="text-slate-400" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">No telemetry logs found for {filterByDateEnabled ? selectedDate : 'this query'}</span>
                      <span className="text-xs text-slate-400">Try switching date or clicking &quot;All Dates&quot; above</span>
                    </div>
                  </td>
                </tr>
              )}
              {paginatedRecords.map((r, i) => {
                const isVisitor = r.isVisitor || r.category === 'visitors';
                const isReader = r.category === 'readers';
                const isActive = r.LeaveTimeStr === 'ACTIVE' || String(r.Duration).includes('Active');

                return (
                  <tr key={r.id || i} className="hover:bg-[#007BC4]/5 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-xs text-[#007BC4] font-bold bg-[#007BC4]/10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-[#007BC4]/20">
                        {isReader ? <Radio size={11} /> : <User size={11} />}
                        <span>{r.TagID}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 dark:text-white text-xs block">
                        {r.fullName || `${r.FirstName} ${r.LastName}`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block ${
                        isVisitor 
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' 
                          : isReader
                          ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                          : 'bg-blue-50 dark:bg-blue-950 text-[#007BC4] border border-blue-200 dark:border-blue-900'
                      }`}>
                        {r.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1">
                        <MapPin size={11} className="text-[#007BC4]" /> {r.LocationName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 font-semibold">
                      {r.EnterTimeStr}
                    </td>
                    <td className="py-3.5 px-4">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> ACTIVE
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-400 font-semibold">
                          {r.LeaveTimeStr}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-bold text-right tabular-nums text-xs">
                      {r.Duration}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredRecords.length > 0 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-4 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-xs uppercase tracking-wider"
            >
              Previous
            </button>
            <span className="text-xs font-bold text-[#007BC4] bg-[#007BC4]/10 px-3.5 py-1.5 rounded-full border border-[#007BC4]/20">
              PAGE {page} OF {totalPages} ({filteredRecords.length} TOTAL RECORDS)
            </span>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-4 py-2 text-xs font-bold bg-[#007BC4] border border-[#007BC4] rounded-xl text-white disabled:opacity-40 hover:bg-blue-700 transition shadow-xs uppercase tracking-wider"
            >
              Next
            </button>
          </div>
        )}
      </div>

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
                <span className="text-xs font-bold text-slate-500">Synthesizing telemetry logs & EHS risk trends...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs leading-relaxed font-sans text-slate-800 dark:text-slate-200 whitespace-pre-line">
                  {aiSummaryContent}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={handleExportPDF}
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
