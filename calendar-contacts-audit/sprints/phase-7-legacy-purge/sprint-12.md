# Sprint 12 — Remove ALL Legacy Code

| Key | Value |
|-----|-------|
| Phase | 7 — Legacy Purge |
| Sprint | 12 |
| SP | 14 |
| Objective | Remove every @deprecated annotation, dead shim, and legacy fallback from the entire codebase. Zero tolerance. |
| Addresses | LEG-C1, LEG-C2, LEG-H1, LEG-H2, LEG-H3, LEG-H4, LEG-H5, LEG-H6, LEG-M1, LEG-M2, LEG-M3 |

## Sprint Backlog

### T-1201: Remove GraphExpansionService and all fallback paths [3 SP]

- [ ] Read `graph-expansion.service.ts` — confirm @deprecated
- [ ] Read `rag-tools.service.ts:310` — find "Legacy fallback: use GraphExpansionService"
- [ ] Remove fallback path in rag-tools.service.ts → use EntityGraphService directly
- [ ] Delete `graph-expansion.service.ts`
- [ ] Remove from module providers/imports
- [ ] Grep entire codebase for `GraphExpansion` — remove all references
- [ ] Test: `npx tsc --noEmit` passes, `npx jest --testPathPattern=ai-chat` passes

### T-1202: Migrate ConversationMessage.content → parts [3 SP]

- [ ] Read `frontend/lib/api/ai.ts:139` — find content field with @deprecated
- [ ] Grep all consumers of `ConversationMessage.content` in frontend
- [ ] Migrate every consumer to use `parts` field instead
- [ ] Remove `content` field from ConversationMessage type
- [ ] If backend still sends `content`: remove from serializer/DTO too
- [ ] Grep `\.content` in chat-related components — verify no regressions
- [ ] Test: AI chat renders correctly with parts-only messages

### T-1203: Remove deprecated health/metrics endpoints [2 SP]

- [ ] Read `health.service.ts` — find @deprecated methods
- [ ] Read `queue-health.service.ts` — find @deprecated
- [ ] Verify `/metrics` (prom-client) is the active replacement
- [ ] Remove deprecated methods from HealthService
- [ ] Remove QueueHealthService if entirely deprecated
- [ ] Remove corresponding controller endpoints
- [ ] Keep only: `GET /health` (basic liveness) + `GET /metrics` (Prometheus)
- [ ] Test: `curl /health` → 200, `curl /metrics` → Prometheus output

### T-1204: Clean Session.tenantId and theme toggle props [1 SP]

- [ ] Read `tenant-scoped-models.ts:9` — Session.tenantId deprecated
- [ ] If field is nullable and no longer queried: remove from model type
- [ ] If Prisma schema still has it: leave in DB but remove from TS types
- [ ] Read `Header.tsx` — remove onThemeToggle, isDarkMode dead props
- [ ] Remove from all callers passing these props
- [ ] Test: `npx tsc --noEmit` passes

### T-1205: Remove multiAgentApi shim and legacy dashboard hooks [2 SP]

- [ ] Grep for `multiAgentApi` — find all imports
- [ ] Replace every `multiAgentApi` call with direct `aiChatApi` call
- [ ] Delete the shim file
- [ ] Read `use-dashboard.ts` — fix circular @deprecated on `useImportantEmails`
- [ ] If PriorityInboxWidget removed (S10): delete `importantEmailsOptions()` and `useImportantEmails()`
- [ ] Remove dead query keys from `dashboard-keys.ts`
- [ ] Test: `npx tsc --noEmit` passes, AI chat works

### T-1206: Remove AI DTO remnants and deprecated utils [1 SP]

- [ ] Read `ai.dto.ts:12-13` — remove commented-out ChatDto, ChatResponseDto
- [ ] Read `field-encryption.utils.ts:69` — remove deprecated `hmacForBlindIndex()` (old version)
- [ ] Read `usage-tracking.service.ts:303` — remove deprecated usage check method
- [ ] Read `chat-thread-list-adapter.tsx:220` — remove legacy adapter code
- [ ] Grep entire codebase for `@deprecated` — fix or remove every remaining instance
- [ ] Test: `npx tsc --noEmit` passes

### T-1207: Remove legacy calendar/contacts code superseded by CRM [2 SP]

- [ ] Map all CRM module imports from calendar/contacts modules
- [ ] Identify dead calendar/contacts exports not used by CRM or frontend
- [ ] Remove unused functions, services, DTOs
- [ ] Verify CRM lead-scoring still gets calendar meetingCount
- [ ] Verify CRM churn prediction still reads email metrics
- [ ] Run `npx madge --circular backend/src/` — zero circular deps
- [ ] Test: full backend test suite passes

## Dependencies

- S11 (dashboard consolidated)

## Risks

- R1: Removing GraphExpansionService fallback may break RAG if EntityGraphService has bugs
- Mitigation: Run RAG integration tests before committing
- R2: ConversationMessage.content removal may break older stored conversations
- Mitigation: Check if backend migration handles historical messages
- R3: Removing health endpoints may break monitoring/alerting
- Mitigation: Verify /metrics is configured in Railway health checks

## Definition of Done

- [ ] `grep -r "@deprecated" backend/src/ frontend/` returns ZERO results
- [ ] `grep -r "multiAgentApi" frontend/` returns ZERO results
- [ ] `grep -r "GraphExpansion" backend/` returns ZERO results
- [ ] `grep -r "voltAgent\|VoltAgent" backend/ frontend/` returns ZERO results (except migration files)
- [ ] `npx madge --circular backend/src/` returns clean
- [ ] `npx tsc --noEmit` passes (backend + frontend)
- [ ] Full test suite passes: `npx jest --no-coverage`
- [ ] No dead imports detected by lint
