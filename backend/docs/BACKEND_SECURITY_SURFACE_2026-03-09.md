# Backend Security Surface

Date: 2026-03-09
Scope: Current backend security entry points, protections, and exposed operational surfaces
Status: Current reference

## Summary

The backend security posture is stronger than average for a growth-stage SaaS, but the security surface is broader than it should be because the platform is in transition.

The main security layers today are:

- `better-auth` session validation
- tenant enforcement
- coarse RBAC
- CSRF protection
- CORS allowlisting and regex matching
- rate limiting
- structured error and request handling

The main security gaps are:

- auth dual-stack residue
- coarse authorization semantics
- public operational health and queue exposure
- AI control-plane policy inconsistency

## Main Security Entry Points

### HTTP API

Primary protected surface:

- `/api/v1/*`

Current protection model:

- global throttling
- global `BetterAuthGuard`
- legal acceptance guard
- consent guard
- controller-level tenant/role/quota/feature guards

### Auth Surface

Current auth-related surfaces include:

- `/api/auth/*` handled by `better-auth`
- legacy auth endpoints still present under the auth module

This is the single largest security-surface complexity issue in the current backend.

### Webhooks and OAuth Callbacks

Unprefixed or excluded routes include:

- `/webhooks/*`
- provider OAuth callback routes
- `/metrics`
- `/health/*`

These are normal exceptions, but they need tighter operational discipline than standard app routes.

## Current Protection Layers

### Authentication

Primary model:

- `better-auth` database-backed session cookies

Residual complexity:

- legacy JWT-era code still exists in parallel

### Authorization

Current layers:

- `TenantGuard`
- `RolesGuard`
- self-service route constraints
- governance guards like consent, quota, and legal checks

This is serviceable, but not yet enterprise-grade authorization.

### CSRF Protection

The backend uses a double-submit-cookie CSRF model with:

- HMAC-signed CSRF cookie
- `X-CSRF-Token` request header
- route exclusions for safe methods and selected auth/webhook paths

Important current detail:

- `CSRF_SECRET` falls back to `JWT_SECRET` if not set explicitly

That is workable but not ideal from a hardening perspective.

### CORS

The backend supports:

- explicit allowlisted origins
- regex allow patterns
- dev-mode allow-all behavior with safeguards

This is stronger than many default CORS setups, but still configuration-sensitive.

### Rate Limiting

The app uses:

- global read-oriented throttling
- stricter write throttling
- route-level overrides on selected operations

This is a reasonable baseline against abuse and accidental overload.

## Public Operational Surfaces

The broadest current exposure issue is the public health controller.

Currently public:

- `/health`
- `/health/ready`
- `/health/live`
- `/health/queues`
- `/health/queues/all`
- `/health/queues/:name`
- `/health/metrics`

Risk:

- operational queue state is exposed without authentication
- deprecated metrics text is still reachable

This is the clearest current misconfiguration risk in the platform surface.

## Strong Points

### Tenant Isolation Is Real

Tenant enforcement is not just a coding convention. It exists in both request guards and Prisma tenant scoping.

### Browser Auth Is Moving in the Right Direction

Cookie sessions plus CSRF is the correct browser model.

### Security Validation Exists In Configuration

The configuration layer enforces or warns about:

- weak secrets
- weak DB passwords
- debug auth logging in production
- Redis TLS edge cases

### Security Layers Are Composed

The platform is not depending on one control only. It uses multiple layers across auth, tenancy, quota, and request handling.

## Current Risks

### Dual-Stack Auth

The coexistence of `better-auth` and legacy auth paths increases attack surface and raises the chance of inconsistent hardening.

### Coarse Authorization

The backend still lacks a centralized permission model suitable for enterprise delegation and object-level rules.

### Public Operational Exposure

Health and queue details should not be broadly public in a production-grade posture.

### AI Control Plane

Mutating AI tools are not yet governed by a fully consistent backend policy model.

### Secret Coupling

Falling back from `CSRF_SECRET` to `JWT_SECRET` is convenient, but tighter secret separation would be better.

## Recommended Hardening Priorities

1. Finish auth consolidation so one browser auth model is primary in code and docs.
2. Restrict public health and queue detail endpoints.
3. Move Prometheus scraping to canonical `/metrics`.
4. Implement centralized permission checks beyond raw roles.
5. Harden the AI action policy layer and approval execution flow.
6. Separate CSRF and JWT secrets explicitly in all environments.

## Guidance for Contributors

1. Treat public operational endpoints as security-sensitive, not just ops convenience.
2. Do not add new privileged paths without explicit guard and tenant-boundary review.
3. Prefer explicit secret separation over fallback coupling.
4. Any new AI action surface should be reviewed as both product logic and security surface.

## Current Assessment

Security surface maturity: good layered foundation, incomplete hardening.

The backend already has meaningful protections. The next gains come from removing transition-state complexity and reducing unnecessary exposure.
