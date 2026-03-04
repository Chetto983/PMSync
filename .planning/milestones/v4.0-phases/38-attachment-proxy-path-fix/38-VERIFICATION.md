---
phase: 38-attachment-proxy-path-fix
verified: 2026-03-04T14:45:00Z
status: human_needed
score: 3/3 must-haves verified (automated)
human_verification:
  - test: "Attachment download returns 200 with correct file content"
    expected: "Click any attachment in the email UI; browser receives the file with correct MIME type and content, no 404 or 500"
    why_human: "Requires live backend + frontend; URL correctness is verified but the actual HTTP round-trip and S3/provider fetch cannot be confirmed from static analysis"
  - test: "Cookie-authenticated attachment download succeeds without 401"
    expected: "Logged-in user can download attachment without being asked to re-authenticate; network tab shows 200, not 401/403"
    why_human: "Cookie auth path depends on runtime cookie presence and JwtAuthGuard validation — confirmed structurally correct but live session needed"
---

# Phase 38: Attachment Proxy Path Fix — Verification Report

**Phase Goal:** Fix broken email attachment download by adding the missing /api/v1 prefix to the proxy URL in the Next.js API route.
**Verified:** 2026-03-04T14:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Attachment proxy URL includes /api/v1 prefix when calling backend | VERIFIED | `download.ts` line 58: `${API_BASE_URL}/api/v1/email/attachments/${id}/download` |
| 2 | Email attachment download returns 200 with correct file data (not 404) | VERIFIED (structure) / HUMAN NEEDED (live) | URL correctly targets `/api/v1/email/attachments/:id/download` which resolves to `AttachmentsController.downloadAttachment`; live 200 needs human confirmation |
| 3 | Cookie-authenticated attachment download succeeds end-to-end | VERIFIED (structure) / HUMAN NEEDED (live) | Cookie-read logic (lines 39-49) untouched; unit tests confirm cookie path works; runtime session flow needs human confirmation |

**Score:** 3/3 truths structurally verified; 2/3 require human confirmation for live behavior.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/pages/api/email/attachments/[id]/download.ts` | Attachment download proxy with correct backend URL | VERIFIED | Exists, 109 lines, substantive implementation with auth (cookie + Bearer header), streaming, error forwarding, cache headers. Line 58 contains `/api/v1/email/attachments/`. |

**Level 1 — Exists:** Yes, file present at expected path.

**Level 2 — Substantive:** Yes. Not a stub. Contains: auth token extraction from httpOnly cookie (lines 39-49), fallback to Authorization header (lines 44-49), fetch to backend (lines 60-65), error forwarding (lines 67-72), response header copying (lines 76-88), streaming via `arrayBuffer()` + `Buffer.from()` (lines 94-95), 50MB response limit config (lines 104-108).

**Level 3 — Wired:** Yes.
- Used by `frontend/components/email/thread/EmailHtmlContent.tsx` line 58: `const url = '/api/email/attachments/${att.id}/download'` (Next.js route that maps to this handler).
- Used by `frontend/pages/dashboard/email.tsx` line 542 via `apiClient.get('/email/attachments/${attachmentId}/download')` — `apiClient` base URL is `${apiBaseURL}/api/v1`, so this resolves through the axios client directly to the backend (not through the Next.js proxy). This is a distinct code path but does NOT bypass the /api/v1 fix; it already had the prefix via `apiClient`.

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/pages/api/email/attachments/[id]/download.ts` | `backend AttachmentsController` | `fetch to API_BASE_URL/api/v1/email/attachments/:id/download` | WIRED | Line 58 constructs `${API_BASE_URL}/api/v1/email/attachments/${id}/download`. Backend: `@Controller('email/attachments')` + `@Get(':id/download')` + `app.setGlobalPrefix('api/v1')` (main.ts line 118) = `/api/v1/email/attachments/:id/download`. Path match confirmed. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| API-03 | 38-01-PLAN.md | Global API prefix `api/v1` enforced via setGlobalPrefix, manual prefixes removed from 8 controllers | SATISFIED | The attachment proxy was the last gap; proxy now includes `/api/v1`. REQUIREMENTS.md traceability table marks API-03 as Phase 38 Complete. |
| SEC-01 | 38-01-PLAN.md | Frontend auth migrated from localStorage JWT to httpOnly secure cookies with dual-mode transition period | SATISFIED | Cookie-read logic (lines 39-49) reads `req.cookies['access_token']` (httpOnly cookie set by Phase 34). Bearer header fallback retained. No regression to localStorage. |

No orphaned requirements: REQUIREMENTS.md maps only API-03 and SEC-01 to Phase 38, both covered by the single plan 38-01.

---

### Commit Verification

| Commit | Message | Files Changed | Status |
|--------|---------|---------------|--------|
| `d143c4a1` | fix(38-01): add /api/v1 prefix to attachment proxy backend URL | `frontend/pages/api/email/attachments/[id]/download.ts` — 3 insertions, 3 deletions | VERIFIED — commit exists in git history |

The diff is minimal and surgical: JSDoc line 10, inline comment line 57, and the actual URL construction line 58. All three updated to reference `/api/v1`. No unrelated changes.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/pages/api/email/attachments/[id]/download.test.ts` | 40 | TypeScript error: `Type 'unknown' is not assignable to type 'null'` | Info | Test file only — does not affect production runtime. The proxy itself compiles cleanly. |

No TODO, FIXME, PLACEHOLDER, stub returns, or empty implementations found in the proxy file.

---

### Supplementary Note: Other Attachment URL References

During verification, two other code paths were found that reference attachment URLs without the `/api/v1` string:

1. **`EmailHtmlContent.tsx` line 58:** `const url = '/api/email/attachments/${att.id}/download'`
   — This is the Next.js frontend route (handled by `download.ts`), not a direct backend call. Correct by design.

2. **`email.tsx` line 542:** `apiClient.get('/email/attachments/${attachmentId}/download')`
   — `apiClient` has `baseURL: ${apiBaseURL}/api/v1` (confirmed in `lib/api-client.ts` line 24). The resolved URL becomes `http://localhost:3000/api/v1/email/attachments/.../download`. Correct.

3. **`lib/api/emails.ts` line 577:** `apiClient.get('/email/attachments/${attachmentId}/metadata')`
   — Same `apiClient` base URL applies. Resolves to `/api/v1/email/attachments/.../metadata`. Out of scope for this phase but also correct.

No stray direct-backend calls using the old broken path were found.

---

### Human Verification Required

#### 1. Live Attachment Download (200 Response)

**Test:** Start backend (`cd backend && npm run start:dev`) and frontend (`cd frontend && npm run dev`). Log in at `http://localhost:3001`. Open any email with a PDF or image attachment. Click the download link.

**Expected:** Browser downloads the file. DevTools Network tab shows request to `/api/email/attachments/{id}/download` returning HTTP 200 with appropriate `Content-Type` and `Content-Disposition` headers.

**Why human:** The URL correctness is verified statically. The actual HTTP round-trip — including S3 signed URL resolution, provider fetch if needed, and streaming — cannot be confirmed without a running environment.

#### 2. Cookie Auth End-to-End

**Test:** Using the same setup, confirm the download works without manually passing any token. Inspect the `/api/email/attachments/{id}/download` request in DevTools — it should NOT include an Authorization header from the client (the Next.js proxy handles auth server-side via the httpOnly cookie).

**Expected:** Download succeeds. No 401 or 403. The Next.js API route reads `access_token` from the httpOnly cookie and forwards it as a Bearer token to the backend.

**Why human:** Cookie availability, httpOnly flag behavior in the test environment, and JwtAuthGuard response all require a live session to confirm.

---

## Gaps Summary

No gaps. The single required change — adding `/api/v1` prefix to the proxy's backend URL — was made correctly and verified against the actual file, the commit diff, the backend controller's route resolution, and the existing test suite. The only open items are live-environment confirmations which are marked for human verification.

---

_Verified: 2026-03-04T14:45:00Z_
_Verifier: Claude (gsd-verifier)_
