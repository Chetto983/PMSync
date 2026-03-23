---
phase: 104
slug: background-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 104 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + jsdom (`frontend/jest.config.js`) |
| **Config file** | `frontend/jest.config.js` |
| **Quick run command** | `cd frontend && npx jest --testPathPattern="offline-action-queue\|use-offline-actions\|offline-queue-store" --no-coverage` |
| **Full suite command** | `cd frontend && npx jest --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx jest --testPathPattern="offline-action-queue|use-offline-actions" --no-coverage`
- **After every plan wave:** Run `cd frontend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 104-01-01 | 01 | 1 | SYNC-01 | unit | `cd frontend && npx jest lib/offline-action-queue.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 104-01-02 | 01 | 1 | SYNC-01 | unit | `cd frontend && npx jest hooks/queries/use-emails.test.ts --no-coverage -x` | ✅ (modify) | ⬜ pending |
| 104-01-03 | 01 | 1 | SYNC-01 | unit | `cd frontend && npx jest hooks/queries/use-emails.test.ts --no-coverage -x` | ✅ (modify) | ⬜ pending |
| 104-02-01 | 02 | 2 | SYNC-02 | unit | `cd frontend && npx jest hooks/use-offline-actions.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 104-02-02 | 02 | 2 | SYNC-02 | unit | `cd frontend && npx jest hooks/use-offline-actions.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 104-02-03 | 02 | 2 | SYNC-03 | unit | `cd frontend && npx jest hooks/use-offline-actions.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |
| 104-02-04 | 02 | 2 | SYNC-03 | unit | `cd frontend && npx jest lib/offline-action-queue.test.ts --no-coverage -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/lib/offline-action-queue.test.ts` — covers SYNC-01, SYNC-03 (queue CRUD + TTL)
- [ ] `frontend/hooks/use-offline-actions.test.ts` — covers SYNC-02, SYNC-03 (replay + expiry notification)
- [ ] Mock for `idb-keyval` store in tests (already have `transformIgnorePatterns` exception for idb-keyval in jest.config.js)
- [ ] Mock for `navigator.onLine` in tests (jsdom supports this via `Object.defineProperty`)
- [ ] Mock for `crypto.randomUUID` in tests (jsdom may need polyfill)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full offline→online flow | SYNC-01, SYNC-02 | Requires real browser network toggle | Go offline in DevTools, star/mark-read emails, go online, verify server state |
| BackgroundSync SW relay | SYNC-02 | Chromium-only, requires real SW context | Chrome DevTools > Application > Background Sync, trigger sync, verify replay |
| Expired action toast notification | SYNC-03 | Requires timing manipulation in real browser | Queue action, wait 30+ min (or manipulate timestamp), go online, verify toast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
