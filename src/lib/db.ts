/**
 * Aperture MongoDB Client SDK
 * Direct REST API client connected to MongoDB persistence endpoints (/api/data/*, /api/mongodb/*).
 * All collections and documents persist to MongoDB Atlas.
 */

let _mongoConnectedState = true;

if (typeof window !== 'undefined') {
  const checkMongoStatus = async () => {
    try {
      const res = await fetch('/api/mongodb/status?quick=true');
      if (res.ok) {
        const data = await res.json();
        _mongoConnectedState = Boolean(data.connected);
      }
    } catch {}
  };
  checkMongoStatus();
  // Relaxed background check (every 60s instead of aggressive 10s)
  setInterval(checkMongoStatus, 60000);
}

export function isMongoActive(): boolean {
  return _mongoConnectedState;
}

export const db = { name: 'mongodb' };

export function serverTimestamp(): string {
  return new Date().toISOString();
}

function getRefInfo(ref: any): { colName: string; docId?: string } {
  if (!ref) return { colName: 'unknown' };
  if (typeof ref === 'string') return { colName: ref };
  if (ref.col) return { colName: ref.col, docId: ref.id };
  if (ref.path) {
    const parts = ref.path.split('/').filter(Boolean);
    if (parts.length === 1) return { colName: parts[0] };
    if (parts.length >= 2) return { colName: parts[0], docId: parts[parts.length - 1] };
  }
  return { colName: ref.id || 'unknown' };
}

export function collection(_dbInstance: any, pathName: string) {
  return { type: 'collection', path: pathName, col: pathName };
}

export function doc(_dbInstance: any, colName: string, docId?: string) {
  return { type: 'doc', col: colName, id: docId, path: docId ? `${colName}/${docId}` : colName };
}

export function query(colRef: any, ..._queryConstraints: any[]) {
  return colRef;
}

export function where(_field: string, _op: string, _val: any) {
  return { type: 'where' };
}

export function orderBy(_field: string, _dir?: 'asc' | 'desc') {
  return { type: 'orderBy' };
}

export function limit(value: number) {
  return { type: 'limit', value };
}

function createDocSnapshot(data: any) {
  if (!data) return { id: 'unknown', exists: () => false, data: () => null };
  const idValue = data.id || data._id || 'unknown';
  return {
    id: idValue,
    ref: { id: idValue },
    data: () => data,
    exists: () => true
  };
}

function createQuerySnapshot(docsData: any[]) {
  const docList = (docsData || []).map(d => createDocSnapshot(d));
  return {
    docs: docList,
    empty: docList.length === 0,
    size: docList.length,
    forEach: (callback: (d: any) => void) => {
      docList.forEach(callback);
    }
  };
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('gao_jwt_token') || localStorage.getItem('aperture_token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
  }
  if (!token) {
    token = 'demo';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// In-flight GET request deduplication cache to prevent identical parallel backend queries
const inFlightGetRequests = new Map<string, Promise<any>>();
// Client-side response cache (2.5 seconds) to prevent redundant queries across sibling components
const clientResponseCache = new Map<string, { data: any; cachedAt: number }>();
const CLIENT_CACHE_TTL_MS = 300;

async function safeJsonFetch(url: string, options?: RequestInit): Promise<any> {
  const method = (options?.method || 'GET').toUpperCase();
  if (method === 'GET') {
    const cached = clientResponseCache.get(url);
    if (cached && (Date.now() - cached.cachedAt < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }
    const existing = inFlightGetRequests.get(url);
    if (existing) return existing;
  }

  const customOptions = options || {};
  customOptions.headers = {
    ...getAuthHeaders(),
    ...(customOptions.headers || {})
  };

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, customOptions);
      if (!response.ok) return null;
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        if (method === 'GET') {
          clientResponseCache.set(url, { data: parsed, cachedAt: Date.now() });
        }
        return parsed;
      } catch {
        return null;
      }
    } catch {
      return null;
    } finally {
      if (method === 'GET') {
        setTimeout(() => inFlightGetRequests.delete(url), 1000);
      }
    }
  })();

  if (method === 'GET') {
    inFlightGetRequests.set(url, fetchPromise);
  }

  return fetchPromise;
}

function notifyDataUpdated(colName: string) {
  if (typeof window !== 'undefined') {
    for (const key of Array.from(clientResponseCache.keys())) {
      if (key.includes(`/api/data/${colName}`)) {
        clientResponseCache.delete(key);
      }
    }
    window.dispatchEvent(new CustomEvent('gao_data_updated', { detail: { colName } }));
  }
}

export async function setDoc(docRef: any, data: any, _options?: any): Promise<void> {
  const { colName, docId } = getRefInfo(docRef);
  if (!colName || !docId) return;
  try {
    const response = await fetch(`/api/data/${colName}/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    notifyDataUpdated(colName);
  } catch (err) {
    console.warn(`setDoc MongoDB API error for ${colName}/${docId}:`, err);
  }
}

export async function addDoc(colRef: any, data: any): Promise<any> {
  const { colName } = getRefInfo(colRef);
  const docId = data.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const itemToSave = { ...data, id: docId, createdAt: data.createdAt || new Date().toISOString() };

  try {
    const result = await safeJsonFetch(`/api/data/${colName}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(itemToSave)
    });
    notifyDataUpdated(colName);
    const savedDoc = result?.doc || result || itemToSave;
    return { id: docId, ...createDocSnapshot({ ...savedDoc, id: docId }) };
  } catch {
    return { id: docId, ...createDocSnapshot(itemToSave) };
  }
}

export async function getDoc(docRef: any): Promise<any> {
  const { colName, docId } = getRefInfo(docRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}/${encodeURIComponent(docId || '')}`);
    const docObj = result?.doc || (result?.id ? result : null);
    if (docObj) return createDocSnapshot(docObj);
  } catch {}

  return { id: docId || 'unknown', exists: () => false, data: () => null };
}

export async function getDocs(queryRef: any): Promise<any> {
  const { colName } = getRefInfo(queryRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}`);
    if (result && (Array.isArray(result) || Array.isArray(result?.data))) {
      const docsArray = Array.isArray(result) ? result : (result.data || []);
      return createQuerySnapshot(docsArray);
    }
  } catch {}

  return createQuerySnapshot([]);
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  return setDoc(docRef, data, { merge: true });
}

export async function deleteDoc(docRef: any): Promise<void> {
  const { colName, docId } = getRefInfo(docRef);
  if (!colName || !docId) return;
  try {
    await fetch(`/api/data/${colName}/${encodeURIComponent(docId)}`, { method: 'DELETE', headers: getAuthHeaders() });
    notifyDataUpdated(colName);
  } catch {}
}

export async function getCountFromServer(queryRef: any): Promise<any> {
  const { colName } = getRefInfo(queryRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}`);
    const docsArray = Array.isArray(result) ? result : (result?.data || []);
    return { data: () => ({ count: docsArray.length }) };
  } catch {}
  return { data: () => ({ count: 0 }) };
}

export function onSnapshot(ref: any, callback: (snapshot: any) => void, _errorCallback?: (error: any) => void): () => void {
  let active = true;
  const { colName, docId } = getRefInfo(ref);

  const poll = async () => {
    if (!active) return;
    try {
      if (docId) {
        const result = await safeJsonFetch(`/api/data/${colName}/${docId}`);
        if (active && result) {
          const docObj = result?.doc || (result?.id ? result : null);
          if (docObj) {
            callback(createDocSnapshot(docObj));
            return;
          }
        }
      } else {
        const result = await safeJsonFetch(`/api/data/${colName}`);
        if (active && result && (Array.isArray(result) || Array.isArray(result?.data))) {
          const docsArray = Array.isArray(result) ? result : (result.data || []);
          callback(createQuerySnapshot(docsArray));
          return;
        }
      }
    } catch {}
  };

  poll();
  // Efficient 30s background sync (immediate push updates occur via WebSocket and gao_data_updated events)
  const interval = setInterval(poll, 30000);

  // Listen to mutations for immediate event-driven update with 0 delay
  const handleDataUpdate = (e: any) => {
    if (!active) return;
    if (!e.detail || !e.detail.colName || e.detail.colName === colName) {
      for (const key of Array.from(clientResponseCache.keys())) {
        if (!e.detail?.colName || key.includes(`/api/data/${e.detail.colName}`)) {
          clientResponseCache.delete(key);
        }
      }
      poll();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('gao_data_updated', handleDataUpdate);
    window.addEventListener('gao_refresh_data', handleDataUpdate);
    window.addEventListener('gao_map_data_updated', handleDataUpdate);
  }

  return () => {
    active = false;
    clearInterval(interval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('gao_data_updated', handleDataUpdate);
      window.removeEventListener('gao_refresh_data', handleDataUpdate);
      window.removeEventListener('gao_map_data_updated', handleDataUpdate);
    }
  };
}
