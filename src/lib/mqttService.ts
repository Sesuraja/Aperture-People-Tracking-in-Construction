import mqtt, { MqttClient } from 'mqtt';

export interface NormalizedTagPayload {
  TagID: string;
  Timestamp: string;
  Location: string;
  FirstName?: string;
  LastName?: string;
  rssi?: number;
  readerId?: string;
  antennaId?: number;
  protocol?: 'MQTT' | 'WebSocket' | 'SSE' | 'Webhook';
  rawPayload?: any;
}

export type MqttStreamStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error' | 'Reconnecting';

export interface MqttMetrics {
  latencyMs: number;
  packetsReceived: number;
  packetsSent: number;
  errorCount: number;
  lastHeartbeat: string | null;
  activeTopicCount: number;
  protocol: string;
}

type TagScanCallback = (payload: NormalizedTagPayload) => void;
type StatusCallback = (status: MqttStreamStatus, message?: string) => void;
type MetricsCallback = (metrics: MqttMetrics) => void;

export function formatMqttBrokerUrl(urlInput?: string): string {
  if (!urlInput || !urlInput.trim()) {
    return 'wss://broker.emqx.io:8084/mqtt';
  }
  let trimmed = urlInput.trim();

  // If already ws:// or wss://, return as is
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }

  // Convert mqtt:// or tcp:// to wss://
  if (trimmed.startsWith('mqtt://') || trimmed.startsWith('tcp://')) {
    const raw = trimmed.replace(/^(mqtt|tcp):\/\//, '');
    if (raw.includes('hivemq.com')) {
      return 'wss://broker.hivemq.com:8884/mqtt';
    }
    if (raw.includes('emqx.io')) {
      return 'wss://broker.emqx.io:8084/mqtt';
    }
    const wsHost = raw.replace(':1883', ':8084');
    return `wss://${wsHost.includes('/') ? wsHost : wsHost + '/mqtt'}`;
  }

  if (trimmed.startsWith('mqtts://') || trimmed.startsWith('ssl://')) {
    const raw = trimmed.replace(/^(mqtts|ssl):\/\//, '');
    return `wss://${raw.includes('/') ? raw : raw + '/mqtt'}`;
  }

  // Plain host string e.g. "broker.hivemq.com"
  if (trimmed.includes('hivemq.com')) {
    return 'wss://broker.hivemq.com:8884/mqtt';
  }
  if (trimmed.includes('emqx.io')) {
    return 'wss://broker.emqx.io:8084/mqtt';
  }

  return `wss://${trimmed.includes('/') ? trimmed : trimmed + '/mqtt'}`;
}

/**
 * Service providing real-time MQTT streaming for Aperture RFID Tag tracking.
 * Normalizes incoming MQTT payload (TagID, Timestamp, Location) to MongoDB schema.
 */
export interface MqttConnectionOptions {
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string; // or API Key
  topics?: string[];
  clean?: boolean;
  keepalive?: number;
}

export class MqttStreamService {
  private client: MqttClient | null = null;
  private status: MqttStreamStatus = 'Disconnected';
  private options: MqttConnectionOptions = {
    brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
    clientId: `aperture_web_${Math.random().toString(16).substring(2, 8)}`,
    username: '',
    password: '',
    topics: ['gao/rfid/scans', 'aperture/tags/#', 'rfid_realtime_events']
  };
  private topics: Set<string> = new Set(this.options.topics);
  
  private tagScanListeners: Set<TagScanCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private metricsListeners: Set<MetricsCallback> = new Set();

  private metrics: MqttMetrics = {
    latencyMs: 14,
    packetsReceived: 0,
    packetsSent: 0,
    errorCount: 0,
    lastHeartbeat: null,
    activeTopicCount: 3,
    protocol: 'MQTT over WebSockets'
  };

  private pingTimer: any = null;
  private pingStartTime: number = 0;

  constructor(opts?: Partial<MqttConnectionOptions>) {
    if (opts) {
      this.configure(opts);
    }
  }

  public configure(opts: Partial<MqttConnectionOptions>): void {
    const formattedBrokerUrl = opts.brokerUrl !== undefined
      ? formatMqttBrokerUrl(opts.brokerUrl)
      : this.options.brokerUrl;

    this.options = {
      ...this.options,
      ...opts,
      brokerUrl: formattedBrokerUrl
    };
    if (opts.topics) {
      this.topics = new Set(opts.topics);
    }
    // Save to localStorage if browser
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aperture_mqtt_opts', JSON.stringify(this.options));
      } catch {
        // ignore
      }
    }
  }

  public getOptions(): MqttConnectionOptions {
    if (typeof window !== 'undefined' && !this.options.username) {
      try {
        const saved = localStorage.getItem('aperture_mqtt_opts');
        if (saved) {
          const parsed = JSON.parse(saved);
          this.options = { ...this.options, ...parsed };
          if (parsed.topics) this.topics = new Set(parsed.topics);
        }
      } catch {
        // ignore
      }
    }
    return { ...this.options };
  }

  /**
   * Connect to the MQTT Broker using specified credentials / API Keys
   */
  public connect(opts?: Partial<MqttConnectionOptions>): void {
    if (typeof window === 'undefined') return;
    if (opts) this.configure(opts);

    const currentOpts = this.getOptions();

    if (this.client && this.client.connected) {
      return;
    }

    this.setStatus('Connecting');

    try {
      const clientId = currentOpts.clientId || `aperture_web_${Math.random().toString(16).substring(2, 8)}`;
      
      this.client = mqtt.connect(currentOpts.brokerUrl, {
        clientId,
        username: currentOpts.username || undefined,
        password: currentOpts.password || undefined,
        keepalive: currentOpts.keepalive || 30,
        reconnectPeriod: 4000,
        connectTimeout: 10000,
        clean: currentOpts.clean !== undefined ? currentOpts.clean : true
      });

      this.client.on('connect', () => {
        this.setStatus('Connected');
        this.metrics.lastHeartbeat = new Date().toISOString();
        this.subscribeConfiguredTopics();
        this.startLatencyPingLoop();
      });

      this.client.on('message', (topic, messageBuffer) => {
        this.handleIncomingMessage(topic, messageBuffer.toString());
      });

      this.client.on('error', (err) => {
        this.metrics.errorCount++;
        this.setStatus('Error', err.message || 'MQTT Connection Error');
        this.notifyMetrics();
      });

      this.client.on('offline', () => {
        this.setStatus('Disconnected');
      });

      this.client.on('reconnect', () => {
        this.setStatus('Reconnecting');
      });

    } catch (err: any) {
      this.metrics.errorCount++;
      this.setStatus('Error', err.message || 'MQTT Initialization failed');
      this.fallbackServerMqttSync();
    }
  }

  /**
   * Disconnect MQTT client
   */
  public disconnect(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.client) {
      try {
        this.client.end(true);
      } catch {
        // ignore
      }
      this.client = null;
    }
    this.setStatus('Disconnected');
  }

  /**
   * Subscribe to topic
   */
  public subscribe(topic: string): void {
    this.topics.add(topic);
    if (this.client && this.client.connected) {
      this.client.subscribe(topic, (err) => {
        if (!err) {
          this.metrics.activeTopicCount = this.topics.size;
          this.notifyMetrics();
        }
      });
    }
  }

  /**
   * Publish payload to topic
   */
  public async publish(topic: string, payload: any): Promise<boolean> {
    const rawMessage = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    // 1. Direct browser MQTT publish if client connected
    if (this.client && this.client.connected) {
      return new Promise((resolve) => {
        this.client?.publish(topic, rawMessage, {}, (err) => {
          if (!err) {
            this.metrics.packetsSent++;
            this.notifyMetrics();
            resolve(true);
          } else {
            this.metrics.errorCount++;
            resolve(false);
          }
        });
      });
    }

    // 2. Server-side MQTT endpoint publish bridge fallback
    try {
      const res = await fetch('/api/realtime/mqtt/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, payload })
      });
      const data = await res.json();
      if (data.success) {
        this.metrics.packetsSent++;
        this.notifyMetrics();
        return true;
      }
    } catch {
      this.metrics.errorCount++;
    }
    return false;
  }

  /**
   * Normalize raw incoming MQTT message to MongoDB RFID schema
   */
  private handleIncomingMessage(topic: string, rawText: string): void {
    this.metrics.packetsReceived++;
    this.metrics.lastHeartbeat = new Date().toISOString();

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { rawText };
    }

    // Handle Ping response latency
    if (topic === 'aperture/ping_res' && this.pingStartTime > 0) {
      this.metrics.latencyMs = Math.max(1, Date.now() - this.pingStartTime);
      this.notifyMetrics();
      return;
    }

    // Normalize tag payload
    const normalized = this.normalizePayload(parsed, topic);
    if (normalized.TagID) {
      this.notifyTagScan(normalized);
      // Auto-ingest to server database rfid_realtime_events
      this.ingestToServerDatabase(normalized);
    }

    this.notifyMetrics();
  }

  /**
   * Normalizes any raw object structure to MongoDB schema: { TagID, Timestamp, Location }
   */
  public normalizePayload(raw: any, topic?: string): NormalizedTagPayload {
    const tagId =
      raw.TagID ||
      raw.tagId ||
      raw.epc ||
      raw.EPC ||
      raw.id ||
      (raw.payload && (raw.payload.TagID || raw.payload.tagId || raw.payload.epc)) ||
      '';

    const location =
      raw.Location ||
      raw.location ||
      raw.LocationName ||
      raw.zone ||
      raw.Zone ||
      (raw.payload && (raw.payload.Location || raw.payload.zone)) ||
      'Main Entrance Gate (Zone A)';

    const rawTime = raw.Timestamp || raw.timestamp || raw.EnterTime || raw.time || new Date().toISOString();
    const d = new Date(rawTime);
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    
    // Format timestamp UTC
    const YYYY = validDate.getUTCFullYear();
    const MM = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(validDate.getUTCDate()).padStart(2, '0');
    const hh = String(validDate.getUTCHours()).padStart(2, '0');
    const mm = String(validDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(validDate.getUTCSeconds()).padStart(2, '0');
    const fff = String(validDate.getUTCMilliseconds()).padStart(3, '0');
    const timestampFormatted = `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}.${fff}`;

    return {
      TagID: String(tagId),
      Timestamp: timestampFormatted,
      Location: String(location),
      FirstName: raw.FirstName || raw.firstName || 'Staff',
      LastName: raw.LastName || raw.lastName || 'Member',
      rssi: raw.rssi !== undefined ? Number(raw.rssi) : -58,
      readerId: raw.readerId || raw.ReaderID || 'APERTURE-MQTT-RDR-01',
      antennaId: raw.antennaId !== undefined ? Number(raw.antennaId) : 1,
      protocol: 'MQTT',
      rawPayload: raw
    };
  }

  /**
   * Bulk Ingest normalized scan to backend MongoDB 'rfid_realtime_events'
   */
  private async ingestToServerDatabase(tagPayload: NormalizedTagPayload): Promise<void> {
    try {
      await fetch('/api/realtime/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [tagPayload],
          protocol: 'MQTT'
        })
      });
    } catch {
      // ignore transient background sync error
    }
  }

  private subscribeConfiguredTopics(): void {
    if (this.client && this.client.connected) {
      const topicArr = Array.from(this.topics);
      this.client.subscribe(topicArr, (err) => {
        if (!err) {
          this.metrics.activeTopicCount = topicArr.length;
          this.notifyMetrics();
        }
      });
      // Ping response topic
      this.client.subscribe('aperture/ping_res');
    }
  }

  private startLatencyPingLoop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.client && this.client.connected) {
        this.pingStartTime = Date.now();
        this.client.publish('aperture/ping_req', JSON.stringify({ ts: this.pingStartTime }));
      }
    }, 10000);
  }

  private async fallbackServerMqttSync(): Promise<void> {
    try {
      const res = await fetch('/api/realtime/mqtt/status');
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          this.setStatus('Connected');
          this.metrics.packetsReceived = data.messagesReceivedCount || 0;
          this.metrics.packetsSent = data.messagesSentCount || 0;
          this.notifyMetrics();
        }
      }
    } catch {
      // ignore
    }
  }

  // Event Listener Subscriptions
  public onTagScan(fn: TagScanCallback): () => void {
    this.tagScanListeners.add(fn);
    return () => this.tagScanListeners.delete(fn);
  }

  public onStatusChange(fn: StatusCallback): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  public onMetricsUpdate(fn: MetricsCallback): () => void {
    this.metricsListeners.add(fn);
    fn(this.metrics);
    return () => this.metricsListeners.delete(fn);
  }

  public getStatus(): MqttStreamStatus {
    return this.status;
  }

  public getMetrics(): MqttMetrics {
    return { ...this.metrics };
  }

  private setStatus(status: MqttStreamStatus, message?: string): void {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status, message));
  }

  private notifyTagScan(payload: NormalizedTagPayload): void {
    this.tagScanListeners.forEach((fn) => fn(payload));
  }

  private notifyMetrics(): void {
    this.metricsListeners.forEach((fn) => fn({ ...this.metrics }));
  }
}

export const mqttStreamService = new MqttStreamService();
export default mqttStreamService;
