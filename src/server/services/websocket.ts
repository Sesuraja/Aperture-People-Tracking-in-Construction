import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export interface WSMessage {
  type: string;
  payload?: any;
  timestamp?: string;
  organizationId?: string;
  [key: string]: any;
}

export interface ClientSession {
  id: string;
  apiKey: string;
  organizationId: string;
  connectedAt: string;
  clientIp: string;
  syntheticEnabled: boolean;
  lastPing: number;
  path: string;
}

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();
const sessions: Map<WebSocket, ClientSession> = new Map();

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  if (wss) return wss;

  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    clients.add(ws);
    const clientIp = req.socket.remoteAddress || '127.0.0.1';
    const sessionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    let organizationId = 'demo';
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      organizationId = url.searchParams.get('organizationId') || url.searchParams.get('orgId') || 'demo';
    } catch {}

    const session: ClientSession = {
      id: sessionId,
      apiKey: 'client-key',
      organizationId,
      connectedAt: new Date().toISOString(),
      clientIp,
      syntheticEnabled: true,
      lastPing: Date.now(),
      path: req.url || '/ws'
    };
    sessions.set(ws, session);

    // Send initial handshake
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
      organizationId,
      message: 'GAO People Tracking WebSocket Realtime Server Online',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        } else if (parsed.type === 'set_organization' && parsed.organizationId) {
          session.organizationId = String(parsed.organizationId);
          ws.send(JSON.stringify({ type: 'organization_set', organizationId: session.organizationId }));
        }
      } catch {}
    });

    ws.on('close', () => {
      clients.delete(ws);
      sessions.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
      sessions.delete(ws);
    });
  });

  console.log('[WebSocket Server] GAO Realtime WebSocket server initialized on path /ws');
  return wss;
}

export function broadcastWebSocketEvent(type: string, payload: any, organizationId?: string): void {
  if (!wss || clients.size === 0) return;
  const msg = JSON.stringify({
    type,
    payload,
    organizationId,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      const session = sessions.get(client);
      if (organizationId && organizationId !== 'ALL' && session && session.organizationId !== organizationId) {
        continue; // Skip clients from different organizations
      }
      try {
        client.send(msg);
      } catch {}
    }
  }
}

export function closeWebSocketServer(): void {
  if (wss) {
    wss.close();
    wss = null;
    clients.clear();
    sessions.clear();
  }
}

export function getWebSocketStats() {
  return {
    connectedClients: clients.size,
    totalConnectionsHandled: sessions.size,
    totalSessions: sessions.size,
    sessions: Array.from(sessions.values())
  };
}
