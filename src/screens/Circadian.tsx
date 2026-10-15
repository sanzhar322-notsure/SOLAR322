import { useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { solarDay } from '../state/solar';
import { updateSettings } from '../state/settings';
import { recordDecision, useJournal } from '../state/journal';
import { SleepTimeline } from '../components/SleepTimeline';
import { Card, Disclosure, Notice, Sheet, Stat, Switch, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { recommend, type Recommendation, type ScheduleAction } from '../lib/recommend';
import { plannedOpportunity, summarize, toClock, parseClock } from '../lib/sleep';
import { addDaysYMD, formatClock, formatDuration, formatMinutesOfDay, formatYMD, localMinutes } from '../lib/time/tz';
import { WINDOW_LABEL, nextOpportunity, planWindows } from '../lib/planner';
import { buildIcs, download } from '../lib/exporters';
import { href } from '../router';

const CONF_LABEL = { low: 'Low confidence', moderate: 'Moderate confidence', higher: 'Higher confidence' } as const;

export default function Circadian() {
  const { settings, solar, loc, snap, now } = useApp();
  const journal = useJournal();
  const [editing, setEditing] = useState<ScheduleAction | null>(null);
  const [editFrom, setEditFrom] = useState<string | null>(null);
  const h12 = settings.hour12;
  const tz = solar?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayStr = solar ? formatYMD(solar.todayYMD) : new Date().toISOString().slice(0, 10);
  const need = settings.sleep.sleepNeedHours;
  const wk = summarize(journal.entries, todayStr, 7, need);
  const two = summarize(journal.entries, todayStr, 14, need);
  const opp = plannedOpportunity(settings.sleep.targetBedtime, settings.sleep.targetWake);
  const windStart = toClock((parseClock(settings.sleep.targetBedtime) ?? 1380) - settings.sleep.windDownMinutes);

  const dates = useMemo(() => {
    const base = solar?.todayYMD ?? { year: 2026, month: 1, day: 1 };
    return Array.from({ length: 14 }, (_, i) => formatYMD(addDaysYMD(base, i - 13)));
  }, [solar?.todayYMD]);

  const in30 = solar && loc ? solarDay(addDaysYMD(solar.todayYMD, 30), loc.latitude, loc.longitude, tz) : null;
  const windows = solar && loc ? planWindows(solar.today, snap?.hourly ?? null, loc.latitude, loc.longitude) : [];
  const nextWin = nextOpportunity(windows, now);
  // Morning daylight after the target wake time.
  const wakeMin = parseClock(settings.sleep.targetWake) ?? 420;
  const morningWin = solar ? windows.find((w) => localMinutes(w.end, tz) > wakeMin && localMinutes(w.start, tz) < 12 * 60) : null;

  const recs = recommend({
    entries: journal.entries,
    sessions: journal.sessions,
    decisions: journal.decisions,
    settings: settings.sleep,
    today: todayStr,
    now,
    sunriseMin: solar?.today.sunrise != null ? localMinutes(solar.today.sunrise, tz) : null,
    sunriseIn30Min: in30?.sunrise != null ? localMinutes(in30.sunrise, tz) : null,
    daylightTodayMin: solar ? solar.today.daylightMs / 60000 : null,
    daylightIn30Min: in30 ? in30.daylightMs / 60000 : null,
    nextWindowText: nextWin ? `${formatClock(nextWin.start, tz, h12)}–${formatClock(nextWin.end, tz, h12)} (${WINDOW_LABEL[nextWin.kind]})` : null,
  });

  const accept = (r: Recommendation) => {
    if (!r.action) return;
    updateSettings((s) => ({ ...s, sleep: { ...s.sleep, ...r.action } }));
    recordDecision({ ruleId: r.id, decision: 'accepted', at: Date.now(), detail: `${r.action.targetBedtime} → ${r.action.targetWake}` });
    toast('Schedule updated');
  };
  const dismiss = (r: Recommendation) => {
    recordDecision({ ruleId: r.id, decision: 'dismissed', at: Date.now(), detail: '' });
    toast('Hidden for 7 days');
  };

  const exportReminders = () => {
    const tzName = solar?.tz ?? tz;
    const items = [];
    if (settings.reminders.windDown) items.push({ uid: 'wind-down', title: 'Wind-down: dim lights & screens', description: `Tengri Solar: begin your ${settings.sleep.windDownMinutes}-minute wind-down before ${settings.sleep.targetBedtime}. Lower room lighting, enable Night Shift / Reduce White Point.`, time: windStart, durationMin: settings.sleep.windDownMinutes, timezone: tzName });
    if (settings.reminders.morningLight) items.push({ uid: 'morning-light', title: 'Morning daylight', description: 'Tengri Solar: step outside for daylight if it is light and the weather allows. Do not look at the Sun. Check the UV index in the app.', time: toClock(wakeMin + 15), durationMin: 20, timezone: tzName });
    if (!items.length) return toast('Enable at least one reminder first');
    download('tengri-solar-reminders.ics', buildIcs(items, todayStr), 'text/calendar');
    toast('Calendar file created — open it to add the reminders');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Circadian Studio</span>
          <h1>Your rhythm, planned and actual</h1>
          <p className="lede">A consistent schedule with enough sleep comes first; daylight timing supports it. Nothing here changes your schedule unless you accept it.</p>
        </div>
        <button type="button" className="btn" onClick={() => { setEditing({ targetBedtime: settings.sleep.targetBedtime, targetWake: settings.sleep.targetWake }); setEditFrom(null); }}>
          <Icon name="edit" /> Edit schedule
        </button>
      </div>

      <div className="stats wide">
        <Stat label="Target bedtime" value={settings.sleep.targetBedtime} kind="user" />
        <Stat label="Target wake" value={settings.sleep.targetWake} kind="user" />
        <Stat label="Planned time in bed" value={formatDuration(opp * 60000)} foot={opp < need * 60 ? `below your ${need} h need` : `need set: ${need} h`} />
        <Stat label="Wind-down from" value={windStart} foot={`${settings.sleep.windDownMinutes} min`} />
      </div>

      <div className="grid-2">
        <Card eyebrow="Last 14 nights" title="Planned vs actual" actions={<a className="btn sm" href={href('journal', { log: 'today' })}><Icon name="plus" /> Log</a>}>
          {journal.entries.length === 0 ? (
            <p className="muted small">No nights logged yet. Each morning, log when you slept and woke — the timeline will compare it with your plan (green band).</p>
          ) : (
            <SleepTimeline entries={journal.entries} dates={dates} targetBed={settings.sleep.targetBedtime} targetWake={settings.sleep.targetWake} hour12={h12} />
          )}
          <div className="legend">
            <span><i style={{ background: '#5aa4e6' }} />Asleep (estimated onset → wake)</span>
            <span><i style={{ background: 'var(--text-3)' }} />In bed, not yet asleep</span>
            <span><i style={{ background: 'var(--c-user)', opacity: 0.4 }} />Planned window</span>
          </div>
        </Card>

        <Card eyebrow="Consistency" title="Recent routine">
          <div className="stats">
            <Stat label="Avg sleep (7 d)" value={wk.avgSleepMin != null ? (wk.avgSleepMin / 60).toFixed(1) : null} unit="h" kind="user" foot={`${wk.nights} night${wk.nights === 1 ? '' : 's'}`} />
            <Stat label="Short nights (7 d)" value={wk.nights ? wk.shortNights : null} foot={`< ${Math.max(need - 1, 7)} h`} />
            <Stat label="Timing variability" value={two.midpointSd != null ? `±${Math.round(two.midpointSd)}` : null} unit="min" foot="SD of sleep midpoint, 14 d" />
            <Stat label="Avg sleep onset" value={two.avgOnset != null ? formatMinutesOfDay(two.avgOnset, h12) : null} />
            <Stat label="Avg wake" value={two.avgWake != null ? formatMinutesOfDay(two.avgWake, h12) : null} />
            <Stat label="Avg quality" value={two.avgQuality != null ? two.avgQuality.toFixed(1) : null} unit="/ 5" />
          </div>
          <p className="xs faint" style={{ marginTop: 10, marginBottom: 0 }}>Adults generally need about 7–9 hours (AASM/SRS consensus); individual needs vary. This is self-reported data, not a sleep study, and the app does not diagnose sleep disorders. If you regularly struggle with sleep or daytime sleepiness, talk to a clinician.</p>
        </Card>
      </div>

      <Card eyebrow="Explainable suggestions" title="What your data suggests">
        {recs.length === 0 ? (
          <p className="muted">Nothing to suggest right now. Your logged routine looks consistent with your plan.</p>
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {recs.map((r) => (
              <article key={r.id} className="rec">
                <div className="row between">
                  <h3>{r.title}</h3>
                  <span className={`level ${r.confidence === 'higher' ? 'supported' : r.confidence === 'moderate' ? 'preliminary' : 'insufficient'}`}>{CONF_LABEL[r.confidence]}</span>
                </div>
                <dl>
                  <dt>Observed</dt><dd>{r.observed}</dd>
                  <dt>Suggestion</dt><dd>{r.suggestion}</dd>
                  <dt>Why</dt><dd>{r.rationale}</dd>
                  <dt>Confidence</dt><dd>{r.confidenceWhy}</dd>
                  <dt>Test next</dt><dd>{r.testNext}</dd>
                </dl>
                <div className="row">
                  {r.action && (
                    <>
                      <button type="button" className="btn sm primary" onClick={() => accept(r)}><Icon name="check" /> Accept ({r.action.targetBedtime} → {r.action.targetWake})</button>
                      <button type="button" className="btn sm" onClick={() => { setEditing(r.action!); setEditFrom(r.id); }}><Icon name="edit" /> Modify</button>
                    </>
                  )}
                  {r.id !== 'need-data' && <button type="button" className="btn sm ghost" onClick={() => dismiss(r)}>Dismiss</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card eyebrow="Daylight" title="Morning & daytime light">
          {solar ? (
            <dl className="kv">
              <dt>Sunrise today</dt><dd>{solar.today.sunrise ? formatClock(solar.today.sunrise, tz, h12) : '—'}</dd>
              <dt>Your target wake</dt><dd>{settings.sleep.targetWake}</dd>
              <dt>Morning window</dt><dd>{morningWin ? `${formatClock(morningWin.start, tz, h12)}–${formatClock(morningWin.end, tz, h12)}` : 'none today'}</dd>
              <dt>Next opportunity</dt><dd>{nextWin ? `${formatClock(nextWin.start, tz, h12)} · ${WINDOW_LABEL[nextWin.kind]}` : '—'}</dd>
            </dl>
          ) : <p className="muted small">Set a location to see daylight timing.</p>}
          <p className="small muted" style={{ marginTop: 12 }}>
            Daylight — especially in the morning and through the day — helps anchor the body clock and supports alertness. You don’t need sunrise exactly: outdoor light any time after waking counts, and it does not need direct sun or looking toward the Sun.
          </p>
          <a className="btn sm" href={href('planner')}>Open Exposure Planner <Icon name="chevron" /></a>
        </Card>

        <Card eyebrow="Reminders" title="Gentle prompts">
          <Switch label="Show reminders inside the app" hint="Banners on the home screen at wind-down and morning-light times" checked={settings.reminders.inApp} onChange={(v) => updateSettings((s) => ({ ...s, reminders: { ...s.reminders, inApp: v } }))} />
          <Switch label="Wind-down reminder" hint={`Daily at ${windStart}`} checked={settings.reminders.windDown} onChange={(v) => updateSettings((s) => ({ ...s, reminders: { ...s.reminders, windDown: v } }))} />
          <Switch label="Morning daylight reminder" hint={`Daily at ${toClock(wakeMin + 15)}`} checked={settings.reminders.morningLight} onChange={(v) => updateSettings((s) => ({ ...s, reminders: { ...s.reminders, morningLight: v } }))} />
          <button type="button" className="btn primary" style={{ marginTop: 10, width: '100%' }} onClick={exportReminders}><Icon name="calendar" /> Add reminders to Calendar (.ics)</button>
          <p className="xs faint" style={{ marginTop: 8, marginBottom: 0 }}>
            A web app cannot schedule notifications on iPhone while it is closed. The calendar file creates repeating events with alerts in the iOS Calendar app instead — you can edit or delete them there. Re-export after changing your schedule.
          </p>
        </Card>
      </div>

      <EveningLight windStart={windStart} />

      <ScheduleSheet
        value={editing}
        need={need}
        windDown={settings.sleep.windDownMinutes}
        onClose={() => setEditing(null)}
        onSave={(v, needH, wd) => {
          updateSettings((s) => ({ ...s, sleep: { ...s.sleep, ...v, sleepNeedHours: needH, windDownMinutes: wd } }));
          if (editFrom) recordDecision({ ruleId: editFrom, decision: 'modified', at: Date.now(), detail: `${v.targetBedtime} → ${v.targetWake}` });
          setEditing(null);
          toast('Schedule saved');
        }}
      />
    </div>
  );
}

function ScheduleSheet({ value, need, windDown, onClose, onSave }: {
  value: ScheduleAction | null; need: number; windDown: number; onClose: () => void; onSave: (v: ScheduleAction, need: number, windDown: number) => void;
}) {
  if (!value) return null;
  return <ScheduleForm value={value} need={need} windDown={windDown} onClose={onClose} onSave={onSave} />;
}

function ScheduleForm({ value, need, windDown, onClose, onSave }: {
  value: ScheduleAction; need: number; windDown: number; onClose: () => void; onSave: (v: ScheduleAction, need: number, windDown: number) => void;
}) {
  const [bed, setBed] = useState(value.targetBedtime);
  const [wake, setWake] = useState(value.targetWake);
  const [n, setN] = useState(String(need));
  const [wd, setWd] = useState(String(windDown));
  const opp = plannedOpportunity(bed, wake);
  const needNum = Number(n);
  return (
    <Sheet open onClose={onClose} title="Sleep schedule">
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); onSave({ targetBedtime: bed, targetWake: wake }, Math.min(11, Math.max(5, needNum || 8)), Math.min(180, Math.max(15, Number(wd) || 60))); }}>
        <div className="form-grid">
          <label className="field"><span>Target bedtime</span><input className="input" type="time" value={bed} onChange={(e) => setBed(e.target.value)} required /></label>
          <label className="field"><span>Target wake time</span><input className="input" type="time" value={wake} onChange={(e) => setWake(e.target.value)} required /></label>
          <label className="field"><span>Sleep need (hours)</span><input className="input" type="number" min={5} max={11} step={0.25} value={n} onChange={(e) => setN(e.target.value)} /><span className="hint">Most adults: about 7–9 h.</span></label>
          <label className="field"><span>Wind-down (minutes)</span><input className="input" type="number" min={15} max={180} step={5} value={wd} onChange={(e) => setWd(e.target.value)} /></label>
        </div>
        <p className="small">Time in bed: <b>{formatDuration(opp * 60000)}</b></p>
        {opp > 0 && opp < needNum * 60 && <Notice tone="warn">This plan gives less time in bed than your sleep need. Consider an earlier bedtime rather than a later wake time if mornings are fixed.</Notice>}
        {needNum < 7 && <Notice tone="warn">Under 7 hours is below the range recommended for most adults. The app will not encourage sleep restriction.</Notice>}
        <div className="row">
          <button type="submit" className="btn primary">Save schedule</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}

function EveningLight({ windStart }: { windStart: string }) {
  return (
    <Card eyebrow="Light management" title="Evening light, without the myths">
      <div className="grid-2">
        <div>
          <h3>Your evening plan</h3>
          <ol className="source-list">
            <li><b>From {windStart}:</b> switch overhead lights to lamps; dim and warm where you can.</li>
            <li>Lower screen brightness; turn on Night Shift and, late at night, Reduce White Point.</li>
            <li>Keep the bedroom dark; use a dim night-light only if needed for safety.</li>
            <li>If you wake at night, avoid bright lights and screens.</li>
            <li>In the day, get as much daylight as is practical — bright days help evenings matter less.</li>
          </ol>
          <Notice tone="info">This app cannot change your iPhone’s brightness, Night Shift or True Tone — iOS does not let web apps control system settings. The guide below shows where to set them yourself.</Notice>
        </div>
        <div>
          <h3>What actually matters</h3>
          <Disclosure summary="Intensity and timing matter most">
            The body clock responds to how much light reaches the eye, when, and for how long. Bright light in the late evening tends to delay the clock and suppress melatonin; the same light in the morning tends to advance it.
          </Disclosure>
          <Disclosure summary="Blue wavelengths vs “blue light”">
            Melanopsin cells (ipRGCs) are most sensitive around 480 nm (blue-cyan), so short-wavelength light has a stronger circadian effect per unit of light. But all bright light has some effect — warm-coloured light that is very bright still counts. Blue light is not inherently harmful in daytime; daylight is rich in it.
          </Disclosure>
          <Disclosure summary="Melanopic light (melanopic EDI)">
            Scientists quantify circadian-relevant light as “melanopic equivalent daylight illuminance” (CIE S 026). Consensus recommendations (Brown et al., 2022) suggest bright daytime light and low evening light; see the Knowledge Archive for details.
          </Disclosure>
          <Disclosure summary="Eyes vs skin">
            Circadian timing is driven by light entering the eyes. Light on the skin has other effects (vitamin D synthesis from UV-B, heating from infrared, sunburn), but does not replace light to the eyes for the body clock.
          </Disclosure>
          <Disclosure summary="Blue-blocking glasses">
            A 2023 Cochrane review found blue-light-filtering spectacle lenses probably make no difference to sleep quality (low-certainty, short studies). Dimming lights and screens is the simpler first step.
          </Disclosure>
        </div>
      </div>
      <h3 style={{ marginTop: 16 }}>iPhone & iPad settings guide</h3>
      <div className="table-scroll">
        <table className="data">
          <thead><tr><th>Setting</th><th>Where (iOS / iPadOS 17–18)</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td>Night Shift</td><td>Settings → Display &amp; Brightness → Night Shift → Scheduled</td><td>Warms screen colour in the evening. Brightness still matters more.</td></tr>
            <tr><td>Reduce White Point</td><td>Settings → Accessibility → Display &amp; Text Size → Reduce White Point</td><td>Dims the screen below the normal minimum; good for late evening.</td></tr>
            <tr><td>Accessibility Shortcut</td><td>Settings → Accessibility → Accessibility Shortcut → Reduce White Point</td><td>Triple-click the side button to toggle the extra dimming.</td></tr>
            <tr><td>Dark Mode</td><td>Settings → Display &amp; Brightness → Automatic</td><td>Darker interfaces at night.</td></tr>
            <tr><td>Sleep Focus & schedule</td><td>Health app → Browse → Sleep → Full Schedule &amp; Options</td><td>Silences notifications and dims the Lock Screen at bedtime.</td></tr>
            <tr><td>Screen Time downtime</td><td>Settings → Screen Time → Downtime</td><td>Limits apps late in the evening if you want a firm stop.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="xs faint" style={{ marginBottom: 0 }}>Menu names can differ slightly between iOS versions.</p>
      <p className="small" style={{ marginTop: 8, marginBottom: 0 }}><a href={href('archive', { q: 'light' })}>Evidence on light and sleep →</a></p>
    </Card>
  );
}
