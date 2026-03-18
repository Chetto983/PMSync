# Feature Landscape

**Domain:** AI-powered email CRM with workflow automation, enterprise authorization, AI control plane, and observability
**Researched:** 2026-03-18
**Milestone:** v6.0 Enterprise Platform & AI Governance

## Scope Note

This document covers only NEW features for v6.0. The following are already shipped and NOT re-listed here:
- Email client (VList, TipTap, kanban, keyboard shortcuts, search)
- AI chat with streaming, 20 tools, HITL approval, tool renderers, intent routing
- Calendar sync (Google, CalDAV), contacts sync, CRM relationship scoring
- better-auth orgs (create, invite, roles, switch), admin panel (ban, impersonate, revoke)
- GDPR compliance (PII tokenization, encryption at rest, consent, data export/erasure)
- Prometheus metrics, AI run ledger, structured logging

---

## Domain 1: CRM (Accounts, Deals, Activities, Pipelines)

### Table Stakes

Features users expect from any CRM module in an email-native product.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Account entity (company-level) | Every CRM distinguishes person vs organization. Contacts already have `company` string field; Accounts formalize it | Med | Prisma schema, existing Contact model | M:N Contact-Account link. Salesforce/HubSpot/Pipedrive all have this |
| Deal entity with monetary value + close date | Core unit of sales pipeline. Without deals, pipeline is meaningless | Med | Account, Pipeline | Amount, currency, expectedCloseDate, probability, owner |
| Pipeline + Stages (configurable) | Users need at least one pipeline with ordered stages. Pipedrive popularized this as the primary UX | Med | None | Default pipeline with 5 stages (Lead, Qualified, Proposal, Negotiation, Closed Won/Lost) |
| Activity timeline on Account/Deal | Every CRM shows interaction history. Users expect to see emails, meetings, notes in chronological order | Med | Email, Calendar, Contact links | Auto-capture from existing email sends/receives and calendar events |
| Deal board (Kanban view) | Pipedrive/HubSpot trained users to expect drag-drop deal cards across stage columns | Med | Pipeline, Stages, Deal | Reuse existing kanban pattern from email/follow-ups |
| Contact-to-Account linking | Users must associate people with companies. Existing `company` string field is not relational enough | Low | Contact, Account models | M:N because one person can represent multiple companies |
| Activity auto-capture from email | When an email is sent/received involving a contact linked to a deal/account, log it automatically | Med | Email sync, Contact-Account links | HubSpot and Salesforce do this transparently; manual logging kills adoption |
| Activity auto-capture from calendar | Calendar events with attendees matching contacts should auto-log as activities | Med | Calendar sync, Contact links | Same principle as email auto-capture |
| Account/Deal CRUD API | Standard REST endpoints for create/read/update/delete with tenant scoping | Med | Prisma models, TenantGuard | Follow existing NestJS module pattern |
| CRM navigation + i18n | Sidebar nav entries, page titles, form labels in en + it | Low | Frontend translations | Follow existing translation procedure |

### Differentiators

Features that set the product apart from generic CRMs.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| AI-powered deal scoring | Use email sentiment, response times, and interaction frequency to predict deal probability. Leverages existing relationship scoring + AI stack | High | AI embeddings, Contact relationship score, Deal | Competitive edge: Salesforce charges enterprise tier for this |
| AI deal summary tool | Chat tool that summarizes all interactions for a deal/account in natural language | Med | AI chat tools, Activity timeline | Add to existing ToolRegistryService; register as read-only tool |
| Email-to-deal linking | Automatically associate emails with open deals based on participants and context | High | Email, Deal, Contact-Account, AI | Goes beyond manual linking; uses existing RAG for context matching |
| CRM insights in AI briefing | Daily briefing already exists; extend to include "3 deals closing this week" or "account X went silent" | Low | AI briefing, Deal, Account | Low-hanging fruit; high perceived value |

### Anti-Features

Features to explicitly NOT build in v6.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom objects / dynamic entity types | Massive schema complexity (JSONB schema definitions, dynamic validation, UI generation). Salesforce spent years on this | Hardcode Account, Deal, Activity, Pipeline. Custom fields via JSONB on those four entities is acceptable later (Phase 4 in roadmap) |
| Lead entity separate from Contact | Leads vs contacts is a Salesforce anti-pattern that confuses users. HubSpot unified them years ago | Use Contact with a lifecycle stage field (lead/customer/partner/etc.) |
| Forecasting / revenue analytics | Requires statistical modeling, historical data, and a mature pipeline. Premature at launch | Show simple pipeline value totals per stage. Defer forecasting to post-launch |
| Products/line items on deals | Over-engineering for v1 CRM. Most email CRMs (Streak, Copper) skip this | Single deal amount field. No product catalog |
| Territory management | Enterprise-only feature requiring org hierarchy modeling. Irrelevant for initial CRM | Simple deal ownership via userId. No territory trees |
| Quoting / CPQ | Completely different domain. Not a CRM table stake | Out of scope permanently for an email CRM |

---

## Domain 2: Workflow Automation Engine

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Trigger-based rules (event-driven) | "When email arrives from X, do Y" is the minimum viable automation. Every email CRM has this (HubSpot, Pipedrive, Streak) | High | Domain events (already wired via EventEmitter2), BullMQ | Triggers: email received, deal stage changed, contact created, calendar event created |
| Action execution (email, label, move, assign) | Rules without actions are useless. Minimum: send email, apply label, move to folder, assign deal owner | Med | Existing email/label/folder services, CRM module | Reuse existing service methods; wrap in typed action contracts |
| Conditional branching (if/else) | "If deal value > 10K, route to senior rep" is expected even in simple automation | Med | None beyond rule engine | Simple predicate evaluation, not a full expression language |
| Workflow CRUD API | Create/read/update/delete/enable/disable rules | Med | Prisma models, TenantGuard | Standard NestJS module |
| Workflow execution history | Users need to see what ran, when, and whether it succeeded or failed | Med | BullMQ job tracking, Prisma | Essential for debugging; otherwise rules are black boxes |
| Policy-aware execution | Workflows must respect the same permission model as manual actions. A workflow should not bypass HITL or authorization | High | Authorization system (Domain 3), AI control plane (Domain 4) | Critical: without this, workflows become a privilege escalation vector |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| AI-suggested automations | "You reply to support@ emails within 2 hours 90% of the time. Want to auto-draft replies?" | High | AI analysis of user patterns, workflow engine | Killer feature for AI-native CRM; nobody else does this well |
| Natural language rule creation via AI chat | "Set up a rule that labels urgent emails from VIP contacts" -> AI creates the workflow | High | AI chat tools, workflow CRUD | 2026 trend: natural language interfaces for automation |
| Workflow templates (pre-built) | "Lead nurture sequence", "Deal stage notifications", "Follow-up reminder chain" | Low | Workflow engine, seed data | Low effort, high perceived value. Ship 5-10 templates |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Visual node editor (v6.0) | 16+ hours of UI complexity (xyflow/react). Premature for first release of workflow engine | Simple form-based rule builder. Visual editor is Phase 4 material |
| Custom code nodes / JavaScript execution | Security nightmare (sandbox escape, resource exhaustion). Salesforce Apex took a decade to get right | Limit to 20-30 built-in action types. No user-authored code |
| Multi-step sequential workflows (v6.0) | State machine with retries, compensation, and durable execution is Phase 4 scope | Simple trigger -> condition -> action rules. One level of branching max |
| Webhook triggers/actions | Requires endpoint management, retry logic, authentication handling | Defer to Phase 4 when extension point API exists |
| Scheduled/cron triggers | Adds timer infrastructure complexity beyond event-driven rules | Defer; existing BullMQ scheduled jobs handle system cron internally |

---

## Domain 3: Authorization & Permissions

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Resource-scoped permissions on org roles | owner/admin/member roles exist but grant blanket access. "Admin can do everything" is not enterprise-grade | Med | better-auth org roles (shipped), PolicyService interface (exists but unimplemented) | Extend existing `Permission` enum and implement `IPolicyService` |
| `@RequirePermission` decorator | Controllers need declarative permission checks. Pattern is standard in NestJS auth | Med | PolicyService, existing RolesGuard | Layer on top of existing BetterAuthGuard -> TenantGuard -> RolesGuard chain |
| Permission caching (Redis) | Permission checks on every request must not add latency. 5min TTL cache in Redis | Low | Redis (already running for BullMQ/sessions) | Simple key-value cache; invalidate on role change |
| Frontend `PermissionGate` component | Hide/disable UI elements based on user permissions. Every enterprise app needs this | Med | Permission check API endpoint, React context | `<PermissionGate requires="contacts.write">` pattern |
| `usePermission()` hook | Programmatic permission checking in components for conditional logic | Low | PermissionGate infrastructure | Companion to PermissionGate component |
| Role-to-permission mapping | Define which permissions each org role (owner/admin/member) gets by default | Low | Permission enum, PolicyService | Hardcoded mapping table initially; configurable per-org later |
| Permission enforcement on all write/delete endpoints | Every mutating API endpoint must check permissions, not just role | High | @RequirePermission on all controllers | Audit pass across all controllers; ~25+ endpoints |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Resource ownership checks | "Members can edit their own deals but not others'" requires ownership validation beyond role | Med | Deal.ownerId, PolicyService context | ABAC-lite: check `resource.ownerId === user.id` in policy evaluation |
| Conditional permissions | "Can edit deals only if status is DRAFT" -- attribute-based rules within the policy engine | High | PolicyService with context evaluation | Use CASL-style ability definitions. Do NOT build a full ABAC engine; keep it to 3-4 conditions |
| AI tool permission scoping | AI tools should respect the same permissions as manual actions. If user lacks `contacts.write`, AI cannot create contacts | Med | ToolRegistryService, PolicyService | Critical for trust: AI must not bypass what the user cannot do manually |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full ABAC policy engine (OPA, Cedar) | Massive complexity for current scale. PROJECT.md explicitly lists this as out of scope until CRM object model exists | RBAC+ with ownership checks and 3-4 attribute conditions. Revisit ABAC post-CRM maturity |
| Per-field permissions | "Admin can see deal.amount but member cannot" requires field-level access control in every query and serialization | Per-entity permissions only. Field masking is a future concern |
| Custom roles beyond owner/admin/member | Role explosion problem. Custom roles need a role editor UI, role-permission matrix, migration path | Stick with 3 built-in roles. Add a 4th "viewer" role at most |
| Database RLS (Row-Level Security) | PROJECT.md explicitly rules this out: "Prisma 7 + PostgreSQL RLS interaction problematic; TenantGuard sufficient" | Continue using Prisma extension for tenant scoping |

---

## Domain 4: AI Control Plane Hardening

### Table Stakes

Based on the AI Agent Remediation Roadmap (2026-03-15), these are structural fixes, not new features.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| HITL contract unification | One canonical pending-actions DTO, one approval lifecycle. Currently: approve can report success when execution fails | High | hitl.controller.ts, hitl.service.ts, frontend ai hooks | Phase 1 of remediation roadmap. Blocks everything else |
| Tool execution governance | Every mutating tool must declare name, domain, riskLevel, requiresApproval, inputSchema. Currently: registry has read tools but HITL tries to execute write tools from it | High | ToolRegistryService, tool interfaces | Phase 2 of remediation roadmap. Current `IAiTool` interface lacks riskLevel/requiresApproval metadata |
| HITL execution returns real outcome | approve/reject must return `executed`, `failed`, or `approved_only` -- not always 200 | Med | hitl.service.ts | False-positive success is a safety bug |
| Long-term memory repair | `save_memory` writes to one store, retrieval reads from another. Memory appears broken to users | High | memory.service.ts, embeddings.service.ts, AIMemory model | Phase 3 of remediation roadmap. Unify vector storage |
| Prompt/runtime alignment | System prompt references tools and behaviors the frontend cannot render (ask_user, save_memory fall through to generic JSON) | Med | system-prompt.ts, skill-content.ts, frontend tool UIs | Phase 4 of remediation roadmap |
| Legacy chat surface removal | Frontend still calls old non-streaming endpoints and dead compatibility shims | Med | Frontend api/ai.ts, ChatRuntimeProvider, SchedulingDrawer | Phase 5 of remediation roadmap. Eliminate drift source |
| Action taxonomy fix | `delete_event` maps to `SCHEDULE_MEETING` action type -- invalid mapping | Low | hitl.service.ts | Simple but critical correctness fix |
| Runtime context injection | Pass real timezone, locale, provider into system prompt instead of hardcoded assumptions | Low | ai-chat.service.ts | Improves AI behavior quality significantly |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| HITL approval timeout with auto-reject | Pending actions should expire after configurable timeout (e.g., 30min) instead of hanging forever | Med | hitl.service.ts, BullMQ delayed job | Transformation roadmap Phase 3.4 |
| Approval audit trail linked to AI Run Ledger | Every approve/reject/timeout with who, when, and execution outcome linked to the AI run | Med | AiRunLedger, hitl.service.ts | Enables compliance reporting |
| AI tool permission enforcement | AI tools check user permissions before executing. If user cannot `contacts.write`, AI tool cannot create contacts | Med | PolicyService, ToolRegistryService | Cross-cuts with Domain 3 (Authorization) |
| Dedicated ask_user and save_memory renderers | Frontend renders structured UI for these tools instead of falling back to generic JSON cards | Med | Frontend tool-uis registry | Improves perceived AI quality dramatically |
| CRM tools for AI chat | search_deals, get_account_summary, create_activity as new AI tools registered in ToolRegistryService | Med | CRM module (Domain 1), ToolRegistryService | Extends AI capabilities into CRM domain |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| AI action rollback registry (v6.0) | Compensation actions (un-create contact, un-send email) are complex and the undo semantics are domain-specific | Defer to Phase 3 of transformation roadmap. Focus on preventing bad actions (HITL) rather than reversing them |
| Token budget enforcement per request | Requires tuning against real usage patterns that don't exist yet. Premature hard limits will frustrate users | Implement soft limits (warn in AI ledger). Hard caps are Phase 3 material |
| Per-user daily cost cap | Same issue: needs usage baseline data. Cutting users off prematurely is worse than overspending | Log costs accurately first. Alerting before enforcement |
| Push notifications for pending approvals | Requires notification infrastructure (FCM/APNs or web push) that doesn't exist | In-app indicator (badge count) on the chat panel. WebSocket event for real-time update |

---

## Domain 5: OpenTelemetry Distributed Tracing

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| OTel SDK bootstrap | Initialize `@opentelemetry/sdk-node` with auto-instrumentations for HTTP, Prisma, BullMQ | Med | npm packages | Must load before NestJS bootstrap (--require flag or bootstrap file) |
| HTTP request trace context | Every API request gets a traceId propagated through the entire call chain | Med | OTel HTTP instrumentation | Replaces/supplements existing correlationId |
| BullMQ trace propagation | Queue jobs carry parent trace context so async work links back to the originating request | Med | Custom BullMQ instrumentation | OTel does not auto-instrument BullMQ; needs manual span creation |
| AI call trace spans | Mistral API calls wrapped in OTel spans with model, tokens, latency attributes | Med | Custom instrumentation in AI services | Links AI cost to specific user requests |
| Trace export to collector | Ship traces to Jaeger, Tempo, or OTLP-compatible backend | Low | OTel exporter config | Start with console exporter for dev, OTLP for prod |
| traceId in response headers | Frontend can correlate errors with backend traces for debugging | Low | OTel HTTP instrumentation | `X-Trace-Id` header or similar |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| AI run ledger linked to OTel traces | Each AI run links to its distributed trace, enabling drill-down from cost to exact call chain | Med | AiRunLedger, OTel trace IDs | Unique observability depth for AI costs |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full Grafana/Tempo stack deployment | Infrastructure complexity beyond app scope | Export traces; let ops team choose visualization. Ship OTLP exporter, not a monitoring stack |
| Frontend OTel instrumentation | Browser OTel SDK adds bundle size and complexity for marginal benefit at current scale | Backend-only tracing. Frontend correlates via response header traceId |
| Custom metrics via OTel (replacing Prometheus) | Prometheus metrics already work and are scraped. Migrating creates churn with no benefit | Keep prom-client for metrics. Use OTel only for traces |

---

## Domain 6: MUI Chat CSS Migration (Wave 3-4)

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Command Palette rebuild in MUI | Current command palette uses CSS that predates MUI migration. Needs MUI Dialog + List patterns | Med | MUI theme | Wave 3 scope. Follow existing MUI patterns |
| Chat layout CSS to MUI sx | Three chat CSS files (~950 lines) use custom properties bridged via ChatThemeBridge. Migrate to MUI sx | High | MUI theme, ChatThemeBridge | Wave 4 scope. Largest remaining CSS migration |
| Remove ChatThemeBridge after migration | Once chat CSS is in sx, the CSS variable bridge is dead code | Low | Chat CSS migration complete | Cleanup step |
| Remove tailwindcss package | Currently kept solely for `@tailwind base` CSS var injection. After chat migration, no longer needed | Low | All CSS migrated to MUI sx | Final cleanup of Tailwind dependency |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Rewrite assistant-ui chat components | assistant-ui provides the chat runtime; its internals should not be rewritten | Style assistant-ui components via MUI theme integration, not replacement |

---

## Domain 7: UI/UX Fixes (March 12 Audit)

### Table Stakes (Unfixed from Audit)

These are bugs/regressions identified in the March 12-13 UI/UX audit that were NOT fixed in the post-audit remediation passes.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Admin users table mobile responsive | Table renders at 879px inside 412px viewport. Columns and actions clip | Med | UserListTable.tsx | Switch to card layout below mobile breakpoint. Audit Finding: "High severity" |
| Tasks page: remove hardcoded demo content | Page shows English demo tasks in production Italian app | Low | Tasks.tsx | Replace with empty state + real task data source. Audit: "Medium severity" |
| Analytics consent gate + localization | Analytics page fires 403 when consent missing; page title still English | Low | AnalyticsChart.tsx | Partially fixed per audit; verify localized weekday labels |
| Password autocomplete semantics | Security settings missing `autocomplete="new-password"` | Low | Security settings form | Browser diagnostic warning. Low effort fix |
| Chart container -1 width/height warning | Admin organizations chart logs negative dimensions | Low | Admin organizations page | Layout initialization timing issue |

### Already Fixed (Do NOT Re-list)

The following were identified and fixed during the March 12-13 audit passes:
- Mobile security CTA clipping (TOTP setup)
- Admin route generic error -> role-aware access
- Mobile inbox toolbar density
- Mixed localization in settings (password toggle, Save button)
- Disabled actions without explanation (contacts, security)
- Reply/forward blank composer
- Draft autosave contradictory states
- Draft opens in read-only view
- Important/flag menu state inconsistency
- Thread body left gutter on mobile
- AI compose backdrop blocking controls
- Dashboard AI briefing consent gate
- Profile page localization
- Follow-up board mobile kanban -> single lane
- Analytics consent gate (partial)

---

## Feature Dependencies

```
Authorization (Domain 3)
  |
  +---> CRM (Domain 1) -- CRM needs permission checks on CRUD
  |
  +---> Workflow Engine (Domain 2) -- Rules must respect permissions
  |
  +---> AI Control Plane (Domain 4) -- AI tools must check user permissions
  |
  +---> AI Control Plane (Domain 4)
          |
          +---> CRM AI Tools (Domain 1 differentiator) -- New tools need governance first

OpenTelemetry (Domain 5) -- Independent, no blockers

MUI Chat Migration (Domain 6) -- Independent, no blockers

UI/UX Fixes (Domain 7) -- Independent, no blockers

HITL Contract Unification (Domain 4 table stake)
  |
  +---> Tool Execution Governance (Domain 4) -- Can't fix tools until HITL contract is stable
          |
          +---> Memory Repair (Domain 4) -- Memory is a tool; governance must be settled first
                  |
                  +---> Prompt/Runtime Alignment (Domain 4) -- Don't tune prompt until tools/memory work
                          |
                          +---> Legacy Chat Removal (Domain 4) -- Remove old code last
```

---

## MVP Recommendation

### Must ship (table stakes across all domains):

1. **AI Control Plane: HITL + Tool Governance** -- Structural safety fixes. Ship first or everything built on top is unsafe. Blocks CRM AI tools and workflow policy enforcement.

2. **Authorization: @RequirePermission + PermissionGate** -- Implement the already-designed PolicyService interface. Every new feature (CRM, workflows) needs this from day one.

3. **CRM: Account + Deal + Pipeline + Activity** -- Core data model and CRUD. Activity auto-capture from existing email/calendar. Deal board (Kanban). No AI tools yet.

4. **AI Control Plane: Memory repair + Prompt alignment + Legacy removal** -- Complete the remediation roadmap once HITL/governance is stable.

5. **OpenTelemetry: Bootstrap + HTTP + AI spans** -- Independent work that adds visibility across all other features.

6. **Workflow Engine: Simple trigger-condition-action rules** -- NOT the visual editor. Form-based rule builder with 10-15 built-in actions. Policy-aware execution.

### Defer:

- **AI deal scoring** (High complexity, needs CRM data maturity)
- **Visual workflow editor** (Phase 4; form-based rules first)
- **Token budget enforcement** (needs usage baseline)
- **AI action rollback** (focus on prevention via HITL, not reversal)
- **Custom CRM fields** (Phase 4)
- **MUI Chat CSS migration** (independent; can run in parallel but lower priority than structural fixes)
- **Admin users mobile responsive** (lower risk than structural domains)

### Ordering rationale:

Authorization must be built before CRM and workflows because both need permission enforcement from the start. Retrofitting permissions onto shipped features creates security gaps. AI control plane must be fixed before adding CRM AI tools because the tool registry and HITL lifecycle are currently broken. OpenTelemetry is independent and can run in parallel with any phase. UI/UX fixes are low-complexity items that can fill gaps between major features.

---

## Sources

- Salesforce/HubSpot/Pipedrive CRM data models: [CRM Data Management 2026](https://monday.com/blog/crm-and-sales/crm-data-management/), [Pipeline Management Best Practices](https://www.outreach.io/resources/blog/sales-pipeline-management-best-practices)
- Workflow automation trends: [AI Workflow Automation Trends 2026](https://kissflow.com/workflow/7-workflow-automation-trends-every-it-leader-must-watch-in-2025/), [CRM Trends 2026-2027](https://www.4crms.com/blog/crm-trends-2026-2027)
- NestJS authorization patterns: [NestJS Auth 2026: Stop Shipping Roles](https://medium.com/@bhagyarana80/nestjs-auth-in-2026-stop-shipping-roles-9f94d3a2c8b6), [CASL with Prisma ORM](https://blog.devgenius.io/mastering-complex-rbac-in-nestjs-integrating-casl-with-prisma-orm-for-granular-authorization-767941a05ef1), [NestJS Authorization Docs](https://docs.nestjs.com/security/authorization)
- HITL patterns: [Human-in-the-Loop Agentic AI 2026](https://onereach.ai/blog/human-in-the-loop-agentic-ai-systems/), [HITL Patterns in AWS](https://nxgcloud.com/2026/03/12/mastering-human-in-the-loop-hitl-patterns-in-aws-agentic-ai-workflows/), [IBM HITL](https://www.ibm.com/think/topics/human-in-the-loop)
- Internal: AI Agent Remediation Roadmap (2026-03-15), UI/UX Audit (2026-03-12), Transformation Roadmap, PROJECT.md
