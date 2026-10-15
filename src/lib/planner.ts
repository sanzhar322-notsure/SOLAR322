/**
 * Context-aware solar windows.
 *
 * The daylight period is divided by the Sun's CALCULATED elevation into a
 * morning window (Sun low and rising), a daytime window (Sun high) and an
 * afternoon/evening window (Sun low and descending). The threshold adapts to
 * the season: min(30°, 60% of today's noon elevation), never below 6°.
 *
 * The names are conceptual categories for organising information. They are
 * not claims that one period produces a uniquely beneficial biological
 * effect, and no window is labelled "safe" or "unsafe". Each window carries
 * concise context lines generated from real data (forecast UV, cloud, heat,
 * air mass) and the user's own schedule and priorities.
 */
import type { SolarDay } from './astro/solar';
import { airMass, sunPosition } from './astro/solar';
import type { HourlySeries } from './data/types';
import { interpolate, nearest, HOURLY_MEAN_SHIFT } from './data/series';
import type { PriorityKey } from '../state/settings';
import { parseClock } from './sleep';
import { ambientDose } from './uv';

export type WindowKind = 'morning' | 'daytime' | 'evening';

export const WINDOW_LABEL: Record<WindowKind, string> = {
  morning: 'Morning solar window',
  daytime: 'Daytime solar window',
  evening: 'Afternoon & evening window',
};

export const WINDOW_BLURB: Record<WindowKind, string> = {
  morning: 'Sun low and rising',
  daytime: 'Sun high in the sky',
  evening: 'Sun low and descending',
};

export interface UvProfile {
  known: boolean;
  start: number | null;
  end: number | null;
  peak: number | null;
  peakTime: number | null;
}

export interface SolarWindow {
  kind: WindowKind;
  start: number;
  end: number;
  elevStart: number;
  elevEnd: number;
  elevPeak: number;
  elevPeakTime: number;
  uv: UvProfile;
  cloudMean: number | null;
  apparentMax: number | null;
  apparentMin: number | null;
  precipProbMax: number | null;
  ghiPeak: number | null;
  snow: boolean;
}

export type LineTopic = 'light' | 'circadian' | 'uv' | 'heat' | 'weather' | 'spectrum' | 'activity';
export type LineWeight = 'note' | 'relevant' | 'important';

export interface ContextLine {
  topic: LineTopic;
  text: string;
  weight: LineWeight;
}

const STEP = 10 * 60000;

/** Elevation dividing "low Sun" windows from the daytime window. */
export function windowThreshold(noonElevation: number | null): number {
  const noon = noonElevation ?? 0;
  return Math.max(6, Math.min(30, 0.6 * noon));
}

function classify(elev: number, morning: boolean, threshold: number): WindowKind {
  if (elev >= threshold) return 'daytime';
  return morning ? 'morning' : 'evening';
}

/** Which window a moment falls into (null when the Sun is below the horizon). */
export function windowKindAt(t: number, lat: number, lon: number, day: SolarDay): WindowKind | null {
  const p = sunPosition(t, lat, lon);
  if (p.elevation < -0.833) return null;
  return classify(p.elevation, p.hourAngle < 0, windowThreshold(day.noonElevation));
}

export function planWindows(day: SolarDay, hourly: HourlySeries | null, lat: number, lon: number): SolarWindow[] {
  const from = day.sunrise ?? (day.status === 'polar-day' ? day.dayStart : day.sunset != null ? day.dayStart : null);
  const to = day.sunset ?? (day.status === 'polar-day' || day.sunrise != null ? day.dayEnd : null);
  if (from == null || to == null || to <= from) return [];
  const threshold = windowThreshold(day.noonElevation);
  // A day whose Sun never rises far is treated as one daytime window.
  const lowSunDay = (day.noonElevation ?? 0) < 10;

  type Sample = { t: number; elev: number; kind: WindowKind };
  const samples: Sample[] = [];
  for (let t = from; t < to; t += STEP) {
    const p = sunPosition(t, lat, lon);
    samples.push({ t, elev: p.elevation, kind: lowSunDay ? 'daytime' : classify(p.elevation, p.hourAngle < 0, threshold) });
  }
  const groups: Sample[][] = [];
  for (const s of samples) {
    const g = groups[groups.length - 1];
    if (g && g[0].kind === s.kind) g.push(s);
    else groups.push([s]);
  }

  const vals = (arr: (number | null)[] | undefined, ts: number[], shift = 0) =>
    arr && hourly ? ts.map((t) => interpolate(hourly.time, arr, t, shift)) : ts.map(() => null);
  const max = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.max(...v) : null;
  };
  const min = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.min(...v) : null;
  };
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  // Refine each boundary to the exact threshold crossing (samples are 10 min apart).
  const boundary = groups.map((g, i) => {
    if (i === 0) return from;
    let lo = g[0].t - STEP, hi = g[0].t;
    const above = (t: number) => sunPosition(t, lat, lon).elevation >= threshold;
    const hiAbove = above(hi);
    for (let k = 0; k < 20 && hi - lo > 1000; k++) {
      const mid = (lo + hi) / 2;
      if (above(mid) === hiAbove) hi = mid; else lo = mid;
    }
    return Math.round(hi);
  });

  return groups.map((g, i) => {
    const start = boundary[i];
    const end = i === groups.length - 1 ? to : boundary[i + 1];
    const ts = [start, ...g.map((s) => s.t).filter((t) => t > start && t < end), end];
    const elevs = ts.map((t) => sunPosition(t, lat, lon).elevation);
    let pi = 0;
    elevs.forEach((e, k) => { if (e > elevs[pi]) pi = k; });
    // Below the horizon UV is physically ~0; fill only gaps inside an existing forecast, never invent a forecast.
    const uvs = vals(hourly?.uvIndex, ts).map((v, k) => (hourly && v == null && elevs[k] < 0 ? 0 : v));
    let uvPeak: number | null = null, uvPeakTime: number | null = null;
    uvs.forEach((v, k) => { if (v != null && (uvPeak == null || v > uvPeak)) { uvPeak = v; uvPeakTime = ts[k]; } });
    const codes = hourly ? ts.map((t) => nearest(hourly.time, hourly.weatherCode, t)) : [];
    return {
      kind: g[0].kind,
      start,
      end,
      elevStart: elevs[0],
      elevEnd: elevs[elevs.length - 1],
      elevPeak: elevs[pi],
      elevPeakTime: ts[pi],
      uv: {
        known: uvs.some((v) => v != null),
        start: uvs[0],
        end: uvs[uvs.length - 1],
        peak: uvPeak,
        peakTime: uvPeakTime,
      },
      cloudMean: mean(vals(hourly?.cloudCover, ts)),
      apparentMax: max(vals(hourly?.apparentTemperature, ts)),
      apparentMin: min(vals(hourly?.apparentTemperature, ts)),
      precipProbMax: max(vals(hourly?.precipitationProbability, ts)),
      ghiPeak: max(vals(hourly?.shortwave, ts, HOURLY_MEAN_SHIFT)),
      snow: codes.some((c) => c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86)),
    };
  });
}

/** The window containing `now`, else the next one that starts later. */
export function currentOrNextWindow(windows: SolarWindow[], now: number): SolarWindow | null {
  return windows.find((w) => w.end > now) ?? null;
}

// --- context -----------------------------------------------------------------

export interface WindowContextInput {
  tz: string;
  hour12: boolean;
  priorities: PriorityKey[];
  targetWake: string;
  targetBedtime: string;
  windDownMinutes: number;
  day: SolarDay;
  lat: number;
  lon: number;
  formatTime: (t: number) => string;
  localMinutes: (t: number) => number;
}

const deg = (v: number) => `${Math.round(v)}°`;
const dur = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
};

/** UV context sentence scaled by intensity — informative rather than prescriptive. */
export function uvSentence(peak: number, at: string): { text: string; weight: LineWeight } | null {
  const v = peak.toFixed(1);
  if (peak < 2.5) return { text: `UV stays low (up to ${v}).`, weight: 'note' };
  if (peak < 5.5) return { text: `UV rises to ${v} around ${at}. A short session and several hours outside are different propositions — protection becomes more relevant as time accumulates.`, weight: 'note' };
  if (peak < 7.5) return { text: `UV reaches ${v} around ${at}. At this intensity exposure builds fairly quickly; for longer stays, shade, clothing or sunscreen are options to weigh.`, weight: 'relevant' };
  return { text: `UV peaks at ${v} near ${at} — intense. Beyond a short session, exposure accumulates fast; plan shade, covering or sunscreen for extended time outside.`, weight: 'important' };
}

export function heatSentence(apparentMax: number | null, always: boolean): { text: string; weight: LineWeight } | null {
  if (apparentMax == null) return null;
  const t = Math.round(apparentMax);
  if (apparentMax >= 39) return { text: `Feels-like up to ${t} °C — heat strain is likely with exertion; water, shade and rest matter more than usual.`, weight: 'important' };
  if (apparentMax >= 32) return { text: `Hot: feels-like up to ${t} °C. Pace activity and bring water.`, weight: 'relevant' };
  if (apparentMax <= -10) return { text: `Feels-like down to ${t} °C — exposed skin cools quickly.`, weight: 'relevant' };
  return always ? { text: `Feels-like up to ${t} °C.`, weight: 'note' } : null;
}

export function windowContext(w: SolarWindow, c: WindowContextInput): ContextLine[] {
  const L: ContextLine[] = [];
  const has = (k: PriorityKey) => c.priorities.includes(k);
  const f = c.formatTime;
  const cloud = w.cloudMean != null ? ` Cloud ≈ ${Math.round(w.cloudMean)}%.` : '';

  // Light — always.
  if (w.kind === 'morning') {
    const fromRise = c.day.sunrise != null && Math.abs(w.start - c.day.sunrise) < 60000;
    L.push({ topic: 'light', weight: 'note', text: `${fromRise ? `Sunrise ${f(w.start)}` : `From ${f(w.start)}`}; the Sun climbs to ${deg(w.elevEnd)} by ${f(w.end)}.${cloud}` });
  } else if (w.kind === 'daytime') {
    L.push({ topic: 'light', weight: 'note', text: `Sun above ${deg(Math.min(w.elevStart, w.elevEnd))}, highest at ${deg(w.elevPeak)} around ${f(w.elevPeakTime)}.${cloud}` });
  } else {
    const toSet = c.day.sunset != null && Math.abs(w.end - c.day.sunset) < 60000;
    L.push({ topic: 'light', weight: 'note', text: `The Sun descends from ${deg(w.elevStart)} to ${toSet ? `the horizon at ${f(w.end)}` : `${deg(w.elevEnd)} by ${f(w.end)}`}${c.day.civilDusk ? `; civil dusk ${f(c.day.civilDusk)}` : ''}.${cloud}` });
  }

  // Circadian & sleep — relation to the user's own schedule.
  const wake = parseClock(c.targetWake) ?? 420;
  const bed = parseClock(c.targetBedtime) ?? 1380;
  if ((has('circadian') || has('morning')) && w.kind === 'morning') {
    const startMin = c.localMinutes(w.start), endMin = c.localMinutes(w.end);
    if (wake < startMin) L.push({ topic: 'circadian', weight: 'note', text: `You plan to wake at ${c.targetWake}, ${dur((startMin - wake) * 60000)} before sunrise — outdoor daylight begins with this window.` });
    else if (wake <= endMin) L.push({ topic: 'circadian', weight: 'note', text: `Your planned wake time (${c.targetWake}) falls inside this window — a natural anchor for a consistent morning routine.` });
    else L.push({ topic: 'circadian', weight: 'note', text: `This window ends before your planned wake time (${c.targetWake}); the daytime window is your first daylight.` });
  }
  if ((has('sleep') || has('circadian')) && w.kind === 'evening') {
    const windStart = (bed - c.windDownMinutes + 1440) % 1440;
    const gap = (windStart - c.localMinutes(w.end) + 1440) % 1440;
    L.push({ topic: 'circadian', weight: 'note', text: `Daylight ends ${dur(gap * 60000)} before your wind-down (${String(Math.floor(windStart / 60)).padStart(2, '0')}:${String(windStart % 60).padStart(2, '0')}) — a natural point to finish outdoor activity and let the evening get dimmer.` });
  }

  // UV — always surfaced when meaningful; detail at low levels only if the user asked for it.
  if (w.uv.known && w.uv.peak != null) {
    const s = uvSentence(w.uv.peak, w.uv.peakTime != null ? f(w.uv.peakTime) : f(w.elevPeakTime));
    if (s && (s.weight !== 'note' || w.uv.peak >= 2.5 || has('uv') || has('extended'))) L.push({ topic: 'uv', ...s });
    if (w.kind !== 'daytime' && w.uv.peak > 0.5 && (has('uv') || has('spectrum'))) {
      L.push({ topic: 'uv', weight: 'note', text: 'Lower than midday, but not zero — UV is present whenever the Sun is up.' });
    }
  } else {
    const strong = w.elevPeak > 50;
    L.push({ topic: 'uv', weight: strong ? 'relevant' : 'note', text: `No UV forecast for this window.${strong ? ' With the Sun above 50°, UV is usually substantial under clear skies.' : ''}` });
  }
  if (w.snow) L.push({ topic: 'uv', weight: 'relevant', text: 'Snow forecast — fresh snow reflects much of the UV back up.' });

  // Heat.
  const heat = heatSentence(w.apparentMax, has('heat') || has('activity'));
  if (heat) L.push({ topic: 'heat', ...heat });

  // Weather.
  if (w.precipProbMax != null && w.precipProbMax >= 50) L.push({ topic: 'weather', weight: 'note', text: `Precipitation likely (up to ${Math.round(w.precipProbMax)}%).` });

  // Spectrum lens.
  if (has('spectrum')) {
    const am = airMass(w.kind === 'daytime' ? w.elevPeak : Math.max(1, (w.elevStart + w.elevEnd) / 2));
    if (am != null) {
      L.push({
        topic: 'spectrum',
        weight: 'note',
        text:
          w.kind === 'daytime'
            ? `Shortest atmospheric path of the day (air mass ≈ ${am.toFixed(1)}): the UV-B share of sunlight is at its daily maximum.`
            : `Longer atmospheric path (air mass ≈ ${am.toFixed(1)}): relatively less UV-B and blue, relatively more red — in a lower total amount of light.`,
      });
    }
  }

  // Activity / extended time.
  if (has('activity') || has('extended')) {
    const comfy = w.apparentMax != null && w.apparentMin != null ? ` Feels-like ${Math.round(w.apparentMin)}–${Math.round(w.apparentMax)} °C.` : '';
    L.push({ topic: 'activity', weight: 'note', text: `${dur(w.end - w.start)} of daylight in this window.${comfy}` });
  }
  return L;
}

// --- session check -------------------------------------------------------------

export interface SessionCheck {
  sed: number | null;
  peakUvi: number | null;
  coverage: number;
  text: string;
  weight: LineWeight;
}

/**
 * Cumulative AMBIENT UV for a planned session (horizontal surface — skin
 * usually receives less). The protective sentence appears when the ambient
 * dose exceeds ~2 SED, roughly where the most sun-sensitive skin can begin to
 * redden; many people tolerate considerably more.
 */
export function checkSession(hourly: HourlySeries | null, start: number, minutes: number): SessionCheck {
  if (!hourly) return { sed: null, peakUvi: null, coverage: 0, text: 'No UV forecast available for this time, so the app can’t estimate cumulative exposure.', weight: 'note' };
  const d = ambientDose(hourly.time, hourly.uvIndex, start, start + minutes * 60000);
  if (d.sed == null) return { sed: null, peakUvi: d.peakUvi, coverage: d.coverage, text: 'This session runs outside the forecast period, so cumulative UV can’t be estimated.', weight: 'note' };
  const s = d.sed;
  const base = `Ambient UV over this session ≈ ${s.toFixed(1)} SED (peak UV ${d.peakUvi?.toFixed(1) ?? '—'}).`;
  if (s < 1) return { ...d, sed: s, text: `${base} Low cumulative intensity.`, weight: 'note' };
  if (s < 2) return { ...d, sed: s, text: `${base} Moderate — your own history is the best guide to how this feels for you.`, weight: 'note' };
  if (s < 4) return { ...d, sed: s, text: `${base} For a session like this, shade breaks, clothing, a hat or sunscreen become options worth considering — chosen according to your activity and skin.`, weight: 'relevant' };
  return { ...d, sed: s, text: `${base} That is a substantial cumulative dose; for this length of time at these levels, plan protection (shade, covering, sunscreen) rather than leaving it to chance.`, weight: 'important' };
}

export interface UvPeak { t: number; uv: number }

/** Highest forecast UV within [start, end). */
export function uvPeak(hourly: HourlySeries | null, start: number, end: number): UvPeak | null {
  if (!hourly) return null;
  let best: UvPeak | null = null;
  hourly.time.forEach((t, i) => {
    const v = hourly.uvIndex[i];
    if (t >= start && t < end && v != null && (!best || v > best.uv)) best = { t, uv: v };
  });
  return best;
}
