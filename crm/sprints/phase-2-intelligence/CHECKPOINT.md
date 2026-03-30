# Sprint 13 — Checkpoint

## Stato

- **Sprint:** 13 — Next Best Action
- **Last Task Completed:** T-1310 — Type-check validation, translations, query hooks
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 17/17
- **Last Updated:** 2026-03-30 15:30

## Last Modified Files

- backend/prisma/schema.prisma (NBAAction model, relations on Tenant/CrmDeal/Contact)
- backend/src/modules/crm/nba/nba-context.types.ts (new — NBADealContext, NBAContactContext)
- backend/src/modules/crm/nba/nba-context.service.ts (new — context gathering)
- backend/src/modules/crm/nba/nba-ranking.service.ts (new — weighted rule engine)
- backend/src/modules/crm/nba/nba.service.ts (new — orchestrator: context + ranking + persistence)
- backend/src/modules/crm/nba/nba.controller.ts (new — REST endpoints)
- backend/src/modules/crm/nba/nba.module.ts (new — module wiring)
- backend/src/modules/crm/nba/dto/nba.dto.ts (new — UpdateNBAStatusDto)
- backend/src/modules/crm/crm.module.ts (NBAModule added)
- backend/src/modules/ai-chat/tools/crm-tools.service.ts (get_next_best_action tool)
- backend/src/modules/ai-chat/ai-chat.module.ts (NBAModule import)
- frontend/lib/api/crm-nba.ts (new — API module with types)
- frontend/hooks/queries/crm-nba-keys.ts (new — query keys)
- frontend/hooks/queries/use-crm-nba.ts (new — query hooks)
- frontend/hooks/queries/index.ts (NBA exports)
- frontend/components/dashboard/crm-nba/SuggestionCard.tsx (new)
- frontend/components/dashboard/crm-nba/NBASection.tsx (new)
- frontend/components/dashboard/crm-nba/NBAEffectiveness.tsx (new)
- frontend/components/dashboard/crm-deals/DealDetail.tsx (NBASection integration)
- frontend/locales/en.ts (NBA translations)
- frontend/locales/it.ts (NBA translations)
- frontend/locales/index.ts (NBA type definitions)

## Key Decisions Made

- T-1301: NBAAction uses tenantId for Contact composite FK (same pattern as ChurnSignal, LeadScore)
- T-1302: Aggregates best engagement score and worst churn risk across all deal contacts
- T-1303: 7 rule categories with confidence threshold >= 0.4, max 3 results
- T-1304: Controller routes effectiveness/stats as /crm/nba/effectiveness/stats (before :dealId param catch)
- T-1305: SuggestionCard uses lucide-react icons mapped per action type, collapsible reasoning
- T-1306: NBASection placed between pipeline progress bar and tabs (no sidebar — current layout is single-column)
- T-1307: Accept/dismiss tracking reuses useUpdateNbaStatus mutation already built in T-1305
- T-1308: Tool added to existing CrmToolsService, NBAModule imported in AiChatModule
- T-1309: Table-based effectiveness view with color-coded acceptance rate progress bars

## Patterns Established

- NBA module at `backend/src/modules/crm/nba/`
- NBA API module: `frontend/lib/api/crm-nba.ts`
- NBA components: `frontend/components/dashboard/crm-nba/`
- Shared types in `nba-context.types.ts` to avoid circular deps
- Context gathering pattern: gather all signals in parallel, aggregate per-contact

## Blockers / Notes

- Effectiveness stats route must be defined before :dealId param route in controller (route ordering)
- Competitor mentions feature (T-1302 spec) not implemented — no competitor data model exists
- Action execution flow opens correct path via status tracking, not full automation

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
- Prisma generate: ✅ done
- DB push: ✅ schema synced to Railway

## Production Validation (2026-03-30)

- Railway `/health`: ✅ 200 — DB, Redis, Mistral up
- `GET /crm/nba/test-deal-id`: ✅ 401 (route registered, auth guard active)
- `GET /crm/nba/effectiveness/stats`: ✅ 401 (route registered, auth guard active)
- Vercel `/dashboard/crm/deals`: ✅ 307 (auth redirect, page exists)
