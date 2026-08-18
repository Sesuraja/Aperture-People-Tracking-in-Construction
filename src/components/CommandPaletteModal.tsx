import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, LayoutDashboard, Map, PlayCircle, Users, ClipboardCheck, Clock, 
  Bell, ShieldAlert, BarChart3, Sparkles, Radio, Wrench, History, Settings, 
  Download, Sun, Moon, Zap, ArrowRight, CornerDownLeft, X, Building2, User
} from 'lucide-react';
import { Person } from '../lib/simulation';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  people?: Person[];
  activeProject?: string;
  onSelectProject?: (projectId: string) => void;
  onToggleTheme?: () => void;
  isDark?: boolean;
  onOpenExport?: () => void;
  onTriggerSOS?: () => void;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  people = [],
  activeProject = 'metro-tower',
  onSelectProject,
  onToggleTheme,
  isDark,
  onOpenExport,
  onTriggerSOS
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, category: 'Navigation', shortcut: 'G D' },
    { id: 'live', label: 'Live RFID Tracking Map', path: '/live', icon: Map, category: 'Navigation', shortcut: 'G L' },
    { id: 'customMap', label: 'Custom Map & Assets', path: '/custom-map', icon: Map, category: 'Navigation', shortcut: 'G M' },
    { id: 'playback', label: 'Playback History', path: '/playback', icon: PlayCircle, category: 'Navigation', shortcut: 'G P' },
    { id: 'people', label: 'Personnel Registry', path: '/people', icon: Users, category: 'Navigation', shortcut: 'G U' },
    { id: 'visitors', label: 'Visitor Management & Badges', path: '/visitors', icon: ClipboardCheck, category: 'Navigation', shortcut: 'G V' },
    { id: 'attendance', label: 'Attendance & Timesheets', path: '/attendance', icon: Clock, category: 'Navigation', shortcut: 'G T' },
    { id: 'alerts', label: 'Real-time Alerts & Triggers', path: '/alerts', icon: Bell, category: 'Navigation', shortcut: 'G A' },
    { id: 'incidents', label: 'Incident Log File', path: '/incidents', icon: ShieldAlert, category: 'Navigation', shortcut: 'G I' },
    { id: 'analytics', label: 'Traffic & Density Analytics', path: '/analytics', icon: BarChart3, category: 'Navigation', shortcut: 'G Y' },
    { id: 'aiInsights', label: 'AI Intelligence & Predictions', path: '/ai-insights', icon: Sparkles, category: 'Navigation', shortcut: 'G X' },
    { id: 'devices', label: 'RFID Readers & Gateways', path: '/devices', icon: Radio, category: 'Navigation', shortcut: 'G R' },
    { id: 'maintenance', label: 'Hardware Maintenance Schedule', path: '/maintenance', icon: Wrench, category: 'Navigation', shortcut: 'G H' },
    { id: 'audit', label: 'Audit & Compliance Ledger', path: '/audit', icon: History, category: 'Navigation', shortcut: 'G C' },
    { id: 'settings', label: 'System Settings & Config', path: '/settings', icon: Settings, category: 'Navigation', shortcut: 'G S' },
  ];

  const quickActions = [
    { id: 'export', label: 'Export Compliance Report (CSV/PDF)', action: () => { onOpenExport?.(); onClose(); }, icon: Download, category: 'Action', shortcut: '⌘ E' },
    { id: 'theme', label: `Switch to ${isDark ? 'Light' : 'Dark'} Mode`, action: () => { onToggleTheme?.(); onClose(); }, icon: isDark ? Sun : Moon, category: 'Action', shortcut: '⌘ T' },
    { id: 'sos', label: 'Trigger Site Emergency SOS Siren', action: () => { onTriggerSOS?.(); onClose(); }, icon: Zap, category: 'Action', shortcut: '⌘ !' },
  ];

  const projectActions = [
    { id: 'proj-metro', label: 'Switch Site: Metro Tower Hub (Active Phase 3)', action: () => { onSelectProject?.('metro-tower'); onClose(); }, icon: Building2, category: 'Projects' },
    { id: 'proj-tunnel', label: 'Switch Site: Harbor Tunnel Shaft B', action: () => { onSelectProject?.('harbor-tunnel'); onClose(); }, icon: Building2, category: 'Projects' },
    { id: 'proj-skyrise', label: 'Switch Site: SkyRise Alpha Commercial', action: () => { onSelectProject?.('skyrise-alpha'); onClose(); }, icon: Building2, category: 'Projects' },
  ];

  const filteredPeople = query.trim() ? people.filter(p => 
    (p.name || "").toLowerCase().includes((query || "").toLowerCase()) || 
    (p.id || "").toLowerCase().includes((query || "").toLowerCase()) ||
    (p.role && (p.role || "").toLowerCase().includes((query || "").toLowerCase())) ||
    (p.tradeCompany && (p.tradeCompany || "").toLowerCase().includes((query || "").toLowerCase())) ||
    (p.currentZone || "").toLowerCase().includes((query || "").toLowerCase())
  ).slice(0, 5) : [];

  const personActions = filteredPeople.map(p => ({
    id: `person-${p.id}`,
    label: `${p.name} (${p.id}) — ${p.role}${p.tradeCompany ? ` (${p.tradeCompany})` : ''} in ${p.currentZone}`,
    action: () => {
      navigate('/people');
      onClose();
    },
    icon: User,
    category: 'Personnel'
  }));

  const filteredItems = query.trim() ? [
    ...navItems.filter(i => (i.label || "").toLowerCase().includes((query || "").toLowerCase())),
    ...quickActions.filter(i => (i.label || "").toLowerCase().includes((query || "").toLowerCase())),
    ...projectActions.filter(i => (i.label || "").toLowerCase().includes((query || "").toLowerCase())),
    ...personActions
  ] : [
    ...quickActions,
    ...navItems.slice(0, 6),
    ...projectActions
  ];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        if (selected) {
          if ('path' in selected && selected.path) {
            navigate(selected.path);
            onClose();
          } else if ('action' in selected && selected.action) {
            selected.action();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        
        {/* Search Header */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, pages, workers (e.g., 'Live', 'John', 'Export')..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none font-medium"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 mr-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No results found for &quot;<span className="text-slate-700 dark:text-slate-300 font-semibold">{query}</span>&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if ('path' in item && item.path) {
                      navigate(item.path);
                      onClose();
                    } else if ('action' in item && item.action) {
                      item.action();
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs font-medium transition cursor-pointer ${
                    isSelected 
                      ? 'bg-[#007BC4] text-white shadow-sm' 
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-[#007BC4]'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="truncate font-semibold">{item.label}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                      isSelected 
                        ? 'bg-white/20 text-white' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {item.category}
                    </span>
                    {isSelected ? (
                      <CornerDownLeft className="w-3.5 h-3.5 text-white animate-pulse" />
                    ) : 'shortcut' in item && item.shortcut ? (
                      <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer with Keyboard Navigation Hints */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-2xs">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-2xs">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-2xs">ESC</kbd>
              Close
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] font-semibold text-[#007BC4]">
            <span>Aperture Command Center</span>
          </div>
        </div>

      </div>
    </div>
  );
}
