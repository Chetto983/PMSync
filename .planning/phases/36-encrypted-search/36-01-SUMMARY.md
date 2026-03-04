---
phase: 36-encrypted-search
plan: 01
subsystem: database, auth
tags: [hmac, sha256, hkdf, prisma, blind-index, encryption, security]

# Dependency graph
requires:
  - phase: 14-field-encryption
    provides: "Field encryption utils, TenantKeyService, HKDF key derivation"
provides:
  - "hmacForBlindIndex function for HMAC-SHA256 blind index computation"
  - "TenantKeyService.getHmacKey with distinct HKDF info label"
  - "fromHash nullable column + B-tree index on Email model"
  - "Prisma extension auto-injects fromHash on all Email write operations"
  - "HashSearchService with dual-path query builder for exact-match sender search"
  - "Backfill script for existing emails (per-tenant, idempotent)"
  - "ADR-036 documenting design decision and threat model"
affects: [36-02-query-migration, email-sync, ai-triage, meeting-prep, relationship-score]

# Tech tracking
tech-stack:
  added: []
  patterns: [HMAC blind index, dual-path query (hash + plaintext fallback), per-tenant HKDF key derivation]

key-files:
  created:
    - backend/src/common/services/hash-search.service.ts
    - backend/src/scripts/backfill-from-hash.ts
    - backend/docs/adr/036-encrypted-search.md
    - backend/prisma/migrations/20260304_add_from_hash/migration.sql
    - backend/src/common/services/__tests__/hash-search.service.spec.ts
    - backend/src/scripts/__tests__/backfill-from-hash.spec.ts
  modified:
    - backend/src/prisma/encryption/field-encryption.utils.ts
    - backend/src/common/services/tenant-key.service.ts
    - backend/src/prisma/encryption/encryption.config.ts
    - backend/src/prisma/encryption/field-encryption.extension.ts
    - backend/src/prisma/prisma.service.ts
    - backend/src/prisma/prisma.module.ts
    - backend/prisma/schema.prisma

key-decisions:
  - "fromHash uses HMAC-SHA256 (not plain SHA-256) with per-tenant HKDF-derived key for cryptographic isolation"
  - "subject stays plaintext in v4.0 -- substring search incompatible with deterministic hashing"
  - "HashSearchService in common/services (not modules/email) to avoid circular dependency"
  - "Dual TenantKeyService instantiation is intentional -- PrismaService uses new(), DI uses injected instance; both derive identical keys"
  - "Prisma migration created manually (baseline migration shadow DB issue); CONCURRENTLY note for production"

patterns-established:
  - "BlindIndexConfig separate from EncryptedFieldConfig -- indexing and encryption are orthogonal concerns"
  - "injectBlindIndexFields exported for unit testing; called internally by extension"
  - "Dual-path query pattern: hash path (indexed) + plaintext fallback (unbackfilled rows)"

requirements-completed: [SEC-02]

# Metrics
duration: 14min
completed: 2026-03-04
---

# Phase 36 Plan 01: Encrypted Search Infrastructure Summary

**HMAC-SHA256 blind index on Email.from with per-tenant HKDF key derivation, Prisma extension auto-injection, dual-path HashSearchService, and backfill script**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-04T10:10:48Z
- **Completed:** 2026-03-04T10:24:55Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- hmacForBlindIndex function with case normalization and HMAC-SHA256 produces deterministic, key-isolated 64-char hex hashes
- TenantKeyService.getHmacKey derives keys with distinct HKDF info label (mailagent-blind-index-v1), cached per-tenant
- Prisma extension automatically injects fromHash on all Email write operations (create, update, upsert, createMany)
- HashSearchService provides dual-path WHERE clause builder for exact-match sender search, registered globally via PrismaModule
- Backfill script populates fromHash for existing emails per-tenant with idempotent skip+take pagination
- ADR-036 formally documents why subject stays plaintext, the HMAC design, and the threat model
- 67 total unit tests pass across 5 test suites

## Task Commits

Each task was committed atomically:

1. **Task 1: HMAC function + TenantKeyService.getHmacKey + schema migration + encryption config** - `3188d287` (feat)
2. **Task 2: Prisma extension blind index injection + PrismaService wiring** - `663cd3fb` (feat)
3. **Task 3: HashSearchService + backfill script + ADR + global DI registration** - `1da54a10` (feat)

## Files Created/Modified

- `backend/src/prisma/encryption/field-encryption.utils.ts` - Added hmacForBlindIndex, deprecated hashForSearch
- `backend/src/common/services/tenant-key.service.ts` - Added getHmacKey with HMAC_INFO_LABEL, hmacCache
- `backend/src/prisma/encryption/encryption.config.ts` - Added BlindIndexConfig, BLIND_INDEX_FIELDS, getBlindIndexFieldsForModel
- `backend/prisma/schema.prisma` - Added fromHash String? + @@index([tenantId, fromHash])
- `backend/prisma/migrations/20260304_add_from_hash/migration.sql` - Migration for fromHash column + index
- `backend/src/prisma/encryption/field-encryption.extension.ts` - Added injectBlindIndexFields, third getHmacKeyForTenant param
- `backend/src/prisma/prisma.service.ts` - Passes getHmacKey as third callback
- `backend/src/prisma/prisma.module.ts` - Registered TenantKeyService + HashSearchService globally
- `backend/src/common/services/hash-search.service.ts` - Dual-path exact-match sender query builder
- `backend/src/scripts/backfill-from-hash.ts` - Per-tenant backfill with skip+take, dry-run, batch-size
- `backend/docs/adr/036-encrypted-search.md` - Architecture decision record with threat model

## Decisions Made

- **HMAC-SHA256 over SHA-256**: Keyed hash prevents rainbow table attacks; key derived via HKDF ensures per-tenant isolation
- **Subject stays plaintext**: 17+ query sites use contains/insensitive on subject -- incompatible with deterministic hashing
- **HashSearchService in common/services**: Avoids circular dependency when CalendarModule, ContactsModule need sender lookup
- **Dual TenantKeyService instantiation**: PrismaService constructor cannot use DI (extends PrismaClient, must call super() first); both instances derive identical keys from same master key via deterministic HKDF
- **Manual Prisma migration**: Baseline migration shadow DB issue prevents `prisma migrate dev`; SQL created manually with CONCURRENTLY production note

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Prisma `migrate dev --create-only` failed due to baseline migration shadow DB error (P3006). Resolved by creating the migration SQL file manually, which is consistent with project precedent (Phase 31-02 used direct SQL).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All infrastructure for blind index search is in place
- Phase 36-02 can proceed to migrate exact-match sender query sites (meeting-prep, relationship-score) to use HashSearchService
- Backfill script ready to run: `npx ts-node backend/src/scripts/backfill-from-hash.ts`

## Self-Check: PASSED

All 11 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 36-encrypted-search*
*Completed: 2026-03-04*
