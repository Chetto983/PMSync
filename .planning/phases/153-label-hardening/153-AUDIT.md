# Phase 153 - Label Creation Hardening Audit

**Date:** 2026-04-23  
**Mode:** docs-only audit  
**Evidence standard:** code inspection + targeted local tests

## Scope

This audit covers label creation bugs, duplicate systems, and hardening gaps across:

- raw label CRUD
- wizard create/update
- triage onboarding preview/apply
- frontend label-definition surfaces
- downstream label resolution that depends on label metadata

It does not change runtime behavior.

## Evidence snapshot

### Targeted tests run

From `backend/`:

```powershell
node -r dotenv/config .\node_modules\jest\bin\jest.js src/modules/labels/services/__tests__/labels.service.spec.ts --runInBand
```

Observed result:

- `labels.service.spec.ts` -> **FAIL** (1 failed, 21 passed)

From `frontend/`:

```powershell
node .\node_modules\jest\bin\jest.js components/email/labels/LabelWizardDialog.test.tsx components/email/labels/TriageSetupForm.test.tsx stores/label-store.test.ts
```

Observed result:

- `LabelWizardDialog.test.tsx` + `TriageSetupForm.test.tsx` + `label-store.test.ts` -> **PASS** (13/13 total)

## Confirmed Findings

### L-01 - Label definition has multiple write paths with different invariants

**Subsystem:** backend/frontend label creation  
**Severity:** High  
**Incoherence class:** duplicate source of truth

**Expected behavior**

Semantic label creation should pass through one authoritative invariant set so the same rules apply no matter how a label is created.

**Actual behavior**

There are three different label-definition systems:

1. raw CRUD with simple slug uniqueness and optional `aiPrompt`
2. wizard create/update with richer metadata and a max-label cap
3. triage onboarding recommendations that describe labels without persisting them

The raw path and wizard path do not enforce the same rules:

- raw create/update DTOs: `backend/src/modules/labels/dto/labels.dto.ts:18-72`
- wizard DTO: `backend/src/modules/labels/dto/labels.dto.ts:93-138`
- raw create: `backend/src/modules/labels/services/labels.service.ts:156-214`
- wizard create/update: `backend/src/modules/labels/services/labels.service.ts:848-967`

Concrete differences today:

- raw path has no max-label limit
- raw path has no `category` / `roles` / `contents` / `actionType`
- raw path never derives `defaultLane`
- raw path cannot express `mutuallyExclusiveWith`
- raw path uses `aiPrompt` max length 500, wizard allows 1000

**Evidence**

- raw DTO + service: `labels.dto.ts:18-72`, `labels.service.ts:156-214`
- wizard DTO + service: `labels.dto.ts:93-138`, `labels.service.ts:848-967`
- active wizard UI: `frontend/components/email/sidebar/LabelsSidebar.tsx:509-514`, `frontend/components/email/layout/MobileFolderSheet.tsx:548-552`, `frontend/components/email/labels/LabelContextMenu.tsx:271-275`
- retained raw clients: `frontend/hooks/queries/use-labels.ts:108-143`, `frontend/stores/label-store.ts:58-109`, `frontend/components/email/labels/LabelDialog.tsx:93-129`

**Reproduction**

1. Compare `POST /labels` and `POST /labels/wizard` controller/service paths.
2. Compare the DTO shapes in `labels.dto.ts`.
3. Observe that move/reorder clients still depend on raw update while semantic edit uses the wizard.

**User-visible impact**

- semantic hardening can be bypassed through the raw API
- labels created by different paths do not carry the same triage semantics
- future fixes risk landing in only one path and leaving the others inconsistent

**Recommended fix stream**

- `Stream A - authoritative label definition path`

### L-02 - `mutuallyExclusiveWith` is name-based, unchecked, and not rename-safe

**Subsystem:** label semantics / contradiction resolution  
**Severity:** High  
**Incoherence class:** conflicting semantics + stale references

**Expected behavior**

Exclusivity metadata should be valid, deterministic, and survive label rename operations.

**Actual behavior**

`mutuallyExclusiveWith` is stored as `String[]` label names in the database:

- `backend/prisma/schema.prisma:683`

Wizard writes persist the raw names directly:

- `backend/src/modules/labels/services/labels.service.ts:889`
- `backend/src/modules/labels/services/labels.service.ts:965`

No code validates:

- whether the referenced labels exist
- whether exclusions are bidirectional
- whether renaming a label updates other labels that point at its old name

Downstream contradiction resolution is one-sided and order-dependent:

- `backend/src/modules/ai/services/label-resolution.service.ts:193-215`

If label A excludes label B but B does not exclude A, the result depends on which label appears first in the collected order. If B is renamed, A can silently point at a dead string.

**Evidence**

- schema stores names: `backend/prisma/schema.prisma:683`
- wizard persists raw names: `backend/src/modules/labels/services/labels.service.ts:889,965`
- contradiction resolution is one-sided: `backend/src/modules/ai/services/label-resolution.service.ts:193-215`
- roadmap already calls for bidirectional enforcement: `.planning/milestones/v13.0-ROADMAP.md:172`

**Reproduction**

1. Create label A with `mutuallyExclusiveWith=["B"]`.
2. Leave label B without the reverse exclusion or rename B.
3. Inspect `resolveContradictions()` and observe that only the current label's own exclusion list is consulted.

**User-visible impact**

- contradictory labels can resolve differently depending on order
- rename operations can silently break exclusivity
- downstream lane, urgency, and score behavior becomes harder to trust

**Recommended fix stream**

- `Stream B - exclusivity hardening and rename safety`

### L-03 - Triage onboarding still advertises label creation semantics it does not perform

**Subsystem:** onboarding / label creation contract  
**Severity:** High  
**Incoherence class:** code vs UI/doc drift

**Expected behavior**

The onboarding flow should either:

- explicitly be rules-only, or
- actually create/update labels when it says it will

The preview/apply contract and UI copy must match the real behavior.

**Actual behavior**

Preview computes recommended labels and flags `willCreate`:

- `backend/src/modules/labels/services/labels.service.ts:120-123`

The frontend presents the preview as a label-oriented recommendation surface:

- `frontend/components/email/labels/TriageSetupForm.tsx:100-105`
- `frontend/components/email/labels/TriageSetupForm.tsx:256-269`

But apply only stores derived triage rules and returns current labels:

- `backend/src/modules/labels/services/labels.service.ts:136-152`

The controller description is still wrong:

- `backend/src/modules/labels/controllers/labels.controller.ts:154-156`

It says apply "Creates or updates operational labels and aiPrompt guidance from onboarding rules", which is not what the service does.

**Evidence**

- preview marks `willCreate`: `backend/src/modules/labels/services/labels.service.ts:120-123`
- apply writes rules only: `backend/src/modules/labels/services/labels.service.ts:136-152`
- stale controller summary: `backend/src/modules/labels/controllers/labels.controller.ts:154-156`
- integration spec expects onboarding rules behavior but is itself stale/noisy: `backend/src/modules/labels/services/__tests__/labels.service.spec.ts:130-154`

**Reproduction**

1. Call onboarding preview and inspect `recommendedLabels[*].willCreate`.
2. Call onboarding apply and inspect persisted `UserLabel` rows.
3. Observe that labels are not created, while preview/controller language implies label materialization semantics.

**User-visible impact**

- onboarding feels broken or misleading
- engineers cannot tell whether onboarding is a rules system or a label creation system
- future consolidation work can be planned from the wrong assumption

**Recommended fix stream**

- `Stream C - onboarding contract reconciliation`

### L-04 - Duplicate prevention and prompt hardening are still exact-match only

**Subsystem:** duplicate prevention / aiPrompt quality  
**Severity:** Medium  
**Incoherence class:** missing hardening

**Expected behavior**

Label creation should reject or warn on near-duplicate labels and low-quality prompts, not only on exact slug collisions.

**Actual behavior**

Current duplicate prevention is exact-slug only:

- raw create: `backend/src/modules/labels/services/labels.service.ts:157-163`
- wizard create: `backend/src/modules/labels/services/labels.service.ts:854-858`
- wizard update: `backend/src/modules/labels/services/labels.service.ts:942-947`

Prompt generation is simple string assembly with no overlap detection or quality scoring:

- `backend/src/modules/labels/label-prompt-builder.ts:62-86`

Manual wizard `aiPrompt` overrides are accepted as-is:

- `backend/src/modules/labels/label-prompt-builder.ts:62-65`

**Evidence**

- exact slug checks only: `labels.service.ts:157-163`, `854-858`, `942-947`
- prompt builder has no validation: `label-prompt-builder.ts:62-86`
- roadmap target remains unimplemented: `.planning/milestones/v13.0-ROADMAP.md:166-176`

**Reproduction**

1. Compare two labels whose names slug differently but mean the same thing.
2. Observe there is no semantic overlap check.
3. Compare a vague manual `aiPrompt` with a high-quality one; both are persisted without scoring or warning.

**User-visible impact**

- users can create overlapping labels that compete for the same emails
- weak prompts degrade triage quality and per-label accuracy
- duplicate cleanup gets deferred to later manual work instead of being prevented up front

**Recommended fix stream**

- `Stream D - duplicate and prompt-quality hardening`

### L-05 - Label hardening tests and debug workflow are currently inconsistent

**Subsystem:** tests / developer workflow  
**Severity:** Medium  
**Incoherence class:** test drift + harness fragmentation

**Expected behavior**

Narrow label hardening verification should be reliable and should clearly distinguish product defects from harness defects.

**Actual behavior**

The label integration spec is stale:

- `backend/src/modules/labels/services/__tests__/labels.service.spec.ts:20` sets `setTriageRules` to return `[]`
- `backend/src/modules/labels/services/__tests__/labels.service.spec.ts:148-153` still expects non-empty derived rules from `applied.rules`

Additional harness fragmentation exists:

- `labels.service.triage.unit.spec.ts` hit OOM in the current Jest environment
- `triage-rule.service.spec.ts` is Vitest-based, so the direct backend Jest entrypoint cannot run it

**Evidence**

- confirmed failure on 2026-04-23:
  `node -r dotenv/config .\node_modules\jest\bin\jest.js src/modules/labels/services/__tests__/labels.service.spec.ts --runInBand`
- stale mock vs expectation in `labels.service.spec.ts:20,148-153`
- frontend label tests pass, which helps isolate this as backend-spec drift rather than a general label UI failure

**Reproduction**

1. Run the backend integration spec above.
2. Observe the failing assertion on `applied.rules`.
3. Inspect the mock setup and expected array contents.

**User-visible impact**

- label hardening work starts from noisy signal
- engineers can mistake stale tests for runtime behavior
- narrow backend audit loops are slower and less trustworthy

**Recommended fix stream**

- `Stream E - test and docs hardening`

## Guarded Seams / Open Questions

### G-01 - Structural updates still legitimately need a lightweight path

Move/reorder operations currently use raw update:

- `frontend/hooks/queries/use-labels.ts:274-319`
- `frontend/hooks/queries/use-labels.ts:327-344`

This means consolidation should probably not delete raw update entirely. The cleaner split is:

- semantic label-definition path: authoritative, hardened
- structural path: parent/order/color-only where appropriate

### G-02 - `LabelDialog` looks retained but not currently mounted in the active label UI

The live sidebar/mobile/context-menu surfaces mount the wizard, while `LabelDialog` appears retained as legacy code:

- wizard mounts: `LabelsSidebar.tsx:509-514`, `MobileFolderSheet.tsx:548-552`, `LabelContextMenu.tsx:271-275`
- legacy dialog write path: `LabelDialog.tsx:93-129`

Open question:

- delete `LabelDialog` and related raw-create client/store code, or keep it intentionally for a separate simplified creation flow
