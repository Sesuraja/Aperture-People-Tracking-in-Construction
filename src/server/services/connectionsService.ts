import { getCollectionDocs, upsertDoc, deleteDocById } from './db.js';

export interface ApiConnectionConfig {
  id: string;
  name: string;
  description?: string;
  endpointUrl: string;
  method: 'GET' | 'POST';
  authType: 'none' | 'apiKey' | 'bearer' | 'basic';
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyLocation?: 'header' | 'query' | 'body';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  customHeaders?: Record<string, string>;
  requestBody?: string;
  pollingEnabled?: boolean;
  pollingIntervalSeconds?: number;
  dataMapping?: {
    tagIdField?: string;
    locationField?: string;
    timestampField?: string;
    nameField?: string;
    rssiField?: string;
  };
  lastSyncAt?: string;
  lastStatus?: 'SUCCESS' | 'ERROR' | 'PENDING' | 'IDLE';
  lastError?: string | null;
  lastLatencyMs?: number;
  totalRecordsIngested?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function buildHeaders(config: ApiConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'GAO-PeopleTracking-Gateway/2.0'
  };

  if (config.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  if (config.authType === 'apiKey' && config.apiKey) {
    const headerName = config.apiKeyHeader || 'X-API-Key';
    if (config.apiKeyLocation === 'header' || !config.apiKeyLocation) {
      headers[headerName] = config.apiKey.trim();
    }
  } else if (config.authType === 'bearer' && config.bearerToken) {
    headers['Authorization'] = `Bearer ${config.bearerToken.trim()}`;
  } else if (config.authType === 'basic' && config.basicUsername) {
    const creds = Buffer.from(`${config.basicUsername}:${config.basicPassword || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
  }

  if (config.customHeaders && typeof config.customHeaders === 'object') {
    for (const [key, value] of Object.entries(config.customHeaders)) {
      if (key && value) headers[key] = String(value);
    }
  }

  return headers;
}

export function buildUrl(config: ApiConnectionConfig): string {
  let url = config.endpointUrl.trim();
  if (config.authType === 'apiKey' && config.apiKey && config.apiKeyLocation === 'query') {
    const separator = url.includes('?') ? '&' : '?';
    const paramName = config.apiKeyHeader || 'apiKey';
    url = `${url}${separator}${encodeURIComponent(paramName)}=${encodeURIComponent(config.apiKey.trim())}`;
  }
  return url;
}

export async function getAllConnections(): Promise<ApiConnectionConfig[]> {
  const list = (await getCollectionDocs('third_party_apis')) as ApiConnectionConfig[];
  
  const hasPostman = list.some(c => c.endpointUrl?.includes('c72fe02c-76af-4b77-b300-74aeb1abc7e8') || c.id === 'postman_mock_rfid_api');
  if (!hasPostman) {
    const postmanMock: ApiConnectionConfig = {
      id: 'postman_mock_rfid_api',
      name: 'Postman Mock RFID Telemetry Feed',
      description: 'Live Postman Mock Server for GAO People Tracking RFID telemetry stream',
      endpointUrl: 'https://c72fe02c-76af-4b77-b300-74aeb1abc7e8.mock.pstmn.io/api/GetTagsInRealtime',
      method: 'GET',
      authType: 'none',
      pollingEnabled: true,
      pollingIntervalSeconds: 10,
      dataMapping: {
        tagIdField: 'TagID',
        locationField: 'LocationName',
        timestampField: 'Timestamp',
        nameField: 'FirstName',
        rssiField: 'rssi'
      },
      lastStatus: 'IDLE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await upsertDoc('third_party_apis', postmanMock);
      list.push(postmanMock);
    } catch {}
  }

  return list;
}

export async function getConnectionById(id: string): Promise<ApiConnectionConfig | null> {
  const list = await getAllConnections();
  return list.find(c => c.id === id) || null;
}

export async function saveConnection(config: ApiConnectionConfig): Promise<void> {
  await upsertDoc('third_party_apis', config);
}

export async function deleteConnection(id: string): Promise<void> {
  await deleteDocById('third_party_apis', id);
}
