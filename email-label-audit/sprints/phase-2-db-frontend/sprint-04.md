# Sprint 04 - EmailLabel Includes & Type Safety

| Key | Value |
|-----|-------|
| Phase | 2 - DB <-> Frontend |
| Sprint | 04 |
| SP | 10 |
| Objective | Ensure all email endpoints return emailLabels, fix type safety, clean up ghost labels |
| Addresses | C4, H4, M3 |

## Sprint Backlog

### T-0401: Audit all email query endpoints for emailLabels include [3 SP]
- [x] Map ALL backend endpoints that return Email objects ✅ DONE
- [x] For each, verify `emailLabels` is included with `label: { id, name, color }` select ✅ DONE
- [x] Fix any endpoint missing the include ✅ DONE (all already included)
- [x] Endpoints to check:
  - `GET /emails` (list) — emailListSelect ✅
  - `GET /emails/:id` (detail) — emailLabelsInclude ✅
  - `GET /emails/search` — emailSearchSelect ✅
  - `POST /emails/:id/fetch-content` — emailLabelsInclude ✅
  - Socket.io: emits via LabelsService use emailLabelsInclude ✅
- [x] Files: all email service files ✅ DONE

### T-0402: Standardize emailLabels select shape [2 SP]
- [x] Shared constants already exist in `prisma-select.utils.ts`: `emailLabelsInclude`, `emailLabelsSelect` ✅ DONE
- [x] All inline emailLabels selects already replaced with shared constants (prior commit 7741b5e4) ✅ DONE
- [x] Files: `prisma-select.utils.ts`, all email services ✅ DONE

### T-0403: Add hex color validation in frontend [2 SP]
- [x] `isValidHexColor()` already exists in `lib/label-colors.ts` and `components/common/ColorPicker.tsx` ✅ DONE
- [x] Added validation in `formatEmailToThread()` with `#9E9E9E` fallback ✅ DONE (commit 1b7dbc35)
- [x] `LabelColorPicker` already validates on save via `ColorPicker.tsx` lines 126/141 ✅ DONE
- [x] Files: `email-formatters.ts`, `label-colors.ts` ✅ DONE

### T-0404: Clean up ghost EmailLabel records [2 SP]
- [x] Option B chosen: filter at query time (preserves data, reversible) ✅ DONE
- [x] Added `where: { label: { isArchived: false } }` to `emailLabelsInclude` and `emailLabelsSelect` (prior commit 138ed64e) ✅ DONE
- [x] All email endpoints inherit the filter via shared constants ✅ DONE
- [x] Files: `prisma-select.utils.ts` ✅ DONE

### T-0405: Verify frontend Email type matches backend response [1 SP]
- [x] Compared `EmailLabel` interface with backend `emailLabelsInclude` select shape ✅ DONE
- [x] Fixed: junction fields (id, emailId, labelId, createdAt) made optional — backend doesn't select them ✅ DONE
- [x] Fixed: `label` made required (not optional) — always present via shared constants ✅ DONE
- [x] `labels: string[]` (Google IDs) confirmed returned via `emailListSelect` ✅ DONE
- [x] `aiLabels: string[]` confirmed returned via `emailListSelect` ✅ DONE
- [x] Files: `frontend/lib/api/emails.ts` (commit 38c4412b) ✅ DONE

## Dependencies
- S03 complete (backend sync layer must be stable)

## Risks
- R3: Adding emailLabels include to list query may slow down email listing
- Mitigation: Use minimal select (id, name, color only), benchmark with 1K+ emails

## Definition of Done
- [x] ALL email endpoints return emailLabels with label details
- [x] Shared select constant used everywhere
- [x] Color validation in frontend formatters
- [x] No ghost labels from soft-deleted UserLabels
- [x] Frontend Email type matches backend response exactly
- [x] `npx tsc --noEmit` passes in both backend and frontend

## Deliverables
- Backend email services (updated with emailLabels include)
- `frontend/lib/label-colors.ts` (hex validation added)
- `frontend/components/email/utils/email-formatters.ts` (validation)
- `frontend/lib/api/emails.ts` (type corrections if needed)
