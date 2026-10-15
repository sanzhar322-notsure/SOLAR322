import { useMemo } from 'react';
import { useApp } from '../state/app';
import { SolarHero } from '../components/SolarHero';
import { LocationPicker } from '../components/LocationPicker';
import { DataBanner } from '../components/DataStatus';
import { Icon, OrnamentBand } from '../components/Icon';
import { Badge, Card, Notice, Skeleton, Stat } from '../components/ui';
import { TimeChart } from '../components/charts';
import { PHASE_LABEL, compassPoint, dayEvents, nextEvent } from '../lib/astro/solar';
import { formatClock, formatDuration, formatUtcOffset, localMinutes, tzOffsetMinutes } from '../lib/time/tz';
import { interpolate, uvNow } from '../lib/data/series';
import { describeWeather } from '../lib/data/wmo';
import { UV_BANDS, uvBand } from '../lib/uv';
import { WINDOW_BLURB, WINDOW_LABEL, currentOrNextWindow, planWindows, uvPeak } from '../lib/planner';
import { currentAction, upcomingReminder } from '../lib/advisor';
import { temp, tempUnit, wind, windUnit } from '../lib/units';
import { href } from '../router';
import { recordDecision, useJournal } from '../state/journal';
import { useSkyContext } from '../state/sky';
import { CONCEPTS, THINKER_LABEL, conceptsForNow } from '../content/philosophy';
import { SkyLines } from '../components/SkyLines';
import { BAND_DATA, BANDS, estimateBands } from '../lib/spectrum';
import { HOURLY_MEAN_SHIFT } from '../lib/data/series';
import { formatYMD } from '../lib/time/tz';
import { sleepMetrics, parseClock, toClock } from '../lib/sleep';

export function CommandCenter() {
  const { loc, solar } = useApp();
  if (!loc || !solar) return <Welcome />;
  return <Dashboard />;
}

function Dashboard() {
    const { loc, solar, snap, now, settings, env, fresh } = useApp();
    const journal = useJournal();
    const h12 = settings.hour12;
    const tz = solar!.tz;
    const { today, tomorrow, position, phase, morning } = solar!;
    const stale = fresh?.state === 'stale';
    const c = snap?.current ?? null;
    const uv = uvNow(snap, now);
    const hourly = snap?.hourly ?? null;
    const apparentNow = c?.apparentTemperature ?? (hourly ? interpolate(hourly.time, hourly.apparentTemperature, now) : null);
    const windows = useMemo(() => planWindows(today, hourly, loc!.latitude, loc!.longitude), [today, hourly]);
    const nextWin = currentOrNextWindow(windows, now);
    const tomorrowWins = useMemo(() => (nextWin ? [] : planWindows(tomorrow, hourly, loc!.latitude, loc!.longitude)), [nextWin, tomorrow, hourly]);
    const opportunity = nextWin ?? currentOrNextWindow(tomorrowWins, now);
    const sky = useSkyContext();
    const cloudNow = c?.cloudCover ?? (hourly ? interpolate(hourly.time, hourly.cloudCover, now) : null);
    const ne = nextEvent(now, [today, tomorrow]);
    const peak = uvPeak(hourly, today.dayStart, today.dayEnd);
    const action = currentAction({
      now,
      nowMin: localMinutes(now, tz),
      uvPeak: peak,
      cloud: cloudNow,
      priorities: settings.priorities,
      formatTime: (t) => formatClock(t, tz, h12),
      phase,
      morning,
      elevation: position.elevation,
      uv: uv.value,
      apparentTemp: apparentNow,
      targetWake: settings.sleep.targetWake,
      targetBedtime: settings.sleep.targetBedtime,
      windDownMinutes: settings.sleep.windDownMinutes,
      day: today,
    });
    const reminder = settings.reminders.inApp
      ? upcomingReminder({
          nowMin: localMinutes(now, tz),
          targetWake: settings.sleep.targetWake,
          targetBedtime: settings.sleep.targetBedtime,
          windDownMinutes: settings.sleep.windDownMinutes,
          windDownOn: settings.reminders.windDown,
          morningOn: settings.reminders.morningLight,
          sunUp: position.elevation > 0,
        })
      : null;
    const dismissKey = `now:${action.id}:${formatYMD(solar!.todayYMD)}`;
    const dismissed = journal.decisions.some((d) => d.ruleId === dismissKey && d.decision === 'dismissed');
    const ghiNow = hourly ? interpolate(hourly.time, hourly.shortwave, now, HOURLY_MEAN_SHIFT) : null;
    const bands = estimateBands(ghiNow, cloudNow);
    const lensIds = conceptsForNow(position.elevation, morning);
    const lastEntry = journal.entries[journal.entries.length - 1];
    const lastSleep = lastEntry ? sleepMetrics(lastEntry).sleepMin : null;
    const windDownAt = toClock((parseClock(settings.sleep.targetBedtime) ?? 1380) - settings.sleep.windDownMinutes);
    const offset = tzOffsetMinutes(now, tz);

    const altitudeText = loc!.altitudeM != null
      ? `${Math.round(loc!.altitudeM)} m (${{ manual: 'entered', gps: 'GPS', dem: 'terrain model', geocoder: 'place database', 'provider-grid': 'model grid' }[loc!.altitudeSource ?? 'manual']})`
      : snap?.gridElevation != null ? `${Math.round(snap.gridElevation)} m (model grid)` : 'altitude unknown';

    return (
      <div className="page">
        <section className="hero" aria-label="Current sky">
          <SolarHero day={today} now={now} lat={loc!.latitude} lon={loc!.longitude} phase={phase} morning={morning} />
          <div className="hero-content">
            <span className="phase">{PHASE_LABEL[phase]}</span>
            <span className="clock display-num">{formatClock(now, tz, h12)}</span>
            <span className="sub">
              {loc!.name} · {altitudeText} · {formatUtcOffset(offset)}
              {solar!.zone.source === 'device' && ' (device time zone — location zone not yet known)'}
            </span>
            <div className="hero-foot">
              <span className="pill">Sun <b>{position.elevation >= 0 ? '+' : ''}{position.elevation.toFixed(1)}°</b> · {compassPoint(position.azimuth)} {position.azimuth.toFixed(0)}°</span>
              {ne && <span className="pill">{ne.label} in <b>{formatDuration(ne.t - now)}</b></span>}
              {uv.value != null ? (
                <span className="pill">UV <b>{uv.value.toFixed(1)}</b> {uvBand(uv.value).label}{stale ? ' · stale' : ''}</span>
              ) : (
                <span className="pill">UV unavailable</span>
              )}
            </div>
          </div>
        </section>

        <DataBanner />
        {reminder && <Notice tone="info" icon="bell"><b>Reminder.</b> {reminder.text}</Notice>}

        <div className="grid-3">
          <Card className={`accent span-2`} eyebrow="Right now" title={dismissed ? 'Hidden for today' : action.title}>
            {dismissed ? (
              <p className="small muted">You dismissed “{action.title}” for today. <button type="button" className="btn sm ghost" onClick={() => recordDecision({ ruleId: dismissKey, decision: 'modified', at: Date.now(), detail: 'restored' })}>Show again</button></p>
            ) : (
              <>
                <p>{action.detail}</p>
                <div className="chips" style={{ marginBottom: 8 }}>{action.facts.map((f) => <span key={f} className="chip">{f}</span>)}</div>
                <p className="small faint" style={{ marginBottom: 6 }}><b>Why this appears:</b> {action.why}</p>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn sm ghost" onClick={() => recordDecision({ ruleId: dismissKey, decision: 'dismissed', at: Date.now(), detail: action.title })}>Dismiss for today</button>
                  <a className="btn sm ghost" href={href('planner')}>Adjust lens</a>
                  <a className="btn sm ghost" href={href('circadian')}>Edit schedule</a>
                </div>
              </>
            )}
            <OrnamentBand />
            <div className="row between" style={{ marginTop: 8 }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">{opportunity && opportunity.start <= now ? 'Current solar window' : 'Next solar window'}</span>
                {opportunity ? (
                  <span>
                    <b className="tnum">{formatClock(opportunity.start, tz, h12)}–{formatClock(opportunity.end, tz, h12)}</b>{' '}
                    <span className="muted small">{WINDOW_LABEL[opportunity.kind]} · {WINDOW_BLURB[opportunity.kind].toLowerCase()}{opportunity.start > today.dayEnd ? ' (tomorrow)' : ''}</span>
                  </span>
                ) : (
                  <span className="muted small">No daylight window ahead in the forecast period.</span>
                )}
              </div>
              <a className="btn sm" href={href('planner')}>Plan <Icon name="chevron" /></a>
            </div>
          </Card>

          <Card eyebrow="Sleep target" title={`${settings.sleep.targetBedtime} → ${settings.sleep.targetWake}`} actions={<a className="btn sm ghost" href={href('circadian')} aria-label="Open Circadian Studio"><Icon name="chevron" /></a>}>
            <dl className="kv">
              <dt>Wind-down from</dt><dd>{windDownAt}</dd>
              <dt>Sleep need (set)</dt><dd>{settings.sleep.sleepNeedHours} h</dd>
              <dt>Last logged sleep</dt><dd>{lastSleep != null ? `${formatDuration(lastSleep * 60000)} (${lastEntry!.date})` : 'Not logged'}</dd>
            </dl>
            <a className="btn sm primary" style={{ marginTop: 12, width: '100%' }} href={href('journal', { log: 'today' })}><Icon name="edit" /> Log this morning</a>
          </Card>
        </div>

        <div className="grid-3">
          <Card eyebrow="Ultraviolet" title="UV index" actions={uv.value != null ? <Badge kind={stale ? 'stale' : 'forecast'}>{uv.source === 'current' ? 'Model now' : 'Forecast'}</Badge> : <Badge kind="unavailable" />}>
            {env.status === 'loading' && !snap ? (
              <Skeleton h={80} />
            ) : uv.value != null ? (
              <>
                <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                  <span className="display-num" style={{ fontSize: '3rem', lineHeight: 1 }}>{uv.value.toFixed(1)}</span>
                  <span className="uv-chip"><span className="dot" style={{ background: uvBand(uv.value).color }}>{Math.round(uv.value)}</span>{uvBand(uv.value).label}</span>
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>{uvBand(uv.value).protection}.{uv.source === 'interpolated' && ' Interpolated from the hourly forecast.'}</p>
              </>
            ) : (
              <p className="muted">No UV value is available right now — the app doesn’t estimate one.{position.elevation > 50 ? ' With the Sun this high, UV is usually substantial under clear skies.' : ''}</p>
            )}
            {hourly && (
              <TimeChart
                ariaLabel="UV index forecast for today"
                series={[{ id: 'uv', label: 'UV', color: '#e0a43a', times: hourly.time, values: hourly.uvIndex, type: 'area', format: (v) => v.toFixed(1) }]}
                start={today.dayStart}
                end={today.dayEnd}
                yMin={0}
                yMax={Math.max(6, Math.ceil((peak?.uv ?? 0) + 1))}
                height={130}
                now={now}
                formatX={(t) => formatClock(t, tz, h12)}
                bands={UV_BANDS.slice(1).map((b, i) => ({ y0: [3, 6, 8, 11][i], y1: [6, 8, 11, 30][i], color: b.color }))}
                emptyText="UV forecast unavailable"
              />
            )}
            {peak && <p className="xs faint" style={{ margin: '6px 0 0' }}>Today’s forecast peak ≈ <b>{peak.uv.toFixed(1)}</b> around {formatClock(peak.t, tz, h12)}.</p>}
          </Card>

          <Card eyebrow="Atmosphere" title={c ? describeWeather(c.weatherCode) : 'Weather'} actions={c ? <Badge kind={stale ? 'stale' : 'modeled'} /> : null}>
            {env.status === 'loading' && !snap ? (
              <div className="stats"><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></div>
            ) : c ? (
              <div className="stats">
                <Stat label="Temperature" value={temp(c.temperature, settings.temperatureUnit)} unit={tempUnit(settings.temperatureUnit)} />
                <Stat label="Feels like" value={temp(c.apparentTemperature, settings.temperatureUnit)} unit={tempUnit(settings.temperatureUnit)} />
                <Stat label="Cloud" value={c.cloudCover != null ? Math.round(c.cloudCover) : null} unit="%" />
                <Stat label="Humidity" value={c.humidity != null ? Math.round(c.humidity) : null} unit="%" />
                <Stat label="Wind" value={wind(c.windSpeed, settings.windUnit)} unit={windUnit(settings.windUnit)} />
                <Stat label="Precip." value={c.precipitation != null ? c.precipitation.toFixed(1) : null} unit="mm" />
              </div>
            ) : (
              <Notice tone="warn">Weather is unavailable. Nothing is shown in its place — connect to the internet and refresh.</Notice>
            )}
            {c && <p className="xs faint" style={{ margin: '10px 0 0' }}>Model time step {formatClock(c.time, tz, h12)} · {snap!.provider.name} grid cell, not a ground station.</p>}
          </Card>

          <Card eyebrow="The solar day" title={today.status === 'normal' ? `${formatDuration(today.daylightMs)} of daylight` : today.status === 'polar-day' ? 'Midnight sun' : 'Polar night'} actions={<Badge kind="calculated" />}>
            <ul className="event-list">
              {dayEvents(today).map((e) => (
                <li key={e.key} className={`${e.t < now ? 'past' : ''} ${ne?.key === e.key && ne.t === e.t ? 'next' : ''}`}>
                  <span>{e.label}</span>
                  <span className="t">{formatClock(e.t, tz, h12)}</span>
                </li>
              ))}
            </ul>
            <a className="btn sm" style={{ marginTop: 12, width: '100%' }} href={href('explorer')}>Open Solar Explorer <Icon name="chevron" /></a>
          </Card>
        </div>

        <div className="grid-3">
          <Card className="span-2" eyebrow="Solar Philosophy" title="Through Peat & Kruse, right now" actions={<a className="btn sm ghost" href={href('philosophy')} aria-label="Open Solar Philosophy"><Icon name="chevron" /></a>}>
            <div className="grid-2" style={{ gap: 12 }}>
              {lensIds.map((id) => {
                const cpt = CONCEPTS.find((x) => x.id === id)!;
                return (
                  <div key={id} className="phil-sky">
                    <a href={href('philosophy', { c: id })} style={{ color: 'var(--text)', textDecoration: 'none' }}><b>{cpt.title}</b></a>
                    <div className="xs faint" style={{ marginBottom: 4 }}>{THINKER_LABEL[cpt.thinker]} · evidence {cpt.level}</div>
                    <SkyLines concept={cpt} sky={sky} />
                  </div>
                );
              })}
            </div>
          </Card>
          <Card eyebrow="Spectrum now" title="Band by band" actions={<a className="btn sm ghost" href={href('spectrum')} aria-label="Open Spectrum Lab"><Icon name="chevron" /></a>}>
            <ul className="event-list">
              {BANDS.slice(0, 5).map((b) => {
                const est = bands.find((x) => x.band.id === b.id)!;
                const status = BAND_DATA[b.id].status;
                const val = b.id === 'uvb'
                  ? (uv.value != null ? `UV index ${uv.value.toFixed(1)}` : '—')
                  : status === 'unavailable' ? 'not forecast'
                  : est.low != null && est.high != null ? `≈ ${Math.round(est.low)}–${Math.round(est.high)} W/m²` : '—';
                return (
                  <li key={b.id}>
                    <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: b.color, marginRight: 6 }} />{b.name}</span>
                    <span className="t">{val} <Badge kind={b.id === 'uvb' ? (uv.value != null ? 'forecast' : 'unavailable') : status === 'unavailable' ? 'unavailable' : 'estimated'}>{b.id === 'uvb' ? 'proxy' : status === 'unavailable' ? 'n/a' : 'est.'}</Badge></span>
                  </li>
                );
              })}
            </ul>
            <p className="xs faint" style={{ margin: '8px 0 0' }}>No measured spectral data exists for your location. Ranges split modelled total sunlight by reference shares; low UV doesn’t imply high infrared.</p>
          </Card>
        </div>

        <p className="xs faint" style={{ textAlign: 'center' }}>
          Sun times: NOAA algorithm, calculated on this device for {loc!.latitude.toFixed(3)}, {loc!.longitude.toFixed(3)}.{' '}
          {snap ? <>Weather & UV: {snap.provider.attribution}.</> : 'Weather & UV: not loaded.'} Visible sunrise can differ from the calculated time by a few minutes because of terrain and atmospheric refraction.
        </p>
      </div>
    );
}

function Welcome() {
  return (
    <div className="page">
      <section className="hero" aria-label="Welcome">
        <svg className="sky" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="w-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a1538" />
              <stop offset="60%" stopColor="#2b4a8a" />
              <stop offset="100%" stopColor="#e8a99d" />
            </linearGradient>
          </defs>
          <rect width="400" height="260" fill="url(#w-sky)" />
          <g fill="none" stroke="#fbf6ea" strokeOpacity="0.08"><circle cx="200" cy="190" r="70" /><circle cx="200" cy="190" r="130" /><circle cx="200" cy="190" r="190" /></g>
          <path d="M0 190 C80 176 140 196 200 186 S330 178 400 190 V260 H0Z" fill="#141b3a" />
          <line x1="0" x2="400" y1="188" y2="188" stroke="#f2c86e" strokeOpacity="0.45" />
        </svg>
        <div className="hero-content">
          <span className="phase">Tengri · the Eternal Blue Sky</span>
          <span className="clock display-num" style={{ fontSize: 'clamp(2.4rem, 9vw, 4rem)' }}>Where is your sky?</span>
          <span className="sub">Set a location to calculate the Sun’s path and load real weather and UV. Your location stays on this device.</span>
        </div>
      </section>
      <div className="grid-2">
        <Card eyebrow="Step 1" title="Choose a location">
          <LocationPicker />
        </Card>
        <Card eyebrow="What this app does — and does not do" title="Honest instruments">
          <ul className="source-list">
            <li>Sun position, sunrise, sunset and twilight are <b>calculated</b> on your device (NOAA algorithm).</li>
            <li>Weather and UV come from <b>Open-Meteo’s weather models</b> — forecasts and model estimates, not ground measurements.</li>
            <li>When data is missing or old, it is labelled <b>unavailable</b> or <b>stale</b> — never invented.</li>
            <li>Your journal stays in this browser. Export or delete it any time in Settings.</li>
            <li>It is an educational tool, not medical advice, and it does not diagnose anything.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
