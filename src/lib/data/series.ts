import type { EnvSnapshot, HourlySeries } from './types';

export type Freshness = 'fresh' | 'aging' | 'stale';

export const FRESH_MS = 30 * 60000;
export const STALE_MS = 3 * 3600000;

/** How old the snapshot is relative to `now`. Forecast hours remain usable longer than "current". */
export function freshness(fetchedAt: number, now: number): { state: Freshness; ageMs: number } {
  const ageMs = Math.max(0, now - fetchedAt);
  return { state: ageMs < FRESH_MS ? 'fresh' : ageMs < STALE_MS ? 'aging' : 'stale', ageMs };
}

export function formatAge(ageMs: number): string {
  const m = Math.round(ageMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/**
 * Linear interpolation of an hourly series at time t. Returns null outside the
 * series or when a neighbour is missing — never extrapolates or fills gaps.
 * `shiftMs` re-centres backward-averaged variables (e.g. −30 min for hourly means).
 */
export function interpolate(times: number[], values: (number | null)[], t: number, shiftMs = 0): number | null {
  const n = times.length;
  if (!n) return null;
  const ts = (i: number) => times[i] + shiftMs;
  if (t < ts(0) || t > ts(n - 1)) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts(mid) <= t) lo = mid; else hi = mid;
  }
  const a = values[lo], b = values[hi];
  if (t === ts(lo)) return a;
  if (t === ts(hi)) return b;
  if (a == null || b == null) return null;
  const f = (t - ts(lo)) / (ts(hi) - ts(lo));
  return a + (b - a) * f;
}

/** Nearest hourly value (for categorical series like weather codes). */
export function nearest<T>(times: number[], values: (T | null)[], t: number, maxGapMs = 3600000): T | null {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - t);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best >= 0 && bestD <= maxGapMs ? values[best] : null;
}

export const HOURLY_MEAN_SHIFT = -30 * 60000;

export interface UvReading {
  value: number | null;
  source: 'current' | 'interpolated' | 'unavailable';
}

/** Current UV: the provider's current value if present, else interpolated hourly forecast. */
export function uvNow(snap: EnvSnapshot | null, now: number): UvReading {
  if (!snap) return { value: null, source: 'unavailable' };
  const c = snap.current;
  if (c && c.uvIndex != null && Math.abs(now - c.time) < 3600000) return { value: c.uvIndex, source: 'current' };
  if (snap.hourly) {
    const v = interpolate(snap.hourly.time, snap.hourly.uvIndex, now);
    if (v != null) return { value: v, source: 'interpolated' };
  }
  return { value: null, source: 'unavailable' };
}

export function hourlyIndexRange(h: HourlySeries, start: number, end: number): number[] {
  const out: number[] = [];
  h.time.forEach((t, i) => { if (t >= start && t <= end) out.push(i); });
  return out;
}

export function hasAny(values: (number | null)[] | undefined): boolean {
  return !!values && values.some((v) => v != null);
}
