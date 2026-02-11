---
phase: 14-database-encryption-at-rest
plan: 01
subsystem: database, crypto
tags: [aes-256-gcm, hkdf, encryption, field-encryption, per-tenant-keys]

requires:
  - phase: 13-pii-tokenization-foundation
    provides: PII detection patterns inform which fields need encryption
provides:
  - TenantKeyService for per-tenant HKDF key derivation with keychain rotation
  - AES-256-GCM encrypt/decrypt utilities with enc: prefix marker
  - Encrypted field configuration map (Tier 1: bodyText, bodyHtml, snippet)
  - FIELD_ENCRYPTION_MASTER_KEY / FIELD_ENCRYPTION_OLD_KEYS env var registration
affects: [14-02, 14-03, 14-04, prisma-middleware, email-sync]

tech-stack:
  added: []
  patterns: [HKDF per-tenant key derivation, AES-256-GCM with enc: prefix, jest.isolateModules for config mocking]

key-files:
  created:
    - backend/src/common/services/tenant-key.service.ts
    - backend/src/prisma/encryption/field-encryption.utils.ts
    - backend/src/prisma/encryption/encryption.config.ts
    - backend/src/common/services/__tests__/tenant-key.service.spec.ts
    - backend/src/prisma/encryption/__tests__/field-encryption.utils.spec.ts
  modified:
    - backend/src/config/env.validation.ts
    - backend/src/config/configuration.ts

key-decisions:
  - "jest.isolateModules for TenantKeyService tests: jest.mock singleton caching prevents per-test config changes"
  - "isEnabled getter on TenantKeyService: allows downstream code to skip encryption when master key not configured"
  - "Encryption opt-in: empty master key disables service gracefully instead of throwing"

patterns-established:
  - "enc: prefix detection: all encrypted values start with enc: for migration coexistence"
  - "Keychain rotation: decrypt tries current key first, then old keys in order"
  - "jest.isolateModules + jest.doMock: pattern for testing services that read config at construction time"

duration: 6min
completed: 2026-02-11
---

# Phase 14 Plan 01: Encryption Foundation Summary

**Per-tenant HKDF key derivation via TenantKeyService, AES-256-GCM encrypt/decrypt utilities with enc: prefix marker, and Tier 1 field configuration map (bodyText/bodyHtml/snippet)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-11T10:53:06Z
- **Completed:** 2026-02-11T10:59:24Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- TenantKeyService derives per-tenant 256-bit keys from master key via HKDF-SHA256 with in-memory caching
- AES-256-GCM encryption with random IV, auth tag, and enc: prefix for migration coexistence
- Multi-key decryption supports keychain rotation (current + old master keys)
- Encrypted field config maps Tier 1 Email fields (bodyText, bodyHtml, snippet) — no query impact
- 20 unit tests verify deterministic derivation, tenant isolation, round-trip, prefix detection, and hash consistency
- Zero new dependencies — uses only Node.js built-in crypto module

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TenantKeyService with HKDF key derivation and keychain rotation** - `e79883ec` (feat)
2. **Task 2: Create AES-256-GCM encryption utilities and field config map** - `9b5b9291` (feat)
3. **Task 3: Add unit tests for TenantKeyService and encryption utilities** - `78bfb634` (test)

## Files Created/Modified

- `backend/src/common/services/tenant-key.service.ts` - Per-tenant HKDF key derivation with cache and keychain rotation
- `backend/src/prisma/encryption/field-encryption.utils.ts` - AES-256-GCM encrypt/decrypt/isEncrypted/hashForSearch
- `backend/src/prisma/encryption/encryption.config.ts` - Tier 1 encrypted field mapping (Email model)
- `backend/src/config/env.validation.ts` - Added FIELD_ENCRYPTION_MASTER_KEY and FIELD_ENCRYPTION_OLD_KEYS
- `backend/src/config/configuration.ts` - Added fieldEncryption config block + production validation
- `backend/src/common/services/__tests__/tenant-key.service.spec.ts` - 6 tests for key derivation service
- `backend/src/prisma/encryption/__tests__/field-encryption.utils.spec.ts` - 14 tests for encryption utilities

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| jest.isolateModules for TenantKeyService tests | jest.mock singleton caching prevents per-test config changes; isolateModules gives fresh module per test |
| isEnabled getter on TenantKeyService | Allows downstream code (Prisma middleware) to skip encryption when master key not configured |
| Encryption opt-in (empty key = disabled) | Graceful degradation instead of throwing — encryption is opt-in until migration completes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test isolation for TenantKeyService mock config**
- **Found during:** Task 3 (unit test creation)
- **Issue:** Original test approach with `jest.mock()` + `beforeEach(jest.resetModules())` failed because jest.mock factory is a singleton — config changes via `__setMasterKey()` were not reflected in re-required modules
- **Fix:** Replaced with `jest.isolateModules()` + `jest.doMock()` pattern, creating fresh module isolation per test
- **Files modified:** `backend/src/common/services/__tests__/tenant-key.service.spec.ts`
- **Verification:** All 6 TenantKeyService tests pass including keychain rotation and short key rejection
- **Committed in:** `78bfb634` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test approach)
**Impact on plan:** Test isolation fix was necessary for correctness. No scope creep.

## Issues Encountered

- Jest 30+ renamed `--testPathPattern` to `--testPathPatterns` — adjusted invocation accordingly

## User Setup Required

None — no external service configuration required. FIELD_ENCRYPTION_MASTER_KEY is opt-in and only needed when enabling encryption.

## Next Phase Readiness

- Encryption primitives ready for Plan 14-02 (Prisma middleware for transparent encrypt/decrypt)
- TenantKeyService ready for injection into middleware
- Field config map ready for model-specific encryption logic
- No blockers

## Self-Check: PASSED

- All 7 files verified present on disk
- All 3 task commits verified in git log (e79883ec, 9b5b9291, 78bfb634)
- Type check passes (npx tsc --noEmit)
- All 20 tests pass (2 suites)

---
*Phase: 14-database-encryption-at-rest*
*Completed: 2026-02-11*
