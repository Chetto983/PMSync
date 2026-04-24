# Phase 150 — Deferred Items

## Pre-existing issues found during Plan 04 execution

### email-analysis.service.spec.ts uses vitest (not jest)

- **File:** `backend/src/modules/ai/services/__tests__/email-analysis.service.spec.ts:1`
- **Issue:** First line `import { beforeEach, describe, expect, it, vi } from 'vitest';` — repo standard is jest. The spec cannot run under `npx jest` because `vitest` is not in jest's `transformIgnorePatterns`.
- **Original commit:** `30cb8f21 feat(label-first): T-1504 — rewire EmailAnalysisService to use new pipeline` (pre-Phase 150)
- **Why deferred:** Not introduced by Plan 04. Out of scope per CLAUDE.md SCOPE BOUNDARY rule. Plan 04's email-analysis edits (graphHint plumbing) compile cleanly under tsc and don't change any contract this spec was testing.
- **Suggested owner:** A Phase 153+ test-infra cleanup sprint should either port this file to jest or move it to a vitest-only test runner.

## Pre-existing issues found during Plan 150.1 gap closure

### labels.service.triage.unit.spec.ts "updates a wizard label" OOMs

- **File:** `backend/src/modules/labels/services/__tests__/labels.service.triage.unit.spec.ts:362`
- **Issue:** The `updates a wizard label without dropping nested placement` case runs into a Node heap OOM (max-old-space-size=4096 still insufficient) under `--runInBand`. The test reproduces on the PRE-Plan-150.1 tree too (verified via `git stash && jest …`) — confirmed NOT introduced by WR-03's $transaction wrapping.
- **Why deferred:** Out of scope per CLAUDE.md SCOPE BOUNDARY rule — this plan fixes WR/IN findings, not pre-existing unit-test flakiness. The other 5 cases in this spec (create preview, apply onboarding, 2x preview email, createFromWizard) pass GREEN when run individually.
- **Suggested owner:** A Phase 153+ test-infra cleanup sprint — likely an `updateFromWizard` mock that doesn't terminate the `wouldCreateCircularReference` while-loop under specific parent-id conditions. The fix is in the spec, not the service.

