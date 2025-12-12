# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL REQUIREMENT: Test at Every Step

**⚠️ MANDATORY: Always test code with real providers after every significant change.**

When working on email sync services, drivers, or any provider integration:

1. **After every refactoring** → Run real provider tests
2. **After adding new methods** → Test with actual API calls
3. **After fixing bugs** → Verify the fix works in production scenarios
4. **Before committing** → Ensure all tests pass with real data

### Real Provider Testing Commands

```bash
# Test Google sync with real Gmail account
cd backend
npx ts-node src/modules/email-sync/drivers/test-google-sync-modes.script.ts

# Test Microsoft sync with real Outlook account
npx ts-node src/modules/email-sync/drivers/test-microsoft-sync-modes.script.ts

# Test isolated driver (no full app context)
npx ts-node --skipProject src/modules/email-sync/drivers/test-microsoft-driver.simple.ts
```

**Never assume code works without testing!** TypeScript compilation passing is NOT enough.

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

### Unit Tests (Jest)

Backend tests use Jest with `*.spec.ts` naming. Test setup in `backend/test/setup.ts`.

Run specific module tests:
```bash
npx jest src/modules/ai/multi-agent --passWithNoTests
npx jest --testPathPattern="email-insights"
```

Frontend tests also use Jest with `*.test.ts(x)` naming.

### Integration Tests (Real Providers)

**CRITICAL: Always run integration tests after code changes.**

Integration test scripts are located in `backend/src/modules/email-sync/drivers/`:

- `test-google-sync-modes.script.ts` - Tests GoogleSyncService with real Gmail
- `test-google-changes.script.ts` - Tests Gmail History API incremental sync
- `test-microsoft-sync-modes.script.ts` - Tests MicrosoftSyncService with real Outlook
- `test-microsoft-driver.simple.ts` - Tests MicrosoftDriver in isolation

**Testing Workflow:**

1. Make code changes (refactoring, new features, bug fixes)
2. Run TypeScript compilation: `npx tsc --noEmit`
3. **Run real provider tests** to verify actual API calls work
4. Review test output for errors, performance, data correctness
5. Only commit if all tests pass

**Example Testing Session:**
```bash
cd backend

# Step 1: Type check
npx tsc --noEmit

# Step 2: Run real provider test
npx ts-node src/modules/email-sync/drivers/test-google-sync-modes.script.ts

# Step 3: Verify output shows:
# ✅ Full sync: X messages processed
# ✅ Incremental sync: Y changes detected
# ✅ All features working (BullMQ, realtime events, multi-tenancy)

# Step 4: Commit only if all tests pass
git add . && git commit -m "..."
```

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
