# Backend Audit Roadmap (2025-12)

This roadmap turns the latest backend audit into an actionable plan. It focuses on configuration hygiene, queue/Redis hardening, AI/embedding safety, and operational readiness. Timelines are indicative; sequence is more important than exact dates.

## Goals
- Eliminate startup/config drift between validation and runtime.
- Make BullMQ/Redis safe-by-default (shared connections, DLQ correctness, clean shutdown).
- Tighten AI/embedding paths for rate-limit, cost, and PII safety.
- Improve observability and operational playbooks (metrics, alerts, remediation).

## Immediate (Day 0-3) – P0/P1 defects
1) **Config & validation alignment**
   - Unify on one source of truth for DB/Redis URLs: either `DATABASE_URL` or split `DB_*`/`REDIS_*`; make `env.validation.ts` and `configuration.ts` consistent and reject partial configs.
   - Remove misuse of `ConfigService.get(key, default)`; replace with `??` fallback in all services (e.g., `query-embedding-cache.service.ts`, `dead-letter-queue.service.ts`, calendar/contact/email queues).
   - Normalize log output to ASCII; strip corrupted symbols in startup and config warnings (`main.ts`, `configuration.ts`, DLQ/logging services).
2) **DLQ correctness & safety**
   - Fix DLQ job payload typing: `failedAt` must be serialized consistently (store ISO string; parse before `toISOString` usage) to avoid runtime errors in `getStats`.
   - Stop connection sprawl: share Redis connection/pool for DLQ (or inject CacheService connection) instead of ad-hoc `new Redis()`.
   - Clear `setInterval` on shutdown or use `setInterval(...).unref()` to avoid keeping the event loop alive.
   - Add TTL to DLQ counters and alert keys to prevent unbounded Redis growth.
   - Replace `ConfigService.get('DLQ_ALERT_THRESHOLD', 10)` with proper fallback and wire alerts to actual sink (Slack/PagerDuty stub).
3) **Secrets & token safety**
   - Make `PASSWORD_RESET_SECRET` mandatory in production; fail fast instead of falling back to derived/insecure secret (`auth.service.ts`).
   - Add explicit TLS/`REDIS_TLS` support to Redis clients (CacheService, DLQ, BullMQ, query cache) for non-local deployments.

## Near-Term (Day 4-10)
1) **Queue & worker resilience**
   - Standardize worker options via `getWorkerOptions` across all workers; add stalled/error listeners and DLQ handoff in `ai.worker.ts` and other workers.
   - Add per-queue metrics (depth, processed, failed, latency) and export to Prometheus; ensure `/health/queues` reflects DLQ status.
   - Implement graceful shutdown hooks for BullMQ workers (drain + close) and ensure timers are `unref()`d.
2) **AI/Embedding safety & cost**
   - Cap stored user-prompt embeddings with retention/TTL (table or cron) to avoid unbounded PII and storage growth.
   - Add token/size guards before enqueueing embeddings and before Mistral calls; enforce MAX_CHARS per email including attachments.
   - Add explicit handling for 429/5xx in `mistral.service.ts` (retry with backoff, circuit breaker) and surface clear fallback messages.
   - De-duplicate embedding jobs at queue ingress using DB check + Redis key to prevent burst duplicates.
3) **Configuration & runtime parity**
   - Replace early `.env` loading side effects with Nest `ConfigModule` consumption where possible; avoid double-load that diverges from validation.
   - Add config schema docs for AI, queues, Redis TLS, DLQ thresholds, and worker concurrency in `docs/`.

## Mid-Term (Day 11-21)
1) **Observability & ops**
   - Ship structured logs for DLQ retries, queue backoffs, and Mistral calls with `requestId` correlation.
   - Add dashboards for: queue depth/error rate, DLQ age, Redis memory (per namespace), Mistral latency/429 rate, embedding backlog.
   - Define alert rules: DLQ depth/age, Redis memory >80%, Mistral 429 spike, worker stall rate.
2) **Data lifecycle & privacy**
   - Add retention policies for embeddings, AI transcripts, and cache namespaces; document defaults per environment.
   - Add redaction for PII in AI logs and ensure cached embeddings exclude sensitive fields where not needed.
3) **Operational playbooks**
   - Document runbooks for: clearing DLQ safely, replaying jobs, rotating Redis credentials, and draining workers before deploys.
   - Add smoke tests for queue connectivity and Redis TLS verification in CI.

## Ownership & Tracking
- **Backend**: config harmonization, DLQ fixes, worker resilience, AI safeguards.
- **SRE/DevOps**: Redis TLS rollout, metrics/alerts, dashboards, secrets management.
- **QA**: validation of env schemas, DLQ stats endpoints, Mistral retry/backoff paths, regression tests for queue drains.

## Definition of Done (per milestone)
- P0/P1: No startup/runtime config mismatches; DLQ stats API works with correct dates; Redis connections consolidated; ASCII-only logs; password reset secret enforced in prod.
- Near-term: BullMQ workers emit metrics and handle DLQ handoff; AI/embedding paths enforce token/size limits and backoff; config docs updated.
- Mid-term: Dashboards + alerts live; retention and redaction policies enforced; runbooks published and validated.
