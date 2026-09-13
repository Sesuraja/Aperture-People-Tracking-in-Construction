import { useState, useEffect } from 'react';

export const UTC_TIMEZONE = 'UTC';
export const TIMEZONE_LABEL = 'UTC';

// Backward compatibility alias for existing imports
export const EDT_TIMEZONE = 'UTC';

/**
 * Safely parses any date input (Date object, timestamp number, ISO string,
 * or raw space-separated database timestamp "YYYY-MM-DD HH:mm:ss")
 * treating timezone-less strings as UTC.
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

export interface FormatTimeOptions {
  includeSeconds?: boolean;
  includeSuffix?: boolean; // Appends "UTC"
  hour12?: boolean;
  timeZone?: string;
}

export type FormatEdtTimeOptions = FormatTimeOptions;

/**
 * Formats any timestamp into Coordinated Universal Time (UTC)
 * Examples:
 *   formatUtcTime() => "02:06:24 PM UTC"
 *   formatUtcTime(date, { includeSeconds: false }) => "02:06 PM UTC"
 */
export function formatUtcTime(
  dateInput?: string | Date | number | null,
  options: FormatTimeOptions = {}
): string {
  const d = parseDateInput(dateInput);
  const includeSeconds = options.includeSeconds !== undefined ? options.includeSeconds : true;
  const includeSuffix = options.includeSuffix !== undefined ? options.includeSuffix : true;
  const hour12 = options.hour12 !== undefined ? options.hour12 : true;
  const timeZone = options.timeZone || UTC_TIMEZONE;

  try {
    const formatted = d.toLocaleTimeString('en-US', {
      timeZone,
      hour12,
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {})
    });

    return includeSuffix ? `${formatted} ${TIMEZONE_LABEL}` : formatted;
  } catch {
    return d.toUTCString();
  }
}

// Backward-compatible alias for formatEdtTime
export const formatEdtTime = formatUtcTime;

/**
 * Formats any timestamp into UTC Date representation.
 * Examples:
 *   formatUtcDate() => "Sep 7, 2026"
 *   formatUtcDate(date, { format: 'iso' }) => "2026-09-07"
 *   formatUtcDate(date, { format: 'long' }) => "Monday, September 7, 2026"
 */
export function formatUtcDate(
  dateInput?: string | Date | number | null,
  options: { format?: 'short' | 'long' | 'iso'; timeZone?: string } = {}
): string {
  const d = parseDateInput(dateInput);
  const fmt = options.format || 'short';
  const timeZone = options.timeZone || UTC_TIMEZONE;

  try {
    if (fmt === 'iso') {
      return d.toLocaleDateString('en-CA', { timeZone });
    }
    if (fmt === 'long') {
      return d.toLocaleDateString('en-US', {
        timeZone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return d.toLocaleDateString('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return d.toLocaleDateString();
  }
}

// Backward-compatible alias for formatEdtDate
export const formatEdtDate = formatUtcDate;

/**
 * Formats full Date + Time in Coordinated Universal Time (UTC)
 * Example: "Sep 7, 2026, 02:06:24 PM UTC"
 */
export function formatUtcDateTime(
  dateInput?: string | Date | number | null,
  includeSeconds: boolean = true
): string {
  const d = parseDateInput(dateInput);
  const datePart = formatUtcDate(d, { format: 'short' });
  const timePart = formatUtcTime(d, { includeSeconds, includeSuffix: true });
  return `${datePart}, ${timePart}`;
}

// Backward-compatible alias for formatEdtDateTime
export const formatEdtDateTime = formatUtcDateTime;

export function resolveIanaTimezone(tzSetting?: string): { iana: string; label: string } {
  const str = String(tzSetting || '').toLowerCase();
  if (str.includes('eastern') || str.includes('edt') || str.includes('est')) {
    return { iana: 'America/New_York', label: 'EDT' };
  }
  if (str.includes('central') || str.includes('cst')) {
    return { iana: 'America/Chicago', label: 'CST' };
  }
  if (str.includes('pacific') || str.includes('pst')) {
    return { iana: 'America/Los_Angeles', label: 'PST' };
  }
  if (str.includes('gmt')) {
    return { iana: 'GMT', label: 'GMT' };
  }
  return { iana: 'UTC', label: 'UTC' };
}

/**
 * Live snapshot of current real-time clock according to system timezone setting
 */
export function getLiveSystemClock(tzSetting?: string) {
  const now = new Date();
  const { iana, label } = resolveIanaTimezone(tzSetting);
  return {
    now,
    timeStr: formatUtcTime(now, { includeSeconds: true, includeSuffix: false, timeZone: iana }) + ` ${label}`,
    timeNoSuffix: formatUtcTime(now, { includeSeconds: true, includeSuffix: false, timeZone: iana }),
    timeShort: formatUtcTime(now, { includeSeconds: false, includeSuffix: false, timeZone: iana }) + ` ${label}`,
    dateStr: formatUtcDate(now, { format: 'short', timeZone: iana }),
    dateLong: formatUtcDate(now, { format: 'long', timeZone: iana }),
    isoDate: formatUtcDate(now, { format: 'iso', timeZone: iana }),
    timezoneLabel: label
  };
}

/**
 * Live snapshot of current real-time UTC clock (default fallback)
 */
export function getLiveUtcClock() {
  return getLiveSystemClock('UTC');
}

// Backward-compatible alias for getLiveEdtClock
export const getLiveEdtClock = getLiveUtcClock;

/**
 * React hook that ticks every second in system-configured timezone (defaulting to UTC)
 */
export function useSystemClock(tzSetting?: string, intervalMs: number = 1000) {
  const [clock, setClock] = useState(() => getLiveSystemClock(tzSetting));

  useEffect(() => {
    const tick = () => setClock(getLiveSystemClock(tzSetting));
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [tzSetting, intervalMs]);

  return clock;
}

/**
 * React hook that ticks every second in UTC Real-Time (or optionally configured timezone)
 */
export function useUtcClock(intervalMs: number = 1000, tzSetting?: string) {
  return useSystemClock(tzSetting || 'UTC', intervalMs);
}

// Backward-compatible alias for useEdtClock
export const useEdtClock = useUtcClock;
