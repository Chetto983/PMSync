# Sprint 03 — Frontend Real-time & UX

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Critical Fixes |
| **Sprint** | 03 di 06 |
| **Obiettivo Sprint** | Connettere il frontend ai Socket.IO events per aggiornamento in tempo reale. Aggiungere notifiche di fallimento delivery, optimistic updates, e miglioramenti UX ai card. |
| **Capacità** | 16 SP |

---

## Sprint Backlog

- [x] T-0301 — Creare hook `useReminderSocket()` che sottoscrive Socket.IO events `reminder:upcoming`, `reminder:imminent`, `reminder:overdue`, `reminder:completed`, `reminder:telegram-sent`. Invalidare query cache `reminderKeys.all` on event. — [2 SP] — ✅ DONE
- [x] T-0302 — Mostrare toast notification (MUI Snackbar) quando arriva `reminder:imminent` o `reminder:overdue` con titolo del reminder e azione rapida "Vai ai promemoria". — [2 SP] — ✅ DONE
- [x] T-0303 — Aggiungere indicatore Telegram status su `ReminderCard`: icona Send verde se `telegramInviato=true`, icona Send rossa se `telegramInviatoAt` è null e `scadenzaDatetime` è passata (delivery fallita). Tooltip con dettaglio. — [2 SP] — ✅ DONE
- [x] T-0304 — Aggiungere indicatore email monitoring su `ReminderCard`: chip "Monitoraggio email" con badge count se `emailRilevata=true`. Mostrare `emailMittente` e keywords. — [2 SP] — ✅ DONE
- [x] T-0305 — Optimistic updates su `useCompleteReminder` e `useDeleteReminder`: aggiornare cache TanStack Query prima della risposta server. Rollback on error. — [2 SP] — ✅ DONE
- [x] T-0306 — Aggiungere toast error su tutte le mutation failures (create, update, complete, delete). Usare `onError` callback in `useMutation`. — [1 SP] — ✅ DONE
- [x] T-0307 — Backend: emettere Socket.IO event `reminder:delivery-failed` da `ReminderNotifyQueueService` quando Telegram send fallisce. Frontend: mostrare alert persistente "Notifica non consegnata per: {titolo}". — [2 SP] — ✅ DONE
- [x] T-0308 — Aggiungere condizione display su `ReminderCard`: se `condizioneTipo !== 'sempre'`, mostrare chip con testo condizione (es. "In attesa email da {emailMittente}"). — [1 SP] — ✅ DONE
- [x] T-0309 — Type-check backend + frontend. Validazione E2E su Railway/Vercel. — [2 SP] — ✅ DONE

---

## Dipendenze

- Sprint 01: Socket.IO event types registrati e emessi.
- Sprint 01: `reminder:telegram-sent` event disponibile.

## Rischi

1. **Socket.IO reconnection** — Se utente perde connessione e riconnette, perde events intermedi. Mitigazione: `InAppNotification` table copre offline users.
2. **Optimistic update race** — Se mutation fallisce dopo optimistic update, rollback potrebbe flashare l'UI. Mitigazione: TanStack Query `onMutate/onError/onSettled` pattern standard.

## Definition of Done

- [x] UI si aggiorna automaticamente senza refresh quando reminder viene completato/notificato
- [x] Toast notification per reminder imminente/scaduto
- [x] Card mostra status Telegram (inviato/fallito) e email monitoring
- [x] Optimistic updates su complete e delete (risposta UI istantanea)
- [x] Toast error su ogni mutation failure
- [x] Alert persistente se notifica Telegram fallisce
- [x] `cd backend && npx tsc --noEmit` passa
- [x] `cd frontend && npx tsc --noEmit` passa
