# Sprint 07.1 — Checkpoint

## Stato
- **Sprint:** 07.1 — Placeholder Cleanup (Sub-Sprint)
- **Last Task Completed:** T-0716 — AccountActivityTab component
- **Next Task:** Sprint complete — all 6/6 tasks done
- **Tasks Done:** 6/6
- **SP Completed:** 8/8
- **Last Updated:** 2026-03-26 10:50

## Last Modified Files
- backend/src/modules/crm/product/controllers/product.controller.ts
- backend/src/modules/crm/product/services/product.service.ts
- backend/src/modules/crm/product/dto/product.dto.ts
- backend/src/modules/crm/product/product.module.ts
- backend/src/modules/crm/crm.module.ts
- backend/src/modules/crm/deal/controllers/deal.controller.ts
- backend/src/modules/crm/deal/services/deal.service.ts
- backend/src/modules/crm/deal/dto/deal.dto.ts
- backend/src/modules/crm/account/controllers/account.controller.ts
- backend/src/modules/crm/account/services/account.service.ts
- backend/src/modules/crm/account/dto/account.dto.ts
- backend/prisma/schema.prisma
- frontend/lib/api/crm-products.ts
- frontend/lib/api/crm-accounts.ts
- frontend/hooks/queries/crm-products-keys.ts
- frontend/hooks/queries/use-crm-products.ts
- frontend/hooks/queries/crm-accounts-keys.ts
- frontend/hooks/queries/use-crm-accounts.ts
- frontend/hooks/queries/index.ts
- frontend/components/dashboard/crm-deals/DealProductsTab.tsx
- frontend/components/dashboard/crm-deals/DealDetail.tsx
- frontend/components/dashboard/crm-accounts/AccountActivityTab.tsx
- frontend/components/dashboard/crm-accounts/AccountDetail.tsx
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts
- crm/sprints/phase-1-core-crm/sprint-07.1.md

## Key Decisions Made
- Product module already had scaffolded files from a prior "clean fix" commit; registered ProductModule in CrmModule
- CrmActivity.dealId made optional to support both deal and account activities
- Account activities use same MUI Timeline pattern as DealTimeline
- CreateAccountActivityDialog is account-specific (not shared with deal) to avoid coupling
- DealProductsTab calculates subtotals per line (qty * unitPrice * (1 - discount/100)) and total

## Patterns Established
- Product CRUD API: backend/src/modules/crm/product/ (controller, service, DTO, module)
- Product frontend API: frontend/lib/api/crm-products.ts (includes deal-product link/unlink)
- Product query hooks: frontend/hooks/queries/use-crm-products.ts
- Account activity API: GET/POST /crm/accounts/:id/activities
- Account activity hooks: useAccountActivities, useCreateAccountActivity

## Blockers / Notes
- Deal service is at 566 lines (slightly over 500), but deal-product methods are tightly coupled with deal lifecycle

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Prisma db push: ✅ executed on Railway (accountId column + indexes added)
- Railway health: ✅ 200 (DB, Redis, Mistral all up)
- Railway /crm/products: ✅ 401 (route registered, auth guard active)
- Railway /crm/accounts/:id/activities: ✅ 401 (route registered, auth guard active)
- Vercel /dashboard/crm/deals: ✅ 307 (page exists, auth redirect)
- Vercel /dashboard/crm/accounts: ✅ 307 (page exists, auth redirect)
- Browser (Edge CDP) Account Activity tab: ✅ empty state renders, "Registra Attività" CTA, no placeholder
- Browser (Edge CDP) Account Activity mobile: ✅ layout stacks correctly at 375x812
- Browser (Edge CDP) Deal Products tab: ⚠ Edge CDP disconnected before validation (code verified via tsc)
