# Sprint 06 — Follow-ups, Briefing & Draft Generation

| Campo | Valore |
|-------|--------|
| **Phase** | 3 — Email Intelligence |
| **Sprint** | 06 |
| **SP** | 12 |
| **Objective** | Enforce draft prompt length, fix cache invalidation on label change, add notification persistence, audit triage learning privacy |
| **Addresses** | EI-M1, EI-M2, EI-M3, EI-M4, EI-L1 |

---

## Sprint Backlog

### T-0601: Add max length enforcement on draft generation prompt [2 SP]
- [ ] Read `draft-generation.service.ts` — locate prompt input handling
- [ ] Add validation: truncate user prompt to 2000 chars with warning
- [ ] Return 400 Bad Request if prompt exceeds hard limit (10000 chars)
- [ ] Addresses: **EI-M1**

### T-0602: Invalidate email analysis cache on label/folder change [3 SP]
- [ ] Read `email-analysis.service.ts` — locate 24h cache logic
- [ ] Hook into label add/remove events: bust analysis cache for affected emailId
- [ ] Hook into folder move events: same cache bust
- [ ] Addresses: **EI-M2**

### T-0603: Audit triage learning privacy controls [2 SP]
- [ ] Read `triage-learning.service.ts` — map all tracked signals
- [ ] Verify implicit tracking respects AI consent flag
- [ ] Add option to disable behavioral tracking independently of AI consent
- [ ] Document tracked signals in user-facing privacy info
- [ ] Addresses: **EI-M3**

### T-0604: Add persistent notification queue for reminders [3 SP]
- [ ] Read `reminder-scheduler.service.ts` — trace Socket.IO notification
- [ ] Add fallback: if Socket.IO delivery fails (user offline), persist to notification table
- [ ] Frontend: poll pending notifications on reconnect
- [ ] Addresses: **EI-M4**

### T-0605: Export follow-up detection Zod schema as shared type [1 SP]
- [ ] Read `follow-up-detection.service.ts` — locate Zod schema
- [ ] Extract to shared types file: `backend/src/modules/ai/types/follow-up.types.ts`
- [ ] Update frontend to import inferred type (or add to DTO)
- [ ] Addresses: **EI-L1**

### T-0606: Verify unified email analysis single-call consolidation [1 SP]
- [ ] Read `email-analysis.service.ts` — confirm single LLM call produces all fields
- [ ] Verify no endpoint triggers multiple redundant LLM calls
- [ ] Check that `/ai/summarize`, `/ai/categorize`, `/ai/sentiment`, `/ai/priority` all use cached unified result

---

## Dependencies

- S05 complete (triage semaphore fix)

## Risks

1. **T-0604** — Notification table adds DB writes. Use fire-and-forget with retry.
2. **T-0602** — High label churn could cause excessive cache busting. Rate-limit bust events.

## Definition of Done

- [ ] Draft prompt enforced at 2000 chars (soft) / 10000 chars (hard)
- [ ] Email analysis cache busted on label/folder changes
- [ ] Triage learning respects consent and has independent toggle
- [ ] Reminders persisted when user is offline — delivered on reconnect
- [ ] Follow-up Zod schema exported as shared type
- [ ] Unified analysis consolidation verified
- [ ] `npx tsc --noEmit` passes on backend
