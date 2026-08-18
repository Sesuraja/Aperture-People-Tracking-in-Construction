import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserPlus, ClipboardCheck, Clock, Search, X, Mail, 
  Printer, Download, ShieldAlert, ShieldCheck, CheckCircle2, 
  XCircle, Truck, BarChart2, Send, UserCheck, QrCode
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, db } from '../lib/db';
import QRCode from 'react-qr-code';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';
import VisitorCheckInForm from './VisitorCheckInForm';
import VisitorQrGenerator from './VisitorQrGenerator';

export interface VisitorRecord {
  id: string;
  name: string;
  company: string;
  host: string;
  email: string;
  phone?: string;
  status: 'Pre-Registered' | 'Pending Approval' | 'Approved' | 'Active' | 'Completed' | 'Overstayed' | 'Denied';
  time: string;
  tag: string;
  location: string;
  duration?: string;
  path?: string[];
  vehiclePlate?: string;
  vehicleType?: string;
  parkingBay?: string;
  purpose?: string;
  idVerificationStatus?: 'VERIFIED' | 'PENDING' | 'FAILED';
  idDocType?: string;
  idDocNumber?: string;
  qrCodeRef?: string;
  isOverstayed?: boolean;
  arrivalTime?: number;
  approvalRemarks?: string;
}

export interface SecurityListItem {
  id: string;
  name: string;
  company: string;
  type: 'BLACKLIST' | 'WHITELIST';
  reason: string;
  addedBy: string;
  addedDate: string;
  riskLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}



export default function VisitorsTab() {
  const [activeTab, setActiveTab] = useState<'roster' | 'checkin' | 'qr_generator' | 'approval' | 'vehicles' | 'security_list' | 'analytics'>('roster');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [securityList, setSecurityList] = useState<SecurityListItem[]>([]);
  
  // Modals
  const [isPreRegisterModalOpen, setIsPreRegisterModalOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null);
  const [badgeVisitor, setBadgeVisitor] = useState<VisitorRecord | null>(null);
  const [invitationVisitor, setInvitationVisitor] = useState<VisitorRecord | null>(null);
  const [isAddSecurityModalOpen, setIsAddSecurityModalOpen] = useState(false);
  const [securityListType, setSecurityListType] = useState<'BLACKLIST' | 'WHITELIST'>('BLACKLIST');
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [newVisitor, setNewVisitor] = useState({
    name: '',
    company: '',
    host: 'marcus.vance@buildcorp.com',
    email: '',
    phone: '',
    date: 'Today',
    time: '10:00 AM',
    purpose: 'Site Inspection & Engineering Audit',
    vehiclePlate: '',
    vehicleType: 'Sedan',
    parkingBay: 'Bay P-01',
    idDocType: 'Driver License',
    idDocNumber: ''
  });

  const [newSecurityEntry, setNewSecurityEntry] = useState({
    name: '',
    company: '',
    type: 'BLACKLIST' as 'BLACKLIST' | 'WHITELIST',
    reason: '',
    riskLevel: 'HIGH' as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  });

  // Firestore Subscription
  useEffect(() => {

    const unsubVisitors = onSnapshot(collection(db, 'visitors'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as VisitorRecord));
      setVisitors(data.sort((a, b) => String(b.id || '').localeCompare(String(a.id || ''))));
    });

    const unsubSecurity = onSnapshot(collection(db, 'visitor_security_list'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as SecurityListItem));
      setSecurityList(data);
    });

    return () => {
      unsubVisitors();
      unsubSecurity();
    };
  }, []);

  // Filtered Visitors
  const filteredVisitors = useMemo(() => {
    return visitors.filter(v => {
      const vName = v.name || '';
      const vCompany = v.company || '';
      const vId = v.id || '';
      const vHost = v.host || '';
      const sTerm = (searchTerm || "").toLowerCase();

      const matchesSearch = (vName || "").toLowerCase().includes(sTerm) ||
        (vCompany || "").toLowerCase().includes(sTerm) ||
        (vId || "").toLowerCase().includes(sTerm) ||
        (vHost || "").toLowerCase().includes(sTerm) ||
        (v.vehiclePlate && (v.vehiclePlate || "").toLowerCase().includes(sTerm));

      if (!matchesSearch) return false;

      if (statusFilter === 'Active') return v.status === 'Active' && !v.isOverstayed;
      if (statusFilter === 'Pre-Registered') return v.status === 'Pre-Registered';
      if (statusFilter === 'Pending Approval') return v.status === 'Pending Approval';
      if (statusFilter === 'Approved') return v.status === 'Approved';
      if (statusFilter === 'Completed') return v.status === 'Completed';
      if (statusFilter === 'Overstayed') return v.status === 'Overstayed' || (v.status === 'Active' && v.isOverstayed);
      if (statusFilter === 'Denied') return v.status === 'Denied';

      return true;
    });
  }, [visitors, searchTerm, statusFilter]);

  // Dashboard Stats
  const stats = useMemo(() => {
    const total = visitors.length;
    const active = visitors.filter(v => v.status === 'Active' && !v.isOverstayed).length;
    const pendingApproval = visitors.filter(v => v.status === 'Pending Approval').length;
    const preRegistered = visitors.filter(v => v.status === 'Pre-Registered' || v.status === 'Approved').length;
    const overstayed = visitors.filter(v => v.status === 'Overstayed' || (v.status === 'Active' && v.isOverstayed)).length;
    const blacklisted = securityList.filter(s => s.type === 'BLACKLIST').length;
    const verifiedIdCount = visitors.filter(v => v.idVerificationStatus === 'VERIFIED').length;
    const idVerifiedRate = total > 0 ? Math.round((verifiedIdCount / total) * 100) : 100;

    return { total, active, pendingApproval, preRegistered, overstayed, blacklisted, idVerifiedRate };
  }, [visitors, securityList]);

  // Handle Pre-Registration Submit
  const handlePreRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVisitor.name || !newVisitor.company) return;

    // Check Blacklist FIRST!
    const isBlacklisted = securityList.some(s => {
      const sName = s.name || '';
      const sCompany = s.company || '';
      return s.type === 'BLACKLIST' && 
        (((sName || "").toLowerCase() === (newVisitor.name || "").toLowerCase()) || 
         ((sCompany || "").toLowerCase() === (newVisitor.company || "").toLowerCase()));
    });

    const newId = `VIS-${Math.floor(Math.random() * 800) + 900}`;
    const qrRef = `QR-${newVisitor.name.substring(0, 4).toUpperCase()}-${Math.floor(Math.random() * 8999) + 1000}`;

    const visitorRecord: VisitorRecord = {
      id: newId,
      name: newVisitor.name,
      company: newVisitor.company,
      host: newVisitor.host || 'marcus.vance@buildcorp.com',
      email: newVisitor.email,
      phone: newVisitor.phone || '+1 (555) 019-2831',
      status: isBlacklisted ? 'Denied' : 'Pending Approval',
      time: `${newVisitor.time} (${newVisitor.date})`,
      tag: 'Not Assigned',
      location: 'Gate 1 Gatehouse',
      duration: 'Pending Approval',
      path: [],
      vehiclePlate: (newVisitor.vehiclePlate || "").toUpperCase() || 'N/A',
      vehicleType: newVisitor.vehicleType,
      parkingBay: newVisitor.parkingBay,
      purpose: newVisitor.purpose,
      idVerificationStatus: 'PENDING',
      idDocType: newVisitor.idDocType,
      idDocNumber: newVisitor.idDocNumber || `DOC-${Math.floor(Math.random() * 899000) + 100000}`,
      qrCodeRef: qrRef,
      approvalRemarks: isBlacklisted ? 'CRITICAL SECURITY BLOCK: Name or Organization matched active Blacklist database!' : 'Awaiting host authorization'
    };

    try {
      await setDoc(doc(db, 'visitors', newId), visitorRecord);
      
      if (isBlacklisted) {
        setNotificationMsg({ type: 'error', text: `SECURITY ALERT: ${newVisitor.name} matched Blacklist database. Access DENIED.` });
        // Log Alert
        await setDoc(doc(db, 'alerts', `alt_blk_${Date.now()}`), {
          id: `alt_blk_${Date.now()}`,
          type: 'BLACKLIST_MATCH_SECURITY_ALERT',
          severity: 'high',
          title: `Blacklisted Person Entry Attempted`,
          message: `Blocked entry for ${newVisitor.name} (${newVisitor.company}). Blacklist flag active.`,
          timestamp: new Date().toISOString(),
          location: 'Gate 1 Gatehouse'
        });
      } else {
        setNotificationMsg({ type: 'success', text: `Visitor ${newVisitor.name} pre-registered & sent to Host Approval Queue!` });
      }

      setIsPreRegisterModalOpen(false);
      setNewVisitor({
        name: '',
        company: '',
        host: 'marcus.vance@buildcorp.com',
        email: '',
        phone: '',
        date: 'Today',
        time: '10:00 AM',
        purpose: 'Site Inspection & Engineering Audit',
        vehiclePlate: '',
        vehicleType: 'Sedan',
        parkingBay: 'Bay P-01',
        idDocType: 'Driver License',
        idDocNumber: ''
      });
    } catch (err) {
      console.error('Error creating visitor record:', err);
    }
  };

  // Host Approval Actions
  const handleHostApprove = async (visitorId: string, remarks?: string) => {
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        status: 'Approved',
        approvalRemarks: remarks || 'Approved by Host Officer via Enterprise System'
      });
      setNotificationMsg({ type: 'success', text: `Visitor ${visitorId} visit approved!` });
    } catch (err) {
      console.error('Error approving visitor:', err);
    }
  };

  const handleHostDeny = async (visitorId: string, remarks?: string) => {
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        status: 'Denied',
        approvalRemarks: remarks || 'Denied by Host / Security Team'
      });
      setNotificationMsg({ type: 'error', text: `Visitor ${visitorId} access denied.` });
    } catch (err) {
      console.error('Error denying visitor:', err);
    }
  };

  // Issue RFID & Complete Check-In
  const handleAssignRFIDTag = async (visitorId: string) => {
    try {
      const tagNum = Math.floor(Math.random() * 8990) + 1000;
      const tagId = `HH-TEMP-${tagNum}`;
      
      const updatedData = {
        status: 'Active' as const,
        tag: tagId,
        time: `Arrived ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        location: 'Site Office & Welcome Center',
        duration: '0m',
        path: ['Gate 1 Gatehouse', 'Site Office'],
        arrivalTime: Date.now(),
        isOverstayed: false,
        idVerificationStatus: 'VERIFIED' as const
      };

      await updateDoc(doc(db, 'visitors', visitorId), updatedData);
      setNotificationMsg({ type: 'success', text: `Temporary RFID Badge ${tagId} issued to ${visitorId}. Visitor marked ACTIVE.` });
      setSelectedVisitor(null);
    } catch (err) {
      console.error('Error issuing RFID tag:', err);
    }
  };

  // Check-Out Visitor
  const handleCheckoutVisitor = async (visitorId: string) => {
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        status: 'Completed',
        tag: 'Returned / Deactivated',
        location: 'Checked Out',
        duration: 'Visit Finished'
      });
      setNotificationMsg({ type: 'info', text: `Visitor ${visitorId} checked out. RFID Tag reclaimed.` });
      setSelectedVisitor(null);
    } catch (err) {
      console.error('Error checking out visitor:', err);
    }
  };

  // Toggle ID Verification Status
  const handleToggleIdVerify = async (visitorId: string, status: 'VERIFIED' | 'PENDING' | 'FAILED') => {
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        idVerificationStatus: status
      });
      setNotificationMsg({ type: 'success', text: `ID Verification status set to ${status} for ${visitorId}.` });
    } catch (err) {
      console.error('Error updating ID status:', err);
    }
  };

  // Send Email Invitation
  const handleSendEmailInvitation = (visitor: VisitorRecord) => {
    setInvitationVisitor(visitor);
  };

  const handleConfirmSendEmail = async () => {
    if (!invitationVisitor) return;
    setNotificationMsg({ 
      type: 'success', 
      text: `Email invitation & QR Pass dispatched to ${invitationVisitor.email} (${invitationVisitor.name})!` 
    });
    setInvitationVisitor(null);
  };

  // Add Security List Entry (Blacklist / Whitelist)
  const handleAddSecurityEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecurityEntry.name || !newSecurityEntry.reason) return;

    const id = `${newSecurityEntry.type === 'BLACKLIST' ? 'BLK' : 'WHT'}-${Math.floor(Math.random() * 800) + 100}`;
    const entry: SecurityListItem = {
      id,
      name: newSecurityEntry.name,
      company: newSecurityEntry.company || 'General Contractor',
      type: newSecurityEntry.type,
      reason: newSecurityEntry.reason,
      addedBy: 'Marcus Vance (EHS Director)',
      addedDate: new Date().toISOString().split('T')[0],
      riskLevel: newSecurityEntry.type === 'BLACKLIST' ? newSecurityEntry.riskLevel : 'LOW'
    };

    try {
      await setDoc(doc(db, 'visitor_security_list', id), entry);
      setNotificationMsg({ 
        type: newSecurityEntry.type === 'BLACKLIST' ? 'error' : 'success', 
        text: `Added ${newSecurityEntry.name} to ${newSecurityEntry.type} directory!` 
      });
      setIsAddSecurityModalOpen(false);
      setNewSecurityEntry({
        name: '',
        company: '',
        type: 'BLACKLIST',
        reason: '',
        riskLevel: 'HIGH'
      });
    } catch (err) {
      console.error('Error adding security entry:', err);
    }
  };

  const handleDeleteSecurityEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'visitor_security_list', id));
      setNotificationMsg({ type: 'info', text: `Removed entry ${id} from security list.` });
    } catch (err) {
      console.error('Error deleting security entry:', err);
    }
  };

  // Export CSV & PDF
  const handleExportCSV = () => {
    const columns = [
      { key: 'id', label: 'VISITOR ID' },
      { key: 'name', label: 'VISITOR NAME' },
      { key: 'company', label: 'ORGANIZATION' },
      { key: 'host', label: 'HOST OFFICER' },
      { key: 'status', label: 'ACCESS STATUS' },
      { key: 'time', label: 'SCHEDULE / ARRIVAL' },
      { key: 'tag', label: 'RFID TAG ID' },
      { key: 'location', label: 'SECTOR LOCATION' },
      { key: 'vehiclePlate', label: 'VEHICLE LICENSE PLATE' },
      { key: 'idVerificationStatus', label: 'ID VERIFIED' }
    ];
    exportToCSV('Enterprise_Visitor_Lifecycle_Report', visitors, columns);
  };

  const handleExportPDF = () => {
    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Visitor Name' },
      { key: 'company', label: 'Organization' },
      { key: 'host', label: 'Host' },
      { key: 'status', label: 'Status' },
      { key: 'tag', label: 'RFID Tag' },
      { key: 'vehiclePlate', label: 'Vehicle' }
    ];
    const metrics = [
      { label: 'Total Registered', value: stats.total },
      { label: 'Active On-Site', value: stats.active },
      { label: 'Pending Approvals', value: stats.pendingApproval },
      { label: 'ID Compliance Rate', value: `${stats.idVerifiedRate}%` },
      { label: 'Blacklist Flags', value: stats.blacklisted }
    ];
    generatePDFReport(
      'Aperture Enterprise Visitor Security & Access Report',
      'Official Security Gatehouse & Visitor Compliance Log',
      columns,
      visitors,
      metrics
    );
  };



  return (
    <div className="w-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header & Main Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-7 h-7 text-[#007BC4]" />
              Enterprise Visitor Management
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Gatehouse Sync Active
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-0.5">
            Pre-registration, QR invitations, host approvals, RFID badge issuing & real-time site tracking
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => setActiveTab('checkin')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
          >
            <UserCheck size={15} /> Gate Check-in Desk
          </button>

          <button 
            onClick={() => setActiveTab('qr_generator')}
            className="px-3.5 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
          >
            <QrCode size={15} /> QR Tokens & Scanner
          </button>

          <button 
            onClick={() => setIsPreRegisterModalOpen(true)}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <UserPlus size={15} /> Pre-Register
          </button>

          <button 
            onClick={() => { setSecurityListType('BLACKLIST'); setIsAddSecurityModalOpen(true); }}
            className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <ShieldAlert size={15} /> Blacklist
          </button>

          <button 
            onClick={handleExportCSV}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-xl transition"
            title="Export CSV Roster"
          >
            <Download size={15} />
          </button>

          <button 
            onClick={handleExportPDF}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-xl transition"
            title="Export Official PDF Report"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notificationMsg && (
        <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in border ${
          notificationMsg.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
          notificationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
          'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {notificationMsg.type === 'error' ? <ShieldAlert size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
            {notificationMsg.text}
          </div>
          <button onClick={() => setNotificationMsg(null)} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Registered</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active On-Site</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-2xl font-black text-emerald-600">{stats.active}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Host Pending</span>
          <span className="text-2xl font-black text-amber-600">{stats.pendingApproval}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ID Verified</span>
          <span className="text-2xl font-black text-[#007BC4]">{stats.idVerifiedRate}%</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overstayed Alerts</span>
          <span className="text-2xl font-black text-rose-600">{stats.overstayed}</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Blacklisted Flags</span>
          <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{stats.blacklisted}</span>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'roster', label: 'Visitor Directory Roster', icon: ClipboardCheck },
            { id: 'checkin', label: 'Visitor Check-in Desk', icon: UserCheck },
            { id: 'qr_generator', label: 'QR Tokens & Scanner', icon: QrCode },
            { id: 'approval', label: `Host Approval Queue (${stats.pendingApproval})`, icon: Clock },
            { id: 'vehicles', label: 'Vehicle & Parking Assignment', icon: Truck },
            { id: 'security_list', label: 'Blacklist & Whitelist Directory', icon: ShieldAlert },
            { id: 'analytics', label: 'Visitor Analytics & Peak Hours', icon: BarChart2 }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
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

        {/* Global Filter & Search for Roster */}
        {activeTab === 'roster' && (
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="relative flex-1 sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-3.5" />
              <input 
                type="text" 
                placeholder="Search visitor, host, plate..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 px-3 py-1.5 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active On-Site</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Pre-Registered">Pre-Registered</option>
              <option value="Approved">Approved</option>
              <option value="Completed">Completed</option>
              <option value="Overstayed">Overstayed</option>
              <option value="Denied">Denied</option>
            </select>
          </div>
        )}
      </div>

      {/* MAIN TAB CONTENT */}

      {/* CHECK-IN FORM TAB */}
      {activeTab === 'checkin' && (
        <VisitorCheckInForm 
          securityListProps={securityList}
          onCheckInComplete={() => {
            setActiveTab('roster');
            setNotificationMsg({ type: 'success', text: 'Visitor check-in complete! Roster updated.' });
          }}
        />
      )}

      {/* QR GENERATOR & SCANNER TAB */}
      {activeTab === 'qr_generator' && (
        <VisitorQrGenerator 
          visitorsList={visitors}
          securityListProps={securityList}
        />
      )}

      {/* 1. VISITOR ROSTER TAB */}
      {activeTab === 'roster' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <TableRow>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300">Visitor Details</TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300">Host Officer</TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300">Schedule / Arrival</TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300">RFID Badge ID</TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300">ID Verification</TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-center">Status</TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVisitors.map(v => (
                <TableRow key={v.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition">
                  <TableCell>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {v.name}
                      <span className="text-[10px] font-mono text-[#007BC4]">({v.id})</span>
                    </div>
                    <div className="text-xs text-slate-500 font-medium">{v.company} • <span className="italic">{v.purpose || 'Site Visit'}</span></div>
                  </TableCell>

                  <TableCell className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {v.host}
                  </TableCell>

                  <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      {v.time}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                      {v.tag}
                    </span>
                  </TableCell>

                  <TableCell>
                    {v.idVerificationStatus === 'VERIFIED' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                        <ShieldCheck size={11} /> ID Verified
                      </span>
                    ) : v.idVerificationStatus === 'FAILED' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 w-fit">
                        <XCircle size={11} /> ID Failed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit">
                        <Clock size={11} /> Pending ID
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {v.status === 'Active' && !v.isOverstayed && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse">Active On-Site</Badge>
                    )}
                    {v.status === 'Active' && v.isOverstayed && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Overstayed</Badge>
                    )}
                    {v.status === 'Pending Approval' && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending Approval</Badge>
                    )}
                    {v.status === 'Pre-Registered' && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Pre-Registered</Badge>
                    )}
                    {v.status === 'Approved' && (
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Approved Pass</Badge>
                    )}
                    {v.status === 'Completed' && (
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">Completed</Badge>
                    )}
                    {v.status === 'Denied' && (
                      <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-300">Denied</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleSendEmailInvitation(v)}
                        className="p-1.5 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Send Email & QR Pass"
                      >
                        <Mail size={14} />
                      </button>
                      <button
                        onClick={() => setBadgeVisitor(v)}
                        className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Print Visitor RFID Badge"
                      >
                        <Printer size={14} />
                      </button>
                      <button
                        onClick={() => setSelectedVisitor(v)}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg hover:bg-slate-200 transition"
                      >
                        Details & Timeline
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {filteredVisitors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500 font-medium">
                    No matching visitor records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 2. HOST APPROVAL QUEUE TAB */}
      {activeTab === 'approval' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-700/50 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-amber-600" />
              <div>
                <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm">Host Authorization Queue</h4>
                <p className="text-xs text-amber-700 dark:text-amber-300">Visitors must receive host approval before temporary RFID credentials can be issued at Gate 1.</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-200 text-amber-900 font-black text-xs rounded-full">
              {stats.pendingApproval} Pending Requests
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visitors.filter(v => v.status === 'Pending Approval').map(v => (
              <div key={v.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{v.name}</h3>
                    <div className="text-xs font-semibold text-slate-500">{v.company}</div>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {v.id}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl">
                  <div><strong>Host:</strong> {v.host}</div>
                  <div><strong>Purpose:</strong> {v.purpose || 'Site Visit'}</div>
                  <div><strong>Scheduled Arrival:</strong> {v.time}</div>
                  <div><strong>Vehicle License:</strong> {v.vehiclePlate || 'N/A'}</div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleHostApprove(v.id)}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 size={14} /> Approve Visit
                  </button>
                  <button
                    onClick={() => handleHostDeny(v.id)}
                    className="flex-1 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <XCircle size={14} /> Deny Entry
                  </button>
                </div>
              </div>
            ))}

            {visitors.filter(v => v.status === 'Pending Approval').length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 font-medium bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                No pending host authorization requests! All visitors reviewed.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. VEHICLE & PARKING ASSIGNMENT TAB */}
      {activeTab === 'vehicles' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Truck size={18} className="text-[#007BC4]" />
                Gatehouse Vehicle & Delivery Dock Directory
              </h3>
              <p className="text-xs text-slate-500 font-medium">Manage visitor parking bay clearance, delivery trucks, and heavy transport gate clearance.</p>
            </div>
          </div>

          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="font-bold">License Plate</TableHead>
                <TableHead className="font-bold">Vehicle Type</TableHead>
                <TableHead className="font-bold">Driver / Visitor</TableHead>
                <TableHead className="font-bold">Assigned Parking Bay</TableHead>
                <TableHead className="font-bold">Gate Clearance Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visitors.filter(v => v.vehiclePlate && v.vehiclePlate !== 'N/A').map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono font-black text-[#007BC4]">{v.vehiclePlate}</TableCell>
                  <TableCell className="text-xs font-bold text-slate-700 dark:text-slate-300">{v.vehicleType || 'Sedan'}</TableCell>
                  <TableCell className="text-xs font-semibold">{v.name} ({v.company})</TableCell>
                  <TableCell className="font-bold text-xs text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-lg border border-emerald-200">
                    {v.parkingBay || 'Bay P-01'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={v.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                      {v.status === 'Active' ? 'Gate Cleared & Parked' : v.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 4. BLACKLIST & WHITELIST DIRECTORY */}
      {activeTab === 'security_list' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert size={20} className="text-rose-600" />
                Access Security List Management
              </h3>
              <p className="text-xs text-slate-500 font-medium">Manage blacklisted personnel and whitelisted fast-track VIP inspectors.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setSecurityListType('BLACKLIST'); setIsAddSecurityModalOpen(true); }}
                className="px-3.5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-rose-700 transition"
              >
                + Add to Blacklist
              </button>
              <button
                onClick={() => { setSecurityListType('WHITELIST'); setIsAddSecurityModalOpen(true); }}
                className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-700 transition"
              >
                + Add to Whitelist
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Blacklist Box */}
            <div className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                <span className="font-bold text-rose-800 dark:text-rose-300 text-sm flex items-center gap-2">
                  <ShieldAlert size={16} /> Active Security Blacklist ({securityList.filter(s => s.type === 'BLACKLIST').length})
                </span>
              </div>
              <div className="space-y-2">
                {securityList.filter(s => s.type === 'BLACKLIST').map(s => (
                  <div key={s.id} className="p-3 bg-rose-50/60 dark:bg-slate-900 border border-rose-100 dark:border-slate-700 rounded-xl flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{s.name} ({s.company})</div>
                      <div className="text-[11px] text-rose-700 dark:text-rose-300 font-medium mt-0.5">{s.reason}</div>
                      <div className="text-[9px] text-slate-400 mt-1">Added: {s.addedDate} by {s.addedBy}</div>
                    </div>
                    <button onClick={() => handleDeleteSecurityEntry(s.id)} className="text-slate-400 hover:text-rose-600 p-1">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Whitelist Box */}
            <div className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2">
                  <ShieldCheck size={16} /> Fast-Track Whitelist ({securityList.filter(s => s.type === 'WHITELIST').length})
                </span>
              </div>
              <div className="space-y-2">
                {securityList.filter(s => s.type === 'WHITELIST').map(s => (
                  <div key={s.id} className="p-3 bg-emerald-50/60 dark:bg-slate-900 border border-emerald-100 dark:border-slate-700 rounded-xl flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{s.name} ({s.company})</div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium mt-0.5">{s.reason}</div>
                      <div className="text-[9px] text-slate-400 mt-1">Added: {s.addedDate}</div>
                    </div>
                    <button onClick={() => handleDeleteSecurityEntry(s.id)} className="text-slate-400 hover:text-rose-600 p-1">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. VISITOR ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Peak Visitor Arrival Hours</h4>
            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span>08:00 AM - 10:00 AM (Morning Peak)</span>
                  <span className="font-bold text-[#007BC4]">58%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="bg-[#007BC4] h-full" style={{ width: '58%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span>10:00 AM - 01:00 PM (Midday Audits)</span>
                  <span className="font-bold text-[#007BC4]">28%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="bg-[#007BC4] h-full" style={{ width: '28%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span>01:00 PM - 05:00 PM (Afternoon Deliveries)</span>
                  <span className="font-bold text-[#007BC4]">14%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="bg-[#007BC4] h-full" style={{ width: '14%' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Top Visitor Organizations</h4>
            <div className="space-y-2 text-xs">
              {['City Structural Audit Dept', 'Apex Scaffold Solutions', 'VoltCraft Electrical', 'Geotechnical Soil Testing'].map((org, i) => (
                <div key={org} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{org}</span>
                  <span className="font-bold text-[#007BC4]">{12 - i * 2} Visits</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: PRE-REGISTER VISITOR */}
      {isPreRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsPreRegisterModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-[#007BC4]" /> Pre-Register Visitor Pass
            </h3>

            <form onSubmit={handlePreRegisterSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Visitor Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Sarah Lin"
                    value={newVisitor.name}
                    onChange={e => setNewVisitor({...newVisitor, name: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Company / Organization</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Geotechnical Soil Testing"
                    value={newVisitor.company}
                    onChange={e => setNewVisitor({...newVisitor, company: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Visitor Email</label>
                  <input
                    type="email"
                    required
                    placeholder="slin@geotech.io"
                    value={newVisitor.email}
                    onChange={e => setNewVisitor({...newVisitor, email: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 678-9012"
                    value={newVisitor.phone}
                    onChange={e => setNewVisitor({...newVisitor, phone: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Host Officer Email</label>
                  <input
                    type="text"
                    required
                    value={newVisitor.host}
                    onChange={e => setNewVisitor({...newVisitor, host: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Visit Purpose</label>
                  <input
                    type="text"
                    value={newVisitor.purpose}
                    onChange={e => setNewVisitor({...newVisitor, purpose: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Vehicle License</label>
                  <input
                    type="text"
                    placeholder="GEO-102"
                    value={newVisitor.vehiclePlate}
                    onChange={e => setNewVisitor({...newVisitor, vehiclePlate: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Parking Bay</label>
                  <input
                    type="text"
                    value={newVisitor.parkingBay}
                    onChange={e => setNewVisitor({...newVisitor, parkingBay: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">ID Document Type</label>
                  <select
                    value={newVisitor.idDocType}
                    onChange={e => setNewVisitor({...newVisitor, idDocType: e.target.value})}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  >
                    <option value="Driver License">Driver License</option>
                    <option value="Passport">Passport</option>
                    <option value="Government ID">Government ID</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreRegisterModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#007BC4] text-white rounded-xl font-bold shadow-md"
                >
                  Submit Pre-Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DETAIL & VISIT TIMELINE MODAL */}
      {selectedVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#007BC4] text-white flex items-center justify-center font-bold text-xl uppercase shadow-md">
                  {(selectedVisitor.name || 'U').charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedVisitor.name}</h3>
                  <div className="text-xs text-slate-500 font-medium">{selectedVisitor.company} • <span className="font-mono text-[#007BC4]">{selectedVisitor.id}</span></div>
                </div>
              </div>
              <button onClick={() => setSelectedVisitor(null)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <div><strong>Host Officer:</strong> {selectedVisitor.host}</div>
                <div><strong>Visit Purpose:</strong> {selectedVisitor.purpose || 'Site Inspection'}</div>
                <div><strong>RFID Tag:</strong> <span className="font-mono text-[#007BC4] font-bold">{selectedVisitor.tag}</span></div>
                <div><strong>Vehicle License:</strong> {selectedVisitor.vehiclePlate || 'N/A'} ({selectedVisitor.parkingBay || 'No Bay'})</div>
              </div>

              {/* ID Verification Actions */}
              <div className="p-3 bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold block">Gatehouse ID Verification</span>
                  <span className="text-slate-500">{selectedVisitor.idDocType || 'Govt ID'}: {selectedVisitor.idDocNumber || 'DOC-8892'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleIdVerify(selectedVisitor.id, 'VERIFIED')}
                    className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[10px]"
                  >
                    Mark Verified
                  </button>
                  <button
                    onClick={() => handleToggleIdVerify(selectedVisitor.id, 'FAILED')}
                    className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg text-[10px]"
                  >
                    Mark Failed
                  </button>
                </div>
              </div>

              {/* Visual Visit Timeline */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">Visit Spatial Journey Timeline</h4>
                <div className="border-l-2 border-[#007BC4] pl-4 space-y-3">
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#007BC4]" />
                    <span className="font-bold block text-slate-800 dark:text-slate-200">1. Pre-Registration & QR Pass Issued</span>
                    <span className="text-slate-500">Scheduled: {selectedVisitor.time}</span>
                  </div>

                  {selectedVisitor.status !== 'Pending Approval' && selectedVisitor.status !== 'Denied' && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="font-bold block text-slate-800 dark:text-slate-200">2. Host Authorization Granted</span>
                      <span className="text-slate-500">Host: {selectedVisitor.host}</span>
                    </div>
                  )}

                  {selectedVisitor.status === 'Active' && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold block text-emerald-600">3. RFID Badge Issued & Currently Active</span>
                      <span className="text-slate-500">Current Zone: {selectedVisitor.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-700">
                {(selectedVisitor.status === 'Approved' || selectedVisitor.status === 'Pre-Registered') && (
                  <button
                    onClick={() => handleAssignRFIDTag(selectedVisitor.id)}
                    className="px-4 py-2 bg-[#007BC4] text-white rounded-xl font-bold text-xs"
                  >
                    Issue RFID Tag & Complete Check-In
                  </button>
                )}

                {selectedVisitor.status === 'Active' && (
                  <button
                    onClick={() => handleCheckoutVisitor(selectedVisitor.id)}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs"
                  >
                    Force Check-Out & Reclaim Tag
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PRINT BADGE MODAL */}
      {badgeVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-center relative border-2 border-slate-800">
            <button onClick={() => setBadgeVisitor(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>

            <div className="bg-[#007BC4] text-white py-2 rounded-xl font-black text-xs uppercase tracking-widest">
              Aperture Official Visitor Pass
            </div>

            <div className="w-20 h-20 rounded-2xl bg-slate-200 text-slate-700 mx-auto flex items-center justify-center font-black text-3xl shadow-inner border border-slate-300">
              {(badgeVisitor.name || 'U').charAt(0)}
            </div>

            <div>
              <h3 className="font-black text-lg text-slate-900">{badgeVisitor.name}</h3>
              <p className="text-xs font-bold text-slate-500">{badgeVisitor.company}</p>
            </div>

            <div className="bg-slate-100 p-3 rounded-xl space-y-1 text-xs font-mono">
              <div><strong>TAG ID:</strong> {badgeVisitor.tag || 'TEMP-RFID-881'}</div>
              <div><strong>HOST:</strong> {badgeVisitor.host}</div>
              <div><strong>DATE:</strong> {badgeVisitor.time}</div>
            </div>

            <div className="flex justify-center p-2 bg-white border border-slate-200 rounded-xl">
              <QRCode value={badgeVisitor.qrCodeRef || badgeVisitor.id} size={110} />
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 bg-[#007BC4] text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-2"
            >
              <Printer size={15} /> Print Physical Pass
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: EMAIL INVITATION PREVIEW */}
      {invitationVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 relative border border-slate-200 dark:border-slate-700">
            <button onClick={() => setInvitationVisitor(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>

            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Mail size={18} className="text-[#007BC4]" /> Email Visitor QR Pass Invitation
            </h3>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2 text-xs text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
              <div><strong>To:</strong> {invitationVisitor.email} ({invitationVisitor.name})</div>
              <div><strong>Subject:</strong> Aperture Construction Gatehouse Access Pass - {invitationVisitor.id}</div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 italic">
                "Dear {invitationVisitor.name}, your visit with host {invitationVisitor.host} has been scheduled. Please present the attached QR pass upon arrival at Gate 1."
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setInvitationVisitor(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button onClick={handleConfirmSendEmail} className="px-4 py-2 bg-[#007BC4] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md">
                <Send size={14} /> Send Email Invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD SECURITY ENTRY (BLACKLIST / WHITELIST) */}
      {isAddSecurityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 relative border border-slate-200 dark:border-slate-700">
            <button onClick={() => setIsAddSecurityModalOpen(false)} className="absolute top-3 right-3 text-slate-400">
              <X size={18} />
            </button>

            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Add to {securityListType === 'BLACKLIST' ? 'Security Blacklist' : 'Fast-Track Whitelist'}
            </h3>

            <form onSubmit={handleAddSecurityEntry} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Full Person Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Victor Vance"
                  value={newSecurityEntry.name}
                  onChange={e => setNewSecurityEntry({...newSecurityEntry, name: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Company / Organization</label>
                <input
                  type="text"
                  placeholder="e.g. Unaffiliated Vendor"
                  value={newSecurityEntry.company}
                  onChange={e => setNewSecurityEntry({...newSecurityEntry, company: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">List Designation Type</label>
                <select
                  value={newSecurityEntry.type}
                  onChange={e => setNewSecurityEntry({...newSecurityEntry, type: e.target.value as any})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                >
                  <option value="BLACKLIST">BLACKLIST (Block Access & Alert Security)</option>
                  <option value="WHITELIST">WHITELIST (Pre-Approved VIP Clearance)</option>
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">Reason / Clearance Justification</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the incident or authorization reason..."
                  value={newSecurityEntry.reason}
                  onChange={e => setNewSecurityEntry({...newSecurityEntry, reason: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSecurityModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-white font-bold rounded-xl ${newSecurityEntry.type === 'BLACKLIST' ? 'bg-rose-600' : 'bg-emerald-600'}`}
                >
                  Save Security Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
