# Phase 121: Scheduling, Signatures & Templates - Research

**Researched:** 2026-03-30
**Domain:** Email scheduling (BullMQ), signature/template CRUD, send integration
**Confidence:** HIGH

## Summary

All three features (scheduled emails, signatures, templates) already have complete backend implementations: Prisma models, services, controllers, DTOs. The code is registered in `EmailModule` and wired to BullMQ for scheduling. This phase is **validation-only** -- verifying that existing code works end-to-end against the live production API, then fixing any bugs found.

The critical gap discovered during research: **the `sendEmail` controller action does NOT route `scheduledAt` to `ScheduledEmailService.scheduleEmail()`**. The `scheduledAt` field exists in `SendEmailRequestDto` and flows into `emailSendService.sendEmail()` via `...rest`, but `EmailSendService.sendEmail()` never checks it -- it always sends immediately. This means INFRA-06 (scheduled send) will fail validation and requires a bug fix to wire the scheduling path.

**Primary recommendation:** Write a validation script (`validate-scheduling-signatures-templates.mjs`) following the Phase 120 pattern (CDP + auth cookies + API calls), test all 5 INFRA requirements, fix the scheduling wiring gap, then re-validate.

## Project Constraints (from CLAUDE.md)

- Multi-tenant: every query MUST include `tenantId`
- Post-edit validation: `cd backend && npx tsc --noEmit` after every file edit
- Follow existing patterns: use validation-helpers.mjs CDP infrastructure
- Max 500 lines per file
- Never hardcode secrets
- SCOPE CONTROL: validate and fix only what is required

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-06 | Scheduled email sends at correct time | `ScheduledEmailService` processes via BullMQ every minute (`* * * * *`). Atomic claim with `FOR UPDATE SKIP LOCKED`. **BUG: Controller does not route scheduledAt to ScheduledEmailService -- needs fix.** |
| INFRA-07 | Scheduled email cancel prevents delivery | `cancelScheduledEmail()` deletes pending record. Controller at `DELETE /emails/scheduled/:id`. Code complete. |
| INFRA-08 | Signature CRUD and default selection works | Full CRUD at `/emails/signatures`. `setDefault` unsets others in same provider scope. `findDefault` has 4-level fallback chain. Code complete. |
| INFRA-09 | Template CRUD, duplicate, and default selection works | Full CRUD + duplicate at `/emails/templates`. Category filtering, `setDefault`, `duplicate` with "(Copy)" suffix. Code complete. |
| INFRA-10 | Sent emails include correct signature | `getSignatureForSend()` integrated in `sendEmail`, `replyToEmail`, `forwardEmail` controller actions. Appends as `<br><br>{signature}`. Code complete. |
</phase_requirements>

## Standard Stack

All libraries are already in the project. No new dependencies needed.

### Core
| Library | Purpose | Already Installed |
|---------|---------|-------------------|
| BullMQ | Scheduled email processing (every-minute cron) | Yes |
| Prisma | ORM for ScheduledEmail, EmailSignature, EmailTemplate | Yes |
| Playwright | Validation script CDP connection | Yes |

### API Endpoints (Existing)

| Endpoint | Method | Controller | Purpose |
|----------|--------|------------|---------|
| `/emails/scheduled` | GET | ScheduledEmailsController | List scheduled emails |
| `/emails/scheduled/:id` | DELETE | ScheduledEmailsController | Cancel scheduled email |
| `/emails/scheduled/:id` | PATCH | ScheduledEmailsController | Reschedule email |
| `/emails/signatures` | GET/POST | SignaturesController | List/create signatures |
| `/emails/signatures/default` | GET | SignaturesController | Get default signature |
| `/emails/signatures/:id` | GET/PATCH/DELETE | SignaturesController | CRUD single signature |
| `/emails/signatures/:id/set-default` | POST | SignaturesController | Set as default |
| `/emails/templates` | GET/POST | TemplatesController | List/create templates |
| `/emails/templates/default` | GET | TemplatesController | Get default template |
| `/emails/templates/categories` | GET | TemplatesController | List categories |
| `/emails/templates/:id` | GET/PATCH/DELETE | TemplatesController | CRUD single template |
| `/emails/templates/:id/set-default` | POST | TemplatesController | Set as default |
| `/emails/templates/:id/duplicate` | POST | TemplatesController | Duplicate template |
| `/emails/send` | POST | EmailActionsController | Send (with scheduledAt + signatureId) |

## Architecture Patterns

### Existing Code Structure
```
backend/src/modules/email/
  controllers/
    scheduled-emails.controller.ts   # GET list, DELETE cancel, PATCH reschedule
    signatures.controller.ts         # Full CRUD + set-default
    templates.controller.ts          # Full CRUD + set-default + duplicate
    email-actions.controller.ts      # Send/reply/forward (signature integration)
  services/
    scheduled-email.service.ts       # BullMQ handler, atomic claim, retry logic
    email-signature.service.ts       # CRUD + getSignatureForSend()
    email-template.service.ts        # CRUD + duplicate + categories
    email-send.service.ts            # Actual send via driver factory
  dto/
    scheduled-email.dto.ts           # RescheduleEmailDto, ScheduledEmailResponseDto
    signature.dto.ts                 # CreateSignatureDto, UpdateSignatureDto
    template.dto.ts                  # CreateTemplateDto, UpdateTemplateDto
    send-email.dto.ts                # SendEmailRequestDto (has scheduledAt + signatureId)
```

### Prisma Models (Existing)
- `ScheduledEmail` (`scheduled_emails`): id, tenantId, providerId, to[], cc[], bcc[], subject, bodyHtml, bodyText, inReplyTo, references, attachments (Json), scheduledAt, status, errorMessage, retryCount, sentAt. Indexed on `[tenantId, status, scheduledAt]` and `[scheduledAt, status]`.
- `EmailSignature` (`email_signatures`): id, tenantId, userId, providerId (nullable), name, content, isDefault. Indexed on `[tenantId, userId]` and `[tenantId, userId, providerId]`.
- `EmailTemplate` (`email_templates`): id, tenantId, userId, name, subject, bodyHtml, category (nullable), isDefault. Indexed on `[tenantId, userId]` and `[tenantId, userId, category]`.

### Scheduled Email Processing Pattern
1. BullMQ repeatable job fires every minute (`SCHEDULED_EMAIL_PROCESS`)
2. `processScheduledEmails()` atomically claims pending emails where `scheduledAt <= NOW()` using `FOR UPDATE SKIP LOCKED`
3. Claims up to 10 emails per batch
4. Sends each via `EmailSendService.sendEmail()`
5. Updates status to `sent` or retries (max 3) before marking `failed`
6. Cleanup job runs daily, removes sent/failed emails older than 30 days

### Signature Default Resolution
4-level fallback in `findDefault()`:
1. Provider-specific default (where providerId matches AND isDefault=true)
2. Global default (where providerId=null AND isDefault=true)
3. Any default (isDefault=true regardless of providerId)
4. First created signature (ultimate fallback)

### Controller Ordering (Critical)
Controllers with specific paths (`SignaturesController`, `TemplatesController`, `ScheduledEmailsController`) are registered BEFORE `EmailsController` which has a catch-all `@Get(':id')`. This prevents `/emails/signatures` from being caught as `/emails/:id`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validation script auth | Custom login flow | CDP + `validation-helpers.mjs` | Established pattern from Phases 112-120 |
| Concurrent email send | Custom distributed lock | BullMQ `FOR UPDATE SKIP LOCKED` | Already implemented with race condition fix RC-1 |
| Default selection logic | New toggle implementation | Existing `setDefault()` with provider scope unset | Already handles edge cases |

## Common Pitfalls

### Pitfall 1: scheduledAt Not Wired to ScheduledEmailService
**What goes wrong:** Sending a POST to `/emails/send` with `scheduledAt` in the body sends immediately instead of scheduling.
**Why it happens:** `email-actions.controller.ts` destructures `{ providerId, attachments, signatureId, ...rest }` and passes `rest` (which includes `scheduledAt`) directly to `emailSendService.sendEmail()`, which ignores it.
**How to avoid:** Fix the controller to check `body.scheduledAt` and route to `scheduledEmailService.scheduleEmail()` when present.
**Warning signs:** Scheduled email test sends immediately instead of waiting.

### Pitfall 2: Controller Route Ordering
**What goes wrong:** Requests to `/emails/signatures` could be caught by `/emails/:id` if controllers are mis-ordered.
**Why it happens:** NestJS matches routes in registration order.
**How to avoid:** Already handled -- specific controllers are registered first in the module. Don't reorder.

### Pitfall 3: Signature signatureId=null vs signatureId=undefined
**What goes wrong:** User wants no signature but gets the default anyway, or vice versa.
**Why it happens:** `getSignatureForSend()` treats `signatureId === null` as "no signature" and `signatureId === undefined` as "use default". The DTO uses `@ValidateIf((o) => o.signatureId !== null)` to allow null.
**How to avoid:** Test both cases explicitly: omit signatureId (should use default) vs pass signatureId=null (should skip).

### Pitfall 4: Template Duplicate Name Uniqueness
**What goes wrong:** Duplicating a template multiple times creates "Name (Copy)", "Name (Copy) (Copy)", etc.
**Why it happens:** `duplicate()` appends "(Copy)" to the original name, but re-duplicating the copy appends again.
**How to avoid:** This is acceptable behavior -- not a bug, but worth noting in tests.

## Code Examples

### Validation Script Pattern (from Phase 120)
```javascript
// Source: scripts/validate-queue-webhook-infra.mjs
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';

const { browser, context } = await connectCDP();
const cookieHeader = await getAuthCookies(context);
const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

// API call pattern
const res = await fetch(`${BACKEND_URL}/api/v1/emails/signatures`, {
  headers: { Cookie: finalCookies, 'x-csrf-token': csrfToken },
});
const data = await res.json();
```

### Scheduling Fix Pattern
```typescript
// In email-actions.controller.ts sendEmail method:
// Check for scheduledAt and route to scheduler
if (body.scheduledAt) {
  return this.scheduledEmailService.scheduleEmail({
    tenantId,
    providerId,
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject,
    bodyHtml,  // with signature already appended
    bodyText: body.bodyText || '',
    inReplyTo: body.inReplyTo,
    references: body.references,
    attachments: decodeAttachments(body.attachments)?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
    scheduledAt: new Date(body.scheduledAt),
  });
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright CDP + Node.js mjs scripts |
| Config file | scripts/lib/validation-helpers.mjs |
| Quick run command | `node scripts/validate-scheduling-signatures-templates.mjs --check=signatures` |
| Full suite command | `node scripts/validate-scheduling-signatures-templates.mjs --check=all` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-06 | Scheduled email sends at correct time | integration | `--check=schedule-send` | No -- Wave 0 |
| INFRA-07 | Cancel prevents delivery | integration | `--check=schedule-cancel` | No -- Wave 0 |
| INFRA-08 | Signature CRUD + default | integration | `--check=signatures` | No -- Wave 0 |
| INFRA-09 | Template CRUD + duplicate + default | integration | `--check=templates` | No -- Wave 0 |
| INFRA-10 | Sent email includes signature | integration | `--check=signature-send` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/validate-scheduling-signatures-templates.mjs --check={relevant}`
- **Per wave merge:** `node scripts/validate-scheduling-signatures-templates.mjs --check=all`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-scheduling-signatures-templates.mjs` -- orchestrator script
- [ ] `scripts/lib/validate-scheduling.mjs` -- INFRA-06, INFRA-07 checks
- [ ] `scripts/lib/validate-signatures.mjs` -- INFRA-08, INFRA-10 checks
- [ ] `scripts/lib/validate-templates.mjs` -- INFRA-09 checks

## Known Bug to Fix

### BUG: scheduledAt bypass in sendEmail controller
**Location:** `backend/src/modules/email/controllers/email-actions.controller.ts`, `sendEmail()` method (line ~102-125)
**Issue:** `scheduledAt` from the request body is part of `...rest` spread and passed to `emailSendService.sendEmail()`, which ignores it. Email sends immediately regardless of `scheduledAt`.
**Fix:** Add conditional check before calling `sendEmail`: if `body.scheduledAt` is set, route to `scheduledEmailService.scheduleEmail()` instead.
**Dependencies:** Need to inject `ScheduledEmailService` into `EmailActionsController`.
**Confidence:** HIGH -- verified by reading both the controller and service code.

## Open Questions

1. **Scheduled email timing tolerance**
   - What we know: BullMQ processes every minute (`* * * * *`). A scheduled email could send up to ~59 seconds after its `scheduledAt` time.
   - What's unclear: Is 1-minute tolerance acceptable per success criteria "within reasonable tolerance"?
   - Recommendation: 1 minute is reasonable for email. Document this in validation as expected behavior.

2. **Scheduled email signature inclusion**
   - What we know: When `sendEmail` is called from the controller, signatures are appended to `bodyHtml`. But when `ScheduledEmailService.processOneEmail()` calls `emailSendService.sendEmail()`, it passes the stored `bodyHtml` directly.
   - What's unclear: Should the signature be baked into `bodyHtml` at schedule time (so it's in the DB), or resolved at send time?
   - Recommendation: Bake the signature into `bodyHtml` at schedule time (in the controller fix). This matches the user's intent at the time they scheduled. The controller already has signature resolution logic, so the fix just needs to apply it before passing to `scheduleEmail()`.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/email/controllers/email-actions.controller.ts` -- sendEmail flow, signature integration
- `backend/src/modules/email/services/scheduled-email.service.ts` -- full scheduling implementation
- `backend/src/modules/email/services/email-signature.service.ts` -- signature CRUD + getSignatureForSend
- `backend/src/modules/email/services/email-template.service.ts` -- template CRUD + duplicate
- `backend/src/modules/email/email.module.ts` -- module registration, controller ordering
- `backend/prisma/schema.prisma` -- all three Prisma models
- `backend/src/common/services/scheduled-jobs.queue.ts` -- BullMQ scheduling infrastructure
- `backend/src/modules/email/dto/send-email.dto.ts` -- scheduledAt + signatureId in DTOs
- `scripts/validate-queue-webhook-infra.mjs` -- validation script pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all code exists and is registered, verified by reading source
- Architecture: HIGH -- traced full controller > service > Prisma > BullMQ chain
- Pitfalls: HIGH -- identified actual bug (scheduledAt bypass) by reading source code
- Validation approach: HIGH -- follows established Phase 112-120 pattern

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable codebase, validation-only phase)
