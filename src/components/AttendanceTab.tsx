import React, { useState, useEffect, useMemo } from 'react';
import { Person } from '../lib/trackingData';
import { 
  Clock, CheckCircle2, UserX, AlertTriangle, Download, Search, Briefcase, 
  Calendar as CalendarIcon, MapPin, Radio, FileSpreadsheet, UserCheck, 
  ShieldCheck, ArrowUpRight, BarChart2, Plus, X, Sun, Moon, 
  CalendarDays, Layers, Zap, DollarSign, Filter, RefreshCw, Printer, FileText,
  Activity, Check, Ban, Edit3, ExternalLink, HelpCircle, LayoutList, LayoutGrid,
  Sparkles, Database, HardHat
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { db, collection, addDoc, updateDoc, setDoc, doc, onSnapshot, getDocs } from '../lib/db';
import DailyReportingTaskModal from './DailyReportingTaskModal';
import { useTracking, useTerminology } from '../context/TrackingContext';
import webSocketService from '../lib/webSocketService';


export interface AttendanceRecord {
  id: string;
  personId?: string;
  name: string;
  role: string;
  company: string;
  department: string;
  siteZone: string;
  shift: 'Day Shift (07:00-15:30)' | 'Night Shift (19:00-03:30)' | 'Swing OT (15:00-23:30)';
  firstIn: string;
  lastOut: string;
  breakDurationMins: number;
  totalHoursStr: string;
  totalMins: number;
  overtimeHours: number;
  isLate: boolean;
  isOvertime: boolean;
  rfidTagId: string;
  geoStatus: 'IN_GEO_FENCE' | 'OUT_OF_BOUNDS' | 'BEACON_VERIFIED';
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'OVERTIME';
  hourlyRate: number;
  leaveReason?: string;
  punchType: 'RFID_AUTO' | 'MANUAL_OVERRIDE' | 'GEO_MOBILE_PUNCH';
  gateLocation?: string;
  date?: string;
  updatedAt?: string;
}

export interface LeaveRecord {
  id: string;
  personId?: string;
  name: string;
  department: string;
  type: 'Medical Leave' | 'Annual Leave' | 'Safety Training' | 'Emergency' | 'Parental';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  approvedBy: string;
  createdAt?: string;
}

export interface ShiftScheduleRecord {
  id: string;
  personId: string;
  name: string;
  department: string;
  shift: 'Day Shift (07:00-15:30)' | 'Night Shift (19:00-03:30)' | 'Swing OT (15:00-23:30)';
  overtimeAuthorized: boolean;
  maxOtHours: number;
  notes: string;
}

const SHIFT_OPTIONS: Array<'Day Shift (07:00-15:30)' | 'Night Shift (19:00-03:30)' | 'Swing OT (15:00-23:30)'> = [
  'Day Shift (07:00-15:30)',
  'Night Shift (19:00-03:30)',
  'Swing OT (15:00-23:30)'
];

export interface SiteHoliday {
  id?: string;
  name: string;
  date: string;
  type: string;
}

export default function AttendanceTab({ people }: { people: Person[] }) {
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'live_feed' | 'calendar' | 'shifts' | 'heatmap' | 'departments' | 'payroll'>('roster');
  const [layoutType, setLayoutType] = useState<'table' | 'cards'>('table');
  
  // Real-time Database Collections
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRecord[]>([]);
  const [shiftSchedules, setShiftSchedules] = useState<ShiftScheduleRecord[]>([]);
  const [siteHolidays, setSiteHolidays] = useState<SiteHoliday[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('Today');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(19);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  // Manual Attendance Modal
  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);
  const [selectedPersonForPunch, setSelectedPersonForPunch] = useState<Person | null>(null);
  const [manualPunchType, setManualPunchType] = useState<'IN' | 'OUT'>('IN');
  const [manualReason, setManualReason] = useState('Turnstile Badge Sensor Glitch');
  const [manualGateLocation, setManualGateLocation] = useState('Gate 1 - North Gatehouse');

  // Request Leave Modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedPersonForLeave, setSelectedPersonForLeave] = useState<Person | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveRecord['type']>('Medical Leave');
  const [leaveStartDate, setLeaveStartDate] = useState('2026-08-08');
  const [leaveEndDate, setLeaveEndDate] = useState('2026-08-10');
  const [leaveReasonText, setLeaveReasonText] = useState('Physiotherapy Session');

  // Shift Edit Modal
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [selectedPersonForShift, setSelectedPersonForShift] = useState<Person | null>(null);
  const [assignedShift, setAssignedShift] = useState<'Day Shift (07:00-15:30)' | 'Night Shift (19:00-03:30)' | 'Swing OT (15:00-23:30)'>('Day Shift (07:00-15:30)');
  const [otAuthorized, setOtAuthorized] = useState(true);
  const [maxOtHoursVal, setMaxOtHoursVal] = useState(4);

  // Rate Editing Modal
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [selectedRecordForRate, setSelectedRecordForRate] = useState<AttendanceRecord | null>(null);
  const [newHourlyRate, setNewHourlyRate] = useState<number>(45);

  // Daily Automated Report Task Modal
  const [isDailyTaskModalOpen, setIsDailyTaskModalOpen] = useState(false);

  // Notification Toast
  const [notification, setNotification] = useState<string | null>(null);

  // Live MongoDB Status
  const [mongoStatus, setMongoStatus] = useState<{
    connected: boolean;
    storageType: string;
    totalRecords: number;
    latencyMs: number;
    databaseName?: string;
  }>({
    connected: true,
    storageType: 'mongodb',
    totalRecords: 0,
    latencyMs: 12,
    databaseName: 'Lat-Aperture-People-Tracking'
  });

  const trackingCtx = useTracking();
  const { personnelSingular, personnelPlural, roleLabel, idBadgeLabel, safetyComplianceLabel, zoneLabel, siteLabel, organizationType } = useTerminology();


  useEffect(() => {
    const checkMongo = async () => {
      try {
        const start = performance.now();
        const res = await fetch('/api/mongodb/status');
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: data.connected ?? true,
            storageType: data.storageType || 'mongodb',
            totalRecords: data.totalRecords || 0,
            latencyMs: latency,
            databaseName: data.databaseName || 'Lat-Aperture-People-Tracking'
          });
        }
      } catch {}
    };
    checkMongo();
  }, []);

  // Real-time synchronization of attendance logs and leave records from MongoDB
  useEffect(() => {
    let unsubscribeAttendance = () => {};
    let unsubscribeLeave = () => {};
    let unsubscribeShifts = () => {};
    let unsubscribeHolidays = () => {};

    const syncAttendanceData = async () => {
      setDbLoading(true);
      try {
        // Listen to attendance_logs
        unsubscribeAttendance = onSnapshot(collection(db, 'attendance_logs'), (snapshot) => {
          const logs: AttendanceRecord[] = [];
          snapshot.forEach(docSnap => {
            logs.push({ id: docSnap.id, ...docSnap.data() } as AttendanceRecord);
          });
          setAttendanceLogs(logs);
        });

        // Listen to leave_requests
        unsubscribeLeave = onSnapshot(collection(db, 'leave_requests'), (snapshot) => {
          const leaves: LeaveRecord[] = [];
          snapshot.forEach(docSnap => {
            leaves.push({ id: docSnap.id, ...docSnap.data() } as LeaveRecord);
          });
          setLeaveRequests(leaves);
        });

        // Listen to shift_schedules
        unsubscribeShifts = onSnapshot(collection(db, 'shift_schedules'), (snapshot) => {
          const shifts: ShiftScheduleRecord[] = [];
          snapshot.forEach(docSnap => {
            shifts.push({ id: docSnap.id, ...docSnap.data() } as ShiftScheduleRecord);
          });
          setShiftSchedules(shifts);
        });

        // Listen to site_holidays
        unsubscribeHolidays = onSnapshot(collection(db, 'site_holidays'), (snapshot) => {
          const hols: SiteHoliday[] = [];
          snapshot.forEach(docSnap => {
            hols.push({ id: docSnap.id, ...docSnap.data() } as SiteHoliday);
          });
          setSiteHolidays(hols);
        });

      } catch (err) {
        console.warn('Error subscribing to attendance collections:', err);
      } finally {
        setDbLoading(false);
      }
    };

    syncAttendanceData();

    return () => {
      unsubscribeAttendance();
      unsubscribeLeave();
      unsubscribeShifts();
      unsubscribeHolidays();
    };
  }, [people]);

  const [dbPeople, setDbPeople] = useState<Person[]>([]);

  useEffect(() => {
    const loadDbPeople = async () => {
      try {
        const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
        const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
        const [regRes, peopleRes] = await Promise.allSettled([
          fetch('/api/data/registered_people', { headers }).then(r => r.ok ? r.json() : []),
          fetch('/api/data/people', { headers }).then(r => r.ok ? r.json() : [])
        ]);

        const rawList = [
          ...(regRes.status === 'fulfilled' && Array.isArray(regRes.value) ? regRes.value : []),
          ...(peopleRes.status === 'fulfilled' && Array.isArray(peopleRes.value) ? peopleRes.value : [])
        ];

        const dedupeMap = new Map<string, Person>();
        rawList.forEach(p => {
          if (p && p.id && !dedupeMap.has(p.id)) {
            dedupeMap.set(p.id, p);
          }
        });

        setDbPeople(Array.from(dedupeMap.values()));
      } catch (err) {
        console.warn('Error loading dbPeople in AttendanceTab:', err);
      }
    };
    loadDbPeople();
    window.addEventListener('gao_refresh_data', loadDbPeople);
    return () => window.removeEventListener('gao_refresh_data', loadDbPeople);
  }, []);

  // Combine real-time database logs with live moving personnel from TrackingContext & MongoDB
  const attendanceData = useMemo<AttendanceRecord[]>(() => {
    const map = new Map<string, AttendanceRecord>();

    // 1. Load persisted attendance logs from MongoDB
    attendanceLogs.forEach(log => {
      const key = (log.personId || log.name || log.id).toLowerCase();
      map.set(key, log);
    });

    // 2. Synchronize registered people & live TrackingContext movers
    const allPeople = [...(people || []), ...(trackingCtx?.people || []), ...(dbPeople || [])];
    const seenIds = new Set<string>();

    allPeople.forEach((p, idx) => {
      if (!p || !p.id) return;
      if (seenIds.has(p.id)) return;
      seenIds.add(p.id);

      const key = (p.id || p.name).toLowerCase();
      const existing = map.get(key);

      const liveZone = p.currentZone || 'Tower Core L2';
      const isOnSite = p.shiftStatus === 'ON_SITE' || p.presenceState === 'MOVING' || p.presenceState === 'IDLE';

      if (existing) {
        map.set(key, {
          ...existing,
          siteZone: liveZone || existing.siteZone,
          status: isOnSite ? (existing.status === 'LATE' ? 'LATE' : 'PRESENT') : existing.status,
          geoStatus: (liveZone.toLowerCase().includes('restricted') || liveZone.toLowerCase().includes('shaft')) ? 'OUT_OF_BOUNDS' : 'IN_GEO_FENCE',
          updatedAt: new Date().toISOString()
        });
      } else {
        map.set(key, {
          id: `ATT-${p.id}`,
          personId: p.id,
          name: p.name,
          role: p.role,
          company: (p as any).tradeCompany || (p as any).company || 'Prime Construction Partner',
          department: (p as any).department || p.role || 'Civil Engineering',
          siteZone: liveZone,
          shift: idx % 3 === 0 ? 'Night Shift (19:00-03:30)' : (idx % 4 === 0 ? 'Swing OT (15:00-23:30)' : 'Day Shift (07:00-15:30)'),
          firstIn: '07:15',
          lastOut: '15:45',
          breakDurationMins: 45,
          totalHoursStr: '8h 30m',
          totalMins: 510,
          overtimeHours: idx % 4 === 0 ? 1.5 : 0,
          isLate: false,
          isOvertime: idx % 4 === 0,
          rfidTagId: p.hardhatTagId || `HH-${p.id}`,
          geoStatus: 'IN_GEO_FENCE',
          status: isOnSite ? 'PRESENT' : 'ABSENT',
          hourlyRate: 45,
          punchType: 'RFID_AUTO',
          gateLocation: 'Main Turnstile Gate 1',
          date: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString()
        });
      }
    });

    return Array.from(map.values());
  }, [attendanceLogs, people, trackingCtx?.people, dbPeople]);

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return attendanceData.filter(a => {
      const matchesSearch = (a.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (a.rfidTagId || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (a.company || "").toLowerCase().includes((searchTerm || "").toLowerCase());

      const matchesDept = departmentFilter === 'All' || a.department === departmentFilter;
      const matchesShift = shiftFilter === 'All' || a.shift === shiftFilter;
      const matchesStatus = statusFilter === 'All' || a.status === statusFilter;

      return matchesSearch && matchesDept && matchesShift && matchesStatus;
    });
  }, [attendanceData, searchTerm, departmentFilter, shiftFilter, statusFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = attendanceData.length;
    const present = attendanceData.filter(a => a.status === 'PRESENT' || a.status === 'OVERTIME' || a.status === 'LATE').length;
    const late = attendanceData.filter(a => a.isLate).length;
    const overtime = attendanceData.filter(a => a.isOvertime).length;
    const totalOtHours = attendanceData.reduce((acc, curr) => acc + curr.overtimeHours, 0);
    const punctualityRate = total > 0 ? Math.round(((present - late) / total) * 100) : 100;
    const geoCompliant = attendanceData.filter(a => a.geoStatus !== 'OUT_OF_BOUNDS').length;
    const geoRate = total > 0 ? Math.round((geoCompliant / total) * 100) : 100;

    return { total, present, late, overtime, totalOtHours: Math.round(totalOtHours * 10) / 10, punctualityRate, geoRate };
  }, [attendanceData]);

  // Handle Real RFID Gate Tap Record & Save to DB
  const handleRfidBadgeTap = async (record: AttendanceRecord) => {
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Update or add log in MongoDB
    try {
      if (record.id) {
        await updateDoc(doc(db, 'attendance_logs', record.id), {
          firstIn: record.firstIn === '--:--' ? currentTimeStr : record.firstIn,
          lastOut: currentTimeStr,
          status: 'PRESENT',
          punchType: 'RFID_AUTO',
          updatedAt: now.toISOString()
        });
      } else {
        await addDoc(collection(db, 'attendance_logs'), {
          ...record,
          firstIn: record.firstIn === '--:--' ? currentTimeStr : record.firstIn,
          lastOut: currentTimeStr,
          status: 'PRESENT',
          punchType: 'RFID_AUTO',
          updatedAt: now.toISOString()
        });
      }
      setNotification(`⚡ RFID Sensor Gate 1 Triggered! Hardhat Tag ${record.rfidTagId} (${record.name}) scanned at ${currentTimeStr}. Document synced to MongoDB.`);
    } catch (err) {
      console.warn('Error updating RFID tap in DB:', err);
      setNotification(`⚡ RFID Sensor Gate 1 Triggered for ${record.name}! (Local update)`);
    }
    setTimeout(() => setNotification(null), 4000);
  };

  // Handle Manual Attendance Submit & Save to DB
  const handleSaveManualPunch = async () => {
    if (!selectedPersonForPunch) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const existing = attendanceData.find(a => a.personId === selectedPersonForPunch.id || a.name === selectedPersonForPunch.name);

    try {
      if (existing && existing.id) {
        await updateDoc(doc(db, 'attendance_logs', existing.id), {
          firstIn: manualPunchType === 'IN' ? timeStr : existing.firstIn,
          lastOut: manualPunchType === 'OUT' ? timeStr : existing.lastOut,
          status: manualPunchType === 'IN' ? 'PRESENT' : 'PRESENT',
          punchType: 'MANUAL_OVERRIDE',
          gateLocation: manualGateLocation,
          updatedAt: now.toISOString()
        });
      } else {
        await addDoc(collection(db, 'attendance_logs'), {
          personId: selectedPersonForPunch.id,
          name: selectedPersonForPunch.name,
          role: selectedPersonForPunch.role,
          company: selectedPersonForPunch.tradeCompany || 'BuildCorp Partner',
          department: (selectedPersonForPunch as any).department || selectedPersonForPunch.role || 'Civil Engineering',
          siteZone: selectedPersonForPunch.currentZone || 'Main Gate 1',
          shift: 'Day Shift (07:00-15:30)',
          firstIn: manualPunchType === 'IN' ? timeStr : '08:00',
          lastOut: manualPunchType === 'OUT' ? timeStr : '17:00',
          breakDurationMins: 45,
          totalHoursStr: '8h 15m',
          totalMins: 495,
          overtimeHours: 0,
          isLate: false,
          isOvertime: false,
          rfidTagId: selectedPersonForPunch.hardhatTagId || `HH-${(selectedPersonForPunch.id || '1001').substring(0, 4)}`,
          geoStatus: 'IN_GEO_FENCE',
          status: 'PRESENT',
          hourlyRate: 42,
          punchType: 'MANUAL_OVERRIDE',
          gateLocation: manualGateLocation,
          date: '2026-08-07',
          updatedAt: now.toISOString()
        });
      }
      setNotification(`✅ Manual Override Punch (${manualPunchType}) saved to MongoDB for ${selectedPersonForPunch.name}. Location: ${manualGateLocation}. Reason: ${manualReason}.`);
    } catch (err) {
      console.warn('Error saving manual punch to DB:', err);
      setNotification(`✅ Manual Override Punch (${manualPunchType}) logged for ${selectedPersonForPunch.name}.`);
    }

    setIsManualPunchOpen(false);
    setSelectedPersonForPunch(null);
    setTimeout(() => setNotification(null), 4000);
  };

  // Submit New Leave Request to MongoDB
  const handleSaveLeaveRequest = async () => {
    if (!selectedPersonForLeave) return;

    try {
      await addDoc(collection(db, 'leave_requests'), {
        personId: selectedPersonForLeave.id,
        name: selectedPersonForLeave.name,
        department: (selectedPersonForLeave as any).department || selectedPersonForLeave.role || 'Structure & Scaffolding',
        type: leaveType,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        reason: leaveReasonText,
        status: 'PENDING',
        approvedBy: 'Site EHS Manager',
        createdAt: new Date().toISOString()
      });
      setNotification(`📅 Leave request for ${selectedPersonForLeave.name} (${leaveType}) submitted and saved to MongoDB.`);
    } catch (err) {
      console.warn('Error saving leave request:', err);
      setNotification(`📅 Leave request for ${selectedPersonForLeave.name} submitted.`);
    }

    setIsLeaveModalOpen(false);
    setSelectedPersonForLeave(null);
    setTimeout(() => setNotification(null), 4000);
  };

  // Approve / Reject Leave Request in MongoDB
  const handleUpdateLeaveStatus = async (leaveId: string, newStatus: 'APPROVED' | 'REJECTED') => {
    try {
      const target = leaveRequests.find(l => l.id === leaveId);
      const updatedObj = {
        ...(target || { id: leaveId, name: 'Worker' }),
        status: newStatus,
        approvedBy: 'Marcus Vance (EHS Lead)',
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'leave_requests', leaveId), updatedObj);
      setLeaveRequests(prev => {
        const idx = prev.findIndex(l => l.id === leaveId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedObj as LeaveRecord;
          return next;
        }
        return [updatedObj as LeaveRecord, ...prev];
      });
      setNotification(`✅ Leave request for ${updatedObj.name || leaveId} marked ${newStatus} and synced to MongoDB.`);
    } catch (err) {
      console.warn('Error updating leave status in DB:', err);
      setLeaveRequests(prev => prev.map(l => l.id === leaveId ? { ...l, status: newStatus } : l));
      setNotification(`Leave request updated to ${newStatus}.`);
    }
    setTimeout(() => setNotification(null), 4000);
  };

  // Reassign Worker Shift & Save to MongoDB
  const handleSaveShiftAssignment = async () => {
    if (!selectedPersonForShift) return;

    try {
      await addDoc(collection(db, 'shift_schedules'), {
        personId: selectedPersonForShift.id,
        name: selectedPersonForShift.name,
        department: (selectedPersonForShift as any).department || selectedPersonForShift.role || 'Civil Engineering',
        shift: assignedShift,
        overtimeAuthorized: otAuthorized,
        maxOtHours: maxOtHoursVal,
        notes: `Updated on ${new Date().toLocaleDateString()}`
      });

      // Also update existing attendance log if present
      const existing = attendanceData.find(a => a.personId === selectedPersonForShift.id);
      if (existing && existing.id) {
        await updateDoc(doc(db, 'attendance_logs', existing.id), {
          shift: assignedShift
        });
      }

      setNotification(`⏱️ Shift updated to ${assignedShift} for ${selectedPersonForShift.name} and persisted to MongoDB.`);
    } catch (err) {
      console.warn('Error updating shift schedule:', err);
      setNotification(`⏱️ Shift assigned to ${selectedPersonForShift.name}.`);
    }

    setIsShiftModalOpen(false);
    setSelectedPersonForShift(null);
    setTimeout(() => setNotification(null), 4000);
  };

  // Update Worker Hourly Rate in MongoDB
  const handleSaveHourlyRate = async () => {
    if (!selectedRecordForRate) return;

    try {
      if (selectedRecordForRate.id) {
        await updateDoc(doc(db, 'attendance_logs', selectedRecordForRate.id), {
          hourlyRate: newHourlyRate
        });
      }
      setAttendanceLogs(prev => prev.map(r => r.id === selectedRecordForRate.id ? { ...r, hourlyRate: newHourlyRate } : r));
      setNotification(`💵 Hourly pay rate for ${selectedRecordForRate.name} updated to $${newHourlyRate}/hr in MongoDB.`);
    } catch (err) {
      console.warn('Error updating hourly rate:', err);
      setNotification(`💵 Rate updated to $${newHourlyRate}/hr.`);
    }

    setIsRateModalOpen(false);
    setSelectedRecordForRate(null);
    setTimeout(() => setNotification(null), 4000);
  };

  // Bulk Clock-In All Present
  const handleBulkClockIn = async () => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    try {
      for (const rec of filteredRoster) {
        if (rec.id) {
          await updateDoc(doc(db, 'attendance_logs', rec.id), {
            status: 'PRESENT',
            firstIn: timeStr,
            updatedAt: now.toISOString()
          });
        }
      }
      setNotification(`⚡ Bulk Clock-In executed for ${filteredRoster.length} workers! Updated in MongoDB.`);
    } catch (err) {
      console.warn('Bulk clock in error:', err);
      setNotification(`⚡ Bulk Clock-In processed for ${filteredRoster.length} workers.`);
    }
    setTimeout(() => setNotification(null), 4000);
  };

  // Export Payroll CSV
  const handleExportPayrollCSV = () => {
    const data = attendanceData.map(a => {
      const baseHours = Math.round((a.totalMins / 60) * 10) / 10;
      const grossPay = Math.round((baseHours * a.hourlyRate) + (a.overtimeHours * a.hourlyRate * 1.5));
      return {
        WorkerID: a.rfidTagId,
        Name: a.name,
        Department: a.department,
        Contractor: a.company,
        Shift: a.shift,
        FirstIn: `${a.firstIn} AM`,
        LastOut: `${a.lastOut} PM`,
        BreakMins: `${a.breakDurationMins}m`,
        BaseHours: baseHours,
        OvertimeHours: a.overtimeHours,
        HourlyRate: `$${a.hourlyRate}/hr`,
        EstGrossPay: `$${grossPay}`
      };
    });

    exportToCSV('Enterprise_Payroll_Timesheet_Report', data, [
      { key: 'WorkerID', label: 'RFID TAG' },
      { key: 'Name', label: 'NAME' },
      { key: 'Department', label: 'DEPARTMENT' },
      { key: 'Contractor', label: 'CONTRACTOR' },
      { key: 'Shift', label: 'SHIFT SCHEDULE' },
      { key: 'FirstIn', label: 'FIRST IN' },
      { key: 'LastOut', label: 'LAST OUT' },
      { key: 'BreakMins', label: 'BREAK' },
      { key: 'BaseHours', label: 'WORK HOURS' },
      { key: 'OvertimeHours', label: 'OT HOURS' },
      { key: 'HourlyRate', label: 'RATE' },
      { key: 'EstGrossPay', label: 'EST. GROSS PAY' }
    ]);
  };

  // Export PDF Attendance Report
  const handleExportPDF = () => {
    const rows = attendanceData.map(a => ({
      tag: a.rfidTagId,
      name: a.name,
      dept: a.department,
      shift: (a.shift || "").split(' ')[0],
      inOut: `${a.firstIn} - ${a.lastOut}`,
      hours: a.totalHoursStr,
      ot: `${a.overtimeHours}h`,
      status: a.status
    }));

    generatePDFReport(
      'Aperture Enterprise Attendance & Shift Audit Report',
      'Official Turnstile Scan & Timesheet Summary',
      [
        { key: 'tag', label: 'Tag ID' },
        { key: 'name', label: 'Worker Name' },
        { key: 'dept', label: 'Department' },
        { key: 'shift', label: 'Shift' },
        { key: 'inOut', label: 'First In / Last Out' },
        { key: 'hours', label: 'Hours Worked' },
        { key: 'ot', label: 'Overtime' },
        { key: 'status', label: 'Status' }
      ],
      rows,
      [
        { label: 'Total Personnel Present', value: metrics.present },
        { label: 'Punctuality Compliance', value: `${metrics.punctualityRate}%` },
        { label: 'Total Overtime Hours', value: `${metrics.totalOtHours} hrs` },
        { label: 'Geo-Fence Compliance', value: `${metrics.geoRate}%` }
      ]
    );
  };

  return (
    <div className="w-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-7 h-7 text-[#007BC4]" />
              Enterprise Attendance Management
            </h2>
            {mongoStatus.connected ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>MongoDB Atlas: Lat-Aperture-People-Tracking (Connected)</span>
                {mongoStatus.latencyMs > 0 && <span className="text-[10px] opacity-75 font-mono">({mongoStatus.latencyMs}ms)</span>}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <Database size={13} className="text-rose-600 dark:text-rose-400" />
                <span>MongoDB Disconnected</span>
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-1">
            Real-time RFID turnstile telemetry, live workforce presence, geo-mobile punches & automated timesheets synced to MongoDB.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsDailyTaskModalOpen(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer"
            title="Execute or configure automated daily attendance & safety compliance reporting task"
          >
            <Sparkles size={15} className="animate-pulse" /> Daily Report Task (PDF)
          </button>

          <button
            onClick={() => {
              if (people.length > 0) {
                setSelectedPersonForPunch(people[0]);
                setIsManualPunchOpen(true);
              }
            }}
            className="px-3.5 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2"
          >
            <Plus size={15} /> Manual Punch Override
          </button>

          <button
            onClick={() => {
              if (people.length > 0) {
                setSelectedPersonForLeave(people[0]);
                setIsLeaveModalOpen(true);
              }
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2"
          >
            <UserX size={15} /> Request Leave
          </button>

          <button
            onClick={handleExportPayrollCSV}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2"
          >
            <FileSpreadsheet size={15} /> Payroll Timesheet CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 transition"
            title="Export PDF Report"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className="p-3.5 bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-xl text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-[#007BC4]" />
            {notification}
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
            <X size={15} />
          </button>
        </div>
      )}

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Present Today</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-2xl font-black text-emerald-600">{metrics.present}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Late Arrivals</span>
          <span className="text-2xl font-black text-amber-600">{metrics.late}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overtime Active</span>
          <span className="text-2xl font-black text-[#007BC4]">{metrics.overtime}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total OT Hours</span>
          <span className="text-2xl font-black text-indigo-600">{metrics.totalOtHours}h</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Punctuality Rate</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{metrics.punctualityRate}%</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Geo Compliance</span>
          <span className="text-2xl font-black text-emerald-600">{metrics.geoRate}%</span>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'roster', label: 'Attendance Roster', icon: UserCheck },
            { id: 'live_feed', label: 'Live Gatehouse Scans', icon: Activity },
            { id: 'calendar', label: 'Calendar & Leave Log', icon: CalendarDays },
            { id: 'shifts', label: 'Shift Roster & Overtime', icon: Clock },
            { id: 'heatmap', label: 'Gate Traffic Heatmap', icon: BarChart2 },
            { id: 'departments', label: 'Departments & Contractors', icon: Layers },
            { id: 'payroll', label: 'Payroll & Timesheets', icon: DollarSign }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  activeSubTab === tab.id
                    ? 'bg-[#007BC4] text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters for Roster */}
        {activeSubTab === 'roster' && (
          <div className="flex items-center gap-2 w-full lg:w-auto mt-2 lg:mt-0 flex-wrap">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-3.5" />
              <input 
                type="text" 
                placeholder="Search worker or tag..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 px-2.5 py-1.5 outline-none"
            >
              <option value="All">All Departments</option>
              <option value="Civil Engineering">Civil Engineering</option>
              <option value="Electrical & Utilities">Electrical & Utilities</option>
              <option value="Safety & EHS">Safety & EHS</option>
              <option value="Heavy Equipment Ops">Heavy Equipment Ops</option>
              <option value="Structure & Scaffolding">Structure & Scaffolding</option>
            </select>

            <select
              value={shiftFilter}
              onChange={e => setShiftFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 px-2.5 py-1.5 outline-none"
            >
              <option value="All">All Shifts</option>
              {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}
            </select>

            <button
              onClick={handleBulkClockIn}
              className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-bold rounded-xl transition flex items-center gap-1"
              title="Clock in all filtered workers instantly"
            >
              <Zap size={13} /> Bulk Clock-In
            </button>

            {/* View Layout Toggle: List vs Condensed Cards */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
              <button
                type="button"
                onClick={() => setLayoutType('table')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  layoutType === 'table'
                    ? 'bg-white dark:bg-slate-700 text-[#007BC4] dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
                title="Standard List View"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutType('cards')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  layoutType === 'cards'
                    ? 'bg-white dark:bg-slate-700 text-[#007BC4] dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
                title="Condensed Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 1. ATTENDANCE ROSTER TAB */}
      {activeSubTab === 'roster' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {layoutType === 'cards' ? (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRoster.map((item) => (
                <div
                  key={item.id}
                  className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition-all hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                          {item.name}
                        </h4>
                        <div className="text-[11px] font-mono text-[#007BC4] font-bold">
                          {item.rfidTagId} • <span className="font-sans text-slate-500 font-normal">{item.role}</span>
                        </div>
                      </div>

                      <div>
                        {item.status === 'PRESENT' && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Present</Badge>}
                        {item.status === 'OVERTIME' && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">OT (+{item.overtimeHours}h)</Badge>}
                        {item.status === 'LATE' && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Late</Badge>}
                        {item.status === 'ABSENT' && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Absent</Badge>}
                        {item.status === 'ON_LEAVE' && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]">Leave</Badge>}
                      </div>
                    </div>

                    {/* Details Box */}
                    <div className="my-2.5 space-y-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium">Department:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{item.department}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium">Contractor:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.company}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium">Shift Schedule:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          {Boolean((item?.shift || '').includes('Night')) ? <Moon size={11} className="text-indigo-500" /> : <Sun size={11} className="text-amber-500" />}
                          {(item?.shift || "Day Shift").split(' ')[0]}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50 font-mono text-[11px]">
                        <span className="text-slate-400 font-sans">First In / Last Out:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{item.firstIn} - {item.lastOut}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium">Net Work Hours:</span>
                        <span className="font-bold text-[#007BC4]">{item.totalHoursStr} <span className="text-[10px] text-slate-400 font-normal">({item.breakDurationMins}m break)</span></span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                        <span className="text-slate-400 text-[10px] font-medium">Site Geo-Status:</span>
                        {item.geoStatus === 'IN_GEO_FENCE' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <MapPin size={9} /> In Geo-Fence
                          </span>
                        ) : item.geoStatus === 'BEACON_VERIFIED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <Radio size={9} /> Beacon
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <AlertTriangle size={9} /> Out of Bounds
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400">{item.gateLocation || 'Gatehouse 1'}</span>
                  </div>
                </div>
              ))}

              {filteredRoster.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 text-xs font-semibold">
                  No attendance records matched search query or filters.
                </div>
              )}
            </div>
          ) : (
            <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <TableRow>
                <TableHead className="font-bold">Personnel & RFID Tag</TableHead>
                <TableHead className="font-bold">Department / Contractor</TableHead>
                <TableHead className="font-bold">Shift Schedule</TableHead>
                <TableHead className="font-bold">First In / Last Out</TableHead>
                <TableHead className="font-bold">Net Work Hours</TableHead>
                <TableHead className="font-bold">Gate & Geo Status</TableHead>
                <TableHead className="font-bold text-center">Status</TableHead>
                <TableHead className="font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoster.map(item => (
                <TableRow key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition">
                  <TableCell>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {item.name}
                    </div>
                    <div className="text-[11px] font-mono text-[#007BC4] font-bold">{item.rfidTagId} • <span className="text-slate-400 font-sans">{item.role}</span></div>
                  </TableCell>

                  <TableCell className="text-xs">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{item.department}</div>
                    <div className="text-[10px] text-slate-500">{item.company}</div>
                  </TableCell>

                  <TableCell className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-1">
                      {Boolean((item?.shift || '').includes('Night')) ? <Moon size={12} className="text-indigo-500" /> : <Sun size={12} className="text-amber-500" />}
                      {(item?.shift || "Day Shift").split(' ')[0]}
                    </div>
                  </TableCell>

                  <TableCell className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    <div>In: <strong>{item.firstIn} AM</strong></div>
                    <div>Out: <strong>{item.lastOut} PM</strong></div>
                  </TableCell>

                  <TableCell className="text-xs">
                    <div className="font-bold text-slate-900 dark:text-white">{item.totalHoursStr}</div>
                    <div className="text-[10px] text-slate-400">Break: {item.breakDurationMins}m</div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      {item.geoStatus === 'IN_GEO_FENCE' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                          <MapPin size={10} /> In Site Geo-Fence
                        </span>
                      ) : item.geoStatus === 'BEACON_VERIFIED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-fit">
                          <Radio size={10} /> Bluetooth Beacon
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 w-fit">
                          <AlertTriangle size={10} /> Out of Bounds
                        </span>
                      )}
                      <div className="text-[9px] text-slate-400 font-mono">{item.gateLocation || 'Gate 1 Gatehouse'}</div>
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    {item.status === 'PRESENT' && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Present</Badge>}
                    {item.status === 'OVERTIME' && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Overtime (+{item.overtimeHours}h)</Badge>}
                    {item.status === 'LATE' && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Late Entry</Badge>}
                    {item.status === 'ABSENT' && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Absent</Badge>}
                    {item.status === 'ON_LEAVE' && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">On Leave</Badge>}
                  </TableCell>

                  <TableCell className="text-right">
                    <button
                      onClick={() => handleRfidBadgeTap(item)}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-[#007BC4] hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer"
                      title="Record Hardhat RFID Turnstile Tap"
                    >
                      ⚡ Record Scan
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </div>
      )}

      {/* 2. LIVE GATEHOUSE SCANS TAB */}
      {activeSubTab === 'live_feed' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Activity size={18} className="text-[#007BC4]" />
                Live Turnstile Scan & Geo-Fence Access Feed
              </h3>
              <p className="text-xs text-slate-500 font-medium">Real-time gatehouse sensor events logged to MongoDB</p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Sensor Active
            </span>
          </div>

          <div className="space-y-2.5">
            {attendanceData.map((a, idx) => (
              <div key={a.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs hover:border-[#007BC4]/40 transition">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#007BC4]/10 text-[#007BC4] font-black flex items-center justify-center shrink-0">
                    {(a?.name || 'Worker').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {a?.name || 'Unknown Personnel'}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-bold">{a?.rfidTagId || 'RFID-TAG'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">{a?.department || 'Operations'} • {a?.company || 'Contractor'}</div>
                  </div>
                </div>

                <div className="text-center hidden sm:block">
                  <div className="font-bold text-slate-800 dark:text-slate-200">{a.gateLocation || 'Gate 1 Gatehouse'}</div>
                  <div className="text-[10px] text-slate-400">{a.punchType}</div>
                </div>

                <div className="text-right space-y-0.5">
                  <div className="font-mono font-bold text-[#007BC4]">{a.firstIn} AM</div>
                  <Badge variant="outline" className={a.geoStatus === 'IN_GEO_FENCE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>
                    {a.geoStatus}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. CALENDAR & LEAVE LOG TAB */}
      {activeSubTab === 'calendar' && (() => {
        const effectiveLeaves = leaveRequests;
        const filteredLeaves = effectiveLeaves.filter(l => {
          if (leaveStatusFilter === 'ALL') return true;
          return l.status === leaveStatusFilter;
        });

        // Get leaves for the selected day
        const selectedDayLeaves = effectiveLeaves.filter(l => {
          if (!l || !l.startDate || !l.endDate) return false;
          const start = parseInt((l.startDate || '').split('-')[2] || '1', 10);
          const end = parseInt((l.endDate || '').split('-')[2] || '31', 10);
          return selectedCalendarDay >= start && selectedCalendarDay <= end;
        });

        const selectedDayHoliday = siteHolidays.find(h => {
          if (!h || !h.date) return false;
          return parseInt((h.date || '').split('-')[2] || '0', 10) === selectedCalendarDay;
        });

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {/* Left 2 Cols: Interactive Calendar Matrix */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                      <CalendarIcon size={18} className="text-[#007BC4]" />
                      August 2026 Workforce Attendance & Leave Matrix
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Click any day to view scheduled shifts, holiday downtime, and approved workforce leaves.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedCalendarDay(19)}
                      className="px-3 py-1 bg-blue-50 text-[#007BC4] hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Today (Aug 19)
                    </button>
                  </div>
                </div>

                {/* Calendar Grid Headers */}
                <div className="grid grid-cols-7 gap-2 text-center text-xs">
                  {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                    <div key={day} className={`font-black uppercase py-1 text-[11px] ${day === 'Sat' || day === 'Sun' ? 'text-amber-500' : 'text-slate-400'}`}>{day}</div>
                  ))}
                  {Array.from({ length: 31 }).map((_, i) => {
                    const dayNum = i + 1;
                    const isToday = dayNum === 19;
                    const isSelected = dayNum === selectedCalendarDay;
                    const totalWorkforce = attendanceData.length > 0 ? attendanceData.length : (people?.length || 11);
                    
                    // August 2026 starts on Saturday (Aug 1)
                    const dayOfWeek = i % 7; // 0: Sat, 1: Sun, 2: Mon, 3: Tue, 4: Wed, 5: Thu, 6: Fri
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 1;

                    // Find leaves overlapping this day
                    const dayLeaves = effectiveLeaves.filter(l => {
                      if (!l || !l.startDate || !l.endDate) return false;
                      const start = parseInt((l.startDate || '').split('-')[2] || '1', 10);
                      const end = parseInt((l.endDate || '').split('-')[2] || '31', 10);
                      return dayNum >= start && dayNum <= end;
                    });

                    const holiday = siteHolidays.find(h => {
                      if (!h || !h.date) return false;
                      return parseInt((h.date || '').split('-')[2] || '0', 10) === dayNum;
                    });

                    // Realistic MongoDB-backed on-site workforce headcount
                    let presentCount = 0;
                    if (holiday) {
                      presentCount = 0;
                    } else if (isToday) {
                      presentCount = Math.max(1, metrics.present);
                    } else if (isWeekend) {
                      presentCount = Math.max(0, Math.round(totalWorkforce * 0.35) - dayLeaves.length);
                    } else {
                      presentCount = Math.max(0, totalWorkforce - dayLeaves.length);
                    }

                    return (
                      <div 
                        key={dayNum} 
                        onClick={() => setSelectedCalendarDay(dayNum)}
                        className={`p-2 rounded-xl border text-left flex flex-col justify-between min-h-[92px] transition cursor-pointer hover:border-[#007BC4] hover:shadow-md ${
                          isSelected
                            ? 'border-[#007BC4] bg-[#007BC4]/10 dark:bg-[#007BC4]/20 ring-2 ring-[#007BC4]'
                            : isToday
                            ? 'border-blue-400 bg-blue-50/50 dark:bg-slate-900 font-bold'
                            : isWeekend
                            ? 'border-slate-200/70 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isSelected ? 'text-[#007BC4] font-black' : isToday ? 'text-blue-600' : isWeekend ? 'text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                            {dayNum}
                          </span>
                          {holiday ? (
                            <span className="w-2 h-2 rounded-full bg-indigo-500" title={`Holiday: ${holiday.name}`} />
                          ) : isToday ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" title="Today - Active Shift" />
                          ) : null}
                        </div>

                        <div className="space-y-1 my-1">
                          {holiday ? (
                            <div className="text-[8px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1 py-0.5 rounded truncate" title={holiday.name}>
                              {holiday.name.split(' ')[0]} Recess
                            </div>
                          ) : isWeekend ? (
                            <div className="text-[8px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded w-fit">
                              {presentCount} Weekend OT
                            </div>
                          ) : (
                            <div className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded w-fit">
                              {presentCount} On Site
                            </div>
                          )}

                          {/* Leave Indicators */}
                          {dayLeaves.slice(0, 1).map(l => (
                            <div
                              key={l.id}
                              className={`text-[8px] font-bold px-1 py-0.2 rounded truncate ${
                                l.type === 'Medical Leave'
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : l.type === 'Safety Training'
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                  : l.type === 'Emergency'
                                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                              title={`${l.name} (${l.type})`}
                            >
                              {(l?.name || 'Worker').split(' ')[0]} ({((l?.type || 'Leave') as string).split(' ')[0]})
                            </div>
                          ))}
                          {dayLeaves.length > 1 && (
                            <div className="text-[8px] text-slate-400 font-bold">+{dayLeaves.length - 1} on leave</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day Inspector Drawer */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-[#007BC4]" />
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                      Workforce Roster Breakdown: August {selectedCalendarDay}, 2026
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                      {Math.max(0, attendanceData.length - selectedDayLeaves.length)} / {attendanceData.length} Personnel On Site
                    </span>
                  </div>
                </div>

                {selectedDayHoliday && (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-indigo-900 dark:text-indigo-200">{selectedDayHoliday.name}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-200 text-indigo-900">{selectedDayHoliday.type}</span>
                  </div>
                )}

                {/* Personnel on Leave */}
                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Personnel on Authorized Leave ({selectedDayLeaves.length})
                  </div>
                  {selectedDayLeaves.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedDayLeaves.map(l => (
                        <div key={l.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-slate-900 dark:text-white">{l?.name || 'Worker'}</span>
                            <Badge variant="outline" className={l.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                              {l.status}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-slate-500">{l?.department || 'Operations'} • <span className="font-bold text-[#007BC4]">{l?.type || 'Leave'}</span></div>
                          <div className="text-[10px] font-mono text-slate-400">Duration: {l?.startDate || '--'} to {l?.endDate || '--'}</div>
                          <div className="text-[10px] italic text-slate-600 dark:text-slate-400">"{l?.reason || 'Scheduled time off'}"</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-400 font-semibold bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      Zero personnel on leave for August {selectedCalendarDay}. Full capacity attendance.
                    </div>
                  )}
                </div>

                {/* Active On-Site Personnel Roster */}
                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Active Workforce Scheduled On Site ({attendanceData.filter(a => !selectedDayLeaves.some(l => l.name === a.name)).length} Workers)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {attendanceData
                      .filter(a => !selectedDayLeaves.some(l => l.name === a.name))
                      .map(a => (
                        <div key={a.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white truncate max-w-[130px]">{a?.name || 'Worker'}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[130px]">{a?.role || 'Technician'} • {a?.department || 'Site'}</div>
                          </div>
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            On Site
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col: Leave Requests Log & MongoDB Persistence */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                      <UserX size={16} className="text-indigo-600" />
                      Leave Log & Approvals
                    </h4>
                    <span className="text-[10px] text-slate-400">Synced to MongoDB</span>
                  </div>
                  <button
                    onClick={() => {
                      if (people.length > 0) {
                        setSelectedPersonForLeave(people[0]);
                        setIsLeaveModalOpen(true);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#007BC4] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Request Leave
                  </button>
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => setLeaveStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${
                        leaveStatusFilter === st
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {st === 'ALL' ? `All (${effectiveLeaves.length})` : `${st} (${effectiveLeaves.filter(l => l.status === st).length})`}
                    </button>
                  ))}
                </div>

                {/* Leave Requests List */}
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {filteredLeaves.map(l => (
                    <div key={l.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-xs hover:border-[#007BC4]/50 transition">
                      <div className="flex justify-between items-center font-extrabold text-slate-900 dark:text-white">
                        <span>{l.name}</span>
                        <Badge variant="outline" className={l.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : l.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}>
                          {l.status}
                        </Badge>
                      </div>
                      <div className="text-slate-500 text-[11px] font-medium">{l.department} • <span className="font-bold text-[#007BC4]">{l.type}</span></div>
                      <div className="text-slate-400 font-mono text-[10px] flex items-center justify-between">
                        <span>{l.startDate || '--'} &rarr; {l.endDate || '--'}</span>
                        <span className="font-bold text-slate-600 dark:text-slate-300">
                          {Math.max(1, (parseInt((l.endDate || '').split('-')[2] || '1', 10) - parseInt((l.startDate || '').split('-')[2] || '1', 10) + 1))} Days
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 italic text-[10px] bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                        "{l.reason}"
                      </div>

                      {l.status === 'PENDING' && (
                        <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                          <button
                            onClick={() => handleUpdateLeaveStatus(l.id, 'APPROVED')}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Check size={11} /> Approve
                          </button>
                          <button
                            onClick={() => handleUpdateLeaveStatus(l.id, 'REJECTED')}
                            className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <X size={11} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {filteredLeaves.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                      No leave requests found for this filter.
                    </div>
                  )}
                </div>
              </div>

              {/* Site Holidays & Stand-Downs Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <CalendarDays size={16} className="text-[#007BC4]" />
                  Upcoming Site Holidays & Safety Recess
                </h4>
                <div className="space-y-2">
                  {siteHolidays.map(h => (
                    <div key={h.date || h.name} className="p-2.5 bg-blue-50/50 dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded-xl text-xs space-y-0.5">
                      <div className="font-bold text-blue-900 dark:text-blue-200">{h.name}</div>
                      <div className="text-slate-500 text-[10px] font-mono">{h.date} • {h.type}</div>
                    </div>
                  ))}
                  {siteHolidays.length === 0 && (
                    <div className="py-4 text-center text-slate-400 text-xs">
                      No site holidays scheduled in database.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. SHIFT ROSTER & OVERTIME */}
      {activeSubTab === 'shifts' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Clock size={18} className="text-[#007BC4]" />
                Shift Allocation & Overtime Authorization Matrix
              </h3>
              <p className="text-xs text-slate-500 font-medium">Configure day, night, and swing overtime shifts for trade contractors.</p>
            </div>
            <button
              onClick={() => {
                if (people.length > 0) {
                  setSelectedPersonForShift(people[0]);
                  setIsShiftModalOpen(true);
                }
              }}
              className="px-3.5 py-2 bg-[#007BC4] hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
            >
              <Edit3 size={14} /> Assign / Reassign Shift
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-amber-50/60 dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-2xl space-y-2">
              <div className="flex justify-between items-center font-bold text-amber-900 dark:text-amber-200">
                <span className="flex items-center gap-1.5"><Sun size={16} /> Day Shift (07:00 - 15:30)</span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-xs font-black">28 Workers</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300">Standard civil engineering, structural scaffolding, and concrete pouring operations.</p>
            </div>

            <div className="p-4 bg-indigo-50/60 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl space-y-2">
              <div className="flex justify-between items-center font-bold text-indigo-900 dark:text-indigo-200">
                <span className="flex items-center gap-1.5"><Moon size={16} /> Night Shift (19:00 - 03:30)</span>
                <span className="px-2 py-0.5 bg-indigo-200 text-indigo-900 rounded-full text-xs font-black">8 Workers</span>
              </div>
              <p className="text-xs text-indigo-800 dark:text-indigo-300">Tunnel shaft excavation, heavy crane rigging, and high-voltage cable splicing.</p>
            </div>

            <div className="p-4 bg-blue-50/60 dark:bg-slate-900 border border-blue-200 dark:border-blue-800/50 rounded-2xl space-y-2">
              <div className="flex justify-between items-center font-bold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-1.5"><Zap size={16} /> Swing Overtime (1.5x Rate)</span>
                <span className="px-2 py-0.5 bg-blue-200 text-blue-900 rounded-full text-xs font-black">{metrics.overtime} Active</span>
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-300">Pre-approved overtime hours for milestone completion. Requires EHS supervisor authorization.</p>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-3">Shift Assignments (MongoDB Synced)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {attendanceData.slice(0, 9).map(a => (
                <div key={a.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1 text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">{a.name}</div>
                  <div className="text-slate-500 text-[11px]">{a.department}</div>
                  <div className="text-[#007BC4] font-bold font-mono text-[11px]">{a.shift}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. ATTENDANCE HEATMAP */}
      {activeSubTab === 'heatmap' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <BarChart2 size={18} className="text-[#007BC4]" />
              Hourly Gatehouse Attendance Density Heatmap
            </h3>
            <p className="text-xs text-slate-500 font-medium">Monitors turnstile traffic peaks between 06:00 AM and 08:00 PM.</p>
          </div>

          {/* Heatmap Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[650px] space-y-2 text-xs">
              <div className="grid grid-cols-13 gap-1 font-bold text-slate-400 text-center">
                <span>Day</span>
                {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(h => (
                  <span key={h}>{h}</span>
                ))}
              </div>

              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, dIdx) => (
                <div key={day} className="grid grid-cols-13 gap-1 items-center">
                  <span className="font-bold text-slate-700 dark:text-slate-300">{day}</span>
                  {Array.from({ length: 12 }).map((_, hIdx) => {
                    const intensity = (dIdx + hIdx * 3) % 5;
                    const bgClass = 
                      intensity === 4 ? 'bg-[#007BC4] text-white font-bold' :
                      intensity === 3 ? 'bg-blue-400 text-white' :
                      intensity === 2 ? 'bg-blue-200 text-slate-800' :
                      intensity === 1 ? 'bg-blue-50 text-slate-700' : 'bg-slate-100 text-slate-400';

                    return (
                      <div key={hIdx} className={`p-2 rounded-lg text-center ${bgClass}`} title={`Hour ${hIdx + 6}:00`}>
                        {12 + (intensity * 6)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. DEPARTMENT & CONTRACTOR BREAKDOWN */}
      {activeSubTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Department Attendance Distribution</h3>
            <div className="space-y-3 text-xs">
              {[
                { name: 'Civil Engineering', count: 14, pct: 35, color: 'bg-[#007BC4]' },
                { name: 'Electrical & Utilities', count: 8, pct: 20, color: 'bg-emerald-500' },
                { name: 'Structure & Scaffolding', count: 10, pct: 25, color: 'bg-amber-500' },
                { name: 'Safety & EHS', count: 5, pct: 12, color: 'bg-indigo-500' },
                { name: 'Heavy Equipment Ops', count: 3, pct: 8, color: 'bg-rose-500' }
              ].map(d => (
                <div key={d.name} className="space-y-1">
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>{d.name}</span>
                    <span>{d.count} Workers ({d.pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div className={`${d.color} h-full rounded-full`} style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Trade Subcontractor Roster</h3>
            <div className="space-y-3 text-xs">
              {[
                { name: 'BuildCorp General Contractor', count: 18, pct: 45, color: 'bg-[#007BC4]' },
                { name: 'Apex Structural Solutions', count: 10, pct: 25, color: 'bg-emerald-500' },
                { name: 'VoltCraft Electrical', count: 7, pct: 18, color: 'bg-indigo-500' },
                { name: 'Titan Heavy Machinery', count: 5, pct: 12, color: 'bg-rose-500' }
              ].map(c => (
                <div key={c.name} className="space-y-1">
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>{c.name}</span>
                    <span>{c.count} On-Site ({c.pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div className={`${c.color} h-full rounded-full`} style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. PAYROLL & TIMESHEETS */}
      {activeSubTab === 'payroll' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-600" />
                Automated Payroll & Hours Calculator
              </h3>
              <p className="text-xs text-slate-500 font-medium">Calculates base wages, overtime multipliers (1.5x), and break deductions.</p>
            </div>
            <button
              onClick={handleExportPayrollCSV}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition flex items-center gap-2"
            >
              <FileSpreadsheet size={15} /> Export Payroll CSV
            </button>
          </div>

          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="font-bold">Worker Name</TableHead>
                <TableHead className="font-bold">Contractor</TableHead>
                <TableHead className="font-bold">Base Hours</TableHead>
                <TableHead className="font-bold">OT Hours (1.5x)</TableHead>
                <TableHead className="font-bold">Hourly Rate</TableHead>
                <TableHead className="font-bold text-right">Est. Gross Pay</TableHead>
                <TableHead className="font-bold text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceData.map(a => {
                const baseHours = Math.round((a.totalMins / 60) * 10) / 10;
                const grossPay = Math.round((baseHours * a.hourlyRate) + (a.overtimeHours * a.hourlyRate * 1.5));

                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-bold text-xs text-slate-900 dark:text-white">{a.name}</TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-400">{a.company}</TableCell>
                    <TableCell className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">{baseHours} hrs</TableCell>
                    <TableCell className="text-xs font-mono font-bold text-[#007BC4]">{a.overtimeHours} hrs</TableCell>
                    <TableCell className="text-xs font-mono text-slate-600 dark:text-slate-400">${a.hourlyRate}/hr</TableCell>
                    <TableCell className="text-xs font-mono font-black text-emerald-600 text-right">${grossPay}</TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => {
                          setSelectedRecordForRate(a);
                          setNewHourlyRate(a.hourlyRate);
                          setIsRateModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-[#007BC4] hover:text-white text-xs font-bold rounded-lg transition"
                      >
                        Edit Rate
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Manual Attendance Punch Modal */}
      {isManualPunchOpen && selectedPersonForPunch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsManualPunchOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Manual Attendance Punch Override</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Select Personnel</label>
                <select
                  value={selectedPersonForPunch.id}
                  onChange={e => {
                    const found = people.find(p => p.id === e.target.value);
                    if (found) setSelectedPersonForPunch(found);
                  }}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                >
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.hardhatTagId || p.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Punch Direction</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setManualPunchType('IN')}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs border ${manualPunchType === 'IN' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700'}`}
                  >
                    CLOCK IN
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPunchType('OUT')}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs border ${manualPunchType === 'OUT' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 text-slate-700'}`}
                  >
                    CLOCK OUT
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Gatehouse Location</label>
                <select
                  value={manualGateLocation}
                  onChange={e => setManualGateLocation(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="Gate 1 - North Gatehouse">Gate 1 - North Gatehouse</option>
                  <option value="Gate 2 - East Logistics Portal">Gate 2 - East Logistics Portal</option>
                  <option value="Turnstile West Shaft">Turnstile West Shaft</option>
                  <option value="Main South Entrance">Main South Entrance</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Reason for Override</label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={e => setManualReason(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="e.g. Turnstile Sensor Replacement"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualPunchOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveManualPunch}
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Submit & Sync to MongoDB
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Request Modal */}
      {isLeaveModalOpen && selectedPersonForLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsLeaveModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Request Worker Leave (MongoDB)</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Worker</label>
                <select
                  value={selectedPersonForLeave.id}
                  onChange={e => {
                    const found = people.find(p => p.id === e.target.value);
                    if (found) setSelectedPersonForLeave(found);
                  }}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                >
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({(p as any).department || p.role || 'Worker'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={e => setLeaveType(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="Medical Leave">Medical Leave</option>
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Safety Training">Safety Training</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Parental">Parental</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={e => setLeaveStartDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={e => setLeaveEndDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Reason / EHS Clearance</label>
                <input
                  type="text"
                  value={leaveReasonText}
                  onChange={e => setLeaveReasonText(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  placeholder="e.g. Doctor Certificate attached"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveLeaveRequest}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
                >
                  Save Leave to MongoDB
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift Assignment Modal */}
      {isShiftModalOpen && selectedPersonForShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsShiftModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Reassign Worker Shift</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Worker</label>
                <select
                  value={selectedPersonForShift.id}
                  onChange={e => {
                    const found = people.find(p => p.id === e.target.value);
                    if (found) setSelectedPersonForShift(found);
                  }}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                >
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({(p as any).department || p.role || 'Worker'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Target Shift Schedule</label>
                <select
                  value={assignedShift}
                  onChange={e => setAssignedShift(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-[#007BC4]"
                >
                  {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">Authorize Overtime</div>
                  <div className="text-[10px] text-slate-500">Allow worker to exceed 8h with 1.5x pay multiplier</div>
                </div>
                <input
                  type="checkbox"
                  checked={otAuthorized}
                  onChange={e => setOtAuthorized(e.target.checked)}
                  className="w-4 h-4 text-[#007BC4] rounded"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveShiftAssignment}
                  className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold"
                >
                  Save Shift to MongoDB
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Hourly Rate Modal */}
      {isRateModalOpen && selectedRecordForRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-xs p-6 relative">
            <button onClick={() => setIsRateModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Edit Pay Rate</h3>
            <p className="text-xs text-slate-500 mb-3">{selectedRecordForRate.name}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Hourly Rate ($/hr)</label>
                <input
                  type="number"
                  value={newHourlyRate}
                  onChange={e => setNewHourlyRate(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-emerald-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRateModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveHourlyRate}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Automated Reporting Task Modal */}
      <DailyReportingTaskModal
        isOpen={isDailyTaskModalOpen}
        onClose={() => setIsDailyTaskModalOpen(false)}
        people={people}
      />

    </div>
  );
}
