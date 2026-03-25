# Roadmap: PMSync

## Milestones

- ✅ **v1 Stability & Code Quality Refactor** — Phases 1-8 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** — Phases 1-8 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** — Phases 01-03 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** — Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** — Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** — Phases 23-28 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** — Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** — Phases 42-49 (shipped 2026-03-06)
- ✅ **v5.0 better-auth Migration** — Phases 50-65 (shipped 2026-03-10)
- ✅ **v5.1 Test Coverage & Polish** — Phases 66-76 (shipped 2026-03-15)
- ✅ **v6.0 Enterprise Platform & AI Governance** — Phases 77-88 (partial, archived 2026-03-20)
- ✅ **v7.0 System Audit & Hardening** — Phases 89-99 (shipped 2026-03-23)
- ✅ **v8.0 Progressive Web App** — Phases 100-105 (shipped 2026-03-24)
- **v9.0 AI Intelligence & Platform Hardening** — Phases 106-111 (in progress)

## Phases

<details>
<summary>✅ v1 Stability & Code Quality Refactor (Phases 1-8) — SHIPPED 2026-02-02</summary>

8 phases, 40 plans. See `milestones/v1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.0 Professional Email Client (Phases 1-8) — SHIPPED 2026-02-04</summary>

8 phases, 21 plans, 24/24 requirements. See `milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Optimization & Polish (Phases 01-03) — SHIPPED 2026-02-05</summary>

3 phases, 5 plans. See `milestones/v2.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) — SHIPPED 2026-02-09</summary>

12 phases, 42 plans, 19/19 requirements. See `milestones/v3.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) — SHIPPED 2026-02-27</summary>

10 phases, 34 plans, 31/32 requirements (ENC-03 deferred). See `milestones/v3.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.2 AI Rebuild & Cleanup (Phases 23-28) — SHIPPED 2026-03-03 (partial)</summary>

6 phases, 20 plans, 25/33 requirements (8 carried to v4.0). See `milestones/v3.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.0 Enterprise Stabilization (Phases 31-41) — SHIPPED 2026-03-04</summary>

11 phases, 22 plans, 19/19 requirements. See `milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.1 Security Hardening & Debt Reduction (Phases 42-49) — SHIPPED 2026-03-06</summary>

8 phases, 28 plans, 65/66 requirements. See `milestones/v4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.0 better-auth Migration (Phases 50-65) — SHIPPED 2026-03-10</summary>

15 phases, 34 plans, 51/51 requirements. See `milestones/v5.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.1 Test Coverage & Polish (Phases 66-76) — SHIPPED 2026-03-15</summary>

11 phases, 30 plans. See `milestones/v5.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v6.0 Enterprise Platform & AI Governance (Phases 77-88) — PARTIAL, archived 2026-03-20</summary>

12 phases (77-88), 4/66 requirements completed. Phases 86-88 (bug fixes) completed. Phases 77-85 (enterprise features) deferred to v8.0+. See `milestones/v6.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v7.0 System Audit & Hardening (Phases 89-99) — SHIPPED 2026-03-23</summary>

10 active phases + 1 obsolete (97), 35 plans, 65/65 requirements. See `milestones/v7.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v8.0 Progressive Web App (Phases 100-105) — SHIPPED 2026-03-24</summary>

6 phases, 11 plans, 21/21 requirements. See `milestones/v8.0-ROADMAP.md` for full details.

</details>

### v9.0 AI Intelligence & Platform Hardening (In Progress)

**Milestone Goal:** Make the AI agent smarter with graph-aware RAG, ship backend push notifications, harden rate limits, and add explicit HITL approval routing.

- [x] **Phase 106: Tiered Rate Limiting** - Replace flat write-rate limit with named tiers to fix user-reported 429s (completed 2026-03-24)
- [x] **Phase 107: Push Notification Backend Dispatch** - Complete the v8.0 push plumbing with actual web-push delivery (completed 2026-03-24)
- [x] **Phase 108: HITL Approval Routing** - Add explicit approve/reject gates for destructive AI tool calls (completed 2026-03-24)
- [x] **Phase 109: Graph RAG Pipeline** - Context assembly, memory anchoring, and few-shot examples for smarter AI (completed 2026-03-25)
- [x] **Phase 110: Wire Entity-Anchored Memory Retrieval** - Close GRAG-04 integration gap: wire getMemoriesByEntity() into context assembly after graph traversal (completed 2026-03-25)
- [ ] **Phase 111: Push Notification Test Debt** - Replace 19 RED test stubs across Phase 107 spec files with real assertions

## Phase Details

### Phase 106: Tiered Rate Limiting
**Goal**: Users stop hitting false 429 errors during normal workflows because write operations use appropriate per-category limits
**Depends on**: Nothing (first phase in v9.0)
**Requirements**: RATE-01, RATE-02, RATE-03
**Success Criteria** (what must be TRUE):
  1. A user sending emails hits the send-tier limit (10/min) independently of other write operations
  2. A user performing bulk label/move operations uses the safe-write tier (100/min) without being blocked by the old flat 30/min limit
  3. Read-heavy pages (inbox loading, search, thread view) continue working at 300/min with no regression
  4. All existing @Throttle() decorators map to named tiers with no unintended cross-tier enforcement
**Plans**: 2 plans
Plans:
- [ ] 106-01-PLAN.md — Create @RateTier decorator, 4-tier ThrottlerModule config, tier-aware guard
- [ ] 106-02-PLAN.md — Audit and update all @Throttle decorators, add @RateTier to undecorated endpoints

### Phase 107: Push Notification Backend Dispatch
**Goal**: Users who enabled push notifications in v8.0 settings actually receive push notifications on their devices
**Depends on**: Phase 106
**Requirements**: PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05, PUSH-06, PUSH-07
**Success Criteria** (what must be TRUE):
  1. When a new email arrives, user receives a push notification on all subscribed devices within 30 seconds
  2. Clicking a push notification opens the specific email thread in the app
  3. User can configure which categories trigger push notifications (new email, calendar, AI) in settings
  4. Multiple emails in the same thread within a short window produce a single grouped notification with count
  5. Stale browser subscriptions (uninstalled PWA, revoked permissions) are automatically cleaned up without silent failure accumulation
**Plans**: 3 plans
Plans:
- [ ] 107-00-PLAN.md — Wave 0: Test stub creation for Nyquist compliance
- [ ] 107-01-PLAN.md — Backend dispatch pipeline: schema migration, queue config, VAPID init, event handler, BullMQ worker, SW payload alignment
- [ ] 107-02-PLAN.md — Frontend category preference toggles: DTO, translations, push API, NotificationSettings UI

### Phase 108: HITL Approval Routing
**Goal**: Users have explicit control over destructive AI actions with clear approve/reject UX and configurable sensitivity
**Depends on**: Phase 107
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04
**Success Criteria** (what must be TRUE):
  1. When the AI proposes a destructive action (send email, delete, move), user sees approve/reject buttons with warning styling before it executes
  2. Destructive tool calls are visually distinct from informational tool calls (different color/icon treatment)
  3. User can set HITL sensitivity to HIGH_ONLY, ALL_MUTATIONS, or NONE in AI settings
  4. Every approval and rejection is logged in the audit trail for GDPR accountability
**Plans**: 3 plans
Plans:
- [ ] 108-01-PLAN.md — Backend: schema migration, dynamic needsApproval, audit logging
- [ ] 108-02-PLAN.md — Frontend: approval card terminal states, destructive visual distinction, translations
- [ ] 108-03-PLAN.md — Frontend: HITL sensitivity toggle in AI settings, NONE confirmation dialog

### Phase 109: Graph RAG Pipeline
**Goal**: AI chat produces more accurate, context-rich responses by assembling graph-expanded results within a token budget and using entity-anchored memories
**Depends on**: Phase 108
**Requirements**: GRAG-01, GRAG-02, GRAG-03, GRAG-04, GRAG-05, GRAG-06
**Success Criteria** (what must be TRUE):
  1. AI responses to relationship questions ("What did Marco say about the project?") include graph-expanded context from related contacts and threads
  2. Token usage for RAG context is 40-60% lower than raw result injection (measurable via AiRunLedger)
  3. User can ask "What do I remember about [contact]?" and get entity-anchored memory results, not just semantic search hits
  4. Multi-hop queries ("Find emails from people I met at the conference about budget") trigger few-shot guided tool chains that produce relevant results
**Plans**: 3 plans
Plans:
- [x] 109-01-PLAN.md — Schema foundation: GraphNode/GraphEdge tables, AIMemory FK columns, entity extraction service
- [ ] 109-02-PLAN.md — EntityGraphService (recursive CTE traversal) + ContextAssemblyService (token-budgeted builder)
- [ ] 109-03-PLAN.md — Integration: memory anchoring, rag-tools refactor, query router sub-classification, few-shot injection, ledger tracking

### Phase 110: Wire Entity-Anchored Memory Retrieval
**Goal**: Entity-anchored memories from getMemoriesByEntity() are actually used in AI chat responses after graph traversal, closing the GRAG-04 integration gap
**Depends on**: Phase 109
**Requirements**: GRAG-04
**Gap Closure**: Closes GRAG-04 integration gap, ContextAssembly→MemoryService wiring, entity memory query flow step 4
**Success Criteria** (what must be TRUE):
  1. After graph traversal returns entity nodes, contact/email entity IDs are extracted and passed to getMemoriesByEntity()
  2. FK-anchored memories are merged with vector-search memories before context assembly
  3. "What do I remember about [contact]?" queries return entity-specific memories, not just semantic search hits
**Plans**: 1 plan
Plans:
- [ ] 110-01-PLAN.md — Add externalId to traverse CTE, batch entity memory method, wire into prepareChatAgent

### Phase 111: Push Notification Test Debt
**Goal**: All 19 RED test stubs in Phase 107 spec files are replaced with real assertions that validate actual behavior
**Depends on**: Phase 110
**Requirements**: None (tech debt)
**Gap Closure**: Closes tech debt from v9.0 audit — 19 RED test stubs across 4 spec files
**Success Criteria** (what must be TRUE):
  1. Zero `expect(true).toBe(false)` stubs remain in push notification spec files
  2. All replacement tests pass with real assertions against actual service/handler behavior
  3. No test is skipped or marked `.todo` as a replacement for a RED stub
**Plans**: 2 plans
Plans:
- [ ] 111-01-PLAN.md — Replace 7 RED stubs in push.controller.spec.ts and push.service.spec.ts� Replace 7 RED stubs in push.controller.spec.ts and push.service.spec.ts
- [ ] 111-02-PLAN.md — Replace 12 RED stubs in push-dispatch.handler.spec.ts and push-dispatch.worker.spec.ts� Replace 12 RED stubs in push-dispatch.handler.spec.ts and push-dispatch.worker.spec.ts

## Progress

**Execution Order:**
Phases execute in numeric order: 106 -> 107 -> 108 -> 109 -> 110 -> 111

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 106. Tiered Rate Limiting | 2/2 | Complete    | 2026-03-24 |
| 107. Push Notification Backend Dispatch | 3/3 | Complete   | 2026-03-24 |
| 108. HITL Approval Routing | 3/3 | Complete    | 2026-03-24 |
| 109. Graph RAG Pipeline | 1/3 | Complete    | 2026-03-25 |
| 110. Wire Entity-Anchored Memory Retrieval | 0/1 | Complete    | 2026-03-25 |
| 111. Push Notification Test Debt | 0/2 | Pending | — |

---
*Roadmap created: 2026-02-09*
*v8.0 completed: 2026-03-24 -- 6 phases, 11 plans, 21/21 requirements*
*v9.0 roadmap added: 2026-03-24 -- 4 phases, 20 requirements*
