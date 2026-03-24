# Sprint 01 — Checkpoint

## Stato
- **Sprint:** 01 — Schema CRM & Account Model
- **Last Task Completed:** T-0110 — Traduzioni CRM Account
- **Next Task:** Sprint 01 complete. Next: Sprint 02 — Account UI + Contact-Account Linking
- **Tasks Done:** 10/10
- **SP Completed:** 18/18
- **Last Updated:** 2026-03-24 22:00

## Last Modified Files
- backend/prisma/schema.prisma (CrmAccount, CrmPipeline, CrmStage, CrmDeal, CrmActivity, CrmProduct, DealProduct, AccountContact, DealContact)
- backend/src/modules/crm/crm.module.ts
- backend/src/modules/crm/account/account.module.ts
- backend/src/modules/crm/account/controllers/account.controller.ts
- backend/src/modules/crm/account/services/account.service.ts
- backend/src/modules/crm/account/dto/account.dto.ts
- backend/src/app.module.ts (CrmModule registered)
- frontend/lib/api/crm-accounts.ts
- frontend/hooks/queries/crm-accounts-keys.ts
- frontend/hooks/queries/use-crm-accounts.ts
- frontend/hooks/queries/index.ts
- frontend/locales/en.ts (crmAccounts section + nav.crmAccounts)
- frontend/locales/it.ts (crmAccounts section + nav.crmAccounts)
- frontend/locales/index.ts (AppTranslations type updated)
- frontend/components/layout/Sidebar.tsx (CRM section added)
- frontend/pages/dashboard/crm/accounts.tsx
- frontend/components/dashboard/crm-accounts/AccountsList.tsx
- frontend/components/dashboard/crm-accounts/CreateAccountDialog.tsx
- crm/sprints/phase-1-core-crm/sprint-01.md

## Key Decisions Made
- Named CRM account model `CrmAccount` (not `Account`) to avoid collision with better-auth OAuth `Account` model
- Used `prisma db push` instead of `prisma migrate dev` due to migration drift on Railway DB
- Used MUI Table instead of DataGrid (MUI X) — no `@mui/x-data-grid` dependency. Can upgrade later if needed.
- All CRM models prefixed with `Crm` to avoid namespace collisions (CrmPipeline, CrmStage, CrmDeal, CrmActivity, CrmProduct)
- Contact composite PK `@@id([id, tenantId])` requires compound FK in join tables (AccountContact, DealContact)
- Added CRM section to sidebar between Navigation and AI sections

## Patterns Established
- CRM backend modules under `backend/src/modules/crm/<entity>/`
- CRM umbrella module: `backend/src/modules/crm/crm.module.ts`
- CRM API routes: `/api/v1/crm/accounts`, `/api/v1/crm/pipelines`, etc.
- CRM frontend pages: `frontend/pages/dashboard/crm/<entity>.tsx`
- CRM frontend components: `frontend/components/dashboard/crm-<entity>/`
- CRM API module: `frontend/lib/api/crm-accounts.ts`
- CRM query keys: `frontend/hooks/queries/crm-accounts-keys.ts`
- CRM query hooks: `frontend/hooks/queries/use-crm-accounts.ts`
- Translation keys: `t.crmAccounts.*` for page-level, `t.nav.crmAccounts` for nav

## Blockers / Notes
- Migration drift exists on Railway DB (modified migrations). Using `prisma db push` for now.
- Sprint 02 should add Contact-Account linking UI and Account detail page.

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: not checked (no new cross-module imports)
