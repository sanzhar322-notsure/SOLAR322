/**
 * The celestial horizon: a sky that follows the REAL solar elevation, the
 * day's calculated Sun path, a steppe horizon and the solar disk at its
 * current position. Purely calculated — no weather is simulated here.
 */
import { memo, useMemo } from 'react';
import { sunPosition, type SkyPhase, type SolarDay } from '../lib/astro/solar';

const SKY: Record<string, [string, string, string]> = {
  night: ['#03060f', '#070d24', '#0d1a3f'],
  astronomical: ['#050a1c', '#0b1638', '#18295c'],
  nautical: ['#0a1538', '#1a2f68', '#3a558f'],
  'civil-dawn': ['#14265e', '#5b5f9a', '#e8a99d'],
  'civil-dusk': ['#141f52', '#6a4d86', '#d98e5a'],
  'golden-dawn': ['#2d5aa3', '#9fb6d6', '#f6c9a4'],
  'golden-dusk': ['#2a4b8c', '#c98f8c', '#eaa34a'],
  day: ['#174f9e', '#3d8bd8', '#a9d1f2'],
};

const HILLS: Record<string, [string, string, string]> = {
  night: ['#0b1534', '#070d22', '#04081a'],
  astronomical: ['#0d1a40', '#081129', '#050a1c'],
  nautical: ['#1b2d5c', '#0f1b3e', '#081128'],
  'civil-dawn': ['#3b4878', '#24305a', '#151d3a'],
  'civil-dusk': ['#3d3c6e', '#262650', '#161634'],
  'golden-dawn': ['#5c6f93', '#4f5c3f', '#36402a'],
  'golden-dusk': ['#6a5f7f', '#4d4a36', '#332f22'],
  day: ['#7c9fbe', '#6d7f4c', '#4d5c33'],
};

function seeded(n: number, seed = 7) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: r() * 400, y: r() * 170, r: 0.3 + r() * 1.1, d: r() * 5 }));
}
const STARS = seeded(90);

const W = 400, H = 260, HORIZON = 188;

export const SolarHero = memo(function SolarHero({
  day, now, lat, lon, phase, morning, showPath = true,
}: { day: SolarDay; now: number; lat: number; lon: number; phase: SkyPhase; morning: boolean; showPath?: boolean }) {
  const key = phase === 'civil' || phase === 'golden' ? `${phase}-${morning ? 'dawn' : 'dusk'}` : phase;
  const sky = SKY[key] ?? SKY.day;
  const hills = HILLS[key] ?? HILLS.day;
  const span = day.dayEnd - day.dayStart;
  const maxElev = Math.max(10, day.noonElevation ?? 10);
  const scale = (HORIZON - 30) / Math.max(maxElev, 30);
  const xOf = (t: number) => ((t - day.dayStart) / span) * W;
  const yOf = (e: number) => HORIZON - e * scale;

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = day.dayStart + (span * i) / 96;
      const e = sunPosition(t, lat, lon).elevation;
      pts.push(`${i ? 'L' : 'M'}${xOf(t).toFixed(1)},${Math.min(H + 20, yOf(e)).toFixed(1)}`);
    }
    return pts.join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.dayStart, day.dayEnd, lat, lon, scale]);

  const pos = sunPosition(now, lat, lon);
  const sx = xOf(now);
  const sy = yOf(pos.elevation);
  const above = pos.elevation > -1;
  const starOpacity = phase === 'night' ? 1 : phase === 'astronomical' ? 0.75 : phase === 'nautical' ? 0.35 : 0;
  const sunColor = pos.elevation < 6 ? '#f2a65a' : '#fff1c7';

  return (
    <svg className="sky" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky[0]} />
          <stop offset="55%" stopColor={sky[1]} />
          <stop offset="100%" stopColor={sky[2]} />
        </linearGradient>
        <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={sunColor} stopOpacity="0.85" />
          <stop offset="35%" stopColor="#f2c86e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f2c86e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hero-disk" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="55%" stopColor={sunColor} />
          <stop offset="100%" stopColor="#e0a43a" />
        </radialGradient>
        <linearGradient id="hero-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky[2]} stopOpacity="0" />
          <stop offset="100%" stopColor={sky[2]} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#hero-sky)" />
      {starOpacity > 0 && (
        <g opacity={starOpacity}>
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fbf6ea" className={i % 3 === 0 ? 'twinkle' : undefined} style={{ animationDelay: `${s.d}s` }} />
          ))}
        </g>
      )}
      {/* concentric orbit rings — the celestial instrument */}
      <g fill="none" stroke="#fbf6ea" strokeOpacity="0.07">
        <circle cx={W / 2} cy={HORIZON} r={60} />
        <circle cx={W / 2} cy={HORIZON} r={110} />
        <circle cx={W / 2} cy={HORIZON} r={160} />
      </g>
      {showPath && <path d={path} fill="none" stroke="#f2c86e" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="2 4" />}
      {above && (
        <g transform={`translate(${sx},${sy})`}>
          <circle r="46" fill="url(#hero-glow)" />
          <g className="rays" stroke="#f2c86e" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round">
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2;
              const r1 = 17, r2 = i % 2 ? 24 : 30;
              return <line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} />;
            })}
          </g>
          <circle r="12" fill="url(#hero-disk)" />
        </g>
      )}
      <rect y={HORIZON - 40} width={W} height="40" fill="url(#hero-haze)" />
      {/* steppe horizon: distant mountains, rolling hills, grass */}
      <path d={`M0 ${HORIZON - 6} L40 ${HORIZON - 18} L70 ${HORIZON - 10} L110 ${HORIZON - 30} L150 ${HORIZON - 12} L190 ${HORIZON - 22} L230 ${HORIZON - 8} L280 ${HORIZON - 26} L330 ${HORIZON - 9} L370 ${HORIZON - 16} L400 ${HORIZON - 8} V${H} H0Z`} fill={hills[0]} opacity="0.85" />
      <path d={`M0 ${HORIZON + 2} C60 ${HORIZON - 10} 120 ${HORIZON + 6} 200 ${HORIZON - 2} S330 ${HORIZON - 8} 400 ${HORIZON + 2} V${H} H0Z`} fill={hills[1]} />
      <line x1="0" x2={W} y1={HORIZON} y2={HORIZON} stroke="#f2c86e" strokeOpacity="0.45" strokeWidth="0.8" />
      <path d={`M0 ${HORIZON + 22} C90 ${HORIZON + 12} 160 ${HORIZON + 26} 260 ${HORIZON + 16} S360 ${HORIZON + 22} 400 ${HORIZON + 14} V${H} H0Z`} fill={hills[2]} />
      {!above && (
        <g transform={`translate(${sx},${Math.min(H - 12, sy)})`} opacity="0.7">
          <circle r="7" fill="none" stroke="#f2c86e" strokeDasharray="2 2" />
        </g>
      )}
    </svg>
  );
});
