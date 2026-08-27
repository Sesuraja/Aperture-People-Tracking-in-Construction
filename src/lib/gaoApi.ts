export const DEFAULT_HOST = '';

export interface HistoryRecord {
  TagID: string;
  FirstName: string;
  LastName: string;
  LocationName: string;
  EnterTime?: string;
  EnterTimeStr?: string;
  LeaveTime?: string;
  LeaveTimeStr?: string;
  Duration: number;
}

export interface RealtimeTag {
  TagID: string;
  Timestamp: string;
  Location: string;
  LocationName?: string;
  personName?: string;
  personId?: string | null;
  zoneId?: string;
  zoneName?: string;
  x?: number;
  y?: number;
  rssi?: number;
  readerId?: string;
  antennaId?: number;
  role?: string;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('gao_jwt_token') || 'demo';
    headers['Authorization'] = `Bearer ${token}`;
    const targetHost = localStorage.getItem('gao_api_url');
    if (targetHost) headers['x-gao-target-host'] = targetHost;
  }
  return headers;
}

class GaoApi {
  private host: string;

  constructor(host: string = '') {
    this.host = host;
  }

  setHost(host: string) {
    this.host = host.replace(/\/$/, '');
    if (typeof window !== 'undefined') {
      localStorage.setItem('gao_api_url', this.host);
    }
  }

  getHost() {
    return this.host;
  }

  /**
   * 1. GET /api/GetHistoryTotalCount
   */
  async getHistoryTotalCount(): Promise<number> {
    try {
      const response = await fetch('/api/GetHistoryTotalCount', {
        headers: getAuthHeaders()
      });

      if (!response.ok) return 0;
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (typeof data === 'number') return data;
        if (data && typeof data.totalCount === 'number') return data.totalCount;
        if (data && typeof data.count === 'number') return data.count;
      } catch {
        const num = parseInt(text.trim(), 10);
        if (!isNaN(num)) return num;
      }
      return 0;
    } catch (err) {
      console.warn('[gaoApi] getHistoryTotalCount error:', err);
      return 0;
    }
  }

  /**
   * 2. GET /api/GetHistoryRecords/{skip}/{take}
   */
  async getHistoryRecords(skip: number, take: number): Promise<HistoryRecord[]> {
    try {
      const response = await fetch(`/api/GetHistoryRecords/${skip}/${take}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (err) {
      console.warn('[gaoApi] getHistoryRecords error:', err);
      return [];
    }
  }

  /**
   * 3. GET /api/GetTagsInRealtime
   */
  async getTagsInRealtime(): Promise<RealtimeTag[]> {
    try {
      const response = await fetch('/api/GetTagsInRealtime', {
        headers: getAuthHeaders()
      });

      if (!response.ok) return [];
      const data = await response.json();
      const list = Array.isArray(data) ? data : (data?.data || []);
      
      return list.map((tag: any) => ({
        TagID: tag.TagID || tag.tagId || tag.id || '',
        Timestamp: tag.Timestamp || tag.timestamp || new Date().toISOString(),
        Location: tag.Location || tag.LocationName || tag.location || 'Main Facility Perimeter',
        LocationName: tag.LocationName || tag.Location || tag.location || 'Main Facility Perimeter',
        personName: tag.personName || `${tag.FirstName || ''} ${tag.LastName || ''}`.trim() || undefined,
        personId: tag.personId || tag.id || undefined,
        zoneId: tag.zoneId || undefined,
        zoneName: tag.zoneName || tag.Location || tag.LocationName || 'Main Facility Perimeter',
        rssi: typeof tag.rssi === 'number' ? tag.rssi : -60,
        readerId: tag.readerId || undefined,
        antennaId: tag.antennaId || undefined,
        role: tag.role || 'Personnel'
      }));
    } catch (err) {
      console.warn('[gaoApi] getTagsInRealtime error:', err);
      return [];
    }
  }
}

export const gaoApi = new GaoApi();
