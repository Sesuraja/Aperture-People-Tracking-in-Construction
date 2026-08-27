import { Response } from 'express';

const subscribers: Map<Response, string> = new Map();

export function addSseSubscriber(res: Response, organizationId: string = 'default'): void {
  subscribers.set(res, organizationId);
  console.log(`[SSE Service] Client subscribed for org [${organizationId}]. Active connections: ${subscribers.size}`);
}

export function removeSseSubscriber(res: Response): void {
  subscribers.delete(res);
  console.log(`[SSE Service] Client disconnected. Active connections: ${subscribers.size}`);
}

export function broadcastSseEvent(event: string, payload: any, organizationId?: string): void {
  const dataString = JSON.stringify(payload);
  const message = `event: ${event}\ndata: ${dataString}\n\n`;

  for (const [client, clientOrg] of subscribers.entries()) {
    if (organizationId && organizationId !== 'ALL' && clientOrg !== organizationId) {
      continue;
    }
    try {
      client.write(message);
    } catch (err) {
      console.error('[SSE Service] Failed to send message to client:', err);
      subscribers.delete(client);
    }
  }
}

export function getSseStats() {
  return {
    activeConnections: subscribers.size,
    path: '/api/realtime/sse/subscribe'
  };
}

// Heartbeat timer to keep SSE connections alive across proxies
setInterval(() => {
  for (const [client] of subscribers.entries()) {
    try {
      client.write(': heartbeat\n\n');
    } catch (err) {
      subscribers.delete(client);
    }
  }
}, 15000);
