/**
 * TEST FIXTURES ONLY — synthetic responses shaped like Open-Meteo's JSON so
 * parsing, planning and UI states can be tested offline. Never imported by
 * application code.
 */
import { sunPosition } from '../lib/astro/solar';

export interface FixtureOptions {
  latitude?: number;
  longitude?: number;
  /** Unix seconds of the first hourly step (should be a local midnight). */
  startUnix: number;
  hours?: number;
  uvScale?: number;
  timezone?: string;
  utcOffsetSeconds?: number;
  omit?: string[];
}

export function makeForecastFixture(o: FixtureOptions) {
  const lat = o.latitude ?? 43.2389, lon = o.longitude ?? 76.8897;
  const hours = o.hours ?? 96;
  const scale = o.uvScale ?? 7;
  const time: number[] = [];
  const uv: number[] = [], uvcs: number[] = [], temp: number[] = [], app: number[] = [], cloud: number[] = [], sw: number[] = [];
  for (let i = 0; i < hours; i++) {
    const t = o.startUnix + i * 3600;
    time.push(t);
    const e = sunPosition(t * 1000, lat, lon).elevation;
    const s = Math.max(0, Math.sin((e * Math.PI) / 180));
    uvcs.push(+(scale * s ** 1.6).toFixed(2));
    uv.push(+(scale * 0.85 * s ** 1.6).toFixed(2));
    temp.push(+(12 + 8 * s).toFixed(1));
    app.push(+(11 + 8 * s).toFixed(1));
    cloud.push(30);
    sw.push(Math.round(900 * s));
  }
  const daily = Array.from({ length: Math.ceil(hours / 24) }, (_, d) => o.startUnix + d * 86400);
  const body: Record<string, unknown> = {
    latitude: lat,
    longitude: lon,
    elevation: 850,
    timezone: o.timezone ?? 'Asia/Almaty',
    utc_offset_seconds: o.utcOffsetSeconds ?? 18000,
    current: {
      time: o.startUnix + 12 * 3600,
      interval: 900,
      temperature_2m: 18.4,
      relative_humidity_2m: 41,
      apparent_temperature: 17.1,
      is_day: 1,
      precipitation: 0,
      weather_code: 2,
      cloud_cover: 30,
      wind_speed_10m: 7.2,
      wind_gusts_10m: 15.1,
      uv_index: 4.2,
    },
    hourly: {
      time,
      temperature_2m: temp,
      apparent_temperature: app,
      relative_humidity_2m: time.map(() => 45),
      precipitation_probability: time.map(() => 10),
      precipitation: time.map(() => 0),
      weather_code: time.map(() => 2),
      cloud_cover: cloud,
      wind_speed_10m: time.map(() => 8),
      uv_index: uv,
      uv_index_clear_sky: uvcs,
      shortwave_radiation: sw,
      direct_radiation: sw.map((v) => Math.round(v * 0.7)),
      diffuse_radiation: sw.map((v) => Math.round(v * 0.3)),
      direct_normal_irradiance: sw.map((v) => Math.round(v * 0.9)),
    },
    daily: {
      time: daily,
      weather_code: daily.map(() => 2),
      temperature_2m_max: daily.map(() => 20),
      temperature_2m_min: daily.map(() => 9),
      sunrise: daily.map((d) => d + 7 * 3600),
      sunset: daily.map((d) => d + 18 * 3600),
      uv_index_max: daily.map(() => scale * 0.85),
      uv_index_clear_sky_max: daily.map(() => scale),
      precipitation_sum: daily.map(() => 0),
      precipitation_probability_max: daily.map(() => 10),
    },
  };
  for (const path of o.omit ?? []) {
    const [section, key] = path.split('.');
    if (key) delete (body[section] as Record<string, unknown>)[key];
    else delete body[section];
  }
  return body;
}
