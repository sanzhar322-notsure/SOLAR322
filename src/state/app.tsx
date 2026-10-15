import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useSettings, type Settings, type PlaceLocation } from './settings';
import { useEnvironment, useEnvironmentSync, type EnvState } from './environment';
import { skyAttr, useNow, useSolarContext, type SolarContext } from './solar';
import { freshness, type Freshness } from '../lib/data/series';
import { useMediaQuery } from '../components/ui';

export interface AppCtx {
  settings: Settings;
  loc: PlaceLocation | null;
  env: EnvState;
  /** Snapshot only if it belongs to the active location. */
  snap: EnvState['snapshot'];
  fresh: { state: Freshness; ageMs: number } | null;
  solar: SolarContext | null;
  now: number;
  online: boolean;
  reducedMotion: boolean;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const env = useEnvironment();
  const now = useNow(20000);
  const loc = settings.location;
  useEnvironmentSync(loc, settings.data.autoRefreshMinutes, settings.data.sendAltitudeToProvider);
  const snap = env.snapshot && loc && env.key === `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}` ? env.snapshot : null;
  const solar = useSolarContext(loc, snap, now, settings.horizonHeightM);
  const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reducedMotion = settings.motion === 'reduce' || (settings.motion === 'system' && prefersReduced);
  const online = useOnline();

  // Theme: "sky" follows the real Sun — day palette when the Sun is ≥ 6° up.
  const theme = settings.theme === 'sky' ? (solar && solar.phase === 'day' ? 'light' : 'dark') : settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = settings.motion === 'system' ? '' : settings.motion;
    if (solar) root.dataset.sky = skyAttr(solar.phase, solar.morning);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'light' ? '#f4efe3' : '#060a18');
  }, [theme, settings.motion, solar?.phase, solar?.morning, solar]);

  const value: AppCtx = {
    settings,
    loc,
    env,
    snap,
    fresh: snap ? freshness(snap.fetchedAt, now) : null,
    solar,
    now,
    online,
    reducedMotion,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
