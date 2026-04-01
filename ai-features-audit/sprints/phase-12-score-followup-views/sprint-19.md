# Sprint 19 — Follow-Up Precision & Inbox Workflow

| Campo | Valore |
|-------|--------|
| **Phase** | 12 — Score, Follow-up & Views |
| **Sprint** | 19 |
| **SP** | 8 |
| **Objective** | Tighten follow-up creation and reflect triage output in the inbox workflow |
| **Addresses** | LFT-C2 |

---

## Sprint Backlog

### T-1901: Audit follow-up creation rules [2 SP]
- [ ] Read `backend/src/modules/ai/services/triage-action.service.ts`
- [ ] Document current creation triggers and duplication risks

### T-1902: Define follow-up precision rules [2 SP]
- [ ] Specify when to create:
  - `TODO`
  - `WAITING_FOR`
  - `NONE`
- [ ] Add exclusion rules for FYI categories

### T-1903: Define due-date selection logic [1 SP]
- [ ] Decide priority of deadline, follow-up timing, and default fallback timing
- [ ] Add guardrails for low-signal emails

### T-1904: Define inbox workflow surfaces [2 SP]
- [ ] Specify where lanes, reasons, and follow-up states appear in UI
- [ ] Keep the view actionable and compact

### T-1905: Write false-positive follow-up test set [1 SP]
- [ ] Create real cases that must not create follow-ups

---

## Dependencies

- Sprint 18 complete

## Risks

1. Overly aggressive follow-up logic creates noisy workflow debt.
2. UI workflow can become cluttered if score, labels, lanes, and follow-ups all compete visually.

## Definition of Done

- [ ] follow-up creation rules are explicit
- [ ] TODO and WAITING are separated
- [ ] due-date logic is documented
- [ ] inbox workflow surfaces are specified
- [ ] false-positive test set exists
