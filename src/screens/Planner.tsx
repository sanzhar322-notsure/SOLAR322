import { useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { solarDay } from '../state/solar';
import { useJournal, upsertSession, type OutdoorSession } from '../state/journal';
import { PRIORITIES, updateSettings, type PriorityKey } from '../state/settings';
import { SessionSheet, fromLocalInput, toLocalInput } from '../components/SessionSheet';
import { DataBanner } from '../components/DataStatus';
import { Legend, TimeChart } from '../components/charts';
import { Badge, Card, Disclosure, Empty, Segmented, Stat, toast } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { addDaysYMD, formatClock, formatDateLong, formatDuration, localMinutes } from '../lib/time/tz';
import {
  WINDOW_BLURB, WINDOW_LABEL, checkSession, planWindows, uvPeak, windowContext, type LineTopic, type SolarWindow, type WindowKind,
} from '../lib/planner';
import { UV_BANDS, UV_FACTORS, uvBand } from '../lib/uv';
import { hasAny } from '../lib/data/series';
import { temp, tempUnit } from '../lib/units';
import { href } from '../router';

export const KIND_COLOR: Record<WindowKind, string> = {
  morning: '#f2c86e',
  daytime: '#5aa4e6',
  evening: '#e39a74',
};

export const TOPIC_ICON: Record<LineTopic, IconName> = {
  light: 'sun', circadian: 'rhythm', uv: 'shield', heat: 'thermo', weather: 'cloud', spectrum: 'prism', activity: 'plan',
};

export default function Planner() {
  const { loc, solar } = useApp();
  if (!loc || !solar) {
    return <div className="page"><Empty icon="plan" title="No location yet" action={<a className="btn primary" href={href('command')}>Set location</a>}>The planner needs your location for the solar windows and the UV forecast.</Empty></div>;
  }
  return <PlannerBody />;
}

function PlannerBody() {
  const { loc, solar, snap, now, settings, fresh } = useApp();
  const journal = useJournal();
  const tz = solar!.tz;
  const h12 = settings.hour12;
  const [offset, setOffset] = useState<'0' | '1' | '2'>('0');
  const [sheet, setSheet] = useState<Partial<OutdoorSession> | null>(null);
  const date = addDaysYMD(solar!.todayYMD, Number(offset));
  const day = solarDay(date, loc!.latitude, loc!.longitude, tz, settings.horizonHeightM);
  const hourly = snap?.hourly ?? null;
  const windows = useMemo(() => planWindows(day, hourly, loc!.latitude, loc!.longitude), [day, hourly, loc]);
  const peak = uvPeak(hourly, day.dayStart, day.dayEnd);
  const daily = snap?.daily;
  const di = daily ? daily.time.findIndex((t) => t >= day.dayStart - 3 * 3600000 && t < day.dayEnd - 3 * 3600000) : -1;
  const stale = fresh?.state === 'stale';
  const sessions = journal.sessions.filter((s) => s.start < day.dayEnd && s.end > day.dayStart);
  const hasUv = hourly ? hasAny(hourly.uvIndex.filter((_, i) => hourly.time[i] >= day.dayStart && hourly.time[i] < day.dayEnd)) : false;
  const ctxInput = {
    tz, hour12: h12, priorities: settings.priorities, targetWake: settings.sleep.targetWake, targetBedtime: settings.sleep.targetBedtime,
    windDownMinutes: settings.sleep.windDownMinutes, day, lat: loc!.latitude, lon: loc!.longitude,
    formatTime: (t: number) => formatClock(t, tz, h12), localMinutes: (t: number) => localMinutes(t, tz),
  };

  const togglePriority = (k: PriorityKey) =>
    updateSettings((s) => ({ ...s, priorities: s.priorities.includes(k) ? s.priorities.filter((p) => p !== k) : [...s.priorities, k] }));

  const planFrom = (w: SolarWindow) => {
    const start = Math.max(w.start, now);
    setSheet({ status: 'planned', start, end: Math.min(w.end, start + 30 * 60000), timezone: tz });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Exposure Planner</span>
          <h1>{formatDateLong(date)}</h1>
          <p className="lede">Your solar day, organised by the height of the Sun — with UV, heat, cloud and spectrum in context, and your own schedule alongside.</p>
        </div>
        <Segmented label="Day" value={offset} onChange={setOffset} options={[{ value: '0', label: 'Today' }, { value: '1', label: 'Tomorrow' }, { value: '2', label: 'Day after' }]} />
      </div>

      <DataBanner />

      <Card eyebrow="Your lens" title="What should the planner emphasise?">
        <div className="row" role="group" aria-label="Priorities">
          {PRIORITIES.map((p) => (
            <button key={p.key} type="button" className="btn sm" aria-pressed={settings.priorities.includes(p.key)} title={p.hint} onClick={() => togglePriority(p.key)}>
              {settings.priorities.includes(p.key) && <Icon name="check" />} {p.label}
            </button>
          ))}
        </div>
        <p className="xs faint" style={{ marginTop: 8, marginBottom: 0 }}>Priorities change which details appear in each window. Strong UV or heat is always mentioned when it occurs.</p>
      </Card>

      <div className="grid-2">
        <Card eyebrow="The solar day" title="Windows" actions={<button type="button" className="btn sm primary" onClick={() => setSheet({ status: 'done', timezone: tz })}><Icon name="plus" /> Log</button>}>
          {windows.length === 0 ? (
            <Empty icon="moon" title={day.status === 'polar-night' ? 'Polar night' : 'No daylight'}>The Sun does not rise above the horizon on this date at your location.</Empty>
          ) : (
            <div>
              {windows.map((w, i) => (
                <div className="window-row" key={i}>
                  <div className="swatch" style={{ background: KIND_COLOR[w.kind] }} />
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row between">
                      <b>{WINDOW_LABEL[w.kind]}</b>
                      <span className="xs faint">{formatDuration(w.end - w.start)}</span>
                    </div>
                    <span className="tnum small">{formatClock(w.start, tz, h12)} – {formatClock(w.end, tz, h12)} · <span className="faint">{WINDOW_BLURB[w.kind]}</span></span>
                    <div className="chips">
                      <span className="chip">Sun {Math.max(0, Math.round(Math.min(w.elevStart, w.elevEnd)))}°–{Math.round(w.elevPeak)}°</span>
                      {w.uv.peak != null && <span className="chip">UV ≤ {w.uv.peak.toFixed(1)}</span>}
                      {w.cloudMean != null && <span className="chip">Cloud {Math.round(w.cloudMean)}%</span>}
                      {w.apparentMax != null && <span className="chip">Feels ≤ {temp(w.apparentMax, settings.temperatureUnit)}{tempUnit(settings.temperatureUnit)}</span>}
                    </div>
                    <ul className="context-lines">
                      {windowContext(w, ctxInput).map((l) => (
                        <li key={l.text} className={l.weight}><Icon name={TOPIC_ICON[l.topic]} /><span>{l.text}</span></li>
                      ))}
                    </ul>
                    {w.end > now && (
                      <div><button type="button" className="btn sm" onClick={() => planFrom(w)}><Icon name="calendar" /> Plan a session</button></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="xs faint" style={{ marginBottom: 0 }}>Windows are divided where the Sun crosses {Math.round(Math.max(6, Math.min(30, 0.6 * (day.noonElevation ?? 0))))}° (calculated for this date). They are ways of organising the day, not claims that one period is uniquely beneficial or risk-free.</p>
        </Card>

        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          <Card eyebrow="Forecast" title="UV through the day" actions={hasUv ? <Badge kind={stale ? 'stale' : 'forecast'} /> : <Badge kind="unavailable" />}>
            <TimeChart
              ariaLabel="Forecast UV index and clear-sky UV index"
              series={[
                ...(hourly && hasAny(hourly.uvIndexClearSky) ? [{ id: 'cs', label: 'Clear-sky UV', color: '#8f98b4', times: hourly.time, values: hourly.uvIndexClearSky, type: 'dashed' as const, format: (v: number) => v.toFixed(1) }] : []),
                ...(hourly ? [{ id: 'uv', label: 'UV (with clouds)', color: '#e0a43a', times: hourly.time, values: hourly.uvIndex, type: 'area' as const, format: (v: number) => `${v.toFixed(1)} ${uvBand(v).label}` }] : []),
              ]}
              start={day.dayStart}
              end={day.dayEnd}
              yMin={0}
              yMax={Math.max(6, Math.ceil((peak?.uv ?? 0) + 1))}
              bands={UV_BANDS.slice(1).map((b, i) => ({ y0: [3, 6, 8, 11][i], y1: [6, 8, 11, 30][i], color: b.color }))}
              markers={[
                ...(day.sunrise ? [{ t: day.sunrise, label: 'rise' }] : []),
                ...(day.solarNoon ? [{ t: day.solarNoon, label: 'noon' }] : []),
                ...(day.sunset ? [{ t: day.sunset, label: 'set' }] : []),
              ]}
              now={now}
              formatX={(t) => formatClock(t, tz, h12)}
              height={190}
              emptyText="UV forecast unavailable"
            />
            <Legend items={[{ label: 'UV forecast (with clouds)', color: '#e0a43a' }, { label: 'Clear-sky UV', color: '#8f98b4' }]} />
            <div className="stats" style={{ marginTop: 12 }}>
              <Stat label="Peak UV" value={peak ? peak.uv.toFixed(1) : null} kind={stale ? 'stale' : 'forecast'} foot={peak ? `${uvBand(peak.uv).label} · ${formatClock(peak.t, tz, h12)}` : undefined} />
              <Stat label="High / low" value={di >= 0 && daily!.temperatureMax[di] != null ? `${temp(daily!.temperatureMax[di], settings.temperatureUnit)} / ${temp(daily!.temperatureMin[di], settings.temperatureUnit)}` : null} unit={tempUnit(settings.temperatureUnit)} kind="forecast" />
            </div>
          </Card>
          <SessionCheck windows={windows} />
        </div>
      </div>

      <Card eyebrow="Your sessions" title={sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} on this day` : 'No sessions yet'}>
        {sessions.length === 0 ? (
          <p className="muted small">Plan a session from a window, or log one after you’ve been outside. Sessions build your Solar History in the Journal.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id} className="row between">
                <div className="stack" style={{ gap: 2 }}>
                  <b className="tnum">{formatClock(s.start, tz, h12)} – {formatClock(s.end, tz, h12)} <span className="faint small">({formatDuration(s.end - s.start)})</span></b>
                  <span className="xs faint">
                    {s.status === 'planned' ? (s.end < now ? 'Planned — not marked done' : 'Planned') : 'Done'}
                    {s.weather ? ` · ${s.weather}` : ''}
                    {s.uvPeak != null ? ` · UV peak ${s.uvPeak.toFixed(1)}` : ''}
                    {s.ambientSed != null ? ` · ambient ${s.ambientSed.toFixed(2)} SED` : ''}
                  </span>
                </div>
                <div className="row">
                  {s.status === 'planned' && (
                    <button type="button" className="btn sm" onClick={() => { upsertSession({ ...s, status: 'done' }); toast('Marked as done'); }}><Icon name="check" /> Done</button>
                  )}
                  <button type="button" className="btn sm ghost" onClick={() => setSheet(s)} aria-label="Edit session"><Icon name="edit" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid-2">
        <ProtectionPanel />
        <Card eyebrow="Interpretive lens" title="Read the day through Peat & Kruse">
          <p className="small muted">Morning light as a timing signal, the changing spectrum through the day, infrared, warmth and darkness — each idea read in three layers (original idea, evidence, practical reading) and tied to today’s sky.</p>
          <div className="row">
            <a className="btn sm" href={href('philosophy', { c: 'sunrise-signal' })}>Sunrise as a signal</a>
            <a className="btn sm" href={href('philosophy', { c: 'spectrum-package' })}>The spectrum package</a>
            <a className="btn sm" href={href('philosophy', { c: 'darkness-night' })}>Darkness & night</a>
          </div>
          <a className="btn sm primary" style={{ marginTop: 10 }} href={href('philosophy')}><Icon name="shanyrak" /> Open Solar Philosophy</a>
        </Card>
      </div>

      <SessionSheet open={!!sheet} initial={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function SessionCheck({ windows }: { windows: SolarWindow[] }) {
  const { solar, snap, now, settings } = useApp();
  const tz = solar!.tz;
  const next = windows.find((w) => w.end > now);
  const [start, setStart] = useState(() => toLocalInput(next ? Math.max(next.start, now) : now, tz));
  const [mins, setMins] = useState<'15' | '30' | '60' | '120' | '240'>('30');
  const t0 = fromLocalInput(start, tz);
  const res = t0 != null ? checkSession(snap?.hourly ?? null, t0, Number(mins)) : null;
  return (
    <Card eyebrow="Plan check" title="How much UV would a session see?">
      <div className="form-grid">
        <label className="field"><span>Start</span><input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <div className="field"><span>Duration</span>
          <Segmented label="Duration" value={mins} onChange={setMins} options={[{ value: '15', label: '15m' }, { value: '30', label: '30m' }, { value: '60', label: '1h' }, { value: '120', label: '2h' }, { value: '240', label: '4h' }]} />
        </div>
      </div>
      {res && (
        <p className={`small ${res.weight === 'note' ? 'muted' : ''}`} style={{ marginTop: 10, marginBottom: 6 }}>
          {res.weight !== 'note' && <Icon name="shield" style={{ width: 16, height: 16, verticalAlign: '-3px', marginRight: 6, color: res.weight === 'important' ? 'var(--c-stale)' : 'var(--c-model)' }} />}
          {res.text}
        </p>
      )}
      <p className="xs faint" style={{ margin: 0 }}>Ambient UV on a horizontal surface from the forecast (1 SED = 100 J/m² erythemally weighted). Skin usually receives less, depending on posture, shade and clothing. {settings.priorities.includes('extended') ? 'Tip: longer sessions accumulate roughly in proportion to time × UV.' : ''}</p>
    </Card>
  );
}

export function ProtectionPanel() {
  return (
    <Card eyebrow="Reference" title="Protection, in context" id="protection">
      <p className="small muted">Protection is one tool among several, and its relevance depends on context: UV intensity, how long you’ll be out, reflective surroundings, heat, and your own skin and history.</p>
      <Disclosure summary="When protection becomes relevant">
        <ul className="source-list">
          <li><b>Intensity × duration.</b> A short morning walk and an afternoon at the beach are different exposures, even on the same day. The Plan check above estimates cumulative ambient UV.</li>
          <li><b>Reflection.</b> Fresh snow reflects much of the UV; water, sand and concrete add some.</li>
          <li><b>Altitude & season.</b> UV rises with elevation and is strongest when the noon Sun is high.</li>
          <li><b>Individual susceptibility.</b> Sensitivity differs several-fold between people and with some medications. Your own history is better context than a population number — but a tan or darker skin is not a guarantee against damage.</li>
        </ul>
      </Disclosure>
      <Disclosure summary="Options">
        <p>If you’re planning to spend several hours outdoors during higher-UV conditions, sunscreen may be useful alongside clothing, a hat or shade. Choose protection according to your activity, the conditions and your individual needs. Shade breaks and timing are options too. UV-protective sunglasses reduce exposure of the eyes.</p>
      </Disclosure>
      <Disclosure summary="Eyes">
        <p>Daylight from the sky and your surroundings is what reaches the eyes for timing purposes; there’s no need — and real risk — in looking at the Sun itself, including at sunrise and sunset.</p>
      </Disclosure>
      <Disclosure summary="What the app deliberately doesn’t do">
        <p>It doesn’t give “safe minutes”, label any window “safe”, or compute a personal UV tolerance from skin colour, ethnicity or past exposure. It doesn’t encourage burning. The UV index is ambient and environmental; personal dose depends on many factors the app can’t see.</p>
      </Disclosure>
      <Disclosure summary="WHO UV index categories">
        <table className="data">
          <thead><tr><th>UV</th><th>Category</th><th>WHO guidance (as published)</th></tr></thead>
          <tbody>{UV_BANDS.map((b) => <tr key={b.category}><td className="tnum">{b.range}</td><td><span className="uv-chip"><span className="dot" style={{ background: b.color }} />{b.label}</span></td><td className="xs">{b.detail}</td></tr>)}</tbody>
        </table>
        <p className="xs faint">Source: WHO, Global Solar UV Index: A Practical Guide (2002).</p>
      </Disclosure>
      <Disclosure summary="Why UV varies">
        <ul className="source-list">{UV_FACTORS.map((f) => <li key={f.factor}><b>{f.factor}.</b> {f.effect}</li>)}</ul>
        <p className="xs faint">Warmth and brightness come mostly from visible and infrared light; UV is invisible. How the sun feels is not a guide to UV.</p>
      </Disclosure>
    </Card>
  );
}
