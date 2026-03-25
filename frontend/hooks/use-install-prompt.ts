import { useSyncExternalStore, useCallback } from 'react';

// --- Types ---
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

export interface UseInstallPromptReturn {
  shouldShow: boolean;
  isIOS: boolean;
  triggerInstall: () => Promise<'accepted' | 'dismissed' | null>;
  dismiss: () => void;
}

// --- Constants ---
const DISMISS_KEY = 'pmsync:install-prompt-dismissed';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- Module-level state ---
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

// Register event listeners at module scope (captures early-firing events)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

// --- Helper functions ---
/* eslint-disable @typescript-eslint/no-require-imports */
const UAParser = typeof window !== 'undefined'
  ? (require('ua-parser-js') as { new (ua: string): { getOS(): { name?: string } } })
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */

function getIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    'standalone' in navigator &&
    (navigator as unknown as { standalone?: boolean }).standalone
  ) {
    return true;
  }
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return false;
}

function getIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  if (UAParser) {
    const parser = new UAParser(navigator.userAgent);
    if (parser.getOS().name === 'iOS') return true;
  }
  // Supplemental iPadOS detection (reports as MacIntel with touch)
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

function isDismissedByUser(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    const timestamp = parseInt(dismissed, 10);
    return Date.now() - timestamp < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function dismissPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch {
    /* localStorage unavailable */
  }
}

// --- useSyncExternalStore contract ---
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

// Cached snapshot for referential stability
interface Snapshot {
  shouldShow: boolean;
  isIOS: boolean;
}

let cachedSnapshot: Snapshot = { shouldShow: false, isIOS: false };

function getSnapshot(): Snapshot {
  const isIOS = getIsIOS();
  const isStandalone = getIsStandalone();
  const isDismissed = isDismissedByUser();
  const shouldShow =
    !installed && !isStandalone && !isDismissed && (deferredPrompt !== null || isIOS);

  if (
    cachedSnapshot.shouldShow !== shouldShow ||
    cachedSnapshot.isIOS !== isIOS
  ) {
    cachedSnapshot = { shouldShow, isIOS };
  }
  return cachedSnapshot;
}

const serverSnapshot: Snapshot = { shouldShow: false, isIOS: false };

function getServerSnapshot(): Snapshot {
  return serverSnapshot;
}

// --- Hook ---
export function useInstallPrompt(): UseInstallPromptReturn {
  const { shouldShow, isIOS } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const triggerInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | null
  > => {
    if (!deferredPrompt) return null;
    const result = await deferredPrompt.prompt();
    deferredPrompt = null;
    notify();
    return result.outcome;
  }, []);

  const dismiss = useCallback((): void => {
    dismissPrompt();
    notify();
  }, []);

  return { shouldShow, isIOS, triggerInstall, dismiss };
}

/** @internal Reset module state for testing only */
export function _resetForTesting(): void {
  deferredPrompt = null;
  installed = false;
  listeners.clear();
  cachedSnapshot = { shouldShow: false, isIOS: false };
}
