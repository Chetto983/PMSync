# Sprint 20 — Correlation, Context & CRM Hooks

| Campo | Valore |
|-------|--------|
| **Phase** | 13 — Correlation & Learning |
| **Sprint** | 20 |
| **SP** | 6 |
| **Objective** | Attach triage outputs to contacts, reminders, tasks, and CRM context so the PMS model stays continuous |
| **Addresses** | LFT-D1 |

---

## Sprint Backlog

### T-2001: Define correlation hints from triage [2 SP]
- [ ] Specify contact, company, thread, context label, and project signals
- [ ] Mark strong vs probable vs weak correlation

### T-2002: Define task and reminder attachment rules [1 SP]
- [ ] Document when a triaged email should connect to an existing reminder or task
- [ ] Prevent duplicate object creation

### T-2003: Define CRM hook points [1 SP]
- [ ] Identify where pipeline, customer, or opportunity context should be attached
- [ ] Keep CRM linkage opt-in and explainable

### T-2004: Define conflict and duplicate handling [1 SP]
- [ ] Specify what happens when multiple contacts or contexts match

### T-2005: Write correlation test plan [1 SP]
- [ ] Create real scenarios for strong, probable, and weak matches

---

## Dependencies

- Sprint 19 complete

## Risks

1. Over-eager correlation can create incorrect links and user distrust.
2. Duplicate prevention is fragile if correlation hints are underspecified.

## Definition of Done

- [ ] correlation hints are defined
- [ ] task/reminder/CRM attachment rules are documented
- [ ] duplicate handling is specified
- [ ] correlation test plan exists
