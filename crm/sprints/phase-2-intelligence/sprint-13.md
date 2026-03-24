# Sprint 13 — Next Best Action

| Campo           | Valore                                      |
| --------------- | ------------------------------------------- |
| **Fase**        | Phase 2 — Intelligence Layer                |
| **Sprint**      | 13                                          |
| **Date**        | 2026-05-20 → 2026-06-02 (2 settimane)      |
| **Obiettivo**   | Engine Next Best Action (NBA) contestuale. Suggestion cards nel deal detail con azioni raccomandate e impatto atteso. Integrazione con AI chat per raccomandazioni conversazionali. |
| **Capacità**    | 17 SP (solo dev)                            |

---

## Sprint Backlog

- [ ] T-1301 — Modello Prisma `NBAAction`: relazione a Deal/Contact, action type enum (EMAIL, CALL, MEETING, DISCOUNT, ESCALATE, FOLLOW_UP), expected impact (0-100), reasoning text, status (SUGGESTED, ACCEPTED, DISMISSED, EXECUTED), timestamps — [2 SP] — 📋 TODO
- [ ] T-1302 — NBA engine service: context gathering (deal stage, days in stage, last contact date, engagement score da LeadScore, churn risk da ChurnSignal, deal value, competitor mentions) — [2 SP] — 📋 TODO
- [ ] T-1303 — NBA ranking logic: regole pesate per generare e ordinare azioni candidate. Priorità basata su urgency (stagnation, churn risk) + expected impact (storico azioni simili accettate) — [2 SP] — 📋 TODO
- [ ] T-1304 — API endpoint `GET /crm/nba/:dealId` che restituisce top 3 azioni raccomandate con reasoning e impact score — [1 SP] — 📋 TODO
- [ ] T-1305 — Suggestion card component MUI: card con icona azione, titolo, reasoning collapsible, barra impatto atteso %, pulsanti "Esegui" e "Ignora" — [2 SP] — 📋 TODO
- [ ] T-1306 — Integrazione suggestion cards nella sidebar del deal detail: sezione "Azioni Consigliate" con max 3 cards, skeleton loading, empty state — [2 SP] — 📋 TODO
- [ ] T-1307 — Action acceptance tracking: click su "Esegui" aggiorna status a ACCEPTED, trigger esecuzione (apri composer email, crea meeting, etc.), tracking outcome — [2 SP] — 📋 TODO
- [ ] T-1308 — AI chat tool `getNextBestAction`: dato un dealId, restituisce le azioni raccomandate in formato conversazionale. Registrazione in ToolRegistry — [2 SP] — 📋 TODO
- [ ] T-1309 — NBA effectiveness dashboard: ratio accepted/dismissed per action type, trend nel tempo, impatto reale vs predetto — [1 SP] — 📋 TODO
- [ ] T-1310 — Type-check frontend e backend, traduzioni IT/EN, query hook `useNextBestAction` — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 09 (LeadScore) e Sprint 12 (ChurnSignal) completati — il NBA engine consuma entrambi i segnali come input
- Deal detail page esistente con layout sidebar disponibile
- ToolRegistry in `backend/src/modules/ai-chat/tools/` per registrazione nuovo tool
- Composer email e modal creazione meeting esistenti per action execution

## Rischi

1. **Raccomandazioni generiche** — Senza storico di azioni passate sufficienti, le raccomandazioni saranno basate solo su regole statiche e risulteranno ovvie. Mitigazione: reasoning esplicito per ogni azione, feedback loop per migliorare nel tempo.
2. **Action execution complessa** — Ogni tipo di azione (email, call, meeting, discount) ha un flusso diverso. Mitigazione: Sprint 13 implementa solo l'apertura del flusso corretto (deep link), non l'esecuzione automatica completa.
3. **Overload informativo** — Troppe suggestion cards possono distrarre. Mitigazione: massimo 3 azioni, solo se confidence > 40%, opzione "snooze" per nascondere temporaneamente.

## Definition of Done

- [ ] Migrazione Prisma `NBAAction` applicata
- [ ] NBA engine genera azioni contestuali basate su deal stage, engagement e churn risk
- [ ] Top 3 azioni visibili nella sidebar del deal detail con reasoning
- [ ] Click "Esegui" apre il flusso corretto (composer, meeting modal, etc.)
- [ ] Tracking accepted/dismissed persiste su DB
- [ ] AI chat tool `getNextBestAction` risponde correttamente
- [ ] `npx tsc --noEmit` passa su frontend e backend
- [ ] Traduzioni IT/EN complete

## Deliverable Attesi

- Schema Prisma aggiornato con `NBAAction`
- `backend/src/modules/crm/nba/` con engine service, ranking logic, API controller
- `backend/src/modules/ai-chat/tools/crm/get-next-best-action.tool.ts`
- `frontend/src/components/crm/nba/` con `SuggestionCard`, `NBASection`, `NBAEffectiveness`
- `frontend/hooks/queries/use-next-best-action.ts`
