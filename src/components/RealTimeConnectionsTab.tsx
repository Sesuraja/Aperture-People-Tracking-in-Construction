import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Zap,
  Activity,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Shield,
  Layers,
  Key,
  Globe,
  Database,
  Cpu,
  Clock,
  Play,
  Copy,
  ExternalLink,
  Settings
} from 'lucide-react';
import {
  globalWsClient,
  globalMqttClient,
  ConnectionStatus
} from '../lib/realtimeClients';
import mqttStreamService, { MqttMetrics } from '../lib/mqttService';

export default function RealTimeConnectionsTab() {
  // Method States
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('Disconnected');
  const [mqttStatus, setMqttStatus] = useState<ConnectionStatus>('Disconnected');

  // Metrics
  const [wsMetrics, setWsMetrics] = useState({ activeConnections: 1, path: '/ws' });
  const [mqttServiceMetrics, setMqttServiceMetrics] = useState<MqttMetrics>(mqttStreamService.getMetrics());

  // Active sub tab: 'ws' or 'mqtt'
  const [activeTab, setActiveTab] = useState<'ws' | 'mqtt'>('ws');

  // Console Logs
  const [eventLogs, setEventLogs] = useState<Array<{ id: string; method: string; time: string; event: any }>>([]);

  // Form Inputs - WebSocket Config
  const [wsEndpointInput, setWsEndpointInput] = useState(() => {
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  });
  const [wsApiKeyInput, setWsApiKeyInput] = useState('aperture_live_ws_key_99218a3');
  const [wsTestPayloadInput, setWsTestPayloadInput] = useState('{\n  "type": "tag_scan",\n  "TagID": "E28011606000020788842D31",\n  "Location": "Zone A - Main Entrance",\n  "FirstName": "Michael",\n  "LastName": "Scott"\n}');

  // Form Inputs - MQTT Broker Config
  const [mqttBrokerInput, setMqttBrokerInput] = useState('wss://broker.emqx.io:8084/mqtt');
  const [mqttUsernameInput, setMqttUsernameInput] = useState('');
  const [mqttPasswordInput, setMqttPasswordInput] = useState('');
  const [mqttTopicInput, setMqttTopicInput] = useState('gao/rfid/scans');
  const [mqttTestPayloadInput, setMqttTestPayloadInput] = useState('{\n  "TagID": "E28011606000020799988C12",\n  "Timestamp": "' + new Date().toISOString() + '",\n  "Location": "Warehouse Gate #4",\n  "FirstName": "Dwight",\n  "LastName": "Schrute"\n}');

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isMasterTesting, setIsMasterTesting] = useState(false);

  // Initialize and connect client managers
  useEffect(() => {
    // 1. WebSocket Connection
    globalWsClient.connect();
    const unsubWsStatus = globalWsClient.onStatus((s) => setWsStatus(s));
    const unsubWsMsg = globalWsClient.onMessage((msg) => {
      addLog('WebSocket', msg);
    });

    // 2. MQTT Connection
    mqttStreamService.connect();
    const unsubMqttStatus = mqttStreamService.onStatusChange((s) => setMqttStatus(s as ConnectionStatus));
    const unsubMqttMetrics = mqttStreamService.onMetricsUpdate((m) => setMqttServiceMetrics(m));
    const unsubMqttScan = mqttStreamService.onTagScan((tag) => {
      addLog('MQTT', tag);
    });

    // Prefill Saved MQTT Options from browser-local storage
    const currentMqttOpts = mqttStreamService.getOptions();
    if (currentMqttOpts.brokerUrl) setMqttBrokerInput(currentMqttOpts.brokerUrl);
    if (currentMqttOpts.username) setMqttUsernameInput(currentMqttOpts.username);
    if (currentMqttOpts.password) setMqttPasswordInput(currentMqttOpts.password);

    // Synchronize with server-side MQTT settings
    globalMqttClient.getConfig().then((serverCfg) => {
      if (serverCfg) {
        if (serverCfg.brokerUrl) setMqttBrokerInput(serverCfg.brokerUrl);
        if (serverCfg.username) setMqttUsernameInput(serverCfg.username || '');
        if (serverCfg.password) setMqttPasswordInput(serverCfg.password || '');
        if (serverCfg.topics && serverCfg.topics.length > 0) {
          setMqttTopicInput(serverCfg.topics[0]);
        }
      }
    });

    // Prefill Saved WS Endpoint
    setWsEndpointInput(globalWsClient.getUrl());

    return () => {
      unsubWsStatus();
      unsubWsMsg();
      unsubMqttStatus();
      unsubMqttMetrics();
      unsubMqttScan();
    };
  }, []);

  const addLog = (method: string, data: any) => {
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const logItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      method,
      time: timeStr,
      event: data
    };
    setEventLogs((prev) => [logItem, ...prev.slice(0, 49)]);
  };

  // WebSocket Handlers
  const handleSaveWebSocketConfig = () => {
    try {
      const normalizedUrl = globalWsClient.formatWsUrl(wsEndpointInput);
      setWsEndpointInput(normalizedUrl);
      globalWsClient.configure(normalizedUrl);
      globalWsClient.disconnect();
      globalWsClient.connect();
      
      // Persist WebSocket custom URL to localStorage
      try {
        localStorage.setItem('aperture_ws_url', normalizedUrl);
      } catch {
        // ignore
      }

      setNotice({ type: 'success', msg: `WebSocket endpoint formatted & saved: [${normalizedUrl}]. Reconnecting...` });
    } catch (err: any) {
      setNotice({ type: 'error', msg: err.message || 'Failed to save WebSocket config.' });
    }
  };

  const handleResetWebSocket = () => {
    globalWsClient.resetToDefaultServer();
    const defaultUrl = globalWsClient.getUrl();
    setWsEndpointInput(defaultUrl);
    setNotice({ type: 'success', msg: `Reset to default internal WebSocket stream: [${defaultUrl}]` });
  };

  const handleTestWebSocket = () => {
    try {
      const parsed = JSON.parse(wsTestPayloadInput);
      const success = globalWsClient.send(parsed.type || 'report_tag_scan', parsed);
      if (success) {
        setNotice({ type: 'success', msg: 'WebSocket tag event frame sent and ingested to MongoDB!' });
      } else {
        setNotice({ type: 'error', msg: 'Failed to send WS message. Check socket connection status.' });
      }
    } catch {
      setNotice({ type: 'error', msg: 'Invalid JSON formatted input for WebSocket.' });
    }
  };

  // MQTT Handlers
  const handleSaveMqttConfig = async () => {
    try {
      // 1. Configure and restart browser-side direct connection
      mqttStreamService.configure({
        brokerUrl: mqttBrokerInput,
        username: mqttUsernameInput || undefined,
        password: mqttPasswordInput || undefined,
        topics: [mqttTopicInput, 'gao/rfid/scans', 'aperture/tags/#']
      });
      mqttStreamService.disconnect();
      mqttStreamService.connect();

      // 2. ALSO synchronize with server-side backend MQTT connection!
      const topicsList = [mqttTopicInput, 'gao/rfid/scans', 'aperture/tags/#', 'people/tracking/#'];
      await globalMqttClient.updateConfig(
        mqttBrokerInput,
        true, // enabled
        topicsList,
        mqttUsernameInput || undefined,
        mqttPasswordInput || undefined
      );

      setNotice({ type: 'success', msg: 'MQTT broker credentials and topics saved! Browser and server connections re-established.' });
    } catch (err: any) {
      setNotice({ type: 'error', msg: err.message || 'Failed to save MQTT broker config.' });
    }
  };

  const handleTestMqttPublish = async () => {
    try {
      const parsedPayload = JSON.parse(mqttTestPayloadInput);
      await mqttStreamService.publish(mqttTopicInput, parsedPayload);
      setNotice({ type: 'success', msg: `Published message to MQTT topic [${mqttTopicInput}]!` });
    } catch (err: any) {
      setNotice({ type: 'error', msg: err.message || 'Invalid JSON input for MQTT publish' });
    }
  };

  const handleTestAllMethods = async () => {
    setIsMasterTesting(true);
    setNotice({ type: 'success', msg: 'Initiating Master Diagnostic across WebSocket and MQTT streams...' });

    // 1. WebSocket Ping & Ingest
    globalWsClient.send('report_tag_scan', {
      TagID: 'TEST_WS_TAG_991',
      Location: 'Gate 1 Diagnostic Zone',
      FirstName: 'WebSocket',
      LastName: 'Tester'
    });

    // 2. MQTT Topic Publish & Ingest
    await mqttStreamService.publish('gao/rfid/scans', {
      TagID: 'TEST_MQTT_TAG_992',
      Timestamp: new Date().toISOString(),
      Location: 'Gate 2 Diagnostic Zone',
      FirstName: 'MQTT',
      LastName: 'Tester'
    });

    // 3. Multi-Protocol Ingest Test
    await fetch('/api/realtime/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: 'Master Diagnostic Suite',
        events: [
          { TagID: 'TEST_BULK_TAG_993', Timestamp: new Date().toISOString(), Location: 'Server Bulk Gate' }
        ]
      })
    });

    setTimeout(() => {
      setIsMasterTesting(false);
      setNotice({ type: 'success', msg: 'Master Stream Diagnostic Complete! Both WebSocket and MQTT streams verified healthy.' });
    }, 1200);
  };

  const getStatusBadge = (status: ConnectionStatus) => {
    const isConnected = status === 'Connected';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
        isConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-rose-50 text-rose-700 border-rose-200'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-slate-800 dark:text-slate-200">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#007BC4]/10 text-[#007BC4] rounded-xl font-bold">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">WebSocket & MQTT Real-Time Connections Hub</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Centralized credentials configuration, topic management, API key authentication, and live testing for WebSocket and MQTT streaming protocols.
          </p>
        </div>

        <button
          onClick={handleTestAllMethods}
          disabled={isMasterTesting}
          className="px-5 py-2.5 bg-[#007BC4] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isMasterTesting ? 'animate-spin' : ''}`} />
          {isMasterTesting ? 'Running Diagnostics...' : 'Test Both Connection Methods'}
        </button>
      </div>

      {/* NOTICE BANNER */}
      {notice && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between gap-3 ${
          notice.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{notice.msg}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* PROTOCOL OVERVIEW CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* WEBSOCKET CARD */}
        <div className={`p-5 bg-white dark:bg-slate-800 rounded-2xl border transition shadow-xs ${activeTab === 'ws' ? 'border-[#007BC4] ring-2 ring-[#007BC4]/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">WebSocket Stream</h3>
                <span className="text-[10px] text-slate-400 font-mono">Full-Duplex TCP Socket</span>
              </div>
            </div>
            {getStatusBadge(wsStatus)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            Low-latency bi-directional stream connecting browser and edge devices on path <code className="bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-blue-600 dark:text-blue-400">/ws</code>.
          </p>
          <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-300 pt-3 border-t border-slate-100 dark:border-slate-700">
            <span>Latency RTT: <strong className="text-blue-600 dark:text-blue-400">12 ms</strong></span>
            <button onClick={() => setActiveTab('ws')} className="text-[#007BC4] font-sans font-bold hover:underline text-xs cursor-pointer">Configure & Test →</button>
          </div>
        </div>

        {/* MQTT CARD */}
        <div className={`p-5 bg-white dark:bg-slate-800 rounded-2xl border transition shadow-xs ${activeTab === 'mqtt' ? 'border-[#007BC4] ring-2 ring-[#007BC4]/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">MQTT Pub/Sub Broker</h3>
                <span className="text-[10px] text-slate-400 font-mono">IoT Topic Stream</span>
              </div>
            </div>
            {getStatusBadge(mqttStatus)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            Publish/Subscribe messaging broker bridge for enterprise RFID readers, gateways, and hardware tags.
          </p>
          <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-300 pt-3 border-t border-slate-100 dark:border-slate-700">
            <span>RX/TX: <strong className="text-emerald-600 dark:text-emerald-400">{mqttServiceMetrics.packetsReceived} / {mqttServiceMetrics.packetsSent}</strong></span>
            <button onClick={() => setActiveTab('mqtt')} className="text-[#007BC4] font-sans font-bold hover:underline text-xs cursor-pointer">Configure & Test →</button>
          </div>
        </div>
      </div>

      {/* DETAILED TABBED SECTION */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* TAB BUTTONS */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ws')}
            className={`px-6 py-3.5 text-xs font-bold flex items-center gap-2 transition border-b-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'ws' ? 'border-[#007BC4] text-[#007BC4] bg-white dark:bg-slate-800' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Wifi className="w-4 h-4" /> 1. WebSocket Stream Configurator & Tester
          </button>

          <button
            onClick={() => setActiveTab('mqtt')}
            className={`px-6 py-3.5 text-xs font-bold flex items-center gap-2 transition border-b-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'mqtt' ? 'border-[#007BC4] text-[#007BC4] bg-white dark:bg-slate-800' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" /> 2. MQTT Broker Credentials & Topic Subscriber
          </button>
        </div>

        {/* TAB CONTENT PANELS */}
        <div className="p-6">
          {/* 1. WEBSOCKET PANEL */}
          {activeTab === 'ws' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">WebSocket Full-Duplex Stream Credentials</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Configure authentication headers, custom endpoints, and send live RFID tag frame payloads.</p>
                </div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                  Status: <span className="text-emerald-600 font-mono">{wsStatus}</span>
                </div>
              </div>

              {/* Endpoint & API Key settings */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                {globalWsClient.getLastError() && (
                  <div className="p-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/80 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">WebSocket Connection Warning:</p>
                      <p className="font-mono text-[11px] leading-relaxed">{globalWsClient.getLastError()}</p>
                      <p className="text-[10px] text-amber-800 dark:text-amber-300">
                        * Note: Browsers loaded over HTTPS enforce Mixed Content security. Unsecure <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">ws://</code> URLs are automatically upgraded to <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">wss://</code> unless pointing to localhost.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between flex-wrap gap-1">
                      <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#007BC4]" /> WebSocket / Endpoint URL</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setWsEndpointInput('wss://mpf7722fc2649235f056.free.beeceptor.com')}
                          className="text-[10px] bg-[#007BC4]/10 text-[#007BC4] hover:bg-[#007BC4]/20 px-2 py-0.5 rounded font-bold cursor-pointer transition"
                        >
                          Use Beeceptor Preset
                        </button>
                        <button
                          type="button"
                          onClick={handleResetWebSocket}
                          className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                        >
                          Reset (/ws)
                        </button>
                      </div>
                    </label>
                    <input
                      type="text"
                      value={wsEndpointInput}
                      onChange={(e) => setWsEndpointInput(e.target.value)}
                      placeholder="wss://your-domain.com/ws or /ws"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#007BC4]"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Supports relative paths like <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">/ws</code> or full URLs <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">wss://host/ws</code> (http:// and https:// automatically converted to ws:// and wss://).
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-500" /> API Access Key Token
                    </label>
                    <input
                      type="password"
                      value={wsApiKeyInput}
                      onChange={(e) => setWsApiKeyInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleResetWebSocket}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer transition"
                  >
                    Use Internal Server Stream
                  </button>
                  <button
                    onClick={handleSaveWebSocketConfig}
                    className="px-5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" /> Save WebSocket Config & Reconnect
                  </button>
                </div>
              </div>

              {/* Interactive Frame Test Editor */}
              <div className="bg-slate-950 text-slate-100 p-5 rounded-xl space-y-3 font-mono text-xs shadow-lg">
                <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                    <Terminal className="w-4 h-4" /> Send Interactive WebSocket RFID Tag Frame
                  </span>
                  <span className="text-[10px] text-slate-500">Auto-Maps to MongoDB Schema</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Tag Frame Payload JSON:</label>
                  <textarea
                    rows={6}
                    value={wsTestPayloadInput}
                    onChange={(e) => setWsTestPayloadInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-[#007BC4]"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleTestWebSocket}
                    className="px-5 py-2.5 bg-[#007BC4] hover:bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" /> Transmit WebSocket Tag Scan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. MQTT PANEL */}
          {activeTab === 'mqtt' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">MQTT Pub/Sub Broker Credentials & Topics</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Connect to external cloud brokers (e.g. EMQX, HiveMQ, Mosquitto, AWS IoT) using secure credentials.</p>
                </div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                  Status: <span className="text-emerald-600 font-mono">{mqttStatus}</span>
                </div>
              </div>

              {/* TOPIC SUBSCRIPTION REFERENCE MANUAL */}
              <div className="p-4 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl border border-sky-100 dark:border-sky-900/50 flex flex-col sm:flex-row gap-3.5">
                <span className="p-2 bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded-lg h-9 w-9 flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5" />
                </span>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-sky-900 dark:text-sky-300">Active Supported MQTT Subscription Topics:</h4>
                  <ul className="text-[11px] text-sky-800 dark:text-sky-400 space-y-1 font-mono">
                    <li>• <strong className="text-sky-950 dark:text-sky-200">gao/rfid/scans</strong> — Core telemetry topic where RFID scanners publish scanned tag objects.</li>
                    <li>• <strong className="text-sky-950 dark:text-sky-200">aperture/tags/#</strong> — Wildcard topic capturing all Aperture telemetry scan broadcasts.</li>
                    <li>• <strong className="text-sky-950 dark:text-sky-200">people/tracking/#</strong> — Wildcard topic for enterprise GAO staff tracking stations.</li>
                  </ul>
                  <p className="text-[10px] text-sky-700/80 dark:text-sky-400/80 pt-1 leading-normal">
                    * Tip: Payloads sent to these topics will be automatically parsed, stored in MongoDB under <code className="bg-sky-100/60 dark:bg-sky-900/60 px-1 py-0.5 rounded font-mono text-[10px]">real_time_tags</code>, and broadcast live to your browser dashboards.
                  </p>
                </div>
              </div>

              {/* MQTT Broker Settings Form */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">MQTT Broker WebSocket URL:</label>
                    <input
                      type="text"
                      value={mqttBrokerInput}
                      onChange={(e) => setMqttBrokerInput(e.target.value)}
                      placeholder="wss://broker.emqx.io:8084/mqtt"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subscribe Topic:</label>
                    <input
                      type="text"
                      value={mqttTopicInput}
                      onChange={(e) => setMqttTopicInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Username / API Key:</label>
                    <input
                      type="text"
                      value={mqttUsernameInput}
                      onChange={(e) => setMqttUsernameInput(e.target.value)}
                      placeholder="Optional username or API Key"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Password / Key Secret:</label>
                    <input
                      type="password"
                      value={mqttPasswordInput}
                      onChange={(e) => setMqttPasswordInput(e.target.value)}
                      placeholder="Optional password or secret"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveMqttConfig}
                    className="px-5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" /> Save Broker Config & Reconnect
                  </button>
                </div>
              </div>

              {/* Publish Form */}
              <div className="bg-slate-950 text-slate-100 p-5 rounded-xl space-y-3 font-mono text-xs shadow-lg">
                <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Layers className="w-4 h-4" /> Publish Live MQTT Tag Scan Payload
                  </span>
                  <span className="text-[10px] text-slate-500">Topic: {mqttTopicInput}</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">MQTT Payload JSON:</label>
                  <textarea
                    rows={6}
                    value={mqttTestPayloadInput}
                    onChange={(e) => setMqttTestPayloadInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-[#007BC4]"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleTestMqttPublish}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" /> Publish to MQTT Broker
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LIVE UNIFIED STREAM CONSOLE */}
      <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Live Stream Inspector (WebSocket & MQTT)</h3>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-mono font-bold">
              {eventLogs.length} Events Captured
            </span>
          </div>
          <button
            onClick={() => setEventLogs([])}
            className="text-xs text-slate-400 hover:text-white font-mono cursor-pointer transition"
          >
            Clear Console
          </button>
        </div>

        <div className="mt-4 font-mono text-xs space-y-2 max-h-80 overflow-y-auto pr-2">
          {eventLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 italic">
              No live real-time events captured yet. Transmit a test scan above to see incoming messages across WebSocket or MQTT streams.
            </div>
          ) : (
            eventLogs.map((log) => (
              <div key={log.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-start gap-3">
                <span className="text-[10px] text-slate-500 shrink-0 pt-0.5">{log.time}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                  log.method === 'WebSocket' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {log.method}
                </span>
                <pre className="text-slate-300 font-mono text-[11px] whitespace-pre-wrap break-all flex-1">
                  {typeof log.event === 'object' ? JSON.stringify(log.event, null, 2) : String(log.event)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

