# Phase 124: Documentation & Traceability Cleanup - Research

**Researched:** 2026-03-30
**Domain:** Documentation maintenance (markdown file edits only)
**Confidence:** HIGH

## Summary

Phase 124 is a purely mechanical documentation cleanup phase. No code changes, no tests, no deployments. The milestone audit for v10.0 found that several documentation files fell out of sync with actual project state: checkbox states not updated after phases completed, requirement counts stale, plan completion markers missing, and a missing infrastructure qualifier on FOLD-03.

All six success criteria are simple find-and-replace operations in two files: `REQUIREMENTS.md` and `ROADMAP.md`. The exact lines, current values, and target values are fully identified below.

**Primary recommendation:** Execute all edits in a single plan with per-file verification (diff check after each edit).

## Standard Stack

Not applicable -- this phase edits only markdown files. No libraries, frameworks, or tools needed beyond a text editor.

## Architecture Patterns

Not applicable -- documentation-only phase.

## Exact Edit Map

This is the core research output. Every edit is identified with file, line, current text, and target text.

### File 1: `.planning/REQUIREMENTS.md`

#### Edit Group A: SYNC-04 through SYNC-08 checkboxes (lines 15-18)

| Line | Current | Target |
|------|---------|--------|
| 15 | `- [ ] **SYNC-04**: Incremental sync via Gmail history API...` | `- [x] **SYNC-04**: Incremental sync via Gmail history API...` |
| 16 | `- [ ] **SYNC-05**: Incremental sync via Microsoft delta API...` | `- [x] **SYNC-05**: Incremental sync via Microsoft delta API...` |
| 17 | `- [ ] **SYNC-06**: Incremental sync via IMAP detects...` | `- [x] **SYNC-06**: Incremental sync via IMAP detects...` |
| 18 | `- [ ] **SYNC-07**: Gmail Pub/Sub webhook triggers...` | `- [x] **SYNC-07**: Gmail Pub/Sub webhook triggers...` |
| 19 | `- [ ] **SYNC-08**: Microsoft Graph webhook triggers...` | `- [x] **SYNC-08**: Microsoft Graph webhook triggers...` |

**Justification:** Phase 113 completed 2026-03-26 (ROADMAP.md line 124 shows `[x]`). All 5 requirements satisfied.

#### Edit Group B: INFRA-01 through INFRA-05 checkboxes (lines 61-65)

| Line | Current | Target |
|------|---------|--------|
| 61 | `- [ ] **INFRA-01**: All 7 BullMQ queues report healthy...` | `- [x] **INFRA-01**: All 7 BullMQ queues report healthy...` |
| 62 | `- [ ] **INFRA-02**: Queue pause/resume works without...` | `- [x] **INFRA-02**: Queue pause/resume works without...` |
| 63 | `- [ ] **INFRA-03**: Gmail Pub/Sub subscription create...` | `- [x] **INFRA-03**: Gmail Pub/Sub subscription create...` |
| 64 | `- [ ] **INFRA-04**: Microsoft Graph subscription create...` | `- [x] **INFRA-04**: Microsoft Graph subscription create...` |
| 65 | `- [ ] **INFRA-05**: Webhook health endpoint reports...` | `- [x] **INFRA-05**: Webhook health endpoint reports...` |

**Justification:** Phase 120 completed 2026-03-30 (ROADMAP.md line 131 shows `[x]`, Progress table shows 3/3 Complete).

#### Edit Group C: Coverage count (line 148)

| Line | Current | Target |
|------|---------|--------|
| 148 | `- v10.0 requirements: 41 total` | `- v10.0 requirements: 50 total` |

**Justification:** Actual count: SYNC(13) + READ(9) + WRITE(10) + FOLD(5) + INFRA(10) + XCUT(3) = 50. The "41" was wrong from inception.

#### Edit Group D: FOLD-03 infrastructure qualifier (line 55)

| Line | Current | Target |
|------|---------|--------|
| 55 | `- [x] **FOLD-03**: Delete folder removes from provider and cleans up local records` | `- [x] **FOLD-03**: Delete folder removes from provider and cleans up local records *(IMAP: Blocked by Libero infrastructure limitation; code exists and compiles but IMAP folder delete cannot be live-validated — consistent with WRITE-03 SMTP block)*` |

**Pattern source:** WRITE-03 on line 42 uses the format: `*(Blocked: [reason]; code exists and compiles but no live validation possible in production environment)*`

**Decision source:** STATE.md line 63: "IMAP FOLD-03 delete marked infrastructure-blocked (Libero limitation), consistent with WRITE-03"

#### Edit Group E: Traceability table status updates

| Line | Current | Target |
|------|---------|--------|
| 99 | `SYNC-04 \| Phase 113 \| Pending` | `SYNC-04 \| Phase 113 \| Satisfied` |
| 100 | `SYNC-05 \| Phase 113 \| Pending` | `SYNC-05 \| Phase 113 \| Satisfied` |
| 101 | `SYNC-06 \| Phase 113 \| Pending` | `SYNC-06 \| Phase 113 \| Satisfied` |
| 102 | `SYNC-07 \| Phase 113 \| Pending` | `SYNC-07 \| Phase 113 \| Satisfied` |
| 103 | `SYNC-08 \| Phase 113 \| Pending` | `SYNC-08 \| Phase 113 \| Satisfied` |
| 133 | `INFRA-01 \| Phase 120 \| Pending` | `INFRA-01 \| Phase 120 \| Satisfied` |
| 134 | `INFRA-02 \| Phase 120 \| Pending` | `INFRA-02 \| Phase 120 \| Satisfied` |
| 135 | `INFRA-03 \| Phase 120 \| Pending` | `INFRA-03 \| Phase 120 \| Satisfied` |
| 136 | `INFRA-04 \| Phase 120 \| Pending` | `INFRA-04 \| Phase 120 \| Satisfied` |
| 137 | `INFRA-05 \| Phase 120 \| Pending` | `INFRA-05 \| Phase 120 \| Satisfied` |

**Note:** The traceability table uses "Satisfied" for completed items (see SYNC-01 on line 96), NOT "Complete" (which appears elsewhere for different items like SYNC-09).

**Correction:** Lines 104-108 (SYNC-09 through SYNC-13) use "Complete" not "Satisfied". Lines 96-98 (SYNC-01 through SYNC-03) use "Satisfied". The table is inconsistent. The success criteria for Phase 124 do not mention fixing this inconsistency, so match the convention already used for requirements in the same phase group: SYNC-04..08 should use the same status as other Phase 113 items. Since no Phase 113 items have been updated yet, follow the SYNC-01..03 pattern ("Satisfied") as it's the earliest convention.

### File 2: `.planning/ROADMAP.md`

#### Edit Group F: Phase 113 plan checkboxes (lines 166-167)

| Line | Current | Target |
|------|---------|--------|
| 166 | `- [ ] 113-01-PLAN.md -- Incremental sync validation...` | `- [x] 113-01-PLAN.md -- Incremental sync validation...` |
| 167 | `- [ ] 113-02-PLAN.md -- Webhook sync validation...` | `- [x] 113-02-PLAN.md -- Webhook sync validation...` |

**Justification:** Phase 113 is marked `[x]` complete on line 124 and shows "Complete 2026-03-26" in Progress table line 340, but plan checkboxes were never updated.

#### Edit Group G: Phase 113 progress in table (line 340)

| Line | Current | Target |
|------|---------|--------|
| 340 | `\| 113. Incremental Sync & Webhooks \| 0/2 \| Complete \| 2026-03-26 \|` | `\| 113. Incremental Sync & Webhooks \| 2/2 \| Complete \| 2026-03-26 \|` |

#### Edit Group H: Phase 115 checkbox (line 126)

| Line | Current | Target |
|------|---------|--------|
| 126 | `- [ ] **Phase 115: Email List & Thread Reading**...` | `- [x] **Phase 115: Email List & Thread Reading**...` |

**Justification:** Progress table line 342 shows "2/2 Complete 2026-03-26". The phase-level checkbox was never updated.

#### Edit Group I: Phase 115 plan checkboxes (lines 196-197)

These plan checkboxes also show `[ ]` but the phase is complete:

| Line | Current | Target |
|------|---------|--------|
| 196 | `- [ ] 115-01-PLAN.md -- Validation scripts...` | `- [x] 115-01-PLAN.md -- Validation scripts...` |
| 197 | `- [ ] 115-02-PLAN.md -- Live provider validation...` | `- [x] 115-02-PLAN.md -- Live provider validation...` |

**Note:** This was not explicitly listed in the success criteria but is a logical consequence of criteria #5 ("Phase 115 checkbox updated to [x]"). A phase marked complete with unchecked plans is inconsistent.

## Don't Hand-Roll

Not applicable -- no software to build.

## Common Pitfalls

### Pitfall 1: Missing related edits
**What goes wrong:** Updating the checkbox but not the traceability table, or vice versa.
**How to avoid:** The edit map above is exhaustive. The plan should include a verification step that greps for remaining `[ ]` checkboxes and "Pending" statuses.

### Pitfall 2: Inconsistent status terminology
**What goes wrong:** Using "Complete" vs "Satisfied" inconsistently in the traceability table.
**How to avoid:** The existing table uses "Satisfied" for Phase 112 items and "Complete" for Phase 114 items. Follow precedent per section: use "Satisfied" for the SYNC and INFRA items being updated (matching SYNC-01..03 and the general convention for requirement satisfaction).

### Pitfall 3: FOLD-03 qualifier wording
**What goes wrong:** Copying WRITE-03 verbatim instead of adapting to FOLD-03's specific blocker (Libero IMAP limitation, not Railway SMTP port block).
**How to avoid:** The qualifier text in Edit Group D above is already adapted. The blocker is different: WRITE-03 is blocked by Railway SMTP ports, FOLD-03 is blocked by Libero IMAP infrastructure.

### Pitfall 4: Line number drift
**What goes wrong:** If Phase 123 modifies these files before Phase 124, line numbers may shift.
**How to avoid:** Use content-based matching (search for the text pattern), not line-number-based edits.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual diff verification (no automated tests for documentation) |
| Config file | N/A |
| Quick run command | `grep -c "\- \[ \]" .planning/REQUIREMENTS.md` |
| Full suite command | `grep -n "Pending" .planning/REQUIREMENTS.md && grep -n "\- \[ \]" .planning/ROADMAP.md` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | SYNC-04..08 checkboxes [x] | manual | `grep "SYNC-0[4-8]" .planning/REQUIREMENTS.md` | N/A |
| SC-2 | INFRA-01..05 checkboxes [x] | manual | `grep "INFRA-0[1-5]" .planning/REQUIREMENTS.md` | N/A |
| SC-3 | Coverage count = 50 | manual | `grep "50 total" .planning/REQUIREMENTS.md` | N/A |
| SC-4 | Phase 113 progress 2/2 | manual | `grep "113.*2/2" .planning/ROADMAP.md` | N/A |
| SC-5 | Phase 115 checkbox [x] | manual | `grep "Phase 115" .planning/ROADMAP.md` | N/A |
| SC-6 | FOLD-03 has qualifier | manual | `grep "FOLD-03.*IMAP" .planning/REQUIREMENTS.md` | N/A |

### Sampling Rate
- **Per task commit:** Grep checks for all 6 success criteria
- **Per wave merge:** N/A (single plan phase)
- **Phase gate:** All 6 grep checks pass

### Wave 0 Gaps
None -- no test infrastructure needed for documentation edits.

## Open Questions

1. **Phase 115 plan checkboxes (lines 196-197)**
   - What we know: They show `[ ]` but Phase 115 is complete (2/2 in progress table)
   - What's unclear: Whether the success criteria intentionally excludes this or it was an oversight
   - Recommendation: Fix them as part of the same cleanup -- leaving unchecked plan boxes under a checked phase is clearly wrong

2. **Traceability table status inconsistency ("Satisfied" vs "Complete")**
   - What we know: SYNC-01..03 use "Satisfied", SYNC-09..13 use "Complete", READ-01..05 use "Complete"
   - What's unclear: Whether this is intentional (different semantic meaning) or accidental
   - Recommendation: Out of scope for Phase 124 success criteria. Do not fix unless explicitly asked.

3. **INFRA-06..10 traceability status (lines 138-142)**
   - What we know: They show "Pending (verification gap)" and map to "Phase 121 -> 123"
   - What's unclear: Phase 123 hasn't been executed yet. Should these be updated in Phase 124?
   - Recommendation: Only update after Phase 123 completes. Phase 124 depends on Phase 123, so by execution time these may need updating too. But the success criteria does not mention them, so leave them as-is unless Phase 123 changes the situation.

## Sources

### Primary (HIGH confidence)
- `.planning/REQUIREMENTS.md` - Direct file read, all line numbers verified
- `.planning/ROADMAP.md` - Direct file read, all line numbers verified
- `.planning/STATE.md` - Direct file read, decision on FOLD-03 confirmed (line 63)

## Metadata

**Confidence breakdown:**
- Edit identification: HIGH - All edits derived from direct file inspection
- Line numbers: MEDIUM - May shift if Phase 123 modifies these files first
- FOLD-03 qualifier wording: MEDIUM - Adapted from WRITE-03 pattern + STATE.md decision; exact wording is discretionary

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (documentation is stable; only risk is Phase 123 modifying files first)
