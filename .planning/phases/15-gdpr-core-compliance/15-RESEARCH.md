# Phase 15: GDPR Core Compliance - Research

**Researched:** 2026-02-11
**Domain:** GDPR consent management, audit logging, data governance
**Confidence:** HIGH

## Summary

Phase 15 adds two major subsystems: **granular consent management** and **comprehensive audit logging**. The codebase already has the skeleton pieces -- a `ComplianceModule` with `GdprService` (status checks, external purge), an `AuditModule` wrapping a thin `AuditService` (write-only, never actually called), a `UserPreferences` table with AI feature toggles (`aiSmartRepliesEnabled`, etc.), and VoltAgent observability hooks that track every tool execution with tenant/user context. The work is about connecting these dots into an enforceable, auditable, GDPR-compliant system.

The consent piece needs a **new Prisma model** (`UserConsent`) because the current `UserPreferences` mixes UI preferences (theme, sidebar) with feature toggles. GDPR requires versioned, timestamped consent records with audit trail -- not a mutable preferences row. The existing AI feature flags in `UserPreferences` can serve as the runtime "is this feature active?" check, but each change must produce an immutable consent history record.

The audit logging piece requires expanding the existing `AuditLog` model (which already has tenantId, userId, action, entity, entityId, changes, ipAddress, createdAt) to also cover AI tool executions. The existing model is adequate for data access events. For AI tool logging (AUDIT-02), the VoltAgent `onToolEnd` hook already captures toolName, agentName, duration, operationId, and output -- it just needs to persist summaries to the database instead of only Redis metrics.

**Primary recommendation:** Build consent as a separate model with versioned records (not a flag on UserPreferences), wire audit logging through a NestJS interceptor for HTTP data access and through VoltAgent hooks for AI tool execution, and use PostgreSQL index partitioning on `createdAt` for 3-year retention without query degradation.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | Already in use | Consent + AuditLog models | Already the project ORM; no reason to add another |
| NestJS Interceptors | Already in use | HTTP audit logging | `CorrelationInterceptor` pattern already exists; audit interceptor follows same pattern |
| NestJS Guards | Already in use | Consent enforcement | `FeatureFlagGuard` pattern already exists; consent guard follows same pattern |
| VoltAgent Hooks | Already in use | AI tool audit logging | `createObservabilityHooks()` already captures onToolStart/onToolEnd with all context |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-validator | Already in use | DTO validation for consent endpoints | All NestJS DTOs in codebase use it |
| @nestjs/schedule | Already in use | Audit log archival cron job | `DataCleanupService` already uses `@Cron()` pattern |
| BullMQ | Already in use | Async audit log writing (if needed) | If synchronous audit writes impact latency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom audit interceptor | `nestjs-cls` (Continuation-Local Storage) | cls adds a dependency; AsyncLocalStorage already exists via `CorrelationContext` |
| Database audit log table | External log service (ELK, Datadog) | External services add cost/complexity; PostgreSQL is sufficient for this scale |
| Prisma-level audit extension | NestJS middleware | Prisma extension catches ALL data access including background jobs; middleware only catches HTTP |
| Separate ConsentHistory table | JSON array on UserPreferences | JSON arrays aren't queryable, lose type safety, violate normalization |

**Installation:**
```bash
# No new dependencies needed - everything uses existing packages
```

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── modules/
│   ├── compliance/
│   │   ├── compliance.module.ts          # Existing - expand imports
│   │   ├── controllers/
│   │   │   ├── gdpr.controller.ts        # Existing
│   │   │   └── consent.controller.ts     # NEW: CRUD for consent settings
│   │   ├── services/
│   │   │   ├── gdpr.service.ts           # Existing
│   │   │   ├── consent.service.ts        # NEW: Consent business logic
│   │   │   └── consent-enforcement.service.ts  # NEW: Check consent before processing
│   │   ├── dto/
│   │   │   ├── gdpr-status.dto.ts        # Existing
│   │   │   ├── consent.dto.ts            # NEW: Consent request/response DTOs
│   │   │   └── audit-query.dto.ts        # NEW: Audit log query params
│   │   └── guards/
│   │       └── consent.guard.ts          # NEW: Blocks processing without consent
│   ├── audit/
│   │   ├── audit.module.ts               # Existing - expand
│   │   ├── services/
│   │   │   └── audit.service.ts          # Existing (move from common) - expand significantly
│   │   └── interceptors/
│   │       └── audit-log.interceptor.ts  # NEW: Auto-log data access on HTTP requests
│   └── ai/
│       └── voltagent/
│           └── observability/
│               └── hooks.ts              # Existing - add audit persistence callback
frontend/
├── components/
│   └── dashboard/
│       └── consent/                      # NEW: Consent settings UI
│           ├── ConsentSettings.tsx        # Main consent page
│           └── ConsentToggle.tsx          # Individual toggle with history
├── lib/
│   └── api/
│       └── compliance.ts                 # Existing - expand with consent API
├── hooks/
│   └── queries/
│       └── use-consent.ts                # NEW: TanStack Query hooks
└── locales/
    ├── en.ts                             # Add consent translations
    └── it.ts                             # Add consent translations
```

### Pattern 1: Consent Model with Versioned History

**What:** Every consent change creates an immutable record. The "current" consent state is the latest record per feature per user.
**When to use:** GDPR requires proving what the user consented to and when. Mutable flags lose history.

```typescript
// Prisma schema addition
model UserConsent {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  feature     String   // e.g., "ai_smart_replies", "ai_summarization", "email_analytics"
  granted     Boolean  // true = consent given, false = consent withdrawn
  version     Int      // Consent text version the user saw
  ipAddress   String?  // IP at time of consent action
  userAgent   String?  // Browser/device info
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, feature, createdAt(sort: Desc)])
  @@index([tenantId, createdAt])
  @@map("user_consents")
}
```

**Why this approach:**
- Immutable append-only records = GDPR-compliant audit trail (CONS-03)
- Latest record per (userId, feature) = current consent state
- version field tracks which consent text version was shown
- IP + userAgent provide GDPR-required "how consent was given" evidence

### Pattern 2: Consent Guard for Processing Enforcement

**What:** A NestJS guard that blocks request processing when required consent is missing.
**When to use:** On any endpoint that processes personal data requiring consent (CONS-02).

```typescript
// consent.guard.ts - follows existing FeatureFlagGuard pattern
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private consentService: ConsentEnforcementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredConsent = this.reflector.get<string>(
      'REQUIRED_CONSENT',
      context.getHandler(),
    );
    if (!requiredConsent) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { userId, tenantId } = request.user;

    return this.consentService.hasConsent(userId, tenantId, requiredConsent);
  }
}

// Usage on controller method:
@RequiresConsent('ai_smart_replies')
@Get('smart-reply')
async getSmartReply() { ... }
```

### Pattern 3: Audit Interceptor for Data Access Logging

**What:** A global NestJS interceptor that logs all data access operations with user/tenant context.
**When to use:** Automatically on all HTTP endpoints (AUDIT-01).

```typescript
// audit-log.interceptor.ts - follows CorrelationInterceptor pattern
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const handler = context.getHandler();
    const controller = context.getClass();

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget async write
        this.auditService.logDataAccess({
          tenantId: request.user?.tenantId,
          userId: request.user?.userId,
          action: request.method,
          entity: controller.name,
          entityId: request.params?.id,
          path: request.path,
          ipAddress: request.ip,
          timestamp: new Date(),
        }).catch(() => {}); // Never fail the request
      }),
    );
  }
}
```

### Pattern 4: AI Tool Execution Audit via VoltAgent Hooks

**What:** Extend the existing `onToolEnd` hook to persist tool execution summaries to the audit log.
**When to use:** Automatically on every AI tool execution (AUDIT-02).

```typescript
// In hooks.ts - add onAuditToolExecution callback to ObservabilityOptions
onAuditToolExecution?: (data: {
  tenantId: string;
  userId?: string;
  toolName: string;
  agentName: string;
  inputSummary: string;  // Truncated/redacted input args
  outputSummary: string; // Truncated/redacted output
  durationMs: number;
  status: 'success' | 'error';
}) => Promise<void>;
```

### Pattern 5: Consent-Gating with UserPreferences Sync

**What:** Keep `UserPreferences.aiSmartRepliesEnabled` etc. as the fast runtime check, but sync it with the consent system.
**When to use:** When checking consent on every AI request would add unacceptable latency.

```
User changes consent toggle
  → POST /compliance/consent { feature: "ai_smart_replies", granted: true }
  → ConsentService creates UserConsent record (immutable)
  → ConsentService updates UserPreferences.aiSmartRepliesEnabled (mutable, fast-read)
  → AI services check UserPreferences (already doing this) = zero performance impact
```

This dual-write approach means:
- `UserConsent` table = GDPR compliance proof (immutable, versioned)
- `UserPreferences` columns = fast runtime check (mutable, already queried by AI services)
- No new query in the AI hot path

### Anti-Patterns to Avoid

- **Storing consent as a JSON blob on User:** Loses queryability, prevents per-feature audit, makes GDPR reporting impossible.
- **Synchronous audit log writes in the request path:** Will add latency. Use fire-and-forget or BullMQ queue.
- **Logging PII in audit records:** The audit log itself must not contain personal data beyond userId/tenantId. Redact/summarize AI tool inputs/outputs.
- **Single boolean "gdprConsent" flag:** GDPR requires granular consent per processing purpose. A single flag doesn't comply.
- **Relying on soft-delete timestamps as audit trail:** Soft-delete tracks deletion state, not processing consent. Different concerns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Consent versioning | Custom version tracking | Immutable append-only table with `version` column | Simpler, queryable, database-native |
| Request context propagation | Thread-local or parameter passing | `CorrelationContext` (already exists via AsyncLocalStorage) | Already wired in CorrelationInterceptor |
| Audit log retention | Manual deletion scripts | PostgreSQL index + `@Cron` job (like DataCleanupService) | Pattern already established |
| Consent UI state management | Custom React state | TanStack Query mutations + optimistic updates | Already the project standard |
| Rate limiting audit writes | Custom throttle logic | BullMQ queue with batching | Already used for EmailEmbedding, ContactEmbedding queues |

**Key insight:** Almost every infrastructure piece needed already exists in the codebase. The work is wiring, not inventing. The `FeatureFlagGuard` pattern maps 1:1 to a ConsentGuard. The `CorrelationInterceptor` pattern maps to an AuditLogInterceptor. The `DataCleanupService` @Cron pattern maps to audit retention. The `createObservabilityHooks()` already captures everything needed for AUDIT-02.

## Common Pitfalls

### Pitfall 1: Audit Log Table Bloat

**What goes wrong:** With every HTTP request logged, the `audit_logs` table grows to millions of rows in weeks. Queries slow down. Backups balloon.
**Why it happens:** No retention policy, no partitioning, logging everything including health checks and static assets.
**How to avoid:**
- Filter: Only log authenticated requests to data-bearing endpoints (exclude `/health`, `/metrics`, static files)
- Index: The existing `@@index([tenantId, createdAt])` helps, but add a composite index on `(tenantId, entity, createdAt)` for querying
- Retention: `@Cron` job deletes records older than 3 years (per GDPR Article 30)
- Consider: PostgreSQL table partitioning by month if volume exceeds ~10M rows/year
**Warning signs:** Slow audit log queries, backup size increasing 50%+ month-over-month

### Pitfall 2: Consent Check on Every AI Request Adding Latency

**What goes wrong:** Adding a database query for consent before every AI chat message adds 5-20ms per request.
**Why it happens:** Checking `UserConsent` table on every request instead of using cached/synced preference flags.
**How to avoid:** Use the dual-write pattern (Pattern 5). AI services already read `UserPreferences` -- keep that as the fast path. The `UserConsent` table is the compliance record, not the runtime check.
**Warning signs:** AI response latency regression after consent feature ships

### Pitfall 3: Logging Sensitive Data in Audit Records

**What goes wrong:** AI tool input/output summaries contain PII (email addresses, names, phone numbers). Now the audit log is itself a GDPR liability.
**Why it happens:** Naively serializing tool args/results into the audit record.
**How to avoid:**
- Truncate tool outputs to first 200 chars
- Use the existing PII detection/redaction from `pii-detection-sentinel.service.ts` before storing
- Store tool name + arg keys (not values) for input summary
- Store success/failure + count/size metrics for output summary
**Warning signs:** Audit log records containing email addresses or phone numbers

### Pitfall 4: Consent Version Drift

**What goes wrong:** Consent text changes but users aren't re-prompted. Old consent records reference a version that no longer exists.
**Why it happens:** No mechanism to invalidate old consent when privacy policy changes.
**How to avoid:**
- Store current consent text version as a constant/config
- When version bumps, mark features as "consent_stale" for users with old version
- Frontend checks version mismatch and shows re-consent prompt
**Warning signs:** Users operating under consent version N-2 or older

### Pitfall 5: Missing Audit Log for Background Jobs

**What goes wrong:** The HTTP interceptor only captures request-initiated data access. BullMQ workers processing emails, embeddings, and syncs operate without audit trail.
**Why it happens:** Interceptors only work in the HTTP request cycle, not in queue workers.
**How to avoid:**
- For Phase 15, scope audit logging to HTTP requests + AI tool executions (AUDIT-01 + AUDIT-02)
- Background jobs are already consent-gated (e.g., `aiAutoTriageEnabled` check in `EmailTriageService`)
- Future phase can add audit hooks to BullMQ workers
**Warning signs:** Compliance audit asking "who processed this data?" for background job operations

## Code Examples

### Consent Service Core Logic

```typescript
// consent.service.ts
@Injectable()
export class ConsentService {
  constructor(private prisma: PrismaService) {}

  /** Get current consent state for all features for a user */
  async getCurrentConsents(userId: string, tenantId: string): Promise<ConsentState[]> {
    // Get latest consent record per feature using Prisma's distinct
    const consents = await this.prisma.userConsent.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
      distinct: ['feature'],
    });

    return CONSENT_FEATURES.map((feature) => {
      const record = consents.find((c) => c.feature === feature.id);
      return {
        feature: feature.id,
        label: feature.label,
        description: feature.description,
        granted: record?.granted ?? false,
        lastUpdated: record?.createdAt ?? null,
        version: record?.version ?? null,
        required: feature.required,
      };
    });
  }

  /** Record a consent change (append-only) and sync to UserPreferences */
  async updateConsent(
    userId: string,
    tenantId: string,
    feature: string,
    granted: boolean,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserConsent> {
    const consent = await this.prisma.userConsent.create({
      data: {
        tenantId,
        userId,
        feature,
        granted,
        version: CURRENT_CONSENT_VERSION,
        ipAddress,
        userAgent,
      },
    });

    // Sync to UserPreferences for fast runtime checks
    await this.syncToPreferences(userId, feature, granted);

    return consent;
  }

  /** Map consent feature ID to UserPreferences column */
  private async syncToPreferences(userId: string, feature: string, granted: boolean) {
    const prefField = FEATURE_TO_PREF_MAP[feature];
    if (prefField) {
      await this.prisma.userPreferences.update({
        where: { userId },
        data: { [prefField]: granted },
      });
    }
  }
}
```

### Consent Feature Registry

```typescript
// consent.constants.ts
export const CURRENT_CONSENT_VERSION = 1;

export const CONSENT_FEATURES = [
  {
    id: 'ai_smart_replies',
    label: 'AI Smart Replies',
    description: 'Allow AI to generate reply suggestions based on email content',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_summarization',
    label: 'AI Email Summarization',
    description: 'Allow AI to analyze and summarize email content',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_scheduling',
    label: 'AI Scheduling',
    description: 'Allow AI to suggest meeting times and manage calendar',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_auto_triage',
    label: 'AI Auto-Triage',
    description: 'Allow AI to automatically categorize and prioritize emails',
    required: false,
    category: 'ai',
  },
  {
    id: 'email_analytics',
    label: 'Email Analytics',
    description: 'Process email metadata for analytics dashboards',
    required: false,
    category: 'data',
  },
  {
    id: 'contact_enrichment',
    label: 'Contact Enrichment',
    description: 'Use AI to generate embeddings from contact data for intelligent search',
    required: false,
    category: 'data',
  },
] as const;

/** Maps consent feature IDs to UserPreferences columns for sync */
export const FEATURE_TO_PREF_MAP: Record<string, string> = {
  ai_smart_replies: 'aiSmartRepliesEnabled',
  ai_summarization: 'aiSummarizationEnabled',
  ai_scheduling: 'aiSchedulingEnabled',
  ai_auto_triage: 'aiAutoTriageEnabled',
};
```

### Enhanced Audit Service

```typescript
// audit.service.ts - expanded from existing
@Injectable()
export class AuditService {
  private logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Log a data access event (AUDIT-01) */
  async logDataAccess(data: {
    tenantId: string;
    userId?: string;
    action: string;      // GET, POST, PUT, DELETE
    entity: string;      // Controller name or resource type
    entityId?: string;
    path: string;
    ipAddress?: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          action: `DATA_ACCESS:${data.action}`,
          entity: data.entity,
          entityId: data.entityId ?? data.path,
          changes: { path: data.path },
          ipAddress: data.ipAddress,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log data access:', error);
      // Never throw - audit failures must not break the application
    }
  }

  /** Log an AI tool execution (AUDIT-02) */
  async logToolExecution(data: {
    tenantId: string;
    userId?: string;
    toolName: string;
    agentName: string;
    inputSummary: string;
    outputSummary: string;
    durationMs: number;
    status: 'success' | 'error';
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          action: `AI_TOOL:${data.toolName}`,
          entity: 'VoltAgent',
          entityId: data.agentName,
          changes: {
            inputSummary: data.inputSummary,
            outputSummary: data.outputSummary,
            durationMs: data.durationMs,
            status: data.status,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to log tool execution:', error);
    }
  }
}
```

### Audit Retention Cron Job

```typescript
// In data-cleanup.service.ts or separate audit-retention.service.ts
// Follows existing @Cron pattern from DataCleanupService

@Cron('0 4 * * 0') // Weekly at 4 AM Sunday
async cleanupOldAuditLogs(): Promise<number> {
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const result = await this.prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: threeYearsAgo },
    },
  });

  this.logger.log(`Audit retention: deleted ${result.count} records older than 3 years`);
  return result.count;
}
```

## Existing Codebase Analysis

### What Already Exists (Leverage, Don't Rebuild)

| Component | Location | Status | Phase 15 Action |
|-----------|----------|--------|-----------------|
| `AuditLog` Prisma model | `schema.prisma:812-828` | Has tenantId, userId, action, entity, entityId, changes, ipAddress, createdAt | Adequate for AUDIT-01 + AUDIT-02. No schema change needed. |
| `AuditService` | `common/services/audit.service.ts` | Exists but NEVER called anywhere | Expand with `logDataAccess()` and `logToolExecution()` methods |
| `AuditModule` | `modules/audit/audit.module.ts` | Registered in AppModule | Expand to export interceptor |
| `ComplianceModule` | `modules/compliance/compliance.module.ts` | Has GdprService + GdprController | Add ConsentService, ConsentController |
| `GdprService` | `modules/compliance/services/gdpr.service.ts` | Status checks + external purge | Add consent status to checks list |
| `UserPreferences` | `schema.prisma:94-130` | Has aiSmartRepliesEnabled, aiSummarizationEnabled, aiSchedulingEnabled, aiAutoTriageEnabled | Keep as fast runtime check; sync from consent system |
| `FeatureFlagGuard` | `common/guards/feature-flag.guard.ts` | Reflector + Reflector pattern | Template for ConsentGuard |
| `CorrelationInterceptor` | `common/interceptors/correlation.interceptor.ts` | Request context propagation | Template for AuditLogInterceptor |
| `CorrelationContext` | `common/services/correlation-context.service.ts` | AsyncLocalStorage with tenantId, userId | Use for audit context in non-HTTP paths |
| `createObservabilityHooks()` | `voltagent/observability/hooks.ts` | onToolEnd captures toolName, agentName, duration, output | Add onAuditToolExecution callback |
| `DataCleanupService` | `common/services/data-cleanup.service.ts` | @Cron('0 3 * * *') pattern | Template for audit retention cron |
| `CookieConsent` component | `frontend/components/ui/cookie-consent.tsx` | Cookie-specific consent UI | NOT reusable for feature consent (different concern) |
| `complianceApi` | `frontend/lib/api/compliance.ts` | getGdprStatus() only | Expand with consent CRUD endpoints |
| AI feature flag checks | `email-triage.service.ts:162-168` | Checks `aiAutoTriageEnabled` before processing | Already does consent-like gating; consent system formalizes this |

### What's Missing (Must Build)

| Component | Why Needed | Requirement |
|-----------|-----------|-------------|
| `UserConsent` Prisma model | Versioned, immutable consent records | CONS-01, CONS-03 |
| `ConsentService` | Business logic for consent CRUD | CONS-01, CONS-02 |
| `ConsentEnforcementService` | Check consent before data processing | CONS-02 |
| `ConsentGuard` | NestJS guard to block unconsented requests | CONS-02 |
| `@RequiresConsent()` decorator | Mark endpoints needing specific consent | CONS-02 |
| `ConsentController` | REST API for consent management | CONS-01 |
| `AuditLogInterceptor` | Auto-log all data access HTTP requests | AUDIT-01 |
| AI tool audit persistence | Persist tool executions from VoltAgent hooks to DB | AUDIT-02 |
| Audit retention cron job | Delete records > 3 years old | AUDIT-03 |
| Frontend consent settings page | UI for viewing/modifying consent | CONS-01 |
| Consent TanStack Query hooks | Frontend data fetching | CONS-01 |
| i18n translations for consent | EN + IT consent strings | CONS-01 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single "I agree to everything" checkbox | Granular per-purpose consent toggles | GDPR enforcement (2018+, tightened 2024-2026) | Must offer per-feature opt-in/out |
| Mutable consent flag | Immutable append-only consent records | GDPR case law 2022+ | Must prove what was consented to and when |
| Optional audit logging | Mandatory processing records (Art. 30) | GDPR from inception, enforcement increased 2024+ | All data processing must be logged |
| Synchronous audit writes | Fire-and-forget async writes | Performance necessity at scale | Audit must never slow down the app |
| Manual audit review | Structured queryable audit tables | Industry standard 2023+ | Must be able to answer "who accessed what" queries |

**Deprecated/outdated:**
- "Cookie consent as GDPR consent": Cookie consent (existing `CookieConsent` component) covers cookies only, not data processing consent. These are separate GDPR concerns.
- "Consent stored in JWT claims": Consent can change mid-session; JWT is immutable after issuance. Database is the source of truth.

## Open Questions

1. **Consent features scope: Should email sync itself require consent?**
   - What we know: Email sync is the core function of the app -- it's arguably "contractual necessity" (GDPR Art. 6(1)(b)), not requiring separate consent
   - What's unclear: Whether to add email sync as a consent feature or only AI/analytics features
   - Recommendation: Only AI features + analytics need consent toggles. Email sync is contractual necessity. This is Claude's discretion per phase context.

2. **Audit log volume: Should read-only GET requests be logged?**
   - What we know: Logging all GETs will generate massive volume (every email list view, every folder refresh)
   - What's unclear: Whether AUDIT-01 "all data access events" means reads too or just mutations
   - Recommendation: Log all authenticated requests but filter out high-frequency endpoints (health checks, polling endpoints). Use action categories (READ vs WRITE) for filtering in queries.

3. **Frontend consent page location: Separate page or tab in Settings?**
   - What we know: Settings page (`/dashboard/settings`) exists, currently renders a `<Settings />` component
   - What's unclear: Whether to add a consent tab there or create `/dashboard/settings/privacy`
   - Recommendation: Add a "Privacy & Consent" tab within the existing Settings page. Follows the established pattern.

4. **Audit log for WebSocket events: Should realtime events be logged?**
   - What we know: The app has a `RealtimeModule` with WebSocket gateway for live updates
   - What's unclear: Whether WebSocket-delivered data access counts for AUDIT-01
   - Recommendation: Out of scope for Phase 15. WebSocket delivers events already triggered by HTTP/background processing which IS logged. Logging the delivery would be redundant.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis (multiple files read and verified)
- Prisma schema at `backend/prisma/schema.prisma`
- NestJS guard pattern from `common/guards/feature-flag.guard.ts`
- NestJS interceptor pattern from `common/interceptors/correlation.interceptor.ts`
- VoltAgent hooks from `modules/ai/voltagent/observability/hooks.ts`
- Audit service from `common/services/audit.service.ts`
- GDPR service from `modules/compliance/services/gdpr.service.ts`

### Secondary (MEDIUM confidence)
- [Building an Audit Trail System in NestJS](https://medium.com/@solomoncodes/building-an-audit-trail-system-in-nestjs-222a4604a6a2) - NestJS interceptor pattern
- [Production-Ready Audit Logs in PostgreSQL](https://medium.com/@sehban.alam/lets-build-production-ready-audit-logs-in-postgresql-7125481713d8) - PostgreSQL retention strategies
- [GDPR Consent Management Requirements](https://secureprivacy.ai/blog/gdpr-consent-management) - GDPR consent versioning requirements
- [GDPR Article 30: Records of processing activities](https://gdpr-library.com/article/30) - Legal requirements for processing records
- [GDPR Compliant Logging in NestJS](https://www.bytehide.com/blog/gdpr-compliant-logging-in-nestjs) - NestJS-specific GDPR patterns
- [Prisma Audit Trail Guide for Postgres](https://medium.com/@arjunlall/prisma-audit-trail-guide-for-postgres-5b09aaa9f75a) - Prisma-specific audit patterns

### Tertiary (LOW confidence)
- General GDPR Article 30 retention period guidance (no fixed statutory period -- organizations define their own; 3-year target from phase requirements)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components use existing project dependencies (NestJS, Prisma, TanStack Query). No new packages needed.
- Architecture: HIGH - Every pattern (guard, interceptor, cron, hooks callback) has a direct template in the existing codebase.
- Pitfalls: HIGH - Based on concrete analysis of existing table structure, query patterns, and data volumes.

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable domain; GDPR requirements don't change rapidly)
