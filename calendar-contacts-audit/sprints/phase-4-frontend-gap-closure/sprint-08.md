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
- [ ] Add translations: `contacts.import.title`, `contacts.import.dropzone`, `contacts.import.preview`, etc.
- [ ] Create `VCardImportDialog.tsx` in `frontend/components/contacts/`
- [ ] File drop zone accepting .vcf files
- [ ] Preview parsed contacts before import (name, email, phone)
- [ ] Call POST /contacts/import/vcard with file
- [ ] Show progress: uploading → parsing → importing → done
- [ ] Handle errors: invalid file, empty file, encoding issues
- [ ] Add "Import" button to ContactSidebar or ContactList header
- [ ] Max 500 lines per component

### T-0802: Wire contact history to real data [3 SP]
- [ ] Read `ContactActivityFeed.tsx` — check expected data shape
- [ ] Backend now returns real history data (from S03 T-0302)
- [ ] Wire ContactActivityFeed to use TanStack Query hook
- [ ] Show: email sent, email received, calendar meeting, deal update
- [ ] Each item: icon + timestamp + summary line
- [ ] Handle loading/empty/error states
- [ ] Translations for activity types

### T-0803: Duplicate detection during import [3 SP]
- [ ] After vCard parsing, check each contact against existing contacts
- [ ] Match on: email (exact), name (fuzzy — Levenshtein or trigram)
- [ ] Use POST /contacts/lookup-by-emails for batch email check
- [ ] Show duplicate warning in import preview: "3 possible duplicates found"
- [ ] Let user choose: skip duplicates, merge, import anyway
- [ ] Merge option: combine fields from both records

### T-0804: Contact merge UI [3 SP]
- [ ] Create `ContactMergeDialog.tsx` in `frontend/components/contacts/`
- [ ] Side-by-side comparison of two contact records
- [ ] User selects which fields to keep from each record
- [ ] Preview merged result before confirming
- [ ] Call PATCH /contacts/:id with merged data, DELETE the duplicate
- [ ] Accessible from: duplicate detection in import, or manual selection in contact list
- [ ] Translations for merge UI strings

### T-0805: Persist contact sidebar filters [2 SP]
- [ ] Read `ContactSidebar.tsx` — find filter state management
- [ ] Persist active filters to URL search params (?provider=google&hasEmail=true)
- [ ] Restore filters from URL on page load
- [ ] Share filtered view via URL copy
- [ ] Test: apply filter → navigate away → come back → filter persisted

## Dependencies
- S03-S04 (contacts backend verified), S07 (calendar frontend done)

## Risks
- R1: vCard import UI may exceed 500 lines
- Mitigation: Split into sub-components (DropZone, Preview, ProgressBar)
- R2: Duplicate detection on large imports may be slow
- Mitigation: Batch email lookup, limit preview to first 50 matches

## Definition of Done
- [ ] vCard import accessible from contacts page with drag-drop
- [ ] Contact history shows real interactions (emails, meetings)
- [ ] Duplicate detection warns during import
- [ ] Contact merge UI allows side-by-side field selection
- [ ] Sidebar filters persisted in URL params
- [ ] `npx tsc --noEmit` passes in frontend
- [ ] All new strings in en.ts + it.ts
- [ ] No hardcoded strings or colors
