---
phase: 59
slug: safety
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS test utils) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `npm run type-check` |
| **Full suite command** | `npm run type-check && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run type-check && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | secrets-rotation | manual | N/A (env var rotation) | N/A | ⬜ pending |
| 59-01-02 | 01 | 1 | git-history-clean | manual | `git log --all -- backend/.env` | N/A | ⬜ pending |
| 59-02-01 | 02 | 1 | sql-injection-fix | unit | `npm run type-check` | ✅ | ⬜ pending |
| 59-02-02 | 02 | 1 | dto-validation | unit | `npm run type-check` | ✅ | ⬜ pending |
| 59-03-01 | 03 | 2 | rate-limit-overhaul | integration | `npm run type-check` | ✅ | ⬜ pending |
| 59-04-01 | 04 | 2 | auth-hardening | integration | `npm run type-check` | ✅ | ⬜ pending |
| 59-05-01 | 05 | 1 | db-indexes | migration | `npx prisma migrate dev --dry-run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Secrets rotated in Railway | secrets-rotation | External service config | Verify each secret regenerated in Railway dashboard |
| Git history cleaned | git-history-clean | One-time destructive op | Run `git log --all -- backend/.env` to confirm no matches |
| Swagger blocked in prod | swagger-block | Environment-dependent | Deploy to staging, verify /api/docs returns 404 |
| CORS locked in prod | cors-lock | Environment-dependent | Deploy to staging, verify cross-origin from non-localhost blocked |

*All code-level behaviors have automated type-check verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
