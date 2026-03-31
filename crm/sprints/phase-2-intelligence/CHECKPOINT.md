# Sprint 14.1 — Checkpoint

## Stato
- **Sprint:** 14.1 — AI Tool & LLM Integration Completeness
- **Last Task Completed:** T-1422 — GovernanceToolUI renderer
- **Next Task:** T-1423 — E2E validation on production
- **Tasks Done:** 12/13
- **SP Completed:** 13/14
- **Last Updated:** 2026-03-31 09:30

## Last Modified Files
- backend/src/modules/ai-chat/tools/crm-intelligence-tools.service.ts (new — 7 tools)
- backend/src/modules/ai-chat/tools/index.ts (barrel export)
- backend/src/modules/ai-chat/ai-chat.module.ts (ForecastingModule + GovernanceModule imports)
- backend/src/modules/ai-chat/services/ai-chat.service.ts (DI + createToolSet wiring)
- backend/src/modules/ai-chat/constants/tool-domains.ts (CRM domain mapping)
- backend/src/modules/ai-chat/constants/system-prompt.ts (CRM decision tree + examples)
- backend/src/modules/ai-chat/dto/chat-request.dto.ts (timezone field)
- backend/src/modules/ai-chat/services/chat-enrichment.service.ts (requestedTimezone)
- frontend/src/components/chat/ChatRuntimeProvider.tsx (locale/timezone injection)
- frontend/src/components/chat/types.ts (CRM tool output types)
- frontend/src/components/chat/tool-uis/DealsToolUI.tsx (new — 3 renderers)
- frontend/src/components/chat/tool-uis/CrmIntelligenceToolUI.tsx (new — 5 renderers)
- frontend/src/components/chat/tool-uis/GovernanceToolUI.tsx (new — 2 renderers)
- frontend/src/components/chat/tool-uis/index.tsx (TOOL_RENDERERS map — 11 new entries)

## Key Decisions Made
- Created separate CrmIntelligenceToolsService (not extending crm-tools.service.ts) to respect 500-line limit
- Tools use Prisma directly for LeadScore/ChurnSignal queries (no service indirection needed)
- ForecastService injected directly (imports ForecastingModule)
- GovernanceService + ModelRetrainService injected (imports GovernanceModule)
- All new tools mapped to 'crm' domain (including pre-existing deal tools that were unmapped)
- Frontend locale/timezone injected via module-scoped cache + Object.assign mutation in transport

## Patterns Established
- CRM intelligence tools follow same pattern as crm-tools.service.ts: schemas + tool() + truncateToolResult
- Tool renderers: ErrorCard + LoadingCard shared helpers, MUI Paper/Chip/LinearProgress
- TOOL_DOMAINS: added 'crm' domain for all CRM tools (deal + intelligence + governance)

## Blockers / Notes
- Pre-commit hook includes tsc check — a parallel agent's commit introduced a type error in contacts-import.service.ts (normalizeVCardEncoding). Sprint 14.1 code is clean.
- Accounts export 404 on Vercel: backend route exists (Railway returns 401), likely stale Vercel deployment. Will resolve on next push.

## Validation Status
- Backend tsc: ✅ passing (own code)
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
