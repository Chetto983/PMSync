# Phase 116: Attachments & Search - Research

**Researched:** 2026-03-26
**Domain:** Email attachment download, on-demand provider fetch, folder stats, full-text search validation
**Confidence:** HIGH

## Summary

Phase 116 is a **validation phase**, not a feature-building phase. The attachment download, on-demand fetch, folder stats, and full-text search endpoints already exist and are fully implemented in the backend. The goal is to write validation scripts that exercise these 4 capabilities against live provider data (Gmail, Outlook, IMAP) and fix any bugs found during validation.

The codebase has mature validation infrastructure established in Phases 112-115: Playwright CDP for cookie-based auth, shared helpers (`scripts/lib/validation-helpers.mjs`), per-provider validation modules, and a standard orchestrator pattern. Phase 116 follows this exact pattern, creating `scripts/validate-attachments-search.mjs` + `scripts/lib/validate-attachments-search.mjs`.

The four endpoints are well-implemented with security hardening (tenant isolation, size limits, header injection prevention), provider-specific fetch logic (Gmail API, Microsoft Graph, IMAP), S3 streaming with dedup, and Prisma-based search (subject/from/bodyText `contains` with case-insensitive matching).

**Primary recommendation:** Create validation scripts following the Phase 115 pattern. The attachment download test is the most complex (requires finding an email with attachments, then testing the streaming download). The search and stats tests are straightforward GET requests with assertions.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-06 | Attachment download streams from S3 with correct content-type | `GET /api/v1/email/attachments/:id/download` -- AttachmentsController streams via S3 signed URL proxy with Content-Type and Content-Disposition headers |
| READ-07 | On-demand attachment fetch retrieves from provider when not in S3 | AttachmentOnDemandService.downloadAttachment() checks S3 cache, falls back to provider (Gmail API / Graph API / IMAP), uploads to S3, then serves |
| READ-08 | Unread counts and folder stats match actual email state | `GET /api/v1/emails/stats` -- EmailSearchService.getStats() returns total, unread, starred, important, today, thisWeek, attachments, byFolder counts |
| READ-09 | Full-text search returns relevant results across providers | `GET /api/v1/emails/search?q=term` -- EmailSearchService.searchEmails() uses Prisma `contains` on subject, from, bodyText fields |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant rule:** Every query MUST include tenantId -- validation scripts must verify this
- **Post-edit validation:** After every file edit, run `npx tsc --noEmit` for the affected project
- **Follow existing patterns:** Use the established validation script pattern from Phases 112-115
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
| `scripts/lib/validation-helpers.mjs` | CDP connect, auth cookies, CSRF token, API helpers (apiGet, apiPost), assertions (assertEqual, assertTrue, assertRange), setResultsCollector, report |
| `scripts/validate-email-read.mjs` | Phase 115 orchestrator pattern to follow |
| `scripts/lib/validate-email-read.mjs` | Phase 115 validation module pattern to follow |

## Architecture Patterns

### Existing API Endpoints (already implemented)

| Endpoint | Controller | Service | Purpose |
|----------|-----------|---------|---------|
| `GET /api/v1/email/attachments/:id/download` | AttachmentsController | AttachmentOnDemandService.downloadAttachment() | Stream attachment from S3 (or fetch from provider first) |
| `GET /api/v1/email/attachments/:id/metadata` | AttachmentsController | AttachmentOnDemandService.getAttachmentMetadata() | Get filename, mimeType, size, isInS3 without downloading |
| `GET /api/v1/emails/stats` | EmailQueryController | EmailSearchService.getStats() | Folder stats: total, unread, starred, important, today, thisWeek, attachments, byFolder |
| `GET /api/v1/emails/search?q=term` | EmailQueryController | EmailSearchService.searchEmails() | Full-text search across subject, from, bodyText |

### Attachment Download Flow (READ-06 + READ-07)

```
Client -> GET /api/v1/email/attachments/:id/download
  -> AttachmentsController.downloadAttachment()
    -> AttachmentOnDemandService.downloadAttachment(id, tenantId)
      -> CASE 1: storageType='s3' && storagePath exists -> getSignedDownloadUrl() (cache hit)
      -> CASE 2: contentHash exists && S3 object by hash exists -> update metadata, return URL (dedup hit)
      -> CASE 3: storageType='pending' -> fetchFromProvider() -> uploadAttachment() -> return URL (cache miss)
    -> Controller fetches from S3 signed URL via node-fetch
    -> Sets Content-Type, Content-Disposition headers
    -> Streams response body to client via pipeline()
```

Key details:
- Controller path is `/email/attachments/:id/download` (note: `email/attachments` not `emails/attachments`)
- Tenant isolation via `email: { tenantId }` filter in Prisma query (SEC-6 fix)
- 50MB size limit enforced before provider download
- Redis lock prevents concurrent downloads of same attachment (RC-3 fix)
- Content-Disposition uses RFC 5987 encoding for unicode filenames (SEC-7 fix)
- Response is a binary stream, not JSON

### Stats Response Shape (READ-08)

```json
{
  "total": 1234,
  "unread": 56,
  "starred": 12,
  "important": 15,
  "today": 8,
  "thisWeek": 42,
  "attachments": 89,
  "byFolder": {
    "INBOX": 500,
    "Sent": 300,
    "Drafts": 10,
    ...
  }
}
```

Note: The stats endpoint may be wrapped in a `{ data: ... }` envelope depending on the response interceptor.

### Search Response Shape (READ-09)

```json
{
  "emails": [...],
  "limit": 20
}
```

Search uses `GET /api/v1/emails/search?q=term&providerId=X&limit=20`. The `q` parameter is required. The search uses Prisma `contains` (case-insensitive) on `subject`, `from`, and `bodyText` fields -- this is NOT a full-text search index, it's ILIKE queries.

### Validation Script Pattern (from Phase 115)

```
scripts/validate-attachments-search.mjs          # Orchestrator (--provider, --quick flags)
scripts/lib/validate-attachments-search.mjs      # Validation logic module
```

**Orchestrator structure (identical to Phase 115):**
```javascript
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateAttachmentsSearch } from './lib/validate-attachments-search.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';
const quickMode = args.includes('--quick');

async function main() {
  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateAttachmentsSearch(context, finalCookies, csrfToken, {
    provider: providerFlag, quick: quickMode,
  });

  const exitCode = report('Attachments & Search Validation', results);
  await browser.close();
  process.exit(exitCode);
}
main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
```

### Key Implementation Details Found

**1. Attachment download is a binary stream, not JSON (READ-06 nuance)**

The `GET /api/v1/email/attachments/:id/download` endpoint returns a binary stream with `Content-Type` and `Content-Disposition` headers. Validation cannot use `apiGet()` (which expects JSON). Must use a direct HTTP request and check:
- Response status is 200
- `Content-Type` header is set (not `application/json`)
- `Content-Disposition` header contains `attachment; filename*=UTF-8''...`
- Response body is non-empty

Playwright's `context.request` can handle binary responses. Use `response.body()` to get the Buffer and check `.byteLength > 0`.

**2. Finding an attachment to test requires listing emails with attachments first (READ-06/07)**

The validation must:
1. `GET /api/v1/emails?providerId=X&hasAttachments=true&limit=5` to find emails with attachments
2. Extract attachment IDs from the email response (attachments array)
3. `GET /api/v1/email/attachments/:attachmentId/metadata` to get metadata
4. `GET /api/v1/email/attachments/:attachmentId/download` to test streaming

**3. On-demand fetch cannot be directly forced (READ-07 nuance)**

An attachment is either already in S3 (`storageType='s3'`) or pending (`storageType='pending'`). The validation can:
- Check metadata endpoint to see `isInS3` field
- If `isInS3=false`, downloading triggers the on-demand fetch
- If `isInS3=true`, the download comes from S3 cache
- Both paths must produce a successful download

The validation should test BOTH cases if possible, but cannot control which attachment is cached. The metadata endpoint allows checking the state before download.

**4. Search is Prisma ILIKE, not full-text search (READ-09 nuance)**

The search uses `{ contains: query, mode: 'insensitive' }` which maps to `ILIKE '%query%'` in PostgreSQL. This is sufficient for validation but may be slow on large datasets. The validation should:
- Search for a known substring from a visible email's subject
- Verify the matching email appears in results
- Test with and without `providerId` filter

**5. Stats unread count excludes TRASH/SPAM (READ-08 nuance)**

`getStats()` builds TWO where clauses: one for total counts and one excluding TRASH/SPAM for the unread count. The validation should verify:
- `unread` count is non-negative
- `total` >= `unread` (unread is a subset)
- `byFolder` object has keys matching actual folders
- If a folder has N emails (from list endpoint), the `byFolder[folder]` count should match

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth in validation scripts | Custom auth flow | `connectCDP` + `getAuthCookies` from validation-helpers.mjs | Cookie-based auth via Edge CDP is the established pattern |
| JSON API calls | Raw fetch calls | `apiGet` from validation-helpers.mjs | Handles cookies, error reporting |
| Binary download testing | Custom HTTP client | Playwright `context.request.get()` with raw response handling | Already available in validation infra |
| Test assertions | console.log checks | `assertEqual`/`assertTrue` from validation-helpers.mjs | Standardized pass/fail reporting |
| Report formatting | Custom logging | `report()` from validation-helpers.mjs | Produces consistent exit codes |

## Common Pitfalls

### Pitfall 1: Attachment download returns binary, not JSON
**What goes wrong:** Using `apiGet()` for the download endpoint fails because it calls `response.json()`.
**Why it happens:** The download endpoint streams the file with `Content-Type: application/pdf` (or similar), not JSON.
**How to avoid:** Use Playwright's `context.request.get()` directly for the download endpoint. Check `response.status()` and `response.headers()` manually. Use `response.body()` to verify content is non-empty.
**Warning signs:** JSON parse error in the validation script.

### Pitfall 2: No emails with attachments in test data
**What goes wrong:** The `hasAttachments=true` filter returns 0 results, making READ-06/07 untestable.
**Why it happens:** Test accounts may not have emails with attachments, or attachments were not synced.
**How to avoid:** Push a SKIP result (not FAIL) if no emails with attachments exist for a provider. Log a warning that the provider lacks test data for this requirement.
**Warning signs:** Empty emails array when filtering by `hasAttachments=true`.

### Pitfall 3: Attachment controller path vs email controller path
**What goes wrong:** Using `/api/v1/emails/attachments/:id/download` (wrong) instead of `/api/v1/email/attachments/:id/download`.
**Why it happens:** The AttachmentsController uses `@Controller('email/attachments')` (singular "email"), not `emails/attachments`.
**How to avoid:** Use the exact path: `/api/v1/email/attachments/:id/download` and `/api/v1/email/attachments/:id/metadata`.
**Warning signs:** 404 responses.

### Pitfall 4: Stats endpoint returns data envelope
**What goes wrong:** Accessing `res.unread` directly when the actual shape is `res.data.unread` or similar.
**Why it happens:** NestJS response interceptor may wrap the response.
**How to avoid:** Unwrap with `const stats = res?.data ?? res` pattern (same as Phase 115).
**Warning signs:** All assertions fail with "expected truthy, got undefined".

### Pitfall 5: Search requires a valid query term
**What goes wrong:** Searching with an empty or random string returns 0 results, making READ-09 unverifiable.
**Why it happens:** The search term must match actual email content.
**How to avoid:** First fetch a real email's subject via `GET /emails?providerId=X&limit=1`, extract a word from the subject, then search for that word. This guarantees at least 1 match.
**Warning signs:** Search returns empty results array.

### Pitfall 6: Folder stats byFolder keys may not match folder names
**What goes wrong:** Comparing `byFolder['INBOX']` when the actual key is `byFolder['Posta in arrivo']` (localized name).
**Why it happens:** The `byFolder` grouping uses the `folder` column value, which is the provider's folder name (not specialUse).
**How to avoid:** First get the folder list, find the INBOX folder's `path` property, then use that as the key in `byFolder`. Or just verify `byFolder` is a non-empty object with numeric values.
**Warning signs:** `byFolder[key]` is undefined.

## Code Examples

### READ-06: Attachment Download Validation
```javascript
// Find an email with attachments
const emailsRes = await apiGet(
  context,
  `/api/v1/emails?providerId=${providerId}&hasAttachments=true&limit=5`,
  cookieHeader,
);
const emails = emailsRes?.data?.emails ?? emailsRes?.data ?? emailsRes?.emails ?? [];
const emailWithAtt = emails.find(e => e.attachments?.length > 0);

if (!emailWithAtt) {
  console.log('  SKIP: No emails with attachments found');
  return;
}

const attachmentId = emailWithAtt.attachments[0].id;

// Test metadata endpoint
const metadata = await apiGet(
  context,
  `/api/v1/email/attachments/${attachmentId}/metadata`,
  cookieHeader,
);
const meta = metadata?.data ?? metadata;
assertTrue(meta.filename, 'READ-06: Attachment has filename');
assertTrue(meta.mimeType, 'READ-06: Attachment has mimeType');
assertTrue(meta.size > 0, 'READ-06: Attachment has positive size');

// Test download endpoint (binary response)
const api = context.request;
const dlResponse = await api.get(
  BACKEND_URL + `/api/v1/email/attachments/${attachmentId}/download`,
  { headers: { Cookie: cookieHeader } },
);
assertEqual(dlResponse.status(), 200, 'READ-06: Download returns 200');
const contentType = dlResponse.headers()['content-type'];
assertTrue(contentType && contentType !== 'application/json', 'READ-06: Content-Type is not JSON');
const contentDisposition = dlResponse.headers()['content-disposition'];
assertTrue(contentDisposition?.includes('attachment'), 'READ-06: Content-Disposition is attachment');
const body = await dlResponse.body();
assertTrue(body.byteLength > 0, 'READ-06: Downloaded file has content');
```

### READ-07: On-Demand Fetch Validation
```javascript
// Use metadata to check if attachment is in S3 or pending
const meta = metadata?.data ?? metadata;
if (meta.isInS3) {
  console.log('  INFO: Attachment already cached in S3 (cache hit path)');
} else {
  console.log('  INFO: Attachment is pending (on-demand fetch will trigger)');
}
// Either way, download should succeed
assertTrue(dlResponse.status() === 200, 'READ-07: Download succeeds regardless of cache state');
assertTrue(body.byteLength > 0, 'READ-07: On-demand fetch returned file content');
```

### READ-08: Stats Validation
```javascript
const statsRes = await apiGet(context, `/api/v1/emails/stats?providerId=${providerId}`, cookieHeader);
const stats = statsRes?.data ?? statsRes;
assertTrue(typeof stats.total === 'number' && stats.total >= 0, 'READ-08: total is non-negative number');
assertTrue(typeof stats.unread === 'number' && stats.unread >= 0, 'READ-08: unread is non-negative number');
assertTrue(stats.total >= stats.unread, 'READ-08: total >= unread');
assertTrue(typeof stats.starred === 'number', 'READ-08: starred is number');
assertTrue(typeof stats.today === 'number', 'READ-08: today is number');
assertTrue(typeof stats.thisWeek === 'number', 'READ-08: thisWeek is number');
assertTrue(typeof stats.attachments === 'number', 'READ-08: attachments count is number');
assertTrue(typeof stats.byFolder === 'object' && stats.byFolder !== null, 'READ-08: byFolder is object');
assertTrue(Object.keys(stats.byFolder).length > 0, 'READ-08: byFolder has entries');
// Verify byFolder values are all numbers
const folderValues = Object.values(stats.byFolder);
assertTrue(folderValues.every(v => typeof v === 'number' && v >= 0), 'READ-08: All byFolder values are non-negative numbers');
// Cross-check: sum of byFolder should equal total
const folderSum = folderValues.reduce((a, b) => a + b, 0);
assertEqual(folderSum, stats.total, 'READ-08: byFolder sum equals total');
```

### READ-09: Search Validation
```javascript
// Get a real email to extract a searchable term
const emailsRes = await apiGet(context, `/api/v1/emails?providerId=${providerId}&limit=1`, cookieHeader);
const emails = emailsRes?.data?.emails ?? emailsRes?.data ?? emailsRes?.emails ?? [];
if (emails.length === 0) {
  console.log('  SKIP: No emails for search test');
  return;
}
const knownSubject = emails[0].subject;
// Extract a meaningful word (at least 4 chars) from the subject
const words = (knownSubject || '').split(/\s+/).filter(w => w.length >= 4);
if (words.length === 0) {
  console.log('  SKIP: Email subject too short for search test');
  return;
}
const searchTerm = words[0].replace(/[^a-zA-Z0-9]/g, ''); // alphanumeric only

const searchRes = await apiGet(
  context,
  `/api/v1/emails/search?q=${encodeURIComponent(searchTerm)}&providerId=${providerId}&limit=20`,
  cookieHeader,
);
const searchData = searchRes?.data ?? searchRes;
const searchEmails = searchData?.emails ?? searchData ?? [];
assertTrue(Array.isArray(searchEmails), 'READ-09: Search returns array');
assertTrue(searchEmails.length > 0, 'READ-09: Search returns at least 1 result for known term');

// Verify at least one result contains the search term in subject or from
const hasMatch = searchEmails.some(e =>
  (e.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
  (e.from || '').toLowerCase().includes(searchTerm.toLowerCase())
);
assertTrue(hasMatch, 'READ-09: At least one result matches the search term');
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright CDP + custom validation-helpers.mjs |
| Config file | None (script-based, not test-runner-based) |
| Quick run command | `node scripts/validate-attachments-search.mjs --provider=gmail --quick` |
| Full suite command | `node scripts/validate-attachments-search.mjs` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-06 | Attachment download with correct content-type | e2e script | `node scripts/validate-attachments-search.mjs --provider=gmail` | Wave 0 |
| READ-07 | On-demand fetch from provider when not in S3 | e2e script | `node scripts/validate-attachments-search.mjs --provider=gmail` | Wave 0 |
| READ-08 | Unread counts and folder stats accuracy | e2e script | `node scripts/validate-attachments-search.mjs --provider=gmail` | Wave 0 |
| READ-09 | Full-text search across providers | e2e script | `node scripts/validate-attachments-search.mjs --provider=gmail` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/validate-attachments-search.mjs --provider=gmail --quick`
- **Per wave merge:** `node scripts/validate-attachments-search.mjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-attachments-search.mjs` -- main orchestrator
- [ ] `scripts/lib/validate-attachments-search.mjs` -- validation logic module

## Open Questions

1. **Attachment download binary response handling with Playwright**
   - What we know: Playwright `context.request.get()` can handle non-JSON responses. `response.body()` returns a Buffer. `response.headers()` gives headers.
   - What's unclear: Whether the S3 proxy streaming through NestJS works correctly when Playwright follows the response (it should -- Playwright handles binary responses natively).
   - Recommendation: Use Playwright's API request directly (not `apiGet` helper). If download fails, check if the S3 signed URL has expired or if MinIO is unreachable.

2. **Stats providerId filter behavior**
   - What we know: `GET /api/v1/emails/stats?providerId=X` scopes stats to one provider. Without providerId, it returns aggregate stats across all providers.
   - What's unclear: Whether provider-scoped stats byFolder keys differ from aggregate stats.
   - Recommendation: Test with `providerId` to match per-provider validation pattern. Test without `providerId` as a bonus aggregate check.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/email/controllers/attachments.controller.ts` -- attachment download/metadata endpoints, streaming logic
- `backend/src/modules/email/services/attachment-on-demand.service.ts` -- on-demand fetch from Gmail/Microsoft/IMAP, S3 caching, dedup
- `backend/src/modules/email/services/attachment.storage.ts` -- content-hash dedup, pending reference parsing
- `backend/src/modules/email/services/email-search.service.ts` -- searchEmails and getStats implementations
- `backend/src/modules/email/controllers/email-query.controller.ts` -- stats and search endpoint signatures
- `backend/src/modules/email/services/email-folder.service.ts` -- search filter uses Prisma contains on subject, from, bodyText
- `backend/prisma/schema.prisma` -- EmailAttachment model: id, emailId, tenantId, filename, mimeType, size, storageType, storagePath, contentHash, isInline

### Secondary (HIGH confidence)
- `scripts/lib/validation-helpers.mjs` -- established validation infrastructure (apiGet, assertTrue, assertEqual, setResultsCollector, report)
- `scripts/lib/validate-email-read.mjs` -- Phase 115 validation module pattern (getProviders, getProviderFolders, per-provider loop)
- `scripts/validate-email-read.mjs` -- Phase 115 orchestrator pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, using existing validation infra
- Architecture: HIGH -- all 4 endpoints already implemented, code read thoroughly
- Pitfalls: HIGH -- identified from code reading (binary streaming, path mismatch, envelope unwrapping, search term selection)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- validation of existing code)
