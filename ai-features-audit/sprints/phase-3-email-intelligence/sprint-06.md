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
- [x] Read `draft-generation.service.ts` — locate prompt input handling ✅ DONE
- [x] Add validation: truncate user prompt to 2000 chars with warning ✅ DONE
- [x] Return 400 Bad Request if prompt exceeds hard limit (10000 chars) ✅ DONE
- [x] Addresses: **EI-M1** ✅ DONE

### T-0602: Invalidate email analysis cache on label/folder change [3 SP]
- [x] Read `email-analysis.service.ts` — locate 24h cache logic ✅ DONE
- [x] Hook into label add/remove events: bust analysis cache for affected emailId ✅ DONE
- [x] Hook into folder move events: same cache bust ✅ DONE
- [x] Addresses: **EI-M2** ✅ DONE

### T-0603: Audit triage learning privacy controls [2 SP]
- [x] Read `triage-learning.service.ts` — map all tracked signals ✅ DONE
- [x] Verify implicit tracking respects AI consent flag ✅ DONE
- [x] Add option to disable behavioral tracking independently of AI consent ✅ DONE
- [x] Document tracked signals in user-facing privacy info ✅ DONE
- [x] Addresses: **EI-M3** ✅ DONE

### T-0604: Add persistent notification queue for reminders [3 SP]
- [x] Read `reminder-scheduler.service.ts` — trace Socket.IO notification ✅ DONE
- [x] Add fallback: if Socket.IO delivery fails (user offline), persist to notification table ✅ DONE
- [x] Frontend: poll pending notifications on reconnect ✅ DONE (GET /ai/notifications endpoint)
- [x] Addresses: **EI-M4** ✅ DONE

### T-0605: Export follow-up detection Zod schema as shared type [1 SP]
- [x] Read `follow-up-detection.service.ts` — locate Zod schema ✅ DONE
- [x] Extract to shared types file: `backend/src/modules/ai/types/follow-up.types.ts` ✅ DONE
- [x] Update frontend to import inferred type (or add to DTO) ✅ DONE (re-exported from service)
- [x] Addresses: **EI-L1** ✅ DONE

### T-0606: Verify unified email analysis single-call consolidation [1 SP]
- [x] Read `email-analysis.service.ts` — confirm single LLM call produces all fields ✅ VERIFIED
- [x] Verify no endpoint triggers multiple redundant LLM calls ✅ VERIFIED
- [x] Check that `/ai/summarize`, `/ai/categorize`, `/ai/sentiment`, `/ai/priority` all use cached unified result ✅ VERIFIED

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
