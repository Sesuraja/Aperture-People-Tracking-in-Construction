/**
 * MockGAO216031AAdapter
 *
 * Application-level simulator that generates realistic GAO216031A-shaped RFID events
 * and feeds them through the EXISTING Aperture ingestion pipeline.
 *
 * This is NOT an official GAO emulator. It is an application-level development tool
 * that produces GAO-document-compatible event shapes without physical hardware.
 *
 * Design principles (per spec §13, §19, §32):
 * - The mock generates GaoNativeEvents with documented GAO fields
 * - Events are validated → mapped → fed into the existing processDirectHardwareScan()
 * - No separate pipeline. No duplicate business logic.
 * - Deduplication prevents repeated RFID reads from creating duplicate person entries
 * - Clearly marked SIMULATED in all status objects
 * - When physical GAO216031A arrives, only this adapter layer changes
 */

import { processDirectHardwareScan } from './hardwareIntegrationService.js';
import { getCollectionDocs, upsertDoc } from './db.js';
import { broadcastWebSocketEvent } from './websocket.js';
import { validateGaoNativeEvent, mapGaoNativeToDirect, parseGaoTimestamp } from './gaoEventMapper.js';
import type { HardwareReader } from './hardwareIntegrationService.js';
import {
  GaoNativeEvent,
  SimulatorConfig,
  MockReaderStatus,
  MockSimulatorStatus,
  MockReaderConnectionState,
  SimulationScenario,
  DEFAULT_SIMULATOR_CONFIG,
  UNKNOWN_TAG_EPC,
  CONSTRUCTION_SCENARIO_ZONES,
} from '../../lib/gaoNativeTypes.js';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let running = false;
let tickInterval: NodeJS.Timeout | null = null;
let unknownTagInterval: NodeJS.Timeout | null = null;
let currentConfig: SimulatorConfig = { ...DEFAULT_SIMULATOR_CONFIG };
let startedAt: string | undefined;

/** Per-reader online/offline state (readerId → boolean) */
const readerOnlineMap: Map<string, boolean> = new Map();

/** Per-reader event counters */
const readerScanCounts: Map<string, number> = new Map();
const readerLastEventAt: Map<string, string> = new Map();
const readerErrors: Map<string, string | undefined> = new Map();

/** Total events generated and suppressed by dedup */
let totalEventsGenerated = 0;
let totalEventsSuppressedByDedup = 0;

/**
 * Dedup cache: key = `${tagEpc}::${zoneName}`, value = last seen timestamp (ms)
 */
const dedupCache: Map<string, number> = new Map();

/**
 * Scenario state: tagEpc → current zone index in CONSTRUCTION_SCENARIO_ZONES
 */
const scenarioZoneIndex: Map<string, number> = new Map();

/**
 * Per-tag read count (incremented each inventory cycle — wraps on overflow)
 */
const tagReadCounts: Map<string, number> = new Map();

// ---------------------------------------------------------------------------
// GAO Timestamp formatter (yyyy-MM-dd HH:mm:ss.SSS)
// ---------------------------------------------------------------------------

function formatGaoTimestamp(d: Date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function isDuplicate(tagEpc: string, zoneName: string, nowMs: number): boolean {
  const key = `${tagEpc}::${zoneName}`;
  const lastSeen = dedupCache.get(key);
  if (lastSeen === undefined || nowMs - lastSeen > currentConfig.dedupWindowMs) {
    dedupCache.set(key, nowMs);
    return false;
  }
  return true;
}

function clearDedupForTag(tagEpc: string): void {
  for (const key of dedupCache.keys()) {
    if (key.startsWith(`${tagEpc}::`)) dedupCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Zone selection
// ---------------------------------------------------------------------------

/**
 * Returns {zoneName, readerId, antenna} for a given tag EPC based on scenario.
 */
function selectZoneForTag(
  tagEpc: string,
  scenario: SimulationScenario,
  readerIds: string[]
): { zoneName: string; readerId: string; antenna: number } {
  if (scenario === 'construction_site_movement' || scenario === 'restricted_zone_breach') {
    // Deterministic sequence through construction site zones
    const zoneList = CONSTRUCTION_SCENARIO_ZONES;
    const currentIdx = scenarioZoneIndex.get(tagEpc) ?? 0;
    const entry = zoneList[currentIdx % zoneList.length];

    // Only advance zone if this reader is online
    if (readerOnlineMap.get(entry.readerId) !== false) {
      // Advance zone every N ticks (advance is based on dedup window clearing)
      // We advance when a dedupCache miss is detected (i.e., after dedupWindowMs)
      const key = `${tagEpc}::${entry.zoneName}`;
      const lastSeen = dedupCache.get(key);
      if (lastSeen === undefined) {
        // First time or cache expired — this is a new zone entry
        scenarioZoneIndex.set(tagEpc, (currentIdx + 1) % zoneList.length);
      }
      return entry;
    }
    // If preferred reader is offline, fallback to next zone
    const fallbackIdx = (currentIdx + 1) % zoneList.length;
    return zoneList[fallbackIdx];
  }

  // Random scenario: pick a random reader + antenna combination
  const onlineReaderIds = readerIds.filter(id => readerOnlineMap.get(id) !== false);
  if (onlineReaderIds.length === 0) {
    return { zoneName: 'Gate 1 / Main Access Gate', readerId: readerIds[0] || 'GAO-MOCK-001', antenna: 1 };
  }
  const readerId = onlineReaderIds[Math.floor(Math.random() * onlineReaderIds.length)];
  const reader = currentConfig.readers.find(r => r.readerId === readerId);
  const antennas = reader?.antennas || [{ port: 1, zoneName: 'Gate 1 / Main Access Gate', zoneId: 'zone_gate_a' }];
  const ant = antennas[Math.floor(Math.random() * antennas.length)];
  return { zoneName: ant.zoneName, readerId, antenna: ant.port };
}

// ---------------------------------------------------------------------------
// Event generation
// ---------------------------------------------------------------------------

function randomRssi(): number {
  const { rssiMin, rssiMax } = currentConfig;
  const min = Math.min(rssiMin, rssiMax);
  const max = Math.max(rssiMin, rssiMax);
  return Math.round(min + Math.random() * (max - min));
}

function generateGaoEvent(
  epc: string,
  serialno: string,
  ant: number,
  readCount: number
): GaoNativeEvent {
  return {
    timestamp: formatGaoTimestamp(new Date()),
    epc,
    tid: '',      // Optional — may be empty per spec §28
    userdata: '', // Optional — may be empty per spec §28
    reserved: '', // Optional — may be empty per spec §28
    ant,
    rssi: randomRssi(),
    freq: 915000, // UHF RFID typical frequency (kHz)
    phase: Math.floor(Math.random() * 360),
    readcount: readCount,
    serialno,
    customcode: '', // Optional — may be empty per spec §28
  };
}

// ---------------------------------------------------------------------------
// Bootstrap: register mock readers and tag mappings in MongoDB
// ---------------------------------------------------------------------------

async function bootstrapMockReaders(): Promise<void> {
  const existingReaders: HardwareReader[] = await getCollectionDocs('hardware_readers');

  for (const mockReader of currentConfig.readers) {
    const already = existingReaders.find(r => r.readerId === mockReader.readerId);
    if (!already) {
      const now = new Date().toISOString();
      const readerDoc: HardwareReader = {
        id: `reader_${mockReader.readerId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        readerId: mockReader.readerId,
        name: mockReader.name,
        model: mockReader.model,
        ipAddress: mockReader.ipAddress,
        port: mockReader.port,
        protocol: 'HTTP Push',
        powerDbm: 30,
        sensitivityDbm: -75,
        status: 'ONLINE',
        antennas: mockReader.antennas.map(a => ({
          port: a.port,
          name: `Antenna ${a.port}`,
          zoneId: a.zoneId,
          zoneName: a.zoneName,
          direction: 'BIDIRECTIONAL' as const,
          powerDbm: 30,
        })),
        totalScans: 0,
        lastPingAt: now,
        notes: '⚠ SIMULATED — GAO216031A Mock Reader (No physical hardware)',
        createdAt: now,
        updatedAt: now,
      };
      await upsertDoc('hardware_readers', readerDoc);
    }
  }

  // Register mock EPCs in hardware_tag_mappings, mapping to first N real people
  const existingMappings = await getCollectionDocs('hardware_tag_mappings');
  const people = await getCollectionDocs('registered_people');

  for (let i = 0; i < currentConfig.epcs.length; i++) {
    const epc = currentConfig.epcs[i];
    if (existingMappings.find((m: any) => m.tagId === epc)) continue;

    const person = people[i % Math.max(people.length, 1)];
    const entityName = person ? (person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || `EMP-00${i + 1}`) : `Demo Worker ${i + 1}`;
    const entityId = person?.id || `DEMO-EMP-00${i + 1}`;

    await upsertDoc('hardware_tag_mappings', {
      id: `mock_map_${epc.slice(-6)}`,
      tagId: epc,
      entityType: 'PERSONNEL',
      entityId,
      entityName,
      roleOrTrade: person?.role || person?.trade || 'Field Personnel',
      department: person?.department || 'Site Operations',
      assignedZone: 'All Zones',
      ppeRequired: ['Hard Hat', 'Safety Boots', 'Hi-Vis Vest'],
      status: 'ACTIVE',
      simulated: true,
      createdAt: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Update reader health in MongoDB + broadcast
// ---------------------------------------------------------------------------

async function updateReaderHealth(
  readerId: string,
  status: MockReaderConnectionState
): Promise<void> {
  try {
    const readers: HardwareReader[] = await getCollectionDocs('hardware_readers');
    const reader = readers.find(r => r.readerId === readerId);
    if (reader) {
      const updated = {
        ...reader,
        status: status === 'ONLINE' || status === 'SCANNING' ? status : 'OFFLINE',
        lastPingAt: new Date().toISOString(),
        totalScans: readerScanCounts.get(readerId) ?? reader.totalScans ?? 0,
        updatedAt: new Date().toISOString(),
      };
      await upsertDoc('hardware_readers', updated);
      broadcastWebSocketEvent('hardware_reader_update', {
        ...updated,
        simulated: true,
      });
    }
  } catch (e: any) {
    console.warn(`[MockGAO] Could not update reader health for ${readerId}:`, e?.message);
  }
}

// ---------------------------------------------------------------------------
// Single tick: generate and ingest one batch of events
// ---------------------------------------------------------------------------

async function tick(): Promise<void> {
  if (!running) return;

  const nowMs = Date.now();
  const readerIds = currentConfig.readers.map(r => r.readerId);

  for (const epc of currentConfig.epcs) {
    const { zoneName, readerId, antenna } = selectZoneForTag(epc, currentConfig.scenario, readerIds);

    // Skip if reader is offline
    if (readerOnlineMap.get(readerId) === false) continue;

    // Deduplication check
    if (isDuplicate(epc, zoneName, nowMs)) {
      totalEventsSuppressedByDedup++;
      continue;
    }

    // Increment per-tag read count
    const rc = (tagReadCounts.get(epc) ?? 0) + 1;
    tagReadCounts.set(epc, rc);

    // Find the mock reader config to get serial number
    const mockReader = currentConfig.readers.find(r => r.readerId === readerId);
    const serialno = mockReader?.serialNumber || readerId;

    // Generate GAO-shaped event
    const gaoEvent = generateGaoEvent(epc, serialno, antenna, rc);

    // Validate
    const validation = validateGaoNativeEvent(gaoEvent);
    if (!validation.valid) {
      console.warn(`[MockGAO] Invalid event generated (bug): ${validation.errors.join(', ')}`);
      continue;
    }

    // Map to DirectHardwareScanPayload and ingest through existing pipeline
    const scanPayload = mapGaoNativeToDirect(gaoEvent, readerId, 'mock_gao216031a');

    try {
      await processDirectHardwareScan(scanPayload);
      totalEventsGenerated++;
      readerScanCounts.set(readerId, (readerScanCounts.get(readerId) ?? 0) + 1);
      readerLastEventAt.set(readerId, new Date().toISOString());

      // Broadcast simulator-specific event for UI diagnostics
      broadcastWebSocketEvent('gao_simulator_event', {
        epc,
        zoneName,
        readerId,
        antenna,
        rssi: gaoEvent.rssi,
        timestamp: gaoEvent.timestamp,
        simulated: true,
      });
    } catch (e: any) {
      console.warn(`[MockGAO] Ingestion error for EPC ${epc}:`, e?.message);
      readerErrors.set(readerId, e?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Unknown tag injection
// ---------------------------------------------------------------------------

async function injectUnknownTagEvent(): Promise<void> {
  const readerIds = currentConfig.readers.map(r => r.readerId);
  const onlineReaderIds = readerIds.filter(id => readerOnlineMap.get(id) !== false);
  if (onlineReaderIds.length === 0) return;

  const readerId = onlineReaderIds[0];
  const mockReader = currentConfig.readers.find(r => r.readerId === readerId);
  const antenna = mockReader?.antennas[0];
  const serialno = mockReader?.serialNumber || readerId;

  const rc = (tagReadCounts.get(UNKNOWN_TAG_EPC) ?? 0) + 1;
  tagReadCounts.set(UNKNOWN_TAG_EPC, rc);

  // Clear dedup so unknown tag always generates a fresh event
  clearDedupForTag(UNKNOWN_TAG_EPC);

  const gaoEvent = generateGaoEvent(UNKNOWN_TAG_EPC, serialno, antenna?.port || 1, rc);
  const validation = validateGaoNativeEvent(gaoEvent);
  if (!validation.valid) return;

  const scanPayload = mapGaoNativeToDirect(gaoEvent, readerId, 'mock_gao216031a');

  try {
    await processDirectHardwareScan(scanPayload);
    totalEventsGenerated++;
    broadcastWebSocketEvent('gao_simulator_unknown_tag', {
      epc: UNKNOWN_TAG_EPC,
      readerId,
      antenna: antenna?.port || 1,
      message: 'Unknown/unassigned RFID tag detected — no entity mapping found',
      simulated: true,
      timestamp: new Date().toISOString(),
    });
    console.log(`[MockGAO] Injected unknown tag event: EPC=${UNKNOWN_TAG_EPC}`);
  } catch (e: any) {
    console.warn('[MockGAO] Unknown tag injection error:', e?.message);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the GAO216031A mock simulator.
 * Bootstraps readers and tag mappings in MongoDB, then begins generating events.
 */
export async function startMockGaoSimulator(config?: Partial<SimulatorConfig>): Promise<void> {
  if (running) {
    console.log('[MockGAO] Simulator already running. Stop it first to reconfigure.');
    return;
  }

  if (config) {
    currentConfig = { ...DEFAULT_SIMULATOR_CONFIG, ...config };
    if (config.readers) currentConfig.readers = config.readers;
    if (config.epcs) currentConfig.epcs = config.epcs;
  }

  // Initialize reader online state
  for (const reader of currentConfig.readers) {
    if (!readerOnlineMap.has(reader.readerId)) {
      readerOnlineMap.set(reader.readerId, true);
    }
  }

  // Bootstrap MongoDB readers and tag mappings
  try {
    await bootstrapMockReaders();
  } catch (e: any) {
    console.warn('[MockGAO] Bootstrap warning (continuing):', e?.message);
  }

  running = true;
  startedAt = new Date().toISOString();
  totalEventsGenerated = 0;
  totalEventsSuppressedByDedup = 0;

  // Update all readers to SCANNING in MongoDB
  for (const reader of currentConfig.readers) {
    await updateReaderHealth(reader.readerId, 'SCANNING');
  }

  // Main tick interval
  tickInterval = setInterval(async () => {
    await tick();
  }, currentConfig.intervalMs);

  // Unknown tag injection interval
  if (currentConfig.unknownTagEnabled && currentConfig.unknownTagIntervalMs > 0) {
    unknownTagInterval = setInterval(async () => {
      await injectUnknownTagEvent();
    }, currentConfig.unknownTagIntervalMs);
  }

  console.log(`[MockGAO] Simulator started — scenario: ${currentConfig.scenario}, interval: ${currentConfig.intervalMs}ms, tags: ${currentConfig.epcs.length}`);

  broadcastWebSocketEvent('gao_simulator_status', {
    running: true,
    scenario: currentConfig.scenario,
    message: 'GAO216031A Mock Simulator started',
    simulated: true,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Stop the GAO216031A mock simulator.
 */
export async function stopMockGaoSimulator(): Promise<void> {
  if (!running) return;

  running = false;
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  if (unknownTagInterval) { clearInterval(unknownTagInterval); unknownTagInterval = null; }

  // Update all readers to STANDBY in MongoDB
  for (const reader of currentConfig.readers) {
    await updateReaderHealth(reader.readerId, 'ONLINE');
  }

  console.log(`[MockGAO] Simulator stopped. Total events: ${totalEventsGenerated}, suppressed by dedup: ${totalEventsSuppressedByDedup}`);

  broadcastWebSocketEvent('gao_simulator_status', {
    running: false,
    message: 'GAO216031A Mock Simulator stopped',
    simulated: true,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get current simulator status (used by API routes).
 */
export function getMockGaoStatus(): MockSimulatorStatus {
  const readers: MockReaderStatus[] = currentConfig.readers.map(r => ({
    readerId: r.readerId,
    model: r.model,
    serialNumber: r.serialNumber,
    ipAddress: r.ipAddress,
    port: r.port,
    connectionMode: 'TCP_SERVER' as const,
    status: running
      ? (readerOnlineMap.get(r.readerId) !== false ? 'SCANNING' : 'OFFLINE')
      : 'ONLINE',
    simulated: true as const,
    totalScansGenerated: readerScanCounts.get(r.readerId) ?? 0,
    lastEventAt: readerLastEventAt.get(r.readerId),
    lastError: readerErrors.get(r.readerId),
  }));

  return {
    running,
    scenario: currentConfig.scenario,
    readers,
    totalEventsGenerated,
    totalEventsSuppressedByDedup,
    startedAt,
    config: {
      readerCount: currentConfig.readers.length,
      tagCount: currentConfig.epcs.length,
      intervalMs: currentConfig.intervalMs,
      rssiMin: currentConfig.rssiMin,
      rssiMax: currentConfig.rssiMax,
      scenario: currentConfig.scenario,
      dedupWindowMs: currentConfig.dedupWindowMs,
    },
  };
}

/**
 * Toggle a specific simulated reader online or offline.
 * Offline state is reflected in MongoDB hardware_readers and broadcast over WebSocket.
 */
export async function setMockReaderOnline(readerId: string, online: boolean): Promise<void> {
  const reader = currentConfig.readers.find(r => r.readerId === readerId);
  if (!reader) throw new Error(`Mock reader ${readerId} not found`);

  readerOnlineMap.set(readerId, online);
  readerErrors.set(readerId, online ? undefined : 'Reader toggled offline by simulator');

  const newStatus: MockReaderConnectionState = online
    ? (running ? 'SCANNING' : 'ONLINE')
    : 'OFFLINE';

  await updateReaderHealth(readerId, newStatus);

  console.log(`[MockGAO] Reader ${readerId} set to ${online ? 'ONLINE' : 'OFFLINE'}`);
}

/**
 * Simulate reader reconnect cycle: OFFLINE → RECONNECTING → ONLINE.
 */
export async function simulateReaderReconnect(readerId: string): Promise<void> {
  await setMockReaderOnline(readerId, false);

  setTimeout(async () => {
    try {
      await updateReaderHealth(readerId, 'RECONNECTING');
      broadcastWebSocketEvent('gao_simulator_reconnect', { readerId, status: 'RECONNECTING', simulated: true });
    } catch {}
  }, 2000);

  setTimeout(async () => {
    try {
      await setMockReaderOnline(readerId, true);
      broadcastWebSocketEvent('gao_simulator_reconnect', { readerId, status: 'ONLINE', simulated: true });
    } catch {}
  }, 6000);
}

/**
 * Immediately inject an unknown tag event (on-demand from UI).
 */
export async function injectUnknownTag(): Promise<void> {
  await injectUnknownTagEvent();
}

/**
 * Initialize the adapter on server startup.
 * Reads GAO_SIMULATOR_ENABLED env variable to decide whether to auto-start.
 */
export async function initMockGaoAdapter(): Promise<void> {
  // Live RFID hardware API only. No mock simulator auto-started.
}

// ---------------------------------------------------------------------------
// TCP Adapter Boundary (placeholder — spec §30)
// ---------------------------------------------------------------------------

/**
 * PLACEHOLDER: GAO TCP Adapter boundary
 *
 * The GAO216031A supports TCP Server and TCP Client modes.
 * Documented defaults: TCP Server on 192.168.1.116:9090
 *
 * IMPORTANT: The supplied GAO documentation does NOT specify the native
 * binary TCP command/response protocol. Therefore this implementation:
 * - Creates the architectural boundary only
 * - Does NOT invent packet bytes, checksums, or command sequences
 * - Will be implemented when official protocol documentation or real-device
 *   captures are available (spec §30, §50)
 *
 * When implemented, this adapter will call processDirectHardwareScan()
 * through the same mapGaoNativeToDirect() mapper used by the mock adapter.
 */
export const GAOTCPAdapterPlaceholder = {
  /** Connect to GAO reader in TCP Client mode */
  connect: async (_host: string, _port: number): Promise<void> => {
    throw new Error(
      '[GAOTCPAdapter] TCP protocol not yet implemented — awaiting official GAO protocol specification. ' +
      'Use the Mock Simulator or HTTP POST ingestion for development.'
    );
  },
  /** Status of TCP connection */
  status: 'NOT_IMPLEMENTED' as const,
};
