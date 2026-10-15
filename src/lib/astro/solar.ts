/**
 * Solar astronomy engine.
 *
 * Implements the NOAA Solar Calculator algorithm (Global Monitoring Laboratory,
 * after Meeus, "Astronomical Algorithms"). Stated accuracy: about ±1 minute for
 * rise/set times at mid-latitudes for years 1800–2100, worse near the poles.
 * Event times are found by root-finding on the computed elevation rather than
 * closed-form hour-angle formulas, which keeps polar day / polar night and
 * DST days (23 h / 25 h) correct without special cases.
 *
 * Everything here is CALCULATED (geometry), not measured.
 */
import { localDayBounds, type YMD } from '../time/tz';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  /** Geometric (airless) elevation of the Sun's centre, degrees. */
  elevation: number;
  /** Elevation including an approximate standard-atmosphere refraction correction. */
  apparentElevation: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
  zenith: number;
  declination: number;
  /** Hour angle in degrees, negative before solar noon. */
  hourAngle: number;
  /** Equation of time, minutes. */
  equationOfTime: number;
  /** Earth–Sun distance, astronomical units. */
  distanceAU: number;
}

export function julianDay(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Solar coordinates for an instant (independent of observer). */
export function solarCoordinates(ms: number) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const trueAnom = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(trueAnom * RAD));
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const rightAscension = mod(
    Math.atan2(Math.cos(eps * RAD) * Math.sin(lambda * RAD), Math.cos(lambda * RAD)) * DEG,
    360,
  );
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));
  return { declination, rightAscension, equationOfTime: eqTime, distanceAU: R };
}

/** NOAA approximation of atmospheric refraction, degrees, for a geometric elevation. */
export function refractionCorrection(elevation: number): number {
  if (elevation > 85) return 0;
  const te = Math.tan(elevation * RAD);
  let arcsec: number;
  if (elevation > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elevation > -0.575)
    arcsec = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
  else arcsec = -20.772 / te;
  return arcsec / 3600;
}

export function sunPosition(ms: number, latitude: number, longitude: number): SunPosition {
  const { declination, equationOfTime, distanceAU } = solarCoordinates(ms);
  const d = new Date(ms);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  const trueSolarTime = mod(utcMinutes + equationOfTime + 4 * longitude, 1440);
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const latR = latitude * RAD, decR = declination * RAD, haR = hourAngle * RAD;
  const cosZen = Math.min(1, Math.max(-1,
    Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR)));
  const zenith = Math.acos(cosZen) * DEG;
  const elevation = 90 - zenith;
  const azimuth = mod(
    Math.atan2(Math.sin(haR), Math.cos(haR) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR)) * DEG + 180,
    360,
  );
  return {
    elevation,
    apparentElevation: elevation + refractionCorrection(elevation),
    azimuth,
    zenith,
    declination,
    hourAngle,
    equationOfTime,
    distanceAU,
  };
}

/** Standard altitude thresholds (degrees, Sun centre, geometric). */
export const THRESHOLDS = {
  /** Upper limb on a sea-level horizon: 34′ refraction + 16′ semidiameter. */
  sunrise: -0.833,
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const;

/**
 * Horizon dip for an observer raised above a flat, unobstructed horizon (sea,
 * plains). Ground-level altitude above sea level in a valley does NOT create dip.
 */
export function horizonDip(heightAboveHorizonM: number): number {
  return heightAboveHorizonM > 0 ? (2.076 * Math.sqrt(heightAboveHorizonM)) / 60 : 0;
}

export type DayStatus = 'normal' | 'polar-day' | 'polar-night';

export interface SolarDay {
  date: YMD;
  timeZone: string;
  dayStart: number;
  dayEnd: number;
  astronomicalDawn: number | null;
  nauticalDawn: number | null;
  civilDawn: number | null;
  sunrise: number | null;
  solarNoon: number | null;
  sunset: number | null;
  civilDusk: number | null;
  nauticalDusk: number | null;
  astronomicalDusk: number | null;
  noonElevation: number | null;
  /** Total time the Sun's upper limb is above the horizon within this local day. */
  daylightMs: number;
  /** Time with Sun above −6° (usable outdoor light incl. civil twilight). */
  civilLightMs: number;
  status: DayStatus;
  /** True if civil twilight never ends (white nights). */
  civilTwilightAllNight: boolean;
}

interface Crossing { t: number; rising: boolean }

const STEP = 5 * 60000;

function findCrossings(f: (t: number) => number, start: number, end: number, threshold: number): Crossing[] {
  const out: Crossing[] = [];
  let t0 = start;
  let v0 = f(t0) - threshold;
  while (t0 < end) {
    const t1 = Math.min(t0 + STEP, end);
    const v1 = f(t1) - threshold;
    if ((v0 < 0 && v1 >= 0) || (v0 >= 0 && v1 < 0)) {
      let a = t0, b = t1, va = v0;
      for (let i = 0; i < 30 && b - a > 500; i++) {
        const m = (a + b) / 2;
        const vm = f(m) - threshold;
        if ((va < 0 && vm < 0) || (va >= 0 && vm >= 0)) { a = m; va = vm; } else { b = m; }
      }
      out.push({ t: Math.round((a + b) / 2), rising: v0 < 0 });
    }
    t0 = t1;
    v0 = v1;
  }
  return out;
}

function durationAbove(f: (t: number) => number, start: number, end: number, threshold: number): number {
  const xs = findCrossings(f, start, end, threshold);
  let above = f(start) >= threshold;
  let last = start, total = 0;
  for (const x of xs) {
    if (above) total += x.t - last;
    above = x.rising;
    last = x.t;
  }
  if (above) total += end - last;
  return total;
}

export interface SolarDayOptions {
  /** Height above a flat horizon in metres (for dip). Default 0. */
  horizonHeightM?: number;
}

export function computeSolarDay(
  date: YMD, latitude: number, longitude: number, timeZone: string, opts: SolarDayOptions = {},
): SolarDay {
  const { start, end } = localDayBounds(date, timeZone);
  const elev = (t: number) => sunPosition(t, latitude, longitude).elevation;
  const riseThreshold = THRESHOLDS.sunrise - horizonDip(opts.horizonHeightM ?? 0);

  const pick = (threshold: number) => {
    const xs = findCrossings(elev, start, end, threshold);
    const rise = xs.find((x) => x.rising)?.t ?? null;
    const set = [...xs].reverse().find((x) => !x.rising)?.t ?? null;
    return { rise, set };
  };

  const sun = pick(riseThreshold);
  const civil = pick(THRESHOLDS.civil);
  const nautical = pick(THRESHOLDS.nautical);
  const astro = pick(THRESHOLDS.astronomical);

  // Solar noon: hour angle crosses zero going from negative to positive.
  const ha = (t: number) => sunPosition(t, latitude, longitude).hourAngle;
  let solarNoon: number | null = null;
  for (let t = start; t < end; t += STEP) {
    const a = ha(t), b = ha(Math.min(t + STEP, end));
    if (a <= 0 && b > 0 && b - a < 180) {
      let lo = t, hi = Math.min(t + STEP, end);
      for (let i = 0; i < 30 && hi - lo > 500; i++) {
        const m = (lo + hi) / 2;
        if (ha(m) <= 0) lo = m; else hi = m;
      }
      solarNoon = Math.round((lo + hi) / 2);
      break;
    }
  }
  const noonElevation = solarNoon != null ? elev(solarNoon) : null;
  const daylightMs = durationAbove(elev, start, end, riseThreshold);
  const civilLightMs = durationAbove(elev, start, end, THRESHOLDS.civil);
  const dayLen = end - start;

  let status: DayStatus = 'normal';
  if (sun.rise == null && sun.set == null) {
    status = daylightMs > dayLen / 2 ? 'polar-day' : 'polar-night';
  }

  return {
    date,
    timeZone,
    dayStart: start,
    dayEnd: end,
    astronomicalDawn: astro.rise,
    nauticalDawn: nautical.rise,
    civilDawn: civil.rise,
    sunrise: sun.rise,
    solarNoon,
    sunset: sun.set,
    civilDusk: civil.set,
    nauticalDusk: nautical.set,
    astronomicalDusk: astro.set,
    noonElevation,
    daylightMs,
    civilLightMs,
    status,
    civilTwilightAllNight: civilLightMs >= dayLen - 60000,
  };
}

export type SkyPhase = 'night' | 'astronomical' | 'nautical' | 'civil' | 'golden' | 'day';

export function skyPhase(elevation: number): SkyPhase {
  if (elevation >= 6) return 'day';
  if (elevation >= THRESHOLDS.sunrise) return 'golden';
  if (elevation >= THRESHOLDS.civil) return 'civil';
  if (elevation >= THRESHOLDS.nautical) return 'nautical';
  if (elevation >= THRESHOLDS.astronomical) return 'astronomical';
  return 'night';
}

export const PHASE_LABEL: Record<SkyPhase, string> = {
  night: 'Night',
  astronomical: 'Astronomical twilight',
  nautical: 'Nautical twilight',
  civil: 'Civil twilight',
  golden: 'Low Sun (golden hour)',
  day: 'Daylight',
};

export interface SolarEvent { key: string; label: string; t: number }

export const EVENT_LABELS: Record<string, string> = {
  astronomicalDawn: 'Astronomical dawn',
  nauticalDawn: 'Nautical dawn',
  civilDawn: 'Civil dawn',
  sunrise: 'Sunrise',
  solarNoon: 'Solar noon',
  sunset: 'Sunset',
  civilDusk: 'Civil dusk',
  nauticalDusk: 'Nautical dusk',
  astronomicalDusk: 'Astronomical dusk',
};

export function dayEvents(day: SolarDay): SolarEvent[] {
  const out: SolarEvent[] = [];
  for (const key of Object.keys(EVENT_LABELS)) {
    const t = day[key as keyof SolarDay] as number | null;
    if (typeof t === 'number') out.push({ key, label: EVENT_LABELS[key], t });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Next astronomical event strictly after `now`, searching today and tomorrow. */
export function nextEvent(now: number, days: SolarDay[]): SolarEvent | null {
  const all = days.flatMap(dayEvents).filter((e) => e.t > now).sort((a, b) => a.t - b.t);
  return all[0] ?? null;
}

export function compassPoint(azimuth: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(mod(azimuth, 360) / 22.5) % 16];
}

/** Relative air mass (Kasten & Young 1989) for an apparent elevation. Null below horizon. */
export function airMass(apparentElevation: number): number | null {
  if (apparentElevation <= 0) return null;
  const z = 90 - apparentElevation;
  return 1 / (Math.cos(z * RAD) + 0.50572 * (96.07995 - z) ** -1.6364);
}

/** Extraterrestrial horizontal irradiance (W/m²) — top of atmosphere, calculated. */
export function extraterrestrialHorizontal(elevation: number, distanceAU: number): number {
  if (elevation <= 0) return 0;
  return (TSI / (distanceAU * distanceAU)) * Math.sin(elevation * RAD);
}

/** Total solar irradiance at 1 AU, W/m² (Kopp & Lean 2011). */
export const TSI = 1361;
