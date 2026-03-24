# Sprint 17 — Knowledge Base & Customer Portal

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service                  |
| **Date**         | 2026-05-04 → 2026-05-17 (2 settimane)      |
| **Obiettivo**    | Knowledge base con articoli e ricerca full-text PostgreSQL. Customer portal minimale per submit e tracking ticket |
| **Capacità**     | 17 SP (solo dev, ~8.5 SP/settimana)         |

---

## Sprint Backlog

- [ ] T-1701 — Prisma model `KBCategory` (id, tenantId, name, slug, description, parentId self-relation per subcategorie, sortOrder, createdAt). Indice unique su tenantId+slug — [1 SP] — 📋 TODO
- [ ] T-1702 — Prisma model `KBArticle` (id, tenantId, categoryId FK, title, slug, body text, tags string[], status enum `[draft, published, archived]`, authorId, publishedAt, createdAt, updatedAt). Campo `searchVector` gestito via raw SQL per tsvector — [2 SP] — 📋 TODO
- [ ] T-1703 — Migrazione Prisma + raw SQL per creare colonna tsvector con trigger di aggiornamento automatico su insert/update di title+body. Indice GIN su searchVector — [2 SP] — 📋 TODO
- [ ] T-1704 — KB CRUD API: `POST /kb/articles`, `GET /kb/articles` (filtri: categoryId, status, tag), `GET /kb/articles/:slug`, `PATCH /kb/articles/:id`, `DELETE /kb/articles/:id`. `GET /kb/categories` con conteggio articoli per categoria. Tutto filtrato per tenantId — [3 SP] — 📋 TODO
- [ ] T-1705 — KB search API: `GET /kb/search?q=term` con PostgreSQL full-text search (`plainto_tsquery` + `ts_rank`). Restituire titolo, snippet (ts_headline), categoria, relevance score. Limitare a articoli published — [2 SP] — 📋 TODO
- [ ] T-1706 — KB article editor page (`/kb/articles/new`, `/kb/articles/:id/edit`): form MUI con TextField per titolo, select per categoria, editor body con markdown semplice (textarea con preview), chip input per tags, toggle draft/published — [2 SP] — 📋 TODO
- [ ] T-1707 — KB browse page (`/kb`): lista categorie con card MUI, click su categoria mostra articoli. Barra di ricerca in alto con debounce 300ms che chiama search API. Risultati con highlight del termine cercato — [2 SP] — 📋 TODO
- [ ] T-1708 — Customer portal route group (`/portal`): layout separato senza sidebar PMSync, solo header con logo e navigazione minimale. Nessuna autenticazione richiesta per visualizzare KB. Middleware Next.js per separare layout — [1 SP] — 📋 TODO
- [ ] T-1709 — Portal ticket submission form (`/portal/tickets/new`): campi nome, email, subject, description, priority (solo low/medium/high). Protezione con captcha semplice (honeypot + timestamp check, no servizi esterni). Creazione ticket via API pubblica dedicata `POST /portal/tickets` — [2 SP] — 📋 TODO
- [ ] T-1710 — Portal ticket tracking (`/portal/tickets/:token`): generare token univoco (nanoid 21 chars) alla creazione ticket, salvare in campo `portalToken`. Pagina pubblica mostra status, timeline aggiornamenti (solo commenti non-interni), nessun dato sensibile esposto — [2 SP] — 📋 TODO

**Totale: 19 SP** _(buffer -2 SP per complessità tsvector = 17 SP effettivi)_

---

## Dipendenze

- Sprint 15-16 completati: modello Ticket con CRUD e commenti funzionanti.
- PostgreSQL con supporto full-text search (disponibile in tutte le versioni supportate).
- Campo `portalToken` richiede aggiunta al modello Ticket (migrazione incrementale).

## Rischi

1. **tsvector e Prisma** — Prisma non supporta nativamente tsvector. Necessario raw SQL per migrazione, trigger e query di ricerca. Mitigazione: isolare tutta la logica full-text in un service dedicato con `prisma.$queryRaw`.
2. **Sicurezza portal pubblico** — Endpoint senza auth espongono superficie di attacco (spam ticket, enumeration). Mitigazione: rate limiting su `/portal/*` (reusare middleware esistente), honeypot captcha, token non-guessable per tracking.
3. **Qualità ricerca** — La configurazione tsvector di default potrebbe non gestire bene l'italiano. Mitigazione: usare configurazione `simple` per MVP, valutare dizionario italiano in sprint futuro.

## Definition of Done

- [ ] Modelli KBCategory e KBArticle in Prisma con migrazione applicata
- [ ] Trigger tsvector funzionante: inserimento/aggiornamento articolo aggiorna automaticamente searchVector
- [ ] Ricerca full-text restituisce risultati rilevanti con snippet evidenziati
- [ ] Editor articoli permette creazione, modifica, pubblicazione
- [ ] Pagina browse KB mostra categorie e articoli con ricerca funzionante
- [ ] Portal ticket submission crea ticket reale senza autenticazione
- [ ] Portal ticket tracking mostra status e timeline via token univoco
- [ ] Commenti interni NON visibili nella pagina tracking portal
- [ ] `npx tsc --noEmit` passa su backend e frontend senza errori
- [ ] `npm run lint:win` passa su entrambi i progetti

## Deliverable Attesi

- Modelli `KBCategory` e `KBArticle` con full-text search PostgreSQL
- API CRUD articoli + API ricerca con ranking
- Editor articoli e pagina browse nel frontend staff
- Route group `/portal` con layout dedicato
- Form submission ticket pubblico con protezione anti-spam
- Pagina tracking ticket via token univoco
