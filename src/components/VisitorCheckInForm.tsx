import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserCheck, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, 
  XCircle, QrCode, CreditCard, RefreshCw, Printer, User, Building
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { collection, setDoc, doc, onSnapshot, db } from '../lib/db';
import { VisitorRecord, SecurityListItem } from './VisitorsTab';

interface VisitorCheckInFormProps {
  onCheckInComplete?: (visitor: VisitorRecord) => void;
  securityListProps?: SecurityListItem[];
}

export default function VisitorCheckInForm({ onCheckInComplete, securityListProps }: VisitorCheckInFormProps) {
  const [securityList, setSecurityList] = useState<SecurityListItem[]>(securityListProps || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overrideSecurity, setOverrideSecurity] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [checkInSuccess, setCheckInSuccess] = useState<VisitorRecord | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  // Form Fields State
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    idDocType: 'Driver License',
    idDocNumber: '',
    purpose: 'Facility Inspection & Audit',
    vehiclePlate: '',
    vehicleType: 'Standard',
    parkingBay: 'Bay 01',
    host: '',
    hostDept: 'Operations',
    location: 'Gate 1 Gatehouse',
    rfidTag: '',
    validHours: 8,
  });

  // Subscribe to security list if not provided
  useEffect(() => {
    if (securityListProps && securityListProps.length > 0) {
      setSecurityList(securityListProps);
      return;
    }

    const unsub = onSnapshot(collection(db, 'visitor_security_list'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as SecurityListItem));
      setSecurityList(data);
    }, (err) => {
      console.warn('Security list fetch fallback', err);
    });

    return () => unsub();
  }, [securityListProps]);

  // Real-Time Blacklist Validation Matcher
  const matchedBlacklistEntry = useMemo(() => {
    const trimmedName = formData.name.trim().toLowerCase();
    const trimmedCompany = formData.company.trim().toLowerCase();
    const trimmedDoc = formData.idDocNumber.trim().toLowerCase();

    if (!trimmedName && !trimmedCompany && !trimmedDoc) return null;

    return securityList.find(item => {
      if (item.type !== 'BLACKLIST') return false;
      const itemName = (item.name || "").toLowerCase();
      const itemCompany = item.company ? (item.company || "").toLowerCase() : '';

      const matchName = trimmedName.length >= 3 && (itemName.includes(trimmedName) || trimmedName.includes(itemName));
      const matchCompany = trimmedCompany.length >= 3 && itemCompany && (itemCompany.includes(trimmedCompany) || trimmedCompany.includes(itemCompany));

      return matchName || matchCompany;
    }) || null;
  }, [formData.name, formData.company, formData.idDocNumber, securityList]);

  // Real-Time Whitelist Matcher
  const matchedWhitelistEntry = useMemo(() => {
    const trimmedName = formData.name.trim().toLowerCase();
    if (!trimmedName || trimmedName.length < 3) return null;

    return securityList.find(item => item.type === 'WHITELIST' && (item.name || "").toLowerCase().includes(trimmedName)) || null;
  }, [formData.name, securityList]);

  const generateNewTagId = () => {
    setFormData(prev => ({
      ...prev,
      rfidTag: `HH-TEMP-${Math.floor(Math.random() * 8990) + 1000}`
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.company || !formData.host) return;

    setIsSubmitting(true);

    try {
      const isBlocked = matchedBlacklistEntry && !overrideSecurity;
      const visitorId = `VIS-${Math.floor(Math.random() * 800) + 900}`;
      const tokenString = `TOK-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${visitorId}`;
      const qrRef = `QR-${formData.name.substring(0, 4).replace(/\s+/g, '').toUpperCase()}-${Math.floor(Math.random() * 8999) + 1000}`;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + formData.validHours * 3600 * 1000).toISOString();

      const visitorRecord: VisitorRecord = {
        id: visitorId,
        name: formData.name,
        company: formData.company,
        host: formData.host,
        email: formData.email || `${(formData.name || "").toLowerCase().replace(/\s+/g, '.')}@guest.com`,
        phone: formData.phone || '+1 (555) 019-2831',
        status: isBlocked ? 'Denied' : 'Active',
        time: `Arrived ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        tag: isBlocked ? 'Tag Withheld' : formData.rfidTag,
        location: isBlocked ? 'Gate 1 Security Guardhouse (Blocked)' : formData.location,
        duration: isBlocked ? 'Refused Entry' : 'Just Arrived',
        path: [formData.location],
        vehiclePlate: (formData.vehiclePlate || "").toUpperCase() || 'N/A',
        vehicleType: formData.vehicleType,
        parkingBay: formData.parkingBay,
        purpose: formData.purpose,
        idVerificationStatus: isBlocked ? 'FAILED' : 'VERIFIED',
        idDocType: formData.idDocType,
        idDocNumber: formData.idDocNumber || `DOC-${Math.floor(Math.random() * 899000) + 100000}`,
        qrCodeRef: qrRef,
        arrivalTime: now.getTime(),
        approvalRemarks: isBlocked 
          ? `SECURITY BLOCK: Blacklist match (${matchedBlacklistEntry?.reason})`
          : overrideSecurity 
            ? `Security Override Authorized by Duty Officer. Reason: ${overrideReason || 'Vetted on-site'}` 
            : 'Check-in validated via Express Gatehouse Desk'
      };

      // Save Visitor Record
      await setDoc(doc(db, 'visitors', visitorId), visitorRecord);

      // Create Guest Access Token if approved
      if (!isBlocked) {
        const tokenDoc = {
          tokenId: tokenString,
          visitorId,
          visitorName: formData.name,
          company: formData.company,
          host: formData.host,
          status: 'ACTIVE',
          createdAt: now.toISOString(),
          expiresAt,
          allowedZones: [formData.location, 'Gate 1 Gatehouse', 'Site Office'],
          maxUsages: 10,
          scanCount: 0
        };
        await setDoc(doc(db, 'visitor_access_tokens', tokenString), tokenDoc);
      } else {
        // Log Security Alert in DB
        const alertId = `alt_blk_${Date.now()}`;
        await setDoc(doc(db, 'alerts', alertId), {
          id: alertId,
          type: 'BLACKLIST_MATCH_SECURITY_ALERT',
          severity: 'high',
          title: `Blacklisted Guest Blocked at Check-in`,
          message: `Attempted check-in by ${formData.name} (${formData.company}). Matched reason: ${matchedBlacklistEntry?.reason}`,
          timestamp: new Date().toISOString(),
          location: 'Gate 1 Security Desk'
        });
      }

      setGeneratedToken(tokenString);
      setCheckInSuccess(visitorRecord);

      window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
      window.dispatchEvent(new CustomEvent('gao_refresh_data'));

      if (onCheckInComplete) {
        onCheckInComplete(visitorRecord);
      }
    } catch (err) {
      console.error('Check-in submission failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCheckInSuccess(null);
    setGeneratedToken(null);
    setOverrideSecurity(false);
    setOverrideReason('');
    setFormData({
      name: '',
      company: '',
      email: '',
      phone: '',
      idDocType: 'Driver License',
      idDocNumber: '',
      purpose: 'Facility Inspection & Audit',
      vehiclePlate: '',
      vehicleType: 'Standard',
      parkingBay: 'Bay 01',
      host: '',
      hostDept: 'Operations',
      location: 'Gate 1 Gatehouse',
      rfidTag: '',
      validHours: 8,
    });
  };

  // SUCCESS SCREEN AFTER CHECK-IN
  if (checkInSuccess) {
    const isDenied = checkInSuccess.status === 'Denied';
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg max-w-2xl mx-auto space-y-6">
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          isDenied ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center gap-3">
            {isDenied ? <XCircle className="w-8 h-8 text-rose-600" /> : <CheckCircle2 className="w-8 h-8 text-emerald-600" />}
            <div>
              <h3 className="font-bold text-base">
                {isDenied ? 'ENTRY DENIED & SECURITY ALERT LOGGED' : 'VISITOR CHECK-IN COMPLETE & BADGE ISSUED'}
              </h3>
              <p className="text-xs opacity-90">
                {isDenied 
                  ? 'Visitor flagged on Blacklist directory. Access denied at Gatehouse.'
                  : `Visitor ${checkInSuccess.name} is now marked ACTIVE. Temporary RFID badge assigned.`}
              </p>
            </div>
          </div>
          <span className="px-3 py-1 font-mono font-bold text-xs bg-white/80 rounded-lg shadow-sm border border-slate-200">
            ID: {checkInSuccess.id}
          </span>
        </div>

        {!isDenied && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RFID Badge Card */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 border-2 border-[#007BC4] space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[10px] font-black uppercase text-[#007BC4] tracking-widest">GAO ENTERPRISE VISITOR BADGE</span>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ACTIVE</span>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <div className="w-12 h-12 rounded-xl bg-[#007BC4] text-white font-black text-2xl flex items-center justify-center shrink-0">
                  {(checkInSuccess.name || 'U').charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">{checkInSuccess.name}</h4>
                  <div className="text-xs text-slate-400">{checkInSuccess.company}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-800/80 p-2.5 rounded-xl font-mono">
                <div>
                  <span className="text-slate-400 block text-[9px]">RFID TAG ID</span>
                  <span className="text-amber-400 font-bold">{checkInSuccess.tag}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">HOST</span>
                  <span className="text-white truncate block">{checkInSuccess.host}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                <span>Location: {checkInSuccess.location}</span>
                <span>Vehicle: {checkInSuccess.vehiclePlate}</span>
              </div>
            </div>

            {/* QR Code Pass Card */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <QrCode size={16} className="text-[#007BC4]" /> Scanner Validation Token
              </span>

              {generatedToken && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <QRCode value={generatedToken} size={110} />
                </div>
              )}

              <div className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {generatedToken}
              </div>

              <p className="text-[10px] text-slate-500">
                Token stored in database for real-time gate scanner validation.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center gap-2"
          >
            <Printer size={15} /> Print Physical Visitor Pass
          </button>

          <button
            onClick={handleResetForm}
            className="px-5 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition"
          >
            Check In Another Visitor
          </button>
        </div>
      </div>
    );
  }

  // CHECK-IN FORM VIEW
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 md:p-6 shadow-sm space-y-5">
      
      {/* Form Header */}
      <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-[#007BC4]" />
            Gatehouse Visitor Check-in & RFID Desk
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Capture guest details, host information, real-time blacklist verification & instant RFID badge assignment.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-[#007BC4] border border-blue-200 rounded-full text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck size={14} /> Live Blacklist Guard On
          </span>
        </div>
      </div>

      {/* REAL-TIME BLACKLIST ALERT PANEL */}
      {matchedBlacklistEntry && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500 rounded-2xl text-rose-950 dark:text-rose-200 space-y-3 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-500 text-white rounded-xl animate-pulse">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h4 className="font-black text-sm uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  CRITICAL SECURITY ALERT: BLACKLIST MATCH DETECTED
                </h4>
                <p className="text-xs font-medium text-rose-800 dark:text-rose-300">
                  Input details match an active security threat entry in the directory.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-rose-600 text-white text-[10px] font-black rounded-lg uppercase">
              Risk: {matchedBlacklistEntry.riskLevel || 'HIGH'}
            </span>
          </div>

          <div className="p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl text-xs space-y-1 font-mono border border-rose-200 dark:border-rose-800">
            <div><strong>Matched Name / Entity:</strong> {matchedBlacklistEntry.name} ({matchedBlacklistEntry.company})</div>
            <div><strong>Flag Reason:</strong> <span className="text-rose-700 font-bold">{matchedBlacklistEntry.reason}</span></div>
            <div><strong>Added By:</strong> {matchedBlacklistEntry.addedBy} on {matchedBlacklistEntry.addedDate}</div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overrideSecurity}
                onChange={e => setOverrideSecurity(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
              />
              Authorized Duty Officer Security Override
            </label>

            {overrideSecurity && (
              <input
                type="text"
                placeholder="Reason for security override..."
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="flex-1 ml-3 px-3 py-1 bg-white dark:bg-slate-900 border border-rose-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            )}
          </div>
        </div>
      )}

      {/* REAL-TIME WHITELIST CONFIRMATION PANEL */}
      {matchedWhitelistEntry && !matchedBlacklistEntry && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 rounded-2xl flex items-center justify-between text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <ShieldCheck size={18} className="text-emerald-600" />
            <span>WHITELIST VIP MATCH: {matchedWhitelistEntry.name} ({matchedWhitelistEntry.reason})</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-black text-[10px] uppercase">
            Fast-Track Clearance
          </span>
        </div>
      )}

      {/* CHECK-IN FORM */}
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        
        {/* Section 1: Visitor Information */}
        <div className="space-y-3">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-1.5">
            <User size={14} className="text-[#007BC4]" /> 1. Guest & Organization Details
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Visitor Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. David Chen"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Organization / Vendor <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Apex Scaffold Solutions"
                value={formData.company}
                onChange={e => setFormData({...formData, company: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Email Address</label>
              <input
                type="email"
                placeholder="david.chen@apex.com"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="+1 (555) 345-6789"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">ID Document Type</label>
              <select
                value={formData.idDocType}
                onChange={e => setFormData({...formData, idDocType: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
              >
                <option value="Driver License">Driver License</option>
                <option value="Passport">Passport</option>
                <option value="Government ID">Government ID</option>
                <option value="Commercial Driver License">Commercial Driver License (CDL)</option>
                <option value="State ID">State ID</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">ID Document Number</label>
              <input
                type="text"
                placeholder="e.g. DL-CA-99210"
                value={formData.idDocNumber}
                onChange={e => setFormData({...formData, idDocNumber: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Host & Location Info */}
        <div className="space-y-3">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-1.5">
            <Building size={14} className="text-[#007BC4]" /> 2. Host Officer & Site Access
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Host Officer Email/Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="host.officer@facility.com"
                value={formData.host}
                onChange={e => setFormData({...formData, host: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Target Sector / Location</label>
              <select
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none"
              >
                <option value="Gate 1 Gatehouse & Welcome Center">Gate 1 Gatehouse & Welcome Center</option>
                <option value="Structure & Scaffolding (L1-L4)">Structure & Scaffolding (L1-L4)</option>
                <option value="Confined Shaft & Tunneling">Confined Shaft & Tunneling</option>
                <option value="Heavy Crane & Exclusion Area">Heavy Crane & Exclusion Area</option>
                <option value="Site Management Office">Site Management Office</option>
                <option value="Excavation & Foundation Pit">Excavation & Foundation Pit</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Visit Purpose</label>
              <input
                type="text"
                placeholder="e.g. Scaffold Inspection"
                value={formData.purpose}
                onChange={e => setFormData({...formData, purpose: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Vehicle & RFID Tag Assignment */}
        <div className="space-y-3">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-1.5">
            <CreditCard size={14} className="text-[#007BC4]" /> 3. Temporary RFID Badge & Vehicle Access
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                Assigned RFID Tag ID
                <button
                  type="button"
                  onClick={generateNewTagId}
                  className="text-[10px] text-[#007BC4] hover:underline flex items-center gap-0.5"
                >
                  <RefreshCw size={10} /> Auto-Gen
                </button>
              </label>
              <input
                type="text"
                required
                value={formData.rfidTag}
                onChange={e => setFormData({...formData, rfidTag: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-[#007BC4] outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Vehicle License Plate</label>
              <input
                type="text"
                placeholder="VAN-4022"
                value={formData.vehiclePlate}
                onChange={e => setFormData({...formData, vehiclePlate: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono uppercase outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Vehicle Type</label>
              <select
                value={formData.vehicleType}
                onChange={e => setFormData({...formData, vehicleType: e.target.value})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
              >
                <option value="Sedan">Sedan / SUV</option>
                <option value="Utility Work Van">Utility Work Van</option>
                <option value="Flatbed Truck">Flatbed Truck</option>
                <option value="Concrete Mixer">Concrete Mixer Truck</option>
                <option value="Government SUV">Government / Audit SUV</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Pass Validity (Hours)</label>
              <select
                value={formData.validHours}
                onChange={e => setFormData({...formData, validHours: Number(e.target.value)})}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
              >
                <option value={4}>4 Hours (Short Visit)</option>
                <option value={8}>8 Hours (Standard Shift)</option>
                <option value={12}>12 Hours (Extended Shift)</option>
                <option value={24}>24 Hours (Overnight Pass)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {matchedBlacklistEntry && !overrideSecurity ? (
              <span className="text-rose-600 font-bold flex items-center gap-1">
                <AlertTriangle size={14} /> Submitting will DENY entry and raise security alert.
              </span>
            ) : (
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <CheckCircle2 size={14} /> Ready to issue badge & generate database access token.
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md transition flex items-center gap-2 ${
              matchedBlacklistEntry && !overrideSecurity
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-[#007BC4] hover:bg-blue-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Processing Check-in...
              </>
            ) : matchedBlacklistEntry && !overrideSecurity ? (
              <>
                <ShieldAlert size={15} /> Refuse & Log Security Block
              </>
            ) : (
              <>
                <UserCheck size={15} /> Confirm Check-in & Issue RFID Badge
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
