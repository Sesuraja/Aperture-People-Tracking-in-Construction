import React, { useState, useEffect, useMemo } from 'react';
import { Person } from '../lib/simulation';
import { 
  Clock, CheckCircle2, UserX, AlertTriangle, Download, Search, Briefcase, 
  Calendar as CalendarIcon, MapPin, Radio, FileSpreadsheet, UserCheck, 
  ShieldCheck, ArrowUpRight, BarChart2, Plus, X, Sun, Moon, 
  CalendarDays, Layers, Zap, DollarSign, Filter, RefreshCw, Printer, FileText,
  Activity, Check, Ban, Edit3, ExternalLink, HelpCircle, LayoutList, LayoutGrid,
  Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import { db, collection, addDoc, updateDoc, doc, onSnapshot, getDocs } from '../lib/db';
import DailyReportingTaskModal from './DailyReportingTaskModal';

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

const MOCK_LEAVE_DEFAULTS: LeaveRecord[] = [];
const MOCK_HOLIDAYS: Array<{ name: string; date: string; type: string }> = [];

export default function AttendanceTab({ people }: { people: Person[] }) {
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'live_feed' | 'calendar' | 'shifts' | 'heatmap' | 'departments' | 'payroll'>('roster');
  const [layoutType, setLayoutType] = useState<'table' | 'cards'>('table');
  
  // Real-time Database Collections
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRecord[]>([]);
  const [shiftSchedules, setShiftSchedules] = useState<ShiftScheduleRecord[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('Today');

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

  // Seed default dataset if database is empty
  useEffect(() => {
    let unsubscribeAttendance = () => {};
    let unsubscribeLeave = () => {};
    let unsubscribeShifts = () => {};

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
    };
  }, [people]);

  // Use real-time database logs exclusively
  const attendanceData = useMemo<AttendanceRecord[]>(() => {
    return attendanceLogs;
  }, [attendanceLogs]);

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

  // Handle RFID Tap Simulation & Save to DB
  const handleSimulateRfidTap = async (record: AttendanceRecord) => {
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Update or add log in MongoDB
    try {
      if (record.id && !record.id.startsWith('mock-')) {
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
      if (existing && existing.id && !existing.id.startsWith('mock-')) {
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
          rfidTagId: selectedPersonForPunch.hardhatTagId || `HH-${selectedPersonForPunch.id.substring(0, 4)}`,
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
      if (!leaveId.startsWith('LV-')) {
        await updateDoc(doc(db, 'leave_requests', leaveId), {
          status: newStatus,
          approvedBy: 'Marcus Vance (EHS Lead)',
          updatedAt: new Date().toISOString()
        });
      }
      setLeaveRequests(prev => prev.map(l => l.id === leaveId ? { ...l, status: newStatus, approvedBy: 'Marcus Vance (EHS Lead)' } : l));
      setNotification(`Leave request ${leaveId} updated to ${newStatus} in MongoDB.`);
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
      if (existing && existing.id && !existing.id.startsWith('mock-')) {
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
      if (!selectedRecordForRate.id.startsWith('mock-')) {
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
        if (rec.id && !rec.id.startsWith('mock-')) {
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
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-7 h-7 text-[#007BC4]" />
              Enterprise Attendance Management
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              MongoDB Connected
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-0.5">
            RFID turnstile taps, geo-mobile punches, leave management, shift rosters & automated payroll timesheets
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
                          {item.shift.includes('Night') ? <Moon size={11} className="text-indigo-500" /> : <Sun size={11} className="text-amber-500" />}
                          {(item.shift || "").split(' ')[0]}
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
                    <button
                      onClick={() => handleSimulateRfidTap(item)}
                      className="px-3 py-1 bg-[#007BC4]/10 hover:bg-[#007BC4] text-[#007BC4] hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                      title="Simulate Hardhat RFID Turnstile Tap"
                    >
                      ⚡ Tap RFID
                    </button>
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
                      {item.shift.includes('Night') ? <Moon size={12} className="text-indigo-500" /> : <Sun size={12} className="text-amber-500" />}
                      {(item.shift || "").split(' ')[0]}
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
                      onClick={() => handleSimulateRfidTap(item)}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-[#007BC4] hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition"
                      title="Simulate Hardhat RFID Turnstile Tap"
                    >
                      ⚡ Tap RFID
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
                    {a.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {a.name}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-bold">{a.rfidTagId}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">{a.department} • {a.company}</div>
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
      {activeSubTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <CalendarIcon size={18} className="text-[#007BC4]" />
                August 2026 Site Attendance Calendar Grid
              </h3>
              <div className="text-xs font-bold text-slate-500">22 Work Days Scheduled</div>
            </div>

            {/* Calendar Matrix */}
            <div className="grid grid-cols-7 gap-2 text-center text-xs">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="font-black text-slate-400 uppercase py-1">{day}</div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const dayNum = i + 1;
                const isToday = dayNum === 7;
                const presentCount = 38 + (i % 7);
                const lateCount = i % 4;

                return (
                  <div 
                    key={dayNum} 
                    className={`p-2.5 rounded-xl border text-left flex flex-col justify-between h-20 transition ${
                      isToday ? 'border-[#007BC4] bg-[#007BC4]/5 font-bold ring-2 ring-[#007BC4]/30' : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900'
                    }`}
                  >
                    <span className={`text-xs ${isToday ? 'text-[#007BC4] font-black' : 'text-slate-700 dark:text-slate-300'}`}>{dayNum}</span>
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded w-fit">{presentCount} Present</div>
                      {lateCount > 0 && <div className="text-[9px] font-bold text-amber-600">{lateCount} Late</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leave & Site Holiday Sidebar */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <UserX size={16} className="text-indigo-600" />
                  Leave Requests (MongoDB)
                </h4>
                <button
                  onClick={() => {
                    if (people.length > 0) {
                      setSelectedPersonForLeave(people[0]);
                      setIsLeaveModalOpen(true);
                    }
                  }}
                  className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-lg transition"
                >
                  + Add
                </button>
              </div>

              <div className="space-y-2.5">
                {(leaveRequests.length > 0 ? leaveRequests : MOCK_LEAVE_DEFAULTS).map(l => (
                  <div key={l.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-center font-bold text-slate-900 dark:text-white">
                      <span>{l.name}</span>
                      <Badge variant="outline" className={l.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : l.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}>
                        {l.status}
                      </Badge>
                    </div>
                    <div className="text-slate-500 text-[11px]">{l.department} • {l.type}</div>
                    <div className="text-slate-400 font-mono text-[10px]">{l.startDate} to {l.endDate}</div>
                    <div className="text-slate-600 dark:text-slate-400 italic text-[10px]">{l.reason}</div>

                    {l.status === 'PENDING' && (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <button
                          onClick={() => handleUpdateLeaveStatus(l.id, 'APPROVED')}
                          className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleUpdateLeaveStatus(l.id, 'REJECTED')}
                          className="flex-1 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <CalendarDays size={16} className="text-[#007BC4]" />
                Upcoming Site Holidays
              </h4>
              <div className="space-y-2">
                {MOCK_HOLIDAYS.map(h => (
                  <div key={h.date} className="p-2.5 bg-blue-50/50 dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded-xl text-xs space-y-0.5">
                    <div className="font-bold text-blue-900 dark:text-blue-200">{h.name}</div>
                    <div className="text-slate-500 text-[10px] font-mono">{h.date} • {h.type}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
