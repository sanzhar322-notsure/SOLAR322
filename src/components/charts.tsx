/** Lightweight SVG charts with touch/hover tooltips. No chart library needed. */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)) || fallback);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  times: number[];
  values: (number | null)[];
  type?: 'line' | 'area' | 'dashed';
  format?: (v: number) => string;
}

export interface Band { y0: number; y1: number; color: string; label?: string }
export interface Marker { t: number; label: string; color?: string }

export function TimeChart({
  series, start, end, yMin, yMax, height = 200, bands = [], markers = [], now, formatX, yTicks, ariaLabel, emptyText,
}: {
  series: Series[];
  start: number;
  end: number;
  yMin: number;
  yMax: number;
  height?: number;
  bands?: Band[];
  markers?: Marker[];
  now?: number;
  formatX: (t: number) => string;
  yTicks?: number[];
  ariaLabel: string;
  emptyText?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 10, t: 12, b: 24 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const x = (t: number) => pad.l + ((t - start) / (end - start)) * iw;
  const y = (v: number) => pad.t + (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * ih;
  const hasData = series.some((s) => s.values.some((v, i) => v != null && s.times[i] >= start && s.times[i] <= end));

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = '';
        let area = '';
        let open = false;
        let firstX = 0;
        let lastX = 0;
        s.times.forEach((t, i) => {
          const v = s.values[i];
          if (t < start - 3600000 || t > end + 3600000) return;
          if (v == null) {
            if (open && s.type === 'area') area += `L${lastX},${y(yMin)}Z`;
            open = false;
            return;
          }
          const px = x(t).toFixed(1), py = y(v).toFixed(1);
          if (!open) {
            d += `M${px},${py}`;
            if (s.type === 'area') area += `M${px},${y(yMin)}L${px},${py}`;
            firstX = Number(px);
          } else {
            d += `L${px},${py}`;
            if (s.type === 'area') area += `L${px},${py}`;
          }
          lastX = Number(px);
          open = true;
        });
        if (open && s.type === 'area') area += `L${lastX},${y(yMin)}Z`;
        void firstX;
        return { s, d, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, start, end, yMin, yMax, width, height],
  );

  const ticks = yTicks ?? [yMin, (yMin + yMax) / 2, yMax];
  const hours = useMemo(() => {
    // Aim for roughly one label per 64 px, on whole-hour boundaries.
    const out: number[] = [];
    const span = end - start;
    const maxLabels = Math.max(2, Math.floor(iw / 64));
    const steps = [1, 2, 3, 4, 6, 12, 24, 48, 24 * 7, 24 * 14, 24 * 30, 24 * 61].map((h) => h * 3600000);
    const step = steps.find((s) => span / s <= maxLabels) ?? steps[steps.length - 1];
    const first = Math.ceil(start / 3600000) * 3600000;
    for (let t = first; t <= end; t += 3600000) {
      if ((t - first) % step === 0) out.push(t);
    }
    return out;
  }, [start, end, iw]);

  const onMove = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = start + ((clientX - r.left - pad.l) / iw) * (end - start);
    setHover(Math.min(end, Math.max(start, t)));
  };

  const tipValues: { label: string; color: string; text: string }[] = [];
  if (hover != null) {
    for (const s of series) {
      let best = -1, bd = Infinity;
      s.times.forEach((t, i) => {
        const d = Math.abs(t - hover);
        if (d < bd && s.values[i] != null) { bd = d; best = i; }
      });
      if (best >= 0 && bd <= 45 * 60000) {
        const v = s.values[best]!;
        tipValues.push({ label: s.label, color: s.color, text: s.format ? s.format(v) : v.toFixed(1) });
      }
    }
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart"
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {bands.map((b, i) => (
          <rect key={i} x={pad.l} width={iw} y={y(b.y1)} height={Math.max(0, y(b.y0) - y(b.y1))} style={{ fill: b.color }} opacity={0.12} />
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid-line" x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
          </g>
        ))}
        {hours.filter((t) => x(t) <= width - pad.r - 14).map((t) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor="middle">{formatX(t)}</text>
        ))}
        {paths.map(({ s, d, area }) => (
          <g key={s.id}>
            {area && <path d={area} style={{ fill: s.color }} opacity={0.18} />}
            <path d={d} fill="none" style={{ stroke: s.color }} strokeWidth={s.type === 'dashed' ? 1.4 : 2} strokeDasharray={s.type === 'dashed' ? '4 4' : undefined} strokeLinejoin="round" />
          </g>
        ))}
        {markers.filter((m) => m.t >= start && m.t <= end).map((m) => (
          <g key={m.label + m.t}>
            <line x1={x(m.t)} x2={x(m.t)} y1={pad.t} y2={pad.t + ih} style={{ stroke: m.color ?? 'var(--text-3)' }} strokeDasharray="2 3" strokeWidth={1} />
            <text x={x(m.t) + 3} y={pad.t + 9} textAnchor="start" style={{ fill: m.color ?? 'var(--text-3)' }}>{m.label}</text>
          </g>
        ))}
        {now != null && now >= start && now <= end && (
          <line x1={x(now)} x2={x(now)} y1={pad.t} y2={pad.t + ih} style={{ stroke: 'var(--accent)' }} strokeWidth={2} />
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} style={{ stroke: 'var(--text-2)' }} strokeWidth={1} />}
        {!hasData && (
          <text x={pad.l + iw / 2} y={pad.t + ih / 2} textAnchor="middle" style={{ fontSize: 12 }}>
            {emptyText ?? 'No data available'}
          </text>
        )}
      </svg>
      {hover != null && tipValues.length > 0 && (
        <div className="chart-tip" style={{ left: Math.min(width - 70, Math.max(70, x(hover))) }}>
          <div className="faint">{formatX(hover)}</div>
          {tipValues.map((v) => (
            <div key={v.label}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: v.color, marginRight: 5 }} />{v.label}: <b>{v.text}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

export interface BarDatum { key: string; label: string; value: number | null; color?: string; tip?: string }

export function BarChart({ data, yMax, height = 180, band, ariaLabel, formatY, unit }: {
  data: BarDatum[]; yMax: number; height?: number; band?: { y0: number; y1: number; label: string }; ariaLabel: string;
  formatY?: (v: number) => string; unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const bw = data.length ? iw / data.length : iw;
  const y = (v: number) => pad.t + (1 - Math.min(v, yMax) / yMax) * ih;
  const ticks = [0, yMax / 2, yMax];
  const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 36)));
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
        {band && <rect x={pad.l} width={iw} y={y(band.y1)} height={y(band.y0) - y(band.y1)} style={{ fill: 'var(--c-user)' }} opacity={0.12} />}
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid-line" x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 5} y={y(v) + 3} textAnchor="end">{formatY ? formatY(v) : v}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.key} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
            {d.value != null && (
              <rect
                x={pad.l + i * bw + bw * 0.18}
                width={Math.max(2, bw * 0.64)}
                y={y(d.value)}
                height={Math.max(1, y(0) - y(d.value))}
                rx={Math.min(4, bw * 0.2)}
                style={{ fill: d.color ?? 'var(--accent)' }}
                opacity={hover === i ? 1 : 0.85}
              />
            )}
            {i % every === 0 && <text x={pad.l + i * bw + bw / 2} y={height - 6} textAnchor="middle">{d.label}</text>}
          </g>
        ))}
      </svg>
      {hover != null && data[hover] && (
        <div className="chart-tip" style={{ left: Math.min(width - 70, Math.max(70, pad.l + hover * bw + bw / 2)) }}>
          <div className="faint">{data[hover].tip ?? data[hover].label}</div>
          <b>{data[hover].value == null ? 'No entry' : `${formatY ? formatY(data[hover].value!) : data[hover].value}${unit ?? ''}`}</b>
        </div>
      )}
    </div>
  );
}

export function ScatterChart({ points, xLabel, yLabel, fx, fy, height = 260, children }: {
  points: { date: string; x: number; y: number }[]; xLabel: string; yLabel: string;
  fx: (v: number) => string; fy: (v: number) => string; height?: number; children?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 46, r: 12, t: 12, b: 36 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const ext = (v: number[]) => {
    if (!v.length) return [0, 1] as const;
    let lo = Math.min(...v), hi = Math.max(...v);
    if (lo === hi) { lo -= 1; hi += 1; }
    const p = (hi - lo) * 0.08;
    return [lo - p, hi + p] as const;
  };
  const [x0, x1] = ext(xs), [y0, y1] = ext(ys);
  const X = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * iw;
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * ih;
  // least-squares line (descriptive only)
  let line: { a: number; b: number } | null = null;
  if (points.length >= 3) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sxx = xs.reduce((a, v) => a + (v - mx) ** 2, 0);
    if (sxx > 0) {
      const b = xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0) / sxx;
      line = { a: my - b * mx, b };
    }
  }
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Scatter plot of ${yLabel} against ${xLabel}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid-line" x1={pad.l} x2={width - pad.r} y1={pad.t + f * ih} y2={pad.t + f * ih} />
            <text x={pad.l - 6} y={pad.t + f * ih + 3} textAnchor="end">{fy(y1 - f * (y1 - y0))}</text>
            <text x={pad.l + f * iw} y={height - 18} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>{fx(x0 + f * (x1 - x0))}</text>
          </g>
        ))}
        <text x={pad.l + iw / 2} y={height - 3} textAnchor="middle" style={{ fontWeight: 600 }}>{xLabel} →</text>
        {line && (
          <line x1={X(x0)} y1={Y(line.a + line.b * x0)} x2={X(x1)} y2={Y(line.a + line.b * x1)} style={{ stroke: 'var(--accent)' }} strokeDasharray="5 4" strokeWidth={1.4} />
        )}
        {points.map((p, i) => (
          <circle
            key={p.date + i}
            cx={X(p.x)}
            cy={Y(p.y)}
            r={hover === i ? 7 : 5}
            style={{ fill: 'var(--c-steppe)', stroke: 'var(--surface-solid)' }}
            strokeWidth={1.5}
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover != null && points[hover] && (
        <div className="chart-tip" style={{ left: Math.min(width - 80, Math.max(80, X(points[hover].x))) }}>
          <div className="faint">{points[hover].date}</div>
          <div>{xLabel}: <b>{fx(points[hover].x)}</b></div>
          <div>{yLabel}: <b>{fy(points[hover].y)}</b></div>
        </div>
      )}
      {children}
    </div>
  );
}
