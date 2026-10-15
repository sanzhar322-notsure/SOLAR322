/**
 * Sleep-timing arithmetic. Clock times are minutes after midnight (0–1439).
 * Evening times are mapped onto a continuous axis where minutes before
 * midnight are negative (e.g. 23:30 → −30) so averages across midnight work.
 */
import type { DailyEntry } from '../state/journal';

export function parseClock(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function toClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Evening axis: 12:00–23:59 → negative minutes before midnight; 00:00–11:59 → positive. */
export function eveningAxis(min: number): number {
  return min >= 720 ? min - 1440 : min;
}

/** Duration between two clock times going forward (e.g. 23:30 → 07:00 = 450 min). */
export function forwardMinutes(from: number, to: number): number {
  return (((to - from) % 1440) + 1440) % 1440;
}

export interface SleepMetrics {
  /** Minutes asleep (onset → wake), null if either missing. */
  sleepMin: number | null;
  /** Minutes in bed (bedtime → wake). */
  inBedMin: number | null;
  /** Minutes from bedtime to sleep onset. */
  latencyMin: number | null;
  /** Midpoint of sleep on the evening axis (minutes from midnight; may be negative). */
  midpoint: number | null;
  onset: number | null; // evening axis
  wake: number | null; // minutes after midnight
}

export function sleepMetrics(e: Pick<DailyEntry, 'bedtime' | 'sleepOnset' | 'wakeTime'>): SleepMetrics {
  const bed = parseClock(e.bedtime);
  const onsetRaw = parseClock(e.sleepOnset) ?? bed;
  const wake = parseClock(e.wakeTime);
  const sleepMin = onsetRaw != null && wake != null ? forwardMinutes(onsetRaw, wake) : null;
  const inBedMin = bed != null && wake != null ? forwardMinutes(bed, wake) : null;
  const latencyMin = bed != null && parseClock(e.sleepOnset) != null ? forwardMinutes(bed, parseClock(e.sleepOnset)!) : null;
  const onset = onsetRaw != null ? eveningAxis(onsetRaw) : null;
  return {
    sleepMin: sleepMin === 0 ? null : sleepMin,
    inBedMin: inBedMin === 0 ? null : inBedMin,
    latencyMin: latencyMin != null && latencyMin < 360 ? latencyMin : null,
    midpoint: onset != null && sleepMin ? onset + sleepMin / 2 : null,
    onset,
    wake,
  };
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export interface SleepSummary {
  nights: number;
  avgSleepMin: number | null;
  avgOnset: number | null; // evening axis
  avgWake: number | null;
  /** Standard deviation of sleep midpoint (min) — a simple regularity measure. */
  midpointSd: number | null;
  wakeSd: number | null;
  shortNights: number; // below the user's minimum
  /** Sum of (need − slept) over nights with data, minutes; positive means shortfall. */
  shortfallMin: number;
  avgQuality: number | null;
}

/** Summarises entries within the last `days` days ending at `endDate` (inclusive). */
export function summarize(entries: DailyEntry[], endDate: string, days: number, needHours: number): SleepSummary {
  const end = Date.parse(endDate + 'T00:00:00Z');
  const start = end - (days - 1) * 86400000;
  const recent = entries.filter((e) => {
    const t = Date.parse(e.date + 'T00:00:00Z');
    return t >= start && t <= end;
  });
  const m = recent.map(sleepMetrics);
  const sleeps = m.map((x) => x.sleepMin).filter((x): x is number => x != null);
  const onsets = m.map((x) => x.onset).filter((x): x is number => x != null);
  const wakes = m.map((x) => x.wake).filter((x): x is number => x != null);
  const mids = m.map((x) => x.midpoint).filter((x): x is number => x != null);
  const quals = recent.map((e) => e.sleepQuality).filter((x): x is number => x != null);
  const need = needHours * 60;
  // A night counts as short below 7 h or one hour under the personal need, whichever is higher.
  const minimum = Math.max(need - 60, 7 * 60);
  return {
    nights: sleeps.length,
    avgSleepMin: mean(sleeps),
    avgOnset: mean(onsets),
    avgWake: mean(wakes),
    midpointSd: stdev(mids),
    wakeSd: stdev(wakes),
    shortNights: sleeps.filter((s) => s < minimum).length,
    shortfallMin: sleeps.reduce((a, s) => a + (need - s), 0),
    avgQuality: mean(quals),
  };
}

/** Latest bedtime that still allows `needHours` before a target wake time (HH:MM). */
export function bedtimeFor(targetWake: string, needHours: number, latencyMin = 15): string {
  const w = parseClock(targetWake) ?? 420;
  return toClock(w - needHours * 60 - latencyMin);
}

/** Planned sleep opportunity in minutes between a bedtime and wake time. */
export function plannedOpportunity(bedtime: string, wake: string): number {
  const b = parseClock(bedtime), w = parseClock(wake);
  if (b == null || w == null) return 0;
  return forwardMinutes(b, w);
}

/**
 * Suggests a gradual step from the current schedule toward a goal wake time,
 * moving no more than `maxStepMin` per step (default 15 min, i.e. a gentle
 * shift every few days rather than an abrupt change).
 */
export function gradualStep(currentWake: number, goalWake: number, maxStepMin = 15): number {
  const diff = goalWake - currentWake;
  if (Math.abs(diff) <= maxStepMin) return goalWake;
  return currentWake + Math.sign(diff) * maxStepMin;
}
