# Phase 59: Safety - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Address critical and high-severity security findings from the full architecture audit. Fix secrets exposure, SQL injection vectors, rate limiting gaps, authentication weaknesses, validation holes, and missing database indexes. This is a hardening phase — no new features, only security and resilience improvements.

</domain>

<decisions>
## Implementation Decisions

### Secrets Management
- Rotate ALL secrets (nuclear option) — every API key, DB password, OAuth secret, encryption key
- Use Railway's built-in env var management as the secrets manager (already the deploy target)
- Run BFG Repo-Cleaner to remove .env from entire git history, then force-push
- Add `backend/.env` explicitly to `.gitignore` (currently only root `.env` is listed)
- Update existing `backend/.env.example` with all required vars and placeholder values
- Create a secrets rotation checklist documenting every secret and where to regenerate it

### Rate Limiting Overhaul
- Tiered by subscription: FREE tier gets stricter limits, PRO gets generous limits
- Remove ALL `@SkipThrottle()` from non-webhook endpoints (31+ endpoints currently skip)
- Webhook endpoints: add separate higher limits (e.g., 500/min) instead of @SkipThrottle
- Research best practices for webhook IP validation (Google Pub/Sub, Microsoft Graph) — researcher should investigate
- Claude's Discretion: specific per-endpoint rate limits based on operation weight (read vs write vs AI)

### Injection & Validation Fixes
- Fix Prisma.raw() in MemoryService and HybridSearchService — extract `validateEmbeddingVector()` from EmbeddingsService and reuse
- Full audit of ALL `$queryRaw` / `$queryRawUnsafe` usage across the codebase — verify every usage is parameterized or validated
- Broad DTO audit: review ALL DTOs across controllers for missing @MaxLength, string length bounds, sanitization
- Add @MaxLength(100) to RegisterDto firstName/lastName as priority fix
- Restrict AI health endpoint (/api/v1/ai/health): detailed circuit breaker info requires @Roles('admin'), public probe gets only `{ status: "ok" }`

### Auth Hardening
- Enable email verification: set `requireEmailVerification: true` in better-auth config
- Remove JWT completely: delete JWT env vars, JWT strategy, JWT token service — better-auth sessions are the only auth mechanism
- Block Swagger in production: add `nodeEnv !== 'production'` check — never accessible in prod regardless of ENABLE_SWAGGER env var
- CORS_ALLOW_ALL: keep for local dev only — allow only when NODE_ENV=development AND running on localhost, block in staging/production

### Database Index Fixes
- Add missing indexes to Account model: `@@index([userId])`, `@@index([userId, providerId])`
- Add missing indexes to Verification model: `@@index([identifier])`, `@@index([expiresAt])`
- Add missing indexes to PasswordResetToken model: `@@index([userEmail])`, `@@index([expiresAt])`, `@@index([tenantId])`
- Run Prisma migration for all index additions

### Claude's Discretion
- Exact rate limit numbers per endpoint tier
- Order of operations for secrets rotation (which to rotate first)
- Whether to add ESLint rule for Prisma.raw() usage
- Refresh token __Host- prefix fix approach (may require cookie path changes)
- CSRF session binding improvements (IP-only → session-bound)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validateEmbeddingVector()` in `backend/src/modules/ai/services/embeddings.service.ts` — already validates vectors before Prisma.raw(), needs exporting
- `@SkipThrottle()` decorator from `@nestjs/throttler` — need to replace with `@Throttle({ default: { limit, ttl } })` per endpoint
- `QuotaGuard` in `backend/src/modules/subscription/` — already enforces tier-based limits, can inform rate limiting tiers
- Production startup checks in `main.ts` — already validate weak JWT_SECRET, AES_SECRET_KEY, DB_PASSWORD
- `BetterAuthGuard` — global APP_GUARD, already the primary auth mechanism

### Established Patterns
- Global guard chain: BetterAuth → Legal → Consent → Tenant → Quota → Roles
- @Public() decorator for opt-out from auth
- Prisma tenant-scoping extension with `withoutTenantScopingAsync` for system operations
- DTO validation via class-validator with global ValidationPipe (whitelist + forbid unknown)
- Configuration validation in `backend/src/config/configuration.ts` with production safety checks

### Integration Points
- `backend/.env` → Railway env vars (migration target)
- `backend/prisma/schema.prisma` → index additions require migration
- `backend/src/common/auth/better-auth.instance.ts` → email verification config
- All controllers with `@SkipThrottle()` — need per-endpoint review
- `backend/src/modules/auth/` → JWT removal affects token service, strategies, cookie helper

</code_context>

<specifics>
## Specific Ideas

- BFG Repo-Cleaner for git history cleanup (not git filter-branch — BFG is faster and safer)
- Railway secrets management is zero-setup since it's already the deploy target
- The audit identified 16 specific security findings with severity levels — use those as the task checklist
- JWT removal aligns with CLN-04 in Phase 58 requirements but doing it here is cleaner since we're already in auth hardening

</specifics>

<deferred>
## Deferred Ideas

- PostgreSQL Row-Level Security (RLS) — explicitly out of scope per PROJECT.md
- Full ABAC policy engine — needs CRM object model first (PROJECT.md)
- OpenTelemetry distributed tracing — observability phase, not security
- Granular RBAC with team/department permissions — separate enterprise feature
- Redis instance separation (cache vs queues) — infrastructure optimization, not security
- voltagent_memory tables tenant isolation — GDPR compliance, separate phase
- Citus sharding activation — scaling phase

</deferred>

---

*Phase: 59-safety*
*Context gathered: 2026-03-09*
