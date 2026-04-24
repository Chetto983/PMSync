# Phase 153 - Label Creation Hardening Context

**Date:** 2026-04-23  
**Mode:** docs-only audit  
**Evidence standard:** code inspection + targeted local tests

## Scope

This audit covers label-definition and label-creation paths only:

- backend raw label CRUD
- backend wizard create/update
- triage onboarding preview/apply
- frontend label creation/edit surfaces
- downstream label-resolution semantics that depend on creation metadata

It does not implement runtime fixes.

## Current system map

### 1. Raw label CRUD path

The legacy label path persists only a small shape:

- `backend/src/modules/labels/dto/labels.dto.ts:18-42`
- `backend/src/modules/labels/services/labels.service.ts:156-214`
- `backend/src/modules/labels/controllers/labels.controller.ts:175-198`

It accepts:

- `name`
- `color`
- `icon`
- `parentId`
- `aiPrompt`

It does not enforce:

- wizard metadata completeness
- max-label limit
- `mutuallyExclusiveWith` validation
- `defaultLane` derivation
- semantic overlap checks

### 2. Wizard label path

The wizard path persists the richer triage shape:

- `backend/src/modules/labels/dto/labels.dto.ts:93-138`
- `backend/src/modules/labels/services/labels.service.ts:848-967`
- `backend/src/modules/labels/label-prompt-builder.ts:62-86`
- `backend/src/modules/labels/controllers/labels.controller.ts:58-100`

It adds:

- `category`
- `roles`
- `contents`
- `actionType`
- `suppressUrgency`
- `mutuallyExclusiveWith`
- derived `defaultLane`
- generated `aiPrompt`
- max 20 labels per tenant

### 3. Triage onboarding path

The onboarding contract creates a third label-definition system:

- `backend/src/modules/labels/triage-onboarding.contract.ts:220-311`
- `backend/src/modules/labels/services/labels.service.ts:112-152`
- `frontend/components/email/labels/TriageSetupForm.tsx:100-105`

It can preview recommended labels and mark them `willCreate`, but apply currently writes triage rules only and then returns current labels.

### 4. Frontend reality

Active label-management surfaces now use the wizard:

- desktop sidebar create: `frontend/components/email/sidebar/LabelsSidebar.tsx:509-514`
- mobile label create: `frontend/components/email/layout/MobileFolderSheet.tsx:548-552`
- label edit: `frontend/components/email/labels/LabelContextMenu.tsx:271-275`

But legacy raw clients still exist:

- `frontend/components/email/labels/LabelDialog.tsx:93-129`
- `frontend/hooks/queries/use-labels.ts:108-143`
- `frontend/stores/label-store.ts:58-109`

## Evidence snapshot

### Targeted tests run

1. `backend/src/modules/labels/services/__tests__/labels.service.spec.ts`  
   Result: **FAIL** - 1 failing test, 21 passing tests  
   Confirmed failure: onboarding integration spec expects derived rules, but mocked `setTriageRules()` returns `[]`
2. `frontend/components/email/labels/LabelWizardDialog.test.tsx`  
   Result: **PASS**
3. `frontend/components/email/labels/TriageSetupForm.test.tsx`  
   Result: **PASS**
4. `frontend/stores/label-store.test.ts`  
   Result: **PASS**

### Harness notes

- `labels.service.triage.unit.spec.ts` hit memory pressure in the current backend Jest environment when run directly.
- `triage-rule.service.spec.ts` is Vitest-based and is not runnable via the backend Jest entrypoint.

These are test-workflow findings, not product-behavior proofs by themselves.

## Audit goal

Phase 153 should not try to "improve labels" in the abstract. It should do three specific things:

1. reduce label-definition to one authoritative semantic write path
2. make exclusivity/duplicate metadata deterministic and rename-safe
3. align onboarding promises, tests, and live behavior with the chosen source of truth
