# Phase 11 Checkpoint — Label-First Backend

| Field | Value |
|-------|-------|
| **Status** | PLANNED |
| **Last Task** | - |
| **Next Task** | Sprint 16 (T-1601) |
| **Tasks Done** | 0/10 |
| **SP Done** | 0/15 |

## Scope

Phase 11 rewrites the backend contract so triage behavior becomes deterministic:

- summary and intent extraction first
- label resolution before score
- passive class suppression
- lane assignment as part of the result

## Sprints

- `Sprint 16` — Summary & Intent Extraction Contract
- `Sprint 17` — Label Resolution, Suppression & Lanes

## Exit Criteria

- backend triage follows one normalized pipeline
- contradictory labels are handled explicitly
- passive traffic is downweighted before urgency is computed
