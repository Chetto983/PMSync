# Stack Research: v3.1 GDPR Compliance & AI Chatbot Enhancements

**Project:** MailAgent v3.1
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

**Minimal stack additions.** Add only `prisma-field-encryption@1.6.0`. Use existing `node-nlp` for PII, custom NestJS interceptors for audit, Prisma models for consent, and already-installed `streamdown` for chat artifacts.

**NEW DEPENDENCIES:** Only 1 - `prisma-field-encryption@1.6.0`

---

## Recommendations

| Component | Current | v3.1 | Action |
|-----------|---------|------|--------|
| PII Detection | None | Hybrid | Use existing node-nlp |
| Database Encryption | None | prisma-field-encryption | Add 1.6.0 |
| Audit Logging | None | Custom | Custom interceptor |
| Consent | None | Custom | Prisma models |
| Chat Artifacts | streamdown 2.1.0 | streamdown 2.1.0 | Already installed |

---

## PII Tokenization

### Hybrid (Regex + NER)

**Rationale:** 95% accuracy (F1=0.94) vs 65% regex-only, 30-60ms latency

**Use:** Existing `node-nlp` + custom regex

**Implementation:**
- Regex: emails, phones, SSNs, credit cards
- NER: names, organizations, locations  
- Storage: Redis with session TTL
- Pattern: `pii:session:{sessionId}:token:{tokenId}`

**Avoid:**
- PII-PALADIN (90MB, 30-40% CPU overhead)
- External APIs (Google DLP, Azure)

---

## Database Encryption

### prisma-field-encryption@1.6.0

**Installation:**
```bash
npm install prisma-field-encryption@^1.6.0
```

**Integration:**
```typescript
import { fieldEncryptionExtension } from 'prisma-field-encryption';

export class PrismaService extends PrismaClient {
  constructor() {
    const client = super().(fieldEncryptionExtension({
      encryptionKey: process.env.PRISMA_FIELD_ENCRYPTION_KEY,
    }));
    return client;
  }
}
```

**Schema:**
```prisma
model Email {
  subject   String   /// @encrypted
  body      String   /// @encrypted
  bodyHash  String?  @index
}
```

**Per-Tenant Keys:** Derive from master + tenant ID via pbkdf2

**Avoid:**
- Percona TDE (commercial)
- pgcrypto (breaks type safety)
- AWS KMS (added complexity)

---

## Audit Logging

### Custom NestJS Interceptor

**Schema:**
```prisma
model AuditLog {
  id         String   @id @default(nanoid())
  tenantId   String   @index
  action     String   // CREATE, UPDATE, DELETE, EXPORT
  resource   String   // Email, Contact, Calendar
  changes    Json?    // Masked diff
  ipAddress  String?  /// @encrypted
  timestamp  DateTime @default(now())
  @@index([tenantId, timestamp])
}
```

**Implementation:**
```typescript
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  intercept(context, next) {
    const req = context.switchToHttp().getRequest();
    if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      return next.handle();
    }
    return next.handle().pipe(
      tap(async () => {
        await this.prisma.auditLog.create({
          data: {
            tenantId: req.user.tenantId,
            action: this.mapMethod(req.method),
            changes: this.maskPII(req.body),
          },
        });
      }),
    );
  }
}
```

**Retention:** 2 years (configurable)

**Avoid:**
- External logging (GDPR violation)
- nestjs-auditlog (unmaintained)

---

## Consent Management

### Custom Prisma Models

**Schema:**
```prisma
model ConsentRecord {
  id          String   @id
  userId      String   @index
  purpose     String   // ai_analysis, email_processing
  legalBasis  String   // consent, contract
  granted     Boolean
  version     String
  consentText String
  grantedAt   DateTime?
  revokedAt   DateTime?
  @@index([userId, purpose])
}
```

**Usage:**
```typescript
@Get()
@RequireConsent('ai_analysis')
async getBriefing() { }
```

**Avoid:**
- OneTrust/Usercentrics (expensive)
- Cookie libraries (API-only)

---

## Chat Artifacts

### Already Installed ✅

**No new dependencies needed!**

- `streamdown@2.1.0` - Streaming markdown
- `@streamdown/code@1.0.1` - Syntax highlighting
- `@assistant-ui/react@0.12.9` - Chat UI
- `ai@6.0.77` - Vercel AI SDK

**Artifacts:** Email, Event, Contact, Task, Table, Chart

**Memoization:**
```tsx
const artifacts = useMemo(
  () => messages.map(m => <Artifact key={m.id} {...m} />),
  [messages.length]
);
```

**Avoid:**
- react-markdown (flicker)

---

## Implementation

### Phase 1: Foundation (Week 1)
1. Add prisma-field-encryption
2. Create PII service (regex + node-nlp)
3. Define Prisma models
4. Migrations

### Phase 2: Backend (Week 1-2)
5. Audit interceptor
6. @RequireConsent decorator
7. PII tokenization in VoltAgent
8. Encryption annotations

### Phase 3: Frontend (Week 2)
9. Consent banner
10. Privacy dashboard
11. Artifact renderers
12. Streamdown memoization

### Phase 4: Compliance (Week 3)
13. GDPR audit
14. Performance testing
15. Security review

---

## Setup

```bash
# Backend
cd backend
npm install prisma-field-encryption@^1.6.0

# Environment
MASTER_ENCRYPTION_KEY=<openssl rand -base64 32>
PRISMA_FIELD_ENCRYPTION_KEY=<same or derived>
AUDIT_LOG_RETENTION_DAYS=730

# Migrate
npx prisma generate
npx prisma migrate dev --name gdpr_compliance
```

---

## Confidence

| Area | Level | Reason |
|------|-------|--------|
| PII | HIGH | Proven hybrid, existing node-nlp |
| Encryption | HIGH | Prisma 7.3+ extensions tested |
| Audit | HIGH | Standard NestJS pattern |
| Consent | HIGH | GDPR best practices |
| Artifacts | HIGH | Already in codebase |

---

## Sources

- [Elastic - Hybrid PII](https://www.elastic.co/observability-labs/blog/pii-ner-regex-assess-redact-part-2)
- [PostgreSQL Encryption](https://www.postgresql.org/docs/current/encryption-options.html)
- [prisma-field-encryption](https://www.npmjs.com/package/prisma-field-encryption)
- [Cropsly - NestJS Audit](https://cropsly.com/blog/implementing-audit-logging-in-a-nestjs-application/)
- [SecurePrivacy - GDPR](https://secureprivacy.ai/blog/gdpr-consent-management)
- [Streamdown](https://www.kdjingpai.com/en/streamdown/)
- [Vercel AI SDK](https://vercel.com/blog/ai-sdk-6)
