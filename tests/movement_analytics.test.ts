import { describe, it, expect } from 'vitest';
import {
  normalizeRecord,
  normalizeRecords,
  calculateKPIs,
  calculateHourlyTraffic,
  calculateDailyTraffic,
  calculateZoneAnalytics,
  calculatePersonAnalytics,
  calculateDurationAnalytics,
  generateAIObservations,
  formatDurationHuman,
  RawMovementRecord
} from '../src/lib/movementAnalytics';

describe('Movement Analytics Intelligence Engine', () => {
  const primarySampleTag = 'TAG_SAMPLE_001';
  const sampleRecords: RawMovementRecord[] = [
    {
      TagID: primarySampleTag,
      FirstName: 'John',
      LastName: '',
      LocationName: 'Zone2',
      EnterTime: '2026-09-07 07:06:21',
      LeaveTime: '2026-09-07 07:06:28',
      Duration: 0.0020980735277777779
    },
    {
      TagID: primarySampleTag,
      FirstName: 'John',
      LastName: '',
      LocationName: 'Zone1',
      EnterTime: '2026-09-07 07:14:29',
      LeaveTime: '2026-09-07 07:14:43',
      Duration: 0.2
    },
    {
      TagID: primarySampleTag,
      FirstName: 'John',
      LastName: '',
      LocationName: 'Zone2',
      EnterTime: '2026-09-07 07:14:43',
      LeaveTime: '2026-09-07 07:17:08',
      Duration: 2.4
    },
    {
      TagID: 'TAG_ALICE',
      FirstName: 'Alice',
      LastName: 'Smith',
      LocationName: 'Zone1',
      EnterTime: '2026-09-07 08:00:00',
      LeaveTime: '2026-09-07 08:30:00',
      Duration: 30
    },
    {
      TagID: 'TAG_BOB',
      FirstName: 'Bob',
      LastName: 'Jones',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 08:15:00',
      LeaveTime: '2026-09-07 09:15:00',
      Duration: 60
    }
  ];

  it('TEST 1: Normalizes API records and calculates duration accurately from timestamps', () => {
    const normalized = normalizeRecords(sampleRecords);

    expect(normalized.length).toBe(5);
    // Most recent first
    expect(normalized[0].enterTime).toContain('08:15:00');

    // Check duration for 7-second event
    const sevenSecEvent = normalized.find(e => e.enterTime.includes('07:06:21'));
    expect(sevenSecEvent).toBeDefined();
    expect(sevenSecEvent?.durationSeconds).toBe(7);
    expect(sevenSecEvent?.durationFormatted).toBe('7s');
    expect(sevenSecEvent?.personName).toBe('John');
    expect(sevenSecEvent?.locationName).toBe('Zone2');
  });

  it('TEST 2: Calculates dynamic KPIs without hardcoded values', () => {
    const normalized = normalizeRecords(sampleRecords);
    const kpis = calculateKPIs(normalized);

    expect(kpis.totalEvents).toBe(5);
    expect(kpis.uniquePeople).toBe(3); // John, Alice, Bob
    expect(kpis.activeZones).toBe(3);  // Zone1, Zone2, Zone3
    // Repeat visitor: John has 3 visits (>= 2)
    expect(kpis.repeatVisitors).toBe(1);
    expect(kpis.totalDwellMinutes).toBeGreaterThan(0);
    expect(kpis.averageDurationMinutes).toBeGreaterThan(0);
  });

  it('TEST 3: Groups events by hour of the day accurately', () => {
    const normalized = normalizeRecords(sampleRecords);
    const hourly = calculateHourlyTraffic(normalized);

    expect(hourly.length).toBe(24);

    // 07:00 should have 3 events (all 3 of John's visits)
    const hour7 = hourly[7];
    expect(hour7.eventCount).toBe(3);
    expect(hour7.uniquePeople).toBe(1);

    // 08:00 should have 2 events (Alice and Bob)
    const hour8 = hourly[8];
    expect(hour8.eventCount).toBe(2);
    expect(hour8.uniquePeople).toBe(2);
  });

  it('TEST 4: Calculates comprehensive Zone analytics summary', () => {
    const normalized = normalizeRecords(sampleRecords);
    const zoneStats = calculateZoneAnalytics(normalized);

    expect(zoneStats.length).toBe(3); // Zone1, Zone2, Zone3

    const zone2 = zoneStats.find(z => z.zone === 'Zone2');
    expect(zone2).toBeDefined();
    expect(zone2?.totalVisits).toBe(2);
    expect(zone2?.uniquePeople).toBe(1); // John
    expect(zone2?.repeatVisitors).toBe(1);

    const zone3 = zoneStats.find(z => z.zone === 'Zone3');
    expect(zone3).toBeDefined();
    expect(zone3?.totalVisits).toBe(1);
    expect(zone3?.maxDurationMinutes).toBe(60);
    expect(zone3?.maxDurationFormatted).toBe('1h');
  });

  it('TEST 5: Calculates comprehensive Person analytics summary', () => {
    const normalized = normalizeRecords(sampleRecords);
    const peopleStats = calculatePersonAnalytics(normalized);

    expect(peopleStats.length).toBe(3);

    const john = peopleStats.find(p => p.tagId === primarySampleTag);
    expect(john).toBeDefined();
    expect(john?.totalVisits).toBe(3);
    expect(john?.distinctZonesCount).toBe(2); // Zone1, Zone2
    expect(john?.zonesVisited).toContain('Zone1');
    expect(john?.zonesVisited).toContain('Zone2');
  });

  it('TEST 6: Computes duration statistics and distribution buckets', () => {
    const normalized = normalizeRecords(sampleRecords);
    const durationStats = calculateDurationAnalytics(normalized);

    expect(durationStats.minDurationMinutes).toBeCloseTo(0.12, 1); // 7s
    expect(durationStats.maxDurationMinutes).toBe(60); // 1h
    expect(durationStats.distribution.length).toBe(5);

    // Check buckets
    const brief = durationStats.distribution.find(b => b.range === '< 1 min');
    expect(brief?.count).toBe(2); // 7s and 14s

    expect(durationStats.shortestVisits.length).toBe(5);
    expect(durationStats.longestVisits.length).toBe(5);
    expect(durationStats.longestVisits[0].durationMinutes).toBe(60);
  });

  it('TEST 7: Generates evidence-based AI observations without unsupported claims', () => {
    const normalized = normalizeRecords(sampleRecords);
    const observations = generateAIObservations(normalized, {
      industry: 'manufacturing',
      zoneLabel: 'Station',
      personnelSingular: 'Operator'
    });

    expect(observations.length).toBeGreaterThan(0);
    for (const obs of observations) {
      expect(obs.metric).toBeDefined();
      expect(obs.currentValue).toBeDefined();
      expect(obs.baselineValue).toBeDefined();
      expect(obs.confidence).toBeGreaterThan(0);
      expect(obs.explanation).not.toContain('safety violation');
      expect(obs.explanation).not.toContain('worker is unsafe');
      expect(obs.explanation).not.toContain('injured');
      expect(obs.explanation).not.toContain('equipment failure');
    }
  });

  it('TEST 8: Formats human-readable durations across seconds, minutes, hours, and days', () => {
    expect(formatDurationHuman(0.1)).toBe('6s');
    expect(formatDurationHuman(2.5)).toBe('2m 30s');
    expect(formatDurationHuman(60)).toBe('1h');
    expect(formatDurationHuman(90)).toBe('1h 30m');
    expect(formatDurationHuman(1440)).toBe('1d');
    expect(formatDurationHuman(1500)).toBe('1d 1h');
  });

  it('TEST 9: Correctly resolves employee full names from registered workforce and API records', () => {
    const raw: RawMovementRecord = {
      TagID: primarySampleTag,
      FirstName: 'John',
      LastName: '',
      LocationName: 'Zone2',
      EnterTime: '2026-09-07 07:06:21',
      LeaveTime: '2026-09-07 07:06:28',
      Duration: 0.1
    };

    // Without registry, uses raw fields
    const withoutRegistry = normalizeRecord(raw, 0);
    expect(withoutRegistry.personName).toBe('John');

    // With registered workforce registry, accurately resolves full name
    const registry = [
      {
        id: primarySampleTag,
        firstName: 'John',
        lastName: 'Doe Testing',
        role: 'Senior Master Electrician'
      }
    ];

    const withRegistry = normalizeRecord(raw, 0, registry);
    expect(withRegistry.personName).toBe('John Doe Testing');
    expect(withRegistry.firstName).toBe('John');
    expect(withRegistry.lastName).toBe('Doe Testing');

    const personSummary = calculatePersonAnalytics([withRegistry]);
    expect(personSummary[0].name).toBe('John Doe Testing');
  });
});

