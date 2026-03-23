import { get, set, del, clear, keys, createStore } from 'idb-keyval';

const DB_NAME = 'pmsync-offline';
const STORE_NAME = 'pmsync-action-queue';
const actionStore = createStore(DB_NAME, STORE_NAME);

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_QUEUE_SIZE = 100;

export interface QueuedAction {
  id: string;
  type: 'update-email';
  emailId: string;
  dto: Record<string, unknown> | object;
  queuedAt: number;
}

export async function enqueueAction(
  action: Omit<QueuedAction, 'id' | 'queuedAt'>
): Promise<string> {
  // Dedup: if same emailId exists, merge dto fields
  const existing = await findByEmailId(action.emailId);
  if (existing) {
    const merged: QueuedAction = {
      ...existing,
      dto: { ...existing.dto, ...action.dto },
      queuedAt: Date.now(), // refresh timestamp on merge
    };
    await set(existing.id, merged, actionStore);
    return existing.id;
  }

  // Cap enforcement: if at MAX_QUEUE_SIZE, remove oldest
  const allKeys = await keys(actionStore);
  if (allKeys.length >= MAX_QUEUE_SIZE) {
    const all = await getAllActions();
    // Remove oldest (first in sorted array)
    if (all.length > 0) {
      await del(all[0].id, actionStore);
    }
  }

  const id = crypto.randomUUID();
  const entry: QueuedAction = { ...action, id, queuedAt: Date.now() };
  await set(id, entry, actionStore);
  return id;
}

export async function getAllActions(): Promise<QueuedAction[]> {
  const allKeys = await keys(actionStore);
  const actions: QueuedAction[] = [];
  for (const key of allKeys) {
    const action = await get<QueuedAction>(key, actionStore);
    if (action) actions.push(action);
  }
  return actions.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeAction(id: string): Promise<void> {
  await del(id, actionStore);
}

export async function clearActionQueue(): Promise<void> {
  await clear(actionStore);
}

export function isExpired(action: QueuedAction): boolean {
  return Date.now() - action.queuedAt > TTL_MS;
}

async function findByEmailId(emailId: string): Promise<QueuedAction | null> {
  const allKeys = await keys(actionStore);
  for (const key of allKeys) {
    const action = await get<QueuedAction>(key, actionStore);
    if (action && action.emailId === emailId) return action;
  }
  return null;
}

// Export for testing
export { actionStore, TTL_MS, MAX_QUEUE_SIZE };
