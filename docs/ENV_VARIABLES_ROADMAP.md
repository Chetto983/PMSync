# Environment Variables Security Audit & Roadmap

> **Date**: November 2025
> **Status**: Audit Complete - Action Required
> **Priority**: HIGH (Security Sensitive)

---

## Executive Summary

This document provides a comprehensive audit of all environment variables used in MailAgent backend, identifying security risks, configuration gaps, and recommended improvements.

### Key Findings

| Category | Status | Risk Level |
|----------|--------|------------|
| Secrets Management | ⚠️ Exposed | **CRITICAL** |
| Configuration Centralization | ✅ Redis Complete | MEDIUM |
| Validation | ✅ Production checks added | MEDIUM |
| Documentation | ⚠️ Outdated | LOW |

### Recent Fixes (November 25, 2025)

- ✅ Redis configuration fully centralized via `getRedisConnectionOptions()`
- ✅ Production safety validations added to `configuration.ts`
- ✅ Removed duplicate `GOOGLE_CLIENT_*` variables from `.env`
- ✅ Added weak password detection
- ✅ Added MinIO default credentials check
- ✅ Added DEBUG_AUTH_LOG production check

---

## 1. Security Issues (CRITICAL)

### 1.1 Exposed Secrets in `.env`

**⛔ CRITICAL**: The following secrets are exposed in plaintext:

| Variable | Risk | Recommendation |
|----------|------|----------------|
| `JWT_SECRET` | Auth bypass if leaked | Rotate immediately, use vault |
| `AES_SECRET_KEY` | Data decryption | Rotate, encrypted storage |
| `GMAIL_CLIENT_SECRET` | OAuth compromise | Rotate via Google Console |
| `GOOGLE_CLIENT_SECRET` | Duplicate of above | Remove duplicate |
| `MICROSOFT_CLIENT_SECRET` | OAuth compromise | Rotate via Azure Portal |
| `MISTRAL_API_KEY` | API abuse/billing | Rotate via Mistral |
| `DB_PASSWORD` | Database access | Use strong password |
| `S3_SECRET_KEY` | Storage access | Use IAM roles in production |

**Action Items**:
1. ❌ **NEVER commit `.env` to git** - ensure `.gitignore` includes `.env`
2. ❌ **Rotate all exposed secrets immediately** if this file was ever committed
3. ✅ Use environment-specific secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)

### 1.2 Weak Default Passwords

```env
# INSECURE - Change these:
DB_PASSWORD=mailpass          # Weak password
S3_ACCESS_KEY=minioadmin     # Default MinIO credentials
S3_SECRET_KEY=minioadmin     # Default MinIO credentials
```

### 1.3 Rate Limiting Too Permissive

```env
RATE_LIMIT_MAX=300000        # 300,000 requests - essentially disabled
RATE_LIMIT_TTL_MS=600000     # 10 minutes window
```

**Recommendation**: Production should use:
```env
RATE_LIMIT_MAX=100           # 100 requests per window
RATE_LIMIT_TTL_MS=60000      # 1 minute window
```

---

## 2. Environment Variables Inventory

### 2.1 Core Configuration (✅ Properly Handled)

| Variable | Used In | Default | Status |
|----------|---------|---------|--------|
| `NODE_ENV` | configuration.ts | `development` | ✅ |
| `LOG_LEVEL` | configuration.ts, logger.config.ts | `debug` | ✅ |
| `API_PORT` | configuration.ts | `3000` | ✅ |
| `API_HOST` | configuration.ts | `localhost` | ✅ |
| `API_PUBLIC_URL` | configuration.ts | derived | ✅ |

### 2.2 Database Configuration (✅ Properly Handled)

| Variable | Used In | Default | Status |
|----------|---------|---------|--------|
| `DB_HOST` | configuration.ts | `localhost` | ✅ |
| `DB_PORT` | configuration.ts | `5432` | ✅ |
| `DB_USER` | configuration.ts | `mailuser` | ✅ |
| `DB_PASSWORD` | configuration.ts | `mailpass` | ⚠️ Weak default |
| `DB_NAME` | configuration.ts | `mailagent` | ✅ |
| `DATABASE_URL` | Prisma | derived | ✅ |

### 2.3 Redis Configuration (⚠️ Inconsistent)

| Variable | Used In | Default | Status |
|----------|---------|---------|--------|
| `REDIS_HOST` | configuration.ts, ai.worker.ts | `localhost` | ✅ |
| `REDIS_PORT` | configuration.ts, ai.worker.ts | `6379` | ✅ |
| `REDIS_PASSWORD` | ai.worker.ts | `undefined` | ⚠️ Not in config |
| `REDIS_URL` | health.service.ts | derived | ⚠️ Not in config |

**Issue**: Redis configuration is accessed directly via `process.env` in multiple places instead of through centralized configuration.

### 2.4 Authentication & Security (✅ With Warnings)

| Variable | Used In | Default | Status |
|----------|---------|---------|--------|
| `JWT_SECRET` | auth.module.ts, jwt.strategy.ts | `secret` | ⚠️ Insecure default |
| `JWT_EXPIRATION` | configuration.ts | `24h` | ✅ |
| `OTP_EXPIRATION` | auth.service.ts | `900000` (15min) | ✅ |
| `PASSWORD_RESET_EXPIRATION` | auth.service.ts | `900000` (15min) | ✅ |
| `AES_SECRET_KEY` | configuration.ts | insecure | ⚠️ Must be 32+ chars |

### 2.5 OAuth Configuration (✅ Properly Handled)

| Variable | Used In | Required | Status |
|----------|---------|----------|--------|
| `GMAIL_CLIENT_ID` | configuration.ts | Yes | ✅ |
| `GMAIL_CLIENT_SECRET` | configuration.ts | Yes | ✅ |
| `GOOGLE_CLIENT_ID` | .env | Duplicate | ⚠️ Remove |
| `GOOGLE_CLIENT_SECRET` | .env | Duplicate | ⚠️ Remove |
| `GOOGLE_REDIRECT_URI` | configuration.ts | Yes | ✅ |
| `GOOGLE_PUBSUB_TOPIC` | Not in config | Yes | ❌ Missing |
| `MICROSOFT_CLIENT_ID` | configuration.ts | Yes | ✅ |
| `MICROSOFT_CLIENT_SECRET` | configuration.ts | Yes | ✅ |
| `MICROSOFT_REDIRECT_URI` | configuration.ts | Yes | ✅ |
| `MICROSOFT_TENANT_ID` | Not in config | Yes | ❌ Missing |

### 2.6 Webhook Configuration (❌ Not Centralized)

| Variable | Used In | Status |
|----------|---------|--------|
| `MICROSOFT_EMAIL_WEBHOOK_URL` | Direct access | ❌ Not in config |
| `MICROSOFT_CALENDAR_WEBHOOK_URL` | Direct access | ❌ Not in config |
| `WEBHOOK_CLIENT_STATE` | Direct access | ❌ Not in config |

### 2.7 Sync & Worker Configuration (❌ Not Centralized)

| Variable | Current Value | Status |
|----------|---------------|--------|
| `EMAIL_SYNC_WORKERS_ENABLED` | `true` | ❌ Not in config |
| `EMAIL_SYNC_SCHEDULER_ENABLED` | `true` | ❌ Not in config |
| `CONTACTS_SYNC_ENABLED` | `true` | ❌ Not in config |
| `CALENDAR_SYNC_ENABLED` | `true` | ❌ Not in config |
| `JOBS_ENABLED` | `true` | ❌ Not in config |
| `DEBUG_AUTH_LOG` | `true` | ⚠️ Should be false in prod |

### 2.8 Gmail Sync Configuration (❌ Not Centralized)

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `GMAIL_FULL_MAX_MESSAGES` | `200` | Max messages in full sync |
| `GMAIL_BATCH_GET_SIZE` | `100` | Batch size for fetching |
| `GMAIL_HISTORY_MAX_PAGES` | `25` | Max history pages |
| `GMAIL_RETRY_MAX_ATTEMPTS` | `3` | Retry attempts |
| `GMAIL_RETRY_429_DELAY_MS` | `2000` | Rate limit delay |
| `GMAIL_RETRY_5XX_DELAY_MS` | `2000` | Server error delay |

### 2.9 Microsoft Sync Configuration (❌ Not Centralized)

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `MS_FULL_MAX_MESSAGES` | `200` | Max messages in full sync |
| `MS_BATCH_FETCH_SIZE` | `20` | Batch size for fetching |
| `MS_RETRY_MAX_ATTEMPTS` | `3` | Retry attempts |
| `MS_RETRY_429_DELAY_MS` | `2000` | Rate limit delay |
| `MS_RETRY_5XX_DELAY_MS` | `2000` | Server error delay |

### 2.10 Queue Configuration (❌ Not Centralized)

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `QUEUE_HIGH_ATTEMPTS` | `3` | High priority retry attempts |
| `QUEUE_HIGH_BACKOFF_MS` | `5000` | Backoff delay |
| `QUEUE_HIGH_REMOVE_ON_COMPLETE_COUNT` | `50` | Cleanup count |
| `QUEUE_HIGH_REMOVE_ON_COMPLETE_AGE` | `3600` | Cleanup age (seconds) |
| `QUEUE_HIGH_REMOVE_ON_FAIL_COUNT` | `100` | Failed job cleanup |
| `QUEUE_NORMAL_ATTEMPTS` | `2` | Normal priority retries |
| `QUEUE_NORMAL_BACKOFF_MS` | `10000` | Normal backoff |
| `QUEUE_LOW_ATTEMPTS` | `1` | Low priority retries |
| `SYNC_WORKER_LOCK_MS` | `300000` | Worker lock duration |
| `SYNC_WORKER_STALLED_INTERVAL_MS` | `120000` | Stalled check interval |

### 2.11 Embedding Configuration (❌ Not Centralized)

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `EMBEDDING_CONCURRENCY` | `8` | Parallel embeddings |
| `EMBEDDING_RATE_MAX` | `25` | Rate limit max |
| `EMBEDDING_RATE_DURATION_MS` | `1000` | Rate window |
| `EMBEDDING_BULK_SIZE` | `75` | Bulk processing size |
| `EMBEDDING_FLUSH_MS` | `100` | Flush interval |
| `EMBEDDING_LOCK_MS` | `180000` | Lock duration |

### 2.12 Realtime Configuration (❌ Not Centralized)

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `REALTIME_EMAIL_BUFFER_MS` | `200` | Email event buffer |
| `REALTIME_EMAIL_BUFFER_MAX` | `500` | Max buffered emails |
| `REALTIME_SUPPRESS_MESSAGE_EVENTS` | `false` | Suppress messages |
| `REALTIME_FOLDER_BUFFER_MS` | `1000` | Folder buffer |
| `REALTIME_FOLDER_BUFFER_MAX` | `1000` | Max buffered folders |

### 2.13 S3/MinIO Storage (⚠️ Partially Handled)

| Variable | Current Value | Status |
|----------|---------------|--------|
| `STORAGE_PROVIDER` | `s3` | ❌ Not in config |
| `S3_ENDPOINT` | `http://localhost:9100` | ❌ Not in config |
| `S3_CONSOLE_URL` | `http://localhost:9101` | ❌ Not in config |
| `S3_ACCESS_KEY` | `minioadmin` | ⚠️ Insecure default |
| `S3_SECRET_KEY` | `minioadmin` | ⚠️ Insecure default |
| `S3_REGION` | `us-east-1` | ❌ Not in config |
| `S3_BUCKET` | `mailagent-attachments` | ❌ Not in config |
| `S3_FORCE_PATH_STYLE` | `true` | ❌ Not in config |

### 2.14 Feature Flags (✅ Handled in features.config.ts)

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `FEATURE_USER_LABELS` | `false` | User labels feature |
| `FEATURE_USER_LABELS_ROLLOUT` | `0` | Rollout percentage |
| `FEATURE_USER_LABELS_TENANTS` | `` | Allowed tenants |

---

## 3. Duplicate Variables (Clean Up Required)

```env
# These are duplicates - remove one set:
GMAIL_CLIENT_ID=...
GOOGLE_CLIENT_ID=...           # ← Remove (duplicate)

GMAIL_CLIENT_SECRET=...
GOOGLE_CLIENT_SECRET=...       # ← Remove (duplicate)
```

---

## 4. Recommended `.env.example` Template

```env
# ===== ENVIRONMENT =====
NODE_ENV=development
LOG_LEVEL=debug
LOG_DIR=./logs
LOG_REQUESTS=false

# ===== SERVER =====
API_PORT=3000
API_HOST=localhost
API_PUBLIC_URL=http://localhost:3000
TRUST_PROXY=loopback,linklocal,uniquelocal
RATE_LIMIT_MAX=100
RATE_LIMIT_TTL_MS=60000

# ===== DATABASE =====
DB_HOST=localhost
DB_PORT=5432
DB_USER=mailuser
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
DB_NAME=mailagent
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ===== REDIS =====
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ===== JWT & AUTH =====
# Generate with: openssl rand -base64 64
JWT_SECRET=CHANGE_ME_GENERATE_WITH_OPENSSL
JWT_EXPIRATION=24h
OTP_EXPIRATION=900000
PASSWORD_RESET_EXPIRATION=900000

# ===== ENCRYPTION =====
# Generate with: openssl rand -base64 32
AES_SECRET_KEY=CHANGE_ME_GENERATE_WITH_OPENSSL

# ===== OAUTH2 - Google =====
GMAIL_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=${API_PUBLIC_URL}/auth/gmail/callback
GOOGLE_PUBSUB_TOPIC=projects/your-project/topics/your-topic

# ===== OAUTH2 - Microsoft =====
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_REDIRECT_URI=${API_PUBLIC_URL}/auth/microsoft/callback
MICROSOFT_TENANT_ID=common

# ===== WEBHOOKS =====
MICROSOFT_EMAIL_WEBHOOK_URL=${API_PUBLIC_URL}/webhooks/microsoft/notifications
MICROSOFT_CALENDAR_WEBHOOK_URL=${API_PUBLIC_URL}/webhooks/calendar/microsoft/notifications
WEBHOOK_CLIENT_STATE=your-webhook-secret

# ===== AI (Mistral) =====
MISTRAL_API_KEY=your-mistral-api-key
MISTRAL_MODEL=mistral-medium-latest

# ===== SMTP =====
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=noreply
SMTP_FROM_DOMAIN=yourdomain.com

# ===== FRONTEND =====
FRONTEND_URL=http://localhost:3001
FRONTEND_PORT=3001
CORS_ALLOWED_ORIGINS=http://localhost:3001

# ===== SYNC CONFIGURATION =====
EMAIL_SYNC_WORKERS_ENABLED=true
EMAIL_SYNC_SCHEDULER_ENABLED=true
CONTACTS_SYNC_ENABLED=true
CALENDAR_SYNC_ENABLED=true
JOBS_ENABLED=true
DEBUG_AUTH_LOG=false

# ===== GMAIL SYNC =====
GMAIL_FULL_MAX_MESSAGES=200
GMAIL_BATCH_GET_SIZE=100
GMAIL_HISTORY_MAX_PAGES=25
GMAIL_RETRY_MAX_ATTEMPTS=3
GMAIL_RETRY_429_DELAY_MS=2000
GMAIL_RETRY_5XX_DELAY_MS=2000

# ===== MICROSOFT SYNC =====
MS_FULL_MAX_MESSAGES=200
MS_BATCH_FETCH_SIZE=20
MS_RETRY_MAX_ATTEMPTS=3
MS_RETRY_429_DELAY_MS=2000
MS_RETRY_5XX_DELAY_MS=2000

# ===== QUEUE SETTINGS =====
QUEUE_HIGH_ATTEMPTS=3
QUEUE_HIGH_BACKOFF_MS=5000
QUEUE_HIGH_REMOVE_ON_COMPLETE_COUNT=50
QUEUE_HIGH_REMOVE_ON_COMPLETE_AGE=3600
QUEUE_HIGH_REMOVE_ON_FAIL_COUNT=100
QUEUE_NORMAL_ATTEMPTS=2
QUEUE_NORMAL_BACKOFF_MS=10000
QUEUE_LOW_ATTEMPTS=1
SYNC_WORKER_LOCK_MS=300000
SYNC_WORKER_STALLED_INTERVAL_MS=120000

# ===== EMBEDDING =====
EMBEDDING_CONCURRENCY=8
EMBEDDING_RATE_MAX=25
EMBEDDING_RATE_DURATION_MS=1000
EMBEDDING_BULK_SIZE=75
EMBEDDING_FLUSH_MS=100
EMBEDDING_LOCK_MS=180000

# ===== REALTIME =====
REALTIME_EMAIL_BUFFER_MS=200
REALTIME_EMAIL_BUFFER_MAX=500
REALTIME_SUPPRESS_MESSAGE_EVENTS=false
REALTIME_FOLDER_BUFFER_MS=1000
REALTIME_FOLDER_BUFFER_MAX=1000

# ===== S3/MINIO STORAGE =====
STORAGE_PROVIDER=s3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=your-s3-access-key
S3_SECRET_KEY=your-s3-secret-key
S3_REGION=us-east-1
S3_BUCKET=mailagent-attachments
S3_FORCE_PATH_STYLE=true

# ===== IMAP (Generic Providers) =====
IMAP_HOST=imap.your-provider.com
IMAP_PORT=993
IMAP_SECURE=true

# ===== FEATURE FLAGS =====
FEATURE_USER_LABELS=false
FEATURE_USER_LABELS_ROLLOUT=0
FEATURE_USER_LABELS_TENANTS=

# ===== STT/TTS =====
STT_PROVIDER=google
GOOGLE_STT_API_KEY=your-google-stt-key
TTS_PROVIDER=piper
PIPER_LANGUAGE=it_IT
```

---

## 5. Implementation Roadmap

### Phase 1: Immediate Security Fixes (Priority: CRITICAL)

| Task | Effort | Impact |
|------|--------|--------|
| 1.1 Verify `.env` is in `.gitignore` | 5 min | Critical |
| 1.2 Rotate all OAuth secrets | 30 min | Critical |
| 1.3 Generate new JWT_SECRET | 5 min | Critical |
| 1.4 Generate new AES_SECRET_KEY | 5 min | Critical |
| 1.5 Change DB password | 10 min | High |
| 1.6 Change MinIO credentials | 10 min | High |
| 1.7 Lower rate limits for production | 5 min | High |

### Phase 2: Configuration Centralization (Priority: HIGH)

| Task | Effort | Files Affected |
|------|--------|----------------|
| 2.1 Add Redis config to configuration.ts | 15 min | configuration.ts |
| 2.2 Add Webhook config | 15 min | configuration.ts |
| 2.3 Add S3/Storage config | 20 min | configuration.ts |
| 2.4 Add Sync worker config | 20 min | configuration.ts |
| 2.5 Add Queue config | 20 min | configuration.ts |
| 2.6 Add Embedding config | 15 min | configuration.ts |
| 2.7 Add Realtime config | 15 min | configuration.ts |
| 2.8 Remove duplicate GOOGLE_* vars | 5 min | .env |

### Phase 3: Validation & Type Safety (Priority: MEDIUM)

| Task | Effort | Description |
|------|--------|-------------|
| 3.1 Add Joi/class-validator for env validation | 2 hours | Validate all env vars on startup |
| 3.2 Create typed ConfigService wrapper | 1 hour | Type-safe config access |
| 3.3 Add required var checks for production | 30 min | Fail fast on missing required vars |
| 3.4 Environment-specific defaults | 1 hour | Different defaults for dev/prod |

### Phase 4: Documentation & Tooling (Priority: LOW)

| Task | Effort | Description |
|------|--------|-------------|
| 4.1 Update .env.example with all vars | 30 min | Complete template |
| 4.2 Add env var documentation comments | 1 hour | Inline documentation |
| 4.3 Create env setup script | 2 hours | Interactive setup wizard |
| 4.4 Add env diff checker | 1 hour | Warn about missing vars |

---

## 6. Production Checklist

Before deploying to production:

- [ ] All secrets rotated and stored securely (not in `.env` file)
- [ ] `NODE_ENV=production`
- [ ] `DEBUG_AUTH_LOG=false`
- [ ] `LOG_LEVEL=info` or `warn`
- [ ] Rate limits properly configured
- [ ] All OAuth redirect URIs updated for production domain
- [ ] Webhook URLs updated for production domain
- [ ] Strong database password set
- [ ] Redis password configured (if exposed)
- [ ] S3/MinIO credentials are not defaults
- [ ] CORS origins restricted to actual frontend domain

---

## 7. Secret Management Recommendations

### Development
- Use `.env` file (gitignored)
- Use `.env.example` as template

### Staging
- Use environment variables from CI/CD
- Consider HashiCorp Vault or AWS Secrets Manager

### Production
- **NEVER** use `.env` files
- Use cloud secrets manager:
  - AWS: Secrets Manager or Parameter Store
  - GCP: Secret Manager
  - Azure: Key Vault
  - Self-hosted: HashiCorp Vault
- Rotate secrets regularly (quarterly minimum)
- Use IAM roles for S3 access (not access keys)

---

## 8. Files Requiring Updates

| File | Changes Needed |
|------|----------------|
| `backend/src/config/configuration.ts` | Add missing configs (Redis, Webhooks, S3, Sync, Queue, Embedding, Realtime) |
| `backend/src/workers/ai.worker.ts` | Use ConfigService instead of process.env |
| `backend/src/modules/health/services/health.service.ts` | Use ConfigService |
| `backend/src/modules/realtime/gateways/realtime.gateway.ts` | Use ConfigService |
| `backend/src/modules/providers/providers.module.ts` | Use ConfigService |
| `backend/.env.example` | Complete rewrite with all variables |

---

## Appendix: Environment Variable Quick Reference

```
Total Variables: ~75
Centralized in config: ~35 (47%)
Direct process.env access: ~40 (53%)
Security-sensitive: ~15 (20%)
```

**Legend**:
- ✅ Properly handled
- ⚠️ Needs attention
- ❌ Missing/Not centralized
