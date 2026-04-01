# Sprint 15 — First-Run Setup & Label Prompt UX

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Triage Onboarding |
| **Sprint** | 15 |
| **SP** | 7 |
| **Objective** | Design the first-run UX and label prompt authoring flow without exposing extra product complexity |
| **Addresses** | LFT-A1, LFT-A2 |

---

## Sprint Backlog

### T-1501: Design first-run triage setup flow [2 SP]
- [ ] Define the entry point in UI
- [ ] Keep the flow limited to a few essential questions
- [ ] Ensure the user still perceives only `Mail`, `Calendario`, `Contatti`, `Task`

### T-1502: Define label prompt authoring UX [2 SP]
- [ ] Specify how users create or edit `aiPrompt`
- [ ] Add guidance for good prompts:
  - when to include
  - when not to include
  - examples with phrases, not single keywords
- [ ] Define validation and error states

### T-1503: Define preview / explainability UX [1 SP]
- [ ] Specify how the user previews what a label rule means
- [ ] Add sample “this will catch…” and “this will not catch…” guidance

### T-1504: Define onboarding persistence and re-entry points [1 SP]
- [ ] Document where the setup can be revisited later
- [ ] Ensure the flow is editable from settings or labels UI

### T-1505: Write acceptance criteria for the onboarding slice [1 SP]
- [ ] Document success criteria for implementation and later validation
- [ ] Define the real-data tests needed after build

---

## Dependencies

- Sprint 14 complete

## Risks

1. Label prompt UX can become too technical if it mirrors backend fields too directly.
2. First-run setup can become too long if it tries to configure every edge case.

## Definition of Done

- [ ] first-run setup flow is documented end-to-end
- [ ] label prompt UX has guidance and validation rules
- [ ] re-entry points are defined
- [ ] acceptance criteria for implementation are written
