# Requirements: PMSync v9.0

**Defined:** 2026-03-24
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v9.0 Requirements

Requirements for v9.0 AI Intelligence & Platform Hardening. Each maps to roadmap phases.

### Push Notification Dispatch

- [x] **PUSH-01**: User receives push notification when a new email arrives
- [x] **PUSH-02**: Push dispatch routes through BullMQ queue (not inline event handler)
- [x] **PUSH-03**: Stale subscriptions are deleted on web-push 410/404 response
- [x] **PUSH-04**: User receives push on all subscribed devices (multi-device delivery)
- [x] **PUSH-05**: User can configure push preferences per category (new email, calendar, AI)
- [ ] **PUSH-06**: Clicking a push notification opens the specific email thread in the app
- [x] **PUSH-07**: Multiple emails in the same thread produce a single grouped notification with count

### Rate Limiting

- [x] **RATE-01**: Write endpoints use tiered limits: safe-write 100/min, destructive-write 30/min, send 10/min
- [x] **RATE-02**: All existing `@Throttle()` decorators are audited and mapped to correct named tiers
- [x] **RATE-03**: Read tier remains at 300/min (no regression)

### HITL Approval Routing

- [ ] **HITL-01**: Frontend renders approve/reject buttons when a tool call is in `approval-requested` state
- [ ] **HITL-02**: Destructive tool calls are visually distinct (warning styling) from informational tool calls
- [ ] **HITL-03**: User can configure HITL sensitivity: HIGH_ONLY / ALL_MUTATIONS / NONE in AI settings
- [ ] **HITL-04**: Approval and rejection events are logged via AuditService for GDPR accountability

### Graph RAG

- [ ] **GRAG-01**: Context assembly produces structured summary of graph expansion results within a token budget
- [ ] **GRAG-02**: Context assembly reduces token usage by 40-60% compared to raw result injection
- [ ] **GRAG-03**: AIMemory records can be anchored to a contact or email entity
- [ ] **GRAG-04**: Entity-anchored memories are retrievable by direct entity lookup (not just semantic search)
- [ ] **GRAG-05**: System prompt includes 3-5 few-shot tool chain examples for multi-hop queries
- [ ] **GRAG-06**: Few-shot examples are injected dynamically based on query complexity tier

## Future Requirements

Deferred to v9.x+ or later. Tracked but not in current roadmap.

### Push Notifications

- **PUSH-F01**: AI triage batch notifications ("3 urgent emails need attention")
- **PUSH-F02**: Follow-up reminder push ("You haven't replied to Marco's email")

### Rate Limiting

- **RATE-F01**: Rate limit response headers (X-RateLimit-Remaining / X-RateLimit-Reset)
- **RATE-F02**: Progressive rate limiting with escalating cooldowns

### Graph RAG

- **GRAG-F01**: Materialized entity graph (Step 5) — pre-computed edges for <20ms expansion
- **GRAG-F02**: Tool consolidation (Step 7) — merge semantic_search + graph_context_search

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Firebase/OneSignal push | Google lock-in, SaaS dependency; web-push is sufficient |
| Neo4j or external graph DB | PostgreSQL adjacency list sufficient at email scale |
| Per-endpoint rate limit config UI | Hardcoded tiers are correct; env var overrides at most |
| Drag-and-drop HITL workflow builder | Enterprise ABAC territory |
| Cross-model reranker API (Cohere/BGE) | Heuristic reranking sufficient at current volumes |
| Approval with parameter modification | Simple approve/reject covers the requirement |
| Push for every single email | Notification fatigue destroys the feature |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RATE-01 | Phase 106 | Complete |
| RATE-02 | Phase 106 | Complete |
| RATE-03 | Phase 106 | Complete |
| PUSH-01 | Phase 107 | Complete |
| PUSH-02 | Phase 107 | Complete |
| PUSH-03 | Phase 107 | Complete |
| PUSH-04 | Phase 107 | Complete |
| PUSH-05 | Phase 107 | Complete |
| PUSH-06 | Phase 107 | Pending |
| PUSH-07 | Phase 107 | Complete |
| HITL-01 | Phase 108 | Pending |
| HITL-02 | Phase 108 | Pending |
| HITL-03 | Phase 108 | Pending |
| HITL-04 | Phase 108 | Pending |
| GRAG-01 | Phase 109 | Pending |
| GRAG-02 | Phase 109 | Pending |
| GRAG-03 | Phase 109 | Pending |
| GRAG-04 | Phase 109 | Pending |
| GRAG-05 | Phase 109 | Pending |
| GRAG-06 | Phase 109 | Pending |

**Coverage:**
- v9.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
