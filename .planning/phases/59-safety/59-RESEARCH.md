# Phase 59: Safety - Research

**Researched:** 2026-03-09
**Domain:** Security hardening (NestJS/Prisma/better-auth stack)
**Confidence:** HIGH

## Summary

This phase addresses security findings from an architecture audit. The scope is entirely hardening -- no new features. Six workstreams: secrets management (rotate + purge git history), rate limiting overhaul (remove ~31 `@SkipThrottle()` decorators, add tiered limits), SQL injection fixes (3 services using `Prisma.raw()` without vector validation), auth hardening (JWT removal, email verification, Swagger lockdown, CORS tightening), DTO validation gaps (RegisterDto missing `@MaxLength` on name fields), and database index additions (Account, Verification, PasswordResetToken models).

The codebase already has good foundations: `validateEmbeddingVector()` exists in EmbeddingsService (just needs exporting), ThrottlerModule has dual-tier config, CORS already blocks `corsAllowAll` in production, and BetterAuthGuard is the primary auth mechanism. The JWT code is dead weight from the pre-better-auth era.

**Primary recommendation:** Execute in dependency order -- secrets rotation first (blocks nothing, unblocks confidence), then indexes (safe, zero-risk migration), then injection fixes, DTO hardening, rate limiting overhaul, and auth hardening last (most invasive).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rotate ALL secrets (nuclear option) -- every API key, DB password, OAuth secret, encryption key
- Use Railway's built-in env var management as the secrets manager
- Run BFG Repo-Cleaner to remove .env from entire git history, then force-push
- Add `backend/.env` explicitly to `.gitignore`
- Update existing `backend/.env.example` with all required vars and placeholder values
- Create a secrets rotation checklist documenting every secret and where to regenerate it
- Tiered rate limiting by subscription: FREE stricter, PRO generous
- Remove ALL `@SkipThrottle()` from non-webhook endpoints
- Webhook endpoints: separate higher limits (e.g., 500/min) instead of @SkipThrottle
- Fix Prisma.raw() in MemoryService and HybridSearchService -- extract and reuse `validateEmbeddingVector()`
- Full audit of ALL `$queryRaw` / `$queryRawUnsafe` usage -- verify every usage is parameterized or validated
- Broad DTO audit: review ALL DTOs for missing @MaxLength, string length bounds, sanitization
- Add @MaxLength(100) to RegisterDto firstName/lastName as priority fix
- Restrict AI health endpoint: detailed info requires @Roles('admin'), public probe gets only `{ status: "ok" }`
- Enable email verification: `requireEmailVerification: true` in better-auth config
- Remove JWT completely: delete JWT env vars, JWT strategy, JWT token service
- Block Swagger in production: `nodeEnv !== 'production'` check (no ENABLE_SWAGGER override)
- CORS_ALLOW_ALL: keep for local dev only (already implemented, verify)

### Claude's Discretion
- Exact rate limit numbers per endpoint tier
- Order of operations for secrets rotation (which to rotate first)
- Whether to add ESLint rule for Prisma.raw() usage
- Refresh token __Host- prefix fix approach
- CSRF session binding improvements (IP-only to session-bound)

### Deferred Ideas (OUT OF SCOPE)
- PostgreSQL Row-Level Security (RLS)
- Full ABAC policy engine
- OpenTelemetry distributed tracing
- Granular RBAC with team/department permissions
- Redis instance separation (cache vs queues)
- voltagent_memory tables tenant isolation
- Citus sharding activation
</user_constraints>

## Standard Stack

### Core (already in project)
| Library | Purpose | Relevance |
|---------|---------|-----------|
| `@nestjs/throttler` | Rate limiting | Remove @SkipThrottle, add @Throttle per-endpoint |
| `class-validator` | DTO validation | Add @MaxLength, @IsNotEmpty to name fields |
| `@prisma/client` | ORM + raw queries | Validate vectors before Prisma.raw() |
| `better-auth` | Auth framework | Enable email verification, remove JWT |
| `helmet` | HTTP security headers | Already configured in main.ts |

### Supporting (external tools)
| Tool | Purpose | When to Use |
|------|---------|-------------|
| BFG Repo-Cleaner | Git history cleanup | Remove .env files from history |
| Railway CLI | Secrets management | Set env vars in deployment |

### No New Dependencies Needed
This phase requires zero new npm packages. All fixes use existing libraries with better configuration.

## Architecture Patterns

### Pattern 1: Extract and Reuse Vector Validation

**What:** Move `validateEmbeddingVector()` from module-scoped function to exported utility.

**Current state:** The function is a plain function (not part of the class) at line 29 of `embeddings.service.ts`. It validates array is non-empty, under 4096 elements, all finite numbers.

**Target locations needing validation:**
- `memory.service.ts` line 67 -- `Prisma.raw(\`'${vectorStr}'::vector\`)` with NO validation
- `hybrid-search.service.ts` lines 143, 183 -- `Prisma.raw(\`'[${embeddingVector.join(',')}]'::vector\`)` with NO validation
- `embeddings.service.ts` lines 87, 144 -- already validated (good)

**Fix pattern:**
```typescript
// backend/src/common/utils/vector-validation.ts
export function validateEmbeddingVector(embedding: unknown): number[] {
  // Move existing implementation here
}

// In each service:
import { validateEmbeddingVector } from '@/common/utils/vector-validation';
const validated = validateEmbeddingVector(embeddingVector);
const vectorLiteral = Prisma.raw(`'[${validated.join(',')}]'::vector`);
```

### Pattern 2: Replace @SkipThrottle with @Throttle

**Current state:** 31+ endpoints have `@SkipThrottle()` across 5 controllers:
- `calendar.controller.ts` -- 8 endpoints
- `contacts.controller.ts` -- 9 endpoints
- `providers.controller.ts` -- 12 endpoints
- `auth.controller.ts` -- 1 endpoint (token fetch)
- `health.controller.ts` -- class-level

**Fix pattern:**
```typescript
// BEFORE
@SkipThrottle()
@Get(':id')
async getEvent() { ... }

// AFTER -- tiered rate limits
@Throttle({ short: { limit: 60, ttl: 60000 } })  // Read: 60/min
@Get(':id')
async getEvent() { ... }
```

**Recommended tiers:**

| Operation Type | FREE Tier | PRO Tier | Example Endpoints |
|---------------|-----------|----------|-------------------|
| Read (GET) | 60/min | 200/min | GET /calendars, GET /contacts |
| Write (POST/PUT/DELETE) | 20/min | 60/min | POST /contacts, DELETE /events |
| AI Operations | 10/min | 30/min | POST /ai/chat, GET /ai/briefing |
| Webhooks | 500/min | 500/min | POST /webhooks/* |
| Health checks | 30/min | 30/min | GET /health, GET /ai/health |

**Note:** The global default is already 100/min (short) and 30/min (write). Many of these @SkipThrottle endpoints are reads that would be fine under the global default. Simply removing @SkipThrottle is sufficient for most.

### Pattern 3: JWT Removal Scope

**Files to delete or modify:**

| File | Action |
|------|--------|
| `backend/src/modules/auth/guards/jwt-auth.guard.ts` | DELETE |
| `backend/src/modules/auth/strategies/jwt.strategy.ts` | DELETE |
| `backend/src/modules/auth/services/auth-token.service.ts` | DELETE (if JWT-only) or remove JWT methods |
| `backend/src/config/env.validation.ts` | Remove JWT_SECRET, JWT_EXPIRATION vars |
| `backend/src/config/configuration.ts` | Remove JWT config section |
| `backend/src/modules/auth/auth.module.ts` | Remove JWT providers |

**Safety check:** Grep for all JWT imports/usages across the entire codebase before deleting. The `auth-token.service.ts` may have non-JWT methods that need preserving.

### Pattern 4: Database Index Migration

**Current state -- models missing indexes:**

```prisma
// Account -- NO indexes (userId and providerId are FK/lookup fields)
model Account {
  userId    String
  providerId String
  // No @@index directives
}

// Verification -- NO indexes
model Verification {
  identifier String
  expiresAt  DateTime
  // No @@index directives
}

// PasswordResetToken -- NO indexes
model PasswordResetToken {
  userEmail String
  tenantId  String
  expiresAt DateTime
  // No @@index directives
}
```

**Migration:**
```bash
npx prisma migrate dev --name add-security-indexes
```

### Anti-Patterns to Avoid
- **Do NOT use `$queryRawUnsafe`** -- always use `$queryRaw` with `Prisma.sql` tagged template
- **Do NOT add @SkipThrottle to new endpoints** -- always specify explicit @Throttle limits
- **Do NOT leave Swagger accessible in production** -- remove the ENABLE_SWAGGER override entirely
- **Do NOT validate vectors at the query level** -- validate once at the utility level, trust downstream

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom middleware | `@nestjs/throttler` with `@Throttle()` per-endpoint | Already globally configured, just needs per-endpoint tuning |
| Git history cleanup | `git filter-branch` | BFG Repo-Cleaner | 10-100x faster, safer, well-documented |
| Secrets management | Custom vault | Railway env vars | Zero-setup, already the deploy target |
| Vector validation | Per-service validation | Shared `validateEmbeddingVector()` utility | DRY, single place to update dimension limits |
| Email verification | Custom flow | `requireEmailVerification: true` in better-auth | One config toggle, handles tokens/expiry/emails |

## Common Pitfalls

### Pitfall 1: Prisma.raw() Bypasses Parameterization
**What goes wrong:** `Prisma.raw()` injects raw SQL -- if the vector string contains malicious content (e.g., from a compromised embedding API response), it becomes SQL injection.
**Why it happens:** pgvector requires `::vector` cast syntax that Prisma's parameterized queries don't natively support.
**How to avoid:** Always validate the vector array (all finite numbers) before building the raw string. The existing `validateEmbeddingVector()` does this correctly.
**Warning signs:** Any `Prisma.raw()` call that interpolates variables without prior validation.

### Pitfall 2: BFG Repo-Cleaner Requires Coordination
**What goes wrong:** Force-pushing rewritten history breaks all open branches and requires all collaborators to re-clone.
**Why it happens:** BFG rewrites commit SHAs for every commit that touched the cleaned file.
**How to avoid:** 1) Merge all open PRs first, 2) Notify all collaborators, 3) Do it on a quiet day, 4) Everyone re-clones after.
**Warning signs:** Open PRs or branches that will conflict after force-push.

### Pitfall 3: Swagger Production Lockdown Edge Cases
**What goes wrong:** Current code allows Swagger in production if `ENABLE_SWAGGER=true` is set. The fix must remove this override entirely.
**Current code (main.ts:593-598):**
```typescript
const enableSwagger =
  config.nodeEnv !== 'production' ||
  ['true', '1', 'yes'].includes(
    (process.env.ENABLE_SWAGGER || '').toLowerCase(),
  );
```
**Fix:** Change to `const enableSwagger = config.nodeEnv !== 'production';` -- no env var override.

### Pitfall 4: Email Verification Breaking Existing Users
**What goes wrong:** Enabling `requireEmailVerification: true` blocks login for existing users who never verified.
**How to avoid:** Before enabling, run a migration to set `emailVerified: true` for all existing users (they were created before verification existed).
**Warning signs:** Users suddenly locked out after deployment.

### Pitfall 5: JWT Removal May Break Forgotten References
**What goes wrong:** Deleting JWT files but missing an import in an obscure service causes build failure.
**How to avoid:** After deleting JWT files, run `npm run build` and fix any broken imports. Grep for `jwt`, `JWT`, `JwtStrategy`, `AuthTokenService` across the entire codebase.

## Code Examples

### Vector Validation Utility (extract from embeddings.service.ts)
```typescript
// Source: backend/src/modules/ai/services/embeddings.service.ts:29-52
// Move to: backend/src/common/utils/vector-validation.ts
export function validateEmbeddingVector(embedding: unknown): number[] {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }
  if (embedding.length === 0) {
    throw new Error('Embedding array cannot be empty');
  }
  if (embedding.length > 4096) {
    throw new Error('Embedding array exceeds maximum dimension (4096)');
  }
  const validated: number[] = [];
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid embedding value at index ${i}: expected finite number`);
    }
    validated.push(value);
  }
  return validated;
}
```

### RegisterDto Fix
```typescript
// Source: backend/src/modules/auth/dtos/register.dto.ts
// Current: firstName and lastName have no @MaxLength
// Fix:
@IsOptional()
@IsString()
@MaxLength(100, { message: 'First name must be at most 100 characters' })
firstName?: string;

@IsOptional()
@IsString()
@MaxLength(100, { message: 'Last name must be at most 100 characters' })
lastName?: string;
```

### AI Health Endpoint Restriction
```typescript
// Source: backend/src/modules/ai/controllers/ai-health.controller.ts
// Current: @Public() class-level, exposes circuit breaker details

// Fix: Split into public probe and admin-only detailed health
@Public()
@Get('health')
async healthProbe() {
  return { status: 'ok' };
}

@Get('health/detailed')
@Roles('admin')
async healthDetailed() {
  // existing detailed implementation
}
```

### Prisma Index Addition
```prisma
// Source: backend/prisma/schema.prisma
model Account {
  // ... existing fields ...
  @@index([userId])
  @@index([userId, providerId])
  @@map("accounts")
}

model Verification {
  // ... existing fields ...
  @@index([identifier])
  @@index([expiresAt])
  @@map("verifications")
}

model PasswordResetToken {
  // ... existing fields ...
  @@index([userEmail])
  @@index([expiresAt])
  @@index([tenantId])
  @@map("password_reset_tokens")
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `@SkipThrottle()` everywhere | Per-endpoint `@Throttle()` with tiers | Prevents abuse on 31+ unprotected endpoints |
| JWT + better-auth dual auth | better-auth sessions only | Eliminates dead code, reduces attack surface |
| `ENABLE_SWAGGER=true` production override | Hard block in production | No accidental API exposure |
| Unvalidated `Prisma.raw()` vectors | `validateEmbeddingVector()` everywhere | Blocks SQL injection via embedding responses |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (primary) + Vitest (configured) |
| Config file | `backend/jest.config.js`, `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern="<pattern>" --no-coverage` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map

Since this is a hardening phase with no formal requirement IDs, tests map to security workstreams:

| Workstream | Behavior | Test Type | Automated Command | File Exists? |
|-----------|----------|-----------|-------------------|-------------|
| Vector validation | validateEmbeddingVector rejects non-finite values | unit | `npx jest --testPathPattern="vector-validation" --no-coverage` | No -- Wave 0 |
| DTO validation | RegisterDto rejects firstName > 100 chars | unit | `npx jest --testPathPattern="register.dto" --no-coverage` | No -- Wave 0 |
| Rate limiting | @SkipThrottle removed, endpoints throttled | integration | Manual verification via grep | N/A |
| Swagger lockdown | Swagger returns 404 when NODE_ENV=production | smoke | Manual verification | N/A |
| JWT removal | Build succeeds without JWT files | build | `npm run build` | Existing |
| Index migration | Migration applies cleanly | migration | `npx prisma migrate dev --name test` | N/A |
| Email verification | better-auth config has requireEmailVerification: true | config | Grep verification | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && npm run build` (type-check is the primary gate for this phase)
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green + manual security checklist review

### Wave 0 Gaps
- [ ] `backend/src/common/utils/__tests__/vector-validation.test.ts` -- unit tests for extracted validator
- [ ] `backend/src/modules/auth/dtos/__tests__/register.dto.spec.ts` -- DTO validation tests (optional, class-validator is well-tested)

## Open Questions

1. **auth-token.service.ts scope**
   - What we know: File exists, contains JWT-related code
   - What's unclear: Whether it has non-JWT methods (e.g., session token helpers) that need preserving
   - Recommendation: Read the file fully before deleting; extract any non-JWT code

2. **Webhook IP validation for Google Pub/Sub and Microsoft Graph**
   - What we know: CONTEXT.md says "researcher should investigate"
   - What's unclear: Exact IP ranges and validation approach for each provider
   - Recommendation: Google publishes Pub/Sub IP ranges via DNS (TXT record `_cloud-netblocks.googleusercontent.com`); Microsoft Graph uses push notifications with validation tokens. Both need per-provider middleware.

3. **ESLint rule for Prisma.raw()**
   - What we know: Claude's discretion item
   - Recommendation: YES -- add a `no-restricted-syntax` ESLint rule that warns on `Prisma.raw()` usage, forcing developers to acknowledge the risk. Low effort, high prevention value.

4. **Existing users and email verification**
   - What we know: Enabling requireEmailVerification blocks unverified users
   - Recommendation: Run `UPDATE users SET "emailVerified" = true WHERE "emailVerified" = false` migration before enabling the flag

## Sources

### Primary (HIGH confidence)
- Codebase analysis: direct file reads of controllers, services, DTOs, schema, main.ts
- `backend/src/modules/ai/services/embeddings.service.ts` -- validateEmbeddingVector source
- `backend/prisma/schema.prisma` -- index audit
- `backend/src/main.ts` -- Swagger and CORS configuration

### Secondary (MEDIUM confidence)
- NestJS Throttler documentation -- `@Throttle()` decorator API
- Prisma documentation -- `$queryRaw` vs `$queryRawUnsafe` security model
- BFG Repo-Cleaner -- standard git history cleaning tool

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new deps
- Architecture: HIGH -- patterns derived from actual codebase analysis
- Pitfalls: HIGH -- each pitfall verified against actual code state

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- security hardening patterns don't change fast)
