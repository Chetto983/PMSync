# Sprint 02 — Checkpoint

## Stato
- **Sprint:** 02 — Account Detail & Contact-Account Linking
- **Last Task Completed:** T-0211 — Type-check validation
- **Next Task:** Sprint 02 COMPLETE — proceed to Sprint 03
- **Tasks Done:** 11/11
- **SP Completed:** 17/17
- **Last Updated:** 2026-03-24 (session 2)

## Last Modified Files
- backend/src/modules/crm/account/services/account.service.ts
- backend/src/modules/crm/account/controllers/account.controller.ts
- backend/src/modules/crm/account/dto/account.dto.ts
- frontend/lib/api/crm-accounts.ts
- frontend/hooks/queries/use-crm-accounts.ts
- frontend/hooks/queries/crm-accounts-keys.ts
- frontend/pages/dashboard/crm/accounts/[id].tsx
- frontend/components/dashboard/crm-accounts/AccountDetail.tsx
- frontend/components/dashboard/crm-accounts/AccountHierarchyTree.tsx
- frontend/components/dashboard/crm-accounts/AccountContactsTab.tsx
- frontend/components/dashboard/crm-accounts/AccountsList.tsx
- frontend/components/contacts/contact-detail/ContactAccountsSection.tsx
- frontend/components/contacts/contact-detail/ContactInfoPanel.tsx
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts

## Key Decisions Made
- Used recursive MUI Collapse tree instead of @mui/x-tree-view (not installed, avoiding deps)
- Cycle detection walks ancestor chain (max 5 levels) rather than loading full tree
- Contact model uses JSON `emails`/`phoneNumbers` fields, not `primaryEmail`/`primaryPhone`
- Reverse lookup endpoint at `GET /crm/accounts/by-contact/:contactId` (on AccountController)
- Account selector uses Autocomplete with server-side search (not preloaded list)

## Patterns Established
- CRM query hooks follow: `frontend/hooks/queries/use-crm-*.ts`
- CRM API modules at: `frontend/lib/api/crm-accounts.ts`
- Account detail page: tab layout (Info, Contacts, Deals, Activity) with lazy tab panels
- Inline editing pattern: `InlineEditField` component with edit/save/cancel
- Contact-Account linking: bidirectional (account->contacts tab, contact->accounts section)
- Contact roles: CONTACT_ROLES constant array shared between dialog and display

## Blockers / Notes
- Deals tab and Activity tab are placeholders ("coming in Sprint 04")
- AccountContact composite FK uses `(id, tenantId)` on Contact — join tables must include tenantId

## Validation Status
- Backend tsc: passing
- Frontend tsc: passing
- Circular deps: zero
