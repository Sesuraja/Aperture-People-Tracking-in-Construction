import { Download, Sun, Moon, Calendar, Bell, Search, Command } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
import { AppModeContext } from '../App';
import ExportReportModal from './ExportReportModal';
import { ConnectionStatus } from '../lib/realtimeClients';
import { subscribeWsHealth } from '../lib/gaoSyncService';
import { ApertureLogoMark } from './ApertureLogo';

interface TopBarProps {
  onOpenCommandPalette?: () => void;
}

export default function TopBar({ onOpenCommandPalette }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [isExportOpen, setIsExportOpen] = useState(false);
  const { mode } = useContext(AppModeContext);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('Disconnected');
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; delayMs: number }>({ attempt: 0, delayMs: 1000 });
  
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const unsub = subscribeWsHealth((status, delayMs, attempt) => {
      setWsStatus(status);
      setRetryInfo({ attempt, delayMs });
    });
    return () => unsub();
  }, []);

  // Determine current active view category for compliance export
  let defaultCategory = 'attendance';
  if (location.pathname.includes('people')) defaultCategory = 'people';
  else if (location.pathname.includes('incidents')) defaultCategory = 'incidents';
  else if (location.pathname.includes('visitors')) defaultCategory = 'visitors';
  else if (location.pathname.includes('devices')) defaultCategory = 'devices';
  else if (location.pathname.includes('tags')) defaultCategory = 'tags';

  const savedUrl = localStorage.getItem('gao_api_url') || '';
  let displayHost = 'Standard Gateway';
  if (savedUrl) {
    try {
      const urlObj = new URL(savedUrl);
      displayHost = urlObj.hostname;
    } catch {
      displayHost = savedUrl.replace(/^https?:\/\//i, '').split('/')[0];
    }
  }

  return (
    <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-6 justify-between shrink-0 shadow-sm z-10 w-full relative transition-colors">
      <ExportReportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        defaultCategory={defaultCategory}
      />
      <div className="flex items-center gap-4">
        <div className="p-1.5 bg-blue-50 dark:bg-slate-800/90 rounded-xl border border-blue-100 dark:border-slate-700/80 shadow-2xs hidden md:flex items-center justify-center">
          <ApertureLogoMark size={26} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Construction Worker Tracking</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tracking-wide mt-0.5 font-medium">UHF RFID & AI Safety Tracking System</p>
        </div>

        {/* Global Command Palette Trigger Button */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden lg:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs ml-4"
          title="Open Command Palette (Cmd + K)"
        >
          <Search className="w-3.5 h-3.5 text-[#007BC4]" />
          <span className="text-xs font-medium">Search or jump to...</span>
          <kbd className="flex items-center gap-0.5 text-[10px] font-mono font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-2xs text-slate-600 dark:text-slate-300">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Export Data Button */}
        <button
          onClick={() => setIsExportOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-[#007BC4] hover:from-blue-700 hover:to-[#006aa9] text-white text-xs font-bold transition shadow-md hover:shadow-lg cursor-pointer"
          title="Download current view data as CSV or PDF report for EHS & site compliance"
        >
          <Download className="w-4 h-4 text-white" />
          <span>Export Data</span>
          <div className="flex items-center gap-0.5 text-[9px] bg-white/20 px-1.5 py-0.5 rounded font-mono font-bold">
            CSV / PDF
          </div>
        </button>

        {/* System Health LED Indicator */}
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-bold shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700/80 transition cursor-pointer"
          title={`WebSocket System Health: ${wsStatus}. Click to inspect hardware stream & settings.`}
        >
          <span className="relative flex h-2.5 w-2.5">
            {wsStatus === 'Connected' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
              </>
            ) : wsStatus === 'Reconnecting' || wsStatus === 'Connecting' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
            )}
          </span>

          <span className="hidden md:inline text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            System Health
          </span>

          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
              wsStatus === 'Connected'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : wsStatus === 'Reconnecting' || wsStatus === 'Connecting'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            {wsStatus === 'Connected'
              ? 'Streaming'
              : wsStatus === 'Reconnecting' || wsStatus === 'Connecting'
              ? `Reconnecting (${(retryInfo.delayMs / 1000).toFixed(0)}s)`
              : 'Disconnected'}
          </span>
        </button>

        {/* Dynamic Interactive API Connection Pill */}
        {mode === 'real' ? (
          <button 
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm hover:bg-emerald-100/75 transition cursor-pointer"
            title="Click to view full API credentials and execute dev queries"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">RFID Gate Live:</span>
            <span className="font-mono text-[10px] bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-emerald-100 text-slate-600 dark:text-slate-300">
              {displayHost || 'localport'}
            </span>
          </button>
        ) : (
          <button 
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-[#007BC4] text-xs font-bold shadow-sm hover:bg-blue-100/75 transition cursor-pointer"
            title="Running in Demo Sandbox Mode. Click to connect to real Aperture hardware"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-semibold">Demo Sandbox Mode</span>
            <span className="text-[9px] bg-white dark:bg-slate-800 text-slate-500 px-1.5 rounded border border-blue-100">Simulate Actions</span>
          </button>
        )}
        
        {/* Date Picker Mock */}
        <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition hover:text-[#007BC4] dark:hover:text-[#007BC4]">
           <Calendar className="w-3.5 h-3.5 text-slate-400" />
           <span className="font-medium">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </button>

        {/* Action Icons */}
        <div className="flex items-center gap-1.5 ml-1">
           <button 
             onClick={() => navigate('/alerts')}
             className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-[#007BC4] transition"
           >
             <Bell className="w-4 h-4" />
             <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
           </button>
           <button 
             onClick={() => setIsDark(!isDark)}
             className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-[#007BC4] transition hidden md:flex"
           >
             {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
           </button>
        </div>
      </div>
    </header>
  );
}
