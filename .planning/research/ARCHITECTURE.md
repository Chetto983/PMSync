# Architecture Patterns

**Domain:** Enterprise platform expansion -- CRM, workflow automation, authorization, OpenTelemetry, AI control plane hardening
**Researched:** 2026-03-18
**Overall confidence:** HIGH (based on codebase analysis + official docs + audit reports)

## Recommended Architecture

The existing modular monolith architecture is correct for this milestone. No topology changes needed. All new features integrate as new NestJS modules or extensions to existing modules, following established patterns (self-registering tools, domain events, global guards, Prisma tenant scoping).

### System Overview After v6.0

```
Guard Chain (unchanged order, one addition):
  ThrottlerGuard -> BetterAuthGuard -> PermissionGuard(NEW) -> LegalAcceptanceGuard -> ConsentGuard

New Modules:
  AuthorizationModule(@Global)  -- permission evaluation, caching, @RequirePermission
  CrmModule                     -- Accounts, Deals, Pipelines, Activities
  WorkflowModule                -- engine, step execution, triggers
  TracingModule(@Global)        -- OTel bootstrap, context propagation

Modified Modules:
  AiChatModule                  -- HITL contract unification, tool governance
  ToolRegistryModule            -- tool metadata (riskLevel, requiresApproval, schemas)
  ContactsModule                -- Account<->Contact linking
  Common/Auth                   -- PermissionGuard, @RequirePermission decorator
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| **AuthorizationModule** | Permission evaluation, caching, guard | BetterAuth org roles, Redis cache, all controllers | NEW |
| **CrmModule** | Account, Deal, Pipeline, Activity CRUD | ContactsModule, EmailModule, CalendarModule (via events), AiChatModule (via tool registry) | NEW |
| **WorkflowModule** | Workflow definition, execution, triggers | BullMQ, CrmModule, EmailModule, CalendarModule, AuthorizationModule | NEW |
| **TracingModule** | OTel SDK bootstrap, span creation, context propagation | All modules (via auto-instrumentation), BullMQ workers | NEW |
| **AiChatModule** | Chat orchestration, HITL, tool execution | ToolRegistryModule, all domain modules (via tools) | MODIFIED |
| **ToolRegistryModule** | Tool discovery, metadata, governance | All domain modules (self-register) | MODIFIED |
| **ContactsModule** | Contact CRUD, sync, scoring | CrmModule (Account linking) | MODIFIED |
| **Common/Auth** | Guards, decorators, session validation | AuthorizationModule | MODIFIED |

### Data Flow

```
1. AUTHORIZATION FLOW:
   Request -> BetterAuthGuard (session) -> PermissionGuard (@RequirePermission)
     -> PermissionService.hasPermission(userId, orgId, resource, action)
     -> Redis cache (5min TTL) || better-auth org role + permission map
     -> allow/deny

2. CRM ACTIVITY AUTO-GENERATION:
   EmailSyncedEvent / CalendarEventCreated -> CrmEventHandler (@OnEvent)
     -> match Contact -> Account link
     -> create Activity record (tenant-scoped)

3. WORKFLOW EXECUTION:
   Trigger (event/schedule/manual) -> WorkflowEngine.start(workflowId, input)
     -> BullMQ job per step -> StepExecutor.run(step, context)
     -> PermissionService.check(step.action) -> ActionRegistry.execute(action, params)
     -> persist state -> next step or complete

4. OTEL TRACE PROPAGATION:
   HTTP request (auto-instrumented) -> traceId in AsyncLocalStorage
     -> BullMQ job (traceId in job.data) -> worker picks up context
     -> AI call (custom span) -> provider call (custom span)
     -> export to OTLP endpoint

5. AI TOOL GOVERNANCE:
   User message -> AiChatService -> tool call
     -> ToolGovernanceService.evaluate(tool, context)
     -> if requiresApproval: HitlService.createPendingAction()
     -> if approved: ToolExecutorService.execute(tool, params) (same code path)
     -> AiRunLedger.record(traceId, toolCall, outcome)
```

## New Modules: Detailed Design

### 1. AuthorizationModule (NEW, @Global)

**Location:** `backend/src/common/authorization/`

**Why @Global:** Every controller needs permission checks. Same pattern as MetricsModule and ToolRegistryModule.

```
common/authorization/
  authorization.module.ts          -- @Global, exports PermissionService
  permission.service.ts            -- evaluate permissions, Redis caching
  permission.guard.ts              -- CanActivate, reads @RequirePermission metadata
  require-permission.decorator.ts  -- @RequirePermission('contacts.write')
  permission.constants.ts          -- resource+action definitions
  __tests__/
    permission.service.spec.ts
    permission.guard.spec.ts
```

**Key design decisions:**

- Build ON TOP of better-auth org roles, not replace them. The org plugin already provides `owner/admin/member` roles with `createAccessControl()`. Extend this with resource-scoped permissions.
- Permission format: `resource.action` (e.g., `contacts.write`, `deals.delete`, `workflows.execute`).
- Permission map stored per org role in config (not DB). This avoids a migration-heavy custom Permission model while still giving resource-level granularity.
- Redis cache with 5min TTL per `userId:orgId` key. Invalidate on role change via domain event.
- The guard reads `@RequirePermission()` metadata. If no decorator, the route is open to any authenticated user (backward compatible with existing controllers).

**Permission map shape:**

```typescript
const PERMISSION_MAP: Record<string, Record<string, string[]>> = {
  owner: {
    '*': ['*'],  // full access
  },
  admin: {
    contacts: ['read', 'write', 'delete'],
    deals: ['read', 'write', 'delete'],
    pipelines: ['read', 'write'],
    workflows: ['read', 'write', 'execute'],
    emails: ['read', 'write', 'send', 'delete'],
    calendar: ['read', 'write', 'delete'],
    ai: ['chat', 'approve'],
    settings: ['read', 'write'],
  },
  member: {
    contacts: ['read', 'write'],
    deals: ['read', 'write'],
    pipelines: ['read'],
    workflows: ['read', 'execute'],
    emails: ['read', 'write', 'send'],
    calendar: ['read', 'write'],
    ai: ['chat', 'approve'],
    settings: ['read'],
  },
};
```

**Integration with existing guards:** PermissionGuard slots into the global guard chain AFTER BetterAuthGuard (which sets `request.user.role`) but BEFORE LegalAcceptanceGuard. This means it runs only for authenticated users.

### 2. CrmModule (NEW)

**Location:** `backend/src/modules/crm/`

```
modules/crm/
  crm.module.ts
  controllers/
    accounts.controller.ts       -- CRUD, search, timeline
    deals.controller.ts          -- CRUD, pipeline movement
    pipelines.controller.ts      -- Pipeline + Stage CRUD
    activities.controller.ts     -- Activity list, filters
  services/
    account.service.ts           -- Account CRUD, Contact linking
    deal.service.ts              -- Deal CRUD, stage transitions
    pipeline.service.ts          -- Pipeline/Stage management
    activity.service.ts          -- Activity CRUD, auto-generation
    crm-event-handler.service.ts -- @OnEvent listeners for email/calendar
  dto/
    create-account.dto.ts
    update-account.dto.ts
    create-deal.dto.ts
    update-deal.dto.ts
    pipeline.dto.ts
    activity-filter.dto.ts
  tools/
    crm.tool.ts                  -- IAiTool for ToolRegistry
  __tests__/
```

**Prisma models needed (6 new models):**

```prisma
model CrmAccount {
  id          String   @default(cuid())
  tenantId    String
  name        String
  domain      String?
  industry    String?
  size        String?            // startup, small, medium, enterprise
  website     String?
  phone       String?
  address     Json?
  notes       String?
  ownerId     String?            // User who owns this account
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  metadata    Json?

  contacts    CrmAccountContact[]
  deals       CrmDeal[]
  activities  CrmActivity[]
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  owner       User?    @relation(fields: [ownerId], references: [id])

  @@id([id, tenantId])
  @@index([tenantId, name])
  @@index([tenantId, domain])
  @@index([tenantId, ownerId])
  @@map("crm_accounts")
}

model CrmAccountContact {
  id         String  @id @default(cuid())
  accountId  String
  contactId  String
  tenantId   String
  role       String? // decision-maker, technical, billing
  isPrimary  Boolean @default(false)
  createdAt  DateTime @default(now())

  tenant     Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([accountId, contactId, tenantId])
  @@index([tenantId, accountId])
  @@index([tenantId, contactId])
  @@map("crm_account_contacts")
}

model CrmPipeline {
  id          String     @id @default(cuid())
  tenantId    String
  name        String
  isDefault   Boolean    @default(false)
  isActive    Boolean    @default(true)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  stages      CrmStage[]
  deals       CrmDeal[]
  tenant      Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, name])
  @@index([tenantId])
  @@map("crm_pipelines")
}

model CrmStage {
  id          String      @id @default(cuid())
  pipelineId  String
  tenantId    String
  name        String
  order       Int
  probability Float       @default(0)
  color       String?
  isWon       Boolean     @default(false)
  isLost      Boolean     @default(false)
  createdAt   DateTime    @default(now())

  pipeline    CrmPipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals       CrmDeal[]
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([pipelineId, order])
  @@index([tenantId, pipelineId])
  @@map("crm_stages")
}

model CrmDeal {
  id                String      @default(cuid())
  tenantId          String
  accountId         String?
  pipelineId        String
  stageId           String
  name              String
  value             Float?
  currency          String      @default("EUR")
  ownerId           String?
  expectedCloseDate DateTime?
  closedAt          DateTime?
  isWon             Boolean?
  notes             String?
  tags              String[]    @default([])
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  metadata          Json?

  pipeline    CrmPipeline @relation(fields: [pipelineId], references: [id])
  stage       CrmStage    @relation(fields: [stageId], references: [id])
  activities  CrmActivity[]
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@id([id, tenantId])
  @@index([tenantId, pipelineId, stageId])
  @@index([tenantId, accountId])
  @@index([tenantId, ownerId])
  @@index([tenantId, expectedCloseDate])
  @@map("crm_deals")
}

model CrmActivity {
  id          String   @id @default(cuid())
  tenantId    String
  accountId   String?
  dealId      String?
  contactId   String?
  userId      String
  type        String   // email_sent, email_received, meeting, call, note, task, deal_stage_change
  subject     String?
  body        String?
  occurredAt  DateTime @default(now())
  sourceType  String?  // manual, auto_email, auto_calendar
  sourceId    String?  // emailId, calendarEventId
  metadata    Json?
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, accountId, occurredAt(sort: Desc)])
  @@index([tenantId, dealId, occurredAt(sort: Desc)])
  @@index([tenantId, contactId, occurredAt(sort: Desc)])
  @@index([tenantId, type])
  @@map("crm_activities")
}
```

**Tenant scoping:** All 6 new CRM models must be added to `TENANT_SCOPED_MODELS` in `tenant-scoped-models.ts`. CrmAccount and CrmDeal use composite PKs and must be added to `COMPOSITE_PK_MODELS`.

**Domain events for activity auto-generation:**

New events file: `common/events/crm.events.ts`

```typescript
export class CrmActivityCreatedEvent {
  static readonly eventName = 'crm.activity.created' as const;
  constructor(
    public readonly tenantId: string,
    public readonly activityId: string,
    public readonly type: string,
    public readonly accountId: string | null,
    public readonly dealId: string | null,
  ) {}
}

export class DealStageChangedEvent {
  static readonly eventName = 'crm.deal.stage-changed' as const;
  constructor(
    public readonly tenantId: string,
    public readonly dealId: string,
    public readonly fromStageId: string,
    public readonly toStageId: string,
    public readonly userId: string,
  ) {}
}
```

**Contact -> Account linking:** The existing Contact model already has `company` field. The `CrmAccountContact` join table creates the M:N relationship. The `ContactsModule` does NOT need to import CrmModule -- instead, CrmModule listens to `ContactUpdatedEvent` via domain events to suggest account associations.

**AI tool registration:** CrmModule self-registers a `CrmTool` via `OnModuleInit` following the exact pattern in ContactsModule. The tool exposes: `search_accounts`, `create_deal`, `update_deal_stage`, `get_account_timeline`, `search_deals`.

### 3. WorkflowModule (NEW)

**Location:** `backend/src/modules/workflow/`

```
modules/workflow/
  workflow.module.ts
  controllers/
    workflow.controller.ts        -- Workflow CRUD
    workflow-run.controller.ts    -- Start, status, history
  services/
    workflow.service.ts           -- Workflow definition CRUD
    workflow-engine.service.ts    -- Execution engine, step orchestration
    step-executor.service.ts      -- Individual step execution
    action-registry.service.ts    -- Maps action types to executors
    workflow-trigger.service.ts   -- Event-based and scheduled triggers
  dto/
    create-workflow.dto.ts
    workflow-step.dto.ts
  workers/
    workflow-step.worker.ts       -- BullMQ worker for step execution
  __tests__/
```

**Prisma models (3 new models):**

```prisma
model Workflow {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  description String?
  trigger     Json     // { type: 'event'|'schedule'|'manual', config: {...} }
  steps       Json     // Array of step definitions
  isActive    Boolean  @default(true)
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  runs        WorkflowRun[]
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, isActive])
  @@map("workflows")
}

model WorkflowRun {
  id          String   @id @default(cuid())
  workflowId  String
  tenantId    String
  status      String   // pending, running, completed, failed, cancelled
  input       Json?
  output      Json?
  startedAt   DateTime @default(now())
  completedAt DateTime?
  error       String?
  traceId     String?  // OTel trace ID for distributed tracing

  workflow    Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  steps       WorkflowStepRun[]
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, workflowId])
  @@index([tenantId, status])
  @@map("workflow_runs")
}

model WorkflowStepRun {
  id          String   @id @default(cuid())
  runId       String
  tenantId    String
  stepIndex   Int
  stepName    String
  actionType  String
  status      String   // pending, running, completed, failed, skipped
  input       Json?
  output      Json?
  startedAt   DateTime?
  completedAt DateTime?
  error       String?
  retryCount  Int      @default(0)

  run         WorkflowRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, runId])
  @@map("workflow_step_runs")
}
```

**Execution model:** Each workflow step runs as a BullMQ job. The engine creates a `WorkflowRun`, then enqueues step-0. When step-0 completes, the worker evaluates conditions and enqueues step-1, etc. This reuses the existing BullMQ infrastructure (20 named queues already exist).

**Action registry:** Maps action type strings to executor functions. Initial actions: `send_email`, `create_contact`, `update_deal_stage`, `add_label`, `send_notification`, `ai_generate_draft`, `webhook_call`, `delay`. Each action checks permissions via `PermissionService` before execution.

**Dependency on AuthorizationModule:** Workflow steps execute with the workflow creator's permissions. The engine passes `userId` + `tenantId` context to `PermissionService.hasPermission()` before each step action.

### 4. TracingModule (NEW, @Global)

**Location:** `backend/src/common/tracing/`

```
common/tracing/
  tracing.module.ts          -- @Global, conditional on OTEL_ENABLED env
  tracing.bootstrap.ts       -- OTel SDK init (MUST run before NestJS bootstrap)
  tracing.service.ts         -- Helper for custom spans (AI calls, etc.)
  bullmq-trace.plugin.ts     -- Inject/extract traceId in BullMQ job data
  __tests__/
```

**Critical: Bootstrap order.** OpenTelemetry SDK MUST initialize before NestJS. This means `tracing.bootstrap.ts` is `--require`d in the Node startup command, NOT initialized in a module constructor.

```typescript
// tracing.bootstrap.ts -- loaded via -r flag
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

if (process.env.OTEL_ENABLED === 'true') {
  const sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: 'pmsync-backend' }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
  sdk.start();
}
```

**BullMQ context propagation:** Inject `traceparent` header into `job.data` on enqueue. Extract and set active context in worker before processing. This bridges HTTP -> Queue -> Worker spans.

**AI call tracing:** `TracingService.startSpan('ai.chat')` wraps Mistral calls. Records `model`, `tokens`, `toolCalls` as span attributes. Links to parent HTTP span via context.

**Coexistence with prom-client:** OTel metrics exporter is NOT used. Keep existing prom-client for Prometheus metrics. OTel is traces-only. This avoids dual-metric confusion.

### 5. AI Control Plane Hardening (MODIFICATIONS)

**Affected files (not new modules, modifications to existing):**

```
MODIFIED: common/interfaces/tool-registry.interface.ts
  -- Add: riskLevel, requiresApproval, domain, inputSchema, outputSchema to IAiTool

MODIFIED: common/modules/tool-registry/tool-registry.service.ts
  -- Add: getToolsByDomain(), getMutatingTools(), validateToolMetadata()

NEW: modules/ai-chat/services/tool-governance.service.ts
  -- Single source of truth for tool execution policy
  -- Evaluates: tool.requiresApproval + user permissions + risk level
  -- Returns: EXECUTE | REQUIRE_APPROVAL | DENY

MODIFIED: modules/ai-chat/services/hitl.service.ts
  -- Approve returns execution outcome (not just status change)
  -- Reuse same ToolExecutorService for both direct and approved execution

NEW: modules/ai-chat/services/tool-executor.service.ts
  -- Extracted from scattered execution logic
  -- Single execution path for both auto-approved and HITL-approved tools
  -- Records to AiRunLedger with traceId

MODIFIED: modules/ai-chat/services/ai-chat.service.ts
  -- Route tool calls through ToolGovernanceService
  -- Use ToolExecutorService instead of inline execution

MODIFIED: All tool services (email-tools, calendar-tools, contact-tools, etc.)
  -- Add riskLevel, requiresApproval metadata to tool registration
```

**Tool metadata extension:**

```typescript
export interface IAiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  domain: string;              // NEW: 'email', 'calendar', 'contacts', 'crm', 'system'
  riskLevel: 'read' | 'write' | 'destructive';  // NEW
  requiresApproval: boolean;   // NEW
  execute(input: Record<string, unknown>, context: IToolContext): Promise<unknown>;
}
```

**ActionType enum extension:** Add `CREATE_ACCOUNT`, `UPDATE_ACCOUNT`, `CREATE_DEAL`, `UPDATE_DEAL`, `MOVE_DEAL_STAGE` to the Prisma ActionType enum.

## Existing Modules: Required Modifications

| Module | Change | Effort | Risk |
|--------|--------|--------|------|
| **ToolRegistryModule** | Extend IAiTool interface with governance metadata | Low | Low -- additive, backward compatible with default values |
| **AiChatModule** | Extract ToolExecutorService, add ToolGovernanceService, HITL contract fix | High | Medium -- core AI flow changes, needs thorough testing |
| **ContactsModule** | Add CrmAccountContact relation awareness to ContactCrudService | Low | Low -- additive join table queries |
| **Common/Auth** | Add PermissionGuard, @RequirePermission decorator | Medium | Low -- new guard in chain, no existing guard changes |
| **AppModule** | Register AuthorizationModule, TracingModule, CrmModule, WorkflowModule | Low | Low -- import additions only |
| **Prisma schema** | Add 9 models, extend ActionType enum, add to tenant scoping | Medium | Low -- migration, no existing model changes |
| **All controllers** | Add @RequirePermission decorators to write/delete endpoints | Medium | Low -- decorator additions, incremental |

## Patterns to Follow

### Pattern 1: Domain Event for Cross-Module Communication

**What:** Use EventEmitter2 `@OnEvent` instead of direct module imports when CRM needs to react to email/calendar events.

**When:** CRM auto-generating activities from email sends, calendar events. Workflow triggers.

**Why:** Preserves zero-circular-dependency achievement. CrmModule listens to events, never imported by EmailModule or CalendarModule.

```typescript
// In CrmModule: crm-event-handler.service.ts
@OnEvent(EmailSyncedEvent.eventName, { async: true })
async handleEmailSynced(event: EmailSyncedEvent) {
  // Match sender/recipient to Contact -> Account -> create Activity
}
```

### Pattern 2: Self-Registering AI Tools via OnModuleInit

**What:** CrmModule registers its CrmTool with ToolRegistryService at startup.

**When:** Any new module that exposes AI-callable actions.

**Why:** Established pattern (ContactsModule, CalendarModule, EmailModule all do this).

```typescript
@Module({ ... })
export class CrmModule implements OnModuleInit {
  constructor(
    @Inject(TOOL_REGISTRY_SERVICE) private readonly toolRegistry: IToolRegistryService,
    private readonly crmTool: CrmTool,
  ) {}
  onModuleInit() {
    this.toolRegistry.registerTool(this.crmTool);
  }
}
```

### Pattern 3: BullMQ Worker for Workflow Steps

**What:** Each workflow step executes as a separate BullMQ job, enabling retries, timeouts, and observability.

**When:** Workflow automation engine step execution.

**Why:** Reuses existing BullMQ infrastructure (20 queues, 7 workers already established). Durable execution without new dependencies.

### Pattern 4: Global Guard Chain Extension

**What:** PermissionGuard inserts into global APP_GUARD chain after BetterAuthGuard.

**When:** Resource-scoped authorization checks.

**Why:** Backward compatible -- routes without @RequirePermission pass through (guard returns true when no metadata found).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Custom Permission DB Model

**What:** Creating a Permission, RolePermission, UserPermission table hierarchy.

**Why bad:** Massive schema complexity for the current scale. better-auth org roles already provide owner/admin/member. A config-based permission map achieves resource-scoped control without DB overhead.

**Instead:** Define permission map in code. Extend to DB-backed custom roles only when tenant-specific role customization is actually needed (Phase 4+).

### Anti-Pattern 2: CrmModule Importing into AiChatModule Directly

**What:** Adding CrmModule to AiChatModule imports.

**Why bad:** AiChatModule already imports 5 domain modules (Email, Calendar, Contacts, Ai, Reminder). Adding more increases coupling and risks circular dependencies.

**Instead:** CrmTool self-registers via ToolRegistry. AiChatModule discovers it at runtime. No import needed.

### Anti-Pattern 3: OTel Metrics Replacing prom-client

**What:** Switching from prom-client to OTel metrics exporter.

**Why bad:** Existing Prometheus metrics (HTTP histograms, BullMQ depth, AI cost counters) are working and battle-tested. OTel metrics would require rewriting all metric definitions.

**Instead:** Use OTel for traces only. Keep prom-client for metrics. They coexist without conflict.

### Anti-Pattern 4: Workflow Engine with Custom Scheduler

**What:** Building a custom cron/scheduler for workflow triggers instead of using BullMQ delayed jobs.

**Why bad:** Reinvents existing BullMQ `delay` and `repeat` capabilities. Adds complexity without value.

**Instead:** Use BullMQ's built-in repeat options for scheduled workflow triggers. Use `@OnEvent` for event-triggered workflows.

### Anti-Pattern 5: Inline HITL Execution in Controller

**What:** Keeping approval + execution in HitlController directly.

**Why bad:** Current bug -- approval can succeed while execution fails. No single execution path.

**Instead:** HitlController calls HitlService.approve() which calls ToolExecutorService.execute(). Same executor used by auto-approved tools.

## Suggested Build Order (Dependency-Driven)

```
Phase 1: Authorization + AI Control Plane (parallel, no deps between them)
  |
  |-- AuthorizationModule: needed by CRM, Workflow, and AI tools
  |-- AI HITL + Tool Governance: independent, fixes critical audit finding
  |
Phase 2: OpenTelemetry (independent infrastructure, can parallel with Phase 1)
  |
  |-- TracingModule: no business logic deps
  |
Phase 3: CRM Domain (depends on Authorization)
  |
  |-- CRM schema + module: needs @RequirePermission on controllers
  |-- CRM AI tools: needs ToolGovernance from Phase 1
  |-- Activity auto-generation: needs domain events (existing)
  |
Phase 4: Workflow Engine (depends on Authorization + CRM)
  |
  |-- Workflow engine: needs CRM actions in ActionRegistry
  |-- Workflow permission checks: needs AuthorizationModule
  |-- Workflow triggers: needs domain events from CRM and Email
```

**Rationale:** Authorization is the foundation -- CRM controllers need `@RequirePermission`, workflow steps need permission checks, AI tools need governance. AI control plane fixes are independent but equally urgent (critical audit finding). OTel is pure infrastructure with no business deps. CRM must exist before workflows can reference CRM actions.

## Scalability Considerations

| Concern | Current (hundreds of users) | At 10K users | At 100K users |
|---------|----------------------------|--------------|---------------|
| Permission caching | In-process config map | Redis 5min TTL (already planned) | Redis + read replica, shorter TTL |
| CRM Activity volume | Direct Prisma writes | BullMQ batched writes | Partitioned activities table by month |
| Workflow execution | BullMQ single worker | BullMQ with concurrency tuning | Dedicated workflow worker pool |
| OTel trace volume | Sample 100% | Sample 10% | Sample 1% + always sample errors |
| AI tool governance | Inline evaluation | Inline (fast config lookup) | Same -- config-based, no DB hit |

## Sources

- [OpenTelemetry NestJS Implementation Guide (SigNoz 2026)](https://signoz.io/blog/opentelemetry-nestjs/)
- [Production-Ready OpenTelemetry in NestJS (OneUptime 2026)](https://oneuptime.com/blog/post/2026-02-06-production-ready-opentelemetry-tracing-nestjs/view)
- [@opentelemetry/instrumentation-nestjs-core (npm)](https://www.npmjs.com/package/@opentelemetry/instrumentation-nestjs-core)
- [Better Auth Organization Plugin](https://better-auth.com/docs/plugins/organization)
- [better-auth ABAC Discussion (GitHub #2167)](https://github.com/better-auth/better-auth/issues/2167)
- [NestJS Workflow Module (jescrich)](https://github.com/jescrich/nestjs-workflow)
- [@hazeljs/flow Durable Execution Engine](https://dev.to/arslan_mecom/hazeljsflow-a-durable-execution-graph-engine-for-nodejs-1l14)
- [BullMQ NestJS Integration (official docs)](https://docs.bullmq.io/guide/nestjs)
- Internal: `docs/AUDIT.md`, `docs/AI_AGENT_REMEDIATION_ROADMAP_2026-03-15.md`, `docs/CTO_PLATFORM_ENGINEERING_REPORT_2026-03-09.md`, `docs/TRANSFORMATION_ROADMAP.md`
