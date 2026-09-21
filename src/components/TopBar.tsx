import { Bell, Moon, Search, Sun, Download, Building2, Clock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ApertureLogoMark } from './ApertureLogo';
import { useSystemClock } from '../lib/dateTimeUtils';
import ExportReportModal from './ExportReportModal';

interface TopBarProps { onOpenCommandPalette?: () => void; }

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard', '/live': 'Live Tracking', '/custom-map': 'Site Map',
  '/playback': 'History & Playback', '/people': 'Personnel', '/attendance': 'Attendance',
  '/devices': 'Hardware Devices', '/alerts': 'Alerts & Triggers', '/incidents': 'Incidents',
  '/analytics': 'Analytics', '/ai-insights': 'AI Insights', '/account-access': 'Account Access',
  '/settings': 'Settings', '/audit': 'Audit Ledger'
};

export default function TopBar({ onOpenCommandPalette }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [orgName, setOrgName] = useState(() => localStorage.getItem('gao_company_name') || 'People Tracking in Construction');
  const clock = useSystemClock();

  const title = pageTitles[location.pathname] || 'People Tracking in Construction';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const handleOrgUpdate = () => {
      setOrgName(localStorage.getItem('gao_company_name') || 'People Tracking in Construction');
    };
    window.addEventListener('storage', handleOrgUpdate);
    window.addEventListener('gao_settings_updated', handleOrgUpdate);
    return () => {
      window.removeEventListener('storage', handleOrgUpdate);
      window.removeEventListener('gao_settings_updated', handleOrgUpdate);
    };
  }, []);

  return (
    <>
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 shrink-0">
            <ApertureLogoMark size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">People Tracking in Construction</p>
            <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Organization Badge */}
          <div 
            className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs font-medium text-slate-700 dark:text-slate-300 select-none shadow-xs" 
            title={`Active Organization: ${orgName}`}
          >
            <Building2 size={14} className="text-[#007BC4] shrink-0" />
            <span className="truncate max-w-[180px] font-semibold">{orgName}</span>
          </div>

          {/* Real-time System Clock */}
          <div 
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs font-mono text-slate-700 dark:text-slate-300 select-none shadow-xs" 
            title={`Real-Time System Clock (${clock.iana})`}
          >
            <Clock size={13} className="text-slate-400 shrink-0" />
            <span className="font-semibold tabular-nums">{clock.timeNoSuffix}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              {clock.timezoneLabel}
            </span>
          </div>

          {/* Operational Status Indicator */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational</span>
          </div>

          {/* Export Data Button */}
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#007BC4] hover:bg-[#006aa9] text-white text-xs font-bold shadow-sm transition shrink-0 active:scale-95 cursor-pointer"
            title="Export all system data & compliance reports"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export Data</span>
          </button>

          {/* Search Button */}
          <button 
            onClick={onOpenCommandPalette} 
            className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 hover:text-[#007BC4] hover:border-[#007BC4] transition" 
            title="Search (Ctrl+K)"
          >
            <Search size={15} />
            <span>Search</span>
            <kbd className="text-[10px] border border-slate-200 dark:border-slate-700 rounded px-1">Ctrl K</kbd>
          </button>

          {/* Alerts Navigation */}
          <button 
            onClick={() => navigate('/alerts')} 
            className="relative w-9 h-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#007BC4] hover:border-[#007BC4] transition" 
            title="Alerts & Triggers"
          >
            <Bell size={16} />
          </button>

          {/* Dark / Light Mode Toggle */}
          <button 
            onClick={() => setIsDark(v => !v)} 
            className="w-9 h-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white transition" 
            title="Toggle color theme"
          >
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      {/* Global Export Report Modal */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        defaultCategory="all"
      />
    </>
  );
}
