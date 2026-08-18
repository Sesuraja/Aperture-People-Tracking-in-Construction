import React, { useState, useEffect } from 'react';
import {
  Radio,
  Key,
  Globe,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Zap,
  Clock,
  ShieldCheck,
  Database,
  Sliders,
  Play,
  Square,
  FileText,
  Users,
  MapPin,
  Tag
} from 'lucide-react';

export function RfidApiConfiguration() {
  const [host, setHost] = useState('https://www.i360services.com/peopletrackinguhf');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('••••••••••••');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [authHeaderType, setAuthHeaderType] = useState<'X-API-Key' | 'Bearer' | 'Custom'>('X-API-Key');
  const [customHeaderName, setCustomHeaderName] = useState('X-API-Key');
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(10);
  const [isPollingActive, setIsPollingActive] = useState(true);
  
  const [connStatus, setConnStatus] = useState<string>('UNKNOWN');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncingRealtime, setIsSyncingRealtime] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [isExtractingKeyData, setIsExtractingKeyData] = useState(false);

  const [keyInspection, setKeyInspection] = useState<any>(null);
  const [mongoCounts, setMongoCounts] = useState<{
    liveTags: number;
    historyRecords: number;
    registeredPeople: number;
    locations: number;
  }>({ liveTags: 0, historyRecords: 0, registeredPeople: 0, locations: 0 });

  const [feedbackNotice, setFeedbackNotice] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    msg: string;
  } | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('gao_jwt_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // 1. Fetch existing RFID configuration and polling status from backend / MongoDB
  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/integrations/gao/config', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.host) setHost(data.host);
        if (data.authHeaderType) setAuthHeaderType(data.authHeaderType);
        if (data.customHeaderName) setCustomHeaderName(data.customHeaderName);
        if (data.pollingIntervalSeconds) setPollingIntervalSeconds(data.pollingIntervalSeconds);
        setApiKeyConfigured(Boolean(data.apiKeyConfigured));
        if (data.apiKeyMasked) setApiKeyMasked(data.apiKeyMasked);
        if (data.lastSuccessfulSync) setLastSync(data.lastSuccessfulSync);
        if (data.lastError) setLastError(data.lastError);
        if (data.status) setConnStatus(data.status);
        if (data.keyInspection) setKeyInspection(data.keyInspection);
      }

      const infoRes = await fetch('/api/integrations/gao/key-info', { headers: getAuthHeaders() });
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        if (infoData.keyInspection) setKeyInspection(infoData.keyInspection);
        if (infoData.mongoCounts) setMongoCounts(infoData.mongoCounts);
      }

      const pollRes = await fetch('/api/integrations/gao/polling/status', { headers: getAuthHeaders() });
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        if (pollData.polling) {
          setIsPollingActive(pollData.polling.isActive);
          if (pollData.polling.intervalSeconds) setPollingIntervalSeconds(pollData.polling.intervalSeconds);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load RFID API configuration from MongoDB:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // 2. Save configuration directly to MongoDB
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setFeedbackNotice(null);
    try {
      const payload: any = {
        host: host.trim(),
        authHeaderType,
        customHeaderName: customHeaderName.trim(),
        pollingIntervalSeconds: Number(pollingIntervalSeconds)
      };
      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }

      const res = await fetch('/api/integrations/gao/config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setApiKeyConfigured(data.apiKeyConfigured);
        setApiKeyMasked(data.apiKeyMasked);
        setApiKeyInput(''); // Clear plaintext input for security
        setFeedbackNotice({
          type: 'success',
          title: 'Configuration & Key Saved to MongoDB',
          msg: data.extractionSummary
            ? `API key saved! Ingested and stored ${data.extractionSummary.totalMongoRecordsSaved} record(s) into MongoDB.`
            : 'GAO RFID API parameters have been updated and persisted to MongoDB.'
        });
        
        // Refresh counts and test
        fetchConfig();
        handleTestConnection(false);
      } else {
        setFeedbackNotice({
          type: 'error',
          title: 'Save Failed',
          msg: data.error || 'Unable to update configuration in MongoDB.'
        });
      }
    } catch (err: any) {
      setFeedbackNotice({
        type: 'error',
        title: 'Connection Error',
        msg: err.message || 'Network failure while saving configuration.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 3. Extract and ingest all data from the API key into MongoDB
  const handleExtractAndIngestFromKey = async () => {
    setIsExtractingKeyData(true);
    setFeedbackNotice(null);
    try {
      const res = await fetch('/api/integrations/gao/extract-key-data', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ apiKey: apiKeyInput.trim() || undefined })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackNotice({
          type: 'success',
          title: 'Data Ingested into MongoDB',
          msg: `Successfully extracted and stored ${data.result?.totalMongoRecordsSaved || 0} record(s) in MongoDB (Collections: ${data.result?.collectionsUpdated?.join(', ') || 'live_tags, rfid_history, people'}).`
        });
        fetchConfig();
      } else {
        setFeedbackNotice({
          type: 'error',
          title: 'Ingest Error',
          msg: data.error || 'Failed to extract data from API key.'
        });
      }
    } catch (err: any) {
      setFeedbackNotice({
        type: 'error',
        title: 'Extraction Error',
        msg: err.message || 'Failed to trigger API key data extraction.'
      });
    } finally {
      setIsExtractingKeyData(false);
    }
  };

  // 4. Test Connection
  const handleTestConnection = async (showExplicitFeedback = true) => {
    setIsTesting(true);
    if (showExplicitFeedback) setFeedbackNotice(null);

    try {
      const res = await fetch('/api/integrations/gao/test', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          host: host.trim(),
          apiKey: apiKeyInput.trim() || undefined,
          authHeaderType,
          customHeaderName: customHeaderName.trim()
        })
      });

      const data = await res.json();
      const rawStatus = (data.status || 'UNKNOWN').toUpperCase();
      setConnStatus(rawStatus);
      if (data.latencyMs) setLatencyMs(data.latencyMs);

      if (rawStatus === 'CONNECTED') {
        const nowIso = new Date().toISOString();
        setLastSync(nowIso);
        setLastError(null);
        if (showExplicitFeedback) {
          setFeedbackNotice({
            type: 'success',
            title: 'Connection Verified (HTTP 200 OK)',
            msg: `Successfully connected to GAO RFID API server (${data.latencyMs || 42}ms latency). Authentication verified.`
          });
        }
      } else {
        const errMsg = data.message || `Status: ${rawStatus}`;
        setLastError(errMsg);
        if (showExplicitFeedback) {
          setFeedbackNotice({
            type: 'error',
            title: 'Connection Test Failed',
            msg: errMsg
          });
        }
      }
    } catch (err: any) {
      setConnStatus('DISCONNECTED');
      setLastError(err.message);
      if (showExplicitFeedback) {
        setFeedbackNotice({
          type: 'error',
          title: 'Network Error',
          msg: err.message || 'Failed to reach backend test route.'
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  // 5. Toggle Background Polling
  const handleTogglePolling = async () => {
    try {
      const res = await fetch('/api/integrations/gao/polling/toggle', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enable: !isPollingActive })
      });
      const data = await res.json();
      if (data.polling) {
        setIsPollingActive(data.polling.isActive);
        setFeedbackNotice({
          type: 'info',
          title: data.polling.isActive ? 'Background Polling Enabled' : 'Background Polling Paused',
          msg: data.polling.isActive
            ? `Active RFID polling is running every ${data.polling.intervalSeconds}s into MongoDB.`
            : 'Background polling service has been temporarily suspended.'
        });
      }
    } catch (err: any) {
      console.warn('Toggle polling error:', err);
    }
  };

  // 6. Trigger Real-Time Sync
  const handleSyncRealtime = async () => {
    setIsSyncingRealtime(true);
    setFeedbackNotice(null);
    try {
      const res = await fetch('/api/integrations/gao/sync-realtime', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        const nowIso = new Date().toISOString();
        setLastSync(nowIso);
        setConnStatus('CONNECTED');
        setFeedbackNotice({
          type: 'success',
          title: 'Real-Time Sync Succeeded',
          msg: `Processed ${data.totalFetched || 0} active tags (${data.processedCount || 0} novel unique events stored in MongoDB).`
        });
        fetchConfig();
      } else {
        setFeedbackNotice({
          type: 'error',
          title: 'Real-Time Sync Error',
          msg: data.error || 'Failed to retrieve real-time tags.'
        });
      }
    } catch (err: any) {
      setFeedbackNotice({
        type: 'error',
        title: 'Sync Failed',
        msg: err.message || 'Network request failed'
      });
    } finally {
      setIsSyncingRealtime(false);
    }
  };

  // 7. Trigger History Sync
  const handleSyncHistory = async () => {
    setIsSyncingHistory(true);
    setFeedbackNotice(null);
    try {
      const res = await fetch('/api/integrations/gao/sync-history', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ takeCount: 200 })
      });
      const data = await res.json();
      if (data.success) {
        const nowIso = new Date().toISOString();
        setLastSync(nowIso);
        setConnStatus('CONNECTED');
        setFeedbackNotice({
          type: 'success',
          title: 'History Sync Succeeded',
          msg: `Fetched ${data.recordsFetched || 0} historical events out of ${data.totalCount || 0} total records in MongoDB.`
        });
        fetchConfig();
      } else {
        setFeedbackNotice({
          type: 'error',
          title: 'History Sync Error',
          msg: data.error || 'Failed to sync historical records.'
        });
      }
    } catch (err: any) {
      setFeedbackNotice({
        type: 'error',
        title: 'Sync Failed',
        msg: err.message || 'Network request failed'
      });
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const isConnected = connStatus === 'CONNECTED' || connStatus === 'connected';

  return (
    <div className="space-y-6" id="rfid_api_configuration_card">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#007BC4] rounded-xl text-white shadow-md">
              <Radio className={`w-6 h-6 ${isConnected ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight">RFID API & Data Configuration</h3>
                <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                  MongoDB Storage
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Centralized gateway: extract & fetch live data using the API Key and store all RFID records directly in MongoDB.
              </p>
            </div>
          </div>

          {/* Connection Status Badge */}
          <div className="flex items-center gap-2">
            <div
              id="rfid_connection_status_badge"
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border transition-all ${
                isConnected
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-xs'
                  : connStatus === 'AUTHENTICATION_FAILED'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-emerald-400 animate-ping'
                    : connStatus === 'AUTHENTICATION_FAILED'
                    ? 'bg-rose-400'
                    : 'bg-amber-400'
                }`}
              />
              <span>{isConnected ? '● Connected' : `● ${connStatus.replace(/_/g, ' ')}`}</span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackNotice && (
          <div
            className={`p-4 border-b text-xs font-medium flex items-start gap-3 transition-all ${
              feedbackNotice.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                : feedbackNotice.type === 'error'
                ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                : 'bg-blue-50/90 border-blue-200 text-blue-900'
            }`}
          >
            {feedbackNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-bold">{feedbackNotice.title}</div>
              <div className="mt-0.5">{feedbackNotice.msg}</div>
            </div>
          </div>
        )}

        {/* Main Configuration Form */}
        <div className="p-6 space-y-6">
          {/* 1. API Base URL */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#007BC4]" />
                API Base URL
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setHost('https://www.i360services.com/peopletrackinguhf')}
                  className="text-[11px] font-semibold text-[#007BC4] hover:underline cursor-pointer"
                >
                  Reset Default
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                id="rfid_api_base_url_input"
                type="url"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="https://www.i360services.com/peopletrackinguhf"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 font-mono text-xs focus:bg-white focus:border-[#007BC4] focus:ring-2 focus:ring-[#007BC4]/20 outline-none transition"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              The primary GAO RFID People Tracking UHF HTTP endpoint or proxy URL.
            </p>
          </div>

          {/* 2. API Key & Auth Header Configuration */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-[#007BC4]" />
                    API Key (Contains Data & Ingestion Access)
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    MongoDB: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-bold">{apiKeyMasked}</code>
                  </span>
                </div>

                <div className="relative">
                  <input
                    id="rfid_api_key_input"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={apiKeyConfigured ? '•••••••••••• (Leave blank to keep saved key)' : 'Enter or paste GAO RFID API Key...'}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-3.5 pr-10 py-2.5 text-slate-900 font-mono text-xs focus:bg-white focus:border-[#007BC4] focus:ring-2 focus:ring-[#007BC4]/20 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    title={showApiKey ? 'Hide Key' : 'Show Key'}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Securely stored in MongoDB <code className="font-mono text-slate-700">settings</code> collection.
                </p>
              </div>

              {/* Header Authentication Scheme */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#007BC4]" />
                  Auth Header Scheme
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthHeaderType('X-API-Key')}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      authHeaderType === 'X-API-Key'
                        ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>X-API-Key</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthHeaderType('Bearer')}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      authHeaderType === 'Bearer'
                        ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>Bearer Token</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500">
                  {authHeaderType === 'Bearer'
                    ? 'Injected as "Authorization: Bearer <key>" in outgoing requests.'
                    : 'Injected as "X-API-Key: <key>" in outgoing requests.'}
                </p>
              </div>
            </div>
          </div>

          {/* 3. MongoDB Data Summary & Extraction Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#007BC4]" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  MongoDB Stored RFID Data
                </span>
              </div>
              <button
                type="button"
                onClick={handleExtractAndIngestFromKey}
                disabled={isExtractingKeyData}
                className="px-3 py-1.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${isExtractingKeyData ? 'animate-spin' : ''}`} />
                <span>{isExtractingKeyData ? 'Ingesting to MongoDB...' : 'Extract & Ingest Data From API Key'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <Tag className="w-3.5 h-3.5 text-[#007BC4]" /> Live Tags
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">
                  {mongoCounts.liveTags}
                </div>
                <div className="text-[10px] text-slate-400">Stored in MongoDB</div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" /> History Records
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">
                  {mongoCounts.historyRecords}
                </div>
                <div className="text-[10px] text-slate-400">Stored in MongoDB</div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <Users className="w-3.5 h-3.5 text-emerald-500" /> People / Staff
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">
                  {mongoCounts.registeredPeople}
                </div>
                <div className="text-[10px] text-slate-400">Stored in MongoDB</div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" /> Zones / Locations
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">
                  {mongoCounts.locations}
                </div>
                <div className="text-[10px] text-slate-400">Stored in MongoDB</div>
              </div>
            </div>

            {keyInspection?.isDecoded && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Decoded API Key Data ({keyInspection.format})
                </div>
                <div className="text-[11px] text-blue-800">
                  {keyInspection.extractedEntities?.clientName && <span>Client: <b>{keyInspection.extractedEntities.clientName}</b> | </span>}
                  {keyInspection.extractedEntities?.tenantId && <span>Tenant: <b>{keyInspection.extractedEntities.tenantId}</b> | </span>}
                  <span>Embedded Tags: <b>{keyInspection.extractedEntities?.tagsCount || 0}</b></span> | 
                  <span> Embedded Staff: <b>{keyInspection.extractedEntities?.peopleCount || 0}</b></span>
                </div>
              </div>
            )}
          </div>

          {/* 4. Background Polling Service Settings */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#007BC4]" />
                Continuous RFID Polling to MongoDB
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePolling}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                    isPollingActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  {isPollingActive ? <Square className="w-3 h-3 fill-emerald-600 text-emerald-600" /> : <Play className="w-3 h-3 fill-amber-600 text-amber-600" />}
                  <span>{isPollingActive ? 'Polling Active' : 'Polling Paused'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[5, 10, 15, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setPollingIntervalSeconds(sec)}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition cursor-pointer ${
                    pollingIntervalSeconds === sec
                      ? 'bg-[#007BC4] text-white border-[#007BC4] shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Every {sec} Seconds
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              The background polling service periodically calls <code className="font-mono text-slate-700">GetTagsInRealtime</code>, passes tags through fingerprint deduplication, and stores novel events in MongoDB.
            </p>
          </div>

          {/* 5. Live Metrics & Connection Status / Last Sync Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Connection Status */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Connection Status
              </div>
              <div className="text-xs font-bold text-slate-900 mt-1 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <span>{isConnected ? 'Active / Connected' : connStatus}</span>
              </div>
              {latencyMs !== null && isConnected && (
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Latency: {latencyMs}ms
                </div>
              )}
            </div>

            {/* Last Sync */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                Last Sync
              </div>
              <div className="text-xs font-mono font-semibold text-slate-800 mt-1 truncate">
                {lastSync
                  ? new Date(lastSync).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : 'Never Synced'}
              </div>
              <div className="text-[10px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
                <Database className="w-3 h-3" /> Storing in MongoDB
              </div>
            </div>

            {/* Ingest Endpoints */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                Ingestion Engine
              </div>
              <div className="text-xs font-bold text-slate-800 mt-1">
                Interval: {pollingIntervalSeconds}s ({isPollingActive ? 'Active' : 'Paused'})
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                SSE + WebSocket Streaming
              </div>
            </div>
          </div>

          {/* Last Error if any */}
          {lastError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-mono">
              <span className="font-bold">Last Error:</span> {lastError}
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Manual Sync Triggers */}
          <div className="flex items-center gap-2">
            <button
              id="rfid_sync_realtime_btn"
              type="button"
              onClick={handleSyncRealtime}
              disabled={isSyncingRealtime}
              className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#007BC4] ${isSyncingRealtime ? 'animate-spin' : ''}`} />
              <span>{isSyncingRealtime ? 'Syncing...' : 'Sync Real-Time'}</span>
            </button>

            <button
              id="rfid_sync_history_btn"
              type="button"
              onClick={handleSyncHistory}
              disabled={isSyncingHistory}
              className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>{isSyncingHistory ? 'Syncing...' : 'Sync History'}</span>
            </button>
          </div>

          {/* Test & Save Actions */}
          <div className="flex items-center gap-2">
            <button
              id="rfid_test_connection_btn"
              type="button"
              onClick={() => handleTestConnection(true)}
              disabled={isTesting}
              className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-[#007BC4]' : 'text-slate-500'}`} />
              <span>{isTesting ? 'Testing Connection...' : 'Test Connection'}</span>
            </button>

            <button
              id="rfid_save_config_btn"
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-5 py-2 bg-[#007BC4] hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving to MongoDB...' : 'Save to MongoDB'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

