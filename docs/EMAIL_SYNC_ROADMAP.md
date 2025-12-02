# Email Sync Roadmap

Roadmap to harden and extend the email sync stack (Gmail, Microsoft, IMAP). Organized by phases with concrete deliverables, success criteria, and owners.

## Guiding Goals

- Zero data loss across providers (webhook + cron parity).
- Deterministic sync state per provider (idempotent, backfillable).
- Fast detection and recovery from auth/infra issues.
- Confidence via reproducible tests, metrics, and runbooks.

## Phase 1 - Reliability Foundations (Week 1-2)

- **Queue & Worker Health**
  - [x] Add BullMQ health probes (Redis connectivity, queue depth/metrics summary via QueueService).
  - [x] Expose `/email-sync/health` to include queue metrics + webhook health.
- **Idempotency & Dedup**
  - [x] Enforce job-idempotency on `providerId+syncType`; add configurable jitter on enqueue/bulk enqueue to smooth webhook bursts.
  - [x] Verify cross-provider dedup hash inputs normalize messageId (angle-brackets/case) and fall back to subject+sentAt.
- **Config & Secrets**
  - [x] Centralize Redis config usage (QueueService now uses shared `getRedisConnectionOptions`).
  - [x] Startup validation for webhook/worker tokens (strict mode via `EMAIL_SYNC_REQUIRE_TOKENS`; warns otherwise).
- **Queue Visibility**
  - [x] Health summary reports queue lag by priority (waiting/delayed job age) for backlog visibility.

## Phase 2 - Webhook Robustness (Week 2-3)

- **Gmail**
  - [x] Persist latest `historyId` and detect gaps; enqueue forced full sync when gaps or missing subscription are detected.
  - [x] Track history pagination truncation (`backfillRequired` flag) during incremental sync.
  - [x] Alert on missing subscription rows when notifications arrive; force full sync when subscription missing.
- **Microsoft**
  - [x] Validate `clientState` on notifications; reject/metrics on mismatch.
  - [x] Handle `validationToken` with optional token validation; log rejection attempts.
  - [x] Renewal failures fail open to cron (deactivate webhook, force immediate cron sync).
  - [x] Renewals: track `lastRenewedAt` drift and surface stale renewals in stats.
  - [x] Delta/timestamp resilience: persist mode and reason (delta-failed/unsupported) for visibility.
- **Token Handling**
  - [x] Unified auth-error tracking; metadata and stats for providers with auth errors.

## Phase 3 - Sync Correctness (Week 3-4)

- **Incremental vs Full Guards**
  - [x] Gmail: cap history pagination; when truncated, persist flag and schedule backfill window (`backfillRequired` tracked).
  - [x] Microsoft: fall back from delta -> timestamp -> full with persisted mode + reason.
  - [~] IMAP: reconcile deletions beyond rolling window + periodic full scan (window configurable via `IMAP_RECONCILE_WINDOW`, default 2000; toggles `backfillRequired` and `imapLastFullScanAt` when deltas exceed window or full scan is stale).
- **State Propagation**
  - [x] Ensure lastSyncToken + provider metadata updates are transactional with mailbox mutations.
  - [x] Cross-provider conflict resolution: add telemetry when strategy diverges (read/star/folder).
- **Attachments**
  - [x] Guarantee ordered cleanup: fetch attachment list before deletions; emit metrics for S3 cleanup failures.

## Phase 4 - Observability & Tooling (Week 4-5)

- **Metrics**
  - [x] Per-provider gauges: error streak/auth errors/backfill/delta fallback, scheduler status/batch/interval; queue depth + Prometheus surface.
  - [x] Per-provider gauges: last sync age, webhook freshness, backlog depth.
  - [x] Counters: new/deleted per providerType; rate-limit/throttle indicators.
- **Logging**
  - Structured logs with providerId/tenantId/correlationId; redact tokens.
  - Sampling for noisy providers; escalation on repeated 429/5xx.
- **Dashboards & Alerts**
  - Grafana: queue lag, webhook expiring<24h, error streak >=3, full-sync fallbacks.
  - Alert policies tied to pager/squad rotations.

## Phase 5 - Performance & Scale (Week 5-6)

- **Batching & Concurrency**
  - [x] Scheduler batch/interval configurable via env (`SYNC_SCHEDULER_BATCH_SIZE`, `SYNC_SCHEDULER_INTERVAL_MINUTES`); backpressure cooldown via `SYNC_RATE_LIMIT_COOLDOWN_MINUTES`.
- **Storage Efficiency**
  - [x] Attachment dedup: hash-based S3 keys with put-if-absent to reuse identical binaries across providers/tenants.
- **Storage Efficiency**
  - Inline dedup of attachments (hash-based) before S3 upload; reuse across providers when identical.
  - Prune email embeddings on hard delete; periodic cleanup job SLO (<30m latency).
- **Backpressure**
  - [x] Circuit breaker-lite: skip providers recently rate-limited/throttled (cooldown via `SYNC_RATE_LIMIT_COOLDOWN_MINUTES`), reducing enqueue load during API stress.

## Phase 6 - Testing & Resilience (Week 6-7)

- **Test Matrix**
  - Integration suites for Gmail/Microsoft/IMAP: full + incremental + webhook triggers.
  - Property tests for folder normalization and conflict strategies.
- **Chaos/Failure Drills**
  - Simulate Redis outage, token expiry, 429/5xx storms, and webhook spoof attempts.
  - Runbooks for manual backfill and webhook recreation per provider.

## Phase 7 - UX & Ops (Week 7-8)

- **Admin Surfaces**
  - Console endpoints to: recreate webhooks, force full sync, clear queue for tenant/provider, view last 10 failures.
  - Tenant-facing status: show last sync time, queue state, webhook health.
- **Docs & Playbooks**
  - Standard operating procedures for onboarding providers, rotating secrets, and restoring after incident.
  - Checklist for production readiness before enabling new tenants.

## Milestones & Ownership

- M1 (end Week 2): Reliability foundations live; queue health + env validation.
- M2 (end Week 4): Webhook robustness and sync correctness guards shipped; alerts active.
- M3 (end Week 6): Observability dashboards + perf tuning + backpressure in place.
- M4 (end Week 8): Full test matrix, chaos drills, and admin surfaces delivered.

## Risks & Mitigations

- **Provider API limits**: enforce per-provider rate caps; progressive backoff; cache folder metadata.
- **Token churn**: proactive refresh windows, retry budget, alert on refresh failures.
- **Data skew**: periodic deep checks (cron) to realign webhook-driven accounts; reconciliation scripts per provider.

## Success Criteria

- <1% of providers fall back to full sync more than once per week.
- 99th percentile sync latency (new message to persisted) < 90s for webhook-enabled providers.
- No lost notifications in drills; mean time to detect webhook expiry < 10m.
- Embedding cleanup completes within SLA for deletions (<30m).
