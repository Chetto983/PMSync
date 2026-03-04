# Phase 33: API Contract Standardization - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Every API endpoint returns uniform response/error shapes with correlation IDs, versioning is enforced under `api/v1/` prefix, OpenAPI spec is linted in CI with generated frontend types, and frontend silent fallbacks are replaced with explicit degraded states. Covers requirements API-01 through API-05 and PERF-04.

</domain>

<decisions>
## Implementation Decisions

### API Prefix Migration
- Use `app.setGlobalPrefix('api/v1')` in `main.ts` with explicit excludes for webhooks (`webhooks/*`) and health (`health`)
- Hard cutover — no dual-route transition period. Old bare routes (`/users`, `/emails`) stop working immediately
- Remove manual `api/v1/` prefixes from AI controllers (`@Controller(['ai', 'api/v1/ai'])` → `@Controller('ai')`) and subscription controllers (`@Controller('api/v1/subscription')` → `@Controller('subscription')`)
- Swagger docs stay at `/api/docs` — excluded from the global prefix
- Frontend `apiClient` baseURL absorbs `/api/v1` — existing paths like `/contacts`, `/emails` work unchanged. AI paths that had explicit `/api/v1/ai/...` get stripped to `/ai/...`

### Error Code Taxonomy
- `DOMAIN_ACTION` format: e.g., `EMAIL_NOT_FOUND`, `AUTH_TOKEN_EXPIRED`, `CONTACT_DUPLICATE`, `CALENDAR_SYNC_FAILED`
- Error response shape: `{ error: { code, message, details }, meta: { requestId } }` — no `statusCode` in body (HTTP status in status line only)
- `details` field is typed per context:
  - Validation errors: `{ fields: [{ field, message }] }`
  - Rate limit: `{ retryAfter: number }`
  - Not found: `{ resource, id }`
  - Unknown codes: `null`
- Map common Prisma error codes to domain codes: P2002 → `DOMAIN_DUPLICATE` (409), P2025 → `DOMAIN_NOT_FOUND` (404). Remaining Prisma errors → `INTERNAL_ERROR` (500)
- Single unified `ApiExceptionFilter` replaces both `AllExceptionsFilter` and `HttpExceptionFilter`

### Response Envelope
- Global `ResponseEnvelopeInterceptor` registered in `main.ts` — wraps all responses in `{ data, meta: { requestId, timestamp } }`
- `@SkipEnvelope` custom decorator for SSE/streaming endpoints (AI chat)
- Pagination metadata goes in `meta`: `{ data: [...items], meta: { requestId, timestamp, pagination: { page, pageSize, total, totalPages } } }`
- Frontend apiClient auto-unwraps: Axios response interceptor strips `data` layer (`response.data = response.data.data`). Existing call sites untouched. `meta` accessible via separate accessor if needed

### Frontend Degraded States (PERF-04)
- Full audit of ALL frontend query hooks for silent fallbacks — not just dashboard
- Replace silent mock data with visible error states: muted error card with message + retry button. Other widgets load independently
- Error states include user-friendly message with collapsible technical details (`Show details` expands to reveal error code + requestId)
- Structured console logging on API errors: `{ code, requestId, endpoint }` — no external telemetry dependency yet
- Remove all catch-and-return-mock patterns; let TanStack Query handle error states natively

### Correlation ID Propagation
- Register `CorrelationInterceptor` globally in `main.ts` (currently exists but not globally registered)
- Every HTTP response gets `x-request-id` header
- BullMQ job payloads include originating `requestId` for cross-service tracing

### OpenAPI & Type Generation
- Spectral linting with standard rules — structural correctness (valid OpenAPI 3.x, no broken refs, proper response schemas). Not strict prose enforcement
- `openapi-typescript` generates `frontend/types/api.generated.ts` from the spec
- Spectral runs in CI pipeline as a blocking step

### Claude's Discretion
- Exact exclude list for `setGlobalPrefix` (all webhook paths, health, any other edge cases)
- Exact error code registry (which domains, which actions — derive from existing controllers)
- CorrelationInterceptor BullMQ propagation implementation details
- Spectral ruleset selection and CI step configuration
- apiClient response interceptor implementation details (meta accessor pattern)
- Order of operations for the hard cutover (backend first, then frontend, or simultaneous in one plan)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward API standardization work. Follow NestJS interceptor/filter patterns already established in the codebase (`common/interceptors/`, `common/filters/`).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `common/interceptors/correlation.interceptor.ts`: CorrelationInterceptor already reads `x-request-id` header and sets CorrelationContext — needs global registration
- `common/interceptors/response-time.interceptor.ts`: Existing response interceptor pattern to follow
- `common/filters/all-exceptions.filter.ts` + `http-exception.filter.ts`: Will be replaced by unified ApiExceptionFilter
- `common/interceptors/provider-error.interceptor.ts`: Domain-specific error interceptor pattern
- `frontend/lib/api-client.ts`: Axios client with existing interceptor setup — add response unwrap interceptor here

### Established Patterns
- Global filters registered in `main.ts` via `app.useGlobalFilters()` — same pattern for new ApiExceptionFilter
- NestJS Swagger decorators (`@nestjs/swagger`) already in use across controllers
- BullMQ queue services use injectable patterns — correlation ID propagation via job data
- TanStack Query hooks in `frontend/hooks/queries/` handle `isLoading`, `error`, `data` states

### Integration Points
- `backend/src/main.ts`: Registration point for global prefix, interceptors, and unified exception filter
- 26 `@Controller()` decorators across all modules: prefix cleanup targets
- `frontend/lib/api-client.ts`: baseURL change + response interceptor addition
- `frontend/hooks/queries/use-dashboard.ts:685-724`: Primary silent fallback to eliminate (mock email trends)
- `frontend/lib/api/*.ts`: 50+ apiClient call sites — paths stay unchanged due to baseURL approach
- `.github/workflows/`: Spectral CI step and openapi-typescript generation step

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 33-api-contract-standardization*
*Context gathered: 2026-03-03*
