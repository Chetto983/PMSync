# Sprint 14 — Onboarding Rules & Label Taxonomy

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Triage Onboarding |
| **Sprint** | 14 |
| **SP** | 8 |
| **Objective** | Define the onboarding rule model and operational label taxonomy for PMSync triage |
| **Addresses** | LFT-A1, LFT-A2 |

---

## Sprint Backlog

### T-1401: Audit current label inventory and defaults [1 SP]
- [ ] Read `backend/src/modules/labels/default-user-labels.ts`
- [ ] Map overlaps and contradictions across `Important`, `Follow-up`, `Action Items`, `Updates`, `Promotions`
- [ ] Document which labels are semantic vs workflow vs suppression labels

### T-1402: Define onboarding rule schema [2 SP]
- [ ] Specify first-run fields:
  - customer domains
  - important senders
  - project / topic phrases
  - system alert sources
  - follow-up timing defaults
- [ ] Define storage contract and normalization rules
- [ ] Ensure phrasing stays natural-language-first

### T-1403: Define operational label taxonomy [2 SP]
- [ ] Establish the base label families PMSync should support
- [ ] Mark which labels are mutually exclusive
- [ ] Mark which labels suppress urgency by default
- [ ] Document allowed label combinations

### T-1404: Define onboarding outputs for backend consumption [2 SP]
- [ ] Write the normalized payload shape produced by onboarding
- [ ] Define how rules map into `aiPrompt` and future triage inputs
- [ ] Ensure compatibility with tenant-scoped label storage

### T-1405: Write phase documentation and examples [1 SP]
- [ ] Add concrete examples for:
  - customer domain rule
  - system alert rule
  - billing rule
  - review-later rule
- [ ] Keep examples aligned with real PMSync inbox patterns

---

## Dependencies

- `docs/Sistema_Logico_PMS_COMPLETO.md`
- `ai-features-audit/docs/04-LABEL-FIRST-EMAIL-TRIAGE-ROADMAP.md`

## Risks

1. Too many onboarding fields would break the PMS simplicity principle.
2. Labels that mix semantics and workflow can reintroduce confusion later in the pipeline.

## Definition of Done

- [ ] onboarding rule schema exists
- [ ] label taxonomy is documented
- [ ] suppression and contradiction rules are explicit
- [ ] examples are written in natural-language style
