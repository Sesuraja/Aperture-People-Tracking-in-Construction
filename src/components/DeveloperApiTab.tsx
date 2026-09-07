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
import { db, doc, getDoc, setDoc, onSnapshot } from '../lib/db';
import { getAuthHeaders } from '../lib/gaoApi';

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
    '{\n  "tagId": "E28011606000020788842D21",\n  "name": "John",\n  "role": "Master Electrician",\n  "zone": "Zone2",\n  "rssi": -58\n}'
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

  // API Keys state (persisted dynamically in MongoDB)
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [newKeyScope, setNewKeyScope] = useState<string>('read:telemetry, write:scans');
  const [createdKeyFullSecret, setCreatedKeyFullSecret] = useState<string | null>(null);

  // Webhooks State (persisted dynamically in MongoDB)
  const [webhooks, setWebhooks] = useState<WebhookSub[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState<string>('');
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>(['rfid.scan', 'sos.emergency']);
  const [isAddingWebhook, setIsAddingWebhook] = useState<boolean>(false);
  const [testWebhookNotice, setTestWebhookNotice] = useState<string | null>(null);

  // Documentation language selector
  const [docLang, setDocLang] = useState<'curl' | 'javascript' | 'python' | 'go'>('curl');

  // Load API Keys & Webhooks from MongoDB
  useEffect(() => {
    const unsubKeys = onSnapshot(doc(db, 'settings', 'api_keys'), (snap) => {
      if (snap.exists() && Array.isArray(snap.data().keys)) {
        setApiKeys(snap.data().keys);
      }
    });

    const unsubWebhooks = onSnapshot(doc(db, 'settings', 'webhooks'), (snap) => {
      if (snap.exists() && Array.isArray(snap.data().webhooks)) {
        setWebhooks(snap.data().webhooks);
      }
    });

    fetchBackendStats();

    return () => {
      unsubKeys();
      unsubWebhooks();
    };
  }, []);

  const fetchBackendStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/data/stats', {
        headers: getAuthHeaders()
      });
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

      if (useAuthHeader) {
        Object.assign(headersObj, getAuthHeaders());
      }

      // Parse custom user headers
      try {
        if (requestHeaders.trim()) {
          const parsedCustom = JSON.parse(requestHeaders);
          Object.assign(headersObj, parsedCustom);
        }
      } catch {}

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

  const handleCreateApiKey = async () => {
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

    const updated = [newItem, ...apiKeys];
    setApiKeys(updated);
    setCreatedKeyFullSecret(fullSecret);
    setNewKeyName('');

    try {
      await setDoc(doc(db, 'settings', 'api_keys'), { keys: updated });
    } catch (err) {
      console.warn('Failed to persist API keys to MongoDB:', err);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    const updated = apiKeys.map(k => k.id === id ? { ...k, status: 'Revoked' as const } : k);
    setApiKeys(updated);
    try {
      await setDoc(doc(db, 'settings', 'api_keys'), { keys: updated });
    } catch (err) {
      console.warn('Failed to update API key status in MongoDB:', err);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!window.confirm('Delete this API Key permanently?')) return;
    const updated = apiKeys.filter(k => k.id !== id);
    setApiKeys(updated);
    try {
      await setDoc(doc(db, 'settings', 'api_keys'), { keys: updated });
    } catch (err) {
      console.warn('Failed to delete API key from MongoDB:', err);
    }
  };

  const handleCreateWebhook = async () => {
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

    const updated = [newWh, ...webhooks];
    setWebhooks(updated);
    setNewWebhookUrl('');
    setIsAddingWebhook(false);

    try {
      await setDoc(doc(db, 'settings', 'webhooks'), { webhooks: updated });
    } catch (err) {
      console.warn('Failed to save webhook to MongoDB:', err);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!window.confirm('Delete this webhook subscription?')) return;
    const updated = webhooks.filter(w => w.id !== id);
    setWebhooks(updated);
    try {
      await setDoc(doc(db, 'settings', 'webhooks'), { webhooks: updated });
    } catch (err) {
      console.warn('Failed to delete webhook from MongoDB:', err);
    }
  };

  const handleTestWebhook = async (wh: WebhookSub) => {
    setTestWebhookNotice(`Pinging ${wh.url}... Sending test event 'rfid.scan'...`);
    try {
      const res = await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': wh.secret },
        body: JSON.stringify({
          event: 'rfid.scan',
          timestamp: new Date().toISOString(),
          tagId: 'E28011606000020788842D21',
          personName: 'John',
          zone: 'Zone2'
        })
      });
      setTestWebhookNotice(`Webhook Ping: HTTP ${res.status} ${res.statusText} (${wh.url})`);
    } catch (e: any) {
      setTestWebhookNotice(`Webhook Ping dispatched (Client test ping completed: ${e.message || 'ok'})`);
    }
    setTimeout(() => setTestWebhookNotice(null), 5000);
  };

  const presetEndpoints = [
    { label: 'GET GAO Real-time Tags', method: 'GET', url: '/api/GetTagsInRealtime', body: '' },
    { label: 'GET History Records (0-50)', method: 'GET', url: '/api/GetHistoryRecords/0/50', body: '' },
    { label: 'GET Calibrated AI Insights', method: 'GET', url: '/api/ai/insights', body: '' },
    { label: 'GET Personnel Directory', method: 'GET', url: '/api/data/registered_people', body: '' },
    { label: 'GET Custom Map Zones', method: 'GET', url: '/api/data/zones', body: '' },
    { label: 'GET Map Configurations', method: 'GET', url: '/api/data/map_configurations', body: '' },
    { label: 'GET MongoDB Storage Stats', method: 'GET', url: '/api/data/stats', body: '' },
    { label: 'GET Server Health Status', method: 'GET', url: '/api/health', body: '' },
    { label: 'POST Hardware Scan Telemetry', method: 'POST', url: '/api/hardware/scan', body: JSON.stringify({ tagId: "E28011606000020788842D21", readerId: "GAO-UHF-PORTAL-01", antenna: 1, rssi: -58, readCount: 1, timestamp: new Date().toISOString() }, null, 2) }
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Cards - White Theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 text-[#007BC4] rounded-xl shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Backend Engine</span>
            <span className="text-sm font-bold text-slate-900 block">
              Node Express API
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MongoDB Collections</span>
            <span className="text-sm font-bold text-slate-900 block">
              {serverStats ? `${serverStats.dbStatus || 'Connected'} Storage` : 'Atlas Live'}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
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

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">REST Endpoints</span>
            <span className="text-sm font-bold text-slate-900 block">Active Telemetry Routes</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
        <div className="p-2 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveSubTab('tester')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'tester'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Play className="w-3.5 h-3.5" /> Live API Tester & Console
          </button>
          <button
            onClick={() => setActiveSubTab('keys')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'keys'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Key className="w-3.5 h-3.5" /> API Keys Management ({apiKeys.length})
          </button>
          <button
            onClick={() => setActiveSubTab('webhooks')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'webhooks'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" /> Webhook Console ({webhooks.length})
          </button>
          <button
            onClick={() => setActiveSubTab('docs')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'docs'
                ? 'bg-[#007BC4] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" /> REST Documentation
          </button>
        </div>

        {/* SUBTAB 1: LIVE API TESTER */}
        {activeSubTab === 'tester' && (
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Quick Endpoint Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {presetEndpoints.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMethod(p.method as any);
                      setEndpoint(p.url);
                      if (p.body) setRequestBody(p.body);
                    }}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 transition cursor-pointer"
                  >
                    <span className="font-mono text-[10px] text-[#007BC4] mr-1 font-bold">{p.method}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Request Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="w-28 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#007BC4]"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>

              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/api/GetTagsInRealtime"
                className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-[#007BC4]"
              />

              <button
                type="button"
                disabled={isExecuting}
                onClick={handleSendApiRequest}
                className="px-5 py-2.5 bg-[#007BC4] hover:bg-[#00629B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                Send Request
              </button>
            </div>

            {/* Headers & Body Accordion */}
            {(method === 'POST' || method === 'PUT') && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Request JSON Body
                </label>
                <textarea
                  rows={4}
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-900 focus:outline-none focus:border-[#007BC4]"
                />
              </div>
            )}

            {/* Live Response Viewer */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-slate-50 p-3.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#007BC4]" /> Live Response Output
                </span>
                <div className="flex items-center gap-3 text-xs">
                  {responseStatus !== null && (
                    <span className={`font-bold px-2 py-0.5 rounded ${
                      responseStatus >= 200 && responseStatus < 300
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      Status: {responseStatus}
                    </span>
                  )}
                  {responseLatency !== null && (
                    <span className="font-mono text-slate-500">{responseLatency}ms</span>
                  )}
                  {responseSize && (
                    <span className="font-mono text-slate-400">{responseSize}</span>
                  )}
                </div>
              </div>
              <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto max-h-80 leading-relaxed">
                {apiResponse}
              </pre>
            </div>
          </div>
        )}

        {/* SUBTAB 2: API KEYS MANAGEMENT */}
        {activeSubTab === 'keys' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Registered Developer API Keys</h4>
                <p className="text-xs text-slate-500 font-medium">
                  API keys allow automated systems and HRMS gateways to authenticate with the Aperture REST API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGeneratingKey(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Generate Key
              </button>
            </div>

            {createdKeyFullSecret && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-emerald-900 block flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> New API Key Generated Successfully!
                </span>
                <p className="text-[11px] text-emerald-700 font-medium">
                  Copy this key now. It will not be shown again in full:
                </p>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-emerald-300">
                  <input
                    type="text"
                    readOnly
                    value={createdKeyFullSecret}
                    className="bg-transparent font-mono text-xs text-slate-900 w-full outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdKeyFullSecret);
                      setCopiedKeyId('NEW');
                      setTimeout(() => setCopiedKeyId(null), 2000);
                    }}
                    className="px-2 py-1 text-xs font-bold text-[#007BC4] hover:underline cursor-pointer shrink-0"
                  >
                    {copiedKeyId === 'NEW' ? 'Copied!' : 'Copy Secret'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                    <tr>
                      <th className="p-3.5 pl-5">Key Name</th>
                      <th className="p-3.5">Key Prefix</th>
                      <th className="p-3.5">Permissions Scope</th>
                      <th className="p-3.5">Created</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {apiKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No API keys found in MongoDB. Click &quot;Generate Key&quot; above to create your first authentication token.
                        </td>
                      </tr>
                    ) : (
                      apiKeys.map((key) => (
                        <tr key={key.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-3.5 pl-5 font-bold text-slate-900">{key.name}</td>
                          <td className="p-3.5 font-mono text-slate-600 font-bold">{key.prefix}••••••••</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">{key.scope}</td>
                          <td className="p-3.5 text-slate-500">{key.created}</td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              key.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {key.status}
                            </span>
                          </td>
                          <td className="p-3.5 pr-5 text-right space-x-2">
                            {key.status === 'Active' ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeApiKey(key.id)}
                                className="text-amber-600 hover:underline font-bold"
                              >
                                Revoke
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleDeleteApiKey(key.id)}
                              className="text-rose-600 hover:underline font-bold"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: WEBHOOKS CONSOLE */}
        {activeSubTab === 'webhooks' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Outgoing Webhook Subscriptions</h4>
                <p className="text-xs text-slate-500 font-medium">
                  Dispatch real-time HTTP POST notifications when workers move or safety hazards are detected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingWebhook(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Add Webhook
              </button>
            </div>

            {testWebhookNotice && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-[#007BC4] text-xs font-bold rounded-lg flex items-center gap-2">
                <Zap className="w-4 h-4 shrink-0" />
                <span>{testWebhookNotice}</span>
              </div>
            )}

            <div className="space-y-3">
              {webhooks.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 bg-white rounded-xl">
                  No active webhook subscriptions configured. Click &quot;Add Webhook&quot; to subscribe to site telemetry events.
                </div>
              ) : (
                webhooks.map((wh) => (
                  <div
                    key={wh.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-slate-900">{wh.url}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {wh.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span>Events: {wh.events.join(', ')}</span>
                        <span>•</span>
                        <span>Secret: {wh.secret.slice(0, 10)}••••</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTestWebhook(wh)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                      >
                        Ping Test
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWebhook(wh.id)}
                        className="text-rose-600 hover:text-rose-700 text-xs font-bold hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SUBTAB 4: REST DOCUMENTATION */}
        {activeSubTab === 'docs' && (
          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-sm font-bold text-slate-900">API Documentation & Code Samples</h4>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Authenticate your requests using the standard header <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono text-xs">Authorization: Bearer &lt;TOKEN&gt;</code>.
              </p>
            </div>

            <div className="flex gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
              {(['curl', 'javascript', 'python'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setDocLang(lang)}
                  className={`px-3 py-1 rounded-lg uppercase cursor-pointer transition ${
                    docLang === lang
                      ? 'bg-[#007BC4] text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto">
{docLang === 'curl' && `curl -X GET "${window.location.origin}/api/GetHistoryRecords/0/50" \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Accept: application/json"`}
{docLang === 'javascript' && `const res = await fetch('${window.location.origin}/api/GetHistoryRecords/0/50', {
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN',
    'Accept': 'application/json'
  }
});
const data = await res.json();
console.log(data);`}
{docLang === 'python' && `import requests

url = "${window.location.origin}/api/GetHistoryRecords/0/50"
headers = {
    "Authorization": "Bearer YOUR_API_TOKEN",
    "Accept": "application/json"
}

response = requests.get(url, headers=headers)
print(response.json())`}
            </pre>
          </div>
        )}
      </div>

      {/* Modal: Generate API Key */}
      {isGeneratingKey && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-[#007BC4]" /> Create New API Key
              </h4>
              <button
                type="button"
                onClick={() => setIsGeneratingKey(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Key Name / Client System</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Site Safety Mobile Tablet"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Scope</label>
                <select
                  value={newKeyScope}
                  onChange={(e) => setNewKeyScope(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium"
                >
                  <option value="read:telemetry, write:scans">Read Telemetry & Write Scans</option>
                  <option value="read:all, write:all">Full Read & Write Access</option>
                  <option value="read:only">Read-Only Analytics</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsGeneratingKey(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCreateApiKey();
                  setIsGeneratingKey(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs cursor-pointer"
              >
                Generate & Save to MongoDB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Webhook */}
      {isAddingWebhook && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Webhook className="w-4 h-4 text-[#007BC4]" /> Add Outgoing Webhook
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingWebhook(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Target Endpoint URL</label>
                <input
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://example.com/api/webhooks/receiver"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddingWebhook(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateWebhook}
                className="px-4 py-2 text-xs font-bold text-white bg-[#007BC4] hover:bg-[#00629B] rounded-lg shadow-xs cursor-pointer"
              >
                Save Webhook to MongoDB
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
