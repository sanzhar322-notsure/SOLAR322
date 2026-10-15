import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { useSkyContext } from '../state/sky';
import { Card, Disclosure, Segmented } from '../components/ui';
import { SkyLines } from '../components/SkyLines';
import { Icon } from '../components/Icon';
import {
  CONCEPTS, THEME_LABEL, THINKER_LABEL, conceptsForNow, type Concept, type SkyContext, type Theme, type Thinker,
} from '../content/philosophy';
import { CARDS, LEVEL_DEFINITION, LEVEL_LABEL } from '../content/evidence';
import { SOURCE_TYPE_LABEL, sourceById } from '../content/sources';
import { href } from '../router';

const LEVEL_CLASS = { well: 'well', supported: 'supported', preliminary: 'preliminary', disputed: 'disputed', insufficient: 'insufficient' } as const;

function Sources({ ids }: { ids: string[] }) {
  return (
    <ul className="source-list">
      {ids.map((id) => {
        const s = sourceById(id);
        if (!s) return null;
        return (
          <li key={id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>{' '}
            <span className="faint">— {s.authors}{s.year ? `, ${s.year}` : ''}. {SOURCE_TYPE_LABEL[s.type]}{!s.verified ? ' (not re-verified in this build)' : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ConceptCard({ c, sky, expanded }: { c: Concept; sky: SkyContext | null; expanded: boolean }) {
  const cards = c.relatedCards.map((id) => CARDS.find((x) => x.id === id)).filter(Boolean);
  return (
    <article className="card evidence-card" id={`concept-${c.id}`}>
      <div className="row between">
        <span className={`cat-tag ${c.thinker === 'both' ? 'established' : c.thinker}`}>{THINKER_LABEL[c.thinker]}</span>
        <span className={`level ${LEVEL_CLASS[c.level]}`} title={`Independent evidence: ${LEVEL_DEFINITION[c.level]}`}>{LEVEL_LABEL[c.level]}</span>
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600 }}>{c.title}</h3>
      <div className="row" style={{ gap: 6 }}>{c.themes.map((t) => <span key={t} className="badge plain unavailable">{THEME_LABEL[t]}</span>)}</div>

      <section className="phil-layer">
        <span className="phil-step">1</span>
        <div>
          <b>The original idea</b>
          <p className="small muted" style={{ margin: '4px 0 6px' }}>{c.original}</p>
          <Disclosure summary="Primary sources"><Sources ids={c.originalSources} /></Disclosure>
        </div>
      </section>

      <section className="phil-layer">
        <span className="phil-step">2</span>
        <div>
          <b>The scientific evidence</b>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{c.supports[0]}</p>
          <Disclosure summary={`Supports ${c.supports.length} · Contradicts ${c.contradicts.length} · Untested ${c.untested.length} — details & sources`} open={expanded}>
            {c.supports.length > 0 && (<><div className="xs eyebrow">Supports</div><ul className="source-list">{c.supports.map((s) => <li key={s}>{s}</li>)}</ul></>)}
            {c.contradicts.length > 0 && (<><div className="xs eyebrow" style={{ marginTop: 6 }}>Contradicts or limits</div><ul className="source-list">{c.contradicts.map((s) => <li key={s}>{s}</li>)}</ul></>)}
            {c.untested.length > 0 && (<><div className="xs eyebrow" style={{ marginTop: 6 }}>Not adequately tested</div><ul className="source-list">{c.untested.map((s) => <li key={s}>{s}</li>)}</ul></>)}
            <div className="xs eyebrow" style={{ marginTop: 6 }}>Independent sources</div>
            <Sources ids={c.evidenceSources} />
          </Disclosure>
        </div>
      </section>

      <section className="phil-layer">
        <span className="phil-step">3</span>
        <div>
          <b>Practical reading</b>
          <ul className="source-list small">{c.practical.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      </section>

      <section className="phil-sky">
        <div className="eyebrow" style={{ marginBottom: 4 }}>Your sky now</div>
        <SkyLines concept={c} sky={sky} />
      </section>

      {cards.length > 0 && (
        <p className="xs" style={{ margin: 0 }}>
          Related evidence cards:{' '}
          {cards.map((x, i) => (
            <span key={x!.id}>{i > 0 && ' · '}<a href={href('archive', { q: x!.topics[0] })}>{x!.claim.length > 60 ? x!.claim.slice(0, 58) + '…' : x!.claim}</a></span>
          ))}
        </p>
      )}
    </article>
  );
}

export default function Philosophy({ params }: { params: URLSearchParams }) {
  const sky = useSkyContext();
  const { solar } = useApp();
  const [who, setWho] = useState<'all' | Thinker>((params.get('t') as Thinker) || 'all');
  const [theme, setTheme] = useState<Theme | null>(null);
  const focus = params.get('c');
  useEffect(() => {
    if (focus) setTimeout(() => document.getElementById(`concept-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }, [focus]);

  const list = useMemo(
    () => CONCEPTS.filter((c) => (who === 'all' || c.thinker === who || c.thinker === 'both') && (!theme || c.themes.includes(theme))),
    [who, theme],
  );
  const nowIds = conceptsForNow(solar?.position.elevation ?? null, solar?.morning ?? true);
  const nowConcepts = nowIds.map((id) => CONCEPTS.find((c) => c.id === id)!).filter(Boolean);
  const themes = [...new Set(CONCEPTS.flatMap((c) => c.themes))];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Solar Philosophy</span>
          <h1>Working with the Sun, critically</h1>
          <p className="lede">Ray Peat and Jack Kruse treated light, temperature and the environment as central to physiology. Here each of their ideas is read in three layers — what they proposed, what independent evidence shows, and what you can reasonably explore — and connected to your sky right now.</p>
        </div>
      </div>

      <div className="grid-2">
        <Card eyebrow="How to read this" title="Three layers, clearly labelled">
          <ol className="source-list small">
            <li><b>The original idea</b> — the thinker’s position, paraphrased with links to their own writing. Not a fact claim by this app.</li>
            <li><b>The scientific evidence</b> — independent research that supports, contradicts or hasn’t yet tested the idea, with an evidence rating.</li>
            <li><b>Practical reading</b> — what you can observe or try for yourself, or discuss with a professional.</li>
          </ol>
          <p className="xs faint" style={{ marginBottom: 0 }}>“Your sky now” lines are labelled Calculated, Model estimate, App estimate or Unavailable. Weather data can’t tell you anything about your mitochondria, hormones or metabolic rate — the app never pretends otherwise.</p>
        </Card>
        <Card eyebrow="At this moment" title="Ideas closest to the present sky">
          {nowConcepts.map((c) => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <a href={href('philosophy', { c: c.id })} className="row" style={{ textDecoration: 'none', color: 'var(--text)' }}>
                <Icon name="shanyrak" style={{ width: 18, height: 18, color: 'var(--accent)' }} /><b>{c.title}</b>
              </a>
              <div className="xs faint" style={{ margin: '2px 0 0 26px' }}>{THINKER_LABEL[c.thinker]}</div>
              <SkyLines concept={c} sky={sky} />
            </div>
          ))}
        </Card>
      </div>

      <Card className="flat">
        <div className="row">
          <Segmented<'all' | Thinker> label="Thinker" value={who} onChange={setWho} options={[{ value: 'all', label: 'All' }, { value: 'peat', label: 'Ray Peat' }, { value: 'kruse', label: 'Jack Kruse' }, { value: 'both', label: 'Shared' }]} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {themes.map((t) => <button key={t} type="button" className="btn sm" aria-pressed={theme === t} onClick={() => setTheme(theme === t ? null : t)}>{THEME_LABEL[t]}</button>)}
        </div>
      </Card>

      <div className="grid-2">{list.map((c) => <ConceptCard key={c.id} c={c} sky={sky} expanded={c.id === focus} />)}</div>

      <p className="xs faint" style={{ textAlign: 'center' }}>
        Positions are paraphrased, not quoted. Several of these ideas are speculative; the ratings explain why. For the full claim-by-claim library see the <a href={href('archive')}>Knowledge Archive</a>.
      </p>
    </div>
  );
}
