import { useState, useEffect } from 'react';

export const EDT_TIMEZONE = 'America/New_York';
export const TIMEZONE_LABEL = 'EDT';

/**
 * Safely parses any date input (Date object, timestamp number, ISO string,
 * or raw space-separated database timestamp "YYYY-MM-DD HH:mm:ss")
 * treating timezone-less strings as UTC so they can be reliably converted to EDT.
 */
export function parseDateInput(dateInput?: string | Date | number | null): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? new Date() : dateInput;
  }
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  const str = String(dateInput).trim();
  if (!str) return new Date();

  // If format is "YYYY-MM-DD HH:mm:ss" without timezone offset, treat as UTC
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) {
    const isoUtc = str.replace(' ', 'T') + (str.endsWith('Z') ? '' : 'Z');
    const d = new Date(isoUtc);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export interface FormatEdtTimeOptions {
  includeSeconds?: boolean;
  includeSuffix?: boolean; // Appends "EDT"
  hour12?: boolean;
}

/**
 * Formats any timestamp into Eastern Daylight Time (EDT / America/New_York)
 * Examples:
 *   formatEdtTime() => "10:06:24 AM EDT"
 *   formatEdtTime(date, { includeSeconds: false }) => "10:06 AM EDT"
 */
export function formatEdtTime(
  dateInput?: string | Date | number | null,
  options: FormatEdtTimeOptions = {}
): string {
  const d = parseDateInput(dateInput);
  const includeSeconds = options.includeSeconds !== undefined ? options.includeSeconds : true;
  const includeSuffix = options.includeSuffix !== undefined ? options.includeSuffix : true;
  const hour12 = options.hour12 !== undefined ? options.hour12 : true;

  try {
    const formatted = d.toLocaleTimeString('en-US', {
      timeZone: EDT_TIMEZONE,
      hour12,
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {})
    });

    return includeSuffix ? `${formatted} ${TIMEZONE_LABEL}` : formatted;
  } catch {
    return d.toLocaleTimeString();
  }
}

/**
 * Formats any timestamp into EDT Date representation.
 * Examples:
 *   formatEdtDate() => "Sep 7, 2026"
 *   formatEdtDate(date, { format: 'iso' }) => "2026-09-07"
 *   formatEdtDate(date, { format: 'long' }) => "Monday, September 7, 2026"
 */
export function formatEdtDate(
  dateInput?: string | Date | number | null,
  options: { format?: 'short' | 'long' | 'iso' } = {}
): string {
  const d = parseDateInput(dateInput);
  const fmt = options.format || 'short';

  try {
    if (fmt === 'iso') {
      return d.toLocaleDateString('en-CA', { timeZone: EDT_TIMEZONE });
    }
    if (fmt === 'long') {
      return d.toLocaleDateString('en-US', {
        timeZone: EDT_TIMEZONE,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return d.toLocaleDateString('en-US', {
      timeZone: EDT_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return d.toLocaleDateString();
  }
}

/**
 * Formats full Date + Time in Eastern Daylight Time (EDT)
 * Example: "Sep 7, 2026, 10:06:24 AM EDT"
 */
export function formatEdtDateTime(
  dateInput?: string | Date | number | null,
  includeSeconds: boolean = true
): string {
  const d = parseDateInput(dateInput);
  const datePart = formatEdtDate(d, { format: 'short' });
  const timePart = formatEdtTime(d, { includeSeconds, includeSuffix: true });
  return `${datePart}, ${timePart}`;
}

/**
 * Live snapshot of current real-time EDT clock
 */
export function getLiveEdtClock() {
  const now = new Date();
  return {
    now,
    timeStr: formatEdtTime(now, { includeSeconds: true, includeSuffix: true }),
    timeNoSuffix: formatEdtTime(now, { includeSeconds: true, includeSuffix: false }),
    timeShort: formatEdtTime(now, { includeSeconds: false, includeSuffix: true }),
    dateStr: formatEdtDate(now, { format: 'short' }),
    dateLong: formatEdtDate(now, { format: 'long' }),
    isoDate: formatEdtDate(now, { format: 'iso' }),
    timezoneLabel: TIMEZONE_LABEL
  };
}

/**
 * React hook that ticks every second in EDT Real-Time
 */
export function useEdtClock(intervalMs: number = 1000) {
  const [clock, setClock] = useState(() => getLiveEdtClock());

  useEffect(() => {
    const tick = () => setClock(getLiveEdtClock());
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return clock;
}
