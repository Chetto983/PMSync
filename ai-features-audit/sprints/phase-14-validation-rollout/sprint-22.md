# Sprint 22 — Production Validation & Rollout

| Campo | Valore |
|-------|--------|
| **Phase** | 14 — Validation & Rollout |
| **Sprint** | 22 |
| **SP** | 6 |
| **Objective** | Validate the full label-first triage system on real tenant data and close the rollout package |
| **Addresses** | LFT-E1 |

---

## Sprint Backlog

### T-2201: Define production scorecard dimensions [1 SP]
- [ ] Lock the metrics:
  - summary quality
  - label fit
  - score fit
  - follow-up precision
  - lane consistency
  - briefing relevance

### T-2202: Extend live validation scripts if needed [2 SP]
- [ ] Verify `scripts/validate-ai-features-production.mjs` covers all final dimensions
- [ ] Add missing label-first checks if gaps remain

### T-2203: Run live tenant validation [1 SP]
- [ ] Validate with real inbox data through Vercel / Railway
- [ ] Capture evidence for false positives and corrected edge cases

### T-2204: Update documentation and scorecard [1 SP]
- [ ] Update production scorecard and checkpoint docs
- [ ] Record residual risks and follow-up items

### T-2205: Define rollout and regression gate [1 SP]
- [ ] Document what must remain green before shipping further triage changes

---

## Dependencies

- S14-S21 complete

## Risks

1. Synthetic tests may pass while tenant data still reveals label-fit issues.
2. Rollout can regress if score and follow-up precision are not tracked together.

## Definition of Done

- [ ] scorecard dimensions are fixed
- [ ] live validation is executed on real data
- [ ] evidence is recorded
- [ ] rollout gate is documented
