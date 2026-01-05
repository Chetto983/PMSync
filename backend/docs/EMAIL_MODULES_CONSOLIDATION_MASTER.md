# Email Modules Consolidation Master Plan

**Date**: 2025-01-04
**Modules**: `email` + `email-sync`
**Status**: PLANNING (no code changes yet)

---

## Executive Summary

Both email modules need consolidation to eliminate ~365 lines of duplicated code across shared utilities. This document consolidates all audit findings and defines the consolidation strategy.

---

## Consolidation Strategy (2025 Best Practices)

Based on research from [NestJS Module Best Practices](https://blog.bytescrum.com/nestjs-module-best-practices-for-clean-code-organization) and [Monorepo Architecture Guide 2025](https://feature-sliced.design/blog/frontend-monorepo-explained):

### Pattern: Shared Module + Core Module

```
backend/src/
├── common/                    # @Global() shared module
│   ├── utils/                 # Pure utility functions
│   │   ├── imap-utils.ts      # parseImapExternalId
│   │   ├── folder-utils.ts    # normalizeFolderName
│   │   ├── error-utils.ts     # isNotFoundError, isRateLimitError
│   │   └── string-utils.ts    # truncateText
│   ├── services/              # Shared injectable services
│   │   ├── prisma-retry.service.ts  # P2002/P2034 retry
│   │   └── redis-lock.service.ts    # Already exists
│   └── errors/
│       └── driver-error.ts    # StandardizedError class
│
├── modules/
│   ├── email/                 # Email CRUD module
│   │   └── services/          # Uses common/utils
│   └── email-sync/            # Sync engine module
│       └── drivers/           # Uses common/utils
```

### Key Principles

1. **Single Source of Truth**: Each utility exists in ONE place only
2. **Pure Functions in Utils**: No dependencies, easily testable
3. **Services for Stateful Logic**: Injectable, mockable
4. **Feature Cohesion**: Keep related code together

---

## Module Audit Summary

### Email Module (`modules/email`)

| Metric | Value |
|--------|-------|
| Quality Score | 7.5/10 |
| Files | 23 |
| Total Lines | ~8,500 |
| God Classes | 3 (emails.service.ts, email-sync-back.service.ts, emails.controller.ts) |
| Race Conditions | 7 found, 7 fixed |
| Atomic Operations | 8.6/10 |
| Internal Duplication | ~200 lines |

### Email-Sync Module (`modules/email-sync`)

| Metric | Value |
|--------|-------|
| Quality Score | 7.5/10 |
| Files | 52 |
| Total Lines | ~12,000 |
| God Classes | 3 (imap.driver.ts, google.driver.ts, microsoft.driver.ts) |
| Race Conditions | 6 open / 5 fixed |
| Atomic Operations | 8/10 |
| Internal Duplication | ~150 lines |

---

## Cross-Module Duplication Map

### CRITICAL: Must Consolidate

| Code | Current Locations | Lines | Target Location |
|------|-------------------|-------|-----------------|
| `parseImapExternalId` | email-fetch.service.ts:246, attachment-on-demand.service.ts:453, base-email-sync.service.ts:588 | 110 | `common/utils/imap-utils.ts` (canonical exists at email-sync/utils/imap.utils.ts) |
| `normalizeFolderName` | base-email-sync.service.ts:1173, folder-sync.service.ts:856 | 68 | `common/utils/folder-utils.ts` |
| `extractPlainText` | base-email-sync.service.ts:1314-1346 | 32 | **DELETE** (dead code, never called) |
| `isNotFoundError` | base-email-sync.service.ts:1255 + inline in email module | 20 | `common/utils/error-utils.ts` |
| `isRateLimitError` | base-email-sync.service.ts:1282 | 12 | `common/utils/error-utils.ts` |
| `isServerError` | base-email-sync.service.ts:1301 | 6 | `common/utils/error-utils.ts` |
| `truncateText` | base-email-sync.service.ts:1355 | 6 | `common/utils/string-utils.ts` |

### HIGH: Should Consolidate

| Code | Current Locations | Lines | Target Location |
|------|-------------------|-------|-----------------|
| IMAP Connection Setup | email-fetch.service.ts:195, email-sync-back.service.ts:593, attachment-on-demand.service.ts:347 | 40 | `common/services/imap-client.factory.ts` |
| Provider Fetch Logic | email-fetch.service.ts:93, attachment-on-demand.service.ts:470 | 148 | Consider `ProviderFetchService` |
| Folder Path Lookup | emails.service.ts (3 methods) | 36 | Use existing `FolderLookupService` |
| Provider Validation | emails.service.ts, email-send.service.ts (6+ instances) | 60 | Use existing `ProviderValidationService` |
| Token Refresh Logic | email-sync-back.service.ts:189-294 | 80 | Use `provider-token.service.ts` |

**Total Reducible: ~280 lines**

---

## Race Conditions Status

### Email Module (ALL FIXED)

| RC# | Location | Fix Applied |
|-----|----------|-------------|
| RC-1 | scheduled-email.service.ts:145 | `FOR UPDATE SKIP LOCKED` |
| RC-2 | email-sync-back.service.ts:189 | Redis distributed lock |
| RC-3 | emails.service.ts:542 | `FOR UPDATE` transaction |
| RC-4 | email-cleanup.service.ts:137 | Sequential + idempotent |
| RC-5 | email-sync-back.service.ts:117 | Per-email Redis lock |
| RC-6 | emails.service.ts:933 | UUID instead of timestamp |
| RC-7 | emails.controller.ts:439 | `FOR UPDATE` in transaction |

### Email-Sync Module (NEED FIXING)

| RC# | Location | Status | Fix Needed |
|-----|----------|--------|------------|
| RC-A1 | folder-sync.service.ts | OPEN | Add Redis lock for parallel upserts |
| RC-A8 | folder-sync.service.ts | OPEN | Add locking for folder CRUD |
| RC-A2 | base-email-sync.service.ts | FIXED | DEDUP-FIX with Set |
| RC-A3 | base-email-sync.service.ts | FIXED | P2002 retry logic |
| Others | Various | FIXED | Redis locks |

---

## God Classes to Split

### Email Module

| File | Lines | Split Into |
|------|-------|------------|
| emails.service.ts | 1998 | EmailQueryService, EmailMutationService, EmailDraftService, EmailConversationService |
| email-sync-back.service.ts | 1397 | Keep but extract getValidAccessToken to ProviderTokenService |
| emails.controller.ts | 1080 | EmailsController, EmailBulkController, EmailCalendarController |

### Email-Sync Module

| File | Lines | Split Into |
|------|-------|------------|
| imap.driver.ts | 1968 | 7 files: imap-connection.pool.ts, imap-messages.ops.ts, imap-folders.ops.ts, imap-flags.ops.ts, imap-idle.handler.ts, imap-smtp.sender.ts |
| google.driver.ts | 1127 | 6 files: google-messages.ops.ts, google-folders.ops.ts, google-sync.ops.ts, google-batch.ops.ts, google-converters.ts |
| microsoft.driver.ts | 993 | 6 files: similar structure to Google |

---

## Consolidation Execution Order

### Phase 1: Create Common Utils (2 hours)

**No breaking changes - just add new files**

1. Create `common/utils/imap-utils.ts` - export parseImapExternalId
2. Create `common/utils/folder-utils.ts` - export normalizeFolderName
3. Create `common/utils/error-utils.ts` - export isNotFoundError, isRateLimitError, isServerError
4. Create `common/utils/string-utils.ts` - export truncateText
5. Create `common/errors/driver-error.ts` - StandardizedError class

### Phase 2: Update Imports (3 hours)

**Replace duplicates with imports from common**

| File | Change |
|------|--------|
| email-fetch.service.ts | Import parseImapExternalId from common |
| attachment-on-demand.service.ts | Import parseImapExternalId from common |
| base-email-sync.service.ts | Import all utils from common, DELETE inline versions |
| folder-sync.service.ts | Import normalizeFolderName from common |

### Phase 3: Delete Dead Code (30 min)

1. Delete `extractPlainText` from base-email-sync.service.ts:1314-1346

### Phase 4: Fix Remaining Race Conditions (2 hours)

1. RC-A1: Add Redis lock to folder-sync.service.ts parallel upserts
2. RC-A8: Add locking to folder CRUD operations

### Phase 5: Split God Classes (20+ hours)

Follow the plan in EMAIL_SYNC_REFACTOR_PLAN.md

---

## Existing Documentation Index

### Core Docs

| Document | Purpose | Status |
|----------|---------|--------|
| [EMAIL_SYNC_MASTER_INDEX.md](./EMAIL_SYNC_MASTER_INDEX.md) | Single source for email-sync | CURRENT |
| [EMAIL_SYNC_REFACTOR_PLAN.md](./EMAIL_SYNC_REFACTOR_PLAN.md) | Driver split roadmap | PLANNED |
| [EMAIL_SYNC_COMPREHENSIVE_AUDIT_2025-01-04.md](./EMAIL_SYNC_COMPREHENSIVE_AUDIT_2025-01-04.md) | Full audit | COMPLETE |
| [ATOMIC_SYNC_FIXES_2025-01-04.md](./ATOMIC_SYNC_FIXES_2025-01-04.md) | DEDUP-FIX, P2002 | DONE |

### Gmail Specific

| Document | Purpose |
|----------|---------|
| [GMAIL_FOLDER_MAPPING_AUDIT.md](./GMAIL_FOLDER_MAPPING_AUDIT.md) | Label/folder mapping |
| [GMAIL_FIXES_FINAL_STATUS.md](./GMAIL_FIXES_FINAL_STATUS.md) | Fix status |
| [GMAIL_FOLDER_COUNT_FIX.md](./GMAIL_FOLDER_COUNT_FIX.md) | Count fix |

### Backend General

| Document | Purpose |
|----------|---------|
| [EMAIL_BACKEND_COMPREHENSIVE_AUDIT.md](./EMAIL_BACKEND_COMPREHENSIVE_AUDIT.md) | Backend overview |
| [EMAIL_BACKEND_DATA_FLOW.md](./EMAIL_BACKEND_DATA_FLOW.md) | Data flow diagram |
| [EMAIL_BACKEND_QUICK_REFERENCE.md](./EMAIL_BACKEND_QUICK_REFERENCE.md) | Quick reference |
| [BACKEND_VALIDATION_PLAN.md](./BACKEND_VALIDATION_PLAN.md) | Testing plan |

---

## Memory Keys (ReasoningBank)

Query: `npx claude-flow@alpha memory query "<search>" --namespace mailagent`

| Key | Content |
|-----|---------|
| `email-sync-audit-2025-01-04` | Full email-sync audit results |
| `email-sync-priority-fixes-2025-01-04` | Action items list |
| `common-module-integration-2025-01-04` | Common services analysis |
| `email-sync-refactor-plan-2025-01-04` | Refactor roadmap |
| `email-module-audit-2025-01-04` | Email module bugs/race conditions |
| `email-duplication-map-2025-01-04` | Cross-module duplication map |
| `consolidation-strategy-2025-01-04` | This consolidation plan |

---

## Quick Reference: What Goes Where

```
BEFORE (duplicated):
├── email/services/email-fetch.service.ts        → parseImapExternalId (line 246)
├── email/services/attachment-on-demand.service.ts → parseImapExternalId (line 453)
├── email-sync/services/base-email-sync.service.ts → parseImapExternalId (line 588)
│                                                  → normalizeFolderName (line 1173)
│                                                  → extractPlainText (line 1314) [DEAD]
│                                                  → isNotFoundError (line 1255)
├── email-sync/services/folder-sync.service.ts    → normalizeFolderName (line 856)
└── email-sync/utils/imap.utils.ts               → parseImapExternalId (CANONICAL)

AFTER (consolidated):
├── common/utils/
│   ├── imap-utils.ts      → parseImapExternalId (SINGLE SOURCE)
│   ├── folder-utils.ts    → normalizeFolderName (SINGLE SOURCE)
│   ├── error-utils.ts     → isNotFoundError, isRateLimitError, isServerError
│   └── string-utils.ts    → truncateText
├── common/errors/
│   └── driver-error.ts    → StandardizedError
└── All services import from common/
```

---

## Estimated Timeline

| Phase | Hours | Risk |
|-------|-------|------|
| 1. Create common utils | 2 | LOW |
| 2. Update imports | 3 | LOW |
| 3. Delete dead code | 0.5 | LOW |
| 4. Fix race conditions | 2 | MEDIUM |
| 5. Split god classes | 20-25 | HIGH |
| **Total** | **27.5-32.5** | - |

---

## Sources

- [NestJS Module Best Practices](https://blog.bytescrum.com/nestjs-module-best-practices-for-clean-code-organization)
- [NestJS Modular Architecture](https://levelup.gitconnected.com/nest-js-and-modular-architecture-principles-and-best-practices-806c2cb008d5)
- [Monorepo Architecture 2025](https://feature-sliced.design/blog/frontend-monorepo-explained)
- [TypeScript Monorepos](https://www.robinwieruch.de/javascript-monorepos/)
- [Nx Managing TS Packages](https://nx.dev/blog/managing-ts-packages-in-monorepos)
- [NestJS Official Docs - Modules](https://docs.nestjs.com/modules)

---

## Prisma 7.2.0 Status

**Version**: @prisma/client 7.2.0 (December 2025)

### What's New in Prisma 7

| Feature | Status | Impact |
|---------|--------|--------|
| Rust-free client | ✅ Default | Faster installs, simpler deploys |
| Driver adapters | ✅ Required | Using @prisma/adapter-pg |
| output field | ✅ Required | Must specify in generator |
| SQL Comments | ✅ Available | Better query tracing |
| Mapped enums | ✅ Available | @map for enum members |

### Transaction/Error Handling (UNCHANGED from v6)

Prisma 7 still uses same error codes - **NO auto-retry built in**:
- **P2002**: Unique constraint violation → needs manual retry
- **P2034**: Deadlock/write conflict → needs manual retry

**Current MailAgent Implementation**:
- P2002 retry: ✅ OK at `base-email-sync.service.ts:1036-1068`
- P2034 retry: ⚠️ MISSING - should add

### Prisma 7 Sources

- [Prisma 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma 7.2.0 Release](https://www.prisma.io/blog/announcing-prisma-orm-7-2-0)
- [Upgrade to Prisma 7](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma Transactions Docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

---

*This document is the single source of truth for email module consolidation. Update after each phase completion.*
