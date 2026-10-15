/**
 * Solar History & Personal Observations — summaries of logged outdoor
 * sessions grouped by solar window. Subjective ratings (energy, alertness,
 * comfort, how you felt afterwards) are kept clearly separate from
 * environmental values (forecast UV, ambient dose). Nothing here estimates a
 * personal UV tolerance.
 */
import type { OutdoorSession } from '../state/journal';
import type { SolarDay } from './astro/solar';
import { windowKindAt, type WindowKind } from './planner';
import { mean } from './sleep';

export interface WindowSummary {
  kind: WindowKind | 'night';
  sessions: number;
  minutes: number;
  energy: number | null;
  alertness: number | null;
  comfort: number | null;
  betterShare: number | null; // of sessions with an afterFeel answer
  feelAnswers: number;
  uvPeakMean: number | null;
  ambientSed: number | null;
}

export type DayResolver = (s: OutdoorSession) => { day: SolarDay; lat: number; lon: number } | null;

export function sessionWindow(s: OutdoorSession, resolve: DayResolver): WindowKind | 'night' | null {
  const r = resolve(s);
  if (!r) return null;
  return windowKindAt((s.start + s.end) / 2, r.lat, r.lon, r.day) ?? 'night';
}

export function summarizeByWindow(sessions: OutdoorSession[], resolve: DayResolver): WindowSummary[] {
  const kinds: (WindowKind | 'night')[] = ['morning', 'daytime', 'evening', 'night'];
  const done = sessions.filter((s) => s.status === 'done');
  return kinds.map((kind) => {
    const ss = done.filter((s) => sessionWindow(s, resolve) === kind);
    const nums = (f: (s: OutdoorSession) => number | null) => ss.map(f).filter((x): x is number => x != null);
    const feel = ss.filter((s) => s.afterFeel != null);
    const seds = nums((s) => s.ambientSed);
    return {
      kind,
      sessions: ss.length,
      minutes: ss.reduce((a, s) => a + (s.end - s.start) / 60000, 0),
      energy: mean(nums((s) => s.energy)),
      alertness: mean(nums((s) => s.alertness)),
      comfort: mean(nums((s) => s.comfort)),
      betterShare: feel.length ? feel.filter((s) => s.afterFeel === 'better').length / feel.length : null,
      feelAnswers: feel.length,
      uvPeakMean: mean(nums((s) => s.uvPeak)),
      ambientSed: seds.length ? seds.reduce((a, b) => a + b, 0) : null,
    };
  });
}

/** A cautious, subjective-only comparison sentence, or null if data are too thin. */
export function patternNote(summary: WindowSummary[]): string | null {
  const rated = summary.filter((w) => w.kind !== 'night' && w.alertness != null && w.sessions >= 3);
  if (rated.length < 2) return null;
  const sorted = [...rated].sort((a, b) => (b.alertness ?? 0) - (a.alertness ?? 0));
  const hi = sorted[0], lo = sorted[sorted.length - 1];
  if ((hi.alertness ?? 0) - (lo.alertness ?? 0) < 0.4) return 'So far your alertness ratings look similar across windows.';
  const label = (k: string) => (k === 'daytime' ? 'daytime' : k === 'morning' ? 'morning' : 'afternoon/evening');
  return `You’ve rated alertness higher after ${label(hi.kind)} sessions (${hi.alertness!.toFixed(1)}, n=${hi.sessions}) than after ${label(lo.kind)} sessions (${lo.alertness!.toFixed(1)}, n=${lo.sessions}). Subjective and correlational — time of day, activity and sleep all differ between these sessions.`;
}

/** Outdoor minutes per ISO-like week (Monday start), most recent last. */
export function weeklyMinutes(sessions: OutdoorSession[], weeks: number, now: number): { weekStart: number; minutes: number; sed: number }[] {
  const DAY = 86400000;
  const d = new Date(now);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: monday - (weeks - 1 - i) * 7 * DAY, minutes: 0, sed: 0 }));
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const w = out.find((x) => s.start >= x.weekStart && s.start < x.weekStart + 7 * DAY);
    if (w) {
      w.minutes += (s.end - s.start) / 60000;
      w.sed += s.ambientSed ?? 0;
    }
  }
  return out;
}
