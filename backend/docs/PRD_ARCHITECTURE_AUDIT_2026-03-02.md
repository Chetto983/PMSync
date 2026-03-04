# PMSync Backend -- PRD & Architecture Audit

**Date:** 2026-03-02
**Scope:** `D:\PMSync\backend\src\` (434 files, 20,523 LOC across 22 NestJS modules)
**Auditors:** 9 specialized AI agents (architecture, security, performance, code quality, CRM/data, AI layer)

---

## EXECUTIVE SUMMARY

PMSync's backend is a **NestJS monolith** with 22 modules covering email sync (Gmail, Microsoft, IMAP), AI chat (Mistral), calendar, contacts/CRM, compliance, and real-time. The core email sync pipeline is battle-hardened with distributed locks, backpressure, and optimistic locking. The AI layer (post-VoltAgent rewrite) is structurally sound but has critical gaps.

**Overall Production Readiness: 5/10**

| Dimension | Score | Blocker Count |
|-----------|-------|---------------|
| Module Architecture | 4/10 | 24 forwardRef, 7 boundary violations |
| Code Quality | 5/10 | 46 files > 500 lines, ~1000 lines dead code |
| AI / Agent Layer | 6/10 | HITL stub, embedding bypass, dead services |
| Security | 7/10 | 1 critical (SQLi), 3 high, 4 medium |
| Performance | 5/10 | Redis sprawl, unbounded scans, KEYS command |
| CRM / Multi-tenant | 5/10 | Driver singleton leak, missing tenant checks |
| Data Integrity | 5/10 | Delete-before-create bug, orphaned embeddings |

---

## TABLE OF CONTENTS

1. [System Architecture](#1-system-architecture)
2. [Module Dependency Audit](#2-module-dependency-audit)
3. [Code Quality Findings](#3-code-quality-findings)
4. [AI & Agent Architecture](#4-ai--agent-architecture)
5. [Security Audit](#5-security-audit)
6. [Performance & Scalability](#6-performance--scalability)
7. [CRM & Multi-Tenant](#7-crm--multi-tenant)
8. [Data Integrity Risks](#8-data-integrity-risks)
9. [VoltAgent Migration Debt](#9-voltagent-migration-debt)
10. [Consolidated Remediation Roadmap](#10-consolidated-remediation-roadmap)

---

## 1. SYSTEM ARCHITECTURE

### 1.1 Module Map

```
AppModule (root)
  +-- [GLOBAL] PrismaModule          (DB access)
  +-- [GLOBAL] CacheModule            (Redis cache, DLQ, memory manager)
  +-- [GLOBAL] ScheduledJobsModule    (BullMQ cron)
  +-- [GLOBAL] MistralModule          (AI provider)
  +-- AuthModule                      (JWT, OAuth, WebAuthn, MFA)
  +-- UsersModule
  +-- TenantsModule
  +-- EmailModule                     (CRUD, bulk, cleanup, sync-back)
  +-- EmailSyncModule                 (queue, scheduler, drivers, webhooks)
  +-- DriversModule                   (Google, Microsoft, IMAP drivers)
  +-- AiModule                        (embeddings, RAG, triage, insights, NLP)
  +-- AiChatModule                    (streaming chat, tools, HITL)
  +-- ProvidersModule                 (OAuth, token management)
  +-- CalendarModule                  (events, sync, providers)
  +-- ContactsModule                  (CRM, sync, enrichment)
  +-- ComplianceModule                (GDPR, consent)
  +-- AuditModule                     (audit logging)
  +-- RealtimeModule                  (WebSocket gateway)
  +-- LabelsModule                    (user labels)
  +-- SubscriptionModule              (plans, usage tracking)
  +-- HealthModule                    (health checks)
```

### 1.2 Key Stats

| Metric | Value | Assessment |
|--------|-------|------------|
| Total modules | 22 | Reasonable |
| Global modules | 4 | OK |
| `forwardRef` calls | **24** | CRITICAL -- extremely high |
| Circular dependency cycles | **6-8** | CRITICAL |
| Max module providers | 32 (EmailSyncModule) | Should be < 15 |
| Max module exports | 19 (EmailSyncModule) | Should be < 10 |
| Files > 500 lines | **46** | Violates project rules |
| Largest file | 1,429 lines (email-sync-back) | Nearly 3x limit |

---

## 2. MODULE DEPENDENCY AUDIT

### 2.1 Circular Dependency Cycles

**Cycle 1 (CRITICAL): Email <-> EmailSync <-> Providers Triangle**
```
EmailModule <--forwardRef--> EmailSyncModule <--forwardRef--> ProvidersModule
     ^                                                             |
     +---------------------forwardRef------------------------------+
```

**Cycle 2:** Email <-> AiModule
**Cycle 3:** Email <-> CalendarModule
**Cycle 4:** Providers <-> Calendar
**Cycle 5:** Providers <-> Contacts
**Cycle 6:** EmailSync <-> Calendar
**Cycle 7:** ScheduledJobs <-> Compliance
**Cycle 8:** Users -> Ai -> Email -> EmailSync -> (back to Users)

### 2.2 Module Boundary Violations (7 found)

| # | Severity | Violation | File |
|---|----------|-----------|------|
| 1 | CRITICAL | `EmailService` registered directly in AuthModule (creates broken duplicate instance) | `auth.module.ts:87` |
| 2 | CRITICAL | `ProviderTokenService` duplicated in EmailModule (already exported by EmailSyncModule) | `email.module.ts:75` |
| 3 | HIGH | `IcsParserService` duplicated in EmailSyncModule (owned by CalendarModule) | `email-sync.module.ts:123` |
| 4 | HIGH | `FoldersController` from email/ registered in EmailSyncModule | `email-sync.module.ts:85` |
| 5 | MEDIUM | `PiiDetectionService` + `PiiResolutionService` from ai/guards/ only registered in AiChatModule | `ai-chat.module.ts:57-58` |
| 6 | MEDIUM | `AlertingService` registered independently in 4 modules (4 separate instances) | ai, email-sync, contacts, calendar |
| 7 | LOW | `RedisRateLimiterService` registered independently in 3 modules | auth, email-sync, ai-chat |

### 2.3 Over-Coupled Modules

| Module | Imports | forwardRefs | Providers | Exports |
|--------|---------|-------------|-----------|---------|
| **EmailSyncModule** | 8 | 3 | **32** | **19** |
| **AiModule** | 3 | 1 | **22** | **15** |
| **ProvidersModule** | 7 | **5** | 14 | 8 |
| **EmailModule** | 6 | **4** | 18 | 18 |
| **AiChatModule** | 8 | **4** | 11 | 2 |

### 2.4 Recommendations

**P0 -- Fix Now:**
- R1: AuthModule must import EmailModule via forwardRef, not register EmailService directly
- R2: Remove duplicate ProviderTokenService from EmailModule
- R3: Remove duplicate IcsParserService from EmailSyncModule

**P1 -- Fix Soon:**
- R4: Create global `AlertingModule` (eliminate 4 duplicate registrations)
- R5: Add `RedisRateLimiterService` to CacheModule (eliminate 3 duplicates)
- R6: Move PII services into AiModule and export them
- R7: Move FoldersController back to EmailModule or create FoldersModule

**P2 -- Plan:**
- R8: Split EmailSyncModule into EmailSyncCoreModule, EmailWebhookModule, FolderSyncModule
- R9: Split AiModule into EmbeddingsModule, TriageModule, AiCoreModule
- R10: Extract ProviderTokenModule to break the Email/EmailSync/Providers triangle

---

## 3. CODE QUALITY FINDINGS

### 3.1 Dead Code (~1,000 lines)

| Item | File | Lines | Severity |
|------|------|-------|----------|
| `email-analysis.service.ts` -- 100% dead, never imported | `ai/services/email-analysis.service.ts` | 725 | CRITICAL |
| `BatchIndexingService` -- no-op stub, 9 import sites | `ai/services/batch-indexing.service.ts` | 52 + refs | HIGH |
| `MistralRagService.generateResponse()` -- no callers | `ai/services/mistral-rag.service.ts` | ~160 | HIGH |
| `WritingStyleService` ghost (type=any, @Optional) | 9 files | ~60 | HIGH |
| `FollowUpService` ghost | 5 files | ~30 | HIGH |
| `AttentionScoreService` ghost | contacts.service.ts | ~15 | HIGH |
| VoltAgent table cleanup code | data-cleanup.service.ts | ~80 | CRITICAL |
| Dead `getUserMessages()` always returns [] | users.service.ts + controller | ~20 | HIGH |
| Dead batch triage code path | email-triage.service.ts | ~100 | CRITICAL |
| Dead cache namespaces (VOLTAGENT_METRICS, AGENT_POOL) | cache.service.ts | ~5 | MEDIUM |

### 3.2 Files Exceeding 500-Line Limit (Top 10)

| File | Lines | Recommended Split |
|------|-------|-------------------|
| `email-sync-back.service.ts` | **1,429** | Per-provider services or refactor to use driver layer |
| `auth.service.ts` | **1,220** | Extract password-reset, session, login, MFA |
| `emails.controller.ts` | **1,183** | Extract calendar-invite, drafts, bulk-ops controllers |
| `provider-config.service.ts` | **1,088** | Extract IMAP-test, bootstrap services |
| `email-insights.service.ts` | **1,073** | Extract prompt templates, shared helpers |
| `contacts.service.ts` | **1,033** | Extract VIP, photo, extraction services |
| `calendar-events.service.ts` | 927 | Extract CRUD vs sync logic |
| `queue.service.ts` | 926 | Extract per-priority queue management |
| `realtime-events.service.ts` | 862 | Split by event domain |
| `intent-taxonomy.ts` | 804 | Split data arrays from types |

### 3.3 Critical Duplications

| Duplication | Locations | Lines Wasted |
|-------------|-----------|-------------|
| `executeWithRetry` method cloned 9 times | 8 driver files + email-sync-back | ~45 |
| Circuit breaker class duplicated | `common/utils/` + `calendar/utils/` (identical) | 266 |
| `RateLimiter` class duplicated | `common/utils/` + `calendar/utils/` | ~60 |
| `withRetry` function duplicated | `common/utils/` + `calendar/utils/` | ~60 |
| Email prompt builders duplicated | `email-analysis` + `email-insights` | ~300 |
| `extractRetryAfter` + `computeBackoffDelay` | email-embedding.queue + contact-embedding.queue | ~60 |
| DLQ error handler pattern | 4 worker files | ~80 |
| `sleep`, `chunk`, `formatBytes` | 4, 2, 3 locations respectively | ~30 |

---

## 4. AI & AGENT ARCHITECTURE

### 4.1 Current Architecture

```
AiChatModule (Interactive)          AiModule (Background)
  AiChatService (streaming)           EmailInsightsService (unified analysis)
  ConversationService (CRUD)          EmailTriageService (batch triage)
  HitlService (approve/reject)        EmbeddingsService (pgvector)
  HybridSearchService (RRF)           KnowledgeBaseService (RAG facade)
  MemoryService (auto-inject)         MistralService (LLM facade)
  IntentRouterService (classify)      MistralEmbeddingService (embed)
  5 Tool Services (20 tools)          TriageLearningService (behavior)
                                      PromptGuardService (OWASP)
                                      PiiDetectionService (GDPR)
```

### 4.2 Critical AI Issues

| # | Severity | Issue | File |
|---|----------|-------|------|
| 1 | **CRITICAL** | HITL approve endpoint is a STUB -- approved actions are NEVER executed | `hitl.controller.ts:77-94` |
| 2 | **CRITICAL** | `knowledge-base.service.ts` deletes old embeddings BEFORE generating new ones -- if generation fails, email has ZERO embeddings | `knowledge-base.service.ts:134` |
| 3 | **CRITICAL** | Circuit breaker failure never recorded in stream `onError` -- breaker never opens | `ai-chat.service.ts:360-370` |
| 4 | **HIGH** | 3 services bypass `MistralEmbeddingService` cost protection (HybridSearch, Memory, RagTools call `embed()` directly) | hybrid-search, memory, rag-tools |
| 5 | **HIGH** | Bulk embeddings bypass cost protection entirely | `mistral-embedding.service.ts:105` |
| 6 | **HIGH** | `save_memory` uses `tenantId` as `userId` -- all users in tenant share memories | `rag-tools.service.ts:131` |
| 7 | **HIGH** | Tool messages filtered out of conversation context -- multi-turn tool use broken | `conversation.service.ts:258` |
| 8 | **HIGH** | Every RAG query saves a permanent embedding -- unbounded growth | `mistral-rag.service.ts:135` |
| 9 | **MEDIUM** | `normaliseLabel` uses `includes()` -- false positive matches (e.g., "port" matches "Important") | `email-insights.service.ts:631-636` |
| 10 | **MEDIUM** | "Temporary" PST constants still in production (500 batch, 168h window) | `email-triage.service.ts:32-33` |
| 11 | **MEDIUM** | No PromptGuardService in chat pipeline -- user messages go directly to LLM | ai-chat.service.ts |
| 12 | **MEDIUM** | Model override in ChatRequestDto unvalidated -- user can specify expensive models | `chat-request.dto.ts:40` |

### 4.3 VoltAgent Feature Gaps

| Lost Capability | Impact | Rebuild Priority |
|-----------------|--------|-----------------|
| Daily briefing generation | Core product differentiator | P1 |
| Follow-up tracking & extraction | CRM intelligence | P1 |
| CRM relationship scoring | Contact prioritization | P2 |
| Writing style adaptation | Draft quality | P2 |
| Calendar conflict detection | Scheduling safety | P2 |
| Agent metrics (Prometheus) | Observability | P2 |
| Meeting prep service | Productivity | P3 |
| Learning from corrections | AI improvement | P3 |
| Document library | Content management | P3 |

### 4.4 AiChatModule Production Readiness: 4/10

The chat pipeline works (streaming, persistence, PII, rate limiting). But the HITL stub means approved actions are silently dropped, tool context is lost across turns, and cost protection is bypassed on 3 embedding paths.

---

## 5. SECURITY AUDIT

### 5.1 Findings (12 total)

| # | Severity | OWASP | Finding | File |
|---|----------|-------|---------|------|
| F1 | **CRITICAL** | A03 Injection | `$queryRawUnsafe` in MemoryService -- SQL injection vector | `memory.service.ts:65-80` |
| F2 | **HIGH** | A07 Auth | No password complexity beyond MinLength(8) | `register.dto.ts` |
| F3 | **HIGH** | A07 Auth | Trusted device fingerprint mismatch allows MFA bypass (logs warning but still allows) | `trusted-device.service.ts:178-187` |
| F4 | **HIGH** | A05 Misconfig | `CORS_ALLOW_ALL` flag can disable CORS in production (no env guard) | `main.ts:80-81` |
| F5 | MEDIUM | A07 Auth | No refresh token rotation; JWT and session TTL mismatch | `auth.service.ts:627-644` |
| F6 | MEDIUM | A07 Auth | OTP rate limiter fails OPEN when Redis is down | `otp-security.service.ts:350-358` |
| F7 | MEDIUM | A01 Access | Webhook health endpoints expose circuit breaker state unauthenticated | 4 controllers |
| F8 | MEDIUM | A07 Auth | CSRF secret falls back to JWT_SECRET (key separation violation) | `csrf.middleware.ts:5` |
| F9 | LOW | A02 Crypto | Hardcoded insecure fallback secrets in non-production | 6 service files |
| F10 | LOW | A07 Auth | User enumeration via login ("Tenant not found" vs "Invalid credentials") | `auth.service.ts:521` |
| F11 | LOW | A01 Access | OAuth callback state parameter not validated server-side | `oauth-callback.controller.ts` |
| F12 | LOW | A02 Crypto | TOTP scrypt salt is hardcoded string | `totp.service.ts:82-84` |

### 5.2 Positive Security Controls

Strong points that are already well-implemented:
- Bcrypt cost factor 12
- Session-backed JWT validation with immediate revocation
- Fail-fast on weak secrets in production
- HMAC-hashed password reset tokens
- OTP codes stored as HMAC-SHA256 with per-OTP random salts
- `crypto.timingSafeEqual()` for OTP verification
- TOTP replay prevention via Redis
- AES-256-GCM encryption at rest for email bodies
- Global ValidationPipe with `whitelist: true, forbidNonWhitelisted: true`
- CSRF Double Submit Cookie with `__Host-` prefix
- TenantGuard on all resource controllers
- GDPR: data export, 30-day deletion grace, consent management, audit logging
- WebAuthn W3C Level 3 with counter-based replay prevention

---

## 6. PERFORMANCE & SCALABILITY

### 6.1 Critical Bottlenecks

| # | Severity | Issue | Impact |
|---|----------|-------|--------|
| P1 | **P0** | Redis connection sprawl: 20+ independent `new Redis()` calls per process (~31 connections total) | Limits horizontal scaling to ~333 instances |
| P2 | **P1** | `KEYS` command in `invalidateNamespace` -- blocks ALL Redis ops | 200-500ms freeze per call |
| P3 | **P1** | Unbounded `getJobs(states, 0, -1)` in 15 locations -- loads ALL jobs into memory | OOM during webhook floods |
| P4 | **P1** | Heartbeat broadcasts to ALL WebSocket clients every 30s (redundant with Socket.IO ping) | Wasted CPU/bandwidth at 1000+ clients |
| P5 | **P1** | Double DB query in `processBatch()` for same data | 2x DB load per batch |
| P6 | **P1** | Correlated subqueries for folder counts (2 COUNT per folder row per sync) | ~4,000 COUNT queries per 5-min cycle |
| P7 | **P2** | No global IMAP connection limit (2 per user, no cap across users) | Exceeds provider limits at 50+ IMAP users |
| P8 | **P2** | `@Cron` decorators not migrated to BullMQ (run on ALL instances) | Duplicate work in multi-instance |
| P9 | **P2** | No Prisma connection pool configuration (default ~5-9) | Connection starvation under load |
| P10 | **P2** | Fire-and-forget AI promises during sync (no backpressure) | OOM during bulk sync |

### 6.2 Scalability Ceiling Estimates

| Dimension | Current Capacity | Bottleneck |
|-----------|-----------------|------------|
| Redis connections | ~333 instances | Connection sprawl (31/process) |
| Concurrent IMAP syncs | ~7 users (Gmail limit: 15) | No global limit |
| Database connections | ~34 concurrent | Default pool size |
| Queue job scans | ~5,000 before OOM risk | Unbounded getJobs |
| WebSocket clients | ~1,000 before overhead | Broadcast heartbeat |

### 6.3 What's Already Good

- Backpressure on BullMQ queues with per-provider limits and Lua atomics
- Distributed Redis locks with proper Lua CAS release
- Webhook-first optimization (reduces cron load 60%)
- Smart sync with adaptive intervals (3min to 6hr)
- Event buffering and deduplication in RealtimeEventsService
- Timeouts on all sync operations
- Memory manager with heap pressure detection
- Conditional updates with optimistic locking

---

## 7. CRM & MULTI-TENANT

### 7.1 Driver Factory Singleton Bug (CRITICAL)

**File:** `email-sync/drivers/driver.factory.ts:38-58`

`createDriver()` returns the SAME injected singleton for all calls. Calling `connect()` for Tenant A, then Tenant B on the same singleton overwrites credentials. **This is a cross-tenant credential leak.**

```typescript
case 'google':
  return this.googleDriver;  // SAME instance for ALL tenants
```

### 7.2 Missing Tenant Checks

| Location | Issue |
|----------|-------|
| `ProviderTokenService.getProviderWithToken()` | Fetches provider by ID with **zero tenant verification** |
| `EmailSyncBackService` | Receives tenantId + providerId but never validates ownership |
| `LabelsService.removeEmailFromLabel()` | `deleteMany` without tenantId in WHERE |
| `BaseCalendarProvider` | Uses `tenantId: this.config.userId` (wrong value) |

### 7.3 Provider Feature Parity Gaps

| Feature | Google | Microsoft | IMAP |
|---------|--------|-----------|------|
| Labels/Categories | Native | Categories | **NONE** |
| Webhook push | Pub/Sub | Graph subscriptions | **NONE** |
| Contact sync | Full | Full | **NONE** |
| Email aliases | Full sendAs | Primary only | Primary only |
| Nested folders | No (flat labels) | Yes (recursive) | Yes |

### 7.4 CRM Gaps

- No FK between emails and contacts (JSONB scanning required)
- Orphaned embeddings on contact delete (no cascade)
- `AttentionScoreService` disabled (Phase 24 TODO)
- `withCompany` count returns 0 from cache (inconsistent)
- No audit logging on sync operations
- No IMAP contact support

---

## 8. DATA INTEGRITY RISKS

| # | Severity | Risk | File |
|---|----------|------|------|
| 1 | **CRITICAL** | Driver factory returns shared singletons -- cross-tenant credential leak | `driver.factory.ts` |
| 2 | **CRITICAL** | Delete-before-create in embedding generation -- failed generation = zero embeddings | `knowledge-base.service.ts:134` |
| 3 | **HIGH** | `email-sync-back.service.ts` bypasses driver layer (1,429 lines of direct API calls) | email-sync-back.service.ts |
| 4 | **HIGH** | `SyncMessageProcessorService.redisLock` set via setter, not constructor (NPE risk) | sync-message-processor.service.ts |
| 5 | **MEDIUM** | Embedding orphans on email/contact deletion (no cleanup in delete path) | Multiple |
| 6 | **MEDIUM** | Calendar events stored with `userId` as `tenantId` (wrong ownership) | base-calendar.provider.ts |
| 7 | **MEDIUM** | Contact bulk update only touches `lastSyncedAt`, not data fields | BaseContactsSyncService |
| 8 | **MEDIUM** | No audit logging on sync operations | All sync services |
| 9 | **LOW** | Labels are local-only (no sync with Gmail labels / Microsoft categories) | LabelsService |

---

## 9. VOLTAGENT MIGRATION DEBT

### 9.1 Backend Stale References: 79 occurrences in 29 files

| Category | Files | Occurrences | Priority |
|----------|-------|-------------|----------|
| Active dead code (SQL to deleted tables) | `data-cleanup.service.ts` | 16 | CRITICAL |
| Dead batch triage code path | `email-triage.service.ts` | ~100 lines | CRITICAL |
| Ghost type stubs (`type X = any`) | 7 files | ~60 lines | HIGH |
| Dead cache namespaces | `cache.service.ts` | 6 | MEDIUM |
| `VoltAgentTranslations` naming | 3 locale files | 10 | MEDIUM |
| Stale comments | 12 files | ~30 | LOW |
| Dead `getUserMessages` endpoint | users service + controller | ~20 | HIGH |
| Hardcoded "VoltAgent" audit entity | `audit.service.ts` | 1 | MEDIUM |

### 9.2 Frontend Stale References: 584 occurrences in 43 files

The entire frontend AI integration layer (`voltAgentApi`, `useVoltAgentChat`, `/api/v1/voltagent/*`) still references VoltAgent. Major files:
- `frontend/lib/api/ai.ts` (104 occurrences)
- `frontend/src/api/swagger.json` (266 occurrences)
- 30+ component files

### 9.3 AiChatModule Production Score: 4/10

| Dimension | Score |
|-----------|-------|
| Core chat pipeline | 8/10 |
| Tool coverage (20 tools) | 7/10 |
| HITL workflow | 2/10 (stub!) |
| Feature parity with VoltAgent | 3/10 |
| Observability | 1/10 (zero metrics) |
| Frontend integration | 1/10 (584 stale refs) |
| Data integrity | 5/10 |
| Test coverage | 6/10 |
| Security | 7/10 |

---

## 10. CONSOLIDATED REMEDIATION ROADMAP

### P0 -- Production Blockers (Fix Before Any Traffic)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 1 | **Fix driver factory singleton** -- must create NEW instances per call | `driver.factory.ts` | 2h |
| 2 | **Fix `$queryRawUnsafe` SQL injection** in MemoryService | `memory.service.ts` | 1h |
| 3 | **Implement HITL real tool execution** (currently a stub) | `hitl.controller.ts` | 4h |
| 4 | **Fix delete-before-create** in embedding generation | `knowledge-base.service.ts` | 1h |
| 5 | **Add `circuitBreaker.recordFailure()`** in stream onError | `ai-chat.service.ts` | 15min |
| 6 | **Add tenant validation** to `ProviderTokenService.getProviderWithToken()` | `provider-token.service.ts` | 30min |
| 7 | **Fix trusted device MFA bypass** (fingerprint mismatch should invalidate) | `trusted-device.service.ts` | 1h |
| 8 | **Add production guard** on `CORS_ALLOW_ALL` flag | `main.ts` | 15min |

### P1 -- High Priority (Fix Before GA)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 9 | Fix embedding cost bypass (3 services call `embed()` directly) | hybrid-search, memory, rag-tools | 2h |
| 10 | Fix `save_memory` userId (uses tenantId) | `rag-tools.service.ts` | 30min |
| 11 | Include tool messages in conversation context | `conversation.service.ts` | 1h |
| 12 | Add password complexity enforcement | `register.dto.ts` | 1h |
| 13 | Fix rate limiter fail-open on Redis error | `otp-security.service.ts` | 2h |
| 14 | Replace Redis `KEYS` with `SCAN` in invalidateNamespace | `cache.service.ts` | 30min |
| 15 | Fix AuthModule: import EmailModule instead of registering EmailService | `auth.module.ts` | 30min |
| 16 | Remove duplicate ProviderTokenService from EmailModule | `email.module.ts` | 15min |
| 17 | Delete `email-analysis.service.ts` (725 lines dead code) | 1 file | 15min |
| 18 | Delete `BatchIndexingService` and 9 import sites | 8 files | 1h |
| 19 | Remove all ghost type stubs (WritingStyle, FollowUp, AttentionScore) | 15 files | 2h |
| 20 | Delete VoltAgent cleanup code from data-cleanup.service | 1 file | 30min |
| 21 | Fix calendar tenantId = userId bug | `base-calendar.provider.ts` | 30min |
| 22 | Add model allowlist validation for chat | `chat-request.dto.ts` | 30min |
| 23 | Wire PromptGuardService into chat pipeline | `ai-chat.service.ts` | 2h |
| 24 | Revert "temporary" PST constants to production values | `email-triage.service.ts` | 15min |
| 25 | Fix `normaliseLabel` false positive matching | `email-insights.service.ts` | 30min |

### P2 -- Scalability & Architecture (Next Sprint)

| # | Issue | Effort |
|---|-------|--------|
| 26 | Create shared Redis connection factory (eliminate 20+ independent connections) | 1-2 days |
| 27 | Paginate all `getJobs(0, -1)` calls (15 locations) | 4h |
| 28 | Remove WebSocket heartbeat broadcast (redundant with Socket.IO ping) | 15min |
| 29 | Merge double DB query in `processBatch()` | 1h |
| 30 | Replace correlated subqueries with CTE for folder counts | 2h |
| 31 | Migrate remaining `@Cron` to BullMQ repeatable jobs | 3h |
| 32 | Configure Prisma connection pool explicitly | 30min |
| 33 | Add global IMAP connection limit semaphore | 2h |
| 34 | Create global AlertingModule (eliminate 4 duplicate registrations) | 1h |
| 35 | Add RedisRateLimiterService to CacheModule | 30min |
| 36 | Split `email-sync-back.service.ts` to use driver layer | 1 day |
| 37 | Split `email-insights.service.ts` (1,073 lines) | 4h |
| 38 | Delete duplicated circuit-breaker, retry, rate-limiter in calendar/utils | 1h |
| 39 | Extract `executeWithRetry` into BaseEmailDriver (eliminate 9 copies) | 2h |
| 40 | Implement refresh token rotation | 1-2 days |

### P3 -- Feature Rebuilds & Cleanup (Planned)

| # | Issue | Effort |
|---|-------|--------|
| 41 | Rebuild daily briefing generation | 3-5 days |
| 42 | Rebuild follow-up tracking & extraction | 3-5 days |
| 43 | Add calendar conflict detection to create_event tool | 1 day |
| 44 | Add observability (Prometheus counters, token usage, latency) | 2-3 days |
| 45 | Split EmailSyncModule into 3-4 sub-modules | 2-3 days |
| 46 | Split AiModule into sub-modules | 2-3 days |
| 47 | Plan frontend VoltAgent migration (584 references in 43 files) | 3-5 days |
| 48 | Rebuild CRM relationship scoring | 3-5 days |
| 49 | Implement contact-email materialized linking (FK on Email model) | 2 days |
| 50 | Rename VoltAgentTranslations, clean all stale comments | 2h |

---

## APPENDIX A: Security Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| Immediate | F1: SQL injection in MemoryService | 1h |
| Week 1 | F2: Password complexity | 1h |
| Week 1 | F3: MFA bypass via trusted device | 2h |
| Week 1 | F4: CORS_ALLOW_ALL production guard | 15min |
| Week 2 | F6: Rate limiter fail-open | 2h |
| Week 2 | F10: Login tenant enumeration | 30min |
| Sprint | F5: Refresh token rotation | 1-2 days |
| Sprint | F7: Health endpoint info exposure | 1h |
| Sprint | F8: CSRF secret separation | 30min |

## APPENDIX B: AI Services Layer -- Bug Summary

| Bug | File:Line | Impact |
|-----|-----------|--------|
| Delete-before-create loses embeddings | knowledge-base.service.ts:134 | Data loss |
| Bulk embeddings bypass cost protection | mistral-embedding.service.ts:105 | Cost blowout |
| Dead internal circuit breaker in MistralService | mistral.service.ts:25-43 | False monitoring |
| No size guard on attachment fetch | attachment-content-extractor.service.ts:77 | OOM |
| No timeout on OCR API calls | mistral-ocr.service.ts:207 | Hung worker |
| N+1 in `createBulkEmbeddingsForEmails` | knowledge-base.service.ts:117 | Slow batch ops |
| Cached analysis returns empty labels | email-insights.service.ts:335 | Wrong data |
| RAG saves permanent embeddings per query | mistral-rag.service.ts:135 | Unbounded growth |
| PII hash collisions (32-bit) | pii-detection-sentinel.service.ts:225 | Wrong resolution |
| Startup backfill on every deploy | triage-backfill-scheduler.service.ts:114 | Duplicate work |

---

*Generated by 9 specialized audit agents. Total analysis: ~770K tokens, 434 files reviewed.*
