/**
 * Local persistence. Everything personal lives in this browser's localStorage
 * under the `tengri.` prefix — nothing is synced or uploaded.
 */
export const PREFIX = 'tengri.';

export function readJson<T>(key: string, sanitize: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return sanitize(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

export function writeJson(key: string, value: unknown): WriteResult {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

export function removeAll(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}

export function storageBytes(): number {
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) n += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return n * 2;
  } catch {
    return 0;
  }
}

/** Ask the browser not to evict our storage (Safari honours this mainly for Home Screen apps). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return null;
}

/** A tiny external store compatible with React's useSyncExternalStore. */
export function createStore<T>(initial: T, onChange?: (v: T) => void) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      onChange?.(state);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// --- sanitising helpers --------------------------------------------------

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v.slice(0, 4000) : d);
export const optStr = (v: unknown): string | null => (typeof v === 'string' && v.length ? v.slice(0, 4000) : null);
export const numIn = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d;
export const optNum = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
export const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
export function oneOf<T extends string>(v: unknown, opts: readonly T[], d: T): T {
  return typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d;
}
export const clock = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
export const ymd = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
