# Secrets Rotation Checklist

> After removing `.env` from git history with BFG Repo-Cleaner, **every secret** must be rotated.
> Old values are compromised the moment they appeared in any git commit, even in a private repo.

## How to Use

1. For each secret below, generate a new value from the listed source.
2. Update the value in **Railway** (or your deployment platform).
3. Update your **local `.env`** file.
4. Check off the item once rotated.

---

## 1. Database (Supabase / PostgreSQL)

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `DATABASE_URL` | Supabase Dashboard > Settings > Database > Connection string | Backend + Frontend |
| `DB_PASSWORD` | Supabase Dashboard > Settings > Database > Reset password | Backend only |
| `DB_HOST` | Supabase Dashboard > Settings > Database (host value) | Backend only |
| `DB_USER` | Supabase Dashboard > Settings > Database | Backend only |
| `POSTGRES_URL` | Railway alias -- set to same value as `DATABASE_URL` | Backend only |

- [ ] `DATABASE_URL` rotated (backend)
- [ ] `DATABASE_URL` rotated (frontend -- must match backend)
- [ ] `DB_PASSWORD` rotated
- [ ] `POSTGRES_URL` updated (if used in Railway)

---

## 2. Better-Auth (Session Signing)

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Backend + Frontend (MUST match) |

- [ ] `BETTER_AUTH_SECRET` rotated (backend)
- [ ] `BETTER_AUTH_SECRET` rotated (frontend -- **must be identical** to backend)

---

## 3. CSRF Protection

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `CSRF_SECRET` | `openssl rand -hex 32` | Backend only |

- [ ] `CSRF_SECRET` rotated

---

## 4. Encryption Keys

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `AES_SECRET_KEY` | `openssl rand -base64 32` | Backend only |
| `FIELD_ENCRYPTION_MASTER_KEY` | `openssl rand -base64 32` | Backend only |

> **WARNING:** Rotating encryption keys means existing encrypted data becomes unreadable.
> You must re-encrypt existing data or keep `FIELD_ENCRYPTION_OLD_KEYS` with the previous key.

- [ ] `AES_SECRET_KEY` rotated (with data re-encryption plan)
- [ ] `FIELD_ENCRYPTION_MASTER_KEY` rotated (set old key in `FIELD_ENCRYPTION_OLD_KEYS`)

---

## 5. OAuth -- Google / Gmail

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `GMAIL_CLIENT_ID` | Google Cloud Console > APIs & Services > Credentials | Backend only |
| `GMAIL_CLIENT_SECRET` | Google Cloud Console > APIs & Services > Credentials > Reset secret | Backend only |
| `GOOGLE_STT_API_KEY` | Google Cloud Console > APIs & Services > Credentials | Backend only |

> After rotating: all users must re-authorize Gmail. Update redirect URIs if domain changed.

- [ ] `GMAIL_CLIENT_SECRET` rotated
- [ ] `GOOGLE_STT_API_KEY` rotated
- [ ] Users notified to re-authorize Gmail

---

## 6. OAuth -- Microsoft / Azure

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `MICROSOFT_CLIENT_ID` | Azure Portal > App registrations > Overview | Backend only |
| `MICROSOFT_CLIENT_SECRET` | Azure Portal > App registrations > Certificates & secrets > New client secret | Backend only |
| `MICROSOFT_TENANT_ID` | Azure Portal > App registrations > Overview (Directory ID) | Backend only |

> After rotating: all users must re-authorize Microsoft. Update redirect URIs if domain changed.

- [ ] `MICROSOFT_CLIENT_SECRET` rotated
- [ ] Users notified to re-authorize Microsoft

---

## 7. Redis

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `REDIS_PASSWORD` | Redis provider dashboard (Railway Redis, Upstash, etc.) | Backend only |
| `REDIS_TLS_CERT` | Re-download from Redis provider if TLS is enabled | Backend only |
| `REDIS_TLS_KEY` | Re-download from Redis provider if TLS is enabled | Backend only |
| `REDIS_TLS_CA` | Re-download from Redis provider if TLS is enabled | Backend only |

- [ ] `REDIS_PASSWORD` rotated

---

## 8. AI Provider (Mistral)

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `MISTRAL_API_KEY` | [Mistral Console](https://console.mistral.ai/) > API Keys > Create new key | Backend only |

- [ ] `MISTRAL_API_KEY` rotated

---

## 9. SMTP (Transactional Email)

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `SMTP_HOST` | Your SMTP provider (Postmark, SendGrid, SES, etc.) | Backend + Frontend |
| `SMTP_USER` | SMTP provider dashboard | Backend + Frontend |
| `SMTP_PASSWORD` | SMTP provider dashboard > Reset credentials | Backend + Frontend |

- [ ] `SMTP_PASSWORD` rotated (backend)
- [ ] `SMTP_PASSWORD` rotated (frontend -- if using same SMTP)

---

## 10. File Storage (S3 / MinIO)

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `S3_ACCESS_KEY` | AWS IAM > Users > Security credentials > Create access key (or MinIO admin) | Backend only |
| `S3_SECRET_KEY` | AWS IAM > Users > Security credentials > Create access key (or MinIO admin) | Backend only |

- [ ] `S3_ACCESS_KEY` rotated
- [ ] `S3_SECRET_KEY` rotated

---

## 11. Billing (Autumn)

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `AUTUMN_SECRET_KEY` | [Autumn Dashboard](https://useautumn.com/) > Settings > API Keys | Backend only |

- [ ] `AUTUMN_SECRET_KEY` rotated

---

## 12. Webhook Tokens

| Env Var | Where to Regenerate | Shared? |
|---------|---------------------|---------|
| `WEBHOOK_CLIENT_STATE` | `openssl rand -hex 16` | Backend only |
| `EMAIL_SYNC_WEBHOOK_TOKEN` | `openssl rand -hex 32` | Backend only |
| `EMAIL_SYNC_WORKER_TOKEN` | `openssl rand -hex 32` | Backend only |

- [ ] `WEBHOOK_CLIENT_STATE` rotated
- [ ] `EMAIL_SYNC_WEBHOOK_TOKEN` rotated (if enabled)
- [ ] `EMAIL_SYNC_WORKER_TOKEN` rotated (if enabled)

---

## Post-Rotation Verification

After all secrets are rotated:

- [ ] Trigger a Railway redeploy
- [ ] Verify app starts (check deploy logs)
- [ ] Verify login works (better-auth session)
- [ ] Verify email sync works (Gmail and/or Microsoft)
- [ ] Verify AI features work (Mistral API)
- [ ] Verify Redis connection (BullMQ queues processing)
- [ ] Notify collaborators to re-clone repo (BFG rewrites history, force-push invalidates local clones)
