/** Night-by-night sleep bars on a 18:00 → 14:00 axis, with the planned window overlaid. */
import { useWidth } from './charts';
import { parseClock, sleepMetrics } from '../lib/sleep';
import type { DailyEntry } from '../state/journal';
import { formatMinutesOfDay } from '../lib/time/tz';

const AXIS0 = -360; // 18:00 previous evening
const AXIS1 = 840; // 14:00

export function SleepTimeline({ entries, dates, targetBed, targetWake, hour12 }: {
  entries: DailyEntry[]; dates: string[]; targetBed: string; targetWake: string; hour12: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rowH = 22;
  const pad = { l: 52, r: 10, t: 18, b: 4 };
  const iw = width - pad.l - pad.r;
  const height = pad.t + dates.length * rowH + pad.b;
  const x = (m: number) => pad.l + ((m - AXIS0) / (AXIS1 - AXIS0)) * iw;
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const tb = parseClock(targetBed) ?? 1380, tw = parseClock(targetWake) ?? 420;
  const tbAxis = tb >= 720 ? tb - 1440 : tb;
  const ticks = [-360, -180, 0, 180, 360, 540, 720];
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Sleep timing for each night compared with your planned bedtime and wake time">
        <rect x={x(tbAxis)} width={Math.max(0, x(tw) - x(tbAxis))} y={pad.t - 4} height={dates.length * rowH + 4} style={{ fill: 'var(--c-user)' }} opacity={0.1} />
        {ticks.map((m) => (
          <g key={m}>
            <line className="grid-line" x1={x(m)} x2={x(m)} y1={pad.t - 4} y2={height - pad.b} />
            <text x={x(m)} y={11} textAnchor="middle">{formatMinutesOfDay(m, hour12)}</text>
          </g>
        ))}
        {dates.map((d, i) => {
          const e = byDate.get(d);
          const m = e ? sleepMetrics(e) : null;
          const y = pad.t + i * rowH;
          const label = new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
          return (
            <g key={d}>
              <text x={pad.l - 6} y={y + rowH / 2 + 3} textAnchor="end">{label}</text>
              {m && m.onset != null && m.sleepMin != null ? (
                <>
                  {e!.bedtime && m.latencyMin != null && (
                    <rect x={x(m.onset - m.latencyMin)} width={Math.max(1, x(m.onset) - x(m.onset - m.latencyMin))} y={y + 6} height={rowH - 12} rx={3} style={{ fill: 'var(--text-3)' }} opacity={0.5} />
                  )}
                  <rect x={x(m.onset)} width={Math.max(2, x(m.onset + m.sleepMin) - x(m.onset))} y={y + 4} height={rowH - 8} rx={5} fill="#5aa4e6">
                    <title>{`${d}: asleep ${formatMinutesOfDay(m.onset, hour12)} – ${formatMinutesOfDay(m.onset + m.sleepMin, hour12)} (${(m.sleepMin / 60).toFixed(1)} h)`}</title>
                  </rect>
                </>
              ) : (
                <text x={pad.l + 6} y={y + rowH / 2 + 3} style={{ fill: 'var(--text-3)' }}>no entry</text>
              )}
            </g>
          );
        })}
        <line x1={x(tbAxis)} x2={x(tbAxis)} y1={pad.t - 4} y2={height - pad.b} style={{ stroke: 'var(--c-user)' }} strokeDasharray="3 3" />
        <line x1={x(tw)} x2={x(tw)} y1={pad.t - 4} y2={height - pad.b} style={{ stroke: 'var(--c-user)' }} strokeDasharray="3 3" />
      </svg>
    </div>
  );
}
