import { RealTimeTagDocument } from '../db/schemas/mongodb/real_time_tags';
import { HistoryRecordDocument } from '../db/schemas/mongodb/history_records';

export type WSConnectionStatus = 'Connected' | 'Disconnected' | 'Connecting' | 'Reconnecting';

export interface RawGaoTagMessage {
  type?: string;
  TagID?: string;
  tagId?: string;
  epc?: string;
  Timestamp?: string;
  timestamp?: string;
  Location?: string;
  location?: string;
  LocationName?: string;
  zone?: string;
  FirstName?: string;
  firstName?: string;
  LastName?: string;
  lastName?: string;
  EnterTime?: string;
  LeaveTime?: string;
  Duration?: number;
  rssi?: number;
  status?: string;
  payload?: any;
}

export interface MappedIngestionData {
  realTimeTag: RealTimeTagDocument;
  historyRecord: HistoryRecordDocument;
}

type StatusListener = (status: WSConnectionStatus, lastSyncTime: string | null) => void;
type TagDataListener = (data: MappedIngestionData) => void;

class GaoWebSocketService {
  private socket: WebSocket | null = null;
  private status: WSConnectionStatus = 'Disconnected';
  private lastSyncTime: string | null = null;
  private reconnectInterval: number = 5000;
  private reconnectTimer: any = null;
  private autoBulkIngest: boolean = true;
  private pendingIngestQueue: RealTimeTagDocument[] = [];
  private batchFlushTimer: any = null;

  private statusListeners: Set<StatusListener> = new Set();
  private tagListeners: Set<TagDataListener> = new Set();

  constructor() {
    // Auto initialize if in browser
    if (typeof window !== 'undefined') {
      this.initConnection();
    }
  }

  /**
   * Helper to format UTC Date into GAO format: "yyyy-MM-dd HH:mm:ss"
   */
  public formatUtcDateTime(dateInput?: string | Date | number): string {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
    }
    const YYYY = d.getUTCFullYear();
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
  }

  /**
   * Helper to format UTC Timestamp into GAO Realtime format: "yyyy-MM-dd HH:mm:ss.fff"
   */
  public formatUtcTimestampMs(dateInput?: string | Date | number): string {
    const d = dateInput ? new Date(dateInput) : new Date();
    const base = this.formatUtcDateTime(d);
    const fff = String(isNaN(d.getTime()) ? 0 : d.getUTCMilliseconds()).padStart(3, '0');
    return `${base}.${fff}`;
  }

  /**
   * Maps raw incoming WebSocket payload to MongoDB schemas (real_time_tags & history_records)
   */
  public mapRawTagToSchema(raw: RawGaoTagMessage): MappedIngestionData {
    const tagId = raw.TagID || raw.tagId || raw.epc || `TAG_${Date.now()}`;
    const rawLocation = raw.Location || raw.LocationName || raw.location || raw.zone || 'Zone1';
    
    const now = new Date();
    const timestampStr = raw.Timestamp || raw.timestamp ? this.formatUtcTimestampMs(raw.Timestamp || raw.timestamp) : this.formatUtcTimestampMs(now);
    const enterTimeStr = raw.EnterTime ? this.formatUtcDateTime(raw.EnterTime) : this.formatUtcDateTime(now);
    const leaveTimeStr = raw.LeaveTime ? this.formatUtcDateTime(raw.LeaveTime) : enterTimeStr;
    
    const firstName = raw.FirstName || raw.firstName || 'Staff';
    const lastName = raw.LastName || raw.lastName || 'Member';

    let duration = raw.Duration !== undefined ? Number(raw.Duration) : 0;
    if (duration === 0 && raw.EnterTime && raw.LeaveTime) {
      const enterMs = new Date(raw.EnterTime).getTime();
      const leaveMs = new Date(raw.LeaveTime).getTime();
      if (!isNaN(enterMs) && !isNaN(leaveMs) && leaveMs >= enterMs) {
        duration = Math.round(((leaveMs - enterMs) / 3600000) * 10) / 10;
      }
    }

    const realTimeTag: RealTimeTagDocument = {
      id: tagId,
      TagID: tagId,
      Timestamp: timestampStr,
      Location: rawLocation,
      FirstName: firstName,
      LastName: lastName,
      rssi: raw.rssi !== undefined ? Number(raw.rssi) : -62,
      status: raw.status || 'Active',
      lastSyncAt: new Date().toISOString()
    };

    const historyRecord: HistoryRecordDocument = {
      id: `hist_${Date.now()}_${tagId}`,
      TagID: tagId,
      FirstName: firstName,
      LastName: lastName,
      LocationName: rawLocation,
      EnterTime: enterTimeStr,
      LeaveTime: leaveTimeStr,
      EnterTimeStr: enterTimeStr,
      LeaveTimeStr: leaveTimeStr,
      Duration: duration
    };

    return { realTimeTag, historyRecord };
  }

  public formatWsUrl(inputUrl?: string): string {
    const defaultProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultHost = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    
    if (!inputUrl || !inputUrl.trim()) {
      return `${defaultProtocol}//${defaultHost}/ws`;
    }

    let url = inputUrl.trim();
    if (url.startsWith('http://')) url = 'ws://' + url.slice(7);
    else if (url.startsWith('https://')) url = 'wss://' + url.slice(8);

    if (url.startsWith('/')) {
      url = `${defaultProtocol}//${defaultHost}${url}`;
    } else if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = `${defaultProtocol}//${url}`;
    }

    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('ws://')) {
      const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
      if (!isLocalhost) {
        url = 'wss://' + url.slice(5);
      }
    }

    return url;
  }

  /**
   * Connect to WebSocket endpoint
   */
  public connect(customUrl?: string) {
    if (typeof window === 'undefined') return;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('Connecting');

    try {
      const wsUrl = this.formatWsUrl(customUrl);

      console.log(`[GaoWebSocketService] Connecting to GAO RFID stream: ${wsUrl}`);
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[GaoWebSocketService] WebSocket link established to GAO RFID API');
        this.setStatus('Connected');
        this.lastSyncTime = new Date().toISOString();
        this.notifyStatusListeners();

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Subscribe to tag updates
        this.socket?.send(JSON.stringify({ type: 'subscribe', payload: { channel: 'rfid_tags' } }));
        this.socket?.send(JSON.stringify({ type: 'GetTagsInRealtime' }));
      };

      this.socket.onmessage = (event) => {
        try {
          const rawMessage = JSON.parse(event.data);
          this.handleIncomingMessage(rawMessage);
        } catch (e) {
          console.warn('[GaoWebSocketService] Message parse error:', e);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[GaoWebSocketService] Socket error encountered:', err);
      };

      this.socket.onclose = () => {
        console.log('[GaoWebSocketService] Connection closed');
        this.setStatus('Disconnected');
        this.socket = null;
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('[GaoWebSocketService] Connection setup error:', e);
      this.setStatus('Disconnected');
      this.scheduleReconnect();
    }
  }

  private handleIncomingMessage(msg: any) {
    this.lastSyncTime = new Date().toISOString();
    this.notifyStatusListeners();

    // Process tag events
    if (msg.type === 'tag_update' || msg.type === 'rfid_scan' || msg.type === 'synthetic_rfid_scan' || msg.TagID || msg.payload?.TagID) {
      const tagPayload: RawGaoTagMessage = msg.payload?.TagID ? msg.payload : (msg.TagID ? msg : msg.record || msg.payload);
      if (tagPayload && (tagPayload.TagID || tagPayload.tagId)) {
        const mapped = this.mapRawTagToSchema(tagPayload);
        
        // Notify local listeners for live UI rendering
        this.tagListeners.forEach(listener => listener(mapped));

        // Only queue for bulk ingestion if the tag was received from an external client-direct device stream,
        // rather than events already stored and broadcast by the server backend.
        if (this.autoBulkIngest && msg.source === 'external_device') {
          this.queueForBulkIngest(mapped.realTimeTag);
        }
      }
    } else if (msg.type === 'GetTagsInRealtime_response' && Array.isArray(msg.payload)) {
      msg.payload.forEach((rawTag: RawGaoTagMessage) => {
        const mapped = this.mapRawTagToSchema(rawTag);
        this.tagListeners.forEach(listener => listener(mapped));
      });
    }
  }

  /**
   * Queue real-time tag documents for bulk ingestion into MongoDB 'real_time_tags'
   */
  private queueForBulkIngest(tagDoc: RealTimeTagDocument) {
    // Avoid duplicate queued entries for same TagID
    const existingIndex = this.pendingIngestQueue.findIndex(item => item.TagID === tagDoc.TagID);
    if (existingIndex >= 0) {
      this.pendingIngestQueue[existingIndex] = tagDoc;
    } else {
      this.pendingIngestQueue.push(tagDoc);
    }

    // Flush batch if queue grows or schedule batch flush
    if (this.pendingIngestQueue.length >= 10) {
      this.flushBulkIngest();
    } else if (!this.batchFlushTimer) {
      this.batchFlushTimer = setTimeout(() => {
        this.flushBulkIngest();
      }, 2000);
    }
  }

  /**
   * Perform HTTP POST bulk write to backend route
   */
  public async flushBulkIngest() {
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }

    if (this.pendingIngestQueue.length === 0) return;
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const batch = [...this.pendingIngestQueue];
    this.pendingIngestQueue = [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('/api/rfid/realtime-tags/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: batch }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.lastSyncTime = new Date().toISOString();
        this.notifyStatusListeners();
      }
    } catch {
      // Requeue failed items up to 50 max to prevent runaway growth
      if (this.pendingIngestQueue.length < 50) {
        this.pendingIngestQueue.push(...batch.slice(0, 20));
      }
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.setStatus('Reconnecting');
        this.connect();
      }, this.reconnectInterval);
    }
  }

  private setStatus(newStatus: WSConnectionStatus) {
    this.status = newStatus;
    this.notifyStatusListeners();
  }

  private notifyStatusListeners() {
    this.statusListeners.forEach(listener => listener(this.status, this.lastSyncTime));
  }

  public initConnection() {
    this.connect();
  }

  public getStatus(): WSConnectionStatus {
    return this.socket && this.socket.readyState === WebSocket.OPEN ? 'Connected' : this.status;
  }

  public getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    // Initial call
    listener(this.getStatus(), this.lastSyncTime);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public subscribeTagData(listener: TagDataListener): () => void {
    this.tagListeners.add(listener);
    return () => {
      this.tagListeners.delete(listener);
    };
  }

  public send(type: string, payload: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    } else {
      console.warn('[GaoWebSocketService] Cannot send message: socket not open');
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('Disconnected');
  }
}

export const webSocketService = new GaoWebSocketService();
export default webSocketService;
