# Sprint 17 — Label Resolution, Suppression & Lanes

| Campo | Valore |
|-------|--------|
| **Phase** | 11 — Label-First Backend |
| **Sprint** | 17 |
| **SP** | 8 |
| **Objective** | Enforce label-first resolution, contradiction handling, passive suppression, and lane assignment |
| **Addresses** | LFT-B2, LFT-C1 |

---

## Sprint Backlog

### T-1701: Define label precedence [2 SP]
- [ ] Document the application order:
  - onboarding rules
  - user labels with `aiPrompt`
  - default labels
  - fallback heuristics
- [ ] Define what happens when multiple rules match

### T-1702: Define contradiction handling [2 SP]
- [ ] List invalid or conflicting label pairs
- [ ] Add tie-break rules for `Important` vs `Updates`, `Follow-up` vs `Promotions`, etc.

### T-1703: Define passive suppression layer [2 SP]
- [ ] Specify low-urgency handling for:
  - newsletters
  - release notes
  - routine alerts
  - informational digests
- [ ] Allow override when deadline or explicit action is present

### T-1704: Define lane assignment contract [1 SP]
- [ ] Map label and intent combinations to:
  - `action-now`
  - `waiting-on-reply`
  - `customer-vip`
  - `system-alerts`
  - `review-later`

### T-1705: Write test matrix for label-first scenarios [1 SP]
- [ ] Add canonical scenarios and expected outcomes

---

## Dependencies

- Sprint 16 complete

## Risks

1. Lane logic can drift away from PMSync simplicity if too many special cases are introduced.
2. Suppression logic may accidentally hide truly urgent alerts if deadline/action exceptions are weak.

## Definition of Done

- [ ] label precedence is fixed
- [ ] contradictions are handled explicitly
- [ ] passive suppression rules are documented
- [ ] lane contract is defined
- [ ] scenario matrix exists
