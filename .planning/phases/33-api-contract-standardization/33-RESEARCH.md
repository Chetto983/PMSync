# Phase 33: API Contract Standardization - Research

**Researched:** 2026-03-03
**Domain:** NestJS API infrastructure (interceptors, filters, global prefix), OpenAPI tooling, frontend error state patterns
**Confidence:** HIGH

## Summary

Phase 33 standardizes the API contract layer across the entire MailAgent stack. The backend work centers on NestJS 11.1.13 interceptors/filters and `setGlobalPrefix`, all of which are well-documented, stable APIs with existing codebase patterns to follow. The frontend work is a disciplined find-and-replace audit of silent catch-and-return-empty patterns in query hooks. The tooling work (Spectral + openapi-typescript) involves standard npm packages with straightforward CI integration.

The codebase is already 80% of the way there -- `RequestIdMiddleware` already generates request IDs and sets the `X-Request-ID` response header, `CorrelationInterceptor` exists but is not globally registered, and the existing filter/interceptor registration pattern in `app.module.ts` and `main.ts` is clear. The main risk is the hard cutover of `setGlobalPrefix('api/v1')` which will break any client hitting bare routes, plus the frontend path adjustments for the ~40+ call sites in `frontend/lib/api/*.ts` that already use explicit `/api/v1/` prefixes (these will double-prefix unless stripped).

**Primary recommendation:** Implement backend-first (global prefix + envelope interceptor + unified filter + correlation interceptor), then frontend (baseURL change + path cleanup + silent fallback audit), then tooling (Spectral + openapi-typescript CI step) as three sequential waves.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `app.setGlobalPrefix('api/v1')` in `main.ts` with explicit excludes for webhooks (`webhooks/*`) and health (`health`)
- Hard cutover -- no dual-route transition period. Old bare routes stop working immediately
- Remove manual `api/v1/` prefixes from AI controllers (`@Controller(['ai', 'api/v1/ai'])` -> `@Controller('ai')`) and subscription controllers (`@Controller('api/v1/subscription')` -> `@Controller('subscription')`)
- Swagger docs stay at `/api/docs` -- excluded from the global prefix
- Frontend `apiClient` baseURL absorbs `/api/v1` -- existing paths like `/contacts`, `/emails` work unchanged. AI paths that had explicit `/api/v1/ai/...` get stripped to `/ai/...`
- `DOMAIN_ACTION` format for error codes: e.g., `EMAIL_NOT_FOUND`, `AUTH_TOKEN_EXPIRED`, `CONTACT_DUPLICATE`, `CALENDAR_SYNC_FAILED`
- Error response shape: `{ error: { code, message, details }, meta: { requestId } }` -- no `statusCode` in body
- `details` field typed per context: validation -> `{ fields: [{ field, message }] }`, rate limit -> `{ retryAfter: number }`, not found -> `{ resource, id }`, unknown -> `null`
- Map Prisma errors: P2002 -> `DOMAIN_DUPLICATE` (409), P2025 -> `DOMAIN_NOT_FOUND` (404), rest -> `INTERNAL_ERROR` (500)
- Single unified `ApiExceptionFilter` replaces both `AllExceptionsFilter` and `HttpExceptionFilter`
- Global `ResponseEnvelopeInterceptor` registered in `main.ts` -- wraps all responses in `{ data, meta: { requestId, timestamp } }`
- `@SkipEnvelope` custom decorator for SSE/streaming endpoints (AI chat)
- Pagination metadata goes in `meta`: `{ data: [...items], meta: { requestId, timestamp, pagination: { page, pageSize, total, totalPages } } }`
- Frontend apiClient auto-unwraps: Axios response interceptor strips `data` layer (`response.data = response.data.data`). `meta` accessible via separate accessor
- Full audit of ALL frontend query hooks for silent fallbacks -- not just dashboard
- Replace silent mock data with visible error states: muted error card with message + retry button
- Error states include user-friendly message with collapsible technical details (`Show details` expands to reveal error code + requestId)
- Structured console logging on API errors: `{ code, requestId, endpoint }` -- no external telemetry
- Remove all catch-and-return-mock patterns; let TanStack Query handle error states natively
- Register `CorrelationInterceptor` globally in `main.ts`
- BullMQ job payloads include originating `requestId`
- Spectral linting with standard rules -- structural correctness
- `openapi-typescript` generates `frontend/types/api.generated.ts` from the spec
- Spectral runs in CI pipeline as a blocking step

### Claude's Discretion
- Exact exclude list for `setGlobalPrefix` (all webhook paths, health, any other edge cases)
- Exact error code registry (which domains, which actions -- derive from existing controllers)
- CorrelationInterceptor BullMQ propagation implementation details
- Spectral ruleset selection and CI step configuration
- apiClient response interceptor implementation details (meta accessor pattern)
- Order of operations for the hard cutover (backend first, then frontend, or simultaneous)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | Global ResponseEnvelopeInterceptor wraps all success responses in `{ data, meta: { requestId, timestamp } }` with @SkipEnvelope for streaming | NestJS interceptor pattern fully documented; existing `ResponseTimeInterceptor` in codebase provides template; `Reflector` + `SetMetadata` for @SkipEnvelope decorator |
| API-02 | Unified ApiExceptionFilter emits `{ error: { code, message, details }, meta }` with machine-readable error codes per domain | Existing `AllExceptionsFilter` and `HttpExceptionFilter` provide base; Prisma error code mapping documented; `ProviderErrorInterceptor` shows domain error pattern |
| API-03 | Global API prefix `api/v1` enforced via setGlobalPrefix, manual prefixes removed from 8 controllers | NestJS `setGlobalPrefix` with `exclude` option verified; 8 controllers with explicit `api/v1` identified; Swagger exclude path documented |
| API-04 | CorrelationInterceptor registered globally, correlation IDs propagated through BullMQ jobs and AI run records | `CorrelationInterceptor` exists but not globally registered; `RequestIdMiddleware` already sets `X-Request-ID` header; BullMQ `.add()` patterns identified across codebase |
| API-05 | OpenAPI spec linted via Spectral in CI, frontend types generated via openapi-typescript | `@stoplight/spectral-cli` v6.15.0 + `openapi-typescript` verified; CI workflow at `.github/workflows/ci.yml` ready for new steps |
| PERF-04 | Silent frontend API fallbacks replaced with explicit degraded states and telemetry | 18+ silent catch blocks identified across `use-dashboard.ts`, `use-follow-ups.ts`, `use-writing-style.ts`, `use-signatures.ts` |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/common | 11.1.13 | Interceptors, filters, decorators, pipes | Already installed; provides all infrastructure |
| @nestjs/core | 11.1.13 | APP_INTERCEPTOR, APP_FILTER, Reflector | DI token registration for global interceptors |
| @nestjs/swagger | 11.2.6 | OpenAPI spec generation from decorators | Already wired in main.ts with SwaggerModule |
| axios | (frontend) | HTTP client with interceptor chain | Already in apiClient; response interceptor needed |
| @tanstack/react-query | (frontend) | Data fetching with error state management | Already used for all query hooks |

### New Dependencies (To Install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @stoplight/spectral-cli | ^6.15.0 | OpenAPI spec linting in CI | devDependency in backend; run via npx in CI |
| openapi-typescript | latest | Generate TS types from OpenAPI spec | devDependency in frontend; run as build script |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @stoplight/spectral-cli | swagger-cli validate | Spectral has richer rules and custom rulesets; swagger-cli only validates schema |
| openapi-typescript | openapi-typescript-codegen | codegen generates runtime client code (heavier); openapi-typescript generates types only (lighter, what we need) |

**Installation:**
```bash
# Backend (devDep only)
cd backend && npm install -D @stoplight/spectral-cli

# Frontend (devDep only)
cd frontend && npm install -D openapi-typescript
```

## Architecture Patterns

### Backend: Interceptor/Filter Registration Order

NestJS applies interceptors in registration order (first registered = outermost). Filters are applied in reverse registration order (last registered catches first).

**Current registration in `main.ts`:**
```typescript
app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
```

**Current registration in `app.module.ts` (DI-aware):**
```typescript
{ provide: APP_INTERCEPTOR, useClass: ResponseTimeInterceptor },
{ provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
{ provide: APP_FILTER, useClass: ThrottlerExceptionFilter },
```

**Target registration:**
```
main.ts:
  app.setGlobalPrefix('api/v1', { exclude: [...] });
  app.useGlobalFilters(new ApiExceptionFilter());  // replaces both old filters
  app.useGlobalInterceptors(new CorrelationInterceptor());  // needs no DI

app.module.ts:
  { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },  // NEW
  { provide: APP_INTERCEPTOR, useClass: ResponseTimeInterceptor },
  { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  // ThrottlerExceptionFilter REMOVED -- unified ApiExceptionFilter handles it
```

**CRITICAL: Registration location matters.**
- `CorrelationInterceptor` uses `CorrelationContext.run()` (static, no DI needed) -> can register in `main.ts` via `useGlobalInterceptors`
- `ResponseEnvelopeInterceptor` needs `Reflector` for `@SkipEnvelope` -> MUST register via `APP_INTERCEPTOR` in `app.module.ts`
- `ApiExceptionFilter` replaces both `AllExceptionsFilter` and `HttpExceptionFilter` -> register in `main.ts` via `useGlobalFilters`
- `ThrottlerExceptionFilter` currently in `app.module.ts` -> its behavior gets absorbed into `ApiExceptionFilter`

### Backend: Global Prefix Exclude List

Based on controller analysis, the exclude list for `setGlobalPrefix` must include:

| Path Pattern | Method | Reason |
|-------------|--------|--------|
| `health` | GET | Health check endpoint (no auth, no prefix) |
| `webhooks/*path` | ALL | All webhook controllers: `webhooks/calendar`, `webhooks/contacts`, `webhooks/autumn`, `webhooks` (email-sync) |
| `api/docs` | GET | Swagger UI (SwaggerModule.setup already uses absolute path) |
| `api/docs-json` | GET | Swagger JSON spec endpoint |

**NestJS syntax (verified from official docs):**
```typescript
import { RequestMethod } from '@nestjs/common';

app.setGlobalPrefix('api/v1', {
  exclude: [
    { path: 'health', method: RequestMethod.ALL },
    { path: 'webhooks/*path', method: RequestMethod.ALL },
  ],
});
```

**NOTE:** NestJS 11 uses path-to-regexp v8 which requires named parameters for wildcards. Use `webhooks/*path` not `webhooks/*`. The `api/docs` path does NOT need exclusion because `SwaggerModule.setup('api/docs', ...)` registers at an absolute path before the global prefix takes effect.

### Backend: Controller Prefix Cleanup

Controllers that need manual `api/v1/` prefix removal (8 total):

| File | Current Prefix | New Prefix |
|------|---------------|------------|
| `ai/controllers/ai.controller.ts` | `['ai', 'api/v1/ai']` | `'ai'` |
| `ai/controllers/ai-health.controller.ts` | `['ai', 'api/v1/ai']` | `'ai'` |
| `ai/controllers/knowledge-base.controller.ts` | `['ai/knowledge-base', 'api/v1/ai/knowledge-base']` | `'ai/knowledge-base'` |
| `ai-chat/controllers/ai-chat.controller.ts` | `['ai', 'api/v1/ai']` | `'ai'` |
| `ai-chat/controllers/hitl.controller.ts` | `['ai/chat', 'api/v1/ai/chat']` | `'ai/chat'` |
| `subscription/controllers/subscription.controller.ts` | `'api/v1/subscription'` | `'subscription'` |
| `subscription/controllers/autumn.controller.ts` | `'api/v1/autumn'` | `'autumn'` |
| `subscription/controllers/autumn-webhook.controller.ts` | `'webhooks/autumn'` | `'webhooks/autumn'` (no change -- excluded from prefix) |

Actually `autumn-webhook.controller.ts` has `'webhooks/autumn'` which is already correct -- it falls under the webhook exclude pattern. So **7 controllers** need changes, not 8.

### Backend: @SkipEnvelope Decorator Pattern

The streaming chat endpoint (`POST /ai/chat`) uses `pipeUIMessageStreamToResponse` which writes directly to the Express response. The `ResponseEnvelopeInterceptor` must NOT wrap this response.

```typescript
// backend/src/common/decorators/skip-envelope.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
```

```typescript
// In ResponseEnvelopeInterceptor
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
```

**Endpoints needing @SkipEnvelope:**
- `AiChatController.chat()` -- SSE streaming via `pipeUIMessageStreamToResponse`
- Any future SSE endpoints

**CRITICAL GOTCHA:** The chat endpoint uses `@Res() res: Response` and calls `pipeUIMessageStreamToResponse` which bypasses NestJS interceptors entirely (because `@Res()` puts NestJS in passthrough mode). So `@SkipEnvelope` on the chat method is technically redundant -- BUT it should still be added for documentation and safety if the pattern ever changes.

### Backend: Unified ApiExceptionFilter

The new filter must handle:
1. `HttpException` (NestJS built-in) -- extract status, message, validation errors
2. `ThrottlerException` -- 429 with `Retry-After` header
3. `PrismaClientKnownRequestError` -- map P2002/P2025/others
4. Generic `Error` -- 500 with no details leaked
5. Unknown throws -- 500 fallback

```typescript
// Shape for ALL error responses
{
  error: {
    code: string,        // 'EMAIL_NOT_FOUND', 'VALIDATION_ERROR', 'INTERNAL_ERROR'
    message: string,     // Human-readable
    details: object|null // Typed per context
  },
  meta: {
    requestId: string    // From req.id (set by RequestIdMiddleware)
  }
}
```

**Error Code Registry (recommended -- derive from existing controllers):**

| Domain | Codes |
|--------|-------|
| General | `VALIDATION_ERROR`, `INTERNAL_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED` |
| Email | `EMAIL_NOT_FOUND`, `EMAIL_DUPLICATE`, `EMAIL_SEND_FAILED` |
| Auth | `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_MFA_REQUIRED` |
| Contact | `CONTACT_NOT_FOUND`, `CONTACT_DUPLICATE` |
| Calendar | `CALENDAR_NOT_FOUND`, `CALENDAR_SYNC_FAILED` |
| Provider | `PROVIDER_NOT_FOUND`, `PROVIDER_TOKEN_EXPIRED`, `PROVIDER_RATE_LIMITED` |
| AI | `AI_QUOTA_EXCEEDED`, `AI_SERVICE_UNAVAILABLE` |
| Subscription | `SUBSCRIPTION_NOT_FOUND`, `SUBSCRIPTION_CANCELED` |

### Frontend: apiClient Response Interceptor

```typescript
// In frontend/lib/api-client.ts -- add response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Auto-unwrap envelope: { data, meta } -> data
    if (response.data && typeof response.data === 'object' && 'data' in response.data && 'meta' in response.data) {
      // Store meta for optional access
      (response as any)._meta = response.data.meta;
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    // Structured console logging
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      const meta = error.response.data.meta;
      console.error('[API Error]', {
        code: apiError.code,
        requestId: meta?.requestId,
        endpoint: `${error.config?.method?.toUpperCase()} ${error.config?.url}`,
      });
    }
    // ... existing 401/403 handling ...
  },
);
```

**CRITICAL: Ordering matters.** The unwrap interceptor must run BEFORE the existing 401/403 interceptor. Axios response interceptors run in FIFO order -- add the unwrap interceptor FIRST.

### Frontend: baseURL Change

```typescript
// Current:
baseURL: apiBaseURL,  // e.g., 'http://localhost:3000'

// New:
baseURL: `${apiBaseURL}/api/v1`,  // e.g., 'http://localhost:3000/api/v1'
```

**Path cleanup required (40+ call sites in `frontend/lib/api/*.ts` that use `/api/v1/` prefix):**

| File | Current Path | New Path |
|------|-------------|----------|
| `ai.ts` (all ~20 calls) | `/api/v1/ai/...` | `/ai/...` |
| `billing.ts` (all ~15 calls) | `/api/v1/subscription/...`, `/api/v1/autumn/...` | `/subscription/...`, `/autumn/...` |
| `crm.ts` | `/api/v1/ai/crm/...` | `/ai/crm/...` |
| `analytics.ts` | `/api/v1/ai/analytics/...` | `/ai/analytics/...` |
| `use-dashboard.ts` line 693 | `/api/v1/ai/analytics/email` | `/ai/analytics/email` |

All paths WITHOUT explicit `/api/v1/` prefix (e.g., `/contacts`, `/emails`, `/providers`, `/auth`, `/users`) work unchanged because baseURL now includes the prefix.

**Auth endpoints that must NOT use the `api/v1` prefix:**
- `getCsrfToken()` calls `${apiBaseURL}/auth/csrf-token` directly (not via apiClient) -- this needs to become `${apiBaseURL}/api/v1/auth/csrf-token`
- OR better: use `apiClient.get('/auth/csrf-token')` which will auto-prefix via baseURL

### Frontend: Silent Fallback Audit

Identified catch-and-return-empty patterns to replace:

| File | Line(s) | Current Behavior | Fix |
|------|---------|-----------------|-----|
| `use-dashboard.ts` | 103 | briefingOptions: returns empty briefing | Remove catch; let error propagate |
| `use-dashboard.ts` | 156, 187 | deadlinesOptions: fallback to calendar, then empty | Remove catch; let error propagate |
| `use-dashboard.ts` | 237 | followUpsOptions: returns empty | Remove catch |
| `use-dashboard.ts` | 280, 310 | staleContactsOptions: fallback to contacts, then empty | Remove catch |
| `use-dashboard.ts` | 393 | importantEmailsOptions: returns empty | Remove catch |
| `use-dashboard.ts` | 426 | recentUnreadEmailsOptions: returns empty | Remove catch |
| `use-dashboard.ts` | 473 | todayEventsOptions: returns empty | Remove catch |
| `use-dashboard.ts` | 512 | recentContactsOptions: returns empty | Remove catch |
| `use-dashboard.ts` | 701 | emailTrendsOptions: generates mock chart data | Remove catch |
| `use-dashboard.ts` | 800 | triagedEmailsOptions: returns empty | Remove catch |
| `use-follow-ups.ts` | 86 | pendingFollowUpsOptions: returns empty | Remove catch |
| `use-writing-style.ts` | 30 | useWritingStyle: returns null | Acceptable -- 404 = no profile yet |
| `use-writing-style.ts` | 68 | useDraftStats: returns null | Acceptable -- 404 = no stats yet |
| `use-signatures.ts` | 32 | signaturesListOptions: returns [] on 404 | Acceptable -- endpoint may not exist |
| `use-signatures.ts` | 57 | signatureDefaultOptions: returns null on 404 | Acceptable -- no default set |

**Decision point:** Some catches (writing-style, signatures) handle legitimate 404s (resource not yet created). These should keep their catch but ONLY for 404 status, re-throwing all other errors. The dashboard catch blocks that return empty/mock data are the real problem.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec validation | Custom JSON schema checks | @stoplight/spectral-cli | 30+ built-in OpenAPI rules, custom rulesets, GitHub Action |
| TypeScript type generation from API | Manual interface definitions | openapi-typescript | Auto-generates from spec, catches drift, zero runtime |
| Request ID generation | Custom UUID/timestamp logic | nanoid (already used) | Already in RequestIdMiddleware, collision-resistant |
| Response envelope wrapping | Per-controller manual wrapping | NestJS global interceptor | Single registration, consistent across all endpoints |
| Error response formatting | Per-controller try/catch | NestJS exception filter | Catches everything including guard/pipe errors |
| Correlation context propagation | Manual parameter threading | AsyncLocalStorage (already used) | CorrelationContextService already built on AsyncLocalStorage |

**Key insight:** NestJS's interceptor/filter pipeline was designed for exactly this use case. The codebase already has the individual pieces (RequestIdMiddleware, CorrelationInterceptor, AllExceptionsFilter) -- this phase wires them together into a unified contract.

## Common Pitfalls

### Pitfall 1: Double-Prefixed Routes After setGlobalPrefix
**What goes wrong:** Controllers with `@Controller('api/v1/subscription')` get resolved as `/api/v1/api/v1/subscription`
**Why it happens:** `setGlobalPrefix('api/v1')` prepends to ALL controller paths
**How to avoid:** Strip `api/v1/` from all 7 controllers BEFORE or AT THE SAME TIME as adding setGlobalPrefix
**Warning signs:** 404s on subscription/billing/AI endpoints after deployment

### Pitfall 2: Swagger Docs Broken by Global Prefix
**What goes wrong:** Swagger UI at `/api/docs` returns 404 or specs reference wrong paths
**Why it happens:** `SwaggerModule.setup('api/docs', ...)` registers an absolute path. With `setGlobalPrefix`, you might think it becomes `/api/v1/api/docs` -- but NestJS Swagger uses `app.getHttpAdapter()` directly, bypassing the prefix
**How to avoid:** Do NOT add `api/docs` to the exclude list unless testing shows it's needed. The Swagger setup path is independent of the global prefix. Verify docs accessibility after prefix change
**Warning signs:** `/api/docs` returns 404 or loads but shows wrong base URL

### Pitfall 3: Frontend apiClient Interceptor Order
**What goes wrong:** The response unwrap interceptor runs after the 401/403 handler, causing `error.response.data.error` to be undefined in the auth handler
**Why it happens:** Axios response interceptors run in FIFO order for success, but error interceptors also run in order
**How to avoid:** Add the envelope unwrap as the FIRST response interceptor (before auth/CSRF interceptors), BUT only unwrap on success responses -- error responses keep the `{ error, meta }` shape
**Warning signs:** 401 redirects stop working; CSRF retry fails

### Pitfall 4: SSE/Streaming Endpoints Break With Envelope
**What goes wrong:** AI chat returns `{ data: undefined, meta: {...} }` instead of SSE stream
**Why it happens:** ResponseEnvelopeInterceptor wraps the response, but SSE endpoints use `@Res()` passthrough
**How to avoid:** NestJS interceptors are bypassed when `@Res()` is used (passthrough mode), so this is actually safe by default. Still add `@SkipEnvelope` decorator for documentation/safety
**Warning signs:** AI chat responses wrapped in JSON envelope instead of SSE stream

### Pitfall 5: ThrottlerExceptionFilter Conflict
**What goes wrong:** Rate limit responses still return old `{ statusCode: 429, error, message }` shape
**Why it happens:** `ThrottlerExceptionFilter` is registered via `APP_FILTER` in `app.module.ts` and catches `ThrottlerException` before `ApiExceptionFilter` can
**How to avoid:** Remove `ThrottlerExceptionFilter` from `app.module.ts` providers. The new `ApiExceptionFilter` must handle `ThrottlerException` explicitly, including the `Retry-After` header
**Warning signs:** Inconsistent error shapes between rate-limited and non-rate-limited errors

### Pitfall 6: BullMQ Job Payload Size Increase
**What goes wrong:** Adding `requestId` to every BullMQ job payload increases Redis memory
**Why it happens:** requestId is a 21-char nanoid -- negligible per job, but worth noting for high-volume queues
**How to avoid:** Only add `requestId` to job `data`, not to `opts` or job name. It's one string field
**Warning signs:** None expected -- this is informational

### Pitfall 7: Frontend Catch Block Audit Completeness
**What goes wrong:** Some silent fallbacks survive and cause confusing UX when API errors occur
**Why it happens:** Catch blocks scattered across 4+ query hook files; easy to miss some
**How to avoid:** Use grep/search for `} catch {` and `} catch (` in `frontend/hooks/queries/` -- verify ALL are addressed
**Warning signs:** Browser console shows no errors on API failure; widgets show empty data without error indication

## Code Examples

### ResponseEnvelopeInterceptor (Verified NestJS pattern)
```typescript
// Source: NestJS official interceptor docs + codebase ResponseTimeInterceptor pattern
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          requestId: req.id || 'unknown',
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
```

### ApiExceptionFilter (Core structure)
```typescript
// Source: Existing AllExceptionsFilter + HttpExceptionFilter merged
import { Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';

@Catch()
export class ApiExceptionFilter extends BaseExceptionFilter {
  private logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = request.id || 'unknown';

    const { status, code, message, details } = this.resolveException(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, `[${requestId}] ${message}`);
    } else {
      this.logger.warn(`[${requestId}] ${status} ${code}: ${message}`);
    }

    // ThrottlerException: add Retry-After header
    if (exception instanceof ThrottlerException) {
      response.header('Retry-After', '60');
    }

    response.status(status).json({
      error: { code, message, details },
      meta: { requestId },
    });
  }

  private resolveException(exception: unknown): {
    status: number; code: string; message: string; details: any;
  } {
    // HttpException (includes ValidationPipe errors, guards, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      // ... extract code/message/details from response
    }
    // Prisma errors
    // ... P2002 -> DOMAIN_DUPLICATE, P2025 -> DOMAIN_NOT_FOUND
    // Generic Error
    // ... 500 INTERNAL_ERROR
  }
}
```

### setGlobalPrefix Configuration
```typescript
// Source: NestJS official docs (https://docs.nestjs.com/faq/global-prefix)
import { RequestMethod } from '@nestjs/common';

app.setGlobalPrefix('api/v1', {
  exclude: [
    { path: 'health', method: RequestMethod.ALL },
    { path: 'webhooks/*path', method: RequestMethod.ALL },
  ],
});
```

### CorrelationInterceptor + X-Request-ID Header
```typescript
// Source: Existing correlation.interceptor.ts -- needs response header addition
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
  const req = context.switchToHttp().getRequest();
  const res = context.switchToHttp().getResponse();

  const correlationId = req.id || req.headers['x-request-id'] || nanoid();

  // Ensure response header is set (RequestIdMiddleware already does this,
  // but CorrelationInterceptor should also set for completeness)
  res.setHeader('x-request-id', correlationId);

  // ... existing CorrelationContext.run() logic
}
```

**NOTE:** `RequestIdMiddleware` already sets `X-Request-ID` on the response (line 35 of request-id.middleware.ts). The CorrelationInterceptor does NOT currently set it. Since middleware runs before interceptors, the header is already present. The interceptor just needs to read it via `req.id`.

### BullMQ Job with requestId
```typescript
// Source: Existing queue patterns (calendar-sync-queue.service.ts, etc.)
// Add requestId to job data
import { CorrelationContext } from '../../common/services/correlation-context.service';

const requestId = CorrelationContext.getCorrelationId();
await this.queue.add('job-name', {
  ...jobData,
  requestId, // propagate correlation ID
}, options);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-controller error formatting | Global exception filter | NestJS convention since v5 | Single source of truth for error shapes |
| Manual `statusCode` in error body | HTTP status in status line only | REST best practice | Clients use HTTP status, not body field |
| path-to-regexp v3 wildcards (`*`) | path-to-regexp v8 named params (`*path`) | NestJS 11 (Express 5) | `webhooks/*` must become `webhooks/*path` in excludes |
| `response.data.data` manual unwrap | Axios response interceptor auto-unwrap | Standard Axios pattern | Frontend call sites unchanged |

**Deprecated/outdated in this codebase:**
- `AllExceptionsFilter` + `HttpExceptionFilter`: replaced by unified `ApiExceptionFilter`
- `ThrottlerExceptionFilter`: absorbed into `ApiExceptionFilter`
- Dual `@Controller(['ai', 'api/v1/ai'])` patterns: unnecessary after `setGlobalPrefix`
- Silent catch-and-return-empty in query hooks: anti-pattern for UX

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest) -- backend + frontend |
| Config file (backend) | `backend/jest.config.js` |
| Config file (frontend) | `frontend/jest.config.js` |
| Quick run command (backend) | `cd backend && npx jest --passWithNoTests --ci --forceExit` |
| Quick run command (frontend) | `cd frontend && npx jest --passWithNoTests --ci` |
| Full suite command | `cd backend && npx jest --ci --forceExit && cd ../frontend && npx jest --ci` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | ResponseEnvelopeInterceptor wraps responses | unit | `cd backend && npx jest --testPathPattern="response-envelope" -x` | Wave 0 |
| API-01 | @SkipEnvelope bypasses wrapping | unit | same as above | Wave 0 |
| API-02 | ApiExceptionFilter emits standard error shape | unit | `cd backend && npx jest --testPathPattern="api-exception-filter" -x` | Wave 0 |
| API-02 | Prisma P2002/P2025 mapped to domain codes | unit | same as above | Wave 0 |
| API-03 | All routes resolve under api/v1/ prefix | smoke | `cd backend && npx ts-node scripts/verify-routes.ts` | Wave 0 |
| API-04 | x-request-id header present on responses | unit | `cd backend && npx jest --testPathPattern="correlation" -x` | Wave 0 |
| API-05 | OpenAPI spec passes Spectral | smoke | `cd backend && npx spectral lint ./openapi-spec.json` | Wave 0 |
| API-05 | Frontend types generated and importable | smoke | `cd frontend && npx tsc --noEmit` | Wave 0 |
| PERF-04 | No silent catch-and-return-empty in hooks | manual-only | Code review -- grep for `} catch {` in hooks/queries/ | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **Per wave merge:** Full Jest suite for both backend and frontend
- **Phase gate:** Full suite green + manual Spectral lint + route verification

### Wave 0 Gaps
- [ ] `backend/src/common/interceptors/__tests__/response-envelope.interceptor.spec.ts` -- covers API-01
- [ ] `backend/src/common/filters/__tests__/api-exception-filter.spec.ts` -- covers API-02
- [ ] `backend/scripts/verify-routes.ts` -- smoke test hitting 5+ endpoints to verify api/v1 prefix
- [ ] Spectral config file `.spectral.yaml` in backend root -- covers API-05

## Open Questions

1. **Swagger base URL after global prefix**
   - What we know: `SwaggerModule.setup('api/docs', ...)` uses an absolute path, should work independently of `setGlobalPrefix`
   - What's unclear: Whether the generated OpenAPI spec's `servers` array will auto-update to include `/api/v1` base path
   - Recommendation: After adding `setGlobalPrefix`, check `http://localhost:3000/api/docs-json` and verify the spec's `servers[0].url` includes the full base path. If not, update `DocumentBuilder.addServer()` call

2. **Legacy /email-configs watchdog route**
   - What we know: There's a manual Express middleware in `main.ts` (lines 146-162) mounting at `/email-configs`
   - What's unclear: Whether `setGlobalPrefix` affects this raw Express middleware route
   - Recommendation: Raw Express middleware registered via `server.use()` is NOT affected by NestJS `setGlobalPrefix`. The watchdog at `/email-configs` will continue to work at that path. No action needed

3. **Frontend `getCsrfToken()` direct axios call**
   - What we know: `getCsrfToken()` in `api-client.ts` uses raw `axios.get(\`\${apiBaseURL}/auth/csrf-token\`)`, not `apiClient`
   - What's unclear: This bypasses the baseURL change and will hit `http://localhost:3000/auth/csrf-token` instead of `http://localhost:3000/api/v1/auth/csrf-token`
   - Recommendation: Change to use `apiClient.get('/auth/csrf-token')` which will auto-prefix via baseURL. OR update the URL template to include `/api/v1`. The former is cleaner

## Sources

### Primary (HIGH confidence)
- NestJS 11.1.13 installed in `backend/node_modules` -- interceptor, filter, global prefix APIs verified
- Codebase files: `main.ts`, `app.module.ts`, `all-exceptions.filter.ts`, `http-exception.filter.ts`, `correlation.interceptor.ts`, `request-id.middleware.ts`, `correlation-context.service.ts`, `api-client.ts` -- all read and analyzed
- Controller decorator scan: 32 `@Controller()` decorators across all modules -- 7 need prefix cleanup
- Frontend query hook scan: 18+ silent catch blocks in `use-dashboard.ts`, `use-follow-ups.ts`, `use-writing-style.ts`, `use-signatures.ts`

### Secondary (MEDIUM confidence)
- [NestJS Global Prefix docs](https://docs.nestjs.com/faq/global-prefix) -- exclude syntax with RouteInfo
- [DEV.to: Exclude routes from global prefix](https://dev.to/sarwarasik/how-to-exclude-a-route-from-global-prefix-versioning-in-nestjs-cb4) -- wildcard parameter syntax for NestJS 11
- [@stoplight/spectral-cli npm](https://www.npmjs.com/package/@stoplight/spectral-cli) -- v6.15.0, 710K weekly downloads
- [openapi-typescript docs](https://openapi-ts.dev/) -- CLI usage for type generation
- [openapi-typescript GitHub](https://github.com/openapi-ts/openapi-typescript) -- supports OpenAPI 3.0/3.1

### Tertiary (LOW confidence)
- path-to-regexp v8 named parameter requirement -- verified via NestJS GitHub issue #14894 but not tested locally

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries either already installed or well-documented npm packages
- Architecture: HIGH -- NestJS interceptor/filter patterns are core framework features with existing codebase examples
- Pitfalls: HIGH -- derived from direct codebase analysis (registration order, controller prefixes, frontend paths)
- Frontend fallback audit: HIGH -- all catch blocks identified via grep, line numbers verified
- Tooling (Spectral/openapi-typescript): MEDIUM -- packages verified via npm but not tested in this specific project

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable NestJS APIs, unlikely to change)
