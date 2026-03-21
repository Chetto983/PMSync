---
phase: 98
slug: security-verification
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-22
---

# Phase 98 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone verification scripts (ts-node) |
| **Config file** | N/A — scripts run against live server |
| **Quick run command** | `cd backend && npx ts-node --transpile-only scripts/verify-auth-guards.ts` |
| **Full suite command** | `cd backend && npx ts-node --transpile-only scripts/verify-auth-guards.ts && npx ts-node --transpile-only scripts/verify-tenant-isolation.ts && npx ts-node --transpile-only scripts/verify-csrf.ts && npx ts-node --transpile-only scripts/verify-rate-limiting.ts && npx ts-node --transpile-only scripts/verify-rbac.ts` |
| **Estimated runtime** | ~60 seconds (requires live backend on localhost:3000) |

---

## Sampling Rate

- **After every task commit:** Run the script created by that task against localhost:3000
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must exit 0
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | SEC-01 | script | `cd backend && npx ts-node --transpile-only scripts/verify-auth-guards.ts` | ❌ | ⬜ pending |
| 98-01-02 | 01 | 1 | SEC-02, SEC-05 | script | `cd backend && npx ts-node --transpile-only scripts/verify-tenant-isolation.ts && npx ts-node --transpile-only scripts/verify-rbac.ts` | ❌ | ⬜ pending |
| 98-02-01 | 02 | 1 | SEC-03 | script | `cd backend && npx ts-node --transpile-only scripts/verify-csrf.ts` | ❌ | ⬜ pending |
| 98-02-02 | 02 | 1 | SEC-04 | script | `cd backend && npx ts-node --transpile-only scripts/verify-rate-limiting.ts` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Scripts are created as part of Wave 1 tasks — each task's verification is the script it creates, run against a live server.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redis failover rate-limit behavior | SEC-04 | Requires Redis restart during test | Stop Redis, verify rate limiter fails open, restart, verify recovery |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
