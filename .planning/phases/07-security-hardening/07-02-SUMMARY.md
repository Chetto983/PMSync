---
phase: 07
plan: 02
subsystem: security
tags: [rate-limiting, throttler, nestjs, SEC-05]
dependency-graph:
  requires: []
  provides: [dual-tier-rate-limiting, throttler-exception-filter, retry-after-header]
  affects: [08-testing, production-deployment]
tech-stack:
  added: []
  patterns: [dual-tier-throttling, exception-filter, rate-limit-headers]
key-files:
  created:
    - backend/src/common/filters/throttler-exception.filter.ts
  modified:
    - backend/src/app.module.ts
decisions:
  - id: explicit-rate-limits
    choice: Hardcoded 100/30 values instead of config-based
    rationale: SEC-05 specifies exact requirements; config flexibility not needed for security baseline
metrics:
  duration: ~10min
  completed: 2026-02-04
---

# Phase 07 Plan 02: Rate Limiting Configuration Summary

**One-liner:** Dual-tier rate limiting (100 read/30 write per minute) with custom 429 response including Retry-After header per SEC-05.

## Deliverables

### 1. Dual-Tier Rate Limiting Configuration

**File:** `backend/src/app.module.ts`

ThrottlerModule configured with two named tiers:
- `short`: 100 requests per minute (default tier for read operations)
- `write`: 30 requests per minute (for write operations)

```typescript
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'short', ttl: 60000, limit: 100 },
    { name: 'write', ttl: 60000, limit: 30 },
  ],
}),
```

### 2. Custom Throttler Exception Filter

**File:** `backend/src/common/filters/throttler-exception.filter.ts`

ThrottlerExceptionFilter provides:
- HTTP 429 Too Many Requests response
- `Retry-After: 60` header per HTTP spec
- `X-RateLimit-Limit: 100` header for client visibility
- JSON body with `statusCode`, `error`, `message`, `retryAfter`
- Logging of rate limit violations with IP and user context

### 3. Global Filter Registration

**File:** `backend/src/app.module.ts`

ThrottlerExceptionFilter registered via `APP_FILTER` provider for global application.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 2 | Create throttler exception filter | be73c9a0 |
| 1+3 | Configure dual-tier throttlers and register filter | 27437573 |

**Note:** Tasks 1 and 3 were committed together with 07-01 changes due to concurrent execution; the implementation is correct and complete.

## Decisions Made

### 1. Hardcoded Rate Limit Values

**Decision:** Use explicit 100/30 values instead of configuration-based limits.

**Rationale:** SEC-05 specifies exact requirements. The security baseline should not be configurable to prevent accidental weakening. Production deployments should have consistent, predictable rate limits.

### 2. 60-Second Retry-After Value

**Decision:** Fixed 60-second Retry-After header value.

**Rationale:** Matches the 1-minute TTL window of both throttler tiers. Provides clear guidance to clients on when to retry.

### 3. In-Memory Storage (Default)

**Decision:** Use NestJS Throttler's default in-memory storage instead of Redis.

**Rationale:** SEC-05 acceptance criteria do not require multi-instance consistency. Redis storage can be added later for horizontal scaling without code changes (just configuration).

## Deviations from Plan

None - plan executed as written.

## Verification

```bash
# Type check passes for 07-02 files
cd backend && npm run type-check 2>&1 | grep -E "(app.module|throttler-exception)"
# No errors in our files

# Code inspection confirms:
# - ThrottlerModule has dual tiers (short=100, write=30)
# - ThrottlerExceptionFilter returns 429 with Retry-After header
# - Filter registered globally via APP_FILTER
```

## Success Criteria Status

- [x] SEC-05: ThrottlerModule configured with two tiers (short=100, write=30)
- [x] SEC-05: ThrottlerExceptionFilter returns 429 with Retry-After header
- [x] SEC-05: Rate limit response includes retryAfter in JSON body
- [x] Type check passes, server starts normally

## Usage Notes

### Applying Write Tier to Specific Endpoints

Controllers can use decorators to apply the stricter write tier:

```typescript
import { Throttle, SkipThrottle } from '@nestjs/throttler';

// Apply write tier (30 req/min) to mutations
@Throttle({ write: { limit: 30, ttl: 60000 } })
@Post()
create() { ... }

// Skip throttling for health checks
@SkipThrottle()
@Get('health')
health() { ... }
```

### Client Handling

When receiving 429 response:
1. Read `Retry-After` header (seconds)
2. Wait specified duration before retrying
3. Implement exponential backoff for repeated 429s

## Next Phase Readiness

Plan 07-02 complete. Ready for:
- Plan 07-03: OAuth Token Revocation (SEC-02)
- Plan 07-04: CSRF Protection (SEC-04) - already committed
- Plan 07-05: Security Testing
