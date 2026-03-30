# Sprint 12 — Churn Prediction

| Campo           | Valore                                      |
| --------------- | ------------------------------------------- |
| **Fase**        | Phase 2 — Intelligence Layer                |
| **Sprint**      | 12                                          |
| **Date**        | 2026-05-06 → 2026-05-19 (2 settimane)      |
| **Obiettivo**   | Churn prediction basato su segnali di engagement decrescente. Early warning list con UI dedicata per identificare account e contatti a rischio. |
| **Capacità**    | 16 SP (solo dev)                            |

---

## Sprint Backlog

- [x] T-1201 — Modello Prisma `ChurnSignal`: relazione a Contact/Account, churn probability (0-1), signal breakdown JSON (fattori + pesi), `computedAt`, `acknowledgedAt` nullable — [1 SP] — ✅ DONE
- [x] T-1202 — Churn feature extraction service: email response time decay (media ultimi 30gg vs 90gg), meeting frequency drop (confronto trimestre corrente vs precedente), deal stage stagnation (giorni in stage corrente vs media storica) — [3 SP] — ✅ DONE
- [x] T-1203 — Feature aggiuntiva: support ticket increase trend, inactivity streak (giorni senza interazione), email bounce/unsubscribe signals — [2 SP] — ✅ DONE (inactivity + bounce in T-1202; no support ticket model exists)
- [x] T-1204 — LLM-based churn assessment (Mistral): probability 0-1, configurable thresholds (high > 0.7, medium 0.4-0.7, low < 0.4), heuristic fallback — [2 SP] — ✅ DONE
- [x] T-1205 — API endpoint `GET /crm/churn/at-risk?threshold=0.4&sort=probability&order=desc` con paginazione e filtro per Account — [1 SP] — ✅ DONE
- [x] T-1206 — Pagina early warning list: tabella MUI con colonne (contatto/account, probabilità churn, livello rischio, valutazione, ultimo contatto), chip colorati per livello — [2 SP] — ✅ DONE
- [x] T-1207 — Churn risk badge su contact detail e account detail: indicatore visivo con probabilità e breakdown fattori on hover (Tooltip MUI) — [1 SP] — ✅ DONE
- [ ] T-1208 — Signal breakdown component: radar chart o barre orizzontali che mostrano quali fattori contribuiscono al rischio (response decay, meeting drop, stagnation, inactivity) — [2 SP] — 📋 TODO
- [ ] T-1209 — BullMQ job `churn-recompute` settimanale: ricalcolo probabilità churn per tutti i contatti attivi, notifica se nuovi high-risk detected — [1 SP] — 📋 TODO
- [ ] T-1210 — Type-check frontend e backend, traduzioni IT/EN, query hook `useChurnRisk` — [1 SP] — 📋 TODO

---

## Dipendenze

- Dati di interazione (email, meeting, deal) sufficienti per calcolo decay. Minimo 60 giorni di storico per confronti significativi.
- Sprint 09 completato (ml.js già integrato, pattern di training pipeline riutilizzabile)
- Modello Account e Contact con relazioni a Email, Meeting, Deal

## Rischi

1. **False positive elevati** — Il modello potrebbe segnalare come a rischio contatti semplicemente inattivi per motivi legittimi (ferie, cambio referente). Mitigazione: feature "inactivity context" e possibilità di acknowledge/dismiss il segnale.
2. **Training data sbilanciati** — Il churn effettivo è tipicamente < 10% dei contatti, classe fortemente sbilanciata. Mitigazione: oversampling della classe minoritaria o class weights nel modello.
3. **Complessità feature extraction** — Le query per calcolare decay e trend su finestre temporali multiple possono essere costose. Mitigazione: pre-aggregazione in feature store, calcolo incrementale dove possibile.

## Definition of Done

- [ ] Migrazione Prisma `ChurnSignal` applicata
- [ ] Feature extraction calcola tutti i segnali (response decay, meeting drop, stagnation, inactivity)
- [ ] Logistic regression produce probabilità calibrate (somma delle classi ~ 1.0)
- [ ] Early warning list mostra contatti ordinati per rischio con breakdown
- [ ] Badge churn visibile su contact e account detail
- [ ] Job settimanale testabile manualmente
- [ ] `npx tsc --noEmit` passa su frontend e backend
- [ ] Traduzioni IT/EN complete per tutti i nuovi componenti

## Deliverable Attesi

- Schema Prisma aggiornato con `ChurnSignal`
- `backend/src/modules/crm/churn/` con feature extraction, logistic regression model, BullMQ job
- `frontend/src/pages/crm/churn-warnings.tsx` con early warning list
- `frontend/src/components/crm/churn/` con `ChurnRiskBadge`, `SignalBreakdown`
- `frontend/hooks/queries/use-churn-risk.ts`
