import { normalizeRecords, formatDurationHuman as formatDuration, RawMovementRecord, NormalizedMovementEvent } from '../src/lib/movementAnalytics.js';
import { auditDataQuality, AIInsightItem, InsightSeverity, InsightConfidence } from '../src/lib/aiInsightsEngine.js';

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStdDev(values: number[], mean?: number): number {
  if (values.length <= 1) return 0;
  const m = mean !== undefined ? mean : calculateMean(values);
  const variance = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function generateAIInsightsTest(rawRecords: RawMovementRecord[], industryConfig: any = {}) {
  const audit = auditDataQuality(rawRecords);
  const events = normalizeRecords(rawRecords, undefined, industryConfig);
  const insights: AIInsightItem[] = [];

  // A. Data Quality
  const isHealthy = audit.qualityScore === 100;
  const isCritical = audit.qualityScore < 70 || audit.issuesFound.malformedTimestamps > 10;
  const isHigh = audit.qualityScore < 85 || audit.issuesFound.duplicateRecords > 5;
  const severity: InsightSeverity = isCritical ? 'Critical' : isHigh ? 'High' : audit.qualityScore < 95 ? 'Medium' : 'Informational';
  const severityScore = isCritical ? 5 : isHigh ? 4 : audit.qualityScore < 95 ? 3 : 1;

  insights.push({
    id: 'insight-data-quality',
    category: 'Data Quality',
    severity,
    severityScore,
    title: isHealthy ? `Telemetry Data Quality Health: 100% Operational` : `Telemetry Data Quality Health: ${audit.qualityScore}%`,
    summary: isHealthy 
      ? `All ${audit.totalRecordsChecked} incoming RFID telemetry records fully conform to timestamp and zone integrity standards with zero packet errors.`
      : `Data audit identified ${audit.details.length} telemetry consistency observations across ${audit.totalRecordsChecked} records.`,
    currentValue: `${audit.qualityScore}% Quality Score`,
    baselineValue: '100% Target',
    difference: `${audit.qualityScore - 100}%`,
    percentageChange: audit.qualityScore - 100,
    confidence: audit.totalRecordsChecked >= 30 ? 'High' : 'Medium',
    confidenceScore: audit.totalRecordsChecked >= 30 ? 95 : 75,
    confidenceReason: `Evaluated ${audit.totalRecordsChecked} raw telemetry records for field completeness and timestamp syntax.`,
    whatHappened: isHealthy 
      ? `Verified ${audit.totalRecordsChecked} records with complete names, locations, valid durations, and chronological integrity.`
      : `Audited ${audit.totalRecordsChecked} records: ${audit.issuesFound.missingNames} missing names, ${audit.issuesFound.malformedTimestamps} timestamp issues, and ${audit.issuesFound.duplicateRecords} duplicates found.`,
    evidence: audit.details.join(' '),
    comparison: `Current Quality Score: ${audit.qualityScore}% vs Ideal Telemetry Standard: 100%.`,
    whyItMatters: 'Accurate and timely telemetry ensures high confidence in dwell calculations, route tracking, and occupancy figures.',
    recommendedAction: isHealthy ? 'Continue continuous telemetry stream monitoring.' : 'Verify RFID reader ingestion pipelines and ensure tag registration databases synchronize name fields.',
    dataDistinction: 'Derived metric',
    affectedRecordCount: audit.totalRecordsChecked,
    detectedAt: new Date().toISOString(),
    priorityRank: severityScore * 100 + 40
  });

  const zoneEventsMap = new Map<string, NormalizedMovementEvent[]>();
  const personEventsMap = new Map<string, NormalizedMovementEvent[]>();
  const hourlyCountMap = new Map<number, number>();

  events.forEach(e => {
    const zList = zoneEventsMap.get(e.locationName) || [];
    zList.push(e);
    zoneEventsMap.set(e.locationName, zList);

    const pList = personEventsMap.get(e.tagId) || [];
    pList.push(e);
    personEventsMap.set(e.tagId, pList);

    hourlyCountMap.set(e.hourOfDay, (hourlyCountMap.get(e.hourOfDay) || 0) + 1);
  });

  const totalEvents = events.length;
  const uniquePeopleCount = personEventsMap.size;
  const uniqueZonesCount = zoneEventsMap.size;

  // B. Zone Activity Anomaly & Concentration
  const zoneCounts: { zone: string; count: number; events: NormalizedMovementEvent[] }[] = [];
  zoneEventsMap.forEach((zEvents, zName) => {
    zoneCounts.push({ zone: zName, count: zEvents.length, events: zEvents });
  });

  const zoneCountValues = zoneCounts.map(z => z.count);
  const zoneCountMean = calculateMean(zoneCountValues);
  const zoneCountStd = calculateStdDev(zoneCountValues, zoneCountMean);

  zoneCounts.forEach(z => {
    const deviation = z.count - zoneCountMean;
    const pctChange = zoneCountMean > 0 ? Math.round((deviation / zoneCountMean) * 100) : 0;
    const zScore = zoneCountStd > 0 ? deviation / zoneCountStd : 0;
    const pctOfTotal = totalEvents > 0 ? Math.round((z.count / totalEvents) * 100) : 0;

    const isSurge = (pctChange >= 20 && z.count >= 8 && (pctOfTotal >= 55 || zScore >= 0.8 || pctChange >= 35)) || (pctOfTotal >= 55 && uniqueZonesCount >= 2);

    if (isSurge) {
      const isHigh = pctOfTotal >= 65 || pctChange >= 60 || zScore >= 1.8;
      const severity: InsightSeverity = isHigh ? 'High' : 'Medium';
      const severityScore = isHigh ? 4 : 3;
      const confidence: InsightConfidence = z.count >= 20 ? 'High' : 'Medium';
      const confScore = z.count >= 20 ? 92 : 75;

      insights.push({
        id: `insight-zone-surge-${z.zone.replace(/\s+/g, '-').toLowerCase()}`,
        category: 'Zone Activity Anomaly',
        severity,
        severityScore,
        title: `${z.zone} Activity Volume Surge (${pctOfTotal}% Site Share, +${pctChange}%)`,
        summary: `${z.zone} recorded ${z.count} visits (${pctOfTotal}% of total facility activity), substantially exceeding the peer average baseline of ${Math.round(zoneCountMean)} visits.`,
        affectedZone: z.zone,
        currentValue: `${z.count} visits (${pctOfTotal}%)`,
        baselineValue: `${Math.round(zoneCountMean)} visits`,
        difference: `+${pctChange}%`,
        percentageChange: pctChange,
        confidence,
        confidenceScore: confScore,
        confidenceReason: `Based on ${totalEvents} total movement records across ${uniqueZonesCount} monitored zones (Z-score: ${zScore.toFixed(1)}).`,
        whatHappened: `${z.zone} registered ${z.count} movement events, representing the dominant traffic center across the site.`,
        evidence: `${z.count} movement events were recorded in ${z.zone} during the evaluation timeframe compared with the peer baseline of ${Math.round(zoneCountMean)} visits.`,
        comparison: `Current: ${z.count} visits (${pctOfTotal}%) vs Baseline: ${Math.round(zoneCountMean)} visits (+${pctChange}%).`,
        whyItMatters: `High movement concentration in ${z.zone} indicates sustained foot traffic and concentrated operational throughput.`,
        recommendedAction: `Review ${z.zone} activity logs and operational schedules to determine whether the surge aligns with expected tasks.`,
        dataDistinction: 'Statistical anomaly',
        affectedRecordCount: z.count,
        detectedAt: new Date().toISOString(),
        relatedEvents: z.events.slice(0, 10),
        priorityRank: severityScore * 100 + Math.min(50, pctChange) + 20
      });
    }
  });

  // C. Cross-Zone Dwell Disparity
  if (zoneCounts.length >= 2) {
    const zoneDwells: { zone: string; meanDwell: number; count: number }[] = [];
    zoneEventsMap.forEach((zEvents, zName) => {
      const valid = zEvents.filter(e => !e.isOngoing && e.durationMinutes > 0);
      if (valid.length >= 5) {
        zoneDwells.push({
          zone: zName,
          meanDwell: calculateMean(valid.map(e => e.durationMinutes)),
          count: valid.length
        });
      }
    });

    if (zoneDwells.length >= 2) {
      zoneDwells.sort((a, b) => b.meanDwell - a.meanDwell);
      const highZ = zoneDwells[0];
      const lowZ = zoneDwells[zoneDwells.length - 1];
      if (lowZ.meanDwell > 0 && highZ.meanDwell >= lowZ.meanDwell * 2.5) {
        const ratio = Math.round((highZ.meanDwell / lowZ.meanDwell) * 10) / 10;
        const pctDiff = Math.round(((highZ.meanDwell - lowZ.meanDwell) / lowZ.meanDwell) * 100);
        insights.push({
          id: `insight-dwell-disparity-${highZ.zone.toLowerCase()}-${lowZ.zone.toLowerCase()}`,
          category: 'Zone Activity Anomaly',
          severity: 'Medium',
          severityScore: 3,
          title: `Zone Dwell Disparity: ${highZ.zone} (${formatDuration(highZ.meanDwell)}) vs ${lowZ.zone} (${formatDuration(lowZ.meanDwell)})`,
          summary: `${highZ.zone} exhibits an average dwell time of ${formatDuration(highZ.meanDwell)}, which is ${ratio}× higher than ${lowZ.zone} (${formatDuration(lowZ.meanDwell)}).`,
          affectedZone: highZ.zone,
          currentValue: formatDuration(highZ.meanDwell),
          baselineValue: formatDuration(lowZ.meanDwell),
          difference: `+${pctDiff}%`,
          percentageChange: pctDiff,
          confidence: 'High',
          confidenceScore: 88,
          confidenceReason: `Derived from ${highZ.count} visits in ${highZ.zone} and ${lowZ.count} visits in ${lowZ.zone}.`,
          whatHappened: `Clear functional differentiation observed: ${lowZ.zone} acts as a high-throughput transit gateway, while ${highZ.zone} is an extended stationary work zone.`,
          evidence: `Average dwell in ${highZ.zone}: ${formatDuration(highZ.meanDwell)} across ${highZ.count} completed visits vs ${formatDuration(lowZ.meanDwell)} across ${lowZ.count} completed visits in ${lowZ.zone}.`,
          comparison: `${highZ.zone}: ${formatDuration(highZ.meanDwell)} vs ${lowZ.zone}: ${formatDuration(lowZ.meanDwell)} (+${pctDiff}%).`,
          whyItMatters: 'Identifies core functional division between transit portals and persistent task locations for capacity planning.',
          recommendedAction: `Ensure workstation facilities in ${highZ.zone} match prolonged occupancy profiles.`,
          dataDistinction: 'Derived metric',
          affectedRecordCount: highZ.count + lowZ.count,
          detectedAt: new Date().toISOString(),
          priorityRank: 3 * 100 + 25
        });
      }
    }
  }

  // D. Unusual Duration
  zoneEventsMap.forEach((zEvents, zName) => {
    const validDwellEvents = zEvents.filter(e => !e.isOngoing && e.durationMinutes > 0);
    if (validDwellEvents.length >= 3) {
      const durations = validDwellEvents.map(e => e.durationMinutes);
      const meanDwell = calculateMean(durations);
      const stdDwell = calculateStdDev(durations, meanDwell);

      // Sort by longest dwell to catch top outliers
      const outliers = validDwellEvents.filter(e => {
        const diff = e.durationMinutes - meanDwell;
        const zScore = stdDwell > 0 ? diff / stdDwell : 0;
        const pctDiff = meanDwell > 0 ? Math.round((diff / meanDwell) * 100) : 0;
        return (e.durationMinutes >= 2.0 && (pctDiff >= 120 || zScore >= 1.8 || e.durationMinutes >= meanDwell * 2.5)) || e.durationMinutes >= 5.0;
      }).sort((a, b) => b.durationMinutes - a.durationMinutes);

      outliers.slice(0, 3).forEach(e => {
        const diff = e.durationMinutes - meanDwell;
        const zScore = stdDwell > 0 ? diff / stdDwell : 0;
        const pctDiff = meanDwell > 0 ? Math.round((diff / meanDwell) * 100) : 0;

        const isCritical = e.durationMinutes >= 60 || pctDiff >= 400;
        const isHigh = e.durationMinutes >= 5.0 || pctDiff >= 200 || zScore >= 2.2;
        const severity: InsightSeverity = isCritical ? 'Critical' : isHigh ? 'High' : 'Medium';
        const severityScore = isCritical ? 5 : isHigh ? 4 : 3;
        const personDisplay = e.personName || e.tagId;

        const id = `insight-dwell-${e.tagId}-${zName.toLowerCase()}-${Math.round(e.durationMinutes)}`;
        if (!insights.find(i => i.id === id)) {
          insights.push({
            id,
            category: 'Unusual Duration',
            severity,
            severityScore,
            title: `Prolonged Stay in ${zName} by ${personDisplay} (${e.durationFormatted})`,
            summary: `${personDisplay} remained in ${zName} for ${e.durationFormatted}, which is ${pctDiff > 0 ? `+${pctDiff}%` : `${pctDiff}%`} vs the zone mean (${formatDuration(meanDwell)}).`,
            affectedPerson: e.personName,
            affectedTagId: e.tagId,
            affectedZone: zName,
            currentValue: e.durationFormatted,
            baselineValue: formatDuration(meanDwell),
            difference: `+${pctDiff}%`,
            percentageChange: pctDiff,
            confidence: validDwellEvents.length >= 10 ? 'High' : 'Medium',
            confidenceScore: validDwellEvents.length >= 10 ? 92 : 75,
            confidenceReason: `Derived from ${validDwellEvents.length} recorded visits in ${zName} (Mean: ${formatDuration(meanDwell)}, StdDev: ${formatDuration(stdDwell)}).`,
            whatHappened: `${personDisplay} completed a continuous stay of ${e.durationFormatted} in ${zName} starting at ${e.enterTime}.`,
            evidence: `Stay of ${e.durationFormatted} exceeds historical zone baseline mean of ${formatDuration(meanDwell)} (Z-score: ${zScore.toFixed(1)}).`,
            comparison: `Current Visit: ${e.durationFormatted} vs Zone Mean: ${formatDuration(meanDwell)} (+${pctDiff}%).`,
            whyItMatters: 'Extended dwell duration differs from standard transit patterns and indicates stationary task execution or potential idle duration.',
            recommendedAction: `Confirm whether extended presence in ${zName} corresponds to planned operational activity.`,
            dataDistinction: 'Statistical anomaly',
            affectedRecordCount: 1,
            detectedAt: e.enterTime,
            relatedEvents: [e],
            priorityRank: severityScore * 100 + Math.min(50, pctDiff / 10) + 10
          });
        }
      });
    }
  });

  // E. Repeated Visits & High-Cadence Transit
  zoneEventsMap.forEach((zEvents, zName) => {
    const visitsPerTag = new Map<string, { tagId: string; name: string; count: number; events: NormalizedMovementEvent[] }>();
    zEvents.forEach(e => {
      const cur = visitsPerTag.get(e.tagId) || { tagId: e.tagId, name: e.personName, count: 0, events: [] };
      cur.count++;
      cur.events.push(e);
      visitsPerTag.set(e.tagId, cur);
    });

    const visitCounts = Array.from(visitsPerTag.values()).map(v => v.count);
    const meanVisits = calculateMean(visitCounts);

    visitsPerTag.forEach(item => {
      const isHighVolume = item.count >= 15;
      const relativeDiff = meanVisits > 0 ? Math.round(((item.count - meanVisits) / meanVisits) * 100) : 0;

      if ((item.count >= 10 && (relativeDiff >= 40 || visitCounts.length <= 3)) || isHighVolume) {
        const isHigh = item.count >= 50 || relativeDiff >= 150;
        const severity: InsightSeverity = isHigh ? 'High' : 'Medium';
        const severityScore = isHigh ? 4 : 3;
        const personDisplay = item.name || item.tagId;

        insights.push({
          id: `insight-repeat-${item.tagId}-${zName.replace(/\s+/g, '-').toLowerCase()}`,
          category: 'Repeated Visits',
          severity,
          severityScore,
          title: `High-Frequency Visits to ${zName} by ${personDisplay} (${item.count} Visits)`,
          summary: `${personDisplay} recorded ${item.count} separate entries into ${zName}, representing an intensive cyclic operational transit loop.`,
          affectedPerson: item.name,
          affectedTagId: item.tagId,
          affectedZone: zName,
          currentValue: `${item.count} visits`,
          baselineValue: visitCounts.length > 1 ? `${meanVisits.toFixed(1)} visits` : 'Standard Work Schedule',
          difference: `+${item.count} visits`,
          percentageChange: relativeDiff,
          confidence: zEvents.length >= 20 ? 'High' : 'Medium',
          confidenceScore: zEvents.length >= 20 ? 90 : 75,
          confidenceReason: `Evaluated across ${zEvents.length} total visits logged in ${zName}.`,
          whatHappened: `${personDisplay} entered ${zName} ${item.count} times within the observed operational window.`,
          evidence: `${item.count} entry records observed for tag ${item.tagId} in ${zName}.`,
          comparison: `Current: ${item.count} visits vs Standard Cohort Cadence.`,
          whyItMatters: 'Repeated cyclic entry reflects rapid material handling, inspection sweeps, or transition bottleneck.',
          recommendedAction: 'Verify whether frequent transit is required by task order or if logistics staging can reduce trip count.',
          dataDistinction: 'Derived metric',
          affectedRecordCount: item.count,
          detectedAt: item.events[item.events.length - 1]?.enterTime || new Date().toISOString(),
          relatedEvents: item.events.slice(0, 10),
          priorityRank: severityScore * 100 + Math.min(40, item.count) + 15
        });
      }
    });
  });

  // F. Person High-Mobility Anomaly
  const personActivityList: { tagId: string; name: string; count: number; totalDwell: number; events: NormalizedMovementEvent[] }[] = [];
  personEventsMap.forEach((pEvents, pTag) => {
    const totalDwell = pEvents.reduce((acc, e) => acc + e.durationMinutes, 0);
    personActivityList.push({
      tagId: pTag,
      name: pEvents[0]?.personName || pTag,
      count: pEvents.length,
      totalDwell,
      events: pEvents
    });
  });

  personActivityList.forEach(p => {
    if (p.count >= 20) {
      const isHigh = p.count >= 60;
      const severity: InsightSeverity = isHigh ? 'High' : 'Medium';
      const severityScore = isHigh ? 4 : 3;
      const zonesVisited = Array.from(new Set(p.events.map(e => e.locationName))).length;

      insights.push({
        id: `insight-person-mobility-${p.tagId}`,
        category: 'Person Activity Anomaly',
        severity,
        severityScore,
        title: `High Transit Volume: ${p.name} (${p.count} Movements)`,
        summary: `${p.name} registered ${p.count} movement events across ${zonesVisited} zones, demonstrating exceptionally high operational mobility.`,
        affectedPerson: p.name,
        affectedTagId: p.tagId,
        currentValue: `${p.count} events`,
        baselineValue: 'Cohort Standard',
        difference: `+${p.count} events`,
        confidence: events.length >= 20 ? 'High' : 'Medium',
        confidenceScore: 92,
        confidenceReason: `Calculated from ${events.length} total events logged for tag ${p.tagId}.`,
        whatHappened: `${p.name} navigated between ${zonesVisited} zones with cumulative recorded dwell of ${formatDuration(p.totalDwell)}.`,
        evidence: `${p.count} events recorded for tag ${p.tagId} with active RFID badge pings across all active portal readers.`,
        comparison: `Current: ${p.count} transitions across the facility.`,
        whyItMatters: 'High transit frequency identifies key mobility coordinators or personnel undergoing intensive inter-zone shuttle routines.',
        recommendedAction: 'Verify whether transition cadence is consistent with assigned work orders.',
        dataDistinction: 'Statistical anomaly',
        affectedRecordCount: p.count,
        detectedAt: p.events[p.events.length - 1]?.enterTime || new Date().toISOString(),
        relatedEvents: p.events.slice(0, 10),
        priorityRank: severityScore * 100 + Math.min(40, p.count / 2) + 15
      });
    }
  });

  // G. Peak Hourly Traffic Surge & Acceleration
  const activeHours = Array.from(hourlyCountMap.keys()).sort((a, b) => a - b);
  if (activeHours.length >= 2) {
    let maxHour = activeHours[0];
    let maxCount = hourlyCountMap.get(maxHour) || 0;
    activeHours.forEach(h => {
      const c = hourlyCountMap.get(h) || 0;
      if (c > maxCount) {
        maxCount = c;
        maxHour = h;
      }
    });

    const prevHour = maxHour - 1;
    const prevCount = hourlyCountMap.get(prevHour);
    if (prevCount !== undefined && prevCount > 0) {
      const surge = Math.round(((maxCount - prevCount) / prevCount) * 100);
      if (surge >= 20 && maxCount >= 15) {
        const hourStr = `${String(maxHour).padStart(2, '0')}:00`;
        const prevHourStr = `${String(prevHour).padStart(2, '0')}:00`;
        insights.push({
          id: `insight-hourly-surge-${maxHour}`,
          category: 'Emerging Pattern',
          severity: surge >= 50 ? 'High' : 'Medium',
          severityScore: surge >= 50 ? 4 : 3,
          title: `Peak Traffic Surge at ${hourStr} (+${surge}%)`,
          summary: `Facility movement surged to ${maxCount} events during the ${hourStr} window, up from ${prevCount} events at ${prevHourStr}.`,
          currentValue: `${maxCount} events (${hourStr})`,
          baselineValue: `${prevCount} events (${prevHourStr})`,
          difference: `+${surge}%`,
          percentageChange: surge,
          confidence: 'High',
          confidenceScore: 90,
          confidenceReason: `Hourly chronological grouping of ${totalEvents} telemetry events across ${activeHours.length} active hours.`,
          whatHappened: `Activity spiked by ${surge}% within a 60-minute window, marking the peak operational cadence of the shift.`,
          evidence: `${maxCount} events observed at ${hourStr} compared to ${prevCount} at ${prevHourStr}.`,
          comparison: `Peak Hour (${hourStr}): ${maxCount} events vs Previous Hour (${prevHourStr}): ${prevCount} events (+${surge}%).`,
          whyItMatters: 'Peak hours indicate shift handovers, material distribution spikes, or coordinated task initiations.',
          recommendedAction: 'Align supervision and portal throughput with the identified peak traffic window.',
          dataDistinction: 'Derived metric',
          affectedRecordCount: maxCount,
          detectedAt: new Date().toISOString(),
          priorityRank: 3 * 100 + Math.min(40, surge / 2) + 10
        });
      }
    }
  }

  // H. Cyclic Shuttle Transit Loop
  if (events.length >= 10 && uniqueZonesCount === 2) {
    const zoneNames = Array.from(zoneEventsMap.keys());
    insights.push({
      id: `insight-shuttle-loop-${zoneNames.map(z => z.toLowerCase()).join('-')}`,
      category: 'Emerging Pattern',
      severity: 'Medium',
      severityScore: 3,
      title: `Active Shuttle Transit Loop (${zoneNames[0]} ⇄ ${zoneNames[1]})`,
      summary: `Continuous high-speed shuttling detected between ${zoneNames[0]} and ${zoneNames[1]} with ${totalEvents} transitions logged.`,
      currentValue: `${totalEvents} transitions`,
      baselineValue: 'Isolated Station Presence',
      difference: `+${totalEvents} transit cycles`,
      confidence: 'High',
      confidenceScore: 94,
      confidenceReason: `Continuous oscillation pattern observed across ${totalEvents} chronological records.`,
      whatHappened: `Workforce movements consistently alternate between ${zoneNames[0]} and ${zoneNames[1]} across the entire monitoring interval.`,
      evidence: `${zoneCounts.map(z => `${z.zone}: ${z.count} visits`).join(', ')}.`,
      comparison: `Dynamic multi-zone transit vs static stationary presence.`,
      whyItMatters: 'Continuous transit cycles signify heavy transfer operations, material staging loops, or inter-area transport.',
      recommendedAction: 'Assess whether staging parts closer to workstations can reduce inter-zone shuttle frequency.',
      dataDistinction: 'Derived metric',
      affectedRecordCount: totalEvents,
      detectedAt: events[events.length - 1]?.enterTime || new Date().toISOString(),
      priorityRank: 3 * 100 + 20
    });
  }

  // Sort
  insights.sort((a, b) => b.severityScore - a.severityScore || b.priorityRank - a.priorityRank);

  return {
    totalInsights: insights.length,
    criticalAndHighCount: insights.filter(i => i.severity === 'Critical' || i.severity === 'High').length,
    emergingPatternsCount: insights.filter(i => i.category === 'Emerging Pattern').length,
    averageConfidenceScore: insights.length > 0 ? Math.round(insights.reduce((acc, i) => acc + i.confidenceScore, 0) / insights.length) : 0,
    dataQualityScore: audit.qualityScore,
    insights,
    dataQualityAudit: audit
  };
}

async function test() {
  const res = await fetch('http://localhost:3000/api/GetHistoryRecords/0/200');
  const records = await res.json();
  const summary = generateAIInsightsTest(records);
  console.log('=== TEST RESULT ===');
  console.log('Total insights:', summary.totalInsights);
  console.log('Critical & High:', summary.criticalAndHighCount);
  console.log('Emerging:', summary.emergingPatternsCount);
  console.log('Avg Confidence:', summary.averageConfidenceScore);
  console.log('\nInsights breakdown:');
  summary.insights.forEach((i, idx) => {
    console.log(`${idx + 1}. [${i.severity.toUpperCase()}] (${i.category}) ${i.title}`);
  });

  const { queryAskAperture } = await import('../src/lib/aiInsightsEngine.js');
  console.log('\n=== ASK APERTURE RESPONSE ===');
  const qAns = queryAskAperture('What unusual patterns were detected today?', records, summary.insights, {});
  console.log(qAns.answer);
}

test().catch(e => console.error(e));
