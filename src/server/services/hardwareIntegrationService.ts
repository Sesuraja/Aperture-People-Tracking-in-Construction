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
  protocol: 'HTTP Push' | 'GAO TCP/IP' | 'LLRP (EPC Gen2)' | 'BLE Gateway' | 'WebSocket SSL' | 'MQTT Direct';
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
export async function processDirectHardwareScan(scan: DirectHardwareScanPayload): Promise<{
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
  const readers: HardwareReader[] = await getCollectionDocs('hardware_readers');
  const matchedReader = readers.find(r => r.readerId === scan.readerId || r.id === scan.readerId);
  
  let resolvedZone = 'Main Facility Perimeter';
  if (matchedReader && matchedReader.antennas && matchedReader.antennas.length > 0) {
    const antennaNum = Number(scan.antennaId || 1);
    const matchedAntenna = matchedReader.antennas.find(a => a.port === antennaNum) || matchedReader.antennas[0];
    if (matchedAntenna?.zoneName) {
      resolvedZone = matchedAntenna.zoneName;
    }
  }

  // STEP 2: RESOLVE TAG TO USER/ASSET MAPPING
  const tagMappings: TagEntityMapping[] = await getCollectionDocs('hardware_tag_mappings');
  const people: any[] = (await getCollectionDocs('registered_people')) || [];
  
  const matchedTag = tagMappings.find(t => t.tagId.toLowerCase() === rawTagId.toLowerCase());
  const matchedPerson = people.find((p: any) => (p.tagId || p.TagID || p.badgeId || p.id)?.toLowerCase() === rawTagId.toLowerCase());

  let entityName = 'Staff Member';
  let entityType = 'PERSONNEL';
  let roleOrTrade = 'Field Specialist';

  if (matchedTag) {
    entityName = matchedTag.entityName;
    entityType = matchedTag.entityType;
    roleOrTrade = matchedTag.roleOrTrade || roleOrTrade;
  } else if (matchedPerson) {
    entityName = matchedPerson.name || `${matchedPerson.firstName || ''} ${matchedPerson.lastName || ''}`.trim() || 'Staff Member';
    roleOrTrade = matchedPerson.trade || matchedPerson.role || roleOrTrade;
  } else {
    // If not matched, create auto-discovered personnel or asset
    entityName = `Tag Holder (${rawTagId.substring(0, 8)})`;
  }

  const nameParts = entityName.split(' ');
  const firstName = nameParts[0] || 'Staff';
  const lastName = nameParts.slice(1).join(' ') || 'Member';

  // STEP 3: PREPARE TELEMETRY FOR AI ENGINE
  const telemetry: TelemetryPayload = {
    TagID: rawTagId,
    tagId: rawTagId,
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
  const aiResult = await processTelemetryWithAI([telemetry], `Direct Hardware: ${matchedReader?.name || scan.readerId}`);
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
    await upsertDoc('hardware_readers', updatedReader);
    broadcastWebSocketEvent('hardware_reader_update', updatedReader);
  }

  // STEP 6: UPDATE TAG MAPPING LAST SEEN
  if (matchedTag) {
    await upsertDoc('hardware_tag_mappings', {
      ...matchedTag,
      lastSeenAt: nowIso,
      lastSeenZone: resolvedZone
    });
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
 */
export async function bootstrapDefaultHardware(): Promise<void> {
  const existingReaders = await getCollectionDocs('hardware_readers');
  if (existingReaders.length === 0) {
    const defaultReaders: HardwareReader[] = [
      {
        id: 'reader_gate_01',
        readerId: 'GAO-UHF-818-A',
        name: 'Main Security Turnstile Gateway',
        model: 'GAO 818001 UHF 4-Port Fixed Reader',
        ipAddress: '192.168.1.101',
        port: 8080,
        protocol: 'HTTP Push',
        powerDbm: 30,
        sensitivityDbm: -75,
        status: 'ONLINE',
        antennas: [
          { port: 1, name: 'Antenna 1 (Inbound Entry)', zoneId: 'zone_entrance', zoneName: 'Main Entrance Turnstile', direction: 'IN', powerDbm: 30 },
          { port: 2, name: 'Antenna 2 (Outbound Exit)', zoneId: 'zone_entrance', zoneName: 'Main Entrance Turnstile', direction: 'OUT', powerDbm: 30 }
        ],
        totalScans: 412,
        lastPingAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      {
        id: 'reader_crane_02',
        readerId: 'IMPINJ-R420-CRANE',
        name: 'Heavy Crane Exclusion Perimeter Anchor',
        model: 'Impinj Speedway R420 EPC Gen2',
        ipAddress: '192.168.1.104',
        port: 5084,
        protocol: 'LLRP (EPC Gen2)',
        powerDbm: 31.5,
        sensitivityDbm: -80,
        status: 'SCANNING',
        antennas: [
          { port: 1, name: 'Zone B Radius North', zoneId: 'zone_crane', zoneName: 'Tower Crane Zone B', direction: 'BIDIRECTIONAL', powerDbm: 31.5 },
          { port: 2, name: 'Zone B Radius South', zoneId: 'zone_crane', zoneName: 'Tower Crane Zone B', direction: 'BIDIRECTIONAL', powerDbm: 31.5 }
        ],
        totalScans: 289,
        lastPingAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      {
        id: 'reader_server_03',
        readerId: 'ZEBRA-FX9600-SERVER',
        name: 'Server Room Restricted Portal',
        model: 'Zebra FX9600 Industrial RFID',
        ipAddress: '192.168.1.112',
        port: 8080,
        protocol: 'HTTP Push',
        powerDbm: 26,
        sensitivityDbm: -68,
        status: 'ONLINE',
        antennas: [
          { port: 1, name: 'Server Room Door Access', zoneId: 'zone_server', zoneName: 'Restricted Server Room', direction: 'IN', powerDbm: 26 }
        ],
        totalScans: 88,
        lastPingAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }
    ];

    for (const reader of defaultReaders) {
      await upsertDoc('hardware_readers', reader);
    }
  }

  const existingMappings = await getCollectionDocs('hardware_tag_mappings');
  if (existingMappings.length === 0) {
    const defaultMappings: TagEntityMapping[] = [
      {
        id: 'map_01',
        tagId: 'E28011606000020788842D31',
        entityType: 'PERSONNEL',
        entityId: 'EMP-901',
        entityName: 'Marcus Vance',
        roleOrTrade: 'Chief Safety Director',
        department: 'EHS Operations',
        assignedZone: 'All Facilities',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      },
      {
        id: 'map_02',
        tagId: 'E28011606000020788842D32',
        entityType: 'PERSONNEL',
        entityId: 'EMP-902',
        entityName: 'David Miller',
        roleOrTrade: 'Rigging Specialist',
        department: 'Heavy Lifting Crew',
        assignedZone: 'Tower Crane Zone B',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      },
      {
        id: 'map_03',
        tagId: 'AST-CAT336-991',
        entityType: 'ASSET',
        entityId: 'EQ-4001',
        entityName: 'CAT 336 Excavator #12',
        roleOrTrade: 'Heavy Excavator',
        department: 'Site Machinery',
        assignedZone: 'Excavation Sector 4',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      },
      {
        id: 'map_04',
        tagId: 'VIS-99412-GUEST',
        entityType: 'VISITOR',
        entityId: 'VIS-008',
        entityName: 'Elena Rostova (OSHA Inspector)',
        roleOrTrade: 'Regulatory Auditor',
        department: 'Compliance Inspection',
        assignedZone: 'HQ & Site A',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      }
    ];

    for (const map of defaultMappings) {
      await upsertDoc('hardware_tag_mappings', map);
    }
  }
}
