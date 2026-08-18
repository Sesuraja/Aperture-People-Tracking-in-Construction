import React, { useState, useEffect } from "react";
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Play,
  Check,
  Eye,
  EyeOff,
  Server,
  Layers,
  HardDrive,
  ShieldCheck,
  Zap,
  Info
} from "lucide-react";

export interface MongoStats {
  connected: boolean;
  connectionString: string;
  engine: string;
  collectionsCount: number;
  totalRecords: number;
  collectionsBreakdown?: Record<string, number>;
  lastError: string | null;
}

export default function MongoDbConfigurationSection() {
  const [stats, setStats] = useState<MongoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mongoUriInput, setMongoUriInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Testing & Saving States
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ success: boolean; message: string } | null>(null);

  const fetchMongoStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/mongodb/status");
      const data = await res.json();
      setStats(data);
      if (data.connectionString && !mongoUriInput) {
        // If unmasked or available, we can set placeholder
      }
    } catch (err) {
      console.error("Failed to fetch MongoDB status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMongoStatus();
  }, []);

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      setSaveNotice(null);
      const res = await fetch("/api/mongodb/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mongodbUri: mongoUriInput || undefined })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Failed to reach MongoDB test endpoint"
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    if (!mongoUriInput.trim()) {
      setSaveNotice({ success: false, message: "Please enter a valid MongoDB connection URI" });
      return;
    }

    try {
      setIsSaving(true);
      setSaveNotice(null);
      const res = await fetch("/api/mongodb/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mongodbUri: mongoUriInput })
      });
      const data = await res.json();
      if (data.success) {
        setSaveNotice({
          success: true,
          message: `Connected successfully to MongoDB (${data.latencyMs || 25}ms latency). Database session initialized.`
        });
        await fetchMongoStatus();
      } else {
        setSaveNotice({
          success: false,
          message: data.error || "Failed to connect to MongoDB with provided URI"
        });
      }
    } catch (err: any) {
      setSaveNotice({
        success: false,
        message: err.message || "Connection error occurred"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              stats?.connected
                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                : "bg-amber-500/20 border border-amber-500/30 text-amber-400"
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">MongoDB Database Connection</h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                  stats?.connected
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {stats?.connected ? "MongoDB Atlas Active" : "In-Memory Storage"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Central persistent database storing personnel, RFID telemetry, hardware gateways, third-party APIs, and AI incident logs.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchMongoStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Status
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">Database Engine</span>
            <span className="font-semibold text-slate-200">{stats?.engine || "Connecting..."}</span>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">Active Collections</span>
            <span className="font-semibold text-slate-200">{stats?.collectionsCount || 0} Collections</span>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">Total Stored Records</span>
            <span className="font-semibold text-emerald-400 font-mono">{stats?.totalRecords || 0} Documents</span>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">Connection URI</span>
            <span className="font-mono text-slate-300 truncate block text-[11px]">
              {stats?.connectionString || "None (Using In-Memory)"}
            </span>
          </div>
        </div>
      </div>

      {/* Connection Configuration Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-500" />
            Configure MongoDB Connection URI
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter your MongoDB Atlas cluster URI or self-hosted MongoDB connection string.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              MongoDB Connection String (URI)
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={mongoUriInput}
                onChange={(e) => setMongoUriInput(e.target.value)}
                placeholder="mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority"
                className="w-full pl-3 pr-10 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Supports standard format e.g. <code className="text-indigo-500 font-mono">mongodb+srv://admin:pass@cluster0.mongodb.net/peopletracking</code>
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAndConnect}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Connect & Save URI
              </button>

              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestConnection}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
                Test MongoDB Connection
              </button>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              Runtime URI is persistently saved to <code className="text-slate-700 dark:text-slate-300 font-mono">.mongo_runtime.json</code>
            </div>
          </div>

          {/* Save / Notice Alert */}
          {saveNotice && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                saveNotice.success
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
              }`}
            >
              {saveNotice.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{saveNotice.message}</span>
            </div>
          )}

          {/* Test Result Diagnostics */}
          {testResult && (
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  {testResult.success ? "MongoDB Ping Succeeded" : "Connection Failed"}
                </span>
                {testResult.latencyMs !== undefined && (
                  <span className="text-slate-400">Latency: {testResult.latencyMs}ms</span>
                )}
              </div>

              {testResult.error && (
                <p className="text-rose-400 text-[11px] pt-1">
                  Reason: {testResult.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Collections Breakdown */}
      {stats?.collectionsBreakdown && Object.keys(stats.collectionsBreakdown).length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            MongoDB Stored Collections Breakdown
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(stats.collectionsBreakdown).map(([colName, count]) => (
              <div
                key={colName}
                className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/60"
              >
                <span className="text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300 block truncate">
                  {colName}
                </span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                  {count} docs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
