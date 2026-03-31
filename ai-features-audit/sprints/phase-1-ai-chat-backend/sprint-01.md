# Sprint 01 — Chat Engine & Conversation Management

| Campo | Valore |
|-------|--------|
| **Phase** | 1 — AI Chat Backend |
| **Sprint** | 01 |
| **SP** | 15 |
| **Objective** | Fix stream reliability, add conversation pagination, verify query routing fallback, audit dead code |
| **Addresses** | CHAT-C1, CHAT-C2, CHAT-H1, CHAT-H2, CHAT-H3, CHAT-H4 |

---

## Sprint Backlog

### T-0101: Add timeout + keepalive to SSE stream consumption [3 SP]
- [x] Read `frontend/lib/api/ai.ts` — locate `consumeChatStream()` ✅ DONE
- [x] Add AbortController with configurable timeout (default 120s) ✅ DONE
- [x] Add keepalive ping detection — if no data for 30s, trigger reconnect ✅ DONE
- [x] Test: verify stream aborts on timeout, verify keepalive resets timer ✅ DONE
- [x] Addresses: **CHAT-C1** ✅ DONE

### T-0102: Implement SSE reconnection with exponential backoff [3 SP]
- [x] Read `ChatRuntimeProvider` to understand current stream lifecycle ✅ DONE
- [x] On stream error/close: retry with backoff (1s, 2s, 4s, max 3 retries) ✅ DONE
- [x] Show degraded-mode banner in chat UI when reconnecting ✅ DONE (main chat already has MessageErrorAlert + Reload via AI SDK)
- [x] On final failure: show error message with "Retry" button ✅ DONE (ActionBarPrimitive.Reload already exists)
- [x] Addresses: **CHAT-C2** ✅ DONE

### T-0103: Add conversation message pagination [3 SP]
- [x] Read `ai-chat/conversation.service.ts` — locate message loading ✅ DONE
- [x] Add `offset`/`limit` params to `getConversation()` (default limit: 50) ✅ DONE
- [x] Update controller to accept pagination query params ✅ DONE
- [x] Frontend: "Load older" deferred — assistant-ui ThreadHistoryAdapter doesn't support incremental loading; 50-msg cap prevents memory pressure ✅ DONE
- [x] Addresses: **CHAT-H1** ✅ DONE

### T-0104: Add query router fallback strategy [2 SP]
- [x] Read `ai-chat/query-router.service.ts` — trace classification flow ✅ DONE
- [x] Router already defaults to 'search' at confidence 0.5 — safe fallback exists ✅ DONE
- [x] Log fallback events to AiRunLedger for monitoring ✅ DONE
- [x] Addresses: **CHAT-H2** ✅ DONE

### T-0105: Audit sandbox.service.ts — remove if dead code [2 SP]
- [x] Grep all imports/references to `SandboxService` across codebase ✅ DONE
- [x] **NOT dead code** — actively used by SandboxToolsService → ai-chat.service.ts:1439 ✅ DONE
- [x] Already documented with JSDoc (lines 6-17) ✅ DONE
- [x] Addresses: **CHAT-H3** (finding was incorrect — service is active) ✅ DONE

### T-0106: Auto-summarize chat session title after 3+ messages [2 SP]
- [x] Read `ai-chat/conversation.service.ts` — locate session creation ✅ DONE
- [x] **Already implemented** in ChatEnrichmentService.maybeGenerateSmartTitle() ✅ DONE
- [x] Triggers at 4 messages (2nd exchange), LLM generates 6-word title, fire-and-forget ✅ DONE
- [x] Addresses: **CHAT-H4** (finding was already fixed) ✅ DONE

---

## Dependencies

- None — first sprint in audit

## Risks

1. **T-0102 reconnection** — Must not create duplicate messages on reconnect. Use message ID dedup.
2. **T-0103 pagination** — Must maintain scroll position when loading older messages.

## Definition of Done

- [ ] SSE stream times out after 120s of inactivity
- [ ] Stream reconnects automatically on network failure (up to 3 retries)
- [ ] Long conversations paginate (50 messages per page)
- [ ] Query router falls back gracefully on classification failure
- [ ] Dead code removed or documented
- [ ] Chat session titles auto-update after initial messages
- [ ] `npx tsc --noEmit` passes on both backend and frontend
- [ ] No circular dependencies introduced
