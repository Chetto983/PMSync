# Phase 117: Email Send & Reply/Forward - Research

**Researched:** 2026-03-26
**Domain:** Email send, reply, forward validation across Gmail, Outlook, IMAP/SMTP
**Confidence:** HIGH

## Summary

Phase 117 is a **validation phase**, not an implementation phase. The send, reply, and forward infrastructure is fully implemented across all three providers. The backend has a complete pipeline: `EmailActionsController` (endpoints) -> `EmailSendService` (orchestration) -> `EmailDriverFactory` -> provider-specific send services (`GmailSendService`, `MicrosoftSendService`, `ImapSendService`). Each provider builds MIME or API-native payloads, handles threading headers (In-Reply-To, References), and manages sent-folder persistence.

The code paths are mature but have never been validated against live providers in this v10.0 validation cycle. The goal is to write validation scripts that exercise send/reply/forward against all three providers, verify messages arrive at the recipient, check threading headers on replies, confirm forward includes original body and attachments, and fix any bugs discovered in-place.

One critical gap identified: **the `forwardEmail` method does NOT include original attachments**. It copies the original body (HTML + text) into the forwarded message but does NOT fetch or include the original email's attachments. The `data.attachments` in `ForwardEmailDto` only carries user-provided new attachments, not the original email's attachments. This is a confirmed bug that must be fixed for WRITE-05.

**Primary recommendation:** Write validation scripts following the Phase 114-116 pattern. Fix the forward-attachments gap in `EmailSendService.forwardEmail()`. Then validate all 5 requirements against live providers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRITE-01 | Send new email via Gmail delivers to recipient | `POST /api/v1/emails/send` -> `EmailSendService.sendEmail()` -> `EmailDriverFactory.createConnectedDriver('google')` -> `GmailSendService.sendMessage()`. Gmail uses `users.messages.send` with base64url MIME via `MimeBuilder`. Returns message ID. Saves to DB with sent folder resolved via `getSentFolderName()`. |
| WRITE-02 | Send new email via Outlook delivers to recipient | Same flow but driver is `microsoft`. `MicrosoftSendService.sendMessage()` uses save-then-send pattern: creates draft via `POST /me/messages`, then sends via `POST /me/messages/{id}/send`. Handles threading via `internetMessageHeaders`. |
| WRITE-03 | Send new email via IMAP/SMTP delivers to recipient | Same flow but driver is `imap`. `ImapSendService.sendMessage()` uses nodemailer SMTP transport. Also saves to Sent folder via IMAP `APPEND` with `\Seen` flag using `ImapFolderService.resolveFolder('SENT')`. |
| WRITE-04 | Reply preserves thread, adds correct headers (In-Reply-To, References) | `POST /api/v1/emails/:id/reply` -> `EmailSendService.replyToEmail()`. Builds References chain from original `references + messageId`. Sets `inReplyTo` to original `messageId`. Gmail preserves thread via `threadId` in send payload. Microsoft sets `In-Reply-To` and `References` via `internetMessageHeaders`. IMAP sets headers via nodemailer options. |
| WRITE-05 | Forward includes original body and all original attachments | `POST /api/v1/emails/:id/forward` -> `EmailSendService.forwardEmail()`. Body is included (forwarded header block + original HTML). **BUG: Original attachments are NOT fetched or included.** The method only queries `prisma.email.findFirst` without `include: { attachments: true }` and never fetches attachment content from S3 or provider. Fix required. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant rule:** Every query MUST include `tenantId` -- validation scripts must verify this
- **Post-edit validation:** After every file edit, run `npx tsc --noEmit` for the affected project
- **Follow existing patterns:** Use the established validation script pattern from Phases 112-116
- **Scope control:** Validation and bug fixes only -- no new features, no refactors
- **Frontend UI testing is OUT OF SCOPE** per REQUIREMENTS.md
- **Max 500 lines per file**
- **Provider pattern:** Interface > Factory > Implementation
- **Bugs found during validation get fixed in-place** (from STATE.md decisions)
- **Email consolidation:** Before any email module changes, read `backend/docs/EMAIL_CONSOLIDATION_ENTRY.md` first

## Standard Stack

This is a validation phase. No new libraries are needed.

### Core (existing, used by validation scripts)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Playwright | CDP connection to Edge for cookie-based auth | Established in Phase 112, all validation scripts use it |
| Node.js fetch (via Playwright context.request) | HTTP calls to backend API | Used by validation-helpers.mjs |

### Validation Infrastructure (already exists)
| File | Purpose |
|------|---------|
| `scripts/lib/validation-helpers.mjs` | CDP connect, auth cookies, CSRF token, API helpers (apiGet, apiPost, apiPatch), assertions (assertEqual, assertTrue, assertRange), report |
| `scripts/validate-syncback.mjs` | Phase 114 orchestrator pattern to follow |
| `scripts/validate-attachments-search.mjs` | Phase 116 orchestrator pattern to follow |

### Backend Send Infrastructure (already exists)
| File | Purpose |
|------|---------|
| `backend/src/modules/email/controllers/email-actions.controller.ts` | `POST /emails/send`, `POST /emails/:id/reply`, `POST /emails/:id/forward` |
| `backend/src/modules/email/services/email-send.service.ts` | Orchestration: `sendEmail()`, `replyToEmail()`, `forwardEmail()` |
| `backend/src/modules/email/dto/send-email.dto.ts` | `SendEmailRequestDto`, `ReplyEmailRequestDto`, `ForwardEmailRequestDto` with class-validator |
| `backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts` | Gmail: `MimeBuilder` -> base64url -> `users.messages.send` |
| `backend/src/modules/email-sync/drivers/microsoft/services/microsoft-send.service.ts` | Microsoft: Graph JSON payload -> create draft -> send |
| `backend/src/modules/email-sync/drivers/imap/services/imap-send.service.ts` | IMAP: nodemailer SMTP + IMAP APPEND to Sent folder |
| `backend/src/common/utils/mime-builder.util.ts` | `MimeBuilder.build()` using nodemailer MailComposer for RFC 822 MIME |

## Architecture Patterns

### Send Flow (all providers)

```
Client -> POST /api/v1/emails/send
  -> EmailActionsController.sendEmail()
    -> Resolve signature (EmailSignatureService.getSignatureForSend)
    -> Append signature to bodyHtml
    -> Decode base64 attachments to Buffers
    -> EmailSendService.sendEmail(dto)
      -> getActiveEmailProvider(tenantId, providerId) -- tenant isolation
      -> Upload attachments to S3 (AttachmentStorageService)
      -> Get access token (OAuth2 or SMTP password)
      -> EmailDriverFactory.createConnectedDriver(providerType, credentials)
      -> Build ComposeMessage (to/cc/bcc as EmailAddress[], base64 attachments)
      -> driver.sendMessage(composeMessage) -- provider-specific
      -> saveSentEmail() -- Prisma create in sent folder
      -> driver.disconnect()
    -> Return { success: true, messageId }
```

### Reply Flow

```
Client -> POST /api/v1/emails/:id/reply
  -> EmailActionsController.replyToEmail()
    -> Resolve signature
    -> EmailSendService.replyToEmail(emailId, tenantId, dto)
      -> Fetch original email from DB
      -> Build References chain: original.references + " " + original.messageId
      -> Resolve reply recipient (replyTo > from > to/cc, excluding self)
      -> Derive subject: "Re: " + original.subject (unless already prefixed)
      -> Delegate to sendEmail() with inReplyTo + references + threadId
```

### Forward Flow

```
Client -> POST /api/v1/emails/:id/forward
  -> EmailActionsController.forwardEmail()
    -> Resolve signature
    -> EmailSendService.forwardEmail(emailId, tenantId, dto, signatureContent)
      -> Fetch original email from DB (body only, NO attachments)
      -> Derive subject: "Fwd: " + original.subject (unless already prefixed)
      -> Build forwarded body: header block + original HTML
      -> Delegate to sendEmail() with new recipients
      -> **BUG: Does NOT include original attachments**
```

### Provider-Specific Send Details

| Provider | Send Mechanism | Threading | Sent Folder |
|----------|---------------|-----------|-------------|
| Gmail | `users.messages.send` with base64url MIME (via MimeBuilder) | `threadId` in request body + `In-Reply-To`/`References` in MIME headers | Automatic (Gmail applies SENT label) |
| Microsoft | Create draft `POST /me/messages` then `POST /me/messages/{id}/send` | `internetMessageHeaders` array with `In-Reply-To` + `References` | Automatic (Graph moves to Sent Items) |
| IMAP/SMTP | nodemailer `sendMail()` then IMAP `APPEND` to Sent folder | nodemailer `inReplyTo` + `references` options | Manual APPEND with `\Seen` flag via `ImapFolderService.resolveFolder('SENT')` |

### Attachment Handling in ComposeMessage

```typescript
// ComposeMessage.attachments expects AttachmentData[]
interface AttachmentData {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  content?: string;      // Base64 encoded
  contentStream?: any;   // Readable stream
  contentId?: string;    // For inline images
}
```

Attachments flow through differently per provider:
- **Gmail:** MimeBuilder converts base64 -> Buffer, builds multipart MIME, encodes as base64url
- **Microsoft:** `contentBytes` field (base64) in `@odata.type: #microsoft.graph.fileAttachment`
- **IMAP:** nodemailer converts base64 -> Buffer for SMTP transport, then MimeBuilder for IMAP APPEND

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MIME message construction | Custom RFC 822 builder | `MimeBuilder` (existing, wraps nodemailer `MailComposer`) | RFC 822 is complex (multipart boundaries, encoding, headers) |
| SMTP transport | Raw socket SMTP | nodemailer (existing in `ImapSendService`) | SMTP has auth, TLS, chunking complexity |
| CDP auth extraction | Manual cookie parsing | `validation-helpers.mjs` (existing) | Handles Edge CDP, CSRF, cookie merging |
| Sent folder resolution | Hardcoded folder names | `getSentFolderName()` + `ImapFolderService.resolveFolder()` (existing) | Locale-dependent folder names (e.g., "Posta Inviata" in Italian) |

## Common Pitfalls

### Pitfall 1: Forward Without Original Attachments (CONFIRMED BUG)
**What goes wrong:** `forwardEmail()` includes original body but not original attachments
**Why it happens:** The Prisma query in `forwardEmail()` uses `findFirst` without `include: { attachments: true }`. Even if it did include attachment metadata, it would need to fetch content from S3 or provider.
**How to fix:**
1. Include `attachments: true` in the Prisma query
2. For each original attachment, fetch content from S3 (via `AttachmentStorageService`) or provider (via `AttachmentOnDemandService`)
3. Convert to base64 and add to the `attachments` array passed to `sendEmail()`
**Warning signs:** Forward emails arrive at recipient without any of the original attachments

### Pitfall 2: Gmail Thread Preservation on Reply
**What goes wrong:** Reply might not thread correctly if `threadId` is missing or `In-Reply-To`/`References` headers are malformed
**Why it happens:** Gmail uses a combination of `threadId` (API-level) and RFC headers to determine threading. If the original email was synced without `threadId`, the reply will start a new thread.
**How to avoid:** Validate that the original email has a non-null `threadId` in the DB. The `replyToEmail()` method passes `originalEmail.threadId ?? undefined`.
**Warning signs:** Reply appears as a separate conversation in Gmail web UI

### Pitfall 3: Microsoft Graph 202 No-Body Response
**What goes wrong:** `POST /me/sendMail` returns 202 Accepted with no response body, so you can't get the message ID
**Why it happens:** Microsoft Graph API design -- sendMail is fire-and-forget
**How to avoid:** Already handled -- `MicrosoftSendService.sendMessage()` uses save-then-send pattern (create draft first to get ID, then send)
**Warning signs:** Empty messageId returned from Microsoft send

### Pitfall 4: IMAP Sent Folder Name Mismatch
**What goes wrong:** IMAP APPEND to Sent folder fails with "mailbox not found" error
**Why it happens:** Different IMAP servers use different Sent folder names (Sent, Sent Items, Posta Inviata, etc.)
**How to avoid:** Already handled -- `ImapFolderService.resolveFolder('SENT')` uses RFC 6154 special-use attributes + name heuristics (multi-language). But validation should verify this works for the test account's locale.
**Warning signs:** Email sends successfully via SMTP but doesn't appear in Sent folder

### Pitfall 5: Attachment Size Limits
**What goes wrong:** Large attachments fail silently or timeout
**Why it happens:** Different limits per provider: Gmail 25MB, Microsoft 4MB (direct) / 35MB (upload session), SMTP varies
**How to avoid:** DTO validation already caps at 25MB base64 (~19MB raw). Test with a small attachment (< 1MB) for validation.
**Warning signs:** 413 or timeout errors on send with attachments

### Pitfall 6: Reply-To Resolution Edge Cases
**What goes wrong:** Reply goes to wrong recipient when replying to own sent email
**Why it happens:** `resolveReplyRecipient()` has logic to skip "self" (provider email) and fall back to other recipients. Edge case: replying to own email with no other recipients.
**How to avoid:** Already handled with fallback chain: replyTo > from > to/cc (excluding self) > any
**Warning signs:** Reply recipient is the sender's own email address

## Code Examples

### Validation Script Structure (following Phase 114-116 pattern)

```javascript
// scripts/validate-email-send.mjs (orchestrator)
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateEmailSend } from './lib/validate-email-send.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';

async function main() {
  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateEmailSend(context, finalCookies, csrfToken, {
    provider: providerFlag,
  });

  const exitCode = report('Email Send Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
```

### Forward Attachment Fix Pattern

```typescript
// In EmailSendService.forwardEmail() -- fetch original attachments
const originalEmail = await this.prisma.email.findFirst({
  where: { id: emailId, tenantId },
  include: { attachments: true },  // Include attachment metadata
});

// Fetch attachment content from S3
const originalAttachments = await Promise.all(
  (originalEmail.attachments || []).map(async (att) => {
    const content = await this.attachmentStorage.downloadAttachment(att.storagePath);
    return {
      filename: att.filename,
      content: content, // Buffer
      contentType: att.mimeType,
    };
  })
);

// Merge original + user-provided attachments
const allAttachments = [...originalAttachments, ...(data.attachments || [])];
```

### API Calls for Validation

```javascript
// WRITE-01/02/03: Send new email
const sendResult = await apiPost(context, cookies, csrf, '/api/v1/emails/send', {
  providerId: provider.id,
  to: ['test-recipient@example.com'],
  subject: `Validation test ${Date.now()}`,
  bodyHtml: '<p>Validation test email</p>',
});
// Assert: sendResult.success === true, sendResult.messageId exists

// WRITE-04: Reply to email
const replyResult = await apiPost(context, cookies, csrf, `/api/v1/emails/${emailId}/reply`, {
  bodyHtml: '<p>Reply validation</p>',
});
// Assert: replyResult.success === true
// Then: fetch the replied email, check In-Reply-To and References headers

// WRITE-05: Forward email
const fwdResult = await apiPost(context, cookies, csrf, `/api/v1/emails/${emailId}/forward`, {
  to: ['forward-recipient@example.com'],
});
// Assert: fwdResult.success === true
// Then: verify forwarded email includes original attachments
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `sendMail` for Microsoft | Save draft then send (BUG-3 fix) | Phase 5 driver split | Gets message ID from Microsoft Graph |
| Hardcoded "Sent" folder name | RFC 6154 specialUse lookup via `getSentFolderName()` | v7.0 | Works with localized IMAP folder names |
| Custom MIME building | `MimeBuilder` wrapping nodemailer `MailComposer` | v4.0 | Reliable RFC 822 compliance |

## Open Questions

1. **Forward attachment content retrieval**
   - What we know: `AttachmentStorageService.uploadAttachment()` exists for upload but there's no `downloadAttachment()` method exposed. The on-demand service (`AttachmentOnDemandService`) can fetch from S3 or provider.
   - What's unclear: The exact method to retrieve attachment content as Buffer for re-attachment in forward. Need to check `StorageService.getSignedDownloadUrl()` and whether we need to `fetch()` the signed URL, or if there's a direct `getObject()` path.
   - Recommendation: During implementation, inspect `StorageService` and `AttachmentOnDemandService` for a direct buffer download method. Worst case, use signed URL + fetch.

2. **Test recipient for validation**
   - What we know: Validation scripts run against live providers. Sending real emails requires a real recipient.
   - What's unclear: Which email address to use as test recipient that won't cause side effects.
   - Recommendation: Send to the same provider account (self-send). This validates delivery AND sent-folder appearance without spamming external addresses.

3. **Microsoft Graph attachment size for forward**
   - What we know: Direct Graph API attachment limit is 4MB. Larger attachments need upload session.
   - What's unclear: Whether forwarded attachments larger than 4MB will fail on Microsoft.
   - Recommendation: Test with small attachments first (< 1MB). Flag 4MB limit as a known constraint if hit.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- Read all relevant source files: email-send.service.ts, email-actions.controller.ts, gmail-send.service.ts, microsoft-send.service.ts, imap-send.service.ts, send-email.dto.ts, canonical.types.ts, mime-builder.util.ts, email-driver.interface.ts
- **Prior phase research** -- Phase 114 and 116 RESEARCH.md patterns for validation approach
- **Validation scripts** -- scripts/validate-syncback.mjs, scripts/lib/validation-helpers.mjs for established patterns

### Secondary (MEDIUM confidence)
- Gmail API `users.messages.send` -- Training data, verified by existing googleapis usage in codebase
- Microsoft Graph `POST /me/messages` + `POST /me/messages/{id}/send` -- Verified in MicrosoftSendService
- nodemailer SMTP transport -- Verified in ImapSendService, version ^8.0.1 in package.json

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, all existing infrastructure
- Architecture: HIGH -- Complete codebase inspection of all send/reply/forward paths
- Pitfalls: HIGH -- Forward-attachment bug confirmed by code inspection; other pitfalls from existing bug fixes in code comments (BUG-3, BUG-002, BUG-005)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- validation of existing code)
