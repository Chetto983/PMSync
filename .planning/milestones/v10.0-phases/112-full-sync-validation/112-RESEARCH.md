# Phase 112: Full Sync Validation - Research

**Researched:** 2026-03-26
**Domain:** Email synchronization validation across Gmail, Outlook, and IMAP providers
**Confidence:** HIGH

## Summary

Phase 112 validates that full sync produces complete, accurate local mirrors for all three email providers (Gmail via REST API, Microsoft via Graph API, IMAP via imapflow). The existing sync infrastructure is mature (8 phases of hardening, driver abstraction layer, BullMQ workers, distributed locking, cross-folder dedup) and production-deployed. This phase is purely validation and bug-fixing -- no new features.

The sync pipeline is: `SyncWorker` processes `SyncJobData` -> delegates to provider-specific `{Google,Microsoft,Imap}SyncService` -> each extends `BaseEmailSyncService` -> `SyncOrchestrationService.executeFullSync()` iterates 5 folders (INBOX 60%, SENT 20%, ARCHIVE 15%, DRAFTS 4%, TRASH 1%) with per-folder budgets -> `SyncMessageProcessorService.processBatch()` persists to Prisma -> folder sync via `FolderSyncService` runs first with Redis lock. The validation script must compare the DB state against what each provider API reports.

**Primary recommendation:** Write a validation script per provider that (1) triggers full sync via `POST /email-sync/sync-all`, (2) waits for completion, (3) queries both the provider API and local DB to compare email counts per folder and folder hierarchy, (4) spot-checks random emails for field correctness. Fix bugs found in-place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | Full sync from Gmail downloads all emails, folders, and labels correctly | Gmail uses labels-as-folders. `GmailFolderService.syncFolders()` maps labels to canonical types. `SyncOrchestrationService.executeFullSync()` syncs 5 folders with weighted budgets. Validation: compare Gmail API label counts vs DB email counts per folder + verify label arrays. |
| SYNC-02 | Full sync from Outlook downloads all emails and folders correctly | Microsoft uses Graph API folders with `wellKnownName`. `MicrosoftFolderService.syncMicrosoftFolders()` syncs folder hierarchy. Validation: compare Graph `/me/mailFolders` counts vs DB. |
| SYNC-03 | Full sync from IMAP downloads all emails and folders correctly | IMAP uses `imapflow` with RFC 6154 special-use attributes + name heuristics (multi-language). `ImapFolderSyncService.syncImapFolders()` maps to canonical types. Validation: compare IMAP `STATUS` counts vs DB. |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11 | Backend framework | Project stack |
| Prisma | Latest | ORM / DB queries | Project stack |
| BullMQ | Latest | Job queue for sync workers | Already used for all sync operations |
| googleapis | Latest | Gmail API client | Already used by GoogleDriver |
| axios | Latest | HTTP client for MS Graph | Already used by MicrosoftDriver/MicrosoftFolderService |
| imapflow | Latest | IMAP client | Already used by IMAPDriver |
| Playwright | Latest | E2E browser validation via Edge CDP | Existing pattern (validate-production.mjs, validate-gmail-e2e.mjs) |
| pg | Latest | Direct PostgreSQL queries in validation scripts | Existing pattern (check-sync.js) |

### Supporting (for validation scripts)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| playwright | existing | Browser-authenticated API calls | When validation needs auth cookies from Edge CDP |
| pg (node-postgres) | existing | Direct DB comparison queries | When validation script runs outside NestJS context |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright for auth | Direct API with manual JWT | Playwright reuses real session, avoids credential management |
| Standalone validation script | NestJS E2E test | Standalone scripts match existing project pattern (scripts/ directory) |

**Installation:** No new dependencies needed. All required packages already installed.

## Architecture Patterns

### Existing Sync Architecture
```
POST /email-sync/sync-all (purge + re-sync)
  or
POST /email-sync/sync/:providerId (single provider)
    |
    v
SyncSchedulerService.syncProviderNow()
    |
    v
BullMQ Queue (high/normal/low priority)
    |
    v
SyncWorker.processJob()
    |
    +-> FolderSyncService.syncProviderFolders() [with Redis lock]
    |     +-> GmailFolderService.syncFolders()
    |     +-> MicrosoftFolderService.syncMicrosoftFolders()
    |     +-> ImapFolderSyncService.syncImapFolders()
    |
    +-> BaseEmailSyncService.syncProvider()
          +-> SyncOrchestrationService.executeFullSync()
                +-> 5 folders x batched listMessages()
                +-> SyncMessageProcessorService.processBatch()
                      +-> Prisma upsert per message
```

### Validation Script Pattern
```
scripts/
  validate-full-sync.mjs          # Main orchestrator
  validate-full-sync-gmail.mjs    # Gmail-specific checks
  validate-full-sync-outlook.mjs  # Outlook-specific checks
  validate-full-sync-imap.mjs     # IMAP-specific checks
```

Each script follows the existing project pattern (see `validate-gmail-e2e.mjs`):
1. Connect to Edge via CDP (port 9222) for authenticated session
2. Use browser cookies for API calls
3. Log PASS/FAIL per check with details
4. Return exit code 0/1

### Pattern 1: Provider Count Comparison
**What:** Compare provider-reported folder/email counts against local DB
**When to use:** Primary validation for SYNC-01, SYNC-02, SYNC-03
**Example:**
```javascript
// For Gmail: compare label message counts vs DB email counts
const gmailLabels = await api.get(BACKEND_URL + '/api/v1/folders?providerId=' + providerId);
const dbCounts = await pg.query(`
  SELECT folder, COUNT(*)::int as cnt
  FROM emails
  WHERE "providerId" = $1 AND "isDeleted" = false
  GROUP BY folder
`, [providerId]);

// Also query Gmail API directly for ground truth via sync endpoint
const syncStatus = await api.get(BACKEND_URL + '/api/v1/email-sync/status');
```

### Pattern 2: Field Spot-Check
**What:** Sample N random emails from DB, fetch same from provider, compare fields
**When to use:** Verify subject, body, sender, recipients, dates, labels match
**Example:**
```javascript
// Pick 5 random emails per folder
const samples = await pg.query(`
  SELECT id, "externalId", subject, "from", "to", "receivedAt", folder, labels
  FROM emails
  WHERE "providerId" = $1 AND "isDeleted" = false
  ORDER BY RANDOM() LIMIT 5
`, [providerId]);

// For each, GET single email via API and compare fields
for (const sample of samples.rows) {
  const apiEmail = await api.get(BACKEND_URL + '/api/v1/emails/' + sample.id);
  assertEqual(apiEmail.subject, sample.subject);
  // etc.
}
```

### Pattern 3: Folder Hierarchy Validation
**What:** Verify folder nesting matches provider structure
**When to use:** All providers, especially IMAP with nested folders
**Example:**
```javascript
const folders = await pg.query(`
  SELECT id, name, path, "parentId", "specialUse", "externalId", level
  FROM folders
  WHERE "providerId" = $1
  ORDER BY path
`, [providerId]);

// Verify: all system folders present (INBOX, SENT, DRAFTS, TRASH, SPAM)
// Verify: parentId references are valid
// Verify: level matches depth of path separators
```

### Anti-Patterns to Avoid
- **Testing against stale data:** Always trigger a fresh full sync before validation, or verify lastSyncedAt is recent.
- **Comparing exact email counts without accounting for fullSyncMaxMessages budget:** The sync has a 2500-message default cap per provider. Do not expect all historical emails to be present if the mailbox has >2500.
- **Ignoring DEDUP-FIX:** Gmail messages can have multiple labels. The sync deduplicates across folders. Count by unique externalId, not by folder assignment.
- **Hardcoding provider IDs:** Use dynamic discovery from `provider_configs` table.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication for API calls | Custom JWT/cookie handling | Playwright CDP (Edge session) | Existing pattern, avoids credential management |
| Email count comparison | Manual SQL per provider | `FolderSyncQueryService.updateFolderCounts()` for DB side | Already computed during sync, just read `folders.totalCount` |
| Folder type detection | Custom folder-to-type mapping | `canonical.types.ts` mappings (GMAIL_TO_CANONICAL, MICROSOFT_WELLKNOWN_TO_CANONICAL, IMAP_SPECIAL_USE_TO_CANONICAL) | Comprehensive multi-language mappings already exist |
| Triggering full sync | Direct queue manipulation | `POST /email-sync/sync-all` (purge+resync) or `POST /email-sync/sync/:providerId` | Battle-tested endpoints with proper cleanup |

**Key insight:** The validation scripts should primarily read from the DB (which the sync already populated) and compare against provider API responses accessed through the existing driver layer or REST API. Do not reimplement sync logic.

## Common Pitfalls

### Pitfall 1: fullSyncMaxMessages Budget Limit
**What goes wrong:** Validator expects all provider emails in DB, but sync caps at 2500 per provider
**Why it happens:** `GMAIL_FULL_MAX_MESSAGES`, `MS_FULL_MAX_MESSAGES`, `IMAP_FULL_MAX_MESSAGES` default to 2500
**How to avoid:** Validation must account for budget. Check that DB count <= fullSyncMaxMessages and that the most recent emails are present (INBOX gets 60% budget = ~1500 emails)
**Warning signs:** "Missing 4000 emails" -- it is the budget, not a bug

### Pitfall 2: Gmail Label Multi-assignment
**What goes wrong:** Email appears in INBOX count AND also has CATEGORY_SOCIAL label, causing apparent double-count
**Why it happens:** Gmail labels are not exclusive folders. One email can have [INBOX, CATEGORY_SOCIAL, UNREAD]. The sync stores the PRIMARY folder (determined by `GmailFolderService.determineFolderFromLabels()`) and stores all labels in the `labels` array.
**How to avoid:** Compare by unique email `externalId`, not by summing folder counts. The DB `folder` column holds the primary classification.
**Warning signs:** Sum of per-folder counts > total email count

### Pitfall 3: IMAP Folder Name Localization
**What goes wrong:** Italian IMAP server has "Posta inviata" but validator looks for "Sent"
**Why it happens:** IMAP folders are locale-specific. The system uses heuristic matching (`IMAP_NAME_HEURISTICS`) to map to canonical types.
**How to avoid:** Compare using `specialUse` field (canonical type), not `name` or `path`
**Warning signs:** Missing expected system folders in validation

### Pitfall 4: Microsoft Graph Folder ID Mismatch
**What goes wrong:** `parentFolderId` from message differs from `folder.id` for the same folder
**Why it happens:** Microsoft Graph folder IDs can have different representations. `MicrosoftFolderService.determineFolderFromParentId()` handles this with partial-prefix matching (first 80 chars).
**How to avoid:** Use `externalId` and `specialUse` for folder matching, not exact ID comparison
**Warning signs:** Emails assigned to wrong folders or "INBOX" fallback

### Pitfall 5: Sync-All Purge Timing
**What goes wrong:** Validation script reads DB before sync completes after purge
**Why it happens:** `POST /email-sync/sync-all` purges all emails then queues async sync jobs. The response returns immediately.
**How to avoid:** Poll `GET /email-sync/status` or `GET /email-sync/queues` until all queues show 0 active/waiting jobs, then validate.
**Warning signs:** Empty DB or partial results

### Pitfall 6: Tenant Scoping in Validation Queries
**What goes wrong:** Direct SQL queries bypass tenant isolation and mix data from multiple tenants
**Why it happens:** Running raw `pg` queries without `WHERE tenantId = $1`
**How to avoid:** ALWAYS include `tenantId` filter in every validation query. The project enforces this rule (see CLAUDE.md).
**Warning signs:** Unexpected email/folder counts

## Code Examples

### Triggering Full Sync via API
```javascript
// Purge and re-sync all providers for current tenant
const syncResult = await api.post(BACKEND_URL + '/api/v1/email-sync/sync-all', null, {
  headers: {
    'Cookie': cookieHeader,
    'x-csrf-token': csrfToken,
  },
});
console.log('Sync-all response:', syncResult.data);
// { success: true, deletedEmails: N, providersQueued: N, ... }
```

### Polling for Sync Completion
```javascript
async function waitForSyncCompletion(api, backendUrl, cookieHeader, maxWaitMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await api.get(backendUrl + '/api/v1/email-sync/queues', {
      headers: { 'Cookie': cookieHeader },
    });
    const queues = status.data;
    const totalActive = Object.values(queues).reduce((sum, q) => sum + (q.active || 0) + (q.waiting || 0), 0);
    if (totalActive === 0) return true;
    await new Promise(r => setTimeout(r, 5000)); // Poll every 5s
  }
  return false; // Timeout
}
```

### Provider Count Validation Query
```sql
-- Email counts per folder for a specific provider
SELECT folder, COUNT(*)::int as email_count
FROM emails
WHERE "providerId" = $1 AND "tenantId" = $2 AND "isDeleted" = false
GROUP BY folder
ORDER BY email_count DESC;

-- Folder records with counts
SELECT name, path, "specialUse", "totalCount", "unreadCount", "externalId", "parentId", level
FROM folders
WHERE "providerId" = $1 AND "tenantId" = $2
ORDER BY path;

-- Unique email count (dedup check)
SELECT COUNT(DISTINCT "externalId")::int as unique_emails
FROM emails
WHERE "providerId" = $1 AND "tenantId" = $2 AND "isDeleted" = false;
```

### Key DB Indices (Already Exist)
```
-- Email: @@unique([tenantId, providerId, externalId])
-- Folder: @@unique([providerId, path])
-- Folder: @@index([providerId, externalId])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-folder sync (INBOX only) | 5-folder weighted sync (INBOX, SENT, ARCHIVE, DRAFTS, TRASH) | Phase 6 (FOLDER-FIX) | Full mailbox coverage |
| Per-folder dedup only | Cross-folder dedup via processedExternalIds Set | Phase 6 (DEDUP-FIX) | No duplicate emails across folders |
| Token expires mid-sync | Mid-sync token refresh (CRIT-3 FIX) | Phase 6 | Long syncs don't fail |
| No distributed locking | Redis locks on folder sync and email upserts | Phase 5 (RC-1 through RC-9) | No race conditions |
| Direct Prisma in sync | Extracted services (SyncOrchestration, SyncMessageProcessor, SyncToken) | Phase 6 | Testable, maintainable |

## Open Questions

1. **What are the actual provider account states?**
   - What we know: STATE.md mentions "All three providers (Gmail, Outlook, IMAP) must have active test accounts with real data"
   - What's unclear: Are all three provider types currently configured with valid tokens in the database?
   - Recommendation: First task should verify active providers exist via `GET /email-sync/status` or direct DB check

2. **fullSyncMaxMessages configuration on Railway**
   - What we know: Defaults are 2500 per provider. Can be overridden via `GMAIL_FULL_MAX_MESSAGES`, `MS_FULL_MAX_MESSAGES`, `IMAP_FULL_MAX_MESSAGES` env vars.
   - What's unclear: What values are set in Railway production? This affects expected email counts.
   - Recommendation: Query env vars or check Railway dashboard before validation

3. **Folder count accuracy after full sync**
   - What we know: `FolderSyncService.updateAllFolderCounts()` runs after sync. Gmail counts derive from label membership.
   - What's unclear: Are `totalCount` / `unreadCount` on Folder records always accurate post-sync?
   - Recommendation: Cross-check Folder.totalCount against `SELECT COUNT(*) FROM emails WHERE folder = X`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + standalone validation scripts (.mjs) |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern=email-sync --forceExit` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Gmail full sync downloads all emails/folders/labels | E2E validation script | `node scripts/validate-full-sync.mjs --provider=gmail` | No - Wave 0 |
| SYNC-02 | Outlook full sync downloads all emails/folders | E2E validation script | `node scripts/validate-full-sync.mjs --provider=microsoft` | No - Wave 0 |
| SYNC-03 | IMAP full sync downloads all emails/folders | E2E validation script | `node scripts/validate-full-sync.mjs --provider=imap` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern=email-sync --forceExit`
- **Per wave merge:** `node scripts/validate-full-sync.mjs`
- **Phase gate:** All three providers pass validation before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-full-sync.mjs` -- main validation orchestrator (covers SYNC-01, SYNC-02, SYNC-03)
- [ ] Helper functions for provider count comparison, field spot-check, folder hierarchy validation

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/src/modules/email-sync/` -- full sync pipeline, driver interfaces, canonical types
- Codebase: `backend/src/modules/email-sync/README.md` -- architecture documentation
- Codebase: `backend/prisma/schema.prisma` -- Email and Folder models with indices
- Codebase: `backend/src/modules/email-sync/services/sync-orchestration.service.ts` -- full sync logic with folder budgets and dedup
- Codebase: `backend/src/modules/email-sync/workers/sync.worker.ts` -- job processing with folder sync + provider sync
- Codebase: `backend/src/modules/email-sync/email-sync.controller.ts` -- sync-all endpoint
- Codebase: `scripts/validate-gmail-e2e.mjs` -- existing validation script pattern (Playwright CDP)
- Codebase: `backend/scripts/check-sync.js` -- existing DB-based sync check pattern

### Secondary (MEDIUM confidence)
- Codebase: `backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts` -- provider-to-canonical folder mappings (comprehensive, multi-language)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - full sync pipeline thoroughly documented in code, README, and inline comments
- Pitfalls: HIGH - identified from actual code patterns (budget limits, label multi-assignment, locale heuristics, Graph ID mismatch, async purge timing)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable infrastructure, no upcoming migrations)
