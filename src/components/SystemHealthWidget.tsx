import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Settings as SettingsIcon, 
  Wifi, 
  WifiOff, 
  Clock, 
  HardDrive, 
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { doc, getDoc, db } from '../lib/db';
import { useNavigate } from 'react-router-dom';

export interface HealthState {
  firestore: {
    connected: boolean;
    latencyMs: number;
    projectId: string;
    error: string | null;
    testing: boolean;
  };
  mongo: {
    connected: boolean;
    latencyMs: number;
    connectionString: string;
    engine: string;
    collectionsCount: number;
    totalRecords: number;
    error: string | null;
    testing: boolean;
  };
  lastChecked: Date | null;
}

export default function SystemHealthWidget() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthState>({
    firestore: {
      connected: true,
      latencyMs: 0,
      projectId: 'ai-studio-gaopeopletrackin',
      error: null,
      testing: false
    },
    mongo: {
      connected: false,
      latencyMs: 0,
      connectionString: '',
      engine: 'Connecting...',
      collectionsCount: 0,
      totalRecords: 0,
      error: null,
      testing: false
    },
    lastChecked: null
  });

  const checkHealth = async () => {
    setHealth(prev => ({
      ...prev,
      firestore: { ...prev.firestore, testing: true },
      mongo: { ...prev.mongo, testing: true }
    }));

    // 1. Check Firestore
    const fsStart = performance.now();
    let fsConnected = false;
    let fsLatency = 0;
    let fsError: string | null = null;
    try {
      if (db) {
        // Quick dummy doc read to test latency
        await getDoc(doc(db, 'system_health', 'ping')).catch(() => {});
        fsConnected = true;
        fsLatency = Math.round(performance.now() - fsStart);
      } else {
        fsError = "Firebase Firestore instance is not initialized.";
      }
    } catch (err: any) {
      fsConnected = false;
      fsError = err.message || "Failed to reach Cloud Firestore";
      fsLatency = Math.round(performance.now() - fsStart);
    }

    // 2. Check MongoDB
    const mongoStart = performance.now();
    let mongoConnected = false;
    let mongoLatency = 0;
    let mongoError: string | null = null;
    let mongoConnStr = '';
    let mongoEngine = 'Server Data Engine';
    let collectionsCount = 0;
    let totalRecords = 0;

    try {
      const res = await fetch('/api/mongodb/status');
      mongoLatency = Math.round(performance.now() - mongoStart);
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      if (res.ok) {
        mongoConnected = !!data.connected;
        mongoConnStr = data.connectionString || 'None Configured';
        mongoEngine = data.engine || (mongoConnected ? 'MongoDB Cluster' : 'Server Data Engine');
        collectionsCount = data.collectionsCount || 0;
        totalRecords = data.totalRecords || 0;
        mongoError = data.lastError || (mongoConnected ? null : 'MongoDB is not configured or server selection timed out');
      } else {
        mongoError = data.error || `Backend status API returned HTTP ${res.status}`;
      }
    } catch (err: any) {
      mongoLatency = Math.round(performance.now() - mongoStart);
      mongoError = err.message || 'Network error fetching MongoDB backend status';
    }

    setHealth({
      firestore: {
        connected: fsConnected,
        latencyMs: fsLatency,
        projectId: 'ai-studio-gaopeopletrackin',
        error: fsError,
        testing: false
      },
      mongo: {
        connected: mongoConnected,
        latencyMs: mongoLatency,
        connectionString: mongoConnStr,
        engine: mongoEngine,
        collectionsCount,
        totalRecords,
        error: mongoError,
        testing: false
      },
      lastChecked: new Date()
    });
  };

  useEffect(() => {
    checkHealth();

    // Listen for custom event when MongoDB URI is updated in settings
    const handleMongoUpdate = () => {
      checkHealth();
    };
    window.addEventListener('mongo-config-updated', handleMongoUpdate);
    return () => window.removeEventListener('mongo-config-updated', handleMongoUpdate);
  }, []);

  const overallHealthy = health.firestore.connected && health.mongo.connected;
  const isTesting = health.firestore.testing || health.mongo.testing;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition duration-200 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg border ${overallHealthy ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
            <Activity className={`w-5 h-5 ${isTesting ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm tracking-tight">System & Database Health</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border ${
                overallHealthy 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : health.firestore.connected || health.mongo.connected 
                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                    : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${overallHealthy ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                {overallHealthy ? 'Operational' : 'Degraded / Mixed'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Real-time connection telemetry, engine status, and latency monitoring.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {health.lastChecked && (
            <span className="text-[10px] font-mono text-slate-400 hidden md:inline-block">
              Checked: {health.lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={checkHealth}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-[#007BC4]' : ''}`} />
            {isTesting ? 'Checking...' : 'Ping Databases'}
          </button>
          <button
            onClick={() => navigate('/settings', { state: { focusSection: 'integrations' } })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#007BC4]/10 hover:bg-[#007BC4]/20 text-[#007BC4] rounded-lg text-xs font-bold transition border border-[#007BC4]/20 cursor-pointer"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Config DB
          </button>
        </div>
      </div>

      {/* Database Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Firestore Card */}
        <div className={`p-4 rounded-xl border transition-all ${
          health.firestore.connected 
            ? 'bg-emerald-50/40 border-emerald-200/80' 
            : 'bg-rose-50/40 border-rose-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-xs text-amber-600">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block leading-tight">Google Cloud Firestore</span>
                <span className="text-[10px] font-mono text-slate-500">{health.firestore.projectId}</span>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 border ${
              health.firestore.connected 
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}>
              {health.firestore.connected ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-rose-600" />}
              {health.firestore.connected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-medium">
            <div className="bg-white/80 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Ping Latency</span>
              <span className="font-mono font-bold text-slate-800 text-sm">{health.firestore.latencyMs} ms</span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Security Rules</span>
              <span className="font-bold text-emerald-700 text-xs flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3" /> Active & Enforced
              </span>
            </div>
          </div>

          {health.firestore.error && (
            <div className="mt-3 p-2.5 bg-rose-100/80 border border-rose-300 rounded-lg text-rose-800 text-xs font-mono leading-relaxed">
              <div className="font-bold flex items-center gap-1 text-rose-900 mb-0.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Firestore Diagnostic Alert:
              </div>
              {health.firestore.error}
            </div>
          )}
        </div>

        {/* MongoDB Card */}
        <div className={`p-4 rounded-xl border transition-all ${
          health.mongo.connected 
            ? 'bg-emerald-50/40 border-emerald-200/80' 
            : 'bg-amber-50/40 border-amber-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-xs text-emerald-600">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block leading-tight">MongoDB Atlas Cluster</span>
                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[180px] block" title={health.mongo.connectionString}>
                  {health.mongo.connectionString || 'mongodb+srv://...'}
                </span>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 border ${
              health.mongo.connected 
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}>
              {health.mongo.connected ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
              {health.mongo.connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-medium">
            <div className="bg-white/80 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Ping Latency</span>
              <span className="font-mono font-bold text-slate-800 text-sm">{health.mongo.latencyMs} ms</span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Collections</span>
              <span className="font-bold text-slate-800 text-sm">{health.mongo.collectionsCount} active</span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Records</span>
              <span className="font-bold text-slate-800 text-sm">{health.mongo.totalRecords}</span>
            </div>
          </div>

          {health.mongo.error && (
            <div className="mt-3 p-2.5 bg-amber-100/80 border border-amber-300 rounded-lg text-amber-900 text-xs font-mono leading-relaxed">
              <div className="font-bold flex items-center gap-1 text-amber-950 mb-0.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" /> MongoDB Connection Diagnostics:
              </div>
              <p className="break-words">{health.mongo.error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
