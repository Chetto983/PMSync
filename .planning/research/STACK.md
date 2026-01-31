# Stack Research: NestJS Service Refactoring

## Summary

NestJS service refactoring in 2025 emphasizes **domain-driven modular decomposition**, using patterns like Factory Method, Facade, and CQRS to split monolithic services into testable units. The key principles are: (1) one service = one responsibility, (2) modules as isolation boundaries, (3) preserve DI through proper exports/imports, and (4) use interfaces to decouple implementations. For MailAgent's 1300-2200 line drivers, the recommended approach is vertical slicing by capability (connection, folder sync, message operations, IDLE) with shared abstractions.

---

## Recommended Patterns

### Pattern 1: Vertical Slice Decomposition (Feature-Based)

Split large services by **capability domain**, not by technical layer. Each slice owns its data flow end-to-end.

**Before (monolithic imap.driver.ts at 1939 lines):**
```typescript
@Injectable()
export class IMAPDriver {
  // 1939 lines covering:
  // - Connection pooling (200+ lines)
  // - Folder operations (300+ lines)
  // - Message fetching (400+ lines)
  // - IDLE subscriptions (250+ lines)
  // - Send/compose (300+ lines)
  // - Utilities (400+ lines)
}
```

**After (split by capability):**
```typescript
// imap-connection.service.ts (~200 lines)
@Injectable()
export class ImapConnectionService {
  private connectionPool: PooledConnection[] = [];
  private poolSemaphore: Semaphore;

  async acquireConnection(): Promise<ImapFlow> { /* ... */ }
  releaseConnection(client: ImapFlow): void { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
}

// imap-folder.service.ts (~250 lines)
@Injectable()
export class ImapFolderService {
  constructor(private readonly connection: ImapConnectionService) {}

  async listFolders(): Promise<CanonicalFolder[]> { /* ... */ }
  async createFolder(name: string): Promise<void> { /* ... */ }
  async resolveFolder(folder: string): Promise<string> { /* ... */ }
}

// imap-message.service.ts (~350 lines)
@Injectable()
export class ImapMessageService {
  constructor(private readonly connection: ImapConnectionService) {}

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> { /* ... */ }
  async getMessage(id: string, options: GetMessageOptions): Promise<CanonicalMessage> { /* ... */ }
  async moveMessage(id: string, folder: string): Promise<void> { /* ... */ }
}

// imap-idle.service.ts (~200 lines)
@Injectable()
export class ImapIdleService {
  constructor(private readonly connection: ImapConnectionService) {}

  async subscribeToChanges(callback: ChangeCallback, folder: string): Promise<ProviderSubscription> { /* ... */ }
  private setupIdleEventHandlers(): void { /* ... */ }
}

// imap-send.service.ts (~200 lines)
@Injectable()
export class ImapSendService {
  constructor(private readonly connection: ImapConnectionService) {}

  async sendMessage(message: ComposeMessage): Promise<string> { /* ... */ }
  async saveDraft(message: ComposeMessage): Promise<string> { /* ... */ }
}

// imap.driver.ts (~150 lines) - Facade only
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  constructor(
    private readonly connectionService: ImapConnectionService,
    private readonly folderService: ImapFolderService,
    private readonly messageService: ImapMessageService,
    private readonly idleService: ImapIdleService,
    private readonly sendService: ImapSendService,
  ) {
    super();
  }

  // Delegates to sub-services - maintains backward compatibility
  async listFolders(): Promise<CanonicalFolder[]> {
    return this.folderService.listFolders();
  }

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.messageService.listMessages(options);
  }
}
```

**Why this works:**
- Each service is <500 lines
- Single responsibility per class
- Shared connection management injected
- Original `IMAPDriver` becomes a thin facade
- All existing callers unchanged (backward compatible)

---

### Pattern 2: Factory Method Pattern for Provider Abstraction

Already present in MailAgent (`driver.factory.ts`), but extend for sub-service creation:

```typescript
// imap-services.factory.ts
@Injectable()
export class ImapServicesFactory {
  constructor(
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Create a fully-wired IMAP service bundle for a specific account
   * Uses NestJS ModuleRef to get fresh instances with proper DI
   */
  async createForAccount(accountId: string, credentials: DriverCredentials): Promise<ImapServiceBundle> {
    // Create connection service first
    const connectionService = await this.moduleRef.resolve(ImapConnectionService);
    await connectionService.connect(credentials);

    // Create dependent services
    const folderService = await this.moduleRef.resolve(ImapFolderService);
    const messageService = await this.moduleRef.resolve(ImapMessageService);

    return {
      connection: connectionService,
      folders: folderService,
      messages: messageService,
      dispose: async () => {
        await connectionService.disconnect();
      },
    };
  }
}
```

**Key benefit:** Avoid constructor DI issues when services need per-request or per-account instances.

---

### Pattern 3: CQRS for Complex Operations (Commands vs Queries)

For services with mixed read/write logic, separate into Commands and Queries:

```typescript
// BEFORE: Mixed in one service
@Injectable()
export class EmailSyncService {
  async syncEmails() { /* reads + writes */ }
  async getEmails() { /* read */ }
  async markAsRead(ids: string[]) { /* write */ }
  async moveToFolder(ids: string[], folder: string) { /* write */ }
}

// AFTER: Split by read/write responsibility

// email-sync.queries.ts
@Injectable()
export class EmailSyncQueries {
  constructor(private readonly prisma: PrismaService) {}

  async getEmails(folderId: string, options: ListOptions): Promise<Email[]> { /* ... */ }
  async getEmailById(id: string): Promise<Email | null> { /* ... */ }
  async getEmailCount(folderId: string): Promise<number> { /* ... */ }
}

// email-sync.commands.ts
@Injectable()
export class EmailSyncCommands {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driverFactory: EmailDriverFactory,
    private readonly eventBus: EventBus,
  ) {}

  async syncEmails(accountId: string): Promise<SyncResult> {
    // ... sync logic
    this.eventBus.publish(new EmailsSyncedEvent(accountId, result));
    return result;
  }

  async markAsRead(ids: string[]): Promise<void> {
    // ... update logic
    this.eventBus.publish(new EmailsMarkedReadEvent(ids));
  }
}

// email-sync.events.ts
export class EmailsSyncedEvent {
  constructor(
    public readonly accountId: string,
    public readonly result: SyncResult,
  ) {}
}

@EventsHandler(EmailsSyncedEvent)
export class EmailsSyncedHandler implements IEventHandler<EmailsSyncedEvent> {
  async handle(event: EmailsSyncedEvent) {
    // Trigger embedding updates, notifications, etc.
  }
}
```

**When to use CQRS:**
- Service has >10 methods
- Mix of complex writes (sync, send) and simple reads (list, get)
- Need to add side effects (events) without bloating main service
- Want to unit test reads and writes independently

---

### Pattern 4: Shared Module for Cross-Cutting Concerns

Extract common utilities into a shared module that others import:

```typescript
// common/common.module.ts
@Module({
  providers: [
    PrismaRetryService,
    RedisLockService,
    RetryService,
    CorrelationContextService,
  ],
  exports: [
    PrismaRetryService,
    RedisLockService,
    RetryService,
    CorrelationContextService,
  ],
})
export class CommonModule {}

// email-sync/email-sync.module.ts
@Module({
  imports: [CommonModule], // Get shared services
  providers: [
    ImapConnectionService,
    ImapFolderService,
    ImapMessageService,
    IMAPDriver,
  ],
  exports: [IMAPDriver],
})
export class EmailSyncModule {}
```

---

## Module Organization

### Recommended Directory Structure for Split Services

```
backend/src/modules/email-sync/
├── drivers/
│   ├── imap/
│   │   ├── imap.module.ts                 # Module definition
│   │   ├── imap.driver.ts                 # Facade (150 lines)
│   │   ├── services/
│   │   │   ├── imap-connection.service.ts # Connection pooling (200 lines)
│   │   │   ├── imap-folder.service.ts     # Folder operations (250 lines)
│   │   │   ├── imap-message.service.ts    # Message CRUD (350 lines)
│   │   │   ├── imap-idle.service.ts       # Real-time subscriptions (200 lines)
│   │   │   └── imap-send.service.ts       # Compose/send (200 lines)
│   │   ├── interfaces/
│   │   │   └── imap.interfaces.ts         # Local interfaces
│   │   └── __tests__/
│   │       ├── imap-connection.service.spec.ts
│   │       ├── imap-folder.service.spec.ts
│   │       └── imap-message.service.spec.ts
│   ├── google/
│   │   ├── google.module.ts
│   │   ├── google.driver.ts               # Facade
│   │   └── services/
│   │       ├── google-connection.service.ts
│   │       ├── google-folder.service.ts
│   │       └── google-message.service.ts
│   └── microsoft/
│       └── ... (same structure)
├── services/
│   ├── folder-sync.service.ts             # Orchestration service
│   └── email-sync-queue.service.ts        # Queue management
└── email-sync.module.ts                   # Main module exports
```

### Module Definition Pattern

```typescript
// imap/imap.module.ts
@Module({
  imports: [CommonModule],
  providers: [
    // Internal services (not exported)
    ImapConnectionService,
    ImapFolderService,
    ImapMessageService,
    ImapIdleService,
    ImapSendService,
    // Public facade (exported)
    IMAPDriver,
  ],
  exports: [
    IMAPDriver, // Only export the facade
  ],
})
export class ImapModule {}
```

---

## Dependency Injection Preservation

### Rule 1: Constructor Injection Over Property Injection

```typescript
// CORRECT: Constructor injection
@Injectable()
export class ImapMessageService {
  constructor(
    private readonly connectionService: ImapConnectionService,
    private readonly logger: Logger,
  ) {}
}

// WRONG: Property injection (harder to test, not explicit)
@Injectable()
export class ImapMessageService {
  @Inject() connectionService: ImapConnectionService;
}
```

### Rule 2: Export from Module, Not Provider Array

```typescript
// CORRECT: Export services in module definition
@Module({
  providers: [ServiceA, ServiceB],
  exports: [ServiceA], // Only what other modules need
})
export class MyModule {}

// WRONG: Trying to import provider directly
// This causes "Cannot resolve dependency" errors
import { ServiceA } from '../other-module/service-a.service';
```

### Rule 3: Use forwardRef() Only as Last Resort

```typescript
// If you MUST have circular dependencies (try to refactor first):
@Injectable()
export class ServiceA {
  constructor(
    @Inject(forwardRef(() => ServiceB))
    private readonly serviceB: ServiceB,
  ) {}
}

// BETTER: Extract shared interface to break cycle
// shared/interfaces/notifier.interface.ts
export interface INotifier {
  notify(event: Event): Promise<void>;
}

// Now ServiceA depends on interface, not concrete class
@Injectable()
export class ServiceA {
  constructor(
    @Inject('INotifier')
    private readonly notifier: INotifier,
  ) {}
}
```

### Rule 4: Scope Management

```typescript
// Default scope is SINGLETON (shared instance)
@Injectable()
export class SharedConnectionPool {}

// Use REQUEST scope only when needed (e.g., per-request tenant context)
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {}

// TRANSIENT creates new instance per injection (use sparingly)
@Injectable({ scope: Scope.TRANSIENT })
export class PerAccountDriver {}
```

### Rule 5: Abstract Classes for Shared Logic

```typescript
// Base class with shared behavior
export abstract class BaseEmailDriver implements IEmailDriver {
  protected connected = false;
  protected credentials?: DriverCredentials;

  abstract connect(credentials: DriverCredentials): Promise<void>;
  abstract listFolders(): Promise<CanonicalFolder[]>;

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Driver not connected');
    }
  }
}

// Concrete implementations extend, don't duplicate
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  constructor(
    private readonly connectionService: ImapConnectionService,
  ) {
    super();
  }

  async connect(credentials: DriverCredentials): Promise<void> {
    await this.connectionService.connect(credentials);
    this.connected = true;
  }
}
```

---

## What NOT To Do

### Anti-Pattern 1: God Object Services

```typescript
// WRONG: 2000+ line service with unrelated concerns
@Injectable()
export class EmailService {
  async syncEmails() { /* 200 lines */ }
  async sendEmail() { /* 150 lines */ }
  async parseICS() { /* 100 lines */ }
  async generateEmbeddings() { /* 300 lines */ }
  async updateContactScores() { /* 200 lines */ }
  // ... 1000+ more lines
}
```

**Fix:** Split by domain - EmailSyncService, EmailSendService, IcsParserService, EmbeddingService.

---

### Anti-Pattern 2: Service Locator Pattern

```typescript
// WRONG: Using ModuleRef to dynamically get services at runtime
@Injectable()
export class BadService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async doSomething() {
    // Anti-pattern: resolving at runtime instead of constructor
    const emailService = this.moduleRef.get(EmailService);
    await emailService.send();
  }
}
```

**Fix:** Inject dependencies via constructor. Only use ModuleRef for factory patterns where you genuinely need dynamic resolution.

---

### Anti-Pattern 3: Circular Module Dependencies

```typescript
// WRONG: Modules importing each other
// email/email.module.ts
@Module({
  imports: [ContactsModule], // Imports contacts
})
export class EmailModule {}

// contacts/contacts.module.ts
@Module({
  imports: [EmailModule], // Imports email -> CIRCULAR!
})
export class ContactsModule {}
```

**Fix:** Extract shared logic to a third module, or use interfaces with custom providers.

---

### Anti-Pattern 4: Leaking Internal Services

```typescript
// WRONG: Exporting internal implementation details
@Module({
  providers: [PublicService, InternalHelper1, InternalHelper2],
  exports: [PublicService, InternalHelper1, InternalHelper2], // DON'T!
})
export class MyModule {}
```

**Fix:** Only export the facade/public API. Internal helpers should be private to the module.

---

### Anti-Pattern 5: Hardcoded Dependencies in Constructors

```typescript
// WRONG: Creating dependencies inside the class
@Injectable()
export class BadDriver {
  private logger = new Logger(BadDriver.name); // OK for Logger
  private connection = new ImapFlow({ /* hardcoded */ }); // BAD!

  constructor() {
    // No DI for connection - untestable
  }
}

// CORRECT: Inject or use factory
@Injectable()
export class GoodDriver {
  constructor(
    private readonly connectionFactory: ImapConnectionFactory,
    private readonly logger: Logger,
  ) {}
}
```

---

### Anti-Pattern 6: Mixing Async Initialization with Constructor

```typescript
// WRONG: Async work in constructor
@Injectable()
export class BadService {
  constructor(private readonly config: ConfigService) {
    this.initialize(); // Can't await in constructor!
  }

  private async initialize() {
    await this.loadFromDatabase(); // Race condition!
  }
}

// CORRECT: Use onModuleInit lifecycle hook
@Injectable()
export class GoodService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.loadFromDatabase(); // Awaited properly
  }
}
```

---

### Anti-Pattern 7: Over-Splitting (Too Granular)

```typescript
// WRONG: One service per method
@Injectable()
export class EmailGetterService {
  async get(id: string) {}
}

@Injectable()
export class EmailListerService {
  async list() {}
}

@Injectable()
export class EmailCounterService {
  async count() {}
}
```

**Fix:** Group by cohesive responsibility. A service can have 5-10 related methods.

---

## Backward Compatibility Strategy

### Step 1: Create Facade, Don't Remove Original

```typescript
// Phase 1: Add new services alongside existing
// imap.driver.ts (original 1939 lines) - KEEP TEMPORARILY
// imap-connection.service.ts (new)
// imap-folder.service.ts (new)

// Phase 2: IMAPDriver becomes facade, delegates to new services
// Original public API unchanged - callers don't break

// Phase 3: After testing, remove duplicated code from facade
```

### Step 2: Deprecation Warnings

```typescript
@Injectable()
export class IMAPDriver {
  /**
   * @deprecated Use ImapFolderService directly for new code
   */
  async listFoldersLegacy(): Promise<CanonicalFolder[]> {
    this.logger.warn('listFoldersLegacy is deprecated, use ImapFolderService');
    return this.folderService.listFolders();
  }
}
```

### Step 3: Gradual Migration

1. Create new split services
2. Wire facade to delegate to new services
3. Run full test suite
4. Update callers one by one to use new services directly
5. Remove deprecated methods from facade
6. Reduce facade to minimal interface

---

## References

- [NestJS Modules Documentation](https://docs.nestjs.com/modules)
- [NestJS CQRS Recipe](https://docs.nestjs.com/recipes/cqrs)
- [Nest.js and Modular Architecture - Level Up Coding](https://levelup.gitconnected.com/nest-js-and-modular-architecture-principles-and-best-practices-806c2cb008d5)
- [NestJS Factory Method Pattern - Michael Guay](https://michaelguay.dev/nestjs-factory-method-pattern/)
- [CQRS Pattern: A Cure for Complex Codebases - Startup House](https://startup-house.com/blog/cqrs-with-nestjs)
- [NestJS Design Patterns - DEV Community](https://dev.to/amirtaherkhani/nestjs-design-patterns-23fc)
- [NestJS Dependency Injection Guide - DigitalOcean](https://www.digitalocean.com/community/tutorials/a-guide-on-dependency-injection-in-nestjs)
- [Best Practices for Structuring NestJS Application - Medium](https://arnab-k.medium.com/best-practices-for-structuring-a-nestjs-application-b3f627548220)
- [NestJS Layered Architecture Template - GitHub](https://github.com/benedya/nestjs-layered-architecture)
- [Mastering Dependency Injection in NestJS - Medium](https://vitiya99.medium.com/mastering-dependency-injection-in-nestjs-advanced-patterns-for-scalable-applications-5de82ee84601)

---

*Research date: 2026-01-31*
