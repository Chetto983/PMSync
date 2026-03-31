---
phase: 127
slug: transport-connection-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 127 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), vitest (frontend) |
| **Config file** | `backend/jest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 127-01-01 | 01 | 1 | SCAL-01 | integration | `grep -c "transports.*websocket" frontend/lib/websocket-client.ts` | ✅ | ⬜ pending |
| 127-01-02 | 01 | 1 | SCAL-01 | integration | `grep "'polling'" frontend/lib/websocket-client.ts \| wc -l` (must be 0) | ✅ | ⬜ pending |
| 127-02-01 | 02 | 1 | SCAL-02 | unit | `grep "DB_POOL_MAX" backend/src/prisma/prisma-client.factory.ts` | ✅ | ⬜ pending |
| 127-02-02 | 02 | 1 | SCAL-02 | integration | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebSocket works on Railway without sticky sessions | SCAL-01 | Requires multi-replica deployment | Deploy 2 replicas, verify real-time events reach both clients |
| No pool exhaustion during rolling deploy | SCAL-02 | Requires Railway rolling deploy | Trigger deploy, monitor `pg_stat_activity` during old+new overlap |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
