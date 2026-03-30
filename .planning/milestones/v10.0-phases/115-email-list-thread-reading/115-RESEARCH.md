# Phase 115: Email List & Thread Reading - Research

**Researched:** 2026-03-26
**Domain:** Email REST API validation (list, filter, paginate, thread, single-email GET)
**Confidence:** HIGH

## Summary

Phase 115 is a **validation phase**, not a feature-building phase. The email list, filter, pagination, thread, and single-email GET endpoints already exist and are fully implemented. The goal is to write validation scripts that exercise these endpoints against live provider data (Gmail, Outlook, IMAP) and fix any bugs found during validation.

The codebase has a mature validation infrastructure established in Phases 112-114: Playwright CDP for cookie-based auth, shared helpers (`scripts/lib/validation-helpers.mjs`), per-provider validation modules, and a standard orchestrator pattern (`scripts/validate-*.mjs`). Phase 115 follows this exact pattern.

**Primary recommendation:** Create `scripts/validate-email-read.mjs` orchestrator + `scripts/lib/validate-email-read.mjs` module that exercises all 5 READ requirements against each provider's synced data. Fix bugs in-place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-01 | List emails with folder filter returns correct results per provider | `GET /emails?folder=X` or `?specialUse=X` -- EmailQueryController + EmailFolderService.buildEmailWhere() handles folder resolution with cached folder map |
| READ-02 | List emails with compound filters (isRead + hasAttachments + dateRange) works | EmailQueryController accepts all filter params; EmailFolderService.buildEmailWhere() merges them into AND conditions |
| READ-03 | Pagination returns consistent results across pages | Uses offset-based pagination (page/limit/skip) via validatePagination(); ordered by `receivedAt DESC` |
| READ-04 | Thread view groups related emails correctly and lazy-fetches missing bodies | `GET /emails/thread/:threadId` -- EmailsController.getThread() + lazy-fetch via EmailFetchService.fetchArchivedEmail() |
| READ-05 | Single email GET returns full body, headers, and metadata | `GET /emails/:id` -- EmailsController.getEmail() with lazy body fetch fallback |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant rule:** Every query MUST include tenantId -- validation scripts must verify this
- **Post-edit validation:** After every file edit, run `npx tsc --noEmit` for the affected project
- **Follow existing patterns:** Use the established validation script pattern from Phases 112-114
- **Scope control:** Validation only -- no new features, no refactors
- **Frontend UI testing is OUT OF SCOPE** per REQUIREMENTS.md
- **Max 500 lines per file**

## Standard Stack

This is a validation phase. No new libraries are needed.

### Core (existing, used by validation scripts)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Playwright | CDP connection to Edge for cookie-based auth | Established in Phase 112, all validation scripts use it |
| Node.js fetch | HTTP calls to backend API | Used by validation-helpers.mjs |

### Validation Infrastructure (already exists)
| File | Purpose |
|------|---------|
| `scripts/lib/validation-helpers.mjs` | CDP connect, auth cookies, CSRF token, API helpers, assertions, reporting |
| `scripts/validate-full-sync.mjs` | Phase 112 orchestrator pattern to follow |
| `scripts/validate-syncback.mjs` | Phase 114 orchestrator pattern to follow |

## Architecture Patterns

### Existing API Endpoints (already implemented)

| Endpoint | Controller | Service Chain | Purpose |
|----------|-----------|---------------|---------|
| `GET /emails` | EmailQueryController | EmailsService.listEmails -> EmailCrudService.listEmails | List with pagination + filters |
| `GET /emails?folder=X` | EmailQueryController | ... -> EmailFolderService.buildEmailWhere() | Folder filter |
| `GET /emails?specialUse=INBOX` | EmailQueryController | ... -> folder map lookup by specialUse | RFC 6154 folder type filter |
| `GET /emails?isRead=false&hasAttachments=true&startDate=X&endDate=Y` | EmailQueryController | ... -> AND conditions in buildEmailWhere | Compound filters |
| `GET /emails/conversations` | EmailsController | EmailSearchService.getConversations | Thread-grouped view |
| `GET /emails/thread/:threadId` | EmailsController | EmailSearchService.getThread + EmailFetchService.fetchArchivedEmail | Thread detail with lazy body fetch |
| `GET /emails/:id` | EmailsController | EmailCrudService.getEmailById + EmailFetchService.fetchArchivedEmail | Single email with full body |
| `GET /emails/stats` | EmailQueryController | EmailSearchService.getStats | Folder stats (used by Phase 116, not 115) |

### Validation Script Pattern (from Phases 112-114)

```
scripts/validate-email-read.mjs          # Orchestrator (--provider flag, --quick flag)
scripts/lib/validate-email-read.mjs      # Validation logic module
```

**Orchestrator structure:**
```javascript
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateEmailRead } from './lib/validate-email-read.mjs';

// Parse args: --provider=gmail|outlook|imap|all, --quick
const { browser, context } = await connectCDP();
const cookieHeader = await getAuthCookies(context);
const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

const results = await validateEmailRead(context, finalCookies, csrfToken, { provider, quick });
const exitCode = report('Email Read Validation', results);
await browser.close();
process.exit(exitCode);
```

### Key Implementation Details Found

**1. Pagination is offset-based, not cursor-based (READ-03 nuance)**

The codebase uses `page`/`limit`/`skip` offset pagination, NOT cursor-based pagination. The success criteria says "cursor-based pagination" but the actual implementation is offset-based with `receivedAt DESC` ordering. The validation must test what exists: offset pagination returning consistent, non-duplicated results. If new emails arrive between page fetches, offset pagination can theoretically show duplicates or skip items -- this is a known limitation to document, not a bug to fix.

**2. Folder filter resolution is complex (READ-01)**

`EmailFolderService.buildEmailWhere()` resolves folder filters through multiple strategies:
- `folder` param: matches by path, name, or specialUse (case-insensitive)
- `specialUse` param: matches by RFC 6154 type (INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE)
- For Google providers: also checks `labels[]` array using `Folder.externalId` as the label token
- Cached folder map (Redis, 5min TTL) for performance

Validation must test that `?folder=INBOX` and `?specialUse=INBOX` both return correct results for each provider.

**3. Thread view has lazy body fetch (READ-04)**

`getThread()` returns all emails in thread ordered by `receivedAt ASC`. For emails with `isBodyFetched=false`, the controller (`EmailsController.getThread`) calls `EmailFetchService.fetchArchivedEmail()` which fetches from the provider (Gmail API / Graph API / IMAP) and updates the DB.

**4. Single email GET has body fallback (READ-05)**

`getEmail()` returns full email with `include: { attachments, provider, emailLabels }`. If `bodyHtml` AND `bodyText` are both null/empty, it falls back to `fetchArchivedEmail()` to fetch from provider.

The `headers` field is stored as JSON and populated during fetch. The `include` returns full model including `headers`, `metadata`, and all relations.

**5. hasAttachments filter uses relation check (READ-02)**

`where.attachments = { some: {} }` -- Prisma relation check. The `EmailAttachment` model has `@@index([emailId])` for performance.

### Database Indexes (relevant to READ queries)

| Index | Supports |
|-------|----------|
| `@@index([tenantId, folder, receivedAt])` | READ-01: folder filter + sort |
| `@@index([tenantId, providerId, folder, receivedAt])` | READ-01: provider-scoped folder filter + sort |
| `@@index([tenantId, isRead])` | READ-02: isRead filter |
| `@@index([tenantId, threadId])` | READ-04: thread grouping |
| `@@index([tenantId, isStarred, receivedAt])` | READ-02: isStarred filter |
| `@@index([tenantId, isBodyFetched])` | READ-04/05: finding emails needing body fetch |
| `@@index([emailId])` on EmailAttachment | READ-02: hasAttachments filter |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth in validation scripts | Custom auth flow | `connectCDP` + `getAuthCookies` from validation-helpers.mjs | Cookie-based auth via Edge CDP is the established pattern |
| API call helpers | Raw fetch calls | `apiGet`/`apiPost` from validation-helpers.mjs | Handles cookies, CSRF, error reporting |
| Test assertions | console.log checks | `assertEqual`/`assertRange` from validation-helpers.mjs | Standardized pass/fail reporting |
| Report formatting | Custom logging | `report()` from validation-helpers.mjs | Produces consistent exit codes |

## Common Pitfalls

### Pitfall 1: Folder name mismatch across providers
**What goes wrong:** Gmail uses label IDs (e.g., "INBOX"), Outlook uses folder paths (e.g., "Inbox"), IMAP uses mailbox names (e.g., "INBOX" or localized like "Posta in arrivo").
**Why it happens:** Each provider has different folder naming conventions. The `buildEmailWhere()` method handles this with case-insensitive matching and multiple fallback strategies.
**How to avoid:** Validation should first GET the provider's folders (`GET /folders?providerId=X`) to discover actual folder names, then use those exact names in filter tests.
**Warning signs:** Empty results when filtering by folder name.

### Pitfall 2: Offset pagination inconsistency with live data
**What goes wrong:** Between page 1 and page 2 fetches, new emails may arrive, causing items to shift and appear duplicated or missing.
**Why it happens:** Offset pagination (`SKIP/TAKE`) doesn't maintain a stable cursor.
**How to avoid:** Run pagination tests in a stable window (no sync running) or accept that results may shift. Validate with a quick sequence of page fetches without intervening writes.
**Warning signs:** Same email ID appearing on two consecutive pages.

### Pitfall 3: Thread lazy-fetch failure for IMAP
**What goes wrong:** IMAP lazy-fetch requires the email's `externalId` to contain folder path + UID. If the externalId format is wrong, `parseImapExternalId()` fails.
**Why it happens:** IMAP external IDs use a composite format (`folderPath:uid`).
**How to avoid:** Validation should check that thread view successfully returns body content for all emails, including ones that needed lazy-fetch.
**Warning signs:** Thread emails with null bodyHtml and bodyText after GET.

### Pitfall 4: Google label-based folder filter
**What goes wrong:** Gmail emails might have folder="INBOX" but labels=["INBOX","IMPORTANT"]. Or they might have mismatched folder/labels due to sync timing.
**Why it happens:** Gmail uses labels not folders; the sync maps labels to folders. The `buildEmailWhere()` uses OR(folder match, labels match) for Google providers.
**How to avoid:** The existing implementation handles this via `googleLabelFilter` in `buildEmailWhere()`. Validation should verify both `?folder=INBOX` and `?specialUse=INBOX` return the same set for Google providers.
**Warning signs:** Different email counts for the same logical folder using different filter approaches.

### Pitfall 5: Missing body on single email GET
**What goes wrong:** `GET /emails/:id` returns email with empty bodyHtml/bodyText.
**Why it happens:** Hybrid sync stores metadata-only for old emails (`isArchived=true` or `isBodyFetched=false`). The controller has a fallback to fetch from provider, but it may fail if the provider token is expired or the email was deleted remotely.
**How to avoid:** Validation should test GET on a known email and verify body content is non-empty.
**Warning signs:** bodyHtml and bodyText both null/empty in the response.

## Code Examples

### READ-01 Validation: Folder Filter
```javascript
// Get provider's folders first
const folders = await apiGet(`/folders?providerId=${providerId}`, cookies, csrfToken);
const inbox = folders.find(f => f.specialUse === 'INBOX');

// Test folder filter by path
const byPath = await apiGet(`/emails?providerId=${providerId}&folder=${encodeURIComponent(inbox.path)}&limit=10`, cookies, csrfToken);
assert(byPath.emails.length > 0, 'Inbox should have emails');
assert(byPath.emails.every(e => e.folder.toLowerCase() === inbox.path.toLowerCase()), 'All emails should be in inbox folder');

// Test folder filter by specialUse
const bySpecialUse = await apiGet(`/emails?providerId=${providerId}&specialUse=INBOX&limit=10`, cookies, csrfToken);
assert(bySpecialUse.pagination.total === byPath.pagination.total, 'specialUse and folder should return same count');
```

### READ-02 Validation: Compound Filters
```javascript
// Combine isRead + hasAttachments + dateRange
const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
const endDate = new Date().toISOString();
const result = await apiGet(
  `/emails?providerId=${providerId}&isRead=false&hasAttachments=true&startDate=${startDate}&endDate=${endDate}&limit=50`,
  cookies, csrfToken
);
// Verify all returned emails match ALL filters
for (const email of result.emails) {
  assert(email.isRead === false, `Email ${email.id} should be unread`);
  assert(email.attachments?.length > 0, `Email ${email.id} should have attachments`);
  const receivedAt = new Date(email.receivedAt);
  assert(receivedAt >= new Date(startDate) && receivedAt <= new Date(endDate), `Email ${email.id} should be in date range`);
}
```

### READ-03 Validation: Pagination Consistency
```javascript
// Fetch page 1 and page 2
const page1 = await apiGet(`/emails?providerId=${providerId}&limit=10&page=1`, cookies, csrfToken);
const page2 = await apiGet(`/emails?providerId=${providerId}&limit=10&page=2`, cookies, csrfToken);

// Check no duplicates
const page1Ids = new Set(page1.emails.map(e => e.id));
const page2Ids = new Set(page2.emails.map(e => e.id));
const overlap = [...page1Ids].filter(id => page2Ids.has(id));
assert(overlap.length === 0, `Pages should not overlap: found ${overlap.length} duplicates`);

// Check ordering: last item on page 1 >= first item on page 2
if (page1.emails.length > 0 && page2.emails.length > 0) {
  const lastPage1Date = new Date(page1.emails[page1.emails.length - 1].receivedAt);
  const firstPage2Date = new Date(page2.emails[0].receivedAt);
  assert(lastPage1Date >= firstPage2Date, 'Page ordering should be receivedAt DESC');
}
```

### READ-04 Validation: Thread View
```javascript
// Find an email with a threadId
const emails = await apiGet(`/emails?providerId=${providerId}&limit=50`, cookies, csrfToken);
const threaded = emails.emails.find(e => e.threadId);

if (threaded) {
  const thread = await apiGet(`/emails/thread/${threaded.threadId}`, cookies, csrfToken);
  assert(Array.isArray(thread), 'Thread should return array');
  assert(thread.length >= 1, 'Thread should have at least 1 email');
  assert(thread.every(e => e.threadId === threaded.threadId || e.id === threaded.threadId), 'All emails should be in same thread');
  // Verify body content (lazy-fetch should have populated it)
  for (const email of thread) {
    assert(email.bodyHtml || email.bodyText, `Thread email ${email.id} should have body content`);
  }
}
```

### READ-05 Validation: Single Email GET
```javascript
const emails = await apiGet(`/emails?providerId=${providerId}&limit=1`, cookies, csrfToken);
const emailId = emails.emails[0].id;
const full = await apiGet(`/emails/${emailId}`, cookies, csrfToken);

assert(full.id === emailId, 'Should return correct email');
assert(full.bodyHtml || full.bodyText, 'Should have body content');
assert(full.from, 'Should have from field');
assert(full.subject !== undefined, 'Should have subject field');
assert(full.receivedAt, 'Should have receivedAt');
assert(full.provider, 'Should include provider relation');
assert(full.attachments !== undefined, 'Should include attachments');
assert(full.emailLabels !== undefined, 'Should include emailLabels');
// Headers may be null for old emails but should be present after fetch
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright CDP + custom validation-helpers.mjs |
| Config file | None (script-based, not test-runner-based) |
| Quick run command | `node scripts/validate-email-read.mjs --provider=gmail --quick` |
| Full suite command | `node scripts/validate-email-read.mjs` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-01 | Folder filter returns correct emails per provider | e2e script | `node scripts/validate-email-read.mjs --provider=gmail` | Wave 0 |
| READ-02 | Compound filters (isRead + hasAttachments + dateRange) | e2e script | `node scripts/validate-email-read.mjs --provider=gmail` | Wave 0 |
| READ-03 | Pagination consistency, no duplicates | e2e script | `node scripts/validate-email-read.mjs --provider=gmail` | Wave 0 |
| READ-04 | Thread grouping + lazy body fetch | e2e script | `node scripts/validate-email-read.mjs --provider=gmail` | Wave 0 |
| READ-05 | Single email GET full body/headers/metadata | e2e script | `node scripts/validate-email-read.mjs --provider=gmail` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/validate-email-read.mjs --provider=gmail --quick`
- **Per wave merge:** `node scripts/validate-email-read.mjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-email-read.mjs` -- main orchestrator
- [ ] `scripts/lib/validate-email-read.mjs` -- validation logic module

## Open Questions

1. **Conversations endpoint not in READ requirements**
   - What we know: `GET /emails/conversations` exists and groups by threadId, but READ-04 specifically mentions "Thread view" which maps to `GET /emails/thread/:threadId`
   - What's unclear: Should we also validate the conversations endpoint?
   - Recommendation: Include a basic conversations test as a bonus check since it's closely related, but the formal requirement is only thread/:threadId

2. **Offset pagination vs "cursor-based" in success criteria**
   - What we know: The implementation uses offset-based pagination (page/limit), not cursor-based
   - What's unclear: Was "cursor-based" in the success criteria aspirational or descriptive?
   - Recommendation: Validate the existing offset-based pagination for consistency and non-duplication. If cursor-based is desired, that's a new feature -- out of scope for this validation milestone.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/email/controllers/email-query.controller.ts` -- list endpoint with all filter params
- `backend/src/modules/email/controllers/emails.controller.ts` -- thread and single email endpoints
- `backend/src/modules/email/services/email-crud.service.ts` -- listEmails implementation
- `backend/src/modules/email/services/email-search.service.ts` -- getConversations, getThread
- `backend/src/modules/email/services/email-folder.service.ts` -- buildEmailWhere filter construction
- `backend/src/modules/email/services/email-fetch.service.ts` -- lazy body fetch from providers
- `backend/prisma/schema.prisma` -- Email model, indexes, relations
- `backend/src/common/utils/prisma-select.utils.ts` -- emailListSelect, emailLabelsInclude
- `backend/src/common/utils/pagination.utils.ts` -- validatePagination, buildPaginationMeta

### Secondary (HIGH confidence)
- `scripts/lib/validation-helpers.mjs` -- established validation infrastructure
- `scripts/validate-syncback.mjs` -- Phase 114 orchestrator pattern
- `scripts/validate-full-sync.mjs` -- Phase 112 orchestrator pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, using existing validation infra
- Architecture: HIGH -- all endpoints already implemented, code read thoroughly
- Pitfalls: HIGH -- identified from code reading, especially folder resolution complexity and lazy-fetch edge cases

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- validation of existing code)
