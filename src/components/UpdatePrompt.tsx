import { useEffect, useState } from 'react';

/**
 * Registers the service worker (app-shell caching for offline use) and offers
 * a reload when a new version has been downloaded.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => Promise<void>)>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const updateSW = registerSW({
          onNeedRefresh() {
            setUpdate(() => () => updateSW(true));
          },
        });
      })
      .catch(() => {
        /* offline support unavailable — the app still works online */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!update) return null;
  return (
    <div className="toast" role="status" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span>A new version of Tengri Solar is ready.</span>
      <button type="button" className="btn sm primary" onClick={() => void update()}>Reload</button>
      <button type="button" className="btn sm ghost" onClick={() => setUpdate(null)}>Later</button>
    </div>
  );
}
