/**
 * Circular 24-hour solar clock. Local noon at the top, midnight at the bottom,
 * mornings on the left (east, for an observer facing the equator). The outer
 * ring is coloured by the CALCULATED sky phase; the inner ring shows the UV
 * FORECAST where available. Drag the handle (or use arrow keys) to scrub time.
 */
import { memo, useCallback, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { skyPhase, sunPosition, type SkyPhase, type SolarDay } from '../lib/astro/solar';
import { formatMinutesOfDay, localMinutes, zonedTimeToUtc } from '../lib/time/tz';
import type { HourlySeries } from '../lib/data/types';
import { interpolate } from '../lib/data/series';
import { uvBand } from '../lib/uv';

const PHASE_COLOR: Record<SkyPhase, string> = {
  night: '#0b1433',
  astronomical: '#17275a',
  nautical: '#283f80',
  civil: '#6c6fae',
  golden: '#e0a43a',
  day: '#5aa4e6',
};

const C = 160, R = 128, RW = 16, UVR = 104;
/** Padded view box so event labels outside the dial are never clipped. */
const VB = { x: -34, y: -18, w: 388, h: 356 };

function polar(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}
const angleOfMinutes = (m: number) => ((m / 1440) * 360 + 180) % 360;
function arc(a0: number, a1: number, r: number) {
  const p0 = polar(a0, r), p1 = polar(a1, r);
  const large = ((a1 - a0 + 360) % 360) > 180 ? 1 : 0;
  return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
}

export interface SolarClockProps {
  day: SolarDay;
  lat: number;
  lon: number;
  now: number;
  selected: number;
  onSelect: (t: number) => void;
  hourly: HourlySeries | null;
  hour12: boolean;
}

export const SolarClock = memo(function SolarClock({ day, lat, lon, now, selected, onSelect, hourly, hour12 }: SolarClockProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const tz = day.timeZone;

  const segments = useMemo(() => {
    const out: { a0: number; a1: number; color: string }[] = [];
    for (let m = 0; m < 1440; m += 6) {
      const t = zonedTimeToUtc(day.date.year, day.date.month, day.date.day, Math.floor(m / 60), m % 60, 0, tz);
      const ph = skyPhase(sunPosition(t + 3 * 60000, lat, lon).elevation);
      const a0 = angleOfMinutes(m), a1 = angleOfMinutes(m + 6.4);
      const last = out[out.length - 1];
      if (last && last.color === PHASE_COLOR[ph]) last.a1 = a1;
      else out.push({ a0, a1, color: PHASE_COLOR[ph] });
    }
    return out;
  }, [day.date.year, day.date.month, day.date.day, tz, lat, lon]);

  const uvSegs = useMemo(() => {
    if (!hourly) return [];
    const out: { a0: number; a1: number; color: string }[] = [];
    for (let m = 0; m < 1440; m += 10) {
      const t = zonedTimeToUtc(day.date.year, day.date.month, day.date.day, Math.floor(m / 60), m % 60, 0, tz);
      const uv = interpolate(hourly.time, hourly.uvIndex, t + 5 * 60000);
      if (uv == null || uv < 0.5) continue;
      out.push({ a0: angleOfMinutes(m), a1: angleOfMinutes(m + 10.5), color: uvBand(uv).color });
    }
    return out;
  }, [hourly, day.date.year, day.date.month, day.date.day, tz]);

  const minutesToInstant = useCallback(
    (m: number) => zonedTimeToUtc(day.date.year, day.date.month, day.date.day, Math.floor(m / 60), Math.floor(m % 60), 0, tz),
    [day.date.year, day.date.month, day.date.day, tz],
  );

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * VB.w + VB.x - C;
    const y = ((e.clientY - r.top) / r.height) * VB.h + VB.y - C;
    let ang = (Math.atan2(y, x) * 180) / Math.PI + 90;
    ang = (ang + 360) % 360;
    const m = (((ang - 180 + 360) % 360) / 360) * 1440;
    onSelect(minutesToInstant(Math.round(m / 5) * 5 % 1440));
  };

  const selMin = localMinutes(selected, tz);
  const nowMin = localMinutes(now, tz);
  const showNow = now >= day.dayStart && now < day.dayEnd;
  const selPos = polar(angleOfMinutes(selMin), R);
  const nowOuter = polar(angleOfMinutes(nowMin), R + RW / 2 + 4);
  const nowInner = polar(angleOfMinutes(nowMin), R - RW / 2 - 4);
  const sp = sunPosition(selected, lat, lon);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'PageUp' || e.key === 'PageDown' ? 60 : 5;
    let m = selMin;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') m += step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') m -= step;
    else if (e.key === 'Home') m = 0;
    else if (e.key === 'End') m = 1435;
    else return;
    e.preventDefault();
    onSelect(minutesToInstant(((Math.round(m) % 1440) + 1440) % 1440));
  };

  const events: { t: number | null; label: string; big?: boolean }[] = [
    { t: day.sunrise, label: 'Sunrise', big: true },
    { t: day.solarNoon, label: 'Noon', big: true },
    { t: day.sunset, label: 'Sunset', big: true },
    { t: day.civilDawn, label: 'Dawn' },
    { t: day.civilDusk, label: 'Dusk' },
  ];

  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <svg
      ref={svgRef}
      className="solar-clock"
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); pick(e); }}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      role="group"
      aria-label="Solar clock"
    >
      <defs>
        <radialGradient id="clock-face" cx="50%" cy="45%" r="55%">
          <stop offset="0%" style={{ stopColor: 'var(--surface-2)' }} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R + RW / 2 + 12} fill="url(#clock-face)" style={{ stroke: 'var(--border)' }} />
      {segments.map((s, i) => (
        <path key={i} d={arc(s.a0, s.a1, R)} stroke={s.color} strokeWidth={RW} fill="none" />
      ))}
      <circle cx={C} cy={C} r={R + RW / 2} fill="none" style={{ stroke: 'var(--border-strong)' }} strokeWidth="0.8" />
      <circle cx={C} cy={C} r={R - RW / 2} fill="none" style={{ stroke: 'var(--border-strong)' }} strokeWidth="0.8" />
      {uvSegs.map((s, i) => (
        <path key={i} d={arc(s.a0, s.a1, UVR)} stroke={s.color} strokeWidth={6} fill="none" strokeLinecap="butt" />
      ))}
      {hourly && <circle cx={C} cy={C} r={UVR} fill="none" style={{ stroke: 'var(--border)' }} strokeWidth="0.6" strokeDasharray="1 3" />}
      {Array.from({ length: 24 }, (_, h) => {
        const a = angleOfMinutes(h * 60);
        const p0 = polar(a, R + RW / 2 + 2), p1 = polar(a, R + RW / 2 + (h % 3 === 0 ? 8 : 5));
        return <line key={h} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} style={{ stroke: 'var(--text-3)' }} strokeWidth={h % 6 === 0 ? 1.4 : 0.8} />;
      })}
      {hourLabels.map((h) => {
        const p = polar(angleOfMinutes(h * 60), R - RW / 2 - 12);
        const label = hour12 ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}` : String(h).padStart(2, '0');
        return <text key={h} x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-3)' }}>{label}</text>;
      })}
      {events.map((ev) => {
        if (ev.t == null) return null;
        const m = localMinutes(ev.t, tz);
        const a = angleOfMinutes(m);
        const p = polar(a, R + RW / 2 + 20);
        const d = polar(a, R);
        return (
          <g key={ev.label}>
            <circle cx={d.x} cy={d.y} r={ev.big ? 3.4 : 2.4} fill="#fbf6ea" stroke="#0d2357" strokeWidth="1" />
            {ev.big && (
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9.5" fontWeight="600" style={{ fill: 'var(--text-2)' }}>
                {ev.label}
              </text>
            )}
          </g>
        );
      })}
      {showNow && (
        <line x1={nowInner.x} y1={nowInner.y} x2={nowOuter.x} y2={nowOuter.y} style={{ stroke: 'var(--accent)' }} strokeWidth="2.5" strokeLinecap="round">
          <title>Now</title>
        </line>
      )}
      <line x1={C} y1={C} x2={selPos.x} y2={selPos.y} style={{ stroke: 'var(--accent)' }} strokeOpacity="0.35" strokeWidth="1" />
      <g
        className="handle"
        tabIndex={0}
        role="slider"
        aria-label="Inspect time of day"
        aria-valuemin={0}
        aria-valuemax={1439}
        aria-valuenow={Math.round(selMin)}
        aria-valuetext={`${formatMinutesOfDay(selMin, hour12)}, Sun ${sp.elevation.toFixed(1)} degrees`}
        onKeyDown={onKey}
      >
        <circle cx={selPos.x} cy={selPos.y} r={14} fill="#f2c86e" stroke="#fffaf0" strokeWidth="2" />
        <circle cx={selPos.x} cy={selPos.y} r={5} fill="#fffaf0" />
      </g>
      <text x={C} y={C - 14} textAnchor="middle" fontSize="30" fontWeight="600" style={{ fill: 'var(--text)', fontFamily: 'var(--font-display)' }}>
        {formatMinutesOfDay(selMin, hour12)}
      </text>
      <text x={C} y={C + 8} textAnchor="middle" fontSize="11" style={{ fill: 'var(--text-2)' }}>
        Sun {sp.elevation >= 0 ? '+' : ''}{sp.elevation.toFixed(1)}° · az {sp.azimuth.toFixed(0)}°
      </text>
      <text x={C} y={C + 24} textAnchor="middle" fontSize="9.5" style={{ fill: 'var(--text-3)' }} letterSpacing="1.5">
        {skyLabel(skyPhase(sp.elevation)).toUpperCase()}
      </text>
    </svg>
  );
});

function skyLabel(p: SkyPhase): string {
  return { night: 'Night', astronomical: 'Astro twilight', nautical: 'Nautical twilight', civil: 'Civil twilight', golden: 'Low sun', day: 'Daylight' }[p];
}

export const CLOCK_LEGEND: { label: string; color: string }[] = [
  { label: 'Daylight (Sun ≥ 6°)', color: PHASE_COLOR.day },
  { label: 'Low Sun (−0.8° to 6°)', color: PHASE_COLOR.golden },
  { label: 'Civil twilight', color: PHASE_COLOR.civil },
  { label: 'Nautical', color: PHASE_COLOR.nautical },
  { label: 'Astronomical', color: PHASE_COLOR.astronomical },
  { label: 'Night', color: PHASE_COLOR.night },
];
