---
phase: 38
slug: attachment-proxy-path-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + manual verification |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `npx playwright test --grep "attachment"` (if test exists) |
| **Full suite command** | `cd frontend && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Manual verification — open an email with attachment, verify download returns 200 (not 404)
- **After every plan wave:** Full Playwright suite `cd frontend && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | API-03 | unit/smoke | Manual: verify proxy URL includes `/api/v1` prefix, download returns 200 | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | SEC-01 | e2e/manual | Manual: verify cookie-authenticated download succeeds | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- No dedicated E2E test exists for attachment download flow
- Manual verification is sufficient given the fix's simplicity (single URL string fix)
- Existing Playwright infrastructure covers framework setup

*Existing infrastructure covers all phase requirements — manual verification sufficient for one-line URL fix.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Attachment download returns 200 with correct content-type | API-03 | One-line fix, E2E test would be disproportionate | 1. Start backend + frontend 2. Open email with attachment 3. Click download 4. Verify 200 response with file data |
| Cookie auth works for attachment proxy | SEC-01 | Auth flow already tested by Phase 34, only URL path changed | 1. Log in via cookie auth 2. Download attachment 3. Verify no 401/403 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
