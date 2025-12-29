# Email Module - Bug Report

**Date**: December 29, 2025
**Tester**: Automated E2E Testing with Playwright
**Module**: Email Dashboard (`/dashboard/email`)
**Last Updated**: December 29, 2025 (Bugs Fixed)

---

## Critical Bugs (Must Fix)

### BUG #1: Reply Compose Shows RAW HTML
**Severity**: CRITICAL
**Status**: ✅ FIXED
**Screenshot**: `.playwright-mcp/test-reply-compose-dialog.png`

**Description**: When clicking Reply button, the compose dialog shows raw HTML code instead of properly rendered/sanitized content.

**Steps to Reproduce**:
1. Open any email in thread view
2. Click "Rispondi" (Reply) button
3. Observe compose dialog body content

**Expected**: Quoted email content should be rendered as formatted text
**Actual**: Shows raw HTML like `<table class="email-footer"...`

**Root Cause**: TipTap editor only supports basic HTML tags, not tables/complex divs from emails.

**Fix Applied**:
- Added `sanitizeHtmlForTiptap()` function in `frontend/components/email/ComposeDialog/compose-utils.ts`
- Converts tables to paragraphs, removes style/script tags, preserves basic formatting
- Updated `use-compose-handlers.ts` to sanitize HTML before setting body content

---

### BUG #2: Contacts API Returns 400 Bad Request
**Severity**: HIGH
**Status**: ✅ FIXED

**Description**: GET `/contacts?limit=1000` returns 400 Bad Request error

**Console Error**:
```
GET http://localhost:3000/contacts?limit=1000 400 (Bad Request)
Failed to load contacts {"error":{"message":"Request failed with status code 400"...
```

**Impact**:
- Compose dialog may not show contact suggestions
- Autocomplete for recipients broken

**Root Cause**: Backend DTO had `@Max(500)` validator, but frontend requested `limit=1000`.

**Fix Applied**:
- Updated `backend/src/modules/contacts/dto/contact.dto.ts`
- Changed `@Max(500)` to `@Max(1000)` for the limit parameter

---

### BUG #3: Attachment Download/Preview NOT Working
**Severity**: CRITICAL
**Status**: ✅ FIXED
**Screenshot**: `.playwright-mcp/bug-attachment-click-no-action.png`

**Description**: Clicking on attachment button does NOTHING - no download, no preview dialog

**Steps to Reproduce**:
1. Filter emails with "Con allegati" filter
2. Open an email with attachment (e.g., "Elenco_NRE.pdf")
3. Click on the attachment button
4. Nothing happens

**Expected**: Either download the file or show preview dialog
**Actual**: Button has [active] state but no action

**Root Cause**: `handleAttachmentOpen` callback was empty (only had `e.stopPropagation()`).

**Fix Applied**:
- Implemented actual download logic in `frontend/components/email/thread/ThreadDisplay.tsx`
- Uses `emailApi.downloadAttachment()` to fetch blob
- Creates download link with `URL.createObjectURL()`
- Added error handling with Snackbar for failed downloads
- Added translation keys `failedToDownload` in en.ts and it.ts

---

## Medium Priority Bugs

### BUG #4: Starred Emails Don't Move to Top (Outlook Behavior)
**Severity**: MEDIUM
**Status**: ✅ FIXED
**Screenshot**: `.playwright-mcp/test-star-action-result.png`

**Description**: When starring an email, it should move to the top of the list like Outlook

**Steps to Reproduce**:
1. Open any email
2. Click "Aggiungi stella" (Star) button
3. Email stays in same position

**Expected**: Starred email moves to top of list
**Actual**: Email stays in original position, only star icon toggles

**Fix Applied**:
- Updated `frontend/components/dashboard/hooks/useMailboxData.ts`
- Added sorting logic in `threads` useMemo to put starred emails first
- Maintains date order within starred and non-starred groups

---

### BUG #5: CSS Warning - :first-child Unsafe for SSR
**Severity**: LOW
**Status**: NOT FIXED (Low priority)

**Console Warning**:
```
The pseudo class ":first-child" is potentially unsafe when doing server-side rendering.
Try changing it to ":first-of-type".
```

**Location**: `index.tsx:407`

**Fix**: Replace `:first-child` with `:first-of-type` in styled components

---

## Working Features (Verified)

| Feature | Status | Notes |
|---------|--------|-------|
| Smart Filters | ✅ PASS | Non lette, Oggi, Questa settimana, Con allegati, Importanti |
| Email List Display | ✅ PASS | 225 emails loaded correctly |
| Email Thread View | ✅ PASS | Content renders, sender/date visible |
| Star Toggle | ✅ PASS | Star activates AND moves email to top |
| Delete Button | ✅ PASS | Button clickable |
| Archive Button | ✅ PASS | Button clickable |
| Mark Unread | ✅ PASS | Button clickable |
| AI Summary (Riepilogo AI) | ✅ PASS | Displayed in thread view |
| Folder Navigation | ✅ PASS | All 3 providers visible |
| Live Status Indicator | ✅ PASS | Shows "Live" with email count |
| Reply Compose | ✅ PASS | HTML properly sanitized for TipTap |
| Attachment Download | ✅ PASS | Downloads work, errors shown |
| Contacts Autocomplete | ✅ PASS | 1000 contact limit supported |

---

## Test Environment

- **Frontend**: http://localhost:3001
- **Backend**: http://localhost:3000
- **Browser**: Chromium via Playwright
- **Resolution**: 1440x900 (Desktop)

---

## Summary of Fixes Applied

| Bug | File(s) Modified | Change |
|-----|-----------------|--------|
| #1 Reply HTML | `compose-utils.ts`, `use-compose-handlers.ts` | Added HTML sanitizer for TipTap |
| #2 Contacts 400 | `contact.dto.ts` | Increased max limit 500→1000 |
| #3 Attachment | `ThreadDisplay.tsx`, `en.ts`, `it.ts`, `index.ts` | Implemented download + error handling |
| #4 Star to top | `useMailboxData.ts` | Added starred-first sorting |

---

## Screenshots

| Screenshot | Description |
|------------|-------------|
| `bug-attachment-click-no-action.png` | Attachment button clicked but nothing happens |
| `test-star-action-result.png` | Star action completed but email not moved |
| `test-reply-compose-dialog.png` | Reply showing raw HTML |

---

*Report generated by automated E2E testing*
*Fixes applied: December 29, 2025*
