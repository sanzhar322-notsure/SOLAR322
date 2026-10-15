import { useEffect, useMemo, useState } from 'react';
import { computeSolarDay, sunPosition, skyPhase, type SolarDay, type SkyPhase } from '../lib/astro/solar';
import { addDaysYMD, deviceTimeZone, formatYMD, isValidTimeZone, localYMD, type YMD } from '../lib/time/tz';
import type { EnvSnapshot } from '../lib/data/types';
import type { PlaceLocation } from './settings';

/** A clock that ticks every `ms` (default 20 s) and when the page becomes visible. */
export function useNow(ms = 20000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, ms);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms]);
  return now;
}

export interface ZoneInfo {
  tz: string;
  source: 'location' | 'provider' | 'device';
}

export function resolveZone(loc: PlaceLocation | null, snap: EnvSnapshot | null): ZoneInfo {
  if (loc && isValidTimeZone(loc.timezone)) return { tz: loc.timezone, source: 'location' };
  if (loc && snap && isValidTimeZone(snap.timezone) &&
      Math.abs(snap.latitude - loc.latitude) < 0.2 && Math.abs(snap.longitude - loc.longitude) < 0.2) {
    return { tz: snap.timezone, source: 'provider' };
  }
  return { tz: deviceTimeZone(), source: 'device' };
}

const dayCache = new Map<string, SolarDay>();

export function solarDay(date: YMD, lat: number, lon: number, tz: string, horizonHeightM = 0): SolarDay {
  const key = `${formatYMD(date)}|${lat.toFixed(4)}|${lon.toFixed(4)}|${tz}|${horizonHeightM}`;
  let d = dayCache.get(key);
  if (!d) {
    d = computeSolarDay(date, lat, lon, tz, { horizonHeightM });
    if (dayCache.size > 400) dayCache.clear();
    dayCache.set(key, d);
  }
  return d;
}

export interface SolarContext {
  tz: string;
  zone: ZoneInfo;
  todayYMD: YMD;
  today: SolarDay;
  tomorrow: SolarDay;
  yesterday: SolarDay;
  position: ReturnType<typeof sunPosition>;
  phase: SkyPhase;
  /** True if the Sun is rising (before solar noon). */
  morning: boolean;
}

export function useSolarContext(loc: PlaceLocation | null, snap: EnvSnapshot | null, now: number, horizonHeightM: number): SolarContext | null {
  const zone = resolveZone(loc, snap);
  const ymd = localYMD(now, zone.tz);
  const dateKey = formatYMD(ymd);
  const days = useMemo(() => {
    if (!loc) return null;
    return {
      today: solarDay(ymd, loc.latitude, loc.longitude, zone.tz, horizonHeightM),
      tomorrow: solarDay(addDaysYMD(ymd, 1), loc.latitude, loc.longitude, zone.tz, horizonHeightM),
      yesterday: solarDay(addDaysYMD(ymd, -1), loc.latitude, loc.longitude, zone.tz, horizonHeightM),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.latitude, loc?.longitude, zone.tz, dateKey, horizonHeightM]);
  if (!loc || !days) return null;
  const position = sunPosition(now, loc.latitude, loc.longitude);
  return {
    tz: zone.tz,
    zone,
    todayYMD: ymd,
    ...days,
    position,
    phase: skyPhase(position.elevation),
    morning: position.hourAngle < 0,
  };
}

export function skyAttr(phase: SkyPhase, morning: boolean): string {
  if (phase === 'golden' || phase === 'civil') return `${phase}-${morning ? 'dawn' : 'dusk'}`;
  return phase;
}
