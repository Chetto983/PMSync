---
phase: 94
slug: infrastructure-remaining-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + Node.js scripts (HTTP/WS) |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `npx playwright test --grep @phase94` |
| **Full suite command** | `npx playwright test frontend/e2e/phase94/` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --grep @phase94`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | BAPI-20 | e2e-http | `node scripts/test-websocket.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BAPI-21 | e2e-http | `node scripts/test-health.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BAPI-22 | e2e-http | `node scripts/test-webhooks.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FE-09 | playwright | `npx playwright test dashboard.spec` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FE-15 | playwright | `npx playwright test tasks.spec` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FE-16 | playwright | `npx playwright test analytics.spec` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FE-17 | playwright | `npx playwright test landing.spec` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FE-18 | playwright | `npx playwright test legal.spec` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/e2e/phase94/` — test directory structure
- [ ] WebSocket test script — standalone Node.js with socket.io-client
- [ ] Health endpoint test script — HTTP assertions
- [ ] Webhook contract test script — HTTP with mock payloads

*Existing Playwright infrastructure covers frontend page tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard drag-and-drop layout rearrange | FE-09 | react-grid-layout drag simulation unreliable in CI | Open dashboard, drag widget, verify new position persists after refresh |

*All other behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
