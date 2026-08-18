import { Server as HttpServer } from 'http';

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

export function initWebSocketServer(_server: HttpServer): any {
  // WebSocket server disabled per configuration (MongoDB & REST API only)
  return null;
}

export function broadcastWebSocketEvent(_type: string, _payload: any): void {
  // No-op (WebSockets removed)
}

export function closeWebSocketServer(): void {
  // No-op
}

export function getWebSocketStats() {
  return {
    connectedClients: 0,
    totalConnectionsHandled: 0,
    totalSessions: 0,
    sessions: []
  };
}
