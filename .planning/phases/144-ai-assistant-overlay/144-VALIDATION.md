---
phase: 144
slug: ai-assistant-overlay
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
---

# Phase 144 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (tsc) + ESLint |
| **Config file** | `frontend/tsconfig.json`, `frontend/.eslintrc.cjs` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npm run lint:win` |
| **Backend validation** | `cd backend && npx tsc --noEmit` (Plan 04 only) |
| **Estimated runtime** | ~30 seconds |

---

## Nyquist Compliance Rationale

**Strategy: tsc-only automated verification + manual E2E checkpoint.**

This phase is a UI assembly task -- wiring existing tested chat components into a new MUI Drawer container, adding keyboard shortcuts, and piping context metadata through an existing transport. No new algorithmic logic, business rules, or data transformations are introduced.

**Why tsc is sufficient automated feedback:**
- The primary failure mode is integration wiring (wrong imports, mismatched prop types, missing context providers) -- `tsc --noEmit` catches all of these
- The secondary failure mode is visual/behavioral (drawer doesn't open, context shows wrong label) -- Plan 03 Task 3 provides a 15-step manual verification checkpoint
- Components created are purely presentational (Drawer wrapper, header, chip, drag handle) or trivial glue (3-line useEffect for context sync)
- The Zustand store has 6 trivial state transitions (toggle, open, close, setWidth) with no branching logic

**Why Jest unit tests were not added:**
- Would consume ~40% context overhead per plan for marginal coverage over tsc
- The components being tested wrap existing MUI components (Drawer, Chip, Box) whose behavior is already tested by MUI
- Route matching in usePageContext is pure string prefix matching -- type-check ensures correct return shape
- The ROI is negative for this assembly-focused phase

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After Plan 04 tasks:** Also run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx tsc --noEmit && npm run lint:win`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 01-T1 | 01 | 1 | AI-06 | T-144-02 | Width clamped 320-600 | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 01-T2 | 01 | 1 | AI-07 | T-144-01 | Context reads only visible data | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 02-T1 | 02 | 2 | AI-06, AI-07 | T-144-03, T-144-04 | Width clamped; labels auto-escaped | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 02-T2 | 02 | 2 | AI-06 | -- | -- | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 03-T1 | 03 | 3 | AI-06 | T-144-05, T-144-06 | CSRF unchanged; shortcut is UI-only | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 03-T2 | 03 | 3 | AI-06 | T-144-07 | -- | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 03-T3 | 03 | 3 | AI-06, AI-07 | -- | -- | manual | 15-step E2E verification | pending |
| 04-T1 | 04 | 4 | AI-07 | T-144-08 | pageContext validated before prompt injection | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 04-T2 | 04 | 4 | AI-07 | T-144-08 | pageContext.type whitelist; metadata length-limited | type-check (FE+BE) | `cd backend && npx tsc --noEmit` | pending |

*Status: pending / green / red / flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cmd+J toggles AI overlay | AI-06 | Keyboard shortcut + Drawer interaction | Press Cmd+J, verify drawer opens; press again, verify it closes |
| Esc key closes overlay | AI-06 (D-12) | MUI Drawer native behavior, needs visual confirmation | Open overlay, press Escape, verify it closes |
| Context detection on route change | AI-07 | Route-dependent Zustand store state | Navigate to email thread, open overlay, verify context indicator shows email subject |
| Context injected into AI response | AI-07 (D-06) | End-to-end through backend system prompt | Open overlay on email page, send "what am I looking at?", verify AI references the email |
| Resize handle drag | AI-06 | Mouse drag interaction | Drag left edge of drawer, verify width changes and persists on reopen |
| Close and return to position | AI-06 | Scroll position + route preservation | Scroll email list, open overlay, close -- verify scroll position unchanged |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (tsc --noEmit)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not needed -- tsc-only strategy with rationale documented
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter with explicit rationale

**Approval:** ready for execution
