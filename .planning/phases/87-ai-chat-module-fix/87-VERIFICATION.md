---
phase: 87-ai-chat-module-fix
verified: 2026-03-19T17:00:00Z
status: gaps_found
score: 16/18 must-haves verified
gaps:
  - truth: "draft_email does NOT set sentAt — drafts have null sentAt"
    status: failed
    reason: "BUG-3 was explicitly deferred in 87-03 due to a non-nullable Email.sentAt schema constraint. The code still sets sentAt: new Date() with a TODO comment. The fix requires a Prisma schema migration to make the field nullable."
    artifacts:
      - path: "backend/src/modules/ai-chat/tools/email-tools.service.ts"
        issue: "Line 446: sentAt: new Date() — annotated TODO but still sets a timestamp on drafts"
    missing:
      - "Prisma schema migration to make Email.sentAt nullable"
      - "Remove sentAt from draft_email prisma.email.create call after migration"
  - truth: "No unused _piiResolve parameters remain in tool services"
    status: failed
    reason: "DEAD-5 cleanup missed folder-tools.service.ts. One _piiResolve parameter survives in buildListFolders (line 70). DEAD-5 scope was originally ProductivityToolsService and ReminderToolsService, but Plan 04 summary claimed all 7 tool files were cleaned. folder-tools.service.ts was not."
    artifacts:
      - path: "backend/src/modules/ai-chat/tools/folder-tools.service.ts"
        issue: "Line 70: private buildListFolders(tenantId: string, _piiResolve: PiiResolveFn) — underscore-prefixed unused parameter"
    missing:
      - "Remove _piiResolve parameter from buildListFolders signature"
      - "Update caller in createToolSet (ai-chat.service.ts) if signature changes — note: getTools already passes piiResolve so caller is unaffected, only the private method signature needs cleanup"
---

# Phase 87: AI-Chat Module Fix Verification Report

**Phase Goal:** Fix critical bugs, security vulnerabilities, race conditions, dead code, and file size violations in the AI chat module
**Verified:** 2026-03-19
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | getConversation rejects mismatched userId — returns null, not the conversation | VERIFIED | conversation.service.ts:61-69 includes `...(userId ? { userId } : {})` in where clause; controller passes req.user.userId |
| 2 | deleteConversation rejects mismatched userId — returns false or throws | VERIFIED | conversation.service.ts:295-304 uses `deleteMany` with `{ id, tenantId, userId }` compound where; returns `count > 0` |
| 3 | All 4 message queries include tenantId via conversation relation filter | VERIFIED | getMessagesForContext/getRecentMessages/getMessageCount/getOlderMessages all include `...(tenantId ? { conversation: { tenantId } } : {})` |
| 4 | reply_email with replyAll=true includes original CC and To (minus sender) in CC | VERIFIED | email-tools.service.ts:384-393 builds `ccAddresses` via `new Set([...original.cc, ...original.to].filter(...))` |
| 5 | reply_email with replyAll=false does NOT include CC recipients | VERIFIED | email-tools.service.ts:394: `ccAddresses` is `undefined` when replyAll is falsy |
| 6 | Summary generation triggers only at 20-message intervals (20, 30, 40...) | VERIFIED | chat-enrichment.service.ts:193: `if (count < 20 \|\| (count - 20) % 10 !== 0) return;` |
| 7 | Concurrent Prisma transactions are wrapped with withPrismaRetry | VERIFIED | conversation.service.ts: all 4 transactional methods (saveUserMessage, saveAssistantMessage, saveToolMessage, saveToolMessagesBatch) wrapped with PrismaRetry.withPrismaRetry() |
| 8 | draft_email does NOT set sentAt — drafts have null sentAt | FAILED | email-tools.service.ts:446 still sets `sentAt: new Date()` — annotated TODO but not fixed (schema migration required) |
| 9 | delete_contact calls piiResolve on contactId before deletion | VERIFIED | contact-tools.service.ts:241: `const resolved = (await piiResolve(args...)) as typeof args; ...resolved.contactId` |
| 10 | getOrCreateConversation has no 30-min auto-resolve fallback | VERIFIED | conversation.service.ts:76-94: if conversationId provided, loads by id+tenant+user; if not, creates new. No time-based fallback. |
| 11 | save_memory uses single embedding path (raw SQL to ai_memories.vector) | VERIFIED | rag-tools.service.ts:154-162: only raw SQL `UPDATE ai_memories SET vector = ...`. No embeddingsService.saveEmbedding() call. |
| 12 | persistToolResults saves all results in a single transaction | VERIFIED | ai-chat.service.ts:410-424: calls `this.conversationService.saveToolMessagesBatch(...)` — single-transaction batch via conversation.service.ts:221-245 |
| 13 | Title/summary generation uses savedMessageCount from stream callbacks, not separate queries | VERIFIED | ai-chat.service.ts:250, 270, 283: `savedMessageCount` closure counter incremented on each save; passed to chatEnrichmentService methods at onFinish |
| 14 | ToolsServiceInterface is deleted from tools/index.ts | VERIFIED | tools/index.ts has no ToolsServiceInterface — only named service exports |
| 15 | chat-response.dto.ts file is deleted | VERIFIED | File does not exist at backend/src/modules/ai-chat/dto/chat-response.dto.ts |
| 16 | No tenantId = 'system' default parameters remain in the module | VERIFIED | Grep across ai-chat module finds zero matches for `= 'system'` |
| 17 | No unused _conversationId parameters remain in tool services | VERIFIED | Grep finds no `_conversationId` in any tool service file |
| 18 | No unused _piiResolve parameters remain in tool services | FAILED | folder-tools.service.ts:70 still has `_piiResolve: PiiResolveFn` in buildListFolders signature |
| 19 | ai-chat.service.ts is under 500 lines | VERIFIED | 494 lines |
| 20 | productivity-tools.service.ts is deleted and replaced by focused files | VERIFIED | productivity-tools.service.ts deleted; email-productivity-tools.service.ts (382 lines), follow-up-tools.service.ts (219 lines) exist |

**Score:** 16/18 truths verified (2 failures: BUG-3 deferred, DEAD-5 incomplete)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/ai-chat/__tests__/security-isolation.test.ts` | 6+ failing tests for BUG-2 + RULE-1 | VERIFIED | 8 test cases present, all now green after implementations |
| `backend/src/modules/ai-chat/__tests__/bug-fixes.test.ts` | 7+ tests for BUG-1, BUG-5, RACE-1, RACE-4 | VERIFIED | 8 test cases covering all 4 requirements |
| `backend/src/modules/ai-chat/services/conversation.service.ts` | userId + tenantId on all access paths | VERIFIED | 429 lines, withPrismaRetry on all 4 transactional methods |
| `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` | Passes req.user.userId to service methods | VERIFIED | Lines 204, 240: both getConversation and deleteConversation pass req.user.userId |
| `backend/src/modules/ai-chat/tools/email-tools.service.ts` | replyAll CC handling, draft_email annotation | PARTIAL | replyAll VERIFIED; BUG-3 sentAt still set (annotated TODO) |
| `backend/src/modules/ai-chat/tools/contact-tools.service.ts` | delete_contact with piiResolve | VERIFIED | Line 241: piiResolve called before contactId use |
| `backend/src/modules/ai-chat/tools/rag-tools.service.ts` | Single embedding write path | VERIFIED | No EmbeddingsService import; only raw SQL path |
| `backend/src/modules/ai-chat/services/chat-enrichment.service.ts` | Extracted title/summary/context, modulo trigger | VERIFIED | 243 lines; maybeGenerateSmartTitle, maybeTriggerSummaryGeneration, getRuntimeContextMetadata |
| `backend/src/modules/ai-chat/tools/email-productivity-tools.service.ts` | list_email_index, star, read, label tools | VERIFIED | 382 lines, exists and wired in ai-chat.module.ts |
| `backend/src/modules/ai-chat/tools/follow-up-tools.service.ts` | list_follow_ups, update_follow_up | VERIFIED | 219 lines, exists and wired in ai-chat.module.ts |
| `backend/src/modules/ai-chat/tools/folder-tools.service.ts` | No unused _piiResolve params | FAILED | Line 70 retains `_piiResolve: PiiResolveFn` in buildListFolders |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ai-chat.controller.ts GET/DELETE | conversation.service.ts | req.user.userId parameter | WIRED | Lines 204, 240 pass userId; deleteConversation requires it (non-optional) |
| conversation.service.ts message queries | aiConversation relation | `conversation: { tenantId }` | WIRED | All 4 methods include conditional relation filter |
| email-tools.service.ts reply_email | email-send.service queueSend | cc parameter in send args | WIRED | ccAddresses set from original.cc + original.to when replyAll=true |
| conversation.service.ts transactions | withPrismaRetry | import as PrismaRetry namespace | WIRED | All 4 methods wrapped; import at line 5 |
| ai-chat.service.ts onFinish | chat-enrichment.service.ts | ChatEnrichmentService DI injection | WIRED | this.chatEnrichmentService.maybeGenerateSmartTitle/maybeTriggerSummaryGeneration called with savedMessageCount |
| ai-chat.service.ts | EmailProductivityToolsService + FollowUpToolsService | DI injection, createToolSet | WIRED | Lines 96-97 inject both; createToolSet lines 478-479 spread both tool sets |
| ai-chat.module.ts providers | ChatEnrichmentService, EmailProductivityToolsService, FollowUpToolsService | NestJS providers array | WIRED | Lines 77-82 register all three new services |

### Requirements Coverage

The requirement IDs used in this phase (BUG-1 through BUG-8, RACE-1 through RACE-4, DEAD-1 through DEAD-5, RULE-1, RULE-3) are phase-internal audit identifiers defined in 87-CONTEXT.md. They do not map to entries in the project-level REQUIREMENTS.md (which uses AICP-*, AUTHZ-*, SEC-*, CRM-*, etc.). Phase 87 is not listed in the REQUIREMENTS.md traceability table — this phase was an internal module audit, not a v6.0 milestone.

However, BUG-2 (BOLA on conversation access) maps semantically to **SEC-01** in REQUIREMENTS.md ("deleteConversation checks userId (BOLA fix)"), which is currently assigned to Phase 78. This phase has effectively pre-implemented SEC-01.

| Phase-Internal ID | Description | Status | Evidence |
|-------------------|-------------|--------|---------|
| BUG-1 | reply_email replyAll CC handling | SATISFIED | ccAddresses built from original CC+To when replyAll=true |
| BUG-2 | BOLA on conversation access (userId check) | SATISFIED | getConversation + deleteConversation require userId |
| BUG-3 | draft_email sets sentAt on drafts | BLOCKED | Schema migration required; Email.sentAt is non-nullable |
| BUG-5 | Summary trigger fires on every message after 20 | SATISFIED | Modulo-based trigger: `(count - 20) % 10 === 0` |
| BUG-6 | delete_contact skips PII resolution | SATISFIED | piiResolve called before contactId use |
| BUG-7 | Stale 30-min auto-resolve in getOrCreateConversation | SATISFIED | Auto-resolve logic removed |
| BUG-8 | Dual embedding write in save_memory | SATISFIED | Single raw SQL path only |
| RACE-1 | Missing withPrismaRetry on conversation transactions | SATISFIED | All 4 methods wrapped |
| RACE-2 | TOCTOU race on title/summary message count | SATISFIED | savedMessageCount closure, passed to enrichment methods |
| RACE-3 | getOrCreateConversation TOCTOU | SATISFIED (moot) | Moot after BUG-7 removed auto-resolve |
| RACE-4 | N separate transactions for tool results | SATISFIED | saveToolMessagesBatch single transaction |
| RULE-1 | Missing tenantId filter on message queries | SATISFIED | All 4 message query methods include relation filter |
| RULE-3 | ai-chat.service.ts over 500 lines | SATISFIED | 494 lines after ChatEnrichmentService extraction |
| DEAD-1 | ToolsServiceInterface in tools/index.ts | SATISFIED | Not present in tools/index.ts |
| DEAD-2 | chat-response.dto.ts exists | SATISFIED | File deleted |
| DEAD-3 | tenantId = 'system' defaults | SATISFIED | Zero matches across module |
| DEAD-4 | Unused _conversationId params | SATISFIED | Zero remaining across all tool service files |
| DEAD-5 | Unused _piiResolve params | PARTIAL | folder-tools.service.ts:70 still has `_piiResolve: PiiResolveFn` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `email-tools.service.ts` | 446 | `sentAt: new Date()` on draft creation with TODO comment | Warning | Drafts are recorded as sent in the database; they appear sent when queried by sentAt. This is BUG-3 deferred — schema migration needed to make sentAt nullable. |
| `folder-tools.service.ts` | 70 | `_piiResolve: PiiResolveFn` unused parameter | Warning | Dead parameter signals incomplete DEAD-5 cleanup. No functional impact since the parameter is never used in the method body. |

### Human Verification Required

None — all checks are automated/structural. The fixes verified here are deterministic code paths (where clause construction, parameter forwarding, transaction wrapping, modulo logic).

### Gaps Summary

Two gaps prevent full goal achievement:

**Gap 1 — BUG-3 (Architectural blocker):** draft_email still sets `sentAt: new Date()` because `Email.sentAt` is a non-nullable `DateTime` column in the Prisma schema. The field cannot be null without a schema migration. Plan 03 correctly identified this constraint and annotated the code with a TODO. The fix is architecturally blocked: it requires a migration to `sentAt DateTime?`, updating all seed/test data, and removing the field from the draft_email create call. This was an intentional deferral.

**Gap 2 — DEAD-5 incomplete (Missed file):** `folder-tools.service.ts` line 70 retains `_piiResolve: PiiResolveFn` as an unused parameter in `buildListFolders`. Plan 04 extended DEAD-4/DEAD-5 cleanup from the originally scoped files (productivity/reminder) to 7 tool files, but `folder-tools.service.ts` was missed. This is a minor cleanup gap with no functional impact — the parameter is syntactically present but the method never calls it.

Both gaps are localized, non-blocking for functionality, and addressable without architectural changes (except BUG-3 which requires a migration).

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
