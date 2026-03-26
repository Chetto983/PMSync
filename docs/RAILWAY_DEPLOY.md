# PMSync Backend — Railway Deployment

## Prerequisites

- [Railway CLI](https://docs.railway.com/guides/cli) installed
- Railway account
- Neon PostgreSQL (external, already configured)
- Cloudflare R2 (external, already configured)

## 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

## 2. Create Project & Services

```bash
# Create project
railway init --name pmsync

# Link to existing repo (from backend directory)
cd backend
railway link

# Add Redis plugin (Railway-managed)
railway add --plugin redis
```

## 3. Set Environment Variables

Copy values from `backend/.env.railway.template` and set them in Railway:

```bash
# Core
railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info
railway variables set API_PUBLIC_URL=https://<your-railway-domain>.up.railway.app

# Database (Neon — external)
railway variables set DATABASE_URL="postgresql://neondb_owner:<pw>@<host>/neondb?sslmode=verify-full&connection_limit=20&pool_timeout=20"
# Verify this value points at the intended production database before deploy.
# Do not rely on attaching a fresh Railway Postgres service unless that is the
# deliberate production target.

# Redis (Railway plugin auto-injects REDIS_URL, but we need components)
railway variables set REDIS_TLS_ENABLED=false
railway variables set REDIS_DB=0

# Auth (generate fresh secrets for prod!)
railway variables set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
railway variables set BETTER_AUTH_URL=https://<railway-domain>.up.railway.app
railway variables set BETTER_AUTH_PUBLIC_URL=https://<your-vercel-domain>.vercel.app
railway variables set CSRF_SECRET=$(openssl rand -hex 64)
railway variables set AES_SECRET_KEY=$(openssl rand -base64 32)

# WebAuthn
railway variables set PASSKEY_RP_ID=<your-frontend-domain>
railway variables set WEBAUTHN_ORIGIN=https://<your-frontend-domain>

# OAuth (same credentials, new redirect URIs)
railway variables set GMAIL_CLIENT_ID=<from .env>
railway variables set GMAIL_CLIENT_SECRET=<from .env>
railway variables set GOOGLE_REDIRECT_URI=https://<railway-domain>.up.railway.app/auth/gmail/callback
railway variables set MICROSOFT_CLIENT_ID=<from .env>
railway variables set MICROSOFT_CLIENT_SECRET=<from .env>
railway variables set MICROSOFT_REDIRECT_URI=https://<railway-domain>.up.railway.app/auth/microsoft/callback
railway variables set MICROSOFT_TENANT_ID=common

# AI
railway variables set MISTRAL_API_KEY=<from .env>
railway variables set AI_MODEL_SIMPLE=mistral-small-latest
railway variables set AI_MODEL_COMPLEX=mistral-large-latest
railway variables set AI_MODEL_CREATIVE=labs-mistral-small-creative
railway variables set AI_MODEL_ROUTER=ministral-3b-latest
railway variables set AI_MODEL_REASONING=magistral-small-latest
railway variables set AI_EMBEDDING_MODEL=mistral-embed

# SMTP
railway variables set SMTP_HOST=smtp.sendgrid.net
railway variables set SMTP_PORT=587
railway variables set SMTP_USER=apikey
railway variables set SMTP_PASSWORD=<from .env>

# Frontend CORS
railway variables set FRONTEND_URL=https://<your-vercel-domain>.vercel.app
railway variables set CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>.vercel.app

# S3/R2
railway variables set S3_ENDPOINT=<from .env>
railway variables set S3_ACCESS_KEY=<from .env>
railway variables set S3_SECRET_KEY=<from .env>
railway variables set S3_REGION=auto
railway variables set S3_BUCKET=pmsync
railway variables set S3_FORCE_PATH_STYLE=true

# Feature flags
railway variables set EMAIL_SYNC_WORKERS_ENABLED=true
railway variables set EMAIL_SYNC_SCHEDULER_ENABLED=true
railway variables set CONTACTS_SYNC_ENABLED=true
railway variables set JOBS_ENABLED=true
railway variables set CALENDAR_SYNC_ENABLED=true
```

## 4. Configure OAuth Redirect URIs

After Railway gives you a domain, update:

1. **Google Cloud Console** > APIs & Services > Credentials
   - Add `https://<your-vercel-domain>.vercel.app/api/auth/callback/google`
   - Keep `https://<railway-domain>.up.railway.app/auth/gmail/callback` only if you still use the backend provider-connect OAuth flow

2. **Azure AD** > App registrations > Redirect URIs
   - Add `https://<your-vercel-domain>.vercel.app/api/auth/callback/microsoft`
   - Keep `https://<railway-domain>.up.railway.app/auth/microsoft/callback` only if you still use the backend provider-connect OAuth flow

## 5. Deploy

```bash
# Deploy from backend directory
railway up

# Or push to trigger auto-deploy (if linked to GitHub)
git push origin main
```

## 6. Verify

```bash
# Check logs
railway logs

# Test health endpoint
curl https://<railway-domain>.up.railway.app/health

# Check deployment status
railway status
```

## 7. Update Vercel Frontend

Set in Vercel Dashboard > Environment Variables:

```
NEXT_PUBLIC_API_URL=https://<railway-domain>.up.railway.app
NEXT_PUBLIC_SITE_URL=https://<your-vercel-domain>.vercel.app
```

`NEXT_PUBLIC_API_URL` still points at Railway. Browser HTTP auth/API requests are proxied through Vercel on `/api/auth/*` and `/api/v1/*`, while realtime now uses a short-lived websocket token fetched over that same-origin API path before connecting to Railway.

## Architecture

```
[Vercel - Frontend]  -->  [Railway - Backend API]  -->  [Neon - PostgreSQL]
                                    |
                                    +-->  [Railway Redis Plugin]
                                    +-->  [Cloudflare R2 - Storage]
                                    +-->  [Mistral AI - LLM]
                                    +-->  [SendGrid - Email]
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/Dockerfile.railway` | Multi-stage Docker build |
| `backend/railway.toml` | Railway deploy config |
| `backend/.env.railway.template` | Full env var reference |
| `backend/.env` | Local dev only |

## Troubleshooting

- **Port issues**: Railway sets `PORT` automatically. Backend reads `PORT || API_PORT || 3000`
- **Redis TLS**: Railway Redis private/proxy hosts use plain TCP. Keep `REDIS_TLS_ENABLED=false` unless you switch to a Redis host that actually requires TLS.
- **Migrations**: Current `backend/railway.toml` starts the app with `node dist/main`. Run `npx prisma migrate deploy` explicitly as part of deploy when schema changes are pending.
- **Health check**: `GET /health` must return 200 within 30s
- **Production seed safety**: `prisma/seed.ts` refuses to run in production-like environments unless `ALLOW_PRODUCTION_SEED=true` is set for an explicit, reviewed operation.
