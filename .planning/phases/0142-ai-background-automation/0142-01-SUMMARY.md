---
phase: 142-ai-background-automation
plan: 01
subsystem: backend
tags: [email-auto-link, email-categorization, crm-integration, ai-triage]
dependency_graph:
  requires: []
  provides: [EmailAutoLinkerHandler, EmailAutoLinkedEvent, Email.aiCategory, Email.contactId, Email.dealId]
  affects: [email-sync-module, ai-triage-pipeline, crm-suggestions]
tech_stack:
  added: []
  patterns: [raw-sql-jsonb-containment, fire-and-forget-event-handler, domain-fallback-matching]
key_files:
  created:
    - backend/prisma/migrations/20260402190000_add_email_auto_link_fields/migration.sql
    - backend/src/modules/email-sync/handlers/email-auto-linker.handler.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/common/events/email.events.ts
    - backend/src/modules/ai/types/email-insights.types.ts
    - backend/src/modules/email-sync/email-sync.module.ts
    - backend/src/modules/ai/services/email-analysis.service.ts
    - backend/src/modules/ai/locales/en.ts
    - backend/src/modules/ai/locales/it.ts
decisions:
  - Manual migration SQL (shadow DB conflict with crm_activities table)
  - Raw SQL for JSONB email lookup (avoids loading all contacts into memory)
  - Domain fallback uses LIKE pattern for cross-contact matching
  - updateMany for idempotent email updates (avoids P2034 race conditions)
metrics:
  duration: 6m
  completed: 2026-04-02
  tasks_completed: 2
  tasks_total: 2
---

# Phase 142 Plan 01: Backend Auto-Linking Pipeline and Email Categorization Summary

Email auto-linker handler fires on EmailIndexedEvent, linking emails to contacts via JSONB email lookup (exact match + domain fallback) and to deals via DealContact traversal, with ambiguous matches creating CrmSuggestions for HITL review. LLM prompt extended with category classification (support/sales/internal/newsletter) persisted to Email.aiCategory.

## Tasks Completed

### Task 1: Schema migration + event types + UnifiedEmailAnalysis extension
- **Commit:** `c58329c5`
- Added `aiCategory`, `contactId`, `contactTenantId`, `dealId` fields to Email model
- Added `linkedContact` (composite FK to Contact) and `linkedDeal` (FK to CrmDeal) relations
- Added 3 indexes: `tenantId+contactId`, `tenantId+dealId`, `tenantId+aiCategory`
- Added reciprocal `linkedEmails` relation to Contact and CrmDeal models
- Created `EmailAutoLinkedEvent` in email.events.ts
- Added `category` optional field to `UnifiedEmailAnalysis` interface
- Migration SQL: ADD COLUMN (nullable) + CREATE INDEX only, no destructive operations

### Task 2: Auto-linker handler + LLM category extension + module wiring
- **Commit:** `5df30e85`
- Created `EmailAutoLinkerHandler` (192 lines):
  - Listens to `email.indexed` event
  - Contact linking: exact email match via raw SQL JSONB containment, domain fallback
  - Deal linking: queries `crmDeal` via `dealContacts` junction table
  - Ambiguous matches: creates `CrmSuggestion` with type=link for HITL
  - Emits `EmailAutoLinkedEvent` after successful linking
  - Fire-and-forget pattern (try/catch, never throws)
- Wired into `EmailSyncModule`: imported `SuggestionModule`, added handler to providers
- Extended EN/IT LLM prompts with instruction #13 (category classification)
- Added `category` field to JSON output format in both locales
- Added `validateCategory()` in `EmailAnalysisService`
- Added `aiCategory: result.category ?? null` to email.updateMany persist block

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shadow database migration failure**
- **Found during:** Task 1
- **Issue:** `prisma migrate dev` failed due to shadow DB conflict with `crm_activities` table (P3006/P1014)
- **Fix:** Created migration SQL file manually (matching existing project pattern for recent migrations)
- **Files created:** `backend/prisma/migrations/20260402190000_add_email_auto_link_fields/migration.sql`

**2. [Rule 1 - Bug] SQL injection safety for domain pattern**
- **Found during:** Task 2
- **Issue:** Plan showed `${'%@' + domain.toLowerCase()}` inline in tagged template, which could break parameterization
- **Fix:** Used separate `const pattern = '%@' + domain.toLowerCase()` variable, then passed via `${pattern}` in Prisma tagged template (safe parameterized query)
- **Files modified:** `email-auto-linker.handler.ts`

## Known Stubs

None - all data sources are wired end-to-end.

## Verification Results

- `npx tsc --noEmit` exits 0
- `npx prisma generate` succeeds
- Schema contains all 4 new Email fields + 2 relations + 3 indexes
- EmailAutoLinkedEvent exported from email.events.ts
- EmailAutoLinkerHandler registered in email-sync.module.ts providers
- aiCategory persisted in email-analysis.service.ts
- EN/IT prompts contain category instruction and JSON field

## Self-Check: PASSED
