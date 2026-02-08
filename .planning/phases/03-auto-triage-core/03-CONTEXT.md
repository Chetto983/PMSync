# Phase 03: Auto-Triage Core - Context & Decisions

**Created:** 2026-02-08
**Phase:** 03-auto-triage-core

## Decisions

### Decision 1: Use existing aiPriority (1-5) instead of adding priority_score (0-100)

**Roadmap says:** TRIAGE-01 requires "Priority scoring model (0-100 scale)"

**Decision:** Satisfy TRIAGE-01 using the existing `aiPriority` integer field (1-5 scale) already in the schema, rather than adding a new `priority_score` (0-100) column.

**Rationale:**

The `aiPriority` field is already wired end-to-end through 6 layers:

1. **Schema:** `Email.aiPriority Int?` with `@@index([tenantId, aiPriority])`
2. **Backend tools:** `email-rlm.tools.ts` exposes `aiPriority` in listing/filtering
3. **API:** Triage endpoints return `aiPriority` in responses
4. **Frontend hooks:** `useTriagedEmails` fetches and caches `aiPriority`
5. **UI components:** `ThreadListItem.tsx` renders priority badges using `aiPriority`
6. **Translations:** Priority labels mapped in locale files

Adding a second `priority_score (0-100)` field would:
- Create two competing priority systems with unclear precedence
- Require wiring a new field through all 6 layers (schema, tools, API, hooks, components, translations)
- Add maintenance burden for zero user-visible benefit

The 0-100 computation already exists internally: `AttentionScoreService` computes a `0.0-1.0` attention score (mathematically equivalent to 0-100) that maps to the 1-5 `aiPriority` scale. The internal precision is preserved; only the user-facing representation uses 1-5.

**Impact:** TRIAGE-01 is satisfied by the 1-5 scale. The 0-100 computation exists internally in `AttentionScoreService.computeAttentionScore()` and is available for any future analytics needs without a schema change.

**Status:** DECIDED
