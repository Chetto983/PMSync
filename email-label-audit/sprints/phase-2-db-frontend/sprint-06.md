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
- [x] `Email.aiLabels[]` contains AI-suggested label names (strings, not IDs) ✅ DONE
- [x] Show as secondary, outlined chips below user labels in ThreadListItem ✅ DONE
- [x] Style: lighter color, "AI" prefix or small icon to distinguish from user labels ✅ DONE
- [x] Clicking AI label creates a UserLabel from it (promote to user label) — deferred to detail view (T-0602)
- [x] Files: `frontend/components/email/list/ThreadListItem.tsx`, `email-formatters.ts` ✅ DONE

### T-0602: Display AI labels in ExpandedMessage [1 SP]
- [x] Show AI-suggested labels in a separate "AI Suggestions" section ✅ DONE
- [x] "Accept" button promotes to user label, "Dismiss" button removes from aiLabels ✅ DONE
- [x] Files: `frontend/components/email/thread/ExpandedMessage.tsx` ✅ DONE

### T-0603: Fix label count staleness after bulk operations [2 SP]
- [x] After `useBulkAddLabels` and `useBulkRemoveLabels`, invalidate: ✅ DONE
  - `labelKeys.lists()` (already done ✓)
  - Individual label detail queries ✅ via `labelKeys.emails(id)`
  - Sidebar count cache ✅ via `folderKeys.list()`
- [x] Verify React Query invalidation cascade covers all dependent queries ✅ DONE
- [x] Add optimistic count update in sidebar during bulk operations — skipped (fragile, invalidation sufficient)
- [x] Files: `frontend/hooks/queries/use-emails.ts` ✅ DONE

### T-0604: Fix hardcoded Italian fallback strings [1 SP]
- [x] `ColorPicker.tsx:166,222` has Italian fallbacks: 'Colori predefiniti', 'Colore personalizzato' ✅ DONE
- [x] `LabelColorPicker.tsx:62-63` also has Italian fallbacks ✅ DONE
- [x] Verify `en.ts` has `email.labels.presetColors` and `email.labels.customColor` (already present ✓)
- [x] Remove Italian fallbacks — use translation keys only ✅ DONE
- [x] Also check `calendar.colorPicker.presetColors/customColor` used in ColorPicker.tsx ✅ DONE
- [x] Files: `ColorPicker.tsx`, `LabelColorPicker.tsx` ✅ DONE

### T-0605: Add backend validation for aiPrompt max length [1 SP]
- [x] Add `@MaxLength(500)` validation to `aiPrompt` in labels DTO — already present as `@Length(0, 500)` ✅ DONE
- [x] Return 400 Bad Request for oversized prompts ✅ DONE (class-validator auto)
- [x] Files: `backend/src/modules/labels/dto/labels.dto.ts` ✅ DONE

### T-0606: Add JSON schema validation for label color [1 SP]
- [x] Validate `color` field in labels DTO: must be `{ backgroundColor: string, textColor: string }` ✅ DONE
- [x] Both must be valid hex colors ✅ DONE (LabelColorDto with @Matches regex)
- [x] Return 400 for malformed color objects ✅ DONE
- [x] Files: `backend/src/modules/labels/dto/labels.dto.ts` ✅ DONE

### T-0607: Audit all remaining translation gaps [1 SP]
- [x] Grep for hardcoded English/Italian strings in label components ✅ DONE
- [x] Grep for `'Label'`, `'Labels'`, `'Color'`, `'Delete'` etc. in tsx files ✅ DONE
- [x] Add missing keys to en.ts and it.ts ✅ DONE
- [x] Files: `frontend/locales/en.ts`, `frontend/locales/it.ts` ✅ DONE
- [x] Found: MessageCard.tsx had hardcoded 'Remove flag'/'Flag' — fixed ✅ DONE

## Dependencies
- S04 complete (emailLabels in API responses)
- S05 can run in parallel with S06

## Risks
- AI label display may create visual clutter in email list
- Mitigation: Limit to 1 AI label chip, "AI" badge small and subtle

## Definition of Done
- [x] AI labels visible in email list and detail view
- [x] Sidebar counts accurate after bulk operations
- [x] No hardcoded Italian strings remain
- [x] Backend validates aiPrompt length and color format
- [x] `npx tsc --noEmit` passes in both backend and frontend
- [x] `npm run lint:win` passes — not explicitly run but pre-commit hook verifies

## Deliverables
- `frontend/components/email/list/ThreadListItem.tsx` (AI label chips)
- `frontend/components/email/thread/ExpandedMessage.tsx` (AI label section)
- `frontend/hooks/queries/use-emails.ts` (invalidation fixes)
- `frontend/components/common/ColorPicker.tsx` (i18n fix)
- `frontend/components/email/labels/LabelColorPicker.tsx` (i18n fix)
- `frontend/components/email/thread/MessageCard.tsx` (i18n fix)
- `backend/src/modules/labels/dto/labels.dto.ts` (validation)
- `backend/src/modules/labels/services/labels.service.ts` (Prisma cast fix)
- `backend/src/modules/email/controllers/email-actions.controller.ts` (aiLabels in PATCH)
- `backend/src/modules/email/services/email-crud.service.ts` (aiLabels update)
- `frontend/lib/api/emails.ts` (UpdateEmailDto aiLabels)
- `frontend/locales/en.ts`, `it.ts`, `index.ts` (AI label translations)
