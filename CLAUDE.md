# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MailAgent is a multi-tenant email management platform with AI-powered features. It supports Gmail, Microsoft Outlook, and IMAP providers with unified email sync, calendar, and contacts integration.

## Architecture

### Monorepo Structure
```
MailAgent/
├── backend/       # NestJS API server (port 3000)
├── frontend/      # Next.js app (port 3001)
└── scripts/       # Test and diagnostic utilities
```

### Backend Architecture

**Stack:** NestJS 11 + Prisma ORM + PostgreSQL + Redis (BullMQ) + Socket.IO

**Module Structure** (`backend/src/modules/`):
- `ai/` - AI agents: smart replies, summarization, scheduling, multi-agent orchestration
- `email/` - Email CRUD, conversations, attachments
- `email-sync/` - Provider sync services, webhooks, drivers
- `auth/` - JWT auth, MFA (TOTP/WebAuthn), sessions
- `providers/` - OAuth integration (Google, Microsoft)
- `calendar/` - Calendar sync and events
- `contacts/` - Contact sync and management
- `realtime/` - WebSocket gateway for real-time updates

**Provider Pattern:**
All email providers (Google, Microsoft, IMAP) follow the Interface → Factory → Implementation pattern. See `backend/src/modules/providers/README.md`.

**Email Driver Abstraction** (`backend/src/modules/email-sync/drivers/`):
- `IEmailDriver` interface with canonical types
- `GoogleDriver` wraps Gmail API via googleapis
- `MicrosoftDriver` wraps Graph API via axios
- `EmailDriverFactory` creates connected drivers
- Canonical folder types: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE

### Frontend Architecture

**Stack:** Next.js 16 + React 19 + TanStack Query + Zustand + Tailwind CSS + MUI

**Key Patterns:**
- Hooks in `frontend/hooks/` (ai/, mutations/, queries/)
- Stores in `frontend/stores/` (Zustand)
- API client in `frontend/lib/api/`
- Components organized by feature (email/, calendar/, contacts/, dashboard/)

## Development Commands

### Backend (from `backend/`)
```bash
npm run start:dev          # Dev server with watch
npm test                   # Run all tests
npx jest path/to/test.spec.ts  # Run single test file
npx jest --testPathPattern=pattern  # Run tests matching pattern
npm run lint:win           # Lint (Windows)
npx tsc --noEmit           # Type check
npx prisma generate        # Generate Prisma client
npx prisma db push         # Push schema to DB
npx prisma migrate dev     # Create migration
```

### Frontend (from `frontend/`)
```bash
npm run dev                # Dev server (port 3001)
npm test                   # Run tests
npm run type-check         # TypeScript check
npm run lint               # ESLint
```

### Database
Requires PostgreSQL (port 5432) and Redis (port 6379). Connection URL in `DATABASE_URL` env var.

```bash
# Reset database (WARNING: deletes all data)
cd backend && npx prisma migrate reset
```

## Testing Patterns

Backend tests use Jest with `*.spec.ts` naming. Test setup in `backend/test/setup.ts`.

Run specific module tests:
```bash
npx jest src/modules/ai/multi-agent --passWithNoTests
npx jest --testPathPattern="email-insights"
```

Frontend tests also use Jest with `*.test.ts(x)` naming.

## Key Technical Concepts

### Multi-Tenant Architecture
Every entity has `tenantId`. Users belong to tenants. All queries must be tenant-scoped.

### Canonical Folder Types
Email folders are normalized to canonical types across providers:
- Gmail labels (INBOX, SENT, DRAFT, TRASH, SPAM) → Canonical
- Microsoft wellKnownName (inbox, sentitems, drafts) → Canonical
- Stored in `email.folder` as uppercase strings: 'INBOX', 'SENT', 'TRASH', etc.

### OAuth Flow
1. User clicks provider connect
2. Redirect to OAuth provider
3. Callback stores tokens encrypted in DB (AES)
4. Sync scheduler uses refresh tokens automatically

### AI Architecture
- Mistral AI as primary LLM provider
- BullMQ queues for async AI jobs
- Embeddings stored for RAG-based knowledge retrieval
- Human-in-the-loop (HITL) for high-stakes actions

### WebSocket Events
Real-time updates via Socket.IO. Events emitted from `RealtimeModule`:
- `email:new`, `email:update`, `email:deleted`
- `sync:status`, `sync:progress`
- Folder changes, calendar updates

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and configure:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_HOST`, `REDIS_PASSWORD` - Redis connection
- `GMAIL_CLIENT_ID/SECRET` - Google OAuth
- `MICROSOFT_CLIENT_ID/SECRET` - Microsoft OAuth
- `MISTRAL_API_KEY` - AI provider
- `JWT_SECRET`, `AES_SECRET_KEY` - Security keys

For OAuth callbacks in local dev, use ngrok to expose port 3000 and set `API_PUBLIC_URL`.

## Code Style

- Backend: NestJS conventions, services in `*.service.ts`, controllers in `*.controller.ts`
- Frontend: Feature-based component organization, hooks for state/mutations
- Both: TypeScript strict mode, ESLint + Prettier

## Common Pitfalls

1. **Folder names**: Always use canonical types (INBOX not "Posta in arrivo")
2. **Tenant isolation**: Never query without `tenantId` filter
3. **Token refresh**: OAuth tokens expire; use `ProviderTokenService`
4. **BullMQ jobs**: Jobs need idempotency; same job may run twice
5. **Windows paths**: Use forward slashes in imports, escape in PowerShell commands
