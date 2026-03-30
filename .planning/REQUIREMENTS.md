# Requirements: PMSync v10.0 — Email & Sync Production Validation

**Defined:** 2026-03-25
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v10.0 Requirements

Comprehensive audit of all email and email-sync operations against live providers (Gmail, Outlook, IMAP) with real data. Automated validation scripts + manual E2E browser verification. Bugs found get fixed in-place.

### Sync Pipeline

- [x] **SYNC-01**: Full sync from Gmail downloads all emails, folders, and labels correctly
- [x] **SYNC-02**: Full sync from Outlook downloads all emails and folders correctly
- [x] **SYNC-03**: Full sync from IMAP downloads all emails and folders correctly
- [ ] **SYNC-04**: Incremental sync via Gmail history API picks up new/changed/deleted emails
- [ ] **SYNC-05**: Incremental sync via Microsoft delta API picks up new/changed/deleted emails
- [ ] **SYNC-06**: Incremental sync via IMAP detects new/changed emails
- [ ] **SYNC-07**: Gmail Pub/Sub webhook triggers sync on new email arrival
- [ ] **SYNC-08**: Microsoft Graph webhook triggers sync on new email arrival
- [x] **SYNC-09**: Sync-back reflects mark-read/unread on all three providers
- [x] **SYNC-10**: Sync-back reflects star/unstar on all three providers
- [x] **SYNC-11**: Sync-back reflects move-to-folder on all three providers
- [x] **SYNC-12**: Sync-back reflects delete (soft + permanent) on all three providers
- [x] **SYNC-13**: Sync-back reflects label add/remove on Gmail

### Email Read

- [x] **READ-01**: List emails with folder filter returns correct results per provider
- [x] **READ-02**: List emails with compound filters (isRead + hasAttachments + dateRange) works
- [x] **READ-03**: Pagination returns consistent results across pages
- [x] **READ-04**: Thread view groups related emails correctly and lazy-fetches missing bodies
- [x] **READ-05**: Single email GET returns full body, headers, and metadata
- [x] **READ-06**: Attachment download streams from S3 with correct content-type
- [x] **READ-07**: On-demand attachment fetch retrieves from provider when not in S3
- [x] **READ-08**: Unread counts and folder stats match actual email state
- [x] **READ-09**: Full-text search returns relevant results across providers

### Email Write

- [x] **WRITE-01**: Send new email via Gmail delivers to recipient
- [x] **WRITE-02**: Send new email via Outlook delivers to recipient
- [ ] **WRITE-03**: Send new email via IMAP/SMTP delivers to recipient *(Blocked: Railway blocks SMTP ports 465/587; code exists and compiles but no live validation possible in production environment)*
- [x] **WRITE-04**: Reply preserves thread, adds correct headers (In-Reply-To, References)
- [x] **WRITE-05**: Forward includes original body and attachments
- [x] **WRITE-06**: Draft create/update/retrieve/delete lifecycle works per provider
- [x] **WRITE-07**: Bulk mark-read/unread updates DB and triggers sync-back
- [x] **WRITE-08**: Bulk move-to-folder updates DB and triggers sync-back
- [x] **WRITE-09**: Bulk delete (soft) updates DB and triggers sync-back
- [x] **WRITE-10**: Bulk label add/remove works on Gmail

### Folder Operations

- [x] **FOLD-01**: Create folder via BullMQ queue succeeds on all three providers
- [x] **FOLD-02**: Rename folder updates both local DB and provider
- [x] **FOLD-03**: Delete folder removes from provider and cleans up local records
- [x] **FOLD-04**: Folder sync from provider reflects external changes (folders created/renamed/deleted outside app)
- [x] **FOLD-05**: System folders (Inbox, Sent, Trash, Drafts) are protected from delete/rename

### Infrastructure

- [ ] **INFRA-01**: All 7 BullMQ queues report healthy status with correct metrics
- [ ] **INFRA-02**: Queue pause/resume works without data loss
- [ ] **INFRA-03**: Gmail Pub/Sub subscription create and renew lifecycle works
- [ ] **INFRA-04**: Microsoft Graph subscription create and renew lifecycle works
- [ ] **INFRA-05**: Webhook health endpoint reports accurate status
- [ ] **INFRA-06**: Scheduled email sends at correct time
- [ ] **INFRA-07**: Scheduled email cancel prevents delivery
- [ ] **INFRA-08**: Signature CRUD and default selection works
- [ ] **INFRA-09**: Template CRUD, duplicate, and default selection works
- [ ] **INFRA-10**: Sent emails include correct signature

### Cross-cutting

- [ ] **XCUT-01**: All email operations enforce tenantId isolation
- [ ] **XCUT-02**: Rate limiting applies correctly per tier on email endpoints
- [ ] **XCUT-03**: Error responses follow standard envelope format with correlation IDs

## Future Requirements

(None — this is a validation milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New email features | Validation only — no new functionality |
| Frontend UI testing | Focus is backend API + provider integration |
| Performance benchmarking | Functional correctness first; perf is separate |
| Calendar/contacts module validation | Separate milestone scope |
| AI module validation | Separate milestone scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SYNC-01 | Phase 112 | Satisfied |
| SYNC-02 | Phase 112 | Satisfied |
| SYNC-03 | Phase 112 | Satisfied |
| SYNC-04 | Phase 113 | Pending |
| SYNC-05 | Phase 113 | Pending |
| SYNC-06 | Phase 113 | Pending |
| SYNC-07 | Phase 113 | Pending |
| SYNC-08 | Phase 113 | Pending |
| SYNC-09 | Phase 114 | Complete |
| SYNC-10 | Phase 114 | Complete |
| SYNC-11 | Phase 114 | Complete |
| SYNC-12 | Phase 114 | Complete |
| SYNC-13 | Phase 114 | Complete |
| READ-01 | Phase 115 | Complete |
| READ-02 | Phase 115 | Complete |
| READ-03 | Phase 115 | Complete |
| READ-04 | Phase 115 | Complete |
| READ-05 | Phase 115 | Complete |
| READ-06 | Phase 116 | Complete |
| READ-07 | Phase 116 | Complete |
| READ-08 | Phase 116 | Complete |
| READ-09 | Phase 116 | Complete |
| WRITE-01 | Phase 117 | Complete |
| WRITE-02 | Phase 117 | Complete |
| WRITE-03 | Phase 117 | Blocked (Infrastructure) |
| WRITE-04 | Phase 117 | Complete |
| WRITE-05 | Phase 117 | Complete |
| WRITE-06 | Phase 118 | Complete |
| WRITE-07 | Phase 118 | Complete |
| WRITE-08 | Phase 118 | Complete |
| WRITE-09 | Phase 118 | Complete |
| WRITE-10 | Phase 118 | Complete |
| FOLD-01 | Phase 119 | Complete |
| FOLD-02 | Phase 119 | Complete |
| FOLD-03 | Phase 119 | Complete |
| FOLD-04 | Phase 119 | Complete |
| FOLD-05 | Phase 119 | Complete |
| INFRA-01 | Phase 120 | Pending |
| INFRA-02 | Phase 120 | Pending |
| INFRA-03 | Phase 120 | Pending |
| INFRA-04 | Phase 120 | Pending |
| INFRA-05 | Phase 120 | Pending |
| INFRA-06 | Phase 121 | Pending |
| INFRA-07 | Phase 121 | Pending |
| INFRA-08 | Phase 121 | Pending |
| INFRA-09 | Phase 121 | Pending |
| INFRA-10 | Phase 121 | Pending |
| XCUT-01 | Phase 122 | Pending |
| XCUT-02 | Phase 122 | Pending |
| XCUT-03 | Phase 122 | Pending |

**Coverage:**
- v10.0 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 — traceability updated with phase mappings (112-122)*
