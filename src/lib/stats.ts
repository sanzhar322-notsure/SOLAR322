/** Personal-trend statistics. Associations only — never causal claims. */
import type { DailyEntry, Experiment, OutcomeKey, OutdoorSession } from '../state/journal';
import { mean, parseClock, sleepMetrics, stdev } from './sleep';

export type VarKey =
  | 'sleepDuration' | 'sleepQuality' | 'energy' | 'sleepiness' | 'sleepOnsetMin' | 'wakeMin'
  | 'morningOutdoor' | 'totalOutdoor' | 'lateScreen' | 'caffeineHour' | 'exerciseMin' | 'awakenings'
  | 'ambientSed' | 'onsetDeviation';

export interface VarDef { key: VarKey; label: string; unit: string; describe: (v: number) => string }

const hm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const VARS: VarDef[] = [
  { key: 'sleepDuration', label: 'Sleep duration', unit: 'h', describe: (v) => `${v.toFixed(1)} h` },
  { key: 'sleepQuality', label: 'Sleep quality', unit: '1–5', describe: (v) => v.toFixed(1) },
  { key: 'energy', label: 'Daytime energy', unit: '1–5', describe: (v) => v.toFixed(1) },
  { key: 'sleepiness', label: 'Daytime sleepiness', unit: '1–5', describe: (v) => v.toFixed(1) },
  { key: 'sleepOnsetMin', label: 'Sleep onset', unit: 'clock', describe: (v) => hm(v) },
  { key: 'wakeMin', label: 'Wake time', unit: 'clock', describe: (v) => hm(v) },
  { key: 'onsetDeviation', label: 'Bedtime irregularity', unit: 'min', describe: (v) => `${Math.round(v)} min from 7-day mean` },
  { key: 'morningOutdoor', label: 'Morning outdoor time', unit: 'min', describe: (v) => `${Math.round(v)} min` },
  { key: 'totalOutdoor', label: 'Total outdoor time', unit: 'min', describe: (v) => `${Math.round(v)} min` },
  { key: 'lateScreen', label: 'Late-evening screen use', unit: '0–3', describe: (v) => ['none', 'brief', 'moderate', 'heavy'][Math.round(v)] ?? v.toFixed(1) },
  { key: 'caffeineHour', label: 'Last caffeine', unit: 'clock', describe: (v) => hm(v) },
  { key: 'exerciseMin', label: 'Exercise', unit: 'min', describe: (v) => `${Math.round(v)} min` },
  { key: 'awakenings', label: 'Night awakenings', unit: 'count', describe: (v) => v.toFixed(0) },
  { key: 'ambientSed', label: 'Ambient UV during sessions', unit: 'SED', describe: (v) => `${v.toFixed(2)} SED` },
];

export const varDef = (k: VarKey) => VARS.find((v) => v.key === k)!;

/** Per-date variable table built from daily entries plus outdoor sessions. */
export type DayRow = { date: string } & Partial<Record<VarKey, number>>;

function sessionDate(s: OutdoorSession): string {
  // Sessions are dated by the local date of their start (in their own zone if known).
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone ?? undefined, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(s.start));
    return p;
  } catch {
    return new Date(s.start).toISOString().slice(0, 10);
  }
}

function sessionLocalHour(s: OutdoorSession): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: s.timezone ?? undefined, hour: '2-digit', hourCycle: 'h23' }).format(new Date(s.start));
    return Number(h);
  } catch {
    return new Date(s.start).getHours();
  }
}

export function buildRows(entries: DailyEntry[], sessions: OutdoorSession[]): DayRow[] {
  const rows = new Map<string, DayRow>();
  const row = (d: string) => {
    let r = rows.get(d);
    if (!r) { r = { date: d }; rows.set(d, r); }
    return r;
  };
  const done = sessions.filter((s) => s.status === 'done');
  const sessByDate = new Map<string, OutdoorSession[]>();
  for (const s of done) {
    const d = sessionDate(s);
    sessByDate.set(d, [...(sessByDate.get(d) ?? []), s]);
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((e, idx) => {
    const r = row(e.date);
    const m = sleepMetrics(e);
    if (m.sleepMin != null) r.sleepDuration = m.sleepMin / 60;
    if (e.sleepQuality != null) r.sleepQuality = e.sleepQuality;
    if (e.energy != null) r.energy = e.energy;
    if (e.sleepiness != null) r.sleepiness = e.sleepiness;
    if (m.onset != null) r.sleepOnsetMin = m.onset;
    if (m.wake != null) r.wakeMin = m.wake;
    if (e.awakenings != null) r.awakenings = e.awakenings;
    if (e.lateScreen != null) r.lateScreen = ['none', 'brief', 'moderate', 'heavy'].indexOf(e.lateScreen);
    const caf = parseClock(e.lastCaffeine);
    if (caf != null) r.caffeineHour = caf;
    if (e.exerciseMin != null) r.exerciseMin = e.exerciseMin;
    // deviation of onset from mean of the previous 7 entries
    const prev = sorted.slice(Math.max(0, idx - 7), idx).map((x) => sleepMetrics(x).onset).filter((x): x is number => x != null);
    if (m.onset != null && prev.length >= 3) r.onsetDeviation = Math.abs(m.onset - mean(prev)!);
    const ss = sessByDate.get(e.date) ?? [];
    const morningSess = ss.filter((s) => sessionLocalHour(s) < 11).reduce((a, s) => a + (s.end - s.start) / 60000, 0);
    const totalSess = ss.reduce((a, s) => a + (s.end - s.start) / 60000, 0);
    const morningLog = e.morningOutdoorMin;
    const totalLog = [e.morningOutdoorMin, e.daytimeOutdoorMin, e.eveningOutdoorMin].filter((x): x is number => x != null);
    if (morningLog != null || morningSess > 0) r.morningOutdoor = Math.max(morningLog ?? 0, morningSess);
    if (totalLog.length || totalSess > 0) r.totalOutdoor = Math.max(totalLog.reduce((a, b) => a + b, 0), totalSess);
  });
  // Days with sessions but no entry still contribute outdoor variables.
  for (const [d, ss] of sessByDate) {
    const r = row(d);
    if (r.totalOutdoor == null) r.totalOutdoor = ss.reduce((a, s) => a + (s.end - s.start) / 60000, 0);
    const seds = ss.map((s) => s.ambientSed).filter((x): x is number => x != null);
    if (seds.length) r.ambientSed = seds.reduce((a, b) => a + b, 0);
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = mean(xs)!, my = mean(ys)!;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(xs: number[], ys: number[]): number | null {
  return pearson(ranks(xs), ranks(ys));
}

export interface Pairing { points: { date: string; x: number; y: number }[]; r: number | null; rho: number | null; strength: string; caveat: string }

/** Pairs X on day d with Y on day d + lag. */
export function pairVariables(rows: DayRow[], x: VarKey, y: VarKey, lag: 0 | 1): Pairing {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const points: Pairing['points'] = [];
  for (const r of rows) {
    const xv = r[x];
    if (xv == null) continue;
    let target = r;
    if (lag === 1) {
      const next = new Date(Date.parse(r.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
      const t = byDate.get(next);
      if (!t) continue;
      target = t;
    }
    const yv = target[y];
    if (yv == null) continue;
    points.push({ date: r.date, x: xv, y: yv });
  }
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const r = pearson(xs, ys);
  const rho = spearman(xs, ys);
  return { points, r, rho, strength: describeStrength(r, points.length), caveat: CORRELATION_CAVEAT };
}

export const CORRELATION_CAVEAT =
  'A pattern in your own journal is an association, not proof of cause. Weather, workload, illness, weekdays and how you rate yourself can all move both variables together.';

export function describeStrength(r: number | null, n: number): string {
  if (r == null) return n < 3 ? 'Not enough paired days yet (need at least 3).' : 'No variation in one of the variables.';
  const a = Math.abs(r);
  const dir = r > 0 ? 'positive' : 'negative';
  const word = a < 0.1 ? 'no meaningful' : a < 0.3 ? `a weak ${dir}` : a < 0.5 ? `a moderate ${dir}` : `a strong ${dir}`;
  const caution = n < 10 ? ` With only ${n} paired days this could easily be chance.` : n < 30 ? ` Based on ${n} paired days — treat as tentative.` : ` Based on ${n} paired days.`;
  return `Your data show ${word} association (r = ${r.toFixed(2)}).${caution}`;
}

// --- personal experiments --------------------------------------------------

export const OUTCOME_LABEL: Record<OutcomeKey, string> = {
  sleepDuration: 'Sleep duration (h)',
  sleepQuality: 'Sleep quality (1–5)',
  energy: 'Daytime energy (1–5)',
  sleepiness: 'Daytime sleepiness (1–5)',
  sleepOnsetMin: 'Sleep onset (clock)',
  wakeMin: 'Wake time (clock)',
};

export interface PhaseStats { n: number; mean: number | null; sd: number | null }
export interface ExperimentResult {
  baseline: PhaseStats;
  intervention: PhaseStats;
  difference: number | null;
  phase: 'baseline' | 'intervention' | 'finished';
  daysElapsed: number;
  limitations: string[];
}

export function analyzeExperiment(x: Experiment, rows: DayRow[], today: string): ExperimentResult {
  const day0 = Date.parse(x.startDate + 'T00:00:00Z');
  const dayIdx = (d: string) => Math.round((Date.parse(d + 'T00:00:00Z') - day0) / 86400000);
  const b: number[] = [], iv: number[] = [];
  for (const r of rows) {
    const v = r[x.outcome as VarKey];
    if (v == null) continue;
    const i = dayIdx(r.date);
    if (i >= 0 && i < x.baselineDays) b.push(v);
    else if (i >= x.baselineDays && i < x.baselineDays + x.interventionDays) iv.push(v);
  }
  const stats = (xs: number[]): PhaseStats => ({ n: xs.length, mean: mean(xs), sd: stdev(xs) });
  const elapsed = dayIdx(today) + 1;
  const phase = elapsed <= x.baselineDays ? 'baseline' : elapsed <= x.baselineDays + x.interventionDays ? 'intervention' : 'finished';
  const bs = stats(b), is = stats(iv);
  const limitations = [
    'Not blinded: knowing what you changed can shift how you rate sleep and energy.',
    'Single person, sequential phases: seasons, schedules and stress can change between phases.',
  ];
  if (bs.n < 5 || is.n < 5) limitations.push('Fewer than 5 logged days in a phase — differences are very uncertain.');
  if (bs.sd != null && is.sd != null && bs.mean != null && is.mean != null) {
    const pooled = Math.sqrt((bs.sd ** 2 + is.sd ** 2) / 2);
    if (pooled > 0 && Math.abs(is.mean - bs.mean) < pooled * 0.5) limitations.push('The change is small relative to normal day-to-day variation.');
  }
  return {
    baseline: bs,
    intervention: is,
    difference: bs.mean != null && is.mean != null ? is.mean - bs.mean : null,
    phase,
    daysElapsed: Math.max(0, elapsed),
    limitations,
  };
}
