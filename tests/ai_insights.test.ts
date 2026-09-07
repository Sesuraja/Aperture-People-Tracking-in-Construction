import { describe, it, expect } from 'vitest';
import { 
  auditDataQuality, 
  generateAIInsights, 
  queryAskAperture 
} from '../src/lib/aiInsightsEngine';
import { RawMovementRecord } from '../src/lib/movementAnalytics';

describe('Aperture AI Insights Intelligence Engine', () => {

  const sampleTelemetryRecords: RawMovementRecord[] = [
    // Standard visits in Zone1
    {
      TagID: 'TAG-A1',
      FirstName: 'Alice',
      LastName: 'Smith',
      LocationName: 'Zone1',
      EnterTime: '2026-09-07 08:00:00',
      LeaveTime: '2026-09-07 08:10:00',
      Duration: '10' // 10 mins
    },
    {
      TagID: 'TAG-B2',
      FirstName: 'Bob',
      LastName: 'Jones',
      LocationName: 'Zone1',
      EnterTime: '2026-09-07 08:15:00',
      LeaveTime: '2026-09-07 08:25:00',
      Duration: '10'
    },
    // Zone2 with high traffic surge & repeated visits by Carol
    ...Array.from({ length: 12 }).map((_, i) => ({
      TagID: 'TAG-C3',
      FirstName: 'Carol',
      LastName: 'White',
      LocationName: 'Zone2',
      EnterTime: `2026-09-07 09:${String(i * 4).padStart(2, '0')}:00`,
      LeaveTime: `2026-09-07 09:${String(i * 4 + 2).padStart(2, '0')}:00`,
      Duration: '2'
    })),
    // Other workers in Zone2
    ...Array.from({ length: 8 }).map((_, i) => ({
      TagID: `TAG-D${i}`,
      FirstName: `Worker${i}`,
      LastName: '',
      LocationName: 'Zone2',
      EnterTime: `2026-09-07 10:${String(i * 5).padStart(2, '0')}:00`,
      LeaveTime: `2026-09-07 10:${String(i * 5 + 4).padStart(2, '0')}:00`,
      Duration: '4'
    })),
    // Zone3 with unusual dwell outlier
    {
      TagID: 'TAG-E5',
      FirstName: 'Evan',
      LastName: 'Davis',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 11:00:00',
      LeaveTime: '2026-09-07 11:15:00',
      Duration: '15'
    },
    {
      TagID: 'TAG-E5',
      FirstName: 'Evan',
      LastName: 'Davis',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 12:00:00',
      LeaveTime: '2026-09-07 12:12:00',
      Duration: '12'
    },
    {
      TagID: 'TAG-E5',
      FirstName: 'Evan',
      LastName: 'Davis',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 13:00:00',
      LeaveTime: '2026-09-07 13:14:00',
      Duration: '14'
    },
    {
      TagID: 'TAG-E5',
      FirstName: 'Evan',
      LastName: 'Davis',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 13:30:00',
      LeaveTime: '2026-09-07 13:40:00',
      Duration: '10'
    },
    {
      TagID: 'TAG-E5',
      FirstName: 'Evan',
      LastName: 'Davis',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 14:00:00',
      LeaveTime: '2026-09-07 14:15:00',
      Duration: '15'
    },
    // The extreme dwell outlier in Zone3: 120 minutes!
    {
      TagID: 'TAG-F6',
      FirstName: 'Frank',
      LastName: 'Miller',
      LocationName: 'Zone3',
      EnterTime: '2026-09-07 15:00:00',
      LeaveTime: '2026-09-07 17:00:00',
      Duration: '120' // 2 hours in Zone3
    },
    // Off-hours activity (23:30)
    {
      TagID: 'TAG-G7',
      FirstName: 'George',
      LastName: 'Clark',
      LocationName: 'Zone1',
      EnterTime: '2026-09-07 23:30:00',
      LeaveTime: '2026-09-07 23:45:00',
      Duration: '15'
    },
    // Previous day records to test multi-day trends
    {
      TagID: 'TAG-A1',
      FirstName: 'Alice',
      LastName: 'Smith',
      LocationName: 'Zone1',
      EnterTime: '2026-09-06 08:00:00',
      LeaveTime: '2026-09-06 08:10:00',
      Duration: '10'
    },
    {
      TagID: 'TAG-B2',
      FirstName: 'Bob',
      LastName: 'Jones',
      LocationName: 'Zone1',
      EnterTime: '2026-09-06 09:00:00',
      LeaveTime: '2026-09-06 09:10:00',
      Duration: '10'
    }
  ];

  describe('Data Quality Auditor', () => {
    it('audits clean records with high quality score', () => {
      const cleanRecords: RawMovementRecord[] = [
        {
          TagID: 'T1',
          FirstName: 'John',
          LastName: 'Doe',
          LocationName: 'Zone1',
          EnterTime: '2026-09-07 10:00:00',
          LeaveTime: '2026-09-07 10:10:00',
          Duration: 10
        }
      ];
      const audit = auditDataQuality(cleanRecords);
      expect(audit.qualityScore).toBe(100);
      expect(audit.issuesFound.missingNames).toBe(0);
      expect(audit.issuesFound.malformedTimestamps).toBe(0);
      expect(audit.issuesFound.duplicateRecords).toBe(0);
    });

    it('flags missing names, inverted timestamps, and duplicate records', () => {
      const flawedRecords: RawMovementRecord[] = [
        // Missing name
        {
          TagID: 'T1',
          FirstName: '',
          LastName: '',
          LocationName: 'Zone1',
          EnterTime: '2026-09-07 10:00:00',
          LeaveTime: '2026-09-07 10:10:00',
          Duration: 10
        },
        // Inverted timestamp (leave < enter)
        {
          TagID: 'T2',
          FirstName: 'Bob',
          LastName: 'Smith',
          LocationName: 'Zone1',
          EnterTime: '2026-09-07 12:00:00',
          LeaveTime: '2026-09-07 11:00:00',
          Duration: -60
        },
        // Duplicate of above
        {
          TagID: 'T2',
          FirstName: 'Bob',
          LastName: 'Smith',
          LocationName: 'Zone1',
          EnterTime: '2026-09-07 12:00:00',
          LeaveTime: '2026-09-07 11:00:00',
          Duration: -60
        }
      ];
      const audit = auditDataQuality(flawedRecords);
      expect(audit.issuesFound.missingNames).toBe(1);
      expect(audit.issuesFound.malformedTimestamps).toBe(2);
      expect(audit.issuesFound.invalidDurations).toBe(2);
      expect(audit.issuesFound.duplicateRecords).toBe(1);
      expect(audit.qualityScore).toBeLessThan(80);
    });
  });

  describe('AI Insights Generation Pipeline', () => {
    it('generates prioritized, evidence-based insights across multiple categories', () => {
      const result = generateAIInsights(sampleTelemetryRecords, {
        industry: 'Construction',
        subIndustry: 'Commercial Building',
        zoneLabel: 'Zone',
        personnelPlural: 'Workers'
      });

      expect(result.totalInsights).toBeGreaterThan(0);
      expect(result.insights.length).toBe(result.totalInsights);
      expect(result.dataQualityScore).toBeGreaterThan(0);

      // Verify category existence
      const categories = result.insights.map(i => i.category);
      expect(categories).toContain('Zone Activity Anomaly'); // Zone2 surge
      expect(categories).toContain('Unusual Duration');      // Frank's 120 min dwell
      expect(categories).toContain('Repeated Visits');       // Carol's 12 visits to Zone2
      expect(categories).toContain('Time Pattern Anomaly');  // Off-hours visit at 23:30

      // Verify structure of an insight card
      const zoneInsight = result.insights.find(i => i.category === 'Zone Activity Anomaly');
      expect(zoneInsight).toBeDefined();
      expect(zoneInsight?.severity).toBeDefined();
      expect(zoneInsight?.confidence).toBeDefined();
      expect(zoneInsight?.confidenceReason).toBeDefined();
      expect(zoneInsight?.evidence).toContain('Zone2');
      expect(zoneInsight?.whatHappened).toBeDefined();
      expect(zoneInsight?.comparison).toBeDefined();
      expect(zoneInsight?.whyItMatters).toBeDefined();
      expect(zoneInsight?.recommendedAction).toBeDefined();

      // Ensure no hallucinated terms
      const allText = JSON.stringify(result.insights);
      expect(allText).not.toContain('GPS');
      expect(allText).not.toContain('temperature');
      expect(allText).not.toContain('crane breakdown');
      expect(allText).not.toContain('safety violation');
    });

    it('handles empty dataset gracefully without crashing or fabricating', () => {
      const emptyResult = generateAIInsights([]);
      expect(emptyResult.totalInsights).toBe(0);
      expect(emptyResult.insights).toHaveLength(0);
      expect(emptyResult.dataQualityScore).toBe(100);
    });
  });

  describe('Ask Aperture Grounded Query Engine', () => {
    it('answers "Which zone had the most activity?" grounded in real data', () => {
      const summary = generateAIInsights(sampleTelemetryRecords);
      const res = queryAskAperture('Which zone had the most activity?', sampleTelemetryRecords, summary.insights);

      expect(res.isGrounded).toBe(true);
      expect(res.confidence).toBe('High');
      expect(res.answer).toContain('Zone2');
      expect(res.answer).toContain('visits');
    });

    it('answers "Who visited Zone2 most frequently?" with exact visitor metrics', () => {
      const summary = generateAIInsights(sampleTelemetryRecords);
      const res = queryAskAperture('Who visited Zone2 most frequently?', sampleTelemetryRecords, summary.insights);

      expect(res.isGrounded).toBe(true);
      expect(res.answer).toContain('Carol');
      expect(res.answer).toContain('Zone2');
      expect(res.answer).toContain('12 visits');
    });

    it('answers "Which zone has the longest average dwell time?"', () => {
      const summary = generateAIInsights(sampleTelemetryRecords);
      const res = queryAskAperture('Which zone has the longest average dwell time?', sampleTelemetryRecords, summary.insights);

      expect(res.isGrounded).toBe(true);
      expect(res.answer).toContain('Zone3');
      expect(res.answer).toContain('longest average dwell');
    });

    it('answers "What unusual patterns were detected today?"', () => {
      const summary = generateAIInsights(sampleTelemetryRecords);
      const res = queryAskAperture('What unusual patterns were detected today?', sampleTelemetryRecords, summary.insights);

      expect(res.isGrounded).toBe(true);
      expect(res.answer).toContain('Telemetry Anomalies');
    });

    it('answers "Compare today\'s activity with yesterday"', () => {
      const summary = generateAIInsights(sampleTelemetryRecords);
      const res = queryAskAperture("Compare today's activity with yesterday", sampleTelemetryRecords, summary.insights);

      expect(res.isGrounded).toBe(true);
      expect(res.answer).toContain('2026-09-06');
      expect(res.answer).toContain('2026-09-07');
    });

    it('returns strict fallback for out-of-bounds questions without hallucinating', () => {
      const summary = generateAIInsights(sampleTelemetryRecords);
      const res = queryAskAperture('What is the weather tomorrow in Paris?', sampleTelemetryRecords, summary.insights);

      expect(res.isGrounded).toBe(false);
      expect(res.confidence).toBe('Low');
      expect(res.answer).toContain("I don't have enough data to determine that");
    });

    it('answers worker location query using workforce registry for name resolution', () => {
      const sampleTag = 'TAG_SAMPLE_001';
      const records: RawMovementRecord[] = [
        {
          TagID: sampleTag,
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
          id: sampleTag,
          firstName: 'John',
          lastName: 'Miller',
          role: 'Senior Master Electrician'
        }
      ];

      const res = queryAskAperture('Where is John Miller?', records, [], { people: registry });
      expect(res.isGrounded).toBe(true);
      expect(res.answer).toContain('John Miller');
      expect(res.answer).toContain('Zone2');
    });
  });
});
