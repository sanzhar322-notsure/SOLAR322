import { useSyncExternalStore } from 'react';
import {
  clock, createStore, isObj, numIn, oneOf, optNum, readJson, str, writeJson, ymd, type WriteResult,
} from '../lib/storage/persist';

export type Level = 1 | 2 | 3 | 4 | 5;
export type ScreenUse = 'none' | 'brief' | 'moderate' | 'heavy';

/** One morning's log, keyed by the date you woke up. All fields except date optional. */
export interface DailyEntry {
  id: string;
  date: string; // YYYY-MM-DD (wake date)
  bedtime: string | null; // HH:MM, evening before (or after midnight)
  sleepOnset: string | null; // HH:MM, estimated
  wakeTime: string | null; // HH:MM
  sleepQuality: number | null; // 1–5
  awakenings: number | null;
  morningOutdoorMin: number | null;
  daytimeOutdoorMin: number | null;
  eveningOutdoorMin: number | null;
  lateScreen: ScreenUse | null; // in the last hour before bed (previous evening)
  lastCaffeine: string | null; // HH:MM (previous day)
  energy: number | null; // 1–5
  sleepiness: number | null; // 1–5 daytime sleepiness
  exerciseTime: string | null; // HH:MM
  exerciseMin: number | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type Shade = 'none' | 'partial' | 'mostly';
export type Clothing = 'light' | 'partial' | 'full';
export type Sunscreen = 'none' | 'applied' | 'reapplied' | 'not-needed';

export interface OutdoorSession {
  id: string;
  status: 'planned' | 'done';
  start: number; // unix ms
  end: number; // unix ms
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  /** Snapshot of conditions at logging time (model data), if available. */
  weather: string | null;
  cloudCover: number | null;
  temperature: number | null;
  uvPeak: number | null;
  uvMean: number | null;
  ambientSed: number | null;
  uvCoverage: number;
  shade: Shade | null;
  clothing: Clothing | null;
  sunscreen: Sunscreen | null;
  energy: number | null;
  alertness: number | null;
  /** Subjective comfort during the session (1–5). */
  comfort: number | null;
  /** How the user felt afterwards compared with before (subjective). */
  afterFeel: AfterFeel | null;
  notes: string;
  createdAt: number;
}

export type AfterFeel = 'better' | 'same' | 'worse';

export type Pigmentation = 'very-fair' | 'fair' | 'medium' | 'olive' | 'brown' | 'dark';
export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening';

/**
 * Optional personal context for "Solar History & Personal Observations".
 * Stored for context only — the app never derives a UV tolerance or "safe"
 * threshold from pigmentation or past exposure.
 */
export interface SolarProfile {
  pigmentation: Pigmentation | null;
  typicalOutdoorMin: number | null;
  usualTimes: DayPart[];
  habits: string;
  notes: string;
  updatedAt: number;
}

export const EMPTY_PROFILE: SolarProfile = { pigmentation: null, typicalOutdoorMin: null, usualTimes: [], habits: '', notes: '', updatedAt: 0 };

export type OutcomeKey =
  | 'sleepDuration' | 'sleepQuality' | 'energy' | 'sleepiness' | 'sleepOnsetMin' | 'wakeMin';

export interface Experiment {
  id: string;
  title: string;
  behavior: string;
  outcome: OutcomeKey;
  startDate: string; // baseline start
  baselineDays: number;
  interventionDays: number;
  notes: string;
  status: 'active' | 'completed' | 'stopped';
  createdAt: number;
}

export interface Decision {
  ruleId: string;
  decision: 'accepted' | 'dismissed' | 'modified';
  at: number;
  detail: string;
}

export interface JournalData {
  entries: DailyEntry[];
  sessions: OutdoorSession[];
  experiments: Experiment[];
  decisions: Decision[];
  solarProfile: SolarProfile;
}

export const EMPTY_JOURNAL: JournalData = { entries: [], sessions: [], experiments: [], decisions: [], solarProfile: EMPTY_PROFILE };

const lvl = (v: unknown) => optNum(v, 1, 5);
const mins = (v: unknown) => optNum(v, 0, 1440);

export function sanitizeEntry(v: unknown): DailyEntry | null {
  if (!isObj(v)) return null;
  const date = ymd(v.date);
  if (!date) return null;
  return {
    id: str(v.id) || `e-${date}`,
    date,
    bedtime: clock(v.bedtime),
    sleepOnset: clock(v.sleepOnset),
    wakeTime: clock(v.wakeTime),
    sleepQuality: lvl(v.sleepQuality),
    awakenings: optNum(v.awakenings, 0, 30),
    morningOutdoorMin: mins(v.morningOutdoorMin),
    daytimeOutdoorMin: mins(v.daytimeOutdoorMin),
    eveningOutdoorMin: mins(v.eveningOutdoorMin),
    lateScreen: v.lateScreen == null ? null : oneOf(v.lateScreen, ['none', 'brief', 'moderate', 'heavy'] as const, 'none'),
    lastCaffeine: clock(v.lastCaffeine),
    energy: lvl(v.energy),
    sleepiness: lvl(v.sleepiness),
    exerciseTime: clock(v.exerciseTime),
    exerciseMin: optNum(v.exerciseMin, 0, 600),
    notes: str(v.notes),
    createdAt: numIn(v.createdAt, 0, 8.64e15, 0),
    updatedAt: numIn(v.updatedAt, 0, 8.64e15, 0),
  };
}

export function sanitizeSession(v: unknown): OutdoorSession | null {
  if (!isObj(v)) return null;
  const start = optNum(v.start, 0, 8.64e15);
  const end = optNum(v.end, 0, 8.64e15);
  if (start == null || end == null || end < start) return null;
  return {
    id: str(v.id) || `s-${start}`,
    status: oneOf(v.status, ['planned', 'done'] as const, 'done'),
    start,
    end,
    locationName: str(v.locationName),
    latitude: optNum(v.latitude, -90, 90),
    longitude: optNum(v.longitude, -180, 180),
    timezone: typeof v.timezone === 'string' ? v.timezone : null,
    weather: typeof v.weather === 'string' ? v.weather : null,
    cloudCover: optNum(v.cloudCover, 0, 100),
    temperature: optNum(v.temperature, -95, 65),
    uvPeak: optNum(v.uvPeak, 0, 30),
    uvMean: optNum(v.uvMean, 0, 30),
    ambientSed: optNum(v.ambientSed, 0, 500),
    uvCoverage: numIn(v.uvCoverage, 0, 1, 0),
    shade: v.shade == null ? null : oneOf(v.shade, ['none', 'partial', 'mostly'] as const, 'none'),
    clothing: v.clothing == null ? null : oneOf(v.clothing, ['light', 'partial', 'full'] as const, 'partial'),
    sunscreen: v.sunscreen == null ? null : oneOf(v.sunscreen, ['none', 'applied', 'reapplied', 'not-needed'] as const, 'none'),
    energy: lvl(v.energy),
    alertness: lvl(v.alertness),
    comfort: lvl(v.comfort),
    afterFeel: v.afterFeel == null ? null : oneOf(v.afterFeel, ['better', 'same', 'worse'] as const, 'same'),
    notes: str(v.notes),
    createdAt: numIn(v.createdAt, 0, 8.64e15, 0),
  };
}

export function sanitizeProfile(v: unknown): SolarProfile {
  if (!isObj(v)) return EMPTY_PROFILE;
  const parts = ['morning', 'midday', 'afternoon', 'evening'] as const;
  return {
    pigmentation: v.pigmentation == null ? null : oneOf(v.pigmentation, ['very-fair', 'fair', 'medium', 'olive', 'brown', 'dark'] as const, 'medium'),
    typicalOutdoorMin: optNum(v.typicalOutdoorMin, 0, 1440),
    usualTimes: Array.isArray(v.usualTimes) ? [...new Set(v.usualTimes.filter((x): x is DayPart => typeof x === 'string' && (parts as readonly string[]).includes(x)))] : [],
    habits: str(v.habits).slice(0, 2000),
    notes: str(v.notes).slice(0, 2000),
    updatedAt: numIn(v.updatedAt, 0, 8.64e15, 0),
  };
}

export function sanitizeExperiment(v: unknown): Experiment | null {
  if (!isObj(v)) return null;
  const startDate = ymd(v.startDate);
  if (!startDate || typeof v.title !== 'string') return null;
  return {
    id: str(v.id) || `x-${startDate}`,
    title: str(v.title).slice(0, 140),
    behavior: str(v.behavior),
    outcome: oneOf(v.outcome, ['sleepDuration', 'sleepQuality', 'energy', 'sleepiness', 'sleepOnsetMin', 'wakeMin'] as const, 'sleepQuality'),
    startDate,
    baselineDays: numIn(v.baselineDays, 3, 60, 7),
    interventionDays: numIn(v.interventionDays, 3, 60, 14),
    notes: str(v.notes),
    status: oneOf(v.status, ['active', 'completed', 'stopped'] as const, 'active'),
    createdAt: numIn(v.createdAt, 0, 8.64e15, 0),
  };
}

export function sanitizeJournal(v: unknown): JournalData {
  if (!isObj(v)) return EMPTY_JOURNAL;
  const list = <T,>(arr: unknown, f: (x: unknown) => T | null): T[] =>
    Array.isArray(arr) ? arr.map(f).filter((x): x is T => x != null) : [];
  const entries = list(v.entries, sanitizeEntry);
  // one entry per date (last wins)
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return {
    entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sessions: list(v.sessions, sanitizeSession).sort((a, b) => a.start - b.start),
    experiments: list(v.experiments, sanitizeExperiment),
    decisions: list(v.decisions, (d) =>
      isObj(d) && typeof d.ruleId === 'string'
        ? {
            ruleId: d.ruleId,
            decision: oneOf(d.decision, ['accepted', 'dismissed', 'modified'] as const, 'dismissed'),
            at: numIn(d.at, 0, 8.64e15, 0),
            detail: str(d.detail),
          }
        : null,
    ),
    solarProfile: sanitizeProfile(v.solarProfile),
  };
}

const KEY = 'journal.v1';
let lastWrite: WriteResult = { ok: true };
export const journalStore = createStore<JournalData>(readJson(KEY, sanitizeJournal, EMPTY_JOURNAL), (j) => {
  lastWrite = writeJson(KEY, j);
});

export function lastJournalWrite(): WriteResult {
  return lastWrite;
}

export function useJournal(): JournalData {
  return useSyncExternalStore(journalStore.subscribe, journalStore.get, journalStore.get);
}

export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}

export function upsertEntry(entry: DailyEntry) {
  journalStore.set((j) => {
    const others = j.entries.filter((e) => e.date !== entry.date);
    return { ...j, entries: [...others, { ...entry, updatedAt: Date.now() }].sort((a, b) => a.date.localeCompare(b.date)) };
  });
}

export function deleteEntry(date: string) {
  journalStore.set((j) => ({ ...j, entries: j.entries.filter((e) => e.date !== date) }));
}

export function upsertSession(s: OutdoorSession) {
  journalStore.set((j) => ({
    ...j,
    sessions: [...j.sessions.filter((x) => x.id !== s.id), s].sort((a, b) => a.start - b.start),
  }));
}

export function deleteSession(id: string) {
  journalStore.set((j) => ({ ...j, sessions: j.sessions.filter((x) => x.id !== id) }));
}

export function upsertExperiment(x: Experiment) {
  journalStore.set((j) => ({ ...j, experiments: [...j.experiments.filter((e) => e.id !== x.id), x] }));
}

export function deleteExperiment(id: string) {
  journalStore.set((j) => ({ ...j, experiments: j.experiments.filter((e) => e.id !== id) }));
}

export function recordDecision(d: Decision) {
  journalStore.set((j) => ({ ...j, decisions: [...j.decisions, d].slice(-200) }));
}

export function updateProfile(p: SolarProfile) {
  journalStore.set((j) => ({ ...j, solarProfile: { ...p, updatedAt: Date.now() } }));
}

export function replaceJournal(data: JournalData) {
  journalStore.set(sanitizeJournal(data));
}

export function emptyEntry(date: string): DailyEntry {
  const now = Date.now();
  return {
    id: newId('e'), date, bedtime: null, sleepOnset: null, wakeTime: null, sleepQuality: null, awakenings: null,
    morningOutdoorMin: null, daytimeOutdoorMin: null, eveningOutdoorMin: null, lateScreen: null, lastCaffeine: null,
    energy: null, sleepiness: null, exerciseTime: null, exerciseMin: null, notes: '', createdAt: now, updatedAt: now,
  };
}
