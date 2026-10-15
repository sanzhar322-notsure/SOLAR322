import { Icon } from './Icon';
import { Badge } from './ui';
import { useApp } from '../state/app';
import { refreshEnvironment } from '../state/environment';
import { formatAge } from '../lib/data/series';
import { formatClock } from '../lib/time/tz';

/** Compact data-freshness indicator with a refresh control. */
export function DataStatus({ compact = false }: { compact?: boolean }) {
  const { env, snap, fresh, loc, settings, online, solar } = useApp();
  if (!loc) return null;
  const loading = env.status === 'loading';
  const refresh = () => void refreshEnvironment(loc, { sendAltitude: settings.data.sendAltitudeToProvider });
  const tz = solar?.tz ?? 'UTC';
  let badge = null;
  if (!online) badge = <Badge kind="error"><span className="row" style={{ gap: 4 }}>Offline</span></Badge>;
  else if (!snap && loading) badge = <Badge kind="unavailable">Loading…</Badge>;
  else if (!snap) badge = <Badge kind="unavailable">No live data</Badge>;
  else if (fresh?.state === 'stale') badge = <Badge kind="stale">Stale · {formatAge(fresh.ageMs)}</Badge>;
  else badge = <Badge kind="modeled" title={snap.provider.nature}>Updated {formatAge(fresh?.ageMs ?? 0)}</Badge>;
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      {badge}
      {!compact && snap && (
        <span className="xs faint" style={{ whiteSpace: 'nowrap' }}>
          {formatClock(snap.fetchedAt, tz, settings.hour12)}
        </span>
      )}
      <button type="button" className="btn icon ghost sm" onClick={refresh} disabled={loading || !online} aria-label="Refresh environmental data" title="Refresh">
        <Icon name="refresh" className={loading ? 'spin' : undefined} />
      </button>
    </div>
  );
}

/** Explicit error/stale banner for screens that depend on live data. */
export function DataBanner() {
  const { env, snap, fresh, online, loc } = useApp();
  if (!loc) return null;
  if (!online && snap) {
    return <p className="notice warn small"><Icon name="offline" /> <span>You are offline. Showing the last data received {formatAge(fresh?.ageMs ?? 0)} — not current conditions. Astronomical times are calculated on-device and remain accurate.</span></p>;
  }
  if (!online) {
    return <p className="notice warn small"><Icon name="offline" /> <span>You are offline and no weather data has been saved for this place yet. Sun position and twilight times still work (calculated on-device).</span></p>;
  }
  if (env.status === 'error' && env.error) {
    return (
      <p className="notice error small">
        <Icon name="error" />
        <span>
          Live weather/UV could not be loaded: {env.error.message}.{' '}
          {snap ? `Showing the last values received ${formatAge(fresh?.ageMs ?? 0)}, clearly marked.` : 'Values are shown as unavailable rather than estimated.'}
        </span>
      </p>
    );
  }
  if (snap && fresh?.state === 'stale') {
    return <p className="notice warn small"><Icon name="warn" /> <span>Data is {formatAge(fresh.ageMs)} old. Pull a refresh for current conditions.</span></p>;
  }
  if (snap?.reduced) {
    return <p className="notice info small"><Icon name="info" /> <span>The provider returned a reduced data set; some fields are unavailable this time.</span></p>;
  }
  return null;
}
