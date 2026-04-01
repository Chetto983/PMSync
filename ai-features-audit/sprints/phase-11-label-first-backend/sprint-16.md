# Sprint 16 — Summary & Intent Extraction Contract

| Campo | Valore |
|-------|--------|
| **Phase** | 11 — Label-First Backend |
| **Sprint** | 16 |
| **SP** | 7 |
| **Objective** | Formalize the structured triage contract before label and score evaluation |
| **Addresses** | LFT-B1 |

---

## Sprint Backlog

### T-1601: Audit current unified analysis contract [1 SP]
- [ ] Read `backend/src/modules/ai/services/email-analysis.service.ts`
- [ ] Enumerate current fields and identify missing intent/actionability outputs

### T-1602: Define normalized triage payload [2 SP]
- [ ] Specify fields for:
  - summary
  - intent
  - actionability
  - deadline
  - waiting state
  - labels
  - lane
  - score / urgency
  - follow-up type
- [ ] Keep the contract compatible with current downstream consumers

### T-1603: Add summary-first extraction rules [2 SP]
- [ ] Document prompt / parsing rules so summary and intent are produced before score tuning
- [ ] Define when system-generated or empty-content emails should short-circuit

### T-1604: Define actionability semantics [1 SP]
- [ ] Distinguish `none`, `todo`, `waiting`
- [ ] Define edge cases such as alerts, newsletters, receipts, and status updates

### T-1605: Write regression test plan for the contract [1 SP]
- [ ] Enumerate the canonical email classes the new contract must pass

---

## Dependencies

- Phase 10 outputs available

## Risks

1. Expanding the contract too much can break existing dashboard and API consumers.
2. Intent labels can become vague if not defined against real email classes.

## Definition of Done

- [ ] normalized triage contract is documented
- [ ] actionability semantics are explicit
- [ ] summary-first rule is locked
- [ ] regression test plan exists
