# Retry Infrastructure Consolidation - Roadmap

**Created**: 2025-01-05
**Status**: IN PROGRESS

---

## Problem Statement

Deep audit revealed **DEAD CODE** in email-sync drivers:
- `google.driver.ts:81-120` - `withRetry()` defined but NEVER CALLED
- `microsoft.driver.ts:117-156` - `withRetry()` defined but NEVER CALLED
- 34+ API calls in Google driver bypass retry completely
- Result: No rate limit handling (429), no auth recovery (401), no server error retry (5xx)

Additionally:
- `@SkipThrottle()` on `emails.controller.ts` disables rate limiting on list/search endpoints
- Security risk: enumeration attack vector

---

## Solution: Consolidate to Common Module

### Already Exists (Working)
- `calendar/utils/retry.ts` - Industrial-grade retry with circuit breaker
- `calendar/utils/circuit-breaker.ts` - Resilience pattern
- Used by: calendar, contacts, ai modules (correctly wired)

### Created (2025-01-05)
- [x] `common/utils/retry.utils.ts` - Consolidated retry logic
- [x] `common/utils/circuit-breaker.utils.ts` - Consolidated circuit breaker

---

## Phase 1: Create Common Retry Infrastructure ✅ DONE

| File | Status | Description |
|------|--------|-------------|
| `common/utils/retry.utils.ts` | ✅ Created | `withRetry()`, `isRetryableError()`, `RateLimiter` |
| `common/utils/circuit-breaker.utils.ts` | ✅ Created | `CircuitBreaker`, `getCircuitBreaker()` |
| `common/utils/index.ts` | ⬜ Pending | Export new utilities |

---

## Phase 2: Update Email Drivers to USE Retry ⬜ PENDING

### Google Driver (`google.driver.ts`)

**Current** (BROKEN):
```typescript
// Line 81-120: withRetry() defined
// Line 129: this.gmail!.users.labels.list() - NO RETRY!
```

**Fix**:
```typescript
import { withRetry } from '@/common/utils';

async listFolders(): Promise<CanonicalFolder[]> {
  return withRetry(
    async () => {
      const response = await this.gmail!.users.labels.list({ userId: 'me' });
      return (response.data.labels || [])
        .filter((label) => label.id && label.name)
        .map((label) => this.labelToCanonicalFolder(label));
    },
    { provider: 'google', operationName: 'listFolders' }
  );
}
```

**API Calls to Wrap** (34 total):
| Line | Method | Priority |
|------|--------|----------|
| 129 | `labels.list` | HIGH |
| 142 | `labels.get` | HIGH |
| 166 | `labels.create` | MEDIUM |
| 181 | `labels.delete` | LOW |
| 190 | `labels.patch` | MEDIUM |
| 207 | `messages.list` | HIGH |
| 241, 259 | `messages.get` | HIGH |
| 277 | `messages.send` | HIGH |
| 294, 304 | `drafts.*` | MEDIUM |
| 344-449 | `messages.modify` | HIGH |
| 475, 488 | `attachments.get` | MEDIUM |
| 611-661 | `batchModify`, `batchDelete` | HIGH |
| 708 | `history.list` | HIGH |

### Microsoft Driver (`microsoft.driver.ts`)

**Current** (BROKEN):
```typescript
// Line 117-156: withRetry() defined
// Line 170: this.fetchAllPages() - NO RETRY inside!
```

**Fix**: Wrap `fetchAllPages` and other API calls with retry.

---

## Phase 3: Update Calendar Module Imports ⬜ PENDING

Update calendar to import from common instead of local:
- `calendar/services/calendar-events.service.ts` → import from `@/common/utils`
- `calendar/utils/index.ts` → re-export from common (backwards compat)

---

## Phase 4: Delete Dead Code ⬜ PENDING

| File | Lines | Code to Delete |
|------|-------|----------------|
| `google.driver.ts` | 75-120 | Dead `withRetry()` method |
| `microsoft.driver.ts` | 110-156 | Dead `withRetry()` method |

---

## Phase 5: Fix @SkipThrottle Security Issue ⬜ PENDING

| File | Line | Endpoint | Action |
|------|------|----------|--------|
| `emails.controller.ts` | 116 | `GET /emails` (listEmails) | REMOVE @SkipThrottle |
| `emails.controller.ts` | 234 | `GET /emails/stats` | REMOVE @SkipThrottle |
| `emails.controller.ts` | 245 | `GET /emails/search` | REMOVE @SkipThrottle |

**Risk**: Without rate limiting, attackers can enumerate all emails via rapid requests.

---

## Phase 6: Test & Validate ⬜ PENDING

```bash
# Type check
npm run type-check

# Production stress test
npx ts-node backend/scripts/stress-test-production-scenarios.ts

# Verify retry works
npx ts-node backend/scripts/test-retry-infrastructure.ts
```

---

## Test Script to Create

Create `backend/scripts/test-retry-infrastructure.ts`:
- Simulate 429 rate limit response
- Verify exponential backoff
- Simulate 401 auth error
- Verify token refresh flag
- Simulate 5xx server error
- Verify retry attempts
- Test circuit breaker opens after threshold

---

## Completion Checklist

- [x] Phase 1: Common retry infrastructure created
- [ ] Phase 2: Email drivers updated to USE retry
- [ ] Phase 3: Calendar imports updated
- [ ] Phase 4: Dead code deleted
- [ ] Phase 5: @SkipThrottle removed
- [ ] Phase 6: All tests pass

---

## Memory Keys

```bash
# Store this roadmap
npx claude-flow memory store retry-consolidation-2025-01-05 '{
  "issue": "withRetry() dead code in email drivers",
  "status": "in-progress",
  "files_created": ["common/utils/retry.utils.ts", "common/utils/circuit-breaker.utils.ts"],
  "next_step": "Wire up drivers to actually USE withRetry"
}' --namespace mailagent
```
