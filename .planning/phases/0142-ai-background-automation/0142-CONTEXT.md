# Phase 142: AI Background Automation - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatically link incoming emails to matching contacts and deals, and auto-categorize emails by type (support, sales, internal, newsletter) — all in the background without user intervention. Builds on existing email sync pipeline (EmailIndexedEvent) and AI triage system (EmailAnalysisService). No new pages — extends existing email list/thread views and contextual sidebar.

</domain>

<decisions>
## Implementation Decisions

### Contact Auto-Linking (AI-01)
- **D-01:** Exact sender email match against Contact.emails JSONB → auto-link (confidence 1.0), no LLM needed
- **D-02:** Domain match with single contact → auto-link (confidence 0.9+)
- **D-03:** Multiple contacts matching → create CrmSuggestion for HITL review (mirrors ContactAccountLinkerService pattern)
- **D-04:** Add `contactId` + `contactTenantId` composite FK to Email model (same pattern as Ticket.contactId)
- **D-05:** Run contact linking on every EmailIndexedEvent (cheap — pure DB lookup, no LLM)

### Deal Auto-Linking (AI-02)
- **D-06:** Primary signal: contact→deal association via DealContact join table. If sender's contact has open deal(s), link to most recent active deal
- **D-07:** Multiple open deals for same contact → create CrmSuggestion for HITL (avoid wrong association)
- **D-08:** Add `dealId` + `dealTenantId` composite FK to Email model
- **D-09:** Run deal linking after contact linking (depends on resolved contactId)
- **D-10:** No LLM for deal linking — use contact→deal FK traversal only. LLM-based deal detection is scope creep for Phase 143

### Email Categorization (AI-03)
- **D-11:** Add `aiCategory` field to Email model (separate from existing `aiIntent` — different axes)
- **D-12:** Categories: `support`, `sales`, `internal`, `newsletter` — exactly 4 per requirement
- **D-13:** Extend existing EmailAnalysisService LLM prompt schema to include `category` in JSON output
- **D-14:** Category assigned during existing triage flow (not on every sync — piggybacked on AI triage pipeline to avoid LLM cost explosion)
- **D-15:** Categorization is part of triage, NOT a separate background job

### Pipeline Architecture
- **D-16:** Contact linking hooks into EmailIndexedEvent (fires after sync) — same pattern as EmailToTicketHandler
- **D-17:** Deal linking runs as a chained step after contact linking within the same event handler
- **D-18:** Category assignment runs during existing EmailTriageService.triageEmails() flow — no separate job
- **D-19:** New event EmailAutoLinkedEvent emitted after successful link creation (for CRM timeline updates)

### UI Visibility
- **D-20:** Category shown as colored chip/badge in ThreadListItem (email list) and ExpandedMessage (thread view)
- **D-21:** Contact/deal links visible in existing Phase 140 contextual sidebar (no new sidebar — just data availability)
- **D-22:** Category color mapping: support=orange, sales=green, internal=blue, newsletter=gray (semantic CRM colors from theme)

### Claude's Discretion
- Exact Prisma migration field names and index choices
- BullMQ vs direct event handler for contact/deal linking (either is fine — pick based on latency vs reliability tradeoff)
- Whether to backfill existing emails or only process new ones going forward
- CrmSuggestion confidence thresholds (exact numbers)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Email Sync Pipeline
- `backend/src/modules/email-sync/services/sync-message-processor.service.ts` — Where EmailIndexedEvent is emitted; hook point for auto-linking
- `backend/src/modules/email-sync/services/base-email-sync.service.ts` — Email sync orchestration

### AI Triage System
- `backend/src/modules/ai/services/email-triage.service.ts` — Main triage orchestrator; where category assignment will be added
- `backend/src/modules/ai/services/email-analysis.service.ts` — Unified LLM analysis; extend JSON schema for `category` output
- `backend/src/modules/ai/services/label-resolution.service.ts` — Label cascade pipeline (reference for resolution patterns)

### CRM Suggestion System
- `backend/src/modules/crm/suggestion/services/contact-account-linker.service.ts` — Pattern for confidence-based auto-linking vs HITL suggestions
- `backend/src/modules/crm/suggestion/` — CrmSuggestion model, services, and controller

### Existing Linking Patterns
- `backend/src/modules/email-to-ticket.handler.ts` — EmailIndexedEvent handler pattern; contact lookup by sender email
- `backend/src/modules/crm/deal/` — Deal model, DealContact join table

### Frontend
- `frontend/components/email/list/ThreadListItem.tsx` — Where category chip will be added
- `frontend/components/email/thread/ExpandedMessage.tsx` — Where category chip will be added in thread view
- `frontend/components/email/CrmContextSidebar.tsx` — Existing contextual sidebar (Phase 140) that will show linked contact/deal

### Schema
- `backend/prisma/schema.prisma` — Email, Contact, CrmDeal, CrmSuggestion models

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **EmailToTicketHandler**: Event handler pattern for EmailIndexedEvent — reuse for auto-linking handler
- **ContactAccountLinkerService**: Confidence-based linking with auto-accept vs CrmSuggestion for HITL — reuse pattern for email→contact linking
- **EmailAnalysisService.analyzeEmailUnified()**: LLM prompt + JSON parsing — extend schema for `category` field
- **CrmSuggestion model + services**: Full HITL pipeline for pending/accepted/dismissed suggestions
- **Contact.emails JSONB**: Already stores contact email addresses as `[{ value, type }]` array

### Established Patterns
- **Composite FK pattern**: (id, tenantId) pairs for multi-tenant isolation — use for Email.contactId, Email.dealId
- **Event-driven pipeline**: EmailIndexedEvent + @OnEvent handlers — use for auto-linking
- **Redis distributed semaphore**: Max concurrent LLM operations — already in triage; categorization piggybacks
- **Fire-and-forget with logging**: EntityExtractionService pattern for non-critical async operations

### Integration Points
- **EmailIndexedEvent**: Emitted by SyncMessageProcessorService after sync — hook point for new auto-linking handler
- **EmailTriageService.triageEmails()**: Extend to persist `aiCategory` alongside existing aiPriority/aiSentiment/aiLabels
- **CrmSuggestionTriggerService.processTriagedEmail()**: Already detects account/deal/ticket — extend or complement for contact/deal linking
- **DealContact join table**: Primary signal for email→deal association (contact→deal FK traversal)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

- **LLM-based deal detection from email content**: Using AI to analyze email body and match to deals by keyword/context — belongs in Phase 143 (AI Suggestions & Actions)
- **Split inbox by category**: Using aiCategory to create Superhuman-style split inbox tabs — noted in REQUIREMENTS.md as separate effort from AI-03
- **Backfill UI**: Admin interface to trigger re-linking/re-categorization of historical emails — future enhancement

</deferred>

---

*Phase: 142-ai-background-automation*
*Context gathered: 2026-04-02*
