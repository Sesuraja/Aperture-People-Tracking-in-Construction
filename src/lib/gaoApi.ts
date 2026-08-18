export const DEFAULT_HOST = (typeof window !== 'undefined' && localStorage.getItem('gao_api_url'))
  ? localStorage.getItem('gao_api_url')!
  : 'https://mpf7722fc2649235f056.free.beeceptor.com';

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
}

// Fallback data used only when both demo API and real API are unavailable
const FALLBACK_HISTORY_RECORDS: HistoryRecord[] = [
  { TagID: "HH-1092", FirstName: "Marcus", LastName: "Vance", LocationName: "Site Office & Welfare Container", EnterTimeStr: new Date(Date.now() - 3600000 * 2).toISOString(), LeaveTimeStr: new Date(Date.now() - 3600000 * 1).toISOString(), Duration: 60 },
  { TagID: "HH-2041", FirstName: "Elena", LastName: "Rostova", LocationName: "Structure & Scaffolding (L1-L4)", EnterTimeStr: new Date(Date.now() - 3600000 * 3).toISOString(), LeaveTimeStr: new Date(Date.now() - 3600000 * 1.5).toISOString(), Duration: 90 },
  { TagID: "HH-3309", FirstName: "David", LastName: "Kim", LocationName: "Excavation & Foundation Pit", EnterTimeStr: new Date(Date.now() - 3600000 * 4).toISOString(), LeaveTimeStr: new Date(Date.now() - 3600000 * 2).toISOString(), Duration: 120 },
  { TagID: "HH-4820", FirstName: "Sarah", LastName: "Jenkins", LocationName: "Gate 1 / Main Access Gate", EnterTimeStr: new Date(Date.now() - 3600000 * 5).toISOString(), LeaveTimeStr: new Date(Date.now() - 3600000 * 3).toISOString(), Duration: 120 },
  { TagID: "HH-5112", FirstName: "Carlos", LastName: "Mendez", LocationName: "Heavy Crane & Exclusion Area", EnterTimeStr: new Date(Date.now() - 3600000 * 1).toISOString(), LeaveTimeStr: new Date(Date.now() - 3600000 * 0.5).toISOString(), Duration: 30 },
];

const FALLBACK_REALTIME_TAGS: RealtimeTag[] = [
  { TagID: "HH-1092", Timestamp: new Date().toISOString(), Location: "Site Office & Welfare Container", LocationName: "Site Office & Welfare Container" },
  { TagID: "HH-2041", Timestamp: new Date().toISOString(), Location: "Structure & Scaffolding (L1-L4)", LocationName: "Structure & Scaffolding (L1-L4)" },
  { TagID: "HH-3309", Timestamp: new Date().toISOString(), Location: "Excavation & Foundation Pit", LocationName: "Excavation & Foundation Pit" },
  { TagID: "HH-4820", Timestamp: new Date().toISOString(), Location: "Gate 1 / Main Access Gate", LocationName: "Gate 1 / Main Access Gate" },
  { TagID: "HH-5112", Timestamp: new Date().toISOString(), Location: "Heavy Crane & Exclusion Area", LocationName: "Heavy Crane & Exclusion Area" },
];

class GaoApi {
  private host: string;

  constructor(host: string = DEFAULT_HOST) {
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

  getProxyHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (typeof window !== 'undefined') {
      const targetHost = localStorage.getItem('gao_api_url');
      if (targetHost) headers['x-gao-target-host'] = targetHost;
    }
    return headers;
  }

  /**
   * 1. GET /api/GetHistoryTotalCount
   * In demo mode: fetches count from MongoDB via /api/demo/history/count
   * In real mode: queries the real RFID hardware backend
   */
  async getHistoryTotalCount(): Promise<number> {
    const isDemo = typeof window !== 'undefined' && localStorage.getItem('gao_app_mode') === 'demo';

    if (isDemo) {
      try {
        const response = await fetch('/api/demo/history/count', {
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          return typeof data.totalCount === 'number' ? data.totalCount : (typeof data.count === 'number' ? data.count : FALLBACK_HISTORY_RECORDS.length);
        }
      } catch (err) {
        console.warn('[gaoApi] Demo history count API unavailable, using fallback:', err);
      }
      return FALLBACK_HISTORY_RECORDS.length;
    }

    const response = await fetch('/api/GetHistoryTotalCount', {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to fetch history count: ${response.status} ${errText}`);
    }

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
  }

  /**
   * 2. GET /api/GetHistoryRecords/{skip}/{take}
   * In demo mode: fetches paginated records from MongoDB via /api/demo/history/records
   * In real mode: queries the real RFID hardware backend
   */
  async getHistoryRecords(skip: number, take: number): Promise<HistoryRecord[]> {
    const isDemo = typeof window !== 'undefined' && localStorage.getItem('gao_app_mode') === 'demo';

    if (isDemo) {
      try {
        const response = await fetch(`/api/demo/history/records?skip=${skip}&take=${take}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            return data;
          }
        }
      } catch (err) {
        console.warn('[gaoApi] Demo history records API unavailable, using fallback:', err);
      }
      // Client-side fallback if API not ready yet
      return FALLBACK_HISTORY_RECORDS.slice(skip, skip + take);
    }

    const response = await fetch(`/api/GetHistoryRecords/${skip}/${take}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to fetch history records: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  /**
   * 3. GET /api/GetTagsInRealtime
   * In demo mode: fetches live tags from MongoDB via /api/demo/realtime
   * In real mode: queries the real RFID hardware backend
   */
  async getTagsInRealtime(): Promise<RealtimeTag[]> {
    const isDemo = typeof window !== 'undefined' && localStorage.getItem('gao_app_mode') === 'demo';

    if (isDemo) {
      try {
        const response = await fetch('/api/demo/realtime', {
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            // Normalize to RealtimeTag format
            return data.map((tag: any) => ({
              TagID: tag.TagID || tag.tagId || tag.id || '',
              Timestamp: tag.Timestamp || tag.timestamp || new Date().toISOString(),
              Location: tag.Location || tag.LocationName || tag.location || '',
              LocationName: tag.LocationName || tag.Location || tag.location || '',
              personName: tag.personName || `${tag.FirstName || ''} ${tag.LastName || ''}`.trim() || undefined,
              personId: tag.personId || tag.id || undefined,
              zoneId: tag.zoneId || undefined,
              zoneName: tag.zoneName || tag.Location || tag.LocationName || undefined,
              rssi: typeof tag.rssi === 'number' ? tag.rssi : -65,
              readerId: tag.readerId || undefined,
            }));
          }
        }
      } catch (err) {
        console.warn('[gaoApi] Demo realtime API unavailable, using fallback:', err);
      }
      // Update timestamps on fallback data so they appear live
      const nowStr = new Date().toISOString();
      return FALLBACK_REALTIME_TAGS.map(t => ({ ...t, Timestamp: nowStr }));
    }

    const response = await fetch('/api/GetTagsInRealtime', {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Real-time tags request failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }
}

export const gaoApi = new GaoApi();
