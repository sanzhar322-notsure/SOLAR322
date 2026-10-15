import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { EMPTY_JOURNAL, sanitizeJournal } from './journal';
import { buildIcs, csvEscape, entriesCsv, makeBackup, parseBackup } from '../lib/exporters';
import { emptyEntry } from './journal';
import { readJson, removeAll, writeJson } from '../lib/storage/persist';

describe('settings and journal sanitising', () => {
  it('falls back to defaults for corrupted or hostile data', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ temperatureUnit: 'K', hour12: 'yes', sleep: { targetWake: '25:99', sleepNeedHours: 40 }, location: { latitude: 200, longitude: 0 } });
    expect(s.temperatureUnit).toBe('C');
    expect(s.hour12).toBe(false);
    expect(s.sleep.targetWake).toBe('07:00');
    expect(s.sleep.sleepNeedHours).toBe(8);
    expect(s.location).toBeNull();
  });

  it('keeps valid journal entries, drops invalid ones and dedupes by date', () => {
    const j = sanitizeJournal({
      entries: [
        { date: '2026-10-01', wakeTime: '07:00', sleepQuality: 9 },
        { date: 'nope' },
        { date: '2026-10-01', wakeTime: '07:30' },
      ],
      sessions: [{ start: 10, end: 5 }, { start: 0, end: 60000, shade: 'mostly' }],
    });
    expect(j.entries).toHaveLength(1);
    expect(j.entries[0].wakeTime).toBe('07:30');
    expect(j.entries[0].sleepQuality).toBeNull();
    expect(j.sessions).toHaveLength(1);
    expect(sanitizeJournal('garbage')).toEqual(EMPTY_JOURNAL);
  });
});

describe('local storage persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips JSON under the tengri. prefix and removes only its own keys', () => {
    localStorage.setItem('other-app', 'keep');
    expect(writeJson('x', { a: 1 }).ok).toBe(true);
    expect(localStorage.getItem('tengri.x')).toBe('{"a":1}');
    expect(readJson('x', (v) => v as { a: number }, { a: 0 })).toEqual({ a: 1 });
    removeAll();
    expect(localStorage.getItem('tengri.x')).toBeNull();
    expect(localStorage.getItem('other-app')).toBe('keep');
  });

  it('returns the fallback for unparseable stored data', () => {
    localStorage.setItem('tengri.bad', '{oops');
    expect(readJson('bad', (v) => v, 'fallback')).toBe('fallback');
  });

  it('persists journal writes made through the store and reloads them', async () => {
    vi.resetModules();
    const j1 = await import('./journal');
    j1.upsertEntry({ ...j1.emptyEntry('2026-10-15'), wakeTime: '06:45', energy: 4 });
    expect(JSON.parse(localStorage.getItem('tengri.journal.v1')!).entries[0].wakeTime).toBe('06:45');
    vi.resetModules();
    const j2 = await import('./journal');
    expect(j2.journalStore.get().entries[0]).toMatchObject({ date: '2026-10-15', wakeTime: '06:45', energy: 4 });
  });

  it('persists settings changes', async () => {
    vi.resetModules();
    const s1 = await import('./settings');
    s1.updateSettings({ hour12: true, temperatureUnit: 'F' });
    vi.resetModules();
    const s2 = await import('./settings');
    expect(s2.settingsStore.get().hour12).toBe(true);
    expect(s2.settingsStore.get().temperatureUnit).toBe('F');
  });
});

describe('export formats', () => {
  it('escapes CSV and neutralises spreadsheet formulas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape(null)).toBe('');
    const csv = entriesCsv([{ ...emptyEntry('2026-10-15'), sleepOnset: '23:00', wakeTime: '07:00', notes: 'line1\nline2' }]);
    expect(csv.split('\r\n')[0]).toMatch(/^date,bedtime/);
    expect(csv).toContain('8.00');
  });

  it('round-trips a JSON backup and rejects foreign files', () => {
    const b = makeBackup(DEFAULT_SETTINGS, { ...EMPTY_JOURNAL, entries: [{ ...emptyEntry('2026-10-15'), energy: 3 }] });
    const back = parseBackup(JSON.stringify(b));
    expect(back.journal.entries[0].energy).toBe(3);
    expect(() => parseBackup('{"app":"other"}')).toThrow();
  });

  it('builds a daily-recurring calendar file with alarms in the location time zone', () => {
    const ics = buildIcs([{ uid: 'w', title: 'Wind-down, dim lights', description: 'x', time: '22:00', durationMin: 60, timezone: 'Asia/Almaty' }], '2026-10-15', new Date(0));
    expect(ics).toContain('DTSTART;TZID=Asia/Almaty:20261015T220000');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('SUMMARY:Wind-down\\, dim lights');
  });
});

describe('app shell (integration)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('shows the onboarding location flow when no location is set, with no fabricated data', async () => {
    vi.resetModules();
    const { default: App } = await import('../App');
    render(<App />);
    expect(await screen.findByText('Where is your sky?')).toBeTruthy();
    expect(screen.getAllByText(/Choose a location/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/UV index/i)).toBeNull();
  });

  it('with a saved location but failing network, shows calculated sun data and marks weather unavailable', async () => {
    localStorage.setItem('tengri.settings.v1', JSON.stringify({
      ...DEFAULT_SETTINGS,
      location: { id: 'a', name: 'Almaty', latitude: 43.2389, longitude: 76.8897, source: 'manual', timezone: 'Asia/Almaty', updatedAt: 1 },
    }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    vi.resetModules();
    const { default: App } = await import('../App');
    render(<App />);
    expect(await screen.findByText(/of daylight|Midnight sun|Polar night/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeTruthy());
    expect(screen.getByText(/Weather is unavailable/)).toBeTruthy();
    expect(screen.getByText(/No UV value is available right now/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
