# Architecture

**Analysis Date:** 2026-01-31

## Pattern Overview

**Overall:** Multi-tenant, modular monolith with distributed queue-based email synchronization and AI-powered features.

**Key Characteristics:**
- **NestJS backend** with domain-driven modules (Auth, Email, AI, Sync, Calendar, Contacts)
- **Next.js 16 frontend** with React 19, TanStack Query v5 for data management, Zustand for client state
- **PostgreSQL + Redis** with Prisma 7.3 ORM for data persistence and caching
- **BullMQ queue system** for distributed job processing across sync drivers (Gmail, Microsoft, IMAP)
- **Multi-provider email architecture** with driver abstraction (Phase 2 consolidation)
- **Embedding-based RAG** for semantic search with Mistral LLM integration
- **Real-time WebSocket** events via Socket.io for multi-tenant event broadcasting

## Layers

**Request Layer (Frontend):**
- Purpose: React components with TanStack Query for server state management
- Location: `frontend/pages`, `frontend/components`, `frontend/hooks/queries`
- Contains: Next.js pages, Radix UI + MUI components, query hooks with queryOptions pattern
- Depends on: TanStack Query (cache invalidation), Zustand stores (UI state), Auth context
- Used by: Browser clients (desktop, mobile via responsive design)

**API Layer (Backend Controllers):**
- Purpose: HTTP endpoint definitions with OpenAPI documentation via Swagger
- Location: `backend/src/modules/*/controllers/*.controller.ts`
- Contains: NestJS controllers with @Controller, @Get, @Post decorators; request validation via class-validator DTOs; Swagger @ApiTags documentation
- Depends on: Services (business logic), Guards (JwtAuthGuard, TenantGuard), Pipes (ValidationPipe)
- Used by: Frontend HTTP clients via axios

**Service Layer (Business Logic):**
- Purpose: Core business logic, external API integration, data transformation
- Location: `backend/src/modules/*/services/*.service.ts`, `backend/src/common/services/*.service.ts`
- Contains:
  - **EmailModule services** (`email.service.ts`, `emails.service.ts`, `email-fetch.service.ts`, `email-send.service.ts`): Email CRUD, retention, archival
  - **EmailSyncModule services** (`google-sync.service.ts`, `microsoft-sync.service.ts`, `imap-sync.service.ts`): Provider-specific sync implementations
  - **AiModule services** (`embeddings.service.ts`, `knowledge-base.service.ts`, `mistral.service.ts`): LLM integration, semantic search, email insights
  - **AttachmentServices** (`attachment-storage.service.ts`, `attachment-on-demand.service.ts`): S3 storage with content-addressed dedup, lazy provider downloads
  - **VoltAgent services** (`voltagent.module.ts`, `voltagent/services/*`): AI agent coordination, prompt management, memory persistence
  - **Common services** (`redis-lock.service.ts`, `retry.service.ts`, `cache.module.ts`): Distributed coordination, resilience patterns
- Depends on: Prisma (data access), external APIs (Gmail, Microsoft, Mistral), Redis (locking/caching)
- Used by: Controllers, other services, queue workers

**Queue Layer (Async Job Processing):**
- Purpose: Distribute long-running tasks across workers
- Location: `backend/src/modules/email-sync/services/queue.service.ts`, `*-queue.service.ts`, `backend/src/modules/email-sync/workers/*.worker.ts`
- Contains:
  - **Queue services**: `EmailSendQueueService`, `FolderOperationsQueueService`, `BulkOperationsQueueService`, `ProviderSyncBackQueueService`
  - **Worker processes**: `SyncWorker`, `EmailSendWorker`, `FolderOperationsWorker`, `BulkOperationsWorker`
  - Uses BullMQ with Redis backend for horizontal scaling
- Depends on: Prisma, external APIs, Services (for job execution logic)
- Used by: Controllers (enqueue), Scheduler (recurring tasks), Services (background work)

**Data Access Layer (Persistence):**
- Purpose: ORM abstraction over PostgreSQL with automatic transaction handling
- Location: `backend/src/prisma/`, `backend/prisma/schema.prisma`
- Contains: Prisma Client factory, PrismaModule for dependency injection, schema definitions for all entities (Email, User, Tenant, Folder, Embedding, etc.)
- Depends on: PostgreSQL database connection via @prisma/adapter-pg
- Used by: All services for CRUD operations

**Driver Layer (Provider Abstraction):**
- Purpose: Provider-specific email protocol implementations (Phase 2 consolidation)
- Location: `backend/src/modules/email-sync/drivers/`, `backend/src/modules/email-sync/services/{gmail,microsoft,imap}/`
- Contains:
  - **Drivers**: Base driver interface, Gmail driver, Microsoft driver, IMAP driver
  - **Handlers**: `GmailAttachmentHandler`, `MicrosoftAttachmentHandler`, `ImapAttachmentHandler`
  - **Folder services**: `GmailFolderService`, `MicrosoftFolderService` (folder hierarchy abstractions)
- Depends on: Provider SDKs (googleapis, @microsoft/microsoft-graph-client, imapflow)
- Used by: Sync services, Email module, Folder operations

**External Integrations Layer:**
- Purpose: Third-party service adapters
- Location: `backend/src/modules/{ai,subscription,calendar}`, `backend/src/common/services/`
- Contains:
  - **LLM providers**: Mistral (@ai-sdk/mistral), Anthropic (@anthropic-ai/sdk), Google Gemini
  - **Auth providers**: Google OAuth, Microsoft OAuth, WebAuthn
  - **Storage**: AWS S3 (@aws-sdk/client-s3), Cloudflare R2
  - **Payment**: Autumn.js billing integration
  - **Calendar**: Full Calendar, ICS parser, Google Calendar sync
- Depends on: External API credentials via environment variables
- Used by: Services that need LLM, auth, storage, payment, calendar capabilities

## Data Flow

**Email Sync Flow:**

1. **Polling**: `SyncSchedulerService` triggers sync at configured intervals (via @Cron)
2. **Provider Selection**: `GoogleSyncService`, `MicrosoftSyncService`, or `ImapSyncService` selected based on provider type
3. **Fetch**: Sync service downloads emails via IMAP/Gmail API/Microsoft Graph
4. **Queue Enqueue**: Emails enqueued to `ProviderSyncBackQueueService` for processing
5. **Process**: `SyncWorker` processes each email:
   - Parse headers (via mailparser)
   - Extract attachments (deduped via SHA-256)
   - Store in S3 (via `AttachmentStorageService`)
   - Persist to PostgreSQL (via PrismaService)
6. **Enrich**: If embeddings enabled, `EmailEmbeddingQueueService` enqueues email for embedding
7. **Notify**: `RealtimeModule` broadcasts folder update events via WebSocket

**Email Search (RAG) Flow:**

1. **Frontend Query**: User enters search in UI (component: `frontend/components/email/EmailSearch.tsx`)
2. **Hook Dispatch**: `useEmails()` calls `emailsApi.listEmails(params)` with search query
3. **Backend Processing**: `EmailsController.listEmails()` → `EmailsService.findEmails()`
4. **Vector Search**: If query detected as semantic, calls `UnifiedRetrieverService.retrieve()`
   - Calls `EmbeddingsService.findSimilarContent()` for vector search
   - Calls `PrismaService.email.findMany()` with keyword search
   - Merges results using RRF fusion (reciprocal rank fusion)
5. **Caching**: Results cached in Redis via `QueryEmbeddingCacheService`
6. **Response**: Results paginated and returned to frontend

**Email Send Flow:**

1. **Frontend Compose**: User fills email form in `EmailCompose` component
2. **Submit**: Form submits to `SendEmailRequestDto` validated by controller
3. **Queue Enqueue**: `EmailsController.send()` → `EmailSendService` → `EmailSendQueueService.enqueue()`
4. **Worker Process**: `EmailSendWorker` processes:
   - Sign email if signature configured
   - Send via provider API (Gmail, Microsoft, IMAP SMTP)
   - Update email record with sent status
   - Broadcast WebSocket event
5. **Sync Back**: Original provider folder synced to fetch sent email back into inbox (via `EmailSyncBackService`)

**AI Agent Flow:**

1. **User Request**: Dashboard AI widget loads via `useBriefing()` query hook
2. **VoltAgent Dispatch**: `VoltAgentService.executeBriefing()` called
3. **Context Assembly**: `UnifiedRetrieverService` collects:
   - Recent emails (20-50 most relevant)
   - Contact data (from CRM)
   - Calendar events (next 7 days)
   - User memories (persistent context)
4. **LLM Call**: Prompt sent to Mistral via `MistralService`
5. **Response Streaming**: AI response streamed to frontend via `ai/config.ts` (AI SDK v6)
6. **Memory Persistence**: Key insights stored in `AIMemoryHistory` via `MemoryService`

**Attachment Download Flow:**

1. **Frontend Request**: User clicks attachment link in email detail view
2. **On-Demand Check**: `AttachmentOnDemandService.download()` checks:
   - If S3 cached: return presigned URL
   - If not: fetch from provider, store in S3, return URL
3. **Auth**: Request authenticated via JWT in Authorization header or auth-token cookie
4. **Return**: S3 presigned URL with 1-hour expiry

**State Management:**

- **Server State**: TanStack Query v5 (queryOptions pattern with cache invalidation)
- **UI State**: Zustand stores (`email-ui-store.ts`, `dashboard-store.ts`, `folders-store.ts`)
- **Auth State**: Zustand `auth-store.ts` with persistence + cookie sync
- **Form State**: React Hook Form (not persisted)

## Key Abstractions

**Service Abstraction - EmailService vs EmailsService:**
- `EmailService`: Single email operations (fetch, send, update, delete)
- `EmailsService`: Bulk operations, filtering, searching, list queries

**Provider Driver Abstraction:**
- All sync services inherit from base driver pattern
- Provider-specific handlers (`GmailAttachmentHandler`, `MicrosoftAttachmentHandler`) pluggable
- Folder abstractions hide provider differences (`GmailFolderService`, `MicrosoftFolderService`)

**Queue Service Abstraction:**
- `QueueService`: Generic queue management (Redis via BullMQ)
- Domain-specific queues: `EmailSendQueueService`, `FolderOperationsQueueService`, `BulkOperationsQueueService`
- All implement async/await with retry + deadletter patterns

**Attachment Storage Abstraction:**
- `AttachmentStorageService`: S3 operations (upload, delete, list)
- `AttachmentOnDemandService`: Provider-specific download (lazy loading)
- Content-addressed deduplication via SHA-256 hashing

**Embedding Abstraction:**
- `EmbeddingProviderService`: Unified embedding interface (Mistral backend)
- `EmbeddingsService`: Database operations (create, search, cleanup)
- `QueryEmbeddingCacheService`: Cache layer for query embeddings

**Auth Abstraction:**
- `AuthService`: Password + OTP + WebAuthn + TOTP strategies
- Provider-specific OAuth: Google, Microsoft, Custom IMAP
- JwtStrategy validates tokens; TenantGuard ensures multi-tenancy

**Hook Abstraction (Frontend):**
- `queryOptions()` pattern for reusable, type-safe query definitions
- Key factories (`useEmails`, `useContacts`, `useBriefing`) export both hooks and options
- Enables prefetching, cache invalidation, optimistic updates

## Entry Points

**Backend Entry Point:**
- Location: `backend/src/main.ts`
- Triggers: `npm run start:dev` or `npm run start:prod`
- Responsibilities:
  1. Create NestFactory application from `AppModule`
  2. Configure global middleware (Helmet, CORS, cookies)
  3. Mount global pipes (ValidationPipe) and filters (ExceptionFilters)
  4. Setup Swagger documentation on `/api/docs`
  5. Enable graceful shutdown hooks
  6. Listen on `config.api.port` (default 3000)

**Frontend Entry Point:**
- Location: `frontend/pages/_app.tsx`
- Triggers: `npm run dev` or `npm run build && npm run start`
- Responsibilities:
  1. Wrap with `QueryProvider` (TanStack Query QueryClientProvider)
  2. Wrap with `AuthProvider` (React context for auth state)
  3. Wrap with theme providers (next-themes + MUI ThemeProvider)
  4. Render `RouteGuard` for `/dashboard/*` protection
  5. Route to page components via Next.js file-based routing

**API Entry Points (by Module):**
- `AuthModule`: `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/logout`
- `EmailModule`: `GET /emails`, `GET /emails/:id`, `POST /emails`, `POST /emails/send`, `DELETE /emails/:id`
- `EmailSyncModule`: `POST /email-sync/trigger`, `GET /email-sync/status`, `POST /webhooks/gmail`, `POST /webhooks/microsoft`
- `AiModule`: `POST /ai/briefing`, `POST /ai/smart-reply`, `GET /ai/knowledge-base`
- `CalendarModule`: `GET /calendars`, `GET /calendar-events`, `POST /calendar-events`
- `ContactsModule`: `GET /contacts`, `POST /contacts`, `PATCH /contacts/:id`, `DELETE /contacts/:id`

**Queue Entry Points:**
- Triggered by: Controllers via queue services, Scheduler via @Cron, Webhooks from providers
- Examples:
  - `EmailSendQueueService.enqueue()` → `SyncWorker` processes in background
  - `SyncSchedulerService` → `GoogleSyncService.sync()` → enqueues to `ProviderSyncBackQueueService`
  - `GmailWebhookService` processes real-time webhooks from Gmail push notifications

## Error Handling

**Strategy:** Global exception filters with standardized error responses, retry logic for transient failures, deadletter queues for permanent failures.

**Patterns:**

**HTTP Errors (Controllers):**
```typescript
// GlobalExceptionFilter catches all exceptions
throw new BadRequestException('Invalid email address');
throw new NotFoundException('Email not found');
throw new ForbiddenException('Access denied');
throw new UnauthorizedException('Invalid credentials');
throw new InternalServerErrorException('Database error');
```

**Service Errors:**
```typescript
// RetryService handles transient failures
const result = await retryService.retry(
  () => emailProvider.send(email),
  { maxAttempts: 3, backoffMs: 100 }
);

// RedisLockService prevents race conditions
const lock = await redisLockService.acquire('email-sync:' + folderId);
try {
  // Perform operation
} finally {
  await lock.release();
}
```

**Queue Errors:**
```typescript
// BullMQ deadletter queue catches permanent failures
const job = await queue.add('send-email', data);
// After maxAttempts exceeded: job moved to DLQ
// Monitored by DeadLetterQueueService for alerting
```

**Validation Errors:**
```typescript
// ClassValidator in DTOs
@IsEmail() email: string;
@Min(1) @Max(10000) pageSize: number;

// Global ValidationPipe strips unknown properties
// HttpExceptionFilter formats as { statusCode, message, error }
```

**Logging:**
- Uses Pino logger with structured JSON logging
- Configuration: `backend/src/config/logger.config.ts`
- Rotation: 2-day FIFO via `LogRotationService`
- RequestId middleware adds trace ID to all logs

## Cross-Cutting Concerns

**Logging:** Pino structured logger with:
- Middleware: `RequestIdMiddleware` adds unique requestId
- Interceptor: `ResponseTimeInterceptor` logs response times
- Service: `LogRotationService` rotates logs every 2 days
- Output: Console (dev) + file rotation (prod)

**Validation:**
- DTO-based via class-validator (fields: @IsEmail, @Min, @IsNotEmpty)
- Global ValidationPipe (whitelist: true, forbidNonWhitelisted: true)
- Custom validators in services (email format, folder names, attachment size)

**Authentication:**
- JwtStrategy: Validates Bearer tokens, extracts user/tenant
- TenantGuard: Ensures user belongs to requested tenant
- Strategies: JWT (access token), RefreshToken, OAuth (Google/Microsoft), WebAuthn
- MFA: TOTP + Backup codes + Trusted devices

**Authorization:**
- Role-based (user/admin) in `User.role`
- Tenant isolation in `TenantGuard` (prevents cross-tenant access)
- Subscription limits via `UsageTrackingService` (AI quotas, storage)

**Rate Limiting:**
- ThrottlerModule: Global 60 req/min (configurable)
- Custom: `RedisRateLimiterService` for distributed rate limiting (email send, API calls)
- Webhook: Provider-specific limits (Gmail: 250/user/sec, Microsoft: 1000/sec)

**Caching:**
- Redis: `CacheModule` provides injectable RedisService
- Query-level: TanStack Query (frontend, staleTime: 1-5min)
- API-level: `QueryEmbeddingCacheService` (semantic search results)
- Embedding-level: `EmbeddingProviderService` (LLM embeddings)

**Database Transactions:**
- Prisma `$transaction()` for multi-step operations (email send + update + event broadcast)
- Deadlock retry in `PrismaRetryService` (P2034 errors)
- Foreign key cascades for tenant deletion

**Webhooks:**
- Incoming: `GmailWebhookService`, `MicrosoftWebhookService` (real-time sync triggers)
- Outgoing: `WebhookSubscription` model for user-defined webhooks
- Verification: Provider-specific signatures (Gmail: X-Goog-Channel-ID, Microsoft: validation-tokens)

---

*Architecture analysis: 2026-01-31*
