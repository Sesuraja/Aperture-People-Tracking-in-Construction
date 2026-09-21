/**
 * AI Model Configuration - Canonical Single Source of Truth
 */

export const DEFAULT_GEMINI_MODEL: string =
  (typeof process !== 'undefined' && process.env?.GEMINI_MODEL) || 'gemini-1.5-flash';

export const SUPPORTED_GEMINI_MODELS: readonly string[] = [
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro'
] as const;

export const DEFAULT_GEMINI_FALLBACK_CANDIDATES: readonly string[] = [
  'gemini-1.5-flash',
  'gemini-2.0-flash'
] as const;
