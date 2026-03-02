# Phase 26: Non-Chat AI & Backend Testing - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate non-chat AI features (daily briefing, follow-up detection, draft generation) from deleted VoltAgent agent loops to direct `generateText + Output.object()` calls. Relocate domain services to proper NestJS modules (CRM -> contacts, calendar AI -> calendar). Build integration test suites for both chat and non-chat AI pipelines. Frontend route updates from `/api/v1/voltagent/*` to `/api/v1/ai/*`.

</domain>

<decisions>
## Implementation Decisions

### Non-chat AI migration strategy
- New services (BriefingService, FollowUpDetectionService, DraftGenerationService) live inside the existing `ai` module as `ai/services/*.service.ts`
- Each service uses `generateText + Output.object()` with pre-fetched data — no agent loops, no tool calls during generation
- Per-service data fetching: each service fetches exactly the data it needs from existing services (EmailsService, ContactsService, CalendarService) — no shared DataContextBuilder
- API routes change from `/api/v1/voltagent/*` to `/api/v1/ai/*` (clean break from VoltAgent naming). Frontend `voltAgentApi` client updated in this phase
- 50+ case quality comparison via automated comparison script: run new services against production-anonymized fixture data, compare structured output fields against expected baselines, generate field-by-field match report

### Domain service relocation
- Build from scratch in the proper modules (VoltAgent code is already deleted, nothing to "move")
- **Contacts module**: RelationshipScoreService with full CRM analysis — stale contact detection, relationship strength scoring, follow-up suggestions, interaction timeline generation
- **Calendar module**: Three services — CalendarConflictService (scheduling conflict detection), FocusTimeService (focus block suggestions), MeetingPrepService (pre-meeting briefing with attendee info + recent emails)
- All new domain services get both REST endpoints (controllers for frontend widgets) AND are injectable by other services (for chat tools to consume)
- CRM endpoints: `GET /api/v1/contacts/relationship-scores`, `GET /api/v1/contacts/stale`, etc.
- Calendar endpoints: `GET /api/v1/calendar/conflicts`, `GET /api/v1/calendar/focus-time`, `GET /api/v1/calendar/meeting-prep/:eventId`, etc.

### Integration test design
- Test runner: **Vitest** (consistent with Phase 23 AI pipeline tests, better ESM + MSW v2 support)
- Chat pipeline tests: full pipeline with MSW mocks — MSW intercepts Mistral API, returns deterministic responses triggering specific tools, verify full chain (message -> intent -> tools -> stream). Tools hit real NestJS services with test DB
- Non-chat AI tests: snapshot fixtures from anonymized production data (JSON), stored in `backend/test/fixtures/ai/`. Run new generateText services against these, validate output via Zod schemas
- E2E validation gate: separate test files (e.g., `ai-nonchat-real-e2e.test.ts`), CI-optional with test tag, requires `MISTRAL_API_KEY` secret to run

### Structured output schemas
- Zod schemas co-located with their services (each service exports its own schema)
- Strict validation with graceful fallback: Zod strict parse -> on failure: log raw output + error, retry once with tighter prompt, then return safe fallback with error flag. Never crash the request
- Frontend types derived from Zod via `z.infer<typeof schema>` — single source of truth, exported for frontend consumption
- **Briefing schema**: comprehensive — priority emails (top 5), today's calendar snapshot, pending follow-ups, natural language executive summary, stale contacts alert, draft suggestions, email volume trends, focus time recommendations
- **Follow-up detection schema**: batch analysis mode — receives batch of recent emails (e.g., last 24h), returns array of detected follow-ups with emailId, reason, suggested due date, urgency. One LLM call per batch
- **Draft generation schema**: reply context + tone + output — input: original email thread + user instruction + tone preference. Output: subject line, body text, suggested recipients, confidence score. Via Output.object() with guaranteed schema
- **CRM/Calendar schemas**: Claude's discretion — research best 2025/2026 practices online for CRM relationship scoring and calendar AI service output structures, design schemas based on what frontend widgets currently consume from voltAgentApi

### Claude's Discretion
- CRM relationship scoring schema fields and scoring algorithm approach (research best practices online)
- Calendar AI service schema fields (conflict, focus, meeting prep) — research best practices online
- Exact MSW handler structure for mocked Mistral responses
- Test fixture anonymization strategy
- Error retry prompt wording for schema validation failures
- Exact Zod schema field naming (camelCase vs snake_case) — match existing codebase conventions

</decisions>

<specifics>
## Specific Ideas

- Automated 50+ case comparison script is mandatory — not a spot check
- Briefing should be "comprehensive" — not just priorities, but stale contacts, draft suggestions, trends, focus time recs
- Follow-up detection is batch mode (24h window), not per-email
- Draft generation is user-triggered (reply context), not auto-generated
- Research online for best CRM scoring and calendar AI service patterns before designing those schemas

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MistralProviderService` (modules/mistral): consolidated SDK provider, all `generateText` calls route through this
- `AiChatService` (modules/ai-chat): reference for `streamText` + tool execution pattern established in Phase 24/25
- `IntentRouterService` (modules/ai-chat/tools): `generateText` with LLM fallback pattern, reusable for intent classification
- `EmailInsightsService` (modules/ai): unified email analysis with `MistralService.complete()` — existing compose/triage logic to reference (but not duplicate)
- `MSW v2 infrastructure` (Phase 23): SSE streaming handlers, test setup patterns
- `PiiDetectionService` + `PiiResolutionService` (modules/ai/guards): PII handling for LLM inputs
- `ai-chat/__tests__/` (6 test files): existing test patterns including real E2E gate

### Established Patterns
- AI SDK v6 `streamText`/`generateText` via `MistralProviderService.chat()` provider
- NestJS DI with module-scoped services, `@Injectable()` + constructor injection
- BullMQ queues for async processing (email embedding, contact embedding)
- Zod not currently used in backend — this phase introduces Zod for Output.object()
- Vitest for AI pipeline tests, Jest for everything else
- Circuit breaker pattern via `getAiCircuitBreaker()` utility

### Integration Points
- Frontend `voltAgentApi` in `frontend/lib/api/ai.ts` — calls `/api/v1/voltagent/*` endpoints, needs rewiring to `/api/v1/ai/*`
- Frontend TanStack Query hooks: `use-follow-ups.ts`, `use-dashboard.ts` — consume follow-up and briefing data
- Subscription/billing: `autumn.service.ts` tracks DAILY_BRIEFING feature usage — new services must integrate
- `UsageTrackingService` — all LLM calls must report token usage
- Existing `ai.controller.ts` — new non-chat endpoints can be added here or in dedicated controllers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-non-chat-ai-backend-testing*
*Context gathered: 2026-03-02*
