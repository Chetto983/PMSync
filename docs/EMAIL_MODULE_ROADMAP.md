# Email Module Roadmap

**Created:** 2025-12-27
**Last Updated:** 2025-12-27
**Status:** Active Development
**Module:** `backend/src/modules/email/`

---

## Executive Summary

This roadmap outlines prioritized improvements for the **email module** based on a comprehensive code audit. The email module handles core email functionality including sending, fetching, storage, attachments, cleanup, and calendar integration.

### Audit Summary

| Category | Count | Effort (Hours) |
|----------|-------|----------------|
| **Critical Bugs** | 2 | 4-6h |
| **High Priority Bugs** | 7 | 14-20h |
| **Medium Priority Bugs** | 10 | 15-20h |
| **Low Priority Bugs** | 4 | 4-6h |
| **Race Conditions (Unfixed)** | 6 | 12-18h |
| **Duplicate Code Patterns** | 13 | 8-12h |
| **Total Technical Debt** | 42 issues | ~60-80h |

### Risk Assessment

| Risk Level | Issues | Impact |
|------------|--------|--------|
| CRITICAL | BUG-001, BUG-002 | Security breach, authentication failure |
| HIGH | 7 bugs + 2 race conditions | Data loss, service disruption |
| MEDIUM | 10 bugs + 4 race conditions | Degraded UX, inconsistent state |
| LOW | 4 bugs + code quality | Technical debt accumulation |

---

## Module Architecture

```
backend/src/modules/email/
├── controllers/
│   ├── emails.controller.ts      # REST API endpoints
│   ├── attachments.controller.ts # Attachment download/upload
│   └── folders.controller.ts     # Folder operations
├── services/
│   ├── email.service.ts          # Core email operations
│   ├── emails.service.ts         # Email list/CRUD operations
│   ├── email-fetch.service.ts    # On-demand email fetching
│   ├── email-send.service.ts     # SMTP/API email sending
│   ├── email-sync-back.service.ts# Sync changes to providers
│   ├── email-cleanup.service.ts  # Retention & orphan cleanup
│   ├── email-retention.service.ts# Retention policies
│   ├── scheduled-email.service.ts# Scheduled sending
│   ├── attachment.storage.ts     # S3 attachment storage
│   ├── attachment-on-demand.service.ts # Lazy attachment download
│   ├── attachment-metrics.service.ts   # Metrics collection
│   └── storage.service.ts        # S3 client wrapper
├── dto/
│   └── send-email.dto.ts         # Request/response DTOs
├── email.module.ts               # Module definition
└── email.helpers.ts              # Shared utilities
```

### Service Dependencies

```
EmailsController
    ├── EmailsService (CRUD operations)
    ├── EmailFetchService (on-demand fetch)
    ├── EmailSendService (sending)
    ├── EmailCleanupService (cleanup)
    ├── StorageService (S3 operations)
    ├── AttachmentOnDemandService (lazy download)
    ├── IcsGeneratorService (calendar)
    └── CalendarService (calendar events)

EmailsService
    ├── PrismaService (database)
    ├── EmailSyncBackService (provider sync)
    ├── RealtimeEventsService (WebSocket)
    └── KnowledgeBaseService (embeddings)

EmailSendService
    ├── CryptoService (credential decryption)
    ├── PrismaService (database)
    └── EmailSyncModule services
```

---

## Phase 1: Critical Security Fixes (Week 1)

**Goal:** Address security vulnerabilities that could lead to data breaches
**Effort:** 4-6 hours
**Priority:** CRITICAL - Must complete before any other work

### 1.1 BUG-001: Missing Tenant Validation in IMAP Batch Lookup

**File:** `email-sync-back.service.ts:1171-1176`
**Severity:** CRITICAL
**Impact:** Cross-tenant data access vulnerability

**Current Code (Vulnerable):**

```typescript
// Line 1171-1176 - No tenantId filter!
if (!folder) {
  const email = await this.prisma.email.findUnique({
    where: { id: op.emailId },
    select: { folder: true },
  });
  folder = email?.folder || 'INBOX';
}
```

**Problem:** The `findUnique` query uses only `emailId` without tenant validation. A malicious actor could potentially access email folder information from other tenants.

**Fix:**

```typescript
if (!folder) {
  const email = await this.prisma.email.findFirst({
    where: {
      id: op.emailId,
      tenantId: op.tenantId, // CRITICAL: Add tenant filter
    },
    select: { folder: true },
  });
  if (!email) {
    this.logger.warn(`Email ${op.emailId} not found for tenant ${op.tenantId}, skipping`);
    continue;
  }
  folder = email.folder || 'INBOX';
}
```

**Testing:**

- Unit test: Verify tenant isolation with real data from different tenants
- Integration test: Attempt cross-tenant email lookup, expect failure
- Security audit: Review all `findUnique` calls for tenant validation

---

### 1.2 BUG-002: Empty String Returns for Missing SMTP Password

**File:** `email-send.service.ts:286-296`
**Severity:** CRITICAL
**Impact:** Silent authentication failure, email send appears successful but fails

**Current Code (Vulnerable):**
```typescript
private async getSmtpPassword(provider: ProviderConfig): Promise<string> {
  if (provider.smtpPassword && provider.smtpEncryptionIv) {
    return this.crypto.decrypt(provider.smtpPassword, provider.smtpEncryptionIv);
  }
  if (provider.imapPassword && provider.imapEncryptionIv) {
    return this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
  }
  return ''; // BUG: Returns empty string instead of throwing
}
```

**Problem:** Returning empty string allows SMTP connection to proceed without authentication, leading to:
- Silent connection failures
- Potential security issues with unauthenticated SMTP
- Confusing error messages for users

**Fix:**
```typescript
private async getSmtpPassword(provider: ProviderConfig): Promise<string> {
  // Try SMTP password first
  if (provider.smtpPassword && provider.smtpEncryptionIv) {
    return this.crypto.decrypt(provider.smtpPassword, provider.smtpEncryptionIv);
  }
  // Fall back to IMAP password (common for same-server setups)
  if (provider.imapPassword && provider.imapEncryptionIv) {
    return this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
  }
  // CRITICAL FIX: Throw descriptive error
  throw new BadRequestException(
    `SMTP password not configured for provider ${provider.id}. ` +
    'Please update provider settings with SMTP credentials.'
  );
}
```

**Testing:**
- Unit test: Verify exception thrown when both passwords missing
- Unit test: Verify IMAP fallback works correctly
- Integration test: Attempt send with unconfigured provider

---

## Phase 2: High Priority Bugs & Race Conditions (Week 2-3)

**Goal:** Fix data integrity issues and race conditions
**Effort:** 26-38 hours
**Priority:** HIGH - Address within 2 weeks

### 2.1 High Priority Bugs

#### BUG-003: Null Pointer in Attachment Parsing

**File:** `scheduled-email.service.ts:234-252`
**Severity:** HIGH
**Impact:** Scheduled email fails if attachments JSON is malformed

**Current Code:**
```typescript
if (scheduled.attachments) {
  try {
    const parsed = JSON.parse(scheduled.attachments as string) as {...}[];
    attachments = parsed.map(att => ({
      filename: att.filename,        // Can be undefined
      contentType: att.contentType,  // Can be undefined
      content: Buffer.from(att.contentBase64, 'base64'), // Crashes if undefined
    }));
  } catch (parseError) {...}
}
```

**Fix:**
```typescript
if (scheduled.attachments) {
  try {
    const parsed = JSON.parse(scheduled.attachments as string);
    if (!Array.isArray(parsed)) {
      throw new Error('Attachments must be an array');
    }
    attachments = parsed
      .filter(att => att && typeof att === 'object')
      .map(att => {
        if (!att.filename || !att.contentBase64) {
          this.logger.warn(`Invalid attachment in scheduled email ${scheduled.id}: missing required fields`);
          return null;
        }
        return {
          filename: String(att.filename),
          contentType: att.contentType || 'application/octet-stream',
          content: Buffer.from(att.contentBase64, 'base64'),
        };
      })
      .filter((att): att is NonNullable<typeof att> => att !== null);
  } catch (parseError) {...}
}
```

---

#### BUG-004: Missing Null Check for body.response

**File:** `emails.controller.ts:319-321`
**Severity:** HIGH
**Impact:** 500 error when responding to calendar invite without response field

**Current Code:**
```typescript
@Body() body: { response: 'accept' | 'decline' | 'tentative' },
) {
  const response = body.response?.toLowerCase();
  if (!['accept', 'decline', 'tentative'].includes(response)) { // response can be undefined
```

**Fix:**
```typescript
@Body() body: { response: 'accept' | 'decline' | 'tentative' },
) {
  if (!body?.response) {
    throw new BadRequestException('response field is required');
  }
  const response = body.response.toLowerCase();
  if (!['accept', 'decline', 'tentative'].includes(response)) {
    throw new BadRequestException('response must be one of: accept, decline, tentative');
  }
```

---

#### BUG-005: Unchecked Array Access in decodeAttachments

**File:** `emails.controller.ts:55-65`
**Severity:** HIGH
**Impact:** Crashes if contentBase64 is undefined or malformed

**Current Code:**
```typescript
const decodeAttachments = (attachments?: EmailAttachmentDto[]) =>
  attachments?.map((attachment) => {
    const [, base64 = attachment.contentBase64] =
      attachment.contentBase64.split(',');  // Crashes if undefined
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: Buffer.from(base64, 'base64'),
    };
  });
```

**Fix:**
```typescript
const decodeAttachments = (attachments?: EmailAttachmentDto[]): DecodedAttachment[] | undefined => {
  if (!attachments?.length) return undefined;

  return attachments
    .filter(att => att?.contentBase64 && att?.filename)
    .map((attachment) => {
      // Handle data URI format: "data:mime/type;base64,XXXX"
      const base64Data = attachment.contentBase64.includes(',')
        ? attachment.contentBase64.split(',')[1]
        : attachment.contentBase64;

      return {
        filename: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        content: Buffer.from(base64Data, 'base64'),
      };
    });
};
```

---

#### BUG-006: Memory Exhaustion in IMAP Download

**File:** `attachment-on-demand.service.ts:387-398`
**Severity:** HIGH
**Impact:** OOM crash when downloading large attachments

**Current Code:**
```typescript
const chunks: Buffer[] = [];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit
let totalBytes = 0;

for await (const chunk of source.content) {
  totalBytes += chunk.length;
  if (totalBytes > MAX_SIZE) {
    throw new Error(`IMAP message exceeds ${MAX_SIZE} bytes limit`);
  }
  chunks.push(chunk);  // Memory keeps growing until limit
}
```

**Fix:**
```typescript
const chunks: Buffer[] = [];
const MAX_SIZE = parseInt(process.env.IMAP_MAX_MESSAGE_SIZE || '10485760', 10);
let totalBytes = 0;

for await (const chunk of source.content) {
  totalBytes += chunk.length;
  if (totalBytes > MAX_SIZE) {
    // Clear accumulated chunks before throwing to free memory
    chunks.length = 0;
    throw new PayloadTooLargeException(
      `Message size (${(totalBytes / 1024 / 1024).toFixed(2)}MB) exceeds limit (${(MAX_SIZE / 1024 / 1024).toFixed(2)}MB)`
    );
  }
  chunks.push(chunk);
}

// Use Buffer.concat only once at the end
const messageBuffer = Buffer.concat(chunks);
// Clear chunks array to allow GC
chunks.length = 0;
```

---

#### BUG-007: Missing Validation for 'to' Array

**File:** `emails.controller.ts:512-513`
**Severity:** HIGH
**Impact:** Calendar invite sent without recipients

**Fix:**
```typescript
// Add validation at the start of sendCalendarInvite
if (!body.to?.length) {
  throw new BadRequestException('At least one recipient is required');
}

// Validate each recipient
for (const recipient of body.to) {
  if (!recipient.email || !this.isValidEmail(recipient.email)) {
    throw new BadRequestException(`Invalid recipient email: ${recipient.email}`);
  }
}
```

---

#### BUG-008: Null Reference in extractEmailFromString

**File:** `emails.controller.ts:341-345`
**Severity:** HIGH
**Impact:** Null reference if email string is empty

**Current Code:**
```typescript
const attendeeEmail =
  email.provider?.email ||
  this.extractEmailFromString(req.user?.email) ||
  this.extractEmailFromString(email.to?.[0]);  // Can pass undefined
```

**Fix:**
```typescript
private extractEmailFromString(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;

  // Handle "Name <email@example.com>" format
  const match = input.match(/<([^>]+)>/);
  if (match) return match[1];

  // Handle plain email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input.trim()) ? input.trim() : null;
}
```

---

#### BUG-009: S3 Batch Delete Doesn't Track Failed Keys

**File:** `email-cleanup.service.ts:481-495`
**Severity:** HIGH
**Impact:** Orphaned S3 objects when partial batch delete fails

**Current Issue:** AWS S3 `deleteObjects` returns which keys failed, but the code tracks all keys as orphans instead of only failed ones.

**Fix:**
```typescript
try {
  const result = await this.storage.deleteObjects(s3Keys);

  // Track only specifically failed keys as orphans
  if (result.errors?.length) {
    for (const error of result.errors) {
      this.orphanedS3Keys.set(error.key, {
        key: error.key,
        tenantId,
        failedAt: new Date(),
        errorCode: error.code,
        errorMessage: error.message,
      });
      orphanedKeys.push(error.key);
    }

    this.logger.warn({
      event: 'orphan_s3_detected',
      emailId: id,
      tenantId,
      orphanedCount: result.errors.length,
      keys: result.errors.map(e => e.key).slice(0, 5),
    });
  }

  s3Deleted += result.deleted;
  s3Failed += result.errors?.length || 0;
} catch (error) {
  // Complete failure - all keys are orphans
  ...
}
```

---

### 2.2 Race Conditions (Unfixed)

#### RC-NEW-3: TOCTOU in deleteEmail Soft/Hard Decision

**File:** `emails.service.ts:668-754`
**Severity:** HIGH
**Impact:** Email deleted twice or inconsistent state

**Current Flow:**
```typescript
async deleteEmail(id: string, tenantId: string) {
  const email = await this.prisma.email.findFirst({...}); // Read

  if (!email) throw new NotFoundException(...);

  // Gap: Another request could modify isDeleted here

  if (email.isDeleted) {
    // Hard delete path
    await this.prisma.$transaction(...);
  } else {
    // Soft delete path
    await this.prisma.email.update({...});
  }
}
```

**Fix using optimistic locking:**
```typescript
async deleteEmail(id: string, tenantId: string) {
  return this.prisma.$transaction(async (tx) => {
    // Lock the row with FOR UPDATE
    const email = await tx.$queryRaw<Email[]>`
      SELECT * FROM "Email"
      WHERE id = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;

    if (!email.length) {
      throw new NotFoundException('Email not found');
    }

    const [record] = email;

    if (record.isDeleted) {
      // Hard delete - already in transaction
      await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
      await tx.email.delete({ where: { id } });
      return { success: true, action: 'hard_delete' };
    }

    // Soft delete
    const trashFolder = await this.getTrashFolderPath(record.providerId);
    await tx.email.update({
      where: { id },
      data: { isDeleted: true, folder: trashFolder },
    });
    await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);

    return { success: true, action: 'soft_delete' };
  });
}
```

---

#### RC-NEW-6: In-Memory orphanedS3Keys Not Distributed

**File:** `email-cleanup.service.ts:62`
**Severity:** HIGH
**Impact:** Orphan tracking lost on restart, inconsistent across instances

**Current Code:**
```typescript
private orphanedS3Keys: Map<string, {...}> = new Map();
```

**Fix - Use Redis for distributed tracking:**
```typescript
// Add Redis-backed orphan tracking
private readonly ORPHAN_KEY_PREFIX = 'email:orphan:s3:';
private readonly ORPHAN_TTL = 7 * 24 * 60 * 60; // 7 days

async trackOrphanedKey(key: string, tenantId: string, error?: string): Promise<void> {
  const redisKey = `${this.ORPHAN_KEY_PREFIX}${key}`;
  await this.redis.hset(redisKey, {
    key,
    tenantId,
    failedAt: new Date().toISOString(),
    error: error || 'unknown',
  });
  await this.redis.expire(redisKey, this.ORPHAN_TTL);
}

async getOrphanedKeys(limit = 100): Promise<OrphanedKey[]> {
  const keys = await this.redis.keys(`${this.ORPHAN_KEY_PREFIX}*`);
  const orphans: OrphanedKey[] = [];

  for (const key of keys.slice(0, limit)) {
    const data = await this.redis.hgetall(key);
    if (data) {
      orphans.push({
        key: data.key,
        tenantId: data.tenantId,
        failedAt: new Date(data.failedAt),
      });
    }
  }
  return orphans;
}
```

---

#### RC-NEW-1: TOCTOU in updateEmail

**File:** `emails.service.ts:524-598`
**Severity:** MEDIUM
**Impact:** Lost updates when concurrent modifications

**Fix:** Use optimistic locking with version field or transaction with FOR UPDATE.

---

#### RC-NEW-4: S3 putObjectIfAbsent Race

**File:** `storage.service.ts:60-68`
**Severity:** MEDIUM
**Impact:** Duplicate uploads when concurrent requests

**Current Code:**
```typescript
async putObjectIfAbsent(key: string, body: Buffer, contentType: string): Promise<'uploaded' | 'skipped'> {
  const exists = await this.objectExists(key);  // Check
  if (exists) return 'skipped';
  await this.putObject(key, body, contentType); // Act
  return 'uploaded';
}
```

**Fix using S3 conditional writes (if available) or distributed lock:**
```typescript
async putObjectIfAbsent(key: string, body: Buffer, contentType: string): Promise<'uploaded' | 'skipped'> {
  const lockKey = `s3:upload:${key}`;

  return this.redisLock.tryWithLock(lockKey, 30000, async () => {
    const exists = await this.objectExists(key);
    if (exists) return 'skipped';
    await this.putObject(key, body, contentType);
    return 'uploaded';
  }, () => {
    // Lock failed - assume another instance is uploading
    return 'skipped';
  });
}
```

---

#### RC-NEW-7: In-Memory Metrics Counters

**File:** `attachment-metrics.service.ts:82-86`
**Severity:** LOW
**Impact:** Metrics inconsistent across instances, lost on restart

**Fix:** Use Redis counters or Prometheus/OpenTelemetry integration.

---

#### RC-NEW-8: Calendar Event Creation Race

**File:** `emails.controller.ts:401-461`
**Severity:** MEDIUM
**Impact:** Duplicate calendar events created

**Fix:** Use iCalUID as unique constraint with upsert:
```typescript
const event = await this.prisma.calendarEvent.upsert({
  where: {
    tenantId_providerId_iCalUID: {
      tenantId,
      providerId: email.providerId,
      iCalUID: invite.uid,
    },
  },
  create: {...},
  update: {...},
});
```

---

## Phase 3: Code Consolidation (Week 4)

**Goal:** Eliminate duplicate code patterns for maintainability
**Effort:** 8-12 hours
**Priority:** HIGH - Reduces maintenance burden

### 3.1 Extract Common Utilities

#### DUP-1: formatBytes() - 5 Files

**Files:**
- `attachment.storage.ts`
- `attachment-on-demand.service.ts`
- `email-cleanup.service.ts`
- `attachment-metrics.service.ts`
- `common/services/log-rotation.service.ts`

**Create:** `backend/src/common/utils/format.utils.ts`

```typescript
/**
 * Format bytes into human-readable string
 * @param bytes - Number of bytes
 * @param decimals - Decimal places (default: 2)
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  if (bytes < 0) return 'Invalid size';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Parse formatted bytes string back to number
 * @param str - Formatted string (e.g., "1.5 MB")
 * @returns Number of bytes
 */
export function parseBytes(str: string): number {
  const match = str.match(/^([\d.]+)\s*(Bytes|KB|MB|GB|TB|PB)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units: Record<string, number> = {
    BYTES: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    PB: 1024 ** 5,
  };

  return value * (units[unit] || 1);
}
```

---

#### DUP-2: Error Message Extraction - 18+ Occurrences

**Create:** `backend/src/common/utils/error.utils.ts`

```typescript
/**
 * Extract error message from unknown error type
 * Safely handles Error objects, strings, and unknown types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
}

/**
 * Extract error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Create structured error for logging
 */
export function toLoggableError(error: unknown): {
  message: string;
  stack?: string;
  name?: string;
  code?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: (error as any).code,
    };
  }
  return { message: getErrorMessage(error) };
}
```

---

#### DUP-3 & DUP-4: Provider/Folder Validation Services

**Create:** `backend/src/modules/email/services/provider-validation.service.ts`

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ProviderValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure provider exists, belongs to tenant, is active, and supports email
   */
  async getActiveEmailProvider(tenantId: string, providerId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
        isActive: true,
        supportsEmail: true,
      },
    });

    if (!provider) {
      throw new NotFoundException(
        `Email provider ${providerId} not found, inactive, or not configured for email`
      );
    }

    return provider;
  }

  /**
   * Ensure multiple providers are active
   */
  async ensureProvidersActive(tenantId: string, providerIds: string[]): Promise<void> {
    if (!providerIds.length) return;

    const unique = [...new Set(providerIds)];
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        id: { in: unique },
        tenantId,
        isActive: true,
      },
      select: { id: true },
    });

    if (providers.length !== unique.length) {
      const foundIds = new Set(providers.map(p => p.id));
      const missing = unique.filter(id => !foundIds.has(id));
      throw new BadRequestException(`Inactive or missing providers: ${missing.join(', ')}`);
    }
  }
}
```

**Create:** `backend/src/modules/email/services/folder-lookup.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

type SpecialUse = 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE' | 'JUNK';

@Injectable()
export class FolderLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find folder by RFC 6154 specialUse attribute
   */
  async findBySpecialUse(
    providerId: string,
    specialUse: SpecialUse,
  ): Promise<{ id: string; path: string; name: string } | null> {
    return this.prisma.folder.findFirst({
      where: {
        providerId,
        specialUse: { equals: specialUse, mode: 'insensitive' },
      },
      select: { id: true, path: true, name: true },
    });
  }

  /**
   * Get folder path by specialUse, with fallback
   */
  async getFolderPath(
    providerId: string,
    specialUse: SpecialUse,
    fallback: string,
  ): Promise<string> {
    const folder = await this.findBySpecialUse(providerId, specialUse);
    return folder?.path || fallback;
  }

  /**
   * Get trash folder path for provider
   */
  async getTrashFolderPath(providerId: string): Promise<string> {
    return this.getFolderPath(providerId, 'TRASH', 'Trash');
  }

  /**
   * Get sent folder path for provider
   */
  async getSentFolderPath(providerId: string): Promise<string> {
    return this.getFolderPath(providerId, 'SENT', 'Sent');
  }

  /**
   * Get multiple folder paths by specialUse types
   */
  async getFolderPathsBySpecialUse(
    tenantId: string,
    specialUses: SpecialUse[],
    providerId?: string,
  ): Promise<string[]> {
    const folders = await this.prisma.folder.findMany({
      where: {
        provider: { tenantId, ...(providerId && { id: providerId }) },
        specialUse: { in: specialUses, mode: 'insensitive' },
      },
      select: { path: true },
    });
    return folders.map(f => f.path);
  }
}
```

---

#### DUP-13: Pagination Validation

**Create:** `backend/src/common/dto/pagination.dto.ts`

```typescript
import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;

  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 50);
  }

  get take(): number {
    return this.limit || 50;
  }
}

export class PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  static create<T>(data: T[], total: number, pagination: PaginationDto): PaginatedResponse<T> {
    const limit = pagination.limit || 50;
    const page = pagination.page || 1;
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
```

---

### 3.2 Cross-Module Consolidation

#### parseImapExternalId - 3 Files

**Files:**
- `email-sync/workers/sync-back.worker.ts`
- `email/services/email-fetch.service.ts`
- `email-sync/services/base-email-sync.service.ts`

**Create:** `backend/src/modules/email-sync/utils/imap.utils.ts`

```typescript
/**
 * Parse IMAP external message ID format
 * Format: "folderPath:UID" or just "UID"
 *
 * @example
 * parseImapExternalId("INBOX:12345") -> { folderPath: "INBOX", uid: "12345" }
 * parseImapExternalId("12345") -> { folderPath: "INBOX", uid: "12345" }
 */
export function parseImapExternalId(externalId: string): {
  folderPath: string;
  uid: string;
} {
  if (!externalId) {
    throw new Error('External ID is required');
  }

  const lastColonIndex = externalId.lastIndexOf(':');

  if (lastColonIndex === -1) {
    // No colon - assume INBOX
    return { folderPath: 'INBOX', uid: externalId };
  }

  const folderPath = externalId.substring(0, lastColonIndex);
  const uid = externalId.substring(lastColonIndex + 1);

  if (!uid || isNaN(parseInt(uid, 10))) {
    throw new Error(`Invalid IMAP UID in external ID: ${externalId}`);
  }

  return { folderPath: folderPath || 'INBOX', uid };
}

/**
 * Create IMAP external message ID
 */
export function createImapExternalId(folderPath: string, uid: string | number): string {
  return `${folderPath}:${uid}`;
}
```

---

## Phase 4: Medium Priority Fixes (Week 5)

**Goal:** Address remaining medium-severity issues
**Effort:** 15-20 hours
**Priority:** MEDIUM - Address within 4 weeks

### 4.1 Medium Priority Bugs

| ID | Description | File | Fix |
|----|-------------|------|-----|
| BUG-010 | Missing validation for negative attachment size | Various | Add `if (size < 0) throw new BadRequestException()` |
| BUG-011 | Returns real success in dev mode | `email-send.service.ts` | Log warning, return clear real indicator |
| BUG-012 | Missing rate limit on bulk operations | Various | Add `@Throttle()` decorator |
| BUG-013 | Hardcoded 30-day retention | `email-cleanup.service.ts` | Move to config: `RETENTION_DAYS` |
| BUG-014 | Type mismatch in IMAP UID parsing | `email-sync-back.service.ts` | Use consistent `parseInt(uid, 10)` |
| BUG-015 | Missing tenantId in IMAP provider lookup | Various | Add tenantId to all findFirst queries |
| BUG-016 | Unhandled promise rejection in folder count | `emails.service.ts` | Already has `.catch()`, verify error logging |
| BUG-017 | Missing DTO validation for bulk label ops | Controllers | Add `@Body(ValidationPipe)` |
| BUG-018 | Case-insensitive folder comparison | Various | Standardize with `.toLowerCase()` |
| BUG-019 | No validation for draft attachment size | `send-email.dto.ts` | Add `@MaxLength()` validator |

### 4.2 Configuration Extraction

**Create:** `backend/src/modules/email/config/email.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export const emailConfig = registerAs('email', () => ({
  retention: {
    trashPurgeDays: parseInt(process.env.EMAIL_TRASH_PURGE_DAYS || '30', 10),
    orphanRetryDays: parseInt(process.env.EMAIL_ORPHAN_RETRY_DAYS || '7', 10),
  },
  limits: {
    maxListLimit: parseInt(process.env.EMAIL_LIST_MAX_LIMIT || '1000', 10),
    maxAttachmentSize: parseInt(process.env.EMAIL_MAX_ATTACHMENT_SIZE || '26214400', 10), // 25MB
    maxImapMessageSize: parseInt(process.env.IMAP_MAX_MESSAGE_SIZE || '10485760', 10), // 10MB
    conversationLimit: parseInt(process.env.EMAIL_CONVERSATION_LIMIT || '10000', 10),
  },
  rateLimit: {
    sendPerMinute: parseInt(process.env.EMAIL_SEND_RATE_LIMIT || '30', 10),
    bulkOpsPerMinute: parseInt(process.env.EMAIL_BULK_RATE_LIMIT || '10', 10),
  },
}));
```

---

## Phase 5: Low Priority & Code Quality (Week 6)

**Goal:** Address code quality and documentation
**Effort:** 4-6 hours
**Priority:** LOW - Nice to have

### 5.1 Low Priority Bugs

| ID | Description | Fix |
|----|-------------|-----|
| BUG-020 | Magic number 10000 for conversation limit | Extract to `email.config.ts` |
| BUG-021 | Duplicate formatBytes in 5 files | Use shared `format.utils.ts` |
| BUG-022 | Outdated comment referencing EMAIL_MODULE_ROADMAP.md | Update comment to correct path |
| BUG-023 | Missing JSDoc for public API methods | Add JSDoc comments |

### 5.2 Code Quality Improvements

1. **Add JSDoc to all public service methods**
2. **Create interface files for complex types**
3. **Add unit tests for extracted utilities**
4. **Update module documentation**

---

## Implementation Timeline

```
Week 1: Phase 1 - Critical Security Fixes
├── Day 1-2: BUG-001 tenant validation fix + tests
├── Day 3-4: BUG-002 SMTP password fix + tests
└── Day 5: Code review & deployment

Week 2-3: Phase 2 - High Priority Issues
├── Day 1-3: BUG-003 through BUG-009
├── Day 4-6: RC-NEW-3 (deleteEmail TOCTOU)
├── Day 7-8: RC-NEW-6 (Redis orphan tracking)
└── Day 9-10: Integration testing

Week 4: Phase 3 - Code Consolidation
├── Day 1-2: Create utility files (format, error)
├── Day 3-4: Create service files (provider, folder)
├── Day 5: Cross-module consolidation (parseImapExternalId)
└── Day 6-7: Update imports, remove duplicates

Week 5: Phase 4 - Medium Priority
├── Day 1-3: BUG-010 through BUG-019
├── Day 4: Race condition fixes (RC-NEW-1, RC-NEW-4)
└── Day 5: Configuration extraction

Week 6: Phase 5 - Code Quality
├── Day 1-2: Low priority bugs
├── Day 3-4: Documentation updates
└── Day 5: Final review
```

---

## Dependencies and Risks

### Dependencies

| Dependency | Phase | Risk Level | Mitigation |
|------------|-------|------------|------------|

| Redis available | 2, 3 | Medium | Fallback to in-memory with warning |
| Database migrations | 2 | Low | Add version column in separate migration |
| S3 conditional writes | 2 | Low | Use Redis lock if S3 feature unavailable |

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|

| Breaking changes in API | Medium | High | Version API, maintain backwards compat |
| Performance regression | Low | Medium | Benchmark before/after each phase |
| Incomplete test coverage | Medium | Medium | Require 80%+ coverage for new code |
| Multi-instance race conditions | Medium | High | Use Redis locks, test with multiple instances |

---

## Testing Strategy

### Unit Tests (Per Phase)

```typescript
// Example: BUG-001 test
describe('EmailSyncBackService', () => {
  describe('processImapBatchOperations', () => {
    it('should validate tenantId when looking up email folder', async () => {
      // Arrange
      const op = { emailId: 'email-1', tenantId: 'tenant-a' };
      prisma.email.findFirst.realResolvedValue(null);

      // Act & Assert
      await expect(service.processOp(op)).resolves.not.toThrow();
      expect(prisma.email.findFirst).toHaveBeenCalledWith({
        where: { id: 'email-1', tenantId: 'tenant-a' },
        select: { folder: true },
      });
    });
  });
});
```

### Integration Tests

1. **Multi-tenant isolation test**: Verify tenant A cannot access tenant B data
2. **Concurrent operation test**: Run parallel operations to trigger race conditions
3. **Cleanup orphan test**: Verify S3 orphan tracking across restarts

### Load Tests

1. **Bulk delete**: 1000 emails deleted concurrently
2. **Attachment upload**: 100 concurrent 5MB uploads
3. **Email list**: 10000 emails with filters and pagination

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Critical bugs | 2 | 0 | Code audit |
| High priority bugs | 7 | 0 | Code audit |
| Race conditions | 6 | 0 | Concurrent tests |
| Duplicate code LOC | ~480 | <50 | Code analysis |
| Test coverage | TBD | 80%+ | Jest coverage |
| API error rate | TBD | <0.1% | Monitoring |
| P99 latency | TBD | <500ms | APM |

---

## Appendix A: File Change Summary

| File | Changes Required |
|------|------------------|
| `email-sync-back.service.ts` | BUG-001, BUG-014 |
| `email-send.service.ts` | BUG-002 |
| `scheduled-email.service.ts` | BUG-003 |
| `emails.controller.ts` | BUG-004, BUG-005, BUG-007, BUG-008, RC-NEW-8 |
| `attachment-on-demand.service.ts` | BUG-006 |
| `email-cleanup.service.ts` | BUG-009, RC-NEW-6 |
| `emails.service.ts` | RC-NEW-1, RC-NEW-3 |
| `storage.service.ts` | RC-NEW-4 |
| `attachment-metrics.service.ts` | RC-NEW-7 |
| NEW: `common/utils/format.utils.ts` | DUP-1 |
| NEW: `common/utils/error.utils.ts` | DUP-2 |
| NEW: `common/dto/pagination.dto.ts` | DUP-13 |
| NEW: `provider-validation.service.ts` | DUP-3 |
| NEW: `folder-lookup.service.ts` | DUP-4 |
| NEW: `email-sync/utils/imap.utils.ts` | Cross-module |
| NEW: `email/config/email.config.ts` | Configuration |

---

## Appendix B: Related Documentation

- [EMAIL_SYNC_ROADMAP.md](./EMAIL_SYNC_ROADMAP.md) - Email-sync module roadmap
- [MAILAGENT_ROADMAP.md](./MAILAGENT_ROADMAP.md) - Overall project roadmap
- [API Documentation](http://localhost:3000/api/docs) - Swagger API docs

---

---

## Appendix C: 2025 Best Practices (Research & Examples)

### Sources

- [Building a Robust Email Service in NestJS](https://medium.com/@lsarmientom010/building-a-robust-email-service-in-nestjs-a-comprehensive-guide-e199c3d40158)
- [Event-Driven Email Microservice with NestJS](https://www.twilio.com/en-us/blog/developers/community/event-driven-email-microservice-nestjs-twilio-sendgrid)
- [10 Essential NestJS Architecture Best Practices](https://astconsulting.in/java-script/nodejs/nestjs/essential-nestjs-architecture-best-practices)
- [2025 NestJS Backend Roadmap](https://dev.to/tak089/nestjs-roadmap-for-2025-5jj)
- Zero Email Client (Reference: `D:\MailAgent\esempio\Zero-main`)

### Best Practice 1: Rate Limit Handling with Retry Logic

**Source:** Zero-main `apps/server/src/lib/gmail-rate-limit.ts`

Gmail/Microsoft APIs signal rate limits via HTTP 429 or 403 with specific error codes. Use exponential backoff with Effect.js or similar:

```typescript
// Best practice from Zero-main
export function isRateLimit(err: unknown): boolean {
  const e: any = err || {};
  const status = e.code ?? e.status ?? e.response?.status;

  if (status === 429) return true;
  if (status === 403) {
    const errors = e.errors ?? e.response?.data?.error?.errors ?? [];
    return errors.some((x: any) =>
      [
        'userRateLimitExceeded',
        'rateLimitExceeded',
        'quotaExceeded',
        'dailyLimitExceeded',
        'backendError',
        'limitExceeded',
      ].includes(x.reason),
    );
  }
  return false;
}

// Apply retry schedule: max 3 attempts, 60s delay
export const rateLimitSchedule = Schedule.recurWhile(isRateLimit)
  .pipe(Schedule.intersect(Schedule.recurs(3)))
  .pipe(Schedule.addDelay(() => Duration.seconds(60)));
```

**Apply To:** `email-sync-back.service.ts`, `email-send.service.ts`

---

### Best Practice 2: Bulk Delete with Result Tracking

**Source:** Zero-main `apps/server/src/lib/bulk-delete.ts`

Always track successful vs failed operations and return structured results:

```typescript
export interface BulkDeleteResult {
  successful: number;
  failed: number;
  failedKeys?: string[]; // Track which specific items failed
}

export async function bulkDeleteKeys(keys: string[]): Promise<BulkDeleteResult> {
  if (keys.length === 0) {
    return { successful: 0, failed: 0 };
  }

  try {
    const response = await s3Client.deleteObjects({
      Delete: { Objects: keys.map(key => ({ Key: key })) }
    });

    const successful = response.Deleted?.length || 0;
    const failedKeys = response.Errors?.map(e => e.Key).filter(Boolean) || [];

    return {
      successful,
      failed: failedKeys.length,
      failedKeys
    };
  } catch (error) {
    return { successful: 0, failed: keys.length, failedKeys: keys };
  }
}
```

**Apply To:** `email-cleanup.service.ts` (BUG-009 fix)

---

### Best Practice 3: Optimistic Actions with Undo

**Source:** Zero-main `apps/mail/hooks/use-optimistic-actions.ts`

Implement optimistic UI updates with undo capability:

```typescript
type PendingAction = {
  id: string;
  type: 'MOVE' | 'STAR' | 'READ' | 'DELETE';
  threadIds: string[];
  execute: () => Promise<void>;
  undo: () => void;
};

class OptimisticActionsManager {
  pendingActions: Map<string, PendingAction> = new Map();
  lastActionId: string | null = null;

  // Allow undo within 5 seconds before executing
  createPendingAction(action: PendingAction, delay = 5000) {
    this.pendingActions.set(action.id, action);
    this.lastActionId = action.id;

    // Execute after delay unless undone
    setTimeout(async () => {
      if (this.pendingActions.has(action.id)) {
        await action.execute();
        this.pendingActions.delete(action.id);
      }
    }, delay);
  }

  undoLastAction() {
    if (!this.lastActionId) return;
    const action = this.pendingActions.get(this.lastActionId);
    if (action) {
      action.undo();
      this.pendingActions.delete(this.lastActionId);
    }
  }
}
```

**Apply To:** Frontend bulk operations, `emails.service.ts` soft delete

---

### Best Practice 4: Email Address Parsing (RFC Compliant)

**Source:** Zero-main `apps/server/src/lib/email-utils.ts`

Use proper RFC 2822/5322 compliant parsing libraries:

```typescript
import { parseFrom, parseAddressList } from 'email-addresses';

const FALLBACK_SENDER = { name: '', email: 'no-sender@unknown' };

export const parseFrom = (fromHeader: string): Sender => {
  const parsed = _parseFrom(fromHeader);
  if (!parsed?.[0]) return FALLBACK_SENDER;

  const first = parsed[0];
  if (first.type === 'group') {
    return {
      name: first.name || FALLBACK_SENDER.name,
      email: first.addresses?.[0]?.address || FALLBACK_SENDER.email
    };
  }

  return {
    name: first.name || first.address,
    email: first.address || FALLBACK_SENDER.email
  };
};
```

**Apply To:** `email.helpers.ts`, `emails.controller.ts`

---

### Best Practice 5: Event-Driven Architecture

**Source:** [Twilio Event-Driven Email Microservice](https://www.twilio.com/en-us/blog/developers/community/event-driven-email-microservice-nestjs-twilio-sendgrid)

Decouple email operations using event emitters:

```typescript
// email.events.ts
export enum EmailEvent {
  SENT = 'email.sent',
  FAILED = 'email.failed',
  DELIVERED = 'email.delivered',
  OPENED = 'email.opened',
  BOUNCED = 'email.bounced',
}

// email-send.service.ts
@Injectable()
export class EmailSendService {
  constructor(private eventEmitter: EventEmitter2) {}

  async send(email: SendEmailDto): Promise<EmailResult> {
    const result = await this.transporter.sendMail(email);

    this.eventEmitter.emit(EmailEvent.SENT, {
      messageId: result.messageId,
      tenantId: email.tenantId,
      to: email.to,
      timestamp: new Date(),
    });

    return result;
  }
}

// email-analytics.service.ts (new)
@Injectable()
export class EmailAnalyticsService {
  @OnEvent(EmailEvent.SENT)
  handleEmailSent(payload: EmailSentEvent) {
    // Track metrics, update stats
  }

  @OnEvent(EmailEvent.BOUNCED)
  handleEmailBounced(payload: EmailBouncedEvent) {
    // Update sender reputation, notify user
  }
}
```

**Apply To:** New event-driven layer for email analytics

---

### Best Practice 6: Modular Email Service Structure

**Source:** [NestJS Best Practices 2025](https://dev.to/tak089/nestjs-roadmap-for-2025-5jj)

Recommended folder structure:

```
src/modules/email/
├── common/
│   ├── utils/
│   │   ├── format.utils.ts       # formatBytes, etc.
│   │   └── error.utils.ts        # getErrorMessage, etc.
│   └── dto/
│       └── pagination.dto.ts     # Shared pagination
├── services/
│   ├── core/                     # Core business logic
│   │   ├── email.service.ts
│   │   └── emails.service.ts
│   ├── sending/                  # Email sending
│   │   ├── email-send.service.ts
│   │   └── scheduled-email.service.ts
│   ├── storage/                  # Attachment storage
│   │   ├── storage.service.ts
│   │   └── attachment.storage.ts
│   └── cleanup/                  # Retention & cleanup
│       ├── email-cleanup.service.ts
│       └── email-retention.service.ts
├── controllers/
├── dto/
├── events/                       # Event definitions
├── templates/                    # Email templates (Handlebars/Pug)
└── email.module.ts
```

---

### Best Practice 7: List-Unsubscribe Header Handling

**Source:** Zero-main, RFC 2369/8058

Properly handle unsubscribe headers:

```typescript
// Support both HTTP and mailto: unsubscribe methods
export const getListUnsubscribeAction = ({
  listUnsubscribe,
  listUnsubscribePost,
}: {
  listUnsubscribe: string;
  listUnsubscribePost?: string;
}) => {
  const match = listUnsubscribe.match(/<([^>]+)>/);
  if (!match?.[1]) return null;

  const url = new URL(match[1]);

  if (url.protocol.startsWith('http')) {
    return listUnsubscribePost
      ? { type: 'post', url: url.toString(), body: listUnsubscribePost }
      : { type: 'get', url: url.toString() };
  }

  if (url.protocol === 'mailto:') {
    return {
      type: 'email',
      emailAddress: url.pathname,
      subject: new URLSearchParams(url.search).get('subject') || ''
    };
  }

  return null;
};
```

**Apply To:** Email metadata parsing, unsubscribe feature

---

### Best Practice 8: TLS Verification

**Source:** Zero-main `apps/server/src/lib/email-utils.ts`

Verify emails were sent with TLS encryption:

```typescript
export const wasSentWithTLS = (receivedHeaders: string[]): boolean => {
  const tlsIndicators = [
    /using\s+TLS/i,
    /with\s+ESMTPS/i,
    /version=TLS[0-9_.]+/i,
    /TLSv[0-9.]+/i,
    /cipher=[A-Z0-9-]+/i,
  ];

  for (const header of receivedHeaders.reverse()) {
    for (const indicator of tlsIndicators) {
      if (indicator.test(header)) return true;
    }
  }
  return false;
};
```

**Apply To:** Email security indicators in UI

---

## Appendix D: Implementation Checklist

### Phase 1 Checklist
- [ ] BUG-001: Add tenantId to IMAP batch lookup
- [ ] BUG-002: Throw error for missing SMTP password
- [ ] Add unit tests for both fixes
- [ ] Security review completed

### Phase 2 Checklist
- [ ] BUG-003 through BUG-009 fixed
- [ ] RC-NEW-3: Delete TOCTOU fix
- [ ] RC-NEW-6: Redis orphan tracking
- [ ] Integration tests for race conditions
- [ ] Load test with concurrent operations

### Phase 3 Checklist
- [ ] `common/utils/format.utils.ts` created
- [ ] `common/utils/error.utils.ts` created
- [ ] `ProviderValidationService` created
- [ ] `FolderLookupService` created
- [ ] All imports updated
- [ ] No duplicate code remains

### Phase 4 Checklist
- [ ] BUG-010 through BUG-019 fixed
- [ ] RC-NEW-1, RC-NEW-4 fixed
- [ ] Configuration externalized
- [ ] DTOs added for bulk operations

### Phase 5 Checklist
- [ ] Low priority bugs fixed
- [ ] JSDoc added to public methods
- [ ] Outdated comments removed
- [ ] Documentation updated

---

**Document Version:** 1.0
**Author:** Code Audit Agent
**Review Status:** Pending
**Best Practices Source:** Zero-main, Medium, Twilio, DEV.to (2025)
