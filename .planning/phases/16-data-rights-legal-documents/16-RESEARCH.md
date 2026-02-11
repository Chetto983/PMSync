# Phase 16: Data Rights & Legal Documents - Research

**Researched:** 2026-02-11
**Domain:** GDPR data portability (Article 20), right to erasure (Article 17), legal acceptance flow
**Confidence:** HIGH

## Summary

Phase 16 builds on a solid foundation. The codebase already has: (1) a `ComplianceModule` with `GdprService`, `ConsentService`, and consent CRUD/guards; (2) a working `deleteUserAccount()` in `UsersService` that hard-deletes the user plus cascading data via Prisma; (3) static Terms of Service and Privacy Policy pages; (4) a registration form that already requires both ToS and Privacy checkboxes before submission. The critical gap is that the **backend never records** the legal acceptance -- it is purely a frontend check with no server-side enforcement. The other two gaps are: no data export endpoint exists, and the current deletion is immediate (no 30-day grace period with soft-delete-then-purge pattern).

The data export requires assembling data from ~15 Prisma models scoped to a user/tenant into a machine-readable ZIP archive. The deletion needs to transition from immediate hard-delete to a soft-delete-then-scheduled-purge approach with a 30-day cooling-off period. Legal acceptance needs a new `LegalAcceptance` model and a backend guard to block unauthenticated-but-not-accepted users.

**Primary recommendation:** Add three backend services (`DataExportService`, `AccountDeletionService`, `LegalAcceptanceService`) to the existing `ComplianceModule`, add a `LegalAcceptance` Prisma model, add a `DATA_EXPORT` BullMQ queue for async export, and extend the frontend Settings page with a "Data & Privacy" section containing export/deletion controls.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/common` (StreamableFile) | existing | Stream ZIP exports to client | Built-in NestJS file streaming, no extra deps |
| `archiver` | ^7.x | Generate ZIP archives from JSON streams | De-facto Node.js ZIP library, 15M+ weekly downloads |
| BullMQ | existing | Async data export job queue | Already used extensively in codebase for background jobs |
| Prisma | existing | Data queries + new `LegalAcceptance` model | Already the ORM in use |
| `@nestjs/schedule` | ^6.1.1 | Cron for 30-day purge job | Already installed and used by `DataCleanupService` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `class-validator` | existing | DTO validation for export/deletion requests | Already used in all DTOs |
| `class-transformer` | existing | DTO transformation | Already used |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `archiver` (ZIP) | Raw JSON download (no ZIP) | ZIP bundles multiple files cleanly; archiver is well-maintained and streams without buffering |
| Async BullMQ export | Synchronous StreamableFile | Sync is simpler but risks timeout for large datasets; BullMQ matches existing patterns and allows progress tracking |
| New `LegalAcceptance` model | Reuse `UserConsent` model | UserConsent is for granular feature consent; legal acceptance is a different concept (ToS version, policy version) and should be separate |

**Installation:**
```bash
cd backend && npm install archiver @types/archiver
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/modules/compliance/
├── controllers/
│   ├── gdpr.controller.ts          # existing
│   ├── consent.controller.ts       # existing
│   ├── data-export.controller.ts   # NEW: POST /compliance/data-export, GET /compliance/data-export/:id/download
│   ├── data-deletion.controller.ts # NEW: POST /compliance/data-deletion, DELETE /compliance/data-deletion/cancel
│   └── legal.controller.ts         # NEW: GET /compliance/legal/status, POST /compliance/legal/accept
├── services/
│   ├── gdpr.service.ts             # existing
│   ├── consent.service.ts          # existing
│   ├── consent-enforcement.service.ts # existing
│   ├── data-export.service.ts      # NEW: assembles user data into ZIP
│   ├── account-deletion.service.ts # NEW: soft-delete + 30-day purge
│   └── legal-acceptance.service.ts # NEW: record and check ToS/PP acceptance
├── guards/
│   ├── consent.guard.ts            # existing
│   └── legal-acceptance.guard.ts   # NEW: blocks routes if ToS not accepted
├── dto/
│   ├── data-export.dto.ts          # NEW
│   ├── data-deletion.dto.ts        # NEW
│   └── legal-acceptance.dto.ts     # NEW
└── __tests__/
    ├── data-export.service.spec.ts      # NEW
    ├── account-deletion.service.spec.ts # NEW
    └── legal-acceptance.service.spec.ts # NEW

frontend/
├── components/dashboard/
│   └── data-rights/
│       ├── DataExportPanel.tsx      # NEW: request/download export
│       ├── AccountDeletionPanel.tsx  # NEW: request deletion with grace period
│       └── ExportStatusCard.tsx     # NEW: shows export progress
├── hooks/queries/
│   └── use-data-rights.ts          # NEW: TanStack Query hooks
└── locales/
    ├── en.ts                       # ADD: dataRights section
    └── it.ts                       # ADD: dataRights section
```

### Pattern 1: Async Data Export via BullMQ
**What:** User requests export -> BullMQ job assembles data -> stores temp file -> user downloads
**When to use:** Data export can be large (thousands of emails, contacts, calendar events)
**Example:**
```typescript
// Source: Existing BullMQ patterns in codebase (scheduled-jobs.queue.ts, email-embedding.queue.ts)

// 1. Controller receives request
@Post('data-export')
async requestExport(@Request() req: AuthenticatedRequest) {
  return this.dataExportService.requestExport(req.user.userId, req.user.tenantId);
}

// 2. Service enqueues BullMQ job
async requestExport(userId: string, tenantId: string) {
  // Create export request record in DB
  const exportRequest = await this.prisma.dataExportRequest.create({
    data: { userId, tenantId, status: 'PENDING' },
  });
  // Add to BullMQ queue
  await this.exportQueue.add('data-export', {
    exportId: exportRequest.id,
    userId,
    tenantId,
  });
  return { exportId: exportRequest.id, status: 'PENDING' };
}

// 3. Worker processes export
async processExport(job: Job) {
  const { exportId, userId, tenantId } = job.data;
  // Query all user data from Prisma
  // Write to temp ZIP file using archiver
  // Update export request status to READY
  // Set expiry (e.g., 48 hours)
}

// 4. User downloads via StreamableFile
@Get('data-export/:id/download')
async downloadExport(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
  const filePath = await this.dataExportService.getExportFilePath(id, req.user.userId);
  const stream = createReadStream(filePath);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="pmsync-export-${id}.zip"`,
  });
  return new StreamableFile(stream);
}
```

### Pattern 2: Soft-Delete with Scheduled Hard-Purge
**What:** User requests deletion -> immediate soft-delete (set deletedAt, deactivate) -> 30-day cron purges
**When to use:** GDPR Article 17 erasure with grace period for accidental deletion recovery
**Example:**
```typescript
// Source: Existing patterns in tenant.service.ts (deleteTenant) + data-cleanup.service.ts (Cron)

// 1. Soft-delete: mark user as deleted, deactivate, invalidate sessions
async requestDeletion(userId: string, tenantId: string) {
  await this.prisma.$transaction(async (tx) => {
    // Set deletedAt and deactivate
    await tx.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });
    // Invalidate all sessions
    await tx.session.deleteMany({ where: { userId } });
  });
  // Audit log the request
  await this.auditService.logAudit(tenantId, userId, 'DELETION_REQUESTED', 'User', userId);
  return { status: 'SCHEDULED', purgeDate: addDays(new Date(), 30) };
}

// 2. Cancel deletion (within 30 days)
async cancelDeletion(userId: string) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null, isActive: true },
  });
}

// 3. Cron job: purge users past 30-day grace period
@Cron('0 2 * * *') // Daily at 2 AM
async purgeExpiredDeletions() {
  const cutoff = subDays(new Date(), 30);
  const users = await this.prisma.user.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, tenantId: true },
  });
  for (const user of users) {
    await this.hardDeleteUser(user.id, user.tenantId);
  }
}
```

### Pattern 3: Legal Acceptance Guard
**What:** Middleware/guard that blocks all authenticated requests until user has accepted current ToS/PP version
**When to use:** LEGAL-01, LEGAL-02 requirements -- enforce before any app usage
**Example:**
```typescript
// Source: Existing ConsentGuard pattern in guards/consent.guard.ts

@Injectable()
export class LegalAcceptanceGuard implements CanActivate {
  constructor(private legalService: LegalAcceptanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { userId, tenantId } = request.user;

    const accepted = await this.legalService.hasAcceptedCurrentVersions(userId, tenantId);
    if (!accepted) {
      throw new ForbiddenException('You must accept the current Terms of Service and Privacy Policy');
    }
    return true;
  }
}
```

### Anti-Patterns to Avoid
- **Client-only ToS validation:** The current register page checks ToS/Privacy checkboxes but never sends acceptance to backend. This is the exact anti-pattern -- the backend MUST record acceptance with timestamp, IP, version.
- **Immediate hard-delete for GDPR erasure:** Current `deleteUserAccount()` does an immediate hard-delete. GDPR allows 30 days to respond; a grace period prevents accidental irreversible data loss.
- **Synchronous large data export:** Querying all emails+contacts+calendar+AI history in a single request will timeout. Use async BullMQ job.
- **Exporting sensitive credentials in data export:** OAuth tokens, password hashes, MFA secrets must be EXCLUDED from data portability exports. Only user-generated content qualifies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP archive generation | Custom binary ZIP builder | `archiver` npm package | ZIP format has edge cases (large file support, UTF-8 filenames, streaming); archiver handles all |
| File streaming response | Manual `res.write()` + `res.end()` | NestJS `StreamableFile` | Integrates with NestJS interceptors, error handling, headers management |
| Background job queue | Custom setTimeout/setInterval | BullMQ (already in codebase) | Persistence, retries, deduplication, distributed locking already configured |
| Cron scheduling | Custom date checking | `@nestjs/schedule` `@Cron` (already in codebase) | Already used by DataCleanupService; consistent pattern |

**Key insight:** Every infrastructure piece needed (BullMQ, Cron, Prisma, StreamableFile) already exists in this codebase. The phase is about wiring new services into existing patterns, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Not Recording Legal Acceptance Server-Side
**What goes wrong:** Frontend-only checkbox provides zero legal evidence. If challenged, there is no server-side proof the user accepted specific ToS/PP versions on specific dates.
**Why it happens:** Developers treat checkboxes as UX, not as legal evidence.
**How to avoid:** Create `LegalAcceptance` Prisma model with `userId`, `documentType` (ToS/PP), `documentVersion`, `acceptedAt`, `ipAddress`, `userAgent`. Record on registration AND on re-acceptance when versions change.
**Warning signs:** No database table for legal acceptance; checkbox only in frontend code.

### Pitfall 2: Including Sensitive Data in Export
**What goes wrong:** Data export includes OAuth tokens, password hashes, MFA secrets, encryption keys.
**Why it happens:** Developer queries all columns without filtering.
**How to avoid:** Explicitly select only user-generated content columns. NEVER include: `passwordHash`, `secret`, `encryptionIv`, `accessToken`, `refreshToken`, OAuth credentials.
**Warning signs:** Using `findMany()` without `select` clause on sensitive models.

### Pitfall 3: Forgetting Cascade Implications on Soft-Delete
**What goes wrong:** Current `User.delete()` triggers Prisma cascade deletes on ALL related records (emails, contacts, preferences, etc.). Switching to soft-delete (just setting `deletedAt`) means related data remains accessible.
**Why it happens:** Prisma `onDelete: Cascade` only fires on actual DELETE, not on UPDATE (soft-delete).
**How to avoid:** The soft-delete must also deactivate the user (`isActive: false`), invalidate sessions, and all queries throughout the app already filter by tenant scoping. The hard-purge cron then does the actual DELETE which triggers cascades.
**Warning signs:** User is "deleted" but their emails still appear in search results.

### Pitfall 4: Export Job Never Cleaned Up
**What goes wrong:** Export ZIP files accumulate on disk indefinitely.
**Why it happens:** No cleanup cron for temporary export files.
**How to avoid:** Set export file expiry (48-72 hours) in the `DataExportRequest` record. Add cleanup to existing `DataCleanupService` cron. Also mark export as EXPIRED in DB after cleanup.
**Warning signs:** Disk usage growing linearly over time.

### Pitfall 5: Re-Acceptance Flow Missing
**What goes wrong:** ToS version changes but existing users are never prompted to re-accept.
**Why it happens:** Only checking acceptance on registration, not on login/app load.
**How to avoid:** `LegalAcceptanceGuard` checks CURRENT version on every authenticated request. When version changes, guard returns 403 with a specific error code, and frontend shows re-acceptance dialog.
**Warning signs:** `CURRENT_TOS_VERSION` constant exists but guard only checks `hasAny` not `hasCurrent`.

## Code Examples

### Data Export: Assembling User Data
```typescript
// Source: Verified against existing Prisma schema models

interface ExportData {
  profile: object;
  preferences: object;
  emails: object[];
  contacts: object[];
  calendarEvents: object[];
  aiHistory: object[];
  consentHistory: object[];
  auditLogs: object[];
}

async assembleUserData(userId: string, tenantId: string): Promise<ExportData> {
  const [profile, preferences, emails, contacts, events, aiMemories, consents, audits] =
    await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, createdAt: true, lastLogin: true,
          // EXCLUDE: passwordHash, deletedAt
        },
      }),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          theme: true, language: true, timezone: true, emailDensity: true,
          aiSmartRepliesEnabled: true, aiSummarizationEnabled: true,
          // EXCLUDE: id, tenantId (internal)
        },
      }),
      this.prisma.email.findMany({
        where: { tenantId },
        select: {
          subject: true, from: true, to: true, cc: true, bcc: true,
          textBody: true, htmlBody: true, receivedAt: true, sentAt: true,
          isRead: true, isStarred: true, isDraft: true,
          // EXCLUDE: externalId, providerId (internal)
        },
        take: 50000, // Safety limit
      }),
      this.prisma.contact.findMany({
        where: { tenantId },
        select: {
          displayName: true, emails: true, phoneNumbers: true,
          company: true, jobTitle: true, department: true, notes: true,
          tags: true, birthday: true, addresses: true,
        },
      }),
      this.prisma.calendarEvent.findMany({
        where: { tenantId },
        select: {
          title: true, description: true, startTime: true, endTime: true,
          location: true, isAllDay: true, recurrence: true, attendees: true,
        },
      }),
      this.prisma.aIMemory.findMany({
        where: { tenantId },
        select: {
          key: true, value: true, category: true, createdAt: true,
        },
      }),
      this.prisma.userConsent.findMany({
        where: { userId, tenantId },
        select: {
          feature: true, granted: true, version: true, createdAt: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: { userId, tenantId },
        select: {
          action: true, entity: true, entityId: true, createdAt: true,
        },
        take: 10000,
      }),
    ]);

  return {
    profile: profile ?? {},
    preferences: preferences ?? {},
    emails: emails ?? [],
    contacts: contacts ?? [],
    calendarEvents: events ?? [],
    aiHistory: aiMemories ?? [],
    consentHistory: consents ?? [],
    auditLogs: audits ?? [],
  };
}
```

### Prisma Model: LegalAcceptance
```prisma
// Source: Derived from existing UserConsent model pattern

model LegalAcceptance {
  id              String   @id @default(cuid())
  tenantId        String
  userId          String
  documentType    String   // 'TOS' or 'PRIVACY_POLICY'
  documentVersion String   // e.g., '1.0', '1.1'
  acceptedAt      DateTime @default(now())
  ipAddress       String?
  userAgent       String?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, documentType, acceptedAt(sort: Desc)])
  @@index([tenantId, documentType])
  @@map("legal_acceptances")
}
```

### Prisma Model: DataExportRequest
```prisma
model DataExportRequest {
  id          String    @id @default(cuid())
  tenantId    String
  userId      String
  status      String    @default("PENDING") // PENDING, PROCESSING, READY, EXPIRED, FAILED
  filePath    String?   // Path to generated ZIP
  fileSize    Int?      // Size in bytes
  expiresAt   DateTime? // When the download link expires
  error       String?
  createdAt   DateTime  @default(now())
  completedAt DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([expiresAt])
  @@map("data_export_requests")
}
```

### ZIP Generation with Archiver
```typescript
// Source: archiver npm package (https://www.npmjs.com/package/archiver)
import * as archiver from 'archiver';
import { createWriteStream } from 'fs';
import { join } from 'path';

async generateExportZip(exportId: string, data: ExportData): Promise<string> {
  const exportDir = join(process.cwd(), 'tmp', 'exports');
  await fs.mkdir(exportDir, { recursive: true });
  const filePath = join(exportDir, `export-${exportId}.zip`);

  const output = createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.pipe(output);

  // Add each data category as a separate JSON file
  archive.append(JSON.stringify(data.profile, null, 2), { name: 'profile.json' });
  archive.append(JSON.stringify(data.preferences, null, 2), { name: 'preferences.json' });
  archive.append(JSON.stringify(data.emails, null, 2), { name: 'emails.json' });
  archive.append(JSON.stringify(data.contacts, null, 2), { name: 'contacts.json' });
  archive.append(JSON.stringify(data.calendarEvents, null, 2), { name: 'calendar-events.json' });
  archive.append(JSON.stringify(data.aiHistory, null, 2), { name: 'ai-history.json' });
  archive.append(JSON.stringify(data.consentHistory, null, 2), { name: 'consent-history.json' });
  archive.append(JSON.stringify(data.auditLogs, null, 2), { name: 'audit-logs.json' });

  // Add metadata
  archive.append(JSON.stringify({
    exportDate: new Date().toISOString(),
    format: 'GDPR Article 20 Data Portability Export',
    application: 'PMSync',
    version: '1.0',
  }, null, 2), { name: 'metadata.json' });

  await archive.finalize();

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(filePath));
    archive.on('error', reject);
  });
}
```

## Existing Codebase Assets (What Already Works)

| Asset | Location | Relevance |
|-------|----------|-----------|
| `GdprService` | `compliance/services/gdpr.service.ts` | Has `purgeExternalTenantData()` for Mistral cleanup; extend for user-level purge |
| `deleteUserAccount()` | `users/services/users.service.ts` | Current immediate hard-delete; refactor to soft-delete + schedule |
| `DataCleanupService` | `common/services/data-cleanup.service.ts` | Has `@Cron` pattern; add purge-expired-deletions job here |
| `ConsentService` | `compliance/services/consent.service.ts` | Pattern for append-only records with versioning; reuse for LegalAcceptance |
| `ConsentGuard` | `compliance/guards/consent.guard.ts` | Pattern for LegalAcceptanceGuard |
| `ScheduledJobsQueueService` | `common/services/scheduled-jobs.queue.ts` | BullMQ repeatable job pattern; add DATA_EXPORT_CLEANUP |
| Register page checkboxes | `frontend/pages/auth/register.tsx` | Already has ToS + Privacy checkboxes; needs to POST acceptance to backend |
| Privacy Policy page | `frontend/pages/privacy.tsx` | Static page exists; no changes needed |
| Terms of Service page | `frontend/pages/terms.tsx` | Static page exists; no changes needed |
| Settings with ConsentSettings | `frontend/components/dashboard/Settings.tsx` | Already has "Privacy & Consent" section; add "Data & Privacy" subsection |
| AccountSettings (danger zone) | `frontend/components/settings/AccountSettings.tsx` | Has delete dialog; refactor to show grace period info |
| Prisma cascades | `schema.prisma` | All relations use `onDelete: Cascade`; hard-delete of User triggers full cleanup |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Frontend-only ToS checkbox | Server-side legal acceptance record with version tracking | GDPR enforcement since 2018 | Without server record, no legal proof of acceptance |
| Immediate hard-delete on erasure request | Soft-delete + 30-day grace period + scheduled hard-purge | GDPR Article 17 best practice | Prevents accidental irreversible data loss; still compliant |
| Sync data export endpoint | Async BullMQ job + download link | Standard for datasets >10MB | Prevents HTTP timeouts, enables progress tracking |
| Single monolithic JSON export | ZIP with individual JSON files per data category | Common practice since 2020 | Better organization, easier for users to find specific data |

**Deprecated/outdated:**
- Manual CSV export: JSON is the standard machine-readable format for structured data (GDPR Article 20)
- Synchronous large export: Times out for users with thousands of emails

## Open Questions

1. **Export file storage location**
   - What we know: Temp files need to be written somewhere and cleaned up after 48-72 hours
   - What's unclear: Should exports go to local filesystem (`tmp/exports/`) or a cloud storage (S3)?
   - Recommendation: Start with local filesystem. The codebase has no S3 integration currently. Add a `DATA_EXPORT_DIR` env var defaulting to `tmp/exports/`. If S3 is needed later, swap the storage backend.

2. **ToS/Privacy Policy version tracking**
   - What we know: The static pages at `/terms` and `/privacy` exist but have no version number
   - What's unclear: How to detect when content changes and bump version
   - Recommendation: Use a simple constant `CURRENT_TOS_VERSION = '1.0'` and `CURRENT_PP_VERSION = '1.0'` in a `legal.constants.ts` file. When pages are updated, manually bump the version. The guard checks against these constants.

3. **Multi-tenant data export scope**
   - What we know: Users belong to a tenant. Emails/contacts/calendar are scoped to tenant, not individual user.
   - What's unclear: Should a non-admin user export only their personal data, or all tenant data they have access to?
   - Recommendation: Export all tenant data the user has access to. In a single-user-per-tenant setup (typical for this app), this is all tenant data. For multi-user tenants, admin should be able to export all; regular users export only their own profile + shared tenant data.

4. **Existing `deleteUserAccount()` refactor risk**
   - What we know: `UsersService.deleteUserAccount()` currently does immediate hard-delete
   - What's unclear: Is anything downstream depending on the immediate deletion behavior?
   - Recommendation: Carefully trace all callers of `deleteUserAccount()`. The only caller is `UsersController.deleteMyAccount()`. The refactor to soft-delete should be safe, but the frontend AccountSettings component needs to be updated to show the grace period message instead of "account deleted".

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/modules/compliance/` (all files read and analyzed)
- Codebase analysis: `backend/prisma/schema.prisma` (full model inventory)
- Codebase analysis: `backend/src/modules/users/services/users.service.ts` (deleteUserAccount)
- Codebase analysis: `backend/src/modules/tenants/services/tenant.service.ts` (deleteTenant, hardDeleteTenant)
- Codebase analysis: `backend/src/common/services/data-cleanup.service.ts` (Cron patterns)
- Codebase analysis: `backend/src/common/services/scheduled-jobs.queue.ts` (BullMQ patterns)
- Codebase analysis: `frontend/pages/auth/register.tsx` (existing ToS checkboxes)
- Codebase analysis: `frontend/components/dashboard/Settings.tsx` (settings structure)
- [GDPR Article 20 - Right to data portability](https://gdpr-info.eu/art-20-gdpr/) - Legal requirements
- [GDPR Article 17 - Right to erasure](https://gdpr-info.eu/art-17-gdpr/) - Legal requirements
- [NestJS StreamableFile docs](https://docs.nestjs.com/techniques/streaming-files) - File streaming API
- [archiver npm](https://www.npmjs.com/package/archiver) - ZIP generation library

### Secondary (MEDIUM confidence)
- [ICO Right to data portability guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability) - UK implementation guidance
- [GDPR data portability format requirements](https://gdprlocal.com/right-to-data-portability/) - JSON/CSV/XML format guidance
- [NestJS streaming large files](https://www.telerik.com/blogs/how-stream-large-files-handle-data-efficiently-nodejs-streams-nestjs) - Streaming patterns

### Tertiary (LOW confidence)
- [GDPR soft-delete patterns (HN discussion)](https://news.ycombinator.com/item?id=16366050) - Community patterns for soft-delete (anecdotal)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already exist in codebase or are well-established (archiver)
- Architecture: HIGH - Patterns directly derived from existing codebase services (BullMQ, Cron, Guards)
- Pitfalls: HIGH - Identified from actual codebase analysis (current deleteUserAccount is immediate, no server-side legal record)
- Data model: HIGH - Prisma schema fully analyzed; cascade behavior verified
- Frontend integration: HIGH - Registration page and Settings component already inspected

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable domain; GDPR requirements don't change frequently)
