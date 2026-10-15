import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/app';
import {
  deleteExperiment, lastJournalWrite, newId, replaceJournal, upsertExperiment, useJournal, type Experiment, type OutcomeKey,
} from '../state/journal';
import { settingsStore } from '../state/settings';
import { EntrySheet } from '../components/EntryForm';
import { SessionSheet } from '../components/SessionSheet';
import { BarChart, ScatterChart, TimeChart, Legend } from '../components/charts';
import { Badge, Card, Empty, Notice, Segmented, Sheet, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { addDaysYMD, formatClock, formatDuration, formatMinutesOfDay, formatYMD, parseYMD } from '../lib/time/tz';
import { sleepMetrics } from '../lib/sleep';
import {
  CORRELATION_CAVEAT, OUTCOME_LABEL, VARS, analyzeExperiment, buildRows, pairVariables, varDef, type VarKey,
} from '../lib/stats';
import { download, entriesCsv, makeBackup, parseBackup, sessionsCsv } from '../lib/exporters';
import { navigate } from '../router';
import type { OutdoorSession } from '../state/journal';
import { SolarHistory } from '../components/SolarHistory';

type Tab = 'log' | 'history' | 'trends' | 'explore' | 'experiments' | 'export';

export default function Journal({ params }: { params: URLSearchParams }) {
  const { solar } = useApp();
  const today = solar ? formatYMD(solar.todayYMD) : new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'log');
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (params.get('log') === 'today' && !opened.current) {
      opened.current = true;
      setEntryDate(today);
      navigate('journal');
    }
  }, [params, today]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Solar Journal</span>
          <h1>Learn from your own days</h1>
          <p className="lede">Your entries stay on this device. Patterns here are associations in your data — useful for experiments, not proof of cause.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEntryDate(today)}><Icon name="plus" /> Log this morning</button>
      </div>
      <Segmented<Tab>
        label="Journal section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'log', label: 'Entries' },
          { value: 'history', label: 'Solar history' },
          { value: 'trends', label: 'Trends' },
          { value: 'explore', label: 'Relationships' },
          { value: 'experiments', label: 'Experiments' },
          { value: 'export', label: 'Export' },
        ]}
      />
      {tab === 'log' && <Entries onEdit={setEntryDate} />}
      {tab === 'trends' && <Trends today={today} />}
      {tab === 'explore' && <Explore />}
      {tab === 'experiments' && <Experiments today={today} />}
      {tab === 'export' && <ExportPanel />}
      {tab === 'history' && <SolarHistory />}
      <EntrySheet date={entryDate} onClose={() => setEntryDate(null)} />
    </div>
  );
}

function Entries({ onEdit }: { onEdit: (d: string) => void }) {
  const j = useJournal();
  const { settings, solar } = useApp();
  const [session, setSession] = useState<Partial<OutdoorSession> | null>(null);
  const write = lastJournalWrite();
  const days = useMemo(() => {
    const set = new Set<string>(j.entries.map((e) => e.date));
    const sessByDate = new Map<string, OutdoorSession[]>();
    for (const s of j.sessions) {
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone ?? undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.start));
      set.add(d);
      sessByDate.set(d, [...(sessByDate.get(d) ?? []), s]);
    }
    return { dates: [...set].sort().reverse(), sessByDate };
  }, [j.entries, j.sessions]);

  if (!days.dates.length) {
    return (
      <Card>
        <Empty icon="journal" title="Your journal is empty" action={<button type="button" className="btn primary" onClick={() => onEdit(solar ? formatYMD(solar.todayYMD) : new Date().toISOString().slice(0, 10))}>Write the first entry</button>}>
          Each morning, note roughly when you slept and woke and how you feel. It takes under a minute, and every field is optional.
        </Empty>
      </Card>
    );
  }
  return (
    <>
      {!write.ok && <Notice tone="error">Your last change could not be saved to this device’s storage ({write.reason === 'quota' ? 'storage is full' : 'storage unavailable — private browsing?'}). Export a backup now.</Notice>}
      <div className="row">
        <button type="button" className="btn sm" onClick={() => setSession({ status: 'done', timezone: solar?.tz })}><Icon name="sun" /> Log outdoor session</button>
      </div>
      <Card>
        <ul className="list">
          {days.dates.slice(0, 120).map((d) => {
            const e = j.entries.find((x) => x.date === d);
            const m = e ? sleepMetrics(e) : null;
            const ss = days.sessByDate.get(d) ?? [];
            return (
              <li key={d}>
                <div className="row between">
                  <b>{new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b>
                  <button type="button" className="btn sm ghost" onClick={() => onEdit(d)}><Icon name="edit" /> {e ? 'Edit' : 'Add log'}</button>
                </div>
                {e && (
                  <div className="xs muted" style={{ marginTop: 4 }}>
                    {m?.sleepMin != null ? `Slept ${formatDuration(m.sleepMin * 60000)}` : 'Sleep not recorded'}
                    {e.bedtime ? ` · bed ${e.bedtime}` : ''}{e.wakeTime ? ` · up ${e.wakeTime}` : ''}
                    {e.sleepQuality != null ? ` · quality ${e.sleepQuality}/5` : ''}{e.energy != null ? ` · energy ${e.energy}/5` : ''}
                    {e.morningOutdoorMin != null ? ` · ${e.morningOutdoorMin} min morning outdoors` : ''}
                    {e.lateScreen ? ` · late screens: ${e.lateScreen}` : ''}
                    {e.notes && <div className="faint" style={{ marginTop: 2 }}>“{e.notes.slice(0, 160)}{e.notes.length > 160 ? '…' : ''}”</div>}
                  </div>
                )}
                {ss.map((s) => (
                  <button key={s.id} type="button" className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => setSession(s)}>
                    <Icon name="sun" /> {s.status === 'planned' ? 'Planned' : 'Outdoors'} {formatClock(s.start, s.timezone ?? 'UTC', settings.hour12)}–{formatClock(s.end, s.timezone ?? 'UTC', settings.hour12)}
                    {s.uvPeak != null ? ` · UV ≤ ${s.uvPeak.toFixed(1)}` : ''}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      </Card>
      <SessionSheet open={!!session} initial={session} onClose={() => setSession(null)} />
    </>
  );
}

function Trends({ today }: { today: string }) {
  const j = useJournal();
  const { settings } = useApp();
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const n = Number(range);
  const rows = useMemo(() => buildRows(j.entries, j.sessions), [j.entries, j.sessions]);
  const end = parseYMD(today)!;
  const dates = Array.from({ length: n }, (_, i) => formatYMD(addDaysYMD(end, i - n + 1)));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const label = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: n > 7 ? 'short' : undefined, weekday: n === 7 ? 'short' : undefined });
  const need = settings.sleep.sleepNeedHours;
  const times = dates.map((d) => Date.parse(d + 'T12:00:00Z'));
  const series = (k: VarKey) => dates.map((d) => byDate.get(d)?.[k] ?? null);
  const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const any = dates.some((d) => byDate.has(d));

  // Weekly averages of sleep duration for the monthly view.
  return (
    <>
      <Segmented label="Range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      {!any && <Notice tone="info">No entries in this range yet. Charts only show what you have recorded — nothing is filled in.</Notice>}
      <div className="grid-2">
        <Card eyebrow="Sleep" title="Duration" actions={<Badge kind="user" />}>
          <BarChart
            ariaLabel="Sleep duration per night"
            data={dates.map((d) => ({ key: d, label: label(d), value: byDate.get(d)?.sleepDuration ?? null, tip: d, color: (byDate.get(d)?.sleepDuration ?? 99) < 7 ? '#e39a74' : '#5aa4e6' }))}
            yMax={12}
            band={{ y0: 7, y1: 9, label: '7–9 h' }}
            formatY={(v) => `${v.toFixed(v % 1 ? 1 : 0)}`}
            unit=" h"
          />
          <Legend items={[{ label: '≥ 7 h', color: '#5aa4e6' }, { label: '< 7 h', color: '#e39a74' }, { label: `Guideline band 7–9 h (your need: ${need} h)`, color: 'var(--c-user)' }]} />
        </Card>
        <Card eyebrow="How you felt" title="Quality, energy, sleepiness" actions={<Badge kind="user" />}>
          <TimeChart
            ariaLabel="Sleep quality, energy and sleepiness ratings"
            series={[
              { id: 'q', label: 'Sleep quality', color: '#5aa4e6', times, values: series('sleepQuality') },
              { id: 'e', label: 'Energy', color: '#f2c86e', times, values: series('energy') },
              { id: 's', label: 'Sleepiness', color: '#e39a74', times, values: series('sleepiness'), type: 'dashed' },
            ]}
            start={times[0]}
            end={times[times.length - 1]}
            yMin={1}
            yMax={5}
            yTicks={[1, 2, 3, 4, 5]}
            formatX={fmtDay}
            height={190}
            emptyText="No ratings in this range"
          />
          <Legend items={[{ label: 'Sleep quality', color: '#5aa4e6' }, { label: 'Energy', color: '#f2c86e' }, { label: 'Sleepiness', color: '#e39a74' }]} />
        </Card>
        <Card eyebrow="Daylight" title="Outdoor minutes" actions={<Badge kind="user" />}>
          <BarChart
            ariaLabel="Outdoor minutes per day"
            data={dates.map((d) => ({ key: d, label: label(d), value: byDate.get(d)?.totalOutdoor ?? null, tip: `${d}${byDate.get(d)?.morningOutdoor != null ? ` · morning ${Math.round(byDate.get(d)!.morningOutdoor!)} min` : ''}`, color: '#e0a43a' }))}
            yMax={Math.max(60, ...dates.map((d) => byDate.get(d)?.totalOutdoor ?? 0))}
            formatY={(v) => `${Math.round(v)}`}
            unit=" min"
          />
        </Card>
        <Card eyebrow="Timing" title="Sleep onset and wake" actions={<Badge kind="user" />}>
          <TimeChart
            ariaLabel="Sleep onset and wake times"
            series={[
              { id: 'on', label: 'Sleep onset', color: '#7fb2e5', times, values: series('sleepOnsetMin').map((v) => (v == null ? null : v / 60)), format: (v) => formatMinutesOfDay(v * 60, settings.hour12) },
              { id: 'wk', label: 'Wake', color: '#f2c86e', times, values: series('wakeMin').map((v) => (v == null ? null : v / 60)), format: (v) => formatMinutesOfDay(v * 60, settings.hour12) },
            ]}
            start={times[0]}
            end={times[times.length - 1]}
            yMin={-6}
            yMax={14}
            yTicks={[-4, 0, 4, 8, 12]}
            formatX={fmtDay}
            height={190}
            emptyText="No times in this range"
          />
          <p className="xs faint" style={{ margin: 0 }}>Vertical axis: hours from midnight (−4 = 20:00 the evening before).</p>
        </Card>
      </div>
    </>
  );
}

function Explore() {
  const j = useJournal();
  const rows = useMemo(() => buildRows(j.entries, j.sessions), [j.entries, j.sessions]);
  const [x, setX] = useState<VarKey>('morningOutdoor');
  const [y, setY] = useState<VarKey>('energy');
  const [lag, setLag] = useState<'0' | '1'>('0');
  const pairing = pairVariables(rows, x, y, lag === '1' ? 1 : 0);
  const presets: { label: string; x: VarKey; y: VarKey; lag: '0' | '1' }[] = [
    { label: 'Morning outdoors → energy', x: 'morningOutdoor', y: 'energy', lag: '0' },
    { label: 'Bedtime irregularity → sleep', x: 'onsetDeviation', y: 'sleepDuration', lag: '0' },
    { label: 'Late screens → sleep quality', x: 'lateScreen', y: 'sleepQuality', lag: '0' },
    { label: 'Outdoor time → next night', x: 'totalOutdoor', y: 'sleepQuality', lag: '1' },
  ];
  return (
    <>
      <Card eyebrow="Explore" title="Two variables, one honest scatter plot">
        <div className="row" style={{ marginBottom: 12 }}>
          {presets.map((p) => (
            <button key={p.label} type="button" className="btn sm" onClick={() => { setX(p.x); setY(p.y); setLag(p.lag); }}>{p.label}</button>
          ))}
        </div>
        <div className="form-grid three">
          <label className="field"><span>X (horizontal)</span>
            <select className="input" value={x} onChange={(e) => setX(e.target.value as VarKey)}>
              {VARS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Y (vertical)</span>
            <select className="input" value={y} onChange={(e) => setY(e.target.value as VarKey)}>
              {VARS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </label>
          <div className="field"><span>Pair with</span>
            <Segmented label="Lag" value={lag} onChange={setLag} options={[{ value: '0', label: 'Same day' }, { value: '1', label: 'Next day' }]} />
          </div>
        </div>
        <p className="xs faint" style={{ marginTop: 6 }}>Note: a morning log’s sleep values describe the night <i>before</i> that date; “late screens” also refers to that previous evening.</p>
        <ScatterChart points={pairing.points} xLabel={varDef(x).label} yLabel={varDef(y).label} fx={varDef(x).describe} fy={varDef(y).describe} />
        <p style={{ marginTop: 12 }}><b>{pairing.strength}</b>{pairing.rho != null && <span className="muted small"> Rank correlation ρ = {pairing.rho.toFixed(2)}.</span>}</p>
        <Notice tone="info">{CORRELATION_CAVEAT} To test an idea, start an experiment.</Notice>
      </Card>
    </>
  );
}

function Experiments({ today }: { today: string }) {
  const j = useJournal();
  const rows = useMemo(() => buildRows(j.entries, j.sessions), [j.entries, j.sessions]);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Card eyebrow="Personal experiments" title="Change one thing, watch, review" actions={<button type="button" className="btn sm primary" onClick={() => setCreating(true)}><Icon name="flask" /> New</button>}>
        <ol className="source-list small">
          <li>Pick one behaviour to investigate (e.g. 15 minutes outdoors after waking).</li>
          <li>Log a baseline period as usual (at least 7 days is better than 3).</li>
          <li>Change that one behaviour for the intervention period; keep everything else as steady as you can.</li>
          <li>Keep logging the outcome; review the comparison and its limitations.</li>
        </ol>
        <p className="xs faint">Never experiment with sleep deprivation, sunburn, extreme cold or heat, or stopping medication.</p>
      </Card>
      {j.experiments.length === 0 && <Card><Empty icon="flask" title="No experiments yet">Create one to compare a baseline with a change you try.</Empty></Card>}
      {j.experiments.map((x) => {
        const r = analyzeExperiment(x, rows, today);
        const fmt = (v: number | null) => (v == null ? '—' : x.outcome === 'sleepOnsetMin' || x.outcome === 'wakeMin' ? varDef(x.outcome as VarKey).describe(v) : v.toFixed(2));
        return (
          <Card key={x.id} eyebrow={`${x.status === 'active' ? r.phase : x.status} · day ${Math.min(r.daysElapsed, x.baselineDays + x.interventionDays)} of ${x.baselineDays + x.interventionDays}`} title={x.title}
            actions={<button type="button" className="btn sm ghost" aria-label="Delete experiment" onClick={() => { if (confirm('Delete this experiment? Your journal entries are kept.')) { deleteExperiment(x.id); toast('Experiment deleted'); } }}><Icon name="trash" /></button>}>
            <p className="small muted">{x.behavior}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{OUTCOME_LABEL[x.outcome]}</th><th className="n">Days logged</th><th className="n">Mean</th><th className="n">SD</th></tr></thead>
                <tbody>
                  <tr><td>Baseline ({x.baselineDays} d from {x.startDate})</td><td className="n">{r.baseline.n}</td><td className="n">{fmt(r.baseline.mean)}</td><td className="n">{r.baseline.sd?.toFixed(2) ?? '—'}</td></tr>
                  <tr><td>Change ({x.interventionDays} d)</td><td className="n">{r.intervention.n}</td><td className="n">{fmt(r.intervention.mean)}</td><td className="n">{r.intervention.sd?.toFixed(2) ?? '—'}</td></tr>
                </tbody>
              </table>
            </div>
            {r.difference != null && <p style={{ marginTop: 10 }}>Difference (change − baseline): <b>{x.outcome === 'sleepOnsetMin' || x.outcome === 'wakeMin' ? `${Math.round(r.difference)} min` : r.difference.toFixed(2)}</b></p>}
            <ul className="source-list xs faint">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            {x.status === 'active' && r.phase === 'finished' && (
              <button type="button" className="btn sm" onClick={() => upsertExperiment({ ...x, status: 'completed' })}>Mark complete</button>
            )}
          </Card>
        );
      })}
      <NewExperiment open={creating} onClose={() => setCreating(false)} today={today} />
    </>
  );
}

function NewExperiment({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const [title, setTitle] = useState('Morning daylight after waking');
  const [behavior, setBehavior] = useState('Spend ~15 minutes outdoors within an hour of waking (no sun-gazing; protection if UV ≥ 3).');
  const [outcome, setOutcome] = useState<OutcomeKey>('energy');
  const [start, setStart] = useState(today);
  const [base, setBase] = useState('7');
  const [inter, setInter] = useState('14');
  return (
    <Sheet open={open} onClose={onClose} title="New experiment">
      <form className="stack" style={{ gap: 12 }} onSubmit={(e) => {
        e.preventDefault();
        const x: Experiment = {
          id: newId('x'), title: title.trim() || 'Experiment', behavior, outcome, startDate: start,
          baselineDays: Math.min(60, Math.max(3, Number(base) || 7)), interventionDays: Math.min(60, Math.max(3, Number(inter) || 14)),
          notes: '', status: 'active', createdAt: Date.now(),
        };
        upsertExperiment(x);
        toast('Experiment created');
        onClose();
      }}>
        <label className="field"><span>Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>The one change you’ll make</span><textarea className="input" value={behavior} onChange={(e) => setBehavior(e.target.value)} /></label>
        <label className="field"><span>Outcome to watch</span>
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeKey)}>
            {(Object.keys(OUTCOME_LABEL) as OutcomeKey[]).map((k) => <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>)}
          </select>
        </label>
        <div className="form-grid three">
          <label className="field"><span>Baseline starts</span><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field"><span>Baseline days</span><input className="input" type="number" min={3} max={60} value={base} onChange={(e) => setBase(e.target.value)} /></label>
          <label className="field"><span>Change days</span><input className="input" type="number" min={3} max={60} value={inter} onChange={(e) => setInter(e.target.value)} /></label>
        </div>
        <p className="xs faint">Tip: you can start the baseline in the past if you already have entries for those days.</p>
        <div className="row"><button type="submit" className="btn primary">Create</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Sheet>
  );
}

function ExportPanel() {
  const j = useJournal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid-2">
      <Card eyebrow="Export" title="Take your data with you">
        <p className="small muted">{j.entries.length} daily entries · {j.sessions.length} outdoor sessions · {j.experiments.length} experiments.</p>
        <div className="stack">
          <button type="button" className="btn" onClick={() => download(`tengri-journal-${stamp}.csv`, entriesCsv(j.entries), 'text/csv')} disabled={!j.entries.length}><Icon name="download" /> Daily entries (CSV)</button>
          <button type="button" className="btn" onClick={() => download(`tengri-sessions-${stamp}.csv`, sessionsCsv(j.sessions), 'text/csv')} disabled={!j.sessions.length}><Icon name="download" /> Outdoor sessions (CSV)</button>
          <button type="button" className="btn primary" onClick={() => download(`tengri-backup-${stamp}.json`, JSON.stringify(makeBackup(settingsStore.get(), j), null, 2), 'application/json')}><Icon name="download" /> Full backup (JSON)</button>
        </div>
        <p className="xs faint" style={{ marginTop: 10, marginBottom: 0 }}>On iPhone the file opens in a preview; use the Share button to save it to Files or send it. Backups include your location and settings.</p>
      </Card>
      <Card eyebrow="Import" title="Restore a backup">
        <p className="small muted">Restoring replaces the journal and settings on this device with the backup’s contents.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const { settings, journal } = parseBackup(await f.text());
            if (!confirm(`Replace current data with this backup (${journal.entries.length} entries, ${journal.sessions.length} sessions)?`)) return;
            replaceJournal(journal);
            settingsStore.set(settings);
            setMsg('Backup restored.');
          } catch (err) {
            setMsg(err instanceof Error ? `Could not import: ${err.message}` : 'Could not import that file.');
          }
        }} />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Choose backup file…</button>
        {msg && <p className="small" style={{ marginTop: 10 }}>{msg}</p>}
        <p className="xs faint" style={{ marginTop: 10, marginBottom: 0 }}>Delete everything in Settings → Privacy & data.</p>
      </Card>
    </div>
  );
}
