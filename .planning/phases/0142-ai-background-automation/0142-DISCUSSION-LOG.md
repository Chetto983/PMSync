# Phase 142: AI Background Automation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 142-ai-background-automation
**Areas discussed:** Contact linking strategy, Deal linking strategy, Categorization approach, Category taxonomy, UI visibility
**Mode:** --auto (all areas auto-selected with recommended defaults)

---

## Contact Linking Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Exact email match auto-link + domain fallback + HITL for ambiguous | Mirrors ContactAccountLinkerService pattern; no LLM needed | ✓ |
| LLM-based sender intent analysis | Uses AI to determine if sender is a known contact; higher cost | |
| Manual-only linking | User manually links emails to contacts; no automation | |

**User's choice:** [auto] Exact match auto-link + domain fallback + HITL (recommended default)
**Notes:** Pattern already proven in ContactAccountLinkerService. No LLM cost for contact linking.

---

## Deal Linking Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Contact→Deal FK traversal | Use DealContact join table; link to most recent active deal | ✓ |
| LLM content analysis | Analyze email body for deal keywords/context; higher accuracy but expensive | |
| Subject line pattern matching | Regex-based deal reference detection (e.g., "RE: Deal #123") | |

**User's choice:** [auto] Contact→Deal FK traversal (recommended default)
**Notes:** LLM-based deal detection deferred to Phase 143. FK traversal is cheap and reliable for most cases.

---

## Categorization Approach

| Option | Description | Selected |
|--------|-------------|----------|
| New aiCategory field + extend LLM schema | Separate from aiIntent; extend existing triage prompt | ✓ |
| Extend aiIntent enum | Add support/newsletter to existing intent values | |
| Separate categorization LLM call | Dedicated prompt for categorization only | |

**User's choice:** [auto] New aiCategory field (recommended default)
**Notes:** Intent (what sender wants) and category (what type of email) are different axes — keeping them separate is cleaner.

---

## Category Taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| 4 categories: support, sales, internal, newsletter | Matches roadmap requirement exactly | ✓ |
| Extended: + billing, personal, system | More granular; overlaps with aiIntent | |
| Hierarchical categories | Parent/child category tree | |

**User's choice:** [auto] 4 categories per requirement (recommended default)
**Notes:** Kept minimal per roadmap spec. Existing aiIntent covers finer granularity.

---

## UI Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Category chip in email list + thread view; links in contextual sidebar | Builds on Phase 140 sidebar; minimal new UI | ✓ |
| Dedicated "Linked" panel in email view | New UI section for contact/deal links | |
| Category filter in email list header | Category as a filter dimension | |

**User's choice:** [auto] Category chip + contextual sidebar (recommended default)
**Notes:** Follows existing UI patterns. Category filter could be a future enhancement.

---

## Claude's Discretion

- Exact Prisma migration field names and index choices
- BullMQ vs direct event handler for contact/deal linking
- Whether to backfill existing emails or only process new ones
- CrmSuggestion confidence thresholds

## Deferred Ideas

- LLM-based deal detection from email content → Phase 143
- Split inbox by category → separate effort per REQUIREMENTS.md
- Backfill UI for historical re-processing → future enhancement
