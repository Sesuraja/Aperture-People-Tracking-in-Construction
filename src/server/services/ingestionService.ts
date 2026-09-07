import { processTelemetryWithAI, TelemetryPayload } from './aiPipeline.js';
import { ApiConnectionConfig, saveConnection, getConnectionById } from './connectionsService.js';
import { validateTelemetrySource, isRealTelemetryTag } from './dataPolicy.js';
import { autoSyncTelemetryToMongoDB } from './peopleTrackingApiService.js';

export interface IngestionResult {
  success: boolean;
  recordsProcessed: number;
  aiAnalyzed: number;
  latencyMs: number;
  error?: string;
}

/**
 * Standardizes incoming raw payloads into standardized TelemetryPayloads
 */
export function mapRawItemToTelemetry(item: any, mapping?: ApiConnectionConfig['dataMapping']): TelemetryPayload {
  const tagIdKey = mapping?.tagIdField || 'TagID';
  const locKey = mapping?.locationField || 'Location';
  const timeKey = mapping?.timestampField || 'Timestamp';
  const nameKey = mapping?.nameField || 'FirstName';
  const rssiKey = mapping?.rssiField || 'rssi';

  const tagId = item[tagIdKey] || item.TagID || item.tagId || item.epc || item.EPC || item.id || '';
  const location = item[locKey] || item.Location || item.location || item.LocationName || item.zone || 'Zone 1';
  const timestamp = item[timeKey] || item.Timestamp || item.timestamp || item.EnterTime || new Date().toISOString();
  const firstName = item[nameKey] || item.FirstName || item.firstName || item.name?.split(' ')[0] || '';
  const lastName = item.LastName || item.lastName || item.name?.split(' ').slice(1).join(' ') || '';
  const rssi = item[rssiKey] !== undefined ? Number(item[rssiKey]) : (item.rssi || -60);

  return {
    ...item,
    TagID: String(tagId),
    tagId: String(tagId),
    Location: String(location),
    LocationName: String(location),
    Timestamp: String(timestamp),
    FirstName: String(firstName),
    LastName: String(lastName),
    rssi: Number(rssi)
  };
}

/**
 * Main entrypoint for processing any stream telemetry
 * Validate → AI Pipeline → MongoDB → Dashboard SSE/WebSocket & MQTT Broadcaster
 */
export async function ingestTelemetry(
  rawPayload: any,
  sourceName: string,
  connectionId?: string
): Promise<IngestionResult> {
  const startTime = Date.now();
  let connection: ApiConnectionConfig | null = null;

  // 0. Validate Data Source Policy
  const sourceValidation = validateTelemetrySource(sourceName);
  if (!sourceValidation.valid) {
    return {
      success: false,
      recordsProcessed: 0,
      aiAnalyzed: 0,
      latencyMs: Date.now() - startTime,
      error: sourceValidation.error
    };
  }

  if (connectionId) {
    connection = await getConnectionById(connectionId);
  }

  try {
    // 1. Parse and extract tag list
    let rawList: any[] = [];
    if (Array.isArray(rawPayload)) {
      rawList = rawPayload;
    } else if (rawPayload && typeof rawPayload === 'object') {
      if (Array.isArray(rawPayload.data)) rawList = rawPayload.data;
      else if (Array.isArray(rawPayload.tags)) rawList = rawPayload.tags;
      else if (Array.isArray(rawPayload.records)) rawList = rawPayload.records;
      else if (Array.isArray(rawPayload.items)) rawList = rawPayload.items;
      else if (rawPayload.TagID || rawPayload.tagId || rawPayload.epc || rawPayload.id) rawList = [rawPayload];
    }

    if (rawList.length === 0) {
      console.log(`[INGEST] source="${sourceName}" received empty or non-telemetry payload. Nothing written to MongoDB.`);
      return {
        success: true,
        recordsProcessed: 0,
        aiAnalyzed: 0,
        latencyMs: Date.now() - startTime
      };
    }

    // 2. Map raw payloads to standard telemetry payloads and filter items without a valid real tag identifier
    const telemetryItems = rawList
      .map(item => mapRawItemToTelemetry(item, connection?.dataMapping))
      .filter(item => Boolean(item.TagID && item.TagID.trim() !== '') && isRealTelemetryTag(item.TagID));

    if (telemetryItems.length === 0) {
      console.warn(`[INGEST] rejected: no valid real external telemetry found from source="${sourceName}" (missing or test/dummy tag identifiers)`);
      return {
        success: true,
        recordsProcessed: 0,
        aiAnalyzed: 0,
        latencyMs: Date.now() - startTime
      };
    }

    console.log(`[INGEST] source="${sourceName}" records=${telemetryItems.length}`);
    const orgId = (connection as any)?.organizationId || 'default';

    // 3. Persist to all MongoDB collections (history, people, devices, attendance, zones, readers)
    await autoSyncTelemetryToMongoDB(telemetryItems, orgId).catch((err: any) => {
      console.warn(`[INGEST] autoSyncTelemetryToMongoDB warning: ${err.message}`);
    });

    // 4. Process through AI, Database persistence, and live client broadcasts
    const aiResult = await processTelemetryWithAI(telemetryItems, sourceName, orgId);

    const latencyMs = Date.now() - startTime;
    const nowIso = new Date().toISOString();

    // 4. Update sync statistics on the source connection configuration if specified
    if (connection) {
      const totalIngested = (connection.totalRecordsIngested || 0) + telemetryItems.length;
      await saveConnection({
        ...connection,
        lastSyncAt: nowIso,
        lastStatus: 'SUCCESS',
        lastError: null,
        lastLatencyMs: latencyMs,
        totalRecordsIngested: totalIngested,
        updatedAt: nowIso
      });
    }

    return {
      success: true,
      recordsProcessed: telemetryItems.length,
      aiAnalyzed: aiResult.processedCount,
      latencyMs
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errMsg = err.message || 'Ingestion pipeline execution failure';

    if (connection) {
      await saveConnection({
        ...connection,
        lastSyncAt: new Date().toISOString(),
        lastStatus: 'ERROR',
        lastError: errMsg,
        lastLatencyMs: latencyMs,
        updatedAt: new Date().toISOString()
      });
    }

    return {
      success: false,
      recordsProcessed: 0,
      aiAnalyzed: 0,
      latencyMs,
      error: errMsg
    };
  }
}
