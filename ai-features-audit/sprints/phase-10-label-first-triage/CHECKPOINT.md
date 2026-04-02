# Phase 10 Checkpoint — Label-First Triage

| Field | Value |
|-------|-------|
| **Status** | IN PROGRESS |
| **Last Task** | T-1610 (Sprint 16 — Validation & integration test) |
| **Next Task** | T-1701 (Sprint 17 — Inbox Lanes UI) |
| **Tasks Done** | 22/29 |
| **SP Done** | 48/67 |

## Sprint 14 — COMPLETE (6/6 tasks, 13 SP)

All schema, taxonomy, service, API, and LLM integration tasks done.

## Sprint 15 — COMPLETE (6/6 tasks, 14 SP)

All 3 extracted services created and wired:
- `label-resolution.service.ts` — Precedence-based label pipeline (rules > LLM > heuristic > empty)
- `triage-score.service.ts` — Label-metadata-subordinate scoring (suppressUrgency, category, defaultLane)
- `lane-assignment.service.ts` — Inbox lane derivation (overrides > label defaults > actionability fallback)
- `email-analysis.service.ts` rewired to use new pipeline (old methods removed)
- `triage-action.service.ts` uses actionability field (replaces heuristic shouldCreateFollowUp)
- `email-triage.service.ts` propagates lane/intent/actionability through TriageResult

## Sprint 16 — COMPLETE (10/10 tasks, 21 SP)

Label Wizard Onboarding & Dynamic Prompt Engine:
- T-1601: Added `roles[]`, `contents[]`, `actionType` to UserLabel schema + migration applied to DB
- T-1602: Removed `DEFAULT_AI_USER_LABELS` and `ensureDefaultUserLabels()` from all callers
- T-1603: Created `label-prompt-builder.ts` with `buildAiPromptFromMetadata()`
- T-1604: Updated `buildLabelPromptBlock()` to group by category, add mutual exclusion rules, moved `reasoning` to first JSON field
- T-1605: Created wizard REST endpoints: GET /labels/wizard-options, POST /labels/wizard, PUT /:id/wizard
- T-1606: Added EN+IT translations for 4-step wizard (70+ keys)
- T-1607: Created TanStack Query hooks: useLabelWizardOptions, useCreateLabelWizard, useUpdateLabelWizard
- T-1608: Created LabelWizardDialog (329 lines) — 4-step MUI Stepper with mobile support
- T-1609: Created LabelsEmptyState + integrated wizard into LabelsSidebar
- T-1610: All validations pass (backend + frontend tsc, no circular deps, no DEFAULT_AI references)

## Sprint 17-18 — PLANNED

Inbox Lanes UI + Triage Learning.

## Findings Addressed

| Finding | Sprint | Status |
|---------|--------|--------|
| LFT-A1: No onboarding rules | S14 | DONE (TriageRuleService + REST endpoints) |
| LFT-A2: Label taxonomy thin | S14, S16 | DONE (wizard structured fields + auto-generated prompts) |
| LFT-B1: No summary-first pipeline | S15 | DONE (label resolution > score > lane pipeline) |
| LFT-B2: No label precedence | S15 | DONE (LabelResolutionService 4-tier precedence) |
| LFT-C1: Score overrides semantics | S15 | DONE (TriageScoreService label-subordinate scoring) |
| LFT-C2: No inbox workflow views | S16, S17 | S16 DONE (wizard + empty state), S17 PLANNED |
| LFT-D1: No correlation | S18 | PLANNED |
| LFT-D2: No learning from corrections | S18 | PLANNED |
| LFT-E1: No production validation | S18 | PLANNED |

## Last Modified Files

- `backend/prisma/schema.prisma` — Added roles[], contents[], actionType to UserLabel (T-1601)
- `backend/prisma/migrations/20260402140000_add_label_wizard_fields/migration.sql` — NEW (T-1601)
- `backend/src/modules/labels/default-user-labels.ts` — Stripped to LabelDef interface only (T-1602)
- `backend/src/modules/ai/services/email-analysis.service.ts` — Removed default labels, dynamic prompt builder (T-1602, T-1604)
- `backend/src/modules/labels/services/labels.service.ts` — Removed ensureDefaults, added wizard methods (T-1602, T-1605)
- `backend/src/modules/providers/services/provider-config.service.ts` — Removed seedDefaultUserLabels (T-1602)
- `backend/src/modules/labels/label-prompt-builder.ts` — NEW (T-1603)
- `backend/src/modules/ai/locales/en.ts` — reasoning first in JSON schema (T-1604)
- `backend/src/modules/ai/locales/it.ts` — reasoning first in JSON schema (T-1604)
- `backend/src/modules/labels/dto/labels.dto.ts` — CreateLabelWizardDto (T-1605)
- `backend/src/modules/labels/controllers/labels.controller.ts` — Wizard endpoints (T-1605)
- `frontend/locales/en.ts` — Wizard translations (T-1606)
- `frontend/locales/it.ts` — Wizard translations (T-1606)
- `frontend/locales/index.ts` — Wizard types (T-1606)
- `frontend/hooks/queries/use-label-wizard.ts` — NEW (T-1607)
- `frontend/lib/api/labels.ts` — Wizard API methods + extended Label interface (T-1607)
- `frontend/components/email/labels/LabelWizardDialog.tsx` — NEW (T-1608)
- `frontend/components/email/labels/LabelsEmptyState.tsx` — NEW (T-1609)
- `frontend/components/email/sidebar/LabelsSidebar.tsx` — Wizard integration (T-1609)

## Key Decisions

- **No default labels** — users must create their own via wizard (user directive 2026-04-02)
- Labels have structured metadata: `roles[]`, `contents[]`, `actionType`
- `aiPrompt` auto-generated from structured fields; power users can override via "Advanced" toggle
- System prompt groups labels by category with `<MUTUAL_EXCLUSION_RULES>` block
- `reasoning` moved to first JSON field for chain-of-thought before classification
- Sprint 15 services use label metadata (not hardcoded names) for scoring/resolution
- Migration applied to Railway DB via `prisma migrate deploy` (additive, no DROP)
- Max 20 labels per tenant enforced server-side

## Validation Status

- Backend type-check: PASS
- Frontend type-check: PASS
- Circular dependencies: NONE
- `DEFAULT_AI_USER_LABELS` / `ensureDefaultUserLabels`: fully removed (0 references)
- `email-analysis.service.ts`: 520 lines (slightly over 500, expected to decrease)
- Migration applied to production DB
