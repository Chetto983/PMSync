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
- [ ] Show all user labels as colored chips below email header
- [ ] Each chip: colored dot + label name + X button to remove
- [ ] Clicking label name navigates to label filter in sidebar
- [ ] Empty state: no labels section shown (clean)
- [ ] Reuse `LabelChip` component pattern from ThreadListItem
- [ ] Files: `frontend/components/email/thread/ExpandedMessage.tsx`

### T-0502: Add label management to email detail [3 SP]
- [ ] "Add label" button (existing) opens LabelPickerDialog
- [ ] X button on each chip calls `useRemoveEmailFromLabel`
- [ ] After add/remove: invalidate email query to refresh labels
- [ ] Show toast on success/failure
- [ ] Files: `frontend/components/email/thread/ExpandedMessage.tsx`

### T-0503: Pass emailLabels data to MessageCard [2 SP]
- [ ] Add `labels` to `MessageCardData` interface
- [ ] Pass from email data through to MessageCard
- [ ] Render labels chips in MessageCard header area
- [ ] Files: `frontend/components/email/thread/MessageCard.tsx`

### T-0504: Add translations for label management in detail view [1 SP]
- [ ] Add keys: `email.labels.removeFromEmail`, `email.labels.labelRemoved`, `email.labels.labelAdded`
- [ ] Add to both en.ts and it.ts
- [ ] Files: `frontend/locales/en.ts`, `frontend/locales/it.ts`, `frontend/locales/index.ts`

### T-0505: Remove stale VoltAgent comment [0.5 SP]
- [ ] Fix comment "AI Auto-Triage fields (VoltAgent analysis results)" in formatEmailToThread
- [ ] Update to "AI Auto-Triage fields" (no VoltAgent reference)
- [ ] Files: `frontend/components/email/utils/email-formatters.ts`

### T-0506: Visual QA [0.5 SP]
- [ ] Verify label chips don't overflow email header on narrow screens
- [ ] Verify color contrast meets WCAG AA for all preset colors
- [ ] Verify remove button is accessible (aria-label, keyboard focus)
- [ ] Screenshot results

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
