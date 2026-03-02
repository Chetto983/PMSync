---
status: complete
phase: 26-non-chat-ai-backend-testing
source: 26-01-SUMMARY.md, 26-02-SUMMARY.md, 26-03-SUMMARY.md
started: 2026-03-02T16:00:00Z
updated: 2026-03-02T16:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Non-Chat AI MSW Tests Pass
expected: Run `npx vitest run --reporter=verbose briefing-msw follow-up-detection-msw draft-generation-msw` from backend/. All 9 tests across 3 suites pass green.
result: pass

### 2. Chat Pipeline MSW Test Passes
expected: Run `npx vitest run --reporter=verbose chat-pipeline-msw` from backend/. All 4 tests (streaming, rate limiting, history, memory injection) pass green.
result: pass

### 3. E2E Real Mistral Tests Pass
expected: Run `npx vitest run --reporter=verbose nonchat-real-e2e` from backend/ with MISTRAL_API_KEY. All 3 tests (briefing, follow-up detection, draft generation) pass with real LLM.
result: pass

### 4. Comparison Script Executes (50 cases)
expected: Run `npx ts-node scripts/compare-nonchat-output.ts` from backend/. All 50 cases schema-valid, field-by-field report shows 100% match.
result: pass

### 5. Frontend Route Migration Complete
expected: Search frontend/ for any remaining `/api/v1/voltagent/` references in api client files that were migrated. Zero matches expected in ai.ts.
result: issue
reported: "8 frontend files still reference /api/v1/voltagent/: crm.ts (10 refs), document-library.ts (9 refs), analytics.ts (2 refs), use-voltagent-chat.ts (1 ref), use-dashboard.ts (1 ref), widget-registry.ts (10 refs), ai.test.ts (17 refs), swagger.json (many refs). SUMMARY claimed 90 occurrences migrated but only ai.ts was changed."
severity: minor

### 6. TypeScript Compiles Clean
expected: Run `npx tsc --noEmit` from backend/. No type errors from new services, controllers, or test files.
result: pass

### 7. New Service Files Under 500 Lines
expected: All new files under 500 lines. Max: ai.controller.ts at 489.
result: pass

## Summary

total: 7
passed: 6
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "All frontend /api/v1/voltagent/ references migrated to /api/v1/ai/"
  status: failed
  reason: "User reported: 8 frontend files still reference /api/v1/voltagent/: crm.ts (10 refs), document-library.ts (9 refs), analytics.ts (2 refs), use-voltagent-chat.ts (1 ref), use-dashboard.ts (1 ref), widget-registry.ts (10 refs), ai.test.ts (17 refs), swagger.json (many refs). SUMMARY claimed 90 occurrences migrated but only ai.ts was changed."
  severity: minor
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
