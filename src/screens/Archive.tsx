import { useMemo, useState } from 'react';
import { useApp } from '../state/app';
import { Card, Disclosure, Notice, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import {
  CARDS, CATEGORY_LABEL, LEVEL_DEFINITION, LEVEL_LABEL, LEVEL_ORDER, type Category, type EvidenceCard, type Level,
} from '../content/evidence';
import { SOURCES, SOURCE_TYPE_LABEL, sourceById } from '../content/sources';

type View = 'cards' | 'compare' | 'sources' | 'method';

const LEVEL_CLASS: Record<Level, string> = { well: 'well', supported: 'supported', preliminary: 'preliminary', disputed: 'disputed', insufficient: 'insufficient' };

function matches(c: EvidenceCard, q: string): boolean {
  if (!q) return true;
  const hay = [c.claim, c.explanation, c.proposer, c.rationale, c.practical, c.safety, ...c.topics, ...c.supporting, ...c.conflicting].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function SourceLinks({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="faint">—</span>;
  return (
    <ul className="source-list">
      {ids.map((id) => {
        const s = sourceById(id);
        if (!s) return null;
        return (
          <li key={id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>{' '}
            <span className="faint">— {s.authors}{s.year ? `, ${s.year}` : ''}. {SOURCE_TYPE_LABEL[s.type]}.{!s.verified && ' (citation not re-verified in this build)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function EvidenceView({ c }: { c: EvidenceCard }) {
  return (
    <article className="card evidence-card" id={`ev-${c.id}`}>
      <div className="row between">
        <span className={`cat-tag ${c.category}`}>{CATEGORY_LABEL[c.category]}</span>
        <span className={`level ${LEVEL_CLASS[c.level]}`} title={LEVEL_DEFINITION[c.level]}>{LEVEL_LABEL[c.level]}</span>
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600 }}>{c.claim}</h3>
      <p className="xs faint" style={{ margin: 0 }}>Proposed by: {c.proposer}</p>
      <p className="small muted" style={{ margin: 0 }}>{c.explanation}</p>
      <p className="small" style={{ margin: 0 }}><b>Why this rating:</b> <span className="muted">{c.rationale}</span></p>
      {c.researchNote && <Notice tone="warn">{c.researchNote}</Notice>}
      <Disclosure summary="Evidence, sources, implications & safety">
        <div className="grid-2" style={{ gap: 12 }}>
          <div>
            <b>Supporting</b>
            <ul className="source-list">{c.supporting.length ? c.supporting.map((s) => <li key={s}>{s}</li>) : <li className="faint">None identified</li>}</ul>
          </div>
          <div>
            <b>Conflicting / limiting</b>
            <ul className="source-list">{c.conflicting.length ? c.conflicting.map((s) => <li key={s}>{s}</li>) : <li className="faint">None identified</li>}</ul>
          </div>
        </div>
        {c.primarySources.length > 0 && (<><b>{c.category === 'established' ? 'Key studies' : 'Primary source (proponent’s own writing)'}</b><SourceLinks ids={c.primarySources} /></>)}
        <b>Independent sources</b>
        <SourceLinks ids={c.independentSources} />
        <p style={{ marginTop: 8 }}><b>Practical implication:</b> {c.practical}</p>
        <p style={{ marginBottom: 0 }}><b>Safety:</b> {c.safety}</p>
      </Disclosure>
    </article>
  );
}

export default function Archive({ params }: { params: URLSearchParams }) {
  const { settings } = useApp();
  const [view, setView] = useState<View>('cards');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cat, setCat] = useState<'all' | Category>('all');
  const [level, setLevel] = useState<'all' | Level>('all');
  const ev = settings.evidence;
  const minIdx = ev.minimumLevel === 'supported' ? 1 : ev.minimumLevel === 'preliminary' ? 2 : 4;

  const cards = useMemo(
    () =>
      CARDS.filter((c) => (cat === 'all' || c.category === cat))
        .filter((c) => (c.category !== 'peat' || ev.showPeat) && (c.category !== 'kruse' || ev.showKruse))
        .filter((c) => level === 'all' || c.level === level)
        .filter((c) => ev.minimumLevel === 'any' || LEVEL_ORDER.indexOf(c.level) <= minIdx)
        .filter((c) => matches(c, q)),
    [cat, level, q, ev.showPeat, ev.showKruse, ev.minimumLevel, minIdx],
  );

  const topics = ['light', 'circadian', 'uv', 'vitamin d', 'infrared', 'mitochondria', 'sleep', 'blue light', 'cortisol', 'metabolism'];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Knowledge Archive</span>
          <h1>Evidence, not slogans</h1>
          <p className="lede">Established science, Ray Peat’s ideas and Jack Kruse’s hypotheses — each clearly labelled, with sources and an explained rating.</p>
        </div>
      </div>
      <Notice tone="info">
        Educational content, not medical advice. Ideas from Ray Peat and Jack Kruse are presented as <b>their positions</b>, paraphrased with links to their own writing, and assessed against independent evidence. Following either is not necessary for health.
      </Notice>
      <Segmented<View> label="Archive view" value={view} onChange={setView} options={[{ value: 'cards', label: 'Cards' }, { value: 'compare', label: 'Compare' }, { value: 'sources', label: 'Sources' }, { value: 'method', label: 'Method' }]} />

      {view === 'cards' && (
        <>
          <Card className="flat">
            <label className="field">
              <span className="sr-only">Search the library</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Icon name="search" style={{ width: 20, height: 20, flex: 'none', color: 'var(--text-3)' }} />
                <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: infrared, cortisol, vitamin D, screens…" />
              </div>
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              {topics.map((t) => <button key={t} type="button" className="btn sm" aria-pressed={q === t} onClick={() => setQ(q === t ? '' : t)}>{t}</button>)}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Segmented<'all' | Category> label="Category" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, { value: 'established', label: 'Science' }, { value: 'peat', label: 'Peat' }, { value: 'kruse', label: 'Kruse' }]} />
              <select className="input" style={{ maxWidth: 240 }} aria-label="Evidence level" value={level} onChange={(e) => setLevel(e.target.value as 'all' | Level)}>
                <option value="all">All evidence levels</option>
                {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
            </div>
            {(!ev.showPeat || !ev.showKruse || ev.minimumLevel !== 'any') && <p className="xs faint" style={{ marginTop: 8, marginBottom: 0 }}>Some cards are hidden by your evidence preferences in Settings.</p>}
          </Card>
          <p className="small muted" aria-live="polite" style={{ margin: 0 }}>{cards.length} card{cards.length === 1 ? '' : 's'}</p>
          {cards.length === 0 ? <p className="muted">No cards match. Try another search term.</p> : (
            <div className="grid-2">{cards.map((c) => <EvidenceView key={c.id} c={c} />)}</div>
          )}
        </>
      )}

      {view === 'compare' && (
        <Card eyebrow="Side by side" title="Where the views meet and part">
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Topic</th><th>Established science</th><th>Ray Peat</th><th>Jack Kruse</th></tr></thead>
              <tbody>
                {[
                  ['Morning light', 'light-timing', null, 'kruse-am-light'],
                  ['Evening / night light', 'melanopic-recs', 'peat-darkness', 'kruse-evening-blue'],
                  ['Blue light & disease', 'blue-glasses', 'peat-eyes', 'kruse-blue-disease'],
                  ['Red / infrared & mitochondria', 'pbm', 'peat-light-respiration', 'kruse-biophotons'],
                  ['Vitamin D', 'vitamin-d', null, 'kruse-vitd'],
                  ['Metabolism', null, 'peat-thyroid', 'kruse-cold'],
                ].map(([topic, a, b, c]) => (
                  <tr key={topic}>
                    <td><b>{topic}</b></td>
                    {[a, b, c].map((id, i) => {
                      const card = id ? CARDS.find((x) => x.id === id) : null;
                      return (
                        <td key={i}>
                          {card ? (
                            <a href={`#/archive`} onClick={(e) => { e.preventDefault(); setView('cards'); setQ(''); setCat(card.category); setTimeout(() => document.getElementById(`ev-${card.id}`)?.scrollIntoView({ behavior: 'smooth' }), 50); }}>
                              <span className={`level ${LEVEL_CLASS[card.level]}`}>{LEVEL_LABEL[card.level]}</span>
                              <div className="xs" style={{ marginTop: 4 }}>{card.claim}</div>
                            </a>
                          ) : <span className="faint xs">No specific card</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === 'sources' && (
        <Card eyebrow={`${SOURCES.length} entries`} title="Source registry">
          <p className="small muted">Every source cited in the archive. “Verified” means the citation was located and checked online while this version was built; others are well-known citations that should be confirmed before you rely on them.</p>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Source</th><th>Type</th><th>Year</th><th>Supports cards</th><th>Check</th></tr></thead>
              <tbody>
                {SOURCES.map((s) => {
                  const used = CARDS.filter((c) => c.primarySources.includes(s.id) || c.independentSources.includes(s.id));
                  return (
                    <tr key={s.id}>
                      <td><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a><div className="xs faint">{s.authors} · {s.venue}</div>{s.note && <div className="xs faint">{s.note}</div>}</td>
                      <td className="xs">{SOURCE_TYPE_LABEL[s.type]}</td>
                      <td className="n">{s.year ?? '—'}</td>
                      <td className="xs">{used.length ? used.map((c) => c.id).join(', ') : <span className="faint">app methodology</span>}</td>
                      <td className="xs">{s.verified ? 'Verified' : <span className="faint">Not re-verified</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === 'method' && (
        <Card eyebrow="How ratings work" title="Method & limits">
          <ul className="list">
            {LEVEL_ORDER.map((l) => (
              <li key={l}><span className={`level ${LEVEL_CLASS[l]}`}>{LEVEL_LABEL[l]}</span> <span className="small muted" style={{ marginLeft: 8 }}>{LEVEL_DEFINITION[l]}</span></li>
            ))}
          </ul>
          <Disclosure summary="Why no numeric confidence scores?" open>
            A number like “73% confidence” implies a quantitative method that does not exist here. Ratings are qualitative judgements with written reasons, so you can disagree with them on the merits.
          </Disclosure>
          <Disclosure summary="How proponents are represented">
            Positions are paraphrased — not quoted — and linked to the authors’ own websites so you can read their full reasoning. Where an attribution relies on secondary summaries, the card says so.
          </Disclosure>
          <Disclosure summary="What is incomplete">
            This is a curated starting library, not a systematic review. Coverage of both authors’ large bodies of work is partial; several citations are marked as not re-verified in this build; and the evidence base changes. Treat it as a map for further reading.
          </Disclosure>
        </Card>
      )}
    </div>
  );
}
