import { useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { solarDay } from '../state/solar';
import { useJournal, upsertSession, type OutdoorSession } from '../state/journal';
import { SessionSheet } from '../components/SessionSheet';
import { DataBanner } from '../components/DataStatus';
import { Legend, TimeChart } from '../components/charts';
import { Badge, Card, Disclosure, Empty, Notice, Segmented, Stat, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { addDaysYMD, formatClock, formatDateLong, formatDuration } from '../lib/time/tz';
import { WINDOW_LABEL, planWindows, uvPeak, type OutdoorWindow, type WindowKind } from '../lib/planner';
import { UV_BANDS, UV_FACTORS, uvBand } from '../lib/uv';
import { hasAny } from '../lib/data/series';
import { temp, tempUnit } from '../lib/units';
import { href } from '../router';

const KIND_COLOR: Record<WindowKind, string> = {
  'morning-light': '#f2c86e',
  'evening-light': '#e39a74',
  'lower-uv': '#4f9d69',
  protect: '#e07b2e',
  minimize: '#c8463a',
  'uv-unknown': '#8f98b4',
};

export default function Planner() {
  const { loc, solar } = useApp();
  if (!loc || !solar) {
    return <div className="page"><Empty icon="plan" title="No location yet" action={<a className="btn primary" href={href('command')}>Set location</a>}>The planner needs your location for sunrise, sunset and the UV forecast.</Empty></div>;
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
  const uvMaxDaily = di >= 0 ? daily!.uvIndexMax[di] : null;
  const stale = fresh?.state === 'stale';
  const sessions = journal.sessions.filter((s) => s.start < day.dayEnd && s.end > day.dayStart);
  const hasUv = hourly ? hasAny(hourly.uvIndex.filter((_, i) => hourly.time[i] >= day.dayStart && hourly.time[i] < day.dayEnd)) : false;

  const planFrom = (w: OutdoorWindow) => {
    const start = Math.max(w.start, now);
    setSheet({ status: 'planned', start, end: Math.min(w.end, start + 30 * 60000), timezone: tz });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Exposure Planner</span>
          <h1>{formatDateLong(date)}</h1>
          <p className="lede">Daylight windows ranked by forecast UV and heat. Low UV is never labelled “safe” — it means lower risk of sunburn, with the usual caveats.</p>
        </div>
        <Segmented label="Day" value={offset} onChange={setOffset} options={[{ value: '0', label: 'Today' }, { value: '1', label: 'Tomorrow' }, { value: '2', label: 'Day after' }]} />
      </div>

      <DataBanner />

      <div className="grid-2">
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
            height={210}
            emptyText="UV forecast unavailable"
          />
          <Legend items={[{ label: 'UV forecast (model, with clouds)', color: '#e0a43a' }, { label: 'Clear-sky UV (model)', color: '#8f98b4' }, ...UV_BANDS.slice(1).map((b) => ({ label: `${b.label} ${b.range}`, color: b.color }))]} />
          <div className="stats" style={{ marginTop: 12 }}>
            <Stat label="Daily max UV" value={uvMaxDaily != null ? uvMaxDaily.toFixed(1) : null} kind={stale ? 'stale' : 'forecast'} foot={uvMaxDaily != null ? uvBand(uvMaxDaily).label : undefined} />
            <Stat label="Peak around" value={peak ? formatClock(peak.t, tz, h12) : null} kind="forecast" />
            <Stat label="High / low" value={di >= 0 && daily!.temperatureMax[di] != null ? `${temp(daily!.temperatureMax[di], settings.temperatureUnit)} / ${temp(daily!.temperatureMin[di], settings.temperatureUnit)}` : null} unit={tempUnit(settings.temperatureUnit)} kind="forecast" />
          </div>
        </Card>

        <Card eyebrow="Windows" title="Outdoor opportunities" actions={<button type="button" className="btn sm primary" onClick={() => setSheet({ status: 'done', timezone: tz })}><Icon name="plus" /> Log</button>}>
          {windows.length === 0 ? (
            <Empty icon="moon" title={day.status === 'polar-night' ? 'Polar night' : 'No daylight'}>The Sun does not rise above the horizon on this date at your location.</Empty>
          ) : (
            <div>
              {windows.map((w, i) => (
                <div className="window-row" key={i}>
                  <div className="swatch" style={{ background: KIND_COLOR[w.kind] }} />
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="row between">
                      <b className="tnum">{formatClock(w.start, tz, h12)} – {formatClock(w.end, tz, h12)}</b>
                      <span className="xs faint">{formatDuration(w.end - w.start)}</span>
                    </div>
                    <span className="small">{WINDOW_LABEL[w.kind]}{w.peakUv != null ? ` · UV up to ${w.peakUv.toFixed(1)}` : ''}</span>
                    {w.notes.map((n) => <span key={n} className="xs faint">{n}</span>)}
                    {w.end > now && w.kind !== 'minimize' && (
                      <div><button type="button" className="btn sm" onClick={() => planFrom(w)}><Icon name="calendar" /> Plan a session</button></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card eyebrow="Your sessions" title={sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} on this day` : 'No sessions yet'}>
        {sessions.length === 0 ? (
          <p className="muted small">Plan a session from a window above, or log one after you have been outside. Sessions feed your Journal trends.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id} className="row between">
                <div className="stack" style={{ gap: 2 }}>
                  <b className="tnum">{formatClock(s.start, tz, h12)} – {formatClock(s.end, tz, h12)} <span className="faint small">({formatDuration(s.end - s.start)})</span></b>
                  <span className="xs faint">
                    {s.status === 'planned' ? (s.end < now ? 'Planned — not marked done' : 'Planned') : 'Done'}
                    {s.weather ? ` · ${s.weather}` : ''}
                    {s.uvPeak != null ? ` · UV peak ${s.uvPeak.toFixed(1)}` : ' · UV not available'}
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
        <Card eyebrow="Why UV changes" title="Reading the UV index">
          <p className="small muted">The UV index describes sunburn-weighted UV on a horizontal surface (1 unit = 25 mW/m²). It is an environmental number, not the dose your skin receives.</p>
          <ul className="list">
            {UV_FACTORS.map((f) => (
              <li key={f.factor} className="small"><b>{f.factor}.</b> <span className="muted">{f.effect}</span></li>
            ))}
          </ul>
          <Disclosure summary="Brightness and warmth are not UV">
            Warmth comes mostly from visible and infrared light; UV is invisible. A cool, breezy or hazy day can still have high UV, and a hot evening can have almost none. Use the UV index, not how the sun feels.
          </Disclosure>
          <Disclosure summary="About “ambient SED” on logged sessions">
            For logged sessions the app integrates the hourly UV forecast over the session: 1 SED (standard erythema dose) = 100 J/m² of sunburn-weighted UV on a horizontal surface. Real skin exposure is usually lower and depends on shade, posture, orientation, clothing, sunscreen and reflection — so this is context, not a personal dose or a target.
          </Disclosure>
        </Card>
        <Card eyebrow="Protection" title="Health-first principles">
          <ul className="list small">
            <li><b>No arbitrary “safe minutes.”</b> Burn time depends on skin type, UV, reflection, medication and more. The app never gives one.</li>
            <li><b>Never look at the Sun</b> — including at sunrise and sunset. Daylight reaching your eyes from the sky and surroundings is what matters for your body clock.</li>
            <li><b>Avoid sunburn.</b> Don’t deliberately burn or tan to excess; use shade, clothing, a hat, UV-protective sunglasses and sunscreen when UV is 3 or more.</li>
            <li><b>Heat</b> can be the bigger risk on hot days: drink water, rest in shade, and check on others.</li>
          </ul>
          <Notice tone="info">This planner is educational. If you have a photosensitive condition, take photosensitising medication, or have had skin cancer, follow your clinician’s advice.</Notice>
        </Card>
      </div>

      <SessionSheet open={!!sheet} initial={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
