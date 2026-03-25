import { useState, useEffect, useCallback } from 'react';

const DISMISS_KEY = 'pmsync:sw-update-dismissed';

export interface UseSwUpdateReturn {
  updateAvailable: boolean;
  activateUpdate: () => void;
  dismissUpdate: () => void;
}

export function useSwUpdate(): UseSwUpdateReturn {
  const [waitingSw, setWaitingSw] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Check if user already dismissed in this session
    if (sessionStorage.getItem(DISMISS_KEY)) {
      setDismissed(true); // eslint-disable-line react-hooks/set-state-in-effect -- reading sessionStorage, not cascading
      return;
    }

    let cancelled = false;

    async function checkForUpdate() {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || cancelled) return;

      // Already waiting?
      if (reg.waiting) {
        setWaitingSw(reg.waiting);
        return;
      }

      // Listen for new SW installing
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            if (!cancelled) setWaitingSw(installing);
          }
        });
      });
    }

    checkForUpdate();

    return () => { cancelled = true; };
  }, []);

  const activateUpdate = useCallback(() => {
    if (!waitingSw) {
      // No waiting SW — just hard reload
      window.location.reload();
      return;
    }
    waitingSw.postMessage({ type: 'SKIP_WAITING' });
    // Reload on controllerchange, with fallback timeout
    const fallbackTimer = setTimeout(() => {
      window.location.reload();
    }, 2000);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      clearTimeout(fallbackTimer);
      window.location.reload();
    }, { once: true });
  }, [waitingSw]);

  const dismissUpdate = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, '1');
  }, []);

  return { updateAvailable: !!waitingSw && !dismissed, activateUpdate, dismissUpdate };
}

/** @internal Reset for testing */
export function _resetForTesting(): void {
  // Hook uses useState, so reset happens naturally on unmount
}
