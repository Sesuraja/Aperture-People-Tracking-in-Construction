import { Response } from 'express';

const subscribers: Set<Response> = new Set();

export function addSseSubscriber(res: Response): void {
  subscribers.add(res);
  console.log(`[SSE Service] Client subscribed. Active connections: ${subscribers.size}`);
}

export function removeSseSubscriber(res: Response): void {
  subscribers.delete(res);
  console.log(`[SSE Service] Client disconnected. Active connections: ${subscribers.size}`);
}

export function broadcastSseEvent(event: string, payload: any): void {
  const dataString = JSON.stringify(payload);
  const message = `event: ${event}\ndata: ${dataString}\n\n`;

  for (const client of subscribers) {
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
  for (const client of subscribers) {
    try {
      client.write(': heartbeat\n\n');
    } catch (err) {
      subscribers.delete(client);
    }
  }
}, 15000);
