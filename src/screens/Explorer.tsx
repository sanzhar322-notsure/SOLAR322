import { useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { solarDay } from '../state/solar';
import { SolarClock, CLOCK_LEGEND } from '../components/SolarClock';
import { Legend, TimeChart } from '../components/charts';
import { Badge, Card, Disclosure, Empty, Stat } from '../components/ui';
import { Icon } from '../components/Icon';
import {
  airMass, compassPoint, dayEvents, extraterrestrialHorizontal, refractionCorrection, sunPosition, EVENT_LABELS,
} from '../lib/astro/solar';
import {
  addDaysYMD, formatClock, formatDateLong, formatDuration, formatMinutesOfDay, formatYMD, localMinutes, parseYMD,
  tzOffsetMinutes, zonedTimeToUtc, type YMD,
} from '../lib/time/tz';
import { interpolate, HOURLY_MEAN_SHIFT } from '../lib/data/series';
import { uvBand } from '../lib/uv';
import { temp, tempUnit } from '../lib/units';
import { href } from '../router';

export default function Explorer() {
  const { loc, solar } = useApp();
  if (!loc || !solar) {
    return (
      <div className="page">
        <Empty icon="sky" title="No location yet" action={<a className="btn primary" href={href('command')}>Set location</a>}>
          The Solar Explorer calculates the Sun’s path for your coordinates.
        </Empty>
      </div>
    );
  }
  return <ExplorerBody key={loc.id} />;
}

function ExplorerBody() {
  const { loc, solar, snap, now, settings } = useApp();
  const tz = solar!.tz;
  const h12 = settings.hour12;
  const [date, setDate] = useState<YMD>(solar!.todayYMD);
  const [selMin, setSelMin] = useState(() => Math.round(localMinutes(now, tz) / 5) * 5);
  const lat = loc!.latitude, lon = loc!.longitude;
  const day = solarDay(date, lat, lon, tz, settings.horizonHeightM);
  const today = solar!.today;
  const isToday = formatYMD(date) === formatYMD(solar!.todayYMD);
  const selected = zonedTimeToUtc(date.year, date.month, date.day, Math.floor(selMin / 60), selMin % 60, 0, tz);
  const pos = sunPosition(selected, lat, lon);
  const hourly = snap?.hourly ?? null;
  const inForecast = hourly ? selected >= hourly.time[0] && selected <= hourly.time[hourly.time.length - 1] : false;
  const uvSel = inForecast && hourly ? interpolate(hourly.time, hourly.uvIndex, selected) : null;
  const cloudSel = inForecast && hourly ? interpolate(hourly.time, hourly.cloudCover, selected) : null;
  const tempSel = inForecast && hourly ? interpolate(hourly.time, hourly.temperature, selected) : null;
  const ghiSel = inForecast && hourly ? interpolate(hourly.time, hourly.shortwave, selected, HOURLY_MEAN_SHIFT) : null;
  const am = airMass(pos.apparentElevation);
  const toa = extraterrestrialHorizontal(pos.elevation, pos.distanceAU);

  const year = date.year;
  const presets: { label: string; d: YMD }[] = [
    { label: 'Today', d: solar!.todayYMD },
    { label: 'Mar equinox', d: { year, month: 3, day: 20 } },
    { label: 'Jun solstice', d: { year, month: 6, day: 21 } },
    { label: 'Sep equinox', d: { year, month: 9, day: 22 } },
    { label: 'Dec solstice', d: { year, month: 12, day: 21 } },
  ];

  // Elevation curves for the selected date and both solstices.
  const curve = (d: YMD) => {
    const sd = solarDay(d, lat, lon, tz, settings.horizonHeightM);
    const times: number[] = [], vals: number[] = [];
    // map onto the selected date's clock so shapes overlay by local time
    for (let m = 0; m <= 1440; m += 10) {
      const t = zonedTimeToUtc(d.year, d.month, d.day, Math.floor(m / 60) % 24, m % 60, 0, tz) + (m === 1440 ? 86400000 : 0);
      times.push(day.dayStart + m * 60000);
      vals.push(sunPosition(t, lat, lon).elevation);
    }
    return { sd, times, vals };
  };
  const curves = useMemo(() => ({
    sel: curve(date),
    jun: curve({ year, month: 6, day: 21 }),
    dec: curve({ year, month: 12, day: 21 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [formatYMD(date), lat, lon, tz]);

  // Seasonal daylight across the year (every 4 days).
  const season = useMemo(() => {
    const times: number[] = [], daylight: number[] = [], rise: (number | null)[] = [], set: (number | null)[] = [];
    for (let i = 0; i < 366; i += 4) {
      const d = addDaysYMD({ year, month: 1, day: 1 }, i);
      if (d.year !== year) break;
      const sd = solarDay(d, lat, lon, tz, settings.horizonHeightM);
      times.push(Date.UTC(d.year, d.month - 1, d.day));
      daylight.push(sd.daylightMs / 3600000);
      rise.push(sd.sunrise != null ? localMinutes(sd.sunrise, tz) / 60 : null);
      set.push(sd.sunset != null ? localMinutes(sd.sunset, tz) / 60 : null);
    }
    return { times, daylight, rise, set };
  }, [year, lat, lon, tz, settings.horizonHeightM]);

  const diffDaylight = day.daylightMs - today.daylightMs;
  const offset = tzOffsetMinutes(selected, tz);
  const noonClock = day.solarNoon != null ? localMinutes(day.solarNoon, tz) : null;
  const clockAhead = noonClock != null ? noonClock - 720 : null;
  const monthFmt = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(new Date(t));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Solar Explorer</span>
          <h1>{formatDateLong(date)}</h1>
          <p className="lede">Scrub the clock to inspect the Sun at any moment; change the date to compare seasons. All positions are calculated for {loc!.name}.</p>
        </div>
      </div>

      <Card className="flat">
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn icon" aria-label="Previous day" onClick={() => setDate(addDaysYMD(date, -1))}><Icon name="chevron" style={{ transform: 'rotate(180deg)' }} /></button>
          <input
            className="input"
            type="date"
            aria-label="Date"
            value={formatYMD(date)}
            onChange={(e) => { const d = parseYMD(e.target.value); if (d) setDate(d); }}
            style={{ maxWidth: 190 }}
          />
          <button type="button" className="btn icon" aria-label="Next day" onClick={() => setDate(addDaysYMD(date, 1))}><Icon name="chevron" /></button>
          <div className="row" style={{ gap: 6 }}>
            {presets.map((p) => (
              <button key={p.label} type="button" className="btn sm" aria-pressed={formatYMD(p.d) === formatYMD(date)} onClick={() => setDate(p.d)}>{p.label}</button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <Card eyebrow="Interactive" title="Solar clock" actions={<Badge kind="calculated" />}>
          <SolarClock day={day} lat={lat} lon={lon} now={now} selected={selected} onSelect={(t) => setSelMin(Math.round(localMinutes(t, tz)))} hourly={hourly} hour12={h12} />
          <Legend items={[...CLOCK_LEGEND, ...(hourly ? [{ label: 'Inner ring: UV forecast', color: '#d9b43a' }] : [])]} />
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn sm" onClick={() => { setDate(solar!.todayYMD); setSelMin(Math.round(localMinutes(now, tz))); }}>Jump to now</button>
            {day.solarNoon != null && <button type="button" className="btn sm" onClick={() => setSelMin(Math.round(localMinutes(day.solarNoon!, tz)))}>Solar noon</button>}
            {day.sunrise != null && <button type="button" className="btn sm" onClick={() => setSelMin(Math.round(localMinutes(day.sunrise!, tz)))}>Sunrise</button>}
          </div>
        </Card>

        <Card eyebrow={`At ${formatMinutesOfDay(selMin, h12)}`} title="Sun position">
          <div className="stats">
            <Stat label="Elevation" value={`${pos.elevation.toFixed(2)}°`} kind="calculated" foot="geometric" />
            <Stat label="Apparent elev." value={`${pos.apparentElevation.toFixed(2)}°`} kind="calculated" foot={`+${(refractionCorrection(pos.elevation) * 60).toFixed(1)}′ refraction`} />
            <Stat label="Azimuth" value={`${pos.azimuth.toFixed(1)}°`} kind="calculated" foot={compassPoint(pos.azimuth)} />
            <Stat label="Zenith angle" value={`${pos.zenith.toFixed(1)}°`} kind="calculated" />
            <Stat label="Air mass" value={am != null ? am.toFixed(2) : null} kind="calculated" foot={am != null ? 'path length vs overhead' : 'Sun below horizon'} />
            <Stat label="Top-of-atmosphere" value={Math.round(toa)} unit="W/m²" kind="calculated" foot="before the atmosphere" />
          </div>
          <div className="stats" style={{ marginTop: 12 }}>
            <Stat label="UV index" value={uvSel != null ? uvSel.toFixed(1) : null} kind="forecast" foot={uvSel != null ? uvBand(uvSel).label : inForecast ? 'not in data' : 'outside forecast range'} />
            <Stat label="Cloud cover" value={cloudSel != null ? Math.round(cloudSel) : null} unit="%" kind="forecast" />
            <Stat label="Temperature" value={temp(tempSel, settings.temperatureUnit)} unit={tempUnit(settings.temperatureUnit)} kind="forecast" />
            <Stat label="Solar irradiance" value={ghiSel != null ? Math.round(ghiSel) : null} unit="W/m²" kind="forecast" foot="model GHI, hourly mean" />
          </div>
          <p className="xs faint" style={{ marginTop: 10, marginBottom: 0 }}>
            Weather values appear only for times inside the provider’s forecast window (yesterday to +3 days). Outside it they are unavailable, not guessed.
          </p>
        </Card>
      </div>

      <Card eyebrow="Sun path" title="Elevation through the day" actions={<Badge kind="calculated" />}>
        <TimeChart
          ariaLabel="Solar elevation through the selected day, with the solstices for comparison"
          series={[
            { id: 'dec', label: 'Dec solstice', color: '#7fb2e5', times: curves.dec.times, values: curves.dec.vals, type: 'dashed', format: (v) => `${v.toFixed(1)}°` },
            { id: 'jun', label: 'Jun solstice', color: '#e39a74', times: curves.jun.times, values: curves.jun.vals, type: 'dashed', format: (v) => `${v.toFixed(1)}°` },
            { id: 'sel', label: 'Selected day', color: '#f2c86e', times: curves.sel.times, values: curves.sel.vals, type: 'area', format: (v) => `${v.toFixed(1)}°` },
          ]}
          start={day.dayStart}
          end={day.dayStart + 86400000}
          yMin={-30}
          yMax={90}
          yTicks={[-18, -6, 0, 30, 60, 90]}
          bands={[{ y0: -18, y1: -12, color: '#283f80' }, { y0: -12, y1: -6, color: '#6c6fae' }, { y0: -6, y1: 0, color: '#e0a43a' }]}
          now={isToday ? now : undefined}
          formatX={(t) => formatMinutesOfDay((t - day.dayStart) / 60000, h12)}
          height={220}
        />
        <Legend items={[{ label: 'Selected day', color: '#f2c86e' }, { label: 'June solstice', color: '#e39a74' }, { label: 'December solstice', color: '#7fb2e5' }, { label: 'Twilight bands (−18°, −12°, −6°, 0°)', color: '#6c6fae' }]} />
      </Card>

      <div className="grid-2">
        <Card eyebrow="Astronomical events" title={day.status === 'polar-day' ? 'Midnight sun — no sunset' : day.status === 'polar-night' ? 'Polar night — no sunrise' : `${formatDuration(day.daylightMs)} of daylight`}>
          <ul className="event-list">
            {Object.keys(EVENT_LABELS).map((k) => {
              const ev = dayEvents(day).find((e) => e.key === k);
              return (
                <li key={k}>
                  <span>{EVENT_LABELS[k]}</span>
                  <span className="t">{ev ? formatClock(ev.t, tz, h12) : <span className="faint">does not occur</span>}</span>
                </li>
              );
            })}
          </ul>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Noon elevation</dt><dd>{day.noonElevation != null ? `${day.noonElevation.toFixed(1)}°` : '—'}</dd>
            <dt>Civil light (Sun &gt; −6°)</dt><dd>{formatDuration(day.civilLightMs)}</dd>
            {!isToday && <><dt>vs today</dt><dd>{diffDaylight >= 0 ? '+' : '−'}{formatDuration(Math.abs(diffDaylight))} daylight</dd></>}
            <dt>Clock vs Sun</dt>
            <dd>{clockAhead != null ? `Solar noon at ${formatMinutesOfDay(noonClock!, h12)} — clock ${clockAhead >= 0 ? 'ahead of' : 'behind'} the Sun by ${Math.abs(Math.round(clockAhead))} min` : '—'}</dd>
            <dt>Zone offset</dt><dd>UTC{offset >= 0 ? '+' : '−'}{Math.abs(offset / 60)}</dd>
          </dl>
          {day.civilTwilightAllNight && <p className="small muted" style={{ marginTop: 10 }}>White night: the Sun never sinks more than 6° below the horizon, so civil twilight lasts all night.</p>}
        </Card>

        <Card eyebrow={`Seasons · ${year}`} title="Daylight through the year" actions={<Badge kind="calculated" />}>
          <TimeChart
            ariaLabel={`Hours of daylight for each day of ${year}`}
            series={[{ id: 'dl', label: 'Daylight', color: '#f2c86e', times: season.times, values: season.daylight, type: 'area', format: (v) => `${v.toFixed(2)} h` }]}
            start={season.times[0]}
            end={season.times[season.times.length - 1]}
            yMin={0}
            yMax={24}
            yTicks={[0, 6, 12, 18, 24]}
            markers={[{ t: Date.UTC(date.year, date.month - 1, date.day), label: 'selected', color: 'var(--accent)' }]}
            formatX={monthFmt}
            height={180}
          />
          <TimeChart
            ariaLabel={`Sunrise and sunset clock times through ${year}`}
            series={[
              { id: 'rise', label: 'Sunrise', color: '#e39a74', times: season.times, values: season.rise, format: (v) => formatMinutesOfDay(v * 60, h12) },
              { id: 'set', label: 'Sunset', color: '#7fb2e5', times: season.times, values: season.set, format: (v) => formatMinutesOfDay(v * 60, h12) },
            ]}
            start={season.times[0]}
            end={season.times[season.times.length - 1]}
            yMin={0}
            yMax={24}
            yTicks={[0, 6, 12, 18, 24]}
            formatX={monthFmt}
            height={170}
          />
          <Legend items={[{ label: 'Sunrise (local clock)', color: '#e39a74' }, { label: 'Sunset', color: '#7fb2e5' }]} />
          <p className="xs faint" style={{ marginBottom: 0 }}>Steps in the sunrise/sunset lines are daylight-saving clock changes, not changes in the Sun.</p>
        </Card>
      </div>

      <Card eyebrow="Understanding the sky" title="Definitions">
        <Disclosure summary="Sunrise and sunset">
          Calculated when the Sun’s upper edge touches a flat, sea-level horizon: centre 0.833° below the geometric horizon (34′ average refraction + 16′ solar radius). Mountains, buildings or a sea horizon below you, plus unusual temperature layers in the air, can shift the sunrise you actually see by several minutes. {settings.horizonHeightM > 0 && `Your horizon-dip setting (${settings.horizonHeightM} m above a flat horizon) is applied.`}
        </Disclosure>
        <Disclosure summary="Civil, nautical and astronomical twilight">
          Twilight is the period when the Sun is below the horizon but still lights the sky. Civil: Sun 0–6° below (bright enough for most outdoor activity). Nautical: 6–12° (horizon still visible at sea). Astronomical: 12–18° (the sky is dark enough for most astronomy below 18°).
        </Disclosure>
        <Disclosure summary="Solar time vs clock time">
          Clock time follows a time-zone meridian and daylight-saving rules; solar time follows the Sun. Their difference comes from your longitude relative to the zone’s meridian plus the equation of time (up to ±16 min over the year, from Earth’s tilted, elliptical orbit). At your location today, solar noon is at {noonClock != null ? formatMinutesOfDay(noonClock, h12) : '—'}.
        </Disclosure>
        <Disclosure summary="How accurate are these numbers?">
          The NOAA algorithm used here is accurate to about a minute for rise/set times at mid-latitudes; this app’s implementation is tested against an independent ephemeris (astronomy-engine) to within 2 minutes worldwide, including polar day and night and daylight-saving changes. Near the poles, where the Sun skims the horizon, small errors can shift events more.
        </Disclosure>
      </Card>
    </div>
  );
}
