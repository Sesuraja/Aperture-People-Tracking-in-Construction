/**
 * AI Model Configuration - Canonical Single Source of Truth
 */

export const DEFAULT_GEMINI_MODEL: string =
  (typeof process !== 'undefined' && process.env?.GEMINI_MODEL) || 'gemini-2.5-flash';

export const SUPPORTED_GEMINI_MODELS: readonly string[] = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-3.1-pro-preview'
] as const;

export const DEFAULT_GEMINI_FALLBACK_CANDIDATES: readonly string[] = [
  DEFAULT_GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
] as const;
