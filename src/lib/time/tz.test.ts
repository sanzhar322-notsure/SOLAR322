import { describe, expect, it } from 'vitest';
import {
  addDaysYMD, formatClock, formatDuration, formatMinutesOfDay, formatUtcOffset, isValidTimeZone, localDayBounds,
  localYMD, parseYMD, tzOffsetMinutes, zonedParts, zonedTimeToUtc,
} from './tz';

describe('time-zone conversions', () => {
  it('reads offsets for fixed and DST zones', () => {
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 15), 'Asia/Almaty')).toBe(300);
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 15), 'America/New_York')).toBe(-300);
    expect(tzOffsetMinutes(Date.UTC(2026, 6, 15), 'America/New_York')).toBe(-240);
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 15), 'Asia/Kolkata')).toBe(330);
  });

  it('converts zoned wall time to UTC and back', () => {
    const t = zonedTimeToUtc(2026, 10, 15, 7, 30, 0, 'Asia/Almaty');
    expect(new Date(t).toISOString()).toBe('2026-10-15T02:30:00.000Z');
    const p = zonedParts(t, 'Asia/Almaty');
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 10, 15, 7, 30]);
  });

  it('handles the spring-forward gap and fall-back ambiguity', () => {
    // 02:30 does not exist in New York on 2026-03-08.
    const gap = zonedTimeToUtc(2026, 3, 8, 2, 30, 0, 'America/New_York');
    expect(zonedParts(gap, 'America/New_York').hour).toBe(3);
    // 01:30 occurs twice on 2026-11-01; we return the earlier (EDT) one.
    const amb = zonedTimeToUtc(2026, 11, 1, 1, 30, 0, 'America/New_York');
    expect(new Date(amb).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('computes local day bounds of 23, 24 and 25 hours', () => {
    const h = (b: { start: number; end: number }) => (b.end - b.start) / 3600000;
    expect(h(localDayBounds({ year: 2026, month: 3, day: 8 }, 'America/New_York'))).toBe(23);
    expect(h(localDayBounds({ year: 2026, month: 3, day: 9 }, 'America/New_York'))).toBe(24);
    expect(h(localDayBounds({ year: 2026, month: 11, day: 1 }, 'America/New_York'))).toBe(25);
  });

  it('derives the local date of an instant in the location zone, not the device zone', () => {
    const t = Date.UTC(2026, 9, 15, 20, 0); // 20:00 UTC = 01:00 next day in Almaty
    expect(localYMD(t, 'Asia/Almaty')).toEqual({ year: 2026, month: 10, day: 16 });
    expect(localYMD(t, 'America/New_York')).toEqual({ year: 2026, month: 10, day: 15 });
  });

  it('parses and validates dates and zones', () => {
    expect(parseYMD('2026-02-30')).toBeNull();
    expect(parseYMD('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(addDaysYMD({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(isValidTimeZone('Asia/Almaty')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('formats clocks, durations and offsets', () => {
    const t = Date.UTC(2026, 9, 15, 13, 5);
    expect(formatClock(t, 'UTC', false)).toBe('13:05');
    expect(formatClock(t, 'UTC', true)).toMatch(/1:05\s?PM/);
    expect(formatClock(null, 'UTC', false)).toBe('—');
    expect(formatMinutesOfDay(1439, false)).toBe('23:59');
    expect(formatMinutesOfDay(-30, true)).toBe('11:30 PM');
    expect(formatDuration(7.5 * 3600000)).toBe('7 h 30 min');
    expect(formatDuration(40 * 60000)).toBe('40 min');
    expect(formatUtcOffset(330)).toBe('UTC+5:30');
    expect(formatUtcOffset(-300)).toBe('UTC−5');
  });
});
