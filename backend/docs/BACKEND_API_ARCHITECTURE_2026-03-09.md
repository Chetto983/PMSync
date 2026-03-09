# Backend API Architecture

Date: 2026-03-09
Scope: Current HTTP API structure, contracts, and operational conventions
Status: Current reference

## Summary

The backend is a versioned REST API implemented as a NestJS modular monolith.

Current strengths:

- versioned route prefix
- global validation
- unified exception filter
- response envelope standardization
- Swagger generation in non-production
- rate limiting and request correlation built into the stack

Current weaknesses:

- pagination and filtering patterns are still partly controller-specific
- OpenAPI generation in CI appears fragile
- some older documentation still describes legacy auth or older API behavior as current

## API Style

Current API style:

- REST, not GraphQL
- controller-based NestJS modules
- JSON request and response bodies
- websocket side channel for realtime events

Primary route structure:

- protected APIs live under `/api/v1/*`
- selected routes are excluded from the prefix:
  - `/health/*`
  - `/metrics`
  - `/webhooks/*`
  - provider OAuth callback routes
  - `/api/auth/*` for `better-auth`

## Global HTTP Contract Controls

### Validation

The app applies a global `ValidationPipe` with:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

This gives the API a good default input-validation baseline.

### Error Handling

The app uses a unified `ApiExceptionFilter`.

Practical effect:

- common exception shapes are normalized
- validation errors are translated into structured API errors
- rate-limit errors and generic failures are handled centrally

### Response Envelope

The app applies `ResponseEnvelopeInterceptor` globally.

Practical effect:

- most responses are wrapped consistently
- controllers can focus on business payloads rather than hand-building every contract

### Correlation

The app uses request ID and correlation infrastructure.

Practical effect:

- `x-request-id` is accepted or generated
- correlation context is propagated across request handling
- logs and some async operations can be tied back to the originating request

## Authentication Shape at the API Layer

The active browser API model is cookie-based:

- `better-auth` handles `/api/auth/*`
- other protected routes are validated by the global `BetterAuthGuard`
- the API is not centered on bearer-token clients in the primary path anymore

This matters for API consumers:

- browser-first behavior assumes cookie sessions
- older JWT-centric mental models are legacy, not the current preferred contract

## Pagination, Filtering, and Query Design

The backend has good pagination coverage, but not full uniformity yet.

Observed patterns:

- common `page` and `limit` query parameters
- explicit max limits on some endpoints
- controller-level parsing and sanitization in several modules
- service-level pagination metadata on list responses
- domain-specific filters for email, contacts, and AI observability endpoints

Representative strengths:

- email list endpoints validate pagination inputs
- contacts expose paginated listing and filtered queries
- AI observability endpoints expose simple paginated listing and summaries

Current weakness:

- not every module is using a single shared pagination DTO and response shape yet

## Versioning and Backward Compatibility

The API has an explicit global `/api/v1` prefix, which is the right baseline for future contract evolution.

There is also an explicit legacy-route watchdog for `/email-configs` that returns `410 Gone` and points callers to `/providers/*`.

That is a good deprecation pattern because it fails loudly instead of silently routing outdated clients.

## Documentation and Contract Tooling

Current API documentation posture:

- Swagger is generated in non-production by default
- CI attempts to generate and lint OpenAPI artifacts
- frontend type generation depends on the generated spec

Current risk:

- CI checks are conditional on the generated OpenAPI file being present, which makes contract enforcement weaker than it should be

## Rate Limiting and Edge Protection

The app uses global throttling tiers:

- default read-oriented tier
- stricter write-oriented tier

Additional route-level throttles are applied in some controllers for sensitive or expensive operations.

This is a reasonable baseline for API abuse protection.

## Current Gaps

### Partial Standardization

The API is standardized enough to be usable and maintainable, but not yet standardized enough to be called a tightly governed enterprise API platform.

### Browser-Centric Auth Assumption

The current preferred auth model fits the web app well, but API consumers such as third-party integrations or service accounts would need a more explicit long-term story.

### Inconsistent Query DTO Reuse

Some endpoints still parse and validate pagination/filter inputs manually instead of relying on shared DTOs everywhere.

### Contract Drift Risk

OpenAPI exists, but the repo still shows signs that generated artifacts and documentation can drift from the current implementation.

## Guidance for Contributors

1. Keep new endpoints under `/api/v1` unless they are explicit exceptions like webhooks, health, metrics, or auth internals.
2. Reuse shared pagination/query DTO patterns where possible instead of hand-parsing query strings.
3. Let global validation and exception handling do the heavy lifting; do not introduce custom ad hoc error shapes.
4. Prefer deprecation-by-watchdog for removed routes instead of silent compatibility hacks.
5. Treat OpenAPI generation as part of the contract, not optional documentation.

## Current Assessment

API maturity: good for a modular SaaS monolith, but not yet fully contract-governed.

The API is strongest in versioning, validation, and error normalization, and weakest in full query-contract consistency and OpenAPI enforcement hygiene.
