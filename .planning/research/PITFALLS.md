# Domain Pitfalls

**Domain:** Adding CRM, workflow automation, enterprise authorization, OpenTelemetry, AI control plane hardening, and MUI chat CSS migration to an existing NestJS multi-tenant email platform
**Researched:** 2026-03-18
**System context:** PMSync v6.0 -- 43 tenant-scoped Prisma models, global guard chain (Throttler > BetterAuth > Legal > Consent), BullMQ workers with tenant context, AI SDK v6 streaming chat, assistant-ui frontend with CSS-based styling

## Critical Pitfalls

Mistakes that cause rewrites, data leaks, or major architectural regression.

### Pitfall 1: CRM Models Without Composite Primary Keys

**What goes wrong:** New CRM tables (Account, Deal, Pipeline, Activity) are created with simple `id` primary keys instead of the `@@id([id, tenantId])` composite pattern used by the existing 43 models. This silently breaks tenant-scoped Prisma extension auto-filtering and creates cross-tenant data leakage risk.

**Why it happens:** Developers copy generic Prisma model templates or follow standard NestJS/Prisma tutorials that use `@id` only. The tenant-scoping extension in `backend/src/prisma/tenant-scoping/` relies on composite keys for its `where` injection to work correctly. Simple `id` fields bypass this.

**Consequences:**
- Cross-tenant data visible in queries (security breach)
- FK references from CRM models to existing email/contact models fail on composite key mismatch
- The existing pattern of `email_labels` and `email_attachments` referencing only `emailId` without `tenantId` (flagged in CTO audit as incomplete FK) gets repeated in CRM

**Prevention:**
- Every new CRM model MUST use `@@id([id, tenantId])` and include `tenantId String`
- FK references to existing models must include tenantId in the composite FK
- Add a Prisma schema linting step or code review checklist that rejects models without `tenantId`
- Reference existing models like `Email`, `Contact`, `CalendarEvent` as the pattern source

**Detection:** Query a CRM entity without tenant context and check if results leak across tenants. If they do, the composite key is missing.

**Phase:** CRM domain expansion (must be correct from the first migration)

### Pitfall 2: Workflow Engine BullMQ Jobs Losing Tenant Context

**What goes wrong:** Workflow automation rules trigger BullMQ jobs that execute without tenant context. The `withoutTenantScopingAsync` escape hatch gets used as a workaround, creating a tenant isolation bypass in automated rule execution.

**Why it happens:** BullMQ workers run outside the HTTP request lifecycle. The current system propagates tenant context into workers via job data (seen in 50+ files using `withoutTenantScopingAsync`). A new workflow engine that dispatches jobs must manually serialize `tenantId` and `userId` into every job payload and restore them in every worker handler. This is easy to forget, especially for chained workflows (rule A triggers rule B triggers rule C).

**Consequences:**
- Workflow actions execute against wrong tenant's data
- Audit trail loses tenant attribution
- Cascading workflow chains silently drop tenant context at each hop

**Prevention:**
- Create a `WorkflowJobData` base interface that mandates `tenantId` and `userId`
- Wrap all workflow worker handlers in a `withTenantContext(jobData)` utility that sets the Prisma extension context
- Never allow `withoutTenantScopingAsync` in workflow execution code -- treat it as a lint error for that module
- Add integration tests that verify tenant isolation across chained workflow executions

**Detection:** Log `tenantId` at the start and end of every workflow step. Alert on mismatches or nulls.

**Phase:** Workflow automation engine

### Pitfall 3: Authorization Layer Breaking the Existing Guard Chain

**What goes wrong:** Adding a `@RequirePermission()` decorator and `PermissionGuard` that conflicts with the existing global guard ordering (ThrottlerGuard > BetterAuthGuard > LegalAcceptanceGuard > ConsentGuard). The new guard either runs before auth (sees no user) or after consent (too late to short-circuit), causing 500 errors or bypassing consent checks.

**Why it happens:** NestJS `APP_GUARD` ordering is registration-order dependent. The existing chain is carefully ordered in `app.module.ts` providers array. Inserting a new global guard in the wrong position, or making it controller-level when it should be global (or vice versa), breaks the pipeline. The current `RolesGuard` is NOT an `APP_GUARD` -- it's applied per-controller via `@UseGuards(RolesGuard)`, which is a deliberate design choice.

**Consequences:**
- Permission checks fail with cryptic errors because `request.user` is not populated yet
- Legal/consent guards get bypassed if permission guard short-circuits before them
- Existing controllers that work fine today start returning 403 or 500 after the guard is added

**Prevention:**
- Do NOT add `PermissionGuard` as a global `APP_GUARD`. Follow the existing `RolesGuard` pattern: apply per-controller with `@UseGuards(PermissionGuard)` or combine with `@RequirePermission()`
- If it must be global, insert it AFTER ConsentGuard in the providers array
- The guard must gracefully pass through when no `@RequirePermission()` decorator is present (same pattern as `RolesGuard` which returns true when no `@Roles()` is set -- though that itself was flagged as a LOW finding in the CTO audit)
- Write integration tests that verify the full guard chain with and without the permission decorator

**Detection:** Any controller that previously worked starts returning unexpected 403s after the guard is deployed.

**Phase:** Authorization/permissions

### Pitfall 4: OpenTelemetry Instrumentation Breaking BullMQ and AI Streaming

**What goes wrong:** Adding `@opentelemetry/auto-instrumentations-node` auto-patches HTTP, pg, ioredis, and Express. This can break BullMQ's Redis connection handling (double-patching ioredis connections shared between pub/sub and job processing) and interfere with AI SDK SSE streaming (the HTTP instrumentation tries to buffer/measure response bodies, corrupting chunked transfer encoding).

**Why it happens:** OpenTelemetry auto-instrumentation is designed for request-response HTTP. It struggles with:
- Long-lived Redis connections used by BullMQ (pub/sub subscribers are not "requests")
- Server-Sent Events streaming used by AI SDK `streamText()` (response never "completes" in the normal sense)
- The system already uses TWO Redis client libraries (ioredis + node-redis, flagged in CTO audit), and OTel may only patch one

**Consequences:**
- AI chat streaming breaks silently -- responses hang or get truncated
- BullMQ workers appear to process jobs but OTel spans are malformed or missing
- Redis connection pool exhaustion from duplicated instrumented connections
- 20-30% latency increase on hot paths from excessive span creation

**Prevention:**
- Use selective instrumentation, NOT auto-instrumentation. Explicitly instrument: HTTP incoming, Prisma/pg outgoing, and manual spans for BullMQ job lifecycle and AI tool calls
- Exclude SSE endpoints from HTTP response body capture
- Test AI streaming end-to-end after OTel is added -- verify chunked responses still work
- Use `@opentelemetry/instrumentation-bullmq` (if it exists) rather than generic Redis instrumentation for queue tracing
- Set span sampling rate to < 100% in production to control overhead

**Detection:** AI chat responses start timing out or truncating after OTel deployment. BullMQ job completion rates drop.

**Phase:** OpenTelemetry distributed tracing

### Pitfall 5: AI Control Plane Hardening Colliding with In-Progress HITL Refactor

**What goes wrong:** The AI remediation roadmap (6 phases) requires changes to HITL controller, tool registry, memory service, and system prompt. The codebase already has uncommitted HITL controller refactor in progress. Concurrent changes to the same files create merge conflicts and semantic contradictions (e.g., one branch unifies the HITL DTO while another adds governance metadata to the old DTO shape).

**Why it happens:** The AI Agent Remediation Roadmap (2026-03-15) defines Phases 0-6 covering HITL contract unification, tool execution governance, memory repair, prompt alignment, and legacy removal. These touch the same files as any new AI governance work. The system prompt in `system-prompt.ts`, the tool registry in `tool-registry.service.ts`, and the HITL service in `hitl.service.ts` are all active change targets.

**Consequences:**
- Merge conflicts that are semantically dangerous (both sides compile but the combined behavior is wrong)
- Tool governance metadata gets added to a DTO shape that's about to be replaced
- Tests written against the old HITL contract become invalid
- Memory repair work gets blocked by concurrent prompt changes

**Prevention:**
- Sequence AI work strictly: complete HITL contract unification FIRST, then add governance metadata to the unified contract
- Do not add new tools or governance fields until Phase 2 (Tool Execution Governance) of the remediation roadmap is complete
- Resolve the in-progress HITL refactor before starting any v6.0 AI governance work
- Use the remediation roadmap's phase ordering as the canonical sequence

**Detection:** The tool registry has tools with governance metadata but the HITL execution path doesn't know how to read it.

**Phase:** AI control plane (must be sequenced after HITL unification)

### Pitfall 6: MUI Chat CSS Migration Breaking Streaming UI

**What goes wrong:** Replacing CSS-based chat styling with MUI `sx` props breaks the assistant-ui streaming render. The chat uses CSS that updates during token streaming -- MUI's `sx` prop generates classNames at render time, which means every streamed token triggers a style recalculation and className regeneration, causing visible jank and dropped frames during AI responses.

**Why it happens:** The current chat CSS (3 files, ~950 lines) was intentionally kept as pure CSS with custom properties (documented in CLAUDE.md memory). assistant-ui's streaming architecture updates the DOM incrementally during SSE token delivery. MUI's `sx` prop uses Emotion under the hood, which computes styles at render time. During streaming, this means hundreds of re-renders per second each triggering Emotion's style injection.

**Consequences:**
- Chat becomes visually janky during streaming (the one place users notice performance most)
- Token-by-token rendering slows down noticeably
- Mobile devices stutter or drop frames during AI responses
- Users perceive the AI as "slow" even though backend latency hasn't changed

**Prevention:**
- Keep streaming-critical CSS as static CSS or CSS modules, NOT MUI `sx` props
- Only migrate non-streaming chat elements to MUI (headers, input bar, sidebar, tool cards)
- Test streaming performance before and after migration using Chrome DevTools Performance panel
- The Wave 3-4 migration scope should explicitly exclude the message streaming container
- Use `className` with static styles for the message bubble content area

**Detection:** Open Chrome DevTools Performance panel during an AI streaming response. If you see continuous "Recalculate Style" entries during token delivery, the migration broke streaming performance.

**Phase:** MUI Chat CSS migration (Waves 3-4)

## Moderate Pitfalls

### Pitfall 7: CRM Activity Model Creating N+1 Queries Against Email/Contact

**What goes wrong:** CRM Activities reference Emails, Contacts, and Calendar Events via FKs. Loading a deal's activity timeline triggers N+1 queries: one query for activities, then one query per activity to load the linked email/contact/event.

**Why it happens:** Prisma's `include` is convenient but generates separate SQL queries per relation. With CRM, a single Deal page might load 50+ activities, each linking to different entity types. The existing system already fixed N+1 in email listing (PERF-02 in v2.0), but new CRM code won't inherit those fixes -- they were endpoint-specific.

**Prevention:**
- Use Prisma `include` with `select` to load only needed fields
- Implement a CRM-specific data loader pattern (batch FK resolution)
- Set `staleTime: 5min` on CRM TanStack Query hooks to avoid refetching on every tab switch
- Add query logging in dev mode to catch N+1 patterns early

**Phase:** CRM domain expansion

### Pitfall 8: Workflow Rules Executing AI Tools Without HITL Approval

**What goes wrong:** A user creates a workflow rule: "When email from VIP arrives, draft a reply." The workflow engine calls the AI draft tool directly, bypassing the HITL approval flow that would normally gate a mutating action. The workflow acts as a privilege escalation path.

**Why it happens:** The HITL approval flow is tied to the chat streaming path (`AiChatService.streamChat()`). Workflow rules that invoke AI tools outside the chat context don't go through the same approval pipeline. The current system only checks `requiresApproval` during chat tool execution.

**Prevention:**
- Workflow engine must use the same tool execution registry and approval policies as the chat path
- Add a `WorkflowExecutionContext` that enforces the same HITL rules
- Workflow rules involving mutating actions must either pre-approve at rule creation time or queue for approval at execution time
- This is the intersection of the authorization system and the AI control plane -- both must be in place before workflow automation ships

**Phase:** Workflow automation (depends on AI control plane Phase 2 being complete)

### Pitfall 9: Frontend PermissionGate Causing Layout Shifts

**What goes wrong:** Adding `<PermissionGate>` components that conditionally hide UI elements causes Cumulative Layout Shift (CLS). Buttons, menu items, and sections pop in/out as permissions load asynchronously, making the page jump.

**Why it happens:** Permissions are loaded from the backend after initial render. The frontend currently has no permission model (flagged in both audits). When added, permission-gated components will initially render nothing, then render their content once permissions arrive, causing layout shifts.

**Prevention:**
- Prefetch permissions with the session (load in the auth provider, not per-component)
- Use skeleton placeholders for permission-gated sections during loading
- Cache permissions in Zustand (not just TanStack Query) so they're available synchronously on subsequent renders
- Follow the existing pattern of `staleTime: 5min` for permission queries

**Phase:** Authorization/permissions (frontend)

### Pitfall 10: OpenTelemetry Trace Context Not Propagating Through BullMQ

**What goes wrong:** A user action triggers an HTTP request that enqueues a BullMQ job. The OTel trace ID from the HTTP request is not carried into the job payload. The distributed trace shows the HTTP request and the BullMQ job as separate, unconnected traces.

**Why it happens:** BullMQ jobs are serialized to Redis as JSON. OTel trace context lives in the in-memory context object. Unless the trace context is explicitly serialized into the job data and deserialized in the worker, the trace chain breaks. This is the entire point of adding OTel, and it's the part most likely to be done wrong.

**Prevention:**
- Create a `TracedJobData` wrapper that serializes `traceparent` and `tracestate` into every job payload
- In every worker, extract the trace context from job data before processing
- Test the full chain: HTTP request > BullMQ enqueue > worker processing > Prisma query -- all should appear in one trace
- This applies to all 20 existing BullMQ queues, not just new workflow queues

**Phase:** OpenTelemetry distributed tracing

### Pitfall 11: CRM Deal Pipeline Model Conflicting with Existing Kanban State

**What goes wrong:** The new CRM Pipeline/Stage model creates its own notion of "stages" and "columns" that conflicts with the existing email kanban board's stage management. Shared state stores or API endpoints accidentally mix email kanban stages with CRM pipeline stages.

**Why it happens:** The frontend already has a `KanbanBoard` component (701 lines, flagged in CTO audit as oversized). If CRM pipelines reuse this component without proper domain isolation, email and CRM states bleed into each other through shared Zustand slices or TanStack Query cache keys.

**Prevention:**
- CRM pipeline UI gets its own Zustand slice and TanStack Query key prefix (`['crm', 'pipeline', ...]` not `['pipeline', ...]`)
- Do NOT reuse the email KanbanBoard component directly -- extract a generic `DragDropBoard` component, then compose domain-specific boards from it
- API routes must be domain-prefixed: `/api/v1/crm/pipelines` not `/api/v1/pipelines`

**Phase:** CRM domain expansion

### Pitfall 12: `withoutTenantScopingAsync` Usage Expanding Into CRM/Workflow

**What goes wrong:** CRM or workflow code uses `withoutTenantScopingAsync` to "fix" queries that don't work because the developer didn't understand the tenant-scoping extension. Already used in 50 files across the codebase, it becomes normalized for new code.

**Why it happens:** When a developer writes a CRM query and gets empty results (because tenant context isn't set in their test), the fastest "fix" is wrapping in `withoutTenantScopingAsync`. The real fix is ensuring tenant context is properly propagated.

**Prevention:**
- Code review rule: `withoutTenantScopingAsync` is NEVER acceptable in CRM or workflow modules
- Add an ESLint custom rule or dependency-cruiser constraint that flags `withoutTenantScopingAsync` imports in new modules
- Only the 50 existing usages (mostly in workers, webhooks, system tasks) are grandfathered

**Phase:** CRM and Workflow (both)

## Minor Pitfalls

### Pitfall 13: God Module Pattern Spreading to CRM Module

**What goes wrong:** The CRM module follows the pattern of EmailModule (22 services, 8 controllers) and AiModule (28 providers) by putting all CRM functionality into a single `CrmModule`.

**Prevention:** Split from the start: `CrmAccountsModule`, `CrmDealsModule`, `CrmPipelinesModule`, `CrmActivitiesModule`. Each with focused exports.

**Phase:** CRM domain expansion

### Pitfall 14: MUI Theme Inconsistency in Chat Migration

**What goes wrong:** Chat components migrated to MUI use hardcoded colors or the wrong semantic tokens instead of the established theme palette (primary: teal, secondary: purple, ai: teal semantic color).

**Prevention:** Reference the existing theme tokens documented in CLAUDE.md memory. Never use raw hex/hsl values in `sx` props. Use `theme.palette.primary.main`, `theme.palette.semantic.ai`, etc.

**Phase:** MUI Chat CSS migration

### Pitfall 15: Authorization Adding Latency to Every Request

**What goes wrong:** The permission check queries the database on every request to check resource-level permissions, adding 5-20ms per request. With the existing 4-guard chain already adding overhead, this becomes noticeable.

**Prevention:**
- Cache permissions per-session with 5-minute TTL (matches existing `cookieCache` 300s maxAge pattern)
- Permission checks should be in-memory lookups against cached permission sets, not DB queries
- Only invalidate on role/permission change events

**Phase:** Authorization/permissions

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CRM domain | Composite PK omission on new models | Schema review checklist, test tenant isolation on every model |
| CRM domain | N+1 queries on Activity timeline | Data loader pattern, query logging in dev |
| CRM domain | God module pattern | Split into sub-modules from day 1 |
| Workflow engine | Tenant context loss in chained jobs | `WorkflowJobData` base interface, integration tests |
| Workflow engine | HITL bypass through workflow execution | Shared tool execution policy, not a separate path |
| Authorization | Guard chain breakage | Controller-level guards, not APP_GUARD; integration tests |
| Authorization | Frontend layout shifts from PermissionGate | Prefetch with session, skeleton placeholders |
| Authorization | Per-request DB queries for permissions | In-memory cache with session-scoped TTL |
| OpenTelemetry | SSE streaming corruption | Selective instrumentation, exclude SSE from response capture |
| OpenTelemetry | Trace context lost at BullMQ boundary | Explicit serialization of traceparent into job data |
| OpenTelemetry | Dual Redis library patching issues | Instrument explicitly, don't auto-patch |
| AI control plane | Collision with in-progress HITL refactor | Complete HITL unification before adding governance metadata |
| AI control plane | New tools added before registry is unified | Follow remediation roadmap Phase 2 before expanding tools |
| MUI chat migration | Streaming performance regression | Keep streaming container as static CSS, only migrate non-streaming elements |
| MUI chat migration | Hardcoded colors | Use theme semantic tokens consistently |
| UI/UX fixes | Generic error states hiding permission failures | Distinguish 403 from 500 in error boundaries (already flagged in UI audit) |

## Integration Landmines

These are pitfalls that only appear when two new features interact.

### CRM + Authorization

The CRM needs object-level permissions (e.g., "can this user see this Deal?") but the authorization system is being built simultaneously. If CRM ships before authorization, it ships with no access control beyond tenant scoping. If authorization ships first without CRM's object model, the permission schema won't cover CRM entities.

**Mitigation:** Design the permission model with CRM entity types included from the start, even if CRM models don't exist yet. Use a resource-type enum that includes `account`, `deal`, `pipeline`, `activity`.

### Workflow + AI Control Plane

Workflows calling AI tools must go through the same governance as chat. But workflow execution is BullMQ-based (async) while AI chat governance is HTTP-based (sync). The approval flow doesn't work when there's no user waiting at a browser.

**Mitigation:** Define two approval modes: (1) synchronous/interactive for chat, (2) async/pre-approved for workflows. Workflow rules that involve mutating tools must declare their approval policy at creation time.

### OpenTelemetry + AI Streaming

OTel HTTP instrumentation wants to measure response time and size. AI streaming responses never "complete" in the normal HTTP sense -- they stream until the model stops generating. OTel will either report incorrect latency (time to first byte instead of total) or hang waiting for the response to end.

**Mitigation:** Create custom spans for AI streaming that start when `streamText()` is called and end when the stream closes. Do not rely on HTTP auto-instrumentation for these endpoints.

### CRM + Workflow + AI

The three-way interaction is the most dangerous. A workflow rule triggers on a CRM event (deal stage change), calls an AI tool (draft email to contact), and needs tenant context, permission checks, HITL governance, and OTel tracing all working together. Any missing link in this chain creates a silent failure.

**Mitigation:** This combination should be the LAST thing shipped, after each individual system is battle-tested. Do not attempt to demo "AI-powered CRM workflow automation" until CRM, workflow, authorization, and AI governance are each independently stable.

## Sources

- `docs/AUDIT.md` -- Architecture and security audit (2026-03-09)
- `docs/CTO_PLATFORM_AUDIT_2026-03-09.md` -- CTO engineering audit with anti-patterns
- `docs/AI_AGENT_REMEDIATION_ROADMAP_2026-03-15.md` -- AI control plane remediation phases
- `docs/UI_UX_AUDIT_2026-03-12.md` -- UI/UX findings for mobile, accessibility, error states
- `backend/src/app.module.ts` -- Guard chain ordering (lines 104-139)
- `backend/src/prisma/tenant-scoping/` -- Tenant-scoping extension (50 files use withoutTenantScopingAsync)
- `.planning/PROJECT.md` -- Project context, constraints, key decisions
