/**
 * Client-Side API Connections Manager for:
 * 1. WebSocket Method (ws:// / wss://)
 * 2. SSE Method (Server-Sent Events)
 * 3. MQTT Method (MQTT over WebSockets or HTTP bridge)
 * 4. HTTP Long-Polling Stream & Webhooks Method
 */

export interface RealtimeEventMessage {
  id?: string;
  type?: string;
  event?: string;
  topic?: string;
  payload?: any;
  timestamp?: string;
  source?: string;
}

export type ConnectionStatus = 'Connected' | 'Connecting' | 'Disconnected' | 'Error' | 'Reconnecting';

type MessageListener = (evt: RealtimeEventMessage) => void;
type StatusListener = (status: ConnectionStatus, message?: string) => void;

// ==========================================
// 1. WEBSOCKET CLIENT CONNECTION ENGINE
// ==========================================
export class WebSocketClientManager {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'Disconnected';
  private lastError: string | null = null;
  private messageListeners: Set<MessageListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private reconnectTimer: any = null;
  private isExplicitDisconnect = false;
  private customUrl: string | null = null;
  private reconnectAttempt = 0;
  private static readonly BACKOFF_DELAYS = [1000, 2000, 4000, 8000]; // 1s, 2s, 4s, 8s
  private static readonly STEADY_INTERVAL = 16000; // steady 16s

  constructor(private urlPath: string = '/ws') {}

  public getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  public getNextRetryDelay(): number {
    if (this.reconnectAttempt < WebSocketClientManager.BACKOFF_DELAYS.length) {
      return WebSocketClientManager.BACKOFF_DELAYS[this.reconnectAttempt];
    }
    return WebSocketClientManager.STEADY_INTERVAL;
  }

  public configure(url: string): void {
    this.customUrl = url;
    this.lastError = null;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public formatWsUrl(inputUrl: string): string {
    if (!inputUrl || !inputUrl.trim()) {
      if (typeof window === 'undefined') return '';
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}${this.urlPath.startsWith('/') ? '' : '/'}${this.urlPath}`;
    }

    let url = inputUrl.trim();

    // 1. Replace http:// or https:// with ws:// or wss://
    if (url.startsWith('http://')) {
      url = 'ws://' + url.slice(7);
    } else if (url.startsWith('https://')) {
      url = 'wss://' + url.slice(8);
    }

    // 2. Resolve relative paths (/ws) or missing protocol (domain.com/ws)
    if (url.startsWith('/')) {
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${proto}//${window.location.host}${url}`;
      }
    } else if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        url = `wss://${url}`;
      } else {
        url = `ws://${url}`;
      }
    }

    // 3. Security auto-upgrade: If page is HTTPS and URL is ws:// (non-localhost), upgrade to wss://
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('ws://')) {
      const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
      if (!isLocalhost) {
        url = 'wss://' + url.slice(5);
      }
    }

    return url;
  }

  public getUrl(): string {
    if (this.customUrl) return this.formatWsUrl(this.customUrl);
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aperture_ws_url');
        if (saved) {
          this.customUrl = saved;
          return this.formatWsUrl(saved);
        }
      } catch {
        // ignore
      }
    }
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}${this.urlPath.startsWith('/') ? '' : '/'}${this.urlPath}`;
  }

  public resetToDefaultServer(): void {
    this.customUrl = null;
    this.lastError = null;
    try {
      localStorage.removeItem('aperture_ws_url');
    } catch {
      // ignore
    }
    this.disconnect();
    this.connect();
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitDisconnect = false;
    this.setStatus('Connecting');

    const wsUrl = this.getUrl();

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.setStatus('Connected');
        this.lastError = null;
        this.reconnectAttempt = 0; // Reset exponential backoff on successful connection
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyMessage(data);
        } catch {
          this.notifyMessage({ payload: event.data });
        }
      };

      this.socket.onclose = (evt) => {
        this.setStatus('Disconnected');
        if (!evt.wasClean) {
          const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
          const isWsUrl = wsUrl.startsWith('ws://');
          if (isHttps && isWsUrl && !wsUrl.includes('localhost') && !wsUrl.includes('127.0.0.1')) {
            this.lastError = `Browser blocked unsecure connection (${wsUrl}) from HTTPS page. Please use wss:// or HTTPS proxy.`;
          } else {
            this.lastError = `Connection closed unexpectedly (code ${evt.code}). Check endpoint URL and server status.`;
          }
        }
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (err) => {
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        if (isHttps && wsUrl.startsWith('ws://')) {
          this.lastError = `Mixed Content Error: Cannot connect to insecure ${wsUrl} from HTTPS page. Upgrade to wss:// or connect via backend.`;
        } else {
          this.lastError = `Failed to connect to WebSocket at ${wsUrl}. Verify host and port.`;
        }
        this.setStatus('Error', this.lastError);
      };
    } catch (err: any) {
      this.lastError = err.message || 'Failed to initialize WebSocket';
      this.setStatus('Error', this.lastError);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('Disconnected');
  }

  public send(type: string, payload: any = {}): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
      return true;
    }
    return false;
  }

  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.getNextRetryDelay();
    this.reconnectAttempt++;

    this.setStatus('Reconnecting', `Attempting reconnect in ${(delay / 1000).toFixed(0)}s (Attempt #${this.reconnectAttempt})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitDisconnect) {
        this.connect();
      }
    }, delay);
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status, message));
  }

  private notifyMessage(msg: RealtimeEventMessage): void {
    this.messageListeners.forEach((fn) => fn(msg));
  }
}

// ==========================================
// 2. SERVER-SENT EVENTS (SSE) CLIENT ENGINE
// ==========================================
export class SseClientManager {
  private eventSource: EventSource | null = null;
  private status: ConnectionStatus = 'Disconnected';
  private messageListeners: Set<MessageListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  constructor(private sseEndpoint: string = '/api/realtime/sse/subscribe') {}

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (this.eventSource) return;

    this.setStatus('Connecting');

    try {
      this.eventSource = new EventSource(this.sseEndpoint);

      this.eventSource.onopen = () => {
        this.setStatus('Connected');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.notifyMessage({ event: 'message', payload: parsed });
        } catch {
          this.notifyMessage({ event: 'message', payload: event.data });
        }
      };

      // Custom event listener types
      const customEvents = ['connected', 'rfid_scan', 'tag_update', 'ai_insight', 'safety_alert', 'mqtt_message', 'mqtt_publish', 'mqtt_status', 'webhook_received', 'notification'];
      customEvents.forEach((evtName) => {
        this.eventSource?.addEventListener(evtName, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            this.notifyMessage({ event: evtName, payload: data });
          } catch {
            this.notifyMessage({ event: evtName, payload: e.data });
          }
        });
      });

      this.eventSource.onerror = () => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.setStatus('Disconnected');
        } else {
          this.setStatus('Error', 'SSE stream re-establishing...');
        }
      };
    } catch (err: any) {
      this.setStatus('Error', err.message);
    }
  }

  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('Disconnected');
  }

  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status, message));
  }

  private notifyMessage(msg: RealtimeEventMessage): void {
    this.messageListeners.forEach((fn) => fn(msg));
  }
}

// ==========================================
// 3. MQTT CLIENT ENGINE (REST + WS PROXY)
// ==========================================
export class MqttClientManager {
  private status: ConnectionStatus = 'Disconnected';
  private messageListeners: Set<MessageListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  constructor() {}

  public async getStatusAsync(): Promise<ConnectionStatus> {
    try {
      const res = await fetch('/api/realtime/mqtt/status');
      if (res.ok) {
        const data = await res.json();
        const stat: ConnectionStatus = data.connected ? 'Connected' : 'Disconnected';
        this.setStatus(stat);
        return stat;
      }
    } catch {
      this.setStatus('Error');
    }
    return 'Disconnected';
  }

  public async publish(topic: string, message: any): Promise<{ success: boolean; error?: string }> {
    const res = await fetch('/api/realtime/mqtt/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, payload: message })
    });
    return res.json();
  }

  public async subscribe(topic: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch('/api/realtime/mqtt/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
    return res.json();
  }

  public async getConfig(): Promise<any> {
    try {
      const res = await fetch('/api/realtime/mqtt/config');
      if (res.ok) {
        const data = await res.json();
        return data.config;
      }
    } catch {
      // ignore
    }
    return null;
  }

  public async updateConfig(
    brokerUrl: string,
    enabled: boolean = true,
    topics: string[] = ['gao/rfid/scans'],
    username?: string,
    password?: string
  ): Promise<any> {
    const res = await fetch('/api/realtime/mqtt/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerUrl, enabled, topics, username, password })
    });
    return res.json();
  }

  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status, message));
  }

  public notifyIncomingMqtt(msg: RealtimeEventMessage): void {
    this.messageListeners.forEach((fn) => fn(msg));
  }
}

// ==========================================
// 4. HTTP LONG-POLLING STREAM ENGINE
// ==========================================
export class LongPollingClientManager {
  private isPolling = false;
  private lastSeenId: string = '';
  private status: ConnectionStatus = 'Disconnected';
  private messageListeners: Set<MessageListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  public start(): void {
    if (this.isPolling) return;
    this.isPolling = true;
    this.setStatus('Connected');
    this.pollLoop();
  }

  public stop(): void {
    this.isPolling = false;
    this.setStatus('Disconnected');
  }

  private async pollLoop(): Promise<void> {
    while (this.isPolling) {
      try {
        const url = `/api/realtime/poll${this.lastSeenId ? `?since=${encodeURIComponent(this.lastSeenId)}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.events && Array.isArray(data.events)) {
            data.events.forEach((evt: any) => {
              if (evt.id) this.lastSeenId = evt.id;
              this.notifyMessage({ event: 'long_poll_event', payload: evt });
            });
          }
        }
      } catch {
        // Wait 3 seconds before retrying on network error
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  private notifyMessage(msg: RealtimeEventMessage): void {
    this.messageListeners.forEach((fn) => fn(msg));
  }
}

// Global Singletons
export const globalWsClient = new WebSocketClientManager('/ws');
export const globalSseClient = new SseClientManager('/api/realtime/sse/subscribe');
export const globalMqttClient = new MqttClientManager();
export const globalPollingClient = new LongPollingClientManager();
