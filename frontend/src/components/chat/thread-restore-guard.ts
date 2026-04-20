const MANUAL_NEW_THREAD_GUARD_MS = 15_000;
const LAST_ACTIVE_THREAD_STORAGE_KEY = 'pmsync:chat:last-thread-id';

let manualNewThreadRequestedAt = 0;

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function markManualNewThreadRequested(now = Date.now()) {
  manualNewThreadRequestedAt = now;
}

export function resetManualNewThreadRequested() {
  manualNewThreadRequestedAt = 0;
}

export function shouldSkipInitialThreadRestore(now = Date.now()) {
  if (!manualNewThreadRequestedAt) return false;
  return now - manualNewThreadRequestedAt < MANUAL_NEW_THREAD_GUARD_MS;
}

export function rememberLastActiveThreadId(threadId: string) {
  if (!threadId) return;
  getStorage()?.setItem(LAST_ACTIVE_THREAD_STORAGE_KEY, threadId);
}

export function getLastActiveThreadId() {
  return getStorage()?.getItem(LAST_ACTIVE_THREAD_STORAGE_KEY) ?? null;
}

export function clearLastActiveThreadId() {
  getStorage()?.removeItem(LAST_ACTIVE_THREAD_STORAGE_KEY);
}
