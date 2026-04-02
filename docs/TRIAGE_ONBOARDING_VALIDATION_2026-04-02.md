# Triage Onboarding Validation - 2026-04-02

## Scope

Validate that PMSync no longer creates stock triage labels during setup, that tenant labels remain user-defined, and that the guided triage setup is reachable from the live email UI.

## Production Audit

Environment:
- Frontend: `https://mail-agent-indol.vercel.app`
- Backend: `https://backend-production-78e1.up.railway.app`
- Auth/session: real Edge CDP session

Live API checks:
- `GET /api/v1/labels` returned exactly one user label: `Pubblicità`
- no legacy stock labels were present:
  - `Customer`
  - `System Alert`
  - `Review Later`
  - `Important`
  - `Action Items`
  - `Follow-up`
  - `Finance`
  - `Updates`
  - `Promotions`
- `GET /api/v1/labels/triage-onboarding` returned the onboarding contract and taxonomy
- current tenant had `0` configured triage rules at the moment of the audit, which is valid for an unconfigured tenant

Conclusion:
- the tenant is clean
- labels are not being auto-populated with stock triage labels

## Live UI Findings

Before this slice:
- the email labels UI used `LabelWizardDialog`
- the guided triage setup entrypoint still lived in the older `LabelDialog`
- result: guided triage setup existed, but was effectively unreachable from the current labels flow after onboarding

Confirmed live UI behavior before fix:
- creating a label from the email sidebar opened the 4-step label wizard
- existing user label `Pubblicità` exposed a context menu with:
  - `Modifica`
  - `Aggiungi sotto-etichetta`
  - `Cambia colore`
  - `Sposta in...`
  - `Elimina`

This confirmed that user labels are deletable and not locked like system labels.

## Fix Implemented

Reconnected the existing `TriageSetupDialog` to the current label management surfaces:
- `frontend/components/email/sidebar/LabelsSidebar.tsx`
- `frontend/components/email/layout/MobileFolderSheet.tsx`

New behavior:
- desktop labels sidebar exposes `Apri setup guidato triage`
- mobile folder sheet labels section exposes the same guided triage setup entrypoint
- the dialog still uses the existing `TriageSetupForm`, which is rule-based and does not promise stock label creation

## Local Validation

Commands:

```bash
cd frontend
npm run type-check
npm run build
```

Results:
- `type-check`: passed
- `build`: passed

## Expected Production Validation After Deploy

1. Open `/dashboard/email`
2. Open labels sidebar action `Apri setup guidato triage`
3. Verify dialog title `Setup guidato triage`
4. Verify copy states the setup guides triage/follow-up while labels remain user-defined
5. Repeat from mobile folder sheet

## Status

- tenant audit: passed
- label deletion check: passed
- guided setup reachability: fixed in code
- production click-through validation: pending deploy of this frontend slice
