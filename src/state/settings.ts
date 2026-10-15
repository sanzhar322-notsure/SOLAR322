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

/** What the user wants the app to emphasise. Used to organise information, never to hide safety-relevant context. */
export type PriorityKey = 'circadian' | 'morning' | 'activity' | 'spectrum' | 'sleep' | 'heat' | 'uv' | 'extended';

export const PRIORITIES: { key: PriorityKey; label: string; hint: string }[] = [
  { key: 'circadian', label: 'Circadian consistency', hint: 'Light timing relative to your wake and sleep schedule' },
  { key: 'morning', label: 'Morning daylight', hint: 'Sunrise, the morning window and a regular morning routine' },
  { key: 'activity', label: 'Outdoor activity', hint: 'Comfortable blocks of time outside, weather and wind' },
  { key: 'spectrum', label: 'Solar spectrum', hint: 'Air mass, band composition and what the data can show' },
  { key: 'sleep', label: 'Sleep', hint: 'Evening light, wind-down and protecting sleep duration' },
  { key: 'heat', label: 'Heat awareness', hint: 'Temperature and feels-like through each window' },
  { key: 'uv', label: 'UV awareness', hint: 'UV detail even when levels are modest' },
  { key: 'extended', label: 'Extended time outdoors', hint: 'Cumulative exposure over long sessions' },
];
const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);
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
  priorities: PriorityKey[];
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
  priorities: ['circadian', 'morning', 'sleep', 'spectrum'],
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
    priorities: Array.isArray(v.priorities)
      ? [...new Set(v.priorities.filter((p): p is PriorityKey => typeof p === 'string' && (PRIORITY_KEYS as string[]).includes(p)))]
      : d.priorities,
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
