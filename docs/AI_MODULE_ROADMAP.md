# AI Module Roadmap

Scope: `backend/src/modules/ai` (controllers, services, guards) and `voltagent` submodule (queue, rate limiting, model routing, batch, RAG, HITL). Goal: safe, scalable AI operations for 1000+ concurrent users with predictable cost, throughput, and latency.

## Current Progress (2025-12-03)
- [BASELINE] BullMQ queue with priority lanes and retry/backoff (`voltagent/services/ai-queue.service.ts`); Mistral batch API helper (`voltagent/services/mistral-batch.service.ts`); model router and semantic cache; per-user/tenant HTTP guard (`guards/ai-rate-limit.guard.ts`) and token+RPM limiter (`voltagent/services/rate-limiter.service.ts`).
- [PARTIAL] Load shedding via rate limit guard (minute/day) and tenant/global token buckets; batching helpers for embeddings/sentiment; HITL and action executor scaffolding with tests.

## Key Findings (audit)
- Queue throughput & fairness: `voltagent/services/ai-queue.service.ts` uses a single ioredis connection for queues, events, and workers with default concurrency=3 (high) / 2 (others). No per-tenant concurrency caps or queue partitioning, so a single noisy tenant can occupy workers. Dedup keys rely on caller-provided `dedupKey`; without it, repeated submissions enqueue duplicates. Shutdown closes connections but doesn’t drain/await active jobs, risking in-flight loss during deploys.
- Rate limiting fragmentation: HTTP guard (`guards/ai-rate-limit.guard.ts`) enforces per-user RPM/RPD via CacheService, while `voltagent/services/rate-limiter.service.ts` enforces per-tenant RPM/token/global RPM. They’re not coordinated, so limits can conflict or be bypassed depending on call path. The rate limiter’s in-memory fallback map never schedules cleanup, which can leak memory if Redis is down under 1000-user load.
- Backpressure gaps: Controllers call services directly; there’s no explicit circuit breaker or adaptive timeout for upstream LLMs/batch. Queue adders don’t degrade when Redis is unavailable beyond returning null, so callers may proceed synchronously without load shedding. No per-tenant queue length guard or overload signals to the frontend.
- Observability: Metrics are internal (counters in memory) without exports to Prometheus/OpenTelemetry; routing stats, queue metrics, and rate-limit decisions aren’t exposed. Hard to tune for 1000+ users or spot noisy tenants/providers.
- Model routing and costs: `voltagent/services/model-router.service.ts` uses heuristic patterns only and holds stats in-memory; no persistence or eviction. Confidence/reasoning are logged but not surfaced to operators; token estimation is naïve and can under-estimate long multilingual inputs, risking overruns.
- Batch API: `voltagent/services/mistral-batch.service.ts` uses `Blob` in Node and synchronous in-memory assembly; no streaming upload for very large batches, no per-tenant size cap, and no watchdog to cancel stale jobs. Cache writes for job metadata are best-effort with silent failure.
- Testing gaps for scale: Speed/throughput specs exist, but there are no load tests for 1k concurrent tenants/users, no chaos tests for Redis/LLM outages, and no verification of retry/backoff behavior under saturation.

## Bug / Defect Backlog (high priority to low)
- `voltagent/services/ai-queue.service.ts`: onModuleDestroy closes queues/Redis without draining/awaiting active workers; in-flight jobs can be dropped on deploys (data loss risk).
- `voltagent/services/ai-queue.service.ts`: dedup optional; duplicate submissions enqueue multiple jobs when `dedupKey` omitted (double-processing/cost).
- `voltagent/services/ai-queue.service.ts`: single Redis connection reused for workers, queue events, and queues; under heavy load this can block events and delay completion/failed notifications.
- `voltagent/services/rate-limiter.service.ts`: local fallback buckets never cleaned unless `cleanupExpiredBuckets()` is called manually; memory leak if Redis unavailable during high-volume traffic.
- `guards/ai-rate-limit.guard.ts` vs `voltagent/services/rate-limiter.service.ts`: two distinct limiters with different keys/scopes; inconsistent enforcement paths and no shared limits or headers (users can hit one path and bypass the other).
- `voltagent/services/mistral-batch.service.ts`: uses `Blob` and buffers entire JSONL payload in memory; for large batches this can exhaust memory and lacks per-tenant size guard.
- `voltagent/services/model-router.service.ts`: routing stats are in-memory only; processes can restart and lose statistics, breaking cost/savings reporting and making alerts impossible.

## Refactor Plan (focused steps)
- Unify rate limiting: merge HTTP guard and `RateLimiterService` into one Redis-backed limiter covering user+tenant RPM/RPD/token/global; ensure consistent headers, structured logs, and periodic cleanup of local fallback buckets.
- Queue hardening: require `dedupKey` for idempotent job types, add per-tenant queue depth and in-flight caps, split Redis connections (commands vs events vs workers), and drain/await active jobs on shutdown with a bounded timeout.
- Backpressure and overload: add per-tenant queue-depth checks and overload responses (429/503 with Retry-After); add circuit breakers/timeouts around LLM and batch calls with clear error codes to callers.
- Observability: emit Prometheus/OTel metrics for queue depth/lag, worker utilization, rate-limit allow/deny, LLM latency/retries, and batch watchdogs; add tracing spans enqueue→worker→LLM with tenant/model tags.
- Cost/routing hygiene: replace heuristic token estimation with a tokenizer-based estimator; persist routing stats; enforce per-tenant budgets and batch size limits; stream batch uploads and add watchdog cancellation.

## Guiding Goals
- Predictable concurrency for 1000+ users: partitioned queues, per-tenant caps, and explicit backpressure signals.
- Unified rate limiting: single source of truth for RPM/token/global limits with Redis-first storage and safe fallback.
- Resilient shutdown and deploys: drain workers, flush/rehydrate in-flight jobs, and avoid timer/connection leaks.
- Observable and tunable: export metrics/logs/traces for queue lengths, worker utilization, rate-limit hits, routing choices, LLM latency, and error budgets.
- Cost-aware routing: accurate token estimation, per-tenant budgets, and batch vs realtime routing with SLO-driven selection.

## Phase 1 - Concurrency & Fairness (Week 1)
- Partition queues per tenant or enforce per-tenant in-flight caps; add queue-length guardrails per tenant/provider before enqueuing (`ai-queue.service.ts`).
- Increase worker concurrency via config and separate Redis connections for workers vs events; add `drain` on shutdown to wait for active jobs (with timeout).
- Add mandatory dedup keys for idempotent job types and reject duplicates instead of silently queuing.
- Front controllers: short-circuit to queue for heavy tasks; return 202 + jobId to reduce sync load.

## Phase 2 - Unified Rate Limiting & Backpressure (Week 2)
- Consolidate `AiRateLimitGuard` and `RateLimiterService` into a single limiter with tenant+user RPM/RPD+token quotas; propagate remaining/ retry-after headers.
- Enforce limits at queue ingress and on direct LLM calls; add per-tenant queue depth limits and overload responses (429/503 with `Retry-After`).
- Add periodic cleanup for in-memory buckets and health checks for Redis; emit structured logs for limit hits and bypasses.

## Phase 3 - Observability & SLOs (Week 3)
- Export Prometheus/OpenTelemetry metrics: queue depth per tenant/priority, enqueue/latency histograms, worker utilization, rate-limit allow/deny, LLM latency by model, retries/backoff counts, and cost per tenant.
- Add tracing spans for enqueue → worker → LLM call; tag tenant/user/model/tool; sample high-volume tenants.
- Dashboards and alerts for: high queue lag, >X% rate-limit denies, Redis unavailability, LLM timeout/error rate, and cost budget breaches.

## Phase 4 - Routing, Cost, and Batch Hygiene (Week 4)
- Improve token estimation (tiktoken-based) and cap max prompt size per model; enforce strict timeouts and circuit breakers for LLM calls.
- Add per-tenant budgets and model selection policies (speed vs quality) with feature flags; persist routing stats for operator insight.
- For batch jobs, stream uploads, cap batch size per tenant, add watchdog to cancel long-running jobs, and surface status via metrics/webhooks.

## Phase 5 - Resilience & Testing (Week 5)
- Load/soak tests for 1k concurrent users with mixed workloads; chaos tests for Redis/LLM outages and slowdowns; validate recovery and backpressure behavior.
- Integration tests for rate-limit interplay (tenant+user+token), dedup behavior, queue drain on shutdown, and per-tenant queue caps.
- Runbooks for scaling workers (HPA), rotating API keys, Redis failover, and cost controls; document recommended configs for 1k/5k concurrent users.***
