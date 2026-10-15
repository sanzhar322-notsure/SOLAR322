/**
 * Shared environmental-data state: last-known snapshot (persisted with its
 * timestamp), loading/error status and refresh logic. A failed request never
 * replaces data with invented values — the previous snapshot stays visible
 * with its age, or the UI shows "unavailable".
 */
import { useEffect, useSyncExternalStore } from 'react';
import { openMeteoProvider } from '../lib/data/openMeteo';
import { ProviderError, type EnvSnapshot, type WeatherProvider } from '../lib/data/types';
import { createStore, isObj, readJson, writeJson } from '../lib/storage/persist';
import type { PlaceLocation } from './settings';

export interface EnvState {
  key: string | null;
  snapshot: EnvSnapshot | null;
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: { kind: ProviderError['kind'] | 'unknown'; message: string; at: number } | null;
  lastAttempt: number | null;
}

const CACHE_KEY = 'env.v1';

export function locationKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

interface CacheShape { key: string; snapshot: EnvSnapshot }

function sanitizeCache(v: unknown): CacheShape | null {
  if (!isObj(v) || typeof v.key !== 'string' || !isObj(v.snapshot)) return null;
  const s = v.snapshot as unknown as EnvSnapshot;
  if (typeof s.fetchedAt !== 'number' || typeof s.latitude !== 'number' || !s.provider) return null;
  return { key: v.key, snapshot: s };
}

const cached = readJson(CACHE_KEY, sanitizeCache, null);

export const envStore = createStore<EnvState>({
  key: cached?.key ?? null,
  snapshot: cached?.snapshot ?? null,
  status: 'idle',
  error: null,
  lastAttempt: null,
});

let provider: WeatherProvider = openMeteoProvider;
export function setProvider(p: WeatherProvider) {
  provider = p;
}
export function currentProvider(): WeatherProvider {
  return provider;
}

let inflight: AbortController | null = null;

export async function refreshEnvironment(loc: PlaceLocation, opts: { sendAltitude: boolean }): Promise<void> {
  const key = locationKey(loc.latitude, loc.longitude);
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  envStore.set((s) => ({
    ...s,
    // Drop a snapshot belonging to another place rather than mislabel it.
    snapshot: s.key === key ? s.snapshot : null,
    key,
    status: 'loading',
    lastAttempt: Date.now(),
  }));
  try {
    const snap = await provider.fetchSnapshot({
      latitude: loc.latitude,
      longitude: loc.longitude,
      elevation: opts.sendAltitude ? loc.altitudeM : null,
      signal: ctrl.signal,
    });
    if (inflight !== ctrl) return;
    envStore.set((s) => ({ ...s, key, snapshot: snap, status: 'ok', error: null }));
    writeJson(CACHE_KEY, { key, snapshot: snap });
  } catch (e) {
    if (inflight !== ctrl) return;
    if (e instanceof ProviderError && e.kind === 'aborted') return;
    const err = e instanceof ProviderError
      ? { kind: e.kind, message: e.message, at: Date.now() }
      : { kind: 'unknown' as const, message: 'Unexpected error while loading environmental data', at: Date.now() };
    envStore.set((s) => ({ ...s, status: 'error', error: err }));
  } finally {
    if (inflight === ctrl) inflight = null;
  }
}

export function clearEnvironmentCache() {
  envStore.set({ key: null, snapshot: null, status: 'idle', error: null, lastAttempt: null });
}

export function useEnvironment(): EnvState {
  return useSyncExternalStore(envStore.subscribe, envStore.get, envStore.get);
}

/** Keeps the snapshot fresh for the active location while the app is visible. */
export function useEnvironmentSync(loc: PlaceLocation | null, autoRefreshMinutes: number, sendAltitude: boolean) {
  const lat = loc?.latitude, lon = loc?.longitude, alt = loc?.altitudeM;
  useEffect(() => {
    if (!loc) return;
    const key = locationKey(loc.latitude, loc.longitude);
    const st = envStore.get();
    const age = st.snapshot && st.key === key ? Date.now() - st.snapshot.fetchedAt : Infinity;
    if (age > 10 * 60000) void refreshEnvironment(loc, { sendAltitude });

    const tick = () => {
      if (document.visibilityState !== 'visible' || !autoRefreshMinutes) return;
      const s = envStore.get();
      const a = s.snapshot ? Date.now() - s.snapshot.fetchedAt : Infinity;
      const recentlyTried = s.lastAttempt != null && Date.now() - s.lastAttempt < 5 * 60000;
      if (a > autoRefreshMinutes * 60000 && !recentlyTried && s.status !== 'loading') void refreshEnvironment(loc, { sendAltitude });
    };
    const id = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, alt, autoRefreshMinutes, sendAltitude]);
}
