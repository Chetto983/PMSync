# Sprint 08 - Browser E2E & Monitoring

| Key | Value |
|-----|-------|
| Phase | 3 - E2E Validation |
| Sprint | 08 |
| SP | 8 |
| Objective | Real browser E2E tests for label workflows, monitoring for ongoing consistency |
| Addresses | Final validation, regression prevention, production monitoring |

## Sprint Backlog

### T-0801: Playwright E2E - Label CRUD workflow [3 SP]
- [ ] Test: Create label (with color, name, parent)
- [ ] Test: Label appears in sidebar tree
- [ ] Test: Add label to email from list view
- [ ] Test: Label chip visible on email in list
- [ ] Test: Open email detail -> labels visible
- [ ] Test: Remove label from detail view
- [ ] Test: Delete label -> confirmation dialog -> label removed from sidebar
- [ ] Test: Label filter in sidebar shows correct emails
- [ ] Connect via Edge CDP (port 9222) per established pattern
- [ ] Files: new e2e test file

### T-0802: Playwright E2E - Folder/label count accuracy [2 SP]
- [ ] Test: Sidebar INBOX count matches actual emails in INBOX view
- [ ] Test: Label count in sidebar matches emails shown when filtering by label
- [ ] Test: After starring/archiving email, counts update correctly
- [ ] Test: After adding label to emails, label count increments
- [ ] Files: new e2e test file

### T-0803: Production data validation on Railway [1 SP]
- [ ] Run `validate-email-label-consistency.ts` against Railway production DB
- [ ] Document findings
- [ ] Fix any production inconsistencies found
- [ ] Files: CHECKPOINT.md

### T-0804: Add monitoring/alerting for label consistency [2 SP]
- [ ] Add health check endpoint: `GET /api/health/email-labels`
- [ ] Checks run on schedule (BullMQ cron job, daily):
  - Folder/labels drift count
  - Ghost EmailLabel count
  - Stale Gmail label ID count
- [ ] Log warnings when thresholds exceeded
- [ ] Emit metric events for dashboard
- [ ] Files: new health check service

## Dependencies
- S07 complete (validation scripts must exist)
- Railway environment accessible

## Risks
- Production data may reveal issues not caught in dev
- Mitigation: Validation script is read-only first, fixes applied after review

## Definition of Done
- [ ] Playwright E2E tests pass for label CRUD workflow
- [ ] Folder/label count E2E tests pass
- [ ] Production validation completes with documented results
- [ ] Health check endpoint deployed and running
- [ ] CHECKPOINT.md documents final state
- [ ] All sprints retrospective written

## Deliverables
- Playwright E2E test files (new)
- Health check service (new)
- `sprints/phase-3-e2e-validation/CHECKPOINT.md` (final validation report)
- Retrospective document
