# Phase 153 - Label Hardening Debug Runbook

## Purpose

This runbook defines the narrowest reliable workflow for reproducing label-creation bugs and duplication without mutating production.

Use this before implementing Phase 153 fixes.

## Environment notes

### Working assumptions

- repo root: `d:\MailAgent`
- backend commands run from `d:\MailAgent\backend`
- frontend commands run from `d:\MailAgent\frontend`
- focus on targeted tests and code inspection first

### Important backend note

The backend test environment currently has two workflow hazards:

1. some label tests are Jest-based and expensive enough to hit memory pressure
2. some adjacent triage tests are Vitest-based and cannot be run through the direct Jest entrypoint

Treat backend label specs as evidence, but read the mocks carefully before turning failures into product conclusions.

## Canonical test commands

### Backend

```powershell
node -r dotenv/config .\node_modules\jest\bin\jest.js src/modules/labels/services/__tests__/labels.service.spec.ts --runInBand
```

### Frontend

```powershell
node .\node_modules\jest\bin\jest.js components/email/labels/LabelWizardDialog.test.tsx components/email/labels/TriageSetupForm.test.tsx stores/label-store.test.ts
```

## Debug workflow

### 1. Start with the semantic write-path split

Read:

- `backend/src/modules/labels/dto/labels.dto.ts`
- `backend/src/modules/labels/services/labels.service.ts`
- `backend/src/modules/labels/controllers/labels.controller.ts`

Goal:

- enumerate every path that can create or materially redefine a label
- separate semantic edits from structural edits

Focus on:

- `create()` / `update()`
- `createFromWizard()` / `updateFromWizard()`
- `previewTriageOnboarding()` / `applyTriageOnboarding()`

### 2. Confirm live frontend entrypoints

Read:

- `frontend/components/email/sidebar/LabelsSidebar.tsx`
- `frontend/components/email/layout/MobileFolderSheet.tsx`
- `frontend/components/email/labels/LabelContextMenu.tsx`

Goal:

- confirm whether active UI mounts the wizard or the legacy dialog
- verify whether the duplication is live UX or retained legacy code

### 3. Confirm retained raw clients

Read:

- `frontend/components/email/labels/LabelDialog.tsx`
- `frontend/hooks/queries/use-labels.ts`
- `frontend/stores/label-store.ts`

Goal:

- identify what still depends on raw `createLabel` / `updateLabel`
- decide whether those paths are dead, structural-only, or still semantically meaningful

### 4. Debug exclusivity correctness

Read:

- `backend/prisma/schema.prisma`
- `backend/src/modules/ai/services/label-resolution.service.ts`
- `backend/src/modules/labels/services/labels.service.ts`

Goal:

- verify how `mutuallyExclusiveWith` is stored
- verify whether rename, bidirectionality, and existence are enforced
- confirm whether contradiction resolution is deterministic

### 5. Debug onboarding contract drift

Read:

- `backend/src/modules/labels/triage-onboarding.contract.ts`
- `frontend/components/email/labels/TriageSetupForm.tsx`
- `backend/src/modules/labels/controllers/labels.controller.ts`

Goal:

- decide whether onboarding is rules-only or label-materialization
- align preview/apply/controller/frontend language with that decision

## Repro scenarios

### Scenario A - Same semantic label can be expressed through different invariant sets

1. Compare raw label create DTO with wizard DTO.
2. Compare `create()` with `createFromWizard()`.
3. Observe that only the wizard path derives `defaultLane`, stores metadata, and applies the max-label cap.

### Scenario B - Exclusivity breaks on rename

1. Create two labels with name-based `mutuallyExclusiveWith`.
2. Rename one label.
3. Inspect stored exclusions and `resolveContradictions()` behavior.

Expected outcome:

- at least one stale name reference remains unless extra repair logic is added

### Scenario C - Onboarding says "will create" but apply does not create labels

1. Run onboarding preview.
2. Inspect `recommendedLabels[*].willCreate`.
3. Run onboarding apply.
4. Inspect `UserLabel` rows for the tenant.

Expected outcome:

- preview suggests creation semantics
- apply persists rules only

### Scenario D - Integration spec drift around onboarding rules

1. Run:
   ```powershell
   node -r dotenv/config .\node_modules\jest\bin\jest.js src/modules/labels/services/__tests__/labels.service.spec.ts --runInBand
   ```
2. Inspect:
   - mock setup at `labels.service.spec.ts:20`
   - failing expectation at `labels.service.spec.ts:148-153`

Expected outcome:

- the spec failure is reproducible
- the failure is caused by mock/expectation drift, not by a live derived-rules implementation bug

## Debug checkpoints

Before proposing fixes, answer these explicitly:

1. Which operations are semantic label-definition writes, and which are structural-only updates?
2. Will exclusivity remain name-based, or migrate to stable identifiers?
3. Is onboarding rules-only by design, or should it materialize labels?
4. Which retained frontend pieces are truly dead and can be removed?
5. Which narrow backend test command should be treated as the supported label-hardening entrypoint?

## Do not do in this phase

- do not implement merge/backfill logic before the source-of-truth split is decided
- do not trust failing backend label tests without reading the mocks
- do not add more creation surfaces before consolidating the existing ones
