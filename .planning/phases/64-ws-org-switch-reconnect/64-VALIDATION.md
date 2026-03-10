---
phase: 64
slug: ws-org-switch-reconnect
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (frontend) |
| **Config file** | `frontend/jest.config.ts` |
| **Quick run command** | `cd frontend && npx jest --passWithNoTests --testPathPattern websocket` |
| **Full suite command** | `cd frontend && npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | ORG-04 | unit | `cd frontend && npx jest --testPathPattern websocket-client` | ❌ W0 | ⬜ pending |
| 64-01-02 | 01 | 1 | P62-04 | unit+type | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/__tests__/lib/websocket-client.test.ts` — unit test for `reconnectForOrgSwitch()` method

*Existing infrastructure covers type-check and lint requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Org switch delivers new org events | P62-04 | Requires live WS server + multiple orgs | 1. Login with user in 2+ orgs 2. Open Network/WS tab 3. Switch org via OrgSwitcher 4. Verify WS disconnects + reconnects 5. Trigger event in new org, verify it arrives |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
