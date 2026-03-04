# External Integrations

**Analysis Date:** 2026-01-31

## APIs & External Services

**Email Providers:**
- **Gmail (Google)**
  - API: Google Gmail API, Google Calendar API, Google Contacts API
  - SDK: `googleapis` v170.1.0, `google-auth-library` v10.5.0
  - Auth: OAuth 2.0
  - Env vars: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  - Capabilities: Email sync (IMAP), calendar sync, contact sync, push notifications via Pub/Sub
  - Configuration: `backend/src/modules/providers/services/google-oauth.service.ts`

- **Microsoft Outlook (Azure AD)**
  - API: Microsoft Graph API
  - SDK: `@microsoft/microsoft-graph-client` v3.0.7, `@azure/msal-node` v5.0.2
  - Auth: OAuth 2.0 + MSAL
  - Env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI`
  - Capabilities: Email sync (Graph API), calendar sync, contact sync, push notifications via webhooks
  - Configuration: `backend/src/modules/providers/services/microsoft-oauth.service.ts`

- **Generic IMAP/CalDAV**
  - Protocols: IMAP (email), CalDAV (calendar), CardDAV (contacts)
  - SDK: `imapflow` v1.2.6 (IMAP), `tsdav` v2.1.6 (CalDAV/CardDAV)
  - Auth: Basic auth (username/password)
  - Configuration: `backend/src/modules/providers/services/imap.service.ts`, `caldav.service.ts`
  - Supported providers: Yahoo Mail, Apple iCloud, custom corporate servers

**AI & LLM Providers:**
- **Mistral AI** - Primary LLM provider
  - API: Mistral API v1
  - SDK: `@mistralai/mistralai` v1.13.0, `@ai-sdk/mistral` v3.0.12
  - Auth: API key
  - Env vars: `MISTRAL_API_KEY`, `MISTRAL_API_BASE_URL`
  - Models:
    - `ministral-3b` - Intent classification ($0.04/M)
    - `mistral-small-3-1-2503-latest` - Fast orchestration + tool calls ($0.03/M)
    - `mistral-large-3-2512-latest` - Complex reasoning ($0.50/M)
    - `mistral-small-creative-25-12` - Email composition ($0.10/M)
    - `magistral-small-2509-latest` - Extended thinking ($0.50/M)
  - Features: Embeddings (mistral-embed), batch API for cost reduction, semantic cache
  - Configuration: `backend/src/modules/ai/voltagent/providers/mistral.provider.ts`

- **Claude (Anthropic)** - Secondary LLM
  - SDK: `@anthropic-ai/sdk` v0.71.2
  - Auth: API key
  - Env var: Referenced but integration status unclear
  - Used for: Fallback or specific tasks

- **Google Gemini** - Optional LLM
  - SDK: `@google/generative-ai` v0.24.1
  - Auth: API key
  - Used for: Fallback or specific tasks

**Embeddings:**
- **Mistral Embeddings** - Primary
  - Model: `mistral-embed` (1024 dimensions)
  - Storage: PostgreSQL with pgvector extension
  - Configuration: `backend/src/modules/ai/services/embedding/mistral-embedding.provider.ts`

**Push Notifications & Real-time:**
- **Google Cloud Pub/Sub** - Gmail push notifications
  - Env var: `GOOGLE_PUBSUB_TOPIC`
  - Format: `projects/{project-id}/topics/{topic-name}`

- **Microsoft Webhooks** - Outlook push notifications
  - Endpoints:
    - Email: `${API_PUBLIC_URL}/webhooks/microsoft/notifications`
    - Calendar: `${API_PUBLIC_URL}/webhooks/calendar/microsoft/notifications`
    - Contacts: `${API_PUBLIC_URL}/webhooks/contacts/microsoft/notifications`
  - Env vars: `MICROSOFT_EMAIL_WEBHOOK_URL`, `MICROSOFT_CALENDAR_WEBHOOK_URL`, `WEBHOOK_CLIENT_STATE`
  - Validation: HMAC signature verification

## Data Storage

**Databases:**
- **PostgreSQL 12+**
  - Connection: `DATABASE_URL` (or composed via `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
  - Client: Prisma ORM 7.3.0 with `@prisma/adapter-pg`
  - Extensions: pgvector (embeddings), UUID (IDs)
  - Connection pooling: Configurable (default: num_cpus * 2 + 1)
  - Schema: `backend/prisma/schema.prisma` (150+ models)
  - Key tables: User, Tenant, Email, Contact, CalendarEvent, Embedding, ActionQueue, etc.

**Cache & Queues:**
- **Redis 6+**
  - Connection: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
  - Client: ioredis v5.9.2, redis v5.10.0
  - Uses:
    - Session storage
    - BullMQ job queue (email sync, embeddings, AI tasks)
    - Distributed locks (email sync, folder operations)
    - Query result caching
    - Rate limiting counters
  - Separate DB: `REDIS_QUERY_CACHE_DB` for embedding cache isolation
  - Configuration: `backend/src/common/config/queue.config.ts`

**File Storage:**
- **S3-compatible (AWS S3, Cloudflare R2, MinIO)**
  - Endpoint: `S3_ENDPOINT`
  - Auth: `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - Bucket: `S3_BUCKET` (default: pmsync-attachments)
  - Region: `S3_REGION`
  - SSL: `S3_USE_SSL`
  - Path style: `S3_FORCE_PATH_STYLE` (for MinIO)
  - Use: Email attachment storage
  - Configuration: `backend/src/modules/email/services/storage.service.ts`

## Authentication & Identity

**OAuth 2.0 Providers:**
- **Google OAuth 2.0**
  - Flow: Authorization code flow
  - Scopes: Gmail API, Calendar API, Contacts API, Drive API
  - Redirect URI: `${API_PUBLIC_URL}/auth/gmail/callback`
  - Token storage: Database (encrypted)
  - Refresh: Automatic via Prisma ProviderConfig model

- **Microsoft OAuth 2.0 (Azure AD)**
  - Flow: Authorization code flow
  - Tenant: `MICROSOFT_TENANT_ID` (default: common for multi-tenant)
  - Scopes: Mail.Read, Mail.Send, Calendar.ReadWrite, Contacts.Read, etc.
  - Redirect URI: `${API_PUBLIC_URL}/auth/microsoft/callback`
  - Token storage: Database (encrypted)
  - Refresh: Automatic via Prisma ProviderConfig model

**JWT & Sessions:**
- **JWT (JSON Web Tokens)**
  - Secret: `JWT_SECRET`
  - Expiration: `JWT_EXPIRATION` (default: 24h)
  - Algorithms: HS256
  - Implementation: `jsonwebtoken` v9.0.3, `@nestjs/jwt`
  - Usage: API authentication, stateless sessions

- **WebAuthn/Passkeys**
  - Library: `@simplewebauthn/server` v13.2.2, `@simplewebauthn/browser` v13.2.2
  - RP Name: `WEBAUTHN_RP_NAME` (default: PMSync)
  - RP ID: `WEBAUTHN_RP_ID` (default: localhost)
  - Origin: `WEBAUTHN_ORIGIN` (default: http://localhost:3001)
  - Storage: WebAuthnCredential model in database
  - Backup codes: MfaBackupCode model

**Multi-Factor Authentication:**
- **TOTP (Time-based One-Time Password)**
  - Standards: RFC 6238
  - Storage: MfaSecret model
  - Backup codes: MfaBackupCode model (auto-generated on setup)

**Password Security:**
- **Bcrypt hashing**
  - Library: `bcrypt` v6.0.0
  - Rounds: Standard (10)
  - Storage: User.passwordHash

**Encryption:**
- **AES Encryption**
  - Key: `AES_SECRET_KEY` (32 characters)
  - Use: Sensitive data (OAuth tokens, API keys)
  - Implementation: Custom crypto module

## Monitoring & Observability

**Error Tracking:**
- Not explicitly configured in codebase
- Standard: Would use services like Sentry, Rollbar, or DataDog

**Logs:**
- **Approach:** Structured JSON logging via Pino
- Levels: error, warn, log, debug, verbose
- Output: Console in development, file rotation in production
- Log dir: `LOG_DIR` (default: ./logs)
- Configuration: `nestjs-pino` integration with NestJS
- Modules: Email, Auth, AI, Sync operations logged separately

## CI/CD & Deployment

**Hosting Platforms:**
- **Vercel** - Next.js frontend (native support)
- **Cloud Run/AppEngine/ECS** - Backend containerization (Docker support)
- **GitHub Actions** - CI/CD workflows (inferred from monorepo structure)

**Build Process:**
- Frontend: `next build` (Next.js SSR optimization)
- Backend: `nest build` (TypeScript compilation to dist/)
- Tests: Jest (jest, ts-jest)
- Linting: ESLint with TypeScript support

## Environment Configuration

**Required env vars for startup:**
- `NODE_ENV` - Development/staging/production
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_HOST`, `REDIS_PORT` - Redis connection
- `JWT_SECRET` - JWT signing key
- `ENCRYPTION_KEY`, `ENCRYPTION_IV` - Data encryption
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` - Google OAuth
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` - Microsoft OAuth
- `MISTRAL_API_KEY` - AI API key
- `API_HOST`, `API_PORT`, `FRONTEND_URL` - URLs

**Secrets location:**
- `.env` file (local development, git-ignored)
- Environment variables (production/cloud deployments)
- SecureString in Azure KeyVault, Secrets Manager in AWS, Secret Manager in GCP
- Never committed to version control

**Rate Limiting:**
- Global: `RATE_LIMIT_MAX` (default: 100 req/window), `RATE_LIMIT_TTL_MS` (default: 60000ms)
- AI-specific: `AI_RATE_LIMIT_TENANT_RPM` (60/min), `AI_RATE_LIMIT_TENANT_TPH` (200k tokens/hour)
- Embedding: `EMBEDDING_RATE_MAX` (2 req/s), `EMBEDDING_RATE_DURATION_MS` (1000ms)

**CORS Configuration:**
- `CORS_ALLOW_ALL` - Allow all origins (not recommended)
- `CORS_ALLOWED_ORIGINS` - Whitelist (default: FRONTEND_URL)
- `CORS_ALLOWED_REGEX` - Regex patterns for dynamic origins (ngrok, Vercel preview)

## Webhooks & Callbacks

**Incoming Webhooks:**
- **Gmail Pub/Sub**
  - Topic: `GOOGLE_PUBSUB_TOPIC`
  - Trigger: New email, folder changes
  - Processing: Asynchronous via Pub/Sub subscription

- **Microsoft Graph Webhooks**
  - Email notifications: `/webhooks/microsoft/notifications`
  - Calendar notifications: `/webhooks/calendar/microsoft/notifications`
  - Contact notifications: `/webhooks/contacts/microsoft/notifications`
  - Validation: HMAC signature with `WEBHOOK_CLIENT_STATE`
  - Subscription renewal: Automatic (24-hour TTL)

**Outgoing Webhooks:**
- Generic webhook support: `WEBHOOK_SECRET` for signing
- Model: WebhookSubscription in database
- Implementation: `backend/src/modules/webhooks/`

## Third-Party Services

**Email Sending:**
- **SMTP Server** (for transactional emails)
  - Host: `SMTP_HOST` (default: localhost)
  - Port: `SMTP_PORT` (default: 1025 for MailHog dev)
  - Auth: `SMTP_USER`, `SMTP_PASSWORD`
  - From: `SMTP_FROM_EMAIL@SMTP_FROM_DOMAIN`
  - Secure: `SMTP_SECURE` (true for production)
  - Production services: SendGrid, AWS SES, Gmail
  - Client: `nodemailer` v7.0.12

**Speech & Audio:**
- **Google Cloud STT (Speech-to-Text)** - Optional
  - Key: `GOOGLE_STT_API_KEY`
  - Provider: `STT_PROVIDER` (google | whisper | none)

- **Piper TTS (Text-to-Speech)** - Optional
  - Language: `PIPER_LANGUAGE` (default: it_IT for Italian)
  - Provider: `TTS_PROVIDER` (piper | google | none)

**Billing & Subscriptions:**
- **Autumn** - Billing platform
  - Key: `AUTUMN_SECRET_KEY`
  - Webhook: `AUTUMN_WEBHOOK_SECRET`
  - Model: Subscription model in database

**CDN & Security:**
- **Cloudflare**
  - SDK: `cloudflare` v5.2.0
  - Uses: DNS, DDoS protection, WAF, caching
  - Production: Recommended for static assets

---

*Integration audit: 2026-01-31*
