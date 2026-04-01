# Sprint 18.1 — CRM Sprint Executor Usability Fixes

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service (tooling)        |
| **Date**         | 2026-03-31 → 2026-04-02 (3 giorni)         |
| **Obiettivo**    | Fix 6 usability issues found in CRM Sprint Executor skill audit: stale checkpoint, missing sprint mapping, no auto-advance, bloated context, dirty-tree handling, phase completion detection |
| **Capacita**     | 8 SP (tooling sprint, quick fixes)          |

---

## Sprint Backlog

- [ ] T-1811 — Fix stale checkpoint: replace hardcoded `phase-1-core-crm/CHECKPOINT.md` path in Dynamic Context with scan logic that reads ALL `crm/sprints/phase-*/CHECKPOINT.md` files and selects the one with incomplete tasks (or the most recently updated if all complete). This is the #1 bug — today it loaded Sprint 08 instead of Sprint 18. — [2 SP]
- [ ] T-1812 — Add sprint-to-file mapping table: create a lookup table mapping S01-S18 to their phase directories (e.g. S18 → `phase-3-service/sprint-18.md`). Include sub-sprints (07.1, 17.1, 18.1). Place in the Phase 0 section so the executor can resolve any sprint number to its file path without globbing. — [1 SP]
- [ ] T-1813 — Add auto-advance between sprints: when the last task in a sprint is marked done, read `crm/docs/01-ROADMAP-SOLO.md` to find the next sprint number, open it, announce completion ("Sprint N complete — N/N tasks, N SP. Advancing to Sprint N+1."), and continue picking the first unchecked task. If all sprints in a phase are done, announce "Phase X complete." — [2 SP]
- [ ] T-1814 — Extract static content to reference docs: move UI/UX Design System (~150 lines) to `crm/docs/UI-DESIGN-SYSTEM.md` and production validation details (~80 lines) to `crm/docs/PRODUCTION-VALIDATION.md`. Replace inline content with "Read `crm/docs/UI-DESIGN-SYSTEM.md` before building frontend components" and "Read `crm/docs/PRODUCTION-VALIDATION.md` at sprint end." Saves ~5K tokens per invocation. — [1 SP]
- [ ] T-1815 — Add dirty-tree check at session start: insert a step in Phase 0 that runs `git status --short` and warns if non-CRM staged files exist. Guidance: "Unstage non-CRM files with `git reset HEAD <file>` before proceeding, or commit them separately first." Prevents accidental cross-contamination like today's billing-frontend leak. — [1 SP]
- [x] T-1816 — Remove Graphviz diagram: replace the `dot` digraph (24 lines, not renderable in CLI context) with a 5-line plain-text flow summary. Example: "Checkpoint exists? → restore context → pick next task → execute → commit → checkpoint → repeat or end session." — [1 SP] — ✅ DONE

**Totale: 8 SP**

---

## Dipendenze

- Sprint 18 complete (v0.3.0-beta tagged).
- Skill file at `C:\Users\Davide\.claude\skills\crm-sprint-executor\SKILL.md`.
- No backend/frontend code changes — this sprint modifies only the skill file and creates 2 reference docs.

## Rischi

1. **Skill file changes take effect immediately** — no deploy needed, but a bad edit breaks the executor for all future sessions. Mitigazione: test each change by dry-running `/crm-sprint-executor` after editing.
2. **Auto-advance logic depends on roadmap format** — if roadmap structure changes, auto-advance breaks. Mitigazione: use simple pattern matching on sprint file names, not roadmap parsing.

## Definition of Done

- [ ] `/crm-sprint-executor` with no arguments correctly identifies Sprint 18.1 (not Sprint 08)
- [ ] Sprint-to-file mapping resolves all 18+ sprints including sub-sprints
- [ ] Auto-advance announces sprint completion and opens next sprint
- [ ] SKILL.md is under 250 lines (down from ~400)
- [ ] UI/UX Design System lives in `crm/docs/UI-DESIGN-SYSTEM.md`
- [ ] Production validation details live in `crm/docs/PRODUCTION-VALIDATION.md`
- [ ] Dirty-tree warning fires when non-CRM files are staged
- [ ] Graphviz diagram replaced with plain-text flow

## Deliverable Attesi

- Updated `SKILL.md` (~250 lines, down from ~400)
- New `crm/docs/UI-DESIGN-SYSTEM.md` (extracted from SKILL.md)
- New `crm/docs/PRODUCTION-VALIDATION.md` (extracted from SKILL.md)
- Updated checkpoint scanning logic in Dynamic Context section
