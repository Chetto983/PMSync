# Technical Overview - PMSync

## Project Architecture

PMSync is a multi-tenant email management platform with AI-powered workflows built on a NestJS backend and a Next.js frontend.

Frameworks:

- Backend: NestJS 11
- Frontend: Next.js 16 + React 19

Current architecture style:

- modular monolith
- shared PostgreSQL database with tenant-scoped data
- Redis-backed queues, cache, and realtime fan-out
- custom Mistral-based AI orchestration with pgvector retrieval

## Core Components

### 1. Email Sync System

Description:

Unified email synchronization across Gmail, Microsoft Outlook, and IMAP providers.

Key backend areas:

- `backend/src/modules/email-sync/` - sync orchestration, queues, workers, provider drivers
- `backend/src/modules/providers/` - OAuth connect flows and provider configuration
- `backend/src/modules/email/` - email CRUD, folders, templates, signatures, attachments

Design patterns:

- interface -> factory -> implementation provider model
- canonical folder normalization across providers
- BullMQ-backed async sync and send workflows
- Redis-backed coordination for distributed execution

### 2. AI Platform

Description:

AI features are currently built on custom orchestration over Mistral and the AI SDK. The active runtime is not a current VoltAgent agent graph, even though some older tables, comments, and naming residue still exist in the repository.

Key backend areas:

- `backend/src/modules/ai/` - embeddings, RAG, briefing, insights, triage, observability
- `backend/src/modules/ai-chat/` - streaming chat, conversation persistence, tool routing, HITL
- `backend/src/modules/mistral/` - provider wrapper for chat and embedding models

Current capabilities:

- streaming chat
- prompt guardrails
- PII tokenization before model exposure
- pgvector-backed retrieval
- AI tools for email, calendar, contacts, folders, and semantic search
- AI run ledger for usage and cost telemetry

Current caveat:

The backend AI control plane is not fully mature yet. HITL exists, but approval execution and mutating-tool policy are still inconsistent. See `backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md`.

### 3. Authentication, Sessions, and Multi-Tenancy

Description:

The active browser session model uses `better-auth` session cookies validated by a global Nest guard. Legacy JWT-based auth flows still exist in parallel and should be treated as transition-state architecture, not the long-term target.

Key backend areas:

- `backend/src/common/auth/` - `better-auth` instance, guard, public-route handling
- `backend/src/modules/auth/` - legacy auth flows, MFA, WebAuthn, roles, tenant guard
- `backend/src/prisma/tenant-scoping/` - Prisma tenant-scoping extension

Design patterns:

- `better-auth` session validation as the main HTTP auth gate
- tenant resolution via `TenantGuard`
- Prisma auto-injection of `tenantId` for tenant-scoped models
- shared-database multi-tenancy with composite tenant keys on core entities

Current caveat:

Auth is still dual-stack. Contributors should not assume the legacy JWT layer has already been removed.

### 4. Realtime and Observability

Description:

The backend supports realtime notifications and operational metrics.

Key backend areas:

- `backend/src/modules/realtime/` - Socket.IO gateway and websocket auth
- `backend/src/common/metrics/` - Prometheus metrics
- `backend/src/modules/health/` - health and queue endpoints

Design patterns:

- Redis Socket.IO adapter for horizontal fan-out
- websocket session validation aligned with `better-auth`
- Prometheus metrics plus health endpoints
- structured logging with `nestjs-pino`

## Component Interactions

### Email Sync Flow

```text
Provider OAuth connect
  -> ProvidersModule stores provider config
  -> Sync scheduler enqueues initial sync
  -> BullMQ worker executes provider driver
  -> Prisma persists folders/emails/contacts/events
  -> Realtime gateway emits tenant-scoped updates
```

### AI Chat Flow

```text
User message
  -> BetterAuthGuard validates session
  -> TenantGuard resolves active tenant
  -> ConsentGuard and QuotaGuard apply
  -> AiChatController streams request
  -> AiChatService tokenizes PII and loads conversation context
  -> Intent router selects relevant tools
  -> Mistral model runs with tool access
  -> HITL creates pending action for some mutating tools
  -> Conversation and AI ledger are persisted
```

### Daily Briefing Flow

```text
GET /api/v1/ai/briefing
  -> BetterAuthGuard validates session
  -> TenantGuard resolves active tenant
  -> Quota and consent checks apply
  -> BriefingService gathers email, calendar, and follow-up context
  -> Mistral generates structured briefing output
  -> Result is returned and recorded in AI run ledger
```

### WebSocket Authentication Flow

```text
Socket.IO handshake
  -> RealtimeHandshakeService calls better-auth session lookup
  -> User and tenant status are re-checked in Prisma
  -> Tenant room is assigned
  -> Realtime events stay tenant-scoped
```

## Database Model

High-level data shape:

```text
Tenant
  -> User
  -> ProviderConfig
  -> Email / Folder / Contact / CalendarEvent
  -> AiConversation / ActionQueue / AiRunLedger
  -> Embedding (pgvector)
```

Important characteristics:

- shared PostgreSQL database
- `tenantId` on tenant-scoped entities
- composite primary keys on several high-value entities such as email, folder, embedding, calendar event, and contact
- pgvector used for embeddings and similarity search

## Deployment and Runtime

### Backend Runtime Characteristics

- stateless HTTP API
- Redis required for queues, cache, and websocket scaling
- PostgreSQL required for operational data and embeddings
- Mistral API required for AI features

### Key Environment Variables

- `DATABASE_URL`
- `REDIS_HOST`, `REDIS_PASSWORD`
- `MISTRAL_API_KEY`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `FRONTEND_URL`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
- `JWT_SECRET`
- `CSRF_SECRET`

Note:

`JWT_SECRET` still exists because the legacy auth path has not been fully removed.

## Current Design Decisions

1. Multi-tenant by default.
   Tenant isolation is enforced in guards and Prisma extensions, not left to controller-level discipline alone.

2. Provider abstraction over provider branching.
   Provider-specific sync behavior is encapsulated behind driver/service boundaries.

3. Queue-backed background work.
   Sync, sending, cleanup, and scheduled operations are pushed off the request path where possible.

4. Session-cookie browser auth.
   The active web auth path is cookie-based rather than localStorage bearer token handling.

5. Tool-augmented AI instead of unrestricted agent autonomy.
   AI actions are expected to go through bounded tool surfaces rather than arbitrary execution.

6. Operational metrics built into the monolith.
   Prometheus metrics, queue health, and structured logs are part of the backend baseline.

## Known Architecture Gaps

These are current-state caveats, not target-state design claims:

- auth is dual-stack: `better-auth` plus legacy JWT flows
- backend authorization is still mostly role-based
- AI mutating-tool approval boundaries are inconsistent
- HITL execution is not fully reliable today
- some docs and schema residue still reference earlier VoltAgent-era architecture

## Recommended Companion Docs

- `backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md`
- `backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md`
- `backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md`

Generated from current code review and updated to replace stale architecture assumptions.
