import { useState, useEffect, useCallback } from 'react';

export interface UseSwUpdateReturn {
  updateAvailable: boolean;
  activateUpdate: () => void;
}

export function useSwUpdate(): UseSwUpdateReturn {
  const [waitingSw, setWaitingSw] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

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
    if (!waitingSw) return;
    waitingSw.postMessage({ type: 'SKIP_WAITING' });
    // Reload on controllerchange
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }, [waitingSw]);

  return { updateAvailable: !!waitingSw, activateUpdate };
}

/** @internal Reset for testing */
export function _resetForTesting(): void {
  // Hook uses useState, so reset happens naturally on unmount
}
