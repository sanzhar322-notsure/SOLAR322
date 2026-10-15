import { describe, expect, it } from 'vitest';
import { ambientDose, uvBand } from './uv';
import { bedtimeFor, forwardMinutes, gradualStep, plannedOpportunity, sleepMetrics, summarize } from './sleep';
import {
  checkSession, currentOrNextWindow, heatSentence, planWindows, uvSentence, windowContext, windowKindAt, windowThreshold,
} from './planner';
import { formatClock, localMinutes } from './time/tz';
import type { PriorityKey } from '../state/settings';
import { computeSolarDay } from './astro/solar';
import { parseForecast, FULL_VARS } from './data/openMeteo';
import { makeForecastFixture } from '../test/fixtures';
import { emptyEntry, type DailyEntry } from '../state/journal';
import { recommend, type RecommendContext } from './recommend';
import { DEFAULT_SETTINGS } from '../state/settings';
import { currentAction, upcomingReminder } from './advisor';
import { analyzeExperiment, buildRows, pairVariables, pearson, spearman } from './stats';
import { estimateBands, BANDS } from './spectrum';

const ALMATY = { lat: 43.2389, lon: 76.8897, tz: 'Asia/Almaty' };
const START = Date.UTC(2026, 9, 14, 19) / 1000;

function entry(date: string, p: Partial<DailyEntry>): DailyEntry {
  return { ...emptyEntry(date), ...p };
}

describe('UV categories and ambient dose', () => {
  it('maps UV index to WHO categories using rounding', () => {
    expect(uvBand(2.4).label).toBe('Low');
    expect(uvBand(2.5).label).toBe('Moderate');
    expect(uvBand(6).label).toBe('High');
    expect(uvBand(10.4).label).toBe('Very high');
    expect(uvBand(11).label).toBe('Extreme');
  });

  it('integrates ambient erythemal exposure: UVI 4 for one hour = 3.6 SED', () => {
    const t = [0, 3600000, 7200000];
    const d = ambientDose(t, [4, 4, 4], 0, 3600000);
    expect(d.sed).toBeCloseTo(3.6, 5);
    expect(d.coverage).toBe(1);
  });

  it('refuses to report a dose when UV data covers too little of the session', () => {
    const d = ambientDose([0, 3600000], [4, null], 0, 3600000);
    expect(d.sed).toBeNull();
    expect(d.coverage).toBe(0);
    expect(ambientDose([0], [1], 10, 5).sed).toBeNull();
  });
});

describe('sleep calculations', () => {
  it('computes duration across midnight and latency', () => {
    const m = sleepMetrics({ bedtime: '23:10', sleepOnset: '23:40', wakeTime: '07:10' });
    expect(m.sleepMin).toBe(450);
    expect(m.inBedMin).toBe(480);
    expect(m.latencyMin).toBe(30);
    expect(m.onset).toBe(-20);
  });

  it('handles after-midnight bedtimes and missing onset', () => {
    expect(sleepMetrics({ bedtime: '00:30', sleepOnset: null, wakeTime: '08:00' }).sleepMin).toBe(450);
    expect(sleepMetrics({ bedtime: null, sleepOnset: null, wakeTime: '08:00' }).sleepMin).toBeNull();
    expect(forwardMinutes(1380, 420)).toBe(480);
  });

  it('summarises recent nights and counts short ones', () => {
    const entries = [
      entry('2026-10-10', { sleepOnset: '23:00', wakeTime: '07:00', sleepQuality: 4 }),
      entry('2026-10-11', { sleepOnset: '01:00', wakeTime: '06:30', sleepQuality: 2 }),
      entry('2026-10-12', { sleepOnset: '23:30', wakeTime: '07:00' }),
      entry('2026-09-01', { sleepOnset: '22:00', wakeTime: '10:00' }), // outside window
    ];
    const s = summarize(entries, '2026-10-12', 7, 8);
    expect(s.nights).toBe(3);
    expect(s.shortNights).toBe(1);
    expect(s.avgQuality).toBe(3);
    expect(Math.round(s.avgSleepMin!)).toBe(Math.round((480 + 330 + 450) / 3));
  });

  it('derives bedtimes, opportunities and gradual steps', () => {
    expect(bedtimeFor('07:00', 8, 15)).toBe('22:45');
    expect(plannedOpportunity('23:00', '07:00')).toBe(480);
    expect(gradualStep(480, 420, 15)).toBe(465);
    expect(gradualStep(430, 420, 15)).toBe(420);
  });
});

describe('context-aware solar windows', () => {
  const day = computeSolarDay({ year: 2026, month: 10, day: 15 }, ALMATY.lat, ALMATY.lon, ALMATY.tz);
  const snap = parseForecast(makeForecastFixture({ startUnix: START, uvScale: 9 }), FULL_VARS, 0);
  const ctx = (priorities: PriorityKey[] = []) => ({
    tz: ALMATY.tz, hour12: false, priorities, targetWake: '07:00', targetBedtime: '23:00', windDownMinutes: 60, day,
    lat: ALMATY.lat, lon: ALMATY.lon, formatTime: (t: number) => formatClock(t, ALMATY.tz, false), localMinutes: (t: number) => localMinutes(t, ALMATY.tz),
  });

  it('divides daylight into morning, daytime and evening by calculated elevation', () => {
    const w = planWindows(day, snap.hourly, ALMATY.lat, ALMATY.lon);
    expect(w.map((x) => x.kind)).toEqual(['morning', 'daytime', 'evening']);
    expect(w[0].start).toBe(day.sunrise);
    expect(w[2].end).toBe(day.sunset);
    const th = windowThreshold(day.noonElevation);
    expect(Math.abs(w[0].elevEnd - th)).toBeLessThan(0.05);
    expect(Math.abs(w[2].elevStart - th)).toBeLessThan(0.05);
    expect(w[0].end).toBe(w[1].start);
    expect(w[1].elevPeak).toBeCloseTo(day.noonElevation!, 0);
    expect(w[1].uv.peak!).toBeGreaterThan(w[0].uv.peak!);
  });

  it('adapts the threshold to the season and treats low-Sun days as one window', () => {
    expect(windowThreshold(70)).toBe(30);
    expect(windowThreshold(20)).toBe(12);
    expect(windowThreshold(3)).toBe(6);
    const winter = computeSolarDay({ year: 2026, month: 12, day: 21 }, 66.5, 25.7, 'Europe/Helsinki');
    expect(planWindows(winter, null, 66.5, 25.7).map((x) => x.kind)).toEqual(['daytime']);
    const polar = computeSolarDay({ year: 2026, month: 12, day: 21 }, 69.65, 18.96, 'Europe/Oslo');
    expect(planWindows(polar, null, 69.65, 18.96)).toEqual([]);
  });

  it('writes contextual lines from real values, without blanket commands', () => {
    const w = planWindows(day, snap.hourly, ALMATY.lat, ALMATY.lon);
    const all = w.flatMap((x) => windowContext(x, ctx(['circadian', 'sleep', 'spectrum'])));
    const text = all.map((l) => l.text).join(' ');
    expect(text).toMatch(/Sunrise \d\d:\d\d/);
    expect(text).toMatch(/07:00/); // relates to the planned wake time
    expect(text).toMatch(/wind-down \(22:00\)/);
    expect(text).toMatch(/air mass/);
    expect(text.toLowerCase()).not.toContain('safe');
    expect(text).not.toMatch(/Seek shade|Use sunscreen when|Protection required/);
    // morning window with low UV mentions no protection at all
    const morning = windowContext(w[0], ctx([])).map((l) => l.text).join(' ');
    expect(morning).not.toMatch(/sunscreen|shade/i);
  });

  it('scales UV wording with intensity and always surfaces intense UV', () => {
    expect(uvSentence(1.5, '12:00')!.weight).toBe('note');
    expect(uvSentence(4.5, '12:00')!.text).toMatch(/time accumulates/);
    expect(uvSentence(6.5, '12:00')!.weight).toBe('relevant');
    const intense = uvSentence(9.2, '12:10')!;
    expect(intense.weight).toBe('important');
    expect(intense.text).toMatch(/9\.2.*12:10/);
    const strong = parseForecast(makeForecastFixture({ startUnix: START, uvScale: 25 }), FULL_VARS, 0);
    const mid = planWindows(day, strong.hourly, ALMATY.lat, ALMATY.lon)[1];
    expect(windowContext(mid, ctx([])).some((l) => l.topic === 'uv' && l.weight === 'important')).toBe(true);
  });

  it('says when UV is unavailable instead of guessing', () => {
    const w = planWindows(day, null, ALMATY.lat, ALMATY.lon);
    expect(w.every((x) => !x.uv.known)).toBe(true);
    expect(windowContext(w[1], ctx([])).find((l) => l.topic === 'uv')!.text).toMatch(/No UV forecast/);
  });

  it('describes heat proportionately', () => {
    expect(heatSentence(25, false)).toBeNull();
    expect(heatSentence(25, true)!.weight).toBe('note');
    expect(heatSentence(33, false)!.weight).toBe('relevant');
    expect(heatSentence(40, false)!.weight).toBe('important');
  });

  it('checks a planned session by duration using cumulative ambient UV', () => {
    const noon = day.solarNoon!;
    const short = checkSession(snap.hourly, noon, 15);
    const long = checkSession(snap.hourly, noon - 2 * 3600000, 240);
    expect(long.sed!).toBeGreaterThan(short.sed!);
    expect(short.weight).toBe('note');
    expect(long.weight).not.toBe('note');
    expect(long.text).toMatch(/SED/);
    expect(checkSession(null, noon, 30).sed).toBeNull();
  });

  it('finds the current or next window', () => {
    const w = planWindows(day, snap.hourly, ALMATY.lat, ALMATY.lon);
    expect(currentOrNextWindow(w, day.sunrise! - 3600000)?.kind).toBe('morning');
    expect(currentOrNextWindow(w, day.solarNoon!)?.kind).toBe('daytime');
    expect(currentOrNextWindow(w, day.sunset! + 1)).toBeNull();
    expect(windowKindAt(day.solarNoon!, ALMATY.lat, ALMATY.lon, day)).toBe('daytime');
    expect(windowKindAt(day.sunset! + 3600000, ALMATY.lat, ALMATY.lon, day)).toBeNull();
  });
});

describe('recommendation engine', () => {
  const base: RecommendContext = {
    entries: [], sessions: [], decisions: [], settings: DEFAULT_SETTINGS.sleep, today: '2026-10-15', now: Date.UTC(2026, 9, 15, 3),
    sunriseMin: 7 * 60 + 40, sunriseIn30Min: 8 * 60 + 15, daylightTodayMin: 650, daylightIn30Min: 590, nextWindowText: null,
  };

  it('asks for a baseline when there is not enough data', () => {
    const r = recommend(base);
    expect(r.find((x) => x.id === 'need-data')).toBeTruthy();
    expect(r.find((x) => x.id === 'short-sleep')).toBeFalsy();
  });

  it('prioritises sleep duration and never moves wake time earlier when sleep is short', () => {
    const entries = ['10', '11', '12', '13', '14'].map((d) => entry(`2026-10-${d}`, { sleepOnset: '00:30', wakeTime: '06:30' }));
    const r = recommend({ ...base, entries });
    expect(r[0].id).toBe('short-sleep');
    expect(r[0].action?.targetWake).toBe(DEFAULT_SETTINGS.sleep.targetWake);
    expect(r[0].action?.targetBedtime).toBe('22:45');
    for (const rec of r) {
      for (const k of ['observed', 'suggestion', 'rationale', 'confidenceWhy', 'testNext'] as const) expect(rec[k].length).toBeGreaterThan(10);
    }
  });

  it('warns when the planned schedule is shorter than the stated need', () => {
    const r = recommend({ ...base, settings: { ...base.settings, targetBedtime: '00:30', targetWake: '06:30' } });
    const rec = r.find((x) => x.id === 'plan-too-short');
    expect(rec?.confidence).toBe('higher');
    expect(rec?.action?.targetBedtime).toBe('00:00');
  });

  it('reports a late-screen association only with enough contrasting nights, as low confidence', () => {
    const heavy = ['01', '02', '03'].map((d) => entry(`2026-10-${d}`, { sleepOnset: '00:40', wakeTime: '08:00', lateScreen: 'heavy', sleepQuality: 2 }));
    const none = ['04', '05', '06'].map((d) => entry(`2026-10-${d}`, { sleepOnset: '23:30', wakeTime: '07:30', lateScreen: 'none', sleepQuality: 4 }));
    const rec = recommend({ ...base, entries: [...heavy, ...none] }).find((x) => x.id === 'late-screens');
    expect(rec?.confidence).toBe('low');
    expect(rec?.rationale).toMatch(/association/);
  });

  it('explains seasonal change and hides dismissed suggestions for a week', () => {
    const r = recommend(base);
    expect(r.find((x) => x.id === 'season')?.title).toMatch(/darker/);
    const hidden = recommend({ ...base, decisions: [{ ruleId: 'season', decision: 'dismissed', at: base.now - 86400000, detail: '' }] });
    expect(hidden.find((x) => x.id === 'season')).toBeFalsy();
  });
});

describe('advisor (right now)', () => {
  const day = computeSolarDay({ year: 2026, month: 10, day: 15 }, ALMATY.lat, ALMATY.lon, ALMATY.tz);
  const fmt = (t: number) => formatClock(t, ALMATY.tz, false);
  const common = { day, targetWake: '07:00', targetBedtime: '23:00', windDownMinutes: 60, apparentTemp: 18, formatTime: fmt };
  it('detects wind-down and sleep windows, including across midnight', () => {
    expect(currentAction({ ...common, nowMin: 22 * 60 + 15, phase: 'night', morning: false, elevation: -40, uv: null }).id).toBe('wind-down');
    expect(currentAction({ ...common, nowMin: 2 * 60, phase: 'night', morning: true, elevation: -50, uv: null }).id).toBe('sleep');
    expect(currentAction({ ...common, targetBedtime: '00:30', nowMin: 0, phase: 'night', morning: true, elevation: -50, uv: null }).id).toBe('wind-down');
  });
  it('describes the morning window with real sunrise, wake time and cloud', () => {
    const a = currentAction({ ...common, now: day.sunrise! + 3600000, nowMin: 7 * 60 + 5, phase: 'day', morning: true, elevation: 10, uv: 0.8, cloud: 35 });
    expect(a.id).toBe('morning-window');
    expect(a.detail).toContain(`Sunrise was at ${fmt(day.sunrise!)}`);
    expect(a.detail).toContain('07:00');
    expect(a.detail).toContain('35%');
    expect(a.facts).toContain('Cloud 35%');
  });
  it('near solar noon, relates the UV peak to duration rather than commanding protection', () => {
    const a = currentAction({ ...common, nowMin: 11 * 60 + 40, phase: 'day', morning: false, elevation: day.noonElevation! - 1, uv: 4.2, uvPeak: { uv: 4.5, t: day.solarNoon! } });
    expect(a.id).toBe('midday');
    expect(a.detail).toMatch(/daily maximum/);
    expect(a.detail).toMatch(/4\.5/);
    expect(a.detail).not.toMatch(/must|Seek shade/);
    const intense = currentAction({ ...common, nowMin: 11 * 60 + 40, phase: 'day', morning: false, elevation: day.noonElevation! - 1, uv: 9, uvPeak: { uv: 9.4, t: day.solarNoon! } });
    expect(intense.tone).toBe('protect');
  });
  it('in the evening, relates declining daylight to the target bedtime', () => {
    const a = currentAction({ ...common, now: day.sunset! - 3600000, nowMin: 16 * 60 + 10, phase: 'day', morning: false, elevation: 8, uv: 0.4 });
    expect(a.id).toBe('evening-window');
    expect(a.detail).toMatch(/23:00/);
    expect(a.detail).toMatch(/1 h 00 min away/);
  });
  it('does not invent a UV number when UV is unavailable', () => {
    const a = currentAction({ ...common, nowMin: 13 * 60, phase: 'day', morning: false, elevation: day.noonElevation! - 1, uv: null });
    expect(a.detail).toMatch(/No UV forecast/);
    expect(a.facts.join(' ')).not.toMatch(/UV \d/);
  });
});

describe('statistics', () => {
  it('computes Pearson and Spearman correlation', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1);
  });

  it('pairs variables with a next-day lag and words results as associations', () => {
    const entries = [
      entry('2026-10-01', { morningOutdoorMin: 0, energy: 2, sleepOnset: '23:00', wakeTime: '07:00', sleepQuality: 2 }),
      entry('2026-10-02', { morningOutdoorMin: 20, energy: 4, sleepOnset: '23:00', wakeTime: '07:00', sleepQuality: 3 }),
      entry('2026-10-03', { morningOutdoorMin: 30, energy: 5, sleepOnset: '23:00', wakeTime: '07:00', sleepQuality: 4 }),
      entry('2026-10-04', { morningOutdoorMin: 5, energy: 3, sleepOnset: '23:00', wakeTime: '07:00', sleepQuality: 5 }),
    ];
    const rows = buildRows(entries, []);
    const same = pairVariables(rows, 'morningOutdoor', 'energy', 0);
    expect(same.points).toHaveLength(4);
    expect(same.r!).toBeGreaterThan(0.9);
    expect(same.strength).toMatch(/association/);
    expect(same.strength).toMatch(/chance/);
    const lagged = pairVariables(rows, 'morningOutdoor', 'sleepQuality', 1);
    expect(lagged.points).toHaveLength(3);
  });

  it('analyses an experiment by phase with limitations', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry(`2026-10-${String(i + 1).padStart(2, '0')}`, { energy: i < 5 ? 2 : 4 }),
    );
    const r = analyzeExperiment(
      { id: 'x', title: 't', behavior: 'b', outcome: 'energy', startDate: '2026-10-01', baselineDays: 5, interventionDays: 5, notes: '', status: 'active', createdAt: 0 },
      buildRows(entries, []),
      '2026-10-12',
    );
    expect(r.baseline.n).toBe(5);
    expect(r.intervention.n).toBe(5);
    expect(r.difference).toBe(2);
    expect(r.phase).toBe('finished');
    expect(r.limitations.join(' ')).toMatch(/blinded/);
  });
});

describe('spectrum estimates', () => {
  it('reference band shares sum to ~100%', () => {
    const g = BANDS.reduce((a, b) => a + b.groundPct, 0);
    const s = BANDS.reduce((a, b) => a + b.spacePct, 0);
    expect(g).toBeGreaterThan(99.5);
    expect(g).toBeLessThan(100.5);
    expect(s).toBeGreaterThan(99.5);
  });
  it('returns ranges only when broadband irradiance exists', () => {
    expect(estimateBands(null, 0).every((b) => b.low == null && b.high == null)).toBe(true);
    const e = estimateBands(800, 10).find((b) => b.band.id === 'ira')!;
    expect(e.low!).toBeLessThan(800 * 0.3242);
    expect(e.high!).toBeGreaterThan(800 * 0.3242);
  });
});

describe('in-app reminders', () => {
  const base = { targetWake: '07:00', targetBedtime: '23:00', windDownMinutes: 60, windDownOn: true, morningOn: true, sunUp: false };
  it('announces wind-down within 30 minutes of its start', () => {
    expect(upcomingReminder({ ...base, nowMin: 21 * 60 + 40 })?.id).toBe('wind-down-soon');
    expect(upcomingReminder({ ...base, nowMin: 21 * 60 })).toBeNull();
    expect(upcomingReminder({ ...base, windDownOn: false, nowMin: 21 * 60 + 40 })).toBeNull();
  });
  it('offers a morning daylight reminder only when the Sun is up after waking', () => {
    expect(upcomingReminder({ ...base, nowMin: 7 * 60 + 30, sunUp: true })?.id).toBe('morning-light');
    expect(upcomingReminder({ ...base, nowMin: 7 * 60 + 30, sunUp: false })).toBeNull();
    expect(upcomingReminder({ ...base, nowMin: 11 * 60, sunUp: true })).toBeNull();
  });
});
