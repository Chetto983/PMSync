# Sprint 14.1 — AI Tool & LLM Integration Completeness (Sub-Sprint)

> **Goal:** Complete the AI chat integration for all Phase 2 intelligence features.
> Backend services and APIs are 100% done, but only 5/16 needed AI tools exist,
> the system prompt has zero CRM guidance, and no CRM tool renderers are mapped.
>
> **Priority:** CRITICAL — Phase 2 cannot close without this.

## Stats

| Parametro | Valore |
|---|---|
| SP Stimati | 14 |
| Dipendenze | Sprint 14 (all backend services exist) |
| Rischio | Basso (wiring existing services, no new business logic) |

## Current State (Audit 2026-03-30)

| Feature | Backend | API | AI Tool | System Prompt | Renderer |
|---------|:---:|:---:|:---:|:---:|:---:|
| Deal Management | Done | Done | 4/4 | Missing | 0/4 |
| Lead Scoring | Done | Done | **0/2** | Missing | N/A |
| Forecasting | Done | Done | **0/2** | Missing | N/A |
| Churn | Done | Done | **0/3** | Missing | N/A |
| NBA | Done | Done | 1/1 | Missing | 0/1 |
| Governance | Done | Done | **0/3** | Missing | N/A |
| **TOTAL** | 6/6 | 6/6 | **5/16** | 0/6 | **0/5** |

## Backlog

### AI Chat Tools (8 SP)

- [x] T-1411 — `get_lead_score` tool: fetch lead score + breakdown for a contact — 1 SP — ✅ DONE
  - Schema: `{ contactId: string }`
  - Calls: `LeadScoringService` or Prisma query on LeadFeatureStore
  - Returns: score, tier (hot/warm/cold), top factors, last computed date

- [x] T-1412 — `list_top_leads` tool: list contacts ranked by lead score — 1 SP — ✅ DONE
  - Schema: `{ limit?: number, minScore?: number }`
  - Calls: Prisma query on LeadFeatureStore ordered by totalScore DESC
  - Returns: array of { contactName, email, score, tier }

- [x] T-1413 — `get_revenue_forecast` tool: fetch quarterly forecast — 1 SP — ✅ DONE
  - Schema: `{ pipelineId?: string, period?: 'monthly' | 'quarterly' }`
  - Calls: `ForecastService.generateForecast()`
  - Returns: periods with predicted value, confidence low/high, MAPE

- [x] T-1414 — `get_churn_risk` tool: get churn assessment for a contact/account — 1 SP — ✅ DONE
  - Schema: `{ contactId?: string, accountId?: string }`
  - Calls: `ChurnController` GET endpoints
  - Returns: risk level, probability, contributing signals, last assessed

- [x] T-1415 — `list_churn_at_risk` tool: list contacts/accounts at churn risk — 1 SP — ✅ DONE
  - Schema: `{ level?: 'high' | 'medium' | 'low', limit?: number }`
  - Calls: `ChurnController.getAtRisk()`
  - Returns: array of { name, riskLevel, probability, topSignal }

- [x] T-1416 — `get_ai_costs` tool: show AI cost breakdown — 1 SP — ✅ DONE
  - Schema: `{ range?: '7d' | '30d' | '90d' }`
  - Calls: `GovernanceService.getCostBreakdown()`
  - Returns: per-feature costs, total, token counts

- [x] T-1417 — `get_model_performance` tool: fetch model accuracy metrics — 1 SP — ✅ DONE
  - Schema: `{ modelType?: string }`
  - Calls: `GovernanceService.getAccuracyMetrics()` + `ModelRetrainService.getModelRegistry()`
  - Returns: per-model accuracy, MAPE, last trained, status

- [x] T-1418 — Register all new tools in ToolRegistry with governance metadata — 1 SP — ✅ DONE
  - All tools registered in `onModuleInit()` with domain, riskLevel, requiresApproval, inputSchema
  - All tools added to `AiChatService.createToolSet()` spread

### System Prompt Update (2 SP)

- [x] T-1419 — Add CRM section to system prompt decision tree — 2 SP — ✅ DONE
  - Add "CRM & Intelligence" section to Tool Selection Decision Tree
  - Add tool guidance for: leads, deals, forecast, churn, NBA, governance
  - Add Multi-Step Workflow Examples for CRM:
    - "Who are my best leads?" → `list_top_leads`
    - "Show forecast for Q2" → `get_revenue_forecast`
    - "Who's about to churn?" → `list_churn_at_risk`
    - "What should we do with deal X?" → `get_next_best_action`
    - "Move deal to Proposal stage" → `get_deals_by_pipeline` → `move_deal_stage`
    - "How much are we spending on AI?" → `get_ai_costs`
    - "How accurate is lead scoring?" → `get_model_performance`
  - Add Output Formatting section for CRM data types

### Frontend Tool Renderers (3 SP)

- [x] T-1420 — `DealsToolUI.tsx` renderer for deal-related tools — 1 SP — ✅ DONE
  - Handles: `get_deals_by_pipeline` (table of deals), `move_deal_stage` (confirmation card), `get_deal_timeline` (timeline)
  - Register in `TOOL_RENDERERS` map

- [x] T-1421 — `CrmIntelligenceToolUI.tsx` renderer for intelligence tools — 1 SP — ✅ DONE
  - Handles: `get_lead_score` (gauge + factors), `list_top_leads` (ranked list), `get_churn_risk` (risk card), `list_churn_at_risk` (risk table), `get_revenue_forecast` (mini chart)
  - Register in `TOOL_RENDERERS` map

- [x] T-1422 — `GovernanceToolUI.tsx` renderer for governance tools — 1 SP — ✅ DONE
  - Handles: `get_ai_costs` (cost breakdown card), `get_model_performance` (model status cards)
  - Register in `TOOL_RENDERERS` map

### Validation (1 SP)

- [ ] T-1423 — E2E validation: test each new tool via AI chat on production — 1 SP
  - Open AI chat → ask CRM questions → verify tools are invoked
  - Verify renderers display correctly (not just fallback JSON)
  - Verify system prompt guides LLM to use correct tools
  - Screenshot evidence for each tool

## Acceptance Criteria

- [ ] All 16 CRM AI tools registered and callable via AI chat
- [ ] System prompt guides LLM to use CRM tools for relevant queries
- [ ] Custom renderers for deal, intelligence, and governance tool outputs
- [ ] Zero regressions on existing email/calendar/contact tools
- [ ] E2E validated: user asks CRM question → tool called → rich UI rendered

## Dependencies

- `LeadScoringService` (S09) — for `get_lead_score`, `list_top_leads`
- `ForecastService` (S11) — for `get_revenue_forecast`
- `ChurnAssessmentService` / `ChurnController` (S12) — for `get_churn_risk`, `list_churn_at_risk`
- `NBAService` (S13) — already wired via `get_next_best_action`
- `GovernanceService` (S14) — for `get_ai_costs`, `get_model_performance`

## Notes

- All tools use existing backend services — no new business logic needed
- Tools should follow the pattern in `crm-tools.service.ts` (schemas + tool() + truncateToolResult)
- Keep `crm-tools.service.ts` under 500 lines — split into `crm-intelligence-tools.service.ts` if needed
- Renderers follow pattern in `frontend/src/components/chat/tool-uis/`
- All renderers must handle loading, error, and empty states
