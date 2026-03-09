# PMSync Architecture and Security Audit

Date: March 9, 2026
Scope: Repository-wide static audit of backend, frontend, AI, data, and delivery architecture
Method: Source review only. No live environment validation, provider-connect tests, penetration testing, load testing, or end-to-end execution was run for this document.

## Executive Summary

PMSync is a modular NestJS monolith with a Next.js frontend, PostgreSQL shared-database multi-tenancy, Redis-backed background processing, and a custom AI layer built around Mistral, pgvector, and tool-enabled chat orchestration.

The platform is structurally stronger than a typical early SaaS codebase in three areas:

- multi-tenant request and database scoping
- modular separation of major business domains
- asynchronous infrastructure for sync, sending, and realtime fan-out

The main risks are concentrated in the AI control plane and identity transition layer:

- human-in-the-loop execution is inconsistent and partially broken
- several AI mutating tools bypass approval entirely
- the platform currently ships both `better-auth` session auth and legacy JWT auth flows
- authorization remains mostly coarse RBAC rather than enterprise-grade policy enforcement

Overall, the system is viable as an enterprise SaaS foundation, but it is not yet at enterprise governance maturity for AI safety, identity architecture, or fine-grained access control.

## Audit Scope and Constraints

This audit evaluates:

- system architecture quality
- scalability posture
- API design
- authentication and authorization
- AI, RAG, and agent/tool architecture
- multi-tenant isolation
- maintainability
- operational readiness
- security posture against OWASP-style concerns

This audit does not claim runtime proof of:

- real provider sync correctness
- production infra hardening
- real latency characteristics
- exploitability of every theoretical path

Where a point is inferred rather than directly proven, it is labeled as such.

## High-Level Architecture Overview

### Backend

- Framework: NestJS 11 modular monolith
- API style: REST
- API versioning: global prefix `/api/v1`
- Database: PostgreSQL via Prisma
- Multi-tenancy: shared database, tenant-scoped models, application-enforced isolation
- Background processing: BullMQ with Redis
- Realtime: Socket.IO with Redis adapter
- Metrics: Prometheus endpoint plus JSON/text health endpoints
- Logging: structured logging via `nestjs-pino`

### Frontend

- Framework: Next.js 16 with React 19
- State: TanStack Query for server state, Zustand for client UI state
- Auth client: `better-auth` React client with cookie-based sessions
- API client: Axios wrapper with response envelope unwrapping and CSRF header injection

### AI Layer

- LLM provider: Mistral through AI SDK
- Chat orchestration: custom service, not a current VoltAgent runtime
- Prompt controls: prompt guardrails plus PII tokenization
- Vector store: pgvector in PostgreSQL
- Retrieval: pgvector similarity search plus hybrid SQL search
- Tooling: AI SDK tools built from email/calendar/contact/folder/RAG tool services
- HITL: pending approval queue for some mutating actions

## System Discovery

### Backend Architecture Discovery

The backend is a modular monolith centered in `backend/src/app.module.ts`. It composes domain modules such as auth, email, providers, email-sync, calendar, contacts, AI, AI chat, compliance, realtime, and subscription. Global cross-cutting controls are implemented as Nest application guards and interceptors.

Positive characteristics:

- clear modular boundaries for major domains
- global request pipeline for auth, consent, envelopes, metrics, and audit
- queues and realtime scaling already anticipated
- database access centralized through Prisma with extension-based scoping

Observed architecture shape:

- not a microservice system
- not a pure hexagonal architecture
- not a service mesh deployment
- best described as a modular, infrastructure-aware enterprise monolith

### Frontend Architecture Discovery

The frontend is a classic enterprise SPA-style Next.js application. It still uses the Pages Router, but its runtime model is modern: TanStack Query for remote data, Zustand for client state, and a centralized API client.

Positive characteristics:

- session-cookie auth rather than localStorage bearer token handling
- CSRF token management is memory-based
- API abstraction is centralized
- server state and local state are clearly separated

### AI Discovery

The AI stack is custom-built around Mistral and the Vercel AI SDK. The codebase still contains VoltAgent naming residue and legacy tables, but the active path is custom orchestration, not an active generalized agent framework.

Key components discovered:

- Mistral provider wrapper
- prompt guard service
- AI run ledger
- embeddings service
- hybrid search service
- AI chat orchestration service
- tool services for mail/calendar/contact/folder/RAG
- pending approval queue for some tool calls

## SaaS Multi-Tenant Architecture

### Model

The system uses a shared-database model with tenant-scoped records. Core entities include `tenantId`, and several high-value tables use composite primary keys such as `@@id([id, tenantId])`.

This is materially safer than a naive shared-table design because:

- `TenantGuard` resolves and validates tenant context per request
- Prisma extensions inject `tenantId` automatically for tenant-scoped models
- core data models such as email, folder, embedding, calendar event, and contact include composite keys

### Strengths

- strong default tenant scoping in ORM access
- good centralization of tenant propagation
- cross-tenant access checks exist in the request guard
- tenant-scoped create, read, update, delete are enforced by extension logic

### Risks

- `withoutTenantScopingAsync` is widely used for system-level operations; this is necessary in some paths but remains a review hotspot
- raw SQL exists in the AI/vector search layer, which increases the need for disciplined tenant filtering
- `AiMessage` is intentionally excluded from direct tenant scoping and instead relies on `conversationId` containment; this is acceptable in the current flow but weaker than first-class tenant scoping

### Multi-Tenant Verdict

Assessment: Strong for an application-enforced shared database model, but not formally hardened to the level of database-per-tenant or row-level security at the database engine layer.

Score contribution: above average

## API Architecture

### Current Design

- REST only
- global versioning under `/api/v1`
- response envelope `{ data, meta }`
- error envelope `{ error, meta }`
- controller-level validation and pagination patterns exist

### Strengths

- route versioning is explicit
- standardized error shape is in place
- request validation is centralized with Nest validation pipes
- pagination and filtering are present on representative endpoints

### Gaps

- no clear evidence of a long-term API deprecation/versioning policy beyond `v1`
- OpenAPI contract generation is wired in CI, but the generated artifact is currently absent from the repo
- some documentation comments and legacy behavior still reference older auth flows

### API Verdict

Assessment: Solid enterprise REST baseline with good operational ergonomics, but contract discipline and lifecycle governance need work.

## Authentication and Identity

### Active Auth Architecture

The active path uses `better-auth` session cookies validated by a global Nest guard. Frontend clients rely on cookies sent with `withCredentials: true`, and CSRF protection is layered on top.

Positive traits:

- browser-friendly session-cookie model
- no active evidence of localStorage access tokens in the main frontend path
- CSRF token handling exists
- provider OAuth connect flows use Redis-backed state + PKCE

### Identity Gaps

- legacy JWT auth remains active alongside `better-auth`
- no active enterprise workforce SSO for platform login was found
- no clear IdP federation model for Okta, Entra ID, Auth0, or SAML-based enterprise login

### Auth Verdict

Assessment: good browser-session security direction, but currently transitional and duplicative.

## Authorization Model

### Current Model

Authorization is primarily role-based. `RolesGuard` checks for exact role membership using controller decorators.

### Strengths

- role checks are present across many controllers
- tenant resolution is in the guard chain before controller access
- compliance and consent guards are globally integrated

### Gaps

- no active ABAC or resource policy engine was found
- no clear object-level authorization model for enterprise CRM-like entities
- no evidence of delegated admin, team-scoped permissions, field-level restrictions, or fine-grained permission composition
- frontend route protection is session-only, not permission-aware

### Authorization Verdict

Assessment: acceptable for admin/member SaaS, below enterprise CRM expectations.

## AI Architecture

### Current Design

AI orchestration is centralized in the chat service. The flow is:

1. rate limiting
2. circuit breaker check
3. conversation resolution
4. PII tokenization
5. prompt assembly with memory injection
6. tool-enabled streamed completion
7. ledger and audit persistence

### Strengths

- explicit prompt guardrails
- PII redaction before model exposure
- tenant-aware memory and retrieval
- ledger model for AI telemetry
- usage and cost controls exist in parts of the stack

### Gaps

- tool-call telemetry is incomplete
- cost protection is not consistently applied to bulk embedding generation
- architecture residue from prior AI approaches increases conceptual drift

### AI Verdict

Assessment: promising and thoughtfully structured, but not yet governed tightly enough for enterprise AI operations.

## RAG Pipeline Architecture

### Current Design

The RAG stack uses pgvector embeddings stored in PostgreSQL. Embeddings store references to source entities rather than full source content, which is a good minimization practice.

Positive traits:

- embeddings store IDs rather than source text
- tenant filtering is applied in similarity search logic
- retrieval paths include vector and hybrid search modes
- the knowledge-base replacement flow appears more resilient than a naive delete-then-regenerate pattern

### Risks

- raw SQL and `Prisma.raw` are used in vector-related queries
- embedding governance is only partly instrumented
- the platform lacks a visibly centralized permission-filtered retrieval layer for all future document/object types

### RAG Verdict

Assessment: technically capable and privacy-aware, but still emerging as a full enterprise retrieval layer.

## Agent and Tool Framework Architecture

### Current Design

The current system is tool-augmented orchestration rather than a generalized autonomous agent platform. This is the right default posture for enterprise SaaS.

### Critical Risks

- approved HITL actions can map to tools that are not registered in the central tool registry
- some mutating tools execute immediately without approval
- action taxonomy is semantically incomplete, for example `delete_event` maps to `SCHEDULE_MEETING`

### Agent Verdict

Assessment: the platform avoided the worst autonomy patterns, but its control boundary is inconsistent and currently unsafe for high-trust enterprise AI claims.

## Scalability Architecture

### Strengths

- API is largely stateless
- Redis-backed Socket.IO adapter supports horizontal realtime scale
- BullMQ is used for background workloads
- provider sync and email sending already leverage asynchronous execution
- schema indexing is relatively mature on core tables

### Bottlenecks

- AI chat remains latency-sensitive and synchronous at request time
- shared PostgreSQL remains a long-term tenant-scale limiter for very large customers
- vector and hybrid search remain in the primary database plane
- observability is not deep enough for confident high-scale performance tuning

### Scalability Verdict

Assessment: strong modular monolith scalability posture, but not yet an elastic enterprise platform at very high tenant size.

## Performance Analysis

### What Looks Good

- good indexing on `emails`, `contacts`, `calendar_events`
- trigram indexes for search-heavy fields
- queue-backed operations for sending and sync workloads
- bounded chat tool steps

### Main Risks

- 90-second frontend API timeout indicates slow-path AI dependence
- synchronous LLM calls remain on the user request path
- vector search remains in the main database
- no visible distributed tracing for API-to-queue-to-provider chains

### Performance Recommendations

- move slow AI post-processing and enrichment to async paths where possible
- add explicit SLIs for AI latency, tool latency, provider latency, queue delay, and DB query time
- isolate heavy vector and hybrid search workloads if tenant size grows materially
- instrument query plans for the highest-volume email list/search endpoints

## Database Architecture

### Strengths

- Prisma schema is reasonably mature
- tenant-scoped composite keys exist on critical entities
- indexing on emails is comparatively strong
- pgvector integration is already in place

### Risks

- shared-db model will hit noisy-neighbor issues before database-per-tenant architectures do
- raw vector SQL should be kept under close review
- stale AI-related tables remain in the schema and increase conceptual noise

### Database Verdict

Assessment: better than average schema design for a fast-moving SaaS monolith. Main concern is long-term tenant isolation and workload class separation, not basic schema quality.

## DevOps Architecture

### Present

- backend CI workflow
- frontend CI workflow
- Dockerfiles for frontend and Railway backend deployment
- local docker-compose for Redis, optional DB, mail, and monitoring

### Gaps

- no clear repo-level production IaC or Kubernetes manifests were found
- staging vs production promotion strategy is not visible
- duplicated CI concerns exist across workflows
- secret governance is partly implied through env validation, but not fully documented operationally

### DevOps Verdict

Assessment: adequate for an advanced monolith, below mature enterprise platform operations.

## Observability

### Present

- structured logging
- Prometheus endpoint
- queue depth collector
- AI run ledger
- health controller

### Gaps

- public health and queue surfaces are too open
- deprecated and active metric endpoints coexist
- no visible distributed tracing or Sentry-like centralized exception tracking
- AI observability exists, but ledger accuracy is incomplete

### Observability Verdict

Assessment: decent metrics foundation, incomplete platform observability.

## Frontend Architecture and Security

### Strengths

- cookie-based auth
- CSRF header injection
- no active localStorage token pattern found in the main client path
- clear split between server state and client state

### Risks

- route proxy protection only checks for cookie existence, not permissions
- frontend auth architecture includes stale code that should be removed
- no visible frontend permission model for admin/manager surfaces

### Frontend Verdict

Assessment: modern enough and materially safer than token-in-localStorage designs, but governance is still backend-heavy.

## Codebase Maintainability

### Strengths

- modular Nest structure
- many comments document intent and migration history
- query/client abstractions exist
- CI includes type-checking, linting, testing, and dependency-boundary checks

### Debt

- transition-state auth code
- stale VoltAgent-era schema/doc residue
- duplicated or conditional CI behavior around OpenAPI
- significant phase-history comments can obscure current truth

### Maintainability Verdict

Assessment: workable and disciplined in many places, but carrying too much migration residue.

## Confirmed Findings

### Critical

1. HITL execution path can approve actions that cannot actually run.
2. Several AI mutating tools bypass approval entirely.

### High

1. Dual auth stacks are simultaneously shipped.
2. Authorization is primarily coarse RBAC, not enterprise-grade policy evaluation.

### Medium

1. AI ledger observability is incomplete.
2. Bulk embedding generation bypasses the stronger cost-protection path used for single embeddings.
3. Public health and metrics exposure is broader than advisable.
4. OpenAPI contract generation is wired but drift-prone.
5. Stale architecture residue increases maintenance cost.

## Architecture Scorecard

| Category | Score |
| --- | --- |
| Architecture | 7/10 |
| Scalability | 7/10 |
| Security | 6/10 |
| API Design | 7/10 |
| AI Integration | 6/10 |
| Maintainability | 6/10 |

## Refactoring Roadmap

### 0 to 30 Days

- unify AI approval semantics for all mutating tools
- make HITL execute the same tool implementations used by chat runtime
- remove or disable legacy auth paths if `better-auth` is the chosen platform
- restrict public operational endpoints
- fix AI ledger telemetry accuracy

### 30 to 60 Days

- introduce a centralized authorization service with permission evaluation
- restore reliable OpenAPI generation and frontend type sync
- remove dead/stale auth and AI residue
- define an AI safety policy for allowed tools, approval classes, and auditability

### 60 to 90 Days

- add distributed tracing for API, queue, provider, and AI chains
- formalize environment promotion and operational runbooks
- add tenant-tier isolation strategy for larger customers
- review whether vector search should stay in the primary operational database

### 90 Plus Days

- keep the modular monolith as the primary delivery model unless scale or compliance demands service extraction
- only split services after introducing stable event contracts and gateway boundaries
- likely extraction candidates are identity/compliance, provider sync, and AI orchestration

## Enterprise Architecture Recommendations

1. Keep the modular monolith for now. The system already has the right internal seams and does not yet justify operationally expensive microservice fragmentation.
2. Prioritize governance before topology. The main upgrade path is one auth system, one authorization model, one AI control policy, and one contract pipeline.
3. Treat AI as a privileged subsystem. Every mutating tool should have an explicit trust class, approval policy, audit trail, and observability contract.
4. Preserve shared-db multi-tenancy for normal tenants, but prepare optional higher-isolation offerings for enterprise/regulatory accounts.
5. Move toward policy-driven authorization if the product is intended to resemble Salesforce or HubSpot in organizational complexity.

## Final Verdict

PMSync has a credible enterprise SaaS core and a stronger-than-average multi-tenant architecture for a modular monolith. It is not currently blocked by weak fundamentals. It is blocked by governance maturity in AI actions, identity consolidation, and authorization depth.

If the stated product goal is an AI-enabled enterprise CRM platform, the next milestone should not be microservices. It should be:

- auth unification
- policy-based authorization
- AI control-plane hardening
- private operational telemetry
- contract and documentation discipline

Those changes would materially increase both security confidence and enterprise readiness without forcing premature architectural fragmentation.
