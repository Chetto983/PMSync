# Requirements: PMSync v10.0 — Email & Sync Production Validation

**Defined:** 2026-03-25
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v10.0 Requirements

Comprehensive audit of all email and email-sync operations against live providers (Gmail, Outlook, IMAP) with real data. Automated validation scripts + manual E2E browser verification. Bugs found get fixed in-place.

### Sync Pipeline

- [ ] **SYNC-01**: Full sync from Gmail downloads all emails, folders, and labels correctly
- [ ] **SYNC-02**: Full sync from Outlook downloads all emails and folders correctly
- [ ] **SYNC-03**: Full sync from IMAP downloads all emails and folders correctly
- [ ] **SYNC-04**: Incremental sync via Gmail history API picks up new/changed/deleted emails
- [ ] **SYNC-05**: Incremental sync via Microsoft delta API picks up new/changed/deleted emails
- [ ] **SYNC-06**: Incremental sync via IMAP detects new/changed emails
- [ ] **SYNC-07**: Gmail Pub/Sub webhook triggers sync on new email arrival
- [ ] **SYNC-08**: Microsoft Graph webhook triggers sync on new email arrival
- [ ] **SYNC-09**: Sync-back reflects mark-read/unread on all three providers
- [ ] **SYNC-10**: Sync-back reflects star/unstar on all three providers
- [ ] **SYNC-11**: Sync-back reflects move-to-folder on all three providers
- [ ] **SYNC-12**: Sync-back reflects delete (soft + permanent) on all three providers
- [ ] **SYNC-13**: Sync-back reflects label add/remove on Gmail

### Email Read

- [ ] **READ-01**: List emails with folder filter returns correct results per provider
- [ ] **READ-02**: List emails with compound filters (isRead + hasAttachments + dateRange) works
- [ ] **READ-03**: Pagination returns consistent results across pages
- [ ] **READ-04**: Thread view groups related emails correctly and lazy-fetches missing bodies
- [ ] **READ-05**: Single email GET returns full body, headers, and metadata
- [ ] **READ-06**: Attachment download streams from S3 with correct content-type
- [ ] **READ-07**: On-demand attachment fetch retrieves from provider when not in S3
- [ ] **READ-08**: Unread counts and folder stats match actual email state
- [ ] **READ-09**: Full-text search returns relevant results across providers

### Email Write

- [ ] **WRITE-01**: Send new email via Gmail delivers to recipient
- [ ] **WRITE-02**: Send new email via Outlook delivers to recipient
- [ ] **WRITE-03**: Send new email via IMAP/SMTP delivers to recipient
- [ ] **WRITE-04**: Reply preserves thread, adds correct headers (In-Reply-To, References)
- [ ] **WRITE-05**: Forward includes original body and attachments
- [ ] **WRITE-06**: Draft create/update/retrieve/delete lifecycle works per provider
- [ ] **WRITE-07**: Bulk mark-read/unread updates DB and triggers sync-back
- [ ] **WRITE-08**: Bulk move-to-folder updates DB and triggers sync-back
- [ ] **WRITE-09**: Bulk delete (soft) updates DB and triggers sync-back
- [ ] **WRITE-10**: Bulk label add/remove works on Gmail

### Folder Operations

- [ ] **FOLD-01**: Create folder via BullMQ queue succeeds on all three providers
- [ ] **FOLD-02**: Rename folder updates both local DB and provider
- [ ] **FOLD-03**: Delete folder removes from provider and cleans up local records
- [ ] **FOLD-04**: Folder sync from provider reflects external changes (folders created/renamed/deleted outside app)
- [ ] **FOLD-05**: System folders (Inbox, Sent, Trash, Drafts) are protected from delete/rename

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
| SYNC-01 | — | Pending |
| SYNC-02 | — | Pending |
| SYNC-03 | — | Pending |
| SYNC-04 | — | Pending |
| SYNC-05 | — | Pending |
| SYNC-06 | — | Pending |
| SYNC-07 | — | Pending |
| SYNC-08 | — | Pending |
| SYNC-09 | — | Pending |
| SYNC-10 | — | Pending |
| SYNC-11 | — | Pending |
| SYNC-12 | — | Pending |
| SYNC-13 | — | Pending |
| READ-01 | — | Pending |
| READ-02 | — | Pending |
| READ-03 | — | Pending |
| READ-04 | — | Pending |
| READ-05 | — | Pending |
| READ-06 | — | Pending |
| READ-07 | — | Pending |
| READ-08 | — | Pending |
| READ-09 | — | Pending |
| WRITE-01 | — | Pending |
| WRITE-02 | — | Pending |
| WRITE-03 | — | Pending |
| WRITE-04 | — | Pending |
| WRITE-05 | — | Pending |
| WRITE-06 | — | Pending |
| WRITE-07 | — | Pending |
| WRITE-08 | — | Pending |
| WRITE-09 | — | Pending |
| WRITE-10 | — | Pending |
| FOLD-01 | — | Pending |
| FOLD-02 | — | Pending |
| FOLD-03 | — | Pending |
| FOLD-04 | — | Pending |
| FOLD-05 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| INFRA-05 | — | Pending |
| INFRA-06 | — | Pending |
| INFRA-07 | — | Pending |
| INFRA-08 | — | Pending |
| INFRA-09 | — | Pending |
| INFRA-10 | — | Pending |
| XCUT-01 | — | Pending |
| XCUT-02 | — | Pending |
| XCUT-03 | — | Pending |

**Coverage:**
- v10.0 requirements: 41 total
- Mapped to phases: 0
- Unmapped: 41 ⚠️

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after initial definition*
