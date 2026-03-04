---
phase: 37
slug: performance-debt-closure
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-04
---

# Phase 37 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (frontend) + Lighthouse CI |
| **Config file** | `frontend/lighthouserc.js` (exists) |
| **Quick run command** | `cd frontend && npm run type-check && npm run lint` |
| **Full suite command** | `cd frontend && npx @lhci/cli autorun` |
| **Estimated runtime** | ~60 seconds (type-check+lint), ~120 seconds (Lighthouse) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run type-check && npm run lint`
- **After every plan wave:** Run `cd frontend && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green (`npx @lhci/cli autorun`)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | PERF-01 | build + bundle check | `npm run build && grep -c "dynamic(" frontend/pages/dashboard/email.tsx` | Yes | pending |
| 37-01-02 | 01 | 1 | PERF-01 | type-check + lint | `cd frontend && npm run type-check && npm run lint` | Yes | pending |
| 37-02-01 | 02 | 2 | PERF-02 | type-check + lint + grep | `cd frontend && npm run type-check && npm run lint && grep -c "acquireLock\|RedisLock" ../backend/src/modules/email-sync/services/folder-sync.service.ts` | Yes | pending |
| 37-02-02 | 02 | 2 | PERF-02 | grep | `grep -c "continue-on-error" .github/workflows/frontend-ci.yml` must be 0 | Yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All existing infrastructure covers the phase needs:
- [x] `@next/bundle-analyzer` -- already installed and configured in next.config.js
- [x] `@lhci/cli` -- already available in frontend-ci.yml workflow
- [x] `lighthouserc.js` -- already configured with LCP 2500ms, TTI 3500ms, CLS 0.1 thresholds
- [x] `npm run type-check` / `npm run lint` / `npm run build` -- standard frontend scripts

No additional tooling installation required. Memory profiling (clinic/autocannon) was descoped from Phase 37 -- see ROADMAP.md update.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deferred bugs resolved | PERF-02 | Bug fixes verified by code review + type-check | Review each BUG-REPORT item, confirm fix or document accepted exception |
| BUG-039 FolderPickerDialog trigger | PERF-02 | Requires visual UI confirmation | Open email page, trigger folder picker, confirm dialog opens |
| Bundle size reduction | PERF-01 | ANALYZE=true output requires human comparison | Compare before/after chunk sizes in 37-01-SUMMARY |

---

## Descoped Items

| Item | Original Criterion | Reason | Where Tracked |
|------|-------------------|--------|---------------|
| Memory profiling under load | ROADMAP criterion 5 (removed) | No evidence of unbounded growth; backend memory profiling is a separate concern unrelated to frontend performance debt | Candidate for future v4.1 ops phase |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all infrastructure needs
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
