import { useMemo, useState } from 'react';
import { TimeChart } from '../components/charts';
import { formatClock } from '../lib/time/tz';
import { href } from '../router';
import { useApp } from '../state/app';
import { useWidth } from '../components/charts';
import { Badge, Card, Disclosure, Notice, Stat } from '../components/ui';
import {
  AM0, AM15G, BAND_DATA, BANDS, SPECTRUM_START_NM, SPECTRUM_STEP_NM, estimateBands, uvShareSeries, wavelengthAt, wavelengthColor, type SpectralBand,
} from '../lib/spectrum';
import { airMass, extraterrestrialHorizontal } from '../lib/astro/solar';
import { interpolate, HOURLY_MEAN_SHIFT } from '../lib/data/series';
import { uvNow } from '../lib/data/series';

function SpectrumChart({ selected, onSelect }: { selected: SpectralBand['id']; onSelect: (id: SpectralBand['id']) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 240;
  const pad = { l: 36, r: 10, t: 14, b: 30 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const maxNm = 2500, minNm = SPECTRUM_START_NM;
  const x = (nm: number) => pad.l + ((nm - minNm) / (maxNm - minNm)) * iw;
  const y = (v: number) => pad.t + (1 - v / 2.2) * ih;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(wavelengthAt(i)).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = (arr: number[]) => `${path(arr)}L${x(wavelengthAt(arr.length - 1))},${y(0)}L${x(wavelengthAt(0))},${y(0)}Z`;
  const visStops = useMemo(() => Array.from({ length: 21 }, (_, i) => 400 + i * 19), []);
  const hv = hover != null ? { nm: wavelengthAt(hover), am0: AM0[hover], g: AM15G[hover] } : null;
  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart"
        width={width}
        height={height}
        role="img"
        aria-label="Solar spectral irradiance from 280 to 2500 nanometres, above the atmosphere and at ground level (ASTM G173-03 reference)"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const nm = minNm + ((e.clientX - r.left - pad.l) / iw) * (maxNm - minNm);
          const i = Math.round((nm - minNm - SPECTRUM_STEP_NM / 2) / SPECTRUM_STEP_NM);
          setHover(i >= 0 && i < AM0.length ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="vis-grad" x1="0" x2="1" y1="0" y2="0">
            {visStops.map((nm, i) => <stop key={nm} offset={`${(i / (visStops.length - 1)) * 100}%`} stopColor={wavelengthColor(nm)} />)}
          </linearGradient>
          <clipPath id="g-clip"><path d={area(AM15G)} /></clipPath>
        </defs>
        {BANDS.filter((b) => b.nm[0] < maxNm).map((b) => (
          <g key={b.id} onClick={() => onSelect(b.id)} style={{ cursor: 'pointer' }}>
            <rect x={x(b.nm[0])} width={x(Math.min(b.nm[1], maxNm)) - x(b.nm[0])} y={pad.t} height={ih} fill={b.color} opacity={selected === b.id ? 0.16 : 0.05} />
          </g>
        ))}
        {[0, 1, 2].map((v) => (
          <g key={v}>
            <line className="grid-line" x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end">{v}</text>
          </g>
        ))}
        {[400, 780, 1000, 1400, 2000, 2500].map((nm) => (
          <text key={nm} x={x(nm)} y={height - 14} textAnchor="middle">{nm}</text>
        ))}
        <text x={pad.l + iw / 2} y={height - 2} textAnchor="middle">wavelength (nm) · W·m⁻²·nm⁻¹</text>
        <path d={area(AM15G)} fill="#c86a3e" opacity={0.28} />
        <rect x={x(400)} width={x(780) - x(400)} y={pad.t} height={ih} fill="url(#vis-grad)" clipPath="url(#g-clip)" opacity={0.9} />
        <path d={path(AM0)} fill="none" style={{ stroke: 'var(--text-2)' }} strokeWidth={1.3} strokeDasharray="4 3" />
        <path d={path(AM15G)} fill="none" stroke="#f2c86e" strokeWidth={1.6} />
        {hv && <line x1={x(hv.nm)} x2={x(hv.nm)} y1={pad.t} y2={pad.t + ih} style={{ stroke: 'var(--text-2)' }} />}
      </svg>
      {hv && (
        <div className="chart-tip" style={{ left: Math.min(width - 90, Math.max(90, x(hv.nm))) }}>
          <div className="faint">{hv.nm - 10}–{hv.nm + 10} nm</div>
          <div>Above atmosphere: <b>{hv.am0.toFixed(2)}</b></div>
          <div>Ground (AM1.5): <b>{hv.g.toFixed(2)}</b></div>
        </div>
      )}
    </div>
  );
}

export default function Spectrum() {
  const { loc, snap, now, solar, fresh, settings } = useApp();
  const [band, setBand] = useState<SpectralBand['id']>('visible');
  const b = BANDS.find((x) => x.id === band)!;
  const h = snap?.hourly ?? null;
  const ghi = h ? interpolate(h.time, h.shortwave, now, HOURLY_MEAN_SHIFT) : null;
  const dni = h ? interpolate(h.time, h.directNormal, now, HOURLY_MEAN_SHIFT) : null;
  const dif = h ? interpolate(h.time, h.diffuse, now, HOURLY_MEAN_SHIFT) : null;
  const cloud = snap?.current?.cloudCover ?? (h ? interpolate(h.time, h.cloudCover, now) : null);
  const est = estimateBands(ghi, cloud);
  const pos = solar?.position ?? null;
  const am = pos ? airMass(pos.apparentElevation) : null;
  const toa = pos ? extraterrestrialHorizontal(pos.elevation, pos.distanceAU) : null;
  const uv = uvNow(snap, now);
  const stale = fresh?.state === 'stale';
  const share = h ? uvShareSeries(h.time, h.uvIndex, h.shortwave) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Spectrum Lab</span>
          <h1>The light of the Sun, band by band</h1>
          <p className="lede">The Sun is more than a UV number. What sunlight is made of, how its mix shifts through the day, and — honestly — what can and cannot be known about your sky right now. <a href={href('philosophy', { c: 'spectrum-package' })}>Kruse’s “spectrum package” idea →</a></p>
        </div>
      </div>

      <Card eyebrow="Reference spectrum" title="Above the atmosphere vs at the ground" actions={<Badge kind="calculated">Reference data</Badge>}>
        <div className="band-tabs" role="group" aria-label="Spectral band">
          {BANDS.map((x) => (
            <button key={x.id} type="button" aria-pressed={band === x.id} onClick={() => setBand(x.id)}>
              <i style={{ background: x.color }} />{x.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}><SpectrumChart selected={band} onSelect={setBand} /></div>
        <div className="legend">
          <span><i style={{ background: '#f2c86e' }} />Ground level, clear sky, Sun ≈ 42° up (ASTM G173 AM1.5 global)</span>
          <span><i style={{ background: 'var(--text-2)' }} />Above the atmosphere (ASTM G173 AM0)</span>
        </div>
        <p className="xs faint" style={{ marginTop: 6 }}>The notches at the ground are absorption by ozone (UV), oxygen, water vapour and CO₂. These are standard reference conditions, not a measurement of your sky.</p>
      </Card>

      <div className="grid-2">
        <Card eyebrow={`${b.nm[0]}–${b.nm[1]} nm`} title={b.name}>
          <div className="stats">
            <Stat label="Share at ground" value={`${b.groundPct.toFixed(b.groundPct < 1 ? 2 : 1)}`} unit="%" kind="calculated" foot="AM1.5 reference" />
            <Stat label="Share in space" value={`${b.spacePct.toFixed(1)}`} unit="%" kind="calculated" foot="AM0 reference" />
          </div>
          <h3 style={{ marginTop: 14 }}>Physics</h3>
          <p className="small muted">{b.physics}</p>
          <h3>Biology</h3>
          <p className="small muted">{b.biology}</p>
          <h3>Safety</h3>
          <p className="small muted" style={{ marginBottom: 0 }}>{b.safety}</p>
        </Card>

        <Card eyebrow="Your sky, now" title="What is known" actions={snap ? <Badge kind={stale ? 'stale' : 'modeled'} /> : <Badge kind="unavailable" />}>
          {!loc ? (
            <p className="muted">Set a location to see calculated and modelled values for your sky.</p>
          ) : (
            <>
              <div className="stats">
                <Stat label="Sun elevation" value={pos ? `${pos.elevation.toFixed(1)}°` : null} kind="calculated" />
                <Stat label="Air mass" value={am != null ? am.toFixed(2) : null} kind="calculated" foot={am == null ? 'Sun below horizon' : undefined} />
                <Stat label="Top of atmosphere" value={toa != null ? Math.round(toa) : null} unit="W/m²" kind="calculated" />
                <Stat label="Global (GHI)" value={ghi != null ? Math.round(ghi) : null} unit="W/m²" kind="modeled" foot="broadband, hourly mean" />
                <Stat label="Direct normal" value={dni != null ? Math.round(dni) : null} unit="W/m²" kind="modeled" />
                <Stat label="Diffuse" value={dif != null ? Math.round(dif) : null} unit="W/m²" kind="modeled" />
              </div>
              <div className="stats" style={{ marginTop: 12 }}>
                <Stat label="UV index" value={uv.value != null ? uv.value.toFixed(1) : null} kind="forecast" />
                <Stat label="Measured spectrum" value={null} kind="measured" foot="no spectral measurements are available for your location" />
              </div>
            </>
          )}
        </Card>
      </div>

      <Card eyebrow="Right now" title="Band by band: what the data can say">
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Band</th><th>Range</th><th>Now</th><th>What the data can say</th></tr></thead>
            <tbody>
              {BANDS.map((x) => {
                const d = BAND_DATA[x.id];
                const e = est.find((v) => v.band.id === x.id)!;
                const value = x.id === 'uvb'
                  ? (uv.value != null ? `UV index ${uv.value.toFixed(1)}` : '—')
                  : d.status === 'unavailable' ? '—'
                  : e.low != null && e.high != null ? `${e.low < 10 ? e.low.toFixed(1) : Math.round(e.low)}–${e.high < 10 ? e.high.toFixed(1) : Math.round(e.high)} W/m²` : '—';
                const kind = x.id === 'uvb' ? (uv.value != null ? 'forecast' : 'unavailable') : d.status === 'unavailable' ? 'unavailable' : 'estimated';
                return (
                  <tr key={x.id}>
                    <td><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: x.color, marginRight: 6 }} />{x.name}</td>
                    <td className="faint tnum">{x.nm[0]}–{x.nm[1]} nm</td>
                    <td className="tnum" style={{ whiteSpace: 'nowrap' }}>{value}<div><Badge kind={kind as 'forecast' | 'unavailable' | 'estimated'} /></div></td>
                    <td className="xs muted">{d.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="xs faint" style={{ marginBottom: 0 }}>Measured spectral irradiance for your location: unavailable. Low UV does not imply high near-infrared — early and late in the day both are lower in absolute terms; only the proportions shift.</p>
      </Card>

      <Card eyebrow="Model-derived ratio" title="How the UV share of sunlight changes through the day" actions={<Badge kind="modeled" />}>
        {h ? (
          <>
            <TimeChart
              ariaLabel="Erythemal UV per kilowatt of modelled sunlight through the day"
              series={[{ id: 'share', label: 'UV share', color: '#9b7bff', times: share!.times, values: share!.share, format: (v) => `${Math.round(v)} mW/m² per kW/m²` }]}
              start={solar?.today.dayStart ?? h.time[0]}
              end={solar?.today.dayEnd ?? h.time[h.time.length - 1]}
              yMin={0}
              yMax={Math.max(50, Math.ceil(Math.max(0, ...share!.share.filter((x): x is number => x != null)) / 50) * 50)}
              now={now}
              formatX={(t) => (solar ? formatClock(t, solar.tz, settings.hour12) : '')}
              height={170}
              emptyText="Not enough modelled data for a ratio"
            />
            <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>Sunburn-weighted UV (from the UV index) divided by total modelled sunlight. It rises toward solar noon because the shorter path through the atmosphere lets proportionally more UV-B through, and falls as the Sun gets lower — reduced, not absent. This is a ratio of two forecasts, not a spectral measurement.</p>
          </>
        ) : <p className="muted">Needs the hourly UV and irradiance forecast.</p>}
      </Card>

      <Card eyebrow="Estimate · wide uncertainty" title="Rough split of the modelled sunlight" actions={<Badge kind="estimated" />}>
        {ghi == null ? (
          <Notice tone="warn">No modelled broadband irradiance is available for this moment, so no band estimate is shown.</Notice>
        ) : ghi <= 0 ? (
          <p className="muted">The model reports no sunlight reaching the ground right now (night or Sun below the horizon).</p>
        ) : (
          <>
            <p className="small muted">Splitting the model’s {Math.round(ghi)} W/m² of global irradiance by the reference band shares gives the ranges below. They are illustrations with deliberately wide bounds, not measurements: the true split shifts with Sun angle, water vapour, aerosols and cloud{cloud != null && cloud >= 70 ? ' (with heavy cloud, liquid water absorbs relatively more near-infrared, so infrared is likely at the low end)' : ''}.</p>
            <table className="data">
              <thead><tr><th>Band</th><th>Range</th><th className="n">Approx. W/m²</th></tr></thead>
              <tbody>
                {est.map((e) => (
                  <tr key={e.band.id}>
                    <td><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: e.band.color, marginRight: 6 }} />{e.band.name}</td>
                    <td className="faint">{e.band.nm[0]}–{e.band.nm[1]} nm</td>
                    <td className="n">{e.low != null && e.high != null ? `${e.low < 10 ? e.low.toFixed(1) : Math.round(e.low)}–${e.high < 10 ? e.high.toFixed(1) : Math.round(e.high)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card eyebrow="Know the difference" title="Measured, modelled, calculated, estimated">
        <Disclosure summary="Measured infrared irradiance" open>
          A reading from an instrument (e.g. a pyranometer or spectroradiometer) at a known place and time. <b>This app has no such measurement for your location</b>; consumer weather APIs do not provide spectral infrared data.
        </Disclosure>
        <Disclosure summary="Spectral irradiance at specific wavelengths">
          Power per area per nanometre (W·m⁻²·nm⁻¹). Requires a spectroradiometer or a radiative-transfer model (such as SMARTS or libRadtran) fed with ozone, water vapour, aerosol and cloud data. The curve above is a standard reference computed that way for one fixed set of conditions.
        </Disclosure>
        <Disclosure summary="Total (broadband) solar irradiance">
          All wavelengths combined. Above the atmosphere it is ≈ 1361 W/m² at 1 AU (calculated here for your Sun angle). At the ground, Open-Meteo provides a <b>model estimate</b> of global, direct and diffuse irradiance — averaged over the preceding hour.
        </Disclosure>
        <Disclosure summary="Solar elevation and the atmosphere">
          A low Sun shines through more air (higher air mass), which scatters blue and UV away and leaves light relatively redder. That changes the mix of wavelengths, but sunrise light is not “mostly infrared”: total infrared at sunrise is low because total sunlight is low. Clouds, humidity and altitude change the mix further — no two mornings are equivalent.
        </Disclosure>
        <Disclosure summary="What weather data cannot tell you">
          Weather and sun-angle data cannot measure your mitochondrial function, melatonin, metabolism or any biological response. Any app that claims to infer those from a forecast is going beyond the evidence.
        </Disclosure>
      </Card>
    </div>
  );
}
