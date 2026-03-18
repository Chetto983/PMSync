# Technology Stack

**Project:** PMSync v6.0 -- Enterprise Platform & AI Governance
**Researched:** 2026-03-18

## Existing Stack (DO NOT re-add)

These are already installed and working. Listed for reference to prevent duplication.

| Technology | Package | Purpose |
|------------|---------|---------|
| NestJS 11 | `@nestjs/common`, `@nestjs/core` | Backend framework |
| Prisma 7 | `@prisma/client`, `prisma` | ORM + migrations |
| BullMQ | `bullmq` | Job queues |
| Redis | `ioredis`, `redis` | Cache, pub/sub, locks |
| Socket.IO | `socket.io`, `@socket.io/redis-adapter` | Real-time |
| prom-client | `prom-client`, `@willsoto/nestjs-prometheus` | Prometheus metrics |
| AI SDK v6 | `ai`, `@ai-sdk/mistral`, `@ai-sdk/react` | LLM orchestration |
| assistant-ui | `@assistant-ui/react`, `@assistant-ui/react-ai-sdk` | Chat frontend |
| MUI 7 | `@mui/material`, `@mui/icons-material` | UI components |
| better-auth | `better-auth`, `@thallesp/nestjs-better-auth` | Auth framework |
| TanStack Query 5 | `@tanstack/react-query` | Server state |
| Zustand 5 | `zustand` | Client state |
| Zod 4 | `zod` | Validation |
| EventEmitter2 | `@nestjs/event-emitter` | Domain events |
| @dnd-kit | `@dnd-kit/core`, `@dnd-kit/sortable` | Drag-and-drop |

---

## New Stack Additions

### 1. OpenTelemetry Distributed Tracing

**Why:** The project has Prometheus metrics (prom-client) but zero distributed tracing. HTTP -> BullMQ -> AI -> Provider call chains are invisible. The TRANSFORMATION_ROADMAP scores observability 6/10 specifically because of this gap.

**Approach:** Use the official `@opentelemetry/sdk-node` with auto-instrumentation, not a NestJS-specific wrapper. OTel must instrument before NestJS bootstraps (Node.js `--require` or top-of-file import), so NestJS module wrappers like `nestjs-otel` add abstraction without value. The bootstrap file pattern is the standard approach.

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `@opentelemetry/sdk-node` | `^0.213.0` | Core SDK (Node.js convenience package) | HIGH |
| `@opentelemetry/api` | `^1.9.0` | API surface for manual spans | HIGH |
| `@opentelemetry/auto-instrumentations-node` | `^0.61.0` | HTTP, Express, pg, ioredis auto-instrumentation | HIGH |
| `@opentelemetry/exporter-trace-otlp-http` | `^0.213.0` | OTLP exporter (works with Jaeger, Grafana Tempo, etc.) | HIGH |
| `@opentelemetry/resources` | `^2.0.0` | Service resource attributes | HIGH |
| `@opentelemetry/semantic-conventions` | `^1.30.0` | Standard attribute names | HIGH |
| `@appsignal/opentelemetry-instrumentation-bullmq` | `^0.7.3` | BullMQ queue/worker auto-instrumentation | MEDIUM |

**Why NOT `nestjs-otel` or `@metinseylan/nestjs-opentelemetry`:**
- OTel SDK must initialize before any NestJS module loads (it monkey-patches `http`, `pg`, etc.)
- NestJS wrappers delay initialization to module load time, missing early HTTP calls
- The bootstrap file pattern (`tracing.ts` loaded via `--require`) is the canonical approach from OpenTelemetry docs
- NestJS-specific span decoration (controller/guard/pipe names) can be added manually with `@opentelemetry/api` in a NestJS interceptor

**Coexistence with prom-client:**
- Keep prom-client for Prometheus metrics (already wired to `/metrics`)
- OTel handles TRACES only; do not replace prom-client with OTel metrics yet
- Later: consider OTel metrics export to Prometheus via `@opentelemetry/exporter-prometheus` if consolidation desired

**Installation:**

```bash
cd backend
npm install @opentelemetry/sdk-node @opentelemetry/api @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions @appsignal/opentelemetry-instrumentation-bullmq
```

**Sources:**
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) -- HIGH confidence
- [OpenTelemetry JS SDK 2.0 Announcement](https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/) -- HIGH confidence
- [AppSignal BullMQ Instrumentation](https://github.com/appsignal/opentelemetry-instrumentation-bullmq) -- MEDIUM confidence
- [BullMQ Telemetry Docs](https://docs.bullmq.io/guide/telemetry/getting-started) -- HIGH confidence

---

### 2. Authorization (Resource-Scoped Permissions on better-auth)

**Why:** Current auth is coarse RBAC (owner/admin/member roles). CRM needs resource-level permissions (e.g., `deals:delete` only for admins, `contacts:write` for members). The `IPolicyService` interface and `Permission` enum exist in `backend/src/common/interfaces/policy-service.interface.ts` but have no runtime implementation.

**Approach:** Use better-auth's built-in `createAccessControl` from `better-auth/plugins/access`. This is already part of the installed `better-auth@^1.5.4` -- no new package needed.

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| *(none new)* | -- | `createAccessControl` is in `better-auth/plugins/access` | HIGH |

**What to build (no new packages):**
1. Shared `access-control.ts` defining resources + actions via `createAccessControl`
2. Custom roles via `ac.newRole()` extending the 3 default org roles
3. `@RequirePermission('deals:write')` NestJS decorator using `auth.api.hasPermission()`
4. `PolicyService` implementation wrapping better-auth access control (fulfills existing `IPolicyService` interface)
5. Frontend `usePermission()` hook calling `authClient.organization.hasPermission()`
6. Frontend `<PermissionGate permission="deals:write">` component
7. Redis cache layer (5min TTL) for permission checks in hot paths

**CRM permission additions to existing taxonomy:**

```typescript
const statement = {
  // Existing resources (from Permission enum in policy-service.interface.ts)
  email: ["read", "write", "delete", "send"],
  ai: ["chat", "briefing", "triage", "draft", "runs:read", "runs:export"],
  calendar: ["read", "write", "delete"],
  contacts: ["read", "write", "delete", "export"],
  admin: ["users", "billing", "audit", "settings"],
  // NEW CRM resources
  accounts: ["read", "write", "delete"],
  deals: ["read", "write", "delete", "reassign"],
  pipelines: ["read", "write", "delete"],
  activities: ["read", "write", "delete"],
  workflows: ["read", "write", "delete", "execute"],
} as const;
```

**Sources:**
- [better-auth Organization Plugin Docs](https://better-auth.com/docs/plugins/organization) -- HIGH confidence
- [better-auth Access Control Tutorial](https://www.premieroctet.com/blog/en/better-auth-structure-and-permissions-with-the-organization-plugin) -- MEDIUM confidence

---

### 3. CRM Domain (Accounts, Deals, Pipelines, Activities)

**Why:** Core v6.0 feature. Extends existing contacts module into full CRM.

**Approach:** Pure Prisma models + NestJS modules. No CRM framework or external library.

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| *(none new)* | -- | Prisma models, NestJS services, existing patterns | HIGH |

**What to build (no new packages):**
- `CrmModule` with `AccountsService`, `DealsService`, `PipelinesService`, `ActivitiesService`
- Prisma models: `Account`, `Deal`, `Pipeline`, `PipelineStage`, `Activity`
- Link `Contact` <-> `Account` via M:N join table (`ContactAccount`)
- Auto-generate `Activity` records from email/calendar domain events (existing EventEmitter2)
- AI tools: `search_accounts`, `search_deals`, `create_deal`, `update_deal_stage`, `log_activity`

**Frontend (no new packages):**
- MUI DataGrid patterns for accounts/deals lists (MUI 7 already installed)
- Deals Kanban board: reuse existing `@dnd-kit/core` + `@dnd-kit/sortable` (already installed)

---

### 4. Workflow Automation Engine

**Why:** Phase 4 of the transformation roadmap. User-defined rules with policy-aware execution.

**Approach:** Build internally on BullMQ + Prisma for backend. Use `@xyflow/react` for visual editor.

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `@xyflow/react` | `^12.10.0` | Visual node editor for workflow builder | HIGH |

**Why NOT Temporal, n8n, or Inngest:**
- Temporal requires a separate server infrastructure; overkill for 20 built-in actions
- n8n and Inngest are platforms, not embeddable libraries
- The workflow engine scope is limited: trigger -> condition -> action chains, not arbitrary code execution
- BullMQ already provides durable job execution with retries and compensation

**Backend (no new packages):**
- Prisma models: `Workflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowRunStep`
- `WorkflowEngineService`: state machine evaluator using BullMQ for durable execution
- `ActionRegistryService`: typed action catalog (email, AI, CRM, calendar, webhook)
- Policy integration: each step checked against `PolicyService` before execution

**Frontend:**
- `@xyflow/react` for the visual node editor (drag-and-drop workflow builder)
- Nodes are React components, styled with MUI `sx` props
- Already have `@dnd-kit` for action palette drag interactions

**Why `@xyflow/react` specifically:**
- De facto standard for node-based UIs in React (97K+ GitHub stars)
- Used by major workflow builders (n8n's editor uses it)
- MIT licensed, actively maintained (v12.10.1, March 2026)
- Works with any styling system (MUI, CSS, etc.)

**Installation:**

```bash
cd frontend
npm install @xyflow/react
```

**Sources:**
- [@xyflow/react npm](https://www.npmjs.com/package/@xyflow/react) -- HIGH confidence
- [xyflow GitHub](https://github.com/xyflow/xyflow) -- HIGH confidence

---

### 5. AI Control Plane Hardening

**Why:** AI_AGENT_REMEDIATION_ROADMAP identifies 4 structural problems: HITL contract inconsistency, tool execution governance gaps, memory write/retrieval disconnect, and legacy chat surface drift.

**Approach:** Architecture refactoring, not new libraries. The problems are internal contract misalignment.

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| *(none new)* | -- | All work is refactoring existing code | HIGH |

**What changes (no new packages):**
1. **HITL Contract Unification:** Normalize pending-actions DTO, make approve endpoint return execution outcome (approved_only / executed / failed)
2. **Tool Execution Governance:** Extend `IAiTool` interface with `riskLevel`, `requiresApproval`, `domain` metadata. Fix action-to-tool mapping mismatches (e.g., `delete_event` -> `SCHEDULE_MEETING`). Contract tests per action type
3. **Memory Repair:** Unify `save_memory` and retrieval to same vector store (either `AIMemory.vector` or embeddings table, not both)
4. **Prompt/Runtime Alignment:** Pass real runtime context (timezone, locale, provider). Add missing frontend tool renderers for `ask_user`, `save_memory`
5. **Legacy Removal:** Delete dead chat endpoints, fake learning facade, old approval paths

**The existing `ToolRegistryService` needs extension, not replacement.** Add metadata fields to `IAiTool`:

```typescript
interface IAiTool {
  name: string;
  // NEW fields for governance
  domain: 'email' | 'calendar' | 'contacts' | 'crm' | 'ai' | 'system';
  riskLevel: 'read-only' | 'reversible-write' | 'persistent-mutation' | 'destructive';
  requiresApproval: boolean;
  inputSchema: ZodType;
  outputSchema: ZodType;
}
```

---

### 6. MUI Chat CSS Migration (Wave 3-4)

**Why:** Waves 1-2 complete (all Radix/shadcn packages removed, zero `@radix-ui` in package.json, `cmdk` gone). Wave 3 (Command Palette rebuild) and Wave 4 (chat CSS to MUI `sx`) remain.

**Approach:** No new packages. Convert 3 CSS files (~950 lines) to MUI styled components and `sx` props. Command Palette already rebuilt or needs rebuilding with MUI Dialog + List.

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| *(none new)* | -- | MUI 7 already installed | HIGH |

**Remaining CSS files to convert:**
- `chat-layout.css` (344 lines) -> MUI `Box`/`Stack` with `sx`
- `chat-thread.css` (501 lines) -> MUI `Paper`/`Typography` with `sx`
- `chat-sidebar.css` (100+ lines) -> MUI `Drawer`/`List` with `sx`

**After Wave 4 completes, REMOVE:**
- `tailwind-merge` from frontend dependencies (no Tailwind classes left)
- `ChatThemeBridge` component (CSS custom properties no longer consumed)
- Consider removing `tailwindcss` entirely if `@tailwind base` is no longer needed in globals.css

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Tracing | `@opentelemetry/sdk-node` (bootstrap) | `nestjs-otel` wrapper | OTel must init before NestJS; wrappers delay initialization |
| Tracing | `@opentelemetry/sdk-node` | Sentry Performance | Vendor lock-in; OTel is open standard with any backend |
| BullMQ tracing | `@appsignal/opentelemetry-instrumentation-bullmq` | Manual span creation | Auto-instrumentation is less maintenance |
| Authorization | `better-auth/plugins/access` (built-in) | CASL, Casbin, Permit.io | Already have better-auth with org plugin; adding another auth library creates dual-stack |
| Workflow engine | BullMQ + Prisma (custom) | Temporal | Temporal requires separate server infrastructure; overkill for 20 actions |
| Workflow engine | BullMQ + Prisma (custom) | Inngest | Platform service, not embeddable library |
| Workflow UI | `@xyflow/react` | Custom SVG/Canvas | Massive effort for standard functionality |
| CRM | Custom Prisma models | Twenty (open-source CRM) | External application, not an embeddable module |
| Chat CSS | MUI `sx` props | Keep CSS files | Inconsistent with MUI-only design system decision |

---

## Complete Installation Commands

### Backend (new dependencies only)

```bash
cd backend
npm install @opentelemetry/sdk-node @opentelemetry/api @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions @appsignal/opentelemetry-instrumentation-bullmq
```

### Frontend (new dependencies only)

```bash
cd frontend
npm install @xyflow/react
```

### Summary

| Area | New Backend Packages | New Frontend Packages |
|------|---------------------|----------------------|
| OpenTelemetry | 7 packages | 0 |
| Authorization | 0 (built-in to better-auth) | 0 |
| CRM | 0 | 0 |
| Workflow Engine | 0 | 1 (`@xyflow/react`) |
| AI Hardening | 0 | 0 |
| MUI Chat Migration | 0 | 0 |
| **Total** | **7** | **1** |

---

## What NOT to Add

| Package | Why people might suggest it | Why NOT for PMSync |
|---------|---------------------------|-------------------|
| `@nestjs/cqrs` | CRM event sourcing | Overkill; EventEmitter2 already handles domain events |
| `nestjs-otel` | NestJS OTel wrapper | OTel must init before NestJS bootstrap; wrapper adds no value |
| `casl` or `casbin` | Authorization library | better-auth `createAccessControl` already provides resource-scoped RBAC |
| `temporal-sdk` | Workflow durability | Requires Temporal server; BullMQ already provides durable execution |
| `inngest` | Event-driven workflows | SaaS platform, not a library; vendor lock-in |
| `xstate` | State machine for workflows | Additional abstraction over BullMQ job states; unnecessary complexity |
| `@sentry/nestjs` | Error tracking + tracing | Can add later for error tracking, but tracing should be OTel-native |
| `tailwind-merge` | Still in package.json | REMOVE after Wave 4 completes (no Tailwind classes will remain) |
| `@opentelemetry/sdk-metrics` | OTel metrics | prom-client already handles metrics well; don't create dual metrics stack |
| `@mui/x-data-grid` | Advanced data grid | Standard MUI `Table` + `TablePagination` sufficient for CRM lists; avoid MUI X license cost |

---

## Sources

- [OpenTelemetry Node.js Docs](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) -- HIGH confidence
- [OpenTelemetry JS SDK 2.0](https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/) -- HIGH confidence
- [@opentelemetry/sdk-node npm](https://www.npmjs.com/package/@opentelemetry/sdk-node) -- HIGH confidence
- [BullMQ Telemetry Docs](https://docs.bullmq.io/guide/telemetry/getting-started) -- HIGH confidence
- [AppSignal BullMQ OTel Instrumentation](https://github.com/appsignal/opentelemetry-instrumentation-bullmq) -- MEDIUM confidence
- [better-auth Organization Plugin](https://better-auth.com/docs/plugins/organization) -- HIGH confidence
- [better-auth Access Control Tutorial](https://www.premieroctet.com/blog/en/better-auth-structure-and-permissions-with-the-organization-plugin) -- MEDIUM confidence
- [@xyflow/react npm](https://www.npmjs.com/package/@xyflow/react) -- HIGH confidence
- [xyflow GitHub](https://github.com/xyflow/xyflow) -- HIGH confidence
- [SigNoz OTel NestJS Guide](https://signoz.io/blog/opentelemetry-nestjs/) -- MEDIUM confidence
