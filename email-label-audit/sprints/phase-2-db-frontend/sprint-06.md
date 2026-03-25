# Sprint 06 - AI Labels, Counts, Translations

| Key | Value |
|-----|-------|
| Phase | 2 - DB <-> Frontend |
| Sprint | 06 |
| SP | 10 |
| Objective | Surface AI-suggested labels, fix count staleness, complete translation gaps |
| Addresses | H3, M4, M5, L2, L3 |

## Sprint Backlog

### T-0601: Display AI-suggested labels in email list [3 SP]
- [ ] `Email.aiLabels[]` contains AI-suggested label names (strings, not IDs)
- [ ] Show as secondary, outlined chips below user labels in ThreadListItem
- [ ] Style: lighter color, "AI" prefix or small icon to distinguish from user labels
- [ ] Clicking AI label creates a UserLabel from it (promote to user label)
- [ ] Files: `frontend/components/email/list/ThreadListItem.tsx`, `email-formatters.ts`

### T-0602: Display AI labels in ExpandedMessage [1 SP]
- [ ] Show AI-suggested labels in a separate "AI Suggestions" section
- [ ] "Accept" button promotes to user label, "Dismiss" button removes from aiLabels
- [ ] Files: `frontend/components/email/thread/ExpandedMessage.tsx`

### T-0603: Fix label count staleness after bulk operations [2 SP]
- [ ] After `useBulkAddLabels` and `useBulkRemoveLabels`, invalidate:
  - `labelKeys.lists()` (already done ✓)
  - Individual label detail queries
  - Sidebar count cache
- [ ] Verify React Query invalidation cascade covers all dependent queries
- [ ] Add optimistic count update in sidebar during bulk operations
- [ ] Files: `frontend/hooks/queries/use-labels.ts`, `frontend/hooks/queries/use-emails.ts`

### T-0604: Fix hardcoded Italian fallback strings [1 SP]
- [ ] `ColorPicker.tsx:166,222` has Italian fallbacks: 'Colori predefiniti', 'Colore personalizzato'
- [ ] `LabelColorPicker.tsx:62-63` also has Italian fallbacks
- [ ] Verify `en.ts` has `email.labels.presetColors` and `email.labels.customColor` (already present ✓)
- [ ] Remove Italian fallbacks — use translation keys only
- [ ] Also check `calendar.colorPicker.presetColors/customColor` used in ColorPicker.tsx
- [ ] Files: `ColorPicker.tsx`, `LabelColorPicker.tsx`

### T-0605: Add backend validation for aiPrompt max length [1 SP]
- [ ] Add `@MaxLength(500)` validation to `aiPrompt` in labels DTO
- [ ] Return 400 Bad Request for oversized prompts
- [ ] Files: `backend/src/modules/labels/dto/labels.dto.ts`

### T-0606: Add JSON schema validation for label color [1 SP]
- [ ] Validate `color` field in labels DTO: must be `{ backgroundColor: string, textColor: string }`
- [ ] Both must be valid hex colors
- [ ] Return 400 for malformed color objects
- [ ] Files: `backend/src/modules/labels/dto/labels.dto.ts`

### T-0607: Audit all remaining translation gaps [1 SP]
- [ ] Grep for hardcoded English/Italian strings in label components
- [ ] Grep for `'Label'`, `'Labels'`, `'Color'`, `'Delete'` etc. in tsx files
- [ ] Add missing keys to en.ts and it.ts
- [ ] Files: `frontend/locales/en.ts`, `frontend/locales/it.ts`

## Dependencies
- S04 complete (emailLabels in API responses)
- S05 can run in parallel with S06

## Risks
- AI label display may create visual clutter in email list
- Mitigation: Limit to 1 AI label chip, "AI" badge small and subtle

## Definition of Done
- [ ] AI labels visible in email list and detail view
- [ ] Sidebar counts accurate after bulk operations
- [ ] No hardcoded Italian strings remain
- [ ] Backend validates aiPrompt length and color format
- [ ] `npx tsc --noEmit` passes in both backend and frontend
- [ ] `npm run lint:win` passes

## Deliverables
- `frontend/components/email/list/ThreadListItem.tsx` (AI label chips)
- `frontend/components/email/thread/ExpandedMessage.tsx` (AI label section)
- `frontend/hooks/queries/use-labels.ts` (invalidation fixes)
- `frontend/components/common/ColorPicker.tsx` (i18n fix)
- `backend/src/modules/labels/dto/labels.dto.ts` (validation)
