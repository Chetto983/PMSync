import { useSyncExternalStore, useCallback } from 'react';
import { pushApi } from '@/lib/api/push';

// --- Types ---
interface PushState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
}

// --- Module-level state ---
let currentSubscription: PushSubscription | null = null;
let permissionState: NotificationPermission = 'default';
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

// --- Feature detection ---
function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;

  // On iOS, push is only supported in standalone (installed) mode
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    const isStandalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) return false;
  }

  return true;
}

// --- useSyncExternalStore contract ---
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

let cachedSnapshot: PushState = {
  isSupported: false,
  isSubscribed: false,
  permission: 'default',
};

function getSnapshot(): PushState {
  const isSupported = isPushSupported();
  const isSubscribed = currentSubscription !== null;
  const permission =
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : permissionState;

  if (
    cachedSnapshot.isSupported !== isSupported ||
    cachedSnapshot.isSubscribed !== isSubscribed ||
    cachedSnapshot.permission !== permission
  ) {
    cachedSnapshot = { isSupported, isSubscribed, permission };
  }
  return cachedSnapshot;
}

const serverSnapshot: PushState = {
  isSupported: false,
  isSubscribed: false,
  permission: 'default' as const,
};

export function getServerSnapshot(): PushState {
  return serverSnapshot;
}

// --- Init push state at module scope ---
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        currentSubscription = sub;
        if ('Notification' in window) {
          permissionState = Notification.permission;
        }
        notify();
      })
      .catch(() => {
        /* SW not ready or pushManager unavailable */
      });
  } catch {
    /* serviceWorker not available */
  }
}

// --- Hook ---
export function usePushSubscription() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const subscribeToPush = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const permission = await Notification.requestPermission();
    permissionState = permission;

    if (permission !== 'granted') {
      notify();
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY ?? '';
    // Convert base64url to Uint8Array — pushManager requires this in all browsers
    const raw = atob(vapidKey.replace(/-/g, '+').replace(/_/g, '/'));
    const key = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });

    const json = sub.toJSON();
    await pushApi.subscribe({
      endpoint: sub.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
    });

    currentSubscription = sub;
    notify();
  }, []);

  const unsubscribeFromPush = useCallback(async () => {
    if (!currentSubscription) return;

    const endpoint = currentSubscription.endpoint;
    await currentSubscription.unsubscribe();
    await pushApi.unsubscribe(endpoint);

    currentSubscription = null;
    notify();
  }, []);

  return {
    ...state,
    subscribeToPush,
    unsubscribeFromPush,
  };
}

/** @internal Reset module state for testing only */
export function _resetForTesting(): void {
  currentSubscription = null;
  permissionState = 'default';
  listeners.clear();
  cachedSnapshot = {
    isSupported: false,
    isSubscribed: false,
    permission: 'default',
  };
}
