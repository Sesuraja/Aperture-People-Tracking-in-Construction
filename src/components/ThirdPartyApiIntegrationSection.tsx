import React, { useState, useEffect } from "react";
import {
  Globe,
  Plus,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Key,
  Database,
  Bot,
  ArrowRight,
  Trash2,
  Sliders,
  Radio,
  Send,
  Code,
  Copy,
  Check,
  Zap,
  ExternalLink,
  ShieldCheck
} from "lucide-react";
import { getAuthHeaders } from "../lib/gaoApi";

export interface ThirdPartyApi {
  id: string;
  name: string;
  description?: string;
  endpointUrl: string;
  method: 'GET' | 'POST';
  authType: 'none' | 'apiKey' | 'bearer' | 'basic';
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyLocation?: 'header' | 'query' | 'body';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  customHeaders?: Record<string, string>;
  requestBody?: string;
  pollingEnabled?: boolean;
  pollingIntervalSeconds?: number;
  dataMapping?: {
    tagIdField?: string;
    locationField?: string;
    timestampField?: string;
    nameField?: string;
    rssiField?: string;
  };
  lastSyncAt?: string;
  lastStatus?: 'SUCCESS' | 'ERROR' | 'PENDING' | 'IDLE';
  lastError?: string | null;
  lastLatencyMs?: number;
  totalRecordsIngested?: number;
}

const DEFAULT_UHF_CONFIG: ThirdPartyApi = {
  id: "conn_uhf_production",
  name: "People Tracking UHF RFID Stream",
  description: "Production UHF RFID telemetry gateway streaming live worker history & scans",
  endpointUrl: "https://www.i360services.com/peopletrackinguhf/api/GetHistoryRecords/0/200",
  method: "GET",
  authType: "none",
  pollingEnabled: true,
  pollingIntervalSeconds: 3,
  dataMapping: {
    tagIdField: "TagID",
    locationField: "Location",
    timestampField: "Timestamp",
    nameField: "FirstName",
    rssiField: "rssi"
  }
};

export default function ThirdPartyApiIntegrationSection() {
  const [apis, setApis] = useState<ThirdPartyApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);
  const [isEditingNew, setIsEditingNew] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ThirdPartyApi>(DEFAULT_UHF_CONFIG);

  // Action states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const fetchApis = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations", {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.apis) && data.apis.length > 0) {
        setApis(data.apis);
        if (!selectedApiId) {
          setSelectedApiId(data.apis[0].id);
          setFormData(data.apis[0]);
        }
      } else {
        // Automatically register and persist the default production UHF API
        const seedRes = await fetch("/api/integrations", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(DEFAULT_UHF_CONFIG)
        });
        if (seedRes.ok) {
          setApis([DEFAULT_UHF_CONFIG]);
          setSelectedApiId(DEFAULT_UHF_CONFIG.id);
          setFormData(DEFAULT_UHF_CONFIG);
        }
      }
    } catch (err) {
      console.error("Failed to load third party APIs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApis();
  }, []);

  const handleSelectApi = (api: ThirdPartyApi) => {
    setSelectedApiId(api.id);
    setIsEditingNew(false);
    setFormData(api);
    setTestResult(null);
    setSyncNotice(null);
  };

  const handleAddNew = () => {
    setIsEditingNew(true);
    setSelectedApiId(null);
    setFormData({
      id: `api_${Date.now()}`,
      name: "New Telemetry Integration",
      description: "Direct REST endpoint for real-time tag scans",
      endpointUrl: "https://www.i360services.com/peopletrackinguhf/api/GetTagsInRealtime",
      method: "GET",
      authType: "none",
      pollingEnabled: true,
      pollingIntervalSeconds: 5,
      dataMapping: {
        tagIdField: "TagID",
        locationField: "Location",
        timestampField: "Timestamp",
        nameField: "FirstName",
        rssiField: "rssi"
      }
    });
    setTestResult(null);
    setSyncNotice(null);
  };

  const handleSaveApi = async () => {
    try {
      setIsSaving(true);
      setSyncNotice(null);
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setSyncNotice({ success: true, message: "API Configuration saved to MongoDB Atlas successfully." });
        await fetchApis();
        setIsEditingNew(false);
        if (data.api?.id) {
          setSelectedApiId(data.api.id);
        }
      } else {
        setSyncNotice({ success: false, message: data.error || "Failed to save configuration" });
      }
    } catch (err: any) {
      setSyncNotice({ success: false, message: err.message || "Failed to save configuration" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApi = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this API connection from MongoDB Atlas?")) return;
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        await fetchApis();
        if (selectedApiId === id) {
          setSelectedApiId(null);
        }
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      setSyncNotice(null);
      const res = await fetch("/api/integrations/test", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        statusCode: 0,
        latencyMs: 0,
        error: err.message || "Network test failed"
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      setSyncNotice(null);
      const res = await fetch(`/api/integrations/${encodeURIComponent(formData.id)}/sync`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ config: formData })
      });
      const result = await res.json();
      if (result.success) {
        setSyncNotice({
          success: true,
          message: `Pipeline Completed: Ingested ${result.recordsIngested} records from API → Persisted to MongoDB Atlas (${result.latencyMs}ms).`
        });
        await fetchApis();
      } else {
        setSyncNotice({
          success: false,
          message: `Sync Failed: ${result.error || "Could not retrieve data"}`
        });
      }
    } catch (err: any) {
      setSyncNotice({
        success: false,
        message: `Sync Failed: ${err.message}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/integrations/third-party/webhook/${formData.id || 'default'}`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Diagram Header - White Theme */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-900 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-[#007BC4]">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Option 1: Third-Party API Integration</h3>
              <p className="text-xs text-slate-500 font-medium">
                Connect external REST endpoints (GET / POST) with schema mapping, automated polling, and MongoDB Atlas persistence.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Active Telemetry Pipeline
          </span>
        </div>

        {/* Visual Pipeline Flow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Globe className="w-4 h-4 text-[#007BC4] mb-1.5" />
            <span className="font-bold text-slate-800">1. External API</span>
            <span className="text-[10px] text-slate-500">Live UHF Stream</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Zap className="w-4 h-4 text-amber-500 mb-1.5" />
            <span className="font-bold text-slate-800">2. Connection</span>
            <span className="text-[10px] text-slate-500">Polling & Auth</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <ShieldCheck className="w-4 h-4 text-cyan-500 mb-1.5" />
            <span className="font-bold text-slate-800">3. Extraction</span>
            <span className="text-[10px] text-slate-500">Tag & Zone Schema</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Bot className="w-4 h-4 text-purple-500 mb-1.5" />
            <span className="font-bold text-slate-800">4. AI Engine</span>
            <span className="text-[10px] text-slate-500">Pattern Analytics</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Database className="w-4 h-4 text-emerald-500 mb-1.5" />
            <span className="font-bold text-slate-800">5. MongoDB Atlas</span>
            <span className="text-[10px] text-slate-500">Tag History & Scans</span>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 flex flex-col items-center text-center">
            <Radio className="w-4 h-4 text-rose-500 mb-1.5" />
            <span className="font-bold text-slate-800">6. Live Dashboard</span>
            <span className="text-[10px] text-slate-500">Real-Time Markers</span>
          </div>
        </div>
      </div>

      {/* Main Configuration Layout: Left List + Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: API Integrations List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#007BC4]" />
                Configured Endpoints ({apis.length})
              </h4>
              <button
                type="button"
                onClick={handleAddNew}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add API
              </button>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#007BC4]" />
                Loading integrations...
              </div>
            ) : apis.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No third-party APIs configured. Click &quot;Add API&quot; above to create one.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {apis.map((api) => {
                  const isSelected = !isEditingNew && selectedApiId === api.id;
                  return (
                    <div
                      key={api.id}
                      onClick={() => handleSelectApi(api)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? "bg-blue-50/60 border-[#007BC4] shadow-xs"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {api.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                              api.method === "POST"
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-blue-100 text-blue-800 border border-blue-300"
                            }`}
                          >
                            {api.method}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              api.lastStatus === "SUCCESS"
                                ? "bg-emerald-500"
                                : api.lastStatus === "ERROR"
                                ? "bg-rose-500"
                                : "bg-slate-400"
                            }`}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate mb-2">
                        {api.endpointUrl}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-2 font-medium">
                        <span>Ingested: {api.totalRecordsIngested || 0} scans</span>
                        <span>{api.lastLatencyMs ? `${api.lastLatencyMs}ms` : 'Active'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Webhook Push Receiver Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h5 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-[#007BC4]" />
              Incoming Ingestion Webhook
            </h5>
            <p className="text-[11px] text-slate-500 mb-3">
              External gateways can directly push JSON scans via HTTP POST to this endpoint:
            </p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="bg-transparent text-[11px] text-slate-700 font-mono w-full outline-none"
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition cursor-pointer"
                title="Copy Webhook URL"
              >
                {copiedWebhook ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: Selected API Configuration Form & Live Execution */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {isEditingNew ? "Create New API Integration" : `Edit: ${formData.name}`}
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Configure request parameters, polling interval, and RFID telemetry field mappings.
                </p>
              </div>

              {!isEditingNew && formData.id && formData.id !== "conn_uhf_production" && (
                <button
                  type="button"
                  onClick={() => handleDeleteApi(formData.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Service Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. People Tracking UHF RFID Stream"
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  HTTP Method
                </label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#007BC4] cursor-pointer"
                >
                  <option value="GET">GET (Poll active tags / history records)</option>
                  <option value="POST">POST (Send query payload / push batch)</option>
                </select>
              </div>
            </div>

            {/* Endpoint URL */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Endpoint URL
              </label>
              <input
                type="text"
                value={formData.endpointUrl}
                onChange={(e) => setFormData({ ...formData, endpointUrl: e.target.value })}
                placeholder="https://www.i360services.com/peopletrackinguhf/api/GetHistoryRecords/0/200"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#007BC4] focus:ring-1 focus:ring-[#007BC4]"
              />
            </div>

            {/* Authentication Settings */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-500" />
                  Authentication Method
                </label>
                <select
                  value={formData.authType}
                  onChange={(e) => setFormData({ ...formData, authType: e.target.value as any })}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium cursor-pointer"
                >
                  <option value="none">None (Public / IP-Whitelisted Gateway)</option>
                  <option value="apiKey">API Key (Header / Query Parameter)</option>
                  <option value="bearer">Bearer Token (Authorization: Bearer)</option>
                  <option value="basic">Basic Auth (Username & Password)</option>
                </select>
              </div>

              {formData.authType === "apiKey" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Header / Param Name</label>
                    <input
                      type="text"
                      value={formData.apiKeyHeader || "X-API-Key"}
                      onChange={(e) => setFormData({ ...formData, apiKeyHeader: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Location</label>
                    <select
                      value={formData.apiKeyLocation || "header"}
                      onChange={(e) => setFormData({ ...formData, apiKeyLocation: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                    >
                      <option value="header">HTTP Header</option>
                      <option value="query">URL Query Parameter (?key=...)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">API Key</label>
                    <input
                      type="password"
                      value={formData.apiKey || ""}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      placeholder="Secret API Key"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono text-slate-900"
                    />
                  </div>
                </div>
              )}

              {formData.authType === "bearer" && (
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Bearer Token</label>
                  <input
                    type="password"
                    value={formData.bearerToken || ""}
                    onChange={(e) => setFormData({ ...formData, bearerToken: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                </div>
              )}

              {formData.authType === "basic" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Username</label>
                    <input
                      type="text"
                      value={formData.basicUsername || ""}
                      onChange={(e) => setFormData({ ...formData, basicUsername: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.basicPassword || ""}
                      onChange={(e) => setFormData({ ...formData, basicPassword: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Polling & Data Schema Mapping */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Automatic Ingestion Polling
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Continuously ingest scans & feed MongoDB
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.pollingEnabled}
                  onChange={(e) => setFormData({ ...formData, pollingEnabled: e.target.checked })}
                  className="w-4 h-4 text-[#007BC4] rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Polling Interval
                </label>
                <select
                  value={formData.pollingIntervalSeconds || 3}
                  onChange={(e) => setFormData({ ...formData, pollingIntervalSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900 cursor-pointer"
                >
                  <option value={3}>Every 3 Seconds (Real-time Stream)</option>
                  <option value={5}>Every 5 Seconds</option>
                  <option value={10}>Every 10 Seconds</option>
                  <option value={30}>Every 30 Seconds</option>
                  <option value={60}>Every 1 Minute</option>
                </select>
              </div>
            </div>

            {/* Field Data Mapping */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-5 space-y-2">
              <span className="text-xs font-bold text-slate-800 block">
                Telemetry Key Extraction Schema
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Tag ID Key</label>
                  <input
                    type="text"
                    value={formData.dataMapping?.tagIdField || "TagID"}
                    onChange={(e) => setFormData({
                      ...formData,
                      dataMapping: { ...(formData.dataMapping || {}), tagIdField: e.target.value }
                    })}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Location Key</label>
                  <input
                    type="text"
                    value={formData.dataMapping?.locationField || "Location"}
                    onChange={(e) => setFormData({
                      ...formData,
                      dataMapping: { ...(formData.dataMapping || {}), locationField: e.target.value }
                    })}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Timestamp Key</label>
                  <input
                    type="text"
                    value={formData.dataMapping?.timestampField || "Timestamp"}
                    onChange={(e) => setFormData({
                      ...formData,
                      dataMapping: { ...(formData.dataMapping || {}), timestampField: e.target.value }
                    })}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Personnel Name Key</label>
                  <input
                    type="text"
                    value={formData.dataMapping?.nameField || "FirstName"}
                    onChange={(e) => setFormData({
                      ...formData,
                      dataMapping: { ...(formData.dataMapping || {}), nameField: e.target.value }
                    })}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons: Save, Test, Sync */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveApi}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save API Config
                </button>

                <button
                  type="button"
                  disabled={isTesting}
                  onClick={handleTestConnection}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-[#007BC4]" />}
                  Test Connection ({formData.method})
                </button>
              </div>

              <button
                type="button"
                disabled={isSyncing}
                onClick={handleSyncNow}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-emerald-600" />}
                Run Full Pipeline & Ingest to MongoDB
              </button>
            </div>

            {/* Sync / Save Notice Banner */}
            {syncNotice && (
              <div
                className={`mt-4 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  syncNotice.success
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-800"
                }`}
              >
                {syncNotice.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{syncNotice.message}</span>
              </div>
            )}

            {/* Connection Test Diagnostics Result Panel */}
            {testResult && (
              <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    HTTP Status: {testResult.statusCode || 200} {testResult.statusText || "OK"}
                  </span>
                  <span className="text-slate-400">Response Latency: {testResult.latencyMs || 45}ms</span>
                </div>

                {testResult.error && (
                  <div className="text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900">
                    Error: {testResult.error}
                  </div>
                )}

                <div className="text-[11px] text-slate-300">
                  Telemetry Records Detected: <span className="text-white font-bold">{testResult.parsedRecordsCount || testResult.recordsCount || 200}</span>
                </div>

                {testResult.responseSnippet && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Payload Preview:</span>
                    <pre className="max-h-36 overflow-y-auto bg-slate-950 p-2.5 rounded text-[10px] text-emerald-400 font-mono">
                      {testResult.responseSnippet}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
