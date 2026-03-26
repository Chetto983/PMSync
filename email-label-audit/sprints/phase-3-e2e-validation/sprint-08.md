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
- [x] Test: Create label (with color, name, parent) ✅ DONE
- [x] Test: Label appears in sidebar tree ✅ DONE
- [x] Test: Add label to email from list view ✅ DONE
- [x] Test: Label chip visible on email in list ✅ DONE
- [x] Test: Open email detail -> labels visible ✅ DONE
- [x] Test: Remove label from detail view ✅ DONE
- [x] Test: Delete label -> confirmation dialog -> label removed from sidebar ✅ DONE
- [x] Test: Label filter in sidebar shows correct emails ✅ DONE
- [x] Connect via Edge CDP (port 9222) per established pattern ✅ DONE
- [x] Files: scripts/validate-email-labels-e2e.mjs ✅ DONE

### T-0802: Playwright E2E - Folder/label count accuracy [2 SP]
- [x] Test: Sidebar INBOX count matches actual emails in INBOX view ✅ DONE
- [x] Test: Label count in sidebar matches emails shown when filtering by label ✅ DONE
- [x] Test: After starring/archiving email, counts update correctly ✅ DONE
- [x] Test: After adding label to emails, label count increments ✅ DONE (covered by T-0801 flow)
- [x] Files: combined into scripts/validate-email-labels-e2e.mjs ✅ DONE

### T-0803: Production data validation on Railway [1 SP]
- [x] Run `validate-email-label-consistency.ts` against Railway production DB ✅ DONE
- [x] Document findings ✅ DONE (see below)
- [x] Fix any production inconsistencies found ✅ N/A — no issues
- [x] Files: CHECKPOINT.md ✅ DONE

**Production Validation Results (2026-03-26):**
- Railway health: ✅ healthy (DB 2ms, Redis 7ms, Mistral 146ms)
- `GET /health/label-consistency`: 0 emails, 0 inconsistencies (N/A rate)
- Local `validate-email-labels.mjs`: 0 mismatches, 0 stale IDs
- No production inconsistencies to fix

### T-0804: Add monitoring/alerting for label consistency [2 SP]
- [x] Add health check endpoint: `GET /health/email-labels` ✅ DONE
- [x] Checks run on schedule (BullMQ cron job, daily at 2:30 AM): ✅ DONE
  - Folder/labels drift count
  - Ghost EmailLabel count
  - Stale Gmail label ID count
- [x] Log warnings when thresholds exceeded ✅ DONE
- [x] Emit metric events for dashboard (via health endpoint, Prometheus scrapes) ✅ DONE
- [x] Files: label-consistency.service.ts ✅ DONE

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
