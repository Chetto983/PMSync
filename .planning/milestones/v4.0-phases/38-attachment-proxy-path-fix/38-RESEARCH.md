# Phase 38: Attachment Proxy Path Fix - Research

**Researched:** 2026-03-04
**Domain:** Next.js API route proxy, NestJS global prefix, attachment download flow
**Confidence:** HIGH

## Summary

This phase fixes a one-line bug: the Next.js attachment download proxy at `frontend/pages/api/email/attachments/[id]/download.ts` calls the backend at `${API_BASE_URL}/email/attachments/${id}/download` but Phase 33 added `setGlobalPrefix('api/v1')` to all NestJS routes, so the correct backend path is now `${API_BASE_URL}/api/v1/email/attachments/${id}/download`. The result is a 404 when any user tries to download or view an inline email attachment.

The fix is trivial (add `/api/v1` to line 58), but verification matters: the E2E flow involves cookie auth (Phase 34), backend S3 streaming, and content-type forwarding. The proxy is the only Next.js API route in the project, so no other proxy routes need the same fix.

**Primary recommendation:** Change line 58 of `frontend/pages/api/email/attachments/[id]/download.ts` to include `/api/v1` prefix. Update the comment on line 57 and the JSDoc on line 10. Verify with a manual download test or automated E2E.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-03 | Global API prefix `api/v1` enforced via setGlobalPrefix, manual prefixes removed from 8 controllers | The attachment proxy is the last consumer calling backend without `/api/v1`. Fixing the proxy URL completes API-03 coverage. |
| SEC-01 | Frontend auth migrated from localStorage JWT to httpOnly secure cookies with dual-mode transition period | The proxy already reads `access_token` from `req.cookies` (Phase 34 wiring). Cookie auth works; only the URL path is wrong. Fixing the path completes the attachment download auth flow under SEC-01. |
</phase_requirements>

## Standard Stack

### Core (already in project -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js API Routes | 14.x | Server-side proxy for attachment downloads | Already the proxy mechanism; no alternative needed |
| NestJS `setGlobalPrefix` | 10.x | `/api/v1` prefix on all backend routes | Already configured in Phase 33 |
| node-fetch (backend) | 3.x | Backend streams from S3 to response | Already used in AttachmentsController |

### Supporting

No new libraries needed. This is a URL string fix.

### Alternatives Considered

None. This is a bug fix, not an architecture decision.

**Installation:**
```bash
# No installation needed
```

## Architecture Patterns

### Current Attachment Download Flow

```
Browser (img src or click)
  |
  v
/api/email/attachments/{id}/download   (Next.js API route -- frontend proxy)
  |
  | reads access_token from httpOnly cookie
  | sends as Authorization: Bearer header
  v
http://localhost:3000/email/attachments/{id}/download  <-- BUG: missing /api/v1
  |
  v  (should be)
http://localhost:3000/api/v1/email/attachments/{id}/download
  |
  v
AttachmentsController.downloadAttachment()
  |
  v
AttachmentOnDemandService -> S3 signed URL -> stream to response
```

### Key Files

| File | Role |
|------|------|
| `frontend/pages/api/email/attachments/[id]/download.ts` | Next.js proxy route (THE file to fix) |
| `backend/src/modules/email/controllers/attachments.controller.ts` | Backend controller (`@Controller('email/attachments')`) |
| `backend/src/main.ts` (line 118) | `setGlobalPrefix('api/v1', { exclude: [...] })` |
| `frontend/components/email/thread/EmailHtmlContent.tsx` (line 58) | Generates `/api/email/attachments/${att.id}/download` URLs for inline images |
| `frontend/lib/api-client.ts` | `apiClient` with `baseURL: ${apiBaseURL}/api/v1` (already correct) |

### Why Only This File Is Broken

The `apiClient` axios instance (used by all TanStack Query hooks) already has `baseURL: ${apiBaseURL}/api/v1`. So all normal API calls work. The attachment proxy is a **standalone Next.js API route** that constructs its own URL using raw `NEXT_PUBLIC_API_URL` -- it bypasses `apiClient` entirely because it runs server-side in Node.js, not in the browser.

### Anti-Patterns to Avoid

- **Don't change the frontend-facing URL** (`/api/email/attachments/{id}/download`): This is a Next.js pages/api route. The browser hits this. It must stay as-is.
- **Don't add apiClient to the proxy**: The proxy runs server-side (Node.js). apiClient is a browser-side axios instance.
- **Don't exclude attachments from globalPrefix**: The controller already works under `/api/v1`. The proxy just needs to call the right URL.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL construction | Custom URL builder | Simple string interpolation with `/api/v1` prefix | One URL, one fix. No abstraction needed. |

## Common Pitfalls

### Pitfall 1: Forgetting the Comment Update
**What goes wrong:** Line 57 comment says `// Backend route: /email/attachments/:id/download (no api/v1 prefix)` -- if you fix the URL but not the comment, next developer is confused.
**How to avoid:** Update comment on line 57 and JSDoc on line 10 to reflect the correct path with `/api/v1`.

### Pitfall 2: Double-Prefix if NEXT_PUBLIC_API_URL Already Includes /api/v1
**What goes wrong:** If someone sets `NEXT_PUBLIC_API_URL=http://backend:3000/api/v1`, the URL becomes `.../api/v1/api/v1/email/...`.
**How to avoid:** Check the current convention. The `api-client.ts` appends `/api/v1` to `NEXT_PUBLIC_API_URL`, meaning `NEXT_PUBLIC_API_URL` is expected to be the bare host (e.g., `http://localhost:3000`). The proxy should follow the same convention: `${API_BASE_URL}/api/v1/email/attachments/${id}/download`. This is consistent with `apiClient.baseURL`.

### Pitfall 3: Cookie Forwarding Already Works
**What goes wrong:** Wasting time investigating cookie auth. The proxy already correctly reads `access_token` from `req.cookies` and forwards as Bearer header.
**How to avoid:** Don't touch the auth logic. It was wired correctly in Phase 34. Only the URL path is broken.

## Code Examples

### The Fix (line 58)

```typescript
// BEFORE (broken -- 404):
const backendUrl = `${API_BASE_URL}/email/attachments/${id}/download`;

// AFTER (fixed):
const backendUrl = `${API_BASE_URL}/api/v1/email/attachments/${id}/download`;
```

### Comment Fix (line 57)

```typescript
// BEFORE:
// Backend route: /email/attachments/:id/download (no api/v1 prefix)

// AFTER:
// Backend route: /api/v1/email/attachments/:id/download
```

### JSDoc Fix (line 10)

```typescript
// BEFORE:
// 3. Forwards request to backend: http://localhost:3000/email/attachments/{id}/download

// AFTER:
// 3. Forwards request to backend: http://localhost:3000/api/v1/email/attachments/{id}/download
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No global prefix | `setGlobalPrefix('api/v1')` | Phase 33 (2026-03-03) | All backend routes moved under `/api/v1/`. Most callers updated; proxy missed. |
| localStorage JWT | httpOnly cookie | Phase 34 (2026-03-04) | Proxy updated to read cookie. Auth works; path broken. |

## Open Questions

None. This is a well-understood one-line fix with clear root cause analysis from the milestone audit.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E) + manual verification |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `npx playwright test --grep "attachment"` (if test exists) |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-03 | Attachment proxy URL includes /api/v1 prefix | unit/smoke | Manual: start backend+frontend, open email with attachment, verify download returns 200 | No dedicated test |
| SEC-01 | Cookie-authenticated attachment download succeeds | e2e/manual | Manual: verify download works when logged in via cookie (no localStorage token) | No dedicated test |

### Sampling Rate
- **Per task commit:** Visual/manual verification -- open an email with inline images, confirm they render (200, not 404)
- **Per wave merge:** Full Playwright suite `cd frontend && npx playwright test`
- **Phase gate:** Attachment download returns 200 with correct content-type and file data

### Wave 0 Gaps
- No existing E2E test covers the attachment download flow
- A simple smoke test could be added but is not strictly required for a one-line URL fix
- Manual verification is sufficient given the fix's simplicity

## Sources

### Primary (HIGH confidence)
- `frontend/pages/api/email/attachments/[id]/download.ts` -- the broken proxy file, line 58
- `backend/src/main.ts` line 118 -- `setGlobalPrefix('api/v1', { exclude: [...] })`
- `backend/src/modules/email/controllers/attachments.controller.ts` -- `@Controller('email/attachments')`, confirms route is NOT excluded from global prefix
- `frontend/lib/api-client.ts` line 24 -- `baseURL: ${apiBaseURL}/api/v1` confirms convention
- `.planning/v4.0-MILESTONE-AUDIT.md` -- documents the exact gap at line 29

### Secondary (MEDIUM confidence)
- None needed -- all evidence is in the codebase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, just a string fix
- Architecture: HIGH -- full flow traced through 4 files, single point of failure identified
- Pitfalls: HIGH -- only 3 pitfalls, all verified against codebase conventions

**Research date:** 2026-03-04
**Valid until:** Indefinite (fix is deterministic, not version-dependent)
