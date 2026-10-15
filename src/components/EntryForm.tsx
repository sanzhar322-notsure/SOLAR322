import { useState } from 'react';
import { ScalePicker, Segmented, Sheet, Notice, toast } from './ui';
import { deleteEntry, emptyEntry, upsertEntry, useJournal, type DailyEntry, type ScreenUse } from '../state/journal';
import { sleepMetrics } from '../lib/sleep';
import { formatDuration } from '../lib/time/tz';

/** Fast morning log. Only the date is required. */
export function EntrySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  if (!date) return null;
  return <EntryForm date={date} onClose={onClose} />;
}

function numOrNull(v: string, max: number): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function EntryForm({ date: initialDate, onClose }: { date: string; onClose: () => void }) {
  const journal = useJournal();
  const existing = journal.entries.find((e) => e.date === initialDate);
  const [e, setE] = useState<DailyEntry>(existing ?? emptyEntry(initialDate));
  const [more, setMore] = useState(!!existing && (existing.lastCaffeine != null || existing.exerciseMin != null || existing.awakenings != null));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof DailyEntry>(k: K, v: DailyEntry[K]) => setE((x) => ({ ...x, [k]: v }));
  const m = sleepMetrics(e);
  const replacing = e.date !== initialDate && journal.entries.some((x) => x.date === e.date);

  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return setError('Choose a date.');
    if (e.sleepOnset && e.bedtime && m.latencyMin == null) return setError('Sleep onset looks more than 6 hours after bedtime — please check the times.');
    if (e.date !== initialDate && existing) deleteEntry(initialDate);
    upsertEntry(e);
    toast('Morning log saved');
    onClose();
  };

  const minutesField = (label: string, k: 'morningOutdoorMin' | 'daytimeOutdoorMin' | 'eveningOutdoorMin' | 'exerciseMin') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" inputMode="numeric" type="number" min={0} max={1440} placeholder="min" value={e[k] ?? ''} onChange={(ev) => set(k, numOrNull(ev.target.value, 1440))} />
    </label>
  );

  return (
    <Sheet open onClose={onClose} title={existing ? 'Edit morning log' : 'Morning log'}>
      <form className="stack" style={{ gap: 14 }} onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <label className="field">
          <span>Date you woke up</span>
          <input className="input" type="date" value={e.date} onChange={(ev) => set('date', ev.target.value)} required />
        </label>
        <div className="form-grid three">
          <label className="field"><span>Went to bed</span><input className="input" type="time" value={e.bedtime ?? ''} onChange={(ev) => set('bedtime', ev.target.value || null)} /></label>
          <label className="field"><span>Fell asleep (est.)</span><input className="input" type="time" value={e.sleepOnset ?? ''} onChange={(ev) => set('sleepOnset', ev.target.value || null)} /></label>
          <label className="field"><span>Woke up</span><input className="input" type="time" value={e.wakeTime ?? ''} onChange={(ev) => set('wakeTime', ev.target.value || null)} /></label>
        </div>
        {m.sleepMin != null && (
          <p className="small" style={{ margin: 0 }}>
            Sleep ≈ <b>{formatDuration(m.sleepMin * 60000)}</b>{m.latencyMin != null ? ` · ${m.latencyMin} min to fall asleep` : ''}{m.inBedMin != null ? ` · ${formatDuration(m.inBedMin * 60000)} in bed` : ''}
          </p>
        )}
        <ScalePicker label="Sleep quality" value={e.sleepQuality} onChange={(v) => set('sleepQuality', v)} low="poor" high="excellent" />
        <div className="form-grid">
          <ScalePicker label="Energy today" value={e.energy} onChange={(v) => set('energy', v)} low="drained" high="vibrant" />
          <ScalePicker label="Daytime sleepiness" value={e.sleepiness} onChange={(v) => set('sleepiness', v)} low="alert" high="very sleepy" />
        </div>
        <div className="field">
          <span>Screens in the hour before bed (last night)</span>
          <Segmented<ScreenUse | 'unset'>
            label="Late screen use"
            value={e.lateScreen ?? 'unset'}
            onChange={(v) => set('lateScreen', v === 'unset' ? null : v)}
            options={[{ value: 'unset', label: '—' }, { value: 'none', label: 'None' }, { value: 'brief', label: 'Brief' }, { value: 'moderate', label: 'Moderate' }, { value: 'heavy', label: 'Heavy' }]}
          />
        </div>
        <div className="form-grid three">
          {minutesField('Morning outdoors', 'morningOutdoorMin')}
          {minutesField('Daytime outdoors', 'daytimeOutdoorMin')}
          {minutesField('Evening outdoors', 'eveningOutdoorMin')}
        </div>
        <p className="xs faint" style={{ margin: 0 }}>Outdoor minutes can be filled in later the same day. Logged sessions in the Planner are also counted.</p>
        {!more ? (
          <button type="button" className="btn ghost sm" onClick={() => setMore(true)}>+ Caffeine, exercise, awakenings</button>
        ) : (
          <div className="form-grid three">
            <label className="field"><span>Last caffeine (yesterday)</span><input className="input" type="time" value={e.lastCaffeine ?? ''} onChange={(ev) => set('lastCaffeine', ev.target.value || null)} /></label>
            <label className="field"><span>Exercise time</span><input className="input" type="time" value={e.exerciseTime ?? ''} onChange={(ev) => set('exerciseTime', ev.target.value || null)} /></label>
            {minutesField('Exercise duration', 'exerciseMin')}
            <label className="field"><span>Night awakenings</span><input className="input" type="number" inputMode="numeric" min={0} max={30} value={e.awakenings ?? ''} onChange={(ev) => set('awakenings', numOrNull(ev.target.value, 30))} /></label>
          </div>
        )}
        <label className="field"><span>Observations</span><textarea className="input" value={e.notes} onChange={(ev) => set('notes', ev.target.value)} placeholder="Anything notable: dreams, stress, travel, illness, weather…" /></label>
        {replacing && <Notice tone="warn">An entry already exists for {e.date}; saving will replace it.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button type="submit" className="btn primary">Save</button>
          {existing && <button type="button" className="btn danger" onClick={() => { deleteEntry(initialDate); toast('Entry deleted'); onClose(); }}>Delete</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}
