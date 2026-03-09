---
phase: 59
slug: safety
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-09
revised: 2026-03-09
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 59-01-T1 | 01 | 1 | SAF-01 (vector injection) | unit + build | `cd backend && npx jest --testPathPattern="vector-validation" --no-coverage && npm run build` | pending |
| 59-01-T2 | 01 | 1 | SAF-02, SAF-03 (DTO + indexes) | migration + build | `cd backend && npx prisma migrate dev --name add-security-indexes && npm run build` | pending |
| 59-02-T1 | 02 | 1 | SAF-04 (rate limiting) | grep + build | `cd backend && grep -rn "SkipThrottle" src/ --include="*.ts" \| grep -v test && npm run build` | pending |
| 59-02-T2 | 02 | 1 | SAF-05 (AI health restrict) | build | `cd backend && npm run build` | pending |
| 59-03-T1 | 03 | 1 | SAF-06 (JWT removal) | grep + build | `cd backend && npm run build && grep -rn "JwtAuthGuard\|JwtStrategy" src/ --include="*.ts" \| grep -v test` | pending |
| 59-03-T2 | 03 | 1 | SAF-07, SAF-08 (email verify + Swagger + CORS) | build + grep | `cd backend && npm run build && grep -n "requireEmailVerification" src/common/auth/better-auth.instance.ts` | pending |
| 59-04-T1 | 04 | 2 | SAF-09, SAF-10 (secrets checklist) | file + content | `cd D:/MailAgent && test -f docs/secrets-rotation-checklist.md && wc -l docs/secrets-rotation-checklist.md` | pending |
| 59-04-T2 | 04 | 2 | SAF-09, SAF-10 (BFG + rotation) | manual | N/A (human-action checkpoint) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No Wave 0 tasks needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Secrets rotated in Railway | SAF-10 | External service config | Verify each secret regenerated in Railway dashboard |
| Git history cleaned | SAF-09 | One-time destructive op | Run `git log --all -- backend/.env` to confirm no matches |
| Swagger blocked in prod | SAF-08 | Environment-dependent | Deploy to staging, verify /api/docs returns 404 |
| CORS locked in prod | SAF-08 | Environment-dependent | Deploy to staging, verify cross-origin from non-localhost blocked |

*All code-level behaviors have automated type-check or grep verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are checkpoint:human-action
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none needed)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
