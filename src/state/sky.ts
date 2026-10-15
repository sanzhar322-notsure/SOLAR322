import { useMemo } from 'react';
import { useApp } from './app';
import { solarDay } from './solar';
import type { SkyContext } from '../content/philosophy';
import { addDaysYMD, formatClock, localMinutes } from '../lib/time/tz';
import { interpolate, uvNow, HOURLY_MEAN_SHIFT } from '../lib/data/series';
import { uvPeak } from '../lib/planner';
import { uvShareSeries } from '../lib/spectrum';
import { parseClock, toClock } from '../lib/sleep';

/** Live context shared by Solar Philosophy and dashboard cards. */
export function useSkyContext(): SkyContext | null {
  const { loc, solar, snap, now, settings } = useApp();
  return useMemo(() => {
    if (!loc || !solar) return null;
    const tz = solar.tz;
    const h = snap?.hourly ?? null;
    const in30 = solarDay(addDaysYMD(solar.todayYMD, 30), loc.latitude, loc.longitude, tz, settings.horizonHeightM);
    const bed = parseClock(settings.sleep.targetBedtime) ?? 1380;
    const sunsetMin = solar.today.sunset != null ? localMinutes(solar.today.sunset, tz) : null;
    let share: number | null = null;
    if (h && solar.today.solarNoon != null) {
      const s = uvShareSeries(h.time, h.uvIndex, h.shortwave);
      const a = interpolate(s.times, s.share, now), b = interpolate(s.times, s.share, solar.today.solarNoon);
      share = a != null && b != null && b > 0 ? a / b : null;
    }
    const peak = uvPeak(h, solar.today.dayStart, solar.today.dayEnd);
    return {
      now,
      fmt: (t: number) => formatClock(t, tz, settings.hour12),
      elevation: solar.position.elevation,
      noonElevation: solar.today.noonElevation,
      sunrise: solar.today.sunrise,
      sunset: solar.today.sunset,
      civilDawn: solar.today.civilDawn,
      civilDusk: solar.today.civilDusk,
      daylightMs: solar.today.daylightMs,
      daylightChange30dMin: (in30.daylightMs - solar.today.daylightMs) / 60000,
      ghi: h ? interpolate(h.time, h.shortwave, now, HOURLY_MEAN_SHIFT) : null,
      cloud: snap?.current?.cloudCover ?? (h ? interpolate(h.time, h.cloudCover, now) : null),
      uv: uvNow(snap, now).value,
      uvPeak: peak,
      temperature: snap?.current?.temperature ?? (h ? interpolate(h.time, h.temperature, now) : null),
      apparentTemp: snap?.current?.apparentTemperature ?? (h ? interpolate(h.time, h.apparentTemperature, now) : null),
      targetWake: settings.sleep.targetWake,
      targetBedtime: settings.sleep.targetBedtime,
      windDownStart: toClock(bed - settings.sleep.windDownMinutes),
      eveningAfterSunsetMin: sunsetMin != null ? (bed - sunsetMin + 1440) % 1440 : null,
      uvShareNowVsNoon: share,
    };
  }, [loc, solar, snap, now, settings]);
}
