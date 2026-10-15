/**
 * Time-zone utilities built on Intl (IANA zones), so solar events are shown in
 * the *location's* civil time rather than the device's. Handles DST: a local
 * day may be 23 or 25 hours long.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(instantMs: number, tz: string): ZonedParts {
  const out: Partial<ZonedParts> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(instantMs))) {
    switch (p.type) {
      case 'year': out.year = Number(p.value); break;
      case 'month': out.month = Number(p.value); break;
      case 'day': out.day = Number(p.value); break;
      case 'hour': out.hour = Number(p.value) % 24; break;
      case 'minute': out.minute = Number(p.value); break;
      case 'second': out.second = Number(p.value); break;
      case 'weekday': out.weekday = WEEKDAYS[p.value] ?? 0; break;
    }
  }
  return out as ZonedParts;
}

/** Offset of the zone from UTC at an instant, in minutes (e.g. +300 for UTC+5). */
export function tzOffsetMinutes(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(instantMs / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

/**
 * Converts a wall-clock time in a zone to a UTC instant. For wall times that
 * do not exist (spring-forward gap) the result lands just after the gap; for
 * ambiguous times (fall-back) the earlier instant is returned.
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number, hour = 0, minute = 0, second = 0, tz: string,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  // Offsets well before and after any transition near this wall time.
  const offBefore = tzOffsetMinutes(wall - 86400000, tz);
  const offAfter = tzOffsetMinutes(wall + 86400000, tz);
  const matches = [wall - offBefore * 60000, wall - offAfter * 60000].filter((t) => {
    const p = zonedParts(t, tz);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
  });
  // Ambiguous (fall-back): earliest. Non-existent (spring-forward gap): shift
  // forward by the gap, i.e. interpret with the pre-transition offset.
  if (matches.length) return Math.min(...matches);
  return wall - offBefore * 60000;
}

export interface YMD { year: number; month: number; day: number }

export function parseYMD(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function formatYMD({ year, month, day }: YMD): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysYMD(ymd: YMD, days: number): YMD {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function localYMD(instantMs: number, tz: string): YMD {
  const p = zonedParts(instantMs, tz);
  return { year: p.year, month: p.month, day: p.day };
}

/** UTC instants bounding the local calendar day [start, end). */
export function localDayBounds(ymd: YMD, tz: string): { start: number; end: number } {
  const next = addDaysYMD(ymd, 1);
  return {
    start: zonedTimeToUtc(ymd.year, ymd.month, ymd.day, 0, 0, 0, tz),
    end: zonedTimeToUtc(next.year, next.month, next.day, 0, 0, 0, tz),
  };
}

export function dayOfYear(ymd: YMD): number {
  return Math.round((Date.UTC(ymd.year, ymd.month - 1, ymd.day) - Date.UTC(ymd.year, 0, 1)) / 86400000) + 1;
}

/** Minutes since local midnight (wall clock) for an instant. */
export function localMinutes(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz);
  return p.hour * 60 + p.minute + p.second / 60;
}

export function formatClock(instantMs: number | null | undefined, tz: string, hour12: boolean): string {
  if (instantMs == null || !Number.isFinite(instantMs)) return '—';
  return new Intl.DateTimeFormat(hour12 ? 'en-US' : 'en-GB', {
    timeZone: tz,
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(new Date(instantMs));
}

export function formatMinutesOfDay(min: number, hour12: boolean): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  if (!hour12) return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const totalMin = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formatDateLong(ymd: YMD): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)));
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '−';
  const a = Math.abs(minutes);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}
