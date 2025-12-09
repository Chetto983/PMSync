# CLAUDE.md - AI Assistant Guide for MailAgent

This document provides comprehensive guidance for AI assistants working on the MailAgent codebase.

## Project Overview

MailAgent is a full-stack, AI-powered multi-tenant email management platform built with:
- **Backend**: NestJS 11.x (TypeScript) with PostgreSQL + pgvector + Redis
- **Frontend**: Next.js 16 with React 19, TailwindCSS, Material UI
- **AI**: Mistral AI for LLM, LangChain for RAG, pgvector for embeddings

**Status**: Backend 100% complete, Frontend 98% complete, Test coverage 17.45%

## Repository Structure

```
MailAgent/
├── backend/                    # NestJS API server
│   ├── src/
│   │   ├── modules/           # Feature modules (auth, email, ai, calendar, contacts, etc.)
│   │   ├── common/            # Shared services, guards, filters, interceptors
│   │   ├── config/            # Configuration and environment validation
│   │   └── main.ts            # Application entry point
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema (~39KB, 200+ models)
│   │   └── migrations/        # Database migrations
│   └── test/                  # Test utilities and mocks
├── frontend/                  # Next.js application
│   ├── app/                   # App router pages
│   ├── components/            # React components by feature
│   ├── stores/                # Zustand state stores
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utilities (api-client, websocket, etc.)
│   └── locales/               # i18n translations (en, it)
├── docs/                      # Project documentation
├── scripts/                   # Utility and deployment scripts
├── monitoring/                # Prometheus & Grafana configs
├── nginx/                     # Reverse proxy configuration
└── docker-compose.dev.yml     # Docker development environment
```

## Development Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 16+ with pgvector extension
- Redis 7.x

### Quick Start

```bash
# Start infrastructure services
docker-compose -f docker-compose.dev.yml up -d

# Backend development
cd backend
npm install
npx prisma generate
npm run start:dev          # Runs on port 3000

# Frontend development
cd frontend
npm install
npm run dev                # Runs on port 3001
```

### Key Commands

**Backend** (`/backend`):
```bash
npm run start:dev          # Development with hot reload
npm run start:debug        # Debug mode
npm run build              # Production build
npm run lint               # ESLint (use lint:win on Windows)
npm test                   # Run tests
npm run test:cov           # Coverage report
npm run db:migrate         # Run Prisma migrations
npm run db:seed            # Seed database
npx prisma generate        # Regenerate Prisma client
```

**Frontend** (`/frontend`):
```bash
npm run dev                # Development server (port 3001)
npm run build              # Production build
npm run lint               # ESLint
npm run type-check         # TypeScript check
npm test                   # Run tests
```

## Architecture Patterns

### Backend Module Structure

Each NestJS module follows this pattern:
```
modules/<feature>/
├── <feature>.module.ts       # Module definition with imports/exports
├── <feature>.controller.ts   # HTTP endpoints
├── <feature>.service.ts      # Business logic
├── dto/                      # Data Transfer Objects with validation
├── guards/                   # Authorization guards
├── interfaces/               # TypeScript interfaces
└── *.spec.ts                 # Unit tests
```

### Key Design Patterns

1. **Unified Provider Pattern** - Abstracted interfaces for email/calendar/contacts providers
   - `IEmailProvider`, `ICalendarProvider`, `IContactsProvider`
   - Factory pattern to instantiate correct provider (Google, Microsoft, IMAP)

2. **Multi-tenant Architecture** - All data queries use CTE-based tenant filtering
   - Tenant context via middleware
   - Enforced at database level with composite unique constraints

3. **BullMQ Job Queues** - Background processing for sync operations
   - Priority queues (high/normal/low)
   - Dead Letter Queue for failed jobs with retry

4. **Repository Pattern** - Prisma handles data access with type-safe queries

## Key Modules Reference

### Backend Modules (`/backend/src/modules/`)

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `auth` | Authentication, MFA, sessions | `auth.controller.ts`, `mfa.controller.ts` |
| `email` | Email CRUD, threading, attachments | `emails.service.ts`, `email-send.service.ts` |
| `email-sync` | Background sync, webhooks | `email-sync.controller.ts`, workers |
| `ai` | LLM chat, embeddings, insights | `mistral.service.ts`, `email-insights.service.ts` |
| `calendar` | Calendar events, sync | `calendar.controller.ts`, providers |
| `contacts` | Contact management, sync | `contacts.controller.ts`, workers |
| `providers` | OAuth, token management | `oauth-callback.controller.ts`, factories |
| `tenants` | Multi-tenant management | `tenants.service.ts` |
| `users` | User profiles, preferences | `users.service.ts` |
| `labels` | Email labeling system | `labels.controller.ts` |
| `compliance` | GDPR, data retention | `compliance.service.ts` |
| `health` | System health, metrics | `health.controller.ts` |
| `realtime` | WebSocket gateway | `realtime.gateway.ts` |

### Frontend Stores (`/frontend/stores/`)

| Store | Purpose |
|-------|---------|
| `auth-store.ts` | User authentication state |
| `email-store.ts` | Email list, selection, drafts |
| `folders-store.ts` | Folder hierarchy |
| `label-store.ts` | User labels |
| `contact-store.ts` | Contacts state |
| `calendar-store.ts` | Calendar events |
| `sync-store.ts` | Sync status |

## Code Conventions

### TypeScript Guidelines

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer interfaces over type aliases for object shapes
- Use DTOs with class-validator decorators for request validation
- Always define return types for functions

### NestJS Conventions

- Controllers handle HTTP concerns only, delegate to services
- Services contain business logic
- Use dependency injection via constructor
- Guards for authorization, Interceptors for transformation
- Global exception filters handle errors

### Frontend Conventions

- Use Server Components by default, Client Components when needed
- Zustand for client-side state, React Query for server state
- TailwindCSS for styling, Material UI for complex components
- All text must use i18n translation keys

### Naming Conventions

```
Files:        kebab-case (email-sync.service.ts)
Classes:      PascalCase (EmailSyncService)
Functions:    camelCase (syncEmails)
Constants:    UPPER_SNAKE_CASE (MAX_RETRIES)
DB Tables:    PascalCase in Prisma (CalendarEvent → calendar_events in DB)
```

## Testing Guidelines

### Test File Locations
- Backend: Colocated `*.spec.ts` files or `/backend/test/`
- Frontend: Colocated `*.test.ts(x)` files

### Running Tests
```bash
# Backend
cd backend
npm test                     # All tests
npm test -- <pattern>        # Specific tests
npm run test:cov             # With coverage

# Frontend
cd frontend
npm test                     # All tests
npm run test:coverage        # With coverage
```

### Test Patterns
- Mock external services (Prisma, Redis, APIs)
- Use factories for test data
- Test both success and error paths
- Integration tests for critical flows

## Database Schema

### Key Models (Prisma)

```prisma
# Multi-tenancy
Tenant, User (unique: [tenantId, email])

# Authentication
MfaSecret, MfaBackupCode, TrustedDevice, WebAuthnCredential, Session

# Email
Email, Folder, Label, UserLabel, Attachment, ScheduledEmail

# Calendar & Contacts
CalendarEvent, Calendar, Contact, ProviderContact

# AI
Embedding (pgvector), ChatSession, Message

# VoltAgent (Agentic AI)
AgentPendingAction, AgentActionFeedback

# Integration
ProviderConfig (OAuth tokens, encrypted)
```

### Database Commands
```bash
npx prisma generate          # Regenerate client after schema changes
npx prisma migrate dev       # Create and apply migration (dev)
npx prisma migrate deploy    # Apply migrations (prod)
npx prisma db push           # Push schema changes without migration
npx prisma studio            # Visual database browser
```

## API Patterns

### Authentication
All protected endpoints require JWT in Authorization header:
```
Authorization: Bearer <token>
```

### Response Format
```json
{
  "data": { /* payload */ },
  "meta": { /* pagination, etc */ },
  "error": null
}
```

### Common Endpoints
- `POST /auth/login` → `POST /auth/send-otp` → `POST /auth/verify-otp`
- `GET /emails?folder=INBOX&page=1&limit=50`
- `POST /ai/chat` with `{ message: string, sessionId?: string }`
- `GET /health` for system status

## Security Considerations

### Implemented Security Features
- AES-256-CBC encryption for sensitive fields (tokens, secrets)
- bcrypt password hashing (cost factor 12)
- Mandatory MFA for all users
- CTE-based tenant isolation in all queries
- CSRF tokens with 128-bit entropy
- XSS prevention with DOMPurify
- Rate limiting via Redis

### Security-Sensitive Code
- `/backend/src/common/services/crypto.service.ts` - Encryption
- `/backend/src/modules/auth/` - Authentication flows
- `/backend/src/common/guards/` - Authorization guards
- Provider OAuth token handling

## Common Tasks

### Adding a New API Endpoint
1. Define DTO in `dto/` with validation decorators
2. Add method to controller with proper decorators (`@Get`, `@Post`, etc.)
3. Implement business logic in service
4. Add guards if needed (`@UseGuards(JwtAuthGuard)`)
5. Write tests

### Adding a New Frontend Page
1. Create page in `/frontend/app/` (App Router)
2. Add translations to `/frontend/locales/en.ts` and `it.ts`
3. Create components in `/frontend/components/<feature>/`
4. Add API calls via React Query or api-client

### Modifying Database Schema
1. Edit `/backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>`
3. Run `npx prisma generate` to update client
4. Update affected services and DTOs

### Adding a New Email Provider
1. Implement `IEmailProvider` interface
2. Add to `ProviderFactory` in `/backend/src/modules/providers/`
3. Create OAuth flow if needed
4. Add sync worker handling

## Environment Variables

Key variables (see `.env.example` for complete list):

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mailagent

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m

# Encryption
ENCRYPTION_KEY=32-byte-hex-key

# AI
MISTRAL_API_KEY=your-api-key

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

# Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
```

## Troubleshooting

### Common Issues

**Prisma client out of sync**:
```bash
npx prisma generate
```

**Port already in use**:
```bash
# Find and kill process
lsof -i :3000
kill -9 <PID>
```

**Database connection issues**:
```bash
docker-compose exec postgres psql -U mailuser -d mailagent -c "SELECT 1"
```

**Redis connection issues**:
```bash
docker-compose exec redis redis-cli ping
```

**TypeScript/ESLint memory issues**:
```bash
# Use the lint:win script on Windows or increase memory
NODE_OPTIONS=--max-old-space-size=8192 npm run lint
```

## Documentation Links

- [Backend Delivery](docs/BACKEND_DELIVERY.md) - Complete backend documentation
- [Test Coverage Report](docs/development/TEST_COVERAGE_REPORT.md) - Testing status
- [Security Audit](docs/security/tenant-isolation-audit-2025-11-19.md) - Security review
- [OAuth Setup](docs/setup/oauth-complete-guide.md) - Provider OAuth configuration
- [Provider Pattern](backend/src/modules/providers/README.md) - Provider abstraction

## Quick Reference

### File Patterns to Know
- `*.module.ts` - NestJS module definitions
- `*.controller.ts` - HTTP endpoint handlers
- `*.service.ts` - Business logic
- `*.dto.ts` - Request/response validation
- `*.guard.ts` - Authorization logic
- `*.spec.ts` / `*.test.ts` - Tests
- `schema.prisma` - Database schema

### Important Paths
- Backend entry: `/backend/src/main.ts`
- Frontend entry: `/frontend/app/layout.tsx`
- Database schema: `/backend/prisma/schema.prisma`
- Environment template: `/.env.example`
- Docker config: `/docker-compose.dev.yml`

---

*Last updated: December 2025*
