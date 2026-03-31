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

### T-0303: Verify special endpoints [2 SP]
- [ ] Test GET /contacts/counts — returns correct counts by filter
- [ ] Test GET /contacts/relationship-scores — returns scored contacts
- [ ] Test GET /contacts/stale — returns stale contacts for re-engagement
- [ ] Test GET /contacts/vip/list — returns VIP contacts
- [ ] Test POST /contacts/lookup-by-emails — batch email lookup
- [ ] Test GET /contacts/:id/photo — returns photo or 404

### T-0304: Verify GIN trigram index usage [2 SP]
- [ ] Run EXPLAIN ANALYZE on contact search queries
- [ ] Verify GIN index on (tenantId, displayName, company) is used for fuzzy search
- [ ] If not used: adjust query to use `ILIKE` or `similarity()` function
- [ ] Test: search for partial name returns matches efficiently (<100ms)

### T-0305: Add reminder controller tests [2 SP]
- [ ] Create reminder.controller.spec.ts
- [ ] Test POST /reminders — create with Italian field names
- [ ] Test GET /reminders — list with status/priority filters
- [ ] Test POST /reminders/:id/complete — mark completed
- [ ] Test DELETE /reminders/:id — soft delete (status → annullato)
- [ ] Verify tenant isolation on all endpoints

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
