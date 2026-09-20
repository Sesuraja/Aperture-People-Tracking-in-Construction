export const DEFAULT_HOST = '';

export interface HistoryRecord {
  TagID: string;
  FirstName: string;
  LastName: string;
  LocationName: string;
  Location?: string;
  EnterTime?: string;
  EnterTimeStr?: string;
  LeaveTime?: string;
  LeaveTimeStr?: string;
  Duration: number;
}

export interface RealtimeTag {
  TagID: string;
  tagId?: string;
  id?: string;
  Timestamp: string;
  EnterTime?: string;
  Location: string;
  LocationName?: string;
  personName?: string;
  personId?: string | null;
  FirstName?: string;
  LastName?: string;
  name?: string;
  zoneId?: string;
  zoneName?: string;
  zone?: string;
  x?: number;
  y?: number;
  rssi?: number;
  RSSI?: number;
  readerId?: string;
  antennaId?: number;
  AntennaID?: number;
  role?: string;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('gao_jwt_token') || localStorage.getItem('aperture_token') || localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/GetHistoryTotalCount', {
        headers: getAuthHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (typeof data === 'number' && data > 0) return data;
          if (data && typeof data.totalCount === 'number' && data.totalCount > 0) return data.totalCount;
          if (data && typeof data.count === 'number' && data.count > 0) return data.count;
        } catch {
          const num = parseInt(text.trim(), 10);
          if (!isNaN(num) && num > 0) return num;
        }
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn('[gaoApi] getHistoryTotalCount error:', err);
    }

    // High-performance fallback: query stats
    try {
      const fallbackRes = await fetch('/api/data/stats', {
        headers: getAuthHeaders()
      });
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        if (typeof fbData?.tag_history === 'number') return fbData.tag_history;
      }
    } catch {}

    return 0;
  }

  /**
   * 2. GET /api/GetHistoryRecords/{skip}/{take}
   */
  async getHistoryRecords(skip: number, take: number): Promise<HistoryRecord[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const tz = typeof window !== 'undefined' ? (localStorage.getItem('gao_system_timezone') || '') : '';
    const url = `/api/GetHistoryRecords/${skip}/${take}${tz ? `?timezone=${encodeURIComponent(tz)}` : ''}`;
    try {
      const response = await fetch(url, {
        headers: {
          ...getAuthHeaders(),
          ...(tz ? { 'X-Timezone': tz } : {})
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const records = Array.isArray(data) ? data : (data?.data || []);
        if (records.length > 0) return records;
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn('[gaoApi] Primary /api/GetHistoryRecords fetch error, falling back to MongoDB Atlas tag_history:', err);
    }

    // High-resiliency fallback: query MongoDB Atlas tag_history with bounded limit
    try {
      const queryLimit = Math.max(take, 100);
      const fallbackRes = await fetch(`/api/data/tag_history?limit=${queryLimit}`, {
        headers: getAuthHeaders()
      });
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        const fbRecords = Array.isArray(fbData) ? fbData : (fbData?.data || []);
        if (fbRecords.length > 0) {
          const sliced = fbRecords.slice(skip, skip + take);
          return sliced.map((r: any) => ({
            TagID: r.TagID || r.tagId || '',
            FirstName: r.FirstName || r.firstName || '',
            LastName: r.LastName || r.lastName || '',
            name: r.name || `${r.FirstName || ''} ${r.LastName || ''}`.trim() || undefined,
            role: r.role || 'Field Personnel',
            LocationName: r.LocationName || r.Location || r.location || 'Site Area',
            EnterTime: r.EnterTime || r.enterTime || new Date().toISOString(),
            LeaveTime: r.LeaveTime || r.leaveTime || 'ACTIVE',
            EnterTimeStr: r.EnterTimeStr || r.EnterTime,
            LeaveTimeStr: r.LeaveTimeStr || r.LeaveTime,
            Duration: typeof r.Duration === 'number' ? r.Duration : (parseFloat(r.Duration) || 0.5),
            durationMins: typeof r.durationMins === 'number' ? r.durationMins : 0.5
          }));
        }
      }
    } catch (fbErr) {
      console.warn('[gaoApi] Fallback tag_history fetch error:', fbErr);
    }

    return [];
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
