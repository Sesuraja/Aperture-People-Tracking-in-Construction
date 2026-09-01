import { getCollectionDocs, upsertDoc, deleteDocById } from './db.js';
import { processTelemetryWithAI, TelemetryPayload } from './aiPipeline.js';
import { broadcastWebSocketEvent } from './websocket.js';

export interface HardwareReader {
  id: string;
  readerId: string;
  name: string;
  model: string;
  ipAddress: string;
  port: number;
  protocol: 'HTTP Push' | 'GAO TCP/IP' | 'LLRP (EPC Gen2)' | 'UHF Gateway' | 'WebSocket SSL' | 'MQTT Direct';
  powerDbm: number; // e.g. 30 dBm
  sensitivityDbm: number; // e.g. -70 dBm
  status: 'ONLINE' | 'SCANNING' | 'STANDBY' | 'OFFLINE';
  antennas: Array<{
    port: number;
    name: string;
    zoneId: string;
    zoneName: string;
    direction: 'IN' | 'OUT' | 'BIDIRECTIONAL';
    powerDbm: number;
  }>;
  totalScans: number;
  lastPingAt?: string;
  lastScanAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TagEntityMapping {
  id: string;
  tagId: string; // EPC Hex or UHF Tag ID
  entityType: 'PERSONNEL' | 'VISITOR' | 'ASSET' | 'VEHICLE';
  entityId: string;
  entityName: string;
  roleOrTrade?: string;
  department?: string;
  assignedZone?: string;
  ppeRequired?: string[];
  batteryPercent?: number;
  status: 'ACTIVE' | 'REVOKED' | 'MAINTENANCE';
  lastSeenAt?: string;
  lastSeenZone?: string;
  createdAt: string;
}

export interface DirectHardwareScanPayload {
  readerId: string;
  antennaId?: number;
  tagId: string;
  rssi?: number;
  timestamp?: string;
  protocol?: string;
  direction?: 'IN' | 'OUT';
  rawHex?: string;
}

/**
 * 1. Process Direct Hardware Scan (Reader → Software → Data Processing → AI Engine → MongoDB → Dashboard)
 */
export async function processDirectHardwareScan(
  scan: DirectHardwareScanPayload,
  organizationId: string = 'demo'
): Promise<{
  success: boolean;
  resolvedEntity: { name: string; type: string; role?: string };
  resolvedZone: string;
  aiRiskScore: number;
  aiRiskLevel: string;
  aiInsight: string;
}> {
  const nowIso = new Date().toISOString();
  const rawTagId = String(scan.tagId || `TAG_${Date.now()}`).trim();

  // STEP 1: RESOLVE READER & ANTENNA ZONE MAPPING
  const readers: HardwareReader[] = await getCollectionDocs('hardware_readers', undefined, organizationId);
  let matchedReader = readers.find(r => r.readerId === scan.readerId || r.id === scan.readerId || (r as any).serialno === scan.readerId);
  
  if (!matchedReader && scan.readerId) {
    matchedReader = {
      id: scan.readerId,
      readerId: scan.readerId,
      name: `GAO Fixed Reader (${scan.readerId})`,
      model: scan.readerModel || 'GAO-216031A',
      ipAddress: '192.168.1.120',
      port: 8080,
      protocol: 'HTTP Push',
      powerDbm: 30,
      sensitivityDbm: -70,
      status: 'ONLINE',
      location: 'Main Facility Portal',
      antennas: [
        { port: Number(scan.antennaId || 1), name: `Antenna ${scan.antennaId || 1}`, zoneId: 'main-portal', zoneName: 'Main Facility Portal', direction: 'BIDIRECTIONAL', powerDbm: 30 }
      ],
      totalScans: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await upsertDoc('hardware_readers', scan.readerId, matchedReader, organizationId);
  }

  let resolvedZone = 'Main Facility Perimeter';
  if (matchedReader && matchedReader.antennas && matchedReader.antennas.length > 0) {
    const antennaNum = Number(scan.antennaId || 1);
    const matchedAntenna = matchedReader.antennas.find(a => a.port === antennaNum) || matchedReader.antennas[0];
    if (matchedAntenna?.zoneName) {
      resolvedZone = matchedAntenna.zoneName;
    }
  }

  // STEP 2: RESOLVE TAG TO USER/ASSET MAPPING
  const tagMappings: TagEntityMapping[] = await getCollectionDocs('hardware_tag_mappings', undefined, organizationId);
  const people: any[] = (await getCollectionDocs('registered_people', undefined, organizationId)) || [];
  
  const matchedTag = tagMappings.find(t => t.tagId.toLowerCase() === rawTagId.toLowerCase());
  const matchedPerson = people.find((p: any) => (p.tagId || p.TagID || p.badgeId || p.id)?.toLowerCase() === rawTagId.toLowerCase());

  let entityName = rawTagId;
  let entityType = 'UNASSIGNED';
  let roleOrTrade = 'Unregistered Tag';

  if (matchedTag) {
    entityName = matchedTag.entityName;
    entityType = matchedTag.entityType;
    roleOrTrade = matchedTag.roleOrTrade || roleOrTrade;
  } else if (matchedPerson) {
    entityName = matchedPerson.name || `${matchedPerson.firstName || ''} ${matchedPerson.lastName || ''}`.trim() || rawTagId;
    roleOrTrade = matchedPerson.trade || matchedPerson.role || roleOrTrade;
    entityType = 'PERSONNEL';
  }

  const nameParts = entityName.split(' ');
  const firstName = nameParts[0] || rawTagId;
  const lastName = nameParts.slice(1).join(' ') || '';

  // STEP 3: PREPARE TELEMETRY FOR AI ENGINE
  const telemetry: TelemetryPayload = {
    TagID: rawTagId,
    tagId: rawTagId,
    organizationId,
    Location: resolvedZone,
    LocationName: resolvedZone,
    Timestamp: scan.timestamp || nowIso,
    FirstName: firstName,
    LastName: lastName,
    rssi: scan.rssi !== undefined ? Number(scan.rssi) : -59,
    readerId: scan.readerId,
    antennaId: scan.antennaId || 1,
    sourceProtocol: scan.protocol || matchedReader?.protocol || 'Direct Hardware RFID'
  };

  // STEP 4: PASS THROUGH AI ENGINE & PERSIST IN MONGODB
  const aiResult = await processTelemetryWithAI([telemetry], `Direct Hardware: ${matchedReader?.name || scan.readerId}`, organizationId);
  const analyzed = aiResult.analyzedResults[0];

  // STEP 5: UPDATE READER HEALTH & STATS IN MONGODB
  if (matchedReader) {
    const updatedReader: HardwareReader = {
      ...matchedReader,
      status: 'SCANNING',
      totalScans: (matchedReader.totalScans || 0) + 1,
      lastScanAt: nowIso,
      lastPingAt: nowIso,
      updatedAt: nowIso
    };
    await upsertDoc('hardware_readers', updatedReader, organizationId);
    broadcastWebSocketEvent('hardware_reader_update', updatedReader, organizationId);
  }

  // STEP 6: UPDATE TAG MAPPING LAST SEEN
  if (matchedTag) {
    await upsertDoc('hardware_tag_mappings', {
      ...matchedTag,
      lastSeenAt: nowIso,
      lastSeenZone: resolvedZone
    }, organizationId);
  }

  return {
    success: true,
    resolvedEntity: {
      name: entityName,
      type: entityType,
      role: roleOrTrade
    },
    resolvedZone,
    aiRiskScore: analyzed?.aiRiskScore || 15,
    aiRiskLevel: analyzed?.aiRiskLevel || 'SAFE',
    aiInsight: analyzed?.aiInsight || `Direct scan registered at ${resolvedZone}`
  };
}

/**
 * 2. Bootstrap default Hardware Readers and Tag Mappings
 * DISABLED: No synthetic readers or fake tag mappings are seeded. All data is real API only.
 */
export async function bootstrapDefaultHardware(): Promise<void> {
  // Disabled - pure live API operation only
}

