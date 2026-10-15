import { Icon } from '../components/Icon';
import { NAV, href } from '../router';

const BLURB: Record<string, string> = {
  spectrum: 'UV, visible and infrared — and what can honestly be known.',
  archive: 'Evidence cards: science, Ray Peat, Jack Kruse.',
  settings: 'Location, units, privacy, export & delete.',
};

export default function More() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">More</span>
          <h1>Instruments & archive</h1>
        </div>
      </div>
      <div className="more-grid">
        {NAV.filter((n) => ['spectrum', 'archive', 'settings'].includes(n.route)).map((n) => (
          <a key={n.route} className="more-tile" href={href(n.route)}>
            <Icon name={n.icon} />
            <b>{n.label}</b>
            <span className="small muted">{BLURB[n.route]}</span>
          </a>
        ))}
      </div>
      <p className="xs faint" style={{ textAlign: 'center' }}>
        Tengri Solar is educational and not a medical device. Weather data by Open-Meteo.com (CC BY 4.0).
      </p>
    </div>
  );
}
