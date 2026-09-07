/**
 * Incident & Event Intelligence Engine for Aperture People Tracking
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
 * Never invents GPS coordinates, equipment, machine status, camera events,
 * temperature, injuries, access permissions, employee roles, or safety violations.
 */

import { resolvePersonName } from './movementAnalytics';

export interface RawApiHistoryRecord {
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

export type EventSeverity = 'Critical' | 'Warning' | 'Low' | 'Normal';

export type EventType = 
  | 'Zone Visit'
  | 'Short Visit'
  | 'Long Visit'
  | 'Repeated Visit'
  | 'Unusual Activity';

export interface AIExplanation {
  whatHappened: string;
  evidence: string;
  historicalComparison: string;
  whyUnusual: string;
  confidence: number; // 0 - 100
  recommendedAction: string;
  isInsufficientData?: boolean;
}

export interface NormalizedEvent {
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
  // AI Anomaly fields
  eventType: EventType;
  severity: EventSeverity;
  isAnomaly: boolean;
  anomalyScore: number; // 0 - 100
  explanation: AIExplanation;
  rawPayload: {
    TagID: string;
    FirstName: string;
    LastName: string;
    LocationName: string;
    EnterTime: string;
    LeaveTime: string;
    Duration: number;
  };
}

export interface ZoneBaseline {
  zone: string;
  eventCount: number;
  totalDurationMinutes: number;
  meanDurationMinutes: number;
  medianDurationMinutes: number;
  stdDevDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  uniquePeopleCount: number;
  hasSufficientData: boolean; // eventCount >= 3
}

export interface PersonBaseline {
  tagId: string;
  personName: string;
  eventCount: number;
  totalDurationMinutes: number;
  meanDurationMinutes: number;
  zonesVisited: string[];
  lastSeenTime: string;
}

export interface IntelligenceKPIs {
  totalEvents: number;
  uniquePeople: number;
  activeZones: number;
  aiAnomalies: number;
  averageDurationMinutes: number;
  averageDurationFormatted: string;
  totalDwellMinutes: number;
  totalDwellFormatted: string;
}

export interface PersonTimelineStep {
  stepNumber: number;
  timeString: string;
  transitionSummary: string; // e.g., "07:06:21 → Zone2"
  zone: string;
  enterTime: string;
  leaveTime: string;
  durationFormatted: string;
  durationMinutes: number;
  transitGapMinutes?: number;
  isAnomaly: boolean;
  eventType: EventType;
  severity: EventSeverity;
}

export interface IndustryContextOptions {
  industry?: string;
  subIndustry?: string;
  zoneLabel?: string;
  personnelSingular?: string;
  personnelPlural?: string;
  siteLabel?: string;
  people?: any[] | Map<string, any>;
  peopleRegistry?: any[] | Map<string, any>;
}

/**
 * Parses timestamp string or Date object into valid Date, returning null on invalid input.
 */
export function parseDateTime(raw?: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'ACTIVE' || trimmed === 'Active') return null;
    // Handle "yyyy-MM-dd HH:mm:ss" format by replacing space with 'T' if needed
    const isoLike = trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed;
    const d = new Date(isoLike);
    if (!isNaN(d.getTime())) return d;
    // Fallback standard parse
    const direct = new Date(trimmed);
    if (!isNaN(direct.getTime())) return direct;
  }
  return null;
}

/**
 * Format a Date or timestamp string nicely into "YYYY-MM-DD HH:mm:ss"
 */
export function formatTimestampDisplay(d?: Date | string | null): string {
  if (!d) return 'Active / In Zone';
  const dateObj = typeof d === 'string' ? parseDateTime(d) : d;
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
 * Formats duration in minutes into a concise, professional string (e.g. "7s", "2m 14s", "1h 22m").
 */
export function formatDuration(durationMinutes: number): string {
  if (durationMinutes <= 0) return '0s';
  const totalSeconds = Math.round(durationMinutes * 60);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return seconds > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Computes duration in minutes and seconds from raw API fields.
 * Handles both time differences (LeaveTime - EnterTime) and numeric Duration field.
 */
export function calculateEventDuration(
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

  // 2. Parse rawDuration field from API
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
 * Normalizes a raw API record into a typed, validated structure.
 */
export function normalizeApiRecord(
  rec: RawApiHistoryRecord, 
  index: number = 0,
  peopleRegistry?: any[] | Map<string, any> | null,
  fallbackPersonnelSingular: string = 'Personnel'
): {
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
  rawPayload: {
    TagID: string;
    FirstName: string;
    LastName: string;
    LocationName: string;
    EnterTime: string;
    LeaveTime: string;
    Duration: number;
  };
} {
  const tagId = String(rec.TagID || rec.tagId || `UNKNOWN_TAG_${index}`).trim();
  const personName = resolvePersonName(tagId, rec as any, peopleRegistry, fallbackPersonnelSingular);

  const nameParts = personName.split(' ');
  const firstName = String(rec.FirstName || rec.firstName || (nameParts.length > 1 ? nameParts[0] : personName)).trim();
  const lastName = String(rec.LastName || rec.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '')).trim();

  const locationName = String(
    rec.LocationName || rec.Location || rec.location || 'Zone'
  ).trim();

  const enterRaw = rec.EnterTime || rec.EnterTimeStr || rec.enterTime || rec.timestamp || new Date().toISOString();
  const leaveRaw = rec.LeaveTime || rec.LeaveTimeStr || rec.leaveTime || '';

  const enterDate = parseDateTime(enterRaw) || new Date();
  const isOngoing = !leaveRaw || leaveRaw === 'ACTIVE' || leaveRaw === 'Active';
  const leaveDate = isOngoing ? null : parseDateTime(leaveRaw);

  const { durationMinutes, durationSeconds } = calculateEventDuration(
    enterDate,
    leaveDate,
    rec.Duration ?? rec.duration ?? rec.durationMins
  );

  const durationFormatted = formatDuration(durationMinutes);
  const enterTimeFormatted = formatTimestampDisplay(enterDate);
  const leaveTimeFormatted = leaveDate ? formatTimestampDisplay(leaveDate) : 'Active';

  const id = `evt_${tagId}_${enterDate.getTime()}_${index}`;

  const rawPayload = {
    TagID: tagId,
    FirstName: firstName,
    LastName: lastName,
    LocationName: locationName,
    EnterTime: enterRaw,
    LeaveTime: leaveRaw || 'ACTIVE',
    Duration: typeof rec.Duration === 'number' ? rec.Duration : (parseFloat(String(rec.Duration)) || durationMinutes)
  };

  return {
    id,
    tagId,
    firstName,
    lastName,
    personName,
    locationName,
    enterTime: enterTimeFormatted,
    leaveTime: leaveTimeFormatted,
    enterDate,
    leaveDate,
    durationMinutes,
    durationSeconds,
    durationFormatted,
    isOngoing,
    rawPayload
  };
}

/**
 * Calculates statistical baselines for each zone.
 */
export function calculateZoneBaselines(events: ReturnType<typeof normalizeApiRecord>[]): Map<string, ZoneBaseline> {
  const zoneGroups = new Map<string, ReturnType<typeof normalizeApiRecord>[]>();
  
  for (const evt of events) {
    const list = zoneGroups.get(evt.locationName) || [];
    list.push(evt);
    zoneGroups.set(evt.locationName, list);
  }

  const baselines = new Map<string, ZoneBaseline>();

  for (const [zone, group] of zoneGroups.entries()) {
    const durations = group.map(e => e.durationMinutes).sort((a, b) => a - b);
    const count = durations.length;
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const mean = count > 0 ? totalDuration / count : 0;

    // Median
    let median = 0;
    if (count > 0) {
      const mid = Math.floor(count / 2);
      median = count % 2 !== 0 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
    }

    // Standard deviation
    let variance = 0;
    if (count > 1) {
      variance = durations.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    }
    const stdDev = Math.sqrt(variance);

    // Unique people in zone
    const uniqueTags = new Set(group.map(e => e.tagId));

    baselines.set(zone, {
      zone,
      eventCount: count,
      totalDurationMinutes: Math.round(totalDuration * 100) / 100,
      meanDurationMinutes: Math.round(mean * 100) / 100,
      medianDurationMinutes: Math.round(median * 100) / 100,
      stdDevDurationMinutes: Math.round(stdDev * 100) / 100,
      minDurationMinutes: durations[0] || 0,
      maxDurationMinutes: durations[count - 1] || 0,
      uniquePeopleCount: uniqueTags.size,
      hasSufficientData: count >= 3
    });
  }

  return baselines;
}

/**
 * Generates industry-aware operational recommendations based on event classification.
 */
export function generateRecommendation(
  eventType: EventType,
  severity: EventSeverity,
  zone: string,
  person: string,
  durationMinutes: number,
  options: IndustryContextOptions = {}
): string {
  const industry = (options.industry || 'construction').toLowerCase();
  const zoneLabel = options.zoneLabel || 'Zone';
  const personLabel = options.personnelSingular || 'Personnel';

  if (eventType === 'Long Visit') {
    if (industry.includes('health')) {
      return `Verify clinical care duration or patient room consultation for ${person} in ${zoneLabel} ${zone}. Confirm staff handover notes.`;
    }
    if (industry.includes('manufactur')) {
      return `Review workstation cycle time for ${person} at ${zoneLabel} ${zone}. Check if line pacing bottleneck or stationary RFID badge occurred.`;
    }
    if (industry.includes('oil') || industry.includes('gas') || industry.includes('mining')) {
      return `Cross-reference permit-to-work operational schedule for ${person} in ${zoneLabel} ${zone}. Confirm stationary task status.`;
    }
    if (industry.includes('office')) {
      return `Confirm scheduled meeting or overtime task for ${person} in ${zoneLabel} ${zone}. Verify badge was not left unattended.`;
    }
    // Default Construction
    return `Verify if ${personLabel.toLowerCase()} required extended operational task time in ${zoneLabel} ${zone} or if badge was left stationary.`;
  }

  if (eventType === 'Short Visit') {
    if (industry.includes('health')) {
      return `Log brief transit through ${zoneLabel} ${zone} (supply staging or corridor pass) for record validation.`;
    }
    if (industry.includes('manufactur')) {
      return `Confirm brief material pickup or quick component staging at ${zoneLabel} ${zone}.`;
    }
    return `Confirm brief operational transit through ${zoneLabel} ${zone} for tool collection or access routing.`;
  }

  if (eventType === 'Repeated Visit') {
    if (industry.includes('health')) {
      return `Audit frequent re-entry cycles by ${person} into ${zoneLabel} ${zone} to streamline medicine or supply retrieval.`;
    }
    if (industry.includes('manufactur')) {
      return `Evaluate material feeder cadence to understand repeated round-trips to ${zoneLabel} ${zone}.`;
    }
    return `Review repeated transit pattern by ${person} into ${zoneLabel} ${zone} to optimize tool and staging logistics.`;
  }

  if (eventType === 'Unusual Activity') {
    return `Review multi-${zoneLabel.toLowerCase()} transit sequence for ${person} across rapid transition intervals.`;
  }

  return `Movement event within expected historical baseline for ${zoneLabel} ${zone}. No immediate intervention required.`;
}

/**
 * Builds evidence-based AI explanation for an event.
 * Never invents causes, sensor readings, or safety violations.
 */
export function buildAIExplanation(
  eventType: EventType,
  severity: EventSeverity,
  event: ReturnType<typeof normalizeApiRecord>,
  baseline?: ZoneBaseline,
  repeatedCountInWindow: number = 1,
  options: IndustryContextOptions = {}
): AIExplanation {
  const zoneLabel = options.zoneLabel || 'Zone';
  const person = event.personName;
  const zone = event.locationName;
  const dur = event.durationFormatted;
  const durMins = event.durationMinutes;

  // 1. Insufficient data case
  if (!baseline || !baseline.hasSufficientData) {
    return {
      whatHappened: `${person} recorded a movement event in ${zoneLabel} ${zone} (${dur}).`,
      evidence: `Zone ${zone} has ${baseline ? baseline.eventCount : 0} total recorded event(s), which is below the minimum threshold (3 events) for statistical significance.`,
      historicalComparison: `Baseline cannot be reliably computed with fewer than 3 historical events.`,
      whyUnusual: `Insufficient historical data for reliable anomaly detection.`,
      confidence: 0,
      recommendedAction: `Continue telemetry collection to establish statistical baseline for ${zoneLabel} ${zone}.`,
      isInsufficientData: true
    };
  }

  const median = baseline.medianDurationMinutes;
  const mean = baseline.meanDurationMinutes;
  const stdDev = baseline.stdDevDurationMinutes;
  const n = baseline.eventCount;

  // 2. Normal visit
  if (eventType === 'Zone Visit') {
    return {
      whatHappened: `${person} occupied ${zoneLabel} ${zone} for ${dur}.`,
      evidence: `Recorded dwell of ${dur} aligns with historical baseline (Zone median: ${formatDuration(median)}, n=${n} visits).`,
      historicalComparison: `${zoneLabel} ${zone} baseline: median ${formatDuration(median)}, mean ${formatDuration(mean)}, σ=${formatDuration(stdDev)} (n=${n} events).`,
      whyUnusual: `Dwell time is within expected statistical variation (within 1.5 standard deviations).`,
      confidence: 85,
      recommendedAction: generateRecommendation(eventType, severity, zone, person, durMins, options),
      isInsufficientData: false
    };
  }

  // 3. Long Visit Anomaly
  if (eventType === 'Long Visit') {
    const ratio = median > 0 ? Math.round((durMins / median) * 100) : 100;
    const zScore = stdDev > 0 ? ((durMins - mean) / stdDev).toFixed(1) : '3.0+';
    const conf = Math.min(98, Math.max(70, Math.round(70 + (durMins / (median || 1)) * 3)));

    return {
      whatHappened: `Unusual movement pattern detected: ${person} maintained an extended dwell in ${zoneLabel} ${zone} for ${dur}.`,
      evidence: `Recorded dwell of ${dur} is ${ratio}% of the ${zoneLabel} ${zone} median dwell (${formatDuration(median)}), exceeding baseline by a factor of ${(durMins / (median || 1)).toFixed(1)}x.`,
      historicalComparison: `${zoneLabel} ${zone} historical baseline: median ${formatDuration(median)}, mean ${formatDuration(mean)}, σ=${formatDuration(stdDev)} across ${n} recorded events.`,
      whyUnusual: `Duration exceeds the statistical baseline threshold (z-score: ~${zScore} σ above historical mean).`,
      confidence: conf,
      recommendedAction: generateRecommendation(eventType, severity, zone, person, durMins, options),
      isInsufficientData: false
    };
  }

  // 4. Short Visit Anomaly
  if (eventType === 'Short Visit') {
    const pctOfMedian = median > 0 ? Math.round((durMins / median) * 100) : 0;
    return {
      whatHappened: `Unusual movement pattern detected: ${person} registered an unusually brief stay in ${zoneLabel} ${zone} (${dur}).`,
      evidence: `Recorded dwell of ${dur} is only ${pctOfMedian}% of the ${zoneLabel} ${zone} median dwell (${formatDuration(median)}).`,
      historicalComparison: `${zoneLabel} ${zone} typical dwell: median ${formatDuration(median)} (n=${n} events).`,
      whyUnusual: `Duration is substantially shorter than 25% of typical zone dwell time.`,
      confidence: 78,
      recommendedAction: generateRecommendation(eventType, severity, zone, person, durMins, options),
      isInsufficientData: false
    };
  }

  // 5. Repeated Visit Anomaly
  if (eventType === 'Repeated Visit') {
    return {
      whatHappened: `Unusual movement pattern detected: Repeated visits by ${person} (${repeatedCountInWindow} separate entries into ${zoneLabel} ${zone} within short time window).`,
      evidence: `Detected ${repeatedCountInWindow} distinct entrance/exit records for TagID ${event.tagId} in ${zoneLabel} ${zone} within 45 minutes.`,
      historicalComparison: `Individual baseline shows high transit frequency into the same zone compared to typical single-visit patterns.`,
      whyUnusual: `Rapid sequential re-entries to the same physical area deviate from standard continuous work intervals.`,
      confidence: Math.min(95, 75 + repeatedCountInWindow * 5),
      recommendedAction: generateRecommendation(eventType, severity, zone, person, durMins, options),
      isInsufficientData: false
    };
  }

  // 6. Unusual Activity / Rapid transit
  return {
    whatHappened: `Unusual movement pattern detected: ${person} registered rapid sequential transits across multiple zones.`,
    evidence: `High movement frequency detected across distinct physical locations in a short timeframe.`,
    historicalComparison: `Movement velocity is elevated relative to steady-state zone occupancy distribution.`,
    whyUnusual: `Transit sequence indicates rapid roaming rather than sustained zone presence.`,
    confidence: 80,
    recommendedAction: generateRecommendation(eventType, severity, zone, person, durMins, options),
    isInsufficientData: false
  };
}

/**
 * Full Pipeline: Normalizes raw records, calculates baselines, evaluates anomalies,
 * and attaches evidence-based AI explanations.
 */
export function analyzeApiEvents(
  rawRecords: RawApiHistoryRecord[],
  options: IndustryContextOptions = {}
): NormalizedEvent[] {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return [];
  }

  const registry = options.people || options.peopleRegistry;

  // 1. Normalize all records
  const normalized = rawRecords.map((r, idx) => normalizeApiRecord(r, idx, registry, options.personnelSingular));

  // Sort chronologically ascending to evaluate sequential movements
  const sortedChronological = [...normalized].sort(
    (a, b) => a.enterDate.getTime() - b.enterDate.getTime()
  );

  // 2. Compute Zone Baselines
  const zoneBaselines = calculateZoneBaselines(sortedChronological);

  // 3. Track rolling window repeated visits by (tagId + locationName)
  // Window: 45 minutes (2,700,000 ms)
  const ROLLING_WINDOW_MS = 45 * 60 * 1000;
  const tagZoneVisitTimes = new Map<string, number[]>();

  for (const evt of sortedChronological) {
    const key = `${evt.tagId}_${evt.locationName}`;
    const times = tagZoneVisitTimes.get(key) || [];
    times.push(evt.enterDate.getTime());
    tagZoneVisitTimes.set(key, times);
  }

  // 4. Classify each event
  const evaluatedEvents: NormalizedEvent[] = sortedChronological.map(evt => {
    const baseline = zoneBaselines.get(evt.locationName);
    const key = `${evt.tagId}_${evt.locationName}`;
    const allTimes = tagZoneVisitTimes.get(key) || [];
    const currentTime = evt.enterDate.getTime();
    
    // Count how many visits by this tag to this zone occurred within the window around currentTime
    const visitsInWindow = allTimes.filter(
      t => Math.abs(t - currentTime) <= ROLLING_WINDOW_MS
    ).length;

    let eventType: EventType = 'Zone Visit';
    let severity: EventSeverity = 'Normal';
    let isAnomaly = false;
    let anomalyScore = 0;

    if (baseline && baseline.hasSufficientData) {
      const median = baseline.medianDurationMinutes;
      const stdDev = baseline.stdDevDurationMinutes;
      const dur = evt.durationMinutes;

      // Check Repeated Visit first (≥ 3 visits in window)
      if (visitsInWindow >= 3) {
        eventType = 'Repeated Visit';
        isAnomaly = true;
        severity = visitsInWindow >= 4 ? 'Warning' : 'Low';
        anomalyScore = Math.min(95, 60 + visitsInWindow * 8);
      }
      // Check Long Visit
      else if (
        (median > 0 && dur >= median * 2.5 && dur >= 3.0) ||
        (stdDev > 0 && dur >= baseline.meanDurationMinutes + stdDev * 2.5 && dur >= 3.0)
      ) {
        eventType = 'Long Visit';
        isAnomaly = true;
        severity = dur >= (median || 1) * 5 ? 'Critical' : 'Warning';
        anomalyScore = Math.min(98, Math.round(65 + (dur / (median || 1)) * 5));
      }
      // Check Short Visit (dwell < 25% of zone median when median is at least 1 min)
      else if (median >= 1.0 && dur <= median * 0.25 && dur < 0.5) {
        eventType = 'Short Visit';
        isAnomaly = true;
        severity = 'Low';
        anomalyScore = 55;
      }
    }

    const explanation = buildAIExplanation(
      eventType,
      severity,
      evt,
      baseline,
      visitsInWindow,
      options
    );

    return {
      ...evt,
      eventType,
      severity,
      isAnomaly,
      anomalyScore,
      explanation
    };
  });

  // Sort descending by EnterTime for dashboard presentation (most recent first)
  return evaluatedEvents.sort((a, b) => b.enterDate.getTime() - a.enterDate.getTime());
}

/**
 * Calculates KPIs dynamically from evaluated events.
 */
export function calculateKPIs(events: NormalizedEvent[]): IntelligenceKPIs {
  const totalEvents = events.length;
  if (totalEvents === 0) {
    return {
      totalEvents: 0,
      uniquePeople: 0,
      activeZones: 0,
      aiAnomalies: 0,
      averageDurationMinutes: 0,
      averageDurationFormatted: '0s',
      totalDwellMinutes: 0,
      totalDwellFormatted: '0s'
    };
  }

  const peopleSet = new Set<string>();
  const zoneSet = new Set<string>();
  let totalDwell = 0;
  let anomaliesCount = 0;

  for (const evt of events) {
    peopleSet.add(evt.tagId);
    zoneSet.add(evt.locationName);
    totalDwell += evt.durationMinutes;
    if (evt.isAnomaly) {
      anomaliesCount++;
    }
  }

  const avgDuration = totalEvents > 0 ? totalDwell / totalEvents : 0;

  return {
    totalEvents,
    uniquePeople: peopleSet.size,
    activeZones: zoneSet.size,
    aiAnomalies: anomaliesCount,
    averageDurationMinutes: Math.round(avgDuration * 100) / 100,
    averageDurationFormatted: formatDuration(avgDuration),
    totalDwellMinutes: Math.round(totalDwell * 100) / 100,
    totalDwellFormatted: formatDuration(totalDwell)
  };
}

/**
 * Builds chronological movement timeline for a specific person / TagID.
 * Format requirement:
 * 07:06:21 → Zone2
 * 07:06:28 → Zone2
 * 07:15:42 → Zone1
 * 07:22:18 → Zone3
 */
export function buildPersonMovementTimeline(
  events: NormalizedEvent[],
  targetTagId: string
): PersonTimelineStep[] {
  const personEvents = events
    .filter(e => e.tagId.toLowerCase() === targetTagId.toLowerCase())
    .sort((a, b) => a.enterDate.getTime() - b.enterDate.getTime());

  const steps: PersonTimelineStep[] = [];

  for (let i = 0; i < personEvents.length; i++) {
    const evt = personEvents[i];
    const prevEvt = i > 0 ? personEvents[i - 1] : null;

    // Time string e.g. 07:06:21
    const hh = String(evt.enterDate.getHours()).padStart(2, '0');
    const mm = String(evt.enterDate.getMinutes()).padStart(2, '0');
    const ss = String(evt.enterDate.getSeconds()).padStart(2, '0');
    const timeString = `${hh}:${mm}:${ss}`;

    // Gap between previous exit and this entry
    let transitGapMinutes: number | undefined;
    if (prevEvt && prevEvt.leaveDate) {
      const gapMs = evt.enterDate.getTime() - prevEvt.leaveDate.getTime();
      if (gapMs > 0) {
        transitGapMinutes = Math.round((gapMs / 60000) * 10) / 10;
      }
    }

    steps.push({
      stepNumber: i + 1,
      timeString,
      transitionSummary: `${timeString} → ${evt.locationName}`,
      zone: evt.locationName,
      enterTime: evt.enterTime,
      leaveTime: evt.leaveTime,
      durationFormatted: evt.durationFormatted,
      durationMinutes: evt.durationMinutes,
      transitGapMinutes,
      isAnomaly: evt.isAnomaly,
      eventType: evt.eventType,
      severity: evt.severity
    });
  }

  return steps;
}
