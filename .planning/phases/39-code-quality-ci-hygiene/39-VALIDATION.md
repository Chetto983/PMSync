---
phase: 39
slug: code-quality-ci-hygiene
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend) / vitest (frontend) / GitHub Actions CI |
| **Config file** | `frontend/vitest.config.ts`, `backend/jest.config.ts`, `.github/workflows/frontend-ci.yml` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `npm run type-check && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `npm run type-check && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | SC-1 (email.tsx split) | structural | `wc -l frontend/src/pages/email.tsx` (must be <500) | ✅ | ⬜ pending |
| 39-01-02 | 01 | 1 | SC-2 (Lighthouse CI trigger) | CI config | `grep -c "paths:" .github/workflows/frontend-ci.yml` | ✅ | ⬜ pending |
| 39-01-03 | 01 | 1 | SC-3 (OpenAPI CI masking) | CI config | `grep -c "continue-on-error" .github/workflows/*.yml` | ✅ | ⬜ pending |
| 39-01-04 | 01 | 1 | SC-4 (auth-token.ts removal) | structural | `test ! -f frontend/lib/utils/auth-token.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lighthouse triggers on mixed PRs | SC-2 | Requires actual GitHub PR to verify trigger | Open a PR touching both `backend/` and `frontend/` files, verify Lighthouse job runs |
| OpenAPI step shows failure in CI UI | SC-3 | Requires CI run with intentional OpenAPI error | Temporarily break OpenAPI generation, push, verify CI shows orange/red (not green) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
