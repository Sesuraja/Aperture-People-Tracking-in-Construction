import { Router, Request, Response } from 'express';
import { broadcastWebSocketEvent, getWebSocketStats } from '../services/websocket.js';
import { addSseSubscriber, removeSseSubscriber, broadcastSseEvent, getSseStats } from '../services/sse.js';
import {
  getMqttConfig,
  getMqttStatus,
  publishMqttMessage,
  subscribeMqttTopic,
  updateMqttConfig,
  initMqttService
} from '../services/mqtt.js';
import { upsertDoc, getCollectionDocs, bulkWriteRfidRealtimeEvents } from '../services/db.js';
import { processTelemetryWithAI } from '../services/aiPipeline.js';

export const realtimeRouter = Router();

// In-memory queue for Long-Polling stream listeners
interface PendingPollClient {
  id: string;
  res: Response;
  timeoutId: any;
}
const pollingClients: Set<PendingPollClient> = new Set();
const recentEventsBuffer: any[] = [];
const MAX_BUFFER = 50;

function pushRealtimeEventToBuffer(event: any) {
  const evtWithTime = {
    ...event,
    id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: event.timestamp || new Date().toISOString()
  };
  recentEventsBuffer.unshift(evtWithTime);
  if (recentEventsBuffer.length > MAX_BUFFER) {
    recentEventsBuffer.pop();
  }

  // Flush pending long-polling clients immediately
  for (const client of pollingClients) {
    clearTimeout(client.timeoutId);
    try {
      client.res.json({
        success: true,
        method: 'long_polling',
        events: [evtWithTime],
        timestamp: new Date().toISOString()
      });
    } catch {
      // client connection closed
    }
    pollingClients.delete(client);
  }
}

// ==========================================
// 1. WEBSOCKET API ENDPOINTS
// ==========================================

/**
 * GET /api/realtime/ws/info
 * Returns WebSocket server status, URL path, active connections, and capabilities
 */
realtimeRouter.get('/ws/info', (req: Request, res: Response) => {
  const stats = getWebSocketStats ? getWebSocketStats() : { activeConnections: 0, path: '/ws' };
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';

  return res.json({
    success: true,
    method: 'WebSocket',
    status: 'ACTIVE',
    path: '/ws',
    fullUrl: `${protocol}://${host}/ws`,
    activeConnections: stats.activeConnections || 0,
    features: ['Bi-directional messaging', 'JSON protocol', 'Ping/Pong heartbeat', 'Sub-second tag scans']
  });
});

/**
 * POST /api/realtime/ws/broadcast
 * Server-side endpoint to push a broadcast event to all connected WebSocket clients
 */
realtimeRouter.post('/ws/broadcast', (req: Request, res: Response) => {
  try {
    const { type, payload } = req.body || {};
    const eventType = type || 'custom_broadcast';
    const eventPayload = payload || req.body || {};

    broadcastWebSocketEvent(eventType, eventPayload);

    // Also push to recent events buffer for polling/SSE
    pushRealtimeEventToBuffer({ type: eventType, payload: eventPayload, source: 'WebSocket API' });

    return res.json({
      success: true,
      method: 'WebSocket',
      broadcastedType: eventType,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. SERVER-SENT EVENTS (SSE) ENDPOINTS
// ==========================================

/**
 * GET /api/realtime/sse/subscribe
 * Subscribes to HTTP Server-Sent Events stream
 */
realtimeRouter.get('/sse/subscribe', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', method: 'SSE', timestamp: new Date().toISOString() })}\n\n`);

  addSseSubscriber(res);

  req.on('close', () => {
    removeSseSubscriber(res);
  });
});

/**
 * POST /api/realtime/sse/broadcast
 * Broadcasts an SSE event to all connected SSE clients
 */
realtimeRouter.post('/sse/broadcast', (req: Request, res: Response) => {
  try {
    const { event, payload } = req.body || {};
    const eventName = event || 'notification';
    const eventData = payload || req.body || {};

    broadcastSseEvent(eventName, eventData);

    pushRealtimeEventToBuffer({ event: eventName, payload: eventData, source: 'SSE API' });

    return res.json({
      success: true,
      method: 'SSE',
      event: eventName,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. MQTT API ENDPOINTS
// ==========================================

/**
 * GET /api/realtime/mqtt/status
 * Returns live status of MQTT service & connection metrics
 */
realtimeRouter.get('/mqtt/status', async (req: Request, res: Response) => {
  try {
    const status = getMqttStatus();
    return res.json({
      success: true,
      method: 'MQTT',
      ...status
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/realtime/mqtt/config
 * Returns stored MQTT configuration
 */
realtimeRouter.get('/mqtt/config', async (req: Request, res: Response) => {
  try {
    const config = await getMqttConfig();
    return res.json({
      success: true,
      method: 'MQTT',
      config
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/realtime/mqtt/config
 * Updates MQTT broker configuration and reconnects
 */
realtimeRouter.post('/mqtt/config', async (req: Request, res: Response) => {
  try {
    const { brokerUrl, clientId, username, password, topics, enabled } = req.body || {};

    const updatedStatus = await updateMqttConfig({
      brokerUrl,
      clientId,
      username,
      password,
      topics,
      enabled: enabled !== undefined ? Boolean(enabled) : true
    });

    return res.json({
      success: true,
      method: 'MQTT',
      message: 'MQTT configuration updated successfully',
      status: updatedStatus
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/realtime/mqtt/publish
 * Publishes a message to an MQTT topic
 */
realtimeRouter.post('/mqtt/publish', async (req: Request, res: Response) => {
  try {
    const { topic, payload, message } = req.body || {};
    const targetTopic = topic || 'gao/rfid/scans';
    const messageContent = payload || message || req.body || {};

    const result = await publishMqttMessage(targetTopic, messageContent);

    // If tag data, analyze with AI Pipeline & store to MongoDB
    if (messageContent && (messageContent.TagID || messageContent.tagId || messageContent.epc)) {
      await processTelemetryWithAI(messageContent, `MQTT (${targetTopic})`);
    } else if (result.success) {
      broadcastWebSocketEvent('mqtt_publish', { topic: targetTopic, payload: messageContent });
      broadcastSseEvent('mqtt_publish', { topic: targetTopic, payload: messageContent });
      pushRealtimeEventToBuffer({ topic: targetTopic, payload: messageContent, source: 'MQTT Publish' });
    }

    return res.json({
      ...result,
      method: 'MQTT'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/realtime/mqtt/subscribe
 * Subscribes to a new MQTT topic dynamically
 */
realtimeRouter.post('/mqtt/subscribe', async (req: Request, res: Response) => {
  try {
    const { topic } = req.body || {};
    const result = await subscribeMqttTopic(topic);
    return res.json({
      ...result,
      method: 'MQTT'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/realtime/mqtt/test
 * Tests connection to configured or specified MQTT broker
 */
realtimeRouter.post('/mqtt/test', async (req: Request, res: Response) => {
  try {
    const { brokerUrl } = req.body || {};
    if (brokerUrl) {
      await updateMqttConfig({ brokerUrl });
    } else {
      await initMqttService();
    }

    // Wait 1.5s for async connection
    await new Promise((r) => setTimeout(r, 1500));
    const status = getMqttStatus();

    return res.json({
      success: status.connected,
      method: 'MQTT',
      status: status.connected ? 'CONNECTED' : 'FAILED',
      brokerUrl: status.brokerUrl,
      lastError: status.lastError,
      checkedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      method: 'MQTT',
      status: 'FAILED',
      error: err.message
    });
  }
});

// ==========================================
// 4. WEBHOOK API ENDPOINTS
// ==========================================

/**
 * POST /api/realtime/webhook/receive
 * Inbound webhook endpoint to receive scans/events from edge RFID readers or external software
 */
realtimeRouter.post('/webhook/receive', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const nowIso = new Date().toISOString();

    const webhookEventDoc = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      payload,
      receivedAt: nowIso,
      ip: req.ip
    };

    await upsertDoc('webhook_logs', webhookEventDoc);

    // Cross-broadcast to WS, SSE, MQTT
    broadcastWebSocketEvent('webhook_received', webhookEventDoc);
    broadcastSseEvent('webhook_received', webhookEventDoc);
    publishMqttMessage('gao/rfid/webhooks', webhookEventDoc);
    pushRealtimeEventToBuffer({ type: 'webhook_received', payload, source: 'Webhook Inbound' });

    return res.json({
      success: true,
      method: 'Webhook',
      status: 'RECEIVED',
      id: webhookEventDoc.id,
      receivedAt: nowIso
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/realtime/webhook/dispatch
 * Outbound webhook dispatcher to send RFID events to external HTTP endpoints
 */
realtimeRouter.post('/webhook/dispatch', async (req: Request, res: Response) => {
  try {
    const { targetUrl, event, payload } = req.body || {};
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: 'targetUrl is required' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const dispatchBody = {
      event: event || 'rfid.scan',
      timestamp: new Date().toISOString(),
      data: payload || {}
    };

    const fetchRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GAO-RFID-Tracking-System/2.0'
      },
      body: JSON.stringify(dispatchBody),
      signal: controller.signal
    });
    clearTimeout(timeout);

    return res.json({
      success: fetchRes.ok,
      method: 'Webhook Outbound',
      statusCode: fetchRes.status,
      targetUrl,
      dispatchedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      method: 'Webhook Outbound',
      targetUrl: req.body?.targetUrl,
      error: err.message || 'Dispatch failed'
    });
  }
});

// ==========================================
// 5. LONG-POLLING STREAM ENDPOINT
// ==========================================

/**
 * GET /api/realtime/poll
 * High-reliability Long-Polling endpoint for fallback browser environments
 */
realtimeRouter.get('/poll', (req: Request, res: Response) => {
  const lastSeenId = req.query.since as string;

  // Check if we have recent events since lastSeenId
  if (recentEventsBuffer.length > 0) {
    const newEvents = lastSeenId
      ? recentEventsBuffer.filter((e) => e.id !== lastSeenId)
      : [recentEventsBuffer[0]];

    if (newEvents.length > 0) {
      return res.json({
        success: true,
        method: 'long_polling',
        events: newEvents,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Otherwise hold connection open for up to 20 seconds waiting for new event
  const clientId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const timeoutId = setTimeout(() => {
    pollingClients.delete(clientEntry);
    try {
      res.json({
        success: true,
        method: 'long_polling',
        events: [],
        status: 'timeout_no_events',
        timestamp: new Date().toISOString()
      });
    } catch {
      // client disconnected
    }
  }, 20000);

  const clientEntry: PendingPollClient = {
    id: clientId,
    res,
    timeoutId
  };

  pollingClients.add(clientEntry);

  req.on('close', () => {
    clearTimeout(timeoutId);
    pollingClients.delete(clientEntry);
  });
});

// ==========================================
// 6. UNIFIED MULTI-PROTOCOL INGESTION ENDPOINT
// ==========================================

/**
 * POST /api/realtime/ingest
 * Unified multi-protocol event ingestion endpoint (WebSocket, SSE, MQTT, HTTP)
 * Normalizes event structures to { TagID, Timestamp, Location } and performs
 * bulk write to 'rfid_realtime_events' collection.
 */
realtimeRouter.post('/ingest', async (req: Request, res: Response) => {
  try {
    const protocol = req.body?.protocol || 'HTTP Ingestion';
    const rawEvents = req.body?.events || req.body?.tags || req.body?.data || (Array.isArray(req.body) ? req.body : [req.body]);

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return res.status(400).json({ success: false, error: 'Expected non-empty array of tag event objects' });
    }

    const result = await bulkWriteRfidRealtimeEvents(rawEvents, protocol);

    // Cross-broadcast normalized scan to all real-time stream clients
    broadcastWebSocketEvent('tag_update_bulk', { count: result.totalProcessed, protocol });
    broadcastSseEvent('tag_update_bulk', { count: result.totalProcessed, protocol });
    pushRealtimeEventToBuffer({ type: 'unified_ingest', count: result.totalProcessed, protocol, source: 'Unified Ingest API' });

    return res.json({
      success: true,
      message: `Successfully normalized and ingested ${result.totalProcessed} events into 'rfid_realtime_events' collection`,
      protocol,
      result
    });
  } catch (err: any) {
    console.error('[Realtime Ingest] Multi-protocol error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Ingestion failed' });
  }
});

// ==========================================
// 7. MASTER STATUS SUMMARY ENDPOINT
// ==========================================

/**
 * GET /api/realtime/summary
 * Returns health & connection state across ALL 4 API streaming methods
 */
realtimeRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const wsStats = getWebSocketStats ? getWebSocketStats() : { activeConnections: 0 };
    const sseStats = getSseStats ? getSseStats() : { activeConnections: 0 };
    const mqttStats = getMqttStatus();

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      methods: {
        websocket: {
          name: 'WebSocket Protocol',
          status: 'ACTIVE',
          path: '/ws',
          activeConnections: wsStats.activeConnections || 0
        },
        sse: {
          name: 'Server-Sent Events (SSE)',
          status: 'ACTIVE',
          path: '/api/realtime/sse/subscribe',
          activeConnections: sseStats.activeConnections || 0
        },
        mqtt: {
          name: 'MQTT Publish/Subscribe',
          status: mqttStats.connected ? 'CONNECTED' : 'DISCONNECTED',
          brokerUrl: mqttStats.brokerUrl,
          subscribedTopics: mqttStats.subscribedTopics,
          messagesReceived: mqttStats.messagesReceivedCount,
          messagesSent: mqttStats.messagesSentCount
        },
        longPolling: {
          name: 'HTTP Long-Polling Stream',
          status: 'ACTIVE',
          path: '/api/realtime/poll',
          pendingListeners: pollingClients.size
        },
        webhook: {
          name: 'Inbound/Outbound Webhooks',
          status: 'ACTIVE',
          inboundEndpoint: '/api/realtime/webhook/receive',
          outboundEndpoint: '/api/realtime/webhook/dispatch'
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
