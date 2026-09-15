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
  Info,
  Trash2,
  Download
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
  const [isPurging, setIsPurging] = useState(false);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchMongoStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/mongodb/status");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch MongoDB status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMongoStatus();
  }, []);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('gao_jwt_token') || 'demo') : 'demo';
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      setSaveNotice(null);
      const res = await fetch("/api/mongodb/test-connection", {
        method: "POST",
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(),
        body: JSON.stringify({ mongodbUri: mongoUriInput })
      });
      const data = await res.json();
      if (data.success) {
        setSaveNotice({
          success: true,
          message: data.message || `Connected successfully to MongoDB (${data.latencyMs || 25}ms latency). Database session active.`
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

  const handleRetentionCleanup = async () => {
    if (!window.confirm("Execute 10-day retention cleanup on MongoDB cluster? Expired tag telemetry and old audit records will be purged.")) return;
    try {
      setIsPurging(true);
      setPurgeNotice(null);
      const res = await fetch("/api/admin/retention-policy/cleanup", {
        method: "POST",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPurgeNotice(`Retention cleanup completed: purged ${data.result?.deletedCount ?? 0} expired records across ${data.result?.collectionsScanned ?? 0} collections.`);
        await fetchMongoStatus();
      } else {
        alert(data.error || "Retention cleanup failed");
      }
    } catch (err: any) {
      alert(`Cleanup error: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const handleExportAllCollections = async () => {
    try {
      setIsExporting(true);
      const collections = [
        "registered_people",
        "devices",
        "visitors",
        "alerts",
        "tag_history",
        "settings",
        "audit_logs",
        "zones",
        "hardware_readers"
      ];
      const exportObject: Record<string, any> = {};
      for (const col of collections) {
        try {
          const res = await fetch(`/api/data/${col}`, { headers: getAuthHeaders() });
          if (res.ok) exportObject[col] = await res.json();
        } catch {
          exportObject[col] = [];
        }
      }
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mongodb_snapshot_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner - Clean White Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 text-slate-900 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              stats?.connected
                ? "bg-emerald-50 border border-emerald-200 text-emerald-600"
                : "bg-amber-50 border border-amber-200 text-amber-600"
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">MongoDB Database Cluster</h3>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1.5 ${
                  stats?.connected
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {stats?.connected ? "MongoDB Atlas Active" : "In-Memory Storage"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Central persistent database storing personnel, RFID telemetry, hardware gateways, third-party APIs, and AI incident logs.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchMongoStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-600" : "text-slate-500"}`} />
            Refresh Status
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Database Engine</span>
            <span className="font-semibold text-slate-800 mt-0.5 block">{stats?.engine || "Connecting..."}</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Active Collections</span>
            <span className="font-semibold text-slate-800 mt-0.5 block">{stats?.collectionsCount || 0} Collections</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Total Stored Records</span>
            <span className="font-semibold text-emerald-600 font-mono mt-0.5 block">{stats?.totalRecords || 0} Documents</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Connection URI</span>
            <span className="font-mono text-slate-700 truncate block text-[11px] mt-0.5">
              {stats?.connectionString || "None (Using In-Memory)"}
            </span>
          </div>
        </div>
      </div>

      {/* Connection Configuration Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600" />
            Configure MongoDB Connection URI
          </h4>
          <p className="text-xs text-slate-500">
            Enter your MongoDB Atlas cluster URI or self-hosted MongoDB connection string.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              MongoDB Connection String (URI)
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={mongoUriInput}
                onChange={(e) => setMongoUriInput(e.target.value)}
                placeholder="mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority"
                className="w-full pl-3 pr-10 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Supports standard format e.g. <code className="text-indigo-600 font-mono">mongodb+srv://admin:***@cluster0.mongodb.net/peopletracking</code>
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg disabled:opacity-50 transition-colors"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-600" />}
                Test MongoDB Connection
              </button>
            </div>

            <div className="text-xs text-slate-500 flex items-start gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                <strong>Runtime Persistence:</strong> Dynamic URI updates switch the active connection in-memory for the running server instance. For permanent persistence across serverless cold starts, reboots, and deployments (e.g. Vercel, Railway), configure <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">MONGODB_URI</code> in your hosting environment variables or <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">.env</code>.
              </span>
            </div>
          </div>

          {/* Save / Notice Alert */}
          {saveNotice && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                saveNotice.success
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border border-rose-200 text-rose-800"
              }`}
            >
              {saveNotice.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{saveNotice.message}</span>
            </div>
          )}

          {/* Test Result Diagnostics */}
          {testResult && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  )}
                  {testResult.success ? "MongoDB Ping Succeeded" : "Connection Failed"}
                </span>
                {testResult.latencyMs !== undefined && (
                  <span className="text-slate-500">Latency: {testResult.latencyMs}ms</span>
                )}
              </div>

              {testResult.error && (
                <p className="text-rose-600 text-[11px] pt-1">
                  Reason: {testResult.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Collections Breakdown */}
      {stats?.collectionsBreakdown && Object.keys(stats.collectionsBreakdown).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            MongoDB Stored Collections Breakdown
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(stats.collectionsBreakdown).map(([colName, count]) => (
              <div
                key={colName}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <span className="text-xs font-mono font-medium text-slate-700 block truncate">
                  {colName}
                </span>
                <span className="text-sm font-bold text-indigo-600 font-mono">
                  {count} docs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Retention & Database Maintenance Operations */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-indigo-600" />
            MongoDB Storage Maintenance & Retention Policy
          </h4>
          <p className="text-xs text-slate-500">
            Enforce automatic 7-day data retention cleanup on live tracking telemetry or export an offline JSON snapshot of all MongoDB collections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isPurging}
            onClick={handleRetentionCleanup}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isPurging ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" /> : <Trash2 className="w-3.5 h-3.5 text-rose-600" />}
            Execute Retention Policy Cleanup
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportAllCollections}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-indigo-600" />}
            Export MongoDB Snapshot (.json)
          </button>
        </div>

        {purgeNotice && (
          <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{purgeNotice}</span>
          </div>
        )}
      </div>
    </div>
  );
}
