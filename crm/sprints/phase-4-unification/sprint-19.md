# Sprint 19 — Auto-Population Engine

| Campo            | Valore                                           |
| ---------------- | ------------------------------------------------ |
| **Fase**         | Phase 4 — UX Unification & Auto-Population       |
| **Date**         | 2026-04-01 → 2026-04-14                          |
| **Obiettivo**    | System auto-populates CRM from email, calendar, and contacts. Zero manual entry needed for basic CRM data. |
| **Capacita**     | 20 SP                                            |

---

## Sprint Backlog

- [ ] T-1901 — **CrmSuggestion Prisma model.** Add `CrmSuggestion` model to schema: id, tenantId, type (account/deal/ticket/link), status (pending/accepted/dismissed), entityData (Json), sourceEmailId, sourceType, confidence (Float), timestamps. Add indexes on [tenantId, status] and [tenantId, type]. Run `prisma generate`. — [2 SP]
- [ ] T-1902 — **CRM Suggestion service.** Create `backend/src/modules/crm/suggestion/crm-suggestion.service.ts`: CRUD for suggestions (create, list pending, accept, dismiss, bulk accept/dismiss). Accept handler creates the real CRM entity (account/deal/ticket) from entityData. All queries include tenantId. — [3 SP]
- [ ] T-1903 — **CRM Suggestion controller + module.** REST endpoints: `GET /api/v1/crm/suggestions` (list pending), `POST /api/v1/crm/suggestions/:id/accept`, `POST /api/v1/crm/suggestions/:id/dismiss`, `POST /api/v1/crm/suggestions/bulk` (accept/dismiss array). Wire module with TenantGuard + RolesGuard. — [2 SP]
- [ ] T-1904 — **Freemail domain list.** Create `backend/src/modules/crm/suggestion/freemail-domains.ts` — a Set of ~50 freemail providers (gmail.com, outlook.com, yahoo.com, hotmail.com, etc.). Exported as `isFreemailDomain(domain: string): boolean`. — [1 SP]
- [ ] T-1905 — **Email→Account auto-discovery.** Extend `email-triage.service.ts` (or create a post-triage hook): after AI triage completes, extract sender domain. If not freemail AND no CRM account exists with that domain → create CrmSuggestion type="account" with entityData={name: domain, website: domain}. Dedup: skip if suggestion already pending for same domain. — [3 SP]
- [ ] T-1906 — **Email→Deal detection.** After AI triage, if email content matches commercial intent keywords (preventivo, quotazione, proposta, offerta, contratto, fattura, rinnovo, quote, proposal, pricing, invoice, contract, renewal), create CrmSuggestion type="deal" with entityData={title: email subject, contactId, accountId, sourceEmailId, value: null}. Confidence based on keyword match count. — [3 SP]
- [ ] T-1907 — **Email→Ticket auto-creation.** After AI triage, if email matches support intent (problema, errore, non funziona, aiuto, guasto, reclamo, bug, issue, help, not working, broken), create CrmSuggestion type="ticket" with entityData={subject: email subject, contactId, priority: based on urgency keywords, sourceEmailId}. Configurable per-tenant via `CrmSettings.autoTicketEnabled` flag. — [3 SP]
- [ ] T-1908 — **Contact→Account linking job.** BullMQ job `contact-account-linker`: query all contacts without a CRM account link. For each, extract email domain, find CRM account with matching website domain. If found, create CrmSuggestion type="link" with entityData={contactId, accountId}. Auto-accept Level 1 (exact domain match). Schedule: run once on deploy + trigger on new contact creation. — [2 SP]
- [ ] T-1909 — **Calendar→Activity logging.** After calendar sync completes (hook into existing sync flow), scan new/updated events. For each event, check if attendee emails match CRM contacts. If yes, create `CrmActivity` entry: type="meeting", entityType="contact", entityId=contactId, description="Meeting: {title}", date=event start. Idempotent: skip if activity with same eventId+contactId exists. — [1 SP]

**Totale: 20 SP**

---

## Dipendenze

- CRM backend (Phase 1-3) complete — accounts, deals, tickets, pipelines all operational
- AI triage pipeline operational (`email-triage.service.ts` exists)
- Calendar sync operational
- BullMQ + Redis operational

## Rischi

1. **AI triage extension may slow email processing.** Mitigazione: CRM suggestion creation is async (fire-and-forget after triage completes, not in the critical path).
2. **Freemail list incomplete.** Mitigazione: Start with 50 providers, add more over time. False negatives (unknown freemail) just create an extra suggestion that user dismisses.
3. **Keyword-based intent detection has low precision.** Mitigazione: Use confidence scores. Show low-confidence suggestions with "(low confidence)" badge. User feedback (accept/dismiss) can improve over time.

## Definition of Done

- [ ] `CrmSuggestion` model exists in Prisma schema, migrations applied
- [ ] POST email triage creates account/deal/ticket suggestions for qualifying emails
- [ ] Contact→Account linking runs as background job
- [ ] Calendar events with CRM contacts create activity log entries
- [ ] All suggestion endpoints return 401 without auth (guard active)
- [ ] Backend tsc: passing
- [ ] Zero circular dependencies
