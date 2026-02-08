/**
 * Agent Pool Cache with TTL and Max Size
 *
 * Shared utility for tool agent pools to prevent unbounded memory growth.
 * Tool agents are stateless per-call (no conversation history), so TTL eviction is safe.
 *
 * Environment variables:
 * - AI_AGENT_POOL_MAX_SIZE: Maximum agents cached (default: 50)
 * - AI_AGENT_POOL_TTL_MS: Time-to-live in milliseconds (default: 30 min)
 */

const MAX_POOL_SIZE = parseInt(process.env.AI_AGENT_POOL_MAX_SIZE || '50', 10);
const TTL_MS = parseInt(process.env.AI_AGENT_POOL_TTL_MS || String(30 * 60 * 1000), 10);

interface CachedAgent {
  agentId: string;
  createdAt: number;
}

/**
 * Get an agent from the pool, checking TTL expiration.
 * Returns null if not found or expired.
 */
export function getAgentFromPool(
  pool: Map<string, CachedAgent>,
  key: string,
): string | null {
  const cached = pool.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.createdAt;
  if (age > TTL_MS) {
    // Expired
    pool.delete(key);
    return null;
  }

  return cached.agentId;
}

/**
 * Set an agent in the pool, enforcing max size limit.
 * Evicts oldest entry if pool is full.
 */
export function setAgentInPool(
  pool: Map<string, CachedAgent>,
  key: string,
  agentId: string,
): void {
  // Evict oldest if at max size
  if (pool.size >= MAX_POOL_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [k, v] of pool.entries()) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      pool.delete(oldestKey);
    }
  }

  pool.set(key, { agentId, createdAt: Date.now() });
}

/**
 * Clear an agent from the pool.
 */
export function clearAgentFromPool(pool: Map<string, CachedAgent>, key: string): void {
  pool.delete(key);
}

/**
 * Get pool stats for debugging/monitoring.
 */
export function getPoolStats(pool: Map<string, CachedAgent>) {
  const now = Date.now();
  let expired = 0;

  for (const entry of pool.values()) {
    if (now - entry.createdAt > TTL_MS) {
      expired++;
    }
  }

  return {
    size: pool.size,
    maxSize: MAX_POOL_SIZE,
    ttlMs: TTL_MS,
    expired,
  };
}
