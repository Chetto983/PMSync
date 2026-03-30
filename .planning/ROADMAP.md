# Roadmap: PMSync

## Milestones

- ✅ **v1 Stability & Code Quality Refactor** — Phases 1-8 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** — Phases 1-8 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** — Phases 01-03 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** — Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** — Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** — Phases 23-28 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** — Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** — Phases 42-49 (shipped 2026-03-06)
- ✅ **v5.0 better-auth Migration** — Phases 50-65 (shipped 2026-03-10)
- ✅ **v5.1 Test Coverage & Polish** — Phases 66-76 (shipped 2026-03-15)
- ✅ **v6.0 Enterprise Platform & AI Governance** — Phases 77-88 (partial, archived 2026-03-20)
- ✅ **v7.0 System Audit & Hardening** — Phases 89-99 (shipped 2026-03-23)
- ✅ **v8.0 Progressive Web App** — Phases 100-105 (shipped 2026-03-24)
- ✅ **v9.0 AI Intelligence & Platform Hardening** — Phases 106-111 (shipped 2026-03-25)
- [ ] **v10.0 Email & Sync Production Validation** — Phases 112-122

## Phases

<details>
<summary>✅ v1 Stability & Code Quality Refactor (Phases 1-8) — SHIPPED 2026-02-02</summary>

8 phases, 40 plans. See `milestones/v1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.0 Professional Email Client (Phases 1-8) — SHIPPED 2026-02-04</summary>

8 phases, 21 plans, 24/24 requirements. See `milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Optimization & Polish (Phases 01-03) — SHIPPED 2026-02-05</summary>

3 phases, 5 plans. See `milestones/v2.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) — SHIPPED 2026-02-09</summary>

12 phases, 42 plans, 19/19 requirements. See `milestones/v3.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) — SHIPPED 2026-02-27</summary>

10 phases, 34 plans, 31/32 requirements (ENC-03 deferred). See `milestones/v3.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.2 AI Rebuild & Cleanup (Phases 23-28) — SHIPPED 2026-03-03 (partial)</summary>

6 phases, 20 plans, 25/33 requirements (8 carried to v4.0). See `milestones/v3.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.0 Enterprise Stabilization (Phases 31-41) — SHIPPED 2026-03-04</summary>

11 phases, 22 plans, 19/19 requirements. See `milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.1 Security Hardening & Debt Reduction (Phases 42-49) — SHIPPED 2026-03-06</summary>

8 phases, 28 plans, 65/66 requirements. See `milestones/v4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.0 better-auth Migration (Phases 50-65) — SHIPPED 2026-03-10</summary>

15 phases, 34 plans, 51/51 requirements. See `milestones/v5.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.1 Test Coverage & Polish (Phases 66-76) — SHIPPED 2026-03-15</summary>

11 phases, 30 plans. See `milestones/v5.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v6.0 Enterprise Platform & AI Governance (Phases 77-88) — PARTIAL, archived 2026-03-20</summary>

12 phases (77-88), 4/66 requirements completed. Phases 86-88 (bug fixes) completed. Phases 77-85 (enterprise features) deferred to v8.0+. See `milestones/v6.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v7.0 System Audit & Hardening (Phases 89-99) — SHIPPED 2026-03-23</summary>

10 active phases + 1 obsolete (97), 35 plans, 65/65 requirements. See `milestones/v7.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v8.0 Progressive Web App (Phases 100-105) — SHIPPED 2026-03-24</summary>

6 phases, 11 plans, 21/21 requirements. See `milestones/v8.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v9.0 AI Intelligence & Platform Hardening (Phases 106-111) — SHIPPED 2026-03-25</summary>

6 phases, 14 plans, 20/20 requirements. See `milestones/v9.0-ROADMAP.md` for full details.

</details>

### v10.0 Email & Sync Production Validation (Phases 112-122)

- [x] **Phase 112: Full Sync Validation** - Verify full sync downloads all emails/folders correctly across Gmail, Outlook, IMAP (completed 2026-03-26)
- [x] **Phase 113: Incremental Sync & Webhooks** - Verify delta sync and webhook-triggered sync detect changes correctly (completed 2026-03-26)
- [x] **Phase 114: Sync-back Operations** - Verify local state changes propagate back to all three providers (completed 2026-03-26)
- [ ] **Phase 115: Email List & Thread Reading** - Verify list filtering, pagination, thread grouping, and single email retrieval
- [x] **Phase 116: Attachments & Search** - Verify attachment download (S3 + on-demand), folder stats, and full-text search (completed 2026-03-26)
- [x] **Phase 117: Email Send & Reply/Forward** - Verify send/reply/forward lifecycle across all three providers (completed 2026-03-27)
- [x] **Phase 118: Drafts & Bulk Operations** - Verify draft CRUD and bulk mark/move/delete/label operations (completed 2026-03-30)
- [x] **Phase 119: Folder Operations** - Verify folder CRUD, external change sync, and system folder protection (completed 2026-03-30)
- [x] **Phase 120: Queue & Webhook Infrastructure** - Verify BullMQ queue health, pause/resume, and webhook subscription lifecycle (completed 2026-03-30)
- [ ] **Phase 121: Scheduling, Signatures & Templates** - Verify scheduled send/cancel, signature CRUD, and template CRUD
- [ ] **Phase 122: Cross-cutting Validation** - Verify tenant isolation, rate limiting, and error envelope consistency

## Phase Details

### Phase 112: Full Sync Validation
**Goal**: All three email providers produce complete, accurate local mirrors when full sync completes
**Depends on**: Nothing (first phase of v10.0)
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):
  1. Full sync from Gmail downloads all emails with correct subject, body, sender, recipients, dates, and labels
  2. Full sync from Outlook downloads all emails with correct metadata and folder assignments
  3. Full sync from IMAP downloads all emails with correct metadata and folder assignments
  4. All provider folders/labels appear as local folder records with correct nesting hierarchy
  5. Automated validation script confirms email count and folder count match provider state
**Plans**: 2 plans
Plans:
- [x] 112-01-PLAN.md -- Validation infrastructure + Gmail full sync validation (SYNC-01)
- [x] 112-02-PLAN.md -- Outlook + IMAP full sync validation (SYNC-02, SYNC-03)

### Phase 113: Incremental Sync & Webhooks
**Goal**: Changes made on the provider side (new emails, modifications, deletions) are detected and applied locally
**Depends on**: Phase 112
**Requirements**: SYNC-04, SYNC-05, SYNC-06, SYNC-07, SYNC-08
**Success Criteria** (what must be TRUE):
  1. Gmail history API incremental sync picks up new arrivals, read-state changes, and deletions since last sync
  2. Outlook delta API incremental sync picks up new arrivals, modifications, and deletions since last sync
  3. IMAP incremental sync detects new and changed emails since last sync
  4. Gmail Pub/Sub webhook triggers an automatic sync when a new email arrives on the provider
  5. Microsoft Graph webhook triggers an automatic sync when a new email arrives on the provider
**Plans**: 2 plans
Plans:
- [ ] 113-01-PLAN.md -- Incremental sync validation for Gmail, Outlook, IMAP (SYNC-04, SYNC-05, SYNC-06)
- [ ] 113-02-PLAN.md -- Webhook sync validation for Gmail Pub/Sub and Microsoft Graph (SYNC-07, SYNC-08)

### Phase 114: Sync-back Operations
**Goal**: State changes made locally in PMSync propagate correctly to the remote provider
**Depends on**: Phase 112
**Requirements**: SYNC-09, SYNC-10, SYNC-11, SYNC-12, SYNC-13
**Success Criteria** (what must be TRUE):
  1. Mark-read and mark-unread on a local email updates the read state on Gmail, Outlook, and IMAP
  2. Star and unstar on a local email updates the flagged state on Gmail, Outlook, and IMAP
  3. Move-to-folder on a local email moves the message on Gmail, Outlook, and IMAP
  4. Soft delete and permanent delete on a local email performs the correct delete on Gmail, Outlook, and IMAP
  5. Label add and remove on a local Gmail email updates the label membership on Gmail
**Plans**: 2 plans
Plans:
- [x] 114-01-PLAN.md -- SYNC-13 bug fix + validation infrastructure + read/star/move validation (SYNC-09, SYNC-10, SYNC-11, SYNC-13)
- [x] 114-02-PLAN.md -- Delete + label validation + live provider checkpoint (SYNC-12, SYNC-13)

### Phase 115: Email List & Thread Reading
**Goal**: Users can browse, filter, paginate, and read emails accurately across all providers
**Depends on**: Phase 112
**Requirements**: READ-01, READ-02, READ-03, READ-04, READ-05
**Success Criteria** (what must be TRUE):
  1. List emails with a folder filter returns only emails belonging to that folder for each provider
  2. Compound filters (isRead + hasAttachments + dateRange) return the correct intersection of matching emails
  3. Offset-based pagination returns consistent, non-duplicated results across multiple pages
  4. Thread view groups related emails by conversation and lazy-fetches any missing message bodies
  5. Single email GET returns the full HTML body, all headers, and complete metadata
**Plans**: 2 plans
Plans:
- [ ] 115-01-PLAN.md -- Validation scripts for folder filter, compound filters, pagination, thread view, single email GET (READ-01, READ-02, READ-03, READ-04, READ-05)
- [ ] 115-02-PLAN.md -- Live provider validation run + bug fixes + human checkpoint (READ-01, READ-02, READ-03, READ-04, READ-05)

### Phase 116: Attachments & Search
**Goal**: Users can download attachments and search emails reliably regardless of storage location
**Depends on**: Phase 115
**Requirements**: READ-06, READ-07, READ-08, READ-09
**Success Criteria** (what must be TRUE):
  1. Attachment download streams the file from S3 with the correct content-type header
  2. On-demand attachment fetch retrieves the file directly from the provider when it is not cached in S3
  3. Unread counts and folder stats accurately reflect the current email state per folder
  4. Full-text search returns relevant results across all provider accounts
**Plans**: 2 plans
Plans:
- [x] 116-01-PLAN.md -- Validation scripts for attachment download, on-demand fetch, folder stats, full-text search (READ-06, READ-07, READ-08, READ-09)
- [x] 116-02-PLAN.md -- Live provider validation run + bug fixes + human checkpoint (READ-06, READ-07, READ-08, READ-09)

### Phase 117: Email Send & Reply/Forward
**Goal**: Users can compose and send emails through any provider, with reply/forward preserving conversation context
**Depends on**: Phase 112
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05
**Success Criteria** (what must be TRUE):
  1. A new email sent via Gmail is delivered to the recipient and appears in the Gmail Sent folder
  2. A new email sent via Outlook is delivered to the recipient and appears in the Outlook Sent folder
  3. A new email sent via IMAP/SMTP is delivered to the recipient and appears in the SMTP Sent folder
  4. Reply adds correct In-Reply-To and References headers and the thread is preserved on the provider
  5. Forward includes the original message body and all original attachments
**Plans**: 3 plans
Plans:
- [x] 117-01-PLAN.md -- Fix forward-attachments bug + validation scripts (WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05)
- [x] 117-02-PLAN.md -- Live provider validation run + bug fixes + human checkpoint (WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05)
- [x] 117-03-PLAN.md -- Gap closure: Outlook messageId fix + WRITE-03 correction (WRITE-03, WRITE-04)

### Phase 118: Drafts & Bulk Operations
**Goal**: Users can manage drafts and perform bulk operations that sync back to providers
**Depends on**: Phase 117
**Requirements**: WRITE-06, WRITE-07, WRITE-08, WRITE-09, WRITE-10
**Success Criteria** (what must be TRUE):
  1. Draft create, update, retrieve, and delete lifecycle works correctly on Gmail, Outlook, and IMAP
  2. Bulk mark-read/unread updates the local DB and triggers sync-back that reflects on the provider
  3. Bulk move-to-folder updates the local DB and triggers sync-back that reflects on the provider
  4. Bulk delete (soft) updates the local DB and triggers sync-back that reflects on the provider
  5. Bulk label add/remove on Gmail updates local state and triggers sync-back that reflects on Gmail
**Plans**: 2 plans
Plans:
- [x] 118-01-PLAN.md -- Fix deleteDraft provider-sync bug + validation scripts (WRITE-06, WRITE-07, WRITE-08, WRITE-09, WRITE-10)
- [x] 118-02-PLAN.md -- Live provider validation run + bug fixes + human checkpoint (WRITE-06, WRITE-07, WRITE-08, WRITE-09, WRITE-10)

### Phase 119: Folder Operations
**Goal**: Users can create, rename, and delete folders with changes reflected on the provider and vice versa
**Depends on**: Phase 112
**Requirements**: FOLD-01, FOLD-02, FOLD-03, FOLD-04, FOLD-05
**Success Criteria** (what must be TRUE):
  1. Create folder via BullMQ queue creates the folder on Gmail, Outlook, and IMAP and the local DB record matches
  2. Rename folder updates both the local DB name and the provider-side folder name
  3. Delete folder removes the folder from the provider and cleans up the local DB record and email associations
  4. Folder sync from provider detects folders created, renamed, or deleted externally and updates local state
  5. System folders (Inbox, Sent, Trash, Drafts) cannot be deleted or renamed — API returns appropriate error
**Plans**: 2 plans
Plans:
- [x] 119-01-PLAN.md -- Validation scripts for folder CRUD, sync, and system folder protection (FOLD-01, FOLD-02, FOLD-03, FOLD-04, FOLD-05)
- [x] 119-02-PLAN.md -- Live provider validation run + bug fixes + human checkpoint (FOLD-01, FOLD-02, FOLD-03, FOLD-04, FOLD-05)

### Phase 120: Queue & Webhook Infrastructure
**Goal**: BullMQ queues and provider webhooks are healthy, resilient, and accurately monitored
**Depends on**: Nothing (independent infrastructure validation)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. All 7 BullMQ queues report healthy status and Prometheus metrics show correct depth/throughput
  2. Pausing and resuming a queue does not lose any enqueued jobs — all jobs process after resume
  3. Gmail Pub/Sub subscription can be created and renewed before expiry without dropping notifications
  4. Microsoft Graph subscription can be created and renewed before expiry without dropping notifications
  5. Webhook health endpoint accurately reports subscription status for both Gmail and Outlook
**Plans**: 3 plans
Plans:
- [x] 120-01-PLAN.md -- Queue health validation scripts (INFRA-01, INFRA-02)
- [x] 120-02-PLAN.md -- Webhook lifecycle validation scripts (INFRA-03, INFRA-04, INFRA-05)
- [x] 120-03-PLAN.md -- Live validation run + bug fixes + human checkpoint (INFRA-01..05)

### Phase 121: Scheduling, Signatures & Templates
**Goal**: Scheduled emails send at the right time, and signature/template management works end-to-end
**Depends on**: Phase 117
**Requirements**: INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10
**Success Criteria** (what must be TRUE):
  1. A scheduled email sends at the specified time (within reasonable tolerance)
  2. Cancelling a scheduled email before its send time prevents delivery
  3. Signature CRUD works and the default signature selection persists across sessions
  4. Template CRUD works, including duplicate, and the default template selection persists
  5. Sent emails include the user's selected default signature in the message body
**Plans**: 2 plans
Plans:
- [ ] 121-01-PLAN.md -- Fix scheduledAt bypass bug + validation scripts for all INFRA-06..10 (INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10)
- [ ] 121-02-PLAN.md -- Live validation run + bug fixes + human checkpoint (INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10)

### Phase 122: Cross-cutting Validation
**Goal**: Security, observability, and API contract guarantees hold across all email operations
**Depends on**: Phases 112-121 (runs last as a sweep)
**Requirements**: XCUT-01, XCUT-02, XCUT-03
**Success Criteria** (what must be TRUE):
  1. No email endpoint returns data belonging to a different tenant — verified via cross-tenant request script
  2. Rate limiting enforces the correct tier (read/safe-write/destructive-write/send) on every email endpoint
  3. All error responses follow the standard envelope format with a correlation ID present in every response
**Plans**: Not yet planned

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 112. Full Sync Validation | 2/2 | Complete    | 2026-03-26 |
| 113. Incremental Sync & Webhooks | 0/2 | Complete    | 2026-03-26 |
| 114. Sync-back Operations | 2/2 | Complete    | 2026-03-26 |
| 115. Email List & Thread Reading | 2/2 | Complete    | 2026-03-26 |
| 116. Attachments & Search | 2/2 | Complete    | 2026-03-26 |
| 117. Email Send & Reply/Forward | 3/3 | Complete   | 2026-03-27 |
| 118. Drafts & Bulk Operations | 2/2 | Complete    | 2026-03-30 |
| 119. Folder Operations | 2/2 | Complete    | 2026-03-30 |
| 120. Queue & Webhook Infrastructure | 3/3 | Complete    | 2026-03-30 |
| 121. Scheduling, Signatures & Templates | 0/2 | Planned    |  |
| 122. Cross-cutting Validation | 0/? | Not started | - |

---
*Roadmap created: 2026-02-09*
*v9.0 completed: 2026-03-25 -- 6 phases, 14 plans, 20/20 requirements*
*v10.0 roadmap added: 2026-03-25 -- 11 phases, 41 requirements*
