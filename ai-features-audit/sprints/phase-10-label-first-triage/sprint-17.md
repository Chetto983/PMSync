# Sprint 17 — Inbox Lanes, Reasoning UI & Workflow Views

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 17 |
| **SP** | 14 |
| **Objective** | Expose lane-based inbox views, visible triage reasoning, and follow-up workflow in the email frontend |
| **Addresses** | LFT-C2 |

---

## Sprint Backlog

### T-1701: Add translations for lanes and triage UI [1 SP]
- [x] Add to `frontend/locales/en.ts` under `triage` namespace ✅ DONE
- [x] Add same keys to `frontend/locales/it.ts` ✅ DONE
- [x] Verify with `cd frontend && npx tsc --noEmit` ✅ DONE

### T-1702: Add lane filter to email list API and hooks [2 SP]
- [x] Backend: Add `lane` filter to email list endpoint ✅ DONE
- [x] Frontend: Update email list query hook to accept `lane` parameter ✅ DONE
- [x] Add `useLaneCounts()` hook + backend `GET /ai/triage-rules/lane-counts` ✅ DONE
- [x] Deprecate client-side `deriveTriageLane()` ✅ DONE
- [x] Verify type-checks ✅ DONE

### T-1703: Build lane tab bar component [3 SP]
- [x] Create `frontend/src/components/triage/LaneTabBar.tsx` (113 lines) ✅ DONE
- [x] 6 MUI Tabs with semantic theme colors and count badges ✅ DONE
- [x] Add `lane` to EmailFilters store ✅ DONE
- [x] Verify type-check ✅ DONE

### T-1704: Build triage reasoning chip/tooltip [2 SP]
- [x] Create `frontend/src/components/triage/TriageReasonChip.tsx` (170 lines) ✅ DONE
- [x] Compact chip + Popover with labels, priority, intent, actionability ✅ DONE
- [x] Add aiLane/aiIntent/aiActionability to frontend Email type ✅ DONE

### T-1705: Integrate lane tab bar into email list page [3 SP]
- [x] Add LaneTabBar to email page with URL sync (?lane=X) ✅ DONE
- [x] Wire lane filter through store → API query ✅ DONE
- [x] Add TriageReasonChip to ThreadListItem Line 3 ✅ DONE
- [x] Add 'lane' EmptyState variant ✅ DONE
- [x] Pass aiLane/aiPriorityReason/aiIntent/aiActionability through formatEmailToThread ✅ DONE

### T-1706: Add follow-up workflow indicators [2 SP]
- [x] Add follow-up icons (CheckSquare/Clock) next to subject in email list ✅ DONE
- [x] Create FollowUpIndicator component with TODO/WAITING badges ✅ DONE
- [x] Add aiLane/aiIntent/aiActionability to emailListSelect (backend) ✅ DONE

### T-1707: Add triage status to email detail view [1 SP]
- [x] Create TriageStatusSection component ✅ DONE
- [x] Add to ExpandedMessage between AI Summary and User Labels ✅ DONE
- [x] Pass triage fields through selectedEmailData ✅ DONE

---

## Dependencies

- Sprint 15 complete (lane field in schema, lane assignment service)
- Sprint 16 complete (translations infrastructure)

## Risks

1. Adding lane tabs to email list is high-visibility — must not break existing email navigation.
2. Lane count queries could be expensive if not indexed. Verify `@@index([tenantId, aiLane])` exists.
3. Triage reasoning popover must be lightweight — don't load extra API calls on hover, use data already in list response.

## Definition of Done

- [ ] `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` pass
- [ ] Email list shows lane tabs with counts
- [ ] Clicking a lane tab filters emails
- [ ] Each email row shows triage reasoning chip
- [ ] Email detail shows full triage breakdown
- [ ] Follow-up indicators appear in list and detail
- [ ] All strings use translations
- [ ] All colors use MUI theme
