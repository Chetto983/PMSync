---
phase: 100
slug: pwa-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 100 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (frontend), manual browser verification |
| **Config file** | `frontend/jest.config.js` or "none — Wave 0 installs" |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npm run type-check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx tsc --noEmit && npm run type-check`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 100-01-01 | 01 | 1 | FOUND-01 | integration | `cd frontend && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 100-01-02 | 01 | 1 | FOUND-02 | integration | `cd frontend && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 100-01-03 | 01 | 1 | FOUND-03 | manual | Browser DevTools SW check | N/A | ⬜ pending |
| 100-01-04 | 01 | 1 | FOUND-04 | manual | Network tab API request check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] TypeScript compilation passes with new SW/manifest files
- [ ] Serwist types installed and recognized by tsc

*Existing infrastructure covers most phase requirements — PWA behaviors are primarily browser-verified.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App installs with correct name/icons | FOUND-01 | Requires real browser install prompt | Open in Chrome/Edge, check install prompt, verify name "PMSync" and icons |
| SW serves cached assets | FOUND-02 | Requires browser DevTools | Open Application > Service Workers, verify active; check Network tab for "(from service worker)" |
| SW updates after deploy | FOUND-03 | Requires Vercel deployment | Deploy, wait, hard-reload, check SW version in DevTools |
| /api/* bypasses SW | FOUND-04 | Requires runtime network inspection | Open Network tab, make API call, verify no SW interception |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
