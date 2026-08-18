export function isMongoActive(): boolean {
  return true;
}

export const db = { name: 'mongodb' };

export function serverTimestamp() {
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

function createMockDoc(data: any) {
  if (!data) return { id: 'unknown', exists: () => false, data: () => null };
  const idValue = data.id || data._id || 'unknown';
  
  const wrappedData = { ...data };
  Object.keys(wrappedData).forEach(key => {
    const val = wrappedData[key];
    // Strictly convert timestamp/createdAt/updatedAt fields to Firestore-compatible Timestamp objects if needed
    if (val && (key === 'timestamp' || key === 'createdAt' || key === 'updatedAt')) {
      if (typeof val === 'string') {
        const dateObj = new Date(val);
        if (!isNaN(dateObj.getTime())) {
          wrappedData[key] = {
            toDate: () => dateObj,
            seconds: Math.floor(dateObj.getTime() / 1000),
            nanoseconds: (dateObj.getTime() % 1000) * 1e6,
            toString: () => val,
            valueOf: () => dateObj.getTime()
          };
        }
      } else if (val instanceof Date) {
        wrappedData[key] = {
          toDate: () => val,
          seconds: Math.floor(val.getTime() / 1000),
          nanoseconds: (val.getTime() % 1000) * 1e6,
          toString: () => val.toISOString(),
          valueOf: () => val.getTime()
        };
      }
    }
  });

  return {
    id: idValue,
    ref: { id: idValue },
    data: () => wrappedData,
    exists: () => true
  };
}

function createMockSnapshot(docsData: any[]) {
  const mockDocs = (docsData || []).map(d => createMockDoc(d));
  return {
    docs: mockDocs,
    empty: mockDocs.length === 0,
    size: mockDocs.length,
    forEach: (callback: (d: any) => void) => {
      mockDocs.forEach(callback);
    }
  };
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

function getLocalCollection(colName: string): any[] {
  try {
    const raw = localStorage.getItem(`gao_db_${colName}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalCollection(colName: string, docs: any[]): void {
  try {
    localStorage.setItem(`gao_db_${colName}`, JSON.stringify(docs));
  } catch {}
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let token = localStorage.getItem('gao_jwt_token');
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

export async function addDoc(colRef: any, data: any): Promise<any> {
  const { colName } = getRefInfo(colRef);
  const docId = data.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const itemToSave = { ...data, id: docId, createdAt: data.createdAt || new Date().toISOString() };

  // Save to local cache immediately
  const currentDocs = getLocalCollection(colName);
  saveLocalCollection(colName, [itemToSave, ...currentDocs.filter(d => d.id !== docId)]);

  try {
    const result = await safeJsonFetch(`/api/data/${colName}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(itemToSave)
    });
    const savedDoc = result?.doc || result || itemToSave;
    return { id: docId, ...createMockDoc({ ...savedDoc, id: docId }) };
  } catch {
    return { id: docId, ...createMockDoc(itemToSave) };
  }
}

export async function getDoc(docRef: any): Promise<any> {
  const { colName, docId } = getRefInfo(docRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}/${docId}`);
    const docObj = result?.doc || (result?.id ? result : null);
    if (docObj) return createMockDoc(docObj);
  } catch {}

  const localDocs = getLocalCollection(colName);
  const found = localDocs.find(d => d.id === docId);
  if (found) return createMockDoc(found);

  return { id: docId || 'unknown', exists: () => false, data: () => null };
}

export async function getDocs(queryRef: any): Promise<any> {
  const { colName } = getRefInfo(queryRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}`);
    if (result && (Array.isArray(result) || Array.isArray(result?.data))) {
      const docsArray = Array.isArray(result) ? result : (result.data || []);
      saveLocalCollection(colName, docsArray);
      return createMockSnapshot(docsArray);
    }
  } catch {}

  const localDocs = getLocalCollection(colName);
  return createMockSnapshot(localDocs);
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  return setDoc(docRef, data, { merge: true });
}

export async function deleteDoc(docRef: any): Promise<void> {
  const { colName, docId } = getRefInfo(docRef);
  const localDocs = getLocalCollection(colName);
  saveLocalCollection(colName, localDocs.filter(d => d.id !== docId));
  try {
    await fetch(`/api/data/${colName}/${docId}`, { method: 'DELETE', headers: getAuthHeaders() });
  } catch {}
}

export async function getCountFromServer(queryRef: any): Promise<any> {
  const { colName } = getRefInfo(queryRef);
  try {
    const result = await safeJsonFetch(`/api/data/${colName}`);
    const docsArray = Array.isArray(result) ? result : (result?.data || []);
    if (docsArray.length > 0) {
      return { data: () => ({ count: docsArray.length }) };
    }
  } catch {}
  const localDocs = getLocalCollection(colName);
  return { data: () => ({ count: localDocs.length }) };
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
            callback(createMockDoc(docObj));
            return;
          }
        }
        const localDocs = getLocalCollection(colName);
        const found = localDocs.find(d => d.id === docId);
        if (active && found) {
          callback(createMockDoc(found));
        }
      } else {
        const result = await safeJsonFetch(`/api/data/${colName}`);
        if (active && result && (Array.isArray(result) || Array.isArray(result?.data))) {
          const docsArray = Array.isArray(result) ? result : (result.data || []);
          saveLocalCollection(colName, docsArray);
          callback(createMockSnapshot(docsArray));
          return;
        }
        const localDocs = getLocalCollection(colName);
        if (active) {
          callback(createMockSnapshot(localDocs));
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




