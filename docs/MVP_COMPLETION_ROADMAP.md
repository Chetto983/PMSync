# PmSync MVP Completion Roadmap

**Version:** 1.0
**Date:** 2025-12-08
**Status:** Active
**Target:** Production-Ready MVP

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Industry Best Practices (2025)](#3-industry-best-practices-2025)
4. [MVP Requirements Matrix](#4-mvp-requirements-matrix)
5. [Phase 1: Critical Security Fixes](#5-phase-1-critical-security-fixes)
6. [Phase 2: Backend Hardening](#6-phase-2-backend-hardening)
7. [Phase 3: AI System Polish](#7-phase-3-ai-system-polish)
8. [Phase 4: Frontend Polish](#8-phase-4-frontend-polish)
9. [Phase 5: Production Readiness](#9-phase-5-production-readiness)
10. [Testing Strategy](#10-testing-strategy)
11. [Deployment Checklist](#11-deployment-checklist)
12. [Success Metrics](#12-success-metrics)

---

## 1. Executive Summary

### Vision

PmSync is a multi-tenant email client with AI-powered assistance, supporting Gmail, Microsoft, and IMAP providers. This roadmap outlines the remaining work to reach production-ready MVP status.

### Current Score: 94/100 (was 92)

| Category | Score | Status |
|----------|-------|--------|
| Core Email Functionality | 95/100 | Production-ready, Send+SyncBack workers ✅ |
| AI Multi-Agent System | 85/100 | MVP level, telemetry wired ✅, backoff ✅ |
| Security | 88/100 | SSRF safe ✅, Redis auth ✅, pwd reset enforced ✅ |
| Infrastructure | 98/100 | BullMQ shared Redis ✅, DLQ fixed ✅, TLS ✅, Grafana ✅ |
| Frontend | 70/100 | Logger exists, SSR fixed ✅ |
| Documentation | 95/100 | Audit roadmap integrated ✅, Runbooks ✅ |

**Backend Audit Summary:** 16/16 items ✅ Done (100% complete!)
**Swagger:** Secured - disabled in production, ENABLE_SWAGGER env var for staging
**Package.json:** Removed unused deps (clean, speakeasy), moved @types to devDeps

### MVP Timeline Estimate

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Critical Security | 2-3 days | High |
| Phase 2: Backend Hardening | 3-4 days | Medium |
| Phase 3: AI Polish | 2-3 days | Medium |
| Phase 4: Frontend Polish | 3-4 days | Medium |
| Phase 5: Production Ready | 2-3 days | Medium |
| **Total** | **12-17 days** | - |

---

## 2. Current State Assessment

### Backend Modules (15 Production Modules)

| Module | Status | Completeness | Priority Fixes |
|--------|--------|--------------|----------------|
| `ai` | Working | 85% | Telemetry wired, queue wired ✅ |
| `auth` | Working | 90% | MFA complete, review token expiry |
| `calendar` | Working | 85% | Queue integrated |
| `contacts` | Working | 85% | Queue integrated |
| `email` | Working | 90% | Secrets stripped from folder API ✅ |
| `email-sync` | Working | 90% | Send queue, sync-back queue |
| `providers` | Working | 90% | OAuth token refresh handling |
| `health` | Working | 100% | Prometheus metrics complete |
| `analytics` | Working | 80% | Add more metrics |
| `audit` | Working | 90% | Log sanitization added ✅ |
| `compliance` | Working | 80% | GDPR endpoints |
| `labels` | Working | 95% | Minor fixes |
| `realtime` | Working | 90% | WebSocket stable |
| `tenants` | Working | 95% | Isolation complete |
| `users` | Working | 95% | Profile complete |

### Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| PostgreSQL + pgvector | ✅ Ready | Migrations complete |
| Redis | ✅ Ready | Password auth enabled |
| BullMQ Queues | ✅ Ready | All 11 queues configured |
| Prometheus | ✅ Ready | Scraping /health/metrics |
| Grafana | ✅ Ready | Dashboards pending |
| MinIO (S3) | ✅ Ready | Attachments storage |
| Docker Compose | ✅ Ready | Dev environment complete |

---

## 3. Industry Best Practices (2025)

### 3.1 NestJS Security Best Practices

Based on [DEV Community](https://dev.to/drbenzene/best-security-implementation-practices-in-nestjs-a-comprehensive-guide-2p88) and [Medium](https://javascript.plainenglish.io/secure-your-nestjs-application-production-ready-defaults-for-safety-and-dx-1b6896b1ce74):

| Practice | Current Status | Action |
|----------|----------------|--------|
| Rate limiting with @nestjs/throttler | ✅ Implemented | Verify all endpoints |
| CORS with specific origins | ⚠️ Needs review | Remove `origin: '*'` |
| Helmet security headers | ⚠️ Needs review | Configure for JSON API |
| Input validation (class-validator) | ✅ Implemented | Audit all DTOs |
| SQL injection prevention (Prisma) | ✅ Protected | Using ORM |
| JWT secret management | ⚠️ Needs fix | Use env vars only |
| Session security (HttpOnly, Secure) | ✅ Implemented | Verify cookies |
| Dependency audit (npm audit) | ⚠️ Needs CI | Add to pipeline |

### 3.2 Multi-Agent AI Best Practices

Based on [LangChain Blog](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems/) and [Multi-Agent Benchmarks](https://blog.langchain.com/benchmarking-multi-agent-architectures/):

| Practice | Current Status | Action |
|----------|----------------|--------|
| Context engineering control | ✅ Implemented | VoltAgent supervisor |
| Lightweight agent communication | ✅ Implemented | Minimal data passing |
| Separate prompts per agent | ✅ Implemented | 6 specialized agents |
| Tool grouping by responsibility | ✅ Implemented | Email, Calendar, Contacts |
| Memory management | ⚠️ Basic FIFO | Add summarization |
| Human-in-the-loop (HITL) | ✅ Implemented | Approval workflow |
| Observability/telemetry | ⚠️ Not wired | Connect LLM telemetry |

### 3.3 BullMQ Production Best Practices

Based on [BullMQ Docs](https://docs.bullmq.io/guide/going-to-production) and [Dragonfly Guide](https://www.dragonflydb.io/guides/bullmq):

| Practice | Current Status | Action |
|----------|----------------|--------|
| Redis maxmemory-policy: noeviction | ⚠️ Not set | Configure Redis |
| Graceful shutdown (SIGINT/SIGTERM) | ✅ Implemented | Worker cleanup |
| Error handler attachment | ✅ Implemented | Queue error events |
| Job data encryption | ⚠️ Not implemented | Encrypt sensitive data |
| maxRetriesPerRequest: null | ✅ Configured | Workers set correctly |
| Job cleanup (removeOnComplete) | ✅ Configured | Presets defined |
| Dead letter queue | ✅ Implemented | DLQ service active |

### 3.4 Next.js Frontend Best Practices

Based on [Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist) and [Dev.to Guide](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji):

| Practice | Current Status | Action |
|----------|----------------|--------|
| React Server Components | ⚠️ Mixed | Migrate where possible |
| Turbopack (Next.js 15) | ⚠️ Not enabled | Enable for dev |
| Proper error boundaries | ⚠️ Incomplete | Add error.tsx files |
| Loading states | ⚠️ Incomplete | Add loading.tsx files |
| Console.log cleanup | ❌ 212 statements | Remove all |
| Unified styling | ❌ Mixed | Consolidate to Tailwind |
| Component testing | ❌ Missing | Add RTL tests |
| Component Speed | ❌ Speed need attention|

### 3.5 Email OAuth Best Practices (2025)

Based on [Microsoft Learn](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth) and [Google Workspace](https://support.google.com/a/answer/9003945):

| Practice | Current Status | Action |
|----------|----------------|--------|
| OAuth 2.0 mandatory (no passwords) | ✅ Google/Microsoft | IMAP still supports password |
| Token refresh before expiry | ✅ Implemented | Auto-refresh logic |
| Offline_access scope | ✅ Requested | Refresh tokens available |
| Proper permission scopes | ✅ Configured | Gmail, Graph API |
| Token secure storage | ✅ Encrypted | AES encryption |

---

## 4. MVP Requirements Matrix

### Must Have (P0) - Blocking MVP

| ID | Requirement | Module | Status | Effort |
|----|-------------|--------|--------|--------|
| MVP-01 | Strip tokens/IVs from folder API | email | ✅ Done | Small |
| MVP-02 | Redis authentication | infra | ✅ Done | Small |
| MVP-03 | Replace default secrets | infra | ✅ Done | Small |
| MVP-04 | SSRF-safe attachment downloads | email | ✅ Safe (signed S3 URLs) | Medium |
| MVP-05 | Log sanitization | audit | ✅ Done | Medium |
| MVP-06 | Remove console.log (frontend) | frontend | ⚠️ Logger exists (156 bypass) | Small |

### Should Have (P1) - Important

| ID | Requirement | Module | Status | Effort |
|----|-------------|--------|--------|--------|
| MVP-07 | Wire AI Queue Service | ai | ✅ Done | Medium |
| MVP-08 | Wire LLM Telemetry Service | ai | ✅ Done | Small |
| MVP-09 | Email Send queue | email-sync | ✅ Done (worker added) | Medium |
| MVP-10 | Provider Sync-back queue | email-sync | ✅ Done (worker added) | Medium |
| MVP-11 | Fix localStorage SSR issues | frontend | ✅ Done (Calendar.tsx) | Medium |
| MVP-12 | Add component tests | frontend | ❌ | Large |

### Nice to Have (P2) - Post-MVP

| ID | Requirement | Module | Status | Effort |
|----|-------------|--------|--------|--------|
| MVP-13 | Memory summarization | ai | ❌ | Medium |
| MVP-14 | Idempotency for AI actions | ai | ❌ | Medium |
| MVP-15 | Unified UI styling | frontend | ❌ | Large |
| MVP-16 | Full-text search (OpenSearch) | email | ❌ | Large |
| MVP-17 | IMAP connection pooling | email-sync | ❌ | Medium |

### Backend Audit Items (from backend-audit-roadmap.md)

#### Immediate (P0/P1)

| ID | Requirement | Status | File(s) |
|----|-------------|--------|---------|
| AUDIT-01 | Config alignment (DATABASE_URL vs DB_*) | ✅ Done | env.validation.ts - DB_* + TLS vars added |
| AUDIT-02 | DLQ failedAt serialization (Date vs string) | ✅ Fixed | dead-letter-queue.service.ts:448 |
| AUDIT-03 | DLQ Redis connection sprawl | ✅ Shared conn | queue.config.ts, dead-letter-queue.service.ts |
| AUDIT-04 | DLQ setInterval.unref() | ✅ Fixed | dead-letter-queue.service.ts:497 |
| AUDIT-05 | PASSWORD_RESET_SECRET in prod | ✅ Fails now | auth.service.ts:62-67 |
| AUDIT-06 | Redis TLS support | ✅ Done | configuration.ts - REDIS_TLS_ENABLED, rediss:// |

#### Near-Term (P1)

| ID | Requirement | Status | File(s) |
|----|-------------|--------|---------|
| AUDIT-07 | Worker stalled/error + DLQ handoff | ✅ Done | email-embedding.queue.ts |
| AUDIT-08 | Graceful shutdown BullMQ | ✅ Done | All queue services |
| AUDIT-09 | Mistral 429/5xx backoff | ✅ Done | email-embedding.queue.ts:90-101 |
| AUDIT-10 | Embedding job deduplication | ✅ In-memory | email-embedding.queue.ts:38,142 |
| AUDIT-11 | Embedding TTL/retention | ✅ Done | knowledge-base.service.ts:969-1096 |
| AUDIT-12 | Per-queue Prometheus metrics | ✅ Done | queue-health.service.ts - shared Redis conn |

#### Mid-Term (P2)

| ID | Requirement | Status | File(s) |
|----|-------------|--------|---------|
| AUDIT-13 | Grafana dashboards | ✅ Done | monitoring/grafana/dashboards/mailagent-queues.json |
| AUDIT-14 | Alert rules (DLQ, Redis, 429s) | ✅ Done | monitoring/alertmanager/alerts.yml |
| AUDIT-15 | Embedding retention policies | ✅ Done | Same as AUDIT-11, knowledge-base.service.ts |
| AUDIT-16 | Operational runbooks | ✅ Done | docs/runbooks/QUEUE_OPERATIONS.md, REDIS_OPERATIONS.md |

---

## 5. Phase 1: Critical Security Fixes

**Duration:** 2-3 days
**Priority:** P0 - Must complete before any deployment

### 5.1 Strip Secrets from API Responses (MVP-01)

**File:** `backend/src/modules/email/controllers/folders.controller.ts`

**Issue:** Folder API returns full `providerConfig` including access tokens, refresh tokens, and IVs.

**Fix:**

```typescript
// Use Prisma select to exclude sensitive fields
const folders = await this.prisma.folder.findMany({
  where: { providerId },
  include: {
    providerConfig: {
      select: {
        id: true,
        email: true,
        providerType: true,
        status: true,
        // Explicitly exclude: accessToken, refreshToken, iv, tokenIv
      }
    }
  }
});
```

**Files to modify:**

- `backend/src/modules/email/controllers/folders.controller.ts`
- `backend/src/modules/providers/controllers/providers.controller.ts`

### 5.2 Redis Authentication (MVP-02)

**File:** `docker-compose.dev.yml`

**Current:** Redis runs without password.

**Fix:**

```yaml
redis:
  image: redis:7-alpine
  container_name: mailagent-redis
  command: redis-server --requirepass ${REDIS_PASSWORD:-mailagent_redis_secret}
  environment:
    REDIS_PASSWORD: ${REDIS_PASSWORD:-mailagent_redis_secret}
```

**Update:** `backend/src/config/configuration.ts`

```typescript
redis: {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
}
```

### 5.3 Replace Default Secrets (MVP-03)

**Files to update:**

- `.env.example` - Document all required secrets
- `docker-compose.dev.yml` - Remove hardcoded defaults
- `backend/src/config/configuration.ts` - Fail if secrets missing in production

**Required secrets:**

```bash
JWT_SECRET=           # Must be 32+ chars, random
JWT_REFRESH_SECRET=   # Must be 32+ chars, random
ENCRYPTION_KEY=       # Must be 32 chars for AES-256
REDIS_PASSWORD=       # For Redis AUTH
DATABASE_URL=         # Full Postgres connection string
MISTRAL_API_KEY=      # For AI features
```

**Validation:**

```typescript
// backend/src/config/configuration.ts
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'];
  for (const key of required) {
    if (!process.env[key] || process.env[key].length < 32) {
      throw new Error(`${key} must be set and at least 32 characters in production`);
    }
  }
}
```

### 5.4 SSRF-Safe Attachment Downloads (MVP-04)

**File:** `backend/src/modules/email/controllers/attachments.controller.ts`

**Issue:** Current implementation proxies attachment downloads, creating SSRF risk.

**Fix:** Return signed S3 URLs instead of proxying content.

```typescript
@Get(':attachmentId/download')
async downloadAttachment(
  @Param('attachmentId') attachmentId: string,
  @Req() req: any,
) {
  const attachment = await this.attachmentService.getAttachment(attachmentId, req.user.tenantId);

  // Generate signed URL (expires in 5 minutes)
  const signedUrl = await this.storageService.getSignedUrl(attachment.s3Key, 300);

  // Redirect to signed URL
  return { url: signedUrl, expiresIn: 300 };
}
```

### 5.5 Log Sanitization (MVP-05)

**File:** `backend/src/common/services/log-sanitizer.service.ts` (new)

**Create sanitization service:**
```typescript
@Injectable()
export class LogSanitizerService {
  private readonly sensitiveFields = [
    'password', 'accessToken', 'refreshToken', 'token',
    'secret', 'apiKey', 'authorization', 'cookie',
    'body', 'content', 'emailBody' // Email content
  ];

  sanitize(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = { ...obj };
    for (const key of Object.keys(sanitized)) {
      if (this.sensitiveFields.some(f => key.toLowerCase().includes(f))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    return sanitized;
  }
}
```

---

## 6. Phase 2: Backend Hardening

**Duration:** 3-4 days
**Priority:** P1 - Important for reliability

### 6.1 Wire AI Queue Service (MVP-07)

**File:** `backend/src/modules/ai/voltagent/services/ai-queue.service.ts`

The AI Queue Service exists but is not connected to the multi-agent system.

**Changes needed:**
1. Import `AiQueueService` in `multi-agent.service.ts`
2. Route LLM calls through queue for rate limiting
3. Add circuit breaker for API failures

```typescript
// multi-agent.service.ts
@Injectable()
export class MultiAgentService {
  constructor(
    private readonly aiQueueService: AiQueueService, // Add
    private readonly llmTelemetryService: LlmTelemetryService, // Add
  ) {}

  async processQuery(query: string, context: AgentContext): Promise<AgentResponse> {
    // Queue the LLM call with rate limiting
    const job = await this.aiQueueService.addJob({
      tenantId: context.tenantId,
      userId: context.userId,
      prompt: query,
      conversationId: context.conversationId,
    });

    // Wait for result with timeout
    return await job.waitUntilFinished(this.queueEvents, 30000);
  }
}
```

### 6.2 Wire LLM Telemetry Service (MVP-08)

**File:** `backend/src/modules/ai/services/llm-telemetry.service.ts`

Connect telemetry to track:
- Request/response times
- Token usage
- Error rates
- Model performance

```typescript
// Wrap LLM calls with telemetry
const startTime = Date.now();
try {
  const response = await this.mistralService.chat(messages);
  await this.telemetryService.recordCall({
    model: 'mistral-large',
    latencyMs: Date.now() - startTime,
    inputTokens: this.countTokens(messages),
    outputTokens: this.countTokens(response),
    success: true,
    tenantId,
    userId,
  });
  return response;
} catch (error) {
  await this.telemetryService.recordCall({
    model: 'mistral-large',
    latencyMs: Date.now() - startTime,
    success: false,
    error: error.message,
    tenantId,
    userId,
  });
  throw error;
}
```

### 6.3 Complete Email Send Queue (MVP-09)

**File:** `backend/src/modules/email-sync/services/email-send-queue.service.ts`

Wire the email send queue to handle:
- Immediate sends
- Scheduled sends
- Retry on failure
- Rate limiting per provider

### 6.4 Complete Provider Sync-Back Queue (MVP-10)

**File:** `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts`

Handle batching of operations:
- Mark read/unread
- Star/unstar
- Archive/trash
- Move between folders
- Label changes

### 6.5 Redis Configuration

**File:** `monitoring/redis.conf` (new)

```conf
# Memory management
maxmemory 256mb
maxmemory-policy noeviction

# Persistence
appendonly yes
appendfsync everysec

# Security
requirepass ${REDIS_PASSWORD}

# Performance
tcp-keepalive 300
timeout 0
```

---

## 7. Phase 3: AI System Polish

**Duration:** 2-3 days
**Priority:** P1 - Improves user experience

### 7.1 Action Executor Summaries

**File:** `backend/src/modules/ai/multi-agent/services/action-executor.service.ts`

**Issue:** 25/26 methods missing `summary` field in responses.

**Fix:** Add user-friendly summary to all action results:

```typescript
// Before
return { success: true, data: emails };

// After
return {
  success: true,
  data: emails,
  summary: this.i18n.t('ai.actions.getUnread.summary', {
    count: emails.length,
    locale: context.locale
  })
};
```

### 7.2 Internationalization for AI Responses

**File:** `backend/src/modules/ai/i18n/` (new directory)

Create i18n files for AI action messages:

- `en.json`
- `it.json`
- `es.json`
- `fr.json`
- `de.json`
- `pt.json`

### 7.3 Memory Summarization (MVP-13 - P2)

**File:** `backend/src/modules/ai/multi-agent/services/memory.service.ts`

When conversation exceeds token budget, summarize older messages:

```typescript
async getContextWithBudget(
  conversationId: string,
  maxTokens: number = 4000
): Promise<Message[]> {
  const messages = await this.getMessages(conversationId);
  const totalTokens = this.countTokens(messages);

  if (totalTokens <= maxTokens) {
    return messages;
  }

  // Summarize older messages
  const summary = await this.summarizeMessages(messages.slice(0, -5));
  const recentMessages = messages.slice(-5);

  return [
    { role: 'system', content: `Previous conversation summary: ${summary}` },
    ...recentMessages
  ];
}
```

---

## 8. Phase 4: Frontend Polish

**Duration:** 3-4 days
**Priority:** P1 - User-facing issues

### 8.1 Remove Console.log Statements (MVP-06)

**Files:** All frontend files (212 occurrences)

**Command:**
```bash
# Find all console.log statements
grep -r "console.log" frontend/src --include="*.ts" --include="*.tsx" -l

# Replace with proper logging or remove
```

**Proper logging approach:**
```typescript
// Create logger utility
// frontend/src/lib/logger.ts
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: any[]) => isDev && console.debug('[DEBUG]', ...args),
  info: (...args: any[]) => isDev && console.info('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};
```

### 8.2 Fix localStorage SSR Issues (MVP-11)

**Issue:** Direct localStorage usage causes SSR hydration errors.

**Fix:** Use zustand persist middleware with proper SSR handling:

```typescript
// frontend/src/stores/use-settings-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme: string) => set({ theme }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => {
        // Only access localStorage on client
        if (typeof window !== 'undefined') {
          return localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      skipHydration: true, // Manual hydration
    }
  )
);
```

### 8.3 Add Loading States

**Files:** All page components

Add `loading.tsx` files for each route:
```typescript
// frontend/src/app/mail/loading.tsx
export default function MailLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
```

### 8.4 Add Error Boundaries

**Files:** All page components

Add `error.tsx` files:
```typescript
// frontend/src/app/mail/error.tsx
'use client';

export default function MailError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### 8.5 Component Tests (MVP-12)

**Setup React Testing Library:**
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom vitest
```

**Example test:**
```typescript
// frontend/src/components/email-list/__tests__/email-list.test.tsx
import { render, screen } from '@testing-library/react';
import { EmailList } from '../email-list';

describe('EmailList', () => {
  it('renders email items', () => {
    const emails = [
      { id: '1', subject: 'Test Email', from: 'test@example.com' }
    ];
    render(<EmailList emails={emails} />);
    expect(screen.getByText('Test Email')).toBeInTheDocument();
  });
});
```

---

## 9. Phase 5: Production Readiness

**Duration:** 2-3 days
**Priority:** P0 - Required for deployment

### 9.1 Environment Configuration

**File:** `.env.production.example`

```bash
# Required - Application will fail without these
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/mailagent?schema=public
REDIS_HOST=redis-host
REDIS_PORT=6379
REDIS_PASSWORD=strong_password_here

# Security - Must be unique per deployment
JWT_SECRET=random_32_char_string_here
JWT_REFRESH_SECRET=another_random_32_char_string
ENCRYPTION_KEY=32_char_encryption_key_here

# OAuth - Required for email providers
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# AI - Required for AI features
MISTRAL_API_KEY=your_mistral_api_key

# Optional - Storage
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
```

### 9.2 Health Check Endpoints

Verify all endpoints work:
- `GET /health` - System health
- `GET /health/live` - Liveness probe (k8s)
- `GET /health/ready` - Readiness probe (k8s)
- `GET /health/queues/all` - All queue status
- `GET /health/metrics` - Prometheus metrics

### 9.3 Graceful Shutdown

**File:** `backend/src/main.ts`

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown
  app.enableShutdownHooks();

  // Handle termination signals
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  });

  await app.listen(3000);
}
```

### 9.4 Rate Limiting Configuration

**File:** `backend/src/app.module.ts`

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

### 9.5 CORS Configuration

**File:** `backend/src/main.ts`

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
  maxAge: 86400, // 24 hours
});
```

---

## 10. Testing Strategy

### 10.1 Backend Tests

| Type | Coverage Target | Current |
|------|-----------------|---------|
| Unit Tests | 80% | ~60% |
| Integration Tests | 70% | ~40% |
| E2E Tests | 50% | ~20% |

**Priority test areas:**
1. AI action executor (all 26 methods)
2. Email sync workers
3. OAuth token refresh
4. Queue job processing
5. Tenant isolation

### 10.2 Frontend Tests

| Type | Coverage Target | Current |
|------|-----------------|---------|
| Component Tests | 70% | ~10% |
| Hook Tests | 60% | ~20% |
| E2E Tests | 30% | ~0% |

**Priority test areas:**
1. Email list rendering
2. Compose dialog
3. AI chat panel
4. Authentication flow

### 10.3 Security Tests

Run before each release:
```bash
# Dependency audit
npm audit --production

# OWASP checks (use ZAP or similar)
zap-baseline.py -t http://localhost:3000

# SQL injection tests
sqlmap -u "http://localhost:3000/api/emails?search=test"
```

---

## 11. Deployment Checklist

### Pre-Deployment

- [ ] All P0 items complete
- [ ] Security audit passed
- [ ] Load testing completed (target: 1000 concurrent users)
- [ ] Database migrations tested
- [ ] Backup/restore procedure documented
- [ ] Rollback procedure documented

### Deployment Steps

1. [ ] Database backup
2. [ ] Run migrations
3. [ ] Deploy backend (blue-green)
4. [ ] Verify health endpoints
5. [ ] Deploy frontend
6. [ ] Smoke tests
7. [ ] Monitor for 30 minutes

### Post-Deployment

- [ ] Verify metrics in Grafana
- [ ] Check error rates in logs
- [ ] Verify email sync working
- [ ] Test AI features
- [ ] Confirm OAuth flows

---

## 12. Success Metrics

### Performance KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (p95) | < 500ms | Prometheus |
| Email Sync Latency | < 30s | Queue metrics |
| AI Response Time | < 5s | LLM telemetry |
| Error Rate | < 0.1% | Application logs |
| Uptime | 99.9% | Health checks |

### User Experience KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to First Email | < 10s | Frontend analytics |
| AI Action Success Rate | > 95% | Backend metrics |
| Search Results Time | < 2s | Frontend analytics |
| Page Load Time | < 3s | Lighthouse |

### Infrastructure KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Queue Depth (max) | < 1000 | Prometheus |
| Redis Memory | < 500MB | Prometheus |
| Database Connections | < 100 | PgBouncer |
| Worker CPU | < 80% | Container metrics |

---

## References

### Security
- [NestJS Security Best Practices](https://dev.to/drbenzene/best-security-implementation-practices-in-nestjs-a-comprehensive-guide-2p88)
- [NestJS Production Defaults](https://javascript.plainenglish.io/secure-your-nestjs-application-production-ready-defaults-for-safety-and-dx-1b6896b1ce74)
- [OWASP NestJS Protections](https://medium.com/@febriandwikimhan/securing-nestjs-apps-implementing-key-owasp-protections-8ef60df6ecf8)

### Multi-Agent AI
- [LangChain Multi-Agent Systems](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems/)
- [Benchmarking Multi-Agent Architectures](https://blog.langchain.com/benchmarking-multi-agent-architectures/)
- [LangGraph Multi-Agent Workflows](https://blog.langchain.com/langgraph-multi-agent-workflows/)

### BullMQ
- [BullMQ Production Guide](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ Ultimate Guide 2025](https://www.dragonflydb.io/guides/bullmq)

### Next.js
- [Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)
- [Next.js 15 Best Practices](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji)

### Email OAuth
- [Microsoft OAuth for IMAP/SMTP](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)
- [Google Workspace Email Setup](https://support.google.com/a/answer/9003945)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-08 | Claude | Initial comprehensive roadmap |
