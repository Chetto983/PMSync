# Sprint 10 — Checkpoint

## Stato

- **Sprint:** 10 — Lead Score UI & CRM AI Tools
- **Last Task Completed:** T-1010 — Register CRM tools in ToolRegistry
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 17/17
- **Last Updated:** 2026-03-30 10:30

## Last Modified Files

- frontend/lib/api/crm-lead-scores.ts (new — API module)
- frontend/hooks/queries/crm-lead-scores-keys.ts (new — query keys)
- frontend/hooks/queries/use-crm-lead-scores.ts (new — hooks)
- frontend/hooks/queries/index.ts (exports)
- frontend/components/dashboard/crm-lead-score/LeadScoreGauge.tsx (new)
- frontend/components/dashboard/crm-lead-score/LeadScoreBadge.tsx (new)
- frontend/components/dashboard/crm-lead-score/ScoreHistoryChart.tsx (new)
- frontend/components/dashboard/crm-lead-score/useLeadScoreMap.ts (new)
- frontend/components/contacts/ContactListItem.tsx (leadScore prop)
- frontend/components/contacts/ContactList.tsx (leadScoreMap prop)
- frontend/components/dashboard/Contacts.tsx (score sort + map wiring)
- frontend/locales/en.ts (leadScore translations)
- frontend/locales/it.ts (leadScore translations)
- frontend/locales/index.ts (leadScore types)
- backend/prisma/schema.prisma (LeadScoreHistory model)
- backend/src/modules/crm/lead-scoring/lead-scoring.service.ts (history writes)
- backend/src/modules/crm/lead-scoring/controllers/lead-score.controller.ts (history endpoint)
- backend/src/modules/crm/scoring/deal-scoring.service.ts (behavioral enhancement)
- backend/src/modules/ai-chat/tools/crm-tools.service.ts (new — 3 CRM tools)
- backend/src/modules/ai-chat/tools/index.ts (CrmToolsService export)
- backend/src/modules/ai-chat/ai-chat.module.ts (CrmToolsService provider)
- backend/src/modules/ai-chat/services/ai-chat.service.ts (CrmToolsService wiring)

## Key Decisions Made

- T-1001: SVG-based circular gauge (no chart library dependency), semantic colors via getScoreArcColor
- T-1002: LeadScoreBadge as reusable Chip (same pattern as DealScoreBadge)
- T-1003: Client-side sorting via leadScoreMap since scores fetched separately from contacts
- T-1004: Behavioral sub-score uses CrmActivity (not separate interaction model), 60/40 blend
- T-1005: LeadScoreHistory model added for trend tracking (previously upsert-only); Recharts used instead of MUI X Charts (already installed)
- T-1007/08/09: Single CrmToolsService for all 3 tools; move_deal_stage requires HITL approval
- T-1010: Domain set to 'productivity' (no 'crm' domain in existing enum)

## Patterns Established

- Lead score API module: `frontend/lib/api/crm-lead-scores.ts`
- Lead score components: `frontend/components/dashboard/crm-lead-score/`
- CRM AI tools: `backend/src/modules/ai-chat/tools/crm-tools.service.ts`
- LeadScoreHistory: append-only history for score trend charts
- useLeadScoreMap hook: batch-fetch scores, returns Map<contactId, {score, tier}>

## Blockers / Notes

- Score history will only populate going forward (no backfill of existing scores)
- T-1003: Implemented sort toggle only (no min/max range slider — would add complexity for low value)
- CRM tools use 'productivity' domain since ToolDomain enum doesn't include 'crm' yet
- prisma db push needed before deploy for LeadScoreHistory table

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: not checked yet (need madge run)
- Prisma generate: ✅ done
