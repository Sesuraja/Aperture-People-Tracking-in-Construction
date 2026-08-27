/**
 * Aperture MongoDB Client SDK
 * Direct REST API client connected to MongoDB persistence endpoints (/api/data/*, /api/mongodb/*).
 * All collections and documents persist to MongoDB Atlas.
 */

let _mongoConnectedState = true;

if (typeof window !== 'undefined') {
  const checkMongoStatus = async () => {
    try {
      const res = await fetch('/api/mongodb/status');
      if (res.ok) {
        const data = await res.json();
        _mongoConnectedState = Boolean(data.connected);
      }
    } catch {}
  };
  checkMongoStatus();
  setInterval(checkMongoStatus, 10000);
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

export function collection(dbInstance: any, colName?: string): any {
  const actualColName = colName || (typeof dbInstance === 'string' ? dbInstance : dbInstance?.path) || 'unknown';
  return { type: 'collection', path: actualColName };
}

export function doc(dbInstanceOrColRef: any, colNameOrId: string, maybeId?: string): any {
  if (maybeId) return { type: 'doc', col: colNameOrId, id: maybeId };
  if (typeof dbInstanceOrColRef === 'string') return { type: 'doc', col: dbInstanceOrColRef, id: colNameOrId };
  if (dbInstanceOrColRef?.path) return { type: 'doc', col: dbInstanceOrColRef.path, id: colNameOrId };
  return { type: 'doc', col: colNameOrId || 'unknown', id: maybeId };
}

export function query(colRef: any, ..._constraints: any[]): any {
  return colRef;
}

export function orderBy(field: string, direction?: 'asc' | 'desc') {
  return { type: 'orderBy', field, direction: direction || 'asc' };
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
  let token = typeof window !== 'undefined' ? localStorage.getItem('gao_jwt_token') : null;
  if (!token) {
    token = 'demo';
  }
  headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function safeJsonFetch(url: string, options?: RequestInit): Promise<any> {
  const customOptions = options || {};
  customOptions.headers = {
    ...getAuthHeaders(),
    ...(customOptions.headers || {})
  };
  try {
    const response = await fetch(url, customOptions);
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function setDoc(docRef: any, data: any, _options?: any): Promise<void> {
  const { colName, docId } = getRefInfo(docRef);
  if (!colName || !docId) return;
  try {
    const response = await fetch(`/api/data/${colName}/${docId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    const savedDoc = result?.doc || result || itemToSave;
    return { id: docId, ...createDocSnapshot({ ...savedDoc, id: docId }) };
  } catch {
    return { id: docId, ...createDocSnapshot(itemToSave) };
  }
}

export async function getDoc(docRef: any): Promise<any> {
  const { colName, docId } = getRefInfo(docRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}/${docId}`);
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
    await fetch(`/api/data/${colName}/${docId}`, { method: 'DELETE', headers: getAuthHeaders() });
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
  const interval = setInterval(poll, 4000);

  return () => {
    active = false;
    clearInterval(interval);
  };
}
