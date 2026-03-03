# Architecture Patterns: Enterprise Stabilization (v4.0)

**Domain:** Enterprise stabilization of NestJS/Next.js AI email platform
**Researched:** 2026-03-03
**Confidence:** HIGH (based on direct codebase audit of all module files + official docs)

---

## Current Architecture State

The codebase is a modular monolith: NestJS 11 backend (17 domain modules), Next.js 16 frontend, PostgreSQL (Prisma 7.3), Redis (BullMQ), AI pipeline on raw AI SDK v6 with Mistral. Enterprise readiness scored 58/100 in the March 2026 audit. The v3.2 AI rebuild is complete but carried forward module coupling, performance, and security debt.

This document covers how 6 stabilization targets integrate with what exists: breaking circular deps, API standardization, httpOnly cookie auth, AI Run Ledger, module boundary CI enforcement, and hash-based encrypted search.

---

## Component Map: Current Module Dependency Graph

Audited every `forwardRef` import across all `*.module.ts` files.

### Circular Dependency Clusters

```
CLUSTER 1 -- Email Core (5 cycles)
  EmailModule <-> ProvidersModule
  EmailModule <-> AiModule
  EmailModule <-> EmailSyncModule
  EmailModule <-> CalendarModule
  ProvidersModule <-> EmailSyncModule

CLUSTER 2 -- AI Chat Tools (4 cycles)
  AiChatModule -> EmailModule (fwdRef)
  AiChatModule -> CalendarModule (fwdRef)
  AiChatModule -> ContactsModule (fwdRef)
  AiChatModule -> AiModule (fwdRef)

CLUSTER 3 -- Provider Hub (5 cycles)
  ProvidersModule <-> EmailModule
  ProvidersModule <-> AiModule
  ProvidersModule <-> CalendarModule
  ProvidersModule <-> ContactsModule
  ProvidersModule <-> EmailSyncModule

CLUSTER 4 -- Sync Consumers (2 cycles)
  CalendarModule <-> EmailSyncModule (for SyncAuthService)
  ContactsModule <-> EmailSyncModule (for SyncAuthService)

CLUSTER 5 -- Misc (2 cycles)
  UsersModule -> AiModule + forwardRef(EmailSyncModule)
  TenantsModule -> forwardRef(ComplianceModule)
  ScheduledJobsModule -> forwardRef(ComplianceModule)
```

**Total unique forwardRef edges: 17** (the PRD estimated 15; actual count from codebase is 17).

### Root Causes by Category

| Category | forwardRef Count | Root Cause |
|----------|-----------------|------------|
| ProvidersModule imports all consumers | 5 | ProvidersModule imports EmailModule, EmailSyncModule, AiModule, CalendarModule, ContactsModule -- each imports ProvidersModule back |
| AiChatModule needs all domain services for tool execution | 4 | Direct forwardRef imports to Email, Calendar, Contacts, Ai modules |
| EmailModule tightly coupled to AI | 2 | EmailModule imports AiModule (triage/embeddings on ingest); AiModule imports EmailModule (StorageService for attachments) |
| Calendar/Contacts need SyncAuth | 2 | Both import EmailSyncModule solely for SyncAuthService (webhook auth) |
| Email <-> EmailSync bidirectional | 1 | EmailModule needs queue services; EmailSyncModule needs attachment storage |
| Email <-> Calendar | 1 | ICS event detection on email ingest |
| Users/Tenants/ScheduledJobs misc | 2 | UsersModule->EmailSync, Tenants->Compliance, ScheduledJobs->Compliance |

### Current API Versioning State

Audited all 32 controllers:

| Pattern | Count | Controllers |
|---------|-------|------------|
| Dual-routed `['path', 'api/v1/path']` | 6 | AiChatController, HitlController, AiController, AiHealthController, KnowledgeBaseController |
| Manual `api/v1/` prefix | 2 | SubscriptionController, AutumnController |
| Unversioned bare path | 24 | emails, auth, calendar, contacts, folders, providers, compliance/*, labels, tenants, users, health, webhooks/* |

### Current Auth Flow

```
Login: POST /auth/login -> returns { accessToken, refreshToken } in JSON body
Frontend: Zustand auth-store.ts stores token in localStorage (persist middleware)
Frontend: Also sets non-httpOnly cookie "auth-token" via document.cookie (for img src)
Requests: apiClient reads token from Zustand, sets Authorization: Bearer header
Backend: JwtStrategy extracts from cookie (access_token) OR Authorization header
         -> cookieExtractor checks req.cookies.access_token first
         -> then falls back to ExtractJwt.fromAuthHeaderAsBearerToken()
```

**Key fact:** Backend already supports cookie extraction. The migration is primarily a frontend change + backend cookie-setting on login.

### Current Response Shapes

No standardized envelope. Three different shapes coexist:

1. **AllExceptionsFilter:** `{ statusCode, message, timestamp, path }`
2. **HttpExceptionFilter:** `{ statusCode, message, timestamp }`
3. **Controller responses:** Raw payloads. Some controllers manually wrap in `{ success: true, data: ... }`

### Current Encryption

- `CryptoService` uses `aes-256-cbc` (unauthenticated) for provider tokens
- `field-encryption.extension.ts` (custom Prisma extension) encrypts Email.bodyText, Email.bodyHtml, Email.snippet using per-tenant HKDF-derived keys
- `encryption.config.ts` has `hashField` property per field but all set to `null` -- the hash infrastructure is architecturally present but unused
- Tier 2 fields (from, subject, displayName) are NOT encrypted because 17+ query sites use `contains`/`insensitive`

### Current Observability

- Pino structured logging with RequestIdMiddleware (nanoid per request)
- `CorrelationInterceptor` exists in `common/interceptors/` but is NOT registered in `AppModule` (not globally wired)
- `CorrelationContextService` uses `AsyncLocalStorage` and is injectable but not actively used in most services
- `ResponseTimeInterceptor` is globally registered (logs method, url, time, requestId)
- `AuditLogInterceptor` is globally registered (audit logs for authenticated requests)
- No AI run-level telemetry, no token cost tracking per run

---

## Recommended Architecture: Stabilization Changes

The stabilization keeps the modular monolith. It introduces **3 decoupling mechanisms** and **6 new/modified infrastructure components**.

### Decoupling Mechanism 1: Event Bus via @nestjs/event-emitter

**What:** Replace direct cross-module service calls with domain events where the caller does not need a return value. Uses `@nestjs/event-emitter` (wraps EventEmitter2) -- in-process, no message broker, zero infrastructure overhead.

**New dependency:** `@nestjs/event-emitter` (not currently installed).

**Events to introduce:**

| Event | Producer | Consumer(s) | forwardRef It Eliminates |
|-------|----------|-------------|--------------------------|
| `email.synced` | EmailSyncModule | AiModule (triage + embeddings) | AiModule fwdRef from EmailSyncModule |
| `email.created` | EmailModule | AiModule (auto-triage) | AiModule fwdRef from EmailModule |
| `email.deleted` | EmailModule | AiModule (embedding cleanup) | Direct AiModule import |
| `contact.updated` | ContactsModule | AiModule (re-embed) | fwdRef to AiModule |
| `provider.connected` | ProvidersModule | EmailSyncModule, CalendarModule, ContactsModule | 3x fwdRef from ProvidersModule |
| `provider.disconnected` | ProvidersModule | All sync modules | Same 3 fwdRef |
| `calendar.ics.detected` | EmailSyncModule | CalendarModule | Email <-> Calendar fwdRef |

**Where it lives:**
- `EventEmitterModule.forRoot()` in `AppModule.imports` (global by default)
- Event type definitions in `backend/src/common/events/` (one file per domain)

**Impact:** Eliminates 7-9 forwardRef edges.

### Decoupling Mechanism 2: Interface Contracts (Abstract Service Tokens)

**What:** For cases where module A calls module B and needs a return value (events are fire-and-forget), extract an interface + injection token. Consuming module depends on the interface in `common/`, not on the concrete module.

**Interfaces to extract:**

| Interface | Token | Current Concrete | Used By | Eliminates |
|-----------|-------|-----------------|---------|-----------|
| `IStorageService` | `STORAGE_SERVICE` | `StorageService` (EmailModule) | AiModule (attachment extraction) | Email <-> Ai fwdRef |
| `ISyncAuthService` | `SYNC_AUTH_SERVICE` | `SyncAuthService` (EmailSyncModule) | CalendarModule, ContactsModule | 2x Calendar/Contacts <-> EmailSync fwdRef |
| `IProviderTokenService` | `PROVIDER_TOKEN_SERVICE` | `ProviderTokenService` (EmailSyncModule) | EmailModule | Email <-> EmailSync partial |

**Pattern:**
```typescript
// common/interfaces/storage.interface.ts
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
export interface IStorageService {
  getAttachmentContent(attachmentId: string, tenantId: string): Promise<Buffer>;
  getPresignedUrl(key: string): Promise<string>;
}

// In EmailModule providers:
{ provide: STORAGE_SERVICE, useExisting: StorageService }

// In AiModule -- no forwardRef(() => EmailModule) needed:
constructor(@Inject(STORAGE_SERVICE) private storage: IStorageService) {}
```

**Where it lives:** `backend/src/common/interfaces/` directory.

**Impact:** Eliminates 3-4 forwardRef edges.

### Decoupling Mechanism 3: AI Tool Registry (Deferred Binding)

**What:** AiChatModule currently imports 4 domain modules via forwardRef for tool execution. Replace with a global tool registry: domain modules register their tools at startup, AiChatModule discovers them at runtime.

**New component:** `ToolRegistryService` in `common/ai/tool-registry.module.ts` (global).

```typescript
@Global()
@Module({ providers: [ToolRegistryService], exports: [ToolRegistryService] })
export class ToolRegistryModule {}

@Injectable()
export class ToolRegistryService {
  private readonly registry = new Map<string, ToolRegistration>();

  register(domain: string, toolsFn: (tenantId: string, userId: string) => Record<string, any>) {
    this.registry.set(domain, { getTools: toolsFn });
  }

  getAllTools(tenantId: string, userId: string): Record<string, any> {
    const tools: Record<string, any> = {};
    for (const [, reg] of this.registry) {
      Object.assign(tools, reg.getTools(tenantId, userId));
    }
    return tools;
  }
}
```

**Registration (in each domain module's onModuleInit):**
```typescript
// EmailModule
onModuleInit() {
  this.toolRegistry.register('email', (t, u) => this.emailToolsService.getTools(t, u));
}
```

**Impact:** Eliminates all 4 AiChatModule forwardRef edges. AiChatModule imports only ToolRegistryModule (global).

### Expected forwardRef Count After All Three Mechanisms

| Before | After | Remaining |
|--------|-------|-----------|
| 17 forwardRef edges | 3-5 | Tenants <-> Compliance (GDPR cascade), Users -> EmailSync (profile sync), ScheduledJobs -> Compliance (retention jobs) |

---

## New Components

### Component 1: ResponseEnvelopeInterceptor

**Purpose:** Wrap all controller responses in a uniform envelope. Standardize error shapes.

**Location:** `backend/src/common/interceptors/response-envelope.interceptor.ts`

**Success response contract:**
```json
{
  "data": "<T>",
  "meta": {
    "requestId": "abc123",
    "timestamp": "2026-03-03T...",
    "pagination": { "page": 1, "pageSize": 20, "total": 142 }
  }
}
```

**Error response contract:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "email", "message": "Invalid format" }]
  },
  "meta": {
    "requestId": "abc123",
    "timestamp": "2026-03-03T..."
  }
}
```

**Integration:**
- Register as `APP_INTERCEPTOR` in `AppModule` (after ResponseTimeInterceptor, before AuditLogInterceptor)
- `@SkipEnvelope()` custom decorator for streaming endpoints (ai/chat) and health checks
- Rewrite `AllExceptionsFilter` and `HttpExceptionFilter` to emit error envelope format
- Update `ThrottlerExceptionFilter` to emit error envelope with `Retry-After` in meta

**Files that change:**

| File | Change Type |
|------|------------|
| `app.module.ts` | ADD ResponseEnvelopeInterceptor as APP_INTERCEPTOR |
| `common/interceptors/response-envelope.interceptor.ts` | NEW |
| `common/decorators/skip-envelope.decorator.ts` | NEW |
| `common/filters/all-exceptions.filter.ts` | MODIFY to emit `{ error, meta }` |
| `common/filters/http-exception.filter.ts` | MODIFY to emit `{ error, meta }` |
| `common/filters/throttler-exception.filter.ts` | MODIFY to match |
| All 32 controllers | INCREMENTAL: Remove manual `{ success: true }` wrapping |

### Component 2: Global API Version Prefix

**Purpose:** All routes prefixed with `api/v1/` uniformly.

**Approach:** `app.setGlobalPrefix('api/v1')` in `main.ts`. This is simpler and less disruptive than NestJS built-in URI versioning.

**Integration:**

| File | Change |
|------|--------|
| `main.ts` | ADD `app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health', method: RequestMethod.ALL }, { path: 'webhooks/(.*)', method: RequestMethod.ALL }] })` |
| 6 dual-routed controllers | REMOVE `api/v1/` from @Controller arrays (now redundant) |
| 2 manually prefixed controllers (Subscription, Autumn) | REMOVE `api/v1/` prefix |
| Frontend apiClient | UPDATE base URL from `http://host:3000` to `http://host:3000/api/v1` |
| Swagger config | Adjusts automatically (global prefix applies) |
| Legacy `/email-configs` watchdog | KEEP at root (excluded from prefix) |

**Webhook exclusion rationale:** Provider webhooks (Gmail, Microsoft, Autumn) use registered callback URLs. Changing them requires re-registration with providers. Exclude from prefix.

### Component 3: httpOnly Cookie Auth

**Current auth flow surface:**

| File | Current Role |
|------|-------------|
| `auth-store.ts` (frontend) | Stores token in localStorage, sets non-httpOnly `auth-token` cookie via `document.cookie` |
| `auth-token.ts` (frontend) | Reads token from localStorage for `apiClient` |
| `auth-context.tsx` (frontend) | Rehydrates Zustand store from localStorage on client |
| `jwt.strategy.ts` (backend) | Extracts JWT from cookie (access_token) OR Authorization header -- already supports both |
| `auth.controller.ts` (backend) | Returns `{ accessToken, refreshToken }` in response body |

**Target auth flow:**

1. Backend `AuthController.login()` sets two httpOnly cookies:
   - `access_token`: httpOnly, Secure, SameSite=Strict, maxAge=15m
   - `refresh_token`: httpOnly, Secure, SameSite=Strict, Path=/api/v1/auth/refresh, maxAge=7d
2. Backend returns `{ user }` in response body (no tokens in body)
3. Frontend `apiClient` configured with `withCredentials: true` (cookies sent automatically)
4. Frontend `auth-store.ts` stores only user info (id, email, role), NOT the token
5. Backend `JwtStrategy` already extracts from cookie -- no change needed
6. CSRF protection already in place (`csrfMiddleware` with httpOnly CSRF cookie)

**Migration strategy: Dual-mode for 2 weeks.**

Phase 1: Backend sets httpOnly cookies AND returns tokens in body. Frontend still reads from body.
Phase 2: Frontend switches to cookie-only (removes localStorage token, adds withCredentials).
Phase 3: Backend stops returning tokens in body. Kill old path.

**Files that change:**

| File | Change Type | Details |
|------|------------|---------|
| `auth.controller.ts` | MODIFY | Login/register/refresh: `res.cookie('access_token', token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 900000 })` |
| `auth-store.ts` | MODIFY | Remove token from state, remove localStorage persist for token, remove `setAuthCookie()`, keep user info |
| `auth-token.ts` | DELETE | No more client-side token extraction |
| `auth-context.tsx` | MODIFY | Remove token rehydration from localStorage |
| `frontend/lib/api/client.ts` | MODIFY | Remove Authorization header interceptor, add `withCredentials: true` |
| `e2e/auth.setup.ts` | MODIFY | Set cookies instead of localStorage |

**Attachment proxy impact:** The non-httpOnly `auth-token` cookie currently used for `<img src>` requests becomes unnecessary. With httpOnly `access_token` cookie, the browser sends it automatically on same-origin image requests. The `AttachmentsController` already reads from cookies via `JwtAuthGuard`.

### Component 4: AI Run Ledger Schema

**Purpose:** Capture every AI run (chat and non-chat) with full traceability: tokens, cost, timing, tool calls, HITL decisions, errors.

**Schema (new Prisma model):**

```prisma
model AiRunLedger {
  id               String   @id @default(cuid())
  tenantId         String
  userId           String
  conversationId   String?  // null for non-chat (briefing, triage, drafts)
  runType          String   // "chat" | "briefing" | "follow-up" | "draft" | "triage" | "embedding"
  model            String   // "mistral-small-latest"
  status           String   // "started" | "completed" | "failed" | "cancelled"
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?
  estimatedCostUsd Float?
  startedAt        DateTime @default(now())
  completedAt      DateTime?
  latencyMs        Int?
  toolCallCount    Int      @default(0)
  toolCalls        Json?    // [{ name, durationMs, status }] -- args/results redacted
  hitlRequired     Boolean  @default(false)
  hitlApproved     Boolean?
  hitlApprovedBy   String?
  errorCode        String?
  errorMessage     String?
  requestId        String?  // From CorrelationContext
  parentRunId      String?  // Chained runs (triage spawns embedding)
  metadata         Json?
  createdAt        DateTime @default(now())
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId, startedAt(sort: Desc)])
  @@index([tenantId, runType, status])
  @@index([conversationId])
  @@index([requestId])
  @@map("ai_run_ledger")
}
```

**New service:** `AiRunLedgerService` in `backend/src/modules/ai/services/ai-run-ledger.service.ts`

```typescript
@Injectable()
export class AiRunLedgerService {
  async startRun(params: StartRunParams): Promise<AiRunLedger> { ... }
  async completeRun(id: string, result: RunResult): Promise<void> { ... }
  async failRun(id: string, error: RunError): Promise<void> { ... }
  async listRuns(tenantId: string, filters: RunFilters): Promise<PaginatedResult<AiRunLedger>> { ... }
  async getRunCostSummary(tenantId: string, period: DateRange): Promise<CostSummary> { ... }
}
```

**Integration points (files that change):**

| File | Change | Details |
|------|--------|---------|
| `prisma/schema.prisma` | ADD AiRunLedger model | Plus relations on Tenant, User |
| `ai/services/ai-run-ledger.service.ts` | NEW | CRUD + cost aggregation |
| `ai-chat/services/ai-chat.service.ts` | MODIFY | Wrap streamText in startRun/completeRun/failRun |
| `ai/services/briefing.service.ts` | MODIFY | Wrap generateText call |
| `ai/services/follow-up-detection.service.ts` | MODIFY | Wrap generateText call |
| `ai/services/draft-generation.service.ts` | MODIFY | Wrap generateText call |
| `ai/services/email-triage.service.ts` | MODIFY | Ledger entry per triage batch |
| `ai.module.ts` | MODIFY | Register AiRunLedgerService, export it |

**Relationship to existing models:** The ledger is additive. It does NOT modify `AiConversation` or `AiMessage`. A run may reference a conversationId but the relationship is optional and one-way. `AiMessage` captures message content; the ledger captures operational metadata (cost, latency, tools, errors).

### Component 5: Hash-Based Search on Encrypted Fields (ENC-03)

**Current state recap:** `encryption.config.ts` already has the `hashField` property per encrypted field. It is set to `null` everywhere. The extension has the architectural slot for hash computation but no implementation.

**Approach:** HMAC-SHA256 blind indexes for exact-match-searchable fields.

**Schema additions:**
```prisma
model Email {
  // existing fields ...
  fromHash    String?  // HMAC-SHA256 of normalized lowercase 'from' address
  toHash      String?  // HMAC-SHA256 of first 'to' address (for exact recipient search)

  @@index([tenantId, fromHash])
  @@index([tenantId, toHash])
}
```

**Updated encryption config:**
```typescript
export const ENCRYPTED_FIELDS: Record<string, EncryptedFieldConfig[]> = {
  Email: [
    { field: 'bodyText', hashField: null },
    { field: 'bodyHtml', hashField: null },
    { field: 'snippet', hashField: null },
    { field: 'from', hashField: 'fromHash' },    // Tier 2: encrypt + blind index
  ],
};
```

**Critical limitation:** Blind indexes support EXACT match only. The 17+ query sites using `contains`/`insensitive` on `from` and `subject` CANNOT use blind indexes. Real-world analysis:

| Field | Current Query Pattern | Hash-Compatible? |
|-------|----------------------|-----------------|
| `from` (email address) | Exact match + contains | Exact: YES. Contains: NO |
| `subject` | Almost always `contains` (substring search) | NO |
| `displayName` | `contains` (fuzzy) | NO |

**Pragmatic recommendation for v4.0:**
- Encrypt `from` field and add blind index for exact address lookup
- Leave `subject` as plaintext (substring search is critical for UX)
- Leave `displayName` as plaintext
- Document the tradeoff: full subject encryption requires searchable encryption infrastructure (e.g., trigram HMAC or dedicated search engine) -- deferred to v5.0

**Files that change:**

| File | Change |
|------|--------|
| `prisma/schema.prisma` | ADD fromHash, toHash columns + indexes |
| `prisma/encryption/encryption.config.ts` | ADD hashField mappings for from |
| `prisma/encryption/field-encryption.extension.ts` | IMPLEMENT HMAC computation on write for configured hashFields |
| NEW `prisma/encryption/hash-search.service.ts` | Convert search terms to HMAC for query |
| 17+ service query sites | UPDATE exact-match queries to use hash, keep `contains` where needed |

### Component 6: Module Boundary Enforcement in CI

**Tool:** `dependency-cruiser` (not madge -- dependency-cruiser supports rules, CI integration, and forbid patterns; madge is detection-only).

**Configuration:** `.dependency-cruiser.cjs` at repo root.

```javascript
module.exports = {
  forbidden: [
    {
      name: 'no-new-circular',
      severity: 'error',
      comment: 'No new circular dependencies beyond the 3-5 accepted ones',
      from: {},
      to: { circular: true }
    },
    {
      name: 'ai-chat-no-domain-imports',
      severity: 'error',
      comment: 'AiChatModule must use ToolRegistry, not direct domain imports',
      from: { path: '^backend/src/modules/ai-chat' },
      to: { path: '^backend/src/modules/(email|calendar|contacts)/(?!.*\\.interface)' }
    },
    {
      name: 'common-no-module-imports',
      severity: 'error',
      comment: 'common/ must not import from modules/',
      from: { path: '^backend/src/common' },
      to: { path: '^backend/src/modules' }
    },
    {
      name: 'providers-no-consumer-imports',
      severity: 'error',
      comment: 'ProvidersModule must not import consumer modules',
      from: { path: '^backend/src/modules/providers' },
      to: { path: '^backend/src/modules/(email-sync|email|calendar|contacts|ai)/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'backend/tsconfig.json' }
  }
};
```

**CI integration:** `npx depcruise backend/src --config .dependency-cruiser.cjs --output-type err` as a CI step. Fails build on violations.

**Rollout:** Start in warn-only mode during Phase B (circular dep burn-down). Switch to error mode once the target (3-5 remaining) is hit.

---

## Data Flow Changes

### Before Stabilization

```
Frontend (localStorage JWT, Authorization header)
    |
    | Mixed API paths (some api/v1/, most bare)
    v
Controllers (raw payloads, no envelope)
    |
    | Direct service imports (17 forwardRef)
    v
Services (tight coupling, no event bus)
    |
    | AI calls with no run-level tracking
    v
Database (bodyText/bodyHtml encrypted, from/subject plaintext, no blind index)
```

### After Stabilization

```
Frontend (no stored token, withCredentials: true)
    |
    | httpOnly cookie (automatic), uniform api/v1/ prefix
    v
Controllers (ResponseEnvelopeInterceptor wraps all responses)
    |
    | { data, meta: { requestId, timestamp } }
    v
Services (EventEmitter2 for notifications, interfaces for queries, ToolRegistry for AI)
    |    |
    |    +-- Events: email.synced, provider.connected, contact.updated
    |    +-- ToolRegistry: domain modules register, AiChat discovers
    |
    | AiRunLedgerService: startRun() -> completeRun()/failRun()
    v
Database (from encrypted + blind index, AI Run Ledger, subject plaintext)
```

---

## Patterns to Follow

### Pattern 1: Domain Event with Typed Payload

**When:** Cross-module notification where producer does not need a response.

```typescript
// common/events/email.events.ts
export class EmailSyncedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly emailId: string,
    public readonly providerId: string,
    public readonly isNew: boolean,
  ) {}
}

// Producer (EmailSyncModule)
this.eventEmitter.emit('email.synced', new EmailSyncedEvent(tenantId, emailId, providerId, true));

// Consumer (AiModule)
@OnEvent('email.synced')
async handleEmailSynced(event: EmailSyncedEvent) {
  if (event.isNew) {
    await this.emailTriageService.triageEmail(event.tenantId, event.emailId);
    await this.emailEmbeddingQueue.enqueue(event.tenantId, event.emailId);
  }
}
```

### Pattern 2: Interface + Injection Token for Cross-Module Queries

**When:** Module A calls Module B and needs a return value.

```typescript
// common/interfaces/storage.interface.ts
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
export interface IStorageService {
  getAttachmentContent(id: string, tenantId: string): Promise<Buffer>;
}

// email.module.ts -- provider
{ provide: STORAGE_SERVICE, useExisting: StorageService }

// ai.module.ts -- consumer (no import of EmailModule)
constructor(@Inject(STORAGE_SERVICE) private storage: IStorageService) {}
```

### Pattern 3: Run Ledger Wrapping

**When:** Any service that calls an LLM.

```typescript
async generateBriefing(tenantId: string, userId: string): Promise<Briefing> {
  const run = await this.ledgerService.startRun({
    tenantId, userId, runType: 'briefing', model: 'mistral-small-latest'
  });
  try {
    const result = await generateText({ ... });
    await this.ledgerService.completeRun(run.id, {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    });
    return result;
  } catch (error) {
    await this.ledgerService.failRun(run.id, {
      errorCode: 'LLM_ERROR', errorMessage: error.message
    });
    throw error;
  }
}
```

### Pattern 4: SkipEnvelope for Streaming

**When:** Endpoint returns a stream (SSE, binary), not JSON.

```typescript
@SkipEnvelope()
@Post('chat')
async streamChat(@Req() req, @Res() res) {
  const stream = await this.aiChatService.streamChat(params);
  // Direct streaming -- no envelope wrapping
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding New forwardRef

**What:** `forwardRef(() => SomeModule)` for any new dependency.
**Why bad:** Papers over coupling. DI init order becomes fragile. Test isolation degrades.
**Instead:** Events for notifications, interfaces for queries, tool registry for AI tools.

### Anti-Pattern 2: Silent Frontend Fallbacks

**What:** API client catches errors and returns `[]` or `null` silently.
**Why bad:** Hides backend contract drift. Users see "empty" instead of errors. Bugs hide for weeks.
**Instead:** Propagate errors to error boundaries. Show explicit degraded state. Log with telemetry.

### Anti-Pattern 3: Mixed Response Shapes

**What:** Some controllers return `{ success: true, data }`, others return raw payloads.
**Why bad:** Frontend must handle N response formats. Generic error handling impossible.
**Instead:** ResponseEnvelopeInterceptor globally. `{ data, meta }` or `{ error, meta }` -- always.

### Anti-Pattern 4: AES-CBC for New Encryption

**What:** Using `aes-256-cbc` (current `CryptoService` algorithm) for new encrypted fields.
**Why bad:** CBC is unauthenticated -- ciphertext malleable (padding oracle attacks). The PRD flagged this.
**Instead:** Use `aes-256-gcm` for all new encryption. Plan to migrate existing CryptoService to GCM.

---

## Suggested Build Order

Ordered by dependency chains: what unblocks what.

### Phase A: Foundation Layer (Weeks 1-2)

Build first because everything else depends on these. All changes are additive -- no existing code breaks.

1. `npm install @nestjs/event-emitter` + `EventEmitterModule.forRoot()` in AppModule
2. Define event types in `common/events/` (email.events.ts, provider.events.ts, contact.events.ts, calendar.events.ts)
3. Create interface contracts in `common/interfaces/` (IStorageService, ISyncAuthService, IProviderTokenService)
4. Create ToolRegistryModule + ToolRegistryService in `common/ai/`
5. Add AiRunLedger model to Prisma schema + run migration + create basic AiRunLedgerService
6. Install dependency-cruiser + baseline config (warn-only mode)

### Phase B: Circular Dependency Burn-down (Weeks 2-4)

Must happen before API standardization because module boundaries affect controller organization.

**Order by impact (most forwardRef edges eliminated first):**

1. **ProvidersModule decoupling** (eliminates 5 edges)
   - Emit `provider.connected/disconnected` events
   - Remove all consumer module imports from ProvidersModule

2. **AiChatModule tool registry migration** (eliminates 4 edges)
   - Email, Calendar, Contacts, Ai modules register tools in onModuleInit()
   - AiChatModule reads from ToolRegistryService

3. **SyncAuthService extraction** (eliminates 2 edges)
   - ISyncAuthService interface in common/interfaces/
   - Calendar and Contacts depend on interface

4. **EmailModule <-> AiModule decoupling** (eliminates 2 edges)
   - Events for email.created/deleted
   - IStorageService interface for attachment access

5. **Remaining misc edges** -- evaluate, target 3-5 remaining

6. Switch dependency-cruiser to error mode in CI

### Phase C: API Contract Standardization (Weeks 3-5)

After module boundaries are clean, standardize the API surface.

1. Implement ResponseEnvelopeInterceptor + SkipEnvelope decorator
2. Rewrite AllExceptionsFilter and HttpExceptionFilter to error envelope format
3. Register interceptor globally in AppModule
4. Set `app.setGlobalPrefix('api/v1')` in main.ts
5. Remove manual api/v1/ from 8 controllers
6. Update frontend apiClient base URL
7. Remove manual `{ success: true }` wrapping from controllers (incremental)
8. Remove silent fallbacks in frontend API clients
9. Add OpenAPI snapshot test in CI

### Phase D: Auth Hardening (Weeks 4-6)

Depends on API standardization (cookie handling interacts with CORS config and response format).

1. Backend sets httpOnly cookies on login/refresh (dual-mode: cookies AND body tokens)
2. Frontend migration: remove token from Zustand, add withCredentials, delete auth-token.ts
3. Kill dual-mode: backend stops returning tokens in body
4. Update E2E auth setup

### Phase E: AI Run Ledger Integration (Weeks 5-7)

Depends on AiRunLedger schema from Phase A.

1. Wire AiChatService with ledger (startRun around streamText)
2. Wire BriefingService, FollowUpDetectionService, DraftGenerationService
3. Wire EmailTriageService
4. Add model pricing lookup + cost calculation
5. Add GET /api/v1/ai/runs query endpoint

### Phase F: Encrypted Search (ENC-03) (Weeks 6-8)

Independent of other phases. Benefits from stable module boundaries.

1. Add hash columns to Email schema + migration
2. Implement HMAC computation in field-encryption.extension.ts
3. Create HashSearchService
4. Backfill existing data (batch migration job)
5. Encrypt from field, update exact-match query sites
6. Document tradeoff: subject stays plaintext

### Phase G: Bug Fixes + Performance (Weeks 7-9)

Can run in parallel with Phases E and F.

1. RC-A1/A8 race conditions (distributed locks on folder CRUD)
2. 7 deferred v3.1 bugs
3. Phase 28 gap closure (chat 403, dead polling)
4. LCP/TTI optimization (bundle splitting, lazy loading)
5. Memory profiling under simulated load
6. Wire CorrelationInterceptor globally (currently exists but not registered)

### Phase ordering rationale

- **A before B:** Foundation infrastructure must exist before wiring.
- **B before C:** Module boundaries must be clean before standardizing API surface that spans modules.
- **C before D:** Cookie handling interacts with CORS and response format. Must be stable first.
- **D after C:** Auth migration needs the final API prefix and response format.
- **E after A:** Ledger schema must exist. Can overlap with C/D since it is AI-module internal.
- **F independent:** Encryption work is database-level, does not depend on API or module changes.
- **G parallel:** Bug fixes are independent items that can run alongside E and F.

---

## Scalability Considerations

| Concern | Current (v3.2) | After v4.0 | At 10x Users |
|---------|----------------|------------|-------------|
| Module coupling | 17 forwardRef, fragile DI init | 3-5 forwardRef, event-driven | Same architecture holds |
| API contracts | Mixed formats, silent failures | Uniform envelope, CI-enforced | Add rate limit tiers per tenant |
| Auth security | XSS blast radius (localStorage) | httpOnly cookies, no client token | Add short-lived access (5m) |
| AI observability | No run tracking | Full run ledger per request | Partition ledger table by month |
| Encrypted search | Body only, no search index | Blind indexes on email addresses | Consider dedicated search engine |
| CI enforcement | No boundary checks | dependency-cruiser blocks violations | Add per-module contract tests |

---

## Sources

- Direct codebase audit: all `*.module.ts`, `auth-store.ts`, `jwt.strategy.ts`, `main.ts`, `encryption.config.ts`, `field-encryption.extension.ts`, `correlation-context.service.ts`, `all-exceptions.filter.ts`, `http-exception.filter.ts` -- HIGH confidence
- [Trilon: Circular Dependencies in NestJS](https://trilon.io/blog/avoiding-circular-dependencies-in-nestjs) -- MEDIUM confidence
- [Dev.to: Get Rid of Tightly Coupled Modules in NestJS](https://dev.to/kishieel/get-rid-of-tightly-coupled-modules-and-circular-dependencies-in-nestjs-3do1) -- MEDIUM confidence
- [Dev.to: Refresh Tokens through Http-Only Cookie in NestJS and React](https://dev.to/zenstok/part-33-how-to-implement-refresh-tokens-through-http-only-cookie-in-nestjs-and-react-265e) -- MEDIUM confidence
- [Tigran.tech: NestJS Cookie-Based JWT Authentication](https://tigran.tech/nestjs-cookie-based-jwt-authentication/) -- MEDIUM confidence
- [GitHub: prisma-field-encryption by 47ng](https://github.com/47ng/prisma-field-encryption) -- HIGH confidence (in use)
- [GitHub: blind_index by ankane](https://github.com/ankane/blind_index) -- HIGH confidence (established pattern)
- [SitePoint: How to Search on Securely Encrypted Database Fields](https://www.sitepoint.com/how-to-search-on-securely-encrypted-database-fields/) -- MEDIUM confidence
- [Portkey: Complete Guide to LLM Observability](https://portkey.ai/blog/the-complete-guide-to-llm-observability/) -- MEDIUM confidence
- [Medium: Identify Circular Dependencies in NestJS Using madge](https://manishbit97.medium.com/identifying-circular-dependencies-in-nestjs-using-madge-de137cd7f74f) -- MEDIUM confidence
- NestJS official docs: Modules, Event Emitter, Custom Providers -- HIGH confidence
