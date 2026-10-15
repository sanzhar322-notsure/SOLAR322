import { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './state/app';
import { NAV, TABS, href, useRoute, type Route } from './router';
import { BrandMark, Icon } from './components/Icon';
import { DataStatus } from './components/DataStatus';
import { Skeleton, ToastHost } from './components/ui';
import { UpdatePrompt } from './components/UpdatePrompt';
import { CommandCenter } from './screens/CommandCenter';

const Explorer = lazy(() => import('./screens/Explorer'));
const Planner = lazy(() => import('./screens/Planner'));
const Circadian = lazy(() => import('./screens/Circadian'));
const Spectrum = lazy(() => import('./screens/Spectrum'));
const Philosophy = lazy(() => import('./screens/Philosophy'));
const Journal = lazy(() => import('./screens/Journal'));
const Archive = lazy(() => import('./screens/Archive'));
const SettingsScreen = lazy(() => import('./screens/Settings'));
const More = lazy(() => import('./screens/More'));

function Screen({ route, params }: { route: Route; params: URLSearchParams }) {
  switch (route) {
    case 'explorer': return <Explorer />;
    case 'planner': return <Planner />;
    case 'circadian': return <Circadian />;
    case 'spectrum': return <Spectrum />;
    case 'philosophy': return <Philosophy params={params} />;
    case 'journal': return <Journal params={params} />;
    case 'archive': return <Archive params={params} />;
    case 'settings': return <SettingsScreen />;
    case 'more': return <More />;
    default: return <CommandCenter />;
  }
}

function Shell() {
  const { route, params } = useRoute();
  const { loc } = useApp();
  const active = (r: Route) => (r === route || (r === 'more' && ['spectrum', 'philosophy', 'archive', 'settings', 'more'].includes(route)) ? 'page' : undefined);
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="rail" aria-label="Main">
        <div className="brand">
          <BrandMark className="brand-mark" />
          <div className="brand-text">
            <span className="brand-title">TENGRI SOLAR</span>
            <span className="brand-sub">Eternal Blue Sky</span>
          </div>
        </div>
        {NAV.map((n) => (
          <a key={n.route} className="rail-link" href={href(n.route)} aria-current={n.route === route ? 'page' : undefined} title={n.label}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
        <div className="rail-foot">
          Weather data: Open-Meteo (CC BY 4.0). Sun positions calculated on this device.
        </div>
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        <header className="topbar">
          <div className="brand">
            <BrandMark className="brand-mark" />
            <div className="brand-text">
              <span className="brand-title">TENGRI SOLAR</span>
              <span className="brand-sub">{loc ? loc.name : 'Eternal Blue Sky'}</span>
            </div>
          </div>
          <div className="topbar-status"><DataStatus compact /></div>
        </header>
        <Suspense fallback={<div className="stack"><Skeleton h={40} w="50%" /><Skeleton h={240} /><Skeleton h={120} /></div>}>
          <Screen route={route} params={params} />
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((n) => (
          <a key={n.route} className="tab" href={href(n.route)} aria-current={active(n.route)} aria-label={n.label}>
            <Icon name={n.icon} />
            <span>{n.short}</span>
          </a>
        ))}
      </nav>
      <ToastHost />
      <UpdatePrompt />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
