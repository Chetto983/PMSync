# v2.0 Requirements: Professional Email Client

## Overview

**Version:** v2.0
**Goal:** Build the best professional AI mail client — fast, intelligent, and secure
**Total Requirements:** 24

## Frontend Email Client (FE-01 to FE-10)

### FE-01: Email List with VList Virtualization ✓ COMPLETE

**What:** Virtualized email list that handles 1000+ emails smoothly
**Why:** Core inbox experience, performance-critical
**Acceptance:**
- [x] VList (virtua) integration for virtualized scrolling
- [x] Smooth 60fps scroll with 1000+ emails
- [x] 2-line item layout: sender/date, subject
- [x] Unread indicator styling
- [x] Star, attachment, thread count indicators

**Completed:** Phase 02 research verified @tanstack/react-virtual already in use

### FE-02: Thread Display with Animations ✓ COMPLETE

**What:** Email thread view with collapsible messages
**Why:** Reading experience for conversation threads
**Acceptance:**
- [x] Collapsible message cards in thread
- [x] Motion animations for expand/collapse
- [x] Action toolbar (reply, forward, archive, delete)
- [x] Print thread functionality
- [x] Scroll to specific message in thread

**Completed:** Phase 02 research verified MUI Accordion with animations already implemented

### FE-03: Email Composer with TipTap

**What:** Rich text email editor with TipTap
**Why:** Core email creation experience
**Acceptance:**
- [ ] TipTap editor with formatting toolbar
- [ ] To/Cc/Bcc fields with contact autocomplete
- [ ] Attachment upload with drag-drop
- [ ] Image paste and inline display
- [ ] Draft auto-save (3-second debounce)

### FE-04: Folder Sidebar with Drag-Drop

**What:** Folder navigation with drag-drop organization
**Why:** Email organization and navigation
**Acceptance:**
- [ ] Folder tree with expand/collapse
- [ ] Unread counts per folder
- [ ] Drag email to folder
- [ ] Drag folder to reorder
- [ ] Create/rename/delete folder modals

### FE-05: Kanban Toggle View

**What:** Optional kanban columns for workflow-based email management
**Why:** User-requested hybrid view for action-oriented workflow
**Acceptance:**
- [ ] Toggle between list and kanban view
- [ ] Kanban columns: Inbox, To Reply, Following Up, Done
- [ ] Drag email between columns
- [ ] Column counts and collapse
- [ ] Persist view preference

### FE-06: Keyboard Navigation

**What:** Superhuman-style keyboard shortcuts
**Why:** Power user productivity
**Acceptance:**
- [ ] j/k for up/down navigation
- [ ] Enter to open thread
- [ ] e for archive, # for delete
- [ ] r for reply, f for forward
- [ ] / for search focus
- [ ] ? for shortcut help modal

### FE-07: Multi-Select with Bulk Actions

**What:** Select multiple emails for batch operations
**Why:** Efficient inbox management
**Acceptance:**
- [ ] Checkbox selection (click, Ctrl+click, Shift+click)
- [ ] Select all in view
- [ ] Bulk archive, delete, move, mark read/unread
- [ ] Selection count indicator
- [ ] Clear selection on action complete

### FE-08: Search with Filters

**What:** Email search with filter predicates
**Why:** Find emails quickly
**Acceptance:**
- [ ] Search input with typeahead
- [ ] from:, to:, subject: filters
- [ ] date range filter
- [ ] has:attachment filter
- [ ] Search results with highlighting

### FE-09: Dark Mode

**What:** Dark theme with system preference detection
**Why:** User comfort and modern UX
**Acceptance:**
- [ ] Dark color palette for all components
- [ ] System preference detection (prefers-color-scheme)
- [ ] Manual toggle in header
- [ ] Persist preference
- [ ] Smooth transition animation

### FE-10: AI Compose

**What:** AI-powered email composition assistance
**Why:** Productivity and writing quality
**Acceptance:**
- [ ] AI subject line generation
- [ ] AI smart reply suggestions
- [ ] AI compose from prompt
- [ ] AI tone adjustment (formal, casual)
- [ ] Loading states and error handling

## Performance & Optimization (PERF-01 to PERF-06)

### PERF-01: pgvector HNSW Index

**What:** Add HNSW index for embedding similarity search
**Why:** Faster RAG queries for AI features
**Acceptance:**
- [ ] Create HNSW index on Embedding.vector column
- [ ] Benchmark: similarity search <50ms for 100k embeddings
- [ ] Migration script with rollback

### PERF-02: N+1 Query Fix for Folder Counts

**What:** Fix N+1 pattern when loading folder counts
**Why:** Reduce database load on inbox view
**Acceptance:**
- [ ] Use Prisma groupBy for folder counts
- [ ] Single query instead of N queries
- [ ] Benchmark: <100ms for 50 folders

### PERF-03: Orphaned Embedding Cleanup

**What:** Background job to clean orphaned embeddings
**Why:** Reduce database bloat, improve query performance
**Acceptance:**
- [ ] BullMQ job for orphan detection
- [ ] Delete embeddings with null emailId AND null contactId
- [ ] Run weekly on schedule
- [ ] Metrics logging

### PERF-04: Composite Indexes

**What:** Add composite indexes to Email table
**Why:** Faster queries for common access patterns
**Acceptance:**
- [ ] Index: (tenantId, folderId, receivedAt DESC)
- [ ] Index: (tenantId, threadId)
- [ ] Index: (tenantId, isRead, receivedAt DESC)
- [ ] Migration with CONCURRENTLY

### PERF-05: Optimistic Updates ✓ COMPLETE

**What:** Instant UI feedback with rollback on error
**Why:** Perceived performance, responsive feel
**Acceptance:**
- [x] Optimistic state for star/unstar
- [x] Optimistic state for archive/delete
- [x] Optimistic state for move to folder
- [x] Rollback with toast error on failure

**Completed:** Phase 03 — Global toast context + 14 mutation hooks with onError handlers

### PERF-06: Query Prefetching ✓ COMPLETE

**What:** Prefetch next likely data on hover/navigation
**Why:** Eliminate loading states for predictable actions
**Acceptance:**
- [x] Prefetch thread on email hover
- [x] Prefetch folder on sidebar hover
- [ ] Prefetch next page on scroll near bottom (deferred - not critical)

**Completed:** Phase 03 — 300ms debounced prefetch on ThreadListItem and FolderSidebar hover

## Security Hardening (SEC-01 to SEC-05)

### SEC-01: S3 Server-Side Encryption

**What:** Enable encryption for attachment storage
**Why:** Data protection, compliance
**Acceptance:**
- [ ] Enable SSE-S3 or SSE-KMS on bucket
- [ ] Verify encrypted uploads
- [ ] Update bucket policy

### SEC-02: OAuth Token Revocation

**What:** Revoke OAuth tokens on provider disconnect
**Why:** Security hygiene, prevent stale access
**Acceptance:**
- [ ] Implement revocation API call per provider
- [ ] Call on disconnect action
- [ ] Handle revocation failures gracefully

### SEC-03: Log Redaction

**What:** Automatic redaction of auth payloads in logs
**Why:** Prevent credential leakage
**Acceptance:**
- [ ] Redact access_token, refresh_token
- [ ] Redact password fields
- [ ] Redact API keys
- [ ] Apply to all log transports

### SEC-04: CSRF Protection

**What:** CSRF tokens for all mutation endpoints
**Why:** Prevent cross-site request forgery
**Acceptance:**
- [ ] Generate CSRF token on session
- [ ] Validate on all POST/PUT/DELETE
- [ ] Return 403 on mismatch

### SEC-05: Rate Limiting

**What:** Rate limits on frontend API routes
**Why:** Prevent abuse, protect backend
**Acceptance:**
- [ ] 100 requests/minute per user for read
- [ ] 30 requests/minute per user for write
- [ ] 429 response with retry-after header

## Tech Debt (DEBT-01 to DEBT-03)

### DEBT-01: ConversationAtomicityService Wiring

**What:** Wire atomicity service to VoltAgent operations
**Why:** Complete v1 work, ensure rollback capability
**Acceptance:**
- [ ] Inject service into VoltAgent
- [ ] Wrap conversation operations
- [ ] Test rollback scenarios

### DEBT-02: PrismaRetryService Integration

**What:** Replace inline retry logic with service
**Why:** Consistent error handling, reduce duplication
**Acceptance:**
- [ ] Identify inline retry patterns
- [ ] Replace with PrismaRetryService calls
- [ ] Remove duplicated code

### DEBT-03: DEPRECATED Marker Cleanup

**What:** Add removal dates to legacy markers
**Why:** Clear tech debt timeline
**Acceptance:**
- [ ] Audit all DEPRECATED comments
- [ ] Add @removal-date annotations
- [ ] Create tracking issue for each

---

## Requirement Coverage

| Category | Count | Requirements |
|----------|-------|--------------|
| Frontend | 10 | FE-01 to FE-10 |
| Performance | 6 | PERF-01 to PERF-06 |
| Security | 5 | SEC-01 to SEC-05 |
| Tech Debt | 3 | DEBT-01 to DEBT-03 |
| **Total** | **24** | |

---
*Requirements defined: 2026-02-02*
