/** CSV / JSON export and import, plus calendar (.ics) reminders. All local. */
import type { DailyEntry, JournalData, OutdoorSession } from '../state/journal';
import { sanitizeJournal } from '../state/journal';
import type { Settings } from '../state/settings';
import { sanitizeSettings } from '../state/settings';
import { sleepMetrics } from './sleep';

export function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n') + '\r\n';
}

export function entriesCsv(entries: DailyEntry[]): string {
  const headers = [
    'date', 'bedtime', 'sleep_onset', 'wake_time', 'sleep_hours', 'sleep_quality_1_5', 'awakenings',
    'morning_outdoor_min', 'daytime_outdoor_min', 'evening_outdoor_min', 'late_screen', 'last_caffeine',
    'energy_1_5', 'sleepiness_1_5', 'exercise_time', 'exercise_min', 'notes',
  ];
  const rows = entries.map((e) => {
    const m = sleepMetrics(e);
    return [
      e.date, e.bedtime, e.sleepOnset, e.wakeTime, m.sleepMin != null ? (m.sleepMin / 60).toFixed(2) : '',
      e.sleepQuality, e.awakenings, e.morningOutdoorMin, e.daytimeOutdoorMin, e.eveningOutdoorMin, e.lateScreen,
      e.lastCaffeine, e.energy, e.sleepiness, e.exerciseTime, e.exerciseMin, e.notes,
    ];
  });
  return toCsv(headers, rows);
}

export function sessionsCsv(sessions: OutdoorSession[]): string {
  const headers = [
    'status', 'start_utc', 'end_utc', 'duration_min', 'location', 'latitude', 'longitude', 'weather', 'cloud_cover_pct',
    'temperature_c', 'uv_peak_model', 'uv_mean_model', 'ambient_erythemal_sed_horizontal', 'uv_data_coverage',
    'shade', 'clothing', 'sunscreen', 'energy_1_5', 'alertness_1_5', 'notes',
  ];
  const rows = sessions.map((s) => [
    s.status, new Date(s.start).toISOString(), new Date(s.end).toISOString(), Math.round((s.end - s.start) / 60000),
    s.locationName, s.latitude, s.longitude, s.weather, s.cloudCover, s.temperature,
    s.uvPeak?.toFixed(1), s.uvMean?.toFixed(1), s.ambientSed?.toFixed(2), s.uvCoverage.toFixed(2),
    s.shade, s.clothing, s.sunscreen, s.energy, s.alertness, s.notes,
  ]);
  return toCsv(headers, rows);
}

export interface Backup {
  app: 'tengri-solar';
  format: 1;
  exportedAt: string;
  settings: Settings;
  journal: JournalData;
}

export function makeBackup(settings: Settings, journal: JournalData): Backup {
  return { app: 'tengri-solar', format: 1, exportedAt: new Date().toISOString(), settings, journal };
}

export function parseBackup(text: string): { settings: Settings; journal: JournalData } {
  const raw = JSON.parse(text) as Partial<Backup>;
  if (!raw || raw.app !== 'tengri-solar') throw new Error('This file is not a TENGRI SOLAR backup.');
  return { settings: sanitizeSettings(raw.settings), journal: sanitizeJournal(raw.journal) };
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- calendar reminders ------------------------------------------------------

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export interface IcsReminder {
  uid: string;
  title: string;
  description: string;
  /** Local wall-clock time HH:MM. */
  time: string;
  durationMin: number;
  timezone: string;
}

/**
 * Builds a daily-recurring calendar file with an alert. iOS Calendar imports
 * this and fires real notifications — something a web app cannot schedule on
 * its own while closed.
 */
export function buildIcs(reminders: IcsReminder[], startDate: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tengri Solar//Reminders//EN', 'CALSCALE:GREGORIAN'];
  for (const r of reminders) {
    const [hh, mm] = r.time.split(':');
    const dt = `${startDate.replace(/-/g, '')}T${hh}${mm}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.uid}@tengri-solar`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART;TZID=${r.timezone}:${dt}`,
      `DURATION:PT${Math.max(5, Math.round(r.durationMin))}M`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${icsText(r.title)}`,
      `DESCRIPTION:${icsText(r.description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(r.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
