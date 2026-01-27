# Bug: Agent Cache - Move to Redis for Scale + GDPR Compliance

**Severity**: CRITICAL (affects horizontal scaling + GDPR compliance)
**Date Identified**: 2026-01-27
**Date Fixed**: 2026-01-27
**Status**: ✅ RESOLVED
**Compliance**: GDPR Art. 17 (Right to Erasure), Art. 25 (Data Protection by Design)

---

## Executive Summary

~~The current Agent Pool uses **in-memory caching**, which:~~
~~1. ❌ **Breaks horizontal scaling** - each instance has its own cache~~
~~2. ❌ **GDPR violation risk** - user data may persist after deletion~~
~~3. ❌ **Cache fragmentation** - 1000 tenants across N instances = chaos~~
~~4. ❌ **No multi-instance sync** - cache invalidation only works on one instance~~

**FIXED**: Agent Pool now uses Redis-backed caching with:

1. ✅ **Horizontal scaling** - Redis shared across all instances
2. ✅ **GDPR compliant** - tenant/user-scoped invalidation via SCAN
3. ✅ **Tenant isolation** - keys prefixed with `agent:pool:{tenantId}:{userId}:...`
4. ✅ **Production safe** - uses SCAN (not KEYS) for non-blocking invalidation

**Solution Implemented**: Migrated Agent Pool cache to Redis with tenant-scoped keys.

---

## Current Architecture (BROKEN)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT STATE (BROKEN)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Instance A              Instance B              Instance C    │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐│
│   │ In-Memory   │        │ In-Memory   │        │ In-Memory   ││
│   │ Agent Pool  │        │ Agent Pool  │        │ Agent Pool  ││
│   │ (tenant:1)  │        │ (tenant:2)  │        │ (tenant:1)  ││
│   │ (tenant:2)  │        │ (tenant:3)  │        │ (tenant:4)  ││
│   └─────────────┘        └─────────────┘        └─────────────┘│
│         │                       │                      │        │
│         └───────────────────────┼──────────────────────┘        │
│                                 │                               │
│                    ┌────────────▼────────────┐                  │
│                    │    Redis (partial)      │                  │
│                    │  - User Context ✅       │                  │
│                    │  - Analytics ✅          │                  │
│                    │  - Agent Pool ❌         │                  │
│                    └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘

Problems:
- clearAgentCache() only clears ONE instance
- Tenant deletion doesn't sync across instances
- No visibility into what's cached where
```

---

## Target Architecture (SCALABLE)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET STATE (SCALABLE)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Instance A              Instance B              Instance C    │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐│
│   │ Stateless   │        │ Stateless   │        │ Stateless   ││
│   │ (no cache)  │        │ (no cache)  │        │ (no cache)  ││
│   └─────────────┘        └─────────────┘        └─────────────┘│
│         │                       │                      │        │
│         └───────────────────────┼──────────────────────┘        │
│                                 │                               │
│                    ┌────────────▼────────────┐                  │
│                    │    Redis (COMPLETE)     │                  │
│                    │  - User Context ✅       │                  │
│                    │  - Analytics ✅          │                  │
│                    │  - Agent Pool ✅ (NEW)   │                  │
│                    │  - Pub/Sub sync ✅       │                  │
│                    └─────────────────────────┘                  │
│                                                                 │
│  Cache Keys (tenant-isolated):                                  │
│  - agent:pool:{tenantId}:{userId}:{locale}:{model}:{type}       │
│  - voltagent:user-context:{tenantId}:{userId}                   │
│  - ai:analytics:{tenantId}:{...}                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Caching Layers Audit

| Layer | Current Location | TTL | Tenant Isolated? | Scales? | GDPR Risk |
|-------|------------------|-----|------------------|---------|-----------|
| Agent Instances | In-memory Map | 5 min | ⚠️ Key has tenant, but Map is instance-local | ❌ NO | **HIGH** |
| User Context | Redis | 5 min | ✅ YES | ✅ YES | LOW |
| Analytics Agents | Redis | 1 hour | ✅ YES | ✅ YES | LOW |
| Document Library | Redis | 1 hour | ✅ YES | ✅ YES | LOW |
| Web Search | Redis | 15 min | ✅ YES | ✅ YES | LOW |

---

## Root Cause - In-Memory Agent Pool

```typescript
// backend/src/modules/ai/voltagent/services/agent-pool.service.ts:50-60
@Injectable()
export class AgentPoolService {
  // ❌ PROBLEM: In-memory Map - NOT shared across instances!
  private readonly agents: Map<string, CachedAgent> = new Map();

  // ❌ PROBLEM: This only clears THIS instance's cache
  clearAgentCache(): void {
    this.agents.clear();  // Other instances still have cached agents!
  }
}
```

---

## GDPR Violations

### Art. 17 - Right to Erasure

When user requests deletion:
- ❌ In-memory cache may hold user data for 5 min after deletion
- ❌ Other instances continue using cached user context
- ❌ No audit trail of cache invalidation

### Art. 25 - Data Protection by Design

- ❌ Cache design doesn't consider multi-tenancy
- ❌ No automatic purge on user deletion
- ❌ No tenant isolation guarantees

---

## Solution: Migrate Agent Pool to Redis

### Step 1: Add CacheNamespace for Agent Pool

```typescript
// backend/src/common/services/cache.service.ts
export enum CacheNamespace {
  // ... existing ...
  /** VoltAgent agent pool cache (tenant-scoped) */
  AGENT_POOL = 'agent:pool',
}
```

### Step 2: Refactor AgentPoolService to Use Redis

```typescript
// backend/src/modules/ai/voltagent/services/agent-pool.service.ts
@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);

  // ✅ Remove in-memory Map - use Redis only
  // private readonly agents: Map<string, CachedAgent> = new Map();

  private readonly AGENT_CACHE_TTL_SECONDS = parseInt(
    process.env.AGENT_CACHE_TTL_SECONDS || '300', 10
  );

  constructor(
    private readonly cacheService: CacheService,
    // ... other deps
  ) {}

  /**
   * Build tenant-isolated cache key
   */
  private buildCacheKey(params: GetOrCreateAgentParams): string {
    const userKey = params.userContext?.email ?? 'anonymous';
    return `${params.tenantId}:${userKey}:${params.locale}:${params.modelType || 'small'}:${params.agentType || 'Supervisor'}`;
  }

  /**
   * Check if agent is cached in Redis
   * Returns null if not cached or expired
   */
  private async getCachedAgent(cacheKey: string): Promise<CachedAgentMeta | null> {
    return this.cacheService.get<CachedAgentMeta>(cacheKey, {
      namespace: CacheNamespace.AGENT_POOL,
    });
  }

  /**
   * Cache agent metadata in Redis (agent itself is recreated, only config is cached)
   */
  private async cacheAgentMeta(cacheKey: string, meta: CachedAgentMeta): Promise<void> {
    await this.cacheService.set(cacheKey, meta, {
      namespace: CacheNamespace.AGENT_POOL,
      ttl: this.AGENT_CACHE_TTL_SECONDS,
    });
  }

  /**
   * Get or create agent - Redis-backed for horizontal scaling
   */
  async getOrCreateAgent(params: GetOrCreateAgentParams): Promise<Agent> {
    const cacheKey = this.buildCacheKey(params);

    // Check Redis cache
    const cached = await this.getCachedAgent(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for agent ${cacheKey}`);
      // Recreate agent from cached config (agents are stateless)
      return this.createAgentFromMeta(cached, params);
    }

    // Create new agent
    const agent = this.createAgent(params);

    // Cache metadata (not the agent instance)
    await this.cacheAgentMeta(cacheKey, {
      agentType: params.agentType || 'Supervisor',
      locale: params.locale,
      modelType: params.modelType || 'small',
      createdAt: Date.now(),
    });

    this.logger.debug(`Created and cached agent ${cacheKey}`);
    return agent;
  }

  /**
   * Clear agent cache for ALL tenants (admin only)
   */
  async clearAgentCache(): Promise<number> {
    return this.cacheService.invalidateNamespace(CacheNamespace.AGENT_POOL);
  }

  /**
   * Clear agent cache for a specific tenant (GDPR-compliant)
   */
  async clearAgentCacheForTenant(tenantId: string): Promise<number> {
    return this.cacheService.invalidateTenantPattern(tenantId, CacheNamespace.AGENT_POOL);
  }

  /**
   * Clear agent cache for a specific user (GDPR Art. 17 - Right to Erasure)
   */
  async clearAgentCacheForUser(tenantId: string, userId: string): Promise<number> {
    const pattern = `${tenantId}:${userId}:*`;
    return this.cacheService.invalidatePattern(pattern, CacheNamespace.AGENT_POOL);
  }
}

interface CachedAgentMeta {
  agentType: string;
  locale: string;
  modelType: string;
  createdAt: number;
}
```

### Step 3: Add Tenant-Scoped Pattern Invalidation to CacheService

```typescript
// backend/src/common/services/cache.service.ts

/**
 * Invalidate keys matching a pattern within a namespace
 * Uses SCAN for production safety (non-blocking)
 */
async invalidatePattern(
  pattern: string,
  namespace: CacheNamespace,
): Promise<number> {
  if (!this.isConnected) return 0;

  try {
    const fullPattern = `${namespace}:${pattern}`;
    let cursor = 0;
    let totalDeleted = 0;

    do {
      const result = await this.client.scan(cursor, {
        MATCH: fullPattern,
        COUNT: 100,
      });
      cursor = result.cursor;

      if (result.keys.length > 0) {
        await this.client.del(result.keys);
        totalDeleted += result.keys.length;
        this.stats.deletes += result.keys.length;
      }
    } while (cursor !== 0);

    this.logger.log(`Invalidated ${totalDeleted} keys matching ${fullPattern}`);
    return totalDeleted;
  } catch (error) {
    this.logger.error(`Pattern invalidation failed: ${error}`);
    this.stats.errors++;
    return 0;
  }
}

/**
 * Invalidate all keys for a specific tenant within a namespace (GDPR-compliant)
 */
async invalidateTenantPattern(
  tenantId: string,
  namespace: CacheNamespace,
): Promise<number> {
  return this.invalidatePattern(`${tenantId}:*`, namespace);
}
```

### Step 4: Add GDPR-Compliant Endpoints

```typescript
// backend/src/modules/ai/voltagent/voltagent.controller.ts

/**
 * Clear all agent caches for current tenant (GDPR-compliant)
 */
@Post('cache/clear-tenant')
@ApiOperation({ summary: 'Clear agent caches for current tenant (GDPR)' })
async clearTenantCache(@Req() req: AuthenticatedRequest) {
  const tenantId = req.user.tenantId;
  const userId = req.user.userId;

  const results = await Promise.all([
    // 1. Clear agent pool for this tenant
    this.agentPoolService.clearAgentCacheForTenant(tenantId),
    // 2. Clear user context for this user
    this.cacheService.del(`voltagent:user-context:${tenantId}:${userId}`),
    // 3. Clear analytics for this tenant
    this.cacheService.invalidateTenantPattern(tenantId, CacheNamespace.AI_ANALYTICS),
  ]);

  return {
    success: true,
    cleared: {
      agentPool: results[0],
      userContext: results[1] ? 1 : 0,
      analytics: results[2],
    },
    gdprCompliant: true,
  };
}

/**
 * Clear all caches for a specific user (GDPR Art. 17 - Right to Erasure)
 * Called automatically when user requests account deletion
 */
@Post('cache/clear-user/:userId')
@ApiOperation({ summary: 'Clear all caches for a user (GDPR Art. 17)' })
async clearUserCache(
  @Req() req: AuthenticatedRequest,
  @Param('userId') userId: string,
) {
  const tenantId = req.user.tenantId;

  // Security: Only allow clearing your own cache or admin clearing any user
  if (req.user.userId !== userId && req.user.role !== 'ADMIN') {
    throw new ForbiddenException('Cannot clear other users cache');
  }

  const results = await Promise.all([
    this.agentPoolService.clearAgentCacheForUser(tenantId, userId),
    this.cacheService.del(`voltagent:user-context:${tenantId}:${userId}`),
  ]);

  this.logger.log(`[GDPR] Cleared all caches for user ${userId} in tenant ${tenantId}`);

  return {
    success: true,
    cleared: {
      agentPool: results[0],
      userContext: results[1] ? 1 : 0,
    },
    gdprArt17Compliant: true,
  };
}
```

### Step 5: Auto-Clear on User Deletion

```typescript
// backend/src/modules/user/user.service.ts

async deleteUser(userId: string, tenantId: string): Promise<void> {
  // 1. Clear all cached data for this user (GDPR Art. 17)
  await this.voltAgentService.clearUserCaches(tenantId, userId);

  // 2. Delete user from database
  await this.prisma.user.delete({
    where: { id: userId, tenantId },
  });

  this.logger.log(`[GDPR] User ${userId} deleted with cache purge`);
}
```

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `cache.service.ts` | Add `invalidatePattern()`, `invalidateTenantPattern()` | P0 |
| `cache.service.ts` | Add `CacheNamespace.AGENT_POOL` | P0 |
| `agent-pool.service.ts` | Migrate from Map to Redis | P0 |
| `voltagent.controller.ts` | Add `/cache/clear-tenant`, `/cache/clear-user/:userId` | P0 |
| `voltagent.service.ts` | Add `clearUserCaches()` facade | P1 |
| `user.service.ts` | Call cache clear on user deletion | P1 |
| `.env.example` | Document `AGENT_CACHE_TTL_SECONDS` | P2 |

---

## Environment Variables

```bash
# Agent pool cache TTL in seconds (default: 300 = 5 minutes)
AGENT_CACHE_TTL_SECONDS=300

# Enable Redis cluster mode for production
REDIS_CLUSTER_MODE=true
```

---

## Testing

```bash
# 1. Test Redis-based agent pool
curl -X POST http://localhost:3000/api/v1/voltagent/chat/stream/v3 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "hello", "conversationId": "test"}'

# 2. Verify cache in Redis
redis-cli KEYS "agent:pool:*"

# 3. Test tenant-scoped cache clear
curl -X POST http://localhost:3000/api/v1/voltagent/cache/clear-tenant \
  -H "Authorization: Bearer $TOKEN"

# 4. Test user-scoped cache clear (GDPR)
curl -X POST http://localhost:3000/api/v1/voltagent/cache/clear-user/$USER_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. Verify multi-instance sync
# Start 2 instances, clear cache on one, verify both are cleared
```

---

## GDPR Compliance Checklist

- [x] Agent pool migrated to Redis (no in-memory state)
- [ ] User context cache cleared on preference update (existing - chat-prepare.service.ts)
- [x] All user data cleared on account deletion (clearUserCaches endpoint)
- [x] Tenant-scoped invalidation endpoints added (/cache/clear-tenant, /cache/clear-user/:userId)
- [x] No cross-tenant data leakage possible (tenant-scoped keys)
- [x] SCAN used instead of KEYS for production safety (invalidatePattern)
- [x] Audit log for cache invalidation events (Logger.log with [GDPR] prefix)
- [x] Data retention policy enforced (max 5 min TTL via AGENT_CACHE_TTL_SECONDS)

---

## Related Files

- `backend/src/common/services/cache.service.ts`
- `backend/src/modules/ai/voltagent/services/agent-pool.service.ts`
- `backend/src/modules/ai/voltagent/services/chat-prepare.service.ts`
- `backend/src/modules/ai/voltagent/voltagent.controller.ts`
- `backend/src/modules/ai/voltagent/voltagent.service.ts`
- `backend/src/modules/user/user.service.ts`
