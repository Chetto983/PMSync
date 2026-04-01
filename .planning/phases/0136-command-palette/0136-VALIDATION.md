---
phase: 136
slug: command-palette
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 136 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-check (tsc --noEmit) |
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
| TBD | TBD | TBD | NAV-02 | type-check | `cd frontend && npx tsc --noEmit` | TBD | ⬜ pending |
| TBD | TBD | TBD | NAV-03 | type-check | `cd frontend && npx tsc --noEmit` | TBD | ⬜ pending |
| TBD | TBD | TBD | NAV-04 | type-check | `cd frontend && npx tsc --noEmit` | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No new test framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cmd+K opens palette overlay | NAV-02 | Keyboard shortcut requires browser interaction | Press Cmd+K/Ctrl+K from any page, verify dialog opens with search input focused |
| CRM route navigation | NAV-02 | Route navigation requires browser interaction | Type "pipelines" in palette, select result, verify navigation to /dashboard/crm/pipelines |
| Multi-entity search results | NAV-03 | API search requires running backend | Type a known contact name, verify results grouped by entity type (emails, contacts, deals, tasks, KB) |
| Action execution | NAV-04 | Action dialogs require browser interaction | Select "Create New Deal" from palette, verify deal creation dialog opens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
