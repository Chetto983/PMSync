---
phase: 28-cleanup-voltagent-deletion
plan: 04
subsystem: consent, backend, frontend
tags: [consent, guards, layout-fix, dead-code, gap-closure]

requires:
  - phase: 28-01
    provides: "assistant-ui chat frontend"
  - phase: 28-02
    provides: "dead code deletion (voltagent proxy removed)"
provides:
  - "ai_chat declared in CONSENT_FEATURES (ConsentGuard can validate it)"
  - "@RequiresConsent('ai_auto_triage') on triage endpoints"
  - "@RequiresConsent('email_analytics') on analytics endpoint"
  - "ConsentGuard added to ai.controller class-level guards"
  - "countsQuery disabled (no 404 polling)"
  - "Thread detail page renders full-width without EmailLayout"
affects: [29-architecture-hardening]

tech-stack:
  added: []
  patterns:
    - "Consent feature declaration before decorator usage"
    - "ConsentGuard class-level + @RequiresConsent method-level pattern"

key-files:
  created: []
  modified:
    - "backend/src/modules/compliance/consent.constants.ts"
    - "backend/src/modules/ai/controllers/ai.controller.ts"
    - "backend/src/modules/ai-chat/controllers/ai-chat.controller.ts"
    - "frontend/hooks/ai/use-ai-actions.ts"
    - "frontend/lib/api/ai.ts"
    - "frontend/pages/dashboard/email/thread/[threadId].tsx"

key-decisions:
  - "Keep @RequiresConsent('ai_chat') — fix was adding ai_chat to CONSENT_FEATURES, not removing the guard"
  - "Add ConsentGuard to ai.controller class-level @UseGuards to enable per-method @RequiresConsent"
  - "Disable countsQuery rather than delete it (preserves hook return shape)"
  - "Replace EmailLayout with simple Box (not a new layout component)"

requirements-completed: [FECLEAN-01, FECLEAN-03, CONSENT-01]

duration: ~5min
completed: 2026-03-03
---

# Phase 28 Plan 04: Consent Wiring + UAT Gap Closure

**Added ai_chat to consent system, wired missing consent guards on triage/analytics, disabled dead polling, fixed thread layout**

## Performance

- **Duration:** ~5 min
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Added `ai_chat` to CONSENT_FEATURES array and ConsentFeatureId type union
- Added ConsentGuard to ai.controller class-level @UseGuards
- Wired @RequiresConsent('ai_auto_triage') on POST /ai/triage and POST /ai/triage/backfill
- Wired @RequiresConsent('email_analytics') on GET /ai/analytics/email
- Disabled countsQuery (enabled: false) — stops 404 polling for /api/v1/ai/stats/action-counts
- Marked getActionCounts() as deprecated in ai.ts
- Replaced EmailLayout with simple Box in all 4 render paths of thread detail page
- Both backend and frontend type-check pass clean

## Decisions Made

1. **Keep @RequiresConsent('ai_chat')** — the decorator was correct, the bug was that ai_chat wasn't declared in CONSENT_FEATURES. Now it is, so ConsentGuard can validate it properly.

2. **Add ConsentGuard to ai.controller** — the class only had JwtAuthGuard, TenantGuard, QuotaGuard. Without ConsentGuard in @UseGuards, @RequiresConsent decorators on methods were silently ignored.

3. **Disable countsQuery, don't delete** — other code references the hook's return shape (actionCounts, countsLoading, refetchCounts). Setting enabled:false is safe and preserves the interface.

4. **Simple Box replacement for EmailLayout** — no need for a new layout component. Thread detail is a single-content page, not a 2-pane email list.

## Self-Check: PASSED

- [x] `ai_chat` in consent.constants.ts (2 occurrences)
- [x] ConsentGuard in ai.controller.ts class-level @UseGuards
- [x] @RequiresConsent('ai_auto_triage') on triage endpoints
- [x] @RequiresConsent('email_analytics') on analytics endpoint
- [x] countsQuery enabled: false
- [x] EmailLayout removed from [threadId].tsx (0 references)
- [x] Backend tsc --noEmit: clean
- [x] Frontend tsc --noEmit: clean

---
*Phase: 28-cleanup-voltagent-deletion*
*Completed: 2026-03-03*
