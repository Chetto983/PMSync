# Phase 153 - Label Hardening Audit Summary

**Completed:** 2026-04-23  
**Type:** docs-only audit phase

## Outcome

Created the Phase 153 audit package:

- `153-CONTEXT.md`
- `153-AUDIT.md`
- `153-DEBUG-RUNBOOK.md`
- `153-IMPROVEMENT-SPEC.md`

This package explains the current label-creation duplication, the concrete hardening gaps, and the implementation streams needed to consolidate the system.

## What was proven

### Confirmed defects / drift

1. Label definition currently has multiple write paths with different invariants.
2. `mutuallyExclusiveWith` is name-based, not validated bidirectionally, and is not rename-safe.
3. Triage onboarding still advertises label-creation semantics it does not actually perform.
4. Duplicate prevention is still exact-slug only, and prompt hardening is largely absent.
5. The backend label integration spec around onboarding rules is stale and currently fails.

### Important seams

1. Active desktop/mobile/context-menu label UX now uses the wizard.
2. Raw update still appears legitimately necessary for structural operations like move/reorder.
3. Legacy raw-create clients and store code remain in the repo and should be either removed or intentionally scoped.

## Tests run

From `backend/`:

```powershell
node -r dotenv/config .\node_modules\jest\bin\jest.js src/modules/labels/services/__tests__/labels.service.spec.ts --runInBand
```

Observed result:

- `labels.service.spec.ts` -> FAIL (1 failed, 21 passed)

From `frontend/`:

```powershell
node .\node_modules\jest\bin\jest.js components/email/labels/LabelWizardDialog.test.tsx components/email/labels/TriageSetupForm.test.tsx stores/label-store.test.ts
```

Observed result:

- label frontend suite -> PASS (13/13)

## Next-step handoff

The next executable work should be a real Phase 153 implementation slice, not another discovery pass.

Recommended order:

1. unify semantic label creation behind one authoritative path
2. harden exclusivity storage and rename behavior
3. reconcile onboarding contract language with actual behavior
4. add duplicate/prompt quality hardening
5. clean up stale tests and retained legacy label clients

## No runtime changes

This audit phase made no public API, DTO, schema, or runtime behavior changes. The output is planning and hardening documentation only.
