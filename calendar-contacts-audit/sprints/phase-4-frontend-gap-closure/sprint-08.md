# Sprint 08 — Contacts Frontend: vCard UI, History, Dedup

| Key | Value |
|-----|-------|
| Phase | 4 — Frontend Gap Closure |
| Sprint | 08 |
| SP | 15 |
| Objective | Build vCard import UI, wire contact history, add duplicate detection during import, persist filters |
| Addresses | CON-H1, CON-H3, CON-L1, CON-L2, CON-L3 |

## Sprint Backlog

### T-0801: Build vCard import dialog [4 SP]
- [x] Add translations: `contacts.importVCard.*` in en.ts, it.ts, index.ts ✅ DONE
- [x] Create `VCardImportDialog.tsx` in `frontend/components/contacts/` ✅ DONE
- [x] File drop zone accepting .vcf files ✅ DONE
- [x] Preview parsed contacts before import (name, email, phone) ✅ DONE
- [x] Call POST /contacts/import/vcard with file ✅ DONE
- [x] Show progress: uploading → parsing → importing → done ✅ DONE
- [x] Handle errors: invalid file, empty file, encoding issues ✅ DONE
- [x] Add "Import vCard" button to ContactSidebar ✅ DONE
- [x] Max 500 lines per component ✅ DONE

### T-0802: Wire contact history to real data [3 SP]
- [x] Read `ContactActivityFeed.tsx` — check expected data shape ✅ DONE
- [x] Backend now returns real history data (from S03 T-0302) ✅ DONE
- [x] Wire ContactActivityFeed to use TanStack Query hook ✅ DONE (already wired)
- [x] Show: email sent, email received, calendar meeting, deal update ✅ DONE (deal update pending CRM integration)
- [x] Each item: icon + timestamp + summary line ✅ DONE
- [x] Handle loading/empty/error states ✅ DONE
- [x] Translations for activity types ✅ DONE

### T-0803: Duplicate detection during import [3 SP]
- [x] After vCard parsing, check each contact against existing contacts ✅ DONE
- [x] Match on: email (exact) via lookupByEmails ✅ DONE
- [x] Use POST /contacts/lookup-by-emails for batch email check ✅ DONE
- [x] Show duplicate warning in import preview with count ✅ DONE
- [x] Duplicate rows highlighted with warning chip ✅ DONE
- [x] Server-side skipping of duplicates (backend handles) ✅ DONE

### T-0804: Contact merge UI [3 SP]
- [x] Create `ContactMergeDialog.tsx` in `frontend/components/contacts/` ✅ DONE
- [x] Side-by-side comparison of two contact records ✅ DONE
- [x] User selects which fields to keep from each record ✅ DONE
- [x] Auto-merge emails/phones/tags (union, deduplicated) ✅ DONE
- [x] Call PATCH /contacts/:id with merged data, DELETE the duplicate ✅ DONE
- [x] Accessible from: manual selection in contact list (2 contacts → merge button) ✅ DONE
- [x] Translations for merge UI strings ✅ DONE

### T-0805: Persist contact sidebar filters [2 SP]
- [x] Read `useContactsPageData.ts` — find filter state management ✅ DONE
- [x] Persist active filters to URL search params (?provider=xxx&filter=hasEmail) ✅ DONE
- [x] Restore filters from URL on page load ✅ DONE
- [x] Share filtered view via URL copy ✅ DONE
- [x] Shallow routing — no page reload on filter change ✅ DONE

## Dependencies
- S03-S04 (contacts backend verified), S07 (calendar frontend done)

## Risks
- R1: vCard import UI may exceed 500 lines
- Mitigation: Split into sub-components (DropZone, Preview, ProgressBar)
- R2: Duplicate detection on large imports may be slow
- Mitigation: Batch email lookup, limit preview to first 50 matches

## Definition of Done
- [x] vCard import accessible from contacts page with drag-drop ✅
- [x] Contact history shows real interactions (emails, meetings) ✅
- [x] Duplicate detection warns during import ✅
- [x] Contact merge UI allows side-by-side field selection ✅
- [x] Sidebar filters persisted in URL params ✅
- [x] `npx tsc --noEmit` passes in frontend ✅
- [x] All new strings in en.ts + it.ts ✅
- [x] No hardcoded strings or colors ✅
