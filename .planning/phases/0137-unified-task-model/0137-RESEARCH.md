# Phase 137: Unified Task Model (Backend) - Research

**Researched:** 2026-04-01
**Domain:** NestJS backend, Prisma ORM, multi-tenant API aggregation
**Confidence:** HIGH

## Summary

Phase 137 requires building a single backend API endpoint that returns a unified task list aggregating five disparate data sources: EmailFollowUp, Reminder, NBAAction (deal actions), Ticket (ticket actions), and a new ManualTask model for user-created to-dos. There is currently **no Task table** in the database -- each task-like entity lives in its own table with its own schema, status enums, and API endpoints.

The critical architectural decision is whether to (a) create a new unified `Task` table and migrate/sync data into it, or (b) build an aggregation service that queries each source table and normalizes results into a common DTO at runtime. Given the success criterion "Existing follow-up and reminder data appears in the unified task response without migration loss," option (b) -- runtime aggregation -- is the safer and simpler approach. It avoids data duplication, migration complexity, and keeps existing modules untouched.

**Primary recommendation:** Create a new `tasks` NestJS module with a service that queries all five source tables in parallel, normalizes each row into a `UnifiedTaskDto`, and returns a merged, sorted list. Add a new `ManualTask` Prisma model for user-created to-dos. Do NOT create a materialized unified table or database view.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-01 | User sees a single Tasks page listing follow-ups, reminders, CRM deal actions, ticket actions, and manual to-dos | Aggregation service queries 5 tables, normalizes to UnifiedTaskDto, returns via `GET /tasks` endpoint |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Multi-tenant: every query MUST include `tenantId`
- Follow existing patterns: NestJS module structure (module > controller > service > dto)
- Max 500 lines per file
- Post-edit validation: `cd backend && npx tsc --noEmit`
- Use Prisma (not raw SQL) for queries
- Provider pattern: Interface > Factory > Implementation where applicable
- Handle P2002 and P2034 with exponential backoff
- Never hardcode secrets
- Use `TenantGuard` + `RolesGuard` on all controllers
- Use `ApiCookieAuth()` + `ApiTags()` Swagger decorators

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11.x | Framework | Already in use across all backend modules |
| Prisma | 6.x | ORM | Already in use, schema-first with PostgreSQL |
| class-validator | 0.14.x | DTO validation | Already used in all existing DTOs |
| class-transformer | 0.5.x | DTO transformation | Already used for `@Transform` decorators |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @nestjs/swagger | 8.x | API documentation | Already used on all controllers |

No new packages needed. This phase uses only existing dependencies.

## Architecture Patterns

### Recommended Module Structure
```
backend/src/modules/tasks/
  controllers/
    tasks.controller.ts        # GET /tasks, POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id
  dto/
    unified-task.dto.ts         # UnifiedTaskDto response shape
    create-task.dto.ts          # CreateManualTaskDto
    update-task.dto.ts          # UpdateManualTaskDto
    list-tasks-query.dto.ts     # Query params: type[], status, dueBefore, dueAfter, contactId, page, limit
  services/
    tasks-aggregation.service.ts  # Queries 5 sources, normalizes, merges
    manual-task.service.ts        # CRUD for ManualTask table only
  tasks.module.ts
```

### Pattern 1: Runtime Aggregation (NOT a unified table)
**What:** Query each source table (EmailFollowUp, Reminder, NBAAction, Ticket, CrmActivity[type=TASK]) in parallel using `Promise.all`, then normalize each result into a common `UnifiedTaskDto` shape with a discriminated `sourceType` field.
**When to use:** When source tables have divergent schemas and the unified view is read-only over existing data.
**Why not a unified table:** A unified table would require either (a) dual-write on every existing module (invasive, high coupling) or (b) a sync job (lag, eventual consistency). Runtime aggregation is zero-migration, zero-coupling.

```typescript
// UnifiedTaskDto shape
interface UnifiedTaskDto {
  id: string;
  sourceType: 'follow_up' | 'reminder' | 'deal_action' | 'ticket' | 'manual';
  sourceId: string;          // Original record ID in source table
  title: string;
  description?: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed' | 'expired';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string | null;   // ISO 8601
  contactName?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  emailId?: string | null;
  ticketId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}
```

### Pattern 2: Source-Specific Normalizers
**What:** Each source gets a pure function `normalizeFollowUp(raw) => UnifiedTaskDto` that maps source-specific fields to the unified shape. This keeps mapping logic isolated and testable.

```typescript
// Example normalizer for Reminder
function normalizeReminder(r: Reminder): UnifiedTaskDto {
  return {
    id: `reminder_${r.id}`,
    sourceType: 'reminder',
    sourceId: r.id,
    title: r.titolo,
    description: r.descrizione,
    status: mapReminderStatus(r.status), // attivo -> pending, completato -> completed, etc.
    priority: mapReminderPriority(r.priorita), // alta -> high, media -> medium, bassa -> low
    dueDate: r.scadenzaDatetime?.toISOString() ?? null,
    contactName: r.contatto,
    contactId: null,
    dealId: null,
    emailId: null,
    ticketId: null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
```

### Pattern 3: Prefixed Composite IDs
**What:** Since IDs from different tables can theoretically collide (all cuid), prefix unified task IDs with source type: `follow_up_clxyz...`, `reminder_clxyz...`, etc. This lets the frontend route actions back to the correct source.
**Alternative:** Return `{ sourceType, sourceId }` as separate fields and let the frontend construct the routing. This is cleaner -- use this approach instead of prefixed IDs.

### Pattern 4: Filtering at Source Level
**What:** Push filters down to individual Prisma queries rather than filtering after aggregation. If user filters by `sourceType=reminder`, skip querying EmailFollowUp/Ticket/etc entirely.

### Anti-Patterns to Avoid
- **God query with UNION ALL:** Raw SQL unions across 5 tables would bypass Prisma's type safety and tenant scoping. Never use raw SQL for this.
- **Database views:** PostgreSQL views can't be managed by Prisma migrations cleanly and add operational complexity for zero benefit over service-level aggregation.
- **Dual-write to a unified table:** Every existing module would need to know about the Tasks module. This creates tight coupling and circular dependency risk.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination across merged sources | Custom cursor-based merge | Offset pagination with `skip/take` per source, then merge + sort + slice | Cursor pagination across heterogeneous sources is extremely complex; offset is sufficient for task lists |
| Status mapping | Ad-hoc if/else chains | Lookup maps (`Record<SourceStatus, UnifiedStatus>`) | Type-safe, exhaustive, easy to maintain |
| Rate limiting | Custom middleware | Existing `@RateTierDecorator('safe-write')` | Already implemented project-wide |

## Common Pitfalls

### Pitfall 1: Missing tenantId on Any Query
**What goes wrong:** Security vulnerability -- one tenant sees another's tasks.
**Why it happens:** When querying 5 tables, easy to forget tenantId on one.
**How to avoid:** Every Prisma `findMany` call MUST have `where: { tenantId }`. Review each query.
**Warning signs:** Tests passing without tenant fixtures, or seeing cross-tenant data.

### Pitfall 2: N+1 on Contact/Deal Lookups
**What goes wrong:** Follow-ups include email data, reminders have `contatto` as string, NBA has `dealId`. Fetching related entities individually causes N+1.
**Why it happens:** Each source has different relation shapes.
**How to avoid:** Use Prisma `include` at query time for each source. Don't fetch relations after normalization.
**Warning signs:** Slow response times on large task lists.

### Pitfall 3: Inconsistent Status Mapping
**What goes wrong:** Reminder uses Italian enums (`attivo`, `completato`), FollowUp uses English (`PENDING`, `RESOLVED`), Ticket uses lowercase strings (`open`, `resolved`).
**Why it happens:** These modules were built independently over months.
**How to avoid:** Create explicit, exhaustive mapping functions with TypeScript `satisfies` to catch missing cases at compile time.
**Warning signs:** Tasks showing raw source statuses instead of normalized ones.

### Pitfall 4: Pagination Inaccuracy with Multi-Source Aggregation
**What goes wrong:** If you `take: 20` from each of 5 sources and merge, you get up to 100 items. If you then slice to 20, the page boundaries are wrong -- total count is also inaccurate.
**Why it happens:** True pagination across heterogeneous sources requires knowing total counts from all sources and fetching proportionally.
**How to avoid:** For v1, fetch all active items from all sources (with reasonable per-source limits like 500), merge in memory, then paginate the merged array. Task lists rarely exceed a few hundred items per user. Add `count()` queries in parallel for accurate totals.
**Warning signs:** Missing tasks on page 2, or incorrect total count in API response.

### Pitfall 5: CRM Activity "Tasks" Are Not Real Tasks
**What goes wrong:** Stage automations create `CrmActivity` records with `type: 'TASK'`, but these are activity log entries, not actionable tasks. They have no status, no due date, no assignee.
**Why it happens:** The CREATE_TASK automation was designed as a notification/log, not a task management system.
**How to avoid:** Either (a) skip CrmActivity-based tasks from the unified view entirely, or (b) map them as read-only informational items with status always "completed." Recommend option (a) unless the user explicitly wants them. The NBAAction model (with status, dealId, actionType) is the proper "deal action" source.
**Warning signs:** Tasks appearing with no due date or status that can't be marked complete.

## Data Source Inventory

### Source 1: EmailFollowUp
| Field | Maps To | Notes |
|-------|---------|-------|
| `id` | `sourceId` | |
| `followUpType` | Part of `title` | WAITING_FOR or TODO |
| `status` | `status` | PENDING->pending, REMINDED->pending, RESOLVED->completed, EXPIRED->expired |
| `reason` | `description` | |
| `dueDate` | `dueDate` | Always set |
| `email.subject` | `title` | Via include |
| `email.from` | `contactName` | Via include |
| `emailId` | `emailId` | Direct field |
| `userId` | Filter only | Scoping |

### Source 2: Reminder
| Field | Maps To | Notes |
|-------|---------|-------|
| `id` | `sourceId` | |
| `titolo` | `title` | Italian field name |
| `descrizione` | `description` | |
| `status` | `status` | attivo->pending, completato->completed, annullato->dismissed, sospeso->pending |
| `priorita` | `priority` | alta->high, media->medium, bassa->low |
| `scadenzaDatetime` | `dueDate` | May be null |
| `contatto` | `contactName` | String, not FK |

### Source 3: NBAAction (Deal Actions)
| Field | Maps To | Notes |
|-------|---------|-------|
| `id` | `sourceId` | |
| `title` | `title` | |
| `reasoning` | `description` | |
| `status` | `status` | SUGGESTED->pending, ACCEPTED->in_progress, EXECUTED->completed, DISMISSED->dismissed |
| `actionType` | Part of metadata | EMAIL, CALL, MEETING, DISCOUNT, ESCALATE, FOLLOW_UP |
| `dealId` | `dealId` | |
| `contactId` | `contactId` | |

### Source 4: Ticket
| Field | Maps To | Notes |
|-------|---------|-------|
| `id` | `sourceId` | Also `ticketId` |
| `subject` | `title` | |
| `description` | `description` | |
| `status` | `status` | open->pending, in_progress->in_progress, waiting->pending, resolved->completed, closed->completed |
| `priority` | `priority` | low/medium/high/urgent maps 1:1 |
| `contactId` | `contactId` | |
| `assigneeId` | Filter criteria | Only show assigned tickets |
| `accountId` | Metadata | |

### Source 5: ManualTask (NEW -- needs Prisma model)
| Field | Maps To | Notes |
|-------|---------|-------|
| `id` | `sourceId` | |
| `title` | `title` | |
| `description` | `description` | |
| `status` | `status` | Direct enum mapping |
| `priority` | `priority` | Direct enum mapping |
| `dueDate` | `dueDate` | |
| `contactId` | `contactId` | Optional FK |
| `dealId` | `dealId` | Optional FK |
| `emailId` | `emailId` | Optional FK |

### New Prisma Model Needed

```prisma
model ManualTask {
  id          String    @id @default(cuid())
  tenantId    String
  userId      String
  title       String
  description String?
  status      String    @default("pending")  // pending, in_progress, completed, dismissed
  priority    String    @default("medium")    // low, medium, high, urgent
  dueDate     DateTime?
  contactId   String?
  contactTenant String?
  dealId      String?
  emailId     String?
  emailTenant String?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  contact     Contact?  @relation(fields: [contactId, contactTenant], references: [id, tenantId], onDelete: SetNull)
  deal        CrmDeal?  @relation(fields: [dealId], references: [id], onDelete: SetNull)
  email       Email?    @relation(fields: [emailId, emailTenant], references: [id, tenantId], onDelete: SetNull)

  @@index([tenantId, userId])
  @@index([tenantId, userId, status])
  @@index([tenantId, userId, dueDate])
  @@map("manual_tasks")
}
```

## API Design

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET /tasks` | List unified tasks | Aggregates all 5 sources, supports filters |
| `POST /tasks` | Create manual task | Only for ManualTask |
| `PATCH /tasks/:sourceType/:id` | Update task | Routes to correct source service |
| `DELETE /tasks/:sourceType/:id` | Delete task | Only for ManualTask; others use existing APIs |
| `POST /tasks/:sourceType/:id/complete` | Complete a task | Sets appropriate status on source record |

### Query Parameters for `GET /tasks`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sourceType` | `string[]` | all | Filter by source: follow_up, reminder, deal_action, ticket, manual |
| `status` | `string[]` | pending,in_progress | Filter by unified status |
| `priority` | `string[]` | all | Filter by priority |
| `dueBefore` | `ISO date` | none | Tasks due before this date |
| `dueAfter` | `ISO date` | none | Tasks due after this date |
| `contactId` | `string` | none | Filter by associated contact |
| `page` | `number` | 1 | Page number |
| `limit` | `number` | 50 | Items per page |
| `sortBy` | `string` | dueDate | Sort field: dueDate, createdAt, priority |
| `sortOrder` | `string` | asc | asc or desc |

### Response Shape

```typescript
{
  data: UnifiedTaskDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    counts: {
      follow_up: number;
      reminder: number;
      deal_action: number;
      ticket: number;
      manual: number;
    };
  };
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="tasks" --no-coverage` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-01a | Aggregation returns items from all 5 sources | unit | `cd backend && npx jest --testPathPattern="tasks-aggregation" --no-coverage -t "returns items from all sources"` | Wave 0 |
| TASK-01b | Each task carries sourceType | unit | `cd backend && npx jest --testPathPattern="tasks-aggregation" --no-coverage -t "carries sourceType"` | Wave 0 |
| TASK-01c | Existing data appears without migration loss | unit | `cd backend && npx jest --testPathPattern="tasks-aggregation" --no-coverage -t "normalizes existing"` | Wave 0 |
| TASK-01d | Multi-tenant isolation | unit | `cd backend && npx jest --testPathPattern="tasks-aggregation" --no-coverage -t "tenant isolation"` | Wave 0 |
| TASK-01e | Filtering by sourceType | unit | `cd backend && npx jest --testPathPattern="tasks-aggregation" --no-coverage -t "filters by sourceType"` | Wave 0 |
| TASK-01f | ManualTask CRUD | unit | `cd backend && npx jest --testPathPattern="manual-task" --no-coverage` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="tasks" --no-coverage`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/tasks/services/__tests__/tasks-aggregation.service.spec.ts` -- covers TASK-01a,b,c,d,e
- [ ] `backend/src/modules/tasks/services/__tests__/manual-task.service.spec.ts` -- covers TASK-01f
- [ ] `backend/src/modules/tasks/controllers/__tests__/tasks.controller.spec.ts` -- controller wiring

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma` -- all 5 source models inspected directly
- `backend/src/modules/reminder/` -- Reminder module pattern (module, controller, service)
- `backend/src/modules/ai/controllers/ai.controller.ts` -- Follow-up endpoints (lines 520-780)
- `backend/src/modules/crm/ticket/controllers/ticket.controller.ts` -- Ticket CRUD
- `backend/src/modules/crm/nba/nba.controller.ts` -- NBA action endpoints
- `backend/src/modules/crm/automation/stage-automation.worker.ts` -- CrmActivity TASK creation
- `backend/src/modules/crm/automation/types.ts` -- StageAutomation types

### Secondary (MEDIUM confidence)
- NestJS skill rules (`.claude/skills/nestjs-best-practices/SKILL.md`)
- Prisma client API skill (`.claude/skills/prisma-client-api/SKILL.md`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new deps
- Architecture: HIGH - direct inspection of all 5 source tables and existing controllers
- Pitfalls: HIGH - status mapping complexity verified by reading actual enum definitions
- Data mapping: HIGH - every field mapping verified against schema.prisma

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable domain, no external API changes expected)
