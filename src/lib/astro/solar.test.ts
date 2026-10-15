import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import {
  airMass, compassPoint, computeSolarDay, horizonDip, nextEvent, skyPhase, solarCoordinates, sunPosition,
} from './solar';
import { localDayBounds, type YMD } from '../time/tz';

const MIN = 60000;

interface Site { name: string; lat: number; lon: number; tz: string }
const SITES: Site[] = [
  { name: 'Almaty', lat: 43.2389, lon: 76.8897, tz: 'Asia/Almaty' },
  { name: 'Astana', lat: 51.1694, lon: 71.4491, tz: 'Asia/Almaty' },
  { name: 'New York', lat: 40.7128, lon: -74.006, tz: 'America/New_York' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  { name: 'Quito', lat: -0.1807, lon: -78.4678, tz: 'America/Guayaquil' },
  { name: 'London', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
];
const DATES: YMD[] = [
  { year: 2026, month: 3, day: 20 },
  { year: 2026, month: 6, day: 21 },
  { year: 2026, month: 10, day: 15 },
  { year: 2026, month: 12, day: 21 },
];

/** Reference from astronomy-engine (VSOP87-based, independently validated). */
function reference(site: Site, date: YMD) {
  const obs = new Astronomy.Observer(site.lat, site.lon, 0);
  const { start } = localDayBounds(date, site.tz);
  const from = new Date(start);
  const ms = (t: Astronomy.AstroTime | null) => (t ? t.date.getTime() : null);
  return {
    sunrise: ms(Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, from, 1)),
    sunset: ms(Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, from, 1)),
    civilDawn: ms(Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, +1, from, 1, -6)),
    civilDusk: ms(Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, -1, from, 1, -6)),
    nauticalDawn: ms(Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, +1, from, 1, -12)),
    astronomicalDusk: ms(Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, -1, from, 1, -18)),
    solarNoon: Astronomy.SearchHourAngle(Astronomy.Body.Sun, obs, 0, from, +1).time.date.getTime(),
  };
}

describe('solar coordinates (NOAA / Meeus)', () => {
  it('matches Meeus Example 25.a (1992 Oct 13, 0h TD) declination within 0.01°', () => {
    const c = solarCoordinates(Date.UTC(1992, 9, 13, 0, 0, 0));
    expect(c.declination).toBeCloseTo(-7.78507, 1);
    expect(Math.abs(c.declination - -7.78507)).toBeLessThan(0.01);
    expect(Math.abs(c.rightAscension - 198.38083)).toBeLessThan(0.01);
    expect(c.distanceAU).toBeCloseTo(0.99766, 3);
  });

  it('equation of time stays within its known annual range (−14.3 … +16.5 min)', () => {
    for (let d = 0; d < 365; d += 5) {
      const { equationOfTime } = solarCoordinates(Date.UTC(2026, 0, 1 + d, 12));
      expect(equationOfTime).toBeGreaterThan(-14.8);
      expect(equationOfTime).toBeLessThan(16.8);
    }
  });
});

describe('sun position vs astronomy-engine', () => {
  it('elevation and azimuth agree within 0.05° over many instants', () => {
    for (const site of SITES) {
      const obs = new Astronomy.Observer(site.lat, site.lon, 0);
      for (let h = 0; h < 24; h += 3) {
        const t = new Date(Date.UTC(2026, 9, 15, h, 17));
        const eq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
        const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec);
        const p = sunPosition(t.getTime(), site.lat, site.lon);
        expect(Math.abs(p.elevation - hor.altitude)).toBeLessThan(0.05);
        if (p.elevation > -80 && p.elevation < 85) {
          const dAz = Math.abs(((p.azimuth - hor.azimuth + 540) % 360) - 180);
          expect(dAz).toBeLessThan(0.1);
        }
      }
    }
  });
});

describe('sunrise, sunset, twilight and solar noon', () => {
  for (const site of SITES) {
    for (const date of DATES) {
      it(`${site.name} ${date.year}-${date.month}-${date.day} within ±2 min of reference`, () => {
        const day = computeSolarDay(date, site.lat, site.lon, site.tz);
        const ref = reference(site, date);
        expect(day.status).toBe('normal');
        for (const k of ['sunrise', 'sunset', 'civilDawn', 'civilDusk', 'nauticalDawn', 'astronomicalDusk', 'solarNoon'] as const) {
          const r = ref[k];
          const v = day[k];
          if (r == null || r >= day.dayEnd) {
            continue; // reference event falls on the next local day
          }
          expect(v, `${k}`).not.toBeNull();
          expect(Math.abs((v as number) - r), `${k} diff`).toBeLessThan(2 * MIN);
        }
      });
    }
  }

  it('orders events chronologically on a normal day', () => {
    const d = computeSolarDay({ year: 2026, month: 10, day: 15 }, 43.2389, 76.8897, 'Asia/Almaty');
    const seq = [d.astronomicalDawn, d.nauticalDawn, d.civilDawn, d.sunrise, d.solarNoon, d.sunset, d.civilDusk, d.nauticalDusk, d.astronomicalDusk];
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!);
    expect(d.daylightMs).toBeCloseTo((d.sunset! - d.sunrise!), -4);
  });

  it('equinox day length is close to 12 h plus refraction (~12 h 7–10 min) at mid latitudes', () => {
    const d = computeSolarDay({ year: 2026, month: 3, day: 20 }, 40.7128, -74.006, 'America/New_York');
    expect(d.daylightMs / 3600000).toBeGreaterThan(12.05);
    expect(d.daylightMs / 3600000).toBeLessThan(12.2);
  });
});

describe('polar and high-latitude edge cases', () => {
  const tromso = { lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' };

  it('reports polar day (midnight sun) in Tromsø at the June solstice', () => {
    const d = computeSolarDay({ year: 2026, month: 6, day: 21 }, tromso.lat, tromso.lon, tromso.tz);
    expect(d.status).toBe('polar-day');
    expect(d.sunrise).toBeNull();
    expect(d.sunset).toBeNull();
    expect(d.daylightMs).toBeGreaterThan(23.9 * 3600000);
    expect(d.solarNoon).not.toBeNull();
  });

  it('reports polar night in Tromsø at the December solstice, with civil twilight still present', () => {
    const d = computeSolarDay({ year: 2026, month: 12, day: 21 }, tromso.lat, tromso.lon, tromso.tz);
    expect(d.status).toBe('polar-night');
    expect(d.sunrise).toBeNull();
    expect(d.daylightMs).toBe(0);
    expect(d.civilDawn).not.toBeNull();
    expect(d.noonElevation!).toBeLessThan(0);
  });

  it('handles permanent darkness at the South Pole in June and continuous light in December', () => {
    const june = computeSolarDay({ year: 2026, month: 6, day: 21 }, -89.99, 0, 'UTC');
    expect(june.status).toBe('polar-night');
    expect(june.astronomicalDawn).toBeNull();
    const dec = computeSolarDay({ year: 2026, month: 12, day: 21 }, -89.99, 0, 'UTC');
    expect(dec.status).toBe('polar-day');
  });

  it('detects white nights (civil twilight all night) in Reykjavík in June', () => {
    const d = computeSolarDay({ year: 2026, month: 6, day: 21 }, 64.1466, -21.9426, 'Atlantic/Reykjavik');
    expect(d.status).toBe('normal');
    expect(d.civilTwilightAllNight).toBe(true);
    expect(d.civilDusk).toBeNull();
  });
});

describe('daylight-saving transitions', () => {
  it('New York spring-forward day is 23 h long and events are still correct', () => {
    const date = { year: 2026, month: 3, day: 8 };
    const d = computeSolarDay(date, 40.7128, -74.006, 'America/New_York');
    expect(d.dayEnd - d.dayStart).toBe(23 * 3600000);
    const ref = reference({ name: 'NY', lat: 40.7128, lon: -74.006, tz: 'America/New_York' }, date);
    expect(Math.abs(d.sunrise! - ref.sunrise!)).toBeLessThan(2 * MIN);
    expect(Math.abs(d.sunset! - ref.sunset!)).toBeLessThan(2 * MIN);
  });

  it('London fall-back day is 25 h long', () => {
    const d = computeSolarDay({ year: 2026, month: 10, day: 25 }, 51.5074, -0.1278, 'Europe/London');
    expect(d.dayEnd - d.dayStart).toBe(25 * 3600000);
    expect(d.sunrise).not.toBeNull();
  });
});

describe('helpers', () => {
  it('classifies sky phases by elevation', () => {
    expect(skyPhase(30)).toBe('day');
    expect(skyPhase(3)).toBe('golden');
    expect(skyPhase(-3)).toBe('civil');
    expect(skyPhase(-9)).toBe('nautical');
    expect(skyPhase(-15)).toBe('astronomical');
    expect(skyPhase(-30)).toBe('night');
  });

  it('computes compass points and air mass', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(202)).toBe('SSW');
    expect(compassPoint(359)).toBe('N');
    expect(airMass(90)).toBeCloseTo(1, 2);
    expect(airMass(30)).toBeCloseTo(2, 1);
    expect(airMass(-1)).toBeNull();
  });

  it('horizon dip is zero at ground level and ~0.6° at 300 m above a flat horizon', () => {
    expect(horizonDip(0)).toBe(0);
    expect(horizonDip(300)).toBeCloseTo(0.6, 1);
  });

  it('finds the next event, rolling into tomorrow after the last event', () => {
    const tz = 'Asia/Almaty';
    const today = computeSolarDay({ year: 2026, month: 10, day: 15 }, 43.2389, 76.8897, tz);
    const tomorrow = computeSolarDay({ year: 2026, month: 10, day: 16 }, 43.2389, 76.8897, tz);
    expect(nextEvent(today.sunrise! - 1000, [today, tomorrow])?.key).toBe('sunrise');
    expect(nextEvent(today.astronomicalDusk! + 1000, [today, tomorrow])?.key).toBe('astronomicalDawn');
  });
});
