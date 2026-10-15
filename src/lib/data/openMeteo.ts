/**
 * Open-Meteo provider (https://open-meteo.com).
 *
 * - No API key; free for non-commercial use (fair-use limit ~10 000 calls/day).
 * - Data licensed CC BY 4.0 — attribution is displayed in the UI.
 * - Values are numerical-weather-model output for a grid cell, NOT ground
 *   station measurements; the UI labels them "Model estimate" / "Forecast".
 * - Radiation variables are the mean of the preceding hour.
 *
 * The request asks for a rich variable set; if Open-Meteo rejects it (HTTP 400
 * for an unknown variable), a reduced core set is requested and the missing
 * fields are reported, never filled in.
 */
import {
  ProviderError, type CurrentConditions, type DailySeries, type EnvSnapshot, type GeocodeResult,
  type HourlySeries, type ProviderInfo, type WeatherProvider,
} from './types';
import { RANGES, num, numArray, timeArray } from './validate';

export const OPEN_METEO_INFO: ProviderInfo = {
  id: 'open-meteo',
  name: 'Open-Meteo',
  url: 'https://open-meteo.com',
  license: 'CC BY 4.0',
  attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  nature:
    'Numerical weather-model output (best-match blend of national weather-service models) for the grid cell containing your coordinates. Not a ground measurement.',
};

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export const FULL_VARS = {
  current: [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation',
    'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_gusts_10m', 'uv_index',
  ],
  hourly: [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation_probability',
    'precipitation', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'uv_index', 'uv_index_clear_sky',
    'shortwave_radiation', 'direct_radiation', 'diffuse_radiation', 'direct_normal_irradiance',
  ],
  daily: [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'uv_index_max',
    'uv_index_clear_sky_max', 'precipitation_sum', 'precipitation_probability_max',
  ],
};

export const CORE_VARS = {
  current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'weather_code', 'cloud_cover', 'wind_speed_10m'],
  hourly: ['temperature_2m', 'cloud_cover', 'uv_index'],
  daily: ['sunrise', 'sunset', 'uv_index_max'],
};

export function buildForecastUrl(
  lat: number, lon: number, vars: typeof FULL_VARS, elevation?: number | null,
): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: vars.current.join(','),
    hourly: vars.hourly.join(','),
    daily: vars.daily.join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    past_days: '1',
    forecast_days: '3',
  });
  if (elevation != null && Number.isFinite(elevation)) p.set('elevation', String(Math.round(elevation)));
  return `${FORECAST_URL}?${p.toString()}`;
}

async function getJson(url: string, signal?: AbortSignal, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (signal?.aborted) throw new ProviderError('aborted', 'Request cancelled');
    if (ctrl.signal.aborted) throw new ProviderError('timeout', 'The data provider did not respond in time');
    throw new ProviderError('network', 'Network unavailable or provider unreachable');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (res.status === 429) throw new ProviderError('rate-limit', 'Provider rate limit reached — try again later', 429);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError('invalid', 'Provider returned an unreadable response', res.status);
  }
  if (!res.ok) {
    const reason = (body as { reason?: unknown })?.reason;
    throw new ProviderError('http', typeof reason === 'string' ? reason : `HTTP ${res.status}`, res.status);
  }
  return body;
}

type Raw = Record<string, unknown>;

function asObj(v: unknown): Raw | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null;
}

export function parseForecast(body: unknown, requested: typeof FULL_VARS, fetchedAt: number): EnvSnapshot {
  const root = asObj(body);
  if (!root) throw new ProviderError('invalid', 'Unexpected response shape');
  const latitude = num(root.latitude, RANGES.latitude);
  const longitude = num(root.longitude, RANGES.longitude);
  if (latitude == null || longitude == null) throw new ProviderError('invalid', 'Response lacks coordinates');

  const missing: string[] = [];
  const track = (section: string, obj: Raw | null, keys: string[]) => {
    for (const k of keys) if (!obj || !(k in obj)) missing.push(`${section}.${k}`);
  };

  const c = asObj(root.current);
  track('current', c, requested.current);
  let current: CurrentConditions | null = null;
  const cTime = c ? num(c.time, RANGES.unixSeconds) : null;
  if (c && cTime != null) {
    const isDay = num(c.is_day, [0, 1]);
    current = {
      time: cTime * 1000,
      temperature: num(c.temperature_2m, RANGES.temperature),
      apparentTemperature: num(c.apparent_temperature, RANGES.temperature),
      humidity: num(c.relative_humidity_2m, RANGES.percent),
      cloudCover: num(c.cloud_cover, RANGES.percent),
      windSpeed: num(c.wind_speed_10m, RANGES.wind),
      windGusts: num(c.wind_gusts_10m, RANGES.wind),
      precipitation: num(c.precipitation, RANGES.precipitation),
      weatherCode: num(c.weather_code, RANGES.weatherCode),
      isDay: isDay == null ? null : isDay === 1,
      uvIndex: num(c.uv_index, RANGES.uv),
    };
  }

  const h = asObj(root.hourly);
  track('hourly', h, requested.hourly);
  let hourly: HourlySeries | null = null;
  const hTime = h ? timeArray(h.time) : null;
  if (h && hTime) {
    const n = hTime.length;
    hourly = {
      time: hTime,
      temperature: numArray(h.temperature_2m, n, RANGES.temperature),
      apparentTemperature: numArray(h.apparent_temperature, n, RANGES.temperature),
      humidity: numArray(h.relative_humidity_2m, n, RANGES.percent),
      precipitationProbability: numArray(h.precipitation_probability, n, RANGES.percent),
      precipitation: numArray(h.precipitation, n, RANGES.precipitation),
      weatherCode: numArray(h.weather_code, n, RANGES.weatherCode),
      cloudCover: numArray(h.cloud_cover, n, RANGES.percent),
      windSpeed: numArray(h.wind_speed_10m, n, RANGES.wind),
      uvIndex: numArray(h.uv_index, n, RANGES.uv),
      uvIndexClearSky: numArray(h.uv_index_clear_sky, n, RANGES.uv),
      shortwave: numArray(h.shortwave_radiation, n, RANGES.irradiance),
      direct: numArray(h.direct_radiation, n, RANGES.irradiance),
      diffuse: numArray(h.diffuse_radiation, n, RANGES.irradiance),
      directNormal: numArray(h.direct_normal_irradiance, n, RANGES.irradiance),
    };
  }

  const d = asObj(root.daily);
  track('daily', d, requested.daily);
  let daily: DailySeries | null = null;
  const dTime = d ? timeArray(d.time) : null;
  if (d && dTime) {
    const n = dTime.length;
    const secs = (v: unknown) => numArray(v, n, RANGES.unixSeconds).map((x) => (x == null ? null : x * 1000));
    daily = {
      time: dTime,
      weatherCode: numArray(d.weather_code, n, RANGES.weatherCode),
      temperatureMax: numArray(d.temperature_2m_max, n, RANGES.temperature),
      temperatureMin: numArray(d.temperature_2m_min, n, RANGES.temperature),
      uvIndexMax: numArray(d.uv_index_max, n, RANGES.uv),
      uvIndexClearSkyMax: numArray(d.uv_index_clear_sky_max, n, RANGES.uv),
      precipitationSum: numArray(d.precipitation_sum, n, RANGES.precipitation),
      precipitationProbabilityMax: numArray(d.precipitation_probability_max, n, RANGES.percent),
      sunrise: secs(d.sunrise),
      sunset: secs(d.sunset),
    };
  }

  const tz = typeof root.timezone === 'string' ? root.timezone : null;
  return {
    provider: OPEN_METEO_INFO,
    fetchedAt,
    latitude,
    longitude,
    timezone: tz,
    utcOffsetSeconds: num(root.utc_offset_seconds, [-50400, 50400]),
    gridElevation: num(root.elevation, RANGES.elevation),
    current,
    hourly,
    daily,
    missing,
    reduced: false,
  };
}

export const openMeteoProvider: WeatherProvider = {
  info: OPEN_METEO_INFO,
  async fetchSnapshot({ latitude, longitude, elevation, signal }) {
    try {
      const body = await getJson(buildForecastUrl(latitude, longitude, FULL_VARS, elevation), signal);
      return parseForecast(body, FULL_VARS, Date.now());
    } catch (e) {
      if (!(e instanceof ProviderError) || e.kind !== 'http' || e.status !== 400) throw e;
      const body = await getJson(buildForecastUrl(latitude, longitude, CORE_VARS, elevation), signal);
      const snap = parseForecast(body, CORE_VARS, Date.now());
      const got = new Set(
        [...CORE_VARS.current.map((k) => `current.${k}`), ...CORE_VARS.hourly.map((k) => `hourly.${k}`), ...CORE_VARS.daily.map((k) => `daily.${k}`)]
          .filter((k) => !snap.missing.includes(k)),
      );
      const all = [
        ...FULL_VARS.current.map((k) => `current.${k}`), ...FULL_VARS.hourly.map((k) => `hourly.${k}`), ...FULL_VARS.daily.map((k) => `daily.${k}`),
      ];
      return { ...snap, reduced: true, missing: all.filter((k) => !got.has(k)) };
    }
  },
};

/** Terrain elevation (Copernicus DEM, ~90 m) for coordinates. Sends coordinates to Open-Meteo. */
export async function fetchElevation(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const body = asObj(await getJson(`${ELEVATION_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, signal));
  const arr = body?.elevation;
  return Array.isArray(arr) ? num(arr[0], RANGES.elevation) : null;
}

/** Place-name search. Sends only the typed text to Open-Meteo. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const body = asObj(await getJson(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, signal));
  const results = Array.isArray(body?.results) ? body!.results : [];
  const out: GeocodeResult[] = [];
  for (const r of results as unknown[]) {
    const o = asObj(r);
    if (!o) continue;
    const latitude = num(o.latitude, RANGES.latitude);
    const longitude = num(o.longitude, RANGES.longitude);
    if (latitude == null || longitude == null || typeof o.name !== 'string') continue;
    out.push({
      name: o.name,
      region: typeof o.admin1 === 'string' ? o.admin1 : '',
      country: typeof o.country === 'string' ? o.country : '',
      latitude,
      longitude,
      elevation: num(o.elevation, RANGES.elevation),
      timezone: typeof o.timezone === 'string' ? o.timezone : null,
    });
  }
  return out;
}
