# AI Features Audit — Findings

**Audit date:** 2026-03-31
**Auditor:** Codebase exploration + pattern analysis across ai/ and ai-chat/ modules
**Scope:** ~18,400 backend lines (60 files) + ~10,050 frontend lines (43 files)
**Baseline score:** TBD (to be scored after Phase 1-4 verification)

## Severity Levels

| Level | Code | Meaning |
|-------|------|---------|
| Critical | C | Data loss, security breach, or broken core workflow |
| High | H | Feature doesn't work as expected, user-visible bug |
| Medium | M | Suboptimal behavior, missing edge case handling |
| Low | L | Polish, UX improvement, nice-to-have |

---

## AI Chat Backend Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CHAT-C1 | SSE stream consumption has no timeout — can hang indefinitely | `frontend/lib/api/ai.ts` `consumeChatStream()` | No AbortController timeout or keepalive ping. Network drop = permanent hang for the user. |
| CHAT-C2 | No reconnection logic on SSE stream failure | `frontend/lib/api/ai.ts`, `ChatRuntimeProvider` | If network drops mid-stream, no automatic retry or resume. User sees incomplete response with no error. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CHAT-H1 | ai-chat conversation history loaded in full — no pagination | `ai-chat/conversation.service.ts` | Long conversations load all messages at once. Memory pressure risk with 100+ message threads. |
| CHAT-H2 | Query router has no fallback when classification fails | `ai-chat/query-router.service.ts` | If LLM fails to classify query intent, no default routing strategy. May return empty result. |
| CHAT-H3 | sandbox.service.ts purpose unclear / possibly dead code | `ai-chat/sandbox.service.ts` (159 lines) | No callers found in router or controller. May be vestigial from earlier architecture. |
| CHAT-H4 | Chat session title never updated after creation | `ai-chat/conversation.service.ts` | Sessions created with initial title but never auto-summarized as conversation evolves. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CHAT-M1 | Memory service has no eviction strategy | `ai-chat/memory.service.ts` | Conversation memory grows unbounded. No sliding window or summarization for old context. |
| CHAT-M2 | Reranking service called on every search — no bypass for simple queries | `ai-chat/reranking.service.ts` | Simple keyword queries still go through LLM-based reranking. Adds latency without benefit. |
| CHAT-M3 | Entity graph traversal depth not configurable | `ai-chat/entity-graph.service.ts` | Fixed traversal depth may miss relevant connections or over-fetch for simple queries. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CHAT-L1 | Chat enrichment runs synchronously before response | `ai-chat/chat-enrichment.service.ts` | Could be parallelized with main LLM call for faster first-token time. |

---

## Knowledge Base & RAG Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| KB-C1 | Embedding backfill has no tenant-level throttle | `embedding-backfill-scheduler.service.ts` | One tenant with 50K emails could starve others during backfill. No per-tenant queue priority. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| KB-H1 | No embedding versioning — model change requires full reindex | `embeddings.service.ts` | `embeddingModel` stored but no migration path when switching models. Mixed-model vectors produce poor similarity. |
| KB-H2 | Orphan embedding cleanup runs only weekly | `orphan-embedding-cleanup.service.ts` | Deleted emails accumulate orphan embeddings for up to 7 days. Wastes storage and pollutes search. |
| KB-H3 | No dedup check before enqueueing embedding jobs | `email-embedding.queue.ts` | Same emailId can be enqueued multiple times during rapid sync. Wastes Mistral API quota. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| KB-M1 | Query embedding cache 24h TTL serves stale results after email deletion | `query-embedding-cache.service.ts` | Deleted emails still appear in cached search results until TTL expires. |
| KB-M2 | Contact embedding queue rate limit (2 req/s) not configurable per tenant | `contact-embedding.queue.ts` | Global rate limit. High-volume tenant blocks all others. |
| KB-M3 | Embedding composer chunking strategy not documented or tested | `embedding-composer.service.ts` | 416 lines of chunking logic with no unit tests. Edge cases (empty body, huge attachments) unclear. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| KB-L1 | Cache prewarming runs at startup — delays boot time | `cache-prewarming.service.ts` | Synchronous prewarming on module init. Could be deferred to after-first-request. |

---

## Email Intelligence Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EI-C1 | Triage distributed semaphore could deadlock if worker crashes mid-lock | `email-triage.service.ts` | Redis Lua semaphore with max 5 concurrent. If worker OOMs mid-triage, slot stays held until manual cleanup. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EI-H1 | Follow-up detection batch has no per-tenant isolation | `follow-up-detection.service.ts` | Batch detection processes emails across tenants. One tenant's load affects another's detection latency. |
| EI-H2 | Briefing service single LLM call may timeout on large mailboxes | `briefing.service.ts` (430 lines) | Aggregates priority emails + calendar + follow-ups + contacts in one prompt. Could exceed token limit. |
| EI-H3 | Triage backfill scheduler recovers missed emails but no max-age limit | `triage-backfill-scheduler.service.ts` | Could attempt to triage months-old emails on first enable. Should have configurable lookback window. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EI-M1 | Draft generation no max length enforcement on user prompt | `draft-generation.service.ts` | User can submit arbitrarily long prompt. No truncation before LLM call. |
| EI-M2 | Email analysis 24h cache not invalidated on label/folder change | `email-analysis.service.ts` | Moving email to different folder doesn't bust analysis cache. Stale priority/label suggestions. |
| EI-M3 | Triage learning signal tracking has no privacy controls | `triage-learning.service.ts` | Implicit behavioral tracking (what user triages, ignores) without explicit opt-in beyond AI consent. |
| EI-M4 | Reminder scheduler Socket.IO notification has no delivery guarantee | `reminder-scheduler.service.ts` | If user is offline when reminder fires, notification is lost. No persistent notification queue. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EI-L1 | Follow-up detection Zod schema not exported for frontend reuse | `follow-up-detection.service.ts` | Frontend duplicates the type definition instead of sharing via shared types. |

---

## AI Security & Guards Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| SEC-C1 | Prompt guard regex patterns can be bypassed with encoding tricks | `prompt-guard-sentinel.service.ts` | Regex-based injection detection. Unicode homoglyphs, base64-encoded payloads, and token splitting bypass patterns. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| SEC-H1 | PII detection misses non-English PII patterns | `pii-detection-sentinel.service.ts` | Italian codice fiscale, IBAN, partita IVA not detected. Only US-centric SSN/phone patterns. |
| SEC-H2 | Output validation doesn't check for prompt echo-back attacks | `prompt-guard-sentinel.service.ts` `validateOutput()` | LLM could echo the system prompt back. Output guard checks for PII leakage but not prompt exfiltration. |
| SEC-H3 | PII resolution context-aware replacement has no audit trail | `pii-resolution.service.ts` | PII is unmasked for display but no log of who accessed what PII data. GDPR accountability gap. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| SEC-M1 | Consent enforcement not verified on all AI endpoints | `ai.controller.ts` | Some endpoints use `@RequiresConsent()` decorator, audit needed to confirm ALL mutating AI calls are covered. |
| SEC-M2 | Defensive system prompt injected but not versioned | `prompt-guard-sentinel.service.ts` `getDefensiveSystemPrompt()` | No version tracking for security prompts. Hard to audit which version was active when an incident occurred. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| SEC-L1 | PromptGuard patterns not externalized — require code deploy to update | `prompt-guard-sentinel.service.ts` | Hardcoded regex arrays. Adding new injection pattern requires code change + deploy. |

---

## AI Chat Frontend Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| FE-C1 | CSRF token fetched on every single API call | `frontend/lib/api/ai.ts` | No caching of CSRF token. Every AI request = extra round-trip. Performance and potential race condition. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| FE-H1 | CommandPalette modal has no focus trap or ARIA labels | `CommandPalette/index.tsx` | Dialog, search field, and list items missing `aria-label`. No focus trap management. WCAG violation. |
| FE-H2 | aiResponse state set but never rendered in SchedulingDrawer | `calendar/ai/SchedulingDrawer.tsx` | AI response fetched and stored in state but UI never shows it. Dead code or incomplete feature. |
| FE-H3 | Chat tool result displays assume data structure — no validation | Tool renderer components | All 14 tool UIs destructure response directly. Malformed tool response = runtime crash. |
| FE-H4 | HitlApprovalCard has no timeout or expiry display | `HitlApprovalCard.tsx` | Pending HITL approvals sit indefinitely. No visual indicator of how long action has been waiting. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| FE-M1 | No aria-labels on interactive chat tool elements | Tool renderer components | Buttons, links, and interactive elements in tool UIs lack accessibility attributes. |
| FE-M2 | Chat mobile layout hamburger nav not keyboard accessible | `ChatMobileLayout` | Menu toggle likely mouse-only. No keyboard shortcut to open thread list on mobile. |
| FE-M3 | ChatSuggestions quick-reply chips not translatable | `ChatSuggestions.tsx` | Suggestion text likely hardcoded in English. No i18n support. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| FE-L1 | Chat thread skeleton shown until hydration — could flash | `ChatPage.tsx` | Uses `mounted` ref guard. Brief skeleton flash on every page load. |

---

## Email AI Frontend Findings

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EF-H1 | Hardcoded gradient color in AiComposeMenu | `AiComposeMenu.tsx:170` | `'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)'` — should use theme palette. |
| EF-H2 | Hardcoded placeholder strings in AIInlineMenu | `AIInlineMenu.tsx:123` | `'Tell AI how to modify...'` and `'Describe what to write...'` — not using translations. |
| EF-H3 | NBASection silently swallows API errors | `NBASection.tsx:57` | `if (error) return null;` — no error logging, no retry, no user feedback. |
| EF-H4 | WritingStyleSettings hardcoded sample placeholder | `WritingStyleSettings.tsx:264` | `"Dear John, I hope this email finds you well..."` — not translatable. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EF-M1 | Follow-up snooze mutation has no error toast | `FollowUpWidget.tsx` | Snooze calls `refetch()` on success but shows nothing on failure. User thinks snooze worked. |
| EF-M2 | AiComposeMenu tone selection not surfaced to parent onCompose | `AiComposeMenu.tsx` | `handleToneSelect` toggles internal state but never passes selected tone to the compose callback. |
| EF-M3 | AIInlineMenu input not autofocused when content appears | `AIInlineMenu.tsx` | User must manually click the refinement input. Should autofocus for keyboard flow. |
| EF-M4 | AiTriageWidget priority color mapping hardcoded | `AiTriageWidget.tsx:32-38` | PRIORITY_CONFIG uses inline hex colors instead of theme semantic tokens. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| EF-L1 | AiDraftBadge has no animated entrance — appears abruptly | `AiDraftBadge.tsx` | Uses Fade but parent container may not trigger animation smoothly. |
| EF-L2 | FollowUpWidget locale-specific date formatting incomplete | `FollowUpWidget.tsx:36` | Only Italian locale check — no support for other locales. |

---

## CRM AI Frontend Findings

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CRM-H1 | Hardcoded currency `$` in GovernanceDashboard | `GovernanceDashboard.tsx:92-93` | Cost formatting uses `$` prefix. Should be locale-aware currency. |
| CRM-H2 | Hardcoded locale `it-IT` in ForecastDashboard | `ForecastDashboard.tsx:72-77` | Currency formatting locked to Italian locale. Should respect user's locale setting. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CRM-M1 | GovernanceDashboard tabs have no `aria-label` | `GovernanceDashboard.tsx` | Tab interface missing accessibility attributes. Screen readers can't describe tab purpose. |
| CRM-M2 | ForecastDashboard no error message displayed for forecast errors | `ForecastDashboard.tsx` | Error state exists but no UI renders it. User sees empty dashboard with no explanation. |
| CRM-M3 | NBASection no empty state — silently hides | `NBASection.tsx` | When no actions available, entire section disappears. No "No recommendations" message. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CRM-L1 | GovernanceDashboard tab state not persisted across navigations | `GovernanceDashboard.tsx` | Switching away and back resets to first tab. Minor UX friction. |
| CRM-L2 | No in-app AI feature tour or onboarding | General | New users have no discoverability path for AI features. |

---

## Observability & Cost Findings

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| OBS-H1 | AiRunLedger fire-and-forget — failures silently lost | `ai-run-ledger.service.ts` | `recordRun()` doesn't await or retry. DB write failure = permanently lost telemetry. |
| OBS-H2 | AI health endpoint `/ai/health` is public — info disclosure risk | `ai-health.controller.ts` | Public health probe exposes circuit breaker state, failure counts. Should be auth-gated or minimal. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| OBS-M1 | Cost summary has no alerting when approaching tenant limits | `ai-analytics.service.ts` | Burn rate calculated but no proactive alert when a tenant approaches quota. |
| OBS-M2 | No dashboard or endpoint for embedding queue health | `email-embedding.queue.ts` | Queue depth, DLQ size, processing rate not exposed. Blind spot for ops. |
| OBS-M3 | Circuit breaker state not surfaced to frontend | `ai-circuit-breaker.ts` | When circuit is open, frontend still sends requests. No degraded-mode UI. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| OBS-L1 | AI analytics time-series granularity fixed | `ai-analytics.service.ts` | No hourly/daily/weekly toggle. Fixed bucket size may not suit all analysis needs. |

---

## Summary

| Module | Critical | High | Medium | Low | Total |
|--------|----------|------|--------|-----|-------|
| AI Chat Backend | 2 | 4 | 3 | 1 | 10 |
| Knowledge Base & RAG | 1 | 3 | 3 | 1 | 8 |
| Email Intelligence | 1 | 3 | 4 | 1 | 9 |
| AI Security & Guards | 1 | 3 | 2 | 1 | 7 |
| AI Chat Frontend | 1 | 4 | 3 | 1 | 9 |
| Email AI Frontend | 0 | 4 | 4 | 2 | 10 |
| CRM AI Frontend | 0 | 2 | 3 | 2 | 7 |
| Observability & Cost | 0 | 2 | 3 | 1 | 6 |
| **Total** | **6** | **25** | **25** | **10** | **66** |
