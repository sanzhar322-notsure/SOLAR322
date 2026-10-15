import { describe, expect, it } from 'vitest';
import { CONCEPTS, conceptsForNow, type SkyContext } from './philosophy';
import { CARDS } from './evidence';
import { SOURCES, sourceById } from './sources';
import { summarizeByWindow, patternNote, weeklyMinutes } from '../lib/history';
import { computeSolarDay } from '../lib/astro/solar';
import { uvShareSeries, BAND_DATA, BANDS } from '../lib/spectrum';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../state/settings';
import { sanitizeJournal, sanitizeProfile, type OutdoorSession } from '../state/journal';
import { zonedTimeToUtc } from '../lib/time/tz';

const sky: SkyContext = {
  now: Date.UTC(2026, 9, 15, 4, 30), fmt: () => '09:30', elevation: 30, noonElevation: 42, sunrise: Date.UTC(2026, 9, 15, 1, 5),
  sunset: Date.UTC(2026, 9, 15, 12, 10), civilDawn: Date.UTC(2026, 9, 15, 0, 37), civilDusk: Date.UTC(2026, 9, 15, 12, 38),
  daylightMs: 11 * 3600000, daylightChange30dMin: -55, ghi: 600, cloud: 30, uv: 2.1, uvPeak: { uv: 2.7, t: Date.UTC(2026, 9, 15, 7) },
  temperature: 18, apparentTemp: 17, targetWake: '07:00', targetBedtime: '23:00', windDownStart: '22:00', eveningAfterSunsetMin: 350, uvShareNowVsNoon: 0.6,
};

describe('solar philosophy content integrity', () => {
  it('every concept has all three layers and resolvable sources', () => {
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(10);
    for (const c of CONCEPTS) {
      expect(c.original.length, c.id).toBeGreaterThan(80);
      expect(c.originalSources.length, c.id).toBeGreaterThan(0);
      expect(c.supports.length + c.contradicts.length + c.untested.length, c.id).toBeGreaterThan(1);
      expect(c.practical.length, c.id).toBeGreaterThan(0);
      for (const id of [...c.originalSources, ...c.evidenceSources]) expect(sourceById(id), `${c.id} → ${id}`).toBeTruthy();
      for (const id of c.relatedCards) expect(CARDS.find((x) => x.id === id), `${c.id} → card ${id}`).toBeTruthy();
      // proponents' own sources must be their writings
      const own = c.originalSources.map((id) => sourceById(id)!);
      expect(own.every((s) => s.type === 'primary-writing'), c.id).toBe(true);
    }
  });

  it('never quotes proponents (paraphrase only)', () => {
    for (const c of CONCEPTS) expect(c.original, c.id).not.toMatch(/["“”]{1}[A-Z][^"“”]{40,}["“”]/);
  });

  it('includes both thinkers and labels every sky line', () => {
    expect(CONCEPTS.some((c) => c.thinker === 'peat')).toBe(true);
    expect(CONCEPTS.some((c) => c.thinker === 'kruse')).toBe(true);
    for (const c of CONCEPTS) {
      for (const line of c.sky(sky)) {
        expect(['calculated', 'modeled', 'estimated', 'forecast', 'measured', 'user', 'unavailable']).toContain(line.kind);
        expect(line.text.length).toBeGreaterThan(10);
      }
    }
  });

  it('never presents a measured infrared value or a biological inference', () => {
    const ir = CONCEPTS.find((c) => c.id === 'infrared-mitochondria')!.sky(sky);
    expect(ir.find((l) => l.kind === 'measured')).toBeUndefined();
    expect(ir.some((l) => l.kind === 'estimated' && /estimate/.test(l.text))).toBe(true);
    expect(ir.some((l) => l.kind === 'unavailable')).toBe(true);
    expect(CONCEPTS.find((c) => c.id === 'infrared-mitochondria')!.sky({ ...sky, ghi: null })[0].kind).toBe('unavailable');
    const thy = CONCEPTS.find((c) => c.id === 'warmth-thyroid')!.sky(sky).map((l) => l.text).join(' ');
    expect(thy).toMatch(/does not — and cannot — infer/);
  });

  it('selects concepts relevant to the moment', () => {
    expect(conceptsForNow(-30, true)).toContain('sunrise-signal');
    expect(conceptsForNow(-30, false)).toContain('darkness-night');
    expect(conceptsForNow(40, false)).toContain('spectrum-package');
  });

  it('source registry has unique ids', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
  });
});

describe('spectrum data honesty', () => {
  it('flags UV-A as unavailable and UV-B as a forecast proxy', () => {
    expect(BAND_DATA.uva.status).toBe('unavailable');
    expect(BAND_DATA.uvb.status).toBe('forecast');
    for (const b of BANDS) expect(BAND_DATA[b.id]).toBeTruthy();
  });

  it('computes the UV share of sunlight and leaves low-light hours empty', () => {
    const t = [0, 3600000, 7200000, 10800000];
    const s = uvShareSeries(t, [0, 1, 6, 8], [5, 200, 800, 900]);
    expect(s.share[0]).toBeNull(); // no preceding UV value and GHI < 20 W/m²
    expect(s.share[1]).toBeCloseTo(((0 + 1) / 2) * 25 / 0.2, 5);
    expect(s.share[2]).toBeCloseTo(((1 + 6) / 2) * 25 / 0.8, 5);
    expect(s.share[3]!).toBeGreaterThan(s.share[2]!);
    expect(s.times[1]).toBe(t[1] - 30 * 60000);
  });
});

describe('solar history', () => {
  const lat = 43.2389, lon = 76.8897, tz = 'Asia/Almaty';
  const day = computeSolarDay({ year: 2026, month: 10, day: 15 }, lat, lon, tz);
  const at = (h: number, m = 0) => zonedTimeToUtc(2026, 10, 15, h, m, 0, tz);
  const sess = (start: number, mins: number, alertness: number, extra: Partial<OutdoorSession> = {}): OutdoorSession => ({
    id: String(start), status: 'done', start, end: start + mins * 60000, locationName: '', latitude: lat, longitude: lon, timezone: tz,
    weather: null, cloudCover: null, temperature: null, uvPeak: 1, uvMean: 1, ambientSed: 0.5, uvCoverage: 1, shade: null, clothing: null,
    sunscreen: null, energy: alertness, alertness, comfort: 4, afterFeel: 'better', notes: '', createdAt: 0, ...extra,
  });
  const resolve = () => ({ day, lat, lon });

  it('groups sessions by solar window and keeps subjective and environmental values apart', () => {
    const ss = [sess(at(7, 0), 20, 5), sess(at(7, 30), 20, 4), sess(at(7, 45), 15, 5), sess(at(12, 0), 30, 3), sess(at(12, 30), 30, 3), sess(at(13, 0), 30, 3, { afterFeel: 'same' })];
    const sum = summarizeByWindow(ss, resolve);
    const morning = sum.find((w) => w.kind === 'morning')!;
    const daytime = sum.find((w) => w.kind === 'daytime')!;
    expect(morning.sessions).toBe(3);
    expect(daytime.sessions).toBe(3);
    expect(morning.alertness).toBeCloseTo(14 / 3);
    expect(daytime.betterShare).toBeCloseTo(2 / 3);
    expect(morning.ambientSed).toBeCloseTo(1.5);
    const note = patternNote(sum)!;
    expect(note).toMatch(/Subjective and correlational/);
  });

  it('needs at least three sessions per window before comparing', () => {
    expect(patternNote(summarizeByWindow([sess(at(7), 20, 5), sess(at(12), 20, 2)], resolve))).toBeNull();
  });

  it('sums weekly minutes', () => {
    const w = weeklyMinutes([sess(at(7), 20, 5), sess(at(12), 40, 2)], 2, at(18));
    expect(w[1].minutes).toBe(60);
  });
});

describe('settings and profile sanitising', () => {
  it('keeps only known priorities and defaults sensibly', () => {
    expect(sanitizeSettings({ priorities: ['morning', 'bogus', 'uv', 'uv'] }).priorities).toEqual(['morning', 'uv']);
    expect(sanitizeSettings({}).priorities).toEqual(DEFAULT_SETTINGS.priorities);
  });
  it('sanitises the solar profile and older journals without one', () => {
    expect(sanitizeProfile({ pigmentation: 'olive', usualTimes: ['morning', 'nope'], typicalOutdoorMin: 99999 })).toMatchObject({ pigmentation: 'olive', usualTimes: ['morning'], typicalOutdoorMin: null });
    expect(sanitizeJournal({ entries: [] }).solarProfile.pigmentation).toBeNull();
  });
});
