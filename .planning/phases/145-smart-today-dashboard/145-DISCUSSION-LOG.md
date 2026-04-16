# Phase 145: Smart Today Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 145-smart-today-dashboard
**Areas discussed:** Dashboard redesign scope, AI curation approach, Unified feed layout, Navigation & actions

---

## Dashboard Redesign Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full replacement (Recommended) | Remove DashboardContainer + all 9 widgets. Today view IS the home page. | ✓ |
| Today section + widgets below | Add Today priority feed at top, keep existing widgets below. | |
| Tab switch | Two tabs: 'Today' and 'Widgets'. Default to Today. | |

**User's choice:** Full replacement
**Notes:** Clean break — no legacy widget grid.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as header summary | 2-3 line AI-generated greeting/summary at top, feed below. | |
| Drop it — feed is enough | No separate AI summary text. | |
| You decide | Claude's discretion. | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion on whether to include a brief AI summary/greeting.

| Option | Description | Selected |
|--------|-------------|----------|
| No customization needed (Recommended) | Opinionated Today view, no toggle/reorder. | |
| Filter toggles | Let users toggle item types (tasks, emails, deals, events). | |
| You decide | Claude's discretion. | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion on whether any filtering makes sense.

---

## AI Curation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| New backend endpoint (Recommended) | `GET /dashboard/today` queries all sources, scores/ranks, returns prioritized list. | ✓ |
| Frontend aggregation | Frontend calls existing APIs, sorts client-side with deterministic rules. | |
| Hybrid: deterministic + AI summary | Frontend aggregates, separate AI call for greeting text only. | |

**User's choice:** New backend endpoint
**Notes:** Single endpoint, clean contract.

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic rules (Recommended) | Score items with rules (overdue=urgent, due today=today). AI for greeting only. | |
| Full LLM scoring | Send all items to AI model for importance ranking. Adds latency. | |
| You decide | Claude's discretion. | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion. Deterministic rules recommended for speed.

| Option | Description | Selected |
|--------|-------------|----------|
| Unified tasks (5 sources) | Follow-ups, reminders, NBA actions, tickets, manual tasks. | ✓ |
| Emails needing reply | Emails where user is expected to reply but hasn't. | ✓ |
| Deal alerts | Deals stuck in stage, upcoming close dates. | ✓ |
| Today's calendar events | Meetings and events from calendar module. | ✓ |

**User's choice:** All four data sources
**Notes:** Full coverage matching NAV-05 success criteria.

---

## Unified Feed Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single priority list (Recommended) | One flat list sorted by urgency tier (Urgent → Today → FYI). Mixed types interleave. | ✓ |
| Grouped by type | Four sections: Tasks, Emails, Deals, Events. Each sorted by urgency. | |
| Cards grid | Each item as a card in 2-column grid. | |

**User's choice:** Single priority list
**Notes:** Like Superhuman's "Important" view.

| Option | Description | Selected |
|--------|-------------|----------|
| Compact row (Recommended) | Type icon + title + subtitle + time badge. ~48px height. | ✓ |
| Rich card rows | Type icon + title + 2-line subtitle + metadata chips. ~80px height. | |
| You decide | Claude's discretion on density. | |

**User's choice:** Compact row
**Notes:** Maximizes visible items, hover/click for details.

| Option | Description | Selected |
|--------|-------------|----------|
| Celebratory empty state (Recommended) | "You're all caught up" with positive reinforcement. | ✓ |
| Minimal text | Simple "Nothing needs your attention today" text. | |
| You decide | Claude's discretion. | |

**User's choice:** Celebratory empty state
**Notes:** Positive reinforcement when inbox zero achieved.

---

## Navigation & Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate to entity page (Recommended) | Click email → thread page, task → tasks page, deal → deal page, event → calendar. | ✓ |
| Inline detail panel | Click opens right-side detail panel, stay on dashboard. | |
| You decide | Claude's discretion. | |

**User's choice:** Navigate to entity page
**Notes:** Standard navigation, leave the Today view on click.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — complete + dismiss (Recommended) | Checkmark to complete, X to dismiss, snooze menu. | ✓ |
| No inline actions | Feed items read-only, navigate to act. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes — complete + dismiss
**Notes:** Inline checkmark (tasks), dismiss X (all), snooze menu (1h, tomorrow, next week).

| Option | Description | Selected |
|--------|-------------|----------|
| Animate out immediately (Recommended) | Item slides/fades out. Optimistic update. Undo toast. | ✓ |
| Strikethrough + stay | Greyed out with strikethrough, stays until refresh. | |
| You decide | Claude's discretion. | |

**User's choice:** Animate out immediately
**Notes:** Optimistic update with brief undo toast.

---

## Claude's Discretion

- AI summary/greeting header: whether to include a 2-3 line AI greeting above the feed
- Widget customization replacement: whether any type-based filter toggles are needed
- AI scoring approach: deterministic rules vs LLM scoring (deterministic recommended)

## Deferred Ideas

- Real-time updates via WebSocket/SSE
- Mobile swipe-to-dismiss/snooze gestures
- Manual drag-to-reorder within tiers
- User-defined priority overrides
