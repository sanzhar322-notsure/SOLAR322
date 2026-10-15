import { useSyncExternalStore } from 'react';
import {
  bool, clock, createStore, isObj, numIn, oneOf, optNum, optStr, readJson, str, writeJson,
} from '../lib/storage/persist';

export type LocationSource = 'manual' | 'gps' | 'search';
export type AltitudeSource = 'manual' | 'gps' | 'dem' | 'geocoder' | 'provider-grid';

export interface PlaceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: LocationSource;
  /** Horizontal accuracy (m) reported by the device for GPS fixes. */
  accuracyM: number | null;
  altitudeM: number | null;
  altitudeSource: AltitudeSource | null;
  altitudeAccuracyM: number | null;
  timezone: string | null;
  updatedAt: number;
}

export type ThemeMode = 'sky' | 'dark' | 'light';
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Settings {
  location: PlaceLocation | null;
  savedLocations: PlaceLocation[];
  temperatureUnit: 'C' | 'F';
  windUnit: 'kmh' | 'mph' | 'ms';
  hour12: boolean;
  theme: ThemeMode;
  motion: MotionPref;
  sleep: {
    targetWake: string; // HH:MM
    targetBedtime: string; // HH:MM
    sleepNeedHours: number;
    windDownMinutes: number;
  };
  reminders: {
    inApp: boolean;
    windDown: boolean;
    morningLight: boolean;
  };
  data: {
    autoRefreshMinutes: number;
    sendAltitudeToProvider: boolean;
  };
  horizonHeightM: number;
  evidence: {
    showPeat: boolean;
    showKruse: boolean;
    minimumLevel: 'any' | 'preliminary' | 'supported';
  };
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  location: null,
  savedLocations: [],
  temperatureUnit: 'C',
  windUnit: 'kmh',
  hour12: false,
  theme: 'sky',
  motion: 'system',
  sleep: { targetWake: '07:00', targetBedtime: '23:00', sleepNeedHours: 8, windDownMinutes: 60 },
  reminders: { inApp: true, windDown: true, morningLight: true },
  data: { autoRefreshMinutes: 15, sendAltitudeToProvider: false },
  horizonHeightM: 0,
  evidence: { showPeat: true, showKruse: true, minimumLevel: 'any' },
  onboarded: false,
};

export function sanitizeLocation(v: unknown): PlaceLocation | null {
  if (!isObj(v)) return null;
  const latitude = optNum(v.latitude, -90, 90);
  const longitude = optNum(v.longitude, -180, 180);
  if (latitude == null || longitude == null) return null;
  return {
    id: str(v.id) || `loc-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
    name: str(v.name).slice(0, 120) || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    latitude,
    longitude,
    source: oneOf(v.source, ['manual', 'gps', 'search'] as const, 'manual'),
    accuracyM: optNum(v.accuracyM, 0, 1e6),
    altitudeM: optNum(v.altitudeM, -450, 9000),
    altitudeSource: v.altitudeSource == null ? null : oneOf(v.altitudeSource, ['manual', 'gps', 'dem', 'geocoder', 'provider-grid'] as const, 'manual'),
    altitudeAccuracyM: optNum(v.altitudeAccuracyM, 0, 1e5),
    timezone: optStr(v.timezone),
    updatedAt: numIn(v.updatedAt, 0, 8.64e15, 0),
  };
}

export function sanitizeSettings(v: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(v)) return d;
  const sleep = isObj(v.sleep) ? v.sleep : {};
  const rem = isObj(v.reminders) ? v.reminders : {};
  const data = isObj(v.data) ? v.data : {};
  const ev = isObj(v.evidence) ? v.evidence : {};
  return {
    location: sanitizeLocation(v.location),
    savedLocations: Array.isArray(v.savedLocations)
      ? v.savedLocations.map(sanitizeLocation).filter((x): x is PlaceLocation => !!x).slice(0, 30)
      : [],
    temperatureUnit: oneOf(v.temperatureUnit, ['C', 'F'] as const, d.temperatureUnit),
    windUnit: oneOf(v.windUnit, ['kmh', 'mph', 'ms'] as const, d.windUnit),
    hour12: bool(v.hour12, d.hour12),
    theme: oneOf(v.theme, ['sky', 'dark', 'light'] as const, d.theme),
    motion: oneOf(v.motion, ['system', 'reduce', 'full'] as const, d.motion),
    sleep: {
      targetWake: clock(sleep.targetWake) ?? d.sleep.targetWake,
      targetBedtime: clock(sleep.targetBedtime) ?? d.sleep.targetBedtime,
      sleepNeedHours: numIn(sleep.sleepNeedHours, 5, 11, d.sleep.sleepNeedHours),
      windDownMinutes: numIn(sleep.windDownMinutes, 15, 180, d.sleep.windDownMinutes),
    },
    reminders: {
      inApp: bool(rem.inApp, d.reminders.inApp),
      windDown: bool(rem.windDown, d.reminders.windDown),
      morningLight: bool(rem.morningLight, d.reminders.morningLight),
    },
    data: {
      autoRefreshMinutes: numIn(data.autoRefreshMinutes, 0, 120, d.data.autoRefreshMinutes),
      sendAltitudeToProvider: bool(data.sendAltitudeToProvider, d.data.sendAltitudeToProvider),
    },
    horizonHeightM: numIn(v.horizonHeightM, 0, 3000, 0),
    evidence: {
      showPeat: bool(ev.showPeat, true),
      showKruse: bool(ev.showKruse, true),
      minimumLevel: oneOf(ev.minimumLevel, ['any', 'preliminary', 'supported'] as const, 'any'),
    },
    onboarded: bool(v.onboarded, false),
  };
}

const KEY = 'settings.v1';
export const settingsStore = createStore<Settings>(
  readJson(KEY, sanitizeSettings, DEFAULT_SETTINGS),
  (s) => writeJson(KEY, s),
);

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)) {
  settingsStore.set((s) => (typeof patch === 'function' ? patch(s) : { ...s, ...patch }));
}

export function reloadSettingsFromStorage() {
  settingsStore.set(readJson(KEY, sanitizeSettings, DEFAULT_SETTINGS));
}
