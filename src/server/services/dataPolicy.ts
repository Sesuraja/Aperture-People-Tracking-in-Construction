import crypto from 'crypto';

export type TelemetrySourceType =
  | 'rfid_hardware'
  | 'api'
  | 'mqtt'
  | 'webhook'
  | 'websocket'
  | 'http_scan'
  | 'hardware_gateway'
  | 'manual_scan';

/**
 * Returns true if the system is in production data mode.
 * Default is ALWAYS production unless DATA_MODE is explicitly set to 'demo'.
 */
export function isProductionDataMode(): boolean {
  const mode = (process.env.DATA_MODE || 'production').trim().toLowerCase();
  return mode !== 'demo';
}

/**
 * Returns true if the system is explicitly configured in demo data mode.
 */
export function isDemoDataMode(): boolean {
  const mode = (process.env.DATA_MODE || '').trim().toLowerCase();
  return mode === 'demo';
}

export function getDataMode(): string {
  return isDemoDataMode() ? 'demo' : 'production';
}

/**
 * Validates that an incoming telemetry source is allowed.
 * In production mode, strictly rejects 'demo', 'simulation', 'mock', 'synthetic' sources.
 */
export function validateTelemetrySource(source?: string): { valid: boolean; normalizedSource: string; error?: string } {
  const s = String(source || '').trim().toLowerCase();

  const isSynthetic =
    s.includes('demo') ||
    s.includes('simulation') ||
    s.includes('simulator') ||
    s.includes('mock') ||
    s.includes('fake') ||
    s.includes('synthetic') ||
    s.includes('dummy') ||
    s.includes('sample');

  if (isSynthetic) {
    if (isProductionDataMode()) {
      console.warn(`[INGEST] rejected: synthetic data rejected in production mode (DATA_MODE=${getDataMode()}, source="${source}")`);
      return {
        valid: false,
        normalizedSource: s,
        error: `[DEMO] Synthetic/demo data generation is disabled in production mode (DATA_MODE=${getDataMode()})`
      };
    }
  }

  return {
    valid: true,
    normalizedSource: source || 'rfid_hardware'
  };
}

/**
 * Generates a deterministic event hash for deduplicating incoming telemetry events.
 * Uses externalEventId if provided, otherwise hashes (tagId + timestamp + location + readerId + orgId).
 */
export function generateEventHash(
  tagId: string,
  timestamp: string | Date | number,
  location: string,
  readerId?: string,
  orgId: string = 'default',
  externalEventId?: string
): string {
  if (externalEventId && String(externalEventId).trim()) {
    return String(externalEventId).trim();
  }

  let tsStr = '';
  if (timestamp instanceof Date) {
    tsStr = timestamp.toISOString();
  } else if (typeof timestamp === 'number') {
    tsStr = new Date(timestamp).toISOString();
  } else {
    tsStr = String(timestamp || '').trim();
  }

  const rawKey = `${String(tagId).trim().toUpperCase()}|${tsStr}|${String(location).trim().toUpperCase()}|${String(readerId || '').trim().toUpperCase()}|${String(orgId).trim()}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 16);
}
