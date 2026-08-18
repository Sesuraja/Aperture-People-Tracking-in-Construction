import { useEffect, useState, useRef, useCallback } from 'react';

export interface WSMessage {
  type: string;
  payload: any;
  timestamp?: string;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WSMessage | null;
  sendMessage: (type: string, payload: any) => void;
  triggerSafetyAlert: (title: string, location: string, severity?: 'critical' | 'warning' | 'info') => void;
  broadcastTagMovement: (tagId: string, x: number, y: number, zone?: string) => void;
  acknowledgeAlert: (alertId: string, ackBy?: string) => void;
}

export function useWebSocket(onMessageReceived?: (msg: WSMessage) => void): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log(`[useWebSocket] Connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[useWebSocket] Connection open');
        setIsConnected(true);
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }

        // Subscribe to live tracking and alerts channels
        ws.send(JSON.stringify({ type: 'subscribe', payload: { channel: 'all' } }));
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WSMessage;
          setLastMessage(parsed);
          if (onMessageReceived) {
            onMessageReceived(parsed);
          }
        } catch (err) {
          console.warn('[useWebSocket] Failed to parse websocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[useWebSocket] Connection closed. Retrying in 10s...');
        setIsConnected(false);
        socketRef.current = null;

        // Auto-reconnect after 10 seconds
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, 10000);
        }
      };

      ws.onerror = (error) => {
        console.warn('[useWebSocket] Socket connection failed (this is expected in some iframe environments):', error);
      };
    } catch (err) {
      console.warn('[useWebSocket] Connection setup failed:', err);
    }
  }, [onMessageReceived]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((type: string, payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    } else {
      console.warn('[useWebSocket] Cannot send message - WebSocket not connected');
    }
  }, []);

  const triggerSafetyAlert = useCallback((title: string, location: string, severity: 'critical' | 'warning' | 'info' = 'critical') => {
    sendMessage('trigger_safety_alert', {
      id: `ALT_${Date.now()}`,
      title,
      location,
      severity,
      timestamp: new Date().toISOString()
    });
  }, [sendMessage]);

  const broadcastTagMovement = useCallback((tagId: string, x: number, y: number, zone?: string) => {
    sendMessage('tag_movement', {
      tagId,
      x,
      y,
      zone: zone || 'Active Zone',
      timestamp: new Date().toISOString()
    });
  }, [sendMessage]);

  const acknowledgeAlert = useCallback((alertId: string, ackBy: string = 'Safety Officer') => {
    sendMessage('acknowledge_alert', {
      alertId,
      acknowledgedBy: ackBy,
      acknowledgedAt: new Date().toISOString()
    });
  }, [sendMessage]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    triggerSafetyAlert,
    broadcastTagMovement,
    acknowledgeAlert
  };
}
