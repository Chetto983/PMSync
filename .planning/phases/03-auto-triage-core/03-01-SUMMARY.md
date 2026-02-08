---
phase: 03-auto-triage-core
plan: 01
subsystem: ai-triage
tags: [attention-score, vip, backfill, bullmq, triage]

dependency_graph:
  requires: []
  provides:
    - VIP-aware attention scoring (isVip + relationshipScore)
    - Hardened backfill scheduler with active tenant filtering
  affects:
    - 03-02 (triage queue wiring)
    - 03-03 (triage frontend exposure)

tech_stack:
  added: []
  patterns:
    - OR condition for multi-criteria VIP detection
    - Cache-miss fast-path for user-defined VIPs
    - Active tenant filtering in scheduled jobs

file_tracking:
  created: []
  modified:
    - backend/src/modules/ai/voltagent/services/attention-score.service.ts
    - backend/src/modules/ai/services/triage-backfill-scheduler.service.ts

decisions:
  - id: TRIAGE-VIP-OR
    description: "OR query for VIP detection: relationshipScore >= 50 OR isVip: true"
    rationale: "User-defined VIPs must always appear in VIP set regardless of interaction history"
  - id: TRIAGE-VIP-TAKE-50
    description: "Increased VIP take limit from 20 to 50"
    rationale: "Accommodate both auto-detected and user-defined VIPs without cache misses"
  - id: TRIAGE-VIP-FASTPATH
    description: "Direct isVip check in scoreSenderImportance as cache-miss fallback"
    rationale: "Handles edge case where VIP was just added but 5-min cache hasn't refreshed"
  - id: TRIAGE-ACTIVE-TENANT
    description: "Filter backfill to Tenant.isActive=true, deletedAt=null"
    rationale: "Prevent processing emails for inactive/deleted tenants"

metrics:
  duration: "~5 minutes"
  completed: "2026-02-08"
---

# Phase 03 Plan 01: VIP-Aware Attention Scoring + Backfill Hardening Summary

**VIP detection via OR(relationshipScore >= 50, isVip: true) with cache-miss fast-path; backfill scheduler filtered to active tenants only**

## What Was Done

### Task 1: Integrate Contact.isVip into AttentionScoreService

Modified `attention-score.service.ts` (484 lines):

1. **`getVipSenders()`** (line ~437): Changed the Prisma query from a simple `relationshipScore: { gte: 50 }` filter to an `OR` condition that includes both `relationshipScore >= 50` AND `isVip: true`. Increased `take` from 20 to 50 to accommodate user-defined VIPs alongside auto-detected ones.

2. **`scoreSenderImportance()`** (line ~265): Added `isVip: true` to the contact `select` clause and inserted a fast-path check: `if (contact.isVip) return 1.0`. This handles the edge case where a contact was just marked VIP but the 5-minute cache hasn't refreshed yet.

**Key code:**
```typescript
// getVipSenders OR condition
OR: [
  { relationshipScore: { gte: 50 } },
  { isVip: true },
],

// scoreSenderImportance fast-path
if (contact.isVip) return 1.0;
```

### Task 2: Verify and Harden Triage Backfill Scheduler

Modified `triage-backfill-scheduler.service.ts` (352 lines):

1. **Active tenant filtering**: Added a pre-query to `Tenant` model filtering by `isActive: true, deletedAt: null`. Only emails belonging to active tenants are processed, preventing wasted LLM calls on inactive accounts.

2. **Debug logging**: Added `this.logger.debug()` at the start of `processBackfillJob()` for observability.

3. **Fixed inconsistent folder casing in `getStatus()`**: The skip folders list used lowercase (`spam`, `junk`, etc.) while the rest of the codebase uses UPPERCASE (`SPAM`, `TRASH`, etc.). Aligned to UPPERCASE to match the actual DB values.

**Already correct (no changes needed):**
- 48-hour backfill window (already implemented)
- `isAutoTriaged: false` filter (already in query)
- BullMQ repeatable job with 1-hour interval
- Error handling per tenant with try/catch
- Run-on-startup with `triggerManualBackfill()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed inconsistent folder name casing in getStatus()**
- **Found during:** Task 2
- **Issue:** `getStatus()` method used lowercase folder names (`spam`, `junk`, `trash`, `[gmail]/spam`, `[gmail]/trash`) while the email table stores UPPERCASE values (`SPAM`, `TRASH`, etc.) and all other queries in the codebase use UPPERCASE.
- **Fix:** Changed to `['SPAM', 'TRASH', 'SENT', 'DRAFTS', 'ARCHIVE']` matching the pattern used in `findTenantsWithUntriagedEmails()` and `EmailTriageService`.
- **Files modified:** `triage-backfill-scheduler.service.ts`
- **Commit:** `ba8c37e9`

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit --project backend/tsconfig.json` | Zero errors |
| `isVip: true` in getVipSenders OR query | Line 448 |
| `contact.isVip` check returning 1.0 | Line 283 |
| Active tenant filter in backfill | Line 242 |
| `isAutoTriaged: false` in backfill query | Lines 226, 302 |
| attention-score.service.ts line count | 484 (< 500) |
| triage-backfill-scheduler.service.ts line count | 352 (< 500) |
| New dependencies added | Zero |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `894f870d` | feat(03-01): integrate Contact.isVip into AttentionScoreService |
| 2 | `ba8c37e9` | feat(03-01): harden triage backfill scheduler with active tenant filtering |

## Next Phase Readiness

Plan 03-02 can proceed. The attention scoring now fully respects VIP contacts and the backfill scheduler reliably processes untriaged emails across active tenants.
