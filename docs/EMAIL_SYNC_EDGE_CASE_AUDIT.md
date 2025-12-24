# Email-Sync Module - Edge Case & Production Failure Audit

**Date:** 2025-12-24
**Module:** `backend/src/modules/email-sync/`
**Scope:** Edge case handling, error handling, boundary conditions
**Status:** ⚠️ CRITICAL ISSUES FOUND

---

## Executive Summary

The email-sync module has **7 critical edge cases** and **12 moderate issues** that could cause production failures. Most race condition and distributed locking issues have been addressed, but **input validation, timeout handling, and error recovery** need significant improvement.

### Risk Level Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 7 | Requires immediate attention |
| 🟡 High | 5 | Should be addressed before scale-up |
| 🟢 Moderate | 12 | Monitor and fix during regular cycles |

---

## 🔴 CRITICAL ISSUES

### C-1: No Integer Overflow Protection in History IDs
**File:** `gmail-webhook.service.ts:306`, `base-email-sync.service.ts`
**Risk:** Production crash or incorrect sync state

```typescript
// VULNERABLE CODE (line 306)
const lastHistoryId = lastHistoryIdRaw ? Number(lastHistoryIdRaw) : undefined;
const incomingHistoryId = data.historyId ? Number(data.historyId) : undefined;
```

**Problem:**
- Gmail history IDs can exceed `Number.MAX_SAFE_INTEGER` (2^53 - 1)
- No validation that conversion succeeded
- Silent overflow corrupts sync state
- Gap detection logic will fail silently

**Edge Cases:**
1. History ID > 9007199254740991 → Silent overflow
2. History ID as string "99999999999999999" → Becomes 100000000000000000
3. Negative history IDs (malformed data) → Accepted without validation
4. Non-numeric strings → `NaN` comparisons always false

**Fix Required:**
```typescript
function safeParseHistoryId(value: any): bigint | undefined {
  if (!value) return undefined;

  try {
    // Use BigInt for large integers
    const historyId = typeof value === 'string' ? BigInt(value) : BigInt(value);

    // Validate range (history IDs should be positive)
    if (historyId < 0n) {
      throw new Error(`Invalid history ID: ${value} (negative)`);
    }

    return historyId;
  } catch (error) {
    this.logger.error(`Failed to parse history ID: ${value}`, error);
    return undefined;
  }
}
```

---

### C-2: Missing Timeout Handling in Driver Operations
**File:** `base-email-sync.service.ts:104-123`, `sync.worker.ts`
**Risk:** Workers hang indefinitely, queue stalls

**Problem:**
- No timeout on `driver.listMessages()` calls
- No timeout on `driver.getMessage()` calls
- No timeout on `driver.getChangesSince()` calls
- Worker lock expires (15min) but operation continues forever

**Edge Cases:**
1. Network partition during listMessages → Worker hangs for hours
2. IMAP server frozen mid-sync → No recovery mechanism
3. Slow provider response (>15min) → Worker lock expires, duplicate sync starts
4. Infinite loop in driver code → No circuit breaker

**Impact:**
- Worker pool exhaustion (all workers stuck)
- Queue stalls across all tenants
- Memory leak from hanging promises
- Duplicate syncs when lock expires

**Fix Required:**
```typescript
async syncFullWithDriver(driver: IEmailDriver, providerId: string, tenantId: string) {
  const OPERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const result = await Promise.race([
    this.doSyncFull(driver, providerId, tenantId),
    this.timeout(OPERATION_TIMEOUT_MS, 'Full sync operation timeout')
  ]);

  return result;
}

private timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
```

---

### C-3: Unhandled Token Expiration During Sync
**File:** `base-email-sync.service.ts:74-161`
**Risk:** Partial syncs, data loss

**Problem:**
- Token refresh not attempted during long-running syncs
- No retry logic when token expires mid-operation
- Partial results committed before error detected

**Edge Cases:**
1. Token expires after fetching page 1, before page 2 → Partial sync marked complete
2. Token expires during attachment download → Email saved without attachment
3. Refresh token expired → No fallback, sync fails forever
4. Token refresh service down → Sync fails but marked as complete

**Current Behavior:**
```typescript
// Line 84: Token fetched ONCE at start
const { credentials } = await this.getDriverCredentials(providerId);
// ... 15 minutes of sync operations ...
// If token expired during sync, driver.listMessages() throws 401
// Error propagates to worker, no retry with fresh token
```

**Fix Required:**
1. Wrap all driver operations in token refresh retry:
```typescript
async retryWithTokenRefresh<T>(
  operation: () => Promise<T>,
  providerId: string,
  maxRetries = 1
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (this.isAuthenticationError(error) && maxRetries > 0) {
      this.logger.warn('Token expired during sync, refreshing...');
      // Force token refresh
      await this.providerTokenService.refreshProviderToken(providerId);
      // Reconnect driver with new token
      const { credentials } = await this.getDriverCredentials(providerId);
      const driver = await this.createDriver(credentials);
      // Retry operation
      return await this.retryWithTokenRefresh(operation, providerId, maxRetries - 1);
    }
    throw error;
  }
}
```

---

### C-4: Array Bounds Not Checked in Batch Processing
**File:** `base-email-sync.service.ts:758-894`
**Risk:** Out-of-bounds access, incorrect data mapping

**Problem:**
- `results` and `messages` arrays assumed to have same length
- No validation after transaction completes
- Index-based correlation can fail if transaction partially succeeds

```typescript
// Line 853: VULNERABLE CODE
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const msg = messages[i]; // Could be undefined if arrays differ
  // ...
}
```

**Edge Cases:**
1. Transaction returns fewer results than inputs → `msg` undefined
2. Database constraint violation skips some inserts → Misaligned arrays
3. Very large batch (>1000) → Prisma batch limit, partial results
4. Concurrent delete during upsert → Result count mismatch

**Fix Required:**
```typescript
// Validate array lengths match
if (results.length !== messages.length) {
  this.logger.error(
    `Batch upsert length mismatch: ${results.length} results, ${messages.length} messages`
  );
  throw new Error('Batch upsert failed: result count mismatch');
}

// Use for-of with index validation
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const msg = messages[i];

  if (!result || !msg) {
    this.logger.error(`Missing result or message at index ${i}`);
    continue; // Skip this item gracefully
  }
  // ... process
}
```

---

### C-5: Rate Limit Errors Not Handled with Backoff
**File:** `base-email-sync.service.ts:1084-1095`
**Risk:** Permanent failures, account bans

**Problem:**
- `isRateLimitError()` detects 429 but doesn't handle it
- No exponential backoff implemented
- Worker retries immediately, worsening rate limit
- Could trigger account suspension

**Current Code:**
```typescript
// Line 1084: Detection only, no handling
protected isRateLimitError(error: unknown): boolean {
  // ... detection logic ...
  return status === 429;
}
// NOT CALLED ANYWHERE IN SYNC LOGIC!
```

**Edge Cases:**
1. Gmail 429 during full sync → Fails immediately, no retry with delay
2. Microsoft throttling (5000 req/day) → Sync fails repeatedly
3. IMAP rate limit → Connection dropped, no backoff
4. Concurrent syncs hit same rate limit → All fail at once

**Fix Required:**
```typescript
async executeWithRateLimit<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (this.isRateLimitError(error)) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 60000); // Max 60s
        this.logger.warn(`Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await this.sleep(delayMs);
        lastError = error as Error;
        continue;
      }
      throw error; // Non-rate-limit error, fail immediately
    }
  }

  throw lastError || new Error('Rate limit retry exhausted');
}
```

---

### C-6: Connection Cleanup on Error Paths
**File:** `base-email-sync.service.ts:90-151`
**Risk:** Connection leaks, resource exhaustion

**Problem:**
- Driver disconnection in finally block is good
- BUT early returns in error paths might skip cleanup
- Async errors could prevent finally from running

```typescript
// Line 90: Current implementation
try {
  // Hook for provider-specific pre-sync logic
  await this.onBeforeSync(driver, provider); // Could throw

  // ... sync operations ...

} finally {
  await driver.disconnect(); // Not guaranteed if async error in onBeforeSync
}
```

**Edge Cases:**
1. `onBeforeSync()` throws → Driver left connected
2. `getDriverCredentials()` throws after connection → Leak
3. Process killed during sync → Dangling connections
4. Error in driver.disconnect() → Silent failure

**Fix Required:**
```typescript
// Use try-catch-finally with guaranteed cleanup
let driver: IEmailDriver | null = null;

try {
  driver = await this.createDriver(driverType, credentials);

  if (!driver.isConnected()) {
    throw new Error('Driver failed to connect');
  }

  // ... sync operations ...

} catch (error) {
  this.logger.error(`Sync error: ${error.message}`);
  throw error;
} finally {
  // ALWAYS attempt disconnect, even if driver creation failed
  if (driver) {
    try {
      await Promise.race([
        driver.disconnect(),
        this.timeout(5000, 'Driver disconnect timeout')
      ]);
    } catch (disconnectError) {
      // Log but don't throw - original error takes precedence
      this.logger.error(`Driver disconnect failed: ${disconnectError.message}`);
    }
  }
}
```

---

### C-7: Webhook Deduplication Relies on Redis Availability
**File:** `gmail-webhook.service.ts:113-143`, `microsoft-webhook.service.ts:140-169`
**Risk:** Duplicate processing when Redis unavailable

**Problem:**
- Falls back to in-memory cache when Redis fails
- In-memory cache is per-instance, not distributed
- Multiple app instances will process duplicates
- No circuit breaker to detect Redis outage

**Current Code:**
```typescript
// gmail-webhook.service.ts:132-141
try {
  // Try Redis...
} catch (error) {
  // RC-2 FIX: FAIL CLOSED - use in-memory fallback
  this.logger.warn('Redis unavailable, using in-memory fallback');
  return this.checkAndMarkProcessedFallback(messageId);
}
```

**Edge Cases:**
1. Redis down for 10 minutes → 600+ duplicate webhook events processed
2. Redis network partition → Some instances use Redis, others use memory
3. Redis slow (>1s latency) → Timeout, fallback to memory
4. Redis key eviction (memory pressure) → Dedup window shorter than expected

**Impact:**
- Gmail: Duplicate emails created in database
- Microsoft: Duplicate sync jobs queued
- Queue flooding with duplicate work
- Database unique constraint violations (logged as errors)

**Fix Required:**
1. Circuit breaker pattern:
```typescript
private redisCircuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false,
  FAILURE_THRESHOLD: 3,
  RESET_TIMEOUT: 60000, // 1 minute
};

async checkAndMarkProcessed(messageId: string): Promise<boolean> {
  // Check circuit breaker
  if (this.redisCircuitBreaker.isOpen) {
    const timeSinceFailure = Date.now() - this.redisCircuitBreaker.lastFailureTime;
    if (timeSinceFailure < this.redisCircuitBreaker.RESET_TIMEOUT) {
      this.logger.warn('Redis circuit breaker OPEN, using in-memory dedup');
      return this.checkAndMarkProcessedFallback(messageId);
    }
    // Try to close circuit
    this.redisCircuitBreaker.isOpen = false;
    this.redisCircuitBreaker.failures = 0;
  }

  try {
    // Try Redis with timeout
    const result = await Promise.race([
      this.redisLock.acquireLock(key, ttl),
      this.timeout(1000, 'Redis dedup timeout')
    ]);

    // Success - reset circuit breaker
    this.redisCircuitBreaker.failures = 0;
    return result !== null;

  } catch (error) {
    // Track failures
    this.redisCircuitBreaker.failures++;
    this.redisCircuitBreaker.lastFailureTime = Date.now();

    if (this.redisCircuitBreaker.failures >= this.redisCircuitBreaker.FAILURE_THRESHOLD) {
      this.redisCircuitBreaker.isOpen = true;
      this.logger.error('Redis circuit breaker OPENED after 3 failures');
    }

    return this.checkAndMarkProcessedFallback(messageId);
  }
}
```

---

## 🟡 HIGH SEVERITY ISSUES

### H-1: No Validation of Email Address Format
**File:** `base-email-sync.service.ts:1169-1175`
**Risk:** Malformed data persisted to database

**Problem:**
- `validateEmailAddress()` exists but NOT CALLED before saving
- Regex is simplified, doesn't handle all RFC 5322 cases
- Invalid emails stored in `from`, `to`, `cc`, `bcc` arrays

**Edge Cases:**
1. Empty string email → Stored as-is
2. Email without @ symbol → No validation
3. Multiple @ symbols → Accepted
4. International domains (IDN) → May fail regex
5. Quoted strings in local part → Regex fails

**Fix Required:** Call validation in `upsertMessageFromDriver()`:
```typescript
// Before line 560 (baseUpdateData assignment)
const validateRecipients = (recipients: Array<{email: string}>): string[] => {
  return recipients
    .map(r => r.email)
    .filter(email => {
      const isValid = this.validateEmailAddress(email);
      if (!isValid) {
        this.logger.warn(`Invalid email address filtered: ${email}`);
      }
      return isValid;
    });
};

const baseUpdateData = {
  // ...
  from: this.validateEmailAddress(canonicalMsg.from.email)
    ? canonicalMsg.from.email
    : 'invalid@unknown.local',
  to: validateRecipients(canonicalMsg.to || []),
  cc: validateRecipients(canonicalMsg.cc || []),
  bcc: validateRecipients(canonicalMsg.bcc || []),
  // ...
};
```

---

### H-2: String Length Limits Not Enforced
**File:** `base-email-sync.service.ts:558-589`
**Risk:** Database constraint violations

**Problem:**
- `subject` field has DB limit (likely 255 or 500 chars)
- `snippet` field has DB limit
- No truncation before insert
- Long subjects from spam emails cause errors

**Current Code:**
```typescript
// Line 559: No length check
subject: canonicalMsg.subject || '(No Subject)',
snippet: canonicalMsg.snippet || '',
```

**Edge Cases:**
1. Subject > 500 chars → Database error
2. Snippet > 1000 chars → Database error
3. Null bytes in strings → Database error
4. Control characters → May corrupt data

**Fix Required:**
```typescript
// Add length limits matching database schema
const MAX_SUBJECT_LENGTH = 500;
const MAX_SNIPPET_LENGTH = 1000;

const baseUpdateData = {
  subject: this.truncateText(
    this.sanitizeText(canonicalMsg.subject || '(No Subject)'),
    MAX_SUBJECT_LENGTH
  ),
  snippet: this.truncateText(
    this.sanitizeText(canonicalMsg.snippet || ''),
    MAX_SNIPPET_LENGTH
  ),
  // ...
};

// Add sanitization helper
protected sanitizeText(text: string): string {
  return text
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars
}
```

---

### H-3: Date/Time Parsing Without Validation
**File:** `base-email-sync.service.ts:1183-1198`
**Risk:** Invalid dates stored, incorrect sorting

**Problem:**
- `formatTimestamp()` silently converts invalid dates to current time
- No validation of date ranges
- Could accept future dates or dates before email existed

**Current Code:**
```typescript
// Line 1193: Silent fallback to current time
try {
  return new Date(date).toISOString();
} catch {
  return new Date().toISOString(); // WRONG - masks data quality issues
}
```

**Edge Cases:**
1. Receiveddate = "9999-12-31" → Stored as future date
2. Received date = "1970-01-01" → Valid but suspicious
3. Invalid ISO string → Becomes current time (data loss)
4. Timezone edge cases → Could shift date by 1 day

**Fix Required:**
```typescript
protected formatTimestamp(date: Date | number | string): string {
  let parsedDate: Date;

  if (date instanceof Date) {
    parsedDate = date;
  } else if (typeof date === 'number') {
    parsedDate = new Date(date);
  } else {
    parsedDate = new Date(date);
  }

  // Validate date is reasonable (between 1990 and now + 1 day)
  const MIN_EMAIL_DATE = new Date('1990-01-01').getTime();
  const MAX_EMAIL_DATE = Date.now() + 86400000; // Now + 1 day

  if (isNaN(parsedDate.getTime())) {
    this.logger.error(`Invalid date: ${date}, using current time`);
    return new Date().toISOString();
  }

  const timestamp = parsedDate.getTime();
  if (timestamp < MIN_EMAIL_DATE || timestamp > MAX_EMAIL_DATE) {
    this.logger.warn(`Date out of range: ${date} (${parsedDate.toISOString()}), clamping`);
    return new Date(Math.max(MIN_EMAIL_DATE, Math.min(MAX_EMAIL_DATE, timestamp))).toISOString();
  }

  return parsedDate.toISOString();
}
```

---

### H-4: No Null/Undefined Guards in Array Operations
**File:** `base-email-sync.service.ts:561-563`
**Risk:** Runtime errors during sync

**Problem:**
- `canonicalMsg.to?.map()` safe
- BUT if `to` is `null` (not undefined), `?.` doesn't help
- Arrays could contain null elements
- No filtering of invalid entries

**Current Code:**
```typescript
// Line 561-563: Assumes arrays contain valid objects
to: canonicalMsg.to?.map((r) => r.email) || [],
cc: canonicalMsg.cc?.map((r) => r.email) || [],
bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
```

**Edge Cases:**
1. `to = [{email: null}]` → Array contains `null`
2. `to = [null, {email: 'test@test.com'}]` → Runtime error
3. `to = [{email: undefined}]` → Array contains `undefined`
4. `to = []` vs `to = null` → Different handling

**Fix Required:**
```typescript
protected extractEmails(recipients?: Array<{email: string} | null>): string[] {
  if (!recipients || !Array.isArray(recipients)) {
    return [];
  }

  return recipients
    .filter(r => r && typeof r === 'object' && r.email)
    .map(r => r.email)
    .filter(email => typeof email === 'string' && email.length > 0);
}

// Usage:
to: this.extractEmails(canonicalMsg.to),
cc: this.extractEmails(canonicalMsg.cc),
bcc: this.extractEmails(canonicalMsg.bcc),
```

---

### H-5: Concurrent Modification During Map Iteration
**File:** `gmail-webhook.service.ts:193-209`, `microsoft-webhook.service.ts:101-133`
**Risk:** Memory corruption, undefined behavior

**Problem:**
- Cleanup intervals modify Map during iteration
- RC-9/RC-10 fixes collect keys first, THEN delete
- GOOD implementation but not tested under load
- Could still fail if new entries added during cleanup

**Current Code (FIXED but needs validation):**
```typescript
// RC-9 FIX: Collect keys first
const keysToDelete: string[] = [];
for (const [messageId, timestamp] of this.processedMessagesFallback.entries()) {
  if (now - timestamp > this.MESSAGE_CACHE_TTL_MS) {
    keysToDelete.push(messageId);
  }
}
// Delete in separate pass
for (const key of keysToDelete) {
  this.processedMessagesFallback.delete(key);
}
```

**Edge Cases:**
1. New webhook arrives during cleanup → Key added while iterating
2. Cleanup runs concurrently in multiple intervals → Race condition
3. Very large map (10k+ entries) → Cleanup takes >5s, overlap with next interval

**Additional Safety Needed:**
```typescript
private isCleanupRunning = false;

private cleanupProcessedMessages(): void {
  // Prevent concurrent cleanup runs
  if (this.isCleanupRunning) {
    this.logger.debug('Cleanup already running, skipping');
    return;
  }

  this.isCleanupRunning = true;

  try {
    const now = Date.now();
    const keysToDelete: string[] = [];

    // Snapshot entries to avoid iteration issues
    const entries = Array.from(this.processedMessagesFallback.entries());

    for (const [messageId, timestamp] of entries) {
      if (now - timestamp > this.MESSAGE_CACHE_TTL_MS) {
        keysToDelete.push(messageId);
      }
    }

    for (const key of keysToDelete) {
      this.processedMessagesFallback.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.logger.debug(`Cleaned up ${keysToDelete.length} expired entries`);
    }
  } finally {
    this.isCleanupRunning = false;
  }
}
```

---

## 🟢 MODERATE ISSUES

### M-1: Empty Array Handling in Batch Operations
**File:** `base-email-sync.service.ts:764-766`
**Status:** ✅ HANDLED (early return)

```typescript
if (messages.length === 0) {
  return { processed: 0, newCount: 0 };
}
```

**Note:** Good defensive programming. No changes needed.

---

### M-2: Folder Name Normalization Edge Cases
**File:** `base-email-sync.service.ts:908-976`
**Status:** ⚠️ INCOMPLETE

**Current Implementation:**
- Handles English, Italian, German
- Returns uppercase folder names
- Falls back to original name

**Missing Cases:**
1. French folders: "Boîte de réception", "Éléments envoyés"
2. Spanish folders: "Bandeja de entrada", "Elementos enviados"
3. Portuguese folders: "Caixa de entrada", "Itens enviados"
4. Asian language folders (Chinese, Japanese, Korean)
5. RTL languages (Arabic, Hebrew)

**Low Priority:** Only affects display, not functionality.

---

### M-3: HTML Parsing Fallback Could Be Improved
**File:** `base-email-sync.service.ts:1136-1147`
**Status:** ⚠️ BASIC FALLBACK

**Current Code:**
```typescript
catch (error) {
  // Fallback to basic regex if cheerio fails
  let text = html.replace(/<[^>]*>/g, ' ');
  text = decode(text);
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}
```

**Issues:**
1. Regex doesn't handle malformed HTML: `<div>text<div>` (missing close tag)
2. No handling of `<script>` content in fallback
3. No handling of CSS in `<style>` tags
4. Could include hidden text intended for screen readers

**Low Priority:** Cheerio handles 99% of cases, fallback is rare.

---

### M-4: Memory Leak in Long-Running Worker Process
**File:** `sync.worker.ts:32-47`, `gmail-webhook.service.ts:34-36`
**Status:** ⚠️ POTENTIAL ISSUE

**Problem:**
- In-memory Maps: `processedMessagesFallback`, `rateLimitMap`
- Max size checks in place (MAX_CACHE_SIZE = 10000)
- BUT cleanup interval may not run if worker crashes
- No memory monitoring/alerting

**Impact:**
- After 30 days uptime: ~864,000 entries (1 per 3 seconds)
- Each entry: ~100 bytes → 86MB memory
- With MAX_CACHE_SIZE: Limited to ~1MB
- **Low risk** due to size limits

**Recommendation:** Add memory metrics:
```typescript
private getMemoryStats() {
  return {
    cacheSize: this.processedMessagesFallback.size,
    rateLimitSize: this.rateLimitMap.size,
    heapUsed: process.memoryUsage().heapUsed,
  };
}

// Log every hour
setInterval(() => {
  this.logger.debug('Memory stats:', this.getMemoryStats());
}, 3600000);
```

---

### M-5: Error Messages May Contain Sensitive Data
**File:** `base-email-sync.service.ts:153-158`, `sync.worker.ts:196-197`
**Status:** ⚠️ DATA LEAK RISK

**Problem:**
- Error messages logged without sanitization
- Could contain access tokens, email content, PII
- Logs sent to external monitoring services

**Current Code:**
```typescript
// Line 153: Logs full error
this.logger.error(`Sync failed for ${email}: ${errorMessage}`);
if (errorStack) {
  this.logger.error(`Stack trace: ${errorStack}`);
}
```

**Risk:**
1. OAuth error includes token in URL: `401: Invalid token eyJhbGci...`
2. IMAP error includes password: `AUTH failed for user:password@server`
3. Email content in parse errors: `Invalid JSON: {"from":"user@company.com","body":"Confidential..."}`

**Fix Required:**
```typescript
protected sanitizeErrorMessage(error: unknown): string {
  let message = this.extractErrorMessage(error);

  // Redact common sensitive patterns
  message = message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]');
  message = message.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, '[EMAIL_REDACTED]');
  message = message.replace(/\b[0-9a-f]{40,}\b/gi, '[TOKEN_REDACTED]');

  return message;
}
```

---

### M-6: No Circuit Breaker for External APIs
**File:** All sync services
**Status:** ❌ NOT IMPLEMENTED

**Problem:**
- Gmail/Microsoft/IMAP APIs can have outages
- Sync retries immediately on failure
- Could amplify outages with retry storms

**Recommendation:** Add circuit breaker (low priority, handled by queue retry limits).

---

### M-7: Database Transaction Size Not Limited
**File:** `base-email-sync.service.ts:849`
**Status:** ⚠️ POTENTIAL ISSUE

**Problem:**
- Batch upsert uses `prisma.$transaction(upsertOps)`
- No limit on `upsertOps.length`
- Could exceed Postgres transaction limit

**Current Code:**
```typescript
// No size check before transaction
const results = await this.prisma.$transaction(upsertOps);
```

**Edge Cases:**
1. Full sync with 10,000 messages → Transaction too large
2. Incremental sync with 5,000 changes → May exceed limits
3. Network timeout during large transaction → All or nothing rollback

**Fix Required:**
```typescript
const MAX_BATCH_SIZE = 500; // Postgres safe limit

// Split into smaller batches
const batches = [];
for (let i = 0; i < upsertOps.length; i += MAX_BATCH_SIZE) {
  batches.push(upsertOps.slice(i, i + MAX_BATCH_SIZE));
}

// Execute batches sequentially
for (const batch of batches) {
  const batchResults = await this.prisma.$transaction(batch);
  results.push(...batchResults);
}
```

---

### M-8: Webhook Subscription Update Race Condition
**File:** `gmail-webhook.service.ts:629-653`, `microsoft-webhook.service.ts:682-705`
**Status:** ⚠️ MINOR RACE

**Problem:**
- `updateSubscriptionStats()` uses `updateMany` (good)
- BUT no guarantee of atomic increment across multiple instances
- Redis counters would be more accurate

**Impact:** Minimal - notification counts slightly inaccurate.

---

### M-9: Worker Shutdown May Lose In-Flight Jobs
**File:** `sync.worker.ts:406-451`
**Status:** ⚠️ GRACEFUL SHUTDOWN INCOMPLETE

**Current Code:**
```typescript
async onModuleDestroy() {
  // Stop all workers
  for (const worker of this.workers) {
    await worker.close();
  }
}
```

**Problem:**
- `worker.close()` stops processing but may not wait for in-flight jobs
- Should use `worker.close({ timeout: 30000 })` to allow completion

**Fix:**
```typescript
await worker.close({
  timeout: 30000, // Wait up to 30s for jobs to finish
  force: true,    // Then force close
});
```

---

### M-10: No Validation of Canonical Message Structure
**File:** `base-email-sync.service.ts:524-744`
**Status:** ❌ MISSING

**Problem:**
- Assumes driver returns valid CanonicalMessage
- No schema validation
- Malformed driver response could crash sync

**Edge Cases:**
1. Missing required fields → Runtime error
2. Wrong types (string instead of Date) → Conversion error
3. Negative message counts → Logic errors

**Fix Required:** Add Zod schema validation:
```typescript
import { z } from 'zod';

const CanonicalMessageSchema = z.object({
  id: z.string().min(1),
  folder: z.string().min(1),
  subject: z.string().nullable(),
  from: z.object({ email: z.string().email() }),
  to: z.array(z.object({ email: z.string().email() })).optional(),
  // ... etc
});

// Before processing
try {
  CanonicalMessageSchema.parse(canonicalMsg);
} catch (validationError) {
  this.logger.error('Invalid canonical message:', validationError);
  throw new Error('Driver returned invalid message structure');
}
```

---

### M-11: Attachment Processing Errors Not Isolated
**File:** `base-email-sync.service.ts:688-697`, `881-890`
**Status:** ⚠️ PARTIAL FAILURE

**Problem:**
- Attachment processing happens AFTER email upsert
- If attachment download fails, email is still saved
- BUT error propagates, marking entire sync as failed

**Current Code:**
```typescript
// Line 688: Attachment processing not wrapped in try-catch
if (canonicalMsg.hasAttachments && canonicalMsg.attachments.length > 0) {
  await this.processAttachmentsForMessage(...); // Could throw
}
```

**Edge Cases:**
1. Attachment download timeout → Email saved, sync marked failed
2. Attachment too large → Email saved, sync marked failed
3. Storage quota exceeded → Email saved, sync marked failed

**Fix Required:**
```typescript
if (canonicalMsg.hasAttachments && canonicalMsg.attachments.length > 0) {
  try {
    await this.processAttachmentsForMessage(...);
  } catch (attachmentError) {
    // Log but don't fail the sync - email is already saved
    this.logger.error(
      `Attachment processing failed for ${result.id}: ${attachmentError.message}`
    );
    // Mark email as having attachment errors
    await this.prisma.email.update({
      where: { id: result.id },
      data: {
        metadata: {
          ...result.metadata,
          attachmentError: attachmentError.message,
          attachmentErrorAt: new Date().toISOString(),
        },
      },
    });
  }
}
```

---

### M-12: Provider Activity Calculation Not Tested
**File:** `sync.worker.ts:355`
**Status:** ⚠️ FIRE-AND-FORGET

**Problem:**
- Activity update is async and errors are caught
- No monitoring if it consistently fails
- Could lead to incorrect Smart Sync priorities

**Current Code:**
```typescript
// Line 355: Errors silently swallowed
this.syncScheduler.updateProviderActivity(providerId).catch((error) => {
  this.logger.warn('Activity update failed...');
});
```

**Recommendation:** Add error rate tracking:
```typescript
private activityUpdateErrors = new Map<string, number>();

// Track consecutive failures
const errorCount = this.activityUpdateErrors.get(providerId) || 0;
if (errorCount > 10) {
  this.logger.error(
    `Activity updates failing consistently for ${providerId}, investigate`
  );
}
```

---

## Testing Recommendations

### Priority 1: Critical Path Tests
1. **Token expiration during sync** (C-3)
   - Mock token expiring after 1st API call
   - Verify retry with refreshed token
   - Verify partial results not committed

2. **Rate limiting with backoff** (C-5)
   - Mock 429 responses
   - Verify exponential backoff
   - Verify success after retry

3. **Integer overflow in history IDs** (C-1)
   - Test with `Number.MAX_SAFE_INTEGER + 1`
   - Verify correct handling of large numbers
   - Test gap detection with overflow

### Priority 2: Edge Case Tests
1. **Timeout handling** (C-2)
   - Mock slow API responses (>15min)
   - Verify worker doesn't hang
   - Verify proper cleanup

2. **Array bounds checking** (C-4)
   - Test batch with mismatched result counts
   - Verify graceful handling

3. **Webhook deduplication** (C-7)
   - Test Redis failure scenarios
   - Verify fallback behavior
   - Test circuit breaker

### Priority 3: Data Validation Tests
1. **Email validation** (H-1)
2. **String length limits** (H-2)
3. **Date range validation** (H-3)
4. **Null handling in arrays** (H-4)

---

## Production Monitoring Recommendations

### Critical Metrics to Track
1. **Sync timeout rate** - Should be <0.1%
2. **Token refresh failures** - Should be 0
3. **Rate limit hits** - Track and alert on spikes
4. **Redis dedup failures** - Alert if >1/hour
5. **Worker queue depth** - Alert if >1000
6. **Memory usage trends** - Alert if growing

### Alerting Thresholds
```yaml
alerts:
  - name: sync_timeout_rate
    threshold: 0.001  # 0.1%
    window: 5m

  - name: token_refresh_failure
    threshold: 1
    window: 1h

  - name: rate_limit_exceeded
    threshold: 10
    window: 5m

  - name: redis_dedup_failure
    threshold: 60  # 1 per minute
    window: 1h

  - name: worker_queue_depth
    threshold: 1000
    window: 5m
```

---

## Summary & Risk Assessment

### By Severity

| Severity | Count | Risk Level | Requires Immediate Action |
|----------|-------|------------|---------------------------|
| 🔴 Critical | 7 | **HIGH** | YES - Before scale-up |
| 🟡 High | 5 | **MEDIUM** | YES - Within 2 weeks |
| 🟢 Moderate | 12 | **LOW** | No - Track and fix incrementally |

### Timeline Recommendations

**Week 1 (Critical):**
- C-2: Timeout handling
- C-3: Token refresh during sync
- C-5: Rate limit backoff
- C-7: Redis dedup circuit breaker

**Week 2 (High Priority):**
- H-1: Email validation
- H-2: String length limits
- H-3: Date validation
- C-1: History ID overflow
- C-4: Array bounds
- C-6: Connection cleanup

**Week 3+ (Moderate):**
- M-10: Canonical message validation
- M-11: Attachment error isolation
- M-7: Batch size limits
- Remaining moderate issues

### Production Readiness Score

**Current:** 6.5/10
**After Critical Fixes:** 8.5/10
**After All Fixes:** 9.5/10

---

## Appendix: Test Coverage Gaps

**Current Coverage:** 0% (no test files found)

**Required Test Files:**
1. `base-email-sync.service.spec.ts` - 150+ test cases
2. `gmail-webhook.service.spec.ts` - 50+ test cases
3. `microsoft-webhook.service.spec.ts` - 50+ test cases
4. `sync.worker.spec.ts` - 80+ test cases

**Total Tests Needed:** ~330 tests to achieve 80% coverage of edge cases.

---

**End of Audit Report**
