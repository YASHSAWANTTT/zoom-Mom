import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'arlo-zoom-momentum-enabled';

/**
 * Whether Zoom Momentum (professor mode) UI is shown in-meeting.
 * Merges GET /api/preferences (zoomMomentum.enabled) with localStorage for dev.
 */
export function useZoomMomentumPreferences(isAuthenticated) {
  const [enabled, setEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      /* ignore */
    }
    return false;
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    fetch('/api/preferences', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((prefs) => {
        if (cancelled) return;
        if (prefs?.zoomMomentum?.enabled === true) {
          setEnabled(true);
        } else if (prefs?.zoomMomentum?.enabled === false) {
          setEnabled(false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const persistEnabled = useCallback((next) => {
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (isAuthenticated) {
      fetch('/api/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoomMomentum: { enabled: next } }),
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  return { momentumEnabled: enabled, setMomentumEnabled: persistEnabled, momentumPrefsLoaded: loaded };
}
