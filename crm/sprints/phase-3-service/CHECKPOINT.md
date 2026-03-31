# Sprint 17 — Checkpoint

## Stato
- **Sprint:** 17 — Knowledge Base & Customer Portal
- **Last Task Completed:** T-1710 — Portal ticket tracking page
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 19/19
- **Last Updated:** 2026-03-31 13:30

## Last Modified Files
- backend/prisma/schema.prisma (KBCategory, KBArticle models + portalToken/senderName/senderEmail on Ticket)
- backend/prisma/migrations/20260331100000_kb_article_tsvector/migration.sql (tsvector + trigger + GIN)
- backend/src/modules/crm/kb/kb.module.ts (KBModule with PortalKBController)
- backend/src/modules/crm/kb/services/kb.service.ts (CRUD + full-text search)
- backend/src/modules/crm/kb/controllers/kb.controller.ts (auth'd staff endpoints)
- backend/src/modules/crm/kb/controllers/portal-kb.controller.ts (@Public, tenant from slug)
- backend/src/modules/crm/kb/dto/kb.dto.ts (category + article + search DTOs)
- backend/src/modules/crm/ticket/controllers/portal-ticket.controller.ts (@Public, honeypot + timestamp)
- backend/src/modules/crm/ticket/ticket.module.ts (PortalTicketController added)
- backend/src/modules/crm/crm.module.ts (KBModule wired)
- frontend/lib/api/crm-kb.ts (KB API module)
- frontend/hooks/queries/crm-kb-keys.ts (query keys)
- frontend/hooks/queries/use-crm-kb.ts (TanStack Query hooks + mutations)
- frontend/components/dashboard/crm-kb/KBArticleEditor.tsx (article editor)
- frontend/components/dashboard/crm-kb/KBBrowsePage.tsx (staff KB browse + search)
- frontend/components/layout/PortalLayout.tsx (tenant-scoped portal layout)
- frontend/components/portal/PortalKBBrowse.tsx (public KB browse)
- frontend/components/portal/PortalTicketForm.tsx (public ticket submission)
- frontend/components/portal/PortalTicketTracking.tsx (public ticket tracking)
- frontend/pages/dashboard/crm/kb/index.tsx (staff KB page)
- frontend/pages/dashboard/crm/kb/articles/new.tsx
- frontend/pages/dashboard/crm/kb/articles/[id]/edit.tsx
- frontend/pages/portal/[tenant]/index.tsx (portal KB)
- frontend/pages/portal/[tenant]/tickets/new.tsx (portal ticket form)
- frontend/pages/portal/[tenant]/tickets/[token].tsx (portal ticket tracking)
- frontend/components/layout/Sidebar.tsx (KB nav item added)
- frontend/locales/en.ts (kb section + nav)
- frontend/locales/it.ts (kb section + nav)
- frontend/locales/index.ts (kb types + nav)

## Key Decisions Made
- T-1701/02: KBCategory uses self-referential tree (parentId). KBArticle uses slug uniqueness per tenant.
- T-1703: tsvector uses 'simple' config for language-agnostic tokenization (MVP). Weight: A=title, B=body, C=tags.
- T-1704/05: Search uses plainto_tsquery + ts_rank + ts_headline for highlighted snippets.
- T-1708: Portal is multi-tenant SaaS: routes are /portal/[tenantSlug]/... not /portal/...
- T-1708: @Public() decorator skips BetterAuthGuard. Tenant resolved from URL slug.
- T-1709: Anti-spam uses honeypot + timestamp (3s minimum), no external services. Returns fake success to bots.
- T-1710: portalToken is nanoid(21), unique globally. Only non-internal comments exposed.
- Agent dashboard sidebar fix: was missing <Layout> wrapper (pre-existing bug from S16).

## Patterns Established
- Portal controllers: @Public() + resolveTenantId(slug) pattern for unauthenticated SaaS routes
- KB module: backend/src/modules/crm/kb/ (service, dto, kb.controller, portal-kb.controller)
- Portal components: frontend/components/portal/ (PortalKBBrowse, PortalTicketForm, PortalTicketTracking)
- Portal layout: frontend/components/layout/PortalLayout.tsx (tenantSlug prop, minimal header)
- Portal pages: frontend/pages/portal/[tenant]/ (dynamic tenant slug routing)

## Blockers / Notes
- Pre-existing tsc errors from parallel worktree merges (contacts merge, cron migration) intermittently blocked commits
- senderEmail field on Ticket already existed from S15 email-to-ticket handler
- Sprint 18 (sprint-18.md) exists and is next in Phase 3

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing (pre-existing contact merge errors excluded)
- Circular deps: ✅ zero (KB module verified)
- Prisma generate: ✅ passing
- DB push: ✅ schema synced (portalToken unique constraint applied)
