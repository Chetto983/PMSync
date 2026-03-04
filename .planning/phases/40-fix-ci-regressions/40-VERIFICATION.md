---
phase: 40-fix-ci-regressions
verified: 2026-03-04T16:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 40: Fix CI Regressions Verification Report

**Phase Goal:** Revert 3 silent CI regressions introduced by commit 4a911f38 that undid Phase 39 fixes
**Verified:** 2026-03-04T16:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Lighthouse CI triggers on ALL PRs, not just frontend-only PRs | VERIFIED | `.github/workflows/frontend-ci.yml` has zero `paths:` stanzas. `grep -c "paths:" .github/workflows/frontend-ci.yml` returns 0. Workflow `on:` block has only `branches:` filters under `push:` and `pull_request:`. |
| 2 | OpenAPI generation failures are visible in GitHub Actions UI (not masked by echo fallback) | VERIFIED | Line 50 of `.github/workflows/ci.yml` is `run: npx ts-node scripts/generate-openapi.ts` (single line, no pipe block). `grep -c "echo.*OpenAPI" .github/workflows/ci.yml` returns 0. `continue-on-error: true` is preserved at line 51 as intended. |
| 3 | No dead auth-token.ts stub exists in the codebase | VERIFIED | `test ! -f frontend/lib/utils/auth-token.ts` passes. No import/require references to auth-token found in frontend source tree. |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/frontend-ci.yml` | Frontend CI workflow without paths filter | VERIFIED | File exists, 74 lines. `on:` block has `push.branches` and `pull_request.branches` only — no `paths:` stanzas. Lighthouse job present and wired via `needs: [build-and-test]`. |
| `.github/workflows/ci.yml` | CI workflow with clean OpenAPI step | VERIFIED | File exists, 91 lines. Line 50: `run: npx ts-node scripts/generate-openapi.ts`. Line 51: `continue-on-error: true`. No `|| echo` fallback anywhere. |
| `frontend/lib/utils/auth-token.ts` | Deleted (must NOT exist) | VERIFIED | File does not exist on disk. Zero import references remain in frontend source. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/frontend-ci.yml` | Lighthouse CI job | workflow trigger (no paths filter) | WIRED | `on: push: branches:` and `on: pull_request: branches:` present with no `paths:` restriction. Pattern `push:\s+branches:` matches line 5-8. Lighthouse job at line 47 runs on any PR/push to main/develop. |
| `.github/workflows/ci.yml` | OpenAPI generation step | run command without echo fallback | WIRED | Single-line `run: npx ts-node scripts/generate-openapi.ts` at line 50. `continue-on-error: true` at line 51. Downstream steps (`Lint OpenAPI spec`, `Generate frontend types from OpenAPI`) correctly gate on `steps.openapi-gen.outcome == 'success'`. |

---

### Requirements Coverage

No formal requirement IDs are declared for this phase (`requirements: []` in PLAN frontmatter). Phase is classified as `gap_closure: true` — a tech debt regression revert.

The three success criteria defined in the PLAN serve as the requirement contract:

| Criterion | Status | Evidence |
|-----------|--------|---------|
| SC-1: frontend-ci.yml has no `paths:` stanzas | SATISFIED | `grep -c "paths:" .github/workflows/frontend-ci.yml` = 0 |
| SC-2: ci.yml OpenAPI step has no `\|\| echo` fallback | SATISFIED | `grep -c "echo.*OpenAPI" .github/workflows/ci.yml` = 0; `continue-on-error: true` preserved |
| SC-3: `frontend/lib/utils/auth-token.ts` does not exist | SATISFIED | File absent; zero import references in codebase |

No REQUIREMENTS.md entries map to Phase 40 — no orphaned requirements.

---

### Commit Verification

Both commits documented in SUMMARY.md exist and contain the correct diffs:

| Commit | Message | Diff Summary | Correct |
|--------|---------|--------------|---------|
| `0ee143bb` | fix(40-01): remove paths filter from frontend-ci.yml | 4 deletions from frontend-ci.yml | Yes — exactly the two `paths:` + `- 'frontend/**'` blocks removed |
| `f91a1e5e` | fix(40-01): remove OpenAPI echo fallback and delete auth-token.ts | 3-line net reduction in ci.yml + 15-line auth-token.ts deleted | Yes — echo fallback removed, continue-on-error preserved, stub gone |

---

### Anti-Patterns Found

No anti-patterns found. Scanned modified files:

- `.github/workflows/frontend-ci.yml` — Clean YAML, no TODOs, no placeholders
- `.github/workflows/ci.yml` — Clean YAML, no echo fallbacks, no skipping comments
- `frontend/lib/utils/auth-token.ts` — Deleted, nothing to scan

---

### Human Verification Required

None. All three success criteria are verifiable programmatically via grep and file existence checks. The phase does not involve visual UI, real-time behavior, or external service integration.

---

### Gaps Summary

No gaps. All three regressions from commit `4a911f38` have been reverted:

1. **Paths filter regression** — Removed. Lighthouse CI now triggers on all PRs to main/develop regardless of which files are touched.
2. **Echo fallback regression** — Removed. OpenAPI generation failures will now appear as step failures in GitHub Actions UI. `continue-on-error: true` correctly handles DB-unavailable CI environments without masking the exit code.
3. **Dead stub regression** — Resolved. `auth-token.ts` deleted with no residual import references.

Phase 40 goal is fully achieved.

---

_Verified: 2026-03-04T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
