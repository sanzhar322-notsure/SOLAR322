/** Custom line icons drawn for TENGRI SOLAR (1.6 stroke, round caps). */
import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'sun' | 'sky' | 'plan' | 'rhythm' | 'journal' | 'prism' | 'archive' | 'settings' | 'more'
  | 'refresh' | 'pin' | 'locate' | 'info' | 'warn' | 'error' | 'plus' | 'close' | 'check'
  | 'download' | 'upload' | 'trash' | 'calendar' | 'search' | 'chevron' | 'eye' | 'moon'
  | 'cloud' | 'drop' | 'wind' | 'thermo' | 'shield' | 'flask' | 'edit' | 'bell' | 'offline' | 'shanyrak' | 'history';

const P: Record<IconName, ReactElement> = {
  sun: (<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></>),
  sky: (<><path d="M3 17h18" /><path d="M5 17a7 7 0 0 1 14 0" /><circle cx="15.5" cy="11" r="1.8" /><path d="M12 4v2M6.2 6.6l1.3 1.3M17.8 6.6l-1.3 1.3" /></>),
  plan: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /><path d="M12 3v1.5M21 12h-1.5M12 21v-1.5M3 12h1.5" /></>),
  rhythm: (<><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" /><path d="M15.5 4.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7Z" /></>),
  journal: (<><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5v-16Z" /><path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19v-3" /><path d="M9 7.5h6M9 11h4" /></>),
  prism: (<><path d="M12 3 3.5 19h17L12 3Z" /><path d="M1.5 12.5 9 12M15 11l7.5-2.5M15.5 12.5l7 1M15 14l6.5 4" /></>),
  archive: (<><path d="M4 7h16v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5V7Z" /><path d="M2.5 3.5h19V7h-19z" /><path d="M10 11h4" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>),
  more: (<><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 20.5V16h-4.5" /></>),
  pin: (<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>),
  locate: (<><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></>),
  warn: (<><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.5M12 17v.2" /></>),
  error: (<><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></>),
  plus: (<path d="M12 5v14M5 12h14" />),
  close: (<path d="M6 6l12 12M18 6 6 18" />),
  check: (<path d="M4.5 12.5l5 5 10-11" />),
  download: (<><path d="M12 3v12" /><path d="M7 10.5l5 5 5-5" /><path d="M4 20h16" /></>),
  upload: (<><path d="M12 16V4" /><path d="M7 8.5l5-5 5 5" /><path d="M4 20h16" /></>),
  trash: (<><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></>),
  calendar: (<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  chevron: (<path d="M9 5.5 15.5 12 9 18.5" />),
  eye: (<><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  moon: (<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />),
  cloud: (<path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.4 9.1 4.7 4.7 0 0 0 7 18.5Z" />),
  drop: (<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" />),
  wind: (<><path d="M3 9h11a3 3 0 1 0-3-3" /><path d="M3 13h15a3 3 0 1 1-3 3" /><path d="M3 17h7" /></>),
  thermo: (<><path d="M10 13.6V5a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0Z" /><path d="M12 9v6.5" /></>),
  shield: (<><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="M9 12l2.2 2.2L15.5 10" /></>),
  flask: (<><path d="M9.5 3h5M10 3v6L4.8 18.1A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.9L14 9V3" /><path d="M7.5 14.5h9" /></>),
  edit: (<><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14.5 7.5l2 2" /></>),
  bell: (<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  shanyrak: (<><circle cx="12" cy="12" r="9" /><path d="M4.6 8.6c2.4.9 4.4 1 7.4 1s5-.1 7.4-1M4.6 15.4c2.4-.9 4.4-1 7.4-1s5 .1 7.4 1M8.6 4.6c.9 2.4 1 4.4 1 7.4s-.1 5-1 7.4M15.4 4.6c-.9 2.4-1 4.4-1 7.4s.1 5 1 7.4" /></>),
  history: (<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8" /><path d="M12 7.5V12l3 2" /></>),
  offline: (<><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 4.2-2.4M19 12.6a10 10 0 0 0-3-2M2 9a15 15 0 0 1 4.3-2.7M22 9a15 15 0 0 0-10-3.9" /><circle cx="12" cy="20" r="0.6" /></>),
};

export function Icon({ name, title, ...rest }: { name: IconName; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {P[name]}
    </svg>
  );
}

/**
 * Brand mark: a shanyrak (the crown ring of the yurt, through which the sky
 * is seen) framing a solar disk — the Eternal Blue Sky above the steppe.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="bm-sky" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3d8bd8" />
          <stop offset="100%" stopColor="#0d2357" />
        </radialGradient>
        <radialGradient id="bm-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3cf" />
          <stop offset="60%" stopColor="#f2c86e" />
          <stop offset="100%" stopColor="#e0a43a" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bm-sky)" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#e0a43a" strokeWidth="2" />
      <circle cx="32" cy="32" r="9.5" fill="url(#bm-sun)" />
      <g fill="none" stroke="#f2c86e" strokeWidth="2" strokeLinecap="round" opacity="0.9">
        <path d="M14 22c6 2 10 2 18 2s12 0 18-2" />
        <path d="M14 42c6-2 10-2 18-2s12 0 18 2" />
        <path d="M22 14c2 6 2 10 2 18s0 12-2 18" />
        <path d="M42 14c-2 6-2 10-2 18s0 12 2 18" />
      </g>
    </svg>
  );
}

/** Koshkar-muiz (ram's horn) scroll — a repeating Kazakh ornament band. */
export function OrnamentBand({ className = 'ornament' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 14" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="koshkar" width="24" height="14" patternUnits="userSpaceOnUse">
          <path
            d="M0 7h4c2.5 0 4-1.6 4-3.4C8 2.2 7 1.3 5.8 1.3 4.6 1.3 4 2.1 4 3s.7 1.5 1.4 1.5M24 7h-4c-2.5 0-4-1.6-4-3.4 0-1.4 1-2.3 2.2-2.3 1.2 0 1.8.8 1.8 1.7s-.7 1.5-1.4 1.5M8 7c0 2 1.8 3.5 4 3.5s4-1.5 4-3.5M12 10.5V13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <rect width="240" height="14" fill="url(#koshkar)" />
    </svg>
  );
}
