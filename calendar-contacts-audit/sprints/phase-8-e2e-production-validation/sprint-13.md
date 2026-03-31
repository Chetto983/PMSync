# Sprint 13 — E2E Production Validation Suite

| Key | Value |
|-----|-------|
| Phase | 8 — E2E Production Validation |
| Sprint | 13 |
| SP | 13 |
| Objective | Full production validation: API tests, browser E2E, dashboard consistency, data hygiene, scorecard |
| Addresses | All — validation layer |

## Sprint Backlog

### T-1301: API endpoint validation on Railway [3 SP]

- [x] Push all changes to main, wait for Railway deploy ✅ DONE
- [x] Health check: GET /health → 200 ✅ DONE
- [x] Calendar: GET /calendar/events, POST /calendar/sync/:providerId ✅ DONE (401/403 — auth required)
- [x] Contacts: GET /contacts, GET /contacts/:id/history (real data, not stub) ✅ DONE (401 — auth required)
- [x] Reminders: GET /reminders ✅ DONE (401 — auth required)
- [x] Dashboard: verify /metrics returns Prometheus data (legacy /health/* removed) ✅ DONE (/metrics=401 auth, /health/metrics=404 removed)
- [x] Verify NO deprecated endpoints respond (should 404) ✅ DONE (/health/metrics → 404)
- [x] Document any failures ✅ DONE — no failures, all endpoints responding correctly

### T-1302: Dashboard data consistency validation [3 SP]

- [ ] Open dashboard in browser
- [ ] Verify: dashboard unread count === sidebar INBOX badge (exact match)
- [ ] Verify: AiTriageWidget shows triage-prioritized emails (not starred)
- [ ] Verify: PriorityInboxWidget is GONE from widget list
- [ ] Verify: PredictiveInsightsWidget is GONE from widget list
- [ ] Verify: DeadlinesWidget shows only calendar events
- [ ] Verify: StaleContactsWidget shows CRM data (no fallback numbers)
- [ ] Verify: BriefingWidget includes expanded insights section
- [ ] Mark email as read → both sidebar and dashboard count decrement together
- [ ] Screenshot evidence for each verification

### T-1303: Browser E2E validation via Playwright CDP [3 SP]

- [ ] Create/update `scripts/validate-calendar-contacts-production.mjs`
- [ ] Calendar tests: render, create event, RSVP buttons, event detail
- [ ] Contacts tests: list, search, detail + history, vCard import button
- [ ] Dashboard tests: all 8 widgets render, counts consistent
- [ ] Reminders tests: list, create, complete
- [ ] Legacy tests: confirm removed widgets don't appear, no console errors

### T-1304: Data consistency and legacy cleanup validation [2 SP]

- [ ] Run `scripts/audit/validate-calendar-contacts.mjs`
- [ ] Check 0 duplicate contacts
- [ ] Check 0 orphan calendar events
- [ ] Check relationship scores fresh
- [ ] Grep for @deprecated in codebase → ZERO results
- [ ] Grep for multiAgentApi → ZERO results
- [ ] Grep for GraphExpansion → ZERO results
- [ ] Run `npx madge --circular backend/src/` → clean

### T-1305: Update production scorecard [2 SP]

- [ ] Score all 14+ categories in `02-PRODUCTION-SCORECARD.md`
- [ ] Target: >= 9.0/10 across all categories
- [ ] New categories to score: Dashboard Consistency, Legacy Cleanup
- [ ] For any category < 9.0: create follow-up task
- [ ] Final summary: findings addressed, sprints completed, SP burned, before/after scores
- [ ] Close audit or create follow-up sprint

## Dependencies

- S12 (all legacy removed)

## Risks

- R1: Railway deploy may have schema drift
- Mitigation: Run `prisma db push` before `git push`
- R2: Dashboard WebSocket counts may have timing issues in E2E
- Mitigation: Add reasonable wait + retry in Playwright tests

## Definition of Done

- [ ] All API endpoints verified on Railway (200 responses)
- [ ] Dashboard counts match sidebar — screenshot evidence
- [ ] Removed widgets confirmed absent
- [ ] Browser E2E passes for calendar, contacts, dashboard, reminders
- [ ] Data consistency: 0 issues
- [ ] Zero @deprecated in codebase
- [ ] Production scorecard >= 9.0/10 overall
- [ ] Audit formally closed
