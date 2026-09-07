import { describe, it, expect } from 'vitest';
import {
  normalizeApiRecord,
  calculateZoneBaselines,
  analyzeApiEvents,
  calculateKPIs,
  buildPersonMovementTimeline,
  formatDuration,
  buildAIExplanation,
  generateRecommendation,
  RawApiHistoryRecord
} from '../src/lib/incidentIntelligence';

describe('Incident & Movement Intelligence Engine', () => {
  const primarySampleTag = 'TAG_SAMPLE_001';
  const sampleApiRecord: RawApiHistoryRecord = {
    TagID: primarySampleTag,
    FirstName: 'John',
    LastName: '',
    LocationName: 'Zone2',
    EnterTime: '2026-09-07 07:06:21',
    LeaveTime: '2026-09-07 07:06:28',
    Duration: 0.0020980735277777779
  };

  it('TEST 1: Normalizes real API record without inventing unauthorized fields', () => {
    const normalized = normalizeApiRecord(sampleApiRecord, 0);

    expect(normalized.tagId).toBe(primarySampleTag);
    expect(normalized.firstName).toBe('John');
    expect(normalized.personName).toBe('John');
    expect(normalized.locationName).toBe('Zone2');
    expect(normalized.enterTime).toContain('2026-09-07');
    expect(normalized.leaveTime).toContain('2026-09-07');
    expect(normalized.durationSeconds).toBe(7);
    expect(normalized.durationFormatted).toBe('7s');
    expect(normalized.rawPayload.TagID).toBe(primarySampleTag);
  });

  it('TEST 2: Handles fallback person name when names are empty', () => {
    const namelessRecord: RawApiHistoryRecord = {
      TagID: primarySampleTag,
      FirstName: '',
      LastName: '',
      LocationName: 'Zone1',
      EnterTime: '2026-09-07 08:00:00',
      LeaveTime: '2026-09-07 08:05:00',
      Duration: 5
    };

    const normalized = normalizeApiRecord(namelessRecord, 0);
    expect(normalized.personName).toBe(`Personnel (${primarySampleTag.slice(-6)})`);
    expect(normalized.durationMinutes).toBe(5);
    expect(normalized.durationFormatted).toBe('5m');
  });

  it('TEST 3: Calculates Zone baselines and handles insufficient historical data threshold', () => {
    const twoEvents: RawApiHistoryRecord[] = [
      {
        TagID: 'TAG_1',
        FirstName: 'Alice',
        LocationName: 'ZoneA',
        EnterTime: '2026-09-07 07:00:00',
        LeaveTime: '2026-09-07 07:10:00'
      },
      {
        TagID: 'TAG_2',
        FirstName: 'Bob',
        LocationName: 'ZoneA',
        EnterTime: '2026-09-07 07:15:00',
        LeaveTime: '2026-09-07 07:25:00'
      }
    ];

    const normalizedTwo = twoEvents.map((e, idx) => normalizeApiRecord(e, idx));
    const baselinesTwo = calculateZoneBaselines(normalizedTwo);
    const zoneABaseline = baselinesTwo.get('ZoneA');

    expect(zoneABaseline).toBeDefined();
    expect(zoneABaseline?.eventCount).toBe(2);
    expect(zoneABaseline?.hasSufficientData).toBe(false); // < 3 events

    // Add 3rd event to reach threshold
    const threeEvents = [
      ...twoEvents,
      {
        TagID: 'TAG_3',
        FirstName: 'Charlie',
        LocationName: 'ZoneA',
        EnterTime: '2026-09-07 07:30:00',
        LeaveTime: '2026-09-07 07:40:00'
      }
    ];

    const normalizedThree = threeEvents.map((e, idx) => normalizeApiRecord(e, idx));
    const baselinesThree = calculateZoneBaselines(normalizedThree);
    const zoneABaselineSufficient = baselinesThree.get('ZoneA');

    expect(zoneABaselineSufficient?.eventCount).toBe(3);
    expect(zoneABaselineSufficient?.hasSufficientData).toBe(true);
    expect(zoneABaselineSufficient?.medianDurationMinutes).toBe(10);
    expect(zoneABaselineSufficient?.meanDurationMinutes).toBe(10);
  });

  it('TEST 4: Accurately detects Long Visit anomaly against historical baseline', () => {
    // 5 normal events of ~5 minutes dwell in ZoneB
    const baselineRecords: RawApiHistoryRecord[] = [
      { TagID: 'TAG_1', LocationName: 'ZoneB', EnterTime: '2026-09-07 07:00:00', LeaveTime: '2026-09-07 07:05:00' },
      { TagID: 'TAG_2', LocationName: 'ZoneB', EnterTime: '2026-09-07 07:10:00', LeaveTime: '2026-09-07 07:15:00' },
      { TagID: 'TAG_3', LocationName: 'ZoneB', EnterTime: '2026-09-07 07:20:00', LeaveTime: '2026-09-07 07:25:00' },
      { TagID: 'TAG_4', LocationName: 'ZoneB', EnterTime: '2026-09-07 07:30:00', LeaveTime: '2026-09-07 07:35:00' },
      // 1 anomaly event with 45 minutes dwell (9x median)
      { TagID: 'TAG_5', FirstName: 'David', LocationName: 'ZoneB', EnterTime: '2026-09-07 07:40:00', LeaveTime: '2026-09-07 08:25:00' }
    ];

    const analyzed = analyzeApiEvents(baselineRecords, { industry: 'construction' });
    const anomaly = analyzed.find(e => e.tagId === 'TAG_5');

    expect(anomaly).toBeDefined();
    expect(anomaly?.isAnomaly).toBe(true);
    expect(anomaly?.eventType).toBe('Long Visit');
    expect(anomaly?.severity).toBe('Critical');
    expect(anomaly?.explanation.whatHappened).toContain('extended dwell');
    expect(anomaly?.explanation.evidence).toContain('exceeding baseline');
    expect(anomaly?.explanation.recommendedAction).toContain('Verify if');
  });

  it('TEST 5: Accurately detects Repeated Visit anomaly within rolling window', () => {
    const repeatedVisits: RawApiHistoryRecord[] = [
      // 4 baseline visits from other people to establish baseline
      { TagID: 'TAG_OTHER_1', LocationName: 'SecureStaging', EnterTime: '2026-09-07 06:00:00', LeaveTime: '2026-09-07 06:05:00' },
      { TagID: 'TAG_OTHER_2', LocationName: 'SecureStaging', EnterTime: '2026-09-07 06:10:00', LeaveTime: '2026-09-07 06:15:00' },
      { TagID: 'TAG_OTHER_3', LocationName: 'SecureStaging', EnterTime: '2026-09-07 06:20:00', LeaveTime: '2026-09-07 06:25:00' },
      // Tag REP_1 visits 3 times in 25 minutes
      { TagID: 'REP_1', FirstName: 'Eve', LocationName: 'SecureStaging', EnterTime: '2026-09-07 07:00:00', LeaveTime: '2026-09-07 07:03:00' },
      { TagID: 'REP_1', FirstName: 'Eve', LocationName: 'SecureStaging', EnterTime: '2026-09-07 07:10:00', LeaveTime: '2026-09-07 07:13:00' },
      { TagID: 'REP_1', FirstName: 'Eve', LocationName: 'SecureStaging', EnterTime: '2026-09-07 07:22:00', LeaveTime: '2026-09-07 07:25:00' }
    ];

    const analyzed = analyzeApiEvents(repeatedVisits, { industry: 'healthcare' });
    const repeatedEvt = analyzed.find(e => e.tagId === 'REP_1');

    expect(repeatedEvt).toBeDefined();
    expect(repeatedEvt?.isAnomaly).toBe(true);
    expect(repeatedEvt?.eventType).toBe('Repeated Visit');
    expect(repeatedEvt?.explanation.whatHappened).toContain('Repeated');
    expect(repeatedEvt?.explanation.recommendedAction).toContain('Audit frequent re-entry cycles');
  });

  it('TEST 6: Calculates dynamic KPIs without hardcoded values', () => {
    const records: RawApiHistoryRecord[] = [
      { TagID: 'T1', LocationName: 'Zone1', EnterTime: '2026-09-07 07:00:00', LeaveTime: '2026-09-07 07:10:00' },
      { TagID: 'T2', LocationName: 'Zone2', EnterTime: '2026-09-07 07:00:00', LeaveTime: '2026-09-07 07:20:00' },
      { TagID: 'T1', LocationName: 'Zone2', EnterTime: '2026-09-07 07:25:00', LeaveTime: '2026-09-07 07:35:00' }
    ];

    const analyzed = analyzeApiEvents(records);
    const kpis = calculateKPIs(analyzed);

    expect(kpis.totalEvents).toBe(3);
    expect(kpis.uniquePeople).toBe(2); // T1, T2
    expect(kpis.activeZones).toBe(2);  // Zone1, Zone2
    expect(kpis.totalDwellMinutes).toBe(40); // 10 + 20 + 10
    expect(kpis.averageDurationMinutes).toBeCloseTo(13.33, 1);
  });

  it('TEST 7: Builds chronological person movement timeline in exact specified format', () => {
    const rawEvents: RawApiHistoryRecord[] = [
      { TagID: 'PERSON_A', LocationName: 'Zone2', EnterTime: '2026-09-07 07:06:21', LeaveTime: '2026-09-07 07:06:28' },
      { TagID: 'PERSON_A', LocationName: 'Zone2', EnterTime: '2026-09-07 07:06:28', LeaveTime: '2026-09-07 07:07:00' },
      { TagID: 'PERSON_A', LocationName: 'Zone1', EnterTime: '2026-09-07 07:15:42', LeaveTime: '2026-09-07 07:18:00' },
      { TagID: 'PERSON_A', LocationName: 'Zone3', EnterTime: '2026-09-07 07:22:18', LeaveTime: '2026-09-07 07:30:00' }
    ];

    const analyzed = analyzeApiEvents(rawEvents);
    const timeline = buildPersonMovementTimeline(analyzed, 'PERSON_A');

    expect(timeline.length).toBe(4);
    expect(timeline[0].transitionSummary).toBe('07:06:21 → Zone2');
    expect(timeline[1].transitionSummary).toBe('07:06:28 → Zone2');
    expect(timeline[2].transitionSummary).toBe('07:15:42 → Zone1');
    expect(timeline[3].transitionSummary).toBe('07:22:18 → Zone3');
  });

  it('TEST 8: Adapts terminology and recommendations across different industries dynamically', () => {
    const recConstruction = generateRecommendation('Long Visit', 'Critical', 'Tower Crane Alpha', 'John Doe', 60, {
      industry: 'construction',
      zoneLabel: 'Sector',
      personnelSingular: 'Tradesperson'
    });
    expect(recConstruction).toContain('tradesperson');
    expect(recConstruction).toContain('Sector');

    const recHealthcare = generateRecommendation('Long Visit', 'Critical', 'ICU Ward 3', 'Dr. Smith', 45, {
      industry: 'healthcare',
      zoneLabel: 'Unit',
      personnelSingular: 'Clinician'
    });
    expect(recHealthcare).toContain('clinical care duration');

    const recManufacturing = generateRecommendation('Long Visit', 'Critical', 'Robotic Assembly 4', 'Operator Mike', 50, {
      industry: 'manufacturing',
      zoneLabel: 'Cell',
      personnelSingular: 'Operator'
    });
    expect(recManufacturing).toContain('workstation cycle time');
  });

  it('TEST 9: Resolves employee full names using workforce registry in incident analysis', () => {
    const rawEvents: RawApiHistoryRecord[] = [
      {
        TagID: primarySampleTag,
        FirstName: 'John',
        LastName: '',
        LocationName: 'Zone2',
        EnterTime: '2026-09-07 07:06:21',
        LeaveTime: '2026-09-07 07:06:28',
        Duration: 0.1
      }
    ];

    const registry = [
      {
        id: primarySampleTag,
        firstName: 'John',
        lastName: 'Doe Testing',
        role: 'Senior Master Electrician'
      }
    ];

    const analyzed = analyzeApiEvents(rawEvents, { people: registry });
    expect(analyzed[0].personName).toBe('John Doe Testing');
    expect(analyzed[0].firstName).toBe('John');
    expect(analyzed[0].lastName).toBe('Doe Testing');
  });
});
