import { useEffect, useState } from 'react';
import type { IconName } from './components/Icon';

export type Route =
  | 'command' | 'explorer' | 'planner' | 'circadian' | 'spectrum' | 'journal' | 'archive' | 'settings' | 'more';

export interface NavItem { route: Route; label: string; short: string; icon: IconName }

export const NAV: NavItem[] = [
  { route: 'command', label: 'Solar Command Center', short: 'Today', icon: 'sun' },
  { route: 'explorer', label: 'Solar Explorer', short: 'Sky', icon: 'sky' },
  { route: 'planner', label: 'Exposure Planner', short: 'Plan', icon: 'plan' },
  { route: 'circadian', label: 'Circadian Studio', short: 'Rhythm', icon: 'rhythm' },
  { route: 'journal', label: 'Solar Journal', short: 'Journal', icon: 'journal' },
  { route: 'spectrum', label: 'Spectrum Lab', short: 'Spectrum', icon: 'prism' },
  { route: 'archive', label: 'Knowledge Archive', short: 'Archive', icon: 'archive' },
  { route: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];

/** Bottom tab bar on iPhone: five primary screens plus "More". */
export const TABS: NavItem[] = [...NAV.slice(0, 5), { route: 'more', label: 'More', short: 'More', icon: 'more' }];

const ROUTES = new Set<Route>([...NAV.map((n) => n.route), 'more']);

export function parseHash(hash: string): { route: Route; params: URLSearchParams } {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const route = (path || 'command') as Route;
  return { route: ROUTES.has(route) ? route : 'command', params: new URLSearchParams(query) };
}

export function href(route: Route, params?: Record<string, string>): string {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${route === 'command' ? '' : route}${q}`;
}

export function navigate(route: Route, params?: Record<string, string>) {
  window.location.hash = href(route, params);
}

export function useRoute() {
  const [state, setState] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setState(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return state;
}
