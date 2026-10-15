import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { Notice, Segmented, toast } from './ui';
import { fetchElevation, geocode } from '../lib/data/openMeteo';
import type { GeocodeResult } from '../lib/data/types';
import { coord } from '../lib/units';
import { settingsStore, updateSettings, type PlaceLocation } from '../state/settings';

export function applyLocation(loc: PlaceLocation, save: boolean) {
  updateSettings((s) => {
    const saved = save
      ? [loc, ...s.savedLocations.filter((x) => Math.abs(x.latitude - loc.latitude) > 0.005 || Math.abs(x.longitude - loc.longitude) > 0.005)].slice(0, 30)
      : s.savedLocations;
    return { ...s, location: loc, savedLocations: saved, onboarded: true };
  });
}

type Mode = 'gps' | 'search' | 'manual';

export function LocationPicker({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>('search');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [save, setSave] = useState(true);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [name, setName] = useState('');
  const [alt, setAlt] = useState('');
  const abort = useRef<AbortController | null>(null);

  const done = (loc: PlaceLocation) => {
    applyLocation(loc, save);
    toast(`Location set: ${loc.name}`);
    onDone?.();
  };

  const useGps = () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('This browser does not provide geolocation. Search for a place or enter coordinates instead.');
      return;
    }
    if (!window.isSecureContext) {
      setError('Location access requires HTTPS. Open the app from its https:// address, or enter coordinates manually.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const { latitude, longitude, accuracy, altitude, altitudeAccuracy } = p.coords;
        let altitudeM: number | null = altitude ?? null;
        let altitudeSource: PlaceLocation['altitudeSource'] = altitude != null ? 'gps' : null;
        if (altitudeM == null) {
          try {
            altitudeM = await fetchElevation(latitude, longitude);
            if (altitudeM != null) altitudeSource = 'dem';
          } catch {
            /* elevation optional */
          }
        }
        setBusy(false);
        done({
          id: `gps-${Date.now()}`,
          name: 'Current location',
          latitude,
          longitude,
          source: 'gps',
          accuracyM: Number.isFinite(accuracy) ? accuracy : null,
          altitudeM,
          altitudeSource,
          altitudeAccuracyM: altitudeAccuracy ?? null,
          timezone: null,
          updatedAt: Date.now(),
        });
      },
      (err) => {
        setBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission was denied. On iPhone/iPad: Settings → Privacy & Security → Location Services → Safari Websites (or this Home Screen app) → "While Using". Or search for a place instead.');
        } else if (err.code === err.TIMEOUT) {
          setError('Getting a position timed out. Try again outdoors, or search for a place.');
        } else {
          setError('Your position is unavailable right now. Search for a place or enter coordinates.');
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60000 },
    );
  };

  const search = async () => {
    setError(null);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    try {
      const r = await geocode(query, ctrl.signal);
      setResults(r);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? `Search failed: ${e.message}` : 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  const manual = async () => {
    setError(null);
    const la = Number(lat.replace(',', '.')), lo = Number(lon.replace(',', '.'));
    if (!Number.isFinite(la) || la < -90 || la > 90 || lat.trim() === '') return setError('Latitude must be a number between −90 and 90 (north positive).');
    if (!Number.isFinite(lo) || lo < -180 || lo > 180 || lon.trim() === '') return setError('Longitude must be a number between −180 and 180 (east positive).');
    const a = alt.trim() === '' ? null : Number(alt);
    if (a != null && (!Number.isFinite(a) || a < -450 || a > 9000)) return setError('Altitude must be between −450 and 9000 m, or left empty.');
    done({
      id: `man-${Date.now()}`,
      name: name.trim() || coord(la, lo),
      latitude: la,
      longitude: lo,
      source: 'manual',
      accuracyM: null,
      altitudeM: a,
      altitudeSource: a != null ? 'manual' : null,
      altitudeAccuracyM: null,
      timezone: null,
      updatedAt: Date.now(),
    });
  };

  const saved = settingsStore.get().savedLocations;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Segmented<Mode>
        label="How to set location"
        value={mode}
        onChange={(m) => { setMode(m); setError(null); }}
        options={[{ value: 'search', label: 'Search' }, { value: 'gps', label: 'Use GPS' }, { value: 'manual', label: 'Coordinates' }]}
      />
      {mode === 'gps' && (
        <div className="stack">
          <p className="small muted">
            Your browser will ask for permission. The position is stored only on this device and sent (rounded to 4 decimals, ≈ 11 m) to Open-Meteo to fetch weather and UV. Nothing is tracked in the background.
          </p>
          <button type="button" className="btn primary" onClick={useGps} disabled={busy}>
            <Icon name="locate" className={busy ? 'spin' : undefined} /> {busy ? 'Locating…' : 'Use my current location'}
          </button>
        </div>
      )}
      {mode === 'search' && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <label className="field">
            <span>Place name</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Almaty, Astana, Ulaanbaatar" autoComplete="off" enterKeyHint="search" />
              <button type="submit" className="btn icon primary" disabled={busy || query.trim().length < 2} aria-label="Search">
                <Icon name="search" />
              </button>
            </div>
            <span className="hint">Only the text you type is sent to the Open-Meteo geocoding service.</span>
          </label>
          {results && results.length === 0 && <p className="small muted">No places found. Try another spelling or enter coordinates.</p>}
          {results && results.length > 0 && (
            <ul className="list" aria-label="Search results">
              {results.map((r) => (
                <li key={`${r.latitude},${r.longitude}`}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left', height: 'auto', padding: '10px 12px' }}
                    onClick={() =>
                      done({
                        id: `geo-${r.latitude}-${r.longitude}`,
                        name: [r.name, r.region, r.country].filter(Boolean).join(', '),
                        latitude: r.latitude,
                        longitude: r.longitude,
                        source: 'search',
                        accuracyM: null,
                        altitudeM: r.elevation,
                        altitudeSource: r.elevation != null ? 'geocoder' : null,
                        altitudeAccuracyM: null,
                        timezone: r.timezone,
                        updatedAt: Date.now(),
                      })
                    }
                  >
                    <span className="stack" style={{ gap: 0 }}>
                      <b>{r.name}</b>
                      <span className="xs faint">{[r.region, r.country].filter(Boolean).join(', ')} · {coord(r.latitude, r.longitude)}{r.elevation != null ? ` · ${Math.round(r.elevation)} m` : ''}</span>
                    </span>
                    <Icon name="chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
      {mode === 'manual' && (
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void manual(); }}>
          <label className="field"><span>Latitude (°N +)</span><input className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="43.2389" /></label>
          <label className="field"><span>Longitude (°E +)</span><input className="input" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="76.8897" /></label>
          <label className="field"><span>Name (optional)</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Home" /></label>
          <label className="field"><span>Altitude m (optional)</span><input className="input" inputMode="decimal" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. 850" /></label>
          <button type="submit" className="btn primary full">Use these coordinates</button>
        </form>
      )}
      <label className="row small muted" style={{ minHeight: 40 }}>
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} style={{ width: 20, height: 20 }} /> Save to my places (on this device)
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      {saved.length > 0 && (
        <div className="stack">
          <span className="eyebrow">Saved places</span>
          <div className="row">
            {saved.map((s) => (
              <button key={s.id} type="button" className="btn sm" onClick={() => done({ ...s, updatedAt: Date.now() })}>
                <Icon name="pin" /> {s.name.split(',')[0]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
