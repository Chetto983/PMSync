# Sprint 07.2 — UX/Mobile Audit Fixes (Sub-Sprint)

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 07.2 (sub-sprint inserito tra S07.1 e S08) |
| **Obiettivo Sprint** | Correggere tutte le violazioni UX anti-patterns e mobile-design rilevate dall'audit post-Sprint 07.1 su DealProductsTab e AccountActivityTab. |
| **Capacita** | 7 SP (micro-sprint, ~2-3 giorni) |

---

## Motivazione

L'audit UX/mobile post-Sprint 07.1 ha rivelato 10 violazioni delle regole `/ux-antipatterns` e `/mobile-design`:
- 3 HIGH severity (funzionalita rotte o inutilizzabili su mobile)
- 4 MEDIUM severity (UX degradata, touch target insufficienti)
- 3 LOW severity (feedback mancante, indicatori assenti)

Queste violazioni devono essere risolte prima di Sprint 08 (Dashboard & Alpha) per garantire qualita UX su tutti i dispositivi.

---

## Sprint Backlog

### HIGH — Broken / Unusable

- [x] T-0721 — Fix dead "Load More" button in AccountActivityTab — [2 SP] — ✅ DONE
  - Implementare paginazione offset-based con stato locale
  - Il bottone deve appendere le nuove attivita alla lista esistente
  - Mostrare spinner durante il caricamento
  - Nascondere il bottone quando tutte le attivita sono caricate
  - File: `frontend/components/dashboard/crm-accounts/AccountActivityTab.tsx`

- [x] T-0722 — Make DealProductsTab responsive for mobile — [2 SP] — ✅ DONE
  - Wrappare la tabella in `TableContainer` con `sx={{ overflowX: 'auto' }}`
  - Su mobile (xs): nascondere colonne Code e Discount con `display: { xs: 'none', sm: 'table-cell' }`
  - Trash `IconButton`: aumentare touch target a 44px (`sx={{ minWidth: 44, minHeight: 44 }}`)
  - Verificare a 375px che la tabella sia usabile con scroll orizzontale
  - File: `frontend/components/dashboard/crm-deals/DealProductsTab.tsx`

### MEDIUM — Degraded UX

- [x] T-0723 — Replace window.confirm with MUI ConfirmDialog — [1 SP] — ✅ DONE
  - Creare stato `confirmUnlinkId` per tracciare quale link sta per essere rimosso
  - Mostrare `Dialog` con messaggio tradotto e bottoni Cancel/Remove
  - Rimuovere `window.confirm()` — non e accessibile e rompe la coerenza visiva
  - File: `frontend/components/dashboard/crm-deals/DealProductsTab.tsx`

- [x] T-0724 — Add error state to AccountActivityTab — [0.5 SP] — ✅ DONE
  - Destrutturare `isError` da `useAccountActivities`
  - Aggiungere `Alert severity="error"` prima del check empty state
  - Stesso pattern di DealProductsTab (gia ha error state)
  - File: `frontend/components/dashboard/crm-accounts/AccountActivityTab.tsx`

- [x] T-0725 — Fix touch targets in AddProductDialog — [0.5 SP] — ✅ DONE
  - Product list items: aumentare `py: 1` a `py: 1.5` (minHeight 44px)
  - Dialog form fields (Qty/Price/Discount): cambiare layout da `flex row` a `flex column` su xs con `flexWrap: 'wrap'` e `sx={{ flex: { xs: '1 1 100%', sm: '1 1 30%' } }}`
  - File: `frontend/components/dashboard/crm-deals/DealProductsTab.tsx`

### LOW — Missing Feedback

- [x] T-0726 — Add loading spinner to dialog submit buttons — [0.5 SP] — ✅ DONE
  - AddProductDialog "Add Product" button: aggiungere `CircularProgress size={16}` quando `linkProduct.isPending`
  - CreateAccountActivityDialog "Save" button: aggiungere `CircularProgress size={16}` quando `createActivity.isPending`
  - Pattern: `startIcon={isPending ? <CircularProgress size={16} /> : undefined}`
  - File: `DealProductsTab.tsx`, `AccountActivityTab.tsx`

- [x] T-0727 — Fix timeline date clipping on narrow viewports — [0.5 SP] — ✅ DONE
  - Cambiare `TimelineOppositeContent flex: 0.25` a `flex: 0.3` su xs
  - Oppure usare `sx={{ flex: { xs: 0.35, sm: 0.25 } }}` per dare piu spazio su mobile
  - Verificare che la data non venga troncata a 375px
  - File: `frontend/components/dashboard/crm-accounts/AccountActivityTab.tsx`

---

## Dipendenze

- Sprint 07.1 completato (DealProductsTab e AccountActivityTab esistenti).
- Nessuna modifica backend o schema richiesta.
- Solo frontend changes.

## Rischi

1. **T-0721 paginazione**: Se il backend non supporta offset/limit correttamente su activities, potrebbe richiedere fix backend. Rischio basso: il backend gia supporta `limit` e `offset` query params.
2. **T-0722 responsive table**: Nascondere colonne potrebbe confondere utenti che non vedono discount su mobile. Accettabile: il subtotale gia include lo sconto calcolato.

## Definition of Done

- [x] Zero violazioni HIGH dall'audit UX/mobile
- [x] Tutti i touch target >= 44px su viewport 375px
- [x] Nessun `window.confirm()` nel codice CRM
- [x] "Load More" funzionante con paginazione reale
- [x] Error state presente su tutti i tab con data fetching
- [x] Loading spinner su tutti i bottoni di submit dialog
- [x] `cd frontend && npx tsc --noEmit` passa
- [x] Validazione browser Edge CDP su desktop e mobile (375x812)
