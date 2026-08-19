import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export interface WSMessage {
  type: string;
  payload?: any;
  timestamp?: string;
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
    
    const session: ClientSession = {
      id: sessionId,
      apiKey: 'client-key',
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
      message: 'GAO People Tracking WebSocket Realtime Server Online',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
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

export function broadcastWebSocketEvent(type: string, payload: any): void {
  if (!wss || clients.size === 0) return;
  const msg = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
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
