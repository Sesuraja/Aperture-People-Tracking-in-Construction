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

export interface ThirdPartyApi {
  id: string;
  name: string;
  description?: string;
  endpointUrl: string;
  method: 'GET' | 'POST';
  authType: 'none' | 'apiKey' | 'bearer' | 'basic' | 'custom';
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

export default function ThirdPartyApiIntegrationSection() {
  const [apis, setApis] = useState<ThirdPartyApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);
  const [isEditingNew, setIsEditingNew] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ThirdPartyApi>({
    id: "",
    name: "New Third-Party API",
    description: "Custom telemetry or RFID endpoint",
    endpointUrl: "https://c72fe02c-76af-4b77-b300-74aeb1abc7e8.mock.pstmn.io/api/GetTagsInRealtime",
    method: "GET",
    authType: "none",
    apiKey: "aperture_live_key_gao991283x",
    apiKeyHeader: "X-API-Key",
    apiKeyLocation: "header",
    bearerToken: "",
    basicUsername: "",
    basicPassword: "",
    requestBody: "{\n  \"facilityId\": \"FAC-01\"\n}",
    pollingEnabled: true,
    pollingIntervalSeconds: 10,
    dataMapping: {
      tagIdField: "TagID",
      locationField: "Location",
      timestampField: "Timestamp",
      nameField: "FirstName",
      rssiField: "rssi"
    }
  });

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
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (data.success && Array.isArray(data.apis)) {
        setApis(data.apis);
        if (!selectedApiId && data.apis.length > 0) {
          setSelectedApiId(data.apis[0].id);
          setFormData(data.apis[0]);
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
      name: "Custom Telemetry Service",
      description: "Direct REST endpoint connection",
      endpointUrl: "https://api.example.com/v1/rfid/events",
      method: "GET",
      authType: "none",
      apiKey: "",
      apiKeyHeader: "X-API-Key",
      apiKeyLocation: "header",
      bearerToken: "",
      basicUsername: "",
      basicPassword: "",
      requestBody: "{\n  \"zone\": \"All\"\n}",
      pollingEnabled: true,
      pollingIntervalSeconds: 15,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setSyncNotice({ success: true, message: "API Configuration saved to MongoDB successfully." });
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
    if (!window.confirm("Are you sure you want to delete this API connection?")) return;
    try {
      const res = await fetch(`/api/integrations/${id}`, { method: "DELETE" });
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
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch(`/api/integrations/${formData.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: formData })
      });
      const result = await res.json();
      if (result.success) {
        setSyncNotice({
          success: true,
          message: `Pipeline Completed: Ingested ${result.recordsIngested} records from API → Processed with AI Engine → Persisted to MongoDB (${result.latencyMs}ms).`
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
      {/* Pipeline Diagram Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Option 1: Third-Party API Integration</h3>
              <p className="text-xs text-slate-400">
                Connect external REST endpoints (GET / POST) with full authentication, validation, AI analysis, and MongoDB persistence.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
            Active Data Pipeline
          </span>
        </div>

        {/* Visual Pipeline Flow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Globe className="w-4 h-4 text-blue-400 mb-1" />
            <span className="font-semibold text-slate-200">1. Third-Party API</span>
            <span className="text-[10px] text-slate-400">GET / POST Stream</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Zap className="w-4 h-4 text-amber-400 mb-1" />
            <span className="font-semibold text-slate-200">2. API Connection</span>
            <span className="text-[10px] text-slate-400">Auth & Key Header</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <ShieldCheck className="w-4 h-4 text-cyan-400 mb-1" />
            <span className="font-semibold text-slate-200">3. Data Validation</span>
            <span className="text-[10px] text-slate-400">Schema Extraction</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Bot className="w-4 h-4 text-purple-400 mb-1" />
            <span className="font-semibold text-slate-200">4. AI Engine</span>
            <span className="text-[10px] text-slate-400">Safety & Threat AI</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Database className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="font-semibold text-slate-200">5. MongoDB Storage</span>
            <span className="text-[10px] text-slate-400">Live Tags & History</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
            <Radio className="w-4 h-4 text-rose-400 mb-1" />
            <span className="font-semibold text-slate-200">6. Dashboard</span>
            <span className="text-[10px] text-slate-400">Real-time Visuals</span>
          </div>
        </div>
      </div>

      {/* Main Configuration Layout: Left List + Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: API Integrations List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                Configured Endpoints
              </h4>
              <button
                type="button"
                onClick={handleAddNew}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add API
              </button>
            </div>

            {loading ? (
              <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading integrations...
              </div>
            ) : apis.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No third-party APIs configured. Click &quot;Add API&quot; above to create one.
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {apis.map((api) => {
                  const isSelected = !isEditingNew && selectedApiId === api.id;
                  return (
                    <div
                      key={api.id}
                      onClick={() => handleSelectApi(api)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isSelected
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {api.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                              api.method === "POST"
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                                : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
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
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-2">
                        {api.endpointUrl}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-200 dark:border-slate-700/50 pt-1.5">
                        <span>Ingested: {api.totalRecordsIngested || 0} scans</span>
                        <span>{api.lastLatencyMs ? `${api.lastLatencyMs}ms` : 'Idle'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Webhook Push Receiver Card */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-blue-500" />
              Incoming Webhook URL
            </h5>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              External systems can directly HTTP POST telemetry payloads to this ingest webhook:
            </p>
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="bg-transparent text-[10px] text-slate-700 dark:text-slate-300 font-mono w-full outline-none"
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                title="Copy Webhook URL"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: Selected API Configuration Form & Live Execution */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {isEditingNew ? "Create New API Integration" : `Edit: ${formData.name}`}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure request parameters, authentication tokens, polling, and data schema mapping.
                </p>
              </div>

              {!isEditingNew && formData.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteApi(formData.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  API Service Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. GAO RFID Live Stream"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  HTTP Method
                </label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="GET">GET (Retrieve active tags / poll events)</option>
                  <option value="POST">POST (Send query payload / push batch)</option>
                </select>
              </div>
            </div>

            {/* Endpoint URL */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Endpoint URL
              </label>
              <input
                type="text"
                value={formData.endpointUrl}
                onChange={(e) => setFormData({ ...formData, endpointUrl: e.target.value })}
                placeholder="https://c72fe02c-76af-4b77-b300-74aeb1abc7e8.mock.pstmn.io/api/GetTagsInRealtime"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Authentication Settings */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-500" />
                  Authentication Method
                </label>
                <select
                  value={formData.authType}
                  onChange={(e) => setFormData({ ...formData, authType: e.target.value as any })}
                  className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-slate-800 dark:text-slate-200"
                >
                  <option value="none">None (Public API)</option>
                  <option value="apiKey">API Key (Header / Query Parameter)</option>
                  <option value="bearer">Bearer Token (Authorization: Bearer)</option>
                  <option value="basic">Basic Auth (Username & Password)</option>
                </select>
              </div>

              {formData.authType === "apiKey" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Header / Param Name
                    </label>
                    <input
                      type="text"
                      value={formData.apiKeyHeader || "X-API-Key"}
                      onChange={(e) => setFormData({ ...formData, apiKeyHeader: e.target.value })}
                      placeholder="X-API-Key"
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Location
                    </label>
                    <select
                      value={formData.apiKeyLocation || "header"}
                      onChange={(e) => setFormData({ ...formData, apiKeyLocation: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                    >
                      <option value="header">HTTP Header</option>
                      <option value="query">URL Query Parameter (?key=...)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Secret API Key
                    </label>
                    <input
                      type="password"
                      value={formData.apiKey || ""}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      placeholder="Enter API Key"
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                </div>
              )}

              {formData.authType === "bearer" && (
                <div className="pt-2">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Bearer Token
                  </label>
                  <input
                    type="password"
                    value={formData.bearerToken || ""}
                    onChange={(e) => setFormData({ ...formData, bearerToken: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
              )}

              {formData.authType === "basic" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={formData.basicUsername || ""}
                      onChange={(e) => setFormData({ ...formData, basicUsername: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={formData.basicPassword || ""}
                      onChange={(e) => setFormData({ ...formData, basicPassword: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* POST Request Body (if method === 'POST') */}
            {formData.method === "POST" && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-indigo-500" />
                  POST JSON Request Body
                </label>
                <textarea
                  rows={4}
                  value={formData.requestBody || ""}
                  onChange={(e) => setFormData({ ...formData, requestBody: e.target.value })}
                  placeholder="{\n  &quot;facilityId&quot;: &quot;FAC-01&quot;\n}"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Polling & Data Schema Mapping Toggle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Automatic Ingestion Polling
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Periodically sync & feed AI engine
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.pollingEnabled}
                  onChange={(e) => setFormData({ ...formData, pollingEnabled: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Polling Interval
                </label>
                <select
                  value={formData.pollingIntervalSeconds || 10}
                  onChange={(e) => setFormData({ ...formData, pollingIntervalSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value={5}>Every 5 Seconds (High Frequency)</option>
                  <option value={10}>Every 10 Seconds (Standard)</option>
                  <option value={30}>Every 30 Seconds</option>
                  <option value={60}>Every 1 Minute</option>
                </select>
              </div>
            </div>

            {/* Action Buttons: Save, Test, Sync */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveApi}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save API Config
                </button>

                <button
                  type="button"
                  disabled={isTesting}
                  onClick={handleTestConnection}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
                  Test Connection ({formData.method})
                </button>
              </div>

              <button
                type="button"
                disabled={isSyncing}
                onClick={handleSyncNow}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-emerald-500" />}
                Run Full Pipeline & Ingest to MongoDB
              </button>
            </div>

            {/* Sync / Save Notice Banner */}
            {syncNotice && (
              <div
                className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
                  syncNotice.success
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                    : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
                }`}
              >
                {syncNotice.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{syncNotice.message}</span>
              </div>
            )}

            {/* Connection Test Diagnostics Result Panel */}
            {testResult && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    HTTP Status: {testResult.statusCode || 0} {testResult.statusText || ""}
                  </span>
                  <span className="text-slate-400">Response Latency: {testResult.latencyMs}ms</span>
                </div>

                {testResult.error && (
                  <div className="text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900">
                    Error: {testResult.error}
                  </div>
                )}

                <div className="text-[11px] text-slate-400">
                  Parsed Records Found: <span className="text-white font-bold">{testResult.parsedRecordsCount || 0}</span>
                </div>

                {testResult.responseSnippet && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Payload Preview:</span>
                    <pre className="max-h-36 overflow-y-auto bg-slate-900 p-2 rounded text-[10px] text-emerald-400">
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
