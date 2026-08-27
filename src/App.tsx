/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useSimulation } from './lib/simulation';
import { Activity, Bell, Map, Map as MapIcon, Users, BarChart3, Settings, ShieldAlert, Cpu, LayoutDashboard, Radio, PlayCircle, Search, LogOut, Lock, Clock, Building2, ClipboardCheck, History, MessageSquare, Terminal, Wrench, Sparkles, Box, ShieldCheck, Zap, ChevronLeft, ChevronRight, Command } from 'lucide-react';
import CommandPaletteModal from './components/CommandPaletteModal';
import ErrorBoundary from './components/ErrorBoundary';
import AttendanceTab from './components/AttendanceTab';
import VisitorsTab from './components/VisitorsTab';
import AuditTab from './components/AuditTab';
import IncidentsTab from './components/IncidentsTab';
import AIInsightsTab from './components/AIInsightsTab';
import MaintenanceTab from './components/MaintenanceTab';
import TopBar from './components/TopBar';
import PeopleTab from './components/PeopleTab';
import AlertsTab from './components/AlertsTab';
import AnalyticsTab from './components/AnalyticsTab';
import DashboardTab from './components/DashboardTab';
import LiveTrackingTab from './components/LiveTrackingTab';
import PlaybackTab from './components/PlaybackTab';
import DevicesTab from './components/DevicesTab';
import StreamDiagnostics from './components/StreamDiagnostics';
import SettingsTab from './components/SettingsTab';
import RealTimeConnectionsTab from './components/RealTimeConnectionsTab';
import CustomMapPage from './components/CustomMapPage';
import ProfileModal from './components/ProfileModal';
import Login from './components/Login';
import ApertureLogo, { ApertureLogoMark } from './components/ApertureLogo';
import { startGaoSync, stopGaoSync } from './lib/gaoSyncService';
import { doc, getDoc, setDoc, db } from './lib/db';

import { TrackingProvider } from './context/TrackingContext';

export type AppMode = 'real' | null;

export const AppModeContext = React.createContext<{ mode: AppMode }>({ mode: null });

const ProtectedRoute = ({ 
  element, 
  userRole, 
  userUid,
  permissionKey, 
  permissions, 
  userPagePermissions,
  featureName 
}: { 
  element: React.ReactNode; 
  userRole: string; 
  userUid?: string;
  permissionKey: string; 
  permissions: any; 
  userPagePermissions?: any;
  featureName: string; 
}) => {
  let isAllowed = true;
  if (userUid && userPagePermissions && userPagePermissions[userUid] && userPagePermissions[userUid][permissionKey] !== undefined) {
    isAllowed = Boolean(userPagePermissions[userUid][permissionKey]);
  } else if (permissions && permissions[userRole] && permissions[userRole][permissionKey] !== undefined) {
    isAllowed = Boolean(permissions[userRole][permissionKey]);
  } else if (userRole === 'admin') {
    isAllowed = true;
  } else {
    isAllowed = permissions[userRole]?.[permissionKey] ?? true;
  }

  if (!isAllowed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full select-none animate-in fade-in zoom-in-95 duration-300">
        <div className="p-4 bg-rose-50 rounded-full border border-rose-100 mb-4 max-w-sm flex items-center justify-center shadow-sm">
           <Lock className="w-10 h-10 text-rose-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Page Access Restricted</h3>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
           Your user profile or role tier (<strong>{userRole}</strong>) is restricted from accessing {featureName}.
         </p>
         <p className="text-xs text-slate-400 mt-4 font-mono">
            Ask your administrator to toggle page access permissions for your account or role in Settings.
         </p>
      </div>
    );
  }
  return <>{element}</>;
};

export default function App() {
  const [mode, setMode] = useState<AppMode>(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('gao_jwt_token') : null;
    const savedMode = typeof window !== 'undefined' ? localStorage.getItem('gao_app_mode') : null;
    if (token) return 'real';
    return null;
  });

  const changeMode = (newMode: AppMode) => {
    setMode(newMode);
    if (newMode) {
      localStorage.setItem('gao_app_mode', newMode);
    } else {
      localStorage.removeItem('gao_app_mode');
      localStorage.removeItem('gao_jwt_token');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors during logout
    }
    localStorage.removeItem('gao_jwt_token');
    localStorage.removeItem('gao_app_mode');
    setMode(null);
  };

  useEffect(() => {
    const token = localStorage.getItem('gao_jwt_token');
    if (token && mode !== 'real') {
      changeMode('real');
    }
  }, []);

  useEffect(() => {
    fetch('/api/mongodb/status')
      .then(async res => {
        if (!res.ok) return null;
        const text = await res.text();
        try { return JSON.parse(text); } catch { return null; }
      })
      .then(data => {
        if (data && data.connected) {
          const currentUri = localStorage.getItem('gao_mongodb_uri');
          if (!currentUri) {
            localStorage.setItem('gao_mongodb_uri', 'active_env');
          }
        }
      })
      .catch(err => console.warn('Syncing MongoDB state error:', err));
  }, []);

  useEffect(() => {
    if (mode === 'real') {
      startGaoSync();
    } else {
      stopGaoSync();
    }
  }, [mode]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppModeContext.Provider value={{ mode }}>
          <TrackingProvider>
            {!mode ? (
              <Login onLoginSuccess={changeMode} />
            ) : (
              <AppContent onLogout={handleLogout} />
            )}
          </TrackingProvider>
        </AppModeContext.Provider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function AppContent({ onLogout }: { onLogout: () => void }) {
  const { mode } = React.useContext(AppModeContext);
  const [activeProject, setActiveProject] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('gao_active_project')) || 'metro-tower';
  });

  const handleActiveProjectChange = (projectId: string) => {
    setActiveProject(projectId);
    localStorage.setItem('gao_active_project', projectId);
  };

  const { people = [], assets = [], vehicles = [], alerts = [], ZONES = {}, isLoading } = useSimulation(mode, activeProject);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id?: string; email?: string; name?: string; role?: string } | null>(null);
  
  // Custom Claims Role-based visibility and access controls
  const [userRole, setUserRole] = useState<string>('operator');
  const [permissions, setPermissions] = useState<any>({});
  const [userPagePermissions, setUserPagePermissions] = useState<any>({});

  const loadClaimsAndPermissions = async () => {

    let resolvedRole = 'admin';
    let currentUid = '';

    const token = localStorage.getItem('gao_jwt_token');
    if (token) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser(data.user);
            resolvedRole = data.user.role || 'admin';
            currentUid = data.user.id || '';
          }
        }
      } catch (err) {
        console.warn('Failed to load user info from /api/auth/me:', err);
      }
    }

    setUserRole(resolvedRole);

    // Load role permissions matrix
    try {
      const res = await fetch('/api/admin/permissions');
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.rolePermissions ? data.rolePermissions : data);
      } else {
        const rolePermDoc = await getDoc(doc(db, 'settings', 'role_permissions'));
        if (rolePermDoc.exists()) {
          setPermissions(rolePermDoc.data());
        }
      }
    } catch (err) {
      console.error('Failed to load active permissions matrices:', err);
    }

    // Load user-specific page overrides
    try {
      if (currentUid) {
        const userPermDoc = await getDoc(doc(db, 'settings', `user_permissions_${currentUid}`));
        if (userPermDoc.exists()) {
          setUserPagePermissions((prev: any) => ({
            ...prev,
            [currentUid]: userPermDoc.data()
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load user page permissions:', err);
    }
  };

  useEffect(() => {
    loadClaimsAndPermissions();

    // Listen to real-time events triggered from claims administrator console
    window.addEventListener('gao-refresh-claims', loadClaimsAndPermissions);
    
    return () => {
      window.removeEventListener('gao-refresh-claims', loadClaimsAndPermissions);
    };
  }, []);

  const isPageAllowed = (key: string) => {
    const uid = 'default';
    if (uid && userPagePermissions?.[uid] && userPagePermissions[uid][key] !== undefined) {
      return Boolean(userPagePermissions[uid][key]);
    }
    if (permissions && permissions[userRole] && permissions[userRole][key] !== undefined) {
      return Boolean(permissions[userRole][key]);
    }
    if (userRole === 'admin') return true;
    return true;
  };

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Global Keyboard Shortcuts (Cmd + K or Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigate = useNavigate();

  const filteredPeople = searchQuery 
    ? (people || []).filter(p => p && p.name && (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.id && p.id.toLowerCase().includes(searchQuery.toLowerCase()))))
    : [];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors">
      {/* 3-Column App Shell Layout — Column 1: Primary Navigation Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-60'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col py-5 shrink-0 z-10 transition-all duration-300 shadow-sm relative`}>
        
        {/* Sidebar Collapse Toggle */}
        <button
          onClick={() => setIsSidebarCollapsed(prev => !prev)}
          className="absolute -right-3 top-5 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#007BC4] flex items-center justify-center shadow-md z-20 hover:scale-105 transition cursor-pointer"
          title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isSidebarCollapsed ? <ChevronRight size={13} className="shrink-0" /> : <ChevronLeft size={13} className="shrink-0" />}
        </button>

        {/* LOGO */}
        <div className={`mb-5 flex flex-col ${isSidebarCollapsed ? 'items-center px-2' : 'px-3.5'}`}>
          {isSidebarCollapsed ? (
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center shadow-xs hover:scale-105 transition cursor-pointer" title="Aperture">
              <ApertureLogoMark size={24} />
            </div>
          ) : (
            <div className="flex flex-col">
              <ApertureLogo variant="horizontal" size="sm" />
              <div className="flex items-center gap-1.5 mt-2 px-0.5">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 tracking-tight leading-tight">
                  {typeof window !== 'undefined' && localStorage.getItem('gao_industry_config')
                    ? JSON.parse(localStorage.getItem('gao_industry_config') || '{}').appTitle || 'Aperture People Tracking'
                    : 'Aperture People Tracking'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Search / Command Palette Trigger in Sidebar */}
        <div className={`mb-4 ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {isSidebarCollapsed ? (
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="w-full h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#007BC4] flex items-center justify-center transition cursor-pointer"
              title="Quick Search (Cmd + K)"
            >
              <Search className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#007BC4] dark:hover:border-[#007BC4] text-xs text-slate-500 dark:text-slate-400 rounded-xl px-2.5 py-1.5 flex items-center justify-between transition cursor-pointer shadow-2xs group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#007BC4] transition shrink-0" />
                <span className="truncate text-xs font-normal">Search {typeof window !== 'undefined' && localStorage.getItem('gao_industry_config') ? (JSON.parse(localStorage.getItem('gao_industry_config') || '{}').terminology?.personnelPlural || 'workforce') : 'workforce'} & commands...</span>
              </div>
              <kbd className="text-[9px] font-mono font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-2xs shrink-0 ml-1.5 inline-flex items-center justify-center leading-none">
                ⌘K
              </kbd>
            </button>
          )}
        </div>


        {/* Grouped Domain Navigation */}
        <nav className="flex flex-col gap-4 px-2.5 flex-1 overflow-y-auto min-h-0">
          
          {/* WORKSPACE DOMAIN */}
          <div className="flex flex-col gap-0.5">
            {!isSidebarCollapsed && (
              <span className="px-3 mb-1 text-[9px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                Core Workspace
              </span>
            )}
            {isPageAllowed('dashboard') && <NavItem to="/dashboard" icon={<LayoutDashboard size={18}/>} label="Dashboard" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('live') && <NavItem to="/live" icon={<Map size={18}/>} label="Live Tracking" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('customMap') && <NavItem to="/custom-map" icon={<MapIcon size={18}/>} label="Custom Map & Assets" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('playback') && <NavItem to="/playback" icon={<PlayCircle size={18}/>} label="Playback History" isCollapsed={isSidebarCollapsed} />}
          </div>

          {/* OPERATIONS DOMAIN */}
          <div className="flex flex-col gap-0.5">
            {!isSidebarCollapsed && (
              <span className="px-3 mb-1 text-[9px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                Operations & Trades
              </span>
            )}
            {isPageAllowed('people') && <NavItem to="/people" icon={<Users size={18}/>} label="Personnel" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('visitors') && <NavItem to="/visitors" icon={<ClipboardCheck size={18}/>} label="Visitors" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('attendance') && <NavItem to="/attendance" icon={<Clock size={18}/>} label="Attendance" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('devices') && <NavItem to="/devices" icon={<Radio size={18}/>} label="Hardware Devices" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('maintenance') && <NavItem to="/maintenance" icon={<Wrench size={18}/>} label="Maintenance" isCollapsed={isSidebarCollapsed} />}
          </div>

          {/* SAFETY & INTELLIGENCE DOMAIN */}
          <div className="flex flex-col gap-0.5">
            {!isSidebarCollapsed && (
              <span className="px-3 mb-1 text-[9px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                Safety & Compliance
              </span>
            )}
            {isPageAllowed('alerts') && <NavItem to="/alerts" icon={<Bell size={18}/>} label="Alerts & Triggers" hasNotification={(alerts || []).some(a => a && a.type === 'security')} isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('incidents') && <NavItem to="/incidents" icon={<ShieldAlert size={18}/>} label="Incidents" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('analytics') && <NavItem to="/analytics" icon={<BarChart3 size={18}/>} label="Analytics" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('aiInsights') && <NavItem to="/ai-insights" icon={<Sparkles size={18}/>} label="AI Insights" isCollapsed={isSidebarCollapsed} />}
            {isPageAllowed('audit') && <NavItem to="/audit" icon={<History size={18}/>} label="Audit Ledger" isCollapsed={isSidebarCollapsed} />}
          </div>

          {/* SYSTEM DOMAIN */}
          <div className="flex flex-col gap-0.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
            {!isSidebarCollapsed && (
              <span className="px-3 mb-1 text-[9px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                System Config
              </span>
            )}
            {isPageAllowed('settings') && <NavItem to="/settings" icon={<Settings size={18}/>} label="Settings" isCollapsed={isSidebarCollapsed} />}
          </div>
        </nav>
        
        {/* User Profile */}
        <div className={`mt-auto pt-3 shrink-0 flex items-center justify-between gap-1.5 border-t border-slate-100 dark:border-slate-800 ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {isSidebarCollapsed ? (
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="w-10 h-10 rounded-xl bg-[#007BC4] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs mx-auto"
              title="User Profile & Settings"
            >
              {(currentUser?.name || currentUser?.email || 'A').charAt(0).toUpperCase()}
            </button>
          ) : (
            <>
              <div 
                onClick={() => setIsProfileModalOpen(true)}
                className="bg-slate-50 dark:bg-slate-800/80 p-2.5 flex-1 rounded-xl flex items-center justify-between cursor-pointer border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700 transition shadow-2xs min-w-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#007BC4] flex items-center justify-center text-xs font-bold text-white shrink-0 uppercase shadow-2xs">
                    {(currentUser?.name || currentUser?.email || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {currentUser?.name || currentUser?.email?.split('@')[0] || 'User Profile'}
                    </span>
                    <span className="text-[9px] text-[#007BC4] font-bold uppercase tracking-wider truncate">{userRole}</span>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={onLogout}
                className="p-2.5 text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 rounded-xl border border-slate-200 dark:border-slate-700 transition shadow-2xs bg-slate-50 dark:bg-slate-800 shrink-0" 
                title="Log Out"
              >
                 <LogOut size={15} />
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900 transition-colors">
        <TopBar onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
        
        <div className="flex-1 overflow-y-auto relative min-h-0 w-full flex flex-col">
          <div className="min-h-full flex flex-col w-full flex-1">
            <Routes>
              <Route path="/" element={
                 <ProtectedRoute 
                   element={<DashboardTab people={people || []} alerts={alerts || []} zones={ZONES || []} highlightedPersonId={highlightedPersonId} vehicles={vehicles || []} assets={assets || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="dashboard"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Dashboard Telemetry"
                 />
              } />
              <Route path="/dashboard" element={
                 <ProtectedRoute 
                   element={<DashboardTab people={people || []} alerts={alerts || []} zones={ZONES || []} highlightedPersonId={highlightedPersonId} vehicles={vehicles || []} assets={assets || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="dashboard"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Dashboard Telemetry"
                 />
              } />
              <Route path="/live" element={
                 <ProtectedRoute 
                   element={<LiveTrackingTab people={people || []} assets={assets || []} vehicles={vehicles || []} zones={ZONES as any || {}} highlightedPersonId={highlightedPersonId}  activeProject={activeProject} setActiveProject={handleActiveProjectChange} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="live"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Live Tracking Feed"
                 />
              } />
              <Route path="/custom-map" element={
                 <ProtectedRoute 
                   element={<CustomMapPage activeProject={activeProject} setActiveProject={handleActiveProjectChange} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="customMap"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Custom Map & Assets"
                 />
              } />
              <Route path="/playback" element={
                 <ProtectedRoute 
                   element={<PlaybackTab people={people || []} zones={ZONES || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="playback"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Tracking History Playback"
                 />
              } />
              <Route path="/people" element={
                 <ProtectedRoute 
                   element={<PeopleTab people={people || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="people"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Personnel Registry"
                 />
              } />
              <Route path="/visitors" element={
                 <ProtectedRoute 
                   element={<VisitorsTab />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="visitors"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Visitor Management"
                 />
              } />
              <Route path="/attendance" element={
                 <ProtectedRoute 
                   element={<AttendanceTab people={people || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="attendance"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Attendance Insights"
                 />
              } />
              <Route path="/alerts" element={
                 <ProtectedRoute 
                   element={<AlertsTab alerts={alerts || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="alerts"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Alerts & Trigger Feed"
                 />
              } />
              <Route path="/incidents" element={
                 <ProtectedRoute 
                   element={<IncidentsTab />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="incidents"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Incident Log File"
                 />
              } />
              <Route path="/analytics" element={
                 <ProtectedRoute 
                   element={<AnalyticsTab people={people || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="analytics"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Aggregated Traffic Analytics"
                 />
              } />
              <Route path="/ai-insights" element={
                 <ProtectedRoute 
                   element={<AIInsightsTab people={people || []} />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="aiInsights"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="AI Insights and Predictions Reports"
                 />
              } />
              <Route path="/devices" element={
                 <ProtectedRoute 
                   element={<DevicesTab />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="devices"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Hardware Devices Administration"
                 />
              } />
              <Route path="/stream-diagnostics" element={
                 <ProtectedRoute 
                   element={<div className="p-6 max-w-7xl mx-auto"><StreamDiagnostics /></div>}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="devices"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Stream Diagnostics Monitoring"
                 />
              } />
              <Route path="/maintenance" element={
                 <ProtectedRoute 
                   element={<MaintenanceTab />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="maintenance"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Hardware Maintenance Schedule"
                 />
              } />
              <Route path="/settings" element={
                 <ProtectedRoute 
                   element={<SettingsTab />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="settings"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Global Settings Console"
                 />
              } />
              <Route path="/audit" element={
                 <ProtectedRoute 
                   element={<AuditTab />}
                   userRole={userRole}
                   userUid="default"
                   permissionKey="audit"
                   permissions={permissions}
                   userPagePermissions={userPagePermissions}
                   featureName="Compliance and Audit Ledger"
                 />
              } />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </main>

      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} onLogout={onLogout} />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        people={people}
        activeProject={activeProject}
        onSelectProject={handleActiveProjectChange}
        onToggleTheme={() => {
          const isCurrentlyDark = document.documentElement.classList.contains('dark');
          if (isCurrentlyDark) {
            document.documentElement.classList.remove('dark');
          } else {
            document.documentElement.classList.add('dark');
          }
        }}
        isDark={document.documentElement.classList.contains('dark')}
      />
    </div>
  );
}

function NavItem({ 
  to, 
  icon, 
  label, 
  hasNotification = false,
  isCollapsed = false
}: { 
  to: string; 
  icon: React.ReactNode; 
  label: string; 
  hasNotification?: boolean;
  isCollapsed?: boolean;
}) {
  return (
    <NavLink 
      to={to}
      title={isCollapsed ? label : undefined}
      className={({ isActive }) => `relative flex items-center ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2'} rounded-xl transition-all duration-200 shrink-0 ${
        isActive 
          ? 'bg-[#007BC4] text-white shadow-xs font-semibold' 
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#007BC4] dark:hover:text-[#007BC4]'
      }`}
    >
      <div className="shrink-0">{icon}</div>
      {!isCollapsed && <span className="text-xs font-medium tracking-tight truncate">{label}</span>}
      {hasNotification && (
        <span className={`absolute ${isCollapsed ? 'top-1.5 right-1.5' : 'top-1/2 -translate-y-1/2 right-3'} w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping`} />
      )}
      {hasNotification && (
        <span className={`absolute ${isCollapsed ? 'top-1.5 right-1.5' : 'top-1/2 -translate-y-1/2 right-3'} w-1.5 h-1.5 bg-rose-500 rounded-full`} />
      )}
    </NavLink>
  );
}

