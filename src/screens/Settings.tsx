import { useState } from 'react';
import { useApp } from '../state/app';
import { DEFAULT_SETTINGS, settingsStore, updateSettings } from '../state/settings';
import { EMPTY_JOURNAL, replaceJournal, useJournal } from '../state/journal';
import { clearEnvironmentCache, currentProvider } from '../state/environment';
import { LocationPicker } from '../components/LocationPicker';
import { Card, Disclosure, Notice, Segmented, Sheet, Switch, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { coord } from '../lib/units';
import { download, makeBackup } from '../lib/exporters';
import { removeAll, storageBytes } from '../lib/storage/persist';
import { formatClock } from '../lib/time/tz';

export default function Settings() {
  const { settings, loc, snap, solar } = useApp();
  const journal = useJournal();
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [altInput, setAltInput] = useState(loc?.altitudeM != null ? String(Math.round(loc.altitudeM)) : '');
  const provider = currentProvider().info;
  const installed = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  const setAltitude = () => {
    if (!loc) return;
    const v = altInput.trim() === '' ? null : Number(altInput);
    if (v != null && (!Number.isFinite(v) || v < -450 || v > 9000)) return toast('Altitude must be between −450 and 9000 m');
    updateSettings((s) => ({ ...s, location: s.location ? { ...s.location, altitudeM: v, altitudeSource: v == null ? null : 'manual', altitudeAccuracyM: null } : null }));
    toast('Altitude saved');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Instrument settings</h1>
          <p className="lede">Everything here is stored only in this browser on this device.</p>
        </div>
      </div>

      <div className="grid-2">
        <Card eyebrow="Location" title={loc ? loc.name : 'Not set'} actions={<button type="button" className="btn sm" onClick={() => setPicking(true)}><Icon name="pin" /> Change</button>}>
          {loc ? (
            <dl className="kv">
              <dt>Coordinates</dt><dd>{coord(loc.latitude, loc.longitude)}</dd>
              <dt>Source</dt><dd>{{ gps: 'Device location (GPS / network)', search: 'Place search', manual: 'Entered manually' }[loc.source]}</dd>
              {loc.accuracyM != null && <><dt>Reported accuracy</dt><dd>± {Math.round(loc.accuracyM)} m</dd></>}
              <dt>Altitude</dt><dd>{loc.altitudeM != null ? `${Math.round(loc.altitudeM)} m · ${{ manual: 'entered', gps: 'GPS', dem: 'terrain model (Copernicus DEM)', geocoder: 'place database', 'provider-grid': 'model grid' }[loc.altitudeSource ?? 'manual']}${loc.altitudeAccuracyM ? ` ± ${Math.round(loc.altitudeAccuracyM)} m` : ''}` : 'unknown'}</dd>
              <dt>Time zone</dt><dd>{solar ? `${solar.tz} (${{ location: 'from place data', provider: 'from weather provider', device: 'device zone — fallback' }[solar.zone.source]})` : '—'}</dd>
              {snap?.gridElevation != null && <><dt>Weather-model grid height</dt><dd>{Math.round(snap.gridElevation)} m</dd></>}
            </dl>
          ) : <p className="muted">Set a location to enable solar calculations and weather.</p>}
          {loc && (
            <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); setAltitude(); }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Altitude above sea level (m)</span>
                <input className="input" inputMode="decimal" value={altInput} onChange={(e) => setAltInput(e.target.value)} placeholder="unknown" />
              </label>
              <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }}>Save</button>
            </form>
          )}
          {settings.savedLocations.length > 0 && (
            <Disclosure summary={`Saved places (${settings.savedLocations.length})`}>
              <ul className="list">
                {settings.savedLocations.map((p) => (
                  <li key={p.id} className="row between">
                    <span>{p.name}<br /><span className="xs faint">{coord(p.latitude, p.longitude)}</span></span>
                    <span className="row">
                      <button type="button" className="btn sm" onClick={() => { updateSettings({ location: { ...p, updatedAt: Date.now() } }); toast(`Location set: ${p.name}`); }}>Use</button>
                      <button type="button" className="btn sm ghost" aria-label={`Remove ${p.name}`} onClick={() => updateSettings((s) => ({ ...s, savedLocations: s.savedLocations.filter((x) => x.id !== p.id) }))}><Icon name="trash" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </Card>

        <Card eyebrow="Display" title="Units, time & theme">
          <div className="stack" style={{ gap: 14 }}>
            <div className="field"><span>Temperature</span><Segmented label="Temperature unit" value={settings.temperatureUnit} onChange={(v) => updateSettings({ temperatureUnit: v })} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} /></div>
            <div className="field"><span>Wind</span><Segmented label="Wind unit" value={settings.windUnit} onChange={(v) => updateSettings({ windUnit: v })} options={[{ value: 'kmh', label: 'km/h' }, { value: 'ms', label: 'm/s' }, { value: 'mph', label: 'mph' }]} /></div>
            <div className="field"><span>Clock</span><Segmented label="Clock format" value={settings.hour12 ? '12' : '24'} onChange={(v) => updateSettings({ hour12: v === '12' })} options={[{ value: '24', label: '24-hour' }, { value: '12', label: 'AM / PM' }]} /></div>
            <div className="field"><span>Theme</span><Segmented label="Theme" value={settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'sky', label: 'Follow the Sun' }, { value: 'dark', label: 'Night' }, { value: 'light', label: 'Day' }]} /><span className="hint">“Follow the Sun” switches to the day palette when the Sun is more than 6° above your horizon.</span></div>
            <div className="field"><span>Motion</span><Segmented label="Motion" value={settings.motion} onChange={(v) => updateSettings({ motion: v })} options={[{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduced' }, { value: 'full', label: 'Full' }]} /></div>
            <label className="field">
              <span>Height above a flat horizon (m)</span>
              <input className="input" type="number" min={0} max={3000} value={settings.horizonHeightM} onChange={(e) => updateSettings({ horizonHeightM: Math.max(0, Math.min(3000, Number(e.target.value) || 0)) })} />
              <span className="hint">Only for a raised viewpoint over sea or open plain (it makes sunrise earlier and sunset later). Leave 0 for ordinary ground level — altitude above sea level alone does not change the horizon.</span>
            </label>
          </div>
        </Card>

        <Card eyebrow="Sleep" title="Schedule & reminders">
          <div className="form-grid">
            <label className="field"><span>Target bedtime</span><input className="input" type="time" value={settings.sleep.targetBedtime} onChange={(e) => e.target.value && updateSettings((s) => ({ ...s, sleep: { ...s.sleep, targetBedtime: e.target.value } }))} /></label>
            <label className="field"><span>Target wake</span><input className="input" type="time" value={settings.sleep.targetWake} onChange={(e) => e.target.value && updateSettings((s) => ({ ...s, sleep: { ...s.sleep, targetWake: e.target.value } }))} /></label>
            <label className="field"><span>Sleep need (h)</span><input className="input" type="number" min={5} max={11} step={0.25} value={settings.sleep.sleepNeedHours} onChange={(e) => updateSettings((s) => ({ ...s, sleep: { ...s.sleep, sleepNeedHours: Math.max(5, Math.min(11, Number(e.target.value) || 8)) } }))} /></label>
            <label className="field"><span>Wind-down (min)</span><input className="input" type="number" min={15} max={180} step={5} value={settings.sleep.windDownMinutes} onChange={(e) => updateSettings((s) => ({ ...s, sleep: { ...s.sleep, windDownMinutes: Math.max(15, Math.min(180, Number(e.target.value) || 60)) } }))} /></label>
          </div>
          <Switch label="In-app reminders" hint="Shown on the home screen while the app is open" checked={settings.reminders.inApp} onChange={(v) => updateSettings((s) => ({ ...s, reminders: { ...s.reminders, inApp: v } }))} />
          <Switch label="Wind-down reminder" checked={settings.reminders.windDown} onChange={(v) => updateSettings((s) => ({ ...s, reminders: { ...s.reminders, windDown: v } }))} />
          <Switch label="Morning daylight reminder" checked={settings.reminders.morningLight} onChange={(v) => updateSettings((s) => ({ ...s, reminders: { ...s.reminders, morningLight: v } }))} />
          <p className="xs faint" style={{ marginBottom: 0 }}>Notifications while the app is closed: use “Add reminders to Calendar” in the Circadian Studio. iOS only allows web push for Home Screen apps with a push server, which this private, server-less app deliberately does not use.</p>
        </Card>

        <Card eyebrow="Data providers" title={provider.name}>
          <p className="small muted">{provider.nature}</p>
          <dl className="kv">
            <dt>Licence</dt><dd>{provider.license}</dd>
            <dt>API key</dt><dd>None required</dd>
            <dt>Last update</dt><dd>{snap && solar ? formatClock(snap.fetchedAt, solar.tz, settings.hour12) : '—'}</dd>
            <dt>Fields missing last time</dt><dd>{snap ? (snap.missing.length ? snap.missing.length : 'none') : '—'}</dd>
          </dl>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Auto-refresh while open</span>
            <Segmented label="Auto refresh" value={String(settings.data.autoRefreshMinutes)} onChange={(v) => updateSettings((s) => ({ ...s, data: { ...s.data, autoRefreshMinutes: Number(v) } }))} options={[{ value: '0', label: 'Off' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '60 min' }]} />
          </div>
          <Switch label="Send my altitude to the provider" hint="Improves temperature downscaling for mountain sites; otherwise the provider uses its own terrain model" checked={settings.data.sendAltitudeToProvider} onChange={(v) => updateSettings((s) => ({ ...s, data: { ...s.data, sendAltitudeToProvider: v } }))} />
          {snap?.missing.length ? <Disclosure summary="Missing fields">{snap.missing.join(', ')}</Disclosure> : null}
        </Card>

        <Card eyebrow="Library" title="Evidence preferences">
          <Switch label="Show Ray Peat cards" checked={settings.evidence.showPeat} onChange={(v) => updateSettings((s) => ({ ...s, evidence: { ...s.evidence, showPeat: v } }))} />
          <Switch label="Show Jack Kruse cards" checked={settings.evidence.showKruse} onChange={(v) => updateSettings((s) => ({ ...s, evidence: { ...s.evidence, showKruse: v } }))} />
          <div className="field" style={{ marginTop: 8 }}>
            <span>Show claims rated at least</span>
            <Segmented label="Minimum evidence level" value={settings.evidence.minimumLevel} onChange={(v) => updateSettings((s) => ({ ...s, evidence: { ...s.evidence, minimumLevel: v } }))} options={[{ value: 'any', label: 'All' }, { value: 'preliminary', label: 'Preliminary+' }, { value: 'supported', label: 'Supported+' }]} />
          </div>
        </Card>

        <Card eyebrow="Install" title="Home Screen app">
          {installed ? <p className="small">Running as an installed app. Your data in the installed app is separate from Safari’s copy.</p> : (
            <ol className="source-list small">
              <li>Open this page in <b>Safari</b> on iPhone or iPad.</li>
              <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
              <li>Open Tengri Solar from the new icon. It runs full-screen and works offline for calculated data.</li>
            </ol>
          )}
          <p className="xs faint" style={{ marginBottom: 0 }}>Needs internet: weather, UV, irradiance, place search, elevation lookup. Works offline: Sun position, sunrise/sunset, twilight, journal, trends, library.</p>
        </Card>
      </div>

      <Card eyebrow="Privacy & data" title="What is stored and sent" id="privacy">
        <div className="grid-2">
          <div>
            <h3>Stored on this device only</h3>
            <ul className="source-list small">
              <li>Settings and saved places (localStorage, key prefix <code>tengri.</code>).</li>
              <li>Journal: {journal.entries.length} entries, {journal.sessions.length} sessions, {journal.experiments.length} experiments.</li>
              <li>The last weather snapshot (so stale data can be shown and labelled offline).</li>
              <li>App files cached by the service worker for offline use.</li>
            </ul>
            <p className="xs faint">Approx. {Math.round(storageBytes() / 1024)} KB used. Safari can delete website data for sites you have not used for a while; Home Screen apps are much less affected. Export backups regularly.</p>
          </div>
          <div>
            <h3>Sent over the network</h3>
            <ul className="source-list small">
              <li><b>api.open-meteo.com</b>: your coordinates (4 decimals ≈ 11 m), optionally your altitude, to get weather/UV/irradiance and terrain elevation.</li>
              <li><b>geocoding-api.open-meteo.com</b>: only the place name you type in search.</li>
              <li>Your hosting provider serves the app files and can see your IP address and requests, as any website host can.</li>
              <li>No analytics, no trackers, no accounts, no AI services. Journal entries never leave the device unless you export them.</li>
            </ul>
            <p className="xs faint">Open-Meteo and your host can see your IP address. No system can promise absolute privacy; this app minimises what it sends.</p>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => download(`tengri-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(settingsStore.get(), journal), null, 2), 'application/json')}><Icon name="download" /> Export everything (JSON)</button>
          <button type="button" className="btn" onClick={() => { clearEnvironmentCache(); toast('Cached weather data cleared'); }}>Clear cached weather</button>
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" /> Delete all data & reset</button>
        </div>
      </Card>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Change location">
        <LocationPicker onDone={() => setPicking(false)} />
      </Sheet>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all data?">
        <p>This permanently deletes your journal, sessions, experiments, saved places, settings and cached weather from this device. It cannot be undone.</p>
        <Notice tone="warn">Consider exporting a backup first.</Notice>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn danger" onClick={() => {
            removeAll();
            replaceJournal(EMPTY_JOURNAL);
            settingsStore.set(DEFAULT_SETTINGS);
            clearEnvironmentCache();
            removeAll();
            setConfirmDelete(false);
            toast('All data deleted');
            window.location.hash = '#/';
          }}>Delete everything</button>
          <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      </Sheet>
    </div>
  );
}
