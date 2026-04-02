# Phase 143: AI Suggestions & Actions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 0143-ai-suggestions-actions
**Areas discussed:** Suggestion generation trigger, Suggestion types, Sidebar integration, Dismiss persistence
**Mode:** --auto (all decisions auto-selected)

---

## Suggestion Generation Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Rule-based on email view | Use existing triage data (aiCategory, aiLabels, aiIntent), no LLM | yes |
| LLM on email view | Generate suggestions via LLM when user opens email | |
| LLM on sync (eager) | Generate suggestions during email sync pipeline | |

**User's choice:** [auto] Rule-based on email view (recommended default)
**Notes:** Avoids extra LLM calls and latency. All needed data already computed during triage.

---

## Suggestion Types

| Option | Description | Selected |
|--------|-------------|----------|
| create_task, create_deal, create_ticket, link_contact | Four types covering AI-04 examples | yes |
| create_task only | Minimal scope | |
| All above + update_deal_stage | Extended set | |

**User's choice:** [auto] Four types (recommended default)
**Notes:** Maps cleanly to existing CrmSuggestionService types with one addition (task).

---

## Sidebar Integration

| Option | Description | Selected |
|--------|-------------|----------|
| New section below tickets | Follows existing EntityContextSidebar section pattern | yes |
| Collapsible panel at top | High visibility but breaks flow | |
| Separate sidebar tab | Isolates suggestions from context | |

**User's choice:** [auto] New section below tickets (recommended default)
**Notes:** Consistent with existing sidebar architecture.

---

## Dismiss Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| CrmSuggestion.status=dismissed | Use existing model, filter by sourceEmailId | yes |
| LocalStorage | Client-side only, no persistence across devices | |
| Separate dismissed_suggestions table | Over-engineered | |

**User's choice:** [auto] Existing CrmSuggestion model (recommended default)
**Notes:** Infrastructure already exists, dedup logic prevents re-creation.

---

## Claude's Discretion

- Confidence thresholds for suggestion rules
- Whether to show impact bar in sidebar context
- Suggestion ordering within the section
- Thread-level vs message-level suggestion generation

## Deferred Ideas

- LLM-based suggestion generation
- Undo dismiss
- Suggestion learning from user patterns
