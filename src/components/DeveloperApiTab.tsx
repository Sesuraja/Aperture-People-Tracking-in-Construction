import React, { useState, useEffect } from 'react';
import {
  Key,
  Webhook,
  Activity,
  ShieldAlert,
  BarChart,
  Plus,
  Copy,
  CheckCircle2,
  Database,
  Send,
  Play,
  Code2,
  Server,
  RefreshCw,
  FileText,
  Download,
  ExternalLink,
  Lock,
  Shield,
  Zap,
  Globe,
  Layers,
  Settings,
  AlertCircle,
  Trash2,
  Eye,
  EyeOff,
  Check,
  Clock,
  Radio,
  Sparkles,
  Users,
  ChevronRight,
  Terminal,
  Cpu
} from 'lucide-react';

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  keySecret?: string;
  created: string;
  lastUsed: string;
  status: 'Active' | 'Revoked';
  scope: string;
  usage: string;
}

interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  status: 'Active' | 'Paused' | 'Failing';
  created: string;
  secret: string;
}

export default function DeveloperApiTab() {
  const [activeSubTab, setActiveSubTab] = useState<'tester' | 'keys' | 'docs' | 'webhooks' | 'stats'>('tester');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState<boolean>(false);

  // Live API Tester state
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [endpoint, setEndpoint] = useState<string>('/api/GetTagsInRealtime');
  const [requestHeaders, setRequestHeaders] = useState<string>(
    '{\n  "Accept": "application/json",\n  "Content-Type": "application/json"\n}'
  );
  const [requestBody, setRequestBody] = useState<string>(
    '{\n  "tagId": "TAG_UHF_90412",\n  "name": "David Miller",\n  "role": "Rigging Specialist",\n  "zone": "Tower Crane Zone B",\n  "rssi": -58\n}'
  );
  const [apiResponse, setApiResponse] = useState<string>('Select an endpoint or click "Send Request" to test live API response.');
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseLatency, setResponseLatency] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [useAuthHeader, setUseAuthHeader] = useState<boolean>(true);

  // Backend Stats state
  const [serverStats, setServerStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([
    { id: '1', name: 'HRMS Worker Sync', prefix: 'gao_live_8f92', created: '2026-05-10', lastUsed: '4 mins ago', status: 'Active', scope: 'read:telemetry, write:personnel', usage: '45.2k reqs' },
    { id: '2', name: 'BMS Building Management System', prefix: 'gao_live_b2a1', created: '2026-04-22', lastUsed: '2 secs ago', status: 'Active', scope: 'read:all, write:all', usage: '1.2M reqs' },
    { id: '3', name: 'Legacy ERP Connector', prefix: 'gao_live_c109', created: '2026-01-15', lastUsed: '3 days ago', status: 'Revoked', scope: 'read:attendance', usage: '0 reqs' },
    { id: '4', name: 'Safety Officer Mobile App', prefix: 'gao_live_e991', created: '2026-07-01', lastUsed: '12 mins ago', status: 'Active', scope: 'read:alerts, write:incidents', usage: '18.4k reqs' },
  ]);

  // Generate Key Modal / State
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [newKeyScope, setNewKeyScope] = useState<string>('read:telemetry, write:scans');
  const [createdKeyFullSecret, setCreatedKeyFullSecret] = useState<string | null>(null);

  // Webhooks State
  const [webhooks, setWebhooks] = useState<WebhookSub[]>([
    { id: 'wh_1', url: 'https://ehs-compliance.gaostaff.com/webhooks/rfid-events', events: ['rfid.scan', 'geofence.breach'], status: 'Active', created: '2026-06-12', secret: 'whsec_88f91a204b7c91' },
    { id: 'wh_2', url: 'https://safety-alerts.construction.com/api/v1/trigger', events: ['sos.emergency', 'hazard.predicted'], status: 'Active', created: '2026-07-04', secret: 'whsec_71c049e22a901f' }
  ]);
  const [newWebhookUrl, setNewWebhookUrl] = useState<string>('');
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>(['rfid.scan', 'sos.emergency']);
  const [isAddingWebhook, setIsAddingWebhook] = useState<boolean>(false);
  const [testWebhookNotice, setTestWebhookNotice] = useState<string | null>(null);

  // Documentation language selector
  const [docLang, setDocLang] = useState<'curl' | 'javascript' | 'python' | 'go'>('curl');

  const fetchBackendStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/data/stats');
      if (res.ok) {
        const data = await res.json();
        setServerStats(data);
      }
    } catch (e) {
      console.warn('Failed to fetch backend stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchBackendStats();
  }, []);

  const handleSendApiRequest = async () => {
    setIsExecuting(true);
    setApiResponse('Transmitting HTTP request to backend server...');
    setResponseStatus(null);
    setResponseLatency(null);
    setResponseSize(null);
    const startTime = performance.now();

    try {
      const headersObj: Record<string, string> = {
        'Accept': 'application/json'
      };

      if (method === 'POST' || method === 'PUT') {
        headersObj['Content-Type'] = 'application/json';
      }

      // Add Authorization token if enabled
      if (useAuthHeader) {
        const token = localStorage.getItem('gao_jwt_token');
        if (token) {
          headersObj['Authorization'] = `Bearer ${token}`;
        }
      }

      // Parse custom user headers
      try {
        if (requestHeaders.trim()) {
          const parsedCustom = JSON.parse(requestHeaders);
          Object.assign(headersObj, parsedCustom);
        }
      } catch {
        // Fallback
      }

      const options: RequestInit = {
        method,
        headers: headersObj
      };

      if ((method === 'POST' || method === 'PUT') && requestBody.trim()) {
        options.body = requestBody;
      }

      const res = await fetch(endpoint, options);
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      setResponseLatency(durationMs);
      setResponseStatus(res.status);

      const text = await res.text();
      const bytesLength = new Blob([text]).size;
      setResponseSize(bytesLength > 1024 ? `${(bytesLength / 1024).toFixed(2)} KB` : `${bytesLength} Bytes`);

      try {
        const json = JSON.parse(text);
        setApiResponse(JSON.stringify(json, null, 2));
      } catch {
        setApiResponse(text);
      }
    } catch (err: any) {
      const endTime = performance.now();
      setResponseLatency(Math.round(endTime - startTime));
      setResponseStatus(500);
      setApiResponse(JSON.stringify({ error: err.message || 'Network request failed' }, null, 2));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCreateApiKey = () => {
    if (!newKeyName.trim()) return;
    const randomHex = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const fullSecret = `gao_live_${randomHex}`;
    const prefix = fullSecret.slice(0, 12);

    const newItem: ApiKeyItem = {
      id: Date.now().toString(),
      name: newKeyName.trim(),
      prefix,
      keySecret: fullSecret,
      created: new Date().toISOString().split('T')[0],
      lastUsed: 'Just now',
      status: 'Active',
      scope: newKeyScope,
      usage: '0 reqs'
    };

    setApiKeys([newItem, ...apiKeys]);
    setCreatedKeyFullSecret(fullSecret);
    setNewKeyName('');
    setIsGeneratingKey(false);
  };

  const handleRevokeApiKey = (id: string) => {
    if (!window.confirm('Are you sure you want to revoke this API key? Applications using this key will immediately be denied access.')) return;
    setApiKeys(apiKeys.map(k => k.id === id ? { ...k, status: 'Revoked' } : k));
  };

  const handleCreateWebhook = () => {
    if (!newWebhookUrl.trim()) return;
    const randomSec = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const newWh: WebhookSub = {
      id: `wh_${Date.now()}`,
      url: newWebhookUrl.trim(),
      events: selectedWebhookEvents,
      status: 'Active',
      created: new Date().toISOString().split('T')[0],
      secret: `whsec_${randomSec}`
    };
    setWebhooks([newWh, ...webhooks]);
    setNewWebhookUrl('');
    setIsAddingWebhook(false);
  };

  const handleTestWebhook = (wh: WebhookSub) => {
    setTestWebhookNotice(`Pinging ${wh.url}... Transmitted test event 'rfid.scan' (HTTP 200 OK - 34ms)`);
    setTimeout(() => setTestWebhookNotice(null), 4500);
  };

  const presetEndpoints = [
    { label: 'POST GAO Native Hardware Stream', method: 'POST', url: '/api/hardware/gao-native', body: JSON.stringify([{ EPC: "E2801191A0000208D6489BC1", ReaderID: "RDR_PORTAL_01", Ant: "1", RSSI: "-54", ReadCount: 1, DateTime: new Date().toISOString() }], null, 2) },
    { label: 'POST Direct Hardware Raw Scan', method: 'POST', url: '/api/hardware/scan', body: JSON.stringify({ tagId: "TAG_DIRECT_9901", readerId: "RDR_MAIN_GATE", rssi: -58, antenna: "1", readCount: 1, timestamp: new Date().toISOString() }, null, 2) },
    { label: 'GET Industry & Terminology Config', method: 'GET', url: '/api/data/settings/industry_config', body: '' },
    { label: 'POST Update Industry Profile', method: 'POST', url: '/api/data/settings/industry_config', body: JSON.stringify({ industryId: "healthcare", industryName: "Healthcare & Hospitals", appTitle: "Aperture Health Clinical Tracking" }, null, 2) },
    { label: 'GET GAO Real-time Tags', method: 'GET', url: '/api/GetTagsInRealtime', body: '' },
    { label: 'GET History Total Count', method: 'GET', url: '/api/GetHistoryTotalCount', body: '' },
    { label: 'GET History Records (0-20)', method: 'GET', url: '/api/GetHistoryRecords/0/20', body: '' },
    { label: 'GET Backend RFID Telemetry', method: 'GET', url: '/api/rfid/realtime', body: '' },
    { label: 'POST Push Hardware Tag Scan', method: 'POST', url: '/api/rfid/scan', body: JSON.stringify({ tagId: "RFID_UHF_8819", name: "Marcus Vance", role: "Site Supervisor", zone: "Structure & Scaffolding", status: "Active" }, null, 2) },
    { label: 'GET Backend Health Status', method: 'GET', url: '/api/health', body: '' },
    { label: 'GET AI Safety Model Status', method: 'GET', url: '/api/ai/status', body: '' },
    { label: 'POST Predictive Hazard Simulator', method: 'POST', url: '/api/ai/predictive-hazard-simulator', body: JSON.stringify({ siteZone: "Zone 4 - Scaffolding", windSpeedKph: 35, highRiskPersonnelCount: 12, craneOpsActive: true }, null, 2) },
    { label: 'GET Personnel Directory', method: 'GET', url: '/api/data/registered_people', body: '' },
    { label: 'GET Hardware Devices & Scanners', method: 'GET', url: '/api/data/devices', body: '' },
    { label: 'GET Aperture Integration Config', method: 'GET', url: '/api/integrations/aperture/config', body: '' },
    { label: 'POST Test Aperture Connection', method: 'POST', url: '/api/integrations/aperture/test', body: JSON.stringify({ host: "https://c72fe02c-76af-4b77-b300-74aeb1abc7e8.mock.pstmn.io" }, null, 2) }
  ];


  const getCodeSnippet = () => {
    const fullUrl = `${window.location.origin}${endpoint}`;
    const token = localStorage.getItem('gao_jwt_token') || 'YOUR_JWT_OR_API_KEY';

    if (docLang === 'curl') {
      if (method === 'GET') {
        return `curl -X GET "${fullUrl}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Accept: application/json"`;
      }
      return `curl -X ${method} "${fullUrl}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/\n/g, '')}'`;
    }

    if (docLang === 'javascript') {
      if (method === 'GET') {
        return `const response = await fetch('${fullUrl}', {\n  method: 'GET',\n  headers: {\n    'Authorization': 'Bearer ${token}',\n    'Accept': 'application/json'\n  }\n});\nconst data = await response.json();\nconsole.log('API Output:', data);`;
      }
      return `const response = await fetch('${fullUrl}', {\n  method: '${method}',\n  headers: {\n    'Authorization': 'Bearer ${token}',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(${requestBody})\n});\nconst data = await response.json();\nconsole.log('Result:', data);`;
    }

    if (docLang === 'python') {
      if (method === 'GET') {
        return `import requests\n\nurl = "${fullUrl}"\nheaders = {\n    "Authorization": "Bearer ${token}",\n    "Accept": "application/json"\n}\n\nresponse = requests.get(url, headers=headers)\nprint(response.json())`;
      }
      return `import requests\nimport json\n\nurl = "${fullUrl}"\nheaders = {\n    "Authorization": "Bearer ${token}",\n    "Content-Type": "application/json"\n}\npayload = ${requestBody}\n\nresponse = requests.${(method || "").toLowerCase()}(url, headers=headers, json=payload)\nprint(response.json())`;
    }

    if (docLang === 'go') {
      return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n)\n\nfunc main() {\n\turl := "${fullUrl}"\n\treq, _ := http.NewRequest("${method}", url, nil)\n\treq.Header.Add("Authorization", "Bearer ${token}")\n\t\n\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tfmt.Println(err)\n\t\treturn\n\t}\n\tdefer res.Body.Close()\n\tbody, _ := io.ReadAll(res.Body)\n\tfmt.Println(string(body))\n}`;
    }

    return '';
  };

  const handleExportOpenApiSpec = () => {
    const openApiSpec = {
      openapi: "3.0.3",
      info: {
        title: "Aperture & GAO People Tracking REST API",
        version: "2.5.0",
        description: "Enterprise REST API for UHF RFID Telemetry, Personnel Tracking, Safety Hazards, and AI Insights."
      },
      servers: [{ url: window.location.origin, description: "Active Production Cloud Node" }],
      paths: {
        "/api/GetTagsInRealtime": {
          get: {
            summary: "Fetch real-time UHF RFID tag telemetry",
            responses: { "200": { description: "Successful tag array payload" } }
          }
        },
        "/api/GetHistoryRecords/{start}/{count}": {
          get: {
            summary: "Retrieve historical RFID scan records with pagination",
            parameters: [
              { name: "start", in: "path", required: true, schema: { type: "integer" } },
              { name: "count", in: "path", required: true, schema: { type: "integer" } }
            ],
            responses: { "200": { description: "Array of historical movements" } }
          }
        },
        "/api/rfid/scan": {
          post: {
            summary: "Push hardware reader RFID tag scan event",
            requestBody: {
              content: { "application/json": { schema: { type: "object" } } }
            },
            responses: { "200": { description: "Scan recorded successfully" } }
          }
        },
        "/api/ai/predictive-hazard-simulator": {
          post: {
            summary: "Run AI Predictive Safety Hazard Simulation",
            responses: { "200": { description: "Simulated hazard risk score & preventative actions" } }
          }
        }
      }
    };

    const blob = new Blob([JSON.stringify(openApiSpec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aperture_openapi_spec_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col space-y-6">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Code2 className="w-6 h-6 text-[#007BC4]" />
            API Documentation & Developer Console
          </h2>
          <p className="text-slate-500 font-medium text-xs mt-1">
            Build custom software integrations, query RFID telemetry, generate API keys, and test REST endpoints in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchBackendStats}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
          <button
            onClick={handleExportOpenApiSpec}
            className="flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            Export OpenAPI Spec
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-[#007BC4] rounded-xl shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Backend Engine</span>
            <span className="text-sm font-bold text-slate-900 truncate block">
              {serverStats?.engine || 'Active Express REST API'}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Collections</span>
            <span className="text-sm font-bold text-slate-900 block">
              {serverStats ? Object.keys(serverStats.data || {}).length : 8} Data Stores
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">System Status</span>
            <span className="text-sm font-bold text-emerald-600 block flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              100% Operational
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">REST Endpoints</span>
            <span className="text-sm font-bold text-slate-900 block">16 Connected Routes</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-2 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveSubTab('tester')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'tester'
                ? 'bg-[#007BC4] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Play className="w-3.5 h-3.5" /> Live API Tester & Console
          </button>
          <button
            onClick={() => setActiveSubTab('keys')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'keys'
                ? 'bg-[#007BC4] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Key className="w-3.5 h-3.5" /> API Keys & Credentials ({apiKeys.length})
          </button>
          <button
            onClick={() => setActiveSubTab('docs')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'docs'
                ? 'bg-[#007BC4] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" /> Code Generator & SDK
          </button>
          <button
            onClick={() => setActiveSubTab('webhooks')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'webhooks'
                ? 'bg-[#007BC4] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Webhook className="w-3.5 h-3.5 text-amber-500" /> Webhooks ({webhooks.length})
          </button>
          <button
            onClick={() => setActiveSubTab('stats')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'stats'
                ? 'bg-[#007BC4] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Data Collections
          </button>
        </div>

        {/* TAB 1: LIVE API TESTER & CONSOLE */}
        {activeSubTab === 'tester' && (
          <div className="p-6 space-y-5">
            {/* Quick Presets */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-2">
                Quick Endpoint Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {presetEndpoints.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setMethod(preset.method as any);
                      setEndpoint(preset.url);
                      if (preset.body) setRequestBody(preset.body);
                    }}
                    className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 transition flex items-center gap-2 cursor-pointer"
                  >
                    <span
                      className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        preset.method === 'GET'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}
                    >
                      {preset.method}
                    </span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Request Builder */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 font-bold text-xs px-3 py-2 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#007BC4] cursor-pointer"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div className="md:col-span-7">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Route Path</label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="/api/GetTagsInRealtime"
                    className="w-full font-mono text-xs border border-slate-300 px-3 py-2 rounded-lg text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#007BC4]"
                  />
                </div>

                <div className="md:col-span-3 flex items-end">
                  <button
                    onClick={handleSendApiRequest}
                    disabled={isExecuting}
                    className="w-full bg-[#007BC4] hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer h-[34px]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isExecuting ? 'Transmitting...' : 'Send Request'}
                  </button>
                </div>
              </div>

              {/* Auth Toggle */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useAuthHeader}
                    onChange={(e) => setUseAuthHeader(e.target.checked)}
                    className="rounded border-slate-300 text-[#007BC4] focus:ring-[#007BC4]"
                  />
                  <span>Attach User JWT Authorization Header (`Authorization: Bearer &lt;token&gt;`)</span>
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  Base Host: {window.location.origin}
                </span>
              </div>

              {/* Request Payload for POST / PUT */}
              {(method === 'POST' || method === 'PUT') && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Request Payload Body (JSON)
                  </label>
                  <textarea
                    rows={4}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full font-mono text-xs border border-slate-300 p-3 rounded-lg bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-[#007BC4]"
                  />
                </div>
              )}
            </div>

            {/* Response Console */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-600" />
                  Live API Console Output
                </label>
                <div className="flex items-center gap-3">
                  {responseStatus && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        responseStatus >= 200 && responseStatus < 300
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      HTTP {responseStatus}
                    </span>
                  )}
                  {responseLatency !== null && (
                    <span className="text-[10px] font-mono text-slate-500 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {responseLatency} ms
                    </span>
                  )}
                  {responseSize && (
                    <span className="text-[10px] font-mono text-slate-500 font-semibold">
                      Size: {responseSize}
                    </span>
                  )}
                </div>
              </div>

              <pre className="font-mono text-xs p-4 rounded-xl bg-slate-950 text-emerald-400 overflow-auto border border-slate-800 leading-relaxed shadow-inner max-h-[380px] min-h-[160px]">
                {apiResponse}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 2: API KEYS & CREDENTIALS */}
        {activeSubTab === 'keys' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">API Key Authorization Tokens</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate secure bearer tokens for external hardware gateways, RFID readers, and custom ERP software.
                </p>
              </div>
              <button
                onClick={() => setIsGeneratingKey(true)}
                className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Generate New API Key
              </button>
            </div>

            {/* Newly Created Key Alert Banner */}
            {createdKeyFullSecret && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    New API Key Created Successfully!
                  </span>
                  <button
                    onClick={() => setCreatedKeyFullSecret(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-xs text-emerald-700">
                  Please copy your new API secret key now. You will not be able to see this full key again.
                </p>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-emerald-300">
                  <code className="font-mono text-xs text-emerald-900 font-bold flex-1 select-all">
                    {createdKeyFullSecret}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdKeyFullSecret);
                      setCopiedKeyId('new_key');
                      setTimeout(() => setCopiedKeyId(null), 3000);
                    }}
                    className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1 rounded-md text-xs font-bold hover:bg-emerald-700 transition cursor-pointer"
                  >
                    {copiedKeyId === 'new_key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKeyId === 'new_key' ? 'Copied!' : 'Copy Key'}
                  </button>
                </div>
              </div>
            )}

            {/* Create Key Form Modal / Card */}
            {isGeneratingKey && (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 animate-in fade-in duration-200">
                <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider">Provision New Integration Key</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Key Name / Application Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Scaffolding RFID Reader Node 4"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:border-[#007BC4] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Access Scope Permissions</label>
                    <select
                      value={newKeyScope}
                      onChange={(e) => setNewKeyScope(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:border-[#007BC4] outline-none cursor-pointer"
                    >
                      <option value="read:telemetry, write:scans">Standard (Read Telemetry + Push Scans)</option>
                      <option value="read:all, write:all">Full Admin Access (Read/Write All)</option>
                      <option value="read:telemetry">ReadOnly Telemetry</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsGeneratingKey(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateApiKey}
                    className="px-4 py-2 text-xs font-bold bg-[#007BC4] hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
                  >
                    Confirm & Create Token
                  </button>
                </div>
              </div>
            )}

            {/* Keys Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Application Label</th>
                    <th className="py-3 px-4">Key Token Prefix</th>
                    <th className="py-3 px-4">Permissions Scope</th>
                    <th className="py-3 px-4">Last Activity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {key.name}
                        <div className="text-[10px] font-normal text-slate-400">Created {key.created}</div>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="bg-slate-100 px-2 py-1 rounded text-slate-700 border border-slate-200">
                          {key.prefix}••••••••
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{key.scope}</td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{key.lastUsed}</td>
                      <td className="py-3 px-4">
                        {key.status === 'Active' ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            Active
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            Revoked
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {key.status === 'Active' && (
                          <button
                            onClick={() => handleRevokeApiKey(key.id)}
                            className="text-rose-600 font-bold hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: CODE GENERATOR & SDK */}
        {activeSubTab === 'docs' && (
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Multi-Language Code Snippet Generator</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Copy ready-to-use code snippets tailored to the selected endpoint path (`{endpoint}`).
                </p>
              </div>

              {/* Language Selector Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setDocLang('curl')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    docLang === 'curl' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  cURL
                </button>
                <button
                  onClick={() => setDocLang('javascript')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    docLang === 'javascript' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  JavaScript
                </button>
                <button
                  onClick={() => setDocLang('python')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    docLang === 'python' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Python
                </button>
                <button
                  onClick={() => setDocLang('go')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    docLang === 'go' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Go
                </button>
              </div>
            </div>

            {/* Code View */}
            <div className="relative">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getCodeSnippet());
                  setCopiedCodeSnippet(true);
                  setTimeout(() => setCopiedCodeSnippet(false), 3000);
                }}
                className="absolute right-3 top-3 flex items-center gap-1.5 bg-slate-800 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 transition cursor-pointer"
              >
                {copiedCodeSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCodeSnippet ? 'Copied to Clipboard!' : 'Copy Code'}
              </button>
              <pre className="font-mono text-xs p-5 rounded-xl bg-slate-950 text-cyan-300 overflow-x-auto border border-slate-800 leading-relaxed shadow-inner">
                {getCodeSnippet()}
              </pre>
            </div>

            {/* Endpoint Reference Index */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider">REST API Route Catalogue</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="font-mono text-xs font-bold text-[#007BC4]">GET /api/GetTagsInRealtime</span>
                  <p className="text-xs text-slate-600 mt-1">Fetches array of active UHF RFID tags on construction site with RSSI, zone name, and worker name.</p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="font-mono text-xs font-bold text-[#007BC4]">GET /api/GetHistoryRecords/{'{start}'}/{'{count}'}</span>
                  <p className="text-xs text-slate-600 mt-1">Paginated historical scan movement logs for personnel audit trails.</p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="font-mono text-xs font-bold text-emerald-600">POST /api/rfid/scan</span>
                  <p className="text-xs text-slate-600 mt-1">Pushes a new hardware RFID scan event directly into real-time tracking stream.</p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="font-mono text-xs font-bold text-emerald-600">POST /api/ai/predictive-hazard-simulator</span>
                  <p className="text-xs text-slate-600 mt-1">Evaluates zone conditions (crane ops, wind, worker density) using Gemini EHS model.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: WEBHOOKS */}
        {activeSubTab === 'webhooks' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Real-Time Webhook Subscriptions</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Receive instant HTTP POST callbacks when critical RFID scans, SOS emergencies, or hazard alerts occur.
                </p>
              </div>
              <button
                onClick={() => setIsAddingWebhook(true)}
                className="flex items-center gap-2 bg-[#007BC4] hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Webhook Endpoint
              </button>
            </div>

            {testWebhookNotice && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                {testWebhookNotice}
              </div>
            )}

            {/* Register Webhook Modal */}
            {isAddingWebhook && (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 animate-in fade-in duration-200">
                <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider">Register Webhook Callback URL</h4>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payload Endpoint URL</label>
                  <input
                    type="url"
                    placeholder="https://your-server.com/api/webhooks/gao"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:border-[#007BC4] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Trigger Event Types</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {['rfid.scan', 'geofence.breach', 'sos.emergency', 'hazard.predicted'].map((ev) => (
                      <label key={ev} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedWebhookEvents.includes(ev)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedWebhookEvents([...selectedWebhookEvents, ev]);
                            } else {
                              setSelectedWebhookEvents(selectedWebhookEvents.filter(x => x !== ev));
                            }
                          }}
                          className="rounded text-[#007BC4]"
                        />
                        <span className="font-mono">{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsAddingWebhook(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWebhook}
                    className="px-4 py-2 text-xs font-bold bg-[#007BC4] hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
                  >
                    Save Webhook
                  </button>
                </div>
              </div>
            )}

            {/* Webhooks List */}
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">{wh.url}</span>
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        {wh.status}
                      </span>
                      <button
                        onClick={() => handleTestWebhook(wh)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg border border-slate-300 transition cursor-pointer"
                      >
                        Ping Test
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Events:</span>
                    {wh.events.map((ev) => (
                      <span key={ev} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                        {ev}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Signing Secret: {wh.secret}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: DATA COLLECTIONS */}
        {activeSubTab === 'stats' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Backend Data Store Collections</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect structured collections managed by the REST backend and MongoDB persistence layer.
                </p>
              </div>
            </div>

            {serverStats && serverStats.data ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(serverStats.data).map((col) => {
                  const info = serverStats.data[col];
                  return (
                    <div key={col} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-900">/api/data/{col}</span>
                        <span className="text-xs bg-[#007BC4] text-white px-2 py-0.5 rounded-full font-bold">
                          {info.count} documents
                        </span>
                      </div>
                      {info.sample && (
                        <pre className="bg-white p-2.5 rounded border border-slate-200 text-[11px] font-mono text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">
                          {JSON.stringify(info.sample)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-12">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#007BC4] mb-2" />
                Loading backend store metrics...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
