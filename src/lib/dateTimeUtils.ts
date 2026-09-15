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

/**
 * Gets the detected browser / OS local system timezone (e.g. "Asia/Kolkata", "America/New_York")
 */
export function getLocalSystemIanaTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Reads the active system timezone setting from localStorage or defaults to Local System Timezone
 */
export function getSystemTimezoneSetting(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('gao_system_timezone');
    if (stored && stored.trim()) return stored.trim();
  }
  return 'System (Local Browser Time)';
}

/**
 * Resolves any timezone setting (acronym, IANA name, offset, or 'System') into a standard IANA timezone and display label.
 */
export function resolveIanaTimezone(tzSetting?: string): { iana: string; label: string; isSystem: boolean } {
  const localIana = getLocalSystemIanaTimezone();
  const raw = String(tzSetting || '').trim();
  const lower = raw.toLowerCase();

  // Auto-detect / System Timezone
  if (!raw || lower.includes('system') || lower.includes('local') || lower.includes('browser') || lower.includes('device') || lower === 'auto') {
    // Generate a clean label for the local timezone
    let localLabel = 'LOCAL';
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: localIana, timeZoneName: 'short' }).formatToParts(new Date());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      if (tzPart?.value) localLabel = tzPart.value;
    } catch {
      localLabel = localIana.split('/').pop() || 'LOCAL';
    }
    return { iana: localIana, label: localLabel, isSystem: true };
  }

  // Eastern Time (US)
  if (lower.includes('eastern') || lower.includes('edt') || lower.includes('est') || lower === 'america/new_york') {
    return { iana: 'America/New_York', label: 'EDT', isSystem: false };
  }
  // Central Time (US)
  if (lower.includes('central') || lower.includes('cst') || lower.includes('cdt') || lower === 'america/chicago') {
    return { iana: 'America/Chicago', label: 'CST', isSystem: false };
  }
  // Mountain Time (US)
  if (lower.includes('mountain') || lower.includes('mst') || lower.includes('mdt') || lower === 'america/denver') {
    return { iana: 'America/Denver', label: 'MST', isSystem: false };
  }
  // Pacific Time (US)
  if (lower.includes('pacific') || lower.includes('pst') || lower.includes('pdt') || lower === 'america/los_angeles') {
    return { iana: 'America/Los_Angeles', label: 'PST', isSystem: false };
  }
  // India Standard Time
  if (lower.includes('ist') || lower.includes('india') || lower.includes('kolkata') || lower.includes('calcutta') || lower === 'asia/kolkata') {
    return { iana: 'Asia/Kolkata', label: 'IST', isSystem: false };
  }
  // Central European Time
  if (lower.includes('cet') || lower.includes('cest') || lower.includes('berlin') || lower.includes('paris') || lower === 'europe/berlin' || lower === 'europe/paris') {
    return { iana: 'Europe/Paris', label: 'CET', isSystem: false };
  }
  // Japan Standard Time
  if (lower.includes('jst') || lower.includes('japan') || lower.includes('tokyo') || lower === 'asia/tokyo') {
    return { iana: 'Asia/Tokyo', label: 'JST', isSystem: false };
  }
  // Australian Eastern Time
  if (lower.includes('aest') || lower.includes('aedt') || lower.includes('sydney') || lower.includes('melbourne') || lower === 'australia/sydney') {
    return { iana: 'Australia/Sydney', label: 'AEST', isSystem: false };
  }
  // Singapore Time
  if (lower.includes('sgt') || lower.includes('singapore') || lower === 'asia/singapore') {
    return { iana: 'Asia/Singapore', label: 'SGT', isSystem: false };
  }
  // Gulf Standard Time (Dubai)
  if (lower.includes('gst') || lower.includes('dubai') || lower === 'asia/dubai') {
    return { iana: 'Asia/Dubai', label: 'GST', isSystem: false };
  }
  // GMT / London / BST
  if (lower.includes('gmt') || lower.includes('london') || lower.includes('bst') || lower === 'europe/london') {
    return { iana: 'Europe/London', label: 'GMT', isSystem: false };
  }
  // UTC
  if (lower.includes('utc') || lower === 'etc/utc') {
    return { iana: 'UTC', label: 'UTC', isSystem: false };
  }

  // Validate if direct string is a valid IANA timezone identifier
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: raw });
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: raw, timeZoneName: 'short' }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    const label = tzPart?.value || raw.split('/').pop() || 'TZ';
    return { iana: raw, label, isSystem: false };
  } catch {
    // Default fallback to UTC
    return { iana: 'UTC', label: 'UTC', isSystem: false };
  }
}

/**
 * React hook that subscribes to system timezone changes (localStorage + gao_settings_updated event)
 */
export function useSystemTimezone() {
  const [tzSetting, setTzSetting] = useState<string>(() => getSystemTimezoneSetting());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const newTz = e?.detail?.systemTimezone || getSystemTimezoneSetting();
      if (newTz) setTzSetting(newTz);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'gao_system_timezone') {
        setTzSetting(e.newValue || getSystemTimezoneSetting());
      }
    };

    window.addEventListener('gao_settings_updated', handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('gao_settings_updated', handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const resolved = resolveIanaTimezone(tzSetting);
  return {
    rawSetting: tzSetting,
    iana: resolved.iana,
    label: resolved.label,
    isSystem: resolved.isSystem,
    resolve: (input?: string) => resolveIanaTimezone(input || tzSetting)
  };
}

export interface FormatTimeOptions {
  includeSeconds?: boolean;
  includeSuffix?: boolean; // Appends timezone label (e.g. "EDT", "IST", "UTC")
  hour12?: boolean;
  timeZone?: string;
  tzSetting?: string;
}

export type FormatEdtTimeOptions = FormatTimeOptions;

/**
 * Formats any timestamp into configured system timezone (or specific timeZone)
 * Examples:
 *   formatUtcTime() => "02:06:24 PM EDT"
 *   formatUtcTime(date, { includeSeconds: false }) => "02:06 PM EDT"
 */
export function formatUtcTime(
  dateInput?: string | Date | number | null,
  options: FormatTimeOptions = {}
): string {
  const d = parseDateInput(dateInput);
  const includeSeconds = options.includeSeconds !== undefined ? options.includeSeconds : true;
  const includeSuffix = options.includeSuffix !== undefined ? options.includeSuffix : true;
  const hour12 = options.hour12 !== undefined ? options.hour12 : true;
  
  // Resolve timezone setting or fallback to active system timezone
  const resolved = resolveIanaTimezone(options.timeZone || options.tzSetting || getSystemTimezoneSetting());
  const timeZone = resolved.iana;
  const tzLabel = resolved.label;

  try {
    const formatted = d.toLocaleTimeString('en-US', {
      timeZone,
      hour12,
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {})
    });

    return includeSuffix ? `${formatted} ${tzLabel}` : formatted;
  } catch {
    return d.toUTCString();
  }
}

// Backward-compatible alias for formatEdtTime
export const formatEdtTime = formatUtcTime;

/**
 * Formats any timestamp into Date representation according to configured system timezone.
 * Examples:
 *   formatUtcDate() => "Sep 7, 2026"
 *   formatUtcDate(date, { format: 'iso' }) => "2026-09-07"
 *   formatUtcDate(date, { format: 'long' }) => "Monday, September 7, 2026"
 */
export function formatUtcDate(
  dateInput?: string | Date | number | null,
  options: { format?: 'short' | 'long' | 'iso'; timeZone?: string; tzSetting?: string } = {}
): string {
  const d = parseDateInput(dateInput);
  const fmt = options.format || 'short';
  const resolved = resolveIanaTimezone(options.timeZone || options.tzSetting || getSystemTimezoneSetting());
  const timeZone = resolved.iana;

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
 * Formats full Date + Time according to the configured system timezone
 * Example: "Sep 7, 2026, 02:06:24 PM EDT"
 */
export function formatUtcDateTime(
  dateInput?: string | Date | number | null,
  includeSeconds: boolean = true,
  tzSetting?: string
): string {
  const d = parseDateInput(dateInput);
  const resolved = resolveIanaTimezone(tzSetting || getSystemTimezoneSetting());
  const datePart = formatUtcDate(d, { format: 'short', timeZone: resolved.iana });
  const timePart = formatUtcTime(d, { includeSeconds, includeSuffix: true, timeZone: resolved.iana });
  return `${datePart}, ${timePart}`;
}

// Backward-compatible alias for formatEdtDateTime
export const formatEdtDateTime = formatUtcDateTime;

/**
 * Specifically tailored for API History records and Telemetry Ledgers.
 * Formats any raw API timestamp (ISO string or database date string) into the active timezone.
 * Example: "2026-09-15 14:30:00 EDT" or "ACTIVE"
 */
export function formatHistoryTimestamp(
  timestamp?: string | Date | number | null,
  tzSetting?: string,
  options: { showDate?: boolean; showSeconds?: boolean; includeSuffix?: boolean } = {}
): string {
  if (!timestamp) return '—';
  const str = String(timestamp).trim();
  if (str === 'ACTIVE' || str.toLowerCase() === 'active' || str === 'Recent' || str === '—') {
    return str;
  }

  const d = parseDateInput(timestamp);
  if (isNaN(d.getTime())) return str;

  const resolved = resolveIanaTimezone(tzSetting || getSystemTimezoneSetting());
  const showDate = options.showDate !== false;
  const showSeconds = options.showSeconds !== false;
  const includeSuffix = options.includeSuffix !== false;

  try {
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: resolved.iana });
    const timeStr = d.toLocaleTimeString('en-US', {
      timeZone: resolved.iana,
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      ...(showSeconds ? { second: '2-digit' } : {})
    });

    const body = showDate ? `${dateStr} ${timeStr}` : timeStr;
    return includeSuffix ? `${body} ${resolved.label}` : body;
  } catch {
    return str;
  }
}

/**
 * Checks if a record matches a target calendar date string (YYYY-MM-DD)
 * evaluated in the configured system timezone.
 */
export function matchesCalendarDate(
  dateTarget: string,
  tzSetting?: string,
  ...dateCandidates: (string | Date | number | undefined | null)[]
): boolean {
  if (!dateTarget) return true;
  const resolved = resolveIanaTimezone(tzSetting || getSystemTimezoneSetting());

  for (const cand of dateCandidates) {
    if (!cand) continue;
    try {
      const d = parseDateInput(cand);
      if (!isNaN(d.getTime())) {
        const isoInTz = d.toLocaleDateString('en-CA', { timeZone: resolved.iana });
        if (isoInTz === dateTarget) return true;
      }
    } catch {}

    const str = String(cand);
    if (str.startsWith(dateTarget) || str.includes(dateTarget)) return true;
  }
  return false;
}

/**
 * Live snapshot of current real-time clock according to system timezone setting
 */
export function getLiveSystemClock(tzSetting?: string) {
  const now = new Date();
  const { iana, label } = resolveIanaTimezone(tzSetting || getSystemTimezoneSetting());
  return {
    now,
    timeStr: formatUtcTime(now, { includeSeconds: true, includeSuffix: false, timeZone: iana }) + ` ${label}`,
    timeNoSuffix: formatUtcTime(now, { includeSeconds: true, includeSuffix: false, timeZone: iana }),
    timeShort: formatUtcTime(now, { includeSeconds: false, includeSuffix: false, timeZone: iana }) + ` ${label}`,
    dateStr: formatUtcDate(now, { format: 'short', timeZone: iana }),
    dateLong: formatUtcDate(now, { format: 'long', timeZone: iana }),
    isoDate: formatUtcDate(now, { format: 'iso', timeZone: iana }),
    timezoneLabel: label,
    iana
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
 * React hook that ticks every second in system-configured timezone (defaulting to system timezone)
 */
export function useSystemClock(tzSetting?: string, intervalMs: number = 1000) {
  const effectiveTz = tzSetting || getSystemTimezoneSetting();
  const [clock, setClock] = useState(() => getLiveSystemClock(effectiveTz));

  useEffect(() => {
    const tick = () => setClock(getLiveSystemClock(tzSetting || getSystemTimezoneSetting()));
    tick();
    const timer = setInterval(tick, intervalMs);

    const handleSettingsUpdate = (e: any) => {
      const updatedTz = e?.detail?.systemTimezone || tzSetting;
      setClock(getLiveSystemClock(updatedTz));
    };
    window.addEventListener('gao_settings_updated', handleSettingsUpdate);

    return () => {
      clearInterval(timer);
      window.removeEventListener('gao_settings_updated', handleSettingsUpdate);
    };
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
