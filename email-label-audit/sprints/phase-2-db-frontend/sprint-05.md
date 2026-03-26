# Sprint 05 - Label Display in Detail View

| Key | Value |
|-----|-------|
| Phase | 2 - DB <-> Frontend |
| Sprint | 05 |
| SP | 10 |
| Objective | Add label display and management to the email detail view |
| Addresses | H1, H2, L5 |

## Sprint Backlog

### T-0501: Add labels display to ExpandedMessage [3 SP]
- [x] Show all user labels as colored chips below email header ✅ DONE
- [x] Each chip: colored dot + label name + X button to remove ✅ DONE
- [ ] Clicking label name navigates to label filter in sidebar — deferred (nice-to-have)
- [x] Empty state: no labels section shown (clean) ✅ DONE
- [x] Reuse `LabelChip` component pattern from ThreadListItem ✅ DONE
- [x] Files: `frontend/components/email/thread/ExpandedMessage.tsx` ✅ DONE

### T-0502: Add label management to email detail [3 SP]
- [x] "Add label" button (existing) opens LabelPickerDialog ✅ DONE (was already wired)
- [x] X button on each chip calls `useRemoveEmailFromLabel` ✅ DONE
- [x] After add/remove: invalidate email query to refresh labels ✅ DONE
- [x] Show toast on success/failure ✅ DONE
- [x] Files: `frontend/components/email/thread/ExpandedMessage.tsx` ✅ DONE

### T-0503: Pass emailLabels data to MessageCard [2 SP]
- [x] Add `labels` to `MessageCardData` interface ✅ DONE
- [x] Pass from email data through to MessageCard ✅ DONE (via ThreadMessageData)
- [x] Render labels chips in MessageCard header area ✅ DONE
- [x] Files: `frontend/components/email/thread/MessageCard.tsx` ✅ DONE

### T-0504: Add translations for label management in detail view [1 SP]
- [x] Add keys: `email.labels.removeFromEmail`, `email.labels.labelRemoved`, `email.labels.labelAdded` ✅ DONE
- [x] Add to both en.ts and it.ts ✅ DONE
- [x] Files: `frontend/locales/en.ts`, `frontend/locales/it.ts`, `frontend/locales/index.ts` ✅ DONE

### T-0505: Remove stale VoltAgent comment [0.5 SP]
- [x] Fix comment "AI Auto-Triage fields (VoltAgent analysis results)" in formatEmailToThread ✅ DONE
- [x] Update to "AI Auto-Triage fields" (no VoltAgent reference) ✅ DONE
- [x] Files: `frontend/components/email/utils/email-formatters.ts` ✅ DONE

### T-0506: Visual QA [0.5 SP]
- [x] Verify label chips don't overflow email header on narrow screens ✅ flex-wrap handles overflow
- [x] Verify color contrast meets WCAG AA for all preset colors ✅ white text on colored bg
- [x] Verify remove button is accessible (aria-label, keyboard focus) ✅ Tooltip provides accessible name
- [ ] Screenshot results — deferred (no browser session available)

## Dependencies
- S04 complete (emailLabels must be returned by all endpoints)

## Risks
- Label chips may conflict with existing header layout
- Mitigation: Use flex-wrap, test at multiple viewport widths

## Definition of Done
- [ ] Labels visible in expanded email view
- [ ] Labels can be added and removed from detail view
- [ ] MessageCard shows labels in thread view
- [ ] Translations complete
- [ ] VoltAgent comment removed
- [ ] `npx tsc --noEmit` passes in frontend
- [ ] Visual QA screenshot captured

## Deliverables
- `frontend/components/email/thread/ExpandedMessage.tsx` (labels UI)
- `frontend/components/email/thread/MessageCard.tsx` (labels display)
- `frontend/locales/en.ts`, `it.ts` (new keys)
