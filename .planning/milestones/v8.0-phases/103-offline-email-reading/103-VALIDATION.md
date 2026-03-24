---
phase: 103
slug: offline-email-reading
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 103 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + jsdom (frontend/jest.config.js) |
| **Config file** | `frontend/jest.config.js` |
| **Quick run command** | `cd frontend && npx jest --testPathPattern="query-persist\|logout-cleanup" --no-coverage` |
| **Full suite command** | `cd frontend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx jest --testPathPattern="query-persist|logout-cleanup" --no-coverage`
- **After every plan wave:** Run `cd frontend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 103-01-01 | 01 | 1 | OFFL-03 | unit | `cd frontend && npx jest lib/query-persist.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 103-01-02 | 01 | 1 | OFFL-03 | unit | `cd frontend && npx jest lib/query-client.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 103-02-01 | 02 | 1 | SYNC-04 | unit | `cd frontend && npx jest lib/logout-cleanup.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 103-02-02 | 02 | 1 | SYNC-04 | unit | `cd frontend && npx jest components/layout/Header.test.tsx --no-coverage -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/lib/query-persist.test.ts` — stubs for OFFL-03 persister creation
- [ ] `frontend/lib/logout-cleanup.test.ts` — stubs for SYNC-04 cleanup
- [ ] Mock setup for `indexedDB` and `caches` APIs in jsdom (jsdom lacks both)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline email reading after cold restart | OFFL-03 | Requires real browser offline mode + app restart | 1. Load inbox online 2. Close browser 3. Disable network 4. Reopen app 5. Verify emails visible |
| Data cleared after sign-out | SYNC-04 | Requires real IndexedDB + SW cache inspection | 1. Load emails 2. Sign out 3. Check DevTools > Application > IndexedDB and Cache Storage are empty |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
