# Sprint 03 — Contacts API Endpoint Verification

| Key | Value |
|-----|-------|
| Phase | 2 — Contacts Backend Verification |
| Sprint | 03 |
| SP | 12 |
| Objective | Verify all contacts endpoints, fix contact history stub, validate reminders, check data quality |
| Addresses | CON-H2, CON-M4, CON-M5, REM-M1 |

## Sprint Backlog

### T-0301: Verify ContactsController CRUD endpoints [3 SP] ✅ DONE
- [x] Test GET /contacts — list with filters (provider, search, company) — NOTE: hasEmail/hasPhone filters not implemented in DTO
- [x] Test GET /contacts/:id — single contact detail with providerContacts included
- [x] Test POST /contacts — create with full payload (emails, phones) — NOTE: addresses/socialProfiles not in DTO, only populated via provider sync
- [x] Test POST /contacts/local — create local-only contact (no provider sync)
- [x] Test PATCH /contacts/:id — update fields with provider sync
- [x] Test DELETE /contacts/:id — soft delete (isDeleted=true)
- [x] Test DELETE /contacts/bulk — bulk soft delete with provider sync
- [x] Test POST /contacts/:id/vip — toggle VIP flag
- [x] Confirm all endpoints enforce tenantId (TenantGuard + req.user.tenantId) + role guards (admin/super-admin for mutations, admin/manager for VIP)

### T-0302: Fix contact history endpoint [3 SP] ✅ DONE
- [x] Read `contacts.controller.ts` — found GET /:id/history stub returning `[]`
- [x] Assessed data sources: Email table (sent/received), CalendarEvent (meetings via attendees JSON)
- [x] Wired history to real interaction data in ContactProviderOpsService.getContactHistory()
- [x] Returns last N interactions sorted by date (emails sent/received + calendar meetings)
- [x] ContactActivityFeed component already handles the response shape (ContactInteraction interface matched)
- [x] Backend tsc passes clean

### T-0303: Verify special endpoints [2 SP] ✅ DONE
- [x] Test GET /contacts/counts — returns counts (total, withEmail, withPhone, withCompany, byProvider) via ContactCrudService with Redis cache
- [x] Test GET /contacts/relationship-scores — RelationshipScoreService uses recency/frequency/reciprocity/trend weighted scoring (no LLM)
- [x] Test GET /contacts/stale — returns stale contacts with daysSinceContact + suggestedAction
- [x] Test GET /contacts/vip/list — returns VIP contacts (isVip=true, isDeleted=false)
- [x] Test POST /contacts/lookup-by-emails — batch email lookup via raw SQL with jsonb_array_elements
- [x] Test GET /contacts/:id/photo — fetches from provider (Google/Microsoft), caches in DB

### T-0304: Verify GIN trigram index usage [2 SP] ✅ DONE
- [x] GIN trigram index exists: `@@index([displayName(ops: raw("gin_trgm_ops"))], type: Gin)` (schema line 898)
- [x] B-tree indexes on (tenantId, displayName), (tenantId, lastName, firstName), (tenantId, company) — adequate for OR search
- [x] Prisma `contains` + `mode: 'insensitive'` generates `ILIKE '%...%'` which leverages GIN trigram on displayName
- [x] pg_trgm extension enabled in baseline migration. No changes needed.

### T-0305: Add reminder controller tests [2 SP] ✅ DONE
- [x] Created reminder.controller.spec.ts — 10 tests, all passing
- [x] Test POST /reminders — structured + AI-parsed (inputUtente) modes
- [x] Test GET /reminders — list with status/priority/periodo filters + pagination
- [x] Test POST /reminders/:id/complete — marks as completato
- [x] Test DELETE /reminders/:id — hard delete (not soft delete — uses prisma.delete)
- [x] Test DELETE /reminders/bulk — bulk hard delete with tenant+user scoping
- [x] Verified tenant isolation — all service calls receive tenantId + userId from req.user

## Dependencies
- S01-S02 complete (calendar backend verified)

## Risks
- R1: Contact history wiring may require joining across email + calendar tables
- Mitigation: Start with email interactions only, add calendar in next sprint
- R2: GIN index may not exist yet — check schema first
- Mitigation: Add migration if index missing

## Definition of Done
- [ ] All 20+ contacts endpoints tested and documented
- [ ] Contact history returns real interaction data (not empty stub)
- [ ] GIN trigram index verified or created
- [ ] Reminder controller has test coverage
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Tests pass: `npx jest --testPathPattern="contacts|reminder"`
