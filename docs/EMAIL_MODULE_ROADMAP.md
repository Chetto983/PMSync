# Email Module Roadmap

Scope: `backend/src/modules/email` (drafts, send, attachments, retention, cleanup, on-demand download). Targets reliability, correctness, and efficiency for attachment-heavy workloads.

## Current Progress (2025-12-03)

### ✅ Completed

- [DONE] Draft save now validates provider ownership/active/supportsEmail in `emails.service.ts`; unit test passing.
- [DONE] Send/schedule flows validate tenant-owned, active, supportsEmail provider in `email-send.service.ts`; unit test passing.
- [DONE] Update/bulk email mutations enforce active/supportsEmail providers in `emails.service.ts`; tests passing.
- [DONE] Attachment uploads deduplicate by SHA-256 content hash with `dedupHit` flag tracking.
- [DONE] On-demand attachment downloads reuse cached objects by `contentHash`; hash persisted after fetch.
- [DONE] **AttachmentMetricsService**: Centralized observability for attachment operations (dedup, upload, download).
- [DONE] **Structured logging**: All attachment/cleanup operations log with `tenantId/providerId/emailId/attachmentId`.
- [DONE] **Orphan S3 tracking**: Failed S3 deletions tracked for retry; `getOrphanedS3Keys()` and `retryOrphanedS3Deletions()`.
- [DONE] **Dry-run retention**: `dryRunRetention()` previews what would be deleted without actually deleting.
- [DONE] **Batch upload**: `batchUploadAttachments()` with configurable concurrency guard.
- [DONE] **BatchProcessorService**: Generic batch processing with concurrency control.
- [DONE] **ConcurrencyGuard**: Rate limiting for API calls and database operations.
- [DONE] **FolderLookupCache**: TTL-based cache for folder lookups.

### 🔄 Remaining

- [ ] Hash backfill for existing attachment rows (migration script).
- [ ] Prometheus/OpenTelemetry integration for metrics export.
- [ ] Alerting rules for high orphan S3 failures.
- [ ] Streaming download→upload for large attachments (optional).

## Key Findings (audit)

- Draft creation (`emails.service.ts::saveDraft`) uses unchecked create with `providerId` but does not validate provider ownership or existence; missing/invalid provider triggers Prisma errors (seen in e2e). Guard and connect provider to tenant before write. **[FIXED]**
- On-demand attachment download relies on pending references; no S3 existence check before upload can lead to duplicate objects. Added hash-based dedup for uploads, but metadata-level dedup/backfill is still manual. **[FIXED with hash dedup]**
- Retention/cleanup paths lack metrics for skipped/failed deletes; orphaned S3 objects not surfaced to operators. **[FIXED with orphan tracking]**

## Guiding Goals

- Tenant-safe writes (provider ownership enforced on all email mutations).
- Deterministic attachment lifecycle (pending → downloaded → cleaned).
- Observability on storage, queueing, and cleanup outcomes.
- Minimal duplicate storage for attachments across tenants/providers.

## Phase 1 - Safety & Correctness ✅ COMPLETE

- [DONE] Validate `providerId` + tenant on draft save; reject/404 if provider missing or inactive (`emails.service.ts`).
- [DONE] Validate `providerId` + tenant on send/schedule endpoints; reject/404 if provider missing or inactive (`email-send.service.ts`).
- [DONE] Validate `providerId` + tenant on update/bulk mutation endpoints; reject/404 if provider missing or inactive (`emails.service.ts`).
- [DONE] Prisma writes connect provider relations (no unchecked create without FK validation).
- [DONE] Add contract tests for draft/save without provider and with wrong-tenant provider (expect 404).

## Phase 2 - Attachment Lifecycle ✅ COMPLETE

- [DONE] Persist content hash alongside attachment rows when sending emails.
- [DONE] Reuse existing S3 object (hash key) when saving uploads; `dedupHit` flag tracked.
- [DONE] S3 existence check for pending attachments before upload; failures surfaced in logs.
- [DONE] On-demand download: short-circuit if attachment already cached in S3 by hash.
- [DONE] Metadata backfill with hash/storagePath after download.
- [ ] Hash backfill migration for existing attachment rows (future).

**Files created/modified:**

- `attachment.storage.ts`: SHA-256 dedup, `dedupHit` tracking, `batchUploadAttachments()`
- `attachment-on-demand.service.ts`: Hash-based cache hit, structured logging
- `attachment-metrics.service.ts`: Centralized metrics service (NEW)

## Phase 3 - Observability & Alerts ✅ COMPLETE

- [DONE] **Metrics**: attachment dedup hit/miss, upload failures, cleanup S3 failures, pending→cached latency.
- [DONE] **Logs**: structured with `tenantId/providerId/emailId/attachmentId` for all operations.
- [ ] **Alerts**: Prometheus/Grafana integration pending (requires infrastructure).

**Files created/modified:**

- `attachment-metrics.service.ts`: `recordUpload()`, `recordDownload()`, `recordCleanup()`, `getMetrics()`

## Phase 4 - Retention & Cleanup ✅ COMPLETE

- [DONE] Emit metrics for orphan S3 objects and skipped deletions.
- [DONE] Track orphaned S3 keys for retry: `getOrphanedS3Keys()`, `retryOrphanedS3Deletions()`.
- [DONE] Dry-run mode for retention policies: `dryRunRetention()` with per-tenant breakdown.
- [DONE] Structured logging for all cleanup operations.

**Files modified:**

- `email-cleanup.service.ts`: `DryRunResult`, orphan tracking, structured logging

## Phase 5 - Performance & Scale ✅ COMPLETE

- [DONE] Batch attachment uploads with concurrency guard: `batchUploadAttachments({ concurrency: 5 })`.
- [DONE] Generic batch processor: `BatchProcessorService` with configurable batch size and concurrency.
- [DONE] `ConcurrencyGuard` class for rate-limiting operations.
- [DONE] `FolderLookupCache` for TTL-based folder caching.
- [ ] Optional streaming download→upload for large attachments (future optimization).

**Files created:**

- `batch-processor.service.ts`: `BatchProcessorService`, `ConcurrencyGuard`, `FolderLookupCache`

## Architecture Summary

```text
email.module.ts
├── AttachmentStorageService     # S3 storage with SHA-256 dedup
├── AttachmentOnDemandService    # Lazy download from providers
├── AttachmentMetricsService     # Centralized observability
├── BatchProcessorService        # Batch processing utilities
├── EmailCleanupService          # Retention with orphan tracking
└── StorageService               # Raw S3 operations
```

## Best Practices Applied

1. **SHA-256 for deduplication** (not MD5) per [AWS S3 best practices](https://aws.amazon.com/blogs/storage/managing-duplicate-objects-in-amazon-s3/)
2. **Structured JSON logging** compatible with log aggregation tools (Loki, ELK)
3. **RED metrics pattern** (Rate, Error, Duration) per [OpenTelemetry NestJS guide](https://signoz.io/blog/opentelemetry-nestjs/)
4. **Concurrency guards** to prevent API rate limiting and resource exhaustion
5. **Content-addressable storage** for global dedup across tenants/providers
