import React, { useState, useEffect } from 'react';
import { 
  QrCode, ShieldAlert, AlertTriangle, CheckCircle2, 
  Clock, Copy, Printer, RefreshCw, Key, Scan
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { collection, setDoc, doc, onSnapshot, updateDoc, db } from '../lib/db';
import { VisitorRecord, SecurityListItem } from './VisitorsTab';

export interface VisitorAccessToken {
  tokenId: string;
  visitorId: string;
  visitorName: string;
  company: string;
  host: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'USED';
  createdAt: string;
  expiresAt: string;
  allowedZones: string[];
  maxUsages: number;
  scanCount: number;
}

export interface VisitorAccessLog {
  id: string;
  tokenId: string;
  visitorName: string;
  gate: string;
  status: 'GRANTED' | 'EXPIRED' | 'DENIED' | 'REVOKED' | 'INVALID';
  timestamp: string;
  message?: string;
}

interface VisitorQrGeneratorProps {
  visitorsList?: VisitorRecord[];
  securityListProps?: SecurityListItem[];
}

export default function VisitorQrGenerator({ visitorsList = [], securityListProps = [] }: VisitorQrGeneratorProps) {
  const [tokens, setTokens] = useState<VisitorAccessToken[]>([]);
  const [logs, setLogs] = useState<VisitorAccessLog[]>([]);
  const [visitors, setVisitors] = useState<VisitorRecord[]>(visitorsList);
  const [securityList, setSecurityList] = useState<SecurityListItem[]>(securityListProps);

  // Generator Form State
  const [selectedVisitorId, setSelectedVisitorId] = useState<string>('');
  const [customGuest, setCustomGuest] = useState({
    name: '',
    company: '',
    host: 'marcus.vance@buildcorp.com'
  });
  const [durationHours, setDurationHours] = useState<number>(8);
  const [selectedZones, setSelectedZones] = useState<string[]>(['Gate 1 Gatehouse', 'Site Office']);
  const [maxUsages, setMaxUsages] = useState<number>(10);
  const [activeToken, setActiveToken] = useState<VisitorAccessToken | null>(null);

  // Scanner Simulator State
  const [scanInputToken, setScanInputToken] = useState<string>('');
  const [scanGate, setScanGate] = useState<string>('Gate 1 Main Entrance');
  const [scannerResult, setScannerResult] = useState<{
    status: 'GRANTED' | 'EXPIRED' | 'DENIED' | 'REVOKED' | 'INVALID';
    token?: VisitorAccessToken;
    message: string;
    timestamp: string;
  } | null>(null);

  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Subscribe to Tokens, Logs, Visitors if needed
  useEffect(() => {
    const unsubTokens = onSnapshot(collection(db, 'visitor_access_tokens'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), tokenId: d.id } as VisitorAccessToken));
      setTokens(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    const unsubLogs = onSnapshot(collection(db, 'visitor_access_logs'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as VisitorAccessLog));
      setLogs(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    if (visitorsList.length === 0) {
      onSnapshot(collection(db, 'visitors'), (snap) => {
        const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as VisitorRecord));
        setVisitors(data);
      });
    }

    if (securityListProps.length === 0) {
      onSnapshot(collection(db, 'visitor_security_list'), (snap) => {
        const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as SecurityListItem));
        setSecurityList(data);
      });
    }

    return () => {
      unsubTokens();
      unsubLogs();
    };
  }, []);

  // When selected visitor dropdown changes
  const handleSelectVisitor = (vid: string) => {
    setSelectedVisitorId(vid);
    if (vid) {
      const v = visitors.find(item => item.id === vid);
      if (v) {
        setCustomGuest({
          name: v.name,
          company: v.company,
          host: v.host
        });
      }
    }
  };

  const handleToggleZone = (zone: string) => {
    if (selectedZones.includes(zone)) {
      setSelectedZones(selectedZones.filter(z => z !== zone));
    } else {
      setSelectedZones([...selectedZones, zone]);
    }
  };

  // Generate Token
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGuest.name) return;

    setIsGenerating(true);
    try {
      const tokenRandom = Math.random().toString(36).substring(2, 8).toUpperCase();
      const tokenId = `TOK-${tokenRandom}-${selectedVisitorId || 'GUEST'}`;
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationHours * 3600 * 1000).toISOString();

      const newToken: VisitorAccessToken = {
        tokenId,
        visitorId: selectedVisitorId || `GUEST-${Date.now()}`,
        visitorName: customGuest.name,
        company: customGuest.company || 'External Guest',
        host: customGuest.host || 'marcus.vance@buildcorp.com',
        status: 'ACTIVE',
        createdAt: now.toISOString(),
        expiresAt,
        allowedZones: selectedZones.length > 0 ? selectedZones : ['Gate 1 Gatehouse'],
        maxUsages,
        scanCount: 0
      };

      await setDoc(doc(db, 'visitor_access_tokens', tokenId), newToken);
      setActiveToken(newToken);
      setNotificationMsg(`Temporary Access Token ${tokenId} generated and stored in database!`);
    } catch (err) {
      console.error('Failed to generate access token:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Scanner Validation
  const handleValidateScan = async (codeToTest?: string) => {
    const code = (codeToTest || scanInputToken).trim();
    if (!code) return;

    const now = new Date();
    const timestampStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Look up token in state or DB
    const token = tokens.find(t => (t.tokenId || "").toUpperCase() === (code || "").toUpperCase());

    let resultStatus: 'GRANTED' | 'EXPIRED' | 'DENIED' | 'REVOKED' | 'INVALID' = 'GRANTED';
    let resultMessage = '';

    if (!token) {
      resultStatus = 'INVALID';
      resultMessage = `Token '${code}' not found in database registry. Access Refused.`;
    } else {
      // Check Blacklist
      const isBlacklisted = securityList.some(s => 
        s.type === 'BLACKLIST' && 
        (s.name || "").toLowerCase() === (token.visitorName || "").toLowerCase()
      );

      if (isBlacklisted) {
        resultStatus = 'DENIED';
        resultMessage = `CRITICAL SECURITY BLOCK: Guest ${token.visitorName} is on the security blacklist!`;
      } else if (token.status === 'REVOKED') {
        resultStatus = 'REVOKED';
        resultMessage = `Access Token ${token.tokenId} has been explicitly revoked by security.`;
      } else if (new Date(token.expiresAt).getTime() < now.getTime()) {
        resultStatus = 'EXPIRED';
        resultMessage = `Access Token ${token.tokenId} expired at ${new Date(token.expiresAt).toLocaleString()}.`;
      } else if (token.scanCount >= token.maxUsages) {
        resultStatus = 'EXPIRED';
        resultMessage = `Maximum allowed usages (${token.maxUsages}) reached for Token ${token.tokenId}.`;
      } else {
        resultStatus = 'GRANTED';
        resultMessage = `ACCESS GRANTED for ${token.visitorName} (${token.company}). Host: ${token.host}`;
        
        // Increment scan count in DB
        try {
          await updateDoc(doc(db, 'visitor_access_tokens', token.tokenId), {
            scanCount: (token.scanCount || 0) + 1
          });
        } catch (e) {
          console.warn('Scan count update issue:', e);
        }
      }
    }

    // Record Access Log
    const logId = `LOG-${Date.now()}`;
    const logEntry: VisitorAccessLog = {
      id: logId,
      tokenId: code,
      visitorName: token ? token.visitorName : 'Unknown Token',
      gate: scanGate,
      status: resultStatus,
      timestamp: now.toISOString(),
      message: resultMessage
    };

    try {
      await setDoc(doc(db, 'visitor_access_logs', logId), logEntry);
    } catch (e) {
      console.warn('Log entry issue:', e);
    }

    setScannerResult({
      status: resultStatus,
      token,
      message: resultMessage,
      timestamp: timestampStr
    });
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      await updateDoc(doc(db, 'visitor_access_tokens', tokenId), {
        status: 'REVOKED'
      });
      setNotificationMsg(`Access token ${tokenId} revoked!`);
    } catch (err) {
      console.error('Failed to revoke token:', err);
    }
  };

  const handleCopyToken = (text: string) => {
    navigator.clipboard.writeText(text);
    setNotificationMsg('Token copied to clipboard!');
    setTimeout(() => setNotificationMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Banner */}
      {notificationMsg && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {notificationMsg}
          </span>
          <button onClick={() => setNotificationMsg(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* TOP SECTION: GENERATOR & SCANNER SIMULATOR GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* PANEL 1: QR TOKEN GENERATOR */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#007BC4]" />
                Guest QR Access Token Generator
              </h3>
              <p className="text-xs text-slate-500 font-medium">Issue time-bound QR passes stored in Firestore for gate verification.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#007BC4] border border-blue-200">
              Database Sync On
            </span>
          </div>

          <form onSubmit={handleGenerateToken} className="space-y-3 text-xs">
            
            {/* Select existing visitor or custom */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Select Pre-Registered Visitor (Optional)
              </label>
              <select
                value={selectedVisitorId}
                onChange={e => handleSelectVisitor(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
              >
                <option value="">-- Enter Custom Guest Details Below --</option>
                {visitors.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.company}) - Host: {v.host} [{v.status}]
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Guest Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Sarah Lin"
                  value={customGuest.name}
                  onChange={e => setCustomGuest({...customGuest, name: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#007BC4]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Organization / Vendor</label>
                <input
                  type="text"
                  placeholder="e.g. Geotechnical Soil Testing"
                  value={customGuest.company}
                  onChange={e => setCustomGuest({...customGuest, company: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#007BC4]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Host Officer</label>
                <input
                  type="text"
                  required
                  value={customGuest.host}
                  onChange={e => setCustomGuest({...customGuest, host: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Token Validity Duration</label>
                <select
                  value={durationHours}
                  onChange={e => setDurationHours(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                >
                  <option value={2}>2 Hours (Quick Access)</option>
                  <option value={8}>8 Hours (Standard Work Shift)</option>
                  <option value={12}>12 Hours (Extended Shift)</option>
                  <option value={24}>24 Hours (1 Day Pass)</option>
                  <option value={48}>48 Hours (2 Day Multi-Pass)</option>
                </select>
              </div>
            </div>

            {/* Access Zones checkboxes */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Allowed Access Zones</label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Gate 1 Gatehouse',
                  'Site Office',
                  'Structure & Scaffolding',
                  'Confined Shaft',
                  'Heavy Crane Area',
                  'Excavation Pit'
                ].map(zone => {
                  const active = selectedZones.includes(zone);
                  return (
                    <button
                      type="button"
                      key={zone}
                      onClick={() => handleToggleZone(zone)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        active 
                          ? 'bg-[#007BC4] text-white border-[#007BC4]' 
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {zone}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <QrCode size={16} />}
              Generate & Store Guest QR Token
            </button>
          </form>

          {/* ACTIVE TOKEN PREVIEW */}
          {activeToken && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm shrink-0">
                <QRCode value={activeToken.tokenId} size={110} />
              </div>

              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[#007BC4] font-mono text-sm">{activeToken.tokenId}</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                    {activeToken.status}
                  </span>
                </div>

                <div className="text-slate-800 dark:text-slate-200 font-bold">{activeToken.visitorName} ({activeToken.company})</div>
                <div className="text-slate-500">Host: {activeToken.host}</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Expires: {new Date(activeToken.expiresAt).toLocaleString()}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleCopyToken(activeToken.tokenId)}
                    className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 hover:bg-slate-100"
                  >
                    <Copy size={12} /> Copy Token
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-2.5 py-1 bg-[#007BC4] text-white rounded-lg font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Printer size={12} /> Print Pass
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PANEL 2: GATE SCANNER VALIDATION SIMULATOR */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Scan className="w-5 h-5 text-emerald-600" />
                Gatehouse QR Reader & Scanner Validator
              </h3>
              <p className="text-xs text-slate-500 font-medium">Simulate gate optical scanners validating guest tokens against Firestore & Blacklist.</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Scanner Online
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Scan QR Access Token String
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter or paste token e.g. TOK-XXXXXX..."
                    value={scanInputToken}
                    onChange={e => setScanInputToken(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                  />
                  {scanInputToken && (
                    <button onClick={() => setScanInputToken('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">×</button>
                  )}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Gate Reader</label>
                <select
                  value={scanGate}
                  onChange={e => setScanGate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium"
                >
                  <option value="Gate 1 Main Entrance">Gate 1 Main</option>
                  <option value="Gate 2 Material Dock">Gate 2 Dock</option>
                  <option value="Site Office Turnstile">Site Office</option>
                  <option value="VIP Inspector Gate">VIP Gate</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => handleValidateScan()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <Scan size={16} /> Simulate Scanner Optical Read
            </button>

            {/* Quick Test Token Buttons */}
            {tokens.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Quick-Test Active Database Tokens:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {tokens.map(t => (
                    <button
                      key={t.tokenId}
                      onClick={() => { setScanInputToken(t.tokenId); handleValidateScan(t.tokenId); }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition ${
                        t.status === 'REVOKED' 
                          ? 'bg-rose-50 text-rose-700 border-rose-200' 
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#007BC4]'
                      }`}
                    >
                      {t.tokenId} ({(t.visitorName || "").split(' ')[0]})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCANNER RESULT DISPLAY BOX */}
            {scannerResult && (
              <div className={`p-4 rounded-2xl border space-y-3 animate-in zoom-in-95 duration-200 ${
                scannerResult.status === 'GRANTED'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-950 dark:text-emerald-200'
                  : scannerResult.status === 'EXPIRED' || scannerResult.status === 'REVOKED'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-950 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-950 dark:text-rose-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wide">
                    {scannerResult.status === 'GRANTED' && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                    {scannerResult.status === 'EXPIRED' && <Clock className="w-6 h-6 text-amber-600" />}
                    {scannerResult.status === 'REVOKED' && <AlertTriangle className="w-6 h-6 text-amber-600" />}
                    {(scannerResult.status === 'DENIED' || scannerResult.status === 'INVALID') && <ShieldAlert className="w-6 h-6 text-rose-600" />}
                    <span>{scannerResult.status === 'GRANTED' ? 'ACCESS GRANTED' : `ACCESS DENIED: ${scannerResult.status}`}</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-75">{scannerResult.timestamp}</span>
                </div>

                <p className="text-xs font-semibold">{scannerResult.message}</p>

                {scannerResult.token && (
                  <div className="p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl space-y-1 font-mono text-[11px] border border-slate-200 dark:border-slate-700">
                    <div><strong>Guest:</strong> {scannerResult.token.visitorName} ({scannerResult.token.company})</div>
                    <div><strong>Host:</strong> {scannerResult.token.host}</div>
                    <div><strong>Allowed Zones:</strong> {scannerResult.token.allowedZones.join(', ')}</div>
                    <div><strong>Scans Used:</strong> {scannerResult.token.scanCount} / {scannerResult.token.maxUsages}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* BOTTOM SECTION: DATABASE TOKENS & ACCESS LOGS DIRECTORY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Database Access Tokens Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Key size={16} className="text-[#007BC4]" />
              Stored Visitor Access Tokens ({tokens.length})
            </h4>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold sticky top-0">
                <tr>
                  <th className="p-2">Token ID</th>
                  <th className="p-2">Guest / Org</th>
                  <th className="p-2">Expires At</th>
                  <th className="p-2">Scans</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tokens.map(t => (
                  <tr key={t.tokenId} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                    <td className="p-2 font-mono font-bold text-[#007BC4]">{t.tokenId}</td>
                    <td className="p-2">
                      <div className="font-bold text-slate-900 dark:text-white">{t.visitorName}</div>
                      <div className="text-[10px] text-slate-400">{t.company}</div>
                    </td>
                    <td className="p-2 font-mono text-[11px] text-slate-500">
                      {new Date(t.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-2 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {t.scanCount || 0} / {t.maxUsages}
                    </td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        t.status === 'REVOKED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      {t.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRevokeToken(t.tokenId)}
                          className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[10px] font-bold transition"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {tokens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      No temporary access tokens stored in database yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-time Gate Access Validation Logs */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Clock size={16} className="text-[#007BC4]" />
            Real-time Scanner Validation Logs
          </h4>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {logs.map(log => (
              <div key={log.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs space-y-1 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">{log.visitorName}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    log.status === 'GRANTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {log.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>{log.gate}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs">
                No scanner validation logs recorded yet.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
