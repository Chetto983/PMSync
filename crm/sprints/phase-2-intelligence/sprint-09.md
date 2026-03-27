# Sprint 09 — Lead Scoring: Feature Engineering

| Campo           | Valore                                      |
| --------------- | ------------------------------------------- |
| **Fase**        | Phase 2 — Intelligence Layer                |
| **Sprint**      | 09                                          |
| **Date**        | 2026-03-25 → 2026-04-07 (2 settimane)      |
| **Obiettivo**   | Feature engineering per lead scoring. Calcolo features da contatti, email, attività e deal. Training pipeline base con ml.js senza dipendenze Python. |
| **Capacità**    | 18 SP (solo dev)                            |

---

## Sprint Backlog

- [x] T-0901 — Modello Prisma `LeadScore` con relazioni a Contact, computed features JSON, score numerico 0-100, timestamps — [2 SP] — ✅ DONE
- [x] T-0902 — Feature extraction service: engagement features (email opens, replies, tempo medio risposta, meeting frequency) — [2 SP] — ✅ DONE
- [x] T-0903 — Feature extraction service: firmographic features (company size da Account, industry, revenue range, geo) — [2 SP] — ✅ DONE
- [x] T-0904 — Feature extraction service: behavioral features (deal stage progression velocity, page visits, form submissions, last contact recency) — [2 SP] — ✅ DONE
- [x] T-0905 — Feature store table PostgreSQL (`lead_feature_store`) con indici su `contactId` + `computedAt`, retention policy 90 giorni — [1 SP] — ✅ DONE
- [x] T-0906 — BullMQ job `lead-feature-compute` per batch notturno: iterazione su tutti i contatti attivi del tenant, calcolo e persistenza features — [2 SP] — ✅ DONE
- [x] T-0907 — LLM-based lead scoring engine (replaces ml.js): OpenRouter + Mistral Small, generateObject with Zod schema — [2 SP] — ✅ DONE
- [x] T-0908 — Scoring pipeline: feature store → LLM prompt → score/tier/reasons/confidence → persist LeadScore — [2 SP] — ✅ DONE
- [x] T-0909 — Nightly job integration: features compute → LLM scoring → batch all tenants — [1 SP] — ✅ DONE
- [x] T-0910 — API endpoint `GET /crm/leads/:contactId/score` e `GET /crm/leads/scores?sort=score&order=desc` con paginazione — [1 SP] — ✅ DONE
- [x] T-0911 — Integration test con seed data: 50 contatti con features variate, verifica pipeline end-to-end — [1 SP] — ✅ DONE

---

## Dipendenze

- Modello `Contact` e `Deal` esistenti in Prisma schema
- BullMQ e Redis già configurati nel backend
- Dati storici sufficienti per training (minimo 50 contatti con attività). Fallback: seed data sintetici.

## Rischi

1. **Dati insufficienti per training** — Con pochi contatti reali il modello sarà inaffidabile. Mitigazione: seed data sintetici + soglia minima di 50 record per abilitare scoring.
2. **Performance batch notturno** — Con migliaia di contatti il job potrebbe durare troppo. Mitigazione: processing in chunk da 100 con concurrency limitata.
3. **ml.js limitazioni** — Gradient boosting in JS è meno maturo di scikit-learn. Mitigazione: validare accuratezza e avere fallback a rule-based scoring se AUC < 0.65.

## Definition of Done

- [ ] Migrazione Prisma applicata senza errori
- [ ] Feature extraction calcola correttamente tutte e 3 le categorie di features
- [ ] Job BullMQ completa il batch su 50+ contatti seed in < 30 secondi
- [ ] Training pipeline produce un modello con AUC > 0.60 su seed data
- [ ] API endpoint restituisce score con `tenantId` filter (multi-tenant safe)
- [ ] `npx tsc --noEmit` passa senza errori su backend
- [ ] Integration test verde

## Deliverable Attesi

- Schema Prisma aggiornato con `LeadScore`, `LeadFeatureStore`, `ModelEvaluation`
- `backend/src/modules/crm/lead-scoring/` con feature extraction service, training pipeline, BullMQ job
- Endpoint REST documentati in Swagger
- Test di integrazione in `backend/src/modules/crm/lead-scoring/__tests__/`
