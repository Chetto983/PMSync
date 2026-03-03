# Technology Stack: v4.0 Enterprise Stabilization

**Project:** MailAgent v4.0
**Researched:** 2026-03-03
**Confidence:** HIGH (all versions verified via `npm view`, peer dependencies checked, codebase audited)

## Executive Summary

v4.0 is a stabilization milestone -- not a feature expansion. The stack changes are surgical: **5 new dev dependencies, 1 new runtime dependency, 0 removals**. The runtime addition is `@nestjs/event-emitter` (3.0.1) to replace `forwardRef` circular dependency chains with event-driven decoupling. The dev additions are `dependency-cruiser` for CI-enforced dependency rules, `@stoplight/spectral-cli` for OpenAPI linting, `@pact-foundation/pact` for consumer-driven contract testing, and `openapi-typescript` for typed API contracts on the frontend. No framework swaps, no major version bumps, no architectural rewrites. The existing stack (NestJS 11, Prisma 7, Next.js 16, AI SDK v6) is stable and correct -- the work is wiring discipline, not technology change.

**PACKAGES TO ADD (backend, runtime):** 1
**PACKAGES TO ADD (backend, devDependencies):** 2
**PACKAGES TO ADD (frontend, devDependencies):** 2
**PACKAGES TO REMOVE:** 0
**NET CHANGE:** +5

---

## What NOT To Add (And Why)

Before listing additions, here is what was evaluated and rejected. This matters because enterprise stabilization attracts scope creep.

| Rejected | Why Not |
|----------|---------|
| `@casl/ability` (RBAC library) | v4.0 scope is "define permission taxonomy + policy service contract", not implement RBAC. Adding CASL now couples to a library before the model is designed. Write the interface first, pick the library in v4.1. |
| `@opentelemetry/*` (distributed tracing) | PRD Phase 3, not Phase 1. Current Pino + request ID middleware is sufficient for stabilization. Adding OTel before dependency graphs are clean makes traces noisy and misleading. |
| `openapi-generator-cli` (full client codegen) | Overkill. `openapi-typescript` generates types from the Swagger JSON; actual HTTP calls stay in the existing `apiClient` + TanStack Query pattern. Full codegen would force a rewrite of every frontend API module for zero benefit. |
| `nest-standard-response` (response envelope lib) | 45 GitHub stars, single maintainer. A custom interceptor is 40 lines of code, fully under our control, and doesn't add a dependency for something this trivial. Build, don't import. |
| `skott` (dependency analyzer) | Newer alternative to madge/dependency-cruiser. Not mature enough (v0.x), fewer CI integration patterns documented. dependency-cruiser has 5K+ GitHub stars, active maintenance (17.3.8 published March 2026), and proven CI rule enforcement. |
| `zod` for API validation | Already using `class-validator` + `class-transformer` globally. Mixing two validation paradigms creates confusion. Stick with class-validator for NestJS controllers. |

---

## New Packages: Runtime

### 1. @nestjs/event-emitter (^3.0.1) — Break Circular Dependencies

| Attribute | Value |
|-----------|-------|
| Package | `@nestjs/event-emitter` |
| Version | ^3.0.1 |
| Latest verified | 3.0.1 (npm view, 2026-03-03) |
| Peer deps | `@nestjs/common ^10.0.0 \|\| ^11.0.0`, `@nestjs/core ^10.0.0 \|\| ^11.0.0` |
| Compatibility | Confirmed compatible with NestJS 11.1.13 (current) |
| Purpose | Replace forwardRef circular imports with event-driven decoupling |
| Confidence | HIGH |

**Why this, specifically:**
- Official NestJS package -- same team, same release cadence, same support lifecycle.
- Built on `eventemitter2` (6.4.9) which supports wildcard events, async handlers, and TTL -- features we need for domain events.
- The codebase has **15 circular dependencies** detected by madge, involving 12 `forwardRef` calls across 10 modules. The core cycle is: `ai <-> email <-> calendar <-> email-sync <-> providers <-> contacts`. These are NOT legitimate bidirectional dependencies -- they are service calls that should be events (e.g., "email synced" -> "update embeddings", "contact updated" -> "re-embed contact").
- Event-driven decoupling is explicitly recommended in the Enterprise PRD Section 2.1 and Section 6.4.

**What it replaces:**
- `forwardRef(() => EmailModule)` in ai.module.ts
- `forwardRef(() => AiModule)` in email.module.ts, email-sync.module.ts, providers.module.ts, contacts.module.ts
- `forwardRef(() => ProvidersModule)` in email.module.ts, calendar.module.ts, contacts.module.ts, email-sync.module.ts
- `forwardRef(() => EmailSyncModule)` in email.module.ts, providers.module.ts, calendar.module.ts, contacts.module.ts
- `forwardRef(() => CalendarModule)` in email.module.ts
- `forwardRef(() => ContactsModule)` in providers.module.ts

**Integration pattern:**
```typescript
// In AppModule (or a shared EventsModule)
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,      // Enable 'email.*' patterns
      delimiter: '.',      // Namespace events: 'email.synced', 'contact.updated'
      maxListeners: 20,    // Safety cap per event
      verboseMemoryLeak: true, // Warn on listener leaks
    }),
  ],
})
export class AppModule {}

// In EmailSyncService (producer) -- no import of AiModule needed
@Injectable()
export class EmailSyncService {
  constructor(private eventEmitter: EventEmitter2) {}

  async syncEmails(accountId: string) {
    const emails = await this.performSync(accountId);
    // Fire and forget -- AiModule listens, EmailSync doesn't know/care
    this.eventEmitter.emit('email.synced', { accountId, emailIds: emails.map(e => e.id) });
  }
}

// In AiModule (consumer) -- no import of EmailModule needed
@Injectable()
export class EmailEmbeddingListener {
  @OnEvent('email.synced')
  async handleEmailSynced(payload: { accountId: string; emailIds: string[] }) {
    await this.embeddingsService.queueEmbeddings(payload.emailIds);
  }
}
```

**Installation:**
```bash
cd backend && npm install @nestjs/event-emitter@^3.0.1
```

---

## New Packages: Dev Dependencies (Backend)

### 2. dependency-cruiser (^17.3.8) — Dependency Graph Enforcement in CI

| Attribute | Value |
|-----------|-------|
| Package | `dependency-cruiser` |
| Version | ^17.3.8 |
| Latest verified | 17.3.8 (npm view, 2026-03-03) |
| Purpose | Enforce module boundary rules in CI, block circular deps at PR time |
| Confidence | HIGH |

**Why dependency-cruiser over madge:**
- Madge (8.0.0) detects circles but cannot ENFORCE rules. It reports; it doesn't block.
- dependency-cruiser defines **forbidden** and **allowed** dependency rules as code (`.dependency-cruiser.cjs`), outputs violations with severity levels, and returns non-zero exit codes for CI integration.
- 5.3K GitHub stars, actively maintained (17.3.8 shipped March 2026), TypeScript-native.
- Supports `--ts-config` for path alias resolution (our `@/*` paths).

**What madge still does:**
Keep `madge` for quick ad-hoc visualization (`npx madge --image graph.svg`). But it is NOT a CI gate -- dependency-cruiser is.

**Configuration (`.dependency-cruiser.cjs` at backend root):**
```javascript
module.exports = {
  forbidden: [
    // RULE 1: No circular dependencies
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    // RULE 2: Domain boundary enforcement
    // ai/ cannot import from email/ directly (must use events)
    {
      name: 'ai-no-direct-email',
      severity: 'error',
      from: { path: '^src/modules/ai/' },
      to: { path: '^src/modules/email/' },
    },
    // RULE 3: email-sync/ cannot import from ai/
    {
      name: 'email-sync-no-direct-ai',
      severity: 'error',
      from: { path: '^src/modules/email-sync/' },
      to: { path: '^src/modules/ai/' },
    },
    // RULE 4: No module imports common/services directly from another module
    {
      name: 'no-cross-module-service-import',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/common/'],
      },
    },
  ],
  options: {
    tsConfig: { fileName: './tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
```

**CI integration (package.json script):**
```json
{
  "scripts": {
    "deps:check": "depcruise --config .dependency-cruiser.cjs src/",
    "deps:graph": "depcruise --config .dependency-cruiser.cjs --output-type dot src/ | dot -T svg > docs/dependency-graph.svg"
  }
}
```

**Installation:**
```bash
cd backend && npm install -D dependency-cruiser@^17.3.8
```

### 3. @stoplight/spectral-cli (^6.15.0) — OpenAPI Linting in CI

| Attribute | Value |
|-----------|-------|
| Package | `@stoplight/spectral-cli` |
| Version | ^6.15.0 |
| Latest verified | 6.15.0 (npm view, 2026-03-03) |
| Purpose | Lint the auto-generated Swagger/OpenAPI spec for consistency, naming conventions, response schema compliance |
| Confidence | HIGH |

**Why:**
- The project already generates OpenAPI via `@nestjs/swagger` (11.2.6) at `/api/docs-json`. All 32 controllers use Swagger decorators. But there is NO validation that the spec is consistent -- response envelopes differ, some endpoints lack error schemas, naming conventions vary.
- Spectral enforces rules on the generated spec: required fields in responses, consistent error shapes, naming patterns, versioning presence.
- Integrates with CI as a simple CLI command. No server, no SaaS, no account needed.

**Configuration (`.spectral.yaml` at backend root):**
```yaml
extends: ["spectral:oas"]
rules:
  # Enforce consistent response envelope
  operation-success-response: error
  # All operations must have operationId
  operation-operationId: error
  # Require description on all operations
  operation-description: warn
  # No inline response schemas (use $ref)
  oas3-unused-component: warn
  # Custom: require error response schema
  custom-error-response:
    given: "$.paths[*][*].responses[?(@property >= '400')]"
    then:
      field: content.application/json.schema
      function: truthy
    severity: warn
    message: "Error responses must define a schema"
```

**CI integration:**
```json
{
  "scripts": {
    "api:lint": "spectral lint docs/openapi.json --ruleset .spectral.yaml",
    "api:export": "curl -s http://localhost:3000/api/docs-json > docs/openapi.json"
  }
}
```

**Installation:**
```bash
cd backend && npm install -D @stoplight/spectral-cli@^6.15.0
```

---

## New Packages: Dev Dependencies (Frontend)

### 4. @pact-foundation/pact (^16.2.0) — Consumer-Driven Contract Testing

| Attribute | Value |
|-----------|-------|
| Package | `@pact-foundation/pact` |
| Version | ^16.2.0 |
| Latest verified | 16.2.0 (npm view, 2026-03-03) |
| Purpose | Verify frontend API expectations against backend contracts |
| Confidence | MEDIUM-HIGH |

**Why Pact and not just Spectral:**
- Spectral validates the OpenAPI SPEC. Pact validates the actual BEHAVIOR matches what the frontend expects.
- The PRD (Section 4.1) explicitly flags "API Contract Stability: Medium-Low" and "frontend clients include compatibility shims and fallback logic for missing/non-uniform backend contracts." Pact catches when backend changes break frontend expectations BEFORE deployment.
- Consumer-driven: the frontend defines what it expects, backend verifies it can fulfill those expectations.

**Why on frontend, not backend:**
Pact is consumer-driven. The frontend is the consumer. Contract files are generated from frontend tests, then verified against the running backend. The `@pact-foundation/pact` package goes in the frontend; backend verification uses the generated pact files with a verification script.

**Pattern:**
```typescript
// frontend/tests/contracts/emails.pact.spec.ts
import { PactV4 } from '@pact-foundation/pact';

const provider = new PactV4({
  consumer: 'mailagent-frontend',
  provider: 'mailagent-backend',
  dir: './pacts',
});

describe('Email API Contract', () => {
  it('GET /api/v1/emails returns paginated list', async () => {
    await provider
      .addInteraction()
      .given('authenticated user with emails')
      .uponReceiving('a request for emails')
      .withRequest('GET', '/api/v1/emails', (builder) => {
        builder.headers({ Authorization: 'Bearer token' });
        builder.query({ page: '1', limit: '20' });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ 'Content-Type': 'application/json' });
        builder.jsonBody({
          data: eachLike({ id: string(), subject: string(), from: string() }),
          meta: { page: integer(1), limit: integer(20), total: integer() },
        });
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/api/v1/emails?page=1&limit=20`, {
          headers: { Authorization: 'Bearer token' },
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data).toBeDefined();
        expect(body.meta).toBeDefined();
      });
  });
});
```

**Installation:**
```bash
cd frontend && npm install -D @pact-foundation/pact@^16.2.0
```

### 5. openapi-typescript (^7.6.1) — Typed API Contracts from OpenAPI

| Attribute | Value |
|-----------|-------|
| Package | `openapi-typescript` |
| Version | ^7.6.1 |
| Latest verified | 7.6.1 (npm view, 2026-03-03) |
| Purpose | Generate TypeScript types from backend OpenAPI spec for type-safe frontend API calls |
| Confidence | HIGH |

**Why:**
- Currently, frontend API modules (`lib/api/emails.ts`, `lib/api/contacts.ts`, etc.) manually define TypeScript interfaces that must match backend DTOs. When backend changes a DTO, the frontend type breaks silently -- either at runtime or never (if there is a fallback).
- `openapi-typescript` generates types directly from the `/api/docs-json` output. One command, all types stay in sync.
- Does NOT replace existing apiClient/TanStack Query patterns. It adds a generated types file that existing code imports FROM. Incremental adoption, no rewrite needed.

**Pattern:**
```bash
# Generate types from running backend
npx openapi-typescript http://localhost:3000/api/docs-json -o frontend/types/api.generated.ts

# Or from exported JSON
npx openapi-typescript docs/openapi.json -o frontend/types/api.generated.ts
```

```typescript
// frontend/lib/api/emails.ts -- gradually adopt generated types
import type { paths } from '@/types/api.generated';

type EmailListResponse = paths['/api/v1/emails']['get']['responses']['200']['content']['application/json'];
// Now if backend changes the response shape, TypeScript catches it at build time
```

**Installation:**
```bash
cd frontend && npm install -D openapi-typescript@^7.6.1
```

---

## No New Packages Required: httpOnly Cookie Auth Migration

This is a codebase change, NOT a library addition. All required packages are already installed.

### Current State
- Backend: `cookie-parser` (1.4.7) already installed and wired in `main.ts` line 36.
- Backend: `@nestjs/jwt` (11.0.2) already handles token signing.
- Backend: CSRF middleware already present (`csrf-csrf` 4.0.3).
- Backend: CORS already configured with `credentials: true`.
- Frontend: `axios` with `withCredentials: true` already configured.

### What Changes (Code, Not Dependencies)

**Backend auth.service.ts** -- Set httpOnly cookie on login instead of returning token in body:
```typescript
// BEFORE (current): return token in JSON body
return { accessToken: token, user };

// AFTER: set token as httpOnly cookie, return only user
response.cookie('access_token', token, {
  httpOnly: true,        // Cannot be read by JS (XSS protection)
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
  sameSite: 'lax',       // CSRF protection (lax allows navigation)
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
});
return { user };  // Token no longer in response body
```

**Backend JWT strategy** -- Extract token from cookie instead of Authorization header:
```typescript
// BEFORE: ExtractJwt.fromAuthHeaderAsBearerToken()
// AFTER:
jwtFromRequest: (req) => {
  // Try cookie first (new flow), fall back to header (migration period)
  return req?.cookies?.['access_token'] || ExtractJwt.fromAuthHeaderAsBearerToken()(req);
},
```

**Frontend auth-store.ts** -- Remove localStorage persistence entirely:
```typescript
// BEFORE: persist token in localStorage + mirror to document.cookie
// AFTER: No token in JS at all. Cookie is set by backend, sent automatically.
// auth-store only tracks user object, not token.
```

**Frontend api-client.ts** -- Remove Authorization header interceptor:
```typescript
// BEFORE: config.headers.Authorization = `Bearer ${token}`;
// AFTER: withCredentials: true handles it. Cookie sent automatically.
// Remove the entire request interceptor that adds Authorization header.
```

**Migration strategy:** Dual-read on backend (cookie OR header) for 2 weeks, then remove header support.

---

## No New Packages Required: API Response Standardization

This is a custom interceptor + exception filter, NOT a library.

### Current State
- `AllExceptionsFilter` returns `{ statusCode, message, timestamp, path }`.
- `HttpExceptionFilter` returns `{ statusCode, message, timestamp }`.
- Controllers return inconsistent shapes: some `{ success: true, data }`, some `{ labels }`, some raw arrays, some `{ jobId, status }`.

### Target Contract

```typescript
// Success response envelope
interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    [key: string]: unknown;
  };
  requestId: string;
}

// Error response envelope
interface ApiErrorResponse {
  error: {
    code: string;        // Machine-readable: 'VALIDATION_ERROR', 'NOT_FOUND', etc.
    message: string;     // Human-readable
    details?: unknown;   // Validation errors array, etc.
  };
  requestId: string;
}
```

### Implementation (custom, ~80 lines total)

**Global response interceptor** (~40 lines):
```typescript
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] || request.id;

    return next.handle().pipe(
      map((responseData) => {
        // Skip for streaming responses (SSE, file downloads)
        if (responseData instanceof StreamableFile) return responseData;

        return {
          data: responseData,
          requestId,
        };
      }),
    );
  }
}
```

**Global exception filter** (~40 lines, replaces current two filters):
```typescript
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const { status, code, message, details } = this.normalizeException(exception);

    response.status(status).json({
      error: { code, message, details },
      requestId: request.headers['x-request-id'] || request.id,
    });
  }

  private normalizeException(exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse() as any;
      return {
        status,
        code: this.statusToCode(status),
        message: res.message || exception.message,
        details: res.errors || undefined,
      };
    }
    // Prisma, Redis, unknown errors -> 500
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      details: undefined,
    };
  }
}
```

---

## No New Packages Required: AI Run Ledger

This is a Prisma schema addition, not a library.

### Schema Design

```prisma
model AiRun {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  sessionId   String?  // Links to AiChatSession if from chat
  intent      String   // Classified intent
  model       String   // e.g., "mistral-large-latest"
  status      AiRunStatus @default(RUNNING)

  // Token accounting
  promptTokens     Int @default(0)
  completionTokens Int @default(0)
  totalTokens      Int @default(0)
  estimatedCostUsd Decimal? @db.Decimal(10, 6)

  // Timing
  startedAt   DateTime @default(now())
  completedAt DateTime?
  durationMs  Int?

  // Lineage
  toolCalls   AiToolCall[]

  // Indexes
  @@index([tenantId, startedAt])
  @@index([userId, startedAt])
  @@index([sessionId])
}

model AiToolCall {
  id       String @id @default(cuid())
  runId    String
  run      AiRun  @relation(fields: [runId], references: [id])

  toolName  String
  input     Json
  output    Json?
  status    AiToolCallStatus @default(PENDING)
  durationMs Int?
  error     String?

  // HITL tracking
  requiresApproval Boolean @default(false)
  approvedBy       String?
  approvedAt       DateTime?

  createdAt DateTime @default(now())

  @@index([runId])
  @@index([toolName, createdAt])
}

enum AiRunStatus {
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

enum AiToolCallStatus {
  PENDING
  APPROVED
  EXECUTED
  FAILED
  REJECTED
}
```

---

## Full Installation Summary

### Backend

```bash
cd backend

# Runtime dependency
npm install @nestjs/event-emitter@^3.0.1

# Dev dependencies
npm install -D dependency-cruiser@^17.3.8 @stoplight/spectral-cli@^6.15.0
```

### Frontend

```bash
cd frontend

# Dev dependencies
npm install -D @pact-foundation/pact@^16.2.0 openapi-typescript@^7.6.1
```

### New npm Scripts (backend/package.json)

```json
{
  "scripts": {
    "deps:check": "depcruise --config .dependency-cruiser.cjs src/",
    "deps:graph": "depcruise --config .dependency-cruiser.cjs --output-type dot src/ | dot -T svg > docs/dependency-graph.svg",
    "api:export": "ts-node scripts/export-openapi.ts",
    "api:lint": "spectral lint docs/openapi.json --ruleset .spectral.yaml"
  }
}
```

### New npm Scripts (frontend/package.json)

```json
{
  "scripts": {
    "api:types": "openapi-typescript ../docs/openapi.json -o types/api.generated.ts",
    "test:contracts": "jest --config jest.pact.config.ts"
  }
}
```

---

## Version Compatibility Matrix

| Package | Version | NestJS 11 | Node 20+ | TypeScript 5.x | Notes |
|---------|---------|-----------|----------|-----------------|-------|
| @nestjs/event-emitter | 3.0.1 | Confirmed (peer: ^11.0.0) | Yes | Yes | Official NestJS package |
| dependency-cruiser | 17.3.8 | N/A (static analysis) | Yes | Yes (reads tsconfig) | No runtime, dev-only |
| @stoplight/spectral-cli | 6.15.0 | N/A (lints JSON/YAML) | Yes | N/A | No runtime, dev-only |
| @pact-foundation/pact | 16.2.0 | N/A (test framework) | Yes | Yes | Test-only, no runtime |
| openapi-typescript | 7.6.1 | N/A (codegen) | Yes | Yes | Generates .ts files |

---

## Alternatives Considered (Full Comparison)

### Circular Dependency Breaking

| Tool | Recommended | Alternative | Why Not Alternative |
|------|-------------|-------------|---------------------|
| @nestjs/event-emitter | Yes | Custom EventEmitter2 wrapper | Official NestJS integration handles module lifecycle, @OnEvent decorators, wildcard routing. Rolling our own saves nothing. |
| @nestjs/event-emitter | Yes | @nestjs/cqrs | CQRS is the right pattern for command/query separation, but overkill for v4.0 scope. We need events, not full CQRS. Can add CQRS later on top of event-emitter. |
| @nestjs/event-emitter | Yes | BullMQ events | Already use BullMQ for job queues. But BullMQ events are for job lifecycle, not domain events. Different concern, different tool. |

### Dependency Graph Enforcement

| Tool | Recommended | Alternative | Why Not Alternative |
|------|-------------|-------------|---------------------|
| dependency-cruiser | Yes | madge | Madge detects but cannot enforce. No rule engine, no CI exit codes based on custom rules. |
| dependency-cruiser | Yes | eslint-plugin-import (no-cycle) | Catches file-level cycles but cannot enforce module-boundary rules ("ai/ must not import email/"). |
| dependency-cruiser | Yes | skott | v0.x, small community, fewer CI integration examples. Promising but not production-ready for enforcement. |
| dependency-cruiser | Yes | nx (module boundaries) | Requires migrating to Nx workspace structure. Massive scope creep for one feature. |

### API Contract Testing

| Tool | Recommended | Alternative | Why Not Alternative |
|------|-------------|-------------|---------------------|
| Spectral + Pact | Yes | Dredd | Dredd tests the spec against the server, but is provider-driven, not consumer-driven. Misses the point: we need to know when backend breaks FRONTEND expectations. |
| Spectral + Pact | Yes | Schemathesis | Property-based API fuzzing. Useful for security testing, not contract alignment. Different problem. |
| Spectral + Pact | Yes | msw (Mock Service Worker) | Already used for mocking in tests. But MSW mocks don't validate that mocks match reality. Pact does. |

### API Type Generation

| Tool | Recommended | Alternative | Why Not Alternative |
|------|-------------|-------------|---------------------|
| openapi-typescript | Yes | openapi-generator-cli | Generates full HTTP clients, not just types. Would force replacing our apiClient + TanStack Query pattern. |
| openapi-typescript | Yes | Manual type sync | Current approach. Breaks silently. The whole point is to stop doing this. |
| openapi-typescript | Yes | tRPC | Requires rewriting both backend and frontend. NestJS + tRPC is possible but awkward. Not a stabilization task. |

---

## CI Pipeline Integration

### Pre-commit (husky + lint-staged)
```bash
# No changes -- existing hooks remain
```

### CI Pipeline (new checks to add)

```yaml
# .github/workflows/ci.yml additions
- name: Check dependency rules
  run: cd backend && npm run deps:check

- name: Export OpenAPI spec
  run: cd backend && npm run api:export

- name: Lint OpenAPI spec
  run: cd backend && npm run api:lint

- name: Generate API types
  run: cd frontend && npm run api:types

- name: Run contract tests
  run: cd frontend && npm run test:contracts

- name: Verify provider contracts
  run: cd backend && npm run test:contracts:verify
```

### CI Pipeline Order
1. `deps:check` -- Fail fast if someone adds a forbidden import
2. `api:export` -- Generate fresh OpenAPI JSON from built app
3. `api:lint` -- Validate spec quality
4. `api:types` -- Regenerate frontend types
5. `type-check` -- Catch type mismatches from regenerated types
6. `test:contracts` -- Consumer contract tests

---

## Sources

### Verified via npm (2026-03-03)
- @nestjs/event-emitter: 3.0.1, peer deps `@nestjs/common ^10.0.0 || ^11.0.0`
- dependency-cruiser: 17.3.8
- @stoplight/spectral-cli: 6.15.0
- @pact-foundation/pact: 16.2.0
- openapi-typescript: 7.6.1
- madge: 8.0.0 (no updates in 2+ years)
- eventemitter2: 6.4.9

### Official Documentation
- [NestJS Events](https://docs.nestjs.com/techniques/events)
- [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)
- [dependency-cruiser Rules Reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Spectral OpenAPI Linting](https://docs.stoplight.io/docs/spectral/ZG9jOjYyMDc0Mw-installation)
- [Pact JS v4 Guide](https://docs.pact.io/implementation_guides/javascript)
- [openapi-typescript Docs](https://openapi-ts.dev/)

### Community/Article Sources (MEDIUM confidence)
- [Breaking Circular Dependencies with Events (DEV Community)](https://dev.to/kishieel/get-rid-of-tightly-coupled-modules-and-circular-dependencies-in-nestjs-3do1)
- [NestJS Event-Driven Architecture](https://dev.to/ezilemdodana/event-driven-architecture-with-nestjs-using-the-eventemitter-module-35fe)
- [Standardizing API Responses in NestJS (Stackademic)](https://blog.stackademic.com/standardizing-api-responses-in-nestjs-with-interceptors-and-exception-filters-cf65efd27d04)
- [Pact Contract Testing 2026 Guide](https://dev.to/1xapi/how-to-implement-api-contract-testing-with-pact-in-nodejs-2026-guide-3e1e)
- [NestJS httpOnly Cookie Auth (Tigran.tech)](https://tigran.tech/nestjs-cookie-based-jwt-authentication/)

---

*Last updated: 2026-03-03 -- v4.0 Enterprise Stabilization research*
