# Phase 23: SDK Foundation & Test Infrastructure - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate all LLM chat/completion calls and embedding generation under `@ai-sdk/mistral` via a centralized provider service. Remove old SDKs (`@mistralai/mistralai`, `@voltagent/core`). Set up Vitest + real-API test infrastructure. Validate with a full-pipeline E2E gate (streaming + embeddings + pgvector). Bulk re-embed 3301 emails from PST extract as test data.

MSW v2 mocking (TEST-01) is explicitly deferred — all tests use real Mistral API calls.

</domain>

<decisions>
## Implementation Decisions

### Migration Approach
- Clean break: remove `@mistralai/mistralai` AND `@voltagent/core` in one pass — no coexistence period
- DB is purgeable (dev environment) — no data migration concerns
- All files migrated in one shot, not gradual

### Provider Service Architecture
- Standalone `MistralModule` (not inside AI module) — any NestJS module can import it
- Thin provider: `MistralProviderService` exposes model instances via `getChatModel(modelId?)` and `getEmbeddingModel(modelId?)`
- Callers use AI SDK functions (`streamText`, `embed`, `generateText`) directly with provider models
- Default chat model: `mistral-small-latest` with optional per-call override
- Default embedding model: `mistral-embed` (same as current — 1024 dimensions, compatible with existing pgvector indexes)

### Error Handling
- Provider service does NOT handle retries — callers decide retry strategy based on context
- Provider DOES standardize error types: wraps raw SDK errors into typed NestJS exceptions (MistralRateLimitError, MistralAuthError, etc.)
- BullMQ embedding queue keeps its own retry logic (already has 6-retry + DLQ)

### Embedding Migration
- Wipe all existing embeddings — clean slate
- Re-generate everything via new AI SDK `embed()`/`embedMany()` through BullMQ pipeline
- Keep existing BullMQ queue architecture (batching 50 items, 200ms flush, 2 req/s rate limit)
- Bulk re-embed triggered via CLI script: `npx ts-node scripts/re-embed-all.ts`
- Script processes both emails AND contacts
- 3301 emails available in `D:\MailAgent\data\posta_extracted.jsonl` (PST extract, JSONL format)

### Test Data & Seeding
- Test data flow: JSONL → embedding pipeline (BullMQ → AI SDK embed() → pgvector)
- No app accounts/folders created — data is purely for LLM pipeline validation
- Import script reads `posta_extracted.jsonl`, feeds content into embedding queue
- E2E gate queries these embeddings to validate the full retrieval path

### E2E Validation Gate
- Full pipeline test: streaming chat response + DB persistence + tool detection + embedding query
- Tests BOTH chat/streaming AND embedding generation+retrieval
- Local dev only — no CI (requires real MISTRAL_API_KEY)
- Hard fail: phase is NOT complete until E2E gate passes with real Mistral API
- If Mistral API is down/rate-limited, phase stays incomplete — no exceptions

### Test Infrastructure
- TEST-01 (MSW v2 mocking) dropped from Phase 23 — deferred to future phase
- All tests use real Mistral API calls
- Test runner: Vitest (native ESM/TS, fast, modern)
- Test file location: colocated with source (e.g., `src/ai/services/__tests__/chat.service.test.ts`)
- Comprehensive real-API test scenarios: happy path streaming, error responses, tool call streaming, multi-turn conversations, embedding generation and retrieval

### Claude's Discretion
- Internal structure of MistralProviderService implementation
- Exact typed exception class hierarchy
- Vitest configuration details
- Re-embed script progress reporting and error handling
- Seed script batching strategy for 3301 emails

</decisions>

<specifics>
## Specific Ideas

- "We are in dev, we can purge the database" — no migration concerns, clean slate approach throughout
- 3301 real work emails in `D:\MailAgent\data\posta_extracted.jsonl` — already extracted from PST, JSONL format with subject, body, from, to, folder, threadId, etc.
- Data is for LLM pipeline testing only, not for app account/sync functionality
- Existing `extract_pst.py` scripts in data/ already handle PST extraction

</specifics>

<deferred>
## Deferred Ideas

- **MSW v2 mocking infrastructure (TEST-01)** — dropped from Phase 23. All tests use real API. Mocking can be added in a future phase if CI speed becomes an issue.
- **MSDK-03 partial** — `@voltagent/core` removal is included in Phase 23 (per user decision), but may have deep tentacles that surface during implementation.

</deferred>

---

*Phase: 23-sdk-foundation-test-infrastructure*
*Context gathered: 2026-02-27*
