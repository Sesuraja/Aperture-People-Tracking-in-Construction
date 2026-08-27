import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, Pause, Trash2, Copy, Check, Filter, Zap, RefreshCw } from 'lucide-react';
import { globalWsClient, RealtimeEventMessage } from '../lib/realtimeClients';

export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  source: 'WebSocket' | 'Webhook' | 'MQTT' | 'REST API';
  event: string;
  statusCode?: number;
  payload: any;
  headers?: Record<string, string>;
  targetUrl?: string;
}

export default function WebhookInspector() {
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // GET URL Inspector states
  const [getApiUrl, setGetApiUrl] = useState(() => {
    return localStorage.getItem('inspector_get_api_url') || 'https://jsonplaceholder.typicode.com/todos/1';
  });
  const [fetchingGet, setFetchingGet] = useState(false);
  const [bypassCors, setBypassCors] = useState(true);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const handleFetchGetApi = async () => {
    if (!getApiUrl.trim()) {
      setStatusNotice('Error: Please provide a valid API URL to fetch.');
      setTimeout(() => setStatusNotice(null), 5000);
      return;
    }

    if (!getApiUrl.startsWith('http://') && !getApiUrl.startsWith('https://')) {
      setStatusNotice('Error: API URL must start with http:// or https://');
      setTimeout(() => setStatusNotice(null), 5000);
      return;
    }

    setFetchingGet(true);
    setStatusNotice(`Fetching GET data from [${getApiUrl}]...`);

    try {
      let statusCode = 200;
      let payload: any = null;
      let headers: Record<string, string> = {};

      if (bypassCors) {
        // Proxy through server
        const token = localStorage.getItem('gao_jwt_token');
        const res = await fetch('/api/connections/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({
            endpointUrl: getApiUrl,
            method: 'GET'
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          statusCode = data.statusCode || 200;
          payload = data.parsed || data.responseSnippet;
          headers = data.responseHeaders || {};
          
          // Try to parse stringified JSON if it came as responseSnippet but wasn't flagged isJson
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch {
              // keep as string
            }
          }
        } else {
          statusCode = data.statusCode || res.status;
          throw new Error(data.error || data.statusText || 'Server-side proxy fetch failed.');
        }
      } else {
        // Direct browser client-side fetch
        const res = await fetch(getApiUrl);
        statusCode = res.status;
        headers = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        
        const text = await res.text();
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { rawText: text };
        }
      }

      // Add successful log entry
      let shortEvent = 'GET Fetch';
      try {
        const parsedUrl = new URL(getApiUrl);
        shortEvent = `GET ${parsedUrl.hostname}${parsedUrl.pathname}`;
      } catch {
        shortEvent = `GET ${getApiUrl.substring(0, 30)}`;
      }

      const newLog: WebhookLogEntry = {
        id: `get_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        source: 'REST API',
        event: shortEvent,
        statusCode,
        targetUrl: getApiUrl,
        headers,
        payload
      };

      setLogs((prev) => [newLog, ...prev]);
      setStatusNotice(`Successfully fetched and inspected API data from [${getApiUrl}]!`);
    } catch (err: any) {
      setStatusNotice(`Fetch failed: ${err.message || 'CORS block or connection failure'}. Tip: Try enabling "Server Proxy (Bypass CORS)" to route it via backend.`);
    } finally {
      setFetchingGet(false);
      setTimeout(() => setStatusNotice(null), 7000);
    }
  };

  // Listen to WebSocket messages
  useEffect(() => {
    const unsubscribe = globalWsClient.onMessage((msg: RealtimeEventMessage) => {
      if (isPaused) return;

      const newEntry: WebhookLogEntry = {
        id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: msg.timestamp || new Date().toISOString(),
        source: 'WebSocket',
        event: msg.type || msg.event || 'ws_frame',
        statusCode: 200,
        headers: {
          'Channel': 'WebSocket Stream',
          'Encoding': 'JSON'
        },
        payload: msg.payload || msg
      };

      setLogs((prev) => [newEntry, ...prev].slice(0, 100));
    });

    return () => unsubscribe();
  }, [isPaused]);

  // Auto-scroll to top when new logs arrive if autoScroll enabled
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleCopyEntry = (log: WebhookLogEntry) => {
    navigator.clipboard.writeText(JSON.stringify(log.payload, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (!filterText.trim()) return true;
    const query = (filterText || "").toLowerCase();
    const strPayload = (JSON.stringify(log.payload) || '').toLowerCase();
    const strEvent = (log.event || '').toLowerCase();
    const strSource = (log.source || '').toLowerCase();
    return strPayload.includes(query) || strEvent.includes(query) || strSource.includes(query);
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-200">
      {/* Header bar */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#007BC4]/20 border border-[#007BC4]/40 rounded-lg text-[#007BC4]">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">Webhook & Payload Inspector</h3>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Live Stream Active
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Inspect real-time incoming raw JSON payloads from RFID readers & gateways
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-amber-400" /> : <Pause className="w-3.5 h-3.5 text-slate-400" />}
            {isPaused ? 'Resume Feed' : 'Pause Feed'}
          </button>

          <button
            onClick={handleCopyAll}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            {copiedAll ? 'Copied All' : 'Copy All JSON'}
          </button>

          <button
            onClick={handleClearLogs}
            className="p-1.5 bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 border border-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
            title="Clear Log History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* GET API URL Inspector Bar */}
      <div className="p-4 bg-slate-950/50 border-b border-slate-800 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded font-mono font-bold text-[10px]">
            GET METHOD
          </span>
          <span className="font-bold text-slate-200">API URL GET Inspector</span>
          <span className="text-slate-400 text-[10px]">— Paste any public API or GET URL to fetch, inspect, and analyze its JSON payload</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <input
              id="pasted-get-api-url-input"
              type="text"
              value={getApiUrl}
              onChange={(e) => {
                setGetApiUrl(e.target.value);
                localStorage.setItem('inspector_get_api_url', e.target.value);
              }}
              placeholder="e.g. https://jsonplaceholder.typicode.com/todos/1"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-emerald-400 focus:outline-none focus:border-[#007BC4]"
            />
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none text-[11px]">
              <input
                id="bypass-cors-checkbox"
                type="checkbox"
                checked={bypassCors}
                onChange={(e) => setBypassCors(e.target.checked)}
                className="rounded bg-slate-950 border-slate-800 text-[#007BC4] focus:ring-0 cursor-pointer"
              />
              <span>Server Proxy (Bypass CORS)</span>
            </label>

            <button
              id="fetch-and-inspect-api-btn"
              type="button"
              onClick={handleFetchGetApi}
              disabled={fetchingGet}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
            >
              {fetchingGet ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-white" />
                  Fetch & Inspect
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Quick Presets:</span>
          {[
            { id: 'preset-todo-api-btn', name: 'To-Do Item', url: 'https://jsonplaceholder.typicode.com/todos/1' },
            { id: 'preset-user-api-btn', name: 'User Info', url: 'https://jsonplaceholder.typicode.com/users/1' },
            { id: 'preset-weather-api-btn', name: 'Weather API', url: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current_weather=true' },
            { id: 'preset-github-api-btn', name: 'GitHub Repo info', url: 'https://api.github.com/repos/octocat/Spoon-Knife' }
          ].map((preset) => (
            <button
              key={preset.id}
              id={preset.id}
              type="button"
              onClick={() => {
                setGetApiUrl(preset.url);
                localStorage.setItem('inspector_get_api_url', preset.url);
              }}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700/60 rounded text-[10px] transition cursor-pointer"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and stats sub-bar */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter payload by TagID, event, or key..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#007BC4]"
          />
        </div>

        <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
          <span>Captured: <strong className="text-white">{filteredLogs.length}</strong> / {logs.length}</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-[#007BC4] focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      {/* Status Banner Notice */}
      {statusNotice && (
        <div className="px-4 py-2 bg-blue-950/80 border-b border-blue-800/60 text-blue-200 text-xs font-mono flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Payload Log List */}
      <div
        ref={logContainerRef}
        className="max-h-[500px] overflow-y-auto p-4 space-y-3 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-sans">
            <Terminal className="w-8 h-8 mx-auto text-slate-700 mb-2" />
            <p className="font-bold text-slate-400">No raw webhook payloads matched filter</p>
            <p className="text-xs mt-1 text-slate-600">Waiting for real-time hardware WebSocket triggers from RFID readers & gateways</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isCopy = copiedId === log.id;
            return (
              <div
                key={log.id}
                className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3.5 transition space-y-2 group"
              >
                {/* Meta header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        log.source === 'WebSocket'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : log.source === 'Webhook'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : log.source === 'MQTT'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {log.source}
                    </span>

                    <span className="text-white font-bold text-xs">{log.event}</span>

                    {log.statusCode && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                          log.statusCode >= 200 && log.statusCode < 300
                            ? 'bg-emerald-950 text-emerald-400'
                            : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        HTTP {log.statusCode}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()} ({new Date(log.timestamp).toLocaleDateString()})
                    </span>

                    <button
                      onClick={() => handleCopyEntry(log)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                      title="Copy Payload JSON"
                    >
                      {isCopy ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Headers if present */}
                {log.headers && Object.keys(log.headers).length > 0 && (
                  <div className="text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded border border-slate-800/40">
                    <span className="font-bold text-slate-400">Headers: </span>
                    {Object.entries(log.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' | ')}
                  </div>
                )}

                {/* JSON Body */}
                <pre className="text-[11px] leading-relaxed text-emerald-400/90 overflow-x-auto whitespace-pre-wrap font-mono bg-slate-900/90 p-3 rounded-lg border border-slate-800/60">
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
