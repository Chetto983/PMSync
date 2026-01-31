# Phase 3: IMAP Driver Split - Research

## Purpose

This document captures research findings to inform the planning of Phase 3: IMAP Driver Split. The goal is to decompose the 2,250-line `imap.driver.ts` into focused modules (<500 lines each) while maintaining a backward-compatible facade that preserves the existing `IEmailDriver` interface.

---

## 1. Current State Analysis

### 1.1 IMAP Driver Structure (2,250 lines)

The driver is located at: `backend/src/modules/email-sync/drivers/imap/imap.driver.ts`

**Section Analysis by Line Count:**

| Section | Start Line | End Line | Lines | Description |
|---------|------------|----------|-------|-------------|
| Imports & Types | 1 | 73 | 73 | External dependencies, interfaces |
| Class Properties | 74 | 135 | 62 | Connection pool, config, IDLE state |
| Connection Lifecycle | 136 | 204 | 69 | `connect()`, `disconnect()` |
| IDLE / Real-time | 205 | 518 | 314 | `subscribeToChanges()`, IDLE handlers |
| Connection Pool | 519 | 679 | 161 | Pool management, semaphore, cleanup |
| Capability Detection | 680 | 747 | 68 | CONDSTORE/QRESYNC/IDLE detection |
| Folder Operations | 744 | 935 | 192 | `listFolders()`, CRUD, rename |
| Message Listing | 936 | 1200 | 265 | `listMessages()`, `getMessage()`, `batchGet` |
| Message Mutations | 1201 | 1355 | 155 | `sendMessage()`, draft, move, delete |
| Flags / Status | 1356 | 1398 | 43 | Read/starred/flagged status |
| Batch Operations | 1399 | 1502 | 104 | Batch read, move, delete |
| Attachments | 1503 | 1669 | 167 | `getAttachment()` with streaming |
| Sync (CONDSTORE) | 1670 | 1921 | 252 | `getChangesSince()`, sync tokens |
| User Info | 1922 | 1933 | 12 | `getUserInfo()` |
| Helper Methods | 1934 | 2250 | 317 | Parsing, formatting, RFC822 building |

### 1.2 Functional Group Analysis

Based on the section analysis, the driver can be split into these logical services:

| Proposed Service | Lines | Methods | Coupling |
|------------------|-------|---------|----------|
| `imap-connection-pool.service.ts` | ~230 | 8 | Low (stateless pool management) |
| `imap-folder.service.ts` | ~250 | 6 | Medium (needs connection pool) |
| `imap-message.service.ts` | ~450 | 12 | Medium (needs connection pool) |
| `imap-idle.service.ts` | ~320 | 8 | Medium (owns IDLE connection) |
| `imap-send.service.ts` | ~180 | 5 | Low (SMTP only, no pool needed) |
| `imap.driver.ts` (facade) | ~250 | Interface delegation | High (composes all services) |

**Total: ~1,680 lines** (reduced from 2,250 due to reduced duplication and cleaner separation)

### 1.3 External Dependencies

```typescript
// From package.json / imports
import { ImapFlow, MailboxObject } from 'imapflow';  // IMAP client
import { simpleParser } from 'mailparser';           // Email parsing
import * as nodemailer from 'nodemailer';            // SMTP sending
import { Semaphore, withTimeout } from 'async-mutex'; // Concurrency
```

- **ImapFlow**: Used throughout connection pool and all IMAP operations
- **nodemailer**: Only used in `sendMessage()` and related methods
- **async-mutex**: Only used in connection pool management

### 1.4 Internal Dependencies (Coupling Map)

```
imap.driver.ts
├── Connection Pool (private state)
│   ├── connectionPool: PooledConnection[]
│   ├── poolSemaphore: Semaphore
│   └── Used by: ALL folder/message/sync operations
│
├── IMAP Config (private state)
│   ├── imapConfig: host, port, secure, auth
│   └── Used by: acquireConnection(), startIdleConnection()
│
├── SMTP Config (private state)
│   ├── smtpConfig: host, port, secure, auth
│   └── Used by: sendMessage() ONLY
│
├── IDLE State (private state)
│   ├── idleConnection, idleCallback, idleFolder
│   └── Used by: subscribeToChanges(), IDLE handlers ONLY
│
├── Folder Cache (private state)
│   └── Used by: listFolders(), resolveFolder()
│
└── Server Capabilities (private state)
    └── Used by: detectServerCapabilities(), getChangesSince()
```

### 1.5 Consumers of IMAPDriver

From grep analysis, the driver is consumed by:

1. **EmailDriverFactory** (`driver.factory.ts`): Creates new driver instances
2. **ImapSyncService** (`imap-sync.service.ts`): Uses driver for sync operations
3. **ImapAttachmentHandler** (`imap-attachment-handler.ts`): Uses driver for attachment fetching

**Critical Constraint**: The `IEmailDriver` interface must remain unchanged. All consumers expect the same public API.

---

## 2. NestJS Service Splitting Patterns

### 2.1 The Facade Pattern for Backward Compatibility

From [CodeSignal](https://codesignal.com/learn/courses/backward-compatibility-in-software-development-with-typescript/lessons/leveraging-facade-and-adapter-patterns-for-backward-compatibility-in-typescript) and [Refactoring Guru](https://refactoring.guru/design-patterns/facade/typescript/example):

> The Facade pattern ensures backward compatibility by consolidating complex subsystem interactions behind a simple interface. This allows the underlying subsystems to evolve independently without necessitating changes to the client code.

**Pattern for IMAPDriver:**

```typescript
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  constructor(
    private readonly connectionPool: ImapConnectionPoolService,
    private readonly folderService: ImapFolderService,
    private readonly messageService: ImapMessageService,
    private readonly idleService: ImapIdleService,
    private readonly sendService: ImapSendService,
  ) {
    super();
  }

  // Delegate all interface methods to sub-services
  async listFolders(): Promise<CanonicalFolder[]> {
    return this.folderService.listFolders();
  }

  async getMessage(id: string): Promise<CanonicalMessage | null> {
    return this.messageService.getMessage(id);
  }

  // ... all other IEmailDriver methods
}
```

### 2.2 NestJS Module Organization

From [NestJS Documentation](https://docs.nestjs.com/modules) and [Large-Scale Project Structure](https://medium.com/@itsspss/large-scale-react-zustand-nest-js-project-structure-and-best-practices-93397fb473f4):

> NestJS applications benefit from a modular architecture. Each feature or domain gets its own module, encapsulating everything related to that part of the system.

**Recommended Structure:**

```
backend/src/modules/email-sync/drivers/imap/
├── index.ts                         # Barrel export
├── imap.driver.ts                   # Facade (thin, <250 lines)
├── services/
│   ├── imap-connection-pool.service.ts  # Connection management
│   ├── imap-folder.service.ts           # Folder operations
│   ├── imap-message.service.ts          # Message operations
│   ├── imap-idle.service.ts             # IDLE subscriptions
│   └── imap-send.service.ts             # SMTP sending
├── interfaces/
│   └── imap-internal.interface.ts       # Internal types (not exported)
└── __tests__/
    ├── imap-connection-pool.spec.ts
    ├── imap-folder.spec.ts
    ├── imap-message.spec.ts
    ├── imap-idle.spec.ts
    └── imap-send.spec.ts
```

### 2.3 Dependency Injection for Sub-Services

From [NestJS Design Patterns](https://dev.to/muhammadzaidse/how-nestjs-design-patterns-help-building-modular-scalable-and-maintainable-applications-53j8):

> Controllers should be thin — just orchestrating the request to the correct service. All heavy lifting should be in the service or lower layers.

**Pattern: Shared Connection Pool**

```typescript
// imap-connection-pool.service.ts
@Injectable()
export class ImapConnectionPoolService {
  private pool: PooledConnection[] = [];
  private semaphore: Semaphore;
  private config?: ImapConfig;

  async initialize(config: ImapConfig): Promise<void> {
    this.config = config;
    this.semaphore = withTimeout(
      new Semaphore(POOL_CONFIG.maxConnectionsPerUser),
      POOL_CONFIG.connectionAcquireTimeout
    );
  }

  async withConnection<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = await this.acquireConnection();
    try {
      return await operation(client);
    } finally {
      this.releaseConnection(client);
    }
  }
}
```

```typescript
// imap-folder.service.ts
@Injectable()
export class ImapFolderService {
  constructor(private readonly pool: ImapConnectionPoolService) {}

  async listFolders(): Promise<CanonicalFolder[]> {
    return this.pool.withConnection(async (client) => {
      const mailboxes = await client.list();
      return mailboxes.map(this.mailboxToCanonical);
    });
  }
}
```

---

## 3. ImapFlow Connection Pooling Best Practices

### 3.1 Connection Lifecycle

From [ImapFlow Documentation](https://imapflow.com/module-imapflow-ImapFlow.html):

> ImapFlow does not handle reconnects automatically. So whenever a 'close' event occurs you must create a new connection yourself.

**Key Implications:**

1. **Manual Reconnection**: The pool must handle connection failures
2. **Error Events**: Listen for 'error' and 'close' events on each connection
3. **NOOP Keep-Alive**: Use periodic NOOP to maintain idle connections
4. **Graceful Shutdown**: Call `logout()` before destroying connections

### 3.2 Mailbox Locking

From [ImapFlow Core Class](https://deepwiki.com/postalsys/imapflow/2.1-core-imapflow-class):

> ImapFlow implements a queue-based locking system to serialize mailbox access and prevent race conditions. This is critical since IMAP allows only one mailbox to be selected at a time.

**Current Implementation (Correct):**

```typescript
const lock = await client.getMailboxLock(folderPath);
try {
  await client.messageMove([uid], targetPath, { uid: true });
} finally {
  lock.release();
}
```

This pattern MUST be preserved in `ImapMessageService`.

### 3.3 IDLE Mode Considerations

From [ImapFlow Examples](https://deepwiki.com/postalsys/imapflow/7-examples-and-usage-patterns):

> IDLE is started by default on connection inactivity. Only required if disableAutoIdle is set to true.

**Current Implementation:**

- Uses a **dedicated IDLE connection** separate from the pool (correct!)
- Implements reconnection logic with exponential backoff
- Handles 'exists', 'expunge', 'flags' events

**Extraction Plan:**

The IDLE logic is self-contained and can be extracted to `ImapIdleService` with minimal changes.

---

## 4. Facade Pattern Implementation Details

### 4.1 State Management Across Services

**Challenge**: The driver maintains several pieces of state that must be shared:
- `connected` flag (from BaseEmailDriver)
- `imapConfig` and `smtpConfig` (credentials)
- `userEmail` (for send operations)
- `folderCache` (for path resolution)

**Solution: Shared Configuration Object**

```typescript
// imap-internal.interface.ts (not exported to consumers)
export interface ImapDriverContext {
  imapConfig: ImapConfig;
  smtpConfig?: SmtpConfig;
  userEmail?: string;
  serverCapabilities: ServerCapabilities;
}

// Passed to each sub-service during initialization
```

### 4.2 Initialization Flow

```typescript
// imap.driver.ts (facade)
async connect(credentials: DriverCredentials): Promise<void> {
  // 1. Parse credentials into config
  const config = this.parseCredentials(credentials);

  // 2. Initialize connection pool first (other services depend on it)
  await this.connectionPool.initialize(config.imap);

  // 3. Test connection and detect capabilities
  const capabilities = await this.connectionPool.withConnection(async (client) => {
    return this.detectCapabilities(client);
  });

  // 4. Build shared context
  const context: ImapDriverContext = {
    imapConfig: config.imap,
    smtpConfig: config.smtp,
    userEmail: credentials.username,
    serverCapabilities: capabilities,
  };

  // 5. Initialize sub-services with context
  this.folderService.setContext(context);
  this.messageService.setContext(context);
  this.idleService.setContext(context);
  this.sendService.setContext(context);

  this.connected = true;
}
```

### 4.3 Disconnect Flow

```typescript
async disconnect(): Promise<void> {
  // 1. Stop IDLE first (it has its own connection)
  await this.idleService.stopIdleSubscription();

  // 2. Drain connection pool
  await this.connectionPool.closeAll();

  // 3. Clear state
  this.folderService.clearContext();
  this.messageService.clearContext();
  this.sendService.clearContext();

  await super.disconnect();
}
```

---

## 5. Method-to-Service Mapping

### 5.1 Complete Method Distribution

| Method | Current Lines | Target Service | Notes |
|--------|---------------|----------------|-------|
| `connect()` | 136-185 | Facade | Orchestrates initialization |
| `disconnect()` | 186-204 | Facade | Orchestrates cleanup |
| `subscribeToChanges()` | 226-257 | IdleService | |
| `startIdleConnection()` | 259-293 | IdleService | Private |
| `cleanupIdleConnection()` | 296-305 | IdleService | Private |
| `scheduleIdleReconnect()` | 307-342 | IdleService | Private |
| `setupIdleEventHandlers()` | 347-459 | IdleService | Private |
| `stopIdleSubscription()` | 461-491 | IdleService | Private |
| `acquireConnection()` | 529-609 | ConnectionPoolService | |
| `releaseConnection()` | 615-627 | ConnectionPoolService | |
| `cleanupIdleConnections()` | 633-664 | ConnectionPoolService | |
| `withConnection()` | 669-678 | ConnectionPoolService | |
| `detectServerCapabilities()` | 690-718 | ConnectionPoolService | |
| `getCapabilities()` | 721-732 | Facade (delegates) | |
| `supportsCondstore()` | 733-738 | Facade (delegates) | |
| `supportsQresync()` | 740-746 | Facade (delegates) | |
| `listFolders()` | 748-770 | FolderService | |
| `getFolder()` | 771-794 | FolderService | |
| `createFolder()` | 796-811 | FolderService | |
| `deleteFolder()` | 813-924 | FolderService | |
| `renameFolder()` | 925-938 | FolderService | |
| `listMessages()` | 940-1048 | MessageService | |
| `getMessage()` | 1050-1115 | MessageService | |
| `getMessageRaw()` | 1117-1142 | MessageService | |
| `getEmailAliases()` | 1144-1159 | Facade | Simple |
| `batchGetMessages()` | 1161-1203 | MessageService | |
| `sendMessage()` | 1205-1238 | SendService | |
| `saveDraft()` | 1240-1273 | SendService | Uses message service |
| `sendDraft()` | 1275-1298 | SendService | Uses message service |
| `moveMessage()` | 1300-1312 | MessageService | |
| `copyMessage()` | 1314-1333 | MessageService | |
| `deleteMessage()` | 1335-1354 | MessageService | |
| `setReadStatus()` | 1360-1375 | MessageService | |
| `setStarredStatus()` | 1377-1392 | MessageService | |
| `setFlaggedStatus()` | 1394-1397 | MessageService | |
| `batchSetReadStatus()` | 1403-1437 | MessageService | |
| `batchMoveMessages()` | 1439-1467 | MessageService | |
| `batchDeleteMessages()` | 1469-1501 | MessageService | |
| `getAttachment()` | 1515-1666 | MessageService | Complex streaming |
| `getChangesSince()` | 1692-1839 | MessageService | CONDSTORE sync |
| `parseSyncToken()` | 1845-1869 | MessageService | Private |
| `buildSyncToken()` | 1875-1881 | MessageService | Private |
| `getInitialSyncToken()` | 1888-1920 | MessageService | |
| `getUserInfo()` | 1926-1932 | Facade | Simple |
| `mailboxToCanonicalFolder()` | 1940-1983 | FolderService | Private |
| `fetchMessageToCanonical()` | 1985-2033 | MessageService | Private |
| `parseImapAddress()` | 2035-2058 | MessageService | Private |
| `flagsToLabels()` | 2060-2073 | MessageService | Private |
| `buildSearchCriteria()` | 2075-2120 | MessageService | Private |
| `parseMessageId()` | 2122-2148 | MessageService | Private |
| `resolveFolder()` | 2150-2173 | FolderService | Private |
| `encodeRfc2047()` | 2175-2185 | SendService | Private |
| `formatEmailAddress()` | 2187-2200 | SendService | Private |
| `saveSentMessage()` | 2202-2219 | SendService | Private |
| `buildRfc822Message()` | 2221-2226 | SendService | Private |
| `extractAttachmentMeta()` | 2228-2250 | MessageService | Private |

### 5.2 Expected Line Counts Post-Split

| Service | Methods | Est. Lines | Target |
|---------|---------|------------|--------|
| `imap-connection-pool.service.ts` | 5 + helpers | ~200 | <500 |
| `imap-folder.service.ts` | 6 + helpers | ~220 | <500 |
| `imap-message.service.ts` | 18 + helpers | ~480 | <500 |
| `imap-idle.service.ts` | 6 + helpers | ~320 | <500 |
| `imap-send.service.ts` | 5 + helpers | ~200 | <500 |
| `imap.driver.ts` (facade) | ~30 delegation | ~180 | <250 |

**Total**: ~1,600 lines (vs. 2,250 current)

---

## 6. Testing Strategy

### 6.1 Current Test Coverage

**Finding**: No dedicated IMAP driver tests exist (`*.test.ts` or `*.spec.ts`).

**Existing related tests:**
- Stress tests in `backend/scripts/` (real connections)
- No Jest unit tests for the driver

### 6.2 Test Approach for New Services

Per CLAUDE.md and project conventions:

1. **Real Tests, Not Mocks**: Use actual Redis/PostgreSQL for integration tests
2. **Stress Tests**: Use `npx ts-node` scripts for concurrency testing
3. **Unit Tests**: Jest with mocked ImapFlow for logic testing

**Test File Structure:**

```
backend/src/modules/email-sync/drivers/imap/__tests__/
├── imap-connection-pool.spec.ts    # Unit tests with mocked ImapFlow
├── imap-folder.spec.ts             # Unit tests
├── imap-message.spec.ts            # Unit tests
├── imap-idle.spec.ts               # Unit tests
└── imap-send.spec.ts               # Unit tests

backend/scripts/
├── stress-test-imap-pool.ts        # Real connection pool testing
└── stress-test-imap-concurrent.ts  # 10 simultaneous connections
```

### 6.3 Coverage Requirements

From requirements: **>80% coverage** for each extracted service.

Key test scenarios:
- Connection pool semaphore behavior under load
- Connection cleanup and timeout handling
- IDLE reconnection logic
- Error handling for each operation type
- Concurrent folder/message operations

### 6.4 Backward Compatibility Testing

**Critical**: All existing IMAP sync tests must pass without modification.

```bash
# Verify existing tests still work after split
npm run test -- --grep "imap"
npx ts-node backend/scripts/stress-test-multi-tenant.ts
```

---

## 7. Risk Assessment

### 7.1 High Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| Connection pool state corruption | High | Comprehensive unit tests + stress tests |
| IDLE connection handling during split | High | Extract as self-contained unit first |
| Folder cache invalidation | Medium | Centralize cache in FolderService |
| Message ID parsing consistency | Medium | Keep `parseMessageId()` in MessageService |

### 7.2 Low Risk Areas

| Area | Why Low Risk |
|------|--------------|
| SMTP sending | Self-contained, no pool dependency |
| Capability detection | Read-only, runs once at connect |
| User info | Trivial delegation |
| Helper methods | Pure functions, easy to test |

### 7.3 Phase 2 Dependency Check

**Status**: Phase 2 (Race Condition Fixes) is **COMPLETE** per ROADMAP.md.

- PrismaRetryService handles P2034 errors
- RedisLockService available for distributed locking
- Race condition stress tests pass

**Safe to proceed**: No race conditions in IMAP driver that would be exposed by splitting.

---

## 8. Implementation Recommendations

### 8.1 Extraction Order

1. **03-01**: Analyze dependency graph (this research + detailed call tree)
2. **03-02**: Extract `ImapConnectionPoolService` (foundation for all others)
3. **03-03**: Extract `ImapFolderService` (depends only on pool)
4. **03-04**: Extract `ImapMessageService` (largest, depends on pool + folder)
5. **03-05**: Extract `ImapIdleService` + `ImapSendService` (parallel, independent)
6. **03-06**: Create facade, wire everything, migrate consumers

### 8.2 Wave Parallelization

| Wave | Plans | Rationale |
|------|-------|-----------|
| Wave 1 | 03-01, 03-02 | Dependency analysis + pool extraction (foundation) |
| Wave 2 | 03-03, 03-04 | Folder + message services (can be parallel after pool) |
| Wave 3 | 03-05, 03-06 | IDLE/Send extraction + facade creation |

### 8.3 Key Files to Modify

| File | Change |
|------|--------|
| `backend/src/modules/email-sync/drivers/imap/imap.driver.ts` | Becomes thin facade |
| `backend/src/modules/email-sync/drivers/imap/index.ts` | Export new services |
| `backend/src/modules/email-sync/drivers/drivers.module.ts` | Register new providers |
| `backend/src/modules/email-sync/services/imap/imap-sync.service.ts` | No changes (uses facade) |

### 8.4 Backward Compatibility Verification

After each extraction:

1. Run `npm run type-check` (should pass)
2. Run existing stress tests (no regressions)
3. Verify `IEmailDriver` interface unchanged
4. Verify `EmailDriverFactory` still works

---

## 9. Sources

- [Leveraging Facade and Adapter Patterns for Backward Compatibility](https://codesignal.com/learn/courses/backward-compatibility-in-software-development-with-typescript/lessons/leveraging-facade-and-adapter-patterns-for-backward-compatibility-in-typescript)
- [Facade in TypeScript - Refactoring Guru](https://refactoring.guru/design-patterns/facade/typescript/example)
- [Refactoring with Design Patterns in NestJS](https://medium.com/@febriandwikimhan/b-1ab8f2daeff4)
- [NestJS Modules Documentation](https://docs.nestjs.com/modules)
- [Large-Scale React & NestJS Project Structure](https://medium.com/@itsspss/large-scale-react-zustand-nest-js-project-structure-and-best-practices-93397fb473f4)
- [ImapFlow Documentation](https://imapflow.com/)
- [ImapFlow Core Class - DeepWiki](https://deepwiki.com/postalsys/imapflow/2.1-core-imapflow-class)
- [ImapFlow Examples and Usage Patterns](https://deepwiki.com/postalsys/imapflow/7-examples-and-usage-patterns)
- [A Guide to the Facade Design Pattern in TypeScript](https://medium.com/@robinviktorsson/a-guide-to-the-facade-design-pattern-in-typescript-and-node-js-with-practical-examples-b568a45b7dfa)
- [NestJS Factory Method Pattern](https://michaelguay.dev/nestjs-factory-method-pattern/)

---

## 10. Key Decisions for Planning

| Decision Point | Recommendation | Rationale |
|----------------|----------------|-----------|
| Extraction order | Pool -> Folder -> Message -> IDLE/Send -> Facade | Dependencies flow from pool outward |
| State sharing | Shared `ImapDriverContext` object | Avoids complex DI, keeps services testable |
| Pool ownership | Dedicated `ImapConnectionPoolService` | Single responsibility, reusable |
| IDLE isolation | Own service with own connection | IDLE blocks, can't share pool connections |
| Test approach | Unit tests + stress tests | Match existing project patterns |
| Interface changes | NONE (backward compatible) | Consumers must not need changes |

---

*Research completed: 2026-01-31*
*Ready for planning: 03-01 through 03-06*
