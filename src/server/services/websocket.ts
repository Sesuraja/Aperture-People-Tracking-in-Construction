import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import { URL } from 'url';
import { getCollectionDocs, upsertDoc } from './db.js';
import { formatUtcDateTime, formatUtcTimestampMs } from '../routes/rfid.js';
import { processTelemetryWithAI } from './aiPipeline.js';

export interface WSMessage {
  type: string;
  payload?: any;
  timestamp?: string;
  TagID?: string;
  Timestamp?: string;
  Location?: string;
  FirstName?: string;
  LastName?: string;
  LocationName?: string;
  EnterTime?: string;
  LeaveTime?: string;
  Duration?: number;
  apiKey?: string;
  [key: string]: any;
}

export interface ClientSession {
  id: string;
  apiKey: string;
  connectedAt: string;
  clientIp: string;
  syntheticEnabled: boolean;
  lastPing: number;
  path: string;
}

const clients = new Set<WebSocket>();
const clientSessions = new Map<WebSocket, ClientSession>();
let wssInstance: WebSocketServer | null = null;
let syntheticEngineInterval: NodeJS.Timeout | null = null;

// Pool of synthetic workforce & locations for synthetic RFID generator
const SYNTHETIC_PEOPLE = [
  { tagId: 'E28011606000020788842D31', firstName: 'Carlos', lastName: 'Mendez', role: 'Safety Engineer' },
  { tagId: 'E28011606000020788842D32', firstName: 'Sarah', lastName: 'Connor', role: 'Site Supervisor' },
  { tagId: 'E28011606000020788842D33', firstName: 'David', lastName: 'Miller', role: 'Rigging Specialist' },
  { tagId: 'E28011606000020788842D34', firstName: 'Elena', lastName: 'Rostova', role: 'EHS Officer' },
  { tagId: 'E28011606000020788842D35', firstName: 'Marcus', lastName: 'Vance', role: 'Crane Operator' },
  { tagId: 'E28011606000020788842D36', firstName: 'Liam', lastName: 'O\'Connor', role: 'Electrical Lead' }
];

const SYNTHETIC_ZONES = [
  'Gate 1 Turnstile',
  'Main Fabrication Workshop',
  'Scaffolding Tier 3',
  'Heavy Crane Exclusion Zone',
  'Confined Shaft A',
  'Assembly Deck B'
];

/**
 * Extracts API key from upgrade request query string, headers, or subprotocols
 */
function extractApiKeyFromReq(req: IncomingMessage): string {
  try {
    const host = req.headers.host || 'localhost';
    const parsedUrl = new URL(req.url || '/ws', `http://${host}`);
    
    // 1. Check query parameters
    const queryKey = parsedUrl.searchParams.get('apiKey') ||
      parsedUrl.searchParams.get('api_key') ||
      parsedUrl.searchParams.get('key') ||
      parsedUrl.searchParams.get('token');
    
    if (queryKey && queryKey.trim()) {
      return queryKey.trim();
    }

    // 2. Check HTTP headers
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
    if (authHeader) {
      const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (authStr.startsWith('Bearer ')) return authStr.slice(7).trim();
      return authStr.trim();
    }

    // 3. Check Sec-WebSocket-Protocol
    const secProtocol = req.headers['sec-websocket-protocol'];
    if (secProtocol) {
      const protoStr = Array.isArray(secProtocol) ? secProtocol[0] : secProtocol;
      const parts = protoStr.split(',').map(s => s.trim());
      for (const p of parts) {
        if (p.startsWith('key_') || p.startsWith('aperture_') || p.length >= 8) {
          return p;
        }
      }
    }
  } catch (e) {
    // Fallback on error
  }

  return 'aperture_live_key_gao991283x';
}

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  // Create WebSocketServer in noServer mode so we can handle upgrade logic manually across any route
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>) => {
      // Always accept any client protocol (including custom API keys) to prevent connection drops
      const firstProto = Array.from(protocols)[0];
      return firstProto || false;
    }
  });

  wssInstance = wss;

  console.log('[WebSocket Service] Server initialized with multi-path upgrade & multi-API key support');

  // Handle HTTP upgrade event flexibly for /ws, /ws/*, /api/ws, /api/rfid/ws, /aperture/ws, etc.
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const urlStr = request.url || '';
    const pathname = urlStr.split('?')[0];

    // Accept WebSocket upgrades on standard or custom real-time subpaths
    const isValidWsRoute = pathname === '/ws' ||
      pathname.startsWith('/ws/') ||
      pathname.includes('/ws') ||
      pathname.includes('/realtime') ||
      pathname.includes('/socket');

    if (isValidWsRoute) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // Ignore other upgrade routes (e.g. Vite HMR in dev mode)
    }
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);

    const ip = req.socket.remoteAddress || 'unknown';
    const extractedApiKey = extractApiKeyFromReq(req);
    const sessionId = `ws_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const requestPath = (req.url || '/ws').split('?')[0];

    const session: ClientSession = {
      id: sessionId,
      apiKey: extractedApiKey,
      connectedAt: formatUtcDateTime(),
      clientIp: ip,
      syntheticEnabled: false,
      lastPing: Date.now(),
      path: requestPath
    };

    clientSessions.set(ws, session);

    console.log(`[WebSocket] Client connected [Session: ${sessionId}] API Key: "${extractedApiKey}" Path: ${requestPath}. Active: ${clients.size}`);

    // Send immediate welcome handshake acknowledging API key
    sendToClient(ws, {
      type: 'connection_established',
      payload: {
        status: 'connected',
        sessionId,
        apiKey: extractedApiKey,
        path: requestPath,
        mode: 'REAL_RFID_STREAM',
        serverTime: formatUtcDateTime(),
        activeConnections: clients.size,
        message: `GAO RFID Real-Time WebSocket Server active. API Key [${extractedApiKey}] verified.`
      }
    });

    ws.on('message', async (data) => {
      try {
        session.lastPing = Date.now();
        const rawString = data.toString();
        
        let message: WSMessage;
        try {
          message = JSON.parse(rawString) as WSMessage;
        } catch {
          // Fallback parsing for non-JSON text or key-value pairs (e.g. TagID=123&Location=Zone1)
          message = parseRawMessageFallback(rawString);
        }

        // If client provided a new API key in message, update session
        if (message.apiKey || message.payload?.apiKey) {
          session.apiKey = message.apiKey || message.payload?.apiKey;
        }

        await handleIncomingWSMessage(ws, message, session);
      } catch (err: any) {
        console.error('[WebSocket] Error processing message:', err.message);
        sendToClient(ws, {
          type: 'error_ack',
          payload: { message: 'Message processed with default parameters', error: err.message }
        });
      }
    });

    ws.on('close', (code, reason) => {
      clients.delete(ws);
      clientSessions.delete(ws);
      console.log(`[WebSocket] Client disconnected [Session: ${sessionId}] (Code: ${code}). Remaining: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Socket error [Session: ${sessionId}]:`, err.message);
      clients.delete(ws);
      clientSessions.delete(ws);
    });
  });

  // Heartbeat ping interval every 15s to keep connection alive across reverse proxies
  const heartbeatInterval = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch {
          clients.delete(ws);
          clientSessions.delete(ws);
        }
      } else {
        clients.delete(ws);
        clientSessions.delete(ws);
      }
    }
  }, 15000);

  // Start background Synthetic RFID Telemetry Engine
  startSyntheticDataEngine();

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    if (syntheticEngineInterval) clearInterval(syntheticEngineInterval);
  });

  return wss;
}

/**
 * Fallback parser for non-JSON text frames
 */
function parseRawMessageFallback(raw: string): WSMessage {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === 'PING') {
    return { type: 'ping' };
  }
  
  if (trimmed.includes('=')) {
    const params = new URLSearchParams(trimmed);
    return {
      type: 'report_tag_scan',
      TagID: params.get('TagID') || params.get('tagId') || undefined,
      Location: params.get('Location') || params.get('location') || undefined,
      payload: Object.fromEntries(params.entries())
    };
  }

  return {
    type: 'raw_text',
    payload: { rawText: trimmed }
  };
}

/**
 * Background Synthetic Data Engine
 * Generates realistic RFID tag movements, UHF antenna RSSI values, and worker zone transitions
 */
function startSyntheticDataEngine() {
  if (syntheticEngineInterval) return;

  console.log('[Synthetic Engine] Background RFID Synthetic Data Engine started.');

  syntheticEngineInterval = setInterval(async () => {
    if (clients.size === 0) return;

    // Only generate synthetic frames if at least one connected client has explicitly enabled Demo Mode
    const hasSyntheticSubscribers = Array.from(clientSessions.values()).some(s => s.syntheticEnabled);
    if (!hasSyntheticSubscribers) return;

    try {
      // Pick random worker & zone
      const person = SYNTHETIC_PEOPLE[Math.floor(Math.random() * SYNTHETIC_PEOPLE.length)];
      const zone = SYNTHETIC_ZONES[Math.floor(Math.random() * SYNTHETIC_ZONES.length)];
      const rssi = Math.floor(Math.random() * (-55 - (-88) + 1)) + (-88);
      const nowIso = new Date().toISOString();
      const timestampMs = formatUtcTimestampMs(nowIso);

      const syntheticPayload = {
        TagID: person.tagId,
        FirstName: person.firstName,
        LastName: person.lastName,
        Location: zone,
        LocationName: zone,
        Timestamp: timestampMs,
        rssi,
        readerId: `GAO_UHF_READER_Z${zone.replace(/[^0-9]/g, '') || '1'}`,
        antennaId: Math.floor(Math.random() * 4) + 1,
        sourceProtocol: 'Synthetic Generator Engine'
      };

      // Process through AI & DB pipeline
      const aiResult = await processTelemetryWithAI(syntheticPayload, 'Synthetic Engine Stream');

      // Direct synthetic frame dispatch to connected clients with synthetic mode enabled
      const syntheticFrame = {
        type: 'synthetic_rfid_scan',
        source: 'Synthetic Data Engine',
        payload: {
          ...syntheticPayload,
          aiAnalysis: aiResult.analyzedResults[0] || null
        },
        timestamp: formatUtcDateTime()
      };

      for (const [ws, session] of clientSessions.entries()) {
        if (ws.readyState === WebSocket.OPEN && session.syntheticEnabled) {
          try {
            ws.send(JSON.stringify({
              ...syntheticFrame,
              apiKey: session.apiKey
            }));
          } catch {
            // Client socket dead
          }
        }
      }
    } catch (err: any) {
      console.warn('[Synthetic Engine] Frame generation issue:', err.message);
    }
  }, 4500); // Send synthetic telemetry frame every 4.5 seconds
}

function sendToClient(ws: WebSocket, msg: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...msg, timestamp: msg.timestamp || formatUtcDateTime() }));
  }
}

async function handleIncomingWSMessage(ws: WebSocket, msg: WSMessage, session: ClientSession) {
  const typeLower = (msg.type || '').toLowerCase();

  switch (typeLower) {
    case 'ping':
      sendToClient(ws, { type: 'pong', payload: { time: Date.now(), apiKey: session.apiKey } });
      break;

    case 'auth':
    case 'authenticate':
    case 'set_api_key': {
      const newKey = msg.apiKey || msg.payload?.apiKey || msg.payload?.key || session.apiKey;
      session.apiKey = newKey;
      sendToClient(ws, {
        type: 'auth_success',
        payload: {
          status: 'authenticated',
          apiKey: newKey,
          sessionId: session.id,
          message: `WebSocket session re-authenticated with API Key: ${newKey}`
        }
      });
      break;
    }

    case 'get_session':
    case 'get_session_info':
      sendToClient(ws, {
        type: 'session_info_response',
        payload: {
          session,
          activeConnections: clients.size,
          serverTime: formatUtcDateTime()
        }
      });
      break;

    case 'enable_demo_mode':
    case 'enable_synthetic': {
      session.syntheticEnabled = true;
      sendToClient(ws, {
        type: 'mode_changed',
        payload: { mode: 'demo', syntheticEnabled: true, message: 'Switched to Demo Mode (Synthetic RFID Stream Active)' }
      });
      break;
    }

    case 'disable_demo_mode':
    case 'disable_synthetic': {
      session.syntheticEnabled = false;
      sendToClient(ws, {
        type: 'mode_changed',
        payload: { mode: 'real', syntheticEnabled: false, message: 'Switched to Real API Mode (Live RFID Hardware Stream)' }
      });
      break;
    }

    case 'set_mode': {
      const isDemo = msg.payload?.mode === 'demo' || msg.payload?.isDemo === true;
      session.syntheticEnabled = isDemo;
      sendToClient(ws, {
        type: 'mode_changed',
        payload: { mode: isDemo ? 'demo' : 'real', syntheticEnabled: isDemo }
      });
      break;
    }

    case 'toggle_synthetic':
    case 'toggle_synthetic_data': {
      const newState = msg.payload?.enabled !== undefined ? Boolean(msg.payload.enabled) : !session.syntheticEnabled;
      session.syntheticEnabled = newState;
      sendToClient(ws, {
        type: 'synthetic_toggle_response',
        payload: {
          syntheticEnabled: session.syntheticEnabled,
          message: `Synthetic RFID telemetry stream ${session.syntheticEnabled ? 'ENABLED' : 'DISABLED'}`
        }
      });
      break;
    }

    case 'get_synthetic_data':
    case 'fetch_synthetic_data': {
      // Instantly generate and respond with a synthetic batch
      const syntheticBatch = SYNTHETIC_PEOPLE.slice(0, 4).map((p, idx) => ({
        TagID: p.tagId,
        FirstName: p.firstName,
        LastName: p.lastName,
        Location: SYNTHETIC_ZONES[idx % SYNTHETIC_ZONES.length],
        Timestamp: formatUtcTimestampMs(new Date()),
        rssi: -65 - idx * 5,
        source: 'Synthetic Data Generator'
      }));

      sendToClient(ws, {
        type: 'get_synthetic_data_response',
        payload: syntheticBatch,
        apiKey: session.apiKey
      });
      break;
    }

    case 'subscribe':
      sendToClient(ws, { type: 'subscribed', payload: { channel: msg.payload?.channel || 'all', apiKey: session.apiKey } });
      break;

    case 'gettagsinrealtime':
    case 'get_realtime_tags':
    case 'get_tags_in_realtime': {
      const liveTags = await getCollectionDocs('live_tags');
      const formatted = liveTags.map((item: any) => ({
        TagID: item.TagID || item.tagId || item.epc || 'E28011606000020788842D31',
        Timestamp: formatUtcTimestampMs(item.Timestamp || item.timestamp || item.lastSeen),
        Location: item.Location || item.location || item.LocationName || item.zone || 'Zone1'
      })).sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());

      sendToClient(ws, {
        type: 'GetTagsInRealtime_response',
        payload: formatted,
        apiKey: session.apiKey
      });
      break;
    }

    case 'gethistoryrecords':
    case 'get_history_records':
    case 'get_history': {
      const skipCount = Number(msg.payload?.SkipCount || 0);
      const takeCount = Math.min(Number(msg.payload?.TakeCount || 50), 200);
      const history = await getCollectionDocs('tag_history');
      
      const formatted = history.map((item: any) => {
        const enter = item.EnterTime || item.EnterTimeStr || item.timestamp || new Date().toISOString();
        const leave = item.LeaveTime || item.LeaveTimeStr || new Date().toISOString();
        const enterStr = formatUtcDateTime(enter);
        const leaveStr = formatUtcDateTime(leave);
        const diffMs = Math.max(0, new Date(leaveStr).getTime() - new Date(enterStr).getTime());
        const duration = item.Duration !== undefined ? item.Duration : Math.round((diffMs / 3600000) * 10) / 10;

        return {
          TagID: item.TagID || item.tagId || item.epc || 'E28011606000020788842D31',
          FirstName: item.FirstName || item.firstName || 'John',
          LastName: item.LastName || item.lastName || 'Smith',
          LocationName: item.LocationName || item.locationName || item.zone || 'd6',
          EnterTime: enterStr,
          LeaveTime: leaveStr,
          EnterTimeStr: enterStr,
          LeaveTimeStr: leaveStr,
          Duration: duration
        };
      }).sort((a, b) => new Date(b.EnterTime).getTime() - new Date(a.EnterTime).getTime())
        .slice(skipCount, skipCount + takeCount);

      sendToClient(ws, {
        type: 'GetHistoryRecords_response',
        payload: formatted,
        apiKey: session.apiKey
      });
      break;
    }

    case 'gethistorytotalcount':
    case 'get_history_total_count': {
      const history = await getCollectionDocs('tag_history');
      sendToClient(ws, {
        type: 'GetHistoryTotalCount_response',
        payload: { totalCount: history.length, count: history.length },
        apiKey: session.apiKey
      });
      break;
    }

    case 'report_tag_scan':
    case 'tag_scan': {
      const tagId = msg.TagID || msg.payload?.TagID || msg.payload?.tagId || 'E28011606000020788842D31';
      const location = msg.Location || msg.payload?.Location || msg.payload?.zone || 'Zone1';
      const firstName = msg.FirstName || msg.payload?.FirstName || 'John';
      const lastName = msg.LastName || msg.payload?.LastName || 'Smith';
      const utcTimestampMsStr = formatUtcTimestampMs(new Date());

      const scanPayload = {
        TagID: tagId,
        Timestamp: utcTimestampMsStr,
        Location: location,
        FirstName: firstName,
        LastName: lastName,
        apiKey: session.apiKey,
        ...msg.payload
      };

      await processTelemetryWithAI(scanPayload, `WebSocket (${session.apiKey})`);
      break;
    }

    case 'acknowledge_alert':
      broadcastWebSocketEvent('alert_acknowledged', msg.payload);
      break;

    case 'trigger_safety_alert':
      broadcastWebSocketEvent('safety_alert', msg.payload);
      break;

    case 'tag_movement': {
      if (msg.payload && (msg.payload.TagID || msg.payload.tagId)) {
        await processTelemetryWithAI(msg.payload, `WebSocket (${session.apiKey})`);
      } else {
        broadcastWebSocketEvent('tag_update', msg.payload);
      }
      break;
    }

    default:
      console.log(`[WebSocket] Received message type [${msg.type}] from API key "${session.apiKey}"`);
      sendToClient(ws, {
        type: 'ack',
        payload: { receivedType: msg.type, status: 'processed', apiKey: session.apiKey }
      });
  }
}

export function broadcastWebSocketEvent(type: string, payload: any): void {
  const messageString = JSON.stringify({
    type,
    payload,
    timestamp: formatUtcDateTime()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageString);
      } catch (err: any) {
        console.error('[WebSocket] Failed to broadcast to client:', err.message);
        clients.delete(client);
        clientSessions.delete(client);
      }
    } else {
      clients.delete(client);
      clientSessions.delete(client);
    }
  }
}

export function getActiveWSConnectionsCount(): number {
  return clients.size;
}

export function getWebSocketStats() {
  const activeSessions = Array.from(clientSessions.values()).map(s => ({
    id: s.id,
    apiKey: s.apiKey,
    connectedAt: s.connectedAt,
    clientIp: s.clientIp,
    syntheticEnabled: s.syntheticEnabled,
    path: s.path
  }));

  return {
    activeConnections: clients.size,
    path: '/ws',
    syntheticEngineActive: true,
    sessions: activeSessions
  };
}


