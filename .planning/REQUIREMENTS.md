# Requirements: PMSync

**Defined:** 2026-03-31
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v11.0 Requirements

Requirements for Legacy Cleanup, Scalability & Billing Hardening. Each maps to roadmap phases.

### Legacy Cleanup

- [x] **LEGC-01**: All JWT-related dead code removed (guard comments, env vars, key gen script, @ApiBearerAuth Swagger decorators, addBearerAuth config)
- [x] **LEGC-02**: Deprecated voltAgentApi/multiAgentApi aliases confirmed fully removed and documentation updated
- [x] **LEGC-03**: Tailwind CSS package removed — @tailwind base converted to plain CSS, tailwindcss + postcss deps + config deleted
- [x] **LEGC-04**: All @Cron decorators migrated to BullMQ repeatable jobs (single-instance execution guaranteed)

### Horizontal Scaling

- [x] **SCAL-01**: Socket.IO transport forced to websocket-only on both server and client (HTTP long-polling disabled)
- [x] **SCAL-02**: DB connection pool sized per-replica with env var override (total connections < Railway PostgreSQL max)
- [ ] **SCAL-03**: BullMQ worker concurrency tuned for N-replica deployment (per-instance limits, no duplicate job processing)
- [x] **SCAL-04**: In-memory state in TriageLearningService, CircuitBreaker, and EmailTriage semaphore externalized to Redis

### Frontend Performance

- [ ] **PERF-01**: Bundle analysis run and heavy dependencies dynamically imported (TipTap, chart libs, FullCalendar, @xyflow/react)
- [ ] **PERF-02**: Cache-Control headers added to read-heavy GET endpoints (folders, labels, pricing table)
- [x] **PERF-03**: Graceful shutdown verified — HTTP connection draining, WebSocket disconnect, BullMQ worker stop on SIGTERM
- [x] **PERF-04**: Prometheus metrics include per-replica instance labels for Grafana differentiation

### Billing Hardening

- [ ] **BILL-01**: Frontend billing UI implemented (pricing table, plan upgrade flow, usage dashboard, billing portal redirect)
- [ ] **BILL-02**: Webhook endpoint for Autumn/Stripe events with signature verification and idempotent event processing
- [ ] **BILL-03**: E2E validation scripts for all billing flows on Railway/Vercel (attach, check, track, cancel, billing portal)
- [ ] **BILL-04**: Edge cases hardened (payment failure handling, mid-cycle plan changes, cancellation flow, usage counter race conditions)

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Autoscaling

- **AUTO-01**: Railway autoscaling triggers based on CPU/memory thresholds
- **AUTO-02**: Scale-to-zero during off-peak hours

### SSR/RSC Migration

- **SSR-01**: Server components for data-fetching on static-content pages (landing, pricing, settings)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Stripe integration bypassing Autumn | Autumn wraps Stripe; going direct adds massive complexity |
| Node.js cluster mode on Railway | Railway provides replica-based scaling; cluster mode inside container is redundant |
| Self-managed PgBouncer service | Use Prisma connection_limit tuning; PgBouncer only if pool exhaustion proven |
| Real-time billing usage via WebSocket | Over-engineering; poll on page load + after AI operations with 5min staleTime |
| Frontend-side JWT validation | JWT is being removed, not replaced |
| Tailwind-to-MUI CSS variable migration | CSS vars are framework-agnostic; just remove Tailwind processing pipeline |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LEGC-01 | Phase 125 | Complete |
| LEGC-02 | Phase 125 | Complete |
| LEGC-03 | Phase 125 | Complete |
| LEGC-04 | Phase 126 | Complete |
| SCAL-01 | Phase 127 | Complete |
| SCAL-02 | Phase 127 | Complete |
| SCAL-03 | Phase 129 | Pending |
| SCAL-04 | Phase 128 | Complete |
| PERF-01 | Phase 130 | Pending |
| PERF-02 | Phase 130 | Pending |
| PERF-03 | Phase 129 | Complete |
| PERF-04 | Phase 129 | Complete |
| BILL-01 | Phase 131 | Pending |
| BILL-02 | Phase 132 | Pending |
| BILL-03 | Phase 133 | Pending |
| BILL-04 | Phase 132 | Pending |

**Coverage:**
- v11.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation — all 16 requirements mapped*
