# Email-Sync Module Refactor Plan

**Date**: 2025-01-04
**Priority**: HIGH
**Estimated Time**: 25-35 hours
**Status**: PLANNED

---

## Zero-staging Comparison (Why They "Look" Simpler)

### Reality Check: Zero-staging ISN'T Smaller

| Driver | MailAgent | Zero-staging |
|--------|-----------|--------------|
| Google | 1127 lines | **1491 lines** |
| Microsoft | 993 lines | **1294 lines** |
| IMAP | 1968 lines | **N/A** (no IMAP) |

### Why It LOOKS Simpler

Zero-staging is a **thin API wrapper**, MailAgent is a **sync engine**:

| Feature | Zero-staging | MailAgent |
|---------|--------------|-----------|
| Store emails locally | ❌ No | ✅ PostgreSQL |
| Offline access | ❌ No | ✅ Yes |
| Background sync | ❌ No | ✅ BullMQ workers |
| Delta sync | ❌ Basic | ✅ Full with tokens |
| Race condition handling | ❌ Stateless | ✅ Redis locks |
| Multi-tenant | ❌ No | ✅ Yes |
| IMAP support | ❌ No | ✅ Full |

### Patterns to ADOPT from Zero-staging

#### 1. `withErrorHandler` Pattern

```typescript
// Centralized error handling - ADOPT THIS
private async withErrorHandler<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    this.logger.error(`Operation: ${operation}`, {
      error: error.message,
      code: error.code,
      context: this.sanitizeContext(context),
    });
    throw new StandardizedError(error, operation, context);
  }
}
```

#### 2. Effect Library for Concurrent Operations

```typescript
// Zero-staging uses Effect for parallel operations
const mainEffect = Effect.gen(function* () {
  const [result1, result2] = yield* Effect.all([
    effect1,
    effect2,
  ], { concurrency: 'unbounded' });
  return { result1, result2 };
});
```

#### 3. Standardized Error Class

```typescript
export class StandardizedError extends Error {
  code: string;
  operation: string;
  context?: Record<string, unknown>;
  originalError: unknown;
}
```

---

## Clean Refactoring Approach (2025 Best Practices)

**Sources**: [Adapter Pattern](https://refactoring.guru/design-patterns/adapter/typescript/example), [NestJS Refactoring](https://medium.com/@febriandwikimhan/b-1ab8f2daeff4), [Prisma Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

### Recommended Pattern: Adapter + Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    CLEAN ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              EmailDriverInterface                    │   │
│  │  (Port - defines what ALL drivers must do)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │GoogleAdapter│  │MSFTAdapter  │  │IMAPAdapter  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐        │
│  │ Operations  │  │ Operations  │  │ Operations  │        │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤        │
│  │ messages.ts │  │ messages.ts │  │ messages.ts │        │
│  │ folders.ts  │  │ folders.ts  │  │ folders.ts  │        │
│  │ sync.ts     │  │ sync.ts     │  │ connection.ts│       │
│  │ batch.ts    │  │ batch.ts    │  │ idle.ts     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Step 1: Create Base Operations (Day 1)

```typescript
// drivers/base/base-operations.ts (~150 lines)
export abstract class BaseOperations<TClient> {
  protected readonly logger: Logger;

  protected async withErrorHandler<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      this.logger.error(`[${this.constructor.name}] ${operation}`, {
        code: error.code,
        message: error.message,
        context: this.sanitizeContext(context),
      });
      throw new DriverError(error, operation, context);
    }
  }

  protected sanitizeContext(ctx?: Record<string, unknown>) {
    if (!ctx) return undefined;
    const sanitized = { ...ctx };
    ['token', 'password', 'secret', 'refreshToken'].forEach(k => {
      if (k in sanitized) sanitized[k] = '[REDACTED]';
    });
    return sanitized;
  }
}
```

### Step 2: Robust Prisma Retry Service (Day 1)

```typescript
// common/services/prisma-retry.service.ts
@Injectable()
export class PrismaRetryService {
  private readonly MAX_RETRIES = 5;

  async withRetry<T>(
    operation: () => Promise<T>,
    options?: { maxRetries?: number; context?: string }
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? this.MAX_RETRIES;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        // P2002 = unique constraint, P2034 = deadlock
        const isRetryable = ['P2002', 'P2034'].includes(error.code);

        if (isRetryable && attempt < maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt), 2000);
          this.logger.warn(`Prisma ${error.code} retry ${attempt}/${maxRetries}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError!;
  }
}
```

### Step 3: Standardized Driver Error (Day 1)

```typescript
// drivers/base/driver-error.ts
export class DriverError extends Error {
  readonly code: string;
  readonly operation: string;
  readonly context?: Record<string, unknown>;
  readonly originalError: unknown;
  readonly timestamp: Date;

  constructor(
    error: Error & { code?: string },
    operation: string,
    context?: Record<string, unknown>,
  ) {
    super(error?.message || 'Unknown driver error');
    this.name = 'DriverError';
    this.code = error?.code || 'UNKNOWN_ERROR';
    this.operation = operation;
    this.context = context;
    this.originalError = error;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      operation: this.operation,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}
```

### Refactor Execution Order

| Day | Hours | Task | Deliverable |
|-----|-------|------|-------------|
| 1 | 4 | Create base classes | `base-operations.ts`, `driver-error.ts`, `prisma-retry.service.ts` |
| 2-3 | 12 | Split IMAP driver | 7 files, orchestrator ~200 lines |
| 4 | 6 | Split Google driver | 6 files |
| 5 | 5 | Split Microsoft driver | 6 files |
| 6 | 4 | Race conditions + cleanup | RC-A1, RC-A8, empty catches |

### Target File Structure

```
drivers/
├── base/
│   ├── base-operations.ts        # withErrorHandler, sanitize
│   ├── driver-error.ts           # StandardizedError class
│   └── index.ts
│
├── google/
│   ├── google.driver.ts          # Orchestrator (~150 lines)
│   ├── google-messages.ops.ts    # Message CRUD (~300 lines)
│   ├── google-folders.ops.ts     # Label operations (~150 lines)
│   ├── google-sync.ops.ts        # Delta sync (~200 lines)
│   ├── google-batch.ops.ts       # Batch operations (~200 lines)
│   ├── google-converters.ts      # Label/message mapping (~150 lines)
│   └── index.ts
│
├── microsoft/
│   ├── microsoft.driver.ts       # Orchestrator (~150 lines)
│   ├── microsoft-messages.ops.ts
│   ├── microsoft-folders.ops.ts
│   ├── microsoft-sync.ops.ts
│   ├── microsoft-batch.ops.ts
│   ├── microsoft-converters.ts
│   └── index.ts
│
├── imap/
│   ├── imap.driver.ts            # Orchestrator (~200 lines)
│   ├── imap-connection.pool.ts   # Connection pooling (~300 lines)
│   ├── imap-messages.ops.ts      # Message operations (~400 lines)
│   ├── imap-folders.ops.ts       # Folder operations (~200 lines)
│   ├── imap-flags.ops.ts         # Flag operations (~150 lines)
│   ├── imap-idle.handler.ts      # IDLE subscription (~200 lines)
│   ├── imap-smtp.sender.ts       # SMTP sending (~200 lines)
│   └── index.ts
│
└── interfaces/
    ├── email-driver.interface.ts # Main contract
    ├── operations.interface.ts   # Operation contracts (NEW)
    └── canonical.types.ts        # Shared types
```

---

## Executive Summary

The `email-sync/drivers` folder contains god classes that violate the 500-line limit and Single Responsibility Principle. This document provides a complete refactor plan.

---

## Current State (TERRIBLE)

```
drivers/
├── imap/imap.driver.ts      → 1968 lines (4x over limit!)
├── google/google.driver.ts  → 1127 lines (2x over limit!)
├── microsoft/microsoft.driver.ts → 993 lines (2x over limit!)
└── interfaces/              → OK
```

### Problems Identified

1. **God Classes**: Each driver has 20+ methods handling everything
2. **No Separation of Concerns**: Connection, messages, folders, sync all mixed
3. **Duplicate Logic**: Similar patterns repeated across drivers
4. **Hard to Test**: Monolithic classes are hard to unit test
5. **Hard to Maintain**: Changes risk breaking unrelated functionality

---

## Target Architecture

```
drivers/
├── base/
│   ├── base-connection.manager.ts    # Abstract connection handling
│   ├── base-message.operations.ts    # Abstract message CRUD
│   ├── base-folder.operations.ts     # Abstract folder CRUD
│   └── base-sync.operations.ts       # Abstract sync logic
│
├── imap/
│   ├── imap.driver.ts                # Orchestrator (~200 lines)
│   ├── imap-connection.manager.ts    # Pool management (~300 lines)
│   ├── imap-message.operations.ts    # Message CRUD (~400 lines)
│   ├── imap-folder.operations.ts     # Folder CRUD (~200 lines)
│   ├── imap-flag.operations.ts       # Flag operations (~150 lines)
│   ├── imap-idle.subscription.ts     # IDLE handling (~200 lines)
│   ├── imap-smtp.sender.ts           # SMTP send (~200 lines)
│   └── index.ts
│
├── google/
│   ├── google.driver.ts              # Orchestrator (~150 lines)
│   ├── google-message.operations.ts  # Message CRUD (~300 lines)
│   ├── google-folder.operations.ts   # Label operations (~150 lines)
│   ├── google-batch.operations.ts    # Batch operations (~200 lines)
│   ├── google-sync.operations.ts     # Delta sync (~200 lines)
│   ├── google-converters.ts          # Label/message converters (~150 lines)
│   └── index.ts
│
├── microsoft/
│   ├── microsoft.driver.ts           # Orchestrator (~150 lines)
│   ├── microsoft-message.operations.ts
│   ├── microsoft-folder.operations.ts
│   ├── microsoft-batch.operations.ts
│   ├── microsoft-sync.operations.ts  # Delta link sync
│   ├── microsoft-converters.ts
│   └── index.ts
│
├── interfaces/
│   ├── email-driver.interface.ts     # Main interface (keep)
│   ├── canonical.types.ts            # Canonical types (keep)
│   ├── connection.interface.ts       # NEW: Connection contracts
│   ├── operations.interface.ts       # NEW: Operation contracts
│   └── index.ts
│
├── driver.factory.ts                 # Keep (66 lines - OK)
└── drivers.module.ts                 # Update imports
```

---

## Phase 1: IMAP Driver Split (12-15 hours)

### 1.1 Create Base Abstractions

```typescript
// base/base-connection.manager.ts (~100 lines)
export abstract class BaseConnectionManager<TClient> {
  protected readonly logger: Logger;

  abstract connect(credentials: DriverCredentials): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  abstract withConnection<T>(fn: (client: TClient) => Promise<T>): Promise<T>;
}
```

### 1.2 Extract IMAP Connection Manager

**From**: `imap.driver.ts` lines 69-590
**To**: `imap/imap-connection.manager.ts`

```typescript
// imap/imap-connection.manager.ts (~300 lines)
@Injectable()
export class ImapConnectionManager extends BaseConnectionManager<ImapFlow> {
  private connectionPool: PooledConnection[] = [];
  private poolSemaphore: Semaphore;
  private imapConfig?: ImapConfig;
  private smtpConfig?: SmtpConfig;

  // Methods to extract:
  // - connect()
  // - disconnect()
  // - acquireConnection()
  // - releaseConnection()
  // - cleanupIdleConnections()
  // - withConnection()
  // - detectServerCapabilities()
}
```

### 1.3 Extract IMAP Message Operations

**From**: `imap.driver.ts` lines 839-1200
**To**: `imap/imap-message.operations.ts`

```typescript
// imap/imap-message.operations.ts (~400 lines)
@Injectable()
export class ImapMessageOperations {
  constructor(private readonly connectionManager: ImapConnectionManager) {}

  // Methods to extract:
  // - listMessages()
  // - getMessage()
  // - sendMessage()
  // - saveDraft()
  // - sendDraft()
  // - moveMessage()
  // - copyMessage()
  // - deleteMessage()
}
```

### 1.4 Extract IMAP Folder Operations

**From**: `imap.driver.ts` lines 651-838
**To**: `imap/imap-folder.operations.ts`

```typescript
// imap/imap-folder.operations.ts (~200 lines)
@Injectable()
export class ImapFolderOperations {
  constructor(private readonly connectionManager: ImapConnectionManager) {}

  // Methods to extract:
  // - listFolders()
  // - getFolder()
  // - createFolder()
  // - deleteFolder()
  // - renameFolder()
  // - pathToCanonicalFolder()
}
```

### 1.5 Extract IMAP Flag Operations

**From**: `imap.driver.ts` lines 1158-1350
**To**: `imap/imap-flag.operations.ts`

```typescript
// imap/imap-flag.operations.ts (~150 lines)
@Injectable()
export class ImapFlagOperations {
  constructor(private readonly connectionManager: ImapConnectionManager) {}

  // Methods to extract:
  // - setReadStatus()
  // - setStarredStatus()
  // - setFlaggedStatus()
  // - batchSetReadStatus()
  // - batchSetStarredStatus()
}
```

### 1.6 Extract IMAP IDLE Subscription

**From**: `imap.driver.ts` lines 216-406
**To**: `imap/imap-idle.subscription.ts`

```typescript
// imap/imap-idle.subscription.ts (~200 lines)
@Injectable()
export class ImapIdleSubscription {
  private idleConnection?: ImapFlow;
  private idleCallback?: ChangeCallback;
  private idleActive = false;

  // Methods to extract:
  // - subscribeToChanges()
  // - setupIdleEventHandlers()
  // - stopIdleSubscription()
}
```

### 1.7 Extract SMTP Sender

**From**: `imap.driver.ts` lines 1006-1072
**To**: `imap/imap-smtp.sender.ts`

```typescript
// imap/imap-smtp.sender.ts (~200 lines)
@Injectable()
export class ImapSmtpSender {
  constructor(private readonly connectionManager: ImapConnectionManager) {}

  // Methods to extract:
  // - sendMessage()
  // - saveDraft()
  // - buildMimeMessage()
}
```

### 1.8 Refactor IMAP Driver as Orchestrator

```typescript
// imap/imap.driver.ts (~200 lines)
@Injectable()
export class IMAPDriver implements EmailDriver {
  constructor(
    private readonly connectionManager: ImapConnectionManager,
    private readonly messageOps: ImapMessageOperations,
    private readonly folderOps: ImapFolderOperations,
    private readonly flagOps: ImapFlagOperations,
    private readonly idleSub: ImapIdleSubscription,
    private readonly smtpSender: ImapSmtpSender,
  ) {}

  // Delegate all methods to sub-components
  async connect(credentials: DriverCredentials): Promise<void> {
    return this.connectionManager.connect(credentials);
  }

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.messageOps.listMessages(options);
  }

  // ... etc
}
```

---

## Phase 2: Google Driver Split (6-8 hours)

### 2.1 Extract Google Message Operations

**From**: `google.driver.ts` lines 147-408
**To**: `google/google-message.operations.ts`

### 2.2 Extract Google Folder Operations

**From**: `google.driver.ts` lines 73-146
**To**: `google/google-folder.operations.ts`

### 2.3 Extract Google Batch Operations

**From**: `google.driver.ts` lines 476-565
**To**: `google/google-batch.operations.ts`

### 2.4 Extract Google Sync Operations

**From**: `google.driver.ts` lines 566-756
**To**: `google/google-sync.operations.ts`

### 2.5 Extract Google Converters

**From**: `google.driver.ts` lines 757-900+
**To**: `google/google-converters.ts`

---

## Phase 3: Microsoft Driver Split (5-7 hours)

Similar pattern to Google driver.

---

## Phase 4: Fix Race Conditions (3-4 hours)

### RC-A1: FolderSyncService Parallel Upserts

**File**: `services/folder-sync.service.ts`
**Line**: 278-341

```typescript
// BEFORE (vulnerable)
async syncProviderFolders(tenantId: string, providerId: string): Promise<void> {
  // No locking - race condition!
  const folders = await driver.listFolders();
  await this.upsertFolders(folders);
}

// AFTER (fixed)
async syncProviderFolders(tenantId: string, providerId: string): Promise<void> {
  const lockKey = `folder-sync:${providerId}`;
  await this.redisLock.withLock(lockKey, 30000, async () => {
    const folders = await driver.listFolders();
    await this.upsertFolders(folders);
  });
}
```

### RC-A8: FolderSyncService CRUD No Locking

**File**: `services/folder-sync.service.ts`
**Lines**: 1042-1208

```typescript
// Add per-provider lock for folder CRUD
async createFolder(providerId: string, name: string): Promise<Folder> {
  const lockKey = `folder-crud:${providerId}`;
  return this.redisLock.withLock(lockKey, 10000, async () => {
    return this.prisma.folder.create({ ... });
  });
}
```

---

## Phase 5: Code Quality Fixes (2-3 hours)

### 5.1 Empty Catch Blocks (12 locations)

**Files**:
- `imap.driver.ts`: lines 459, 733, 740, 757, 766, 791, 858, 1053, 1550
- `google.driver.ts`: lines 58, 97, 465

**Fix Pattern**:
```typescript
// BEFORE
} catch {
  // Silent failure
}

// AFTER
} catch (error) {
  this.logger.debug(`Non-critical error: ${error instanceof Error ? error.message : String(error)}`);
}
```

### 5.2 Italian Typo

**File**: `base-email-sync.service.ts`
**Line**: 1218

```typescript
// BEFORE
'post indiserata'

// AFTER
'posta indesiderata'
```

---

## Testing Strategy

### Unit Tests Required

1. Each new operations class needs unit tests
2. Mock connection manager for isolation
3. Test error handling paths

### Integration Tests

1. Test driver orchestration
2. Test connection pooling
3. Test concurrent operations

### Regression Tests

1. Run existing email-sync tests after each phase
2. Stress test with `stress-test-atomic-sync.ts`

---

## Migration Checklist

### Before Starting
- [ ] Create git branch: `refactor/email-sync-drivers`
- [ ] Run full test suite - baseline
- [ ] Document current behavior

### Phase 1 (IMAP)
- [ ] Create base abstractions
- [ ] Extract ImapConnectionManager
- [ ] Extract ImapMessageOperations
- [ ] Extract ImapFolderOperations
- [ ] Extract ImapFlagOperations
- [ ] Extract ImapIdleSubscription
- [ ] Extract ImapSmtpSender
- [ ] Refactor IMAPDriver as orchestrator
- [ ] Update imports in drivers.module.ts
- [ ] Run tests - verify no regression

### Phase 2 (Google)
- [ ] Extract GoogleMessageOperations
- [ ] Extract GoogleFolderOperations
- [ ] Extract GoogleBatchOperations
- [ ] Extract GoogleSyncOperations
- [ ] Extract GoogleConverters
- [ ] Refactor GoogleDriver as orchestrator
- [ ] Run tests - verify no regression

### Phase 3 (Microsoft)
- [ ] Extract MicrosoftMessageOperations
- [ ] Extract MicrosoftFolderOperations
- [ ] Extract MicrosoftBatchOperations
- [ ] Extract MicrosoftSyncOperations
- [ ] Extract MicrosoftConverters
- [ ] Refactor MicrosoftDriver as orchestrator
- [ ] Run tests - verify no regression

### Phase 4 (Race Conditions)
- [ ] Add RedisLockService to FolderSyncService
- [ ] Fix RC-A1: syncProviderFolders locking
- [ ] Fix RC-A8: folder CRUD locking
- [ ] Run stress test

### Phase 5 (Code Quality)
- [ ] Add logging to 12 empty catch blocks
- [ ] Fix Italian typo
- [ ] Run lint and type-check

### After Completion
- [ ] Update README.md
- [ ] Create PR with full description
- [ ] Code review
- [ ] Merge to main

---

## File Line Count Targets

| File | Current | Target | Status |
|------|---------|--------|--------|
| imap.driver.ts | 1968 | ~200 | 🔴 |
| imap-connection.manager.ts | - | ~300 | NEW |
| imap-message.operations.ts | - | ~400 | NEW |
| imap-folder.operations.ts | - | ~200 | NEW |
| imap-flag.operations.ts | - | ~150 | NEW |
| imap-idle.subscription.ts | - | ~200 | NEW |
| imap-smtp.sender.ts | - | ~200 | NEW |
| google.driver.ts | 1127 | ~150 | 🔴 |
| google-message.operations.ts | - | ~300 | NEW |
| google-folder.operations.ts | - | ~150 | NEW |
| google-batch.operations.ts | - | ~200 | NEW |
| google-sync.operations.ts | - | ~200 | NEW |
| google-converters.ts | - | ~150 | NEW |
| microsoft.driver.ts | 993 | ~150 | 🔴 |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regression bugs | Medium | High | Comprehensive tests before/after |
| Broken imports | Low | Medium | TypeScript compiler catches |
| Performance degradation | Low | Medium | Benchmark before/after |
| Incomplete extraction | Medium | Low | Checklist + code review |

---

## References

- **Audit Report**: `docs/EMAIL_SYNC_COMPREHENSIVE_AUDIT_2025-01-04.md`
- **Atomic Sync Fixes**: `docs/ATOMIC_SYNC_FIXES_2025-01-04.md`
- **Memory Keys**:
  - `email-sync-audit-2025-01-04`
  - `email-sync-priority-fixes-2025-01-04`
  - `common-module-integration-2025-01-04`

---

## Appendix: Quick Commands

```bash
# Check current line counts
find backend/src/modules/email-sync/drivers -name "*.ts" -exec wc -l {} \; | sort -rn

# Run tests
npm run test -- --testPathPattern=email-sync

# Type check
npm run type-check

# Lint
npm run lint -- backend/src/modules/email-sync

# Stress test
npx ts-node backend/scripts/stress-test-atomic-sync.ts

# Query memory
npx claude-flow@alpha memory query "email-sync" --namespace mailagent
```
