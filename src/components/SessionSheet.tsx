import { useState } from 'react';
import { Notice, ScalePicker, Segmented, Sheet, toast } from './ui';
import { useApp } from '../state/app';
import {
  deleteSession, newId, upsertSession, type AfterFeel, type Clothing, type OutdoorSession, type Shade, type Sunscreen,
} from '../state/journal';
import { zonedParts, zonedTimeToUtc } from '../lib/time/tz';
import { ambientDose } from '../lib/uv';
import { interpolate, nearest } from '../lib/data/series';
import { describeWeather } from '../lib/data/wmo';

export function toLocalInput(t: number, tz: string): string {
  const p = zonedParts(t, tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

export function fromLocalInput(v: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz);
}

export function SessionSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Partial<OutdoorSession> | null }) {
  if (!open || !initial) return null;
  return <SessionForm onClose={onClose} initial={initial} />;
}

function SessionForm({ onClose, initial }: { onClose: () => void; initial: Partial<OutdoorSession> }) {
  const { solar, snap, loc } = useApp();
  const tz = initial.timezone ?? solar?.tz ?? 'UTC';
  const now = Date.now();
  const [status, setStatus] = useState<'planned' | 'done'>(initial.status ?? 'done');
  const [start, setStart] = useState(toLocalInput(initial.start ?? now - 30 * 60000, tz));
  const [end, setEnd] = useState(toLocalInput(initial.end ?? now, tz));
  const [shade, setShade] = useState<Shade | null>(initial.shade ?? null);
  const [clothing, setClothing] = useState<Clothing | null>(initial.clothing ?? null);
  const [sunscreen, setSunscreen] = useState<Sunscreen | null>(initial.sunscreen ?? null);
  const [energy, setEnergy] = useState<number | null>(initial.energy ?? null);
  const [alertness, setAlertness] = useState<number | null>(initial.alertness ?? null);
  const [comfort, setComfort] = useState<number | null>(initial.comfort ?? null);
  const [afterFeel, setAfterFeel] = useState<AfterFeel | null>(initial.afterFeel ?? null);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const s = fromLocalInput(start, tz), e = fromLocalInput(end, tz);
    if (s == null || e == null) return setError('Please enter a valid start and end time.');
    if (e <= s) return setError('The end time must be after the start time.');
    if (e - s > 16 * 3600000) return setError('Sessions longer than 16 hours are not supported — split them up.');
    const h = snap?.hourly;
    const sameLoc = loc && snap && Math.abs(snap.latitude - loc.latitude) < 0.2 && Math.abs(snap.longitude - loc.longitude) < 0.2;
    const dose = h && sameLoc ? ambientDose(h.time, h.uvIndex, s, e) : null;
    const mid = (s + e) / 2;
    const code = h && sameLoc ? nearest(h.time, h.weatherCode, mid, 2 * 3600000) : null;
    const session: OutdoorSession = {
      id: initial.id ?? newId('s'),
      status,
      start: s,
      end: e,
      locationName: initial.locationName ?? loc?.name ?? '',
      latitude: initial.latitude ?? loc?.latitude ?? null,
      longitude: initial.longitude ?? loc?.longitude ?? null,
      timezone: tz,
      weather: code != null ? describeWeather(code) : initial.weather ?? null,
      cloudCover: h && sameLoc ? interpolate(h.time, h.cloudCover, mid) : initial.cloudCover ?? null,
      temperature: h && sameLoc ? interpolate(h.time, h.temperature, mid) : initial.temperature ?? null,
      uvPeak: dose?.peakUvi ?? initial.uvPeak ?? null,
      uvMean: dose?.meanUvi ?? initial.uvMean ?? null,
      ambientSed: dose?.sed ?? initial.ambientSed ?? null,
      uvCoverage: dose?.coverage ?? initial.uvCoverage ?? 0,
      shade,
      clothing,
      sunscreen,
      energy,
      alertness,
      comfort,
      afterFeel,
      notes,
      createdAt: initial.createdAt ?? Date.now(),
    };
    upsertSession(session);
    toast(status === 'planned' ? 'Session planned' : 'Session logged');
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={initial.id ? 'Edit outdoor session' : status === 'planned' ? 'Plan an outdoor session' : 'Log an outdoor session'}>
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Segmented label="Session status" value={status} onChange={setStatus} options={[{ value: 'done', label: 'Done' }, { value: 'planned', label: 'Planned' }]} />
        <div className="form-grid">
          <label className="field"><span>Start</span><input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field"><span>End</span><input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        <p className="xs faint" style={{ margin: 0 }}>Times are in the location’s time zone ({tz}).</p>
        <div className="field"><span>Shade</span>
          <Segmented<Shade | 'unset'> label="Shade" value={shade ?? 'unset'} onChange={(v) => setShade(v === 'unset' ? null : v)} options={[{ value: 'unset', label: '—' }, { value: 'none', label: 'Full sun' }, { value: 'partial', label: 'Partial' }, { value: 'mostly', label: 'Mostly shade' }]} />
        </div>
        <div className="field"><span>Clothing coverage</span>
          <Segmented<Clothing | 'unset'> label="Clothing" value={clothing ?? 'unset'} onChange={(v) => setClothing(v === 'unset' ? null : v)} options={[{ value: 'unset', label: '—' }, { value: 'light', label: 'Light' }, { value: 'partial', label: 'Partial' }, { value: 'full', label: 'Covered' }]} />
        </div>
        <div className="field"><span>Sunscreen</span>
          <Segmented<Sunscreen | 'unset'> label="Sunscreen" value={sunscreen ?? 'unset'} onChange={(v) => setSunscreen(v === 'unset' ? null : v)} options={[{ value: 'unset', label: '—' }, { value: 'none', label: 'None' }, { value: 'applied', label: 'Applied' }, { value: 'reapplied', label: 'Reapplied' }, { value: 'not-needed', label: 'Not needed' }]} />
        </div>
        {status === 'done' && (
          <>
            <div className="form-grid">
              <ScalePicker label="Energy" value={energy} onChange={setEnergy} low="low" high="high" />
              <ScalePicker label="Alertness" value={alertness} onChange={setAlertness} low="low" high="high" />
            </div>
            <ScalePicker label="Comfort while outside" value={comfort} onChange={setComfort} low="uncomfortable" high="very comfortable" />
            <div className="field"><span>Afterwards, compared with before</span>
              <Segmented<AfterFeel | 'unset'> label="How you felt afterwards" value={afterFeel ?? 'unset'} onChange={(v) => setAfterFeel(v === 'unset' ? null : v)} options={[{ value: 'unset', label: '—' }, { value: 'better', label: 'Better' }, { value: 'same', label: 'No change' }, { value: 'worse', label: 'Worse' }]} />
            </div>
            <p className="xs faint" style={{ margin: 0 }}>These are subjective observations — useful for spotting your own patterns, not physiological measurements.</p>
          </>
        )}
        <label className="field"><span>Notes</span><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where, what you did, how it felt" /></label>
        <p className="xs faint" style={{ margin: 0 }}>UV, cloud and temperature are filled in from the forecast when the session falls inside it (ambient values, not your skin’s dose).</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button type="submit" className="btn primary">{initial.id ? 'Save changes' : 'Save'}</button>
          {initial.id && (
            <button type="button" className="btn danger" onClick={() => { deleteSession(initial.id!); toast('Session deleted'); onClose(); }}>Delete</button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}
