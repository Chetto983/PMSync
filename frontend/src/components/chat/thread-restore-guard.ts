const MANUAL_NEW_THREAD_GUARD_MS = 15_000;

let manualNewThreadRequestedAt = 0;

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
