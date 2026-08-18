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
  const list = await getCollectionDocs('third_party_apis');
  return list as ApiConnectionConfig[];
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
