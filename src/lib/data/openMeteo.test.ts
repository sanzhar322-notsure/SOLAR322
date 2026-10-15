import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_VARS, FULL_VARS, buildForecastUrl, geocode, openMeteoProvider, parseForecast } from './openMeteo';
import { ProviderError } from './types';
import { makeForecastFixture } from '../../test/fixtures';
import { freshness, interpolate, uvNow, FRESH_MS, STALE_MS } from './series';
import { num, numArray, timeArray } from './validate';

const START = Date.UTC(2026, 9, 14, 19) / 1000; // 2026-10-15 00:00 Asia/Almaty

function mockFetch(...responses: { status: number; body: unknown }[]) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('Open-Meteo request building', () => {
  it('asks for unix times, local timezone, and does not send altitude unless given', () => {
    const url = new URL(buildForecastUrl(43.23891234, 76.88971234, FULL_VARS));
    expect(url.searchParams.get('latitude')).toBe('43.2389');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('elevation')).toBeNull();
    expect(url.searchParams.get('hourly')).toContain('uv_index');
    expect(new URL(buildForecastUrl(1, 2, FULL_VARS, 851.6)).searchParams.get('elevation')).toBe('852');
  });
});

describe('parsing and validation', () => {
  it('parses a complete response with provenance and no missing fields', () => {
    const snap = parseForecast(makeForecastFixture({ startUnix: START }), FULL_VARS, 1000);
    expect(snap.provider.id).toBe('open-meteo');
    expect(snap.missing).toEqual([]);
    expect(snap.timezone).toBe('Asia/Almaty');
    expect(snap.current?.uvIndex).toBe(4.2);
    expect(snap.hourly?.time[0]).toBe(START * 1000);
    expect(snap.daily?.sunrise[0]).toBe((START + 7 * 3600) * 1000);
  });

  it('reports missing fields instead of inventing them', () => {
    const body = makeForecastFixture({ startUnix: START, omit: ['current.uv_index', 'hourly.uv_index_clear_sky'] });
    const snap = parseForecast(body, FULL_VARS, 1000);
    expect(snap.missing).toContain('current.uv_index');
    expect(snap.missing).toContain('hourly.uv_index_clear_sky');
    expect(snap.current?.uvIndex).toBeNull();
    expect(snap.hourly?.uvIndexClearSky.every((v) => v === null)).toBe(true);
  });

  it('drops implausible or non-numeric values to null', () => {
    const body = makeForecastFixture({ startUnix: START }) as { current: Record<string, unknown>; hourly: Record<string, unknown[]> };
    body.current.temperature_2m = 999;
    body.current.relative_humidity_2m = '45';
    body.hourly.uv_index[3] = -1;
    body.hourly.uv_index[4] = NaN;
    const snap = parseForecast(body, FULL_VARS, 0);
    expect(snap.current?.temperature).toBeNull();
    expect(snap.current?.humidity).toBeNull();
    expect(snap.hourly?.uvIndex[3]).toBeNull();
    expect(snap.hourly?.uvIndex[4]).toBeNull();
  });

  it('rejects responses without coordinates and non-monotonic time arrays', () => {
    expect(() => parseForecast({ hello: 1 }, FULL_VARS, 0)).toThrow(ProviderError);
    expect(timeArray([START, START - 3600])).toBeNull();
    expect(num('5', [0, 10])).toBeNull();
    expect(numArray(undefined, 3, [0, 1])).toEqual([null, null, null]);
  });
});

describe('provider fallbacks and errors', () => {
  it('retries with the core variable set on HTTP 400 and marks the snapshot reduced', async () => {
    const fn = mockFetch(
      { status: 400, body: { error: true, reason: 'Cannot initialize WeatherVariable from invalid String value uv_index_clear_sky' } },
      { status: 200, body: makeForecastFixture({ startUnix: START }) },
    );
    const snap = await openMeteoProvider.fetchSnapshot({ latitude: 43.2, longitude: 76.9 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(String(fn.mock.calls[1][0])).toContain(`hourly=${encodeURIComponent(CORE_VARS.hourly.join(','))}`);
    expect(snap.reduced).toBe(true);
    expect(snap.missing).toContain('hourly.shortwave_radiation');
    expect(snap.missing).not.toContain('hourly.uv_index');
  });

  it('surfaces rate limiting and network failures as typed errors', async () => {
    mockFetch({ status: 429, body: {} });
    await expect(openMeteoProvider.fetchSnapshot({ latitude: 1, longitude: 2 })).rejects.toMatchObject({ kind: 'rate-limit' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(openMeteoProvider.fetchSnapshot({ latitude: 1, longitude: 2 })).rejects.toMatchObject({ kind: 'network' });
  });

  it('validates geocoding results', async () => {
    mockFetch({ status: 200, body: { results: [{ name: 'Almaty', latitude: 43.25, longitude: 76.92, elevation: 786, timezone: 'Asia/Almaty', country: 'Kazakhstan', admin1: 'Almaty' }, { name: 'Bad', latitude: 999, longitude: 0 }] } });
    const r = await geocode('Almaty');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Almaty', timezone: 'Asia/Almaty', elevation: 786 });
    expect(await geocode('a')).toEqual([]);
  });
});

describe('freshness and interpolation', () => {
  it('classifies data age as fresh, aging, stale', () => {
    expect(freshness(0, FRESH_MS - 1).state).toBe('fresh');
    expect(freshness(0, FRESH_MS + 1).state).toBe('aging');
    expect(freshness(0, STALE_MS + 1).state).toBe('stale');
  });

  it('interpolates within series but never across gaps or outside the range', () => {
    const t = [0, 3600000, 7200000];
    expect(interpolate(t, [0, 4, 8], 1800000)).toBe(2);
    expect(interpolate(t, [0, null, 8], 1800000)).toBeNull();
    expect(interpolate(t, [0, 4, 8], -1)).toBeNull();
    expect(interpolate(t, [0, 4, 8], 7200001)).toBeNull();
  });

  it('prefers the provider current UV, falls back to interpolation, else unavailable', () => {
    const snap = parseForecast(makeForecastFixture({ startUnix: START }), FULL_VARS, 0);
    expect(uvNow(snap, snap.current!.time).source).toBe('current');
    expect(uvNow(snap, snap.current!.time + 5 * 3600000).source).toBe('interpolated');
    expect(uvNow(null, 0)).toEqual({ value: null, source: 'unavailable' });
    expect(uvNow(snap, START * 1000 + 30 * 86400000).source).toBe('unavailable');
  });
});
