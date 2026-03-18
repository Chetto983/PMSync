# Roadmap: PMSync

## Milestones

- ✅ **v3.0 AI Intelligence & Scalability** - Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** - Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** - Phases 23-30 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** - Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** - Phases 42-49 (shipped 2026-03-06)
- ✅ **v5.0 better-auth Migration** - Phases 50-65 (shipped 2026-03-10)
- ✅ **v5.1 Test Coverage & Polish** - Phases 66-76 (shipped 2026-03-15)
- 🚧 **v6.0 Enterprise Platform & AI Governance** - Phases 77-85 (in progress)

## Phases

<details>
<summary>v3.0 AI Intelligence & Scalability (Phases 1-12) - SHIPPED 2026-02-09</summary>

Phases 1-12: VoltAgent audit, modern chat UI, priority scoring, follow-ups refactor, nested labels, chat UI on mail, chat improvements, email tool triage, artifact renderers, UI review, AI module audit, test fixes. 12 phases, 42 plans, 19/19 requirements.

</details>

<details>
<summary>v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) - SHIPPED 2026-02-27</summary>

Phases 13-22: PII tokenization, database encryption at rest, GDPR core compliance, data rights & legal, rich artifacts UI, AI triage & bulk ops, AI draft generation, GDPR guard mounting, triage prompt enrichment, bug audit. 10 phases, 31/32 requirements (ENC-03 deferred).

</details>

<details>
<summary>v3.2 AI Rebuild & Cleanup (Phases 23-30) - SHIPPED 2026-03-03 (partial)</summary>

Phases 23-28: SDK foundation, backend core pipeline, tools & RAG, non-chat AI, chat frontend, cleanup & VoltAgent deletion. 6 phases complete (20 plans). Phases 29-30 carried forward to v4.0.

</details>

<details>
<summary>v4.0 Enterprise Stabilization (Phases 31-41) - SHIPPED 2026-03-04</summary>

11 phases, 22 plans, 19/19 requirements. See `.planning/milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>v4.1 Security Hardening & Debt Reduction (Phases 42-49) - SHIPPED 2026-03-06</summary>

8 phases, 28 plans, 65/66 requirements. See `.planning/milestones/v4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>v5.0 better-auth Migration (Phases 50-65) - SHIPPED 2026-03-10</summary>

15 phases, 34 plans, 51/51 requirements.

</details>

<details>
<summary>v5.1 Test Coverage & Polish (Phases 66-76) - SHIPPED 2026-03-15</summary>

11 phases, 30 plans. Test infrastructure, backend unit/integration tests, frontend unit/E2E tests, MUI audit, test hardening, E2E runtime validation, org E2E fix, CI reliability gate. See `.planning/milestones/v5.1-ROADMAP.md` for full details.

</details>

### v6.0 Enterprise Platform & AI Governance (In Progress)

**Milestone Goal:** Harden AI control plane, add CRM domain, workflow automation, enterprise authorization, distributed tracing, and close all audit findings.

- [ ] **Phase 77: AI Control Plane -- HITL & Tool Governance** - Unify HITL contract, add tool governance metadata, fix action taxonomy, contract + E2E tests
- [ ] **Phase 78: Security Fixes** - BOLA fix, CSRF secret enforcement, /metrics restriction, HNSW vector indexes
- [ ] **Phase 79: Authorization** - Resource-scoped permissions on better-auth org roles, backend + frontend enforcement
- [ ] **Phase 80: OpenTelemetry** - Distributed tracing across HTTP, BullMQ, AI/Mistral call chains
- [ ] **Phase 81: CRM Domain** - Accounts, Deals, Pipelines, Activities with AI tool integration and daily briefing
- [ ] **Phase 82: AI Remediation Completion** - Memory repair, prompt/runtime alignment, legacy removal, tool validation tests
- [ ] **Phase 83: Workflow Automation** - Trigger-condition-action rules with BullMQ execution and policy-aware enforcement
- [ ] **Phase 84: MUI Chat Migration** - Command Palette rebuild, chat CSS to MUI sx, Tailwind removal
- [ ] **Phase 85: UI/UX Polish** - Email UI density, responsive fixes, empty states, accessibility audit items

## Phase Details

### Phase 77: AI Control Plane -- HITL & Tool Governance
**Goal**: AI tool execution has a single, correct approval lifecycle and every mutating tool declares its governance metadata
**Depends on**: Nothing (first phase of v6.0; absorbs in-progress HITL controller refactor)
**Requirements**: AICP-01, AICP-02, AICP-03, AICP-04, AICP-12, AICP-14
**Success Criteria** (what must be TRUE):
  1. Pending-actions endpoint returns a single canonical DTO shape for all pending approvals -- no variant shapes depending on tool type
  2. Approving or rejecting a pending action returns the real execution outcome (executed, failed, or approved_only) -- not just a 200 OK
  3. Every mutating AI tool in ToolRegistryService declares name, domain, riskLevel, requiresApproval, and inputSchema -- tools missing any field fail registration
  4. Action taxonomy maps every tool to a semantically correct action type (no mismatches like delete_event mapped to SCHEDULE_MEETING)
  5. Contract tests validate pending-actions DTO shape, approve/reject response, and HITL E2E flow (trigger, approve, execute, verify)
**Plans:** 3 plans
Plans:
- [ ] 77-01-PLAN.md -- Prisma migration, extended IAiTool interface, registry validation, governance metadata on all tools
- [ ] 77-02-PLAN.md -- Controller refactor (registry-based), DTO cleanup, frontend adaptation
- [ ] 77-03-PLAN.md -- Contract tests, registry governance assertions, E2E HITL flow tests

### Phase 78: Security Fixes
**Goal**: All known security audit findings from v5.1 are closed -- no BOLA, no CSRF fallback, no open /metrics, vector search is indexed
**Depends on**: Nothing (independent of Phase 77; can run in parallel)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. deleteConversation rejects requests where the conversation's userId does not match the authenticated user -- returns 403, not silent success
  2. Application refuses to start in production when CSRF_SECRET is not set -- no silent fallback to JWT_SECRET
  3. /metrics endpoint returns 401/403 for non-admin users and unauthenticated requests
  4. HNSW indexes exist on embeddings and ai_memories vector columns -- EXPLAIN ANALYZE confirms index scan, not sequential scan
**Plans**: TBD

### Phase 79: Authorization
**Goal**: Users experience permission-based access control -- org roles determine what actions are allowed across the entire application
**Depends on**: Phase 77 (ToolGovernanceService needs permission awareness), Phase 78
**Requirements**: AUTHZ-01, AUTHZ-02, AUTHZ-03, AUTHZ-04, AUTHZ-05, AUTHZ-06, AUTHZ-07
**Success Criteria** (what must be TRUE):
  1. A member-role user cannot access owner/admin-only endpoints (e.g., delete tenant, manage billing) -- returns 403 with clear error
  2. Permission checks resolve in under 5ms from Redis cache after first load -- cache invalidates within seconds of a role change
  3. Frontend UI hides or disables controls the current user lacks permission for (e.g., delete buttons hidden for members)
  4. Role-to-permission mapping is defined in one file -- changing a role's permissions requires editing exactly one place
  5. All write and delete API endpoints enforce permissions via @RequirePermission decorator -- undecorated write endpoints fail a CI/audit check
**Plans**: TBD

### Phase 80: OpenTelemetry
**Goal**: Every request can be traced from HTTP entry through queue processing to AI provider call -- with trace IDs visible in response headers
**Depends on**: Nothing (independent infrastructure; can run in parallel with Phases 77-79)
**Requirements**: OTEL-01, OTEL-02, OTEL-03, OTEL-04, OTEL-05, OTEL-06
**Success Criteria** (what must be TRUE):
  1. OTel SDK initializes before NestJS bootstrap -- early HTTP requests are captured, not missed
  2. A single user request that triggers a BullMQ job and an AI call produces one connected trace with spans for HTTP, queue processing, and AI provider call
  3. Response headers include a traceId that correlates to the backend trace for that request
  4. AI run ledger entries include the OTel traceId -- querying by traceId returns the matching AI cost/latency record
**Plans**: TBD

### Phase 81: CRM Domain
**Goal**: Users can manage accounts, deals, pipelines, and activities -- with AI chat integration and daily briefing insights
**Depends on**: Phase 79 (CRM controllers need @RequirePermission), Phase 77 (CRM AI tools need ToolGovernanceService)
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, CRM-06, CRM-07, CRM-08, CRM-09, CRM-10, CRM-11, CRM-12
**Success Criteria** (what must be TRUE):
  1. User can create an account, link contacts to it, create a deal on a pipeline, and drag the deal between stages on a Kanban board
  2. Sending or receiving an email automatically creates an activity on the linked account -- no manual logging required
  3. Calendar events with attendees matching known contacts auto-generate activities on the relevant account
  4. User can ask the AI chat "what deals are closing this week" and get accurate results from the CRM data
  5. Daily AI briefing includes CRM insights (deals closing soon, accounts with recent activity)
**Plans**: TBD

### Phase 82: AI Remediation Completion
**Goal**: AI memory, prompts, and transport are clean -- one vector store, correct runtime context, accurate tool renderers, no legacy code
**Depends on**: Phase 77 (HITL contract must be stable before memory/prompt work)
**Requirements**: AICP-05, AICP-06, AICP-07, AICP-08, AICP-09, AICP-10, AICP-11, AICP-13
**Success Criteria** (what must be TRUE):
  1. AI save_memory and memory retrieval use the same vector store -- saving a fact and retrieving it in a new conversation returns the saved content
  2. Memory retrieval is tenant-and-user-scoped -- user A cannot retrieve user B's memories, even within the same tenant
  3. System prompt accurately reflects available tools and the frontend renders every tool the AI can invoke (no phantom tools, no unrenderable results)
  4. AI responses reference the correct timezone, locale, and email provider for the current user -- not hardcoded defaults
  5. Only one chat streaming transport exists in the codebase -- legacy endpoints and compatibility shims are deleted
**Plans**: TBD

### Phase 83: Workflow Automation
**Goal**: Users can create event-driven automation rules that execute actions respecting permissions and HITL policies
**Depends on**: Phase 79 (workflow steps need permission checks), Phase 81 (CRM actions in action registry)
**Requirements**: WF-01, WF-02, WF-03, WF-04, WF-05, WF-06, WF-07, WF-08
**Success Criteria** (what must be TRUE):
  1. User can create a rule "when email received from VIP, apply label Priority and create activity on linked account" via a form-based builder
  2. Workflow rules execute via BullMQ with correct tenant context -- a rule in tenant A never touches tenant B data
  3. Workflow execution history shows each run with success/failure status and which actions were executed
  4. A workflow step that requires HITL approval (e.g., send_email) pauses and waits for approval before executing -- it does not bypass the AI approval path
  5. AI suggests automation rules based on repeated user behavior patterns (e.g., "you always label emails from X as Priority -- create a rule?")
**Plans**: TBD

### Phase 84: MUI Chat Migration
**Goal**: Chat UI uses MUI components exclusively -- no CSS files, no Tailwind, no ChatThemeBridge
**Depends on**: Phase 82 (chat surface changes should happen after AI remediation to avoid concurrent edits)
**Requirements**: MUI-01, MUI-02, MUI-03, MUI-04
**Success Criteria** (what must be TRUE):
  1. Command Palette opens as a MUI Dialog with MUI List items -- cmdk dependency is removed from package.json
  2. Chat layout uses MUI sx props -- the 3 chat CSS files (~950 lines) are deleted (streaming message container may retain minimal inline styles)
  3. ChatThemeBridge component/file no longer exists in the codebase
  4. tailwindcss package is removed from frontend package.json and no Tailwind config files remain
**Plans**: TBD

### Phase 85: UI/UX Polish
**Goal**: Email UI reaches professional density and all March 12 audit findings are resolved
**Depends on**: Nothing (independent; can run in parallel with Phases 83-84)
**Requirements**: EMUIX-01, EMUIX-02, EMUIX-03, EMUIX-04, EMUIX-05, EMUIX-06, UIUX-01, UIUX-02, UIUX-03, UIUX-04, UIUX-05
**Success Criteria** (what must be TRUE):
  1. Email list density, typography, and hover states match professional email clients (Superhuman/Outlook level) -- not generic MUI table
  2. Thread reading pane is visible and usable on tablet-width viewports (768px+) without requiring a separate navigation action
  3. Compose dialog renders correctly on mobile with safe area insets -- no content overflow or hidden send button
  4. Empty states are consistent across inbox, search, VIP, and folder views -- each shows an illustration and actionable message
  5. Admin users table switches to card layout below mobile breakpoint; tasks page shows real data or proper empty state; analytics has consent gate
**Plans**: TBD

## Progress

**Execution Order:**
Phase 77 and 78 can run in parallel (no dependency).
Phase 80 can run in parallel with 77-79 (independent infrastructure).
Phase 79 depends on 77 + 78.
Phase 81 depends on 79 + 77.
Phase 82 depends on 77.
Phase 83 depends on 79 + 81.
Phase 84 depends on 82.
Phase 85 can run in parallel with 83-84.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 77. AI Control Plane -- HITL & Tool Governance | 0/3 | Planning complete | - |
| 78. Security Fixes | 0/? | Not started | - |
| 79. Authorization | 0/? | Not started | - |
| 80. OpenTelemetry | 0/? | Not started | - |
| 81. CRM Domain | 0/? | Not started | - |
| 82. AI Remediation Completion | 0/? | Not started | - |
| 83. Workflow Automation | 0/? | Not started | - |
| 84. MUI Chat Migration | 0/? | Not started | - |
| 85. UI/UX Polish | 0/? | Not started | - |

---
*Roadmap created: 2026-02-09*
*v5.0 completed: 2026-03-10 -- 15 phases, 34 plans, 51/51 requirements*
*v5.1 completed: 2026-03-15 -- 11 phases, 30 plans*
*v6.0 roadmap added: 2026-03-18 -- 9 phases, 66 requirements across 9 domains*
