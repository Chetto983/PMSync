# Phase 150 — Deferred Items

## Pre-existing issues found during Plan 04 execution

### email-analysis.service.spec.ts uses vitest (not jest)

- **File:** `backend/src/modules/ai/services/__tests__/email-analysis.service.spec.ts:1`
- **Issue:** First line `import { beforeEach, describe, expect, it, vi } from 'vitest';` — repo standard is jest. The spec cannot run under `npx jest` because `vitest` is not in jest's `transformIgnorePatterns`.
- **Original commit:** `30cb8f21 feat(label-first): T-1504 — rewire EmailAnalysisService to use new pipeline` (pre-Phase 150)
- **Why deferred:** Not introduced by Plan 04. Out of scope per CLAUDE.md SCOPE BOUNDARY rule. Plan 04's email-analysis edits (graphHint plumbing) compile cleanly under tsc and don't change any contract this spec was testing.
- **Suggested owner:** A Phase 153+ test-infra cleanup sprint should either port this file to jest or move it to a vitest-only test runner.
