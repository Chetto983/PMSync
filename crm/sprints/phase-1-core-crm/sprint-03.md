# Sprint 03 — Pipeline & Stage Foundation

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 03 di 08 |
| **Date** | 2026-04-22 → 2026-05-05 |
| **Obiettivo Sprint** | Implementare Pipeline e Stage CRUD completo con ordering e probability. Costruire la UI per lista pipeline e configurazione stage (aggiunta, modifica, riordinamento). |
| **Capacità** | 18 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [ ] T-0301 — Creare modulo NestJS `PipelineModule` con controller, service, DTOs (CreatePipelineDto, UpdatePipelineDto, PipelineResponseDto) — [2 SP] — 📋 TODO
- [ ] T-0302 — Implementare endpoint Pipeline CRUD: `GET /crm/pipelines`, `GET /crm/pipelines/:id`, `POST /crm/pipelines`, `PATCH /crm/pipelines/:id`, `DELETE /crm/pipelines/:id` — tutti tenant-scoped — [2 SP] — 📋 TODO
- [ ] T-0303 — Implementare endpoint Stage CRUD: `POST /crm/pipelines/:id/stages`, `PATCH /crm/stages/:id`, `DELETE /crm/stages/:id`, `PATCH /crm/pipelines/:id/stages/reorder` (body: orderedIds[]) — [3 SP] — 📋 TODO
- [ ] T-0304 — Logica di ordering Stage: position auto-increment, reorder con swap atomico (transaction Prisma), validazione no gaps — [2 SP] — 📋 TODO
- [ ] T-0305 — Configurazione probability per Stage (0-100%), colore per Stage (hex string), validazione backend — [1 SP] — 📋 TODO
- [ ] T-0306 — Creazione pipeline di default al setup tenant (stages: Lead, Qualified, Proposal, Negotiation, Won, Lost) tramite seed o hook — [1 SP] — 📋 TODO
- [ ] T-0307 — Creare pagina Pipeline list in `frontend/src/pages/dashboard/crm/pipelines/index.tsx` con card per ogni pipeline (nome, n. stage, n. deal) — [2 SP] — 📋 TODO
- [ ] T-0308 — Creare pagina Pipeline settings in `frontend/src/pages/dashboard/crm/pipelines/[id]/settings.tsx` con lista stage drag-sortable (MUI + dnd), form edit stage (name, probability, color) — [3 SP] — 📋 TODO
- [ ] T-0309 — TanStack Query hooks: `usePipelines`, `usePipeline`, `useCreatePipeline`, `useUpdatePipeline`, `useDeletePipeline`, `useReorderStages` — [1 SP] — 📋 TODO
- [ ] T-0310 — Traduzioni pipeline/stage in en.ts e it.ts, type-check entrambe le app — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 01 completato: modelli `Pipeline` e `Stage` presenti nello schema Prisma.
- Migration applicata con tabelle `Pipeline` e `Stage`.

## Rischi

1. **Race condition reorder** — Due richieste di reorder simultanee possono corrompere le posizioni. Mitigazione: usare transaction Prisma con `serializable` isolation level e retry su P2034.
2. **Eliminazione stage con deal attivi** — Cancellare uno stage che contiene deal orfana i deal. Mitigazione: impedire eliminazione se stage ha deal associati (soft-block con messaggio).
3. **Default pipeline duplication** — Se il seed viene eseguito più volte, potrebbe creare pipeline duplicati. Mitigazione: upsert con check `isDefault` flag.

## Definition of Done

- [ ] Pipeline CRUD funzionante con tutti gli endpoint
- [ ] Stage CRUD con ordering corretto (position sequenziale)
- [ ] Reorder stage funziona via drag-and-drop nella UI
- [ ] Probability e colore salvati correttamente per ogni stage
- [ ] Pipeline di default creata automaticamente per nuovi tenant
- [ ] Eliminazione stage bloccata se contiene deal
- [ ] Pagina Pipeline list mostra tutte le pipeline del tenant
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- Modulo NestJS `PipelineModule` sotto `backend/src/modules/crm/pipeline/`
- Endpoint Stage con reorder atomico
- Pagina Pipeline list + Pipeline settings con drag-sort
- TanStack Query hooks per Pipeline/Stage
- Pipeline di default nel tenant seed
