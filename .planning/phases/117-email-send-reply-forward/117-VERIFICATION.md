---
phase: 117-email-send-reply-forward
verified: 2026-03-27T08:30:00Z
status: gaps_found
score: 4/5 success criteria verified
re_verification: false
gaps:
  - truth: "A new email sent via IMAP/SMTP is delivered to the recipient and appears in the SMTP Sent folder"
    status: partial
    reason: "IMAP send code path exists and compiles, but live validation is permanently blocked on production Railway (SMTP ports 465/587 blocked). WRITE-03 is marked complete in REQUIREMENTS.md without live provider evidence."
    artifacts:
      - path: "scripts/lib/validate-email-send.mjs"
        issue: "IMAP send test always SKIPs on Railway with hardcoded message; no alternative validation path (e.g. localhost) documented"
    missing:
      - "Document WRITE-03 as 'infrastructure-blocked' rather than 'Complete' in REQUIREMENTS.md — or provide localhost validation evidence"
      - "Either run IMAP validation on a non-Railway environment and record results, or explicitly mark WRITE-03 as deferred with a known blocker"
  - truth: "Reply preserves In-Reply-To and References headers and the thread is preserved on the provider"
    status: partial
    reason: "Gmail reply threading is validated and confirmed. Outlook reply threading is skipped in the validation script because saveSentEmail stores the MS Graph API ID as messageId instead of RFC 822 internetMessageId. WRITE-04 is marked complete in REQUIREMENTS.md but Outlook reply thread is unverified and a known bug is acknowledged in the summary."
    artifacts:
      - path: "backend/src/modules/email/services/email-send.service.ts"
        issue: "saveSentEmail stores messageId as MS Graph API ID for Outlook, not RFC 822 internetMessageId. Reply threading validation for Outlook is permanently skipped."
      - path: "scripts/lib/validate-email-send.mjs"
        issue: "Line 195: Outlook reply is explicitly skipped with 'Graph API ID as messageId' reason. No Outlook reply/forward test actually runs."
    missing:
      - "Fix saveSentEmail to fetch and store the RFC 822 internetMessageId for Outlook providers, then re-validate WRITE-04 for Outlook"
      - "Or explicitly limit WRITE-04 scope to Gmail-only and document Outlook reply threading as a separate deferred item"
human_verification:
  - test: "IMAP send on non-Railway environment"
    expected: "node scripts/validate-email-send.mjs --provider=imap exits 0 with PASS assertions for WRITE-03"
    why_human: "Railway blocks SMTP ports; test must run from localhost or a non-Railway deployment"
  - test: "Outlook reply threading in Outlook web UI"
    expected: "A reply sent via PMSync appears in the same conversation thread in Outlook web UI (not as a new standalone email)"
    why_human: "saveSentEmail stores Graph API ID not RFC 822 messageId; automated check is hardcoded SKIP"
---

# Phase 117: Email Send & Reply/Forward Verification Report

**Phase Goal:** Users can compose and send emails through any provider, with reply/forward preserving conversation context
**Verified:** 2026-03-27T08:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Gmail send delivers and appears in Gmail Sent folder | VERIFIED | CDP browser confirmed "PMSync validation send" emails in Gmail Sent; 11/11 automated checks pass |
| 2 | Outlook send delivers and appears in Outlook Sent folder | VERIFIED | CDP browser confirmed 4 validation emails in Outlook "Posta inviata"; 3/3 automated checks pass |
| 3 | IMAP/SMTP send delivers and appears in SMTP Sent folder | PARTIAL | IMAP driver code exists and type-checks; Railway blocks SMTP ports 465/587; validation always SKIPs; no live evidence |
| 4 | Reply preserves In-Reply-To and References headers; thread preserved on provider | PARTIAL | Gmail validated (inReplyTo + references confirmed); Outlook reply hardcoded SKIP due to Graph API ID vs RFC 822 messageId bug |
| 5 | Forward includes original message body and all original attachments | VERIFIED | StorageService.getObject wired into forwardEmail; CDP confirmed "Carta identita.pdf" in forwarded email; attachment merge logic verified |

**Score:** 3 fully verified, 2 partial (infrastructure gap + known Outlook bug)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/email/services/storage.service.ts` | `getObject(key)` returning Buffer from S3 | VERIFIED | Line 56: `async getObject(key: string): Promise<Buffer>` — uses GetObjectCommand + stream-to-Buffer |
| `backend/src/modules/email/services/email-send.service.ts` | forwardEmail with original attachment fetching | VERIFIED | Line 472: `include: { attachments: true }`; line 522: `this.storage.getObject(att.storagePath)`; null guard + graceful degradation present |
| `scripts/validate-email-send.mjs` | Orchestrator script with CDP connection + --provider flag | VERIFIED | 38 lines; imports `validateEmailSend` from lib; accepts `--provider=gmail\|outlook\|imap\|all` |
| `scripts/lib/validate-email-send.mjs` | Per-provider send/reply/forward validation logic | VERIFIED | 411 lines (under 500 limit); exports `validateEmailSend`; sections for WRITE-01/02/03, WRITE-04, WRITE-05; node import test returns "function" |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `email-send.service.ts` | `storage.service.ts` | `this.storage.getObject()` | WIRED | Line 522 confirmed; StorageService injected at constructor line 68; StorageModule provided globally via email.module.ts |
| `scripts/validate-email-send.mjs` | `scripts/lib/validate-email-send.mjs` | `import { validateEmailSend }` | WIRED | Line 16 confirmed |
| `scripts/lib/validate-email-send.mjs` | `POST /api/v1/emails/send` | `apiPost` call | WIRED | Line 103 confirmed |
| `scripts/lib/validate-email-send.mjs` | `POST /api/v1/emails/:id/reply` | `apiPost` call | WIRED | Line 204 confirmed |
| `scripts/lib/validate-email-send.mjs` | `POST /api/v1/emails/:id/forward` | `apiPost` call | WIRED | Line 304 confirmed |

---

### Data-Flow Trace (Level 4)

Not applicable — no UI components with dynamic data rendering. Artifacts are backend services and validation scripts.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| validateEmailSend is importable as function | `node -e "import('./scripts/lib/validate-email-send.mjs').then(m => console.log(typeof m.validateEmailSend))"` | `function` | PASS |
| Backend TypeScript compiles clean | `cd backend && npx tsc --noEmit` | Exit 0, no output | PASS |
| IMAP send validation on Railway | `node scripts/validate-email-send.mjs --provider=imap` | Always SKIP (ports blocked) | SKIP |
| Full validation suite (Gmail + Outlook) | `node scripts/validate-email-send.mjs` | 14/14 pass (Gmail 11/11, Outlook 3/3) | PASS (per summary — live run not re-executed) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WRITE-01 | 117-01, 117-02 | Send new email via Gmail delivers to recipient | SATISFIED | CDP-confirmed delivery; 11/11 Gmail checks pass; commit ee4dd5c3 |
| WRITE-02 | 117-01, 117-02 | Send new email via Outlook delivers to recipient | SATISFIED | CDP-confirmed delivery in Posta inviata; 3/3 Outlook checks pass |
| WRITE-03 | 117-01, 117-02 | Send new email via IMAP/SMTP delivers to recipient | BLOCKED | IMAP driver exists (imap-send.service.ts line 77); Railway SMTP blocked; no live evidence; validation hardcoded SKIP |
| WRITE-04 | 117-01, 117-02 | Reply preserves thread, adds correct headers | PARTIAL | Gmail: validated (inReplyTo/references confirmed); Outlook: hardcoded SKIP — saveSentEmail stores Graph API ID, not RFC 822 messageId |
| WRITE-05 | 117-01, 117-02 | Forward includes original body and attachments | SATISFIED | StorageService.getObject wired into forwardEmail; CDP confirmed "Carta identita.pdf" in forwarded email; tenantId nested create bug fixed in ee4dd5c3 |

**Orphaned requirements:** None. All 5 WRITE-01..05 are claimed by plans 117-01 and 117-02. No additional Phase 117 requirements appear in REQUIREMENTS.md.

---

### Commit Verification

All 5 documented commits exist and are valid:

| Commit | Description |
|--------|-------------|
| `abbf1e23` | fix(117-01): forward emails now include original attachments from S3 |
| `22164b19` | feat(117-01): add validation scripts for send/reply/forward across all providers |
| `ee4dd5c3` | fix(117-02): remove tenantId from nested attachment create in saveSentEmail |
| `b342ab9c` | fix(117-02): reply validation fetches email detail for messageId |
| `88b99054` | fix(117-02): validation resilience for Outlook and IMAP providers |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/lib/validate-email-send.mjs` | 93-94 | IMAP send always SKIPS with hardcoded Railway reasoning | Warning | WRITE-03 cannot be verified in CI or on production without environment change |
| `scripts/lib/validate-email-send.mjs` | 195 | Outlook reply always SKIPS due to Graph API ID stored as messageId | Warning | WRITE-04 Outlook reply threading is unverified and acknowledged broken |
| `backend/src/modules/email/services/email-send.service.ts` | 262-264 | For Outlook, `externalId` and `messageId` both receive Graph API ID (not RFC 822 internetMessageId) | Blocker | Outlook reply threading will fail in production — `inReplyTo` is set to a Graph API ID, not a valid RFC 822 header value |

---

### Human Verification Required

#### 1. IMAP Send on Non-Railway Environment

**Test:** Run `node scripts/validate-email-send.mjs --provider=imap` from a localhost or non-Railway deployment with a configured IMAP provider.
**Expected:** Exit 0 with PASS assertions for WRITE-03 (send returns success, messageId non-empty, email found in Sent folder).
**Why human:** Railway production blocks SMTP ports 465/587. Cannot be verified programmatically in the current deployment environment.

#### 2. Outlook Reply Threading in Outlook Web UI

**Test:** In PMSync, find an existing Outlook email, click Reply, send the reply. Then open Outlook web UI (outlook.live.com) and check whether the reply appears in the same conversation thread.
**Expected:** Reply appears in the same conversation thread as the original email in Outlook web UI.
**Why human:** `saveSentEmail` stores the MS Graph API ID as `messageId` (not the RFC 822 `internetMessageId`). The reply's `inReplyTo` header will contain a Graph API ID rather than a valid RFC 822 message ID. Whether Outlook's UI still threads correctly despite this is unknown without manual verification.

---

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — WRITE-03 (IMAP/SMTP send):** The implementation exists and type-checks. The IMAP driver (`imap-send.service.ts`) has a fully implemented `sendMessage` at line 77. However, Railway blocks outbound SMTP ports 465/587, so no live validation has been performed. REQUIREMENTS.md marks WRITE-03 as "Complete" based on code existence alone, not live delivery evidence. The validation script hardcodes a SKIP for IMAP providers with no path to actually exercise this code.

**Gap 2 — WRITE-04 Outlook (reply threading):** Gmail reply threading is fully validated and CDP-confirmed. Outlook reply threading is a known bug: `saveSentEmail` stores the MS Graph API ID (e.g. `AAMkAGI2...`) as `messageId` instead of the RFC 822 `internetMessageId` (e.g. `<abc@outlook.com>`). The validation script detects this and explicitly skips Outlook reply tests. This means Outlook reply `In-Reply-To` headers will contain an invalid value that Outlook servers may not recognize for thread grouping. The Summary acknowledges this as a "known limitation" but REQUIREMENTS.md marks WRITE-04 as "Complete."

Both gaps are code correctness issues for WRITE-04 Outlook and an infrastructure evidence gap for WRITE-03. The forward bug (WRITE-05) and Gmail send/reply (WRITE-01, WRITE-04 Gmail) are genuinely complete.

---

_Verified: 2026-03-27T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
