---
phase: 87-ai-chat-module-fix
verified: 2026-03-19T18:00:00Z
status: passed
score: 18/18 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 16/18
  gaps_closed:
    - "draft_email does NOT set sentAt — drafts have null sentAt (BUG-3)"
    - "No unused _piiResolve parameters remain in tool services (DEAD-5)"
  gaps_remaining: []
  regressions: []
---

# Phase 87: AI-Chat Module Fix Verification Report

**Phase Goal:** Fix critical bugs, security vulnerabilities, race conditions, dead code, and file size violations in the AI chat module
**Verified:** 2026-03-19
**Status:** passed
**Re-verification:** Yes — after gap closure (previous score 16/18, now 18/18)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | getConversation rejects mismatched userId — returns null, not the conversation | VERIFIED | conversation.service.ts:59-65: `...(userId ? { userId } : {})` in where clause; controller passes req.user.userId |
| 2 | deleteConversation rejects mismatched userId — returns false or throws | VERIFIED | conversation.service.ts:298-304: deleteMany uses `{ id: conversationId, tenantId, userId }` compound where |
| 3 | All 4 message queries include tenantId via conversation relation filter | VERIFIED | getMessagesForContext/getRecentMessages/getMessageCount/getOlderMessages all include conditional relation filter |
| 4 | reply_email with replyAll=true includes original CC and To (minus sender) in CC | VERIFIED | email-tools.service.ts builds ccAddresses via Set from original.cc + original.to when replyAll=true |
| 5 | reply_email with replyAll=false does NOT include CC recipients | VERIFIED | ccAddresses is undefined when replyAll is falsy |
| 6 | Summary generation triggers only at 20-message intervals (20, 30, 40...) | VERIFIED | chat-enrichment.service.ts: `if (count < 20 \|\| (count - 20) % 10 !== 0) return;` |
| 7 | Concurrent Prisma transactions are wrapped with withPrismaRetry | VERIFIED | conversation.service.ts lines 145, 171, 199, 231: all 4 transactional methods wrapped |
| 8 | draft_email does NOT set sentAt — drafts have null sentAt | VERIFIED | email-tools.service.ts: sentAt field is absent from the draft prisma.email.create call; only receivedAt is set |
| 9 | delete_contact calls piiResolve on contactId before deletion | VERIFIED | contact-tools.service.ts:241: `const resolved = (await piiResolve(args...))` before contactId use |
| 10 | getOrCreateConversation has no 30-min auto-resolve fallback | VERIFIED | conversation.service.ts:76-94: no time-based fallback; loads by id+tenant+user or creates new |
| 11 | save_memory uses single embedding path (raw SQL to ai_memories.vector) | VERIFIED | rag-tools.service.ts: only raw SQL UPDATE; no embeddingsService.saveEmbedding() call |
| 12 | persistToolResults saves all results in a single transaction | VERIFIED | ai-chat.service.ts: calls saveToolMessagesBatch — single-transaction batch |
| 13 | Title/summary generation uses savedMessageCount from stream callbacks, not separate queries | VERIFIED | ai-chat.service.ts: savedMessageCount closure counter passed to enrichment methods at onFinish |
| 14 | ToolsServiceInterface is deleted from tools/index.ts | VERIFIED | tools/index.ts has no ToolsServiceInterface |
| 15 | chat-response.dto.ts file is deleted | VERIFIED | File does not exist at backend/src/modules/ai-chat/dto/chat-response.dto.ts |
| 16 | No tenantId = 'system' default parameters remain in the module | VERIFIED | Zero matches for `= 'system'` across ai-chat module |
| 17 | No unused _conversationId parameters remain in tool services | VERIFIED | Zero `_conversationId` occurrences across all tool service files |
| 18 | No unused _piiResolve parameters remain in tool services | VERIFIED | folder-tools.service.ts:70 now has `buildListFolders(tenantId: string)` — _piiResolve parameter removed |
| 19 | ai-chat.service.ts is under 500 lines | VERIFIED | 494 lines |
| 20 | productivity-tools.service.ts is deleted and replaced by focused files | VERIFIED | email-productivity-tools.service.ts (382 lines), follow-up-tools.service.ts (219 lines) exist |

**Score:** 18/18 truths verified (previously 16/18 — both gaps now closed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/ai-chat/__tests__/security-isolation.test.ts` | 6+ tests for BUG-2 + RULE-1 | VERIFIED | 8 test cases present |
| `backend/src/modules/ai-chat/__tests__/bug-fixes.test.ts` | 7+ tests for BUG-1, BUG-5, RACE-1, RACE-4 | VERIFIED | 8 test cases covering all 4 requirements |
| `backend/src/modules/ai-chat/services/conversation.service.ts` | userId + tenantId on all access paths | VERIFIED | 429 lines, withPrismaRetry on all 4 transactional methods |
| `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` | Passes req.user.userId to service methods | VERIFIED | Both getConversation and deleteConversation pass req.user.userId |
| `backend/src/modules/ai-chat/tools/email-tools.service.ts` | replyAll CC handling, draft without sentAt | VERIFIED | replyAll VERIFIED; sentAt field removed from draft create call |
| `backend/src/modules/ai-chat/tools/contact-tools.service.ts` | delete_contact with piiResolve | VERIFIED | piiResolve called before contactId use |
| `backend/src/modules/ai-chat/tools/rag-tools.service.ts` | Single embedding write path | VERIFIED | No EmbeddingsService import; only raw SQL path |
| `backend/src/modules/ai-chat/services/chat-enrichment.service.ts` | Extracted title/summary/context, modulo trigger | VERIFIED | 243 lines; all three methods present |
| `backend/src/modules/ai-chat/tools/email-productivity-tools.service.ts` | list_email_index, star, read, label tools | VERIFIED | 382 lines, wired in ai-chat.module.ts |
| `backend/src/modules/ai-chat/tools/follow-up-tools.service.ts` | list_follow_ups, update_follow_up | VERIFIED | 219 lines, wired in ai-chat.module.ts |
| `backend/src/modules/ai-chat/tools/folder-tools.service.ts` | No unused _piiResolve params | VERIFIED | buildListFolders(tenantId: string) — _piiResolve fully removed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ai-chat.controller.ts GET/DELETE | conversation.service.ts | req.user.userId parameter | WIRED | Lines pass userId; deleteConversation requires it |
| conversation.service.ts message queries | aiConversation relation | `conversation: { tenantId }` | WIRED | All 4 methods include conditional relation filter |
| email-tools.service.ts reply_email | email-send.service queueSend | cc parameter in send args | WIRED | ccAddresses set from original.cc + original.to when replyAll=true |
| conversation.service.ts transactions | withPrismaRetry | import as PrismaRetry namespace | WIRED | All 4 methods wrapped; import at line 5 |
| ai-chat.service.ts onFinish | chat-enrichment.service.ts | ChatEnrichmentService DI injection | WIRED | maybeGenerateSmartTitle/maybeTriggerSummaryGeneration called with savedMessageCount |
| ai-chat.service.ts | EmailProductivityToolsService + FollowUpToolsService | DI injection, createToolSet | WIRED | Both injected and spread in createToolSet |
| ai-chat.module.ts providers | ChatEnrichmentService, EmailProductivityToolsService, FollowUpToolsService | NestJS providers array | WIRED | All three new services registered |

### Requirements Coverage

The requirement IDs used in this phase (BUG-1 through BUG-8, RACE-1 through RACE-4, DEAD-1 through DEAD-5, RULE-1, RULE-3) are phase-internal audit identifiers defined in 87-CONTEXT.md. They do not map to entries in the project-level REQUIREMENTS.md. Phase 87 is an internal module audit, not a v6.0 milestone requirement.

BUG-2 (BOLA on conversation access) maps semantically to SEC-01 in REQUIREMENTS.md.

| Phase-Internal ID | Description | Status | Evidence |
|-------------------|-------------|--------|---------|
| BUG-1 | reply_email replyAll CC handling | SATISFIED | ccAddresses built from original CC+To when replyAll=true |
| BUG-2 | BOLA on conversation access (userId check) | SATISFIED | getConversation + deleteConversation require userId |
| BUG-3 | draft_email sets sentAt on drafts | SATISFIED | sentAt field removed from draft create call; receivedAt used instead |
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
| DEAD-5 | Unused _piiResolve params | SATISFIED | folder-tools.service.ts buildListFolders signature cleaned; zero remaining matches |

### Anti-Patterns Found

None. Both previously-flagged warnings have been resolved:
- `sentAt: new Date()` on draft creation: removed (only `receivedAt` remains)
- `_piiResolve: PiiResolveFn` in `buildListFolders`: parameter removed

### Human Verification Required

None — all checks are automated/structural. All fixes are deterministic code paths.

### Re-Verification Summary

Both gaps from the initial verification were resolved:

**Gap 1 — BUG-3 (sentAt on drafts): CLOSED.** The `sentAt` field has been removed from the `prisma.email.create` call in `draft_email`. The create call now uses only `receivedAt: new Date()`. No `sentAt` reference remains anywhere in `email-tools.service.ts`. The schema migration concern from the initial verification was avoided by simply dropping the field from the create payload rather than making it nullable — valid because `sentAt` is only required for sent emails, not drafts.

**Gap 2 — DEAD-5 (folder-tools _piiResolve): CLOSED.** `buildListFolders` in `folder-tools.service.ts` now has signature `(tenantId: string)` — the unused `_piiResolve: PiiResolveFn` parameter is gone. The caller at line 65 was already passing only `tenantId`. Zero underscore-prefixed unused parameters remain across all tool service files.

No regressions detected on the 16 previously-verified items.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
