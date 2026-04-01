---
phase: 135
slug: sidebar-reduction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 135 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-check (tsc --noEmit) + visual verification |
| **Config file** | `frontend/tsconfig.json` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npm run lint:win` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx tsc --noEmit && npm run lint:win`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 135-01-01 | 01 | 1 | NAV-01 | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 135-01-02 | 01 | 1 | NAV-01 | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 135-02-01 | 02 | 2 | NAV-01 | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 135-02-02 | 02 | 2 | NAV-06 | manual | browser URL test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript type-checking and lint are already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 5 pillar icons visible in sidebar | NAV-01 | Visual UI check | Open app, verify sidebar shows Home/Mail/Calendar/Contacts/Tasks + Settings |
| Deep links still work | NAV-06 | Route navigation check | Navigate to `/dashboard/crm/pipelines`, `/dashboard/crm/contacts`, `/dashboard/ai-chat` by URL — pages must render |
| Mobile bottom tab bar | NAV-01 | Device viewport check | Resize to mobile viewport, verify bottom tab bar appears with 5 pillars |
| DnD reorder on icon rail | NAV-01 | Interaction check | Drag a pillar icon to new position, verify order persists after reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
