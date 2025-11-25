# MailAgent - AI-Powered Multi-Tenant Email Assistant

![Backend](https://img.shields.io/badge/Backend-100%25-success?style=flat-square)
![Frontend](https://img.shields.io/badge/Frontend-98%25-success?style=flat-square)
![Testing](https://img.shields.io/badge/Testing-17.45%25-orange?style=flat-square)
![Version](https://img.shields.io/badge/Version-2.4.0-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

MailAgent è una piattaforma full-stack completa e moderna per la gestione intelligente della posta elettronica con supporto IA, integrazione multi-provider e architettura multi-tenant enterprise-grade.

## 🎉 Recent Updates (November 2025)

### ✅ Latest Features Implemented (Week of Nov 25)

- **✨ Full Bidirectional Sync** - Changes in PMSync sync back to Google/Microsoft ✅ NEW
  - **Calendar**: Create, Update, Delete events → syncs to Google Calendar & Microsoft Outlook
  - **Contacts**: Create, Update, Delete contacts → syncs to Google Contacts & Microsoft People
  - Auto-sync on page load for Calendar and Contacts (fetches latest from providers)
  - Tested and verified on real Google and Microsoft accounts
- **✨ Thread Display Improvements** - Enhanced email reading experience ✅ NEW
  - Auto-expand unread emails + last email in thread (like Gmail/Outlook)
  - Unread message highlighting with left border accent
  - "Collapse read" button to quickly hide already-read messages
  - Email links now open in new browser tab (security: `rel="noopener noreferrer"`)
- **✨ Locale-aware Calendar** - Month names display in correct language (EN/IT)

### ✅ Previously Implemented (Week of Nov 24)

- **✨ Calendar UI Complete** - Full-featured calendar management with FullCalendar integration ✅
  - Collapsible provider groups in sidebar showing all calendars per provider
  - Color picker with database persistence for calendar customization
  - Toggle calendar visibility for filtering events
  - Real-time WebSocket updates via `calendar:list_update` events
  - Event creation dialog with calendar selection dropdown
  - Day/Week/Month/List views with locale support (English + Italian)
  - Backend API: `GET /calendar/calendars`, `PATCH /calendar/calendars/:providerId/:calendarId`
- **✨ Contacts UI Complete** - Full-featured contacts management interface with provider icons ✅
  - Fixed contact list flickering and infinite re-render issues
  - Complete Italian + English translations for all contact fields
  - Google and Microsoft provider icons with circular badges (matching email list style)
  - Removed placeholder buttons, streamlined UI with only functional actions
  - Search debouncing (300ms) for improved performance
  - Infinite scroll with IntersectionObserver for large contact lists
- **✨ Email Labels System Complete** - Advanced email categorization and filtering ✅
  - Custom label creation and management
  - Multi-label support for emails
  - Label-based filtering and search
  - Gmail labels sync integration

### ✅ Previously Implemented (Week of Nov 18-20)

- **✨ IMAP Write Operations** - Complete bidirectional sync for IMAP providers (mark read/unread, star, delete, move)
- **✨ Backend Delivery Documentation** - Comprehensive 600+ line delivery document covering all features, architecture, and deployment
- **✨ Test Infrastructure Improvements** - Increased test coverage from 12% to 17.45% (+45%), fixed Jest ESM issues
- **Contacts Sync Worker System** - Complete BullMQ integration for Google and Microsoft contacts synchronization with priority queues
- **Calendar Event Attachments** - Full sync support for Google Drive and OneDrive file references
- **Gmail & Microsoft Attachment Sync** - Complete S3/MinIO storage integration with automatic download
- **AI Email Insights Enhanced** - Summarization, smart replies, and auto-categorization with PDF/text attachment indexing
- **Security Audit Completed** - Comprehensive tenant isolation review with critical fixes applied
- **AI Embeddings Optimization** - Query caching with Redis (expected 50-70% API cost reduction on repeated queries), PDF/text attachment content extraction
- **Dead Letter Queue System** - Automatic retry with exponential backoff for failed sync jobs

### 🔒 Security Improvements
- Fixed critical tenant isolation vulnerabilities in retention service
- Enhanced Redis operations (KEYS → SCAN for production safety)
- Implemented CTE-based tenant filtering in vector queries
- Strengthened CSRF protection with crypto.randomBytes (128-bit entropy)

## ✨ Features

### 🚀 Core Features (Production Ready)

- ✅ **Multi-Tenant Architecture**: Complete data isolation with enterprise-grade security
- ✅ **Email Management UI**: Full-featured viewer, composer (TipTap), threading, folders, search, labels
- ✅ **Email Sync (Bidirectional)**: Gmail API, Microsoft Graph, IMAP with auto-refresh token ✨ **100% COMPLETE**
  - ✅ Gmail: Full bidirectional sync (read/write operations)
  - ✅ Microsoft: Full bidirectional sync (read/write operations)
  - ✅ IMAP: **NEW** Full bidirectional sync with write operations (mark read, star, delete, move)
- ✅ **Attachment Handling**: Complete multi-provider sync with S3/MinIO storage
- ✅ **Email Labels & Categorization**: Advanced filtering, custom labels, and smart categorization
- ✅ **AI Email Insights**: Email summarization, smart replies, auto-categorization
- ✅ **AI Assistant**: Chat with Mistral AI and RAG (Retrieval-Augmented Generation)
- ✅ **Knowledge Base**: Semantic search with pgvector embeddings + PDF/text content extraction
- ✅ **Calendar Integration (Complete)**: Full bidirectional sync - Create/Update/Delete events sync to Google Calendar & Microsoft Outlook
- ✅ **Contacts Management (Complete)**: Full bidirectional sync - Create/Update/Delete contacts sync to Google Contacts & Microsoft People
- ✅ **Advanced Authentication**: Email/Password + OTP/MFA mandatory
- ✅ **Password Recovery**: Secure reset with temporary tokens
- ✅ **GDPR Compliance**: AES-256 encryption, audit log, right to be forgotten
- ✅ **Material Design 3**: Modern, responsive UI with dark/light mode
- ✅ **Docker**: Complete containerization with orchestration

### 🚧 In Progress

- ⏳ **AI Features**:
  - Daily Reports: AI-generated activity summaries
  - Follow-up Alerts: Automatic detection of emails needing response
  - Advanced Email Insights: Sentiment analysis, priority scoring

### 💡 Planned

- 💡 **Voice Support**: STT (Speech-to-Text) and TTS (Text-to-Speech)
- 💡 **Mobile Apps**: React Native iOS/Android applications
- 💡 **Advanced Analytics**: Email patterns, response time tracking

## Architettura

```text
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│         React + TailwindCSS + ShadCN UI + Next.js            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                     Nginx (Reverse Proxy)                    │
│                  (HTTPS, Rate Limiting)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
┌───▼────────┐  ┌────────▼──────────┐  ┌────────▼──────┐
│   Backend   │  │   AI Worker      │  │  Storage      │
│  (NestJS)   │  │  (Mistral API)   │  │  (MinIO/S3)   │
└───┬────────┘  └────────┬──────────┘  └────────┬──────┘
    │                    │                      │
    └────────────────────┼──────────────────────┘
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
 ┌────▼─────┐  ┌────────▼─────┐  ┌────────▼──────┐
 │PostgreSQL│  │    Redis     │  │  pgvector    │
 │          │  │  (Cache +    │  │  (Embeddings)│
 │  (Data)  │  │   Queues)    │  │              │
 └──────────┘  └──────────────┘  └───────────────┘
```

## Technology Stack

### Backend (100% Complete ✅ PRODUCTION READY)
- **Framework**: NestJS 11.1.9 (TypeScript)
- **Database**: PostgreSQL 16+ with pgvector for RAG
- **ORM**: Prisma 6.19.0
- **Cache**: Redis 7.x with query embedding cache
- **Job Queue**: BullMQ 5.63.2 (34 concurrent workers, DLQ system)
- **AI**: Mistral AI 1.10.0 (mistral-large-latest + mistral-embed)
- **Email**: nodemailer, ImapFlow 1.1.1, googleapis 166.0.0, microsoft-graph-client 3.0.7
- **Storage**: MinIO/S3 (S3-compatible) for attachments
- **Auth**: JWT, bcrypt, OTP/MFA
- **Encryption**: AES-256-CBC for tokens and passwords
- **Text Extraction**: pdf-parse, Mozilla Readability
- **Test Coverage**: 17.45% (282 passing tests, roadmap to 70%+)
- **Voice**: Vosk (STT), Piper (TTS) - Planned

### Frontend (97% Complete ✅)
- **Framework**: Next.js 14 with React 18
- **Styling**: TailwindCSS + Material UI (Material Design 3)
- **Rich Text Editor**: TipTap
- **State Management**: Zustand + React Context
- **HTTP Client**: Axios
- **Icons**: Lucide React + Material Icons + Custom SVG provider icons
- **i18n**: Complete English + Italian translations with locale type safety
- **Features**: Email (complete), Contacts (complete), Labels (complete), Calendar (complete)

### DevOps
- **Containerization**: Docker + docker-compose
- **Reverse Proxy**: Nginx with HTTPS/SSL
- **Database Migration**: Prisma Migrate
- **Monitoring**: Prometheus + Grafana

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (if running locally without Docker)
- PostgreSQL 15+ (if running locally)
- Redis (if running locally)

### Installation with Docker

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mailagent
   ```

2. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configurations
   ```

3. **Generate SSL certificates (development)**
   ```bash
   mkdir -p nginx/certs
   openssl req -x509 -newkey rsa:4096 -keyout nginx/certs/key.pem -out nginx/certs/cert.pem -days 365 -nodes
   ```

4. **Start all services**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   docker-compose exec backend npx prisma migrate deploy
   ```

6. **Seed the database**
   ```bash
   docker-compose exec backend npx prisma db seed
   ```

7. **Access the application**
   - Frontend: https://localhost
   - API: https://localhost/api
   - API Docs: https://localhost/api/docs
   - Demo Credentials:
     - Admin: `admin@mailagent.local` | password: `TestPassword123!`
     - User: `test@mailagent.local` | password: `UserPassword123!`

### Local Development (without Docker)

1. **Backend setup**
   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run start:dev
   ```

2. **Frontend setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Database setup**
   ```bash
   # PostgreSQL and Redis must be running
   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password pgvector/pgvector:pg15-latest
   docker run -d -p 6379:6379 redis:7-alpine
   docker run -d -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
   ```

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - Login
- `POST /auth/send-otp` - Send OTP code
- `POST /auth/verify-otp` - Verify OTP
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user profile

### Emails
- `GET /emails` - List emails with filtering
- `GET /emails/:id` - Get single email with attachments
- `GET /emails/:id/attachments` - List email attachments
- `GET /emails/:id/attachments/:attachmentId` - Get attachment metadata
- `POST /emails/send` - Send new email
- `POST /emails/:id/reply` - Reply to email
- `PATCH /emails/:id` - Update email (read status, folder, etc.)
- `DELETE /emails/:id` - Delete email

### Calendar
- `GET /calendar/calendars` - List all calendars from all providers
- `POST /calendar/calendars` - Create a new calendar
- `PATCH /calendar/calendars/:providerId/:calendarId` - Update calendar preferences (name, color)
- `GET /calendar/events` - List calendar events
- `GET /calendar/events/:id` - Get single event
- `GET /calendar/events/:eventId/attachments` - List event attachments
- `POST /calendar/events` - Create event
- `PATCH /calendar/events/:id` - Update event
- `DELETE /calendar/events/:id` - Delete event
- `POST /calendar/sync/:providerId` - Trigger manual sync for provider

### Contacts (Bidirectional Sync)

- `GET /contacts` - List contacts
- `GET /contacts/:id` - Get single contact
- `POST /contacts` - Create contact (syncs to provider)
- `PATCH /contacts/:id` - Update contact (syncs to provider)
- `DELETE /contacts/:id` - Delete contact (syncs to provider)
- `POST /contacts/sync/:providerId` - Sync contacts from provider
- `POST /contacts/sync-all` - Sync all providers

### AI Chat
- `POST /ai/chat` - Send message to AI
- `GET /ai/chat/sessions` - List chat sessions
- `POST /ai/chat/sessions` - Create new session
- `GET /ai/chat/sessions/:id` - Get session with history
- `DELETE /ai/chat/sessions/:id` - Delete session
- `POST /ai/agent` - Agentic workflow with automatic persistence

### AI Knowledge Base
- `POST /ai/knowledge-base/search` - Semantic search across emails and attachments
- `POST /ai/knowledge-base/emails/backfill` - Generate embeddings for existing emails
- `GET /ai/knowledge-base/embeddings` - Inspect stored embeddings
- `DELETE /ai/knowledge-base/embeddings/:id` - Remove embedding
- `DELETE /ai/knowledge-base/embeddings/email/:emailId` - Purge email embeddings

### Providers & Sync
- `POST /providers/google/auth-url` - Get Google OAuth URL
- `POST /providers/google/connect` - Connect Google account
- `POST /providers/microsoft/auth-url` - Get Microsoft OAuth URL
- `POST /providers/microsoft/connect` - Connect Microsoft account
- `POST /providers/generic/connect` - Connect IMAP/SMTP provider
- `GET /providers` - List connected providers
- `GET /providers/:id/test/*` - Diagnostic APIs

### Health & Monitoring
- `GET /health` - System health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe
- `GET /health/queues` - Email sync queue metrics
- `GET /health/metrics` - Prometheus metrics

## Security Features

- ✅ HTTPS/TLS with SSL certificates
- ✅ JWT authentication with automatic rotation
- ✅ OTP/MFA mandatory for every login
- ✅ Bcrypt password hashing (cost factor 12)
- ✅ AES-256-CBC encryption for sensitive data
- ✅ CORS protection with domain whitelist
- ✅ Helmet.js security headers
- ✅ Rate limiting on auth endpoints
- ✅ Multi-tenant data isolation with CTE queries
- ✅ Comprehensive audit logging
- ✅ GDPR compliance (right to be forgotten)
- ✅ XSS protection with DOMPurify
- ✅ CSRF protection with cryptographically secure tokens
- ✅ Redis SCAN for production-safe operations

## 📚 Complete Documentation

### 📋 Quick Links
- **[Backend Delivery](docs/BACKEND_DELIVERY.md)** - ✨ NEW: Complete backend delivery documentation (600+ lines)
- **[Test Coverage Report](docs/development/TEST_COVERAGE_REPORT.md)** - ✨ NEW: Comprehensive test status & roadmap
- **[Next Steps Analysis](docs/development/NEXT_STEPS_ANALYSIS.md)** - ✨ NEW: Prioritized development roadmap
- **[Project Status](docs/development/PROJECT_STATUS.md)** - Implementation checklist & progress
- **[Recent Updates](docs/development/recent-implementation-summary.md)** - Latest features and fixes
- **[Security Audit](docs/security/tenant-isolation-audit-2025-11-19.md)** - Comprehensive security review

### 📁 Documentation Index

#### 🚀 [Setup & Getting Started](docs/setup/)
- [OAuth Complete Guide](docs/setup/oauth-complete-guide.md) - Google & Microsoft OAuth setup
- [OAuth Vercel Deployment](docs/setup/oauth-vercel.md) - Production OAuth configuration

#### 🏗️ [Architecture & Design](docs/architecture/)
- [AI Embeddings Optimization](docs/architecture/ai-embeddings-optimization.md) - Performance optimization strategies
- [Email Frontend Refactor](docs/architecture/email-frontend-refactor.md) - Frontend architecture analysis
- [Provider Pattern](backend/src/modules/providers/README.md) - Unified provider abstraction

#### 🔐 [Security](docs/security/)
- [Tenant Isolation Audit](docs/security/tenant-isolation-audit-2025-11-19.md) - Critical security findings
- [XSS Fix Guide](docs/security/xss-fix-dompurify.md) - XSS vulnerability remediation

#### 💻 [Development](docs/development/)
- [Project Status](docs/development/PROJECT_STATUS.md) - Current implementation state
- [Recent Implementation](docs/development/recent-implementation-summary.md) - Latest session summary
- [Labels Implementation Plan](docs/development/labels-implementation-plan.md) - Advanced categorization
- [Provider Migration Phase 2](docs/development/provider-migration-phase2.md) - Migration completion report
- [Folder Management Roadmap](docs/development/folder-management-roadmap.md) - Email folder features

#### 📦 [Archive](docs/archive/)
- [Implementation Analysis](docs/archive/implementation-analysis/) - Historical refactoring docs
- [Testing Reports](docs/archive/testing/) - Previous test session results

**📚 [Full Documentation Index →](docs/README.md)**

## Useful Commands

```bash
# Start development environment
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Access database
docker-compose exec postgres psql -U mailuser -d mailagent

# Run migration
docker-compose exec backend npx prisma migrate dev

# Reset database
docker-compose exec backend npx prisma migrate reset

# Build images
docker-compose build

# Restart a service
docker-compose restart backend

# Check health
curl http://localhost:3000/health

# View Prometheus metrics
curl http://localhost:3000/health/metrics
```

## Monitoring & Observability

### Prometheus & Grafana

Start monitoring stack:
```bash
docker-compose up -d prometheus grafana
```

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3002 (admin/admin)

### Available Metrics
- `email_sync_queue_completed{queue="high"}` - Completed jobs per queue
- `email_sync_queue_failed{queue="normal"}` - Failed jobs per queue
- `email_sync_queue_last_duration_ms{queue="low"}` - Last job duration
- `email_sync_queue_avg_duration_ms{queue="high"}` - Average duration

### Health Checks
```bash
$ curl http://localhost:3000/health
{
  "status": "healthy",
  "services": {
    "database": { "status": "up", "responseTime": 5 },
    "redis": { "status": "up", "responseTime": 2 },
    "mistral": { "status": "up", "responseTime": 110 },
    "emailSyncQueue": {
      "status": "up",
      "totals": { "completed": 1891, "failed": 15 }
    }
  }
}
```

## Troubleshooting

### Database Connection Error
```bash
docker-compose exec postgres psql -U mailuser -d mailagent -c "SELECT 1"
```

### Redis Connection Error
```bash
docker-compose exec redis redis-cli ping
```

### SSL Certificate Issues
```bash
rm -rf nginx/certs/*
openssl req -x509 -newkey rsa:4096 -keyout nginx/certs/key.pem -out nginx/certs/cert.pem -days 365 -nodes
docker-compose restart nginx
```

### MinIO Storage Issues

⚠️ **Development Only** - These default credentials should NEVER be used in production!

```bash
# Access MinIO console (DEVELOPMENT ONLY)
open http://localhost:9001
# Default credentials: minioadmin / minioadmin123
```

**Production Security**:
- Generate strong credentials (minimum 16 characters)
- Use IAM authentication instead of access keys
- Enable TLS/HTTPS for MinIO API
- Restrict network access to MinIO ports (9000, 9001)

## Production Deployment

For production deployment:

1. **Environment Variables**: Configure `.env.production` with secure values
2. **SSL Certificates**: Use Let's Encrypt via Certbot
3. **Database**: Use managed PostgreSQL service (AWS RDS, Google Cloud SQL)
4. **Redis**: Use managed Redis or cluster setup (AWS ElastiCache, Redis Cloud)
5. **Object Storage**: Use AWS S3, Google Cloud Storage, or managed MinIO
6. **Reverse Proxy**: Consider CloudFlare or AWS CloudFront
7. **Monitoring**: Integrate Prometheus + Grafana + AlertManager
8. **Logging**: Use ELK stack, Datadog, or similar service
9. **Email**: Use SendGrid, Mailgun, or similar service for transactional emails

## License

MIT

## Support

For issues or questions, please create an issue on GitHub.

---

**MailAgent** - Powered by AI, Designed for Privacy 🔒
