---
phase: 117-email-send-reply-forward
verified: 2026-03-27T10:00:00Z
status: human_needed
score: 4/5 success criteria verified
re_verification: true
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Outlook saveSentEmail now stores RFC 822 internetMessageId (not Graph API ID) — commit 2a50ddbe"
    - "Validation script no longer hardcodes Outlook reply SKIP — replaced with RFC 822 format WARN + continue"
    - "WRITE-03 changed from false-Complete to Blocked (Infrastructure) in REQUIREMENTS.md — commit 137cc777"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "IMAP send on non-Railway environment"
    expected: "node scripts/validate-email-send.mjs --provider=imap exits 0 with PASS assertions for WRITE-03"
    why_human: "Railway production blocks SMTP ports 465/587. Cannot be verified programmatically in the current deployment environment."
  - test: "Outlook reply threading in Outlook web UI (post-fix)"
    expected: "A reply sent via PMSync (against a new Outlook email that was sent after commit 2a50ddbe) appears in the same conversation thread in Outlook web UI"
    why_human: "The saveSentEmail fix only applies to emails sent after the fix. Older Outlook emails in DB still have Graph API IDs. Correct threading requires a full send-then-reply cycle with a post-fix email, then manual UI check in outlook.live.com."
---

# Phase 117: Email Send & Reply/Forward Verification Report

**Phase Goal:** Users can compose and send emails through any provider, with reply/forward preserving conversation context
**Verified:** 2026-03-27T10:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plan 03 applied)

## Re-Verification Summary

Previous status was `gaps_found` (score 3/5). Plan 03 addressed both gaps:

1. **Gap 1 closed — WRITE-03 status corrected:** REQUIREMENTS.md now marks WRITE-03 as `[ ] Blocked (Infrastructure)` with explanation. Traceability table shows "Blocked (Infrastructure)". The false-Complete status is gone.

2. **Gap 2 closed (code) — Outlook internetMessageId fix applied:** `saveSentEmail` now accepts separate `externalId` (Graph API ID) and `rfcMessageId` (RFC 822 internetMessageId) parameters. After `driver.sendMessage()` for Microsoft providers, `driver.getMessage(messageId)` is called to resolve the RFC 822 value. The Prisma create uses `externalId` for provider operations and `rfcMessageId` for the `messageId` field. Commits `2a50ddbe` and `137cc777` both exist in git history.

3. **Gap 2 closed (validation) — Outlook reply SKIP removed:** The hardcoded `SKIP: Outlook reply target has Graph API ID` block is gone. The script now issues a `WARN: Reply target messageId is not RFC 822 format` warning for pre-fix emails and continues the test regardless.

Remaining gap: The Outlook reply threading fix cannot be fully verified programmatically — it requires a manual browser test using a post-fix Outlook email as the reply target.

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Gmail send delivers and appears in Gmail Sent folder | VERIFIED | CDP browser confirmed "PMSync validation send" emails in Gmail Sent; 11/11 automated checks pass (117-02) |
| 2 | Outlook send delivers and appears in Outlook Sent folder | VERIFIED | CDP browser confirmed 4 validation emails in "Posta inviata"; 3/3 automated checks pass (117-02) |
| 3 | IMAP/SMTP send delivers and appears in SMTP Sent folder | BLOCKED | IMAP driver code exists (imap-send.service.ts line 77), compiles clean; Railway blocks SMTP ports 465/587; WRITE-03 now correctly marked Blocked (Infrastructure) in REQUIREMENTS.md |
| 4 | Reply preserves In-Reply-To and References headers; thread preserved on provider | VERIFIED (code) / HUMAN NEEDED (Outlook live) | Gmail reply threading validated and CDP-confirmed (117-02). Outlook: saveSentEmail fix applied (commit 2a50ddbe) — new Outlook emails now store RFC 822 internetMessageId; manual UI test needed to confirm threading in Outlook web UI |
| 5 | Forward includes original message body and all original attachments | VERIFIED | StorageService.getObject wired into forwardEmail (line 548); CDP confirmed "Carta identita.pdf" in forwarded email (117-02) |

**Score:** 3 fully automated-verified, 1 code-verified/human-needed, 1 infrastructure-blocked

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/email/services/storage.service.ts` | `getObject(key)` returning Buffer from S3 | VERIFIED | Line 56: `async getObject(key: string): Promise<Buffer>` — present, no regression |
| `backend/src/modules/email/services/email-send.service.ts` | saveSentEmail with separate externalId/rfcMessageId; forwardEmail with attachment fetching | VERIFIED | Lines 214-238: rfcMessageId resolution for Microsoft; lines 268-269: separate params; line 288/290: correct Prisma assignment; line 498: `include: { attachments: true }`; line 548: `this.storage.getObject(att.storagePath)` |
| `scripts/validate-email-send.mjs` | Orchestrator script with CDP connection + --provider flag | VERIFIED | 38 lines; imports from lib; accepts --provider flag |
| `scripts/lib/validate-email-send.mjs` | Per-provider send/reply/forward validation; Outlook reply SKIP removed; IMAP skip documented | VERIFIED | 411 lines (under 500); Outlook hardcoded SKIP absent; IMAP skip has Railway reason + REQUIREMENTS.md cross-reference |
| `.planning/REQUIREMENTS.md` | WRITE-03 marked Blocked (Infrastructure); WRITE-04 marked Complete | VERIFIED | Line 42: `[ ] WRITE-03 ... Blocked: Railway blocks SMTP ports`; line 43: `[x] WRITE-04`; traceability table line 120-121 confirmed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `email-send.service.ts` | `storage.service.ts` | `this.storage.getObject()` | WIRED | Line 548 confirmed; StorageService injected at constructor line 68 |
| `email-send.service.ts` | `driver.getMessage()` | Microsoft RFC 822 post-fetch | WIRED | Lines 217-234: `driver.getMessage(messageId)` called for `providerType === 'microsoft'` |
| `scripts/validate-email-send.mjs` | `scripts/lib/validate-email-send.mjs` | `import { validateEmailSend }` | WIRED | Confirmed from prior verification; no regression |
| `scripts/lib/validate-email-send.mjs` | `POST /api/v1/emails/send` | `apiPost` call | WIRED | Line 104 confirmed |
| `scripts/lib/validate-email-send.mjs` | `POST /api/v1/emails/:id/reply` | `apiPost` call | WIRED | Line 202 confirmed |
| `scripts/lib/validate-email-send.mjs` | `POST /api/v1/emails/:id/forward` | `apiPost` call | WIRED | Line 302 confirmed |

---

### Data-Flow Trace (Level 4)

Not applicable — no UI components with dynamic data rendering. Artifacts are backend services and validation scripts.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| validateEmailSend is importable as function | `node -e "import('./scripts/lib/validate-email-send.mjs').then(m => console.log(typeof m.validateEmailSend))"` | `function` (confirmed in 117-01) | PASS |
| rfcMessageId used in saveSentEmail | `grep "rfcMessageId\|internetMessageId" email-send.service.ts` | Lines 214,219,221,225,230,238,269,290 all present | PASS |
| Old Outlook reply SKIP is absent | `grep "SKIP.*Outlook reply\|Graph API ID as messageId" validate-email-send.mjs` | No matches | PASS |
| WRITE-03 marked Blocked in REQUIREMENTS.md | `grep "WRITE-03.*Blocked\|Blocked.*Infrastructure" REQUIREMENTS.md` | Lines 42 and 120 match | PASS |
| Commits 2a50ddbe and 137cc777 exist | `git log --oneline 2a50ddbe 137cc777` | Both present in git history | PASS |
| Scripts under 500 lines | `wc -l scripts/lib/validate-email-send.mjs` | 411 lines | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WRITE-01 | 117-01, 117-02 | Send new email via Gmail delivers to recipient | SATISFIED | CDP-confirmed delivery; 11/11 Gmail checks pass; commit ee4dd5c3 |
| WRITE-02 | 117-01, 117-02 | Send new email via Outlook delivers to recipient | SATISFIED | CDP-confirmed delivery in "Posta inviata"; 3/3 Outlook checks pass |
| WRITE-03 | 117-01, 117-02, 117-03 | Send new email via IMAP/SMTP delivers to recipient | BLOCKED (Infrastructure) | IMAP driver exists and compiles; Railway blocks SMTP; REQUIREMENTS.md now correctly shows `[ ]` with explanation; commit 137cc777 |
| WRITE-04 | 117-01, 117-02, 117-03 | Reply preserves thread, adds correct headers (In-Reply-To, References) | SATISFIED (code) / HUMAN NEEDED (Outlook live) | Gmail: validated; Outlook: saveSentEmail fix applied (commit 2a50ddbe), rfcMessageId stored correctly; live Outlook UI test needed for post-fix emails |
| WRITE-05 | 117-01, 117-02 | Forward includes original body and attachments | SATISFIED | StorageService.getObject wired into forwardEmail; CDP confirmed attachment in forwarded email |

**Orphaned requirements:** None. All 5 WRITE-01..05 are claimed by plans 117-01, 117-02, and/or 117-03. No additional Phase 117 requirements appear in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/lib/validate-email-send.mjs` | 92-99 | IMAP send SKIPS with Railway reasoning | Info | Expected and documented — WRITE-03 is correctly marked Blocked; skip message now includes 5 lines of documentation |
| `backend/src/modules/email/services/email-send.service.ts` | 224-226 | Fallback: if getMessage fails, Graph API ID used as rfcMessageId | Warning | Graceful degradation — Outlook reply threading will degrade to pre-fix behavior on getMessage failure, but send will not fail. Acceptable tradeoff per plan decision. |

No blockers found. The prior blocker (Graph API ID stored as messageId) is fixed.

---

### Human Verification Required

#### 1. IMAP Send on Non-Railway Environment

**Test:** Run `node scripts/validate-email-send.mjs --provider=imap` from a localhost or non-Railway deployment with a configured IMAP provider.
**Expected:** Exit 0 with PASS assertions for WRITE-03 (send returns success, messageId non-empty, email found in Sent folder).
**Why human:** Railway production blocks SMTP ports 465/587. Cannot be verified programmatically in the current deployment environment. WRITE-03 is correctly documented as Blocked (Infrastructure) — this test is informational only and does not block phase completion.

#### 2. Outlook Reply Threading in Outlook Web UI (Post-Fix)

**Test:** In PMSync, send a new email via an Outlook provider (this creates an email with RFC 822 messageId thanks to commit 2a50ddbe). Then find that sent email in PMSync and click Reply to send a reply. Open Outlook web UI (outlook.live.com) and verify the reply appears in the same conversation thread as the original.
**Expected:** Reply appears in the same conversation thread in Outlook web UI, not as a standalone separate email.
**Why human:** The saveSentEmail fix (commit 2a50ddbe) resolves the code bug, but reply threading correctness in the provider's UI requires a live send-then-reply cycle using a post-fix email (one sent after the commit was deployed). Automated checks cannot open the Outlook web UI to verify thread grouping. Pre-fix emails with Graph API IDs as messageId are still in the DB; only new sends will have correct RFC 822 messageIds.

---

### Gaps Summary

No code gaps remain. The two gaps from the initial verification are closed:

- **Gap 1 (WRITE-03 false-Complete):** RESOLVED. REQUIREMENTS.md now shows `[ ]` with "Blocked (Infrastructure)" explanation. Traceability table updated. Commit `137cc777`.

- **Gap 2 (Outlook internetMessageId bug):** RESOLVED at code level. `saveSentEmail` now stores RFC 822 internetMessageId as `messageId` and Graph API ID as `externalId`. The Outlook reply SKIP is removed from the validation script. One human verification remains: live Outlook UI test to confirm post-fix reply threading (see Human Verification section above). This is evidence-gathering, not a code defect.

The phase goal — "Users can compose and send emails through any provider, with reply/forward preserving conversation context" — is achieved for Gmail (fully validated) and Outlook (code validated, human confirmation pending). IMAP is infrastructure-blocked on Railway and correctly documented as such.

---

_Verified: 2026-03-27T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after gap closure via 117-03_
