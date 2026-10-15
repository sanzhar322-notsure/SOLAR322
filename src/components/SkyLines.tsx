import { Badge } from './ui';
import type { Concept, SkyContext } from '../content/philosophy';

/** Lists a concept's connections to the live sky, each labelled by provenance. */
export function SkyLines({ concept, sky }: { concept: Concept; sky: SkyContext | null }) {
  if (!sky) return <p className="small muted" style={{ margin: 0 }}>Set a location to connect this idea to your sky.</p>;
  return (
    <ul className="list" style={{ margin: 0 }}>
      {concept.sky(sky).map((l) => (
        <li key={l.text} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10, padding: '8px 0' }}>
          <span style={{ flex: 'none' }}><Badge kind={l.kind === 'unavailable' ? 'unavailable' : l.kind} /></span>
          <span className="small">{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

