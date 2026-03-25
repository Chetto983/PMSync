# Email & Label Sync Audit

## Scope

Full audit of data consistency across the three layers for **all 3 email providers**:
**Provider (Gmail / Outlook / IMAP) <-> Database (Prisma/PostgreSQL) <-> Frontend (Next.js/React)**

Focus: emails, labels, folders, read/star/flag state, counts, UI rendering, embedding lifecycle.

## Parametri

| Key | Value |
|-----|-------|
| Dev | 1 (solo) |
| Sprints | 17 |
| Phases | 7 |
| Est. SP | ~195 |
| Start | 2026-03-25 |

## Architecture Summary

### Three-Layer Label System (Current State)

```
Google (Gmail API)
  labels.list() -> Folder records (externalId = Gmail label ID)
  messages.get() -> Email.labels[] (raw Gmail label IDs)
                    Email.folder (derived from labels)
                    Email.isRead / isStarred / isFlagged (derived from labels)

Database (PostgreSQL)
  Email.labels: String[]        -- RAW Google label IDs (INBOX, SENT, Label_xyz)
  Email.aiLabels: String[]      -- AI-suggested label names
  Email.folder: String          -- Derived canonical folder (INBOX, SENT, SOCIAL...)
  Email.emailLabels: EmailLabel[] -- Junction to UserLabel (user-created labels)
  UserLabel model               -- Custom labels with color, hierarchy, aiPrompt
  Folder model                  -- Provider folders with externalId mapping

Frontend (React)
  formatEmailToThread()         -- Maps emailLabels to {id, name, color}
  ThreadListItem                -- Shows max 2 user labels
  LabelsSidebar                 -- Hierarchical user label tree
  No label display in email detail view
```

### Key Design Decisions
- `Email.labels[]` (Google IDs) and `emailLabels` relation (user labels) are **independent**
- No automatic mapping between Google labels and UserLabels
- Folder determination is priority-based: TRASH > SPAM > SENT > DRAFT > CATEGORY_* > INBOX
- CATEGORY_PERSONAL maps to INBOX (not a separate folder)

## Audit Findings Summary

### CRITICAL (Data Integrity / Sync Breaks)

| # | Finding | Layer | Impact |
|---|---------|-------|--------|
| C1 | `Email.labels[]` stores raw Gmail IDs that can become stale after label rename/delete on Google side | Google -> DB | Phantom labels, incorrect folder filtering |
| C2 | `determineFolderFromLabels()` defaults to INBOX for emails with only custom labels (Label_xyz) | Google -> DB | Custom-label-only emails always land in INBOX |
| C3 | Folder count for Google uses `labels: { has: externalId }` but non-Google uses `folder` field - dual query paths with no consistency validation | DB | Count mismatches between sidebar and actual email list |
| C4 | No `emailLabels` include in email-folder.service.ts list query - emailLabels only included in email-crud and email-fetch services | DB -> FE | Labels may not appear in main email list |
| C5 | `UserLabel.aiPrompt` field exists in schema.prisma but has NO migration - column missing from DB | DB | Runtime crash when AI triage reads/writes aiPrompt |
| C6 | Sync-back to Google is incomplete - user label changes (add/remove) are NOT pushed back to Gmail | DB -> Google | Gmail shows different labels than PMSync |

### HIGH (Incorrect Display / UX Breaks)

| # | Finding | Layer | Impact |
|---|---------|-------|--------|
| H1 | No label display in ExpandedMessage (email detail view) | FE | Users can't see labels on opened emails |
| H2 | No label removal from email detail view | FE | Must go to list view to manage labels |
| H3 | Hardcoded Italian fallback strings in ColorPicker.tsx | FE | English users see Italian text |
| H4 | `formatEmailToThread()` uses `el.label?.color?.backgroundColor` without hex validation | FE | Invalid colors break chip rendering |
| H5 | RC-2 preserves user state but doesn't merge labels - entire `labels[]` array is overwritten or preserved atomically | Google -> DB | Partial label changes lost during sync window |

### MEDIUM (Inconsistency / Edge Cases)

| # | Finding | Layer | Impact |
|---|---------|-------|--------|
| M1 | Gmail `DRAFT` label maps to `DRAFTS` folder (with S) - inconsistency in labelIdToFolderPath vs determineFolderFromLabels | Google -> DB | Potential folder mismatch |
| M2 | `isArchived` on Email vs `isArchived` on UserLabel - same field name, different semantics | DB | Confusion in queries |
| M3 | Soft-deleted UserLabels (isArchived=true) still have EmailLabel junction records | DB | Stale counts, ghost labels |
| M4 | `_count.emailLabels` on label query may be stale after bulk add/remove operations | DB -> FE | Incorrect sidebar counts |
| M5 | `aiLabels` field on Email is never displayed in frontend | DB -> FE | AI triage results invisible to user |
| M6 | Email.labels[] has no GIN index - `{ has: labelToken }` query scans all emails | DB | Performance degradation at scale |
| M7 | `CATEGORY_PERSONAL` excluded from folder sync but emails with this label exist | Google -> DB | Emails with only CATEGORY_PERSONAL may be orphaned in query |
| M8 | No validation that email.folder matches Folder.path - can drift after manual folder operations | DB | Folder counts disagree with email list |

### LOW (Polish / Best Practices)

| # | Finding | Layer | Impact |
|---|---------|-------|--------|
| L1 | `threadId` field on Email has no Thread model - orphaned FK | DB | Schema confusion |
| L2 | No backend validation for aiPrompt max length (frontend: 500 chars) | DB | Oversized prompts |
| L3 | Label color stored as JSON with no schema validation | DB | Malformed color objects |
| L4 | No batch delete for labels with cascade warning | FE | One-at-a-time deletion only |
| L5 | Comment says "VoltAgent analysis results" in formatEmailToThread - stale naming | FE | Developer confusion |

## Phase Breakdown

| Phase | Focus | Sprints | SP | Goal |
|-------|-------|---------|-----|------|
| 1 - Google <-> DB Sync | Fix sync inconsistencies, label mapping, folder determination | S01-S03 | ~35 | Data entering DB from Google is correct and consistent |
| 2 - DB <-> Frontend | Fix display gaps, type safety, stale data | S04-S06 | ~30 | Frontend shows exactly what DB has, no ghosts |
| 3 - E2E Validation | Cross-layer integration tests, real browser E2E, monitoring | S07-S08 | ~18 | Prove all three layers agree, prevent regressions |
| 4 - Multi-Provider & Embeddings | Microsoft/IMAP parity, embedding lifecycle, embedding quality | S09-S11 | ~31 | All 3 drivers consistent, no orphan embeddings, better RAG retrieval |
| 5 - Driver Resilience | Google/Microsoft/IMAP hardening: tokens, errors, rate limits | S12-S14 | ~41 | All drivers handle failures gracefully, no silent data loss |
| 6 - Infrastructure Hardening | Workers, queues, security, sync tokens, webhooks | S15-S16 | ~25 | Crash isolation, backpressure, replay prevention, lock safety |
| 7 - Production Validation | Integration tests, health monitoring, scorecard | S17 | ~13 | Prove 10/10 production readiness with evidence |

## Risk Register

| # | Risk | Prob | Impact | P*I | Mitigation |
|---|------|------|--------|-----|------------|
| R1 | aiPrompt migration breaks existing labels | Med | High | 6 | Test migration on Railway staging first |
| R2 | Fixing folder determination changes email placement for existing data | High | High | 9 | Migration script to re-derive folders, not just new emails |
| R3 | Adding emailLabels include to list query impacts performance | Med | Med | 4 | Benchmark with production data volume |
| R4 | Sync-back implementation causes Gmail rate limiting | Med | High | 6 | Batch operations, BullMQ rate limiter |
| R5 | Frontend label display changes break existing tests | Low | Med | 2 | Run full test suite after each sprint |

## Directory Structure

```
email-label-audit/
  README.md                         -- This file
  docs/
    00-AUDIT-FINDINGS.md            -- Detailed findings with evidence
    01-ROADMAP.md                   -- Sprint breakdown & timeline
  sprints/
    phase-1-google-db-sync/
      sprint-01.md                  -- Label mapping & folder determination fixes
      sprint-02.md                  -- Sync processor & race condition fixes
      sprint-03.md                  -- Sync-back & bidirectional consistency
    phase-2-db-frontend/
      sprint-04.md                  -- EmailLabel includes & type safety
      sprint-05.md                  -- Label display in detail view
      sprint-06.md                  -- AI labels, counts, translations
    phase-3-e2e-validation/
      sprint-07.md                  -- Integration tests & data validation scripts
      sprint-08.md                  -- Browser E2E & monitoring
    phase-4-multi-provider-embeddings/
      sprint-09.md                  -- Microsoft/IMAP label parity
      sprint-10.md                  -- Embedding lifecycle hardening
      sprint-11.md                  -- Embedding quality & chunking
    phase-5-driver-resilience/
      sprint-12.md                  -- Google driver hardening
      sprint-13.md                  -- Microsoft driver hardening
      sprint-14.md                  -- IMAP driver hardening
    phase-6-infrastructure-hardening/
      sprint-15.md                  -- Worker & queue hardening
      sprint-16.md                  -- Security & sync hardening
    phase-7-production-validation/
      sprint-17.md                  -- Production validation suite
```
