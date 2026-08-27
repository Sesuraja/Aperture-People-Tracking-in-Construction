/**
 * GAO216031A Event Validator & Mapper
 *
 * Maps GAO native events (documented fields from GAO216031A User Manual)
 * to the existing Aperture DirectHardwareScanPayload used by processDirectHardwareScan().
 *
 * This is an APPLICATION-LEVEL mapper, not an official GAO SDK.
 * Only documented GAO fields are handled. No undocumented fields are invented.
 */

import { GaoNativeEvent, NormalizedRfidEvent, RfidEventSource } from '../../lib/gaoNativeTypes.js';
import type { DirectHardwareScanPayload } from './hardwareIntegrationService.js';

// ---------------------------------------------------------------------------
// GAO Timestamp Parser
// GAO manual documents timestamp format: "yyyy-MM-dd HH:mm:ss.SSS"
// ---------------------------------------------------------------------------

/**
 * Parses GAO native timestamp string to ISO 8601.
 * Falls back to current time if parsing fails.
 */
export function parseGaoTimestamp(gaoTs: string): string {
  if (!gaoTs || typeof gaoTs !== 'string') return new Date().toISOString();
  try {
    // GAO format: "2026-08-24 22:30:00.123"
    // Convert space separator to 'T' for standard ISO parsing
    const isoLike = gaoTs.trim().replace(' ', 'T');
    const d = new Date(isoLike);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a GAO native event payload.
 *
 * Required fields: epc, ant, timestamp
 * Optional (may be empty string): tid, userdata, reserved, customcode
 *
 * Per spec §28: Do NOT reject an event because tid/userdata/reserved/customcode are empty.
 */
export function validateGaoNativeEvent(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Payload must be a JSON object'] };
  }

  const ev = raw as Record<string, any>;

  // Flexible tag identifier resolution (epc, EPC, tagId, TagID, id)
  const resolvedEpc = ev.epc || ev.EPC || ev.tagId || ev.TagID || ev.id;
  if (!resolvedEpc || typeof resolvedEpc !== 'string' || resolvedEpc.trim() === '') {
    errors.push('Missing or empty required field: epc (or tagId/TagID)');
  } else {
    ev.epc = resolvedEpc.trim();
  }

  // Antenna number resolution (ant, Ant, antenna, antennaId)
  if (ev.ant === undefined || ev.ant === null) {
    if (ev.Ant !== undefined) ev.ant = ev.Ant;
    else if (ev.antenna !== undefined) ev.ant = ev.antenna;
    else if (ev.antennaId !== undefined) ev.ant = ev.antennaId;
    else ev.ant = 1; // Default to antenna 1 if not specified
  }

  const antNum = typeof ev.ant === 'number' ? ev.ant : parseInt(String(ev.ant), 10);
  if (isNaN(antNum) || antNum < 1) {
    errors.push('Field ant must be a positive integer (1-based antenna number)');
  } else {
    ev.ant = antNum;
  }

  // Required: timestamp
  const resolvedTs = ev.timestamp || ev.Timestamp || ev.time || ev.DateTime;
  if (!resolvedTs || typeof resolvedTs !== 'string' || resolvedTs.trim() === '') {
    ev.timestamp = new Date().toISOString();
  } else {
    ev.timestamp = String(resolvedTs).trim();
  }

  // Recommended: rssi
  if (ev.rssi !== undefined) {
    const parsedRssi = typeof ev.rssi === 'number' ? ev.rssi : parseFloat(String(ev.rssi));
    if (!isNaN(parsedRssi)) {
      ev.rssi = parsedRssi;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Generates a unique event ID for deduplication and audit.
 */
function generateEventId(epc: string, serialno: string, ant: number, ts: string): string {
  const tsClean = ts.replace(/\D/g, '').slice(0, 17);
  return `gao_${serialno}_ant${ant}_${epc.slice(-6)}_${tsClean}`;
}

/**
 * Maps a validated GAO native event to the Aperture NormalizedRfidEvent.
 * Preserves the raw GAO payload for debugging and audit.
 */
export function mapGaoNativeToNormalized(
  event: GaoNativeEvent,
  source: RfidEventSource = 'gao216031a'
): NormalizedRfidEvent {
  const timestamp = parseGaoTimestamp(event.timestamp);

  return {
    eventId: generateEventId(event.epc, event.serialno || 'UNKNOWN', event.ant, event.timestamp),
    source,
    readerId: event.serialno || 'GAO-UNKNOWN',
    readerSerial: event.serialno,
    timestamp,
    epc: event.epc.trim(),
    tid: event.tid || undefined,
    antenna: event.ant,
    rssi: typeof event.rssi === 'number' ? event.rssi : undefined,
    frequency: typeof event.freq === 'number' ? event.freq : undefined,
    phase: typeof event.phase === 'number' ? event.phase : undefined,
    readCount: typeof event.readcount === 'number' ? event.readcount : undefined,
    userData: event.userdata || undefined,
    reserved: event.reserved || undefined,
    customerCode: event.customcode || undefined,
    rawPayload: event,
  };
}

/**
 * Maps a GAO native event directly to the existing DirectHardwareScanPayload
 * used by processDirectHardwareScan().
 *
 * The apertureReaderId parameter is the hardware_readers readerId that this
 * GAO serial number/antenna maps to in Aperture's reader configuration.
 */
export function mapGaoNativeToDirect(
  event: GaoNativeEvent,
  apertureReaderId: string,
  source: RfidEventSource = 'gao216031a'
): DirectHardwareScanPayload & { rawGaoPayload: GaoNativeEvent } {
  const normalized = mapGaoNativeToNormalized(event, source);

  return {
    readerId: apertureReaderId,
    antennaId: event.ant,
    tagId: normalized.epc,
    rssi: normalized.rssi,
    timestamp: normalized.timestamp,
    protocol: 'GAO216031A HTTP Push',
    rawHex: undefined,
    // Preserved for audit — stored as extra field on the scan payload
    rawGaoPayload: event,
  };
}

function normalizeSingleGaoItem(item: any): GaoNativeEvent {

  if (!item || typeof item !== 'object') return item;
  const epc = item.epc || item.EPC || item.tagId || item.TagID || item.tag || item.Tag || item.EPCID || item.epcId || item.pc || item.PC || item.id || '';
  // DEBUG: show what epc resolved to
  console.log('[normalizeSingleGaoItem] raw keys:', Object.keys(item), '| resolved epc:', epc);
  const rawAnt = item.ant !== undefined ? item.ant : (item.Ant !== undefined ? item.Ant : (item.Antenna !== undefined ? item.Antenna : 1));
  const ant = typeof rawAnt === 'number' ? rawAnt : parseInt(String(rawAnt), 10) || 1;
  const timestamp = item.timestamp || item.DateTime || item.Timestamp || item.time || new Date().toISOString();
  const rawRssi = item.rssi !== undefined ? item.rssi : (item.RSSI !== undefined ? item.RSSI : -60);
  const rssi = typeof rawRssi === 'number' ? rawRssi : parseFloat(String(rawRssi)) || -60;
  const serialno = item.serialno || item.ReaderID || item.readerId || item.reader || item.IP || 'GAO-UHF-818-A';

  return {
    epc: String(epc).trim(),
    ant,
    timestamp: String(timestamp).trim(),
    rssi,
    serialno: String(serialno).trim(),
    customcode: item.customcode || item.CustomCode || '',
    tid: item.tid || item.TID || '',
    userdata: item.userdata || item.UserData || '',
    reserved: item.reserved || item.Reserved || '',
    freq: item.freq || 0,
    phase: item.phase || 0,
    readcount: item.readcount || item.ReadCount || 1
  };

}

/**
 * Parses an incoming HTTP POST body that may be a single GaoNativeEvent
 * or an array of them (batch upload).
 */
export function parseGaoNativeBody(body: unknown): GaoNativeEvent[] {
  if (!body) return [];
  if (Array.isArray(body)) return body.map(normalizeSingleGaoItem);
  if (typeof body === 'object') return [normalizeSingleGaoItem(body)];
  return [];
}

