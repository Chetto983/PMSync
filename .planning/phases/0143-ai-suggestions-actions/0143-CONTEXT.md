# Phase 143: AI Suggestions & Actions - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds intelligent action suggestions to the email contextual sidebar. When a user reads an email, the sidebar shows relevant suggested actions (create task, create deal, create ticket, link contact) that can be accepted or dismissed with one click. Dismissed suggestions do not reappear for that email.

This phase does NOT add new AI/LLM capabilities — it leverages existing triage data (aiCategory, aiLabels, aiIntent, aiActionability) and the existing CrmSuggestion infrastructure to generate and display suggestions.

</domain>

<decisions>
## Implementation Decisions

### Suggestion Generation
- **D-01:** Suggestions are generated rule-based using existing AI triage fields (aiCategory, aiLabels, aiIntent, aiActionability) — NO additional LLM calls
- **D-02:** Generation happens on-demand when the sidebar loads for an email (lazy), not during sync (eager)
- **D-03:** Backend endpoint generates and persists suggestions for an email if none exist, returns existing ones if already generated
- **D-04:** Suggestion rules map triage data to action types:
  - aiCategory=support + no linked ticket → suggest create_ticket
  - aiCategory=sales + no linked deal → suggest create_deal
  - aiActionability=action-required → suggest create_task
  - No linked contact (contactId null) → suggest link_contact
  - Email has linked contact with open deals → suggest update_deal (stage advancement)

### Suggestion Types
- **D-05:** Four suggestion types for email context: `create_task`, `create_deal`, `create_ticket`, `link_contact`
- **D-06:** These map to existing CrmSuggestionService types: `ticket` (create_ticket), `deal` (create_deal), `link` (link_contact). Add new type `task` for create_task.
- **D-07:** Each suggestion includes: type, title (human-readable action description), reasoning (why this is suggested), confidence (0-1), sourceEmailId

### Sidebar Integration
- **D-08:** New "Suggested Actions" section in EntityContextSidebar, positioned BELOW the "Active Tickets" section
- **D-09:** Section only renders when pending suggestions exist for the current email
- **D-10:** Reuse existing SuggestionCard component from `frontend/components/dashboard/crm-nba/SuggestionCard.tsx` — adapt props if needed but follow same visual pattern
- **D-11:** Accept button executes the action (creates entity via CrmSuggestionService.accept) and removes the card
- **D-12:** Dismiss button marks suggestion as dismissed and removes the card

### Dismiss Persistence
- **D-13:** Use existing CrmSuggestion model with status='dismissed' — dismissed suggestions filtered out on query
- **D-14:** Suggestions are scoped to sourceEmailId — dismissing for one email doesn't affect others
- **D-15:** No "undo dismiss" in this phase — dismissed is final

### Claude's Discretion
- Exact confidence thresholds for each suggestion rule
- Whether to show confidence score in the UI (impact bar) or hide it
- Ordering of suggestions within the section (by confidence, by type, or by relevance)
- Whether to batch-generate suggestions for all emails in a thread or just the viewed message

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CRM Suggestions System
- `backend/src/modules/crm/suggestion/services/crm-suggestion.service.ts` — Full CRUD with accept/dismiss/bulk, entity creation helpers, dedup logic
- `backend/src/modules/crm/suggestion/controllers/suggestion.controller.ts` — REST API endpoints
- `backend/src/modules/crm/suggestion/suggestion.module.ts` — Module wiring
- `frontend/lib/api/crm-suggestions.ts` — Frontend API client with types
- `frontend/hooks/queries/use-crm-suggestions.ts` — TanStack Query hooks
- `frontend/components/dashboard/crm-nba/SuggestionCard.tsx` — Reusable suggestion card UI

### Email Contextual Sidebar
- `frontend/components/common/EntityContextSidebar.tsx` — Target surface for suggestion display
- `frontend/lib/api/crm-context.ts` — CRM context API types
- `frontend/hooks/queries/use-crm-context.ts` — Context query hooks

### AI Triage Data (used for rule-based suggestion generation)
- `backend/src/modules/ai/services/email-analysis.service.ts` — Triage pipeline that produces aiCategory/aiLabels/aiIntent
- `backend/src/modules/ai/types/email-insights.types.ts` — UnifiedEmailAnalysis interface with category field
- `backend/src/modules/email-sync/handlers/email-auto-linker.handler.ts` — Auto-linking that sets contactId/dealId on emails

### Phase 142 Context (predecessor)
- `.planning/phases/0142-ai-background-automation/0142-RESEARCH.md` — Auto-linking patterns, CrmSuggestion usage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CrmSuggestionService.create()` — Creates suggestions with dedup (skips identical pending)
- `CrmSuggestionService.accept()` — Executes action based on type (creates account/deal/ticket/link)
- `CrmSuggestionService.dismiss()` — Marks as dismissed
- `SuggestionCard` — Full UI component with expand, impact bar, accept/dismiss buttons
- `crmSuggestionsApi` — Typed API client for list/accept/dismiss/bulk
- `useCrmSuggestions` hooks — TanStack Query integration
- `EntityContextSidebar` — Existing section pattern (ContactCard, Account, Deals, Tickets) to follow

### Established Patterns
- CrmSuggestion has: type, status (pending/accepted/dismissed), entityData (JSONB), sourceEmailId, confidence
- SuggestionCard expects: NBAAction type with actionType, title, reasoning, expectedImpact, status
- EntityContextSidebar uses: MUI List/ListItem pattern with section headers and dividers
- Query invalidation on mutation (accept/dismiss should invalidate suggestion query)

### Integration Points
- New backend endpoint: GET `/crm/suggestions/for-email/:emailId` — generates + returns suggestions
- EntityContextSidebar: new section after tickets section
- CRM context query may need to include suggestions, or a separate query

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing SuggestionCard + EntityContextSidebar patterns.

</specifics>

<deferred>
## Deferred Ideas

- LLM-based suggestion generation (analyzing email content for more nuanced suggestions) — Phase 143+ or separate effort
- "Undo dismiss" functionality — future UX enhancement
- Suggestion learning from user patterns (which suggestions they accept/dismiss) — future AI improvement
- Bulk suggestion management UI — already exists in dashboard, not needed in sidebar

</deferred>

---

*Phase: 0143-ai-suggestions-actions*
*Context gathered: 2026-04-02*
