# Professional Email Triage Roadmap

## Goal

Turn PMSync email triage from a single `aiPriority` score into a professional operating system for inbox work:

- identify what needs action now
- distinguish waiting vs doing
- separate system noise from human conversations
- surface due follow-ups before they become stale
- keep briefings useful even when an AI endpoint degrades

## Product Principles

1. Triage must drive workflow, not just classification.
2. A professional inbox needs lanes, not only tags.
3. Follow-ups are part of triage, not a separate afterthought.
4. System alerts and newsletters must not pollute customer/action views.
5. Every AI summary needs a resilient fallback built from real facts.

## Current Gaps

- The dashboard triage widget is still a flat list ordered by `aiPriority`.
- Follow-up state exists, but the main triage view does not distinguish `TODO` vs `WAITING_FOR`.
- Daily briefing can degrade to a generic fallback instead of switching to a structured factual summary.
- System alerts, customer requests, and low-signal messages are visually too similar.
- The current model is strong at scoring, weaker at operational routing.

## Target Operating Model

PMSync should expose four primary inbox lanes:

1. `Action now`
2. `Waiting on reply`
3. `System alerts`
4. `Review later`

Manual starred/important messages stay separate as a user override lane.

## Delivery Plan

### Phase 1 — Dashboard Triage Lanes

Ship a lane-based triage model on top of the existing AI data:

- derive a lane from `aiPriority`, `aiPriorityReason`, `aiSentiment`, subject/sender heuristics, and follow-up state
- merge pending follow-ups into the AI triage widget
- show lane sections instead of one flat priority list
- keep starred/important mail as manual override

Success metric:

- a user can distinguish `do now` vs `wait` vs `noise` in one glance

### Phase 2 — Resilient Briefing

Make briefing operationally reliable:

- if AI briefing is healthy, show full AI briefing
- if AI briefing degrades, generate a factual fallback from triaged emails + follow-ups + deadlines
- use lane counts and real pending work to build highlights

Success metric:

- the dashboard never falls back to a useless generic summary

### Phase 3 — Triage Learning

Add lightweight preference learning:

- learn preferred senders, projects, companies, and alert sources
- allow natural-language priority rules such as:
  - "If it's from a customer complaint, raise it"
  - "GitHub and Vercel notifications go to system alerts unless blocked release"
  - "Messages from Marco are always action now"

Success metric:

- users can tune triage without building brittle manual filters

### Phase 4 — Follow-Up OS

Make follow-ups first-class workflow objects:

- separate `TODO` and `WAITING_FOR` everywhere
- add urgency bands and overdue risk
- surface due today / overdue inside the triage experience
- offer one-click actions: resolve, snooze, draft reply, open thread

Success metric:

- follow-up management no longer requires leaving the triage workflow

### Phase 5 — Team / Shared Inbox Mode

For collaborative tenants, add:

- assignment and ownership
- SLA / time-goal overlays
- at-risk queue
- escalation rules

Success metric:

- PMSync can support solo executive workflow and shared operational inboxes

## Implemented In This Slice

This implementation round delivers the Phase 1 foundation plus part of Phase 2:

- triage lane derivation
- follow-up-aware AI triage widget
- dashboard behavior that understands `TODO` vs `WAITING_FOR`
- briefing fallback built from factual triage/follow-up signals when AI briefing is weak

## Next Recommended Slice

After this merge, the next highest-value step is:

- backend-supported triage preferences and lane overrides per user

