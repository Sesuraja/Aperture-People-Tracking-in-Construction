import mqtt, { MqttClient } from 'mqtt';
import { getDocById, upsertDoc } from './db.js';
import { broadcastWebSocketEvent } from './websocket.js';
import { broadcastSseEvent } from './sse.js';
import { processTelemetryWithAI } from './aiPipeline.js';

export interface MqttConfig {
  brokerUrl: string; // e.g. 'mqtt://broker.emqx.io:1883' or 'ws://broker.emqx.io:8083/mqtt'
  clientId?: string;
  username?: string;
  password?: string;
  topics: string[];
  enabled: boolean;
  lastConnectedAt?: string | null;
  lastError?: string | null;
}

export interface MqttStatus {
  connected: boolean;
  brokerUrl: string;
  clientId: string;
  subscribedTopics: string[];
  messagesReceivedCount: number;
  messagesSentCount: number;
  lastConnectedAt: string | null;
  lastError: string | null;
  enabled: boolean;
}

const DEFAULT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io:1883';
const DEFAULT_CLIENT_ID = `gao_rfid_server_${Math.random().toString(16).substring(2, 8)}`;
const DEFAULT_TOPICS = ['gao/rfid/scans', 'gao/rfid/status', 'aperture/tags', 'people/tracking/#'];

let mqttClient: MqttClient | null = null;
let isConnected = false;
let messageReceivedCount = 0;
let messageSentCount = 0;
let activeConfig: MqttConfig = {
  brokerUrl: DEFAULT_BROKER,
  clientId: DEFAULT_CLIENT_ID,
  topics: DEFAULT_TOPICS,
  enabled: true,
  lastConnectedAt: null,
  lastError: null
};

/**
 * Retrieves the current MQTT configuration from database or defaults.
 */
export async function getMqttConfig(): Promise<MqttConfig> {
  try {
    const doc = await getDocById('settings', 'mqtt_config');
    if (doc) {
      activeConfig = {
        brokerUrl: doc.brokerUrl || DEFAULT_BROKER,
        clientId: doc.clientId || DEFAULT_CLIENT_ID,
        username: doc.username || '',
        password: doc.password || '',
        topics: Array.isArray(doc.topics) && doc.topics.length > 0 ? doc.topics : DEFAULT_TOPICS,
        enabled: doc.enabled !== undefined ? doc.enabled : true,
        lastConnectedAt: doc.lastConnectedAt || null,
        lastError: doc.lastError || null
      };
    }
  } catch (err) {
    console.warn('[MQTT Service] Could not load stored config, using defaults:', err);
  }
  return activeConfig;
}

/**
 * Initializes or restarts the MQTT broker client connection.
 */
export async function initMqttService(): Promise<MqttStatus> {
  const config = await getMqttConfig();

  if (mqttClient) {
    try {
      mqttClient.end(true);
    } catch {
      // ignore
    }
    mqttClient = null;
    isConnected = false;
  }

  if (!config.enabled) {
    return getMqttStatus();
  }

  const clientId = config.clientId || `gao_rfid_${Math.random().toString(16).substring(2, 8)}`;

  console.log(`[MQTT Service] Connecting to broker: ${config.brokerUrl} as ${clientId}`);

  try {
    mqttClient = mqtt.connect(config.brokerUrl, {
      clientId,
      username: config.username || undefined,
      password: config.password || undefined,
      keepalive: 30,
      reconnectPeriod: 5000,
      connectTimeout: 10000
    });

    mqttClient.on('connect', async () => {
      isConnected = true;
      const nowIso = new Date().toISOString();
      activeConfig.lastConnectedAt = nowIso;
      activeConfig.lastError = null;

      console.log(`[MQTT Service] Connected successfully to ${config.brokerUrl}`);

      // Save connection timestamp
      await upsertDoc('settings', {
        id: 'mqtt_config',
        ...activeConfig,
        lastConnectedAt: nowIso,
        lastError: null
      });

      // Subscribe to configured topics
      if (config.topics && config.topics.length > 0) {
        mqttClient?.subscribe(config.topics, (err) => {
          if (err) {
            console.error('[MQTT Service] Subscription error:', err);
          } else {
            console.log(`[MQTT Service] Subscribed to topics:`, config.topics);
          }
        });
      }

      // Broadcast MQTT connection event to WebSocket & SSE
      const connPayload = {
        status: 'connected',
        brokerUrl: config.brokerUrl,
        clientId,
        timestamp: nowIso
      };
      broadcastWebSocketEvent('mqtt_status', connPayload);
      broadcastSseEvent('mqtt_status', connPayload);
    });

    mqttClient.on('message', async (topic, messageBuffer) => {
      messageReceivedCount++;
      const payloadString = messageBuffer.toString();
      const nowIso = new Date().toISOString();

      let parsedPayload: any = payloadString;
      try {
        parsedPayload = JSON.parse(payloadString);
      } catch {
        parsedPayload = { raw: payloadString };
      }

      console.log(`[MQTT Service] Message received on [${topic}]:`, payloadString.slice(0, 100));

      const eventData = {
        topic,
        payload: parsedPayload,
        receivedAt: nowIso
      };

      // Store in database under mqtt_messages collection
      try {
        await upsertDoc('mqtt_messages', {
          id: `mqtt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          topic,
          payload: parsedPayload,
          receivedAt: nowIso
        });
      } catch (e) {
        console.warn('[MQTT Service] Failed to store message in DB:', e);
      }

      // Automatically cross-broadcast received MQTT payload to WebSockets & SSE subscribers!
      broadcastWebSocketEvent('mqtt_message', eventData);
      broadcastSseEvent('mqtt_message', eventData);

      // If the MQTT message contains RFID tag data, process it through the AI Telemetry Analysis Engine
      if (parsedPayload && (parsedPayload.TagID || parsedPayload.tagId || parsedPayload.epc)) {
        await processTelemetryWithAI(parsedPayload, `MQTT (${topic})`);
      }
    });

    mqttClient.on('error', (err) => {
      isConnected = false;
      const errMsg = err.message || 'MQTT Connection Error';
      console.error('[MQTT Service] Error:', errMsg);
      activeConfig.lastError = errMsg;

      broadcastWebSocketEvent('mqtt_status', { status: 'error', error: errMsg });
      broadcastSseEvent('mqtt_status', { status: 'error', error: errMsg });
    });

    mqttClient.on('offline', () => {
      isConnected = false;
      console.warn('[MQTT Service] Client offline');
      broadcastWebSocketEvent('mqtt_status', { status: 'offline' });
    });

  } catch (err: any) {
    isConnected = false;
    activeConfig.lastError = err.message || 'Failed to connect to broker';
    console.error('[MQTT Service] Connection setup exception:', err);
  }

  return getMqttStatus();
}

/**
 * Returns current status and statistics of the MQTT Service.
 */
export function getMqttStatus(): MqttStatus {
  return {
    connected: isConnected,
    brokerUrl: activeConfig.brokerUrl,
    clientId: activeConfig.clientId || DEFAULT_CLIENT_ID,
    subscribedTopics: activeConfig.topics,
    messagesReceivedCount: messageReceivedCount,
    messagesSentCount: messageSentCount,
    lastConnectedAt: activeConfig.lastConnectedAt || null,
    lastError: activeConfig.lastError || null,
    enabled: activeConfig.enabled
  };
}

/**
 * Publishes a message to an MQTT topic.
 */
export async function publishMqttMessage(topic: string, message: any): Promise<{ success: boolean; topic: string; messageId?: number; error?: string }> {
  if (!mqttClient || !isConnected) {
    // Attempt re-init if enabled
    const cfg = await getMqttConfig();
    if (cfg.enabled) {
      await initMqttService();
    }
  }

  if (!mqttClient || !isConnected) {
    return {
      success: false,
      topic,
      error: 'MQTT client is not connected to broker'
    };
  }

  const payloadString = typeof message === 'string' ? message : JSON.stringify(message);

  return new Promise((resolve) => {
    mqttClient?.publish(topic, payloadString, { qos: 0 }, (err) => {
      if (err) {
        console.error(`[MQTT Service] Failed to publish to ${topic}:`, err);
        resolve({ success: false, topic, error: err.message });
      } else {
        messageSentCount++;
        console.log(`[MQTT Service] Published successfully to [${topic}]`);
        resolve({ success: true, topic });
      }
    });
  });
}

/**
 * Dynamically subscribes to an MQTT topic.
 */
export async function subscribeMqttTopic(topic: string): Promise<{ success: boolean; topic: string; error?: string }> {
  if (!topic || !topic.trim()) {
    return { success: false, topic: '', error: 'Topic cannot be empty' };
  }

  const cleanTopic = topic.trim();
  const cfg = await getMqttConfig();

  if (!cfg.topics.includes(cleanTopic)) {
    cfg.topics.push(cleanTopic);
    await upsertDoc('settings', {
      id: 'mqtt_config',
      ...cfg
    });
  }

  if (mqttClient && isConnected) {
    return new Promise((resolve) => {
      mqttClient?.subscribe(cleanTopic, (err) => {
        if (err) {
          resolve({ success: false, topic: cleanTopic, error: err.message });
        } else {
          resolve({ success: true, topic: cleanTopic });
        }
      });
    });
  }

  return { success: true, topic: cleanTopic };
}

/**
 * Updates MQTT config and reconnects.
 */
export async function updateMqttConfig(newCfg: Partial<MqttConfig>): Promise<MqttStatus> {
  const current = await getMqttConfig();
  const updated: MqttConfig = {
    ...current,
    ...newCfg,
    topics: newCfg.topics ? newCfg.topics : current.topics
  };

  await upsertDoc('settings', {
    id: 'mqtt_config',
    ...updated
  });

  return initMqttService();
}

// Auto initialize on service start
initMqttService().catch((err) => console.error('[MQTT Service] Auto init failed:', err));
