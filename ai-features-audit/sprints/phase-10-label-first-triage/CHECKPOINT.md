# Phase 10 Checkpoint — Label-First Triage

| Field | Value |
|-------|-------|
| **Status** | PLANNED |
| **Last Task** | — |
| **Next Task** | Sprint 14 (T-1401) |
| **Tasks Done** | 0/29 |
| **SP Done** | 0/67 |

## Scope

Phase 10 is the complete Label-First Triage implementation — all backend pipeline refactoring, frontend UI, and production validation in a single phase with 5 implementation sprints.

### Sprint 14 (13 SP) — Label Taxonomy, Intent Schema & Onboarding Backend
- Schema: lane, intent, actionability fields on Email + EmailAnalysis
- Label metadata: category, suppressUrgency, mutuallyExclusiveWith, defaultLane
- Triage rules backend service + REST endpoints
- LLM prompt integration with triage rules, intent, actionability

### Sprint 15 (14 SP) — Label-First Resolution Engine & Lane Assignment
- Extract label resolution, score, lane assignment into dedicated services
- Enforce pipeline: LLM → labels (with precedence) → score (label-subordinate) → lane
- Contradiction handling and suppression propagation
- Follow-up precision tied to actionability field

### Sprint 16 (14 SP) — Onboarding UI & Label Prompt Authoring
- First-run triage onboarding stepper (3 steps: contacts, topics, alerts)
- Label prompt editor with aiPrompt, suppressUrgency, defaultLane
- Triage rules API hooks and query integration
- Settings integration and first-run detection banner

### Sprint 17 (14 SP) — Inbox Lanes, Reasoning UI & Workflow Views
- Lane tab bar in email list (All, Action Now, Waiting, VIP, Alerts, Review Later)
- Lane filter API + lane count badges
- Triage reasoning chip/tooltip per email
- Follow-up workflow indicators (TODO/WAITING badges)

### Sprint 18 (12 SP) — Learning, Overrides & Production Validation
- Triage overrides (always-important, always-review-later, etc.) with CRUD
- Override precedence in pipeline (before LLM labels)
- Feedback capture from user corrections (label/lane/urgency changes)
- Production validation script + live validation + scorecard

## Exit Criteria

- Triage pipeline follows: summary → intent → labels (with rules + precedence) → score → lane → follow-up
- Users can set up triage rules via onboarding
- Users can edit label AI prompts and metadata
- Email list shows lane tabs with counts
- Each email shows triage reasoning
- User corrections create overrides that improve future triage
- Production validation passes on Railway/Vercel

## Findings Addressed

| Finding | Sprint | Status |
|---------|--------|--------|
| LFT-A1: No onboarding rules | S14, S16 | PLANNED |
| LFT-A2: Label taxonomy thin | S14, S16 | PLANNED |
| LFT-B1: No summary-first pipeline | S15 | PLANNED |
| LFT-B2: No label precedence | S15 | PLANNED |
| LFT-C1: Score overrides semantics | S15 | PLANNED |
| LFT-C2: No inbox workflow views | S16, S17 | PLANNED |
| LFT-D1: No correlation | S18 | PLANNED |
| LFT-D2: No learning from corrections | S18 | PLANNED |
| LFT-E1: No production validation | S18 | PLANNED |
