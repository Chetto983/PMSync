# Sprint 18 — Score, Urgency & Reasoning

| Campo | Valore |
|-------|--------|
| **Phase** | 12 — Score, Follow-up & Views |
| **Sprint** | 18 |
| **SP** | 7 |
| **Objective** | Make urgency scoring explainable, stable, and subordinate to labels and intent |
| **Addresses** | LFT-C1 |

---

## Sprint Backlog

### T-1801: Audit current score factors [1 SP]
- [ ] Trace all score and urgency paths in backend triage
- [ ] Identify where score still overrides semantic meaning

### T-1802: Define explainable score inputs [2 SP]
- [ ] Document the weighted inputs:
  - label outcome
  - sender importance
  - customer relevance
  - deadline proximity
  - escalation or complaint tone
  - explicit ask / response needed
  - passive suppression

### T-1803: Define `priorityReason` contract [2 SP]
- [ ] Specify visible reasoning format
- [ ] Keep it factual, short, and user-readable
- [ ] Ensure every urgency level can be justified

### T-1804: Define stable urgency buckets [1 SP]
- [ ] Map score to `low`, `medium`, `high`, `critical`
- [ ] Define promotion/demotion rules

### T-1805: Write score validation cases [1 SP]
- [ ] Create real-world cases for CI failures, billing, newsletters, passive alerts, and customer asks

---

## Dependencies

- Sprint 17 complete

## Risks

1. Too many weighted factors can make score unstable across similar emails.
2. Reason strings can become generic if they are not backed by explicit signals.

## Definition of Done

- [ ] score inputs are documented
- [ ] priority reasoning contract is written
- [ ] urgency buckets are defined
- [ ] validation scenarios exist
