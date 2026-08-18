import React, { useState, useEffect } from 'react';
import { 
  Sparkles, RefreshCw, AlertTriangle, ShieldAlert, Clock, 
  Database, Play, CheckCircle2, ChevronDown, ChevronUp, Radio,
  Layers, HardHat, FileSpreadsheet, X, Zap
} from 'lucide-react';

export default function DemoControlBar() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isTriggering, setIsTriggering] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

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

  return (
    <>
      {/* Top Banner */}
      <aside 
        aria-label="Demo mode status and controls"
        className="w-full bg-gradient-to-r from-blue-900/95 via-indigo-900/95 to-slate-900/95 border-b border-blue-500/30 text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3 shadow-inner shrink-0 relative z-20"
      >
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
          {/* Quick Trigger Buttons */}
          <button
            onClick={handleSeedAll}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-semibold transition cursor-pointer text-[11px] shadow-sm border border-blue-400/30"
            title="Populate or reset all Firebase/MongoDB collections with synthetic enterprise datasets"
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
