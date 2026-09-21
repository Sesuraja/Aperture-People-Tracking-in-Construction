/**
 * Movement Analytics Engine for Aperture People Tracking
 * 
 * Strict data adherence: Operates ONLY on data returned by people-tracking API:
 * - TagID
 * - FirstName
 * - LastName
 * - LocationName
 * - EnterTime
 * - LeaveTime
 * - Duration
 * 
 * Never invents GPS coordinates, equipment status, machine failure, camera feeds,
 * temperature, injuries, employee roles, access permissions, or safety violations.
 */

export interface RawMovementRecord {
  TagID?: string;
  tagId?: string;
  FirstName?: string;
  firstName?: string;
  LastName?: string;
  lastName?: string;
  name?: string;
  LocationName?: string;
  Location?: string;
  location?: string;
  EnterTime?: string;
  EnterTimeStr?: string;
  enterTime?: string;
  LeaveTime?: string;
  LeaveTimeStr?: string;
  leaveTime?: string;
  Duration?: number | string;
  duration?: number | string;
  durationMins?: number | string;
  timestamp?: string;
}

export interface NormalizedMovementEvent {
  id: string;
  tagId: string;
  firstName: string;
  lastName: string;
  personName: string;
  locationName: string;
  enterTime: string;
  leaveTime: string;
  enterDate: Date;
  leaveDate: Date | null;
  durationMinutes: number;
  durationSeconds: number;
  durationFormatted: string;
  isOngoing: boolean;
  hourOfDay: number; // 0 - 23
  dateString: string; // YYYY-MM-DD
}

export interface AnalyticsKPIs {
  totalEvents: number;
  uniquePeople: number;
  activeZones: number;
  averageDurationMinutes: number;
  averageDurationFormatted: string;
  totalDwellMinutes: number;
  totalDwellFormatted: string;
  repeatVisitors: number; // People appearing >= 2 times in period
}

export interface HourlyTrafficData {
  hour: number;
  hourLabel: string; // "00:00", "01:00", ...
  eventCount: number;
  uniquePeople: number;
  avgDurationMinutes: number;
  totalDwellMinutes: number;
}

export interface DailyTrafficData {
  date: string;
  dateLabel: string; // "YYYY-MM-DD"
  eventCount: number;
  uniquePeople: number;
  avgDurationMinutes: number;
  totalDwellMinutes: number;
}

export interface ZoneAnalyticsSummary {
  zone: string;
  totalVisits: number;
  uniquePeople: number;
  avgDurationMinutes: number;
  avgDurationFormatted: string;
  minDurationMinutes: number;
  minDurationFormatted: string;
  maxDurationMinutes: number;
  maxDurationFormatted: string;
  totalDwellMinutes: number;
  totalDwellFormatted: string;
  repeatVisitors: number; // People who visited this zone >= 2 times
  firstActivity: string;
  lastActivity: string;
}

export interface PersonAnalyticsSummary {
  tagId: string;
  name: string;
  totalVisits: number;
  zonesVisited: string[];
  distinctZonesCount: number;
  avgDurationMinutes: number;
  avgDurationFormatted: string;
  minDurationMinutes: number;
  minDurationFormatted: string;
  maxDurationMinutes: number;
  maxDurationFormatted: string;
  totalDwellMinutes: number;
  totalDwellFormatted: string;
  firstActivity: string;
  lastActivity: string;
}

export interface DurationDistributionBucket {
  range: string;
  label: string;
  count: number;
  percentage: number;
}

export interface DurationAnalytics {
  avgDurationMinutes: number;
  avgDurationFormatted: string;
  medianDurationMinutes: number;
  medianDurationFormatted: string;
  minDurationMinutes: number;
  minDurationFormatted: string;
  maxDurationMinutes: number;
  maxDurationFormatted: string;
  distribution: DurationDistributionBucket[];
  shortestVisits: NormalizedMovementEvent[];
  longestVisits: NormalizedMovementEvent[];
}

export interface AIObservation {
  id: string;
  category: 'zone_traffic' | 'dwell_trend' | 'peak_hours' | 'mobility' | 'repeat_cadence';
  metric: string;
  currentValue: string;
  baselineValue: string;
  change: string; // e.g., "+41%", "-18%", "3.2×"
  confidence: number; // 0 - 100
  explanation: string;
  insufficientData?: boolean;
}

export interface AnalyticsContextOptions {
  industry?: string;
  subIndustry?: string;
  zoneLabel?: string;
  personnelSingular?: string;
  personnelPlural?: string;
  siteLabel?: string;
}

/**
 * Parses timestamp string or Date object into valid Date, returning null on invalid input.
 */
export function parseDate(raw?: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'ACTIVE' || trimmed === 'Active') return null;
    const isoLike = trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed;
    const d = new Date(isoLike);
    if (!isNaN(d.getTime())) return d;
    const direct = new Date(trimmed);
    if (!isNaN(direct.getTime())) return direct;
  }
  return null;
}

/**
 * Format a Date or timestamp string nicely into "YYYY-MM-DD HH:mm:ss"
 */
export function formatDateTime(d?: Date | string | null): string {
  if (!d) return 'Active / In Zone';
  const dateObj = typeof d === 'string' ? parseDate(d) : d;
  if (!dateObj || isNaN(dateObj.getTime())) return typeof d === 'string' ? d : 'Unknown';
  
  const YYYY = dateObj.getFullYear();
  const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
  const DD = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  const ss = String(dateObj.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

/**
 * Formats duration in minutes into a concise string (e.g. "7s", "2m 14s", "1h 22m", "2d 4h").
 */
export function formatDurationHuman(durationMinutes: number): string {
  if (durationMinutes <= 0) return '0s';
  const totalSeconds = Math.round(durationMinutes * 60);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (totalMinutes < 60) {
    return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Accurately calculates duration in minutes and seconds from raw API fields.
 * Validates timestamp difference (LeaveTime - EnterTime) first, then converts numeric Duration.
 */
export function calculateDuration(
  enterDate: Date | null,
  leaveDate: Date | null,
  rawDuration?: number | string
): { durationMinutes: number; durationSeconds: number } {
  // 1. If both timestamps are valid and leave >= enter, compute exact duration
  if (enterDate && leaveDate && leaveDate.getTime() >= enterDate.getTime()) {
    const diffMs = leaveDate.getTime() - enterDate.getTime();
    const durationSeconds = Math.max(0, Math.round(diffMs / 1000));
    const durationMinutes = Math.round((diffMs / 60000) * 100) / 100;
    return { durationMinutes, durationSeconds };
  }

  // 2. Parse numeric Duration field from API
  if (rawDuration !== undefined && rawDuration !== null) {
    const num = typeof rawDuration === 'number' ? rawDuration : parseFloat(String(rawDuration));
    if (!isNaN(num) && num > 0) {
      // In the GAO People Tracking API, small decimals (e.g. 0.002098) are decimal hours:
      // 0.002098 hours * 60 = 0.12588 mins (~7.55 seconds).
      if (num < 1.0) {
        const durationMinutes = Math.round(num * 60 * 100) / 100;
        const durationSeconds = Math.round(num * 3600);
        return { durationMinutes, durationSeconds };
      }
      // If num >= 1.0, treat as minutes
      const durationMinutes = Math.round(num * 100) / 100;
      const durationSeconds = Math.round(num * 60);
      return { durationMinutes, durationSeconds };
    }
  }

  // Ongoing or instant swipe
  return { durationMinutes: 0.1, durationSeconds: 6 };
}

/**
 * Resolves accurate human employee name across raw API record fields and registered workforce registry.
 */
export function resolvePersonName(
  tagId: string,
  rec?: RawMovementRecord | null,
  peopleRegistry?: any[] | Map<string, any> | null,
  fallbackPersonnelSingular: string = 'Personnel'
): string {
  const cleanTag = String(tagId || '').trim();
  const cleanTagLower = cleanTag.toLowerCase();

  // 1. Look up in registered people registry if available
  let matchedPerson: any = null;
  if (peopleRegistry) {
    if (peopleRegistry instanceof Map) {
      matchedPerson = peopleRegistry.get(cleanTag) || 
                      peopleRegistry.get(cleanTagLower) ||
                      peopleRegistry.get(cleanTag.toUpperCase());
      if (!matchedPerson) {
        for (const val of peopleRegistry.values()) {
          if (!val) continue;
          const vTag = String(val.id || val.tagId || val.TagID || val.hardhatTagId || val.epc || '').toLowerCase();
          if (vTag && vTag === cleanTagLower) {
            matchedPerson = val;
            break;
          }
        }
      }
    } else if (Array.isArray(peopleRegistry)) {
      matchedPerson = peopleRegistry.find(p => {
        if (!p) return false;
        const pTag = String(p.id || p.tagId || p.TagID || p.hardhatTagId || p.epc || '').toLowerCase();
        return pTag && pTag === cleanTagLower;
      });
    }
  }

  // 2. Check matched registered person for first & last names
  const regFirst = String(matchedPerson?.firstName || matchedPerson?.FirstName || '').trim();
  const regLast = String(matchedPerson?.lastName || matchedPerson?.LastName || '').trim();
  if (regFirst && regLast) {
    return `${regFirst} ${regLast}`;
  }

  // 3. Check record's own FirstName and LastName fields
  const recFirst = String(rec?.FirstName || rec?.firstName || '').trim();
  const recLast = String(rec?.LastName || rec?.lastName || '').trim();
  if (recFirst && recLast) {
    return `${recFirst} ${recLast}`;
  }

  // 4. Check genuine registered full name or role name
  if (matchedPerson) {
    const regName = String(matchedPerson.name || matchedPerson.personName || matchedPerson.workerName || matchedPerson.fullName || '').trim();
    if (regName && !regName.startsWith('Personnel') && !regName.startsWith('Worker') && regName !== 'Unknown') {
      return regName;
    }
    if (regFirst) return regFirst;
  }

  // 5. Check record's other name fields
  if (rec?.name && typeof rec.name === 'string' && rec.name.trim()) {
    const n = rec.name.trim();
    if (!n.startsWith('Personnel TAG_') && !n.startsWith('Worker TAG_') && !n.startsWith('Tag ') && n !== 'Unknown' && n !== 'Personnel' && n !== 'Worker') {
      return n;
    }
  }

  if (recFirst) return recFirst;
  if (recLast) return recLast;

  // 6. Clean fallback with short tag ID
  const shortTag = cleanTag.length > 8 ? cleanTag.slice(-6) : cleanTag;
  return shortTag ? `${fallbackPersonnelSingular} (${shortTag})` : fallbackPersonnelSingular;
}

/**
 * Normalizes a single raw API movement record.
 */
export function normalizeRecord(
  rec: RawMovementRecord, 
  index: number = 0,
  peopleRegistry?: any[] | Map<string, any> | null,
  options?: AnalyticsContextOptions
): NormalizedMovementEvent {
  const tagId = String(rec.TagID || rec.tagId || `TAG_${index}`).trim();
  const personName = resolvePersonName(tagId, rec, peopleRegistry, options?.personnelSingular || 'Personnel');

  const nameParts = personName.split(' ');
  const firstName = String(rec.FirstName || rec.firstName || (nameParts.length > 1 ? nameParts[0] : personName)).trim();
  const lastName = String(rec.LastName || rec.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '')).trim();

  const locationName = String(
    rec.LocationName || rec.Location || rec.location || 'Site Area'
  ).trim();

  const enterRaw = rec.EnterTime || rec.EnterTimeStr || rec.enterTime || rec.timestamp || new Date().toISOString();
  const leaveRaw = rec.LeaveTime || rec.LeaveTimeStr || rec.leaveTime || '';

  const enterDate = parseDate(enterRaw) || new Date();
  const isOngoing = !leaveRaw || leaveRaw === 'ACTIVE' || leaveRaw === 'Active';
  const leaveDate = isOngoing ? null : parseDate(leaveRaw);

  const { durationMinutes, durationSeconds } = calculateDuration(
    enterDate,
    leaveDate,
    rec.Duration ?? rec.duration ?? rec.durationMins
  );

  const durationFormatted = formatDurationHuman(durationMinutes);
  const enterTime = formatDateTime(enterDate);
  const leaveTime = leaveDate ? formatDateTime(leaveDate) : 'Active';

  const YYYY = enterDate.getFullYear();
  const MM = String(enterDate.getMonth() + 1).padStart(2, '0');
  const DD = String(enterDate.getDate()).padStart(2, '0');
  const dateString = `${YYYY}-${MM}-${DD}`;

  return {
    id: `mv_${tagId}_${enterDate.getTime()}_${index}`,
    tagId,
    firstName,
    lastName,
    personName,
    locationName,
    enterTime,
    leaveTime,
    enterDate,
    leaveDate,
    durationMinutes,
    durationSeconds,
    durationFormatted,
    isOngoing,
    hourOfDay: enterDate.getHours(),
    dateString
  };
}

/**
 * Normalizes an array of raw API movement records.
 */
export function normalizeRecords(
  records: RawMovementRecord[],
  peopleRegistry?: any[] | Map<string, any> | null,
  options?: AnalyticsContextOptions
): NormalizedMovementEvent[] {
  if (!Array.isArray(records)) return [];
  return records
    .map((r, idx) => normalizeRecord(r, idx, peopleRegistry, options))
    .sort((a, b) => b.enterDate.getTime() - a.enterDate.getTime());
}

/**
 * Calculates dynamic KPI metrics from normalized events.
 */
export function calculateKPIs(events: NormalizedMovementEvent[]): AnalyticsKPIs {
  const totalEvents = events.length;
  if (totalEvents === 0) {
    return {
      totalEvents: 0,
      uniquePeople: 0,
      activeZones: 0,
      averageDurationMinutes: 0,
      averageDurationFormatted: '0s',
      totalDwellMinutes: 0,
      totalDwellFormatted: '0s',
      repeatVisitors: 0
    };
  }

  const tagCounts = new Map<string, number>();
  const zoneSet = new Set<string>();
  let totalDwell = 0;

  for (const evt of events) {
    tagCounts.set(evt.tagId, (tagCounts.get(evt.tagId) || 0) + 1);
    zoneSet.add(evt.locationName);
    totalDwell += evt.durationMinutes;
  }

  // Repeat visitors: people with >= 2 visits
  let repeatVisitors = 0;
  for (const count of tagCounts.values()) {
    if (count >= 2) repeatVisitors++;
  }

  const avgDuration = totalEvents > 0 ? totalDwell / totalEvents : 0;

  return {
    totalEvents,
    uniquePeople: tagCounts.size,
    activeZones: zoneSet.size,
    averageDurationMinutes: Math.round(avgDuration * 100) / 100,
    averageDurationFormatted: formatDurationHuman(avgDuration),
    totalDwellMinutes: Math.round(totalDwell * 100) / 100,
    totalDwellFormatted: formatDurationHuman(totalDwell),
    repeatVisitors
  };
}

/**
 * Groups events by hour of the day (00:00 - 23:00) using EnterTime.
 */
export function calculateHourlyTraffic(events: NormalizedMovementEvent[]): HourlyTrafficData[] {
  const hours: HourlyTrafficData[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    hourLabel: `${String(h).padStart(2, '0')}:00`,
    eventCount: 0,
    uniquePeople: 0,
    avgDurationMinutes: 0,
    totalDwellMinutes: 0
  }));

  const hourPeopleSets = Array.from({ length: 24 }, () => new Set<string>());

  for (const evt of events) {
    const h = evt.hourOfDay;
    if (h >= 0 && h < 24) {
      hours[h].eventCount++;
      hours[h].totalDwellMinutes += evt.durationMinutes;
      hourPeopleSets[h].add(evt.tagId);
    }
  }

  for (let h = 0; h < 24; h++) {
    hours[h].uniquePeople = hourPeopleSets[h].size;
    hours[h].totalDwellMinutes = Math.round(hours[h].totalDwellMinutes * 10) / 10;
    hours[h].avgDurationMinutes = hours[h].eventCount > 0
      ? Math.round((hours[h].totalDwellMinutes / hours[h].eventCount) * 10) / 10
      : 0;
  }

  return hours;
}

/**
 * Groups events by day (YYYY-MM-DD) using EnterTime.
 */
export function calculateDailyTraffic(events: NormalizedMovementEvent[]): DailyTrafficData[] {
  const dayMap = new Map<string, { events: NormalizedMovementEvent[]; peopleSet: Set<string>; dwell: number }>();

  for (const evt of events) {
    const date = evt.dateString;
    const entry = dayMap.get(date) || { events: [], peopleSet: new Set<string>(), dwell: 0 };
    entry.events.push(evt);
    entry.peopleSet.add(evt.tagId);
    entry.dwell += evt.durationMinutes;
    dayMap.set(date, entry);
  }

  const sortedDates = Array.from(dayMap.keys()).sort();

  return sortedDates.map(date => {
    const entry = dayMap.get(date)!;
    const count = entry.events.length;
    const dwell = Math.round(entry.dwell * 10) / 10;
    const avg = count > 0 ? Math.round((dwell / count) * 10) / 10 : 0;
    return {
      date,
      dateLabel: date,
      eventCount: count,
      uniquePeople: entry.peopleSet.size,
      avgDurationMinutes: avg,
      totalDwellMinutes: dwell
    };
  });
}

/**
 * Calculates comprehensive analytics for each distinct LocationName (Zone).
 */
export function calculateZoneAnalytics(events: NormalizedMovementEvent[]): ZoneAnalyticsSummary[] {
  const zoneMap = new Map<string, NormalizedMovementEvent[]>();

  for (const evt of events) {
    const list = zoneMap.get(evt.locationName) || [];
    list.push(evt);
    zoneMap.set(evt.locationName, list);
  }

  const results: ZoneAnalyticsSummary[] = [];

  for (const [zone, zoneEvents] of zoneMap.entries()) {
    const totalVisits = zoneEvents.length;
    const peopleCounts = new Map<string, number>();
    let totalDwell = 0;
    let minDur = Infinity;
    let maxDur = -Infinity;
    let earliestTime = zoneEvents[0].enterTime;
    let latestTime = zoneEvents[0].enterTime;

    for (const e of zoneEvents) {
      peopleCounts.set(e.tagId, (peopleCounts.get(e.tagId) || 0) + 1);
      totalDwell += e.durationMinutes;
      if (e.durationMinutes < minDur) minDur = e.durationMinutes;
      if (e.durationMinutes > maxDur) maxDur = e.durationMinutes;
      if (e.enterTime < earliestTime) earliestTime = e.enterTime;
      if (e.enterTime > latestTime) latestTime = e.enterTime;
    }

    let repeatVisitors = 0;
    for (const c of peopleCounts.values()) {
      if (c >= 2) repeatVisitors++;
    }

    const avgDur = totalVisits > 0 ? totalDwell / totalVisits : 0;
    if (minDur === Infinity) minDur = 0;
    if (maxDur === -Infinity) maxDur = 0;

    results.push({
      zone,
      totalVisits,
      uniquePeople: peopleCounts.size,
      avgDurationMinutes: Math.round(avgDur * 100) / 100,
      avgDurationFormatted: formatDurationHuman(avgDur),
      minDurationMinutes: Math.round(minDur * 100) / 100,
      minDurationFormatted: formatDurationHuman(minDur),
      maxDurationMinutes: Math.round(maxDur * 100) / 100,
      maxDurationFormatted: formatDurationHuman(maxDur),
      totalDwellMinutes: Math.round(totalDwell * 100) / 100,
      totalDwellFormatted: formatDurationHuman(totalDwell),
      repeatVisitors,
      firstActivity: earliestTime,
      lastActivity: latestTime
    });
  }

  return results.sort((a, b) => b.totalVisits - a.totalVisits);
}

/**
 * Calculates comprehensive analytics for each distinct TagID (Person).
 */
export function calculatePersonAnalytics(events: NormalizedMovementEvent[]): PersonAnalyticsSummary[] {
  const personMap = new Map<string, NormalizedMovementEvent[]>();

  for (const evt of events) {
    const list = personMap.get(evt.tagId) || [];
    list.push(evt);
    personMap.set(evt.tagId, list);
  }

  const results: PersonAnalyticsSummary[] = [];

  for (const [tagId, personEvents] of personMap.entries()) {
    const totalVisits = personEvents.length;
    const name = personEvents[0].personName;
    const zoneSet = new Set<string>();
    let totalDwell = 0;
    let minDur = Infinity;
    let maxDur = -Infinity;
    let earliestTime = personEvents[0].enterTime;
    let latestTime = personEvents[0].enterTime;

    for (const e of personEvents) {
      zoneSet.add(e.locationName);
      totalDwell += e.durationMinutes;
      if (e.durationMinutes < minDur) minDur = e.durationMinutes;
      if (e.durationMinutes > maxDur) maxDur = e.durationMinutes;
      if (e.enterTime < earliestTime) earliestTime = e.enterTime;
      if (e.enterTime > latestTime) latestTime = e.enterTime;
    }

    const avgDur = totalVisits > 0 ? totalDwell / totalVisits : 0;
    if (minDur === Infinity) minDur = 0;
    if (maxDur === -Infinity) maxDur = 0;

    results.push({
      tagId,
      name,
      totalVisits,
      zonesVisited: Array.from(zoneSet),
      distinctZonesCount: zoneSet.size,
      avgDurationMinutes: Math.round(avgDur * 100) / 100,
      avgDurationFormatted: formatDurationHuman(avgDur),
      minDurationMinutes: Math.round(minDur * 100) / 100,
      minDurationFormatted: formatDurationHuman(minDur),
      maxDurationMinutes: Math.round(maxDur * 100) / 100,
      maxDurationFormatted: formatDurationHuman(maxDur),
      totalDwellMinutes: Math.round(totalDwell * 100) / 100,
      totalDwellFormatted: formatDurationHuman(totalDwell),
      firstActivity: earliestTime,
      lastActivity: latestTime
    });
  }

  return results.sort((a, b) => b.totalVisits - a.totalVisits);
}

/**
 * Calculates duration statistics, distribution buckets, shortest and longest visits.
 */
export function calculateDurationAnalytics(events: NormalizedMovementEvent[]): DurationAnalytics {
  if (events.length === 0) {
    return {
      avgDurationMinutes: 0,
      avgDurationFormatted: '0s',
      medianDurationMinutes: 0,
      medianDurationFormatted: '0s',
      minDurationMinutes: 0,
      minDurationFormatted: '0s',
      maxDurationMinutes: 0,
      maxDurationFormatted: '0s',
      distribution: [
        { range: '< 1 min', label: 'Brief Transits (< 1m)', count: 0, percentage: 0 },
        { range: '1 - 5 mins', label: 'Short Stops (1 - 5m)', count: 0, percentage: 0 },
        { range: '5 - 15 mins', label: 'Standard Dwells (5 - 15m)', count: 0, percentage: 0 },
        { range: '15 - 60 mins', label: 'Extended Stays (15 - 60m)', count: 0, percentage: 0 },
        { range: '> 60 mins', label: 'Prolonged (> 60m)', count: 0, percentage: 0 }
      ],
      shortestVisits: [],
      longestVisits: []
    };
  }

  const sortedByDur = [...events].sort((a, b) => a.durationMinutes - b.durationMinutes);
  const count = sortedByDur.length;
  const totalDwell = events.reduce((sum, e) => sum + e.durationMinutes, 0);
  const avg = totalDwell / count;

  // Median
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 
    ? sortedByDur[mid].durationMinutes 
    : (sortedByDur[mid - 1].durationMinutes + sortedByDur[mid].durationMinutes) / 2;

  const min = sortedByDur[0].durationMinutes;
  const max = sortedByDur[count - 1].durationMinutes;

  // Distribution buckets
  let b1 = 0; // < 1m
  let b2 = 0; // 1 - 5m
  let b3 = 0; // 5 - 15m
  let b4 = 0; // 15 - 60m
  let b5 = 0; // > 60m

  for (const e of events) {
    const d = e.durationMinutes;
    if (d < 1) b1++;
    else if (d < 5) b2++;
    else if (d < 15) b3++;
    else if (d < 60) b4++;
    else b5++;
  }

  const distribution: DurationDistributionBucket[] = [
    { range: '< 1 min', label: 'Brief Transits (< 1m)', count: b1, percentage: Math.round((b1 / count) * 100) },
    { range: '1 - 5 mins', label: 'Short Stops (1 - 5m)', count: b2, percentage: Math.round((b2 / count) * 100) },
    { range: '5 - 15 mins', label: 'Standard Dwells (5 - 15m)', count: b3, percentage: Math.round((b3 / count) * 100) },
    { range: '15 - 60 mins', label: 'Extended Stays (15 - 60m)', count: b4, percentage: Math.round((b4 / count) * 100) },
    { range: '> 60 mins', label: 'Prolonged (> 60m)', count: b5, percentage: Math.round((b5 / count) * 100) }
  ];

  return {
    avgDurationMinutes: Math.round(avg * 100) / 100,
    avgDurationFormatted: formatDurationHuman(avg),
    medianDurationMinutes: Math.round(median * 100) / 100,
    medianDurationFormatted: formatDurationHuman(median),
    minDurationMinutes: Math.round(min * 100) / 100,
    minDurationFormatted: formatDurationHuman(min),
    maxDurationMinutes: Math.round(max * 100) / 100,
    maxDurationFormatted: formatDurationHuman(max),
    distribution,
    shortestVisits: sortedByDur.slice(0, 5),
    longestVisits: sortedByDur.slice(-5).reverse()
  };
}

/**
 * Generates evidence-based AI analytics observations.
 * Strictly mathematical, comparative, non-speculative.
 * Never invents safety violations, worker faults, equipment failures, or unauthorized access.
 */
export function generateAIObservations(
  events: NormalizedMovementEvent[],
  options: AnalyticsContextOptions = {}
): AIObservation[] {
  if (events.length < 5) {
    return [{
      id: 'obs_insufficient',
      category: 'zone_traffic',
      metric: 'Statistical Baseline',
      currentValue: `${events.length} records`,
      baselineValue: '5 records required',
      change: 'N/A',
      confidence: 0,
      explanation: 'Insufficient historical data to establish statistically valid baseline comparisons.',
      insufficientData: true
    }];
  }

  const zoneLabel = options.zoneLabel || 'Zone';
  const personLabel = options.personnelSingular || 'Personnel';
  const observations: AIObservation[] = [];

  const zoneAnalytics = calculateZoneAnalytics(events);
  const hourlyTraffic = calculateHourlyTraffic(events);
  const durationAnalytics = calculateDurationAnalytics(events);
  const totalEvents = events.length;

  // 1. Zone Traffic Density Shift
  if (zoneAnalytics.length > 0) {
    const topZone = zoneAnalytics[0];
    const avgVisitsPerZone = totalEvents / zoneAnalytics.length;
    const pctAboveAverage = avgVisitsPerZone > 0 
      ? Math.round(((topZone.totalVisits - avgVisitsPerZone) / avgVisitsPerZone) * 100) 
      : 0;

    observations.push({
      id: 'obs_zone_density',
      category: 'zone_traffic',
      metric: `${zoneLabel} Traffic Concentration`,
      currentValue: `${topZone.totalVisits} visits (${Math.round((topZone.totalVisits / totalEvents) * 100)}% of site total)`,
      baselineValue: `${Math.round(avgVisitsPerZone)} visits per ${zoneLabel.toLowerCase()} (site average)`,
      change: `+${pctAboveAverage}%`,
      confidence: Math.min(95, 75 + Math.min(20, totalEvents / 10)),
      explanation: `${zoneLabel} ${topZone.zone} recorded ${pctAboveAverage}% higher visit volume than the facility average across ${zoneAnalytics.length} active ${zoneLabel.toLowerCase()}s.`
    });
  }

  // 2. Dwell Time Deviation
  if (zoneAnalytics.length > 1) {
    // Find zone with highest average duration
    const sortedByDwell = [...zoneAnalytics].sort((a, b) => b.avgDurationMinutes - a.avgDurationMinutes);
    const longestDwellZone = sortedByDwell[0];
    const siteMedian = durationAnalytics.medianDurationMinutes;

    if (siteMedian > 0 && longestDwellZone.avgDurationMinutes > siteMedian * 1.25) {
      const elevationPct = Math.round(((longestDwellZone.avgDurationMinutes - siteMedian) / siteMedian) * 100);
      observations.push({
        id: 'obs_dwell_elevation',
        category: 'dwell_trend',
        metric: `${zoneLabel} Dwell Elevation`,
        currentValue: `${longestDwellZone.avgDurationFormatted} mean dwell`,
        baselineValue: `${durationAnalytics.medianDurationFormatted} site median dwell`,
        change: `+${elevationPct}%`,
        confidence: Math.min(92, 70 + Math.min(22, longestDwellZone.totalVisits * 2)),
        explanation: `Average dwell duration in ${zoneLabel} ${longestDwellZone.zone} is elevated by ${elevationPct}% relative to the site median dwell.`
      });
    }
  }

  // 3. Peak Activity Transit Window
  const sortedHours = [...hourlyTraffic].sort((a, b) => b.eventCount - a.eventCount);
  const peakHour = sortedHours[0];
  const avgHourlyEvents = totalEvents / 24;

  if (peakHour.eventCount > 0) {
    const peakPct = avgHourlyEvents > 0 ? Math.round(((peakHour.eventCount - avgHourlyEvents) / avgHourlyEvents) * 100) : 0;
    observations.push({
      id: 'obs_peak_hour',
      category: 'peak_hours',
      metric: 'Peak Movement Window',
      currentValue: `${peakHour.eventCount} events at ${peakHour.hourLabel}`,
      baselineValue: `${Math.round(avgHourlyEvents)} events/hour (24h baseline)`,
      change: `+${peakPct}%`,
      confidence: 88,
      explanation: `Highest movement velocity occurred at ${peakHour.hourLabel} with ${peakHour.eventCount} recorded events and ${peakHour.uniquePeople} distinct individuals.`
    });
  }

  // 4. Repeat Visitor Mobility
  const personAnalytics = calculatePersonAnalytics(events);
  if (personAnalytics.length > 0) {
    const topPerson = personAnalytics[0];
    const avgVisitsPerPerson = totalEvents / personAnalytics.length;
    const ratio = avgVisitsPerPerson > 0 ? (topPerson.totalVisits / avgVisitsPerPerson).toFixed(1) : '1.0';

    if (topPerson.totalVisits > 2) {
      observations.push({
        id: 'obs_repeat_cadence',
        category: 'repeat_cadence',
        metric: `${personLabel} Mobility Velocity`,
        currentValue: `${topPerson.totalVisits} visits across ${topPerson.distinctZonesCount} ${zoneLabel.toLowerCase()}(s)`,
        baselineValue: `${avgVisitsPerPerson.toFixed(1)} visits per person (cohort mean)`,
        change: `${ratio}×`,
        confidence: 85,
        explanation: `${topPerson.name} registered ${ratio}× the cohort average visit count, transiting through ${topPerson.zonesVisited.join(', ')}.`
      });
    }
  }

  return observations;
}

/**
 * Transforms real-time tags and active workers into RawMovementRecord format with LeaveTime: 'ACTIVE'.
 * Ensures that all currently active on-site workers are included in incident, analytics, and AI calculations.
 */
export function convertRealtimeTagsToMovementRecords(
  liveTags?: any[] | null,
  people?: any[] | null,
  peopleRegistry?: Map<string, any> | any[] | null
): RawMovementRecord[] {
  const records: RawMovementRecord[] = [];
  const seenTagIds = new Set<string>();

  const getPerson = (tid: string) => {
    if (!peopleRegistry) return null;
    const clean = tid.trim().toLowerCase();
    if (peopleRegistry instanceof Map) {
      return peopleRegistry.get(clean) || peopleRegistry.get(tid);
    }
    if (Array.isArray(peopleRegistry)) {
      return peopleRegistry.find(p => String(p?.id || p?.tagId || p?.TagID || p?.hardhatTagId || '').toLowerCase() === clean);
    }
    return null;
  };

  // 1. Process liveTags (from gaoApi.getTagsInRealtime() or context liveTags)
  if (Array.isArray(liveTags)) {
    liveTags.forEach(tag => {
      const tid = String(tag.TagID || tag.tagId || tag.id || '').trim();
      if (!tid) return;
      const tidLower = tid.toLowerCase();
      if (seenTagIds.has(tidLower)) return;
      seenTagIds.add(tidLower);

      const matched = getPerson(tid);
      const name = matched?.name || tag.personName || tag.name || (tag.FirstName ? `${tag.FirstName} ${tag.LastName || ''}`.trim() : '');
      const role = matched?.role || tag.role || 'Field Personnel';
      const loc = String(tag.LocationName || tag.Location || tag.zoneName || tag.zone || tag.currentZone || 'Main Facility').trim();
      const rawTs = tag.Timestamp || tag.timestamp || tag.EnterTime || tag.lastSeen;
      const ts = rawTs ? (typeof rawTs === 'object' && rawTs instanceof Date ? rawTs.toISOString() : String(rawTs)) : new Date().toISOString();

      records.push({
        TagID: tid,
        tagId: tid,
        FirstName: matched?.firstName || tag.FirstName || (name ? name.split(' ')[0] : ''),
        LastName: matched?.lastName || tag.LastName || (name ? name.split(' ').slice(1).join(' ') : ''),
        name: name || undefined,
        LocationName: loc,
        Location: loc,
        location: loc,
        EnterTime: ts,
        EnterTimeStr: ts,
        LeaveTime: 'ACTIVE',
        LeaveTimeStr: 'ACTIVE',
        Duration: tag.dwellTime ? Math.max(0.5, Math.round((tag.dwellTime / 60) * 10) / 10) : 0.5,
        durationMins: tag.dwellTime ? Math.max(0.5, Math.round((tag.dwellTime / 60) * 10) / 10) : 0.5
      });
    });
  }

  // 2. Process active workforce from tracking context/props
  if (Array.isArray(people)) {
    people.forEach(p => {
      const tid = String(p.hardhatTagId || p.tagId || p.TagID || p.id || '').trim();
      if (!tid) return;
      const tidLower = tid.toLowerCase();
      if (seenTagIds.has(tidLower)) return;
      seenTagIds.add(tidLower);

      const rawTs = p.lastSeen || p.timestamp || p.EnterTime;
      const ts = rawTs ? (rawTs instanceof Date ? rawTs.toISOString() : String(rawTs)) : new Date().toISOString();
      const loc = String(p.currentZone || p.zone || p.LocationName || p.location || 'Main Facility').trim();

      records.push({
        TagID: tid,
        tagId: tid,
        FirstName: p.firstName || (p.name ? p.name.split(' ')[0] : ''),
        LastName: p.lastName || (p.name ? p.name.split(' ').slice(1).join(' ') : ''),
        name: p.name,
        LocationName: loc,
        Location: loc,
        location: loc,
        EnterTime: ts,
        EnterTimeStr: ts,
        LeaveTime: 'ACTIVE',
        LeaveTimeStr: 'ACTIVE',
        Duration: p.dwellTime ? Math.max(0.5, Math.round((p.dwellTime / 60) * 10) / 10) : 0.5,
        durationMins: p.dwellTime ? Math.max(0.5, Math.round((p.dwellTime / 60) * 10) / 10) : 0.5
      });
    });
  }

  return records;
}

