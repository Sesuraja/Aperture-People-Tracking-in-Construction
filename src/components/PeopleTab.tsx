import React, { useState, useEffect, useMemo } from 'react';
import { Person } from '../lib/trackingData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { 
  Search, Plus, X, MapPin, Battery, BatteryWarning, 
  Users, ShieldCheck, Download, Printer, 
  FileText, UserCheck, ShieldAlert, Phone, Mail, Heart,
  Edit, Trash2, QrCode, Sparkles, Filter, CheckCircle2,
  AlertTriangle, Layers, Activity, Building2, Clock,
  Loader2, RefreshCw, SlidersHorizontal, BadgeCheck, Save,
  PlusCircle, Database, CheckSquare, Square, Bell, Send, Check,
  FileSpreadsheet, LayoutList, LayoutGrid, Camera,
  Smartphone, Copy, ExternalLink, Share2, Award, SmartphoneNfc, Info
} from 'lucide-react';
import WorkerQrScannerModal from './WorkerQrScannerModal';
import LiveFloorMap from './LiveFloorMap';
import { 
  collection, doc, setDoc, deleteDoc, query, 
  onSnapshot, serverTimestamp, addDoc, db 
} from '../lib/db';
import { useTracking, useTerminology } from '../context/TrackingContext';
import { exportToCSV, generatePDFReport } from '../lib/exportUtils';

interface PeopleTabProps {

  people: Person[];
}


interface DBWorker {
  id: string;
  hardhatTagId: string;
  name: string;
  role: string;
  company?: string;
  tradeCompany?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  certifications?: string;
  ppeStatus?: 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  shiftStatus?: 'ON_SITE' | 'OFF_SITE' | 'ON_LEAVE' | 'SUSPENDED';
  trainingStatus?: 'COMPLIANT' | 'DUE_SOON' | 'OVERDUE' | 'PENDING';
  lastTrainingDate?: string;
  trainingCourse?: string;
  trainingExpiry?: string;
  department?: string;
  supervisor?: string;
  safetyScore?: number;
  currentZone?: string;
  notes?: string;
  createdAt?: any;
}

interface TagHistoryEntry {
  id: string;
  TagID: string;
  name?: string;
  fromZone?: string | null;
  toZone?: string;
  timestamp?: any;
}

function QrCodeSvg({ text, size = 120 }: { text: string; size?: number }) {
  const grid = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    const matrix: boolean[][] = Array(21).fill(false).map(() => Array(21).fill(false));
    
    const addFinder = (row: number, col: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            matrix[row + r][col + c] = true;
          }
        }
      }
    };
    addFinder(0, 0);
    addFinder(0, 14);
    addFinder(14, 0);

    for (let i = 8; i < 13; i++) {
      matrix[6][i] = i % 2 === 0;
      matrix[i][6] = i % 2 === 0;
    }

    let seed = Math.abs(hash);
    for (let r = 0; r < 21; r++) {
      for (let c = 0; c < 21; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8)) continue;
        if (r === 6 || c === 6) continue;
        seed = (seed * 9301 + 49297) % 233280;
        matrix[r][c] = (seed / 233280) > 0.45;
      }
    }
    return matrix;
  }, [text]);

  return (
    <svg width={size} height={size} viewBox="0 0 21 21" className="bg-white p-2 rounded-xl shadow-inner border border-slate-200">
      {grid.map((row, r) =>
        row.map((cell, c) => (
          cell ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#007BC4" /> : null
        ))
      )}
    </svg>
  );
}

export function getSafetyStatusBadge(status?: string) {
  const s = (status || 'COMPLIANT').toUpperCase();
  if (s === 'COMPLIANT' || s === 'UP_TO_DATE' || s === 'VALID' || s === 'PASSED') {
    return {
      status: 'COMPLIANT',
      label: '✓ Safety Compliant',
      shortLabel: 'COMPLIANT',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700',
      selectClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300',
      icon: ShieldCheck
    };
  }
  if (s === 'DUE_SOON' || s === 'WARNING' || s === 'EXPIRING' || s === 'REFRESH_REQUIRED') {
    return {
      status: 'DUE_SOON',
      label: '⚠️ Refresher Due',
      shortLabel: 'DUE SOON',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700',
      selectClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300',
      icon: Clock
    };
  }
  if (s === 'OVERDUE' || s === 'EXPIRED' || s === 'NON_COMPLIANT' || s === 'FAILED') {
    return {
      status: 'OVERDUE',
      label: '⛔ Training Overdue',
      shortLabel: 'OVERDUE',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700',
      selectClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300',
      icon: ShieldAlert
    };
  }
  return {
    status: 'PENDING',
    label: '🔄 Training Pending',
    shortLabel: 'PENDING',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-700',
    selectClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300',
    icon: RefreshCw
  };
}

export function parseCertifications(certs: any): string[] {
  if (!certs) {
    return ['OSHA 30', 'Scaffolding L3'];
  }
  if (Array.isArray(certs)) {
    return certs.map(c => String(c).trim()).filter(Boolean);
  }
  if (typeof certs === 'string') {
    return certs.split(',').map(c => c.trim()).filter(Boolean);
  }
  try {
    return [String(certs).trim()];
  } catch {
    return [];
  }
}

export default function PeopleTab({ people = [] }: PeopleTabProps) {
  const { zones, zonesDict } = useTracking();
  const { 
    personnelSingular, 
    personnelPlural, 
    roleLabel, 
    idBadgeLabel, 
    safetyComplianceLabel, 
    zoneLabel, 
    siteLabel, 
    organizationType,
    roles,
    saveRoles,
    subcontractors,
    saveSubcontractors,
    config
  } = useTerminology();

  // Custom inline add states
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [isCustomCompany, setIsCustomCompany] = useState(false);
  const [customCompanyInput, setCustomCompanyInput] = useState('');

  // Navigation & View Mode State
  const [viewMode, setViewMode] = useState<'map' | 'roster' | 'contractors' | 'certifications'>('map');
  const [mapMode, setMapMode] = useState<'standard' | 'bim' | 'heatmap' | 'evacuation' | 'security'>('standard');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [ppeFilter, setPpeFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [trainingFilter, setTrainingFilter] = useState('All');

  // Contractor Mobile Check-In QR Modal State
  const [isContractorQrModalOpen, setIsContractorQrModalOpen] = useState(false);
  const [selectedContractorCompany, setSelectedContractorCompany] = useState<string>('Apex Structural');
  const [mobileCheckInTab, setMobileCheckInTab] = useState<'qr' | 'simulate'>('qr');
  const [simCheckInForm, setSimCheckInForm] = useState({
    workerName: 'Marcus Vance',
    hardhatTagId: 'HH-1092',
    tradeCompany: 'Apex Structural',
    gateLocation: 'Gate 1 Main Access Turnstile',
    shiftStatus: 'ON_SITE',
    ppeStatus: 'COMPLIANT'
  });

  // Selected Person Drawer
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [profileTab, setProfileTab] = useState<'profile' | 'badge' | 'movement' | 'safety' | 'ai'>('profile');

  // Toast Notification State
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // MongoDB Atlas Connection Status
  const [mongoStatus, setMongoStatus] = useState<{ connected: boolean; engine: string; database: string; totalRecords: number }>({
    connected: true,
    engine: 'MongoDB Atlas',
    database: 'Lat-Aperture-People-Tracking',
    totalRecords: 0
  });

  useEffect(() => {
    const checkMongo = async () => {
      try {
        const res = await fetch('/api/mongodb/status');
        if (res.ok) {
          const data = await res.json();
          setMongoStatus({
            connected: Boolean(data.connected),
            engine: data.engine || 'MongoDB Atlas',
            database: 'Lat-Aperture-People-Tracking',
            totalRecords: data.totalRecords || 0
          });
        }
      } catch {}
    };
    checkMongo();
    const intv = setInterval(checkMongo, 5000);
    return () => clearInterval(intv);
  }, []);

  // Database Workers state (from MongoDB)
  const [dbWorkers, setDbWorkers] = useState<DBWorker[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  // Worker Movement History state
  const [workerHistory, setWorkerHistory] = useState<TagHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Add / Edit Modal States
  const [isAddingModalOpen, setIsAddingModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [formData, setFormData] = useState<DBWorker>({
    id: '',
    hardhatTagId: '',
    name: '',
    role: 'General Subcontractor',
    tradeCompany: 'Apex Structural',
    phone: '+1 (555) 019-2831',
    email: '',
    emergencyContact: 'Jane Doe (+1 555-992-1100)',
    certifications: 'OSHA 30, Scaffolding Safety',
    ppeStatus: 'COMPLIANT',
    shiftStatus: 'ON_SITE',
    trainingStatus: 'COMPLIANT',
    lastTrainingDate: '2026-05-15',
    trainingCourse: 'OSHA 30 Construction Safety & Site Clearance',
    department: 'Structural Engineering',
    supervisor: 'Marcus Vance (EHS Director)',
    notes: 'Verified site safety compliance.'
  });

  // AI Summary State
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Bulk Selection, Layout & QR Scanner State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [layoutType, setLayoutType] = useState<'table' | 'cards'>('table');
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [notifyCustomText, setNotifyCustomText] = useState('');
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  // Handle worker found via Camera QR Scan
  const handleWorkerFoundByQr = (person: Person, scannedCode: string) => {
    setSelectedPerson(person);
    setProfileTab('profile');
    setAiSummary(null);
    setIsQrScannerOpen(false);
    showToast('success', `Identified worker ${person.name} (${person.hardhatTagId || person.id}) via Camera QR Scan!`);
  };

  // Toast trigger
  const showToast = (type: 'success' | 'info' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Bulk selection helpers
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredPeople.length && filteredPeople.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPeople.map(p => (p.hardhatTagId || p.id).toUpperCase()));
    }
  };

  const toggleSelectRow = (tagId: string) => {
    const key = (tagId || "").toUpperCase();
    setSelectedIds(prev => 
      prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]
    );
  };

  const handleBulkShiftChange = async (newShift: 'ON_SITE' | 'OFF_SITE' | 'ON_LEAVE' | 'SUSPENDED') => {
    if (selectedIds.length === 0) return;
    try {
      const selectedUpper = new Set(selectedIds.map(s => s.toUpperCase()));
      const promises = selectedIds.map(tagId => 
        setDoc(doc(db, 'registered_people', tagId), {
          shiftStatus: newShift,
          updatedAt: serverTimestamp()
        }, { merge: true })
      );
      await Promise.all(promises);

      // Optimistically update dbWorkers state
      setDbWorkers(prev => prev.map(w => {
        if (selectedUpper.has((w.id || '').toUpperCase()) || selectedUpper.has((w.hardhatTagId || '').toUpperCase())) {
          return { ...w, shiftStatus: newShift };
        }
        return w;
      }));

      await addDoc(collection(db, 'alerts'), {
        type: 'info',
        message: `Bulk Shift Update: Set to ${newShift} for ${selectedIds.length} personnel`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `Bulk updated ${selectedIds.length} workers to shift state '${newShift}' in MongoDB.`);
    } catch (err) {
      console.error('Failed bulk shift update:', err);
      showToast('error', 'Failed to update selected workers in MongoDB.');
    }
  };

  const handleBulkPpeChange = async (newPpe: 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT') => {
    if (selectedIds.length === 0) return;
    try {
      const selectedUpper = new Set(selectedIds.map(s => s.toUpperCase()));
      const promises = selectedIds.map(tagId =>
        setDoc(doc(db, 'registered_people', tagId), {
          ppeStatus: newPpe,
          updatedAt: serverTimestamp()
        }, { merge: true })
      );
      await Promise.all(promises);

      // Optimistically update dbWorkers state
      setDbWorkers(prev => prev.map(w => {
        if (selectedUpper.has((w.id || '').toUpperCase()) || selectedUpper.has((w.hardhatTagId || '').toUpperCase())) {
          return { ...w, ppeStatus: newPpe };
        }
        return w;
      }));

      await addDoc(collection(db, 'alerts'), {
        type: newPpe === 'NON_COMPLIANT' ? 'security' : 'info',
        message: `Bulk PPE Status Update: Set to ${newPpe} for ${selectedIds.length} personnel`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `Bulk updated PPE compliance to '${newPpe}' for ${selectedIds.length} workers in MongoDB.`);
    } catch (err) {
      console.error('Failed bulk PPE update:', err);
      showToast('error', 'Failed to update selected workers in MongoDB.');
    }
  };

  const handleSendBulkNotification = async (presetText?: string) => {
    const message = presetText || notifyCustomText.trim();
    if (selectedIds.length === 0 || !message) {
      showToast('error', 'Please enter a notification message.');
      return;
    }

    try {
      await addDoc(collection(db, 'alerts'), {
        type: 'warning',
        message: `EHS Broadcast to ${selectedIds.length} Selected Workers: "${message}"`,
        targetWorkers: selectedIds,
        timestamp: new Date()
      });

      showToast('success', `Dispatched notification alert to ${selectedIds.length} selected personnel.`);
      setIsNotifyModalOpen(false);
      setNotifyCustomText('');
    } catch (err) {
      console.error('Failed to dispatch notification:', err);
      showToast('error', 'Failed to dispatch alert notification.');
    }
  };

  const handleBulkExportCSV = () => {
    const selectedPeople = combinedPeople.filter(p => selectedIds.includes((p.hardhatTagId || p.id).toUpperCase()));
    const exportData = selectedPeople.length > 0 ? selectedPeople : filteredPeople;
    const data = exportData.map(p => ({
      TagID: p.hardhatTagId || p.id,
      Name: p.name,
      Role: p.role,
      Company: p.tradeCompany || 'General Contractor',
      Zone: p.currentZone || 'Off-Site',
      PPEStatus: p.ppeStatus || 'COMPLIANT',
      ShiftStatus: p.shiftStatus || 'ON_SITE',
      Phone: p.phone || 'N/A'
    }));
    exportToCSV(`Selected_Personnel_Bulk_Export_${exportData.length}`, data, [
      { key: 'TagID', label: 'HARDHAT TAG' },
      { key: 'Name', label: 'WORKER NAME' },
      { key: 'Role', label: 'ROLE' },
      { key: 'Company', label: 'CONTRACTOR' },
      { key: 'Zone', label: 'CURRENT ZONE' },
      { key: 'PPEStatus', label: 'PPE COMPLIANCE' },
      { key: 'ShiftStatus', label: 'SHIFT STATUS' },
      { key: 'Phone', label: 'CONTACT' }
    ]);
    showToast('success', `Exported ${exportData.length} selected personnel records to CSV.`);
  };

  const handleBulkExportPDF = () => {
    const selectedPeople = combinedPeople.filter(p => selectedIds.includes((p.hardhatTagId || p.id).toUpperCase()));
    const exportData = selectedPeople.length > 0 ? selectedPeople : filteredPeople;
    const data = exportData.map(p => ({
      id: p.hardhatTagId || p.id,
      name: p.name,
      role: p.role,
      company: p.tradeCompany || 'Apex Structural',
      zone: p.currentZone || 'Off-Site',
      ppe: p.ppeStatus || 'COMPLIANT'
    }));
    generatePDFReport(
      'Selected Personnel EHS Compliance Report',
      `Metro Commercial Tower - Bulk Personnel Audit (${exportData.length} Workers)`,
      [
        { key: 'id', label: 'Tag ID' },
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role' },
        { key: 'company', label: 'Contractor' },
        { key: 'zone', label: 'Current Zone' },
        { key: 'ppe', label: 'PPE Status' }
      ],
      data,
      [
        { label: 'Selected Workers', value: exportData.length },
        { label: 'Export Category', value: 'Personnel Roster' },
        { label: 'System Compliance', value: '100% Verified' }
      ]
    );
    showToast('success', `Generated PDF report for ${exportData.length} selected personnel.`);
  };

  // 1. Subscribe to registered_people and people collections in MongoDB
  useEffect(() => {
    setIsDbLoading(true);
    let unsubRegistered: () => void = () => {};
    let unsubPeople: () => void = () => {};

    const rawMap = new Map<string, DBWorker>();

    const updateCombinedDbWorkers = () => {
      setDbWorkers(Array.from(rawMap.values()));
      setIsDbLoading(false);
    };

    try {
      unsubRegistered = onSnapshot(query(collection(db, 'registered_people')), (snapshot) => {
        snapshot.forEach((d) => {
          const data = d.data();
          const role = data.role || 'General Subcontractor';
          if (
            role.toLowerCase().includes('visitor') ||
            (data.name || '').toLowerCase().includes('(visitor)') ||
            (d.id || '').toUpperCase().startsWith('VIS-')
          ) {
            return;
          }
          const tagId = (data.hardhatTagId || d.id || '').toUpperCase();
          rawMap.set(tagId, {
            id: d.id,
            hardhatTagId: data.hardhatTagId || d.id,
            name: data.name || 'Unnamed Worker',
            role: role,
            tradeCompany: data.tradeCompany || data.company || 'Apex Structural',
            phone: data.phone || '+1 (555) 019-2831',
            email: data.email || `${(data.name || '').toLowerCase().replace(/\s+/g, '.')}@buildcorp.com`,
            emergencyContact: data.emergencyContact || 'Site EHS Team (+1 555-992-1100)',
            certifications: data.certifications || 'OSHA 30, Scaffolding Safety',
            ppeStatus: data.ppeStatus || 'COMPLIANT',
            shiftStatus: data.shiftStatus || 'ON_SITE',
            trainingStatus: data.trainingStatus || (
              (data.safetyScore && data.safetyScore < 80) ? 'OVERDUE' :
              (data.safetyScore && data.safetyScore < 90) ? 'DUE_SOON' : 'COMPLIANT'
            ),
            lastTrainingDate: data.lastTrainingDate || '2026-05-15',
            trainingCourse: data.trainingCourse || 'OSHA 30 Construction Safety & Site Clearance',
            trainingExpiry: data.trainingExpiry || '2027-05-15',
            department: data.department || 'Civil Engineering',
            supervisor: data.supervisor || 'Marcus Vance (EHS Director)',
            safetyScore: data.safetyScore || 94,
            notes: data.notes || '',
            createdAt: data.createdAt
          });
        });
        updateCombinedDbWorkers();
      });

      unsubPeople = onSnapshot(query(collection(db, 'people')), (snapshot) => {
        snapshot.forEach((d) => {
          const data = d.data();
          const role = data.role || 'Field Specialist';
          if (
            role.toLowerCase().includes('visitor') ||
            (data.name || '').toLowerCase().includes('(visitor)') ||
            (d.id || '').toUpperCase().startsWith('VIS-')
          ) {
            return;
          }
          const tagId = (data.hardhatTagId || d.id || '').toUpperCase();
          if (!rawMap.has(tagId)) {
            rawMap.set(tagId, {
              id: d.id,
              hardhatTagId: data.hardhatTagId || d.id,
              name: data.name || 'Personnel Member',
              role: role,
              tradeCompany: data.tradeCompany || data.company || 'Apex Structural',
              phone: data.phone || '+1 (555) 019-2831',
              email: data.email || `${(data.name || '').toLowerCase().replace(/\s+/g, '.')}@buildcorp.com`,
              emergencyContact: data.emergencyContact || 'Site EHS Team (+1 555-992-1100)',
              certifications: data.certifications || 'OSHA 30, Working at Heights',
              ppeStatus: data.ppeStatus || 'COMPLIANT',
              shiftStatus: data.shiftStatus || 'ON_SITE',
              trainingStatus: data.trainingStatus || 'COMPLIANT',
              lastTrainingDate: data.lastTrainingDate || '2026-05-15',
              trainingCourse: data.trainingCourse || 'OSHA 30 Construction Safety',
              trainingExpiry: data.trainingExpiry || '2027-05-15',
              department: data.department || 'Operations',
              supervisor: data.supervisor || 'Marcus Vance (EHS Director)',
              safetyScore: data.safetyScore || 95,
              notes: data.notes || '',
              createdAt: data.createdAt
            });
          }
        });
        updateCombinedDbWorkers();
      });
    } catch (err) {
      console.warn("Failed to subscribe to workforce collections in MongoDB:", err);
      setIsDbLoading(false);
    }

    return () => {
      unsubRegistered();
      unsubPeople();
    };
  }, []);

  // 2. Fetch movement history for selected worker from MongoDB tag_history
  useEffect(() => {
    if (!selectedPerson || profileTab !== 'movement') return;
    const tagId = (selectedPerson.hardhatTagId || selectedPerson.id).toUpperCase();
    setIsHistoryLoading(true);

    const q = query(collection(db, 'tag_history'));
    const unsub = onSnapshot(q, (snapshot) => {
      const history: TagHistoryEntry[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.TagID?.toUpperCase() === tagId || data.tagId?.toUpperCase() === tagId) {
          history.push({
            id: d.id,
            TagID: data.TagID || data.tagId,
            name: data.name,
            fromZone: data.fromZone,
            toZone: data.toZone,
            timestamp: data.timestamp
          });
        }
      });
      setWorkerHistory(history.slice(0, 15));
      setIsHistoryLoading(false);
    }, (err) => {
      console.warn("Failed to read worker movement history:", err);
      setIsHistoryLoading(false);
    });

    return () => unsub();
  }, [selectedPerson, profileTab]);

  // 3. Combine MongoDB registered workers with real-time antenna tag scans (Workers only)
  const combinedPeople = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Add registered workers from MongoDB (Authoritative data source)
    dbWorkers.forEach((w) => {
      if (
        w.role.toLowerCase().includes('visitor') || 
        (w.name || '').toLowerCase().includes('(visitor)') ||
        (w.id || '').toUpperCase().startsWith('VIS-')
      ) {
        return;
      }
      const tagKey = (w.hardhatTagId || w.id).toUpperCase();
      map.set(tagKey, {
        id: w.id,
        hardhatTagId: w.hardhatTagId || w.id,
        name: w.name,
        role: w.role,
        tradeCompany: w.tradeCompany || 'Apex Structural',
        phone: w.phone,
        email: w.email || `${(w.name || "").toLowerCase().replace(/\s+/g, '.')}@buildcorp.com`,
        emergencyContact: w.emergencyContact,
        certifications: w.certifications,
        ppeStatus: w.ppeStatus || 'COMPLIANT',
        shiftStatus: w.shiftStatus || 'ON_SITE',
        trainingStatus: w.trainingStatus || 'COMPLIANT',
        lastTrainingDate: w.lastTrainingDate || '2026-05-15',
        trainingCourse: w.trainingCourse || 'OSHA 30 Construction Safety',
        trainingExpiry: w.trainingExpiry || '2027-05-15',
        department: w.department || 'Civil Engineering',
        supervisor: w.supervisor || 'Marcus Vance (EHS Lead)',
        safetyScore: w.safetyScore || 94,
        currentZone: 'Off-Site / Gate Check-In',
        dwellTime: 0,
        presenceState: w.shiftStatus === 'OFF_SITE' ? 'IDLE' : 'MOVING',
        isDbRegistered: true
      });
    });

    // 2. Overlay live positions from antenna scans (ONLY update live telemetry: x, y, currentZone, dwellTime, presenceState, lastSeen)
    people.forEach((p) => {
      if (
        p.role === 'Visitor' ||
        (p.role || '').toLowerCase().includes('visitor') ||
        (p.name || '').toLowerCase().includes('(visitor)') ||
        (p.id || '').toUpperCase().startsWith('VIS-') ||
        (p.hardhatTagId || '').toUpperCase().startsWith('VIS-') ||
        (p.hardhatTagId || '').toUpperCase().startsWith('HH-TEMP-')
      ) {
        return; // Exclude visitors from People (worker) directory
      }

      const tagKey = (p.hardhatTagId || p.id).toUpperCase();
      const existing = map.get(tagKey);
      if (existing) {
        existing.currentZone = p.currentZone || existing.currentZone;
        existing.dwellTime = p.dwellTime ?? existing.dwellTime;
        existing.presenceState = p.presenceState || existing.presenceState;
        existing.x = p.x;
        existing.y = p.y;
      } else {
        map.set(tagKey, {
          ...p,
          hardhatTagId: p.hardhatTagId || p.id,
          name: p.name || `Tag ${tagKey}`,
          role: p.role || 'Field Personnel',
          tradeCompany: p.tradeCompany || 'Field Team',
          shiftStatus: 'ON_SITE',
          trainingStatus: p.trainingStatus || 'COMPLIANT',
          lastTrainingDate: p.lastTrainingDate || '',
          trainingCourse: '',
          isDbRegistered: false
        });
      }
    });

    return Array.from(map.values());
  }, [dbWorkers, people]);

  // Filtered workers list
  const filteredPeople = useMemo(() => {
    return combinedPeople.filter(p => {
      const matchesSearch = 
        (p.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) || 
        (p.hardhatTagId || p.id).toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (p.role || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (p.tradeCompany || '').toLowerCase().includes((searchTerm || "").toLowerCase());
      
      const matchesRole = roleFilter === 'All' || p.role === roleFilter;
      const matchesCompany = companyFilter === 'All' || p.tradeCompany === companyFilter;
      const matchesPpe = ppeFilter === 'All' || p.ppeStatus === ppeFilter;
      const matchesShift = shiftFilter === 'All' || p.shiftStatus === shiftFilter;
      const matchesTraining = trainingFilter === 'All' || p.trainingStatus === trainingFilter;

      return matchesSearch && matchesRole && matchesCompany && matchesPpe && matchesShift && matchesTraining;
    });
  }, [combinedPeople, searchTerm, roleFilter, companyFilter, ppeFilter, shiftFilter, trainingFilter]);

  // Map coordinates binding for interactive blueprint map
  const mappedPeopleForMap = useMemo(() => {
    return filteredPeople.map((p, idx) => {
      let x = p.x;
      let y = p.y;
      if (x === undefined || y === undefined || (x === 0 && y === 0)) {
        const zone = (p.currentZone || '').toLowerCase();
        if (zone.includes('material') || zone.includes('storage')) {
          x = 16 + (idx % 2) * 8;
          y = 14 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('structure') || zone.includes('scaffold')) {
          x = 46 + (idx % 2) * 8;
          y = 15 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('crane') || zone.includes('operating')) {
          x = 78 + (idx % 2) * 8;
          y = 15 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('office') || zone.includes('trailer') || zone.includes('command')) {
          x = 18 + (idx % 2) * 6;
          y = 48 + Math.floor(idx / 2) * 6;
        } else if (zone.includes('open') || zone.includes('general')) {
          x = 48 + (idx % 2) * 8;
          y = 45 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('parking') || zone.includes('equipment') || zone.includes('machinery')) {
          x = 78 + (idx % 2) * 8;
          y = 48 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('excavation') || zone.includes('pit') || zone.includes('trench')) {
          x = 18 + (idx % 2) * 8;
          y = 75 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('assembly') || zone.includes('muster')) {
          x = 48 + (idx % 2) * 8;
          y = 75 + Math.floor(idx / 2) * 4;
        } else if (zone.includes('voltage') || zone.includes('substation') || zone.includes('electric')) {
          x = 80 + (idx % 2) * 8;
          y = 75 + Math.floor(idx / 2) * 4;
        } else {
          x = 18 + (idx % 3) * 6;
          y = 48 + Math.floor(idx / 3) * 5;
        }
      }
      return {
        ...p,
        x,
        y
      };
    });
  }, [filteredPeople]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = combinedPeople.length;
    const active = combinedPeople.filter(p => p.shiftStatus === 'ON_SITE' || p.dwellTime > 0).length;
    const compliantPpe = combinedPeople.filter(p => p.ppeStatus === 'COMPLIANT').length;
    const nonCompliantPpe = combinedPeople.filter(p => p.ppeStatus === 'NON_COMPLIANT').length;
    const warningPpe = combinedPeople.filter(p => p.ppeStatus === 'WARNING').length;
    const overdueTraining = combinedPeople.filter(p => p.trainingStatus === 'OVERDUE').length;
    
    // PPE compliance rate strictly computes percentage of verified full compliant workers
    const ppeRate = total > 0 ? Math.round((compliantPpe / total) * 100) : 100;
    
    // High Risk personnel count: anyone with NO PPE (NON_COMPLIANT), PPE WARNING, OVERDUE safety training, or inside hazardous exclusion zones
    const highRisk = combinedPeople.filter(p => {
      const z = (p.currentZone || '').toLowerCase();
      const isExclusionZone = z.includes('crane') || z.includes('voltage') || z.includes('exclusion') || z.includes('hazard');
      return p.ppeStatus === 'NON_COMPLIANT' || p.ppeStatus === 'WARNING' || p.trainingStatus === 'OVERDUE' || isExclusionZone;
    }).length;
    
    return { total, active, compliantPpe, nonCompliantPpe, warningPpe, overdueTraining, ppeRate, highRisk };
  }, [combinedPeople]);

  // Quick Update Safety Training Status in MongoDB
  const handleQuickUpdateTrainingStatus = async (tagId: string, name: string, newStatus: 'COMPLIANT' | 'DUE_SOON' | 'OVERDUE' | 'PENDING') => {
    try {
      const tagUpper = (tagId || "").toUpperCase().trim();
      const todayDate = new Date().toISOString().split('T')[0];
      await setDoc(doc(db, 'registered_people', tagUpper), {
        trainingStatus: newStatus,
        lastTrainingDate: todayDate,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Optimistically update dbWorkers state
      setDbWorkers(prev => prev.map(w => {
        if ((w.id || '').toUpperCase() === tagUpper || (w.hardhatTagId || '').toUpperCase() === tagUpper) {
          return { ...w, trainingStatus: newStatus, lastTrainingDate: todayDate };
        }
        return w;
      }));

      if (selectedPerson && ((selectedPerson.hardhatTagId || selectedPerson.id || '').toUpperCase() === tagUpper)) {
        setSelectedPerson(prev => prev ? {
          ...prev,
          trainingStatus: newStatus,
          lastTrainingDate: todayDate
        } : null);
      }

      await addDoc(collection(db, 'alerts'), {
        type: newStatus === 'OVERDUE' ? 'warning' : 'info',
        message: `Safety Training Compliance update for ${name} (${tagId}): Status changed to ${newStatus}`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `Updated Safety Training Status to '${newStatus}' for ${name} in MongoDB database.`);
    } catch (err) {
      console.error("Failed to update training status:", err);
      showToast('error', "Failed to update worker safety status in MongoDB.");
    }
  };

  // Quick Contractor Mobile Check-In handler
  const handleContractorMobileCheckIn = async () => {
    if (!simCheckInForm.workerName || !simCheckInForm.hardhatTagId) {
      showToast('error', 'Worker Name and Hardhat Tag ID are required.');
      return;
    }
    const tagId = (simCheckInForm.hardhatTagId || "").toUpperCase().trim();
    try {
      // 1. Update registered_people document
      const newRec = {
        id: tagId,
        hardhatTagId: tagId,
        name: simCheckInForm.workerName.trim(),
        tradeCompany: simCheckInForm.tradeCompany || selectedContractorCompany,
        shiftStatus: 'ON_SITE' as const,
        ppeStatus: (simCheckInForm.ppeStatus || 'COMPLIANT') as any,
        currentZone: simCheckInForm.gateLocation,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'registered_people', tagId), newRec, { merge: true });

      setDbWorkers(prev => {
        const idx = prev.findIndex(w => (w.id || '').toUpperCase() === tagId || (w.hardhatTagId || '').toUpperCase() === tagId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...newRec };
          return next;
        }
        return [newRec as any, ...prev];
      });

      // 2. Add attendance record
      await addDoc(collection(db, 'attendance'), {
        tagId,
        workerName: simCheckInForm.workerName,
        tradeCompany: simCheckInForm.tradeCompany || selectedContractorCompany,
        checkInTime: new Date().toISOString(),
        gateLocation: simCheckInForm.gateLocation,
        checkInType: 'MOBILE_QR_SELF_CHECKIN'
      });

      // 3. Add system alert
      await addDoc(collection(db, 'alerts'), {
        type: 'info',
        message: `📱 Contractor Mobile Check-In: ${simCheckInForm.workerName} (${simCheckInForm.tradeCompany || selectedContractorCompany}) checked in via Mobile QR at ${simCheckInForm.gateLocation}`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `Mobile Check-In verified for ${simCheckInForm.workerName} at ${simCheckInForm.gateLocation}!`);
      setIsContractorQrModalOpen(false);
    } catch (err) {
      console.error('Failed contractor mobile check-in:', err);
      showToast('error', 'Failed to record mobile check-in in database.');
    }
  };

  // Dynamic lists from Industry config + database records
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    (roles || []).forEach(r => { if (r) set.add(r); });
    dbWorkers.forEach(w => { if (w.role) set.add(w.role); });
    if (set.size === 0) {
      set.add('Staff Member');
      set.add('Lead Supervisor');
      set.add('Field Specialist');
    }
    return Array.from(set);
  }, [roles, dbWorkers]);

  const availableCompanies = useMemo(() => {
    const set = new Set<string>();
    (subcontractors || []).forEach(s => { if (s) set.add(s); });
    dbWorkers.forEach(w => {
      if (w.tradeCompany) set.add(w.tradeCompany);
      if (w.company) set.add(w.company);
    });
    if (set.size === 0) {
      set.add('Prime Operations');
      set.add('Partner Firm');
    }
    return Array.from(set);
  }, [subcontractors, dbWorkers]);

  const availableZones = useMemo(() => {
    if (zones && zones.length > 0) return zones.map(z => z.name);
    const keys = Object.keys(zonesDict || {});
    if (keys.length > 0) return keys;
    return ['Main Entrance / Gate', 'Primary Operations Area', 'Restricted Zone', 'Assembly Point'];
  }, [zones, zonesDict]);

  // Subcontractor / Trade Aggregations
  const contractorSummary = useMemo(() => {
    const map: Record<string, { total: number; active: number; compliant: number; nonCompliant: number }> = {};
    combinedPeople.forEach(p => {
      const comp = p.tradeCompany || p.company || 'General Organization';
      if (!map[comp]) {
        map[comp] = { total: 0, active: 0, compliant: 0, nonCompliant: 0 };
      }
      map[comp].total += 1;
      if (p.shiftStatus === 'ON_SITE' || p.dwellTime > 0) map[comp].active += 1;
      if (p.ppeStatus === 'COMPLIANT' || !p.ppeStatus) map[comp].compliant += 1;
      if (p.ppeStatus === 'NON_COMPLIANT') map[comp].nonCompliant += 1;
    });
    return Object.entries(map).map(([company, data]) => ({
      company,
      ...data,
      complianceRate: data.total > 0 ? Math.round((data.compliant / data.total) * 100) : 100
    }));
  }, [combinedPeople]);

  // Save new worker to MongoDB
  const handleAddWorker = async () => {
    if (!formData.name?.trim() || !formData.hardhatTagId?.trim()) {
      showToast('error', `${personnelSingular} Name and ${idBadgeLabel} are required.`);
      return;
    }
    const tagId = (formData.hardhatTagId || "").toUpperCase().trim();
    const finalRole = isCustomRole ? (customRoleInput.trim() || 'Staff') : (formData.role || availableRoles[0] || 'Staff');
    const finalCompany = isCustomCompany ? (customCompanyInput.trim() || 'General Organization') : (formData.tradeCompany || availableCompanies[0] || 'General Organization');

    // Automatically save new custom role to industry settings if newly typed
    if (isCustomRole && customRoleInput.trim() && !availableRoles.includes(customRoleInput.trim())) {
      await saveRoles([...(roles || []), customRoleInput.trim()]);
    }
    // Automatically save new custom subcontractor to industry settings if newly typed
    if (isCustomCompany && customCompanyInput.trim() && !availableCompanies.includes(customCompanyInput.trim())) {
      await saveSubcontractors([...(subcontractors || []), customCompanyInput.trim()]);
    }
    
    try {
      const newWorkerData: DBWorker = {
        id: tagId,
        hardhatTagId: tagId,
        name: formData.name.trim(),
        role: finalRole,
        tradeCompany: finalCompany,
        company: finalCompany,
        phone: formData.phone || '+1 (555) 019-2831',
        email: formData.email || `${formData.name.toLowerCase().replace(/\s+/g, '.')}@enterprise.com`,
        emergencyContact: formData.emergencyContact || 'Emergency Contact (+1 555-992-1100)',
        certifications: formData.certifications || 'Enterprise Standard Clearance',
        ppeStatus: formData.ppeStatus || 'COMPLIANT',
        shiftStatus: formData.shiftStatus || 'ON_SITE',
        trainingStatus: formData.trainingStatus || 'COMPLIANT',
        lastTrainingDate: formData.lastTrainingDate || new Date().toISOString().split('T')[0],
        trainingCourse: formData.trainingCourse || `${config?.appTitle || 'Enterprise'} Safety Induction`,
        trainingExpiry: formData.trainingExpiry || '2027-05-15',
        department: formData.department || finalCompany,
        supervisor: formData.supervisor || 'Operations Lead',
        currentZone: formData.currentZone || (availableZones[0] || 'Main Portal'),
        safetyScore: 95,
        notes: formData.notes || '',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'registered_people', tagId), newWorkerData);
      await fetch('/api/data/registered_people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkerData)
      }).catch(() => {});

      // Optimistically update dbWorkers
      setDbWorkers(prev => [newWorkerData, ...prev.filter(w => (w.id || '').toUpperCase() !== tagUpper(tagId) && (w.hardhatTagId || '').toUpperCase() !== tagUpper(tagId))]);

      await addDoc(collection(db, 'alerts'), {
        type: 'info',
        message: `Registered new ${personnelSingular} in MongoDB: ${newWorkerData.name} (${tagId}) - ${newWorkerData.role} [${newWorkerData.tradeCompany}]`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `${personnelSingular} "${newWorkerData.name}" saved to MongoDB database.`);
      setIsAddingModalOpen(false);
      setIsCustomRole(false);
      setCustomRoleInput('');
      setIsCustomCompany(false);
      setCustomCompanyInput('');
      resetFormData();
    } catch (err: any) {
      console.error("Failed to save worker to MongoDB:", err);
      showToast('error', `Failed to persist ${personnelSingular} record in MongoDB database.`);
    }
  };

  function tagUpper(s: string): string {
    return (s || '').toUpperCase().trim();
  }

  // Edit existing worker in MongoDB
  const handleUpdateWorker = async () => {
    if (!formData.id || !formData.hardhatTagId) return;
    const tagId = (formData.hardhatTagId || formData.id || "").toUpperCase().trim();
    const finalRole = isCustomRole ? (customRoleInput.trim() || formData.role) : (formData.role || 'Staff');
    const finalCompany = isCustomCompany ? (customCompanyInput.trim() || formData.tradeCompany) : (formData.tradeCompany || 'General Organization');

    if (isCustomRole && customRoleInput.trim() && !availableRoles.includes(customRoleInput.trim())) {
      await saveRoles([...(roles || []), customRoleInput.trim()]);
    }
    if (isCustomCompany && customCompanyInput.trim() && !availableCompanies.includes(customCompanyInput.trim())) {
      await saveSubcontractors([...(subcontractors || []), customCompanyInput.trim()]);
    }

    try {
      const updatedRecord: DBWorker = {
        ...formData,
        id: tagId,
        hardhatTagId: tagId,
        role: finalRole,
        tradeCompany: finalCompany,
        company: finalCompany,
        department: formData.department || finalCompany,
        updatedAt: serverTimestamp()
      } as any;

      await setDoc(doc(db, 'registered_people', tagId), updatedRecord, { merge: true });
      await fetch('/api/data/registered_people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      }).catch(() => {});

      // Optimistically update dbWorkers
      setDbWorkers(prev => prev.map(w => {
        if ((w.id || '').toUpperCase() === tagId || (w.hardhatTagId || '').toUpperCase() === tagId) {
          return { ...w, ...updatedRecord };
        }
        return w;
      }));

      await addDoc(collection(db, 'alerts'), {
        type: 'info',
        message: `Updated ${personnelSingular} record in MongoDB: ${formData.name} (${tagId})`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `Updated profile for "${formData.name}" in MongoDB.`);
      setIsEditModalOpen(false);
      setIsCustomRole(false);
      setCustomRoleInput('');
      setIsCustomCompany(false);
      setCustomCompanyInput('');
      if (selectedPerson) {
        setSelectedPerson(prev => prev ? { ...prev, ...updatedRecord } : null);
      }
    } catch (err) {
      console.error("Failed to update worker:", err);
      showToast('error', `Failed to update ${personnelSingular} in MongoDB.`);
    }
  };

  // Delete worker from MongoDB
  const handleDeleteWorker = async (tagId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove worker "${name}" (${tagId}) from MongoDB database?`)) return;

    try {
      const idUpper = (tagId || "").toUpperCase().trim();
      const idOriginal = (tagId || "").trim();

      // Delete from registered_people
      await deleteDoc(doc(db, 'registered_people', idOriginal));
      if (idUpper !== idOriginal) {
        await deleteDoc(doc(db, 'registered_people', idUpper));
      }

      // Also delete from people collection
      await deleteDoc(doc(db, 'people', idOriginal));
      if (idUpper !== idOriginal) {
        await deleteDoc(doc(db, 'people', idUpper));
      }

      // Optimistically update local dbWorkers state immediately
      setDbWorkers(prev => prev.filter(w => {
        const wIdUpper = (w.id || '').toUpperCase();
        const wTagUpper = (w.hardhatTagId || '').toUpperCase();
        return wIdUpper !== idUpper && wIdUpper !== idOriginal.toUpperCase() && wTagUpper !== idUpper;
      }));

      if (selectedPerson && (
        (selectedPerson.id || '').toUpperCase() === idUpper || 
        (selectedPerson.hardhatTagId || '').toUpperCase() === idUpper ||
        selectedPerson.id === idOriginal
      )) {
        setSelectedPerson(null);
      }

      await addDoc(collection(db, 'alerts'), {
        type: 'warning',
        message: `Worker deregistered from MongoDB: ${name} (${tagId})`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('info', `Deregistered worker "${name}" from MongoDB.`);
    } catch (err) {
      console.error("Failed to delete worker:", err);
      showToast('error', "Failed to remove worker from MongoDB.");
    }
  };

  // Quick toggle PPE status directly in MongoDB
  const handleQuickUpdatePpe = async (tagId: string, name: string, newPpe: 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT') => {
    try {
      const tagUpper = (tagId || "").toUpperCase().trim();
      await setDoc(doc(db, 'registered_people', tagUpper), {
        ppeStatus: newPpe,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Optimistically update dbWorkers state
      setDbWorkers(prev => prev.map(w => {
        if ((w.id || '').toUpperCase() === tagUpper || (w.hardhatTagId || '').toUpperCase() === tagUpper) {
          return { ...w, ppeStatus: newPpe };
        }
        return w;
      }));

      if (selectedPerson && ((selectedPerson.hardhatTagId || selectedPerson.id || '').toUpperCase() === tagUpper)) {
        setSelectedPerson(prev => prev ? { ...prev, ppeStatus: newPpe } : null);
      }

      await addDoc(collection(db, 'alerts'), {
        type: newPpe === 'NON_COMPLIANT' ? 'security' : newPpe === 'WARNING' ? 'warning' : 'info',
        message: `PPE status changed for ${name} (${tagId}) to ${newPpe}`,
        timestamp: new Date()
      });

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('success', `Updated ${name} PPE status to ${newPpe} in MongoDB.`);
    } catch (err) {
      console.error("Failed to update PPE status:", err);
      showToast('error', "Failed to update PPE status in MongoDB.");
    }
  };

  // Quick toggle Shift status directly in MongoDB
  const handleQuickUpdateShift = async (tagId: string, name: string, newShift: 'ON_SITE' | 'OFF_SITE' | 'ON_LEAVE' | 'SUSPENDED') => {
    try {
      const tagUpper = (tagId || "").toUpperCase().trim();
      await setDoc(doc(db, 'registered_people', tagUpper), {
        shiftStatus: newShift,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Optimistically update dbWorkers state
      setDbWorkers(prev => prev.map(w => {
        if ((w.id || '').toUpperCase() === tagUpper || (w.hardhatTagId || '').toUpperCase() === tagUpper) {
          return { ...w, shiftStatus: newShift };
        }
        return w;
      }));

      if (selectedPerson && ((selectedPerson.hardhatTagId || selectedPerson.id || '').toUpperCase() === tagUpper)) {
        setSelectedPerson(prev => prev ? { ...prev, shiftStatus: newShift } : null);
      }

      window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));

      showToast('info', `Worker ${name} shift status set to ${newShift} in MongoDB.`);
    } catch (err) {
      console.error("Failed to update shift status:", err);
      showToast('error', "Failed to update shift status in MongoDB.");
    }
  };

  // Reset form data
  const resetFormData = () => {
    setIsCustomRole(false);
    setCustomRoleInput('');
    setIsCustomCompany(false);
    setCustomCompanyInput('');
    setFormData({
      id: '',
      hardhatTagId: '',
      name: '',
      role: availableRoles[0] || 'Staff',
      tradeCompany: availableCompanies[0] || 'General Organization',
      phone: '+1 (555) 019-2831',
      email: '',
      emergencyContact: 'Emergency Contact (+1 555-992-1100)',
      certifications: 'Standard Compliance & Safety',
      ppeStatus: 'COMPLIANT',
      shiftStatus: 'ON_SITE',
      trainingStatus: 'COMPLIANT',
      lastTrainingDate: new Date().toISOString().split('T')[0],
      trainingCourse: `${config?.appTitle || 'Enterprise'} Safety Induction`,
      trainingExpiry: '2027-05-15',
      department: availableCompanies[0] || 'Operations',
      supervisor: 'Operations Lead',
      currentZone: availableZones[0] || 'Main Area',
      notes: ''
    });
  };

  // Generate real AI Worker Analysis via server endpoint
  const handleGenerateAiWorkerSummary = async (person: any) => {
    setIsGeneratingAi(true);
    setAiSummary(null);

    try {
      const response = await fetch('/api/ai-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Generate a detailed ${safetyComplianceLabel} & Dwell Behavioral Audit Report for ${personnelSingular} ${person.name} (${idBadgeLabel}: ${person.hardhatTagId || person.id}, ${roleLabel}: ${person.role}, ${organizationType}: ${person.tradeCompany}, ${zoneLabel}: ${person.currentZone}, Compliance Status: ${person.ppeStatus || 'COMPLIANT'}, Certifications: ${person.certifications || 'Standard'}). Provide safety score, dwell analysis, and EHS recommendations.`,
          context: { worker: person }
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAiSummary(data.answer || data.reply || "AI worker report generated successfully.");
      } else {
        setAiSummary(`### AI ${safetyComplianceLabel} Audit: ${person.name} (${person.hardhatTagId || person.id})\n\n- **Current Role**: ${person.role}\n- **${organizationType}**: ${person.tradeCompany || 'General'}\n- **Current ${zoneLabel}**: ${person.currentZone || 'Unknown'}\n- **Safety Compliance**: ${person.ppeStatus || 'COMPLIANT'}\n- **Dwell Time**: ${Math.round((person.dwellTime || 0) / 60)} mins\n\n*All compliance telemetry active and synced to database.*`);
      }
    } catch (e: any) {
      setAiSummary(`### AI ${safetyComplianceLabel} Audit: ${person.name} (${person.hardhatTagId || person.id})\n\n- **Current Role**: ${person.role}\n- **${organizationType}**: ${person.tradeCompany || 'General'}\n- **Current ${zoneLabel}**: ${person.currentZone || 'Unknown'}\n- **Safety Compliance**: ${person.ppeStatus || 'COMPLIANT'}\n\n*System active.*`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Export Roster to CSV
  const handleExportCSV = () => {
    const data = filteredPeople.map(p => ({
      TagID: p.hardhatTagId || p.id,
      Name: p.name,
      Role: p.role,
      Company: p.tradeCompany || 'General',
      Zone: p.currentZone || 'Off-Site',
      PPEStatus: p.ppeStatus || 'COMPLIANT',
      ShiftStatus: p.shiftStatus || 'ON_SITE',
      Phone: p.phone || 'N/A'
    }));
    exportToCSV(`Workforce_Roster_${new Date().toISOString().split('T')[0]}`, data, [
      { key: 'TagID', label: idBadgeLabel.toUpperCase() },
      { key: 'Name', label: `${personnelSingular.toUpperCase()} NAME` },
      { key: 'Role', label: roleLabel.toUpperCase() },
      { key: 'Company', label: organizationType.toUpperCase() },
      { key: 'Zone', label: `CURRENT ${zoneLabel.toUpperCase()}` },
      { key: 'PPEStatus', label: 'COMPLIANCE STATUS' },
      { key: 'ShiftStatus', label: 'SHIFT STATUS' },
      { key: 'Phone', label: 'CONTACT' }
    ]);
  };

  // Export Official PDF Roster
  const handleExportPDF = () => {
    const data = filteredPeople.map(p => ({
      tag: p.hardhatTagId || p.id,
      name: p.name,
      role: p.role,
      company: p.tradeCompany || 'General',
      zone: p.currentZone || 'Off-Site',
      ppe: p.ppeStatus || 'COMPLIANT'
    }));

    generatePDFReport(
      `${config?.appTitle || 'Enterprise'} - Active Workforce & Safety Compliance Report`,
      `${new Date().toLocaleDateString()} - ${personnelPlural} Roster & PPE Compliance Snapshot`,
      [
        { key: 'tag', label: idBadgeLabel },
        { key: 'name', label: 'Name' },
        { key: 'role', label: roleLabel },
        { key: 'company', label: organizationType },
        { key: 'zone', label: zoneLabel },
        { key: 'ppe', label: 'Status' }
      ],
      data,
      [
        { label: `Total ${personnelPlural}`, value: stats.total },
        { label: `Active ${siteLabel}`, value: stats.active },
        { label: 'Compliance Rate', value: `${stats.ppeRate}%` },
        { label: 'High Risk / Non-Compliant', value: stats.highRisk }
      ]
    );
  };

  // Open Edit Modal for a worker
  const openEditWorkerModal = (person: any) => {
    setIsCustomRole(false);
    setCustomRoleInput('');
    setIsCustomCompany(false);
    setCustomCompanyInput('');
    setFormData({
      id: person.id,
      hardhatTagId: person.hardhatTagId || person.id,
      name: person.name || '',
      role: person.role || availableRoles[0] || 'Staff',
      tradeCompany: person.tradeCompany || person.company || availableCompanies[0] || 'General Organization',
      phone: person.phone || '+1 (555) 019-2831',
      email: person.email || '',
      emergencyContact: person.emergencyContact || 'Jane Doe (+1 555-992-1100)',
      certifications: person.certifications || 'Standard Compliance & Safety',
      ppeStatus: person.ppeStatus || 'COMPLIANT',
      shiftStatus: person.shiftStatus || 'ON_SITE',
      trainingStatus: person.trainingStatus || 'COMPLIANT',
      lastTrainingDate: person.lastTrainingDate || '2026-05-15',
      trainingCourse: person.trainingCourse || `${config?.appTitle || 'Enterprise'} Induction`,
      trainingExpiry: person.trainingExpiry || '2027-05-15',
      department: person.department || person.tradeCompany || availableCompanies[0] || 'Operations',
      supervisor: person.supervisor || 'Operations Lead',
      currentZone: person.currentZone || (availableZones[0] || 'Main Area'),
      notes: person.notes || ''
    });
    setIsEditModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 w-full p-4 md:p-6 max-w-7xl mx-auto relative">
      
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top duration-300 ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-600 text-white border-emerald-700' 
            : toastMsg.type === 'error'
            ? 'bg-rose-600 text-white border-rose-700'
            : 'bg-indigo-600 text-white border-indigo-700'
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="animate-spin" />
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="font-bold underline text-[10px]">Dismiss</button>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-7 h-7 text-[#007BC4]" />
              Enterprise Workforce & Personnel Center
            </h2>
            {mongoStatus.connected ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>MongoDB Atlas: Lat-Aperture-People-Tracking (Connected)</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-2xs bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <Database size={13} className="text-rose-600 dark:text-rose-400" />
                <span>MongoDB Disconnected</span>
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
              Live UHF Tracking Active
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm mt-1">
            Manage personnel directory, contractor trade rosters, RFID hardhat tags, and PPE compliance synced to MongoDB Atlas
          </p>
        </div>

        {/* Top Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => {
              setIsContractorQrModalOpen(true);
              setMobileCheckInTab('qr');
            }}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer"
            title="Generate Mobile Check-In QR Codes for Contractors"
          >
            <Smartphone size={16} /> Contractor Mobile Check-In QR
          </button>

          <button 
            onClick={() => setIsQrScannerOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer"
            title="Scan worker hardhat or RFID badge QR code using camera"
          >
            <Camera size={16} /> Scan QR Code
          </button>

          <button 
            onClick={() => { resetFormData(); setIsAddingModalOpen(true); }}
            className="px-4 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Register Worker
          </button>

          <button 
            onClick={handleExportCSV}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-xl transition cursor-pointer"
            title="Export CSV Roster"
          >
            <Download size={16} />
          </button>

          <button 
            onClick={handleExportPDF}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-xl transition cursor-pointer"
            title="Export Official PDF Roster"
          >
            <FileText size={16} />
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Workforce</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">MongoDB Registered Workers</span>
          </div>
          <div className="p-3 bg-[#007BC4]/10 text-[#007BC4] rounded-xl">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Active On-Site</span>
            <span className="text-2xl font-black text-emerald-600">{stats.active}</span>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">{Math.max(0, stats.total - stats.active)} Off-Site / Leave</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <UserCheck size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">PPE Compliance Rate</span>
            <span className={`text-2xl font-black ${stats.ppeRate >= 80 ? 'text-emerald-600' : stats.ppeRate >= 60 ? 'text-amber-500' : 'text-rose-600'}`}>
              {stats.ppeRate}%
            </span>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">{stats.compliantPpe} of {stats.total} Compliant</span>
          </div>
          <div className={`p-3 rounded-xl ${stats.ppeRate >= 80 ? 'bg-emerald-500/10 text-emerald-600' : stats.ppeRate >= 60 ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-600'}`}>
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">High Risk / Non-Compliant</span>
            <span className={`text-2xl font-black ${stats.highRisk > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
              {stats.highRisk}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
              {stats.nonCompliantPpe > 0 ? `${stats.nonCompliantPpe} No PPE` : ''}
              {stats.warningPpe > 0 ? `${stats.nonCompliantPpe > 0 ? ' • ' : ''}${stats.warningPpe} Check` : ''}
              {stats.overdueTraining > 0 ? `${(stats.nonCompliantPpe > 0 || stats.warningPpe > 0) ? ' • ' : ''}${stats.overdueTraining} Overdue` : ''}
              {stats.nonCompliantPpe === 0 && stats.warningPpe === 0 && stats.overdueTraining === 0 ? 'Zero EHS Violations' : ''}
            </span>
          </div>
          <div className={`p-3 rounded-xl ${stats.highRisk > 0 ? 'bg-rose-500/10 text-rose-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}>
            <ShieldAlert size={20} />
          </div>
        </div>
      </div>

      {/* Main Content Area with Mode Selector */}
      <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm flex-1 overflow-hidden flex flex-col">
        <CardHeader className="border-b border-slate-100 dark:border-slate-700 pb-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Sub-View Mode Selector */}
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('map')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'map' 
                  ? 'bg-[#007BC4] text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <MapPin size={14} /> Interactive Construction Map
            </button>
            <button
              onClick={() => setViewMode('roster')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'roster' 
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Users size={14} /> Personnel Roster ({filteredPeople.length})
            </button>
            <button
              onClick={() => setViewMode('contractors')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'contractors' 
                  ? 'bg-white dark:bg-slate-800 text-[#007BC4] shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Building2 size={14} /> Trade Contractors ({contractorSummary.length})
            </button>
            <button
              onClick={() => setViewMode('certifications')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'certifications' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <BadgeCheck size={14} /> Safety Certifications
            </button>
          </div>

          {/* Search & Multi-Filters (Visible in Roster view) */}
          {viewMode === 'roster' && (
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[220px] lg:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-4" />
                <Input 
                  placeholder="Search worker name, tag ID, role..." 
                  className="pl-9 pr-9 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:ring-[#007BC4]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setIsQrScannerOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#007BC4] hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                  title="Scan QR Code with Camera"
                >
                  <Camera size={14} />
                </button>
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="All">All {roleLabel}s</option>
                {availableRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {/* Organization / Subcontractor Filter */}
              <select
                value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="All">All {organizationType}s</option>
                {availableCompanies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* PPE Filter */}
              <select
                value={ppeFilter}
                onChange={e => setPpeFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="All">All Compliance Status</option>
                <option value="COMPLIANT">✓ Compliant</option>
                <option value="WARNING">⚠️ PPE Check</option>
                <option value="NON_COMPLIANT">❌ Non-Compliant</option>
              </select>

              {/* Shift Filter */}
              <select
                value={shiftFilter}
                onChange={e => setShiftFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="All">All Shifts</option>
                <option value="ON_SITE">Active {siteLabel}</option>
                <option value="OFF_SITE">Off-Site</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
              </select>

              {/* Safety Training Compliance Filter */}
              <select
                value={trainingFilter}
                onChange={e => setTrainingFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="All">All {safetyComplianceLabel}</option>
                <option value="COMPLIANT">✓ Compliant</option>
                <option value="DUE_SOON">⚠️ Refresher Due</option>
                <option value="OVERDUE">⛔ Overdue / Expired</option>
                <option value="PENDING">🔄 Pending Approval</option>
              </select>

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
        </CardHeader>
        
        {/* VIEW 0: INTERACTIVE MAP-BASED PEOPLE TRACKING */}
        {viewMode === 'map' && (
          <CardContent className="p-0 flex-1 flex flex-col min-h-[620px] bg-[#090d16] relative overflow-hidden">
            {/* Map Top Control Strip */}
            <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-20">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase text-sky-400 tracking-wider flex items-center gap-1.5 bg-sky-950/80 px-2.5 py-1 rounded-lg border border-sky-800/60">
                  <MapPin className="w-3.5 h-3.5 text-sky-400" /> Site RTLS Map
                </span>
                
                {/* Map CAD Mode Switcher */}
                <select
                  value={mapMode}
                  onChange={(e) => setMapMode(e.target.value as any)}
                  className="bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 rounded-lg px-2.5 py-1 outline-none cursor-pointer hover:border-sky-500 transition"
                >
                  <option value="standard">Standard CAD Blueprint</option>
                  <option value="bim">3D BIM Wireframe</option>
                  <option value="heatmap">Thermal Dwell Heatmap</option>
                  <option value="evacuation">Emergency Evacuation Routes</option>
                  <option value="security">High Risk Hazard Overlay</option>
                </select>

                <div className="h-4 w-[1px] bg-slate-700 hidden sm:block" />

                {/* Live Zone Counters for the 9-Zone Grid */}
                <div className="hidden xl:flex items-center gap-1 text-[10px] font-bold overflow-x-auto max-w-[620px] py-0.5">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    📦 Storage: <strong className="text-yellow-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('material') || (p.currentZone || '').toLowerCase().includes('storage')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    🏗️ Structure: <strong className="text-purple-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('structure')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    🏗️ Crane: <strong className="text-rose-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('crane')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    🏢 Office: <strong className="text-sky-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('office')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    👷 Open: <strong className="text-slate-200">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('open')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    🚜 Parking: <strong className="text-orange-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('parking')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    ⛏️ Excavation: <strong className="text-rose-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('excavation')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    👥 Assembly: <strong className="text-emerald-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('assembly') || (p.currentZone || '').toLowerCase().includes('muster')).length}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    ⚡ Voltage: <strong className="text-rose-400">{mappedPeopleForMap.filter(p => (p.currentZone || '').toLowerCase().includes('voltage')).length}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-lg flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {mappedPeopleForMap.length} Workers Tracked
                </span>
              </div>
            </div>

            {/* Interactive Blueprint Canvas Component */}
            <div className="flex-1 relative w-full h-[540px]">
              <LiveFloorMap
                mode={mapMode}
                zones={zonesDict}
                people={mappedPeopleForMap}
                vehicles={[]}
                onSelectEntity={(entity) => {
                  if (entity.data) {
                    setSelectedPerson(entity.data);
                    setProfileTab('profile');
                    setAiSummary(null);
                  }
                }}
              />
            </div>

            {/* Map Bottom Zone & Subcontractor Roster Overlay */}
            <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 z-20 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Info className="w-4 h-4 text-sky-400" />
                <span>Click any worker pin on the map to open full profile, movement history, and AI EHS analysis.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('roster')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" /> View Detailed Roster
                </button>
              </div>
            </div>
          </CardContent>
        )}

        {/* VIEW 1: PERSONNEL ROSTER TABLE */}
        {viewMode === 'roster' && (
          <CardContent className="p-0 flex-1 overflow-auto">
            {/* Bulk Action Toolbar */}
            {selectedIds.length > 0 && (
              <div className="m-4 bg-[#007BC4] text-white p-3.5 px-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 border border-blue-400/30">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 text-white font-extrabold text-xs px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-inner">
                    <CheckSquare className="w-4 h-4" />
                    <span>{selectedIds.length} Selected</span>
                  </div>
                  <span className="text-xs text-blue-100 hidden sm:inline font-medium">Bulk Actions:</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* 1. Quick Export Actions */}
                  <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/20">
                    <button
                      onClick={handleBulkExportCSV}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 rounded-lg shadow-sm transition"
                      title="Export selected workers to CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={handleBulkExportPDF}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 rounded-lg shadow-sm transition"
                      title="Export selected workers to PDF Report"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      <span>Export PDF</span>
                    </button>
                  </div>

                  {/* 2. Quick Status Change Actions */}
                  <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/20">
                    <span className="text-[10px] uppercase font-bold text-blue-100 px-1">Status:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkShiftChange(e.target.value as any);
                          e.target.value = '';
                        }
                      }}
                      className="bg-white text-slate-900 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>Shift Status...</option>
                      <option value="ON_SITE">🟢 On-Site</option>
                      <option value="OFF_SITE">⚪ Off-Site</option>
                      <option value="ON_LEAVE">🟡 On Leave</option>
                      <option value="SUSPENDED">🔴 Suspended</option>
                    </select>

                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkPpeChange(e.target.value as any);
                          e.target.value = '';
                        }
                      }}
                      className="bg-white text-slate-900 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>PPE Status...</option>
                      <option value="COMPLIANT">✓ Full PPE</option>
                      <option value="WARNING">⚠️ Check PPE</option>
                      <option value="NON_COMPLIANT">❌ Non-Compliant</option>
                    </select>
                  </div>

                  {/* 3. Notify Action */}
                  <button
                    onClick={() => setIsNotifyModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl shadow-md transition"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Notify ({selectedIds.length})</span>
                  </button>

                  {/* Clear selection */}
                  <button
                    onClick={() => setSelectedIds([])}
                    className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition ml-1"
                    title="Deselect all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {isDbLoading ? (
              <div className="py-16 text-center text-xs font-bold text-slate-400 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-[#007BC4] animate-spin" />
                Loading workforce roster from MongoDB database...
              </div>
            ) : layoutType === 'cards' ? (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPeople.map((person) => {
                  const tagDisplay = (person.hardhatTagId || `HH-${person.id.substring(0, 4)}`).toUpperCase();
                  const isSelected = selectedIds.includes(tagDisplay);
                  const tagBattery = (person as any).batteryLevel ?? (person as any).battery ?? 95;
                  const isLowBattery = tagBattery < 20;
                  const ppe = person.ppeStatus || 'COMPLIANT';
                  const shift = person.shiftStatus || 'ON_SITE';

                  return (
                    <div
                      key={person.id}
                      className={`relative rounded-2xl border p-4 transition-all hover:shadow-md flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#007BC4] bg-blue-50/70 dark:bg-blue-950/30 ring-2 ring-[#007BC4]/40'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div>
                        {/* Top Card Header */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(tagDisplay)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#007BC4] focus:ring-[#007BC4] cursor-pointer"
                            />
                            <div>
                              <h4
                                className="font-bold text-slate-900 dark:text-white text-sm hover:text-[#007BC4] cursor-pointer transition"
                                onClick={() => { setSelectedPerson(person); setProfileTab('profile'); setAiSummary(null); }}
                              >
                                {person.name}
                              </h4>
                              <div className="text-[11px] font-mono text-[#007BC4] font-bold flex items-center gap-1">
                                <QrCode size={11} className="text-slate-400" />
                                {tagDisplay}
                              </div>
                            </div>
                          </div>

                          <Badge variant="outline" className={
                            person.role === 'Safety Officer (EHS)' ? 'border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px]' :
                            person.role === 'Site Inspector / Visitor' ? 'border-amber-200 text-amber-700 bg-amber-50 text-[10px]' :
                            person.role === 'Structural Engineer' ? 'border-purple-200 text-purple-700 bg-purple-50 text-[10px]' :
                            'border-[#007BC4]/20 text-[#007BC4] bg-[#007BC4]/5 text-[10px]'
                          }>
                            {(person.role || "").split(' ')[0]}
                          </Badge>
                        </div>

                        {/* Card Details Grid */}
                        <div className="my-2.5 space-y-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px] font-medium">Trade Company:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{person.tradeCompany || 'Apex Structural'}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px] font-medium">Current Sector:</span>
                            <span className="font-bold text-[#007BC4] flex items-center gap-1">
                              <MapPin size={11} />
                              {person.currentZone || 'Off-Site'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                            <span className="text-slate-400 text-[11px] font-medium">PPE Status:</span>
                            <select
                              value={ppe}
                              onChange={(e) => handleQuickUpdatePpe(tagDisplay, person.name, e.target.value as any)}
                              className={`text-[10px] font-black uppercase rounded px-2 py-0.5 outline-none border cursor-pointer ${
                                ppe === 'COMPLIANT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' :
                                ppe === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300' :
                                'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              <option value="COMPLIANT">✓ FULL PPE</option>
                              <option value="WARNING">⚠️ PPE CHECK</option>
                              <option value="NON_COMPLIANT">❌ NO PPE</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px] font-medium">Shift State:</span>
                            <select
                              value={shift}
                              onChange={(e) => handleQuickUpdateShift(tagDisplay, person.name, e.target.value as any)}
                              className="text-[10px] font-bold rounded px-2 py-0.5 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 cursor-pointer"
                            >
                              <option value="ON_SITE">🟢 ON-SITE</option>
                              <option value="OFF_SITE">⚪ OFF-SITE</option>
                              <option value="ON_LEAVE">🟡 ON LEAVE</option>
                              <option value="SUSPENDED">🔴 SUSPENDED</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                            <span className="text-slate-400 text-[11px] font-medium">Safety Compliance:</span>
                            {(() => {
                              const badgeInfo = getSafetyStatusBadge(person.trainingStatus);
                              return (
                                <select
                                  value={person.trainingStatus || 'COMPLIANT'}
                                  onChange={(e) => handleQuickUpdateTrainingStatus(tagDisplay, person.name, e.target.value as any)}
                                  className={`text-[10px] font-black uppercase rounded px-2 py-0.5 outline-none border cursor-pointer ${badgeInfo.selectClass}`}
                                >
                                  <option value="COMPLIANT">✓ COMPLIANT</option>
                                  <option value="DUE_SOON">⚠️ REFRESHER DUE</option>
                                  <option value="OVERDUE">⛔ OVERDUE</option>
                                  <option value="PENDING">🔄 PENDING</option>
                                </select>
                              );
                            })()}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                            <span className="text-slate-400 text-[10px] font-medium">Tag Battery:</span>
                            <span className={`font-bold text-[10px] flex items-center gap-1 ${isLowBattery ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {isLowBattery ? <BatteryWarning size={12} className="text-rose-500" /> : <Battery size={12} className="text-emerald-500" />}
                              {tagBattery}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Action Buttons */}
                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => { setSelectedPerson(person); setProfileTab('profile'); setAiSummary(null); }}
                          className="flex-1 py-1 px-2.5 bg-[#007BC4]/10 hover:bg-[#007BC4]/20 text-[#007BC4] dark:text-blue-300 rounded-lg text-xs font-bold transition text-center"
                        >
                          View Profile
                        </button>
                        <button
                          onClick={() => openEditWorkerModal(person)}
                          className="p-1.5 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                          title="Edit Worker Profile"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteWorker(tagDisplay, person.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title="Deregister Worker"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredPeople.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-400 text-xs font-semibold">
                    No workers matched search query or filters.
                  </div>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <TableRow className="border-slate-200 dark:border-slate-700">
                    <TableHead className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredPeople.length > 0 && selectedIds.length === filteredPeople.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#007BC4] focus:ring-[#007BC4] cursor-pointer"
                        title="Select All"
                      />
                    </TableHead>
                    <TableHead className="text-slate-500 font-bold">Hardhat RFID Tag</TableHead>
                    <TableHead className="text-slate-500 font-bold">Worker Name</TableHead>
                    <TableHead className="text-slate-500 font-bold">Subcontractor Trade</TableHead>
                    <TableHead className="text-slate-500 font-bold">Role</TableHead>
                    <TableHead className="text-slate-500 font-bold text-center">PPE Compliance</TableHead>
                    <TableHead className="text-slate-500 font-bold text-center">Shift Status</TableHead>
                    <TableHead className="text-slate-500 font-bold text-center">Safety Status</TableHead>
                    <TableHead className="text-slate-500 font-bold">Current Sector</TableHead>
                    <TableHead className="text-slate-500 font-bold text-center">Battery</TableHead>
                    <TableHead className="text-slate-500 font-bold text-right">Dwell</TableHead>
                    <TableHead className="text-slate-500 font-bold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPeople.map((person) => {
                    const tagDisplay = (person.hardhatTagId || `HH-${person.id.substring(0, 4)}`).toUpperCase();
                    const isSelected = selectedIds.includes(tagDisplay);
                    const tagBattery = (person as any).batteryLevel ?? (person as any).battery ?? 95;
                    const isLowBattery = tagBattery < 20;
                    const ppe = person.ppeStatus || 'COMPLIANT';
                    const shift = person.shiftStatus || 'ON_SITE';

                    return (
                      <TableRow 
                        key={person.id} 
                        className={`border-slate-100 dark:border-slate-800 transition-colors ${
                          isSelected ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <TableCell className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(tagDisplay)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#007BC4] focus:ring-[#007BC4] cursor-pointer"
                          />
                        </TableCell>

                        <TableCell 
                          className="font-mono text-xs text-[#007BC4] font-bold cursor-pointer"
                          onClick={() => { setSelectedPerson(person); setProfileTab('profile'); setAiSummary(null); }}
                        >
                          <div className="flex items-center gap-1.5">
                            <QrCode size={14} className="text-slate-400" />
                            {tagDisplay}
                          </div>
                        </TableCell>

                        <TableCell 
                          className="font-semibold text-slate-900 dark:text-white cursor-pointer"
                          onClick={() => { setSelectedPerson(person); setProfileTab('profile'); setAiSummary(null); }}
                        >
                          <div>{person.name}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{person.certifications || 'OSHA Certified'}</div>
                        </TableCell>

                        <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {person.tradeCompany || 'Apex Structural'}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className={
                            person.role === 'Safety Officer (EHS)' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                            person.role === 'Site Inspector / Visitor' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                            person.role === 'Structural Engineer' ? 'border-purple-200 text-purple-700 bg-purple-50' :
                            'border-[#007BC4]/20 text-[#007BC4] bg-[#007BC4]/5'
                          }>
                            {person.role}
                          </Badge>
                        </TableCell>

                        {/* Interactive PPE Status selector */}
                        <TableCell className="text-center">
                          <select
                            value={ppe}
                            onChange={(e) => handleQuickUpdatePpe(tagDisplay, person.name, e.target.value as any)}
                            className={`text-[10px] font-black uppercase rounded px-2 py-1 outline-none border cursor-pointer ${
                              ppe === 'COMPLIANT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              ppe === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            <option value="COMPLIANT">✓ FULL PPE</option>
                            <option value="WARNING">⚠️ PPE CHECK</option>
                            <option value="NON_COMPLIANT">❌ NO PPE</option>
                          </select>
                        </TableCell>

                        {/* Interactive Shift Status selector */}
                        <TableCell className="text-center">
                          <select
                            value={shift}
                            onChange={(e) => handleQuickUpdateShift(tagDisplay, person.name, e.target.value as any)}
                            className="text-[10px] font-bold rounded px-2 py-1 outline-none bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                          >
                            <option value="ON_SITE">🟢 ON-SITE</option>
                            <option value="OFF_SITE">⚪ OFF-SITE</option>
                            <option value="ON_LEAVE">🟡 ON LEAVE</option>
                            <option value="SUSPENDED">🔴 SUSPENDED</option>
                          </select>
                        </TableCell>

                        {/* Interactive Safety Training Compliance Status selector */}
                        <TableCell className="text-center">
                          {(() => {
                            const badgeInfo = getSafetyStatusBadge(person.trainingStatus);
                            return (
                              <select
                                value={person.trainingStatus || 'COMPLIANT'}
                                onChange={(e) => handleQuickUpdateTrainingStatus(tagDisplay, person.name, e.target.value as any)}
                                className={`text-[10px] font-black uppercase rounded px-2 py-1 outline-none border cursor-pointer ${badgeInfo.selectClass}`}
                                title="Update safety training compliance in MongoDB"
                              >
                                <option value="COMPLIANT">✓ COMPLIANT</option>
                                <option value="DUE_SOON">⚠️ DUE SOON</option>
                                <option value="OVERDUE">⛔ OVERDUE</option>
                                <option value="PENDING">🔄 PENDING</option>
                              </select>
                            );
                          })()}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-bold text-xs">
                            <MapPin size={12} className="text-[#007BC4]" />
                            {person.currentZone || 'Off-Site'}
                          </div>
                        </TableCell>

                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isLowBattery ? <BatteryWarning size={14} className="text-rose-500" /> : <Battery size={14} className="text-emerald-500" />}
                            <span className={`text-xs font-bold ${isLowBattery ? 'text-rose-600' : 'text-slate-600 dark:text-slate-400'}`}>{tagBattery}%</span>
                          </div>
                        </TableCell>

                        <TableCell className="text-right tabular-nums text-xs font-bold text-slate-700 dark:text-slate-300">
                          {Math.floor(person.dwellTime / 60)}m {person.dwellTime % 60}s
                        </TableCell>

                        {/* Direct Action Buttons */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditWorkerModal(person)}
                              className="p-1.5 text-slate-500 hover:text-[#007BC4] hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                              title="Edit Worker Profile in MongoDB"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteWorker(tagDisplay, person.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                              title="Deregister Worker from MongoDB"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredPeople.length === 0 && !isDbLoading && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-slate-400 text-xs font-semibold">
                        No workers matched search query or filters.<br/>Use "Register Worker" to add a new profile to MongoDB.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}

        {/* VIEW 2: TRADE CONTRACTOR SUMMARY */}
        {viewMode === 'contractors' && (
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {contractorSummary.map((c, i) => (
                <div key={i} className="p-5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <Building2 size={16} className="text-[#007BC4]" />
                        {c.company}
                      </span>
                      <Badge className={`text-[10px] font-black ${
                        c.complianceRate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.complianceRate}% PPE
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 mt-3">
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 block font-bold">TOTAL STAFF</span>
                        <span className="font-black text-slate-900 dark:text-white text-base">{c.total} Workers</span>
                      </div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 block font-bold">ACTIVE ON-SITE</span>
                        <span className="font-black text-emerald-600 text-base">{c.active} Active</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs gap-2">
                    <button
                      onClick={() => {
                        setSelectedContractorCompany(c.company);
                        setIsContractorQrModalOpen(true);
                        setMobileCheckInTab('qr');
                      }}
                      className="px-2.5 py-1.5 bg-[#007BC4]/10 hover:bg-[#007BC4]/20 text-[#007BC4] rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition cursor-pointer border border-[#007BC4]/20"
                      title="Generate Mobile Check-In QR Pass for Contractor Staff"
                    >
                      <Smartphone size={13} /> Mobile QR Pass
                    </button>
                    <button
                      onClick={() => { setCompanyFilter(c.company); setViewMode('roster'); }}
                      className="text-[11px] font-bold text-[#007BC4] hover:underline"
                    >
                      Filter Roster →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}

        {/* VIEW 3: SAFETY CERTIFICATIONS MATRIX */}
        {viewMode === 'certifications' && (
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl text-xs text-indigo-900 dark:text-indigo-200 font-medium flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BadgeCheck size={20} className="text-indigo-600 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">Site Safety Certification Verification Matrix</div>
                    <div>All workers must maintain valid OSHA 30 and trade clearances prior to entering active construction sectors.</div>
                  </div>
                </div>
                <Badge className="bg-indigo-600 text-white font-bold text-[10px]">100% Verified</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {combinedPeople.map((p, i) => (
                  <div key={i} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{p.hardhatTagId || p.id} • {p.tradeCompany}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {parseCertifications(p.certifications).map((cert: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] rounded border border-emerald-200/50">
                            ✓ {cert.trim()}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => openEditWorkerModal(p)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-100"
                    >
                      Update Certs
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* COMPREHENSIVE PERSON PROFILE DRAWER / MODAL */}
      {selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#007BC4] text-white flex items-center justify-center text-xl font-bold uppercase shadow-md">
                  {(selectedPerson.name || 'U').charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedPerson.name}</h3>
                    <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                      {selectedPerson.shiftStatus || 'ON_SITE'}
                    </Badge>
                    {(() => {
                      const badgeInfo = getSafetyStatusBadge(selectedPerson.trainingStatus);
                      const BadgeIcon = badgeInfo.icon;
                      return (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 shadow-xs ${badgeInfo.badgeClass}`}>
                          <BadgeIcon size={11} />
                          {badgeInfo.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <span className="font-mono text-[#007BC4] font-bold">{selectedPerson.hardhatTagId || selectedPerson.id}</span>
                    <span>•</span>
                    <span>{selectedPerson.tradeCompany || 'Apex Structural'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => openEditWorkerModal(selectedPerson)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                >
                  <Edit size={14} /> Edit Profile
                </button>
                <button 
                  onClick={() => setSelectedPerson(null)} 
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-900 px-5 gap-4 overflow-x-auto">
              {[
                { id: 'profile', label: 'Personal & Role' },
                { id: 'badge', label: 'RFID Badge & QR Pass' },
                { id: 'movement', label: 'Zone Movement Log' },
                { id: 'safety', label: 'EHS & Certifications' },
                { id: 'ai', label: 'AI Worker Summary' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setProfileTab(t.id as any);
                    if (t.id === 'ai' && !aiSummary) handleGenerateAiWorkerSummary(selectedPerson);
                  }}
                  className={`py-3 text-xs font-bold border-b-2 whitespace-nowrap transition cursor-pointer ${
                    profileTab === t.id ? 'border-[#007BC4] text-[#007BC4]' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Profile Tab Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              
              {/* Tab 1: Personal & Role */}
              {profileTab === 'profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2.5">
                    <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider block">Employment & Sector Information</span>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">Department: {selectedPerson.department || 'Civil Engineering'}</div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">Subcontractor: {selectedPerson.tradeCompany || 'Apex Structural'}</div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">Supervisor: {selectedPerson.supervisor || 'Marcus Vance (EHS Lead)'}</div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">Current Zone: {selectedPerson.currentZone || 'Off-Site'}</div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2.5">
                    <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider block">Contact & Emergency Directives</span>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5"><Phone size={14} className="text-[#007BC4]" /> {selectedPerson.phone || '+1 (555) 019-2831'}</div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5"><Mail size={14} className="text-[#007BC4]" /> {selectedPerson.email || 'worker@buildcorp.com'}</div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5"><Heart size={14} className="text-rose-500" /> {selectedPerson.emergencyContact || 'Emergency Contact (+1 555-992-1100)'}</div>
                  </div>
                </div>
              )}

              {/* Tab 2: RFID Badge & QR Pass */}
              {profileTab === 'badge' && (
                <div className="flex flex-col items-center justify-center py-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 gap-4">
                  <div className="w-72 bg-white text-slate-900 border-2 border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center gap-4 relative overflow-hidden">
                    <div className="w-full bg-[#007BC4] text-white py-1 px-3 text-[10px] font-black uppercase text-center tracking-widest rounded-t">
                      GAO RFID SITE SECURITY PASS
                    </div>

                    <div className="w-16 h-16 rounded-2xl bg-[#007BC4] text-white flex items-center justify-center font-black text-2xl shadow-md">
                      {(selectedPerson.name || 'U').charAt(0)}
                    </div>

                    <div className="text-center">
                      <div className="font-black text-base">{selectedPerson.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">{selectedPerson.role}</div>
                      <div className="text-[10px] text-[#007BC4] font-extrabold">{selectedPerson.tradeCompany}</div>
                    </div>

                    {/* Scannable QR Code */}
                    <QrCodeSvg text={`GAO-RFID-WORKER:${selectedPerson.hardhatTagId || selectedPerson.id}:${selectedPerson.name}`} size={110} />

                    <div className="bg-slate-100 p-2 rounded-xl font-mono text-[11px] font-black text-[#007BC4] tracking-widest border border-slate-300 w-full text-center">
                      TAG: {selectedPerson.hardhatTagId || selectedPerson.id}
                    </div>
                  </div>

                  <button 
                    onClick={() => window.print()} 
                    className="px-5 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow transition cursor-pointer"
                  >
                    <Printer size={15} /> Print Physical RFID Badge
                  </button>
                </div>
              )}

              {/* Tab 3: Zone Movement Log */}
              {profileTab === 'movement' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                    <span>Active Sector: <strong>{selectedPerson.currentZone || 'Off-Site'}</strong></span>
                    <span>Current Dwell: <strong>{Math.floor((selectedPerson.dwellTime || 0) / 60)}m</strong></span>
                  </div>

                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">Recent Zone Entry / Exit History (MongoDB)</h4>

                  {isHistoryLoading ? (
                    <div className="py-8 text-center text-slate-400 font-bold flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-[#007BC4]" /> Loading movement history...
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {workerHistory.map((h, i) => (
                        <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-[#007BC4]" />
                            <span className="font-bold text-slate-800 dark:text-white">To: {h.toZone || 'Unassigned'}</span>
                            {h.fromZone && <span className="text-[#007BC4]"> (From: {h.fromZone})</span>}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            {h.timestamp ? new Date(h.timestamp?.seconds ? h.timestamp.seconds * 1000 : (h.timestamp?.toDate ? h.timestamp.toDate() : h.timestamp)).toLocaleTimeString() : 'Recent'}
                          </span>
                        </div>
                      ))}

                      {workerHistory.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          No recent zone movements logged in MongoDB for Tag {selectedPerson.hardhatTagId || selectedPerson.id}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: EHS & Certifications */}
              {profileTab === 'safety' && (
                <div className="space-y-4">
                  {/* Database Training Compliance Status Card */}
                  {(() => {
                    const tagDisplay = (selectedPerson.hardhatTagId || selectedPerson.id).toUpperCase();
                    const badgeInfo = getSafetyStatusBadge(selectedPerson.trainingStatus);
                    const BadgeIcon = badgeInfo.icon;
                    return (
                      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Training Compliance Status (Database Synced)</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 shadow-sm ${badgeInfo.badgeClass}`}>
                                <BadgeIcon size={14} />
                                {badgeInfo.label}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">Tag: <strong className="font-mono text-[#007BC4]">{tagDisplay}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-500">Quick Update:</span>
                            <select
                              value={selectedPerson.trainingStatus || 'COMPLIANT'}
                              onChange={(e) => handleQuickUpdateTrainingStatus(tagDisplay, selectedPerson.name, e.target.value as any)}
                              className={`text-xs font-extrabold uppercase rounded-xl px-3 py-1.5 outline-none border cursor-pointer ${badgeInfo.selectClass}`}
                            >
                              <option value="COMPLIANT">✓ COMPLIANT</option>
                              <option value="DUE_SOON">⚠️ REFRESHER DUE</option>
                              <option value="OVERDUE">⛔ OVERDUE</option>
                              <option value="PENDING">🔄 PENDING</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">REGISTERED COURSE</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{selectedPerson.trainingCourse || 'OSHA 30 Construction Safety & Hazmat'}</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">LAST VERIFIED DATE</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{selectedPerson.lastTrainingDate || '2026-05-15'}</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">RENEWAL EXPIRATION</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedPerson.trainingExpiry || '2027-05-15'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h5 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                      <Award size={16} className="text-[#007BC4]" /> Verified Trade Certifications & Clearances
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {parseCertifications(selectedPerson.certifications).map((c: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 text-slate-800 dark:text-slate-200 font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 size={12} className="text-emerald-500" /> {c.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: AI Worker Summary */}
              {profileTab === 'ai' && (
                <div>
                  {isGeneratingAi ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-8 h-8 text-[#007BC4] animate-spin" />
                      <span className="text-xs text-slate-500 font-bold">Querying Gemini AI for Worker Dwell & Safety Intelligence...</span>
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl font-sans text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line border border-slate-200 dark:border-slate-700 leading-relaxed">
                      {aiSummary}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* REGISTER NEW WORKER / PERSONNEL MODAL */}
      {isAddingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setIsAddingModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>

            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <PlusCircle size={18} className="text-[#007BC4]" /> Register New {personnelSingular}
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Full {personnelSingular} Name *
                </label>
                <input
                  type="text"
                  placeholder={`e.g. John Smith`}
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  {idBadgeLabel} *
                </label>
                <input
                  type="text"
                  placeholder="e.g. TAG-8891 or HH-8891"
                  value={formData.hardhatTagId}
                  onChange={e => setFormData({...formData, hardhatTagId: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-mono font-bold text-[#007BC4]"
                />
              </div>

              {/* Organization / Subcontractor / Department */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300">
                    {organizationType} / Company *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCompany(!isCustomCompany);
                      if (!isCustomCompany) setCustomCompanyInput('');
                    }}
                    className="text-[11px] font-bold text-[#007BC4] hover:underline"
                  >
                    {isCustomCompany ? "← Choose existing" : `+ Custom ${organizationType}`}
                  </button>
                </div>
                {isCustomCompany ? (
                  <input
                    type="text"
                    placeholder={`Enter new ${organizationType} name`}
                    value={customCompanyInput}
                    onChange={e => setCustomCompanyInput(e.target.value)}
                    className="w-full p-2.5 bg-sky-50/50 dark:bg-sky-950/30 border border-[#007BC4] rounded-xl outline-none font-medium text-slate-800 dark:text-slate-200"
                    autoFocus
                  />
                ) : (
                  <select
                    value={formData.tradeCompany}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomCompany(true);
                        setCustomCompanyInput('');
                      } else {
                        setFormData({...formData, tradeCompany: e.target.value, department: e.target.value});
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                  >
                    {availableCompanies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__NEW__">+ Add Custom {organizationType}...</option>
                  </select>
                )}
              </div>

              {/* Role Dropdown with Custom Add */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300">
                    Assigned {roleLabel} *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomRole(!isCustomRole);
                      if (!isCustomRole) setCustomRoleInput('');
                    }}
                    className="text-[11px] font-bold text-[#007BC4] hover:underline"
                  >
                    {isCustomRole ? "← Choose existing" : `+ Custom ${roleLabel}`}
                  </button>
                </div>
                {isCustomRole ? (
                  <input
                    type="text"
                    placeholder={`Enter new ${roleLabel} title`}
                    value={customRoleInput}
                    onChange={e => setCustomRoleInput(e.target.value)}
                    className="w-full p-2.5 bg-sky-50/50 dark:bg-sky-950/30 border border-[#007BC4] rounded-xl outline-none font-medium text-slate-800 dark:text-slate-200"
                    autoFocus
                  />
                ) : (
                  <select
                    value={formData.role}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomRole(true);
                        setCustomRoleInput('');
                      } else {
                        setFormData({...formData, role: e.target.value});
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    <option value="__NEW__">+ Add Custom {roleLabel}...</option>
                  </select>
                )}
              </div>

              {/* Initial Zone / Area Assignment */}
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Initial Assigned {zoneLabel}
                </label>
                <select
                  value={formData.currentZone || availableZones[0]}
                  onChange={e => setFormData({...formData, currentZone: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                >
                  {availableZones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {/* Safety & Compliance Status */}
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  {safetyComplianceLabel} Status
                </label>
                <select
                  value={formData.trainingStatus || 'COMPLIANT'}
                  onChange={e => setFormData({...formData, trainingStatus: e.target.value as any})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                >
                  <option value="COMPLIANT">✓ Compliant / Verified</option>
                  <option value="DUE_SOON">⚠️ Refresher Due Soon</option>
                  <option value="OVERDUE">⛔ Overdue / Expired</option>
                  <option value="PENDING">🔄 Pending Approval</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Certifications & Clearances
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard Clearance, Level 2 Cert"
                  value={formData.certifications}
                  onChange={e => setFormData({...formData, certifications: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setIsAddingModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddWorker}
                  className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer shadow flex items-center gap-1.5"
                >
                  <Save size={15} /> Save {personnelSingular}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EXISTING WORKER / PERSONNEL MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>

            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Edit size={18} className="text-[#007BC4]" /> Edit {personnelSingular} Profile
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Full {personnelSingular} Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  {idBadgeLabel} (Locked)
                </label>
                <input
                  type="text"
                  disabled
                  value={formData.hardhatTagId}
                  className="w-full p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-mono font-bold text-slate-500 cursor-not-allowed"
                />
              </div>

              {/* Organization / Subcontractor / Department */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300">
                    {organizationType} / Company
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCompany(!isCustomCompany);
                      if (!isCustomCompany) setCustomCompanyInput('');
                    }}
                    className="text-[11px] font-bold text-[#007BC4] hover:underline"
                  >
                    {isCustomCompany ? "← Choose existing" : `+ Custom ${organizationType}`}
                  </button>
                </div>
                {isCustomCompany ? (
                  <input
                    type="text"
                    placeholder={`Enter new ${organizationType} name`}
                    value={customCompanyInput}
                    onChange={e => setCustomCompanyInput(e.target.value)}
                    className="w-full p-2.5 bg-sky-50/50 dark:bg-sky-950/30 border border-[#007BC4] rounded-xl outline-none font-medium text-slate-800 dark:text-slate-200"
                    autoFocus
                  />
                ) : (
                  <select
                    value={formData.tradeCompany}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomCompany(true);
                        setCustomCompanyInput('');
                      } else {
                        setFormData({...formData, tradeCompany: e.target.value, department: e.target.value});
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                  >
                    {availableCompanies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__NEW__">+ Add Custom {organizationType}...</option>
                  </select>
                )}
              </div>

              {/* Role Dropdown with Custom Add */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300">
                    Assigned {roleLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomRole(!isCustomRole);
                      if (!isCustomRole) setCustomRoleInput('');
                    }}
                    className="text-[11px] font-bold text-[#007BC4] hover:underline"
                  >
                    {isCustomRole ? "← Choose existing" : `+ Custom ${roleLabel}`}
                  </button>
                </div>
                {isCustomRole ? (
                  <input
                    type="text"
                    placeholder={`Enter new ${roleLabel} title`}
                    value={customRoleInput}
                    onChange={e => setCustomRoleInput(e.target.value)}
                    className="w-full p-2.5 bg-sky-50/50 dark:bg-sky-950/30 border border-[#007BC4] rounded-xl outline-none font-medium text-slate-800 dark:text-slate-200"
                    autoFocus
                  />
                ) : (
                  <select
                    value={formData.role}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomRole(true);
                        setCustomRoleInput('');
                      } else {
                        setFormData({...formData, role: e.target.value});
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    <option value="__NEW__">+ Add Custom {roleLabel}...</option>
                  </select>
                )}
              </div>

              {/* Assigned Zone / Sector */}
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Assigned {zoneLabel}
                </label>
                <select
                  value={formData.currentZone || availableZones[0]}
                  onChange={e => setFormData({...formData, currentZone: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                >
                  {availableZones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {/* Safety Training Compliance */}
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  {safetyComplianceLabel} Status
                </label>
                <select
                  value={formData.trainingStatus || 'COMPLIANT'}
                  onChange={e => setFormData({...formData, trainingStatus: e.target.value as any})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                >
                  <option value="COMPLIANT">✓ Compliant / Verified</option>
                  <option value="DUE_SOON">⚠️ Refresher Due Soon</option>
                  <option value="OVERDUE">⛔ Overdue / Expired</option>
                  <option value="PENDING">🔄 Pending Approval</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Certifications & Clearances
                </label>
                <input
                  type="text"
                  value={formData.certifications}
                  onChange={e => setFormData({...formData, certifications: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateWorker}
                  className="px-4 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer shadow flex items-center gap-1.5"
                >
                  <Save size={15} /> Update {personnelSingular}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Notify Modal */}
      {isNotifyModalOpen && (
        <div className="fixed inset-0 z-[999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">EHS Broadcast Notification</h3>
                  <p className="text-xs text-slate-500 font-medium">Send real-time alert to {selectedIds.length} selected personnel</p>
                </div>
              </div>
              <button onClick={() => setIsNotifyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Quick Presets</label>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  "⚠️ Immediate EHS Safety & Hardhat PPE Verification Required",
                  "📢 Muster Station Drill - Report to Zone Gate 1 Immediately",
                  "🚨 Crane Operation In Progress - Clear Exclusion Area",
                  "📋 Shift End Compliance Check - Ensure Tags Scanned"
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendBulkNotification(preset)}
                    className="text-left px-3 py-2 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Custom Notification Message</label>
                <textarea
                  value={notifyCustomText}
                  onChange={(e) => setNotifyCustomText(e.target.value)}
                  placeholder="Type custom notification broadcast for selected personnel..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#007BC4] resize-none h-24"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsNotifyModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendBulkNotification()}
                className="flex items-center gap-1.5 bg-[#007BC4] hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Dispatch Alert ({selectedIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTRACTOR MOBILE CHECK-IN QR MODAL */}
      {isContractorQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#007BC4]/10 text-[#007BC4] rounded-2xl">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    Contractor Mobile Check-In QR Pass
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Quick mobile self check-in for trade sub-contractors</p>
                </div>
              </div>
              <button onClick={() => setIsContractorQrModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-900 px-5 gap-2">
              <button
                onClick={() => setMobileCheckInTab('qr')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                  mobileCheckInTab === 'qr' ? 'border-[#007BC4] text-[#007BC4]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <QrCode size={14} /> Mobile QR Pass
              </button>
              <button
                onClick={() => setMobileCheckInTab('simulate')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                  mobileCheckInTab === 'simulate' ? 'border-[#007BC4] text-[#007BC4]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <SmartphoneNfc size={14} /> Self Check-In Simulator
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {mobileCheckInTab === 'qr' ? (
                <div className="flex flex-col items-center gap-4 text-center">
                  {/* Company Select */}
                  <div className="w-full text-left">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Select Subcontractor Firm:</label>
                    <select
                      value={selectedContractorCompany}
                      onChange={(e) => setSelectedContractorCompany(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="Apex Structural">Apex Structural</option>
                      <option value="ConcreteWorks LLC">ConcreteWorks LLC</option>
                      <option value="Heavy Rigging Co">Heavy Rigging Co</option>
                      <option value="Aperture EHS Lead">Aperture EHS Lead</option>
                      <option value="City Building Dept">City Building Dept</option>
                    </select>
                  </div>

                  {/* Generated QR Pass Preview */}
                  <div className="p-6 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl flex flex-col items-center gap-3 w-full max-w-sm shadow-sm">
                    <span className="text-[10px] font-black uppercase text-[#007BC4] tracking-widest bg-[#007BC4]/10 px-3 py-1 rounded-full">
                      MOBILE EXPRESS CHECK-IN
                    </span>
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-base">{selectedContractorCompany}</h4>
                    <p className="text-[11px] text-slate-500 font-medium">Scan on mobile device to open site entry check-in portal</p>

                    <QrCodeSvg 
                      text={`https://${window.location.host}/contractor-checkin?company=${encodeURIComponent(selectedContractorCompany)}`} 
                      size={150} 
                    />

                    <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[10px] text-slate-600 dark:text-slate-300 break-all w-full text-center">
                      https://{window.location.host}/checkin?company={encodeURIComponent(selectedContractorCompany)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-2 w-full flex-wrap pt-2">
                    <button
                      onClick={() => {
                        const url = `https://${window.location.host}/contractor-checkin?company=${encodeURIComponent(selectedContractorCompany)}`;
                        navigator.clipboard.writeText(url);
                        showToast('success', `Copied Contractor Mobile Check-In link for ${selectedContractorCompany} to clipboard!`);
                      }}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-100 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Copy size={14} /> Copy Check-In Link
                    </button>

                    <button
                      onClick={() => setMobileCheckInTab('simulate')}
                      className="px-4 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                    >
                      <SmartphoneNfc size={14} /> Launch Self Check-In Simulator
                    </button>
                  </div>
                </div>
              ) : (
                /* Mobile Phone Simulator Tab */
                <div className="flex flex-col items-center">
                  <div className="w-full max-w-sm border-4 border-slate-800 dark:border-slate-700 rounded-[32px] p-4 bg-slate-900 text-white shadow-2xl relative">
                    <div className="w-20 h-4 bg-slate-800 rounded-full mx-auto mb-3"></div>
                    <div className="bg-slate-800/90 rounded-2xl p-4 space-y-3">
                      <div className="text-center pb-2 border-b border-slate-700">
                        <span className="text-[10px] font-black text-[#007BC4] uppercase tracking-widest block">CONTRACTOR MOBILE PORTAL</span>
                        <h4 className="font-extrabold text-sm text-white">Gate Access Check-In</h4>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Worker Name</label>
                          <input
                            type="text"
                            value={simCheckInForm.workerName}
                            onChange={(e) => setSimCheckInForm({ ...simCheckInForm, workerName: e.target.value })}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium outline-none focus:border-[#007BC4]"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Hardhat Tag RFID ID</label>
                          <input
                            type="text"
                            value={simCheckInForm.hardhatTagId}
                            onChange={(e) => setSimCheckInForm({ ...simCheckInForm, hardhatTagId: (e.target.value || "").toUpperCase() })}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-[#007BC4] font-mono font-bold outline-none focus:border-[#007BC4]"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Subcontractor Firm</label>
                          <select
                            value={simCheckInForm.tradeCompany}
                            onChange={(e) => setSimCheckInForm({ ...simCheckInForm, tradeCompany: e.target.value })}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium outline-none"
                          >
                            <option value="Apex Structural">Apex Structural</option>
                            <option value="ConcreteWorks LLC">ConcreteWorks LLC</option>
                            <option value="Heavy Rigging Co">Heavy Rigging Co</option>
                            <option value="Aperture EHS Lead">Aperture EHS Lead</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Check-In Access Portal Gate</label>
                          <select
                            value={simCheckInForm.gateLocation}
                            onChange={(e) => setSimCheckInForm({ ...simCheckInForm, gateLocation: e.target.value })}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium outline-none"
                          >
                            <option value="Gate 1 Main Access Turnstile">Gate 1 Main Access Turnstile</option>
                            <option value="Gate 2 Heavy Portal">Gate 2 Heavy Portal</option>
                            <option value="Sector B Substation Gate">Sector B Substation Gate</option>
                            <option value="Sector C Tower Crane Gate">Sector C Tower Crane Gate</option>
                          </select>
                        </div>

                        <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-xl text-[11px] flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                          <span className="text-emerald-200 font-semibold">Self-Certified Full PPE (Hardhat, Boots, Vest Verified)</span>
                        </div>
                      </div>

                      <button
                        onClick={handleContractorMobileCheckIn}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                      >
                        <Check size={16} /> Complete Mobile Self Check-In
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Camera Worker QR Code Scanner Modal */}
      <WorkerQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        people={combinedPeople}
        onWorkerFound={handleWorkerFoundByQr}
      />

    </div>
  );
}
