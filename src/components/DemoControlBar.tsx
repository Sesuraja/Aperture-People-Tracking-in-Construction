import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, RefreshCw, AlertTriangle, ShieldAlert, Clock,
  Database, Play, CheckCircle2, ChevronDown, ChevronUp, Radio,
  Layers, HardHat, FileSpreadsheet, X, Zap, Square, Wifi,
  WifiOff, Tag, Settings2, Activity, CircleAlert
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types mirroring the server-side MockSimulatorStatus
// ---------------------------------------------------------------------------

interface MockReaderStatus {
  readerId: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  port: number;
  connectionMode: string;
  status: 'ONLINE' | 'OFFLINE' | 'RECONNECTING' | 'SCANNING';
  simulated: true;
  totalScansGenerated: number;
  lastEventAt?: string;
  lastError?: string;
}

interface SimulatorStatus {
  running: boolean;
  scenario: string;
  readers: MockReaderStatus[];
  totalEventsGenerated: number;
  totalEventsSuppressedByDedup: number;
  startedAt?: string;
  config?: {
    intervalMs?: number;
    rssiMin?: number;
    rssiMax?: number;
    scenario?: string;
    tagCount?: number;
    readerCount?: number;
  };
}

const SCENARIOS = [
  { value: 'construction_site_movement', label: 'Construction Site Movement' },
  { value: 'random', label: 'Random Movement' },
  { value: 'restricted_zone_breach', label: 'Restricted Zone Breach' },
  { value: 'lone_worker', label: 'Lone Worker Welfare Check' },
  { value: 'mass_evacuation', label: 'Mass Evacuation Drill' },
];

// ---------------------------------------------------------------------------
// Status dot helper
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: MockReaderStatus['status'] | 'running' | 'stopped' }) {
  const colorMap: Record<string, string> = {
    ONLINE:       'bg-emerald-400',
    SCANNING:     'bg-cyan-400 animate-pulse',
    RECONNECTING: 'bg-amber-400 animate-pulse',
    OFFLINE:      'bg-rose-500',
    running:      'bg-cyan-400 animate-pulse',
    stopped:      'bg-slate-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colorMap[status] || 'bg-slate-400'}`} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DemoControlBar() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isTriggering, setIsTriggering] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  // GAO Simulator panel state
  const [simPanelOpen, setSimPanelOpen] = useState(false);
  const [simStatus, setSimStatus] = useState<SimulatorStatus | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simConfig, setSimConfig] = useState({
    intervalMs: 500,
    rssiMin: -75,
    rssiMax: -40,
    scenario: 'construction_site_movement',
  });

  // -------------------------------------------------------------------------
  // Existing handlers
  // -------------------------------------------------------------------------

  const fetchStatus = async () => {
    setLoadingCounts(true);
    try {
      const res = await fetch('/api/demo/status');
      const data = await res.json();
      if (data.counts) {
        setCounts(data.counts);
      }
    } catch (e) {
      console.warn('Failed to fetch demo status:', e);
    } finally {
      setLoadingCounts(false);
    }
  };

  const handleSeedAll = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/demo/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ text: 'All 22 enterprise collections re-seeded with synthetic demo data!', type: 'success' });
        fetchStatus();
        window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
        window.dispatchEvent(new CustomEvent('gao_refresh_data'));
        window.dispatchEvent(new CustomEvent('gao-refresh-claims'));
      } else {
        setNotification({ text: 'Seeding completed with warnings: ' + (data.error || 'Check console'), type: 'info' });
      }
    } catch (err: any) {
      setNotification({ text: 'Failed to seed demo data: ' + err.message, type: 'error' });
    } finally {
      setIsSeeding(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleTriggerEvent = async (eventType: string, label: string) => {
    setIsTriggering(eventType);
    try {
      const res = await fetch('/api/demo/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType })
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ text: `Simulated event triggered: ${label}`, type: 'success' });
        window.dispatchEvent(new CustomEvent('gao_map_data_updated'));
        window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      } else {
        setNotification({ text: `Event error: ${data.error}`, type: 'error' });
      }
    } catch (err: any) {
      setNotification({ text: 'Error triggering event: ' + err.message, type: 'error' });
    } finally {
      setIsTriggering(null);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // -------------------------------------------------------------------------
  // GAO Simulator handlers
  // -------------------------------------------------------------------------

  const fetchSimStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/demo/gao-simulator/status');
      if (res.ok) {
        const data = await res.json();
        setSimStatus(data);
      }
    } catch {}
  }, []);

  // Poll simulator status every 3 seconds when panel is open
  useEffect(() => {
    if (!simPanelOpen) return;
    fetchSimStatus();
    const id = setInterval(fetchSimStatus, 3000);
    return () => clearInterval(id);
  }, [simPanelOpen, fetchSimStatus]);

  const handleSimStart = async () => {
    setSimLoading(true);
    try {
      const res = await fetch('/api/demo/gao-simulator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simConfig),
      });
      const data = await res.json();
      if (data.success) {
        setSimStatus(data.status);
        setNotification({ text: 'GAO216031A Simulator started — RFID events flowing through Aperture pipeline.', type: 'success' });
        window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      } else {
        setNotification({ text: 'Simulator start error: ' + data.error, type: 'error' });
      }
    } catch (err: any) {
      setNotification({ text: 'Error: ' + err.message, type: 'error' });
    } finally {
      setSimLoading(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleSimStop = async () => {
    setSimLoading(true);
    try {
      const res = await fetch('/api/demo/gao-simulator/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSimStatus(data.status);
        setNotification({ text: 'GAO216031A Simulator stopped.', type: 'info' });
      }
    } catch (err: any) {
      setNotification({ text: 'Error: ' + err.message, type: 'error' });
    } finally {
      setSimLoading(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleReaderToggle = async (readerId: string, online: boolean) => {
    try {
      const res = await fetch('/api/demo/gao-simulator/reader-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readerId, online }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ text: `Reader ${readerId} set to ${online ? 'ONLINE' : 'OFFLINE'}`, type: 'success' });
        await fetchSimStatus();
      }
    } catch (err: any) {
      setNotification({ text: 'Reader toggle error: ' + err.message, type: 'error' });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleReaderReconnect = async (readerId: string) => {
    try {
      const res = await fetch('/api/demo/gao-simulator/reader-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readerId, reconnect: true }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ text: `Reconnect cycle started for ${readerId} (OFFLINE → RECONNECTING → ONLINE)`, type: 'info' });
      }
    } catch {}
    setTimeout(() => setNotification(null), 4000);
  };

  const handleInjectUnknown = async () => {
    try {
      const res = await fetch('/api/demo/gao-simulator/inject-unknown', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNotification({ text: 'Unknown/unassigned RFID tag injected — check Alerts & Incidents tabs.', type: 'info' });
        window.dispatchEvent(new CustomEvent('gao_refresh_data'));
      }
    } catch (err: any) {
      setNotification({ text: 'Error: ' + err.message, type: 'error' });
    } finally {
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const simRunning = simStatus?.running ?? false;

  return (
    <>
      {/* Top Banner */}
      <aside
        aria-label="Demo mode status and controls"
        className="w-full bg-gradient-to-r from-blue-900/95 via-indigo-900/95 to-slate-900/95 border-b border-blue-500/30 text-white text-xs shadow-inner shrink-0 relative z-20"
      >
        {/* Main control row */}
        <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span className="tracking-wide uppercase text-[10px]">Demo Mode Active</span>
            </div>
            <span className="text-slate-300 font-medium hidden sm:inline text-[11px]">
              Synthetic Enterprise Data Loaded • Live Tag Simulation Active • Changes persist to Database
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Existing buttons */}
            <button
              onClick={handleSeedAll}
              disabled={isSeeding}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-semibold transition cursor-pointer text-[11px] shadow-sm border border-blue-400/30"
              title="Populate or reset all MongoDB collections with synthetic enterprise datasets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
              <span>{isSeeding ? 'Seeding DB...' : 'Re-Seed Demo Data'}</span>
            </button>

            <button
              onClick={() => handleTriggerEvent('sos_alarm', 'SOS Panic Alarm')}
              disabled={!!isTriggering}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 active:scale-95 disabled:opacity-50 text-white font-semibold transition cursor-pointer text-[11px] shadow-sm border border-rose-400/30"
              title="Simulate a worker pressing SOS distress button in Deep Excavation Shaft"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-200" />
              <span>Simulate SOS</span>
            </button>

            <button
              onClick={() => handleTriggerEvent('geofence_breach', 'Geofence Breach')}
              disabled={!!isTriggering}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-600/90 hover:bg-amber-500 active:scale-95 disabled:opacity-50 text-white font-semibold transition cursor-pointer text-[11px] shadow-sm border border-amber-400/30"
              title="Simulate uncertified entry into Tower Crane Exclusion Zone"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-200" />
              <span>Geofence Breach</span>
            </button>

            <button
              onClick={() => handleTriggerEvent('attendance_punch', 'Gate Turnstile RFID Scan')}
              disabled={!!isTriggering}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-semibold transition cursor-pointer text-[11px] shadow-sm border border-emerald-400/30"
              title="Simulate worker checking in through Main Gate 1 UHF RFID Turnstile"
            >
              <HardHat className="w-3.5 h-3.5 text-emerald-200" />
              <span>Simulate RFID Punch</span>
            </button>

            {/* GAO Simulator toggle button */}
            <button
              onClick={() => {
                setSimPanelOpen(v => !v);
                if (!simPanelOpen) fetchSimStatus();
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] shadow-sm border font-semibold
                ${simPanelOpen
                  ? 'bg-violet-700/90 border-violet-400/50 text-white'
                  : 'bg-violet-900/60 border-violet-500/30 text-violet-200 hover:bg-violet-700/70 hover:text-white'
                }`}
              title="Open GAO216031A RFID Simulator controls"
            >
              <Radio className={`w-3.5 h-3.5 ${simRunning ? 'text-cyan-300 animate-pulse' : 'text-violet-300'}`} />
              <span>GAO Simulator</span>
              {simRunning && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />
              )}
              {simPanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              onClick={() => {
                fetchStatus();
                setStatsModalOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[11px] border border-slate-700"
              title="View database record counts across collections"
            >
              <Database className="w-3 h-3 text-cyan-400" />
              <span>DB Records</span>
            </button>
          </div>
        </div>

        {/* GAO Simulator expanded panel */}
        {simPanelOpen && (
          <div className="border-t border-violet-500/20 bg-slate-950/80 px-4 py-3">
            {/* Panel header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-violet-400" />
                <span className="font-bold text-violet-200 text-xs tracking-wide uppercase">GAO216031A Simulator</span>
                {/* SIMULATED badge — always visible, never shown as physical hardware */}
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 border border-amber-400/40 text-amber-300 uppercase tracking-wider">
                  SIMULATED
                </span>
                {simRunning && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 uppercase tracking-wider">
                    ACTIVE
                  </span>
                )}
              </div>
              {simStatus && (
                <span className="text-[10px] text-slate-400">
                  Events: {simStatus.totalEventsGenerated} generated, {simStatus.totalEventsSuppressedByDedup} dedup-suppressed
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-4 items-start">
              {/* Config controls */}
              <div className="flex flex-wrap gap-3 items-end flex-1 min-w-0">
                {/* Scenario */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Scenario</label>
                  <select
                    value={simConfig.scenario}
                    onChange={e => setSimConfig(c => ({ ...c, scenario: e.target.value }))}
                    disabled={simRunning}
                    className="text-[11px] bg-slate-800 border border-slate-600 text-white rounded-md px-2 py-1 min-w-[200px] disabled:opacity-50 cursor-pointer"
                  >
                    {SCENARIOS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Interval */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Interval (ms)</label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={simConfig.intervalMs}
                    onChange={e => setSimConfig(c => ({ ...c, intervalMs: Number(e.target.value) }))}
                    disabled={simRunning}
                    className="text-[11px] bg-slate-800 border border-slate-600 text-white rounded-md px-2 py-1 w-24 disabled:opacity-50"
                  />
                </div>

                {/* RSSI range */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">RSSI Range (dBm)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      max={-20}
                      min={-100}
                      value={simConfig.rssiMin}
                      onChange={e => setSimConfig(c => ({ ...c, rssiMin: Number(e.target.value) }))}
                      disabled={simRunning}
                      className="text-[11px] bg-slate-800 border border-slate-600 text-white rounded-md px-2 py-1 w-20 disabled:opacity-50"
                      placeholder="Min"
                    />
                    <span className="text-slate-500 text-[10px]">to</span>
                    <input
                      type="number"
                      max={-20}
                      min={-100}
                      value={simConfig.rssiMax}
                      onChange={e => setSimConfig(c => ({ ...c, rssiMax: Number(e.target.value) }))}
                      disabled={simRunning}
                      className="text-[11px] bg-slate-800 border border-slate-600 text-white rounded-md px-2 py-1 w-20 disabled:opacity-50"
                      placeholder="Max"
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 items-end shrink-0">
                {!simRunning ? (
                  <button
                    onClick={handleSimStart}
                    disabled={simLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-semibold transition text-[11px] border border-emerald-400/30"
                    title="Start GAO216031A simulator — events flow through existing Aperture pipeline"
                  >
                    <Play className={`w-3.5 h-3.5 ${simLoading ? 'animate-pulse' : ''}`} />
                    <span>{simLoading ? 'Starting...' : '▶ Start Simulation'}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSimStop}
                    disabled={simLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700/90 hover:bg-rose-600 active:scale-95 disabled:opacity-50 text-white font-semibold transition text-[11px] border border-rose-400/30"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>{simLoading ? 'Stopping...' : '■ Stop Simulation'}</span>
                  </button>
                )}

                <button
                  onClick={handleInjectUnknown}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-700/80 hover:bg-orange-600 active:scale-95 text-white font-semibold transition text-[11px] border border-orange-400/30"
                  title="Inject an unregistered RFID tag to test unknown-tag detection workflow"
                >
                  <Tag className="w-3.5 h-3.5 text-orange-200" />
                  <span>Inject Unknown Tag</span>
                </button>
              </div>
            </div>

            {/* Reader health rows */}
            {simStatus?.readers && simStatus.readers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {simStatus.readers.map(reader => (
                  <div
                    key={reader.readerId}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700/60 text-[11px]"
                  >
                    <StatusDot status={reader.status} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-white leading-none">{reader.readerId}</span>
                      <span className="text-slate-400 text-[10px] leading-none mt-0.5">
                        {reader.model} · {reader.ipAddress}:{reader.port} · {reader.totalScansGenerated} scans
                      </span>
                    </div>
                    {/* SIMULATED badge on each reader — never shows as physical */}
                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-500/15 border border-amber-400/30 text-amber-400 uppercase shrink-0">SIM</span>
                    <div className="flex gap-1 shrink-0 ml-1">
                      <button
                        onClick={() => handleReaderToggle(reader.readerId, true)}
                        disabled={reader.status !== 'OFFLINE'}
                        title="Set reader ONLINE"
                        className="p-1 rounded bg-emerald-700/50 hover:bg-emerald-600/70 disabled:opacity-30 transition"
                      >
                        <Wifi className="w-3 h-3 text-emerald-300" />
                      </button>
                      <button
                        onClick={() => handleReaderToggle(reader.readerId, false)}
                        disabled={reader.status === 'OFFLINE'}
                        title="Set reader OFFLINE"
                        className="p-1 rounded bg-rose-800/50 hover:bg-rose-700/70 disabled:opacity-30 transition"
                      >
                        <WifiOff className="w-3 h-3 text-rose-300" />
                      </button>
                      <button
                        onClick={() => handleReaderReconnect(reader.readerId)}
                        title="Simulate reconnect cycle (OFFLINE → RECONNECTING → ONLINE)"
                        className="p-1 rounded bg-amber-800/50 hover:bg-amber-700/70 transition"
                      >
                        <RefreshCw className="w-3 h-3 text-amber-300" />
                      </button>
                    </div>
                    {reader.lastError && (
                      <span title={reader.lastError}>
                        <CircleAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Info note */}
            <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
              ⚠ All events are <strong className="text-amber-400">SIMULATED</strong> — no physical GAO216031A hardware is connected.
              Events flow through the existing Aperture pipeline: validation → normalization → AI engine → MongoDB → WebSocket → Dashboard.
              Dedup suppresses repeated reads of the same tag in the same zone within 30 s.
            </p>
          </div>
        )}
      </aside>

      {/* Floating Notification Toast */}
      {notification && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom duration-200 border ${
          notification.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100' :
          notification.type === 'error' ? 'bg-rose-900/90 border-rose-500/50 text-rose-100' :
          'bg-blue-900/90 border-blue-500/50 text-blue-100'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Zap className="w-4 h-4 text-cyan-400 shrink-0" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Database Record Counts Modal */}
      {statsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#007BC4]" />
                <h3 className="font-bold text-white text-sm">Demo Mode Database Collections</h3>
              </div>
              <button
                onClick={() => setStatsModalOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-slate-400 mb-4">
                In Demo Mode, all 22 collections are pre-populated with synthetic enterprise datasets and fully accept real-time creates, updates, and deletes.
              </p>

              {loadingCounts ? (
                <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#007BC4]" />
                  <span>Loading database counts...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {Object.entries(counts).map(([col, count]) => (
                    <div key={col} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-300 truncate mr-2">{col}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-mono">
                        {count} {count === 1 ? 'doc' : 'docs'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleSeedAll}
                disabled={isSeeding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                <span>Re-Seed Entire Database</span>
              </button>
              <button
                onClick={() => setStatsModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
