# Codebase Structure

**Analysis Date:** 2026-01-31

## Directory Layout

```
MailAgent/
├── backend/                    # NestJS backend API server
│   ├── src/
│   │   ├── main.ts            # Bootstrap entry point (port 3000)
│   │   ├── app.module.ts      # Root module with all imports
│   │   ├── config/            # Environment & app configuration
│   │   ├── common/            # Shared utilities across modules
│   │   ├── modules/           # Feature modules (auth, email, ai, etc.)
│   │   ├── prisma/            # Database client & factory
│   │   └── *.ts               # Other global exports
│   ├── prisma/
│   │   └── schema.prisma      # Prisma ORM schema definition
│   ├── test/                  # E2E tests
│   ├── dist/                  # Build output (generated)
│   ├── node_modules/          # Dependencies
│   ├── package.json           # Backend dependencies
│   ├── tsconfig.json          # TypeScript config
│   ├── jest.config.js         # Jest test runner config
│   └── .env.example           # Environment template
│
├── frontend/                   # Next.js frontend application
│   ├── pages/                 # Next.js file-based routing
│   │   ├── index.tsx          # Landing page
│   │   ├── auth/              # Login, register, MFA pages
│   │   └── dashboard/         # Protected routes (email, calendar, contacts, AI)
│   ├── src/                   # Source code (alternate structure, minimal)
│   ├── components/            # React components by domain
│   │   ├── email/            # Email list, compose, detail components
│   │   ├── calendar/         # Calendar views
│   │   ├── contacts/         # Contact management
│   │   ├── ai/               # AI briefing, smart reply components
│   │   ├── dashboard/        # Dashboard grid & widgets
│   │   ├── layout/           # Layout components (sidebar, header)
│   │   ├── settings/         # Settings pages
│   │   ├── mfa/              # MFA components
│   │   ├── common/           # Shared components (buttons, modals, etc.)
│   │   ├── ui/               # Radix UI + MUI base components
│   │   └── icons/            # Custom icon components
│   ├── hooks/                 # React hooks organized by concern
│   │   ├── queries/          # TanStack Query hooks (useEmails, useContacts, etc.)
│   │   ├── mutations/        # TanStack Query mutations (not used, use queries)
│   │   ├── ai/               # AI-specific hooks
│   │   └── *.ts              # Other custom hooks
│   ├── lib/                   # Utility libraries
│   │   ├── api/              # API client modules (emailsApi, contactsApi, etc.)
│   │   ├── context/          # React contexts (AuthContext)
│   │   ├── hooks/            # Core hooks (useAuth, useQuery wrapper)
│   │   ├── dashboard/        # Dashboard utility functions
│   │   ├── utils/            # Formatting, parsing utilities
│   │   └── query-client.ts   # TanStack Query client setup
│   ├── stores/                # Zustand state stores
│   │   ├── auth-store.ts     # Auth token + user state
│   │   ├── email-ui-store.ts # Email list UI state (selected, expanded)
│   │   ├── dashboard-store.ts # Dashboard grid state
│   │   ├── folders-store.ts  # Folder tree state
│   │   └── *.ts              # Domain-specific stores
│   ├── locales/               # i18n translations
│   │   ├── en.ts             # English translations
│   │   ├── it.ts             # Italian translations
│   │   └── index.ts          # Type definitions for keys
│   ├── theme/                 # Material UI theme configuration
│   │   └── appTheme.ts       # Light + dark theme definitions
│   ├── styles/                # Global CSS
│   │   └── globals.css       # Tailwind directives + resets
│   ├── public/                # Static assets (logos, icons)
│   ├── config/                # Next.js config files
│   ├── e2e/                   # Playwright end-to-end tests
│   ├── types/                 # TypeScript type definitions
│   ├── node_modules/          # Dependencies
│   ├── .next/                 # Build output (generated)
│   ├── package.json           # Frontend dependencies
│   ├── tsconfig.json          # TypeScript config
│   ├── next.config.js         # Next.js configuration
│   └── jest.config.js         # Jest test runner config
│
├── database/                   # Database migrations & scripts
│   ├── seeds/                # Seeding scripts
│   └── migrations/           # Prisma migrations (auto-generated)
│
├── docs/                       # Project documentation
│   ├── EMAIL_MODULE_ROADMAP.md
│   ├── EMAIL_CONSOLIDATION_*.md
│   ├── PROVIDER_INTEGRATION_GUIDE.md
│   └── *.md                   # Other implementation guides
│
├── .planning/                  # GSD planning outputs
│   ├── codebase/             # Generated analysis documents (THIS DIRECTORY)
│   ├── phases/               # Phase implementation plans
│   └── checkpoints/          # Completion tracking
│
├── .github/                    # GitHub Actions workflows
│   └── workflows/            # CI/CD pipeline definitions
│
├── nginx/                      # Nginx reverse proxy configuration (production)
│
├── coordination/               # Claude Flow coordination files
├── .swarm/                     # Swarm orchestration metadata
├── .claude/                    # Claude Code agent definitions
│
├── .env.example               # Environment template for both services
├── CLAUDE.md                  # Code conventions and policies
├── README.md                  # Project overview
├── docker-compose.yml         # Docker services (PostgreSQL, Redis)
└── package.json               # Root workspace package.json
```

## Directory Purposes

**Backend Modules (`backend/src/modules/`):**

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `auth/` | Authentication & MFA | `auth.service.ts`, `jwt.strategy.ts`, `totp.service.ts`, `webauthn.service.ts` |
| `email/` | Email CRUD, templates, signatures | `email.service.ts`, `emails.service.ts`, `email-send.service.ts`, `attachment-storage.service.ts` |
| `email-sync/` | Provider sync (Gmail, Microsoft, IMAP) | `google-sync.service.ts`, `microsoft-sync.service.ts`, `sync-scheduler.service.ts`, `drivers/` |
| `ai/` | LLM integration, embeddings, RAG | `mistral.service.ts`, `embeddings.service.ts`, `knowledge-base.service.ts`, `voltagent/` |
| `calendar/` | Calendar events, ICS parsing | `calendar.service.ts`, `ics-generator.service.ts`, `ics-parser.service.ts` |
| `contacts/` | Contact management, CRM | `contacts.service.ts`, `contact-embedding.queue.ts` |
| `providers/` | OAuth config, token management | `providers.service.ts`, `provider-config.service.ts` |
| `tenants/` | Multi-tenancy isolation | `tenants.service.ts` |
| `users/` | User management, preferences | `users.service.ts`, `user-preferences.service.ts` |
| `labels/` | Email labels/tags | `labels.service.ts` |
| `compliance/` | GDPR, audit logs | `compliance.service.ts`, `audit.service.ts` |
| `subscription/` | Billing, quotas | `subscription.service.ts` (uses Autumn.js) |
| `health/` | Health checks | `health.service.ts` |
| `realtime/` | WebSocket events | `realtime.gateway.ts` |

**Common Services (`backend/src/common/`):**

| Directory | Purpose | Key Services |
|-----------|---------|---------------|
| `config/` | Config loaders | `configuration.ts`, `ai.config.ts`, `env.validation.ts` |
| `services/` | Shared utilities | `redis-lock.service.ts`, `retry.service.ts`, `cache.module.ts`, `scheduled-jobs.module.ts` |
| `filters/` | Exception handling | `http-exception.filter.ts`, `all-exceptions.filter.ts` |
| `guards/` | Authentication/authorization | `jwt-auth.guard.ts`, `tenant.guard.ts`, `roles.guard.ts` |
| `interceptors/` | Request/response transformation | `response-time.interceptor.ts` |
| `middleware/` | Express middleware | `request-id.middleware.ts` |
| `decorators/` | Custom NestJS decorators | `@CurrentUser`, `@Tenant` |
| `dto/` | Shared data transfer objects | Common DTOs used across modules |
| `types/` | Global TypeScript types | `request.types.ts`, `index.ts` |
| `utils/` | Helper functions | `format.utils.ts`, `error.utils.ts` |

**Frontend Hooks (`frontend/hooks/queries/`):**

| Hook | Purpose | Returns |
|------|---------|---------|
| `use-emails.ts` | Email list, detail, operations | `{ data: Email[], isLoading, error }` |
| `use-contacts.ts` | Contact CRUD, search | `{ data: Contact[], isLoading }` |
| `use-calendar.ts` | Calendar events | `{ data: CalendarEvent[], isLoading }` |
| `use-dashboard.ts` | Dashboard data (briefing, stats) | `{ briefing, stats, isLoading }` |
| `use-follow-ups.ts` | Follow-up emails | `{ data: FollowUp[], isLoading }` |
| `use-memories.ts` | AI memory entries | `{ data: Memory[], isLoading }` |
| `use-billing.ts` | Subscription, usage | `{ plan, usage, isLoading }` |
| `use-settings.ts` | User preferences | `{ preferences, isLoading }` |
| `*-keys.ts` | Query key factories | Query key definitions for caching |

**Frontend Components (`frontend/components/`):**

| Folder | Purpose | Example Components |
|--------|---------|-------------------|
| `email/` | Email-related UI | `EmailList.tsx`, `EmailDetail.tsx`, `EmailCompose.tsx`, `AttachmentList.tsx` |
| `calendar/` | Calendar UI | `CalendarView.tsx`, `EventModal.tsx` |
| `contacts/` | Contact UI | `ContactList.tsx`, `ContactCard.tsx`, `ContactForm.tsx` |
| `ai/` | AI features | `DailyBriefing.tsx`, `SmartReply.tsx`, `FollowUpWidget.tsx` |
| `dashboard/` | Dashboard grid | `DashboardGrid.tsx`, `WidgetCard.tsx`, `StatsPanel.tsx` |
| `layout/` | App structure | `Sidebar.tsx`, `Header.tsx`, `Layout.tsx`, `CommandPalette.tsx` |
| `settings/` | Settings pages | `SettingsGeneral.tsx`, `SettingsNotifications.tsx` |
| `common/` | Reusable UI | `Modal.tsx`, `Dropdown.tsx`, `LoadingSpinner.tsx` |
| `ui/` | Primitive components | `Button.tsx`, `Input.tsx`, `Card.tsx`, `Dialog.tsx` (Radix UI wrappers) |

## Key File Locations

**Entry Points:**
- `backend/src/main.ts`: Backend HTTP server bootstrap (NestJS)
- `frontend/pages/_app.tsx`: Frontend root component (Next.js providers)
- `frontend/pages/_document.tsx`: HTML template (Next.js)
- `frontend/pages/index.tsx`: Landing page (public)
- `frontend/pages/dashboard/index.tsx`: Dashboard home (protected)

**Configuration:**
- `backend/.env`: Backend environment variables (API port, database URL, Redis, secrets)
- `frontend/.env.local`: Frontend environment variables (API URL)
- `backend/src/config/configuration.ts`: Unified config loader
- `backend/src/config/ai.config.ts`: AI service configuration (Mistral, Anthropic)
- `backend/src/config/logger.config.ts`: Pino logger configuration
- `frontend/lib/query-client.ts`: TanStack Query client configuration
- `frontend/theme/appTheme.ts`: Material UI theme (light/dark)

**Core Logic:**

**Backend Services:**
- Email operations: `backend/src/modules/email/services/email*.service.ts`
- Email sync: `backend/src/modules/email-sync/services/*-sync.service.ts`
- AI: `backend/src/modules/ai/services/mistral.service.ts`, `embeddings.service.ts`
- Queue: `backend/src/modules/email-sync/services/*-queue.service.ts`
- Auth: `backend/src/modules/auth/services/auth.service.ts`

**Frontend Services:**
- API clients: `frontend/lib/api/*.ts` (emailsApi, contactsApi, aiApi, etc.)
- Query hooks: `frontend/hooks/queries/use-*.ts` with queryOptions pattern
- Stores: `frontend/stores/*.ts` (Zustand state)
- Context: `frontend/lib/context/auth-context.tsx`

**Testing:**
- Backend unit tests: `backend/src/**/*.spec.ts`
- Backend E2E tests: `backend/test/**/*.e2e-spec.ts`
- Frontend unit tests: `frontend/**/*.test.ts` or `frontend/**/*.test.tsx`
- Frontend E2E tests: `frontend/e2e/**/*.spec.ts` (Playwright)
- Configs: `backend/jest.config.js`, `frontend/jest.config.js`, `frontend/playwright.config.ts`

## Naming Conventions

**Files:**

| Pattern | Example | Usage |
|---------|---------|-------|
| `*.service.ts` | `email.service.ts` | NestJS services (business logic) |
| `*.controller.ts` | `emails.controller.ts` | NestJS controllers (HTTP routes) |
| `*.module.ts` | `email.module.ts` | NestJS modules (feature grouping) |
| `*.guard.ts` | `jwt-auth.guard.ts` | NestJS route guards (auth checks) |
| `*.filter.ts` | `http-exception.filter.ts` | NestJS exception filters |
| `*.interceptor.ts` | `response-time.interceptor.ts` | NestJS interceptors (middleware) |
| `*.strategy.ts` | `jwt.strategy.ts` | Passport strategies |
| `*.dto.ts` | `send-email.dto.ts` | Data transfer objects (request validation) |
| `*.worker.ts` | `sync.worker.ts` | BullMQ job processors |
| `*-keys.ts` | `email-keys.ts` | TanStack Query key factories |
| `*-api.ts` or `index.ts` | `emails.ts` in `lib/api/` | API client modules |
| `use-*.ts` | `use-emails.ts` | React hooks (custom + TanStack) |
| `*-store.ts` | `email-ui-store.ts` | Zustand state stores |
| `*.test.ts` or `*.spec.ts` | `email.service.spec.ts` | Unit tests |
| `*.e2e-spec.ts` | `auth.e2e-spec.ts` | E2E tests |
| `*.tsx` | `EmailList.tsx` | React components |
| `index.ts` | `hooks/queries/index.ts` | Barrel exports (re-export all from folder) |

**Directories:**

| Pattern | Example | Purpose |
|---------|---------|---------|
| `modules/[feature]` | `modules/email` | Feature-based module grouping (NestJS) |
| `services/` | `email/services/` | Service implementations |
| `controllers/` | `email/controllers/` | HTTP endpoint definitions |
| `guards/` | `auth/guards/` | Route protection decorators |
| `strategies/` | `auth/strategies/` | Passport auth strategies |
| `dto/` | `email/dto/` | Request/response DTOs |
| `common/` | `backend/src/common/` | Shared cross-module code |
| `components/[domain]/` | `components/email/` | Components grouped by feature domain |
| `hooks/[category]/` | `hooks/queries/` | Hooks grouped by category |
| `lib/[category]/` | `lib/api/` | Utility libraries |
| `pages/[route]/` | `pages/dashboard/email/` | Next.js file-based routing |

## Where to Add New Code

**New Feature (Complete Domain):**

1. **Backend:**
   - Create module: `backend/src/modules/[feature]/[feature].module.ts`
   - Create service: `backend/src/modules/[feature]/services/[feature].service.ts`
   - Create controller: `backend/src/modules/[feature]/controllers/[feature].controller.ts`
   - Create DTOs: `backend/src/modules/[feature]/dto/create-[feature].dto.ts`
   - Register in `AppModule` imports
   - Add routes to controller with @Controller, @Get, @Post decorators

2. **Frontend:**
   - Create components: `frontend/components/[feature]/[Feature].tsx`
   - Create API module: `frontend/lib/api/[feature].ts`
   - Create query hooks: `frontend/hooks/queries/use-[feature].ts`
   - Create query keys: `frontend/hooks/queries/[feature]-keys.ts`
   - Create page: `frontend/pages/dashboard/[feature].tsx`
   - Add i18n: Update `frontend/locales/{en,it}.ts`
   - Add Zustand store if needed: `frontend/stores/[feature]-store.ts`

3. **Database:**
   - Update `backend/prisma/schema.prisma` with new model
   - Run `npx prisma migrate dev --name add_[feature]`
   - Update seed script if needed: `database/seeds/seed.ts`

**New Component/Module (Reusable):**

- **Backend Service:**
  - File: `backend/src/modules/[feature]/services/[feature].service.ts`
  - Must be under 500 lines
  - Inject dependencies via constructor
  - Export via module's `exports` array

- **Frontend Component:**
  - File: `frontend/components/[domain]/[Component].tsx`
  - Must be under 500 lines
  - Use TanStack Query hooks, NOT direct API calls
  - Use Zustand stores for UI state
  - Prop types in separate interface
  - Export from barrel: `frontend/components/[domain]/index.ts`

- **React Hook:**
  - File: `frontend/hooks/[category]/use-[feature].ts`
  - Must include JSDoc comment
  - Return typed object with `data`, `isLoading`, `error`
  - For queries: Use `queryOptions()` pattern with cache config

**Utilities/Helpers:**

- **Backend:**
  - Location: `backend/src/common/utils/[feature].utils.ts`
  - Must be pure functions (no dependencies)
  - Export from `backend/src/common/utils/index.ts`

- **Frontend:**
  - Location: `frontend/lib/utils/[feature].ts`
  - Must be pure functions
  - Export from `frontend/lib/utils/index.ts`

**Tests:**

- **Backend Unit Tests:**
  - Collocate with source: `service.spec.ts` next to `service.ts`
  - Use Jest + `@nestjs/testing` for module mocking
  - Mock external dependencies

- **Backend E2E Tests:**
  - Location: `backend/test/[feature].e2e-spec.ts`
  - Test full API flow (controller → service → database)
  - Use actual database via `beforeEach` setup

- **Frontend Unit Tests:**
  - Collocate with source: `Component.test.tsx` next to `Component.tsx`
  - Use Jest + React Testing Library
  - Mock API calls with MSW (Mock Service Worker)

- **Frontend E2E Tests:**
  - Location: `frontend/e2e/[feature].spec.ts`
  - Use Playwright for browser automation
  - Test user workflows end-to-end

**Database Migrations:**

- After schema change: `npx prisma migrate dev --name [descriptive_name]`
- Migration files auto-generated in `backend/prisma/migrations/[timestamp]_[name]/migration.sql`
- Review migration safety (no data loss)
- Deploy: `npx prisma migrate deploy` (production)

## Special Directories

**`backend/prisma/`:**
- Purpose: Database schema & migrations
- Generated: `schema.prisma` hand-written, migrations auto-generated
- Committed: YES (to version control for deployment)

**`backend/dist/`:**
- Purpose: Compiled TypeScript output
- Generated: YES (by `npm run build`)
- Committed: NO (.gitignored)

**`frontend/.next/`:**
- Purpose: Next.js build output
- Generated: YES (by `npm run build`)
- Committed: NO (.gitignored)

**`frontend/node_modules/`:**
- Purpose: Installed dependencies
- Generated: YES (by `npm install`)
- Committed: NO (.gitignored)

**`database/migrations/`:**
- Purpose: Auto-generated Prisma migration files
- Generated: YES (by `npx prisma migrate dev`)
- Committed: YES (required for deployment)

**`.planning/`:**
- Purpose: GSD (Goal, Specification, Design) planning outputs
- Generated: YES (by Claude Code mapping & planning)
- Committed: YES (tracks planning progress)
- Use for: Phase implementation plans, architecture decisions

**`.github/workflows/`:**
- Purpose: GitHub Actions CI/CD pipelines
- Generated: NO (hand-written)
- Committed: YES (automation)
- Triggers: Push to main, PR creation

---

*Structure analysis: 2026-01-31*
