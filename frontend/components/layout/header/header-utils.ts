import { multiAgentApi } from '@/lib/api/ai';

// Module-level throttle to prevent duplicate getPendingActions calls (React StrictMode double-fires effects)
let lastPendingActionsFetch = 0;
let pendingActionsFetchPromise: Promise<{ total: number }> | null = null;
const PENDING_ACTIONS_THROTTLE = 10_000; // 10 seconds

export async function throttledGetPendingActions(): Promise<{ total: number }> {
  if (pendingActionsFetchPromise) return pendingActionsFetchPromise;
  if (Date.now() - lastPendingActionsFetch < PENDING_ACTIONS_THROTTLE) {
    return { total: -1 }; // -1 = skip update
  }
  pendingActionsFetchPromise = (async () => {
    const response = await multiAgentApi.getPendingActions({ status: 'PENDING' });
    lastPendingActionsFetch = Date.now();
    const data = response.data;
    return { total: data?.total ?? data?.actions?.length ?? 0 };
  })();
  try {
    return await pendingActionsFetchPromise;
  } finally {
    pendingActionsFetchPromise = null;
  }
}
