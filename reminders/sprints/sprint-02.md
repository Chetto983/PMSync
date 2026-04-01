# Sprint 02 — AI Chat Tools Complete

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Critical Fixes |
| **Sprint** | 02 di 06 |
| **Obiettivo Sprint** | Completare i 4 tool AI mancanti (update, delete, complete, snooze) così l'AI può gestire l'intero lifecycle dei promemoria via chat. |
| **Capacità** | 14 SP |

---

## Sprint Backlog

- [ ] T-0201 — Aggiungere schema Zod e tool builder per `complete_reminder` in `ReminderToolsService`. Input: `{ reminderId: string }`. Chiama `reminderService.completeReminder()`. Risk level: MEDIUM, requiresApproval: false. — [2 SP]
- [ ] T-0202 — Aggiungere schema Zod e tool builder per `update_reminder` in `ReminderToolsService`. Input: `{ reminderId, titolo?, descrizione?, contatto?, scadenzaDatetime?, priorita?, azione? }`. Chiama `reminderService.updateReminder()`. Risk level: MEDIUM, requiresApproval: false. — [3 SP]
- [ ] T-0203 — Aggiungere schema Zod e tool builder per `delete_reminder` in `ReminderToolsService`. Input: `{ reminderId: string }`. Chiama `reminderService.deleteReminder()`. Risk level: HIGH, requiresApproval: true (HITL). — [2 SP]
- [ ] T-0204 — Aggiungere schema Zod e tool builder per `snooze_reminder` in `ReminderToolsService`. Input: `{ reminderId: string, days: number (1-30) }`. Calcola nuova `scadenzaDatetime = now + days`, chiama `updateReminder`. Risk level: MEDIUM. — [2 SP]
- [ ] T-0205 — Registrare tutti i nuovi tool nel `toolRegistry.registerTool()` in `onModuleInit()`. Aggiungere in `getTools()` return map. Aggiornare `tool-domains.ts` se necessario. — [1 SP]
- [ ] T-0206 — Aggiungere tool renderers nel frontend per `complete_reminder`, `update_reminder`, `delete_reminder`, `snooze_reminder` in `ReminderToolUI.tsx`. Mostrare conferma/risultato inline nella chat. — [2 SP]
- [ ] T-0207 — Aggiornare governance test `tool-registry-governance.test.ts` con i 6 tool totali (create, list, update, delete, complete, snooze). — [1 SP]
- [ ] T-0208 — Type-check backend + frontend. Testare ogni tool via AI chat su Railway. — [1 SP]

---

## Dipendenze

- Sprint 01 completato: `reminder:completed` Socket.IO event disponibile.
- `ReminderService` ha già tutti i metodi CRUD + `completeReminder`.

## Rischi

1. **Tool explosion** — 6 tool per reminders potrebbe confondere il modello. Mitigazione: description chiare con trigger phrases precise.
2. **HITL su delete** — `delete_reminder` richiede approval. Verificare che il flow HITL Telegram funzioni per questo tool.
3. **Snooze race condition** — Se user snooze via UI e AI contemporaneamente, scadenza potrebbe essere sovrascritta. Mitigazione: last-write-wins è accettabile.

## Definition of Done

- [ ] AI chat può completare un reminder ("segna come fatto il promemoria per Marco")
- [ ] AI chat può aggiornare un reminder ("sposta il promemoria a venerdì")
- [ ] AI chat può eliminare un reminder con HITL approval ("elimina il promemoria per Omron")
- [ ] AI chat può posticipare un reminder ("posticipa di 3 giorni il promemoria")
- [ ] Tool renderers mostrano risultato nella chat UI
- [ ] Governance test aggiornato e passante
- [ ] `cd backend && npx tsc --noEmit` passa
