/**
 * Resilient Storage Utility
 * Prevents QuotaExceededError crashes when storing large telemetry data,
 * SVG floorplans, base64 images, or zones in browser storage.
 */

const memoryFallback = new Map<string, string>();

const LARGE_DISPOSABLE_KEYS = [
  'aperture_ws_logs',
  'gao_telemetry_history',
  'gao_db_cache'
];

// Proactive sweep on startup to prevent quota exhaustion from non-critical logs
function proactiveStorageSweep() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    for (const key of LARGE_DISPOSABLE_KEYS) {
      const val = window.localStorage.getItem(key);
      if (val && val.length > 500000) {
        memoryFallback.set(key, val);
        window.localStorage.removeItem(key);
      }
    }
  } catch {}
}

proactiveStorageSweep();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return memoryFallback.get(key) || null;
      }
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
      return memoryFallback.get(key) || null;
    } catch {
      return memoryFallback.get(key) || null;
    }
  },

  setItem(key: string, value: string): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      memoryFallback.set(key, value);
      return true;
    }

    try {
      window.localStorage.setItem(key, value);
      memoryFallback.set(key, value);
      return true;
    } catch (err: any) {
      console.warn(`[SafeStorage] localStorage quota exceeded on key "${key}". Executing emergency cache cleanup...`, err);

      // Attempt: Evict heavy disposable caches (large floorplans / SVG strings in localstorage)
      try {
        for (const disposableKey of LARGE_DISPOSABLE_KEYS) {
          if (disposableKey !== key) {
            const item = window.localStorage.getItem(disposableKey);
            if (item && item.length > 10000) {
              memoryFallback.set(disposableKey, item);
              window.localStorage.removeItem(disposableKey);
            }
          }
        }

        // Retry setting item in localStorage
        window.localStorage.setItem(key, value);
        memoryFallback.set(key, value);
        return true;
      } catch (retryErr) {
        console.warn(`[SafeStorage] localStorage still full for key "${key}". Storing in memory-only fallback.`, retryErr);
        // Fallback to memory so application never throws QuotaExceededError or crashes
        memoryFallback.set(key, value);
        return false;
      }
    }
  },

  removeItem(key: string): void {
    memoryFallback.delete(key);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },

  clear(): void {
    memoryFallback.clear();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {}
  }
};

