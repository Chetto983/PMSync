---
phase: 101
slug: offline-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd frontend && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 101-01-01 | 01 | 1 | OFFL-04 | manual | Browser offline test | N/A | ⬜ pending |
| 101-01-02 | 01 | 1 | OFFL-01 | manual | Navigate uncached route offline | N/A | ⬜ pending |
| 101-02-01 | 02 | 1 | OFFL-02 | unit | `cd frontend && npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/hooks/__tests__/use-online-status.test.ts` — unit test for online/offline hook
- [ ] Existing vitest infrastructure covers framework needs

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline fallback page renders | OFFL-01 | Requires actual SW interception | 1. Build app 2. Open in browser 3. Go offline in DevTools 4. Navigate to uncached route 5. Verify branded page shows |
| App shell loads from cache offline | OFFL-04 | Requires cached SW + offline mode | 1. Visit app online (populates cache) 2. Go offline 3. Refresh — shell must render |
| Online/offline banner appears/disappears | OFFL-02 | Requires network state toggling | 1. Open app 2. Toggle offline in DevTools 3. Banner appears 4. Toggle online 5. Banner disappears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
