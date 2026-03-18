# Project Research Summary

**Project:** PMSync v6.0 — Enterprise Platform & AI Governance
**Domain:** AI-powered email CRM with workflow automation, enterprise authorization, distributed tracing, and AI control plane hardening
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

PMSync v6.0 is a multi-tenant SaaS platform already shipping email client, AI chat, calendar sync, contacts, and RBAC auth. The v6.0 milestone transforms it from a smart email tool into an enterprise-grade CRM with workflow automation, resource-scoped authorization, and production-quality observability. The research consensus is clear: the existing modular monolith architecture is correct and no topology change is needed. All six expansion areas (CRM, workflow engine, authorization, OpenTelemetry, AI control plane hardening, and MUI chat migration) integrate as new NestJS modules or extensions to existing ones, following patterns already established in the codebase.

The most important finding across all four research dimensions is a hard dependency chain that dictates build order. Authorization must come before CRM and workflows because both need permission enforcement from day one — retrofitting permissions onto shipped features creates exploitable security gaps. The workflow engine in particular becomes a privilege escalation vector if it can invoke AI tools outside the HITL approval path. AI control plane remediation (HITL contract unification, tool governance, memory repair) must precede any new AI tooling, including CRM tools, because the registry and approval lifecycle are currently structurally broken per the 2026-03-15 remediation roadmap. OpenTelemetry is the one fully independent infrastructure item and can run in parallel with any phase.

The key risk is feature interaction complexity: the three-way combination of CRM, workflow automation, and AI governance creates dangerous silent failure modes if any link in the chain is missing. The research recommendation is to ship and stabilize each system independently before testing their interaction, and to treat "AI-powered CRM workflow automation" as the final integration deliverable, not a phase-1 demo target. Minimum viable package additions are 7 backend OTel packages and 1 frontend package (`@xyflow/react`), where the latter is explicitly deferred to the visual workflow editor phase and not needed for v6.0 initial workflow delivery.

## Key Findings

### Recommended Stack

The existing stack requires almost no new dependencies. Better-auth's built-in `createAccessControl` from `better-auth/plugins/access` handles resource-scoped RBAC without adding an authorization library. CRM entities are pure Prisma models with no CRM framework. The workflow engine runs on existing BullMQ infrastructure. The only net-new packages are 7 OpenTelemetry packages for distributed tracing (backend only) and `@xyflow/react` for the visual workflow editor — which FEATURES.md explicitly defers to Phase 4, meaning it is not needed for v6.0 workflow rules.

**Core technologies:**
- `@opentelemetry/sdk-node` + 6 companion packages: distributed tracing via bootstrap pattern (--require flag, not NestJS module) — required because OTel must instrument before NestJS loads or it misses early HTTP calls
- `better-auth/plugins/access` (built-in, no install): resource-scoped RBAC extending existing org roles — avoids introducing a second auth library alongside better-auth
- Prisma 7 (existing): 9 new models for CRM (6) and Workflow (3) entities, all using `@@id([id, tenantId])` composite keys
- BullMQ (existing): workflow step execution as one-job-per-step with durable retries — no new workflow infrastructure needed
- `@xyflow/react` (deferred to visual editor phase): form-based rules ship first; visual editor is Phase 4 material

**What NOT to add:** `nestjs-otel` (delays OTel init past NestJS bootstrap, defeating the purpose), `casl`/`casbin` (better-auth createAccessControl already covers this), `temporal-sdk` (requires separate server; overkill for 20 action types), `@mui/x-data-grid` (MUI X license cost; standard MUI Table is sufficient for CRM lists).

### Expected Features

Full feature inventory is in `.planning/research/FEATURES.md`.

**Must have (table stakes):**
- HITL contract unification + tool execution governance — structural safety fix; blocks everything downstream that touches AI tools
- `@RequirePermission` decorator + `PermissionGuard` + Redis-cached `PermissionService` (backend); `PermissionGate` + `usePermission()` (frontend)
- CRM: Account, Deal, Pipeline, Stage, Activity entities with CRUD API and Kanban deal board (reusing @dnd-kit)
- Activity auto-capture from existing email/calendar domain events — mandatory for email-native CRM; manual logging kills adoption
- Workflow engine: trigger-condition-action rules with BullMQ-backed execution and policy-aware step execution
- OpenTelemetry: bootstrap + HTTP spans + BullMQ trace propagation + AI call spans
- AI memory repair + prompt/runtime alignment + legacy chat surface removal (remediation phases 3-5)

**Should have (differentiators):**
- AI deal summary tool (chat tool against Activity timeline)
- CRM insights in existing AI daily briefing ("3 deals closing this week")
- HITL approval audit trail linked to AI Run Ledger
- AI tool permission enforcement (AI cannot exceed user's own permissions)
- Workflow execution history UI
- HITL approval timeout with auto-reject

**Defer:**
- AI deal scoring (needs CRM data maturity baseline before modeling works)
- Visual workflow node editor with `@xyflow/react` (form-based rules first; visual editor is Phase 4)
- AI-suggested automations and natural language rule creation via chat
- Token budget enforcement and per-user cost caps (needs usage baseline data)
- AI action rollback registry (HITL prevention is the strategy, not reversal)
- Custom CRM fields, forecasting, products/line items, territory management

### Architecture Approach

The system stays a modular monolith. Four new NestJS modules are added: `AuthorizationModule` (@Global, permission evaluation + Redis cache), `CrmModule` (split into 4 sub-modules: Accounts, Deals, Pipelines, Activities), `WorkflowModule` (engine, BullMQ workers, action registry), and `TracingModule` (@Global, OTel bootstrap wrapper). Existing modules modified: `AiChatModule` (HITL contract unification, extraction of `ToolExecutorService` and new `ToolGovernanceService`), `ToolRegistryModule` (IAiTool interface extended with riskLevel/requiresApproval/domain/inputSchema/outputSchema), `ContactsModule` (Account-Contact linking), and all controllers (add `@RequirePermission` decorators to write/delete endpoints).

**Major components:**
1. `AuthorizationModule` — global permission evaluation over better-auth org roles; Redis 5-min TTL cache per userId:orgId; config-based permission map (no custom Permission DB table needed at current scale)
2. `CrmModule` — 6 new Prisma models with composite PKs; self-registers CrmTool via ToolRegistry on init; uses EventEmitter2 `@OnEvent` for activity auto-generation; never imported by Email or Calendar modules
3. `WorkflowModule` — 3 new Prisma models; BullMQ one-job-per-step execution; ActionRegistryService maps action type strings to executors; every step calls PermissionService before execution
4. `TracingModule` — OTel SDK bootstrapped via `--require` flag before NestJS; custom spans for AI calls; `traceparent` serialized into every BullMQ job payload via TracedJobData wrapper
5. `ToolGovernanceService` (new, inside AiChatModule) — single execution path for both chat and workflow tool calls; evaluates tool.requiresApproval + user permissions + riskLevel; returns EXECUTE | REQUIRE_APPROVAL | DENY
6. `PermissionGuard` — applied per-controller following existing RolesGuard pattern, NOT as APP_GUARD; returns true when no @RequirePermission metadata present for backward compatibility

### Critical Pitfalls

Full pitfall inventory is in `.planning/research/PITFALLS.md`. Top 5:

1. **CRM models without composite PKs** — Every new CRM model MUST use `@@id([id, tenantId])`. Omitting this silently breaks the Prisma tenant-scoping extension and creates cross-tenant data leakage. Simple `@id` on new models is a security breach, not a minor oversight.

2. **Workflow BullMQ jobs losing tenant context** — Chained workflow steps must serialize `tenantId` + `userId` into every `WorkflowJobData` payload and restore context in every worker. Using `withoutTenantScopingAsync` as a workaround is unacceptable in new modules; treat it as a lint error for CRM and workflow code specifically.

3. **PermissionGuard inserted as APP_GUARD in wrong chain position** — Follow the existing `RolesGuard` pattern (per-controller). If global, must be inserted AFTER ConsentGuard. A misplaced guard either sees no `request.user` (runs before BetterAuthGuard) or bypasses consent checks (runs before ConsentGuard).

4. **OTel auto-instrumentation corrupting AI SSE streaming** — `@opentelemetry/auto-instrumentations-node` tries to buffer response bodies, which corrupts chunked SSE transfer encoding. Use selective instrumentation; exclude AI streaming endpoints from HTTP response body capture; create custom spans for AI calls.

5. **AI control plane work colliding with in-progress HITL refactor** — Adding tool governance metadata to a DTO shape that is about to be replaced creates semantically dangerous merge conflicts that both compile but behave incorrectly. Complete HITL contract unification (remediation Phase 1) before adding governance fields to IAiTool.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — Authorization + AI Control Plane Remediation (Phases 1-2)

**Rationale:** These are the two highest-priority items with the most downstream dependencies. Authorization is a prerequisite for CRM and workflows. AI HITL unification is a prerequisite for tool governance and any new AI tooling. Both are parallelizable within this phase; neither blocks the other.

**Delivers:** `@RequirePermission` decorator + `PermissionGuard` + `PermissionService` with Redis caching (backend); `PermissionGate` + `usePermission()` hook (frontend); unified HITL contract with real execution outcomes; `IAiTool` extended with governance metadata; `ToolGovernanceService` as single execution path for chat and workflow tool calls.

**Addresses:** Authorization table stakes (all 6 items), AI control plane table stakes items 1-2 (HITL contract, tool governance, action taxonomy fix).

**Avoids:** Pitfall 3 (guard chain breakage), Pitfall 5 (HITL collision), Pitfall 8 (workflow HITL bypass later), Integration landmine: CRM + Authorization.

**Research flag:** Standard NestJS patterns — no additional research needed. better-auth org plugin docs are HIGH confidence.

### Phase 2: Observability — OpenTelemetry Distributed Tracing

**Rationale:** Independent infrastructure with no business logic dependencies. Can start in parallel with Phase 1 but listed separately because it touches every module via auto-instrumentation and must be validated before CRM and workflow add more code paths.

**Delivers:** OTel SDK bootstrapped via `--require`; HTTP + Prisma auto-instrumentation; custom BullMQ trace propagation via TracedJobData; custom AI streaming spans; traceId in response headers; OTLP export configured.

**Addresses:** OpenTelemetry table stakes (all 6 items), AI run ledger linked to traces (differentiator).

**Avoids:** Pitfall 4 (SSE streaming corruption), Pitfall 10 (trace context lost at BullMQ boundary).

**Research flag:** The `@appsignal/opentelemetry-instrumentation-bullmq` package is MEDIUM confidence — verify it works with the current BullMQ version before committing. Manual BullMQ span injection via TracedJobData is the confirmed fallback.

### Phase 3: CRM Domain — Accounts, Deals, Pipelines, Activities

**Rationale:** Depends on Phase 1 authorization. CRM controllers need `@RequirePermission` from day one. CRM AI tools need the unified `IAiTool` interface and `ToolGovernanceService` from Phase 1. Do not ship CRM before both are in place.

**Delivers:** 6 new Prisma models with composite PKs; `CrmModule` split into 4 sub-modules from day one (CrmAccounts, CrmDeals, CrmPipelines, CrmActivities); deal Kanban board reusing @dnd-kit; activity auto-capture via domain events; CrmTool self-registered in ToolRegistry; CRM navigation + i18n in en/it.

**Addresses:** CRM table stakes (all 10 items), AI deal summary and briefing insights (differentiators).

**Avoids:** Pitfall 1 (composite PK omission), Pitfall 7 (N+1 on activity timeline — batch FK resolution from start), Pitfall 11 (CRM kanban must use its own Zustand slice and `['crm', 'pipeline', ...]` query keys), Pitfall 12 (no withoutTenantScopingAsync in new modules), Pitfall 13 (god module — split into 4 sub-modules).

**Research flag:** Standard NestJS/Prisma patterns — no additional research needed.

### Phase 4: AI Remediation Completion — Memory Repair + Prompt Alignment + Legacy Removal

**Rationale:** AI remediation phases 3-5 depend on the unified HITL contract (Phase 1) being stable. Memory repair cannot be done while the HITL DTO is still in flux. Prompt alignment is meaningless until tools work correctly. Legacy removal is always last.

**Delivers:** Unified vector store for save_memory and retrieval; real timezone/locale/provider in system prompt; frontend renderers for `ask_user` and `save_memory` tools; deletion of dead chat endpoints and compatibility shims.

**Addresses:** AI control plane table stakes items 3-6 (memory repair, prompt alignment, legacy removal, runtime context injection).

**Avoids:** Pitfall 5 (HITL collision — resolved in Phase 1 before this phase begins).

**Research flag:** Memory unification approach (AIMemory.vector vs embeddings table) needs a brief codebase audit at the start of this phase. The research identifies the problem but not which store to canonicalize on — this requires reading the two service implementations.

### Phase 5: Workflow Automation Engine

**Rationale:** Depends on Phase 1 (authorization for step permission checks) and Phase 3 (CRM actions in ActionRegistry). Cannot ship before both are stable because workflow-as-privilege-escalation is the highest-risk integration pitfall in the entire v6.0 scope.

**Delivers:** `WorkflowModule` with 3 Prisma models; BullMQ one-job-per-step execution engine; ActionRegistryService with 8+ initial action types (send_email, update_deal_stage, add_label, ai_generate_draft, etc.); Workflow CRUD API + execution history; policy-aware step execution; form-based rule builder UI (NOT the visual node editor).

**Addresses:** Workflow table stakes (all 6 items), workflow templates differentiator (5-10 pre-built templates).

**Avoids:** Pitfall 2 (BullMQ tenant context loss — WorkflowJobData mandates tenantId), Pitfall 8 (HITL bypass — workflow steps use same ToolGovernanceService as chat), Integration landmine: Workflow + AI Control Plane.

**Research flag:** Async HITL approval design for BullMQ-executed workflow steps is unresolved and needs an explicit design decision before implementation. Synchronous approval (chat) has a waiting user; async approval (workflow steps) does not. Two modes required: (1) pre-approve at rule creation time, or (2) queue for async approval at execution time with notification. This must be decided before Phase 5 planning begins.

### Phase 6: MUI Chat CSS Migration + UI/UX Fixes

**Rationale:** Independent of all other phases. Lower business priority than structural features. Kept last to avoid concurrent changes to the chat surface during AI remediation work in Phase 4.

**Delivers:** Command Palette rebuilt in MUI Dialog + List (Wave 3); chat CSS migrated from 3 CSS files (~950 lines) to MUI `sx` props, explicitly excluding the streaming message container (Wave 4); `tailwind-merge` and `ChatThemeBridge` removed; 5 unfixed UI/UX audit items resolved (admin users mobile table, demo task content removal, analytics consent/localization, password autocomplete semantics, chart dimension warning).

**Addresses:** MUI Chat Migration table stakes (all 4 items), UI/UX audit unfixed findings (all 5 items).

**Avoids:** Pitfall 6 (streaming UI performance regression — streaming container stays as static CSS), Pitfall 14 (theme inconsistency — use theme semantic tokens, never raw hex/hsl in sx props).

**Research flag:** No additional research needed. Performance validation using Chrome DevTools Performance panel during AI streaming is mandatory before declaring Wave 4 complete.

### Phase Ordering Rationale

- Authorization precedes CRM and workflow because retrofitting permissions is harder to get right and creates audit-period security gaps.
- AI control plane remediation (HITL + governance) precedes CRM AI tools because adding tools to a broken registry and broken HITL lifecycle compounds the structural problems.
- OTel has no business logic dependencies and can run in parallel with Phase 1, but benefits from being complete before CRM and workflow add request volume.
- CRM precedes workflow because CRM actions (update_deal_stage, create_activity) must exist in the ActionRegistry before workflow rules can reference them.
- AI remediation completion (memory, prompt, legacy) runs after HITL is stable (Phase 1) and can overlap with CRM (Phase 3) since they touch different files.
- MUI migration is last because it touches the chat surface that AI remediation also touches — sequencing avoids concurrent changes to the same components.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (OTel):** Validate `@appsignal/opentelemetry-instrumentation-bullmq` compatibility with current BullMQ version before committing. MEDIUM confidence only. Test SSE streaming empirically after adding OTel.
- **Phase 4 (AI Memory):** Brief codebase audit needed at phase start to determine which vector store to canonicalize on (AIMemory.vector vs embeddings table).
- **Phase 5 (Workflow + AI):** Async HITL approval design for BullMQ-executed workflow steps is unresolved. Needs explicit design decision before implementation — this is not a standard pattern.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Authorization):** better-auth org plugin + NestJS guard patterns are well-documented and HIGH confidence.
- **Phase 3 (CRM):** Pure Prisma + NestJS module following existing patterns. No novel integration points.
- **Phase 6 (MUI Migration):** Known scope, established patterns, no external dependencies.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Minimal new dependencies; all recommendations backed by official docs. BullMQ OTel instrumentation is the one MEDIUM item. |
| Features | HIGH | Derived from internal audit docs, existing codebase analysis, and established CRM/workflow SaaS patterns. Anti-features are explicitly justified. |
| Architecture | HIGH | Based on direct codebase analysis (43 existing models, guard chain ordering, module patterns). No guesswork about existing wiring. |
| Pitfalls | HIGH | Almost all pitfalls derived from existing audit docs (AUDIT.md, CTO report, AI remediation roadmap) plus direct codebase analysis of the tenant-scoping extension. Not speculative. |

**Overall confidence:** HIGH

### Gaps to Address

- **Async HITL for workflow execution:** The research identifies that synchronous approval (chat) and async approval (workflow) need different modes, but does not define the exact DTO shape or BullMQ queue design for async approval. Resolve before Phase 5 planning.
- **Memory store canonicalization:** Two vector stores exist (AIMemory.vector and embeddings table). Research identifies the problem but not which to keep. Requires a 30-minute codebase read at the start of Phase 4 before any implementation.
- **OTel sampling strategy:** Research recommends less than 100% sampling in production but does not specify rates or head-vs-tail sampling approach. Low urgency — document as a post-Phase 2 tuning item, not a blocker.
- **withoutTenantScopingAsync expansion audit:** 50 existing usages are grandfathered. Before Phase 3 and 5 ship, confirm no new usages have crept into CRM or workflow code. Consider an ESLint rule for new modules.
- **CRM Activity write volume at scale:** Auto-generation from every email/calendar event could create high write volume for active accounts. May need BullMQ batching if activity writes become a bottleneck. Low urgency at current user scale.

## Sources

### Primary (HIGH confidence)
- `docs/AUDIT.md` — Architecture and security audit, guard chain ordering, anti-patterns
- `docs/AI_AGENT_REMEDIATION_ROADMAP_2026-03-15.md` — AI control plane phases 0-6, structural problem definitions
- `docs/CTO_PLATFORM_ENGINEERING_REPORT_2026-03-09.md` — Engineering debt, oversized modules, N+1 findings
- `docs/TRANSFORMATION_ROADMAP.md` — Observability gap (6/10 score), phase structure
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) — OTel bootstrap pattern
- [OpenTelemetry JS SDK 2.0](https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/) — Version compatibility
- [BullMQ Telemetry Docs](https://docs.bullmq.io/guide/telemetry/getting-started) — BullMQ OTel integration approach
- [better-auth Organization Plugin](https://better-auth.com/docs/plugins/organization) — createAccessControl API

### Secondary (MEDIUM confidence)
- [AppSignal BullMQ OTel Instrumentation](https://github.com/appsignal/opentelemetry-instrumentation-bullmq) — BullMQ auto-instrumentation
- [better-auth Access Control Tutorial](https://www.premieroctet.com/blog/en/better-auth-structure-and-permissions-with-the-organization-plugin) — Permission mapping patterns
- [SigNoz OTel NestJS Guide](https://signoz.io/blog/opentelemetry-nestjs/) — NestJS-specific OTel wiring
- [NestJS Auth 2026: Stop Shipping Roles](https://medium.com/@bhagyarana80/nestjs-auth-in-2026-stop-shipping-roles-9f94d3a2c8b6) — RBAC+ patterns

### Tertiary (LOW confidence)
- CRM industry benchmarks (HubSpot/Pipedrive/Salesforce data models) — Used to validate table stakes feature list; no implementation risk from these sources

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
