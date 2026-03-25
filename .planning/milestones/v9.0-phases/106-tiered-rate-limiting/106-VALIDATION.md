---
phase: 106
slug: tiered-rate-limiting
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 106 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (ts-jest preset) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npm test -- --testPathPattern=throttl --forceExit` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~15 seconds (throttler tests only) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --testPathPattern=throttl --forceExit`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 106-01-01 | 01 | 1 | RATE-01, RATE-02, RATE-03 | unit | `cd backend && npm test -- --testPathPattern=user-throttler` | ❌ W0 | ⬜ pending |
| 106-01-02 | 01 | 1 | RATE-02 | unit (audit) | `cd backend && npm test -- --testPathPattern=rate-tier-audit` | ❌ W0 | ⬜ pending |
| 106-01-03 | 01 | 1 | RATE-01 | unit | `cd backend && npm test -- --testPathPattern=rate-tier` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/guards/user-throttler.guard.spec.ts` — covers RATE-01, RATE-03 (tier selection, method-based auto-assignment)
- [ ] `backend/src/common/decorators/rate-tier.decorator.spec.ts` — covers decorator metadata
- [ ] Rate tier audit test (grep all @Throttle decorators, verify no `default` key remains) — covers RATE-02

*Existing test infrastructure (Jest + ts-jest) covers framework needs. Only test files are missing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Redis rate limit counters under load | RATE-01 | Requires live Redis + concurrent requests | 1. Start dev server 2. Send 11 emails in < 1 min 3. Verify 11th gets 429 4. Verify label operations still succeed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
