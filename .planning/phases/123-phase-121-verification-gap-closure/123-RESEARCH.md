# Phase 123: Phase 121 Verification Gap Closure - Research

**Researched:** 2026-03-30
**Domain:** Live verification of scheduling, signatures, templates (INFRA-06..10)
**Confidence:** HIGH

## Summary

Phase 121 built all the code and validation scripts, ran them against Railway production (31/31 checks PASS), but left two explicit verification gaps documented in 121-02-SUMMARY.md:

1. **INFRA-06 timed delivery gap:** The validation only confirmed that `POST /emails/send` with `scheduledAt` creates a pending `ScheduledEmail` record. It did NOT verify that BullMQ actually fires the scheduled send at the correct time. The BullMQ cron runs every minute (`* * * * *`), so a 2-minute-ahead schedule should fire within ~2 minutes.

2. **INFRA-10 signature content gap:** The validation only confirmed that the send-with-signature controller path succeeds (via the scheduledAt workaround). It did NOT verify that the email body actually contains the signature content. This can be verified by reading the `bodyHtml` field from the `ScheduledEmail` record after scheduling.

Phase 123's job is to close these two gaps plus re-confirm INFRA-07, INFRA-08, INFRA-09 with live API calls, and produce a VERIFICATION.md for Phase 121.

**Primary recommendation:** Enhance the existing validation scripts to (a) schedule an email 2 minutes ahead, wait, then confirm status changes to 'sent' or 'failed', and (b) read the scheduled email's bodyHtml to verify signature content is present. Then create VERIFICATION.md from the combined Phase 121 + 123 evidence.

## Project Constraints (from CLAUDE.md)

- Multi-tenant: every query MUST include `tenantId`
- Post-edit validation: `cd backend && npx tsc --noEmit` after every file edit
- Follow existing patterns: use validation-helpers.mjs CDP infrastructure
- Max 500 lines per file
- Never hardcode secrets
- SCOPE CONTROL: validate and fix only what is required
- NEVER proactively create documentation files unless explicitly requested (VERIFICATION.md IS explicitly requested by success criteria)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-06 | Scheduled email sends at correct time | BullMQ cron runs every minute. `processScheduledEmails()` atomically claims pending emails where `scheduledAt <= now`. Can verify by scheduling 2min ahead, polling GET /emails/scheduled until status changes from 'pending' to 'sent'. Note: Railway blocks SMTP so actual delivery will fail -- but status should change to 'failed' with retry, proving the BullMQ cron fired. |
| INFRA-07 | Scheduled email cancel prevents delivery | Already validated 31/31 in Phase 121. Re-confirm with live DELETE + verify absence from list. |
| INFRA-08 | Signature CRUD and default selection works | Already validated 31/31 in Phase 121. Re-confirm CRUD lifecycle on live API. |
| INFRA-09 | Template CRUD, duplicate, and default selection works | Already validated 31/31 in Phase 121. Re-confirm CRUD + duplicate lifecycle on live API. |
| INFRA-10 | Sent emails include correct signature | Can verify by: (1) create signature with known content, (2) POST /emails/send with scheduledAt, (3) read the ScheduledEmail record's bodyHtml, (4) assert signature content appears in bodyHtml. The signature is baked in before scheduling (confirmed in email-actions.controller.ts lines 110-118). |
</phase_requirements>

## Architecture Patterns

### Existing Validation Infrastructure

All validation scripts follow the same CDP pattern established in Phases 112-120:

```
scripts/
  validate-scheduling-signatures-templates.mjs   # Orchestrator (--check= dispatch)
  lib/
    validation-helpers.mjs                        # connectCDP, getAuthCookies, getCsrfToken, apiGet/Post/Patch/Delete, report
    validate-scheduling.mjs                       # INFRA-06 (schedule-send), INFRA-07 (schedule-cancel)
    validate-signatures.mjs                       # INFRA-08 (signature CRUD), INFRA-10 (signature in send)
    validate-templates.mjs                        # INFRA-09 (template CRUD + duplicate + default)
```

**How validation works:**
1. Connect to Edge via CDP (`--remote-debugging-port=9222`)
2. Extract auth cookies from authenticated session
3. Get CSRF token from `/api/v1/auth/csrf`
4. Make API calls with cookies + CSRF token
5. Assert results with `assertTrue()`
6. Report pass/fail counts

### Scheduling Architecture (BullMQ)

```
email-actions.controller.ts (POST /emails/send)
  |-- if scheduledAt: scheduledEmailService.scheduleEmail() --> creates Prisma record (status: 'pending')
  |-- else: emailSendService.sendEmail() --> sends immediately

BullMQ cron (every minute: '* * * * *')
  |-- scheduledEmailService.processScheduledEmails()
      |-- Atomically claims pending emails where scheduledAt <= now (FOR UPDATE SKIP LOCKED)
      |-- For each claimed: emailSendService.sendEmail()
      |-- On success: status = 'sent', sentAt = now
      |-- On failure: retryCount++, status = retryCount >= 3 ? 'failed' : 'pending'
```

**Key insight for INFRA-06 timed delivery verification:** Railway blocks SMTP ports 465/587. When BullMQ processes a scheduled email, `emailSendService.sendEmail()` will fail because it cannot reach the SMTP server. The email status will change from `pending` to `pending` (retry 1), then `pending` (retry 2), then `failed` (retry 3). This is still valid evidence that BullMQ fired at the correct time -- the cron processing worked; only the SMTP delivery failed due to infrastructure.

**Verification strategy:** Schedule email with `scheduledAt` = now + 2 minutes. Poll GET /emails/scheduled every 30 seconds. Within ~3 minutes, the status should change from `pending` to either `sent` (if using Gmail/Outlook API provider) or to `pending` with `retryCount > 0` / `failed` (if using IMAP provider on Railway). Any status change proves BullMQ fired.

**Important edge case:** The scheduled email service uses `withoutTenantScopingAsync` when processing (line 47 of scheduled-email.service.ts), because the BullMQ worker runs outside of request context. This is correct behavior.

### Signature Baking Architecture

The signature is resolved and appended to `bodyHtml` BEFORE the scheduledAt routing check:

```typescript
// email-actions.controller.ts lines 107-140
const { providerId, attachments, signatureId, scheduledAt, ...rest } = body;
let bodyHtml = rest.bodyHtml;
const signature = await this.signatureService.getSignatureForSend(tenantId, userId, signatureId, providerId);
if (signature) {
  bodyHtml = `${bodyHtml}<br><br>${signature}`;
}
// THEN routes to scheduler with modified bodyHtml
if (scheduledAt) {
  return this.scheduledEmailService.scheduleEmail({ ..., bodyHtml, ... });
}
```

**Verification strategy for INFRA-10:** After scheduling an email with a known signature, the `ScheduledEmail` record in the DB will contain the baked-in signature in its `bodyHtml` field. However, the GET /emails/scheduled endpoint only returns `id, to, subject, scheduledAt, status` (see scheduled-email.service.ts lines 146-157). The bodyHtml is NOT exposed in the list endpoint.

**Alternative approach:** Instead of reading bodyHtml from the API (not exposed), verify at the controller level: (1) create a signature with distinctive content like `INFRA10-MARKER-{timestamp}`, (2) send with scheduledAt, (3) the fact that the controller code appends it (lines 116-118, verified by code inspection) combined with the scheduling succeeding (returns id + scheduledAt) constitutes sufficient evidence. This is the same approach Phase 121 used.

**Stronger approach (if feasible):** Query the DB directly via Railway Postgres TCP proxy (`ballast.proxy.rlwy.net:39634`) to read the `bodyHtml` column of the `scheduled_emails` table and verify the signature marker text is present. This would provide direct evidence.

### API Endpoints Summary

| Route | Method | What It Does | Returns |
|-------|--------|-------------|---------|
| `/api/v1/emails/send` | POST | Send or schedule email | `{ id, scheduledAt }` (if scheduled) |
| `/api/v1/emails/scheduled` | GET | List all scheduled emails | `[{ id, to, subject, scheduledAt, status }]` |
| `/api/v1/emails/scheduled/:id` | DELETE | Cancel scheduled email | `{ success: true, message: '...' }` |
| `/api/v1/emails/signatures` | GET/POST | List/create signatures | Signature objects |
| `/api/v1/emails/signatures/default` | GET | Get default signature | Signature or null |
| `/api/v1/emails/signatures/:id` | GET/PATCH/DELETE | CRUD single signature | Signature object |
| `/api/v1/emails/signatures/:id/set-default` | POST | Set as default | Signature object |
| `/api/v1/emails/templates` | GET/POST | List/create templates | `{ templates: [], total: N }` |
| `/api/v1/emails/templates/default` | GET | Get default template | Template or null |
| `/api/v1/emails/templates/categories` | GET | List categories | `string[]` |
| `/api/v1/emails/templates/:id` | GET/PATCH/DELETE | CRUD single template | Template object |
| `/api/v1/emails/templates/:id/set-default` | POST | Set as default | Template object |
| `/api/v1/emails/templates/:id/duplicate` | POST | Duplicate template | New template object |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CDP authentication | Custom browser automation | `validation-helpers.mjs` connectCDP + getAuthCookies | Proven pattern across 10+ phases |
| API call helpers | Raw fetch with cookie management | `apiGet/Post/Patch/Delete` from validation-helpers | Handles CSRF, cookies, error formatting |
| Test reporting | Custom console logging | `report()` from validation-helpers | Consistent pass/fail format |

## Common Pitfalls

### Pitfall 1: SMTP Timeout on Railway
**What goes wrong:** Sending via IMAP provider hangs or times out because Railway blocks ports 465/587.
**Why it happens:** Railway infrastructure limitation.
**How to avoid:** Use `scheduledAt` path to test controller logic without actual SMTP delivery. For timed delivery test (INFRA-06), expect the status to change to `failed` rather than `sent` when using IMAP provider. If using Gmail/Outlook provider (API-based, not SMTP), it may actually succeed.
**Warning signs:** Request hanging for 60+ seconds.

### Pitfall 2: Polling Timeout for Timed Delivery
**What goes wrong:** Script polls for status change but BullMQ hasn't processed yet.
**Why it happens:** BullMQ cron runs every minute. If you schedule 2 minutes ahead, the first cron tick after scheduledAt might be up to 1 minute later (worst case: 3 minutes total wait).
**How to avoid:** Poll for at least 4 minutes with 30-second intervals. Set a clear timeout with failure message.
**Warning signs:** Status remains 'pending' after 4+ minutes.

### Pitfall 3: Orphaned Scheduled Emails
**What goes wrong:** Test creates scheduled emails that don't get cleaned up.
**Why it happens:** Test fails before cleanup step.
**How to avoid:** Always wrap in try/finally with cleanup. Cancel all created scheduled emails even on failure.
**Warning signs:** Multiple test emails in the scheduled list from previous runs.

### Pitfall 4: Provider Endpoint Path
**What goes wrong:** Scripts use wrong endpoint path (e.g., `/api/v1/email-providers` instead of `/api/v1/providers`).
**Why it happens:** Multiple controller names exist; easy to guess wrong.
**How to avoid:** The correct path is `/api/v1/providers` (already fixed in Phase 121 Plan 02).
**Warning signs:** 404 responses.

### Pitfall 5: ScheduledEmail bodyHtml Not Exposed via API
**What goes wrong:** Trying to verify signature content by reading GET /emails/scheduled response.
**Why it happens:** The list endpoint only returns `id, to, subject, scheduledAt, status` -- no `bodyHtml`.
**How to avoid:** Either verify via direct DB query (Postgres TCP proxy) or accept code-level evidence that signature is appended before scheduling.

## Code Examples

### Polling for Scheduled Email Status Change (INFRA-06 timed delivery)
```javascript
// Schedule 2 minutes from now
const scheduledAt = new Date(Date.now() + 120000).toISOString();
const result = await apiPost(context, '/api/v1/emails/send', {
  providerId,
  to: ['timed-delivery-test@pmsync.local'],
  subject: `INFRA-06 Timed Test ${Date.now()}`,
  bodyHtml: '<p>Timed delivery test</p>',
  bodyText: 'Timed delivery test',
  scheduledAt,
}, cookieHeader, csrfToken, { timeout: 60000 });

const scheduledId = result?.data?.id || result?.id;

// Poll every 30s for up to 4 minutes
const maxWait = 240000; // 4 minutes
const pollInterval = 30000; // 30 seconds
const startTime = Date.now();

while (Date.now() - startTime < maxWait) {
  await new Promise(resolve => setTimeout(resolve, pollInterval));
  const list = await apiGet(context, '/api/v1/emails/scheduled', cookieHeader);
  const items = Array.isArray(list?.data || list) ? (list?.data || list) : [];
  const found = items.find(e => e.id === scheduledId);

  if (!found) {
    // Email was deleted (sent successfully and cleaned up?) -- unlikely
    break;
  }
  if (found.status !== 'pending') {
    // Status changed! BullMQ fired.
    console.log(`Status changed to: ${found.status}`);
    break;
  }
}
```

### Direct DB Verification (if needed for INFRA-10)
```bash
# Via Railway Postgres TCP proxy
psql "postgresql://postgres:PASSWORD@ballast.proxy.rlwy.net:39634/railway" \
  -c "SELECT id, \"bodyHtml\" FROM scheduled_emails WHERE subject LIKE 'INFRA-10%' ORDER BY \"createdAt\" DESC LIMIT 1;"
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Edge CDP (port 9222) | All validation | Manual setup | -- | None (must run Edge with --remote-debugging-port=9222) |
| Railway backend | Live API calls | Yes | Production | None |
| Railway Postgres | Direct DB verification (INFRA-10) | Yes | TCP proxy: ballast.proxy.rlwy.net:39634 | Skip direct DB check, accept code-level evidence |
| BullMQ cron worker | INFRA-06 timed delivery | Yes (runs on Railway) | -- | None (core to the test) |
| SMTP ports | Actual email delivery | No (blocked by Railway) | -- | Accept 'failed' status as proof BullMQ fired |

**Missing dependencies with no fallback:**
- Edge CDP must be running and authenticated against production PMSync

**Missing dependencies with fallback:**
- SMTP ports blocked: timed delivery test will show status change to 'failed' instead of 'sent' -- this is acceptable evidence that BullMQ processed the email

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright CDP + Node.js mjs scripts |
| Config file | `scripts/lib/validation-helpers.mjs` |
| Quick run command | `node scripts/validate-scheduling-signatures-templates.mjs --check=signatures` |
| Full suite command | `node scripts/validate-scheduling-signatures-templates.mjs --check=all` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-06 | Scheduled email fires via BullMQ at correct time | integration (timed poll) | Enhanced validate-scheduling.mjs with poll loop | Needs enhancement |
| INFRA-07 | Cancel prevents delivery | integration | `--check=schedule-cancel` | Yes (existing) |
| INFRA-08 | Signature CRUD + default | integration | `--check=signatures` | Yes (existing) |
| INFRA-09 | Template CRUD + duplicate + default | integration | `--check=templates` | Yes (existing) |
| INFRA-10 | Sent email body contains signature | integration + DB or code evidence | Enhanced validate-signatures.mjs or DB query | Needs enhancement |

### Sampling Rate
- **Per task commit:** `node -c scripts/lib/validate-scheduling.mjs && node -c scripts/lib/validate-signatures.mjs`
- **Per wave merge:** `node scripts/validate-scheduling-signatures-templates.mjs --check=all`
- **Phase gate:** Full suite green + INFRA-06 timed poll green + VERIFICATION.md created

### Wave 0 Gaps
- [ ] Enhance `scripts/lib/validate-scheduling.mjs` with timed delivery poll (INFRA-06 gap closure)
- [ ] Enhance `scripts/lib/validate-signatures.mjs` or add DB check for signature content in bodyHtml (INFRA-10 gap closure)

## What Phase 121 Already Proved (31/31 checks PASS)

These are the checks that already passed in Phase 121 Plan 02:

**INFRA-06 (partial):** Schedule-send creates pending record, appears in GET /emails/scheduled list with status 'pending'.
**INFRA-07:** Cancel deletes the record, no longer appears in list.
**INFRA-08:** Full signature CRUD lifecycle (create, list, get-by-id, update, get-default, set-default via second signature, delete).
**INFRA-09:** Full template CRUD lifecycle (create, list, get-by-id, update, duplicate with "Copy" suffix, get-default, set-default, categories).
**INFRA-10 (partial):** Send with default signature succeeds via scheduledAt path. Send with signatureId=null succeeds.

## What Phase 123 Must Prove (the gaps)

1. **INFRA-06 timed delivery:** BullMQ cron processes a scheduled email at the correct time. Evidence: status changes from 'pending' to something else (ideally 'sent', acceptably 'failed' due to SMTP block).

2. **INFRA-10 signature content:** The bodyHtml of a scheduled email actually contains the signature content. Evidence: either (a) direct DB query showing bodyHtml contains signature marker text, or (b) code-level trace showing signature is appended before scheduling (already confirmed in email-actions.controller.ts lines 110-118).

3. **Re-confirmation of INFRA-07, 08, 09:** Re-run existing validation checks to confirm they still pass.

4. **VERIFICATION.md:** Create Phase 121 verification document covering all 5 INFRA requirements with pass/fail per requirement.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/email/services/scheduled-email.service.ts` -- BullMQ scheduling, atomic claim, retry logic
- `backend/src/modules/email/controllers/email-actions.controller.ts` -- scheduledAt routing, signature baking
- `backend/src/modules/email/controllers/scheduled-emails.controller.ts` -- scheduled email CRUD endpoints
- `backend/src/modules/email/controllers/signatures.controller.ts` -- signature CRUD endpoints
- `backend/src/modules/email/controllers/templates.controller.ts` -- template CRUD endpoints
- `backend/src/common/services/scheduled-jobs.queue.ts` -- BullMQ cron schedule (`* * * * *`)
- `scripts/lib/validate-scheduling.mjs` -- existing INFRA-06/07 validation
- `scripts/lib/validate-signatures.mjs` -- existing INFRA-08/10 validation
- `scripts/lib/validate-templates.mjs` -- existing INFRA-09 validation
- `.planning/phases/121-scheduling-signatures-templates/121-02-SUMMARY.md` -- documented gaps

### Secondary (MEDIUM confidence)
- `memory/reference_railway_e2e.md` -- Railway deployment URLs, Postgres TCP proxy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all code already exists and was validated in Phase 121
- Architecture: HIGH -- read all source files, no ambiguity
- Pitfalls: HIGH -- documented from Phase 121 execution experience (SMTP block, wrong endpoint)
- Gap closure strategy: MEDIUM -- timed delivery test depends on BullMQ cron firing correctly on Railway; INFRA-10 DB verification depends on Postgres proxy access

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- code and infrastructure won't change)
