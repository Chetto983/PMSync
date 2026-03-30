---
phase: 122
slug: cross-cutting-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 122 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), node scripts (validation) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="rate-tier-audit" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage && node scripts/validate-cross-cutting.mjs --check=all` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="rate-tier-audit" --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 122-01-01 | 01 | 1 | XCUT-02 | unit+static | `cd backend && npx jest --testPathPattern="rate-tier-audit" --no-coverage` | ✅ | ⬜ pending |
| 122-01-02 | 01 | 1 | XCUT-01,02,03 | integration | `node scripts/validate-cross-cutting.mjs --check=all` | ❌ W0 | ⬜ pending |
| 122-01-03 | 01 | 1 | (sign-off) | meta | `node -e "..."` (VALIDATION.md flag check) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/lib/validate-tenant-isolation.mjs` — cross-tenant request checks for XCUT-01
- [ ] `scripts/lib/validate-rate-tiers.mjs` — per-endpoint tier verification for XCUT-02
- [ ] `scripts/lib/validate-response-envelope.mjs` — envelope format + correlation ID checks for XCUT-03
- [ ] `scripts/validate-cross-cutting.mjs` — orchestrator running all three checks

*Existing `rate-tier-audit.spec.ts` covers XCUT-02 static analysis.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-tenant data leakage on live deployment | XCUT-01 | Requires two authenticated sessions with different tenants | 1. Login as tenant-A, note email IDs. 2. Login as tenant-B, attempt to access tenant-A email IDs via API. 3. Verify 403/404 on every endpoint. |

*Automated script covers most cases; manual verification adds confidence on production.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
