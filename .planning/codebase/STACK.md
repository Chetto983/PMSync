# Technology Stack

**Analysis Date:** 2026-01-31

## Languages

**Primary:**
- **TypeScript** 5.9.3 - Full codebase (backend, frontend, scripts)
- **JavaScript** - Configuration files, Next.js config

**Secondary:**
- **SQL** - Prisma schema and PostgreSQL queries

## Runtime

**Environment:**
- **Node.js** - Backend runtime (NestJS)
- **Next.js 16.1.4** - Frontend framework (React 19.2.3)

**Package Manager:**
- **npm** - Primary package manager
- **Lockfile:** `package-lock.json` (present)

## Frameworks

**Core Backend:**
- **NestJS 11.1.12** - Backend framework with modular architecture
  - `@nestjs/core` - DI container
  - `@nestjs/platform-express` - HTTP server
  - `@nestjs/platform-socket.io` - WebSocket support via Socket.IO
  - `@nestjs/websockets` - WebSocket decorators
  - `@nestjs/schedule` - Job scheduling
  - `@nestjs/throttler` - Rate limiting
  - `@nestjs/swagger` - API documentation

**Frontend:**
- **Next.js 16.1.4** - React SSR/SSG framework
- **React 19.2.3** - UI library
- **Material-UI (MUI) 7.3.7** - Component library
  - `@mui/material` - Core components
  - `@mui/icons-material` - Icon set
  - `@mui/system` - Styling system
- **Tailwind CSS 4.1.18** - Utility CSS framework
- **Radix UI** - Unstyled component primitives (v1.x)
  - Accordion, Avatar, Dialog, Dropdown, Popover, Tabs, Tooltip, etc.
- **Tiptap 3.17.1** - Rich text editor
- **FullCalendar 6.1.20** - Calendar widget

**Testing:**
- **Jest 30.2.0** - Unit/integration test runner (backend & frontend)
- **Playwright 1.57-1.58** - E2E testing framework
- **supertest 7.2.2** - HTTP assertion library (backend)
- **@testing-library/react 16.3.2** - React component testing
- **@testing-library/jest-dom 6.9.1** - DOM matchers

**Build/Dev:**
- **Nest CLI 11.0.16** - NestJS build tool
- **ESLint 9.39.2** - Code linting
- **Prettier 3.8.1** - Code formatting
- **Prisma 7.3.0** - ORM and migrations
- **ts-jest 29.4.6** - Jest TypeScript support
- **ts-node 10.9.2** - Direct TypeScript execution

## Key Dependencies

**Critical (Database):**
- **Prisma Client 7.3.0** - ORM with type safety
  - `@prisma/adapter-pg` - PostgreSQL adapter
  - Supports pgvector for embeddings
- **pg 8.17.2** - PostgreSQL driver
- **ioredis 5.9.2** - Redis client (caching & queues)
- **redis 5.10.0** - Alternative Redis client

**Critical (AI & LLM):**
- **ai 6.0.49/6.0.58** - Vercel AI SDK (LLM abstractions)
  - `@ai-sdk/react` - Frontend AI hooks
  - `@ai-sdk/mistral` - Mistral AI provider
- **@mistralai/mistralai 1.13.0** - Mistral direct SDK
- **@anthropic-ai/sdk 0.71.2** - Claude API client
- **@google/generative-ai 0.24.1** - Google Gemini client

**Critical (Email):**
- **imapflow 1.2.6** - IMAP email sync client
- **mailparser 3.9.1** - Email parsing
- **nodemailer 7.0.12** - SMTP sending
- **tsdav 2.1.6** - CalDAV protocol client
- **@mozilla/readability 0.6.0** - Email content extraction

**Critical (OAuth & Identity):**
- **@microsoft/microsoft-graph-client 3.0.7** - Microsoft Graph API
  - `@microsoft/microsoft-graph-types` - Type definitions
- **@azure/msal-node 5.0.2** - Microsoft authentication
- **google-auth-library 10.5.0** - Google OAuth
- **googleapis 170.1.0** - Google APIs (Gmail, Calendar, Contacts)
- **passport 0.7.0** - Authentication middleware
  - `passport-jwt` - JWT strategy
- **jsonwebtoken 9.0.3** - JWT generation/verification
- **@simplewebauthn/server 13.2.2** - WebAuthn/Passkey support
- **bcrypt 6.0.0** - Password hashing

**Critical (Queues & Scheduling):**
- **bullmq 5.67.1** - Job queue on Redis
- **@nestjs/schedule 6.1.0** - Task scheduling

**Critical (Real-time):**
- **socket.io 4.8.3** - WebSocket server
- **socket.io-client 4.8.1/4.8.3** - WebSocket client

**Infrastructure:**
- **axios 1.13.2/1.13.3** - HTTP client
- **dotenv 17.2.3** - Environment variable loading
- **helmet 8.1.0** - Security headers
- **express 5.2.1** - HTTP server (underlying NestJS)
- **cookie-parser 1.4.7** - Cookie parsing
- **class-validator 0.14.3** - DTO validation
- **class-transformer 0.5.1** - DTO transformation
- **cloudflare 5.2.0** - Cloudflare API client
- **zod 4.3.6** - Schema validation

**Logging:**
- **pino 10.3.0** - Structured JSON logging
  - `pino-http` - HTTP request logging
  - `pino-pretty` - Development pretty-printer
  - `pino-roll` - Log rotation
- **nestjs-pino 4.5.0** - Pino integration for NestJS

**NLP & Text Processing:**
- **node-nlp 5.0.0-alpha.5** - Natural language processing
- **sentiment 5.0.2** - Sentiment analysis
- **chrono-node 2.9.0** - Date/time parsing from text
- **node-ical 0.23.1** - iCalendar parsing

**Document Processing:**
- **pdf-parse 2.4.5** - PDF text extraction
- **cheerio 1.2.0** - HTML parsing (server-side)
- **jsdom 27.4.0** - DOM simulation
- **html-to-react** - HTML to JSX conversion (via cheerio)
- **he 1.2.0** - HTML entity encoding/decoding
- **marked 17.0.1** - Markdown parsing
- **dompurify 3.3.1** - HTML sanitization (client-side)

**Frontend UI:**
- **framer-motion 12.29.0** - Animation library
- **lucide-react 0.563.0** - Icon set
- **recharts 3.7.0** - Chart library
- **@xyflow/react 12.10.0** - Node/edge graph rendering
- **react-markdown 10.1.0** - Markdown rendering
- **react-grid-layout 2.2.2** - Draggable grid
- **embla-carousel-react 8.6.0** - Carousel component
- **react-dropzone 14.3.8** - File upload
- **react-timezone-select 3.2.8** - Timezone picker
- **shiki 3.21.0** - Syntax highlighting
- **streamdown 2.1.0** - Stream-friendly markdown rendering

**Frontend Data & State:**
- **@tanstack/react-query 5.90.20** - Server state management
- **zustand 5.0.10** - Client state management
- **lodash-es 4.17.23** - Utility functions

**Frontend Accessibility & DX:**
- **@radix-ui/** - Unstyled accessible components
- **react-hot-keys-hook 5.2.3** - Keyboard shortcuts
- **clsx 2.1.1** - ClassList merging
- **tailwind-merge 3.4.0** - Tailwind class merging
- **use-debounce 10.1.0** - Debounce hook
- **@tanstack/react-virtual 3.13.18** - Virtual scrolling

**Specialized:**
- **autumn-js 0.1.71** - Billing/subscription library
- **qrcode 1.5.4** - QR code generation
- **nanoid 5.1.6** - URL-safe ID generation
- **ai-elements 1.8.1** - Pre-built AI UI components
- **@assistant-ui/react 0.12.1** - Headless AI chat UI
- **@rive-app/react-webgl2 4.26.2** - Rive animations
- **tokenlens 1.3.1** - Token counting

## Configuration

**Environment:**
- `.env` - Runtime configuration (secrets, API keys, URLs)
- `.env.example` - Template for required variables
- `.env.docker` - Docker development configuration
- `.env.local` - Frontend development overrides
- `.env.production` - Production overrides

**Key Configs:**
- `API_PORT` - Backend server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD` - Redis caching
- `MISTRAL_API_KEY` - Mistral AI API credentials
- `GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET` - Google OAuth
- `MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET` - Microsoft OAuth
- `JWT_SECRET` - JWT signing key
- `ENCRYPTION_KEY/ENCRYPTION_IV` - Data encryption
- `SMTP_HOST/SMTP_PORT` - Email sending
- `S3_ENDPOINT/S3_BUCKET` - File storage (MinIO/S3)

**Build:**
- `tsconfig.json` - TypeScript compiler options (root)
- `backend/jest.config.js` - Backend test configuration
- `backend/eslint.config.js` - Backend linting rules
- `frontend/next.config.js` - Next.js configuration
- `frontend/jest.config.js` - Frontend test configuration
- `frontend/eslint.config.mjs` - Frontend linting rules
- `frontend/playwright.config.ts` - E2E test configuration
- `frontend/tailwind.config.ts` - Tailwind CSS theming
- `frontend/postcss.config.js` - PostCSS plugins
- `backend/prisma.config.ts` - Prisma configuration

## Platform Requirements

**Development:**
- **Node.js 18+** (TypeScript 5.9.3 requires Node 16+)
- **PostgreSQL 12+** - Primary database with pgvector extension
- **Redis 6+** - Caching, queues, sessions
- **npm 8+** - Package management
- **Docker & Docker Compose** - Local development with PostgreSQL, Redis, MailHog

**Production:**
- **Deployment target:** Cloud platforms (AWS, Azure, GCP, Vercel)
- **PostgreSQL managed service** - AWS RDS, Azure Database, Google Cloud SQL
- **Redis managed service** - AWS ElastiCache, Azure Redis, Google Cloud Memorystore
- **S3-compatible storage** - AWS S3, Cloudflare R2, MinIO
- **SMTP service** - SendGrid, AWS SES, Gmail
- **Load balancer** - Nginx, Traefik, Cloudflare

---

*Stack analysis: 2026-01-31*
