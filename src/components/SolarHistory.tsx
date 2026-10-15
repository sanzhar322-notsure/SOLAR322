import { useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { solarDay } from '../state/solar';
import { updateProfile, useJournal, type DayPart, type OutdoorSession, type Pigmentation, type SolarProfile } from '../state/journal';
import { Badge, Card, Notice, Segmented, toast } from './ui';
import { BarChart } from './charts';
import { Icon } from './Icon';
import { localYMD, isValidTimeZone } from '../lib/time/tz';
import { patternNote, summarizeByWindow, weeklyMinutes, type DayResolver } from '../lib/history';
import { WINDOW_LABEL } from '../lib/planner';

const PIGMENT: { value: Pigmentation; label: string }[] = [
  { value: 'very-fair', label: 'Very fair' },
  { value: 'fair', label: 'Fair' },
  { value: 'medium', label: 'Medium' },
  { value: 'olive', label: 'Olive' },
  { value: 'brown', label: 'Brown' },
  { value: 'dark', label: 'Dark brown / black' },
];
const PARTS: { value: DayPart; label: string }[] = [
  { value: 'morning', label: 'Mornings' },
  { value: 'midday', label: 'Midday' },
  { value: 'afternoon', label: 'Afternoons' },
  { value: 'evening', label: 'Evenings' },
];

function ProfileForm({ profile }: { profile: SolarProfile }) {
  const [p, setP] = useState<SolarProfile>(profile);
  const set = <K extends keyof SolarProfile>(k: K, v: SolarProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); updateProfile(p); toast('Solar history saved'); }}>
      <label className="field">
        <span>General skin pigmentation (optional)</span>
        <select className="input" value={p.pigmentation ?? ''} onChange={(e) => set('pigmentation', (e.target.value || null) as Pigmentation | null)}>
          <option value="">Prefer not to say</option>
          {PIGMENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Typical time outside on an ordinary day (minutes)</span>
        <input className="input" type="number" inputMode="numeric" min={0} max={1440} value={p.typicalOutdoorMin ?? ''} onChange={(e) => set('typicalOutdoorMin', e.target.value === '' ? null : Math.max(0, Math.min(1440, Number(e.target.value))))} />
      </label>
      <div className="field">
        <span>When you’re usually outside</span>
        <div className="row">
          {PARTS.map((o) => (
            <button key={o.value} type="button" className="btn sm" aria-pressed={p.usualTimes.includes(o.value)}
              onClick={() => set('usualTimes', p.usualTimes.includes(o.value) ? p.usualTimes.filter((x) => x !== o.value) : [...p.usualTimes, o.value])}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field"><span>Previous outdoor habits</span><textarea className="input" value={p.habits} onChange={(e) => set('habits', e.target.value)} placeholder="e.g. office job, weekend hiking, more time outside in summer" /></label>
      <label className="field"><span>Notes</span><textarea className="input" value={p.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything you’ve noticed about how sun, heat or seasons affect you" /></label>
      <p className="xs faint" style={{ margin: 0 }}>Kept on this device as context for your own observations. The app does not derive a UV tolerance or “safe” threshold from pigmentation or past exposure — a tan or darker skin reduces, but doesn’t eliminate, UV effects.</p>
      <div><button type="submit" className="btn primary">Save</button></div>
    </form>
  );
}

export function SolarHistory() {
  const j = useJournal();
  const { loc, solar, settings, now } = useApp();
  const [view, setView] = useState<'summary' | 'profile'>(j.solarProfile.updatedAt ? 'summary' : 'profile');

  const resolve: DayResolver = useMemo(() => (s: OutdoorSession) => {
    const lat = s.latitude ?? loc?.latitude, lon = s.longitude ?? loc?.longitude;
    const tz = isValidTimeZone(s.timezone) ? s.timezone : solar?.tz;
    if (lat == null || lon == null || !tz) return null;
    return { day: solarDay(localYMD(s.start, tz), lat, lon, tz, settings.horizonHeightM), lat, lon };
  }, [loc, solar?.tz, settings.horizonHeightM]);

  const summary = useMemo(() => summarizeByWindow(j.sessions, resolve), [j.sessions, resolve]);
  const note = patternNote(summary);
  const weeks = weeklyMinutes(j.sessions, 12, now);
  const done = j.sessions.filter((s) => s.status === 'done').length;
  const fmt = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d));

  return (
    <>
      <Segmented label="Solar history view" value={view} onChange={setView} options={[{ value: 'summary', label: 'Observations' }, { value: 'profile', label: 'Your solar background' }]} />
      {view === 'profile' ? (
        <Card eyebrow="Solar History & Personal Observations" title="Your solar background"><ProfileForm profile={j.solarProfile} /></Card>
      ) : (
        <>
          {done === 0 && <Notice tone="info">Log outdoor sessions (Plan → Log, or Entries → Log outdoor session) with how you felt. Patterns appear here by solar window.</Notice>}
          <Card eyebrow="By solar window" title="How your outdoor time compares">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Window</th><th className="n">Sessions</th><th className="n">Minutes</th>
                    <th className="n">Energy</th><th className="n">Alertness</th><th className="n">Comfort</th><th className="n">Felt better</th>
                    <th className="n">Mean UV peak</th><th className="n">Ambient SED</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.filter((w) => w.kind !== 'night' || w.sessions > 0).map((w) => (
                    <tr key={w.kind}>
                      <td>{w.kind === 'night' ? 'After dark' : WINDOW_LABEL[w.kind]}</td>
                      <td className="n">{w.sessions}</td>
                      <td className="n">{Math.round(w.minutes)}</td>
                      <td className="n">{fmt(w.energy)}</td>
                      <td className="n">{fmt(w.alertness)}</td>
                      <td className="n">{fmt(w.comfort)}</td>
                      <td className="n">{w.betterShare == null ? '—' : `${Math.round(w.betterShare * 100)}% (${w.feelAnswers})`}</td>
                      <td className="n">{fmt(w.uvPeakMean)}</td>
                      <td className="n">{fmt(w.ambientSed, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <Badge kind="user">Subjective</Badge><span className="xs faint">energy, alertness, comfort, felt better (1–5 ratings and your own comparison)</span>
            </div>
            <div className="row" style={{ marginTop: 4 }}>
              <Badge kind="forecast">Environmental</Badge><span className="xs faint">UV peak and ambient dose from the forecast — what the sky offered, not what your skin received</span>
            </div>
            {note && <p className="small" style={{ marginTop: 12, marginBottom: 0 }}><Icon name="info" style={{ width: 16, height: 16, verticalAlign: '-3px', marginRight: 6 }} />{note}</p>}
          </Card>
          <Card eyebrow="Last 12 weeks" title="Outdoor minutes per week">
            <BarChart
              ariaLabel="Logged outdoor minutes per week"
              data={weeks.map((w) => ({ key: String(w.weekStart), label: new Date(w.weekStart).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }), value: w.minutes || null, tip: `Week of ${new Date(w.weekStart).toISOString().slice(0, 10)} · ambient ${w.sed.toFixed(1)} SED`, color: '#e0a43a' }))}
              yMax={Math.max(60, ...weeks.map((w) => w.minutes))}
              formatY={(v) => `${Math.round(v)}`}
              unit=" min"
            />
            {j.solarProfile.typicalOutdoorMin != null && <p className="xs faint" style={{ marginBottom: 0 }}>Your stated typical day: {j.solarProfile.typicalOutdoorMin} min outside (≈ {j.solarProfile.typicalOutdoorMin * 7} min/week).</p>}
          </Card>
        </>
      )}
    </>
  );
}
