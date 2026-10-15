/**
 * Conservative outdoor-window planner. Windows are described by forecast UV
 * category and heat — never labelled "safe". Low UV does not mean zero risk
 * (reflection, skin sensitivity, heat, eye exposure still matter).
 */
import type { SolarDay } from './astro/solar';
import { sunPosition } from './astro/solar';
import type { HourlySeries } from './data/types';
import { interpolate } from './data/series';

export type WindowKind = 'morning-light' | 'lower-uv' | 'protect' | 'minimize' | 'evening-light' | 'uv-unknown';

export interface OutdoorWindow {
  kind: WindowKind;
  start: number;
  end: number;
  peakUv: number | null;
  maxApparentTemp: number | null;
  maxPrecipProb: number | null;
  notes: string[];
}

export const WINDOW_LABEL: Record<WindowKind, string> = {
  'morning-light': 'Morning daylight · lower UV forecast',
  'lower-uv': 'Lower UV forecast',
  protect: 'Sun protection needed',
  minimize: 'Minimise midday exposure',
  'evening-light': 'Evening daylight · lower UV forecast',
  'uv-unknown': 'Daylight · UV forecast unavailable',
};

const STEP = 10 * 60000;

type Cat = 'lower' | 'protect' | 'minimize' | 'unknown';

function cat(uv: number | null): Cat {
  if (uv == null) return 'unknown';
  if (uv < 2.5) return 'lower';
  if (uv < 7.5) return 'protect';
  return 'minimize';
}

export function heatNote(apparentC: number | null): string | null {
  if (apparentC == null) return null;
  // Bands follow the US NWS heat-index categories.
  if (apparentC >= 52) return 'Extreme heat danger forecast — avoid exertion outdoors.';
  if (apparentC >= 39) return 'Dangerous heat forecast (feels ≥ 39 °C) — limit time outdoors, rest in shade, hydrate.';
  if (apparentC >= 32) return 'Hot (feels ≥ 32 °C) — heat-stress caution: shade, water, lighter activity.';
  if (apparentC >= 27) return 'Warm — take water and breaks if active.';
  if (apparentC <= -10) return 'Cold (feels ≤ −10 °C) — dress for frostbite risk on exposed skin.';
  return null;
}

export function planWindows(day: SolarDay, hourly: HourlySeries | null, latitude: number, longitude: number): OutdoorWindow[] {
  let from = day.sunrise ?? (day.status === 'polar-day' ? day.dayStart : null);
  let to = day.sunset ?? (day.status === 'polar-day' ? day.dayEnd : null);
  if (from == null && to != null) from = day.dayStart;
  if (to == null && from != null) to = day.dayEnd;
  if (from == null || to == null || to <= from) return [];

  const samples: { t: number; uv: number | null; c: Cat; temp: number | null; pp: number | null }[] = [];
  for (let t = from; t < to; t += STEP) {
    const uvRaw = hourly ? interpolate(hourly.time, hourly.uvIndex, t) : null;
    // Before sunrise / after sunset the UV is physically ~0 even if the model is missing a step.
    const elev = sunPosition(t, latitude, longitude).elevation;
    const uv = uvRaw == null && elev < 0 ? 0 : uvRaw;
    samples.push({
      t,
      uv,
      c: cat(uv),
      temp: hourly ? interpolate(hourly.time, hourly.apparentTemperature, t) : null,
      pp: hourly ? interpolate(hourly.time, hourly.precipitationProbability, t) : null,
    });
  }
  if (!samples.length) return [];

  const segs: { c: Cat; s: typeof samples }[] = [];
  for (const smp of samples) {
    const last = segs[segs.length - 1];
    if (last && last.c === smp.c) last.s.push(smp);
    else segs.push({ c: smp.c, s: [smp] });
  }

  const max = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.max(...v) : null;
  };

  return segs.map((seg, i) => {
    const start = seg.s[0].t;
    const end = i === segs.length - 1 ? to! : segs[i + 1].s[0].t;
    let kind: WindowKind =
      seg.c === 'unknown' ? 'uv-unknown' : seg.c === 'protect' ? 'protect' : seg.c === 'minimize' ? 'minimize' : 'lower-uv';
    if (kind === 'lower-uv' && i === 0 && segs.length > 1) kind = 'morning-light';
    else if (kind === 'lower-uv' && i === segs.length - 1 && segs.length > 1) kind = 'evening-light';
    const peakUv = max(seg.s.map((x) => x.uv));
    const maxApparentTemp = max(seg.s.map((x) => x.temp));
    const maxPrecipProb = max(seg.s.map((x) => x.pp));
    const notes: string[] = [];
    if (kind === 'morning-light' || kind === 'evening-light' || kind === 'lower-uv') {
      notes.push('Lower UV is not zero UV: snow, water and sand reflect UV, and sensitive skin can still burn with long exposure.');
    }
    if (kind === 'protect') notes.push('Seek shade around midday; hat, UV-protective sunglasses, covering clothing and sunscreen on exposed skin.');
    if (kind === 'minimize') notes.push('Very high UV: avoid being outside in the midday hours where possible; shade plus full protection.');
    if (kind === 'uv-unknown') notes.push('No UV forecast for this period. Use the shadow rule: if your shadow is shorter than you are, UV is likely high.');
    const h = heatNote(maxApparentTemp);
    if (h) notes.push(h);
    if (maxPrecipProb != null && maxPrecipProb >= 60) notes.push(`Precipitation likely (up to ${Math.round(maxPrecipProb)}%).`);
    return { kind, start, end, peakUv, maxApparentTemp, maxPrecipProb, notes };
  });
}

/** The current or next window that is not a "minimise" period, for the home screen. */
export function nextOpportunity(windows: OutdoorWindow[], now: number): OutdoorWindow | null {
  const upcoming = windows.filter((w) => w.end > now + 10 * 60000);
  return (
    upcoming.find((w) => w.kind === 'morning-light' || w.kind === 'lower-uv' || w.kind === 'evening-light') ??
    upcoming.find((w) => w.kind === 'protect' || w.kind === 'uv-unknown') ??
    null
  );
}

export interface UvPeak { t: number; uv: number }

export function uvPeak(hourly: HourlySeries | null, start: number, end: number): UvPeak | null {
  if (!hourly) return null;
  let best: UvPeak | null = null;
  hourly.time.forEach((t, i) => {
    const v = hourly.uvIndex[i];
    if (t >= start && t < end && v != null && (!best || v > best.uv)) best = { t, uv: v };
  });
  return best;
}
