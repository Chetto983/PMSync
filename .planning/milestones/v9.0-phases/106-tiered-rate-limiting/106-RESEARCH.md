# Phase 106: Tiered Rate Limiting - Research

**Researched:** 2026-03-24
**Domain:** NestJS @nestjs/throttler rate limiting architecture
**Confidence:** HIGH

## Summary

The current rate limiting setup uses two global throttler tiers: `short` (300/min, intended for reads) and `write` (30/min). Every request is checked against ALL configured tiers. The `write` tier at 30/min is the root cause of false 429 errors -- a user toggling labels on 30 emails exhausts the write budget for ALL mutations including sending, drafts, and preference updates.

There is also a critical naming mismatch: all existing `@Throttle()` decorators use the key `default`, but the configured throttlers are named `short` and `write`. The `@Throttle({ default: { ... } })` overrides do NOT match any configured throttler name, meaning they likely create an orphaned throttler context instead of overriding the intended tier. This must be audited and fixed as part of this phase.

**Primary recommendation:** Replace the 2-tier global config with 4 named tiers (read, safe-write, destructive-write, send), update ALL existing `@Throttle()` decorators to reference correct tier names, and add tier assignments to controllers that currently rely on global defaults.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RATE-01 | Write endpoints use tiered limits: safe-write 100/min, destructive-write 30/min, send 10/min | New named throttlers in ThrottlerModule.forRoot; @Throttle decorators on each write endpoint referencing correct tier name |
| RATE-02 | All existing @Throttle() decorators audited and mapped to correct named tiers | Full audit below identifies 18 decorators all using wrong `default` key; must be updated to match tier names |
| RATE-03 | Read tier remains at 300/min (no regression) | Rename `short` to `read`, keep limit at 300/min; no changes to read endpoints needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/throttler | 6.5.0 | Rate limiting with named tiers | Already installed, supports multiple named throttlers, Redis storage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | (existing) | Redis-backed throttler storage | Already wired via RedisThrottlerStorage |

No new packages needed. This is purely a reconfiguration of existing infrastructure.

## Architecture Patterns

### Current Architecture (BROKEN)

```
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'short', ttl: 60000, limit: 300 },   // "read" tier
    { name: 'write', ttl: 60000, limit: 30 },     // flat write tier (TOO LOW)
  ]
})
```

**Problem 1:** ALL requests checked against BOTH tiers. Write endpoints hit the 30/min `write` tier even for safe bulk operations (label toggle, read/star status).

**Problem 2:** Every `@Throttle()` decorator uses `{ default: { ... } }` key, which does NOT match `short` or `write`. These overrides are targeting a non-existent `default` throttler.

**Problem 3:** Many write endpoints (labels, users, providers, reminders, AI, push, compliance) have NO `@Throttle` decorator at all -- they fall through to global tiers.

### Target Architecture (4-TIER)

```
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'read',              ttl: 60000, limit: 300 },  // reads, GETs
    { name: 'safe-write',        ttl: 60000, limit: 100 },  // label, star, read-status, move, preferences
    { name: 'destructive-write', ttl: 60000, limit: 30 },   // delete, bulk-delete, account deletion
    { name: 'send',              ttl: 60000, limit: 10 },   // email send, reply, forward, calendar invite
  ]
})
```

### How NestJS Throttler Named Tiers Work

NestJS throttler v6 checks ALL configured tiers against every request by default. To make an endpoint only subject to ONE specific tier, use `@SkipThrottle()` to exclude the others:

```typescript
// Endpoint only checked against 'send' tier (10/min), skip all others
@SkipThrottle({ read: true, 'safe-write': true, 'destructive-write': true })
@Throttle({ send: { ttl: 60000, limit: 10 } })
@Post('send')
async sendEmail() { ... }
```

**Better approach for this codebase:** Override the `UserThrottlerGuard` to select which tier applies based on endpoint metadata, rather than requiring verbose `@SkipThrottle` on every endpoint.

### Recommended Implementation Pattern

Instead of `@SkipThrottle` on every endpoint, create a custom decorator and extend the guard:

```typescript
// 1. Custom decorator to tag endpoints with their tier
import { SetMetadata } from '@nestjs/common';
export const RATE_TIER_KEY = 'rate-tier';
export type RateTier = 'read' | 'safe-write' | 'destructive-write' | 'send';
export const RateTier = (tier: RateTier) => SetMetadata(RATE_TIER_KEY, tier);

// 2. Extended guard that only checks the assigned tier
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // ... existing health/metrics skip logic ...
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    // ... existing userId/IP logic ...
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context } = requestProps;
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Get tier from decorator, default to 'read' for GETs, 'safe-write' for mutations
    const tier = this.reflector.getAllAndOverride<RateTier>(RATE_TIER_KEY, [handler, classRef]);

    if (!tier) {
      // Auto-assign based on HTTP method
      const method = context.switchToHttp().getRequest().method;
      const autoTier = method === 'GET' ? 'read' : 'safe-write';
      // Only check the auto-assigned tier
      // ... filter throttlers to only the matching one
    }

    // Only check the single matching throttler
    // ...
  }
}
```

**However, the simpler approach** (and the one that requires less guard surgery) is:

1. Keep all 4 tiers in global config
2. Use `@Throttle({ 'tier-name': { limit, ttl } })` on endpoints to override specific tiers
3. For endpoints that should ONLY use one tier, combine with `@SkipThrottle` for the others

Given the codebase already has 18 `@Throttle` decorators to fix, the custom `@RateTier` decorator approach is cleaner and less error-prone than adding 3 `@SkipThrottle` keys per endpoint.

### Recommended Project Structure Changes

```
backend/src/common/
├── decorators/
│   └── rate-tier.decorator.ts      # NEW: @RateTier('send') decorator
├── guards/
│   ├── user-throttler.guard.ts     # MODIFY: tier-aware guard logic
│   └── redis-throttler-storage.service.ts  # NO CHANGE
└── filters/
    └── api-exception.filter.ts     # NO CHANGE (already handles 429)
```

### Full Audit of Existing @Throttle Decorators

All use `{ default: { ... } }` key -- ALL must be updated:

| File | Current | Target Tier | Limit |
|------|---------|-------------|-------|
| email-actions.controller.ts:101 (send) | `default: 10/min` | `send` | 10/min |
| email-actions.controller.ts:132 (reply) | `default: 10/min` | `send` | 10/min |
| email-actions.controller.ts:172 (forward) | `default: 10/min` | `send` | 10/min |
| email-calendar-invite.controller.ts:137 (send invite) | `default: 10/min` | `send` | 10/min |
| folders.controller.ts:214 (sync) | `default: 60/min` | `safe-write` | 100/min |
| folders.controller.ts:589 (create) | `default: 10/min` | `destructive-write` | 30/min |
| folders.controller.ts:674 (update) | `default: 10/min` | `safe-write` | 100/min |
| folders.controller.ts:777 (delete) | `default: 10/min` | `destructive-write` | 30/min |
| calendar.controller.ts:266 (sync) | `default: 20/min` | `safe-write` | 100/min |
| contacts.controller.ts:307 (sync) | `default: 20/min` | `safe-write` | 100/min |
| contacts.controller.ts:331 (import) | `default: 20/min` | `safe-write` | 100/min |
| contacts.controller.ts:391 (extract) | `default: 20/min` | `safe-write` | 100/min |
| contacts.controller.ts:428 (vcard) | `default: 20/min` | `safe-write` | 100/min |
| telegram-settings.controller.ts:102 (link) | `default: 10/min` | `destructive-write` | 30/min |
| telegram-webhook.controller.ts:20 (webhook) | `default: 60/min` | `safe-write` | 100/min |
| health.controller.ts:9 | `default: 30/min` | Remove (shouldSkip handles it) |
| ai-health.controller.ts:37 | `default: 30/min` | `read` | 300/min |
| csrf-token.controller.ts:22 | `default: 300/min` | `read` | 300/min |

### Endpoints WITHOUT Any @Throttle (rely on global defaults)

These need explicit tier assignment:

| Controller | Write Endpoints | Target Tier |
|-----------|-----------------|-------------|
| labels.controller.ts | POST, PUT, DELETE, POST :id/emails, DELETE :id/emails/:emailId, POST reorder | `safe-write` (100/min) |
| email-actions.controller.ts | PATCH :id, DELETE bulk, DELETE :id, POST drafts, DELETE drafts/:id, PATCH bulk/* | `safe-write` (100/min) except DELETE = `destructive-write` |
| users.controller.ts | PUT me, PUT me/avatar, DELETE me/avatar, DELETE me, PATCH me/preferences, DELETE me/ai-memory, PUT me/dashboard-preferences | `safe-write` except DELETE me = `destructive-write` |
| providers.controller.ts | POST google/auth-url, POST connect, PATCH :id, DELETE :id | `safe-write` except DELETE = `destructive-write` |
| reminder.controller.ts | POST, PATCH :id, POST :id/complete, DELETE :id | `safe-write` |
| ai.controller.ts | All POST endpoints (compose, summarize, etc.) | `safe-write` |
| ai-chat.controller.ts | POST chat, POST conversations, POST bulk-delete, DELETE :id | `safe-write` except bulk-delete = `destructive-write` |
| push.controller.ts | POST subscribe, DELETE subscribe | `safe-write` |
| subscription.controller.ts | POST cancel | `destructive-write` |
| compliance controllers | POST export, POST deletion, DELETE cancel, POST consent | `destructive-write` (GDPR ops) |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limit storage | In-memory counter map | RedisThrottlerStorage (existing) | Already handles distributed replicas, Lua atomicity, fail-open |
| Per-user tracking | Custom middleware | UserThrottlerGuard (existing) | Already handles userId vs IP fallback |
| 429 response format | Custom exception handler | ApiExceptionFilter (existing) | Already produces RATE_LIMITED code + Retry-After header |
| Tier selection logic | Per-endpoint @SkipThrottle chains | Custom @RateTier decorator + guard override | Avoid 4-key @SkipThrottle on every endpoint |

## Common Pitfalls

### Pitfall 1: @Throttle Key Name Mismatch
**What goes wrong:** Using `@Throttle({ default: { ... } })` when throttlers are named `read`, `safe-write`, etc. The override silently applies to a non-existent throttler context.
**Why it happens:** Legacy code used `default` before named tiers were introduced.
**How to avoid:** Every `@Throttle` key MUST match a name from `ThrottlerModule.forRoot`. Add a verification script or test.
**Warning signs:** Rate limits not being enforced as expected; unexpected 429s or no 429s at all.

### Pitfall 2: All Tiers Checked on Every Request
**What goes wrong:** A GET request is checked against read (300/min) AND safe-write (100/min) AND destructive-write (30/min) AND send (10/min). The send tier (10/min) becomes the binding constraint for ALL requests.
**Why it happens:** NestJS throttler checks all configured tiers by default.
**How to avoid:** The guard must select ONLY the relevant tier for each request. Either via custom `@RateTier` decorator + guard logic, or via `@SkipThrottle` on every endpoint.
**Warning signs:** Read endpoints hitting 10/min limit instead of 300/min.

### Pitfall 3: Redis Key Namespace Collision After Rename
**What goes wrong:** Renaming throttler from `short` to `read` changes the Redis key prefix from `throttle:short:` to `throttle:read:`. Existing counters under old keys become orphaned, and new counters start at 0.
**Why it happens:** RedisThrottlerStorage uses `throttle:${throttlerName}:${key}` pattern.
**How to avoid:** This is actually fine -- counters reset, which is harmless (brief window of no rate limiting). No migration needed. But be aware old keys will linger until TTL expires.
**Warning signs:** None significant. Old keys expire within 60s.

### Pitfall 4: Forgetting SkipThrottle for Webhooks
**What goes wrong:** External webhooks (Google, Telegram) consume user rate limit budget.
**Why it happens:** Webhooks are POST requests that hit the write tier.
**How to avoid:** Webhook controllers already use `@SkipThrottle()` (email-sync webhook, calendar webhook). Verify Telegram webhook controller is handled (it currently has `@Throttle` at 60/min -- this is correct since it's IP-based, not user-based).

### Pitfall 5: Bulk Operations Consuming Per-Item Rate Limits
**What goes wrong:** `PATCH /emails/bulk/labels/add` with 50 email IDs counts as 1 request (correct). But if the frontend fires individual PATCH requests instead of using the bulk endpoint, each counts separately.
**Why it happens:** Frontend may not use bulk endpoints consistently.
**How to avoid:** This phase is backend-only. But the safe-write tier at 100/min provides sufficient headroom for frontend patterns.

## Code Examples

### ThrottlerModule Configuration (Target State)

```typescript
// Source: app.module.ts - replace existing ThrottlerModule.forRoot
ThrottlerModule.forRoot({
  throttlers: [
    {
      name: 'read',
      ttl: 60000,
      limit: 300,   // 300 req/min - inbox, search, thread view
    },
    {
      name: 'safe-write',
      ttl: 60000,
      limit: 100,   // 100 req/min - labels, star, read-status, move, preferences
    },
    {
      name: 'destructive-write',
      ttl: 60000,
      limit: 30,    // 30 req/min - delete, bulk-delete, account ops
    },
    {
      name: 'send',
      ttl: 60000,
      limit: 10,    // 10 req/min - email send, reply, forward
    },
  ],
}),
```

### RateTier Decorator

```typescript
// Source: backend/src/common/decorators/rate-tier.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const RATE_TIER_KEY = 'rate-tier';
export type RateTier = 'read' | 'safe-write' | 'destructive-write' | 'send';
export const RateTierDecorator = (tier: RateTier) => SetMetadata(RATE_TIER_KEY, tier);
```

### Updated Guard (Tier-Aware)

```typescript
// Source: backend/src/common/guards/user-throttler.guard.ts
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(THROTTLER_OPTIONS) protected options: ThrottlerModuleOptions,
    @Inject(ThrottlerStorage) protected storageService: ThrottlerStorage,
    private reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { id?: string } | undefined;
    if (user?.id) return `user:${user.id}`;
    return (req['ip'] as string) || 'unknown';
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ url?: string }>();
    const url = request?.url || '';
    if (url.startsWith('/health') || url.startsWith('/metrics')) return true;
    return false;
  }

  // Override to only check the single relevant tier
  protected getThrottlers(context: ExecutionContext): ThrottlerGenerateKeyFunction[] {
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Check for @RateTier decorator
    const tier = this.reflector.getAllAndOverride<RateTier>(RATE_TIER_KEY, [handler, classRef]);

    if (tier) {
      // Only return the matching throttler
      return this.options.throttlers.filter(t => t.name === tier);
    }

    // Auto-assign based on HTTP method
    const method = context.switchToHttp().getRequest().method;
    const autoTier = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
      ? 'read'
      : 'safe-write';
    return this.options.throttlers.filter(t => t.name === autoTier);
  }
}
```

**Note:** The exact override method depends on the ThrottlerGuard internal API. The `handleRequest` method receives the throttler array -- the guard can filter which throttlers apply. Verify exact method signature against `@nestjs/throttler@6.5.0` source before implementation.

### Endpoint Usage Examples

```typescript
// Send email - 10/min send tier
@RateTierDecorator('send')
@Post('send')
async sendEmail() { ... }

// Bulk label add - 100/min safe-write tier
@RateTierDecorator('safe-write')
@Patch('bulk/labels/add')
async bulkLabelsAdd() { ... }

// Delete email - 30/min destructive-write tier
@RateTierDecorator('destructive-write')
@Delete(':id')
async deleteEmail() { ... }

// List emails - auto-detected as 'read' (GET method)
// No decorator needed for GET endpoints
@Get()
async listEmails() { ... }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@nestjs/throttler` v5 (single tier) | v6 (named tiers) | 2024 | Enables per-category rate limiting without custom guards |
| `@Throttle({ default: ... })` | `@Throttle({ tierName: ... })` | v6 | Key must match configured throttler name |
| IP-based tracking | User-based tracking | Already implemented | Prevents NAT/VPN users from sharing limits |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest preset) |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npm test -- --testPathPattern=throttl` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RATE-01 | Send tier 10/min independent of safe-write 100/min | unit | `cd backend && npm test -- --testPathPattern=user-throttler` | No - Wave 0 |
| RATE-02 | All @Throttle decorators use correct tier names | unit (decorator audit) | `cd backend && npm test -- --testPathPattern=rate-tier-audit` | No - Wave 0 |
| RATE-03 | Read tier at 300/min, no regression | unit | `cd backend && npm test -- --testPathPattern=user-throttler` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npm test -- --testPathPattern=throttl --forceExit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `backend/src/common/guards/user-throttler.guard.spec.ts` -- covers RATE-01, RATE-03 (tier selection, method-based auto-assignment)
- [ ] `backend/src/common/decorators/rate-tier.decorator.spec.ts` -- covers decorator metadata
- [ ] Rate tier audit test (grep all @Throttle decorators, verify no `default` key remains) -- covers RATE-02

## Open Questions

1. **ThrottlerGuard.handleRequest internal API**
   - What we know: ThrottlerGuard processes all configured throttlers by default
   - What's unclear: The exact override point to filter throttlers per-request in v6.5.0. Could be `handleRequest`, could require overriding the throttler iteration loop.
   - Recommendation: Read `@nestjs/throttler@6.5.0` source code (node_modules/@nestjs/throttler/dist/throttler.guard.js) during implementation to identify the correct override point. If no clean override exists, fall back to `@SkipThrottle` approach.

2. **Existing @Throttle({ default: ... }) behavior**
   - What we know: Key `default` doesn't match `short` or `write` throttler names
   - What's unclear: Whether NestJS creates an ad-hoc throttler for unrecognized keys or silently ignores them
   - Recommendation: Test current behavior in dev before changing. If `default` key is silently ignored, those endpoints have been running WITHOUT per-endpoint limits (only global tiers apply). This would mean the 10/min send limit has never actually been enforced independently.

## Sources

### Primary (HIGH confidence)
- `@nestjs/throttler@6.5.0` -- installed in project, package.json confirmed
- [NestJS Throttler GitHub README](https://github.com/nestjs/throttler/blob/master/README.md) -- named throttler API, @Throttle/@SkipThrottle behavior
- Codebase audit -- all 18 @Throttle decorators, guard implementation, Redis storage

### Secondary (MEDIUM confidence)
- [NestJS Throttler NPM](https://www.npmjs.com/package/@nestjs/throttler) -- version verification
- [Wanago NestJS Rate Limiting Article](https://wanago.io/2025/03/03/api-nestjs-rate-limiting-throttler/) -- v6 named throttler patterns
- NestJS Best Practices skill (`security-rate-limiting.md`) -- pattern reference

### Tertiary (LOW confidence)
- ThrottlerGuard override approach (getThrottlers method) -- needs verification against v6.5.0 source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - already installed, no new packages
- Architecture: HIGH - clear problem, clear solution, well-documented NestJS throttler API
- Pitfalls: HIGH - identified from codebase audit and existing verify-rate-limiting.ts analysis script
- Guard override pattern: MEDIUM - exact override method needs verification against throttler source

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- @nestjs/throttler changes slowly)
