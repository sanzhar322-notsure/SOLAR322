import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, OrnamentBand, type IconName } from './Icon';
import { KIND_LABEL, type DataKind } from '../lib/data/types';
import { createStore } from '../lib/storage/persist';

export function Card({ children, className = '', title, eyebrow, actions, id }: {
  children: ReactNode; className?: string; title?: ReactNode; eyebrow?: string; actions?: ReactNode; id?: string;
}) {
  const hid = useId();
  return (
    <section className={`card ${className}`} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || actions) && (
        <div className="card-head">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2 id={hid}>{title}</h2>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type BadgeKind = DataKind | 'stale' | 'unavailable' | 'error';

export function Badge({ kind, children, title }: { kind: BadgeKind; children?: ReactNode; title?: string }) {
  const label = children ?? (kind === 'stale' ? 'Stale' : kind === 'unavailable' ? 'Unavailable' : kind === 'error' ? 'Error' : KIND_LABEL[kind]);
  return <span className={`badge ${kind}`} title={title}>{label}</span>;
}

export function Stat({ label, value, unit, kind, foot, stale, title }: {
  label: string; value: ReactNode | null | undefined; unit?: string; kind?: BadgeKind; foot?: ReactNode; stale?: boolean; title?: string;
}) {
  const missing = value == null || value === '';
  return (
    <div className={`stat ${missing ? 'unavailable' : ''}`} title={title}>
      <div className="stat-label">{label}</div>
      <div className="stat-value display-num">
        {missing ? 'Unavailable' : value}
        {!missing && unit && <span className="unit">{unit}</span>}
      </div>
      {(kind || foot) && (
        <div className="stat-foot row">
          {missing ? <Badge kind="unavailable" /> : stale ? <Badge kind="stale" /> : kind ? <Badge kind={kind} /> : null}
          {foot && <span className="xs faint">{foot}</span>}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ScalePicker({ value, onChange, label, low, high }: {
  value: number | null; onChange: (v: number | null) => void; label: string; low?: string; high?: string;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="scale" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="row between xs faint"><span>{low}</span><span>{high}</span></div>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="switch">
      <label htmlFor={id} className="stack" style={{ gap: 2 }}>
        <span>{label}</span>
        {hint && <span className="xs faint">{hint}</span>}
      </label>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warn' | 'error'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon ?? (tone === 'info' ? 'info' : tone === 'warn' ? 'warn' : 'error')} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon = 'sun', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function Disclosure({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="disclosure" open={open}>
      <summary>{summary}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export function Divider() {
  return <OrnamentBand />;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hid = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const focusable = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
      (focusable ?? ref.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={hid} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 id={hid}>{title}</h2>
          <button type="button" className="btn icon ghost" onClick={onClose} aria-label="Close" data-close>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- toasts -----------------------------------------------------------------
const toastStore = createStore<{ id: number; text: string } | null>(null);
let toastTimer: number | undefined;
export function toast(text: string) {
  window.clearTimeout(toastTimer);
  toastStore.set({ id: Date.now(), text });
  toastTimer = window.setTimeout(() => toastStore.set(null), 3200);
}
export function ToastHost() {
  const t = useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get);
  return (
    <div aria-live="polite" aria-atomic="true">
      {t && <div className="toast" key={t.id}>{t.text}</div>}
    </div>
  );
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}
