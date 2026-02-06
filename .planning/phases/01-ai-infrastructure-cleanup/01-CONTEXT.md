# Phase 01: AI Infrastructure Cleanup - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean technical foundation for VoltAgent — audit current implementation against official patterns, consolidate duplicate tools, improve scalability for concurrent users, and establish metrics/observability. This is infrastructure work that enables Phases 02-03 (Chat Overhaul, Auto-Triage).

</domain>

<decisions>
## Implementation Decisions

### VoltAgent Audit Scope
- **Comprehensive audit** covering all issues: slow chat, lost messages, tool failures, context/memory problems
- **Match VoltAgent docs exactly** — rewrite to follow official VoltAgent documentation patterns
- **Clean slate for chat API** — allowed to rebuild chat endpoints from scratch if needed
- **Audit report first** — document findings in AUDIT.md, then fix in separate plan
- **Upgrade to latest stable** VoltAgent version and align with it
- **Runtime agent spawning** — implement if officially supported by VoltAgent
- **Full audit scope** — includes agent memory/persistence layer, not just chat/tools
- **Pain points to fix:** conversation threads break, tool calls are flaky, context window issues, general slowness

### Error Handling & Observability
- **Graceful fallback with message** — show "AI temporarily unavailable" + retry button on failures
- **Structured logs + Prometheus metrics** — JSON logs, trace IDs, exportable metrics
- **Unit tests + manual QA** — test individual components, manual chat testing for verification

### Tool Consolidation
- **Aggressive deduplication** — one implementation per capability, delete all duplicates
- **AI module location** — all tools consolidated in backend/src/modules/ai/
- **Auto-discovery via decorators** — VoltAgent scans modules for @Tool() decorated functions
- **Delete deprecated immediately** — remove deprecated tools during consolidation (no grace period)
- **TOOLS.md capability inventory** — document all AI capabilities in dedicated file
- **Abstract provider layer** — tools don't know which LLM, provider is injected
- **Cache with 15-minute TTL** — cache identical tool calls for 15 minutes

### Model & NLP Decisions
- **Multi-provider abstraction** — support any LLM provider via abstraction layer
- **Smart model selection** — auto-select model based on task complexity and billing
- **Keep Mistral embeddings** — continue with current embedding model for RAG
- **Consolidate existing NLP** — audit codebase for NLP patterns and consolidate
- **Active cost optimization** — reduce costs through caching, batching, smaller models where appropriate
- **Research 2025 best practices** — VoltAgent patterns, Vercel AI SDK patterns, cost optimization techniques

### Scalability Priorities
- **All bottlenecks matter** — concurrent requests, RAG latency, LLM response time, conversation load
- **100+ concurrent users** target capacity
- **Leverage existing infrastructure** — check D:\MailAgent\backend\src\common for existing patterns before adding new
- **<100ms RAG query latency** target
- **Full connection pooling review** — audit Prisma, Redis, and LLM connections
- **Load testing with custom TypeScript scripts** — benchmark before/after changes
- **60-second timeout** for AI chat responses
- **Stateless design** — prepare for horizontal scaling (multiple instances)
- **No hard memory limits** — let Node.js manage memory

### Success Measurement
- **Track all metrics** — chat response time, error rate, concurrent capacity
- **Full baseline first** — document current performance before making changes
- **Prometheus + Grafana** for metrics storage and visualization
- **Match FEATURES.md targets** — <500ms first token, <100ms RAG, 100+ concurrent
- **Multiple alert types** — 2x threshold, p95 violations, error rate spikes
- **Email notifications** for critical alerts

</decisions>

<specifics>
## Specific Ideas

- Audit should check existing infrastructure in `backend/src/common/` before proposing new patterns (queuing, circuit breakers, etc.)
- Research 2025/2026 best practices online before implementing major changes
- VoltAgent audit should produce formal AUDIT.md report before any fixes
- Model selection should consider both complexity and billing automatically

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-ai-infrastructure-cleanup*
*Context gathered: 2026-02-06*
