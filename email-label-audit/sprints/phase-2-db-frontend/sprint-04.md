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
- [ ] Map ALL backend endpoints that return Email objects
- [ ] For each, verify `emailLabels` is included with `label: { id, name, color }` select
- [ ] Fix any endpoint missing the include
- [ ] Endpoints to check:
  - `GET /emails` (list) — email-folder.service.ts (likely builds query here)
  - `GET /emails/:id` (detail) — email-crud.service.ts ✓
  - `GET /emails/search` — email-search.service.ts ✓
  - `POST /emails/:id/fetch-content` — email-fetch.service.ts ✓
  - Any socket.io events that send email data
- [ ] Files: all email service files

### T-0402: Standardize emailLabels select shape [2 SP]
- [ ] Create shared constant: `EMAIL_LABELS_SELECT`
```typescript
const EMAIL_LABELS_SELECT = {
  emailLabels: {
    select: {
      id: true,
      emailId: true,
      labelId: true,
      createdAt: true,
      label: {
        select: { id: true, name: true, color: true },
      },
    },
  },
} as const;
```
- [ ] Replace all inline emailLabels selects with this constant
- [ ] Files: new shared constant file, all email services

### T-0403: Add hex color validation in frontend [2 SP]
- [ ] Create `isValidHexColor(color: string): boolean` utility
- [ ] Use in `formatEmailToThread()` to validate label colors
- [ ] Fallback to MUI `grey[500]` for invalid colors
- [ ] Add to `LabelColorPicker` save validation
- [ ] Files: `email-formatters.ts`, `label-colors.ts`

### T-0404: Clean up ghost EmailLabel records [2 SP]
- [ ] Query EmailLabel records where `label.isArchived = true`
- [ ] Option A: Hard-delete these junction records (soft-deleted label = no association)
- [ ] Option B: Filter them out in all queries (`where: { label: { isArchived: false } }`)
- [ ] Implement chosen option
- [ ] Files: `labels.service.ts`, potentially migration script

### T-0405: Verify frontend Email type matches backend response [1 SP]
- [ ] Compare `frontend/lib/api/emails.ts:Email` interface with actual backend JSON
- [ ] Check: `emailLabels` shape matches backend select
- [ ] Check: `labels: string[]` (Google IDs) is actually returned
- [ ] Check: `aiLabels: string[]` is actually returned
- [ ] Fix any mismatches
- [ ] Files: `frontend/lib/api/emails.ts`

## Dependencies
- S03 complete (backend sync layer must be stable)

## Risks
- R3: Adding emailLabels include to list query may slow down email listing
- Mitigation: Use minimal select (id, name, color only), benchmark with 1K+ emails

## Definition of Done
- [ ] ALL email endpoints return emailLabels with label details
- [ ] Shared select constant used everywhere
- [ ] Color validation in frontend formatters
- [ ] No ghost labels from soft-deleted UserLabels
- [ ] Frontend Email type matches backend response exactly
- [ ] `npx tsc --noEmit` passes in both backend and frontend

## Deliverables
- Backend email services (updated with emailLabels include)
- `frontend/lib/label-colors.ts` (hex validation added)
- `frontend/components/email/utils/email-formatters.ts` (validation)
- `frontend/lib/api/emails.ts` (type corrections if needed)
