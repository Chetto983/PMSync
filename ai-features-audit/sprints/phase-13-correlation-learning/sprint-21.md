# Sprint 21 — Learning, Overrides & Feedback Loop

| Campo | Valore |
|-------|--------|
| **Phase** | 13 — Correlation & Learning |
| **Sprint** | 21 |
| **SP** | 6 |
| **Objective** | Add durable user corrections, overrides, and safe preference learning to the triage system |
| **Addresses** | LFT-D2 |

---

## Sprint Backlog

### T-2101: Define override model [2 SP]
- [ ] Specify persistent overrides such as:
  - always important
  - always system alerts
  - always review later
  - never follow-up
- [ ] Define precedence between overrides and generic heuristics

### T-2102: Define feedback capture events [1 SP]
- [ ] List which user actions teach the system:
  - label correction
  - lane correction
  - urgency correction
  - follow-up resolve / remove

### T-2103: Define safe learning boundaries [1 SP]
- [ ] Keep privacy and consent considerations explicit
- [ ] Avoid unbounded behavioral inference

### T-2104: Define explainability for learned behavior [1 SP]
- [ ] Document how PMSync should explain “why it learned this”

### T-2105: Write feedback-loop validation plan [1 SP]
- [ ] Define how to prove that repeated user corrections improve future triage

---

## Dependencies

- Sprint 20 complete

## Risks

1. Learned behavior can become opaque if overrides and inference are mixed together.
2. Feedback loops may reinforce wrong behavior if not bounded and auditable.

## Definition of Done

- [ ] override model is written
- [ ] feedback events are defined
- [ ] learning boundaries are documented
- [ ] explainability and validation plans exist
