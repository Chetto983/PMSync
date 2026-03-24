# Sprint 10 — Lead Score UI & CRM AI Tools

| Campo           | Valore                                      |
| --------------- | ------------------------------------------- |
| **Fase**        | Phase 2 — Intelligence Layer                |
| **Sprint**      | 10                                          |
| **Date**        | 2026-04-08 → 2026-04-21 (2 settimane)      |
| **Obiettivo**   | Lead score widget nel dettaglio contatto, miglioramento deal score con features comportamentali, AI chat tools per operazioni CRM (deal lookup, pipeline actions). |
| **Capacità**    | 17 SP (solo dev)                            |

---

## Sprint Backlog

- [ ] T-1001 — Componente `LeadScoreGauge`: gauge circolare 0-100 con colorazione semantica (rosso < 30, giallo 30-70, verde > 70), top 5 fattori contribuenti con barre orizzontali — [2 SP] — 📋 TODO
- [ ] T-1002 — Lead score badge nella contact list: chip colorato con score, visibile in riga tabella e card view — [1 SP] — 📋 TODO
- [ ] T-1003 — Sorting e filtering per lead score nella lista contatti: colonna ordinabile, filtro range (min-max slider) — [2 SP] — 📋 TODO
- [ ] T-1004 — Deal score ML enhancement: aggiungere behavioral features (engagement velocity, response time trend) al rule-based scoring esistente, blending pesato 60% ML + 40% rules — [2 SP] — 📋 TODO
- [ ] T-1005 — Score history chart: grafico lineare MUI X Charts con trend score ultimi 90 giorni, tooltip con data e valore — [2 SP] — 📋 TODO
- [ ] T-1006 — Query hook `useLeadScore` e `useLeadScoreHistory` con TanStack Query, `staleTime: 5min` — [1 SP] — 📋 TODO
- [ ] T-1007 — AI chat tool `getDealsByPipeline`: ricerca deal per pipeline con filtri stato, owner, range importo. Registrazione in ToolRegistry — [2 SP] — 📋 TODO
- [ ] T-1008 — AI chat tool `moveDealStage`: sposta deal tra stage con validazione transizione, log attività automatico — [2 SP] — 📋 TODO
- [ ] T-1009 — AI chat tool `getDealTimeline`: restituisce timeline completa del deal (stage changes, email, meeting, note) ordinata cronologicamente — [2 SP] — 📋 TODO
- [ ] T-1010 — Registrazione tools T-1007/1008/1009 nel ToolRegistry esistente in `backend/src/modules/ai-chat/tools/`, type-check completo — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 09 completato (LeadScore model e API endpoint disponibili)
- ToolRegistry esistente in `backend/src/modules/ai-chat/tools/`
- MUI X Charts installato nel frontend
- Traduzioni `en.ts` / `it.ts` aggiornate prima dei componenti UI

## Rischi

1. **Latenza gauge rendering** — Il calcolo dei fattori contribuenti potrebbe rallentare il caricamento del dettaglio contatto. Mitigazione: lazy loading del widget con Suspense + skeleton.
2. **Tool validation insufficiente** — `moveDealStage` senza validazione potrebbe corrompere la pipeline. Mitigazione: matrice di transizione stage valide, rifiuto con messaggio esplicativo se transizione non permessa.
3. **Blending ML/rules instabile** — Il peso 60/40 potrebbe non essere ottimale. Mitigazione: A/B comparison su seed data, peso configurabile via settings.

## Definition of Done

- [ ] `LeadScoreGauge` renderizza correttamente score 0-100 con fattori contribuenti
- [ ] Badge visibile in lista contatti con colorazione corretta
- [ ] Sorting per score funzionante (ASC/DESC)
- [ ] Score history chart mostra trend 90 giorni
- [ ] Tutti e 3 i CRM AI tools rispondono correttamente via AI chat
- [ ] `moveDealStage` rifiuta transizioni non valide con errore descrittivo
- [ ] `npx tsc --noEmit` passa su frontend e backend
- [ ] Traduzioni IT/EN complete per tutti i nuovi componenti

## Deliverable Attesi

- `frontend/src/components/crm/lead-score/` con `LeadScoreGauge`, `LeadScoreBadge`, `ScoreHistoryChart`
- `frontend/hooks/queries/use-lead-score.ts` e `use-lead-score-history.ts`
- `backend/src/modules/ai-chat/tools/crm/` con `get-deals-by-pipeline.tool.ts`, `move-deal-stage.tool.ts`, `get-deal-timeline.tool.ts`
- Traduzioni aggiornate in `frontend/locales/en.ts` e `it.ts`
