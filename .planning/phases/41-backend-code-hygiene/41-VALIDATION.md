---
phase: 41
slug: backend-code-hygiene
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2 |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --passWithNoTests -t "TenantKey"` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit && npx jest --passWithNoTests`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + `prisma migrate diff` zero drift
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | TD-01 | unit | `cd backend && npx jest prisma.service --passWithNoTests` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 1 | TD-02 | unit | `cd backend && npx jest account-deletion --passWithNoTests` | ❌ W0 | ⬜ pending |
| 41-01-03 | 01 | 1 | TD-03 | smoke | `cd backend && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` | N/A (CLI) | ⬜ pending |
| 41-01-04 | 01 | 1 | TD-04 | smoke | `cd backend && npx tsc --noEmit` | N/A (compile) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/prisma/__tests__/prisma-di.spec.ts` — stub verifying TenantKeyService injected via DI (not `new`-ed)
- [ ] `backend/src/gdpr/__tests__/account-deletion-scoped.spec.ts` — stub for `purgeUserDeletion()` single-user method

*Existing infrastructure covers TD-03 (CLI) and TD-04 (compile check).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
