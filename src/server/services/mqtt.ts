export interface MqttConfig {
  brokerUrl: string;
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

const DEFAULT_BROKER = '';
const DEFAULT_CLIENT_ID = 'gao_rfid_server_disabled';
const DEFAULT_TOPICS: string[] = [];

/**
 * Retrieves the current MQTT configuration (disabled).
 */
export async function getMqttConfig(): Promise<MqttConfig> {
  return {
    brokerUrl: DEFAULT_BROKER,
    clientId: DEFAULT_CLIENT_ID,
    topics: DEFAULT_TOPICS,
    enabled: false,
    lastConnectedAt: null,
    lastError: null
  };
}

/**
 * Initializes MQTT service (disabled - no connections made).
 */
export async function initMqttService(): Promise<MqttStatus> {
  return getMqttStatus();
}

/**
 * Returns current status (disabled).
 */
export function getMqttStatus(): MqttStatus {
  return {
    connected: false,
    brokerUrl: '',
    clientId: DEFAULT_CLIENT_ID,
    subscribedTopics: [],
    messagesReceivedCount: 0,
    messagesSentCount: 0,
    lastConnectedAt: null,
    lastError: null,
    enabled: false
  };
}

/**
 * No-op message publisher (MQTT disabled).
 */
export async function publishMqttMessage(_topic: string, _message: any): Promise<{ success: boolean; topic: string; messageId?: number; error?: string }> {
  return { success: false, topic: _topic, error: 'MQTT disabled' };
}

/**
 * No-op topic subscriber.
 */
export async function subscribeMqttTopic(_topic: string): Promise<{ success: boolean; topic: string; error?: string }> {
  return { success: false, topic: _topic, error: 'MQTT disabled' };
}

/**
 * No-op topic unsubscriber.
 */
export async function unsubscribeMqttTopic(_topic: string): Promise<{ success: boolean; topic: string; error?: string }> {
  return { success: false, topic: _topic, error: 'MQTT disabled' };
}

/**
 * Updates MQTT config without connecting.
 */
export async function updateMqttConfig(_newConfig: Partial<MqttConfig>): Promise<MqttStatus> {
  return getMqttStatus();
}
