# MailAgent - Comprehensive Optimization Plan

## 🎯 CURRENT SESSION: Full Stack Optimization (2026-01-09)

**User Decision:** ALL optimization tasks in steps

### ✅ COMPLETED (Phase 1 + Phase 2 + Phase 3 + Part A)
| Task | Status | Commit |
|------|--------|--------|
| Citus Docker Image | ✅ `mailagent-postgres:citus-pgvector` | a942b86 |
| Composite PKs | ✅ 5 tables (emails, folders, calendar_events, unified_contacts, embeddings) | a942b86 |
| tenantId Columns | ✅ 8 child tables | a942b86 |
| **JSONB → Direct Field** | ✅ 3 files fixed (O(n) → O(log n)) | 264c2ed |
| **Raw SQL Audit** | ✅ 18 files verified, 5 fixed | 264c2ed |
| GDPR Web Search Cache | ✅ `tenantId:userId` + `locale:tenantId` isolation | Verified |
| analyzeEmail() Caching | ✅ 24h cache in EmailAnalysis | Verified |
| categorizeEmail() UserLabels | ✅ Fetches from DB | Verified |
| **Auth Performance Cache** | ✅ Redis session cache (`${tenantId}:${sessionId}`) | Verified |
| **Contact Embeddings** | ✅ Queue + KnowledgeBase + RAG search | Verified |
| **Lint Cleanup** | ✅ 4 warnings fixed + ESLint config updated | 2026-01-09 |
| **RAG for search_emails** | ✅ Already uses UnifiedRetriever | 2026-01-09 |
| **Follow-up RAG Detection** | ✅ `scanEmailsForFollowUps()` implemented | 2026-01-09 |
| **Tool Consolidation (Part A)** | ✅ **44 → 17 tools (61% reduction)** | 2026-01-10 |
| **Mistral Agent Persistence** | ✅ PostgreSQL + GDPR deletion | 2026-01-10 |
| **GDPR Wiring** | ✅ Cleanup service + tenant deletion flow | 2026-01-10 |
| **Agent Consolidation (Part B)** | ✅ **10 → 3 agents** (SupervisorAgent + ActionsAgent + IntelligenceAgent) | 2026-01-10 |
| **Memory Bug Fixes (Part C)** | ✅ **6/6 bugs fixed** (retry, memory passing, fallback sessionId, atomic creation) | 2026-01-10 |
| **Prompt Quality (FIX #5)** | ✅ **Calendar + Contacts agents updated** with `<MY_TOOLS>`, `<WORKFLOW>`, examples | 2026-01-11 |
| **Week 1 Part A: emailDensity Move** | ✅ Moved from AI Settings to General Settings (Appearance section) | 2026-01-11 |
| **Week 1 Part B: Signature in Compose** | ✅ Frontend auto-appends default signature, visible in editor | 2026-01-11 |
| **Week 1 Part B: Signature Reply/Forward** | ✅ Backend signature append for reply + forward endpoints | 2026-01-11 |
| **Week 2 Part A: Draft Attachments** | ✅ Autosave includes attachments + restore from draft | 2026-01-11 |
| **Week 2 Part B: Contact Photos Email List** | ✅ Batch sender photo lookup + lazy-load from providers | 2026-01-11 |
| **Week 2 Part C: Avatar Consistency** | ✅ Consistent colored initials + `stringToColor()` for both list & detail | 2026-01-11 |
| **Week 3 Task 2: communicationStyle → tone** | ✅ AI compose now uses user's preferred communication style | 2026-01-11 |

### ✅ COMPLETED Week 3 Task 2: communicationStyle → compose tone (2026-01-11)

**Problem**: User's `communicationStyle` preference (FORMAL/CASUAL/TECHNICAL/CREATIVE) was stored in settings but NOT used when composing emails via AI.

**Solution**: Wire `useAiProfile()` hook into `ComposeEditor.tsx` and map style to API `tone` parameter.

| File | Change |
|------|--------|
| `frontend/components/email/compose/ComposeEditor.tsx` | Added `useAiProfile()` hook + `mapCommunicationStyleToTone()` mapping |

**Mapping**:
| CommunicationStyle | API tone |
|--------------------|----------|
| FORMAL | 'formal' |
| CASUAL | 'casual' |
| TECHNICAL | 'professional' |
| CREATIVE | 'friendly' |
| (default) | 'professional' |

**Flow**:
```text
User sets communicationStyle in AI Settings
       ↓
useAiProfile() fetches from personalizationApi
       ↓
ComposeEditor maps style → tone
       ↓
aiApi.composeEmail({ tone: 'formal' | 'casual' | ... })
       ↓
Backend AI generates email with appropriate tone
```

### ✅ COMPLETED Week 2 Part C: Avatar Consistency (2026-01-11)

**Problem**: Email list and detail view had inconsistent avatar behavior - gray Gravatar silhouettes vs colored initials.

**Solution**: Removed Gravatar fallback, implemented consistent colored initials using `stringToColor()` hash function.

| File | Change |
|------|--------|
| `frontend/lib/utils/gravatar.ts` | Added `stringToColor()` for consistent avatar colors based on sender name |
| `frontend/pages/dashboard/email.tsx` | Pass `avatarUrl` to both list and detail views |
| `frontend/components/email/list/ThreadListItem.tsx` | Use `stringToColor(thread.from)` for avatar bgcolor |
| `frontend/components/email/thread/ExpandedMessage.tsx` | Use `stringToColor(message.from)` for avatar bgcolor |

**Avatar Priority Chain**:

```text
1. Contact photo (from unified_contacts.photoUrl via lookupByEmails API)
   ↓ (if null)
2. Colored initials using stringToColor(sender) - consistent hue per sender
```

**Database Stats** (2026-01-11):
- 4,981 contacts WITH photoUrl (90%)
- 564 contacts WITHOUT photoUrl (10%)
- Google URLs: `https://lh3.googleusercontent.com/cm/...`

**Key Design Decisions**:
- Removed Gravatar: Gray mystery person silhouettes looked worse than colored initials
- Hash-based colors: Same sender = same color everywhere (list + detail)
- HSL color space: `hsl(hash % 360, 65%, 45%)` for readable white text on colored background

### ✅ COMPLETED P3: Mistral Agent PostgreSQL Persistence (2026-01-10)

**Problem:** Mistral agent IDs were only cached in Redis/memory with 24h TTL, causing duplicate agent creation after restarts.

**Solution:** PostgreSQL persistence with `MistralAgent` model + GDPR compliance.

| Component | Status |
|-----------|--------|
| `MistralAgent` Prisma model | ✅ Citus-ready `@@unique([tenantId, agentType, locale])` |
| Tenant cascade delete | ✅ GDPR: `onDelete: Cascade` |
| `web-search.tools.ts` | ✅ Prisma persistence + `deleteTenantAgents()` |
| `analytics.tools.ts` | ✅ Prisma persistence + `deleteTenantAnalyticsAgents()` |
| `agent-types.ts` | ✅ Constants: `MistralAgentType.WEB_SEARCH`, `MistralAgentType.ANALYTICS` |
| Type-check | ✅ Passed |

**Architecture:**

```text
PostgreSQL (MistralAgent) → Primary, persistent
         ↓
Memory Cache (agentPool) → Fast path
         ↓
Mistral API (verify) → Check agent exists before reuse
```

**GDPR Functions:**

- `deleteTenantAgents(tenantId, configService, prisma)` - web-search cleanup
- `deleteTenantAnalyticsAgents(tenantId, configService, prisma)` - analytics cleanup

Both delete from **Mistral API** AND **PostgreSQL** on subscription cancellation.

### ✅ COMPLETED P3.5: GDPR Wiring (2026-01-10)

**Problem:** GDPR deletion functions existed but weren't wired to tenant deletion flow.

**Solution:** Created consolidated cleanup service + wired to tenant deletion.

| Component | Status |
|-----------|--------|
| `MistralAgentCleanupService` | ✅ Created - consolidates all agent type cleanup |
| `GdprService.purgeExternalTenantData()` | ✅ Added - calls cleanup service |
| `TenantService.deleteTenant()` | ✅ Wired - calls GDPR purge before soft delete |
| `TenantService.hardDeleteTenant()` | ✅ Added - for full GDPR erasure |
| Module imports | ✅ ComplianceModule imports AiModule |
| Type-check | ✅ Passed |

**Architecture:**

```text
TenantService.deleteTenant()
         ↓
GdprService.purgeExternalTenantData()
         ↓
MistralAgentCleanupService.deleteAllTenantAgents()
         ↓
For each agent type (web-search, analytics):
  1. Delete from Mistral API
  2. Delete from PostgreSQL
  3. Clear memory cache
```

**Files Created/Modified:**

- `ai/services/mistral-agent-cleanup.service.ts` - NEW
- `compliance/services/gdpr.service.ts` - Added `purgeExternalTenantData()`
- `tenants/services/tenant.service.ts` - Wired to GdprService
- `ai/ai.module.ts` - Export MistralAgentCleanupService
- `compliance/compliance.module.ts` - Import AiModule
- `tenants/tenants.module.ts` - Import ComplianceModule

### ✅ COMPLETED P1 (RAG Optimization)
| Task | Time | Status |
|------|------|--------|
| RAG for `search_emails` tool | 0h | ✅ Already implemented with UnifiedRetriever |
| Follow-up detection via RAG | 2h | ✅ `scanEmailsForFollowUps()` uses RAG + LLM |

### ✅ COMPLETED Week 1: Settings Cleanup + Email Signatures (2026-01-11)

**Part A: Move emailDensity from AI Settings to Appearance**

| File | Change |
|------|--------|
| `frontend/locales/en.ts` | Moved emailDensity strings to `generalPanel` |
| `frontend/locales/it.ts` | Moved emailDensity strings to `generalPanel` |
| `frontend/locales/index.ts` | Updated TypeScript types (added to generalPanel, removed from aiPanel) |
| `frontend/components/settings/GeneralSettings.tsx` | Added emailDensity UI to Appearance section |
| `frontend/components/settings/AiSettings.tsx` | Removed emailDensity UI |
| `frontend/components/dashboard/Settings.tsx` | Rewired props from AI to General |

**Part B: Email Signature in Compose (Visible to User)**

**Frontend Pattern:** Frontend auto-appends default signature to editor so user can see/edit it. Passes `signatureId: null` to backend to prevent double-append.

| File | Change |
|------|--------|
| `frontend/components/email/compose/ComposeDialog.tsx` | Auto-append signature with `useDefaultSignature()` hook |
| `frontend/lib/api/emails.ts` | Added `signatureId` to SendEmailDto, ReplyEmailDto, ForwardEmailDto |

**Backend Pattern:** Backend receives `signatureId` and appends only if NOT null (frontend handles visible signatures).

| File | Change |
|------|--------|
| `backend/src/modules/email/dto/send-email.dto.ts` | Added `signatureId` to `ReplyForwardEmailRequestDto` |
| `backend/src/modules/email/controllers/emails.controller.ts` | Signature append logic in `replyToEmail()` and `forwardEmail()` |
| `backend/src/modules/email/services/email-send.service.ts` | Added `signatureContent` parameter to `forwardEmail()` |

**Architecture:**
```text
ComposeDialog opens
       ↓
useDefaultSignature(providerId) fetches default signature
       ↓
useEffect auto-appends signature to editor (user sees it)
       ↓
User can edit signature in editor
       ↓
handleSend() passes signatureId: null
       ↓
Backend receives null → skips signature append (already in body)
```

### ✅ COMPLETED Week 2 Part A: Compose Draft Attachments (2026-01-11)

**Problem**: Draft attachments were lost during autosave/reload - user adds files, closes dialog, reopens = files gone.

**Solution**: Full attachment persistence in drafts.

| File | Change |
|------|--------|
| `frontend/lib/api/emails.ts` | Added `DraftAttachmentDto` type, `attachments` field to `SaveDraftDto`, exported `fileToBase64` |
| `frontend/components/email/compose/ComposeDialog.tsx` | Autosave converts attachments to base64, restore effect converts base64 back to File objects |

**Architecture**:
```text
User adds attachments → autosave triggers
       ↓
fileToBase64() converts File[] to DraftAttachmentDto[]
       ↓
saveDraft API stores in metadata.draftAttachments
       ↓
User closes and reopens draft
       ↓
useEmailDraft fetches draft with metadata
       ↓
useEffect converts base64 back to File via atob + Blob + File constructor
       ↓
setAttachments() restores UI
```

### ✅ COMPLETED Week 2 Part B: Contact Photos in Email List (2026-01-11)

**Problem**: Email list showed sender initials but no photos - contact photo feature only worked in ContactDetail page, not for email list sender avatars.

**Solution**: Batch email-to-contact lookup with efficient PostgreSQL JSONB query.

| File | Change |
|------|--------|
| `backend/src/modules/contacts/services/contacts.service.ts` | Added `findContactsByEmails()` batch lookup, `getContactPhoto()` lazy-load |
| `backend/src/modules/contacts/controllers/contacts.controller.ts` | Added `POST /contacts/lookup-by-emails`, `GET /contacts/:id/photo` endpoints |
| `backend/src/modules/contacts/dto/contact.dto.ts` | Added `LookupContactsByEmailsDto` |
| `backend/src/modules/contacts/services/google-contacts-sync.service.ts` | Added `getContactPhoto()` for Google People API |
| `backend/src/modules/contacts/services/microsoft-contacts-sync.service.ts` | Added `getContactPhoto()` for Microsoft Graph API |
| `frontend/lib/api/contacts.ts` | Added `lookupByEmails()`, `getContactPhoto()`, `SenderContactMap` types |
| `frontend/hooks/queries/contacts-keys.ts` | Added `senderPhotos`, `photo` query keys |
| `frontend/hooks/queries/use-contacts.ts` | Added `useSenderPhotos()`, `useContactPhoto()` hooks |
| `frontend/pages/dashboard/email.tsx` | Extract sender emails, fetch photos, populate `avatarUrl` in ThreadListItem |
| `frontend/components/contacts/ContactDetail.tsx` | Lazy-load photos with `useContactPhoto()` |

**Architecture**:
```text
Email List Page
       ↓
Extract unique sender emails from threads
       ↓
useSenderPhotos(emails) → POST /contacts/lookup-by-emails
       ↓
PostgreSQL JSONB query: SELECT WHERE email IN (emails)
       ↓
Returns Map<email, { contactId, photoUrl, displayName }>
       ↓
formatEmailToThread() populates avatarUrl from map
       ↓
ThreadListItem displays Avatar with photo
```

**Contact Detail Page (Lazy Loading)**:

```text
ContactDetail receives contact prop
       ↓
useContactPhoto(id, hasProviderContacts, existingPhotoUrl)
       ↓
Only fetches if: ID exists + has provider contacts + no existing photoUrl
       ↓
GET /contacts/:id/photo → tries Google/Microsoft API
       ↓
Caches photo URL in unified_contacts.photoUrl for future requests
```

### ✅ COMPLETED P2: VoltAgent Tool Consolidation (2026-01-10)

## AUDIT SUMMARY: Tool + Agent + Memory Consolidation

### Current State (Updated 2026-01-10)
| Category | Count | Issues |
|----------|-------|--------|
| **Tools** | **17** ✅ | Consolidated from 44 (61% reduction) |
| **Agents** | **3** ✅ | Consolidated from 10 (SupervisorAgent + ActionsAgent + IntelligenceAgent) |
| **Memory Bugs** | **0** ✅ | All 6 bugs fixed (retry, memory passing, fallback sessionId, atomic creation) |
| **Embedding Rate** | ✅ | Fixed: `EMBEDDING_RATE_MAX=5` (within Mistral 6 RPS limit) |

---

## ✅ PART A: Tool Consolidation (44 → 17) - COMPLETED 2026-01-10

### A.1 Final Tool Inventory

| File | Before | After | Status |
|------|--------|-------|--------|
| `email.tools.ts` | 14 | 5 | ✅ DONE |
| `insights.tools.ts` | 10 | 3 | ✅ DONE |
| `folder.tools.ts` | 5 | 2 | ✅ DONE |
| `contacts.tools.ts` | 5 | 2 | ✅ DONE |
| `calendar.tools.ts` | 5 | 2 | ✅ DONE |
| `document-library.tools.ts` | 3 | 1 | ✅ DONE |
| `web-search.tools.ts` | 1 | 1 | ✅ Unchanged |
| `analytics.tools.ts` | 1 | 1 | ✅ Unchanged |
| **TOTAL** | **44** | **17** | **✅ 61% reduction** |

### A.1.1 Consolidated Tools Summary

| Tool | Actions | File |
|------|---------|------|
| `analyze_email` | summary, sentiment, intent, priority, actions, labels | insights.tools.ts |
| `compose_reply` | mode='full' \| 'suggestions' | insights.tools.ts |
| `semantic_search_emails` | RAG-based search | insights.tools.ts |
| `list_emails` | mode='accounts' \| 'unread' \| 'content' | email.tools.ts |
| `manage_email` | send, reply, forward, delete, archive, mark_read, mark_unread, star, unstar | email.tools.ts |
| `search_emails` | Hybrid RAG + Prisma | email.tools.ts |
| `count_emails` | Flexible period parsing | email.tools.ts |
| `bulk_email_actions` | delete, empty_folder, archive, mark_read | email.tools.ts |
| `list_folders` | Read-only | folder.tools.ts |
| `manage_folder` | create, rename, delete, move_email | folder.tools.ts |
| `search_contacts` | Read-only search | contacts.tools.ts |
| `manage_contact` | get, create, update, delete | contacts.tools.ts |
| `get_events` | Read-only | calendar.tools.ts |
| `manage_event` | create, update, delete, check_availability | calendar.tools.ts |
| `manage_document_library` | query, list, create | document-library.tools.ts |
| `web_search` | Unchanged | web-search.tools.ts |
| `analyze_data` | Unchanged | analytics.tools.ts |

### A.2 Original Consolidation Map (Reference)

#### insights.tools.ts (10 → 3)
| `insights.tools.ts` | 10 | 3 |
| `folder.tools.ts` | 5 | 2 |
| `contacts.tools.ts` | 5 | 2 |
| `calendar.tools.ts` | 5 | 2 |
| `document-library.tools.ts` | 3 | 1 |
| `web-search.tools.ts` | 1 | 1 |
| `analytics.tools.ts` | 1 | 1 |
| **TOTAL** | **44** | **17** |

### A.2 Consolidation Map

#### insights.tools.ts (10 → 3)
| REMOVE (Redundant) | Reason |
|--------------------|--------|
| `analyze_sentiment` | Already in `analyze_email` |
| `detect_intent` | Already in `analyze_email` |
| `calculate_priority` | Already in `analyze_email` |
| `summarize_email` | Merge into `analyze_email` |
| `extract_action_items` | Merge into `analyze_email` |
| `categorize_email` | Merge into `analyze_email` |
| `generate_smart_replies` | Merge into `compose_reply` |

| KEEP | Purpose |
|------|---------|
| `analyze_email` | Comprehensive analysis (returns all: summary, sentiment, intent, priority, actions, category) |
| `compose_reply` | Reply generation with `mode: 'full' \| 'suggestions'` |
| `semantic_search_emails` | RAG-based semantic search |

#### email.tools.ts (18 → 5)
| MERGE INTO | Replaces |
|------------|----------|
| `manage_emails` | `send_email`, `reply_email`, `forward_email`, `delete_email`, `archive_email`, `mark_read`, `mark_unread`, `star_email`, `unstar_email` |
| `search_emails` | Keep as-is (hybrid RAG) |
| `list_emails` | `get_unread_emails`, `get_email_content` |
| `count_emails` | Keep as-is |
| `bulk_email_actions` | `bulk_delete_emails`, `bulk_archive_emails`, `bulk_mark_read`, `empty_folder` |

#### folder.tools.ts (5 → 2)
| MERGE INTO | Replaces |
|------------|----------|
| `list_folders` | Keep as-is |
| `manage_folders` | `create_folder`, `rename_folder`, `delete_folder`, `move_email_to_folder` |

#### contacts.tools.ts (5 → 2)
| MERGE INTO | Replaces |
|------------|----------|
| `search_contacts` | `search_contacts`, `get_contact` |
| `manage_contacts` | `create_contact`, `update_contact`, `delete_contact` |

#### calendar.tools.ts (5 → 2)
| MERGE INTO | Replaces |
|------------|----------|
| `get_calendar` | `get_events`, `check_availability` |
| `manage_calendar` | `create_event`, `update_event`, `delete_event` |

#### document-library.tools.ts (3 → 1)
| MERGE INTO | Replaces |
|------------|----------|
| `query_documents` | `query_documents`, `list_document_libraries`, `create_document_library` |

---

## ✅ COMPLETED PART B: Agent Consolidation (10 → 3) - 2026-01-10

**Status:** All agents consolidated and old agents deleted.

| Component | Status |
|-----------|--------|
| `actions.agent.ts` | ✅ Created - handles all WRITE operations |
| `intelligence.agent.ts` | ✅ Created - handles all READ/ANALYSIS operations |
| `supervisor.agent.ts` | ✅ Updated - imports and uses consolidated agents |
| Old agents (email, calendar, contacts, knowledge, general) | ✅ DELETED |
| Memory passed to sub-agents | ✅ Fixed in supervisor.agent.ts |

### B.1 Previous Agent Architecture (DELETED)

```
SupervisorAgent (orchestrator)
├── EmailAgent (33 tools) ← MERGE
├── CalendarAgent (5 tools) ← MERGE
├── ContactsAgent (5 tools) ← MERGE
├── KnowledgeAgent (1 tool) ← MERGE
├── GeneralAgent (0 tools) ← DELETE
├── WebSearchAgent (optional) ← MERGE
├── DocumentLibraryAgent (optional) ← MERGE
└── AnalyticsAgent (optional) ← MERGE
```

### B.2 Target Architecture (3 Agents)

```
SupervisorAgent (orchestrator)
├── ActionsAgent (ALL write operations)
│   ├── manage_emails (send/reply/forward/delete/archive/star)
│   ├── bulk_email_actions
│   ├── manage_folders
│   ├── manage_contacts
│   └── manage_calendar
│
└── IntelligenceAgent (ALL read + analysis)
    ├── search_emails (RAG hybrid)
    ├── list_emails
    ├── count_emails
    ├── analyze_email
    ├── compose_reply
    ├── list_folders
    ├── search_contacts
    ├── get_calendar
    ├── query_documents (lazy)
    ├── web_search (lazy)
    └── analyze_data (lazy)
```

### B.3 Benefits of 3-Agent Architecture

| Benefit | Impact |
|---------|--------|
| **Faster delegation** | 2 specialists vs 8 = 4x faster routing |
| **Shared memory** | Both agents receive memory from Supervisor |
| **Clear separation** | Write ops (ActionsAgent) vs Read ops (IntelligenceAgent) |
| **Simpler HITL** | All approval flows go through ActionsAgent |
| **Lazy loading** | Optional tools (web_search, analytics) loaded on-demand |

---

## ✅ COMPLETED PART C: Memory/Context Loss Fixes (6 Critical Bugs) - 2026-01-10

**Status:** All 6 memory bugs fixed in voltagent.service.ts and supervisor.agent.ts.

| # | Severity | Issue | Fix Location | Status |
|---|----------|-------|--------------|--------|
| 1 | 🔴 CRITICAL | Memory disabled on DB error | `voltagent.service.ts:225-261` | ✅ Retry with exponential backoff (3 attempts, 1s/2s/4s) |
| 2 | 🔴 CRITICAL | Sub-agents don't receive memory | `supervisor.agent.ts:316-340` | ✅ Memory passed to ActionsAgent + IntelligenceAgent |
| 3 | 🟠 HIGH | History only injected if conversationId | `voltagent.service.ts:876-880` | ✅ Deterministic fallback: `${tenantId}:${userId}:default` |
| 4 | 🟠 HIGH | Memory persistence race condition | `voltagent.service.ts:1029-1053` | ✅ Atomic creation with duplicate error handling |
| 5 | 🟡 MEDIUM | 4 unintegrated memory systems | N/A | ✅ Addressed via unified memory passing |
| 6 | 🟡 MEDIUM | Tenant:user namespace collision | `voltagent.service.ts:876-880` | ✅ Fixed with deterministic sessionId format |

### C.1 Bug Inventory (RESOLVED)

| # | Severity | Issue | File:Line |
|---|----------|-------|-----------|
| 1 | ✅ FIXED | Memory disabled on DB error (silent fallback) | `voltagent.service.ts:225-261` |
| 2 | ✅ FIXED | Sub-agents don't receive memory | `supervisor.agent.ts:316-340` |
| 3 | ✅ FIXED | History only injected if conversationId provided | `voltagent.service.ts:876-880` |
| 4 | ✅ FIXED | Memory persistence race condition | `voltagent.service.ts:1029-1053` |
| 5 | ✅ FIXED | 4 unintegrated memory systems | Unified via memory passing |
| 6 | ✅ FIXED | Tenant:user namespace collision risk | `voltagent.service.ts:876-880` |

### C.2 Implementation Details (Reference)

#### Fix #1: Memory Initialization Error Handling
```typescript
// BEFORE (silent failure)
} catch (error) {
  this.memory = null;  // ← Agents lose all context!
}

// AFTER (retry + alert)
} catch (error) {
  this.logger.error('CRITICAL: Memory init failed, retrying...', error);
  await this.retryMemoryInit(3);  // Retry 3 times
  if (!this.memory) {
    // Emit health check alert
    this.healthService.setUnhealthy('voltagent-memory');
  }
}
```

#### Fix #2: Pass Memory to Sub-Agents
```typescript
// BEFORE (no memory passed)
const emailAgent = createEmailAgent({
  model, prisma, emailSendService,
  // ❌ NO MEMORY
});

// AFTER (memory shared)
const emailAgent = createEmailAgent({
  model, prisma, emailSendService,
  memory: options.memory,  // ✅ PASS MEMORY
});
```

#### Fix #3: Always Inject History (Generate conversationId if missing)
```typescript
// BEFORE (conditional)
if (this.memory && options.conversationId) { ... }

// AFTER (always)
const conversationId = options.conversationId || this.generateConversationId(tenantId, userId);
if (this.memory) {
  const history = await this.memory.getMessages(tenantUserId, conversationId, { limit: 50 });
  // Always inject history
}
```

#### Fix #4: Atomic Conversation Creation
```typescript
// BEFORE (race condition)
const existing = await this.memory.getConversation(id);
if (!existing) {
  await this.memory.createConversation({ ... });  // ← Another request might create between check and create
}

// AFTER (upsert pattern)
await this.memory.upsertConversation({
  id: persistedConversationId,
  userId: tenantUserId,
  // ... other fields
});
```

---

## ✅ COMPLETED PART D: Implementation Order (ALL PHASES DONE)

### ✅ Phase 0: Fix Embedding Rate Limit - DONE
1. ✅ Change `EMBEDDING_RATE_MAX` default from 25 → 5 in `email-embedding.queue.ts:67`
2. ✅ Update `.env` to set `EMBEDDING_RATE_MAX=5`
3. ✅ Verified

### ✅ Phase 1: Fix Memory Bugs - DONE
1. ✅ Pass memory to sub-agents in `supervisor.agent.ts`
2. ✅ Generate conversationId if missing (deterministic fallback)
3. ✅ Add atomic conversation creation (duplicate error handling)
4. ✅ Add retry logic for memory init (exponential backoff)

### ✅ Phase 2: Create Consolidated Tools - DONE
1. ✅ Tools consolidated in existing files (email.tools.ts, insights.tools.ts, etc.)
2. ✅ 44 → 17 tools (61% reduction)
3. ✅ Tool exports updated

### ✅ Phase 3: Create Consolidated Agents - DONE
1. ✅ Created `actions.agent.ts`
2. ✅ Created `intelligence.agent.ts`
3. ✅ Updated `supervisor.agent.ts`

### ✅ Phase 4: Cleanup + Test - DONE
1. ✅ Old agent files deleted (email, calendar, contacts, knowledge, general)
2. ✅ Type-check passed
3. ✅ GDPR wiring verified

---

## PART E: Files to Modify

### New Files
| File | Purpose |
|------|---------|
| `tools/email-consolidated.tools.ts` | Merged email/folder/insights |
| `tools/crm-consolidated.tools.ts` | Merged contacts/calendar |
| `agents/actions.agent.ts` | All write operations |
| `agents/intelligence.agent.ts` | All read/analysis |

### Modified Files
| File | Changes |
|------|---------|
| `agents/supervisor.agent.ts` | Use 2 agents, pass memory |
| `voltagent.service.ts` | Memory fixes, simplified agent creation |
| `tools/index.ts` | Update exports |
| `agents/index.ts` | Update exports |

### Files to Delete (After Migration)
- `tools/email.tools.ts`
- `tools/insights.tools.ts`
- `tools/folder.tools.ts`
- `tools/contacts.tools.ts`
- `tools/calendar.tools.ts`
- `agents/email.agent.ts`
- `agents/calendar.agent.ts`
- `agents/contacts.agent.ts`
- `agents/knowledge.agent.ts`
- `agents/general.agent.ts`
- `agents/websearch.agent.ts`
- `agents/document-library.agent.ts`
- `agents/analytics.agent.ts`

---

## PART F: Verification

### Unit Tests
```bash
npm run test -- --grep "consolidated"
```

### Manual Tests
- [ ] Chat: "Send email to John" → ActionsAgent → HITL
- [ ] Chat: "Search emails about budget" → IntelligenceAgent → RAG
- [ ] Chat follow-up: "What did I just ask?" → Memory works
- [ ] Multi-turn: Context preserved after delegation

### Metrics to Track
| Metric | Before | Target |
|--------|--------|--------|
| Tool count | 44 | 17 |
| Agent count | 10 | 3 |
| Memory bugs | 6 | 0 |
| Delegation latency | ~500ms | ~150ms |

---

## PART G: Embedding Rate Limit Optimization (🚨 CRITICAL)

### G.1 Current State Audit (2026-01-09)

**Mistral API Limits:**
| Tier | Requests/Second | Tokens/Minute | Tokens/Month |
|------|-----------------|---------------|--------------|
| Free | 1 RPS | 500K | N/A |
| **Paid (Current)** | **6 RPS** | **20M** | **200B** |

**Current Configuration VIOLATIONS:**

| File | Line | Setting | Value | Limit | Violation |
|------|------|---------|-------|-------|-----------|
| `email-embedding.queue.ts` | 67 | `EMBEDDING_RATE_MAX` | **25** | 6 | **4.2x over limit!** |
| `.env` | 231 | `EMBEDDING_RATE_MAX` | 2 | 6 | ✅ Safe (but queue overrides) |

### G.2 What's Already Working ✅

| Feature | Status | Location |
|---------|--------|----------|
| Batch embedding | ✅ Implemented | `mistral.service.ts:generateBulkEmbeddings()` |
| Queue batching | ✅ Working | `email-embedding.queue.ts` (50 items, 200ms flush) |
| Retry with backoff | ✅ Working | `email-embedding.queue.ts` (6 retries, exponential) |
| Token counting | ❌ **MISSING** | No pre-check before API call |

### G.3 Critical Fixes Required

#### Fix #1: Rate Limit Correction (IMMEDIATE)
```typescript
// File: backend/src/modules/ai/services/email-embedding.queue.ts line 67
// BEFORE (4.2x over Mistral limit!)
this.RATE_MAX = parseInt(this.configService.get('EMBEDDING_RATE_MAX', '25'), 10);

// AFTER (within Mistral 6 RPS limit)
this.RATE_MAX = parseInt(this.configService.get('EMBEDDING_RATE_MAX', '5'), 10);  // Safe margin
```

#### Fix #2: Environment Variable Update
```env
# File: .env (line 231)
# BEFORE
EMBEDDING_RATE_MAX=2  # This is ignored because queue defaults to 25!

# AFTER
EMBEDDING_RATE_MAX=5  # 83% of Mistral's 6 RPS limit (safety margin)
```

#### Fix #3: Token Counting (Optional - Prevents Truncation)
```typescript
// File: backend/src/modules/ai/services/knowledge-base.service.ts
// Add before generateBulkEmbeddings():
const tokenCount = this.countTokens(chunkContents);
if (tokenCount > 16000) {  // Mistral embed max context
  this.logger.warn(`Chunk too large (${tokenCount} tokens), splitting...`);
  // Split into smaller chunks
}
```

### G.4 Chunk Size Consistency

**Issue:** Code default (6000 chars) differs from env (12000 chars)

| Location | Default | Env Value | Tokens (~4 chars/token) |
|----------|---------|-----------|------------------------|
| `knowledge-base.service.ts:87` | 6000 | N/A | ~1500 |
| `.env:172` | N/A | 12000 | ~3000 |

**Recommendation:** Align to 6000 chars (1500 tokens) for safety margin with Mistral's 8K context.

### G.5 Implementation Order

| Step | Task | Time | Priority |
|------|------|------|----------|
| 1 | Fix `EMBEDDING_RATE_MAX` default from 25 → 5 | 5min | 🔴 P0 |
| 2 | Update `.env` documentation | 5min | 🔴 P0 |
| 3 | Add token counting pre-check | 30min | 🟡 P2 |
| 4 | Align chunk size constants | 10min | 🟡 P2 |

### G.6 Files to Modify

| File | Change |
|------|--------|
| `backend/src/modules/ai/services/email-embedding.queue.ts:67` | Change default from 25 → 5 |
| `backend/.env` | Update `EMBEDDING_RATE_MAX=5` |
| `backend/src/modules/ai/services/knowledge-base.service.ts` | (Optional) Add token counting |

### G.7 Verification

```bash
# 1. Check rate limit is applied
grep -n "RATE_MAX" backend/src/modules/ai/services/email-embedding.queue.ts

# 2. Monitor BullMQ rate limiting
# Redis CLI: XINFO STREAM bull:email-embedding:limiter

# 3. Check Mistral API dashboard for 429 errors
# https://console.mistral.ai/usage

# 4. Test embedding generation
npx ts-node backend/scripts/test-embedding-rate.ts
```

---

### ✅ SCHEMA BLOCKERS (For Full Citus Distribution) - COMPLETED 2026-01-09
**Status: 100% Citus-ready - All tables have tenantId**

| Table | Status | Changes Applied |
|-------|--------|-----------------|
| **Session** | ✅ | tenantId + `@@unique([tenantId, token])` |
| **TrustedDevice** | ✅ | tenantId + `@@unique([tenantId, deviceToken])` |
| **WebAuthnCredential** | ✅ | tenantId + `@@unique([tenantId, credentialId])` |
| **AIMemoryHistory** | ✅ | tenantId + `@@index([tenantId])` |
| **LibraryDocument** | ✅ | tenantId + `@@index([tenantId])` |
| **DealActivity** | ✅ | tenantId + `@@index([tenantId])` |

**Migration:** `20250109_citus_tenantid_remaining` applied successfully

---

## 🚀 SCHEMA BLOCKERS IMPLEMENTATION PLAN

### Overview
Add `tenantId` to 6 remaining tables for complete Citus sharding readiness.

### Phase 1: Prisma Schema Changes (schema.prisma)

#### 1.1 Session Model (lines 212-224)
```prisma
model Session {
  id        String   @id @default(cuid())
  tenantId  String                          // ADD
  userId    String
  token     String                          // REMOVE @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // ADD
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, token])               // ADD - Citus requires tenantId in unique
  @@index([tenantId])                       // ADD
  @@index([userId, token])
  @@map("sessions")
}
```

#### 1.2 TrustedDevice Model (lines 172-189)
```prisma
model TrustedDevice {
  id          String   @id @default(cuid())
  tenantId    String                        // ADD
  userId      String
  deviceToken String                        // REMOVE @unique
  deviceName  String?
  deviceHash  String
  ipAddress   String?
  location    String?
  expiresAt   DateTime
  lastUsedAt  DateTime @default(now())
  createdAt   DateTime @default(now())
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // ADD
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, deviceToken])         // ADD
  @@index([tenantId])                       // ADD
  @@index([userId])
  @@index([expiresAt])
  @@map("trusted_devices")
}
```

#### 1.3 WebAuthnCredential Model (lines 193-210)
```prisma
model WebAuthnCredential {
  id                   String   @id @default(cuid())
  tenantId             String                        // ADD
  userId               String
  credentialId         String                        // REMOVE @unique
  credentialPublicKey  String
  counter              Int      @default(0)
  credentialDeviceType String   @default("singleDevice")
  credentialBackedUp   Boolean  @default(false)
  transports           String[] @default([])
  aaguid               String?
  deviceName           String?
  lastUsedAt           DateTime @default(now())
  createdAt            DateTime @default(now())
  tenant               Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // ADD
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, credentialId])        // ADD
  @@index([tenantId])                       // ADD
  @@index([userId])
  @@map("webauthn_credentials")
}
```

#### 1.4 AIMemoryHistory Model (lines 943-955)
```prisma
model AIMemoryHistory {
  id        String   @id @default(cuid())
  tenantId  String                          // ADD
  memoryId  String
  action    String
  oldValue  String?
  newValue  String?
  changedBy String?
  createdAt DateTime @default(now())
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // ADD
  memory    AIMemory @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  @@index([tenantId])                       // ADD
  @@index([memoryId])
  @@map("ai_memory_history")
}
```

#### 1.5 LibraryDocument Model (lines 1028-1045)
```prisma
model LibraryDocument {
  id                String          @id @default(cuid())
  tenantId          String                      // ADD
  libraryId         String
  filename          String
  mimeType          String?
  size              Int
  status            String          @default("processing")
  isDeleted         Boolean         @default(false)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  mistralDocumentId String?
  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // ADD
  library           DocumentLibrary @relation(fields: [libraryId], references: [id], onDelete: Cascade)

  @@index([tenantId])                         // ADD
  @@index([libraryId, isDeleted])
  @@index([status])
  @@index([mistralDocumentId])
  @@map("library_documents")
}
```

#### 1.6 DealActivity Model (lines 1202-1214)
```prisma
model DealActivity {
  id           String           @id @default(cuid())
  tenantId     String                           // ADD
  dealId       String
  emailId      String?
  activityType DealActivityType
  description  String?
  metadata     Json             @default("{}")
  createdAt    DateTime         @default(now())
  tenant       Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)  // ADD
  deal         Deal             @relation(fields: [dealId], references: [id], onDelete: Cascade)

  @@index([tenantId])                          // ADD
  @@index([dealId])
  @@map("deal_activities")
}
```

#### 1.7 Update Tenant Model (add reverse relations)
Add to Tenant model:
```prisma
  sessions            Session[]
  trustedDevices      TrustedDevice[]
  webauthnCredentials WebAuthnCredential[]
  aiMemoryHistory     AIMemoryHistory[]
  libraryDocuments    LibraryDocument[]
  dealActivities      DealActivity[]
```

### Phase 2: Migration Script

**File:** `backend/prisma/migrations/20250109_citus_tenantid_remaining/migration.sql`

```sql
-- Step 1: Add tenantId columns (nullable initially)
ALTER TABLE "sessions" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "trusted_devices" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "webauthn_credentials" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ai_memory_history" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "library_documents" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "deal_activities" ADD COLUMN "tenantId" TEXT;

-- Step 2: Backfill tenantId from parent tables
UPDATE "sessions" s SET "tenantId" = u."tenantId" FROM "users" u WHERE s."userId" = u.id;
UPDATE "trusted_devices" td SET "tenantId" = u."tenantId" FROM "users" u WHERE td."userId" = u.id;
UPDATE "webauthn_credentials" wc SET "tenantId" = u."tenantId" FROM "users" u WHERE wc."userId" = u.id;
UPDATE "ai_memory_history" amh SET "tenantId" = am."tenantId" FROM "ai_memories" am WHERE amh."memoryId" = am.id;
UPDATE "library_documents" ld SET "tenantId" = dl."tenantId" FROM "document_libraries" dl WHERE ld."libraryId" = dl.id;
UPDATE "deal_activities" da SET "tenantId" = d."tenantId" FROM "deals" d WHERE da."dealId" = d.id;

-- Step 3: Set NOT NULL constraint
ALTER TABLE "sessions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "trusted_devices" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "webauthn_credentials" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ai_memory_history" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "library_documents" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "deal_activities" ALTER COLUMN "tenantId" SET NOT NULL;

-- Step 4: Drop old unique constraints
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_token_key";
ALTER TABLE "trusted_devices" DROP CONSTRAINT IF EXISTS "trusted_devices_deviceToken_key";
ALTER TABLE "webauthn_credentials" DROP CONSTRAINT IF EXISTS "webauthn_credentials_credentialId_key";

-- Step 5: Add new unique constraints with tenantId (Citus-ready)
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_token_key" UNIQUE ("tenantId", "token");
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_tenantId_deviceToken_key" UNIQUE ("tenantId", "deviceToken");
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_tenantId_credentialId_key" UNIQUE ("tenantId", "credentialId");

-- Step 6: Add tenantId indexes
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");
CREATE INDEX "trusted_devices_tenantId_idx" ON "trusted_devices"("tenantId");
CREATE INDEX "webauthn_credentials_tenantId_idx" ON "webauthn_credentials"("tenantId");
CREATE INDEX "ai_memory_history_tenantId_idx" ON "ai_memory_history"("tenantId");
CREATE INDEX "library_documents_tenantId_idx" ON "library_documents"("tenantId");
CREATE INDEX "deal_activities_tenantId_idx" ON "deal_activities"("tenantId");

-- Step 7: Add FK constraints
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_memory_history" ADD CONSTRAINT "ai_memory_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Phase 3: Service Updates (if raw SQL exists)

Check and update any raw SQL queries in these services:
- `auth.service.ts` - Session queries
- `trusted-device.service.ts` - TrustedDevice queries
- `webauthn.service.ts` - WebAuthnCredential queries
- `ai-memory.service.ts` - AIMemoryHistory queries
- `document-library.service.ts` - LibraryDocument queries
- `deals.service.ts` - DealActivity queries

### Phase 4: Verification

1. **Run migration:**
```bash
cd backend && npx prisma migrate dev --name citus_tenantid_remaining
```

2. **Regenerate Prisma client:**
```bash
npx prisma generate
```

3. **Type check:**
```bash
npm run type-check
```

4. **Verify tenant isolation test:**
```bash
npx ts-node backend/scripts/stress-test-multi-tenant.ts
```

5. **Verify RAG isolation:**
```bash
npx ts-node backend/scripts/test-contact-rag-isolation.ts
```

### Files to Modify

| File | Changes |
|------|---------|
| `backend/prisma/schema.prisma` | Add tenantId + relations to 6 models + reverse relations to Tenant |
| `backend/prisma/migrations/...` | New migration file |
| `backend/src/modules/auth/services/*.ts` | Update Session/TrustedDevice/WebAuthn queries |
| `backend/src/modules/ai/services/ai-memory.service.ts` | Update AIMemoryHistory queries if any |
| `backend/src/modules/ai/services/document-library.service.ts` | Update LibraryDocument queries |
| `backend/src/modules/crm/services/deals.service.ts` | Update DealActivity queries if any |

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration failure on prod data | Test on staging first; backup before migration |
| Session invalidation | Schedule during low-traffic period |
| Auth disruption | Monitor error rates post-deploy |
| FK constraint violations | Backfill ensures no orphan records |

### Rollback Plan

```sql
-- If migration fails, rollback:
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_tenantId_token_key";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_key" UNIQUE ("token");
ALTER TABLE "sessions" DROP COLUMN "tenantId";
-- Repeat for other tables...
```

---

## User Scope Decision: Full Citus migration for 1000+ tenants planned

---

## Executive Summary

**Goal:** Prepare MailAgent schema for Citus horizontal sharding by `tenantId` to support 1000+ tenants with data isolation and horizontal scalability.

**Critical Blockers Found (COMPREHENSIVE AUDIT COMPLETE):**

| Category | Count | Details |
|----------|-------|---------|
| Raw SQL queries | 12 total | 1 CRITICAL, 2 MEDIUM, 9 OK |
| Tables missing tenantId | 18 | 4 BLOCKERS + 14 child tables |
| Unique constraints | 7 | Need tenantId added |
| Background jobs | 3 | Medium-risk cross-tenant scans |
| Self-referential FKs | 2 | Folder, UserLabel hierarchies |

**Estimated Effort:** 55-65h (3-4 weeks)

---

## 🔴 COMPREHENSIVE AUDIT RESULTS

### A. Raw SQL Query Audit (18 files audited - ALL FIXED 2026-01-09)

| File | Line | Status | Fix Applied |
|------|------|--------|-------------|
| `optimistic-lock.ts` | 244-248 | ✅ FIXED | Already has tenantId |
| `emails.service.ts` | 259-476 | ✅ OK | Has tenantId + FOR UPDATE |
| `contacts.service.ts` | 714-724 | ✅ OK | Has tenantId |
| `knowledge-base.service.ts` | 760, 782 | ✅ **FIXED** | JSONB → direct `emailId` field |
| `embeddings.service.ts` | 93-177 | ✅ OK | Best practice CTE pattern |
| `embedding-backfill-scheduler.service.ts` | 292, 334 | ✅ **FIXED** | JSONB → direct `emailId` field |
| `base-email-sync.service.ts` | 835 | ✅ **FIXED** | Added `AND "tenantId" = ${tenantId}` |
| `ai-memory.service.ts` | 435 | ✅ **FIXED** | Added `AND "tenantId" = ${tenantId}` |
| `base-contacts-sync.service.ts` | 389 | ✅ **FIXED** | Added `WHERE "tenantId" = ${provider.tenantId}` |
| `sync.worker.ts` | 371-387 | ✅ **FIXED** | Added tenantId to folder count UPDATE |
| `email-cleanup.service.ts` | 442+ | ✅ OK | Has PARTITION BY tenantId |
| `emails.controller.ts` | 469+ | ✅ OK | Has tenantId |
| `contacts-import.service.ts` | 136, 306 | ✅ OK | Has tenantId |
| `scheduled-email.service.ts` | 159+ | ✅ OK | Global scheduler (intentional) |
| `relationship-intelligence.service.ts` | 602+ | ✅ OK | Has tenantId in CTE |
| `contacts.tools.ts` | 132+ | ✅ OK | Has tenantId |
| `bulk-operations.worker.ts` | 281+ | ✅ OK | Has tenant_id |
| `health.service.ts` | 42 | ✅ OK | Health check only |

### B. Prisma Schema Audit (49 models)

**BLOCKERS (4) - Missing tenantId entirely:**
- `UserPreferences` - Only userId, no tenantId
- `DashboardPreference` - Only userId
- `MfaSecret` - Only userId
- `MfaBackupCode` - Only userId

**NEEDS_WORK (14) - Child tables missing tenantId:**
| Table | Parent | Fix Required |
|-------|--------|--------------|
| `EmailLabel` | Email | Add tenantId column + composite FK |
| `EmailAttachment` | Email | Add tenantId column + composite FK |
| `CalendarEventAttachment` | CalendarEvent | Add tenantId column |
| `CalendarSyncState` | Provider | Add tenantId column |
| `AIMemoryHistory` | AIMemory | Add tenantId column |
| `LibraryDocument` | DocumentLibrary | Add tenantId column |
| `DealActivity` | Deal | Add tenantId column |
| `TrustedDevice` | User | Add tenantId column |
| `WebAuthnCredential` | User | Add tenantId column |
| `Session` | User | Add tenantId column |

**READY (27) - Already have tenantId properly configured**

### C. Background Jobs Audit (11 services)

| Service | Risk | Issue |
|---------|------|-------|
| `ReconnectReminder` | MEDIUM | Daily scan iterates ALL tenants without pagination |
| `ContactsSync` | MEDIUM | Process-local `isRunning` flag (not distributed) |
| `EmailRetention` | MEDIUM | Fetches all tenants without pagination |
| Other 8 services | LOW | Properly scoped with tenantId |

---

## Phase 1: Schema Preparation (20h)

### 1.1 Fix Primary Keys - Convert to Composite (8h)

**HIGH PRIORITY Tables (main data):**
| Table | Current PK | New PK |
|-------|------------|--------|
| `emails` | `id` | `(id, tenantId)` |
| `embeddings` | `id` | `(id, tenantId)` |
| `unified_contacts` | `id` | `(id, tenantId)` |
| `folders` | `id` | `(id, tenantId)` |
| `calendar_events` | `id` | `(id, tenantId)` |
| `provider_configs` | `id` | `(id, tenantId)` |

**MEDIUM PRIORITY Tables:**
| Table | Current PK | New PK |
|-------|------------|--------|
| `email_attachments` | `id` | `(id, tenantId)` |
| `email_labels` | `id` | `(id, tenantId)` |
| `user_labels` | `id` | `(id, tenantId)` |
| `email_analyses` | `id` | `(id, tenantId)` |
| `ai_memories` | `id` | `(id, tenantId)` |
| `action_queues` | `id` | `(id, tenantId)` |
| `follow_ups` | `id` | `(id, tenantId)` |

**Files to Modify:**
- `backend/prisma/schema.prisma` - Change `@id` to `@@id([id, tenantId])` for all affected models

**Migration Script:** `backend/prisma/migrations/XXX_citus_composite_pks.sql`

### 1.2 Fix Unique Constraints (4h)

**Must add tenantId to these constraints:**
| Table | Current | Required |
|-------|---------|----------|
| `emails` | `(providerId, externalId)` | `(tenantId, providerId, externalId)` |
| `folders` | `(providerId, path)` | `(tenantId, providerId, path)` |
| `calendar_events` | `(providerId, externalId)` | `(tenantId, providerId, externalId)` |
| `provider_contacts` | `(providerId, externalId)` | `(tenantId, providerId, externalId)` |
| `webhook_subscriptions` | `(providerId, resourcePath)` | `(tenantId, providerId, resourcePath)` |
| `calendar_sync_state` | `(providerId, calendarId)` | `(tenantId, providerId, calendarId)` |
| `email_cross_provider_links` | `(contentHash)` | `(tenantId, contentHash)` |

**SQL Script:** `backend/scripts/prepare-citus-schema.sql` (already created)

### 1.3 Update Foreign Key References (4h)

**Tables with FKs needing update:**
| Table | FK Column | Must Add |
|-------|-----------|----------|
| `email_attachments` | `emailId` | `tenantId` column + composite FK |
| `email_labels` | `emailId` | `tenantId` column + composite FK |
| `email_analyses` | `emailId` | `tenantId` column + composite FK |
| `embeddings` | `emailId`, `contactId` | Already has tenantId ✅ |
| `follow_ups` | `emailId` | `tenantId` column + composite FK |
| `folders` | `parentId` | Self-reference with tenantId |
| `calendar_events` | `providerId` | Already has tenantId ✅ |

---

## Phase 2: Security Fixes - Raw SQL (4h) 🚨 CRITICAL

**4 raw SQL queries found without proper tenantId filtering:**

### 2.1 `base-email-sync.service.ts:835` - UPDATE missing tenantId
```typescript
// CURRENT (DANGEROUS):
await prisma.$executeRaw`UPDATE emails SET ... WHERE id = ${id}`;

// FIX:
await prisma.$executeRaw`UPDATE emails SET ... WHERE id = ${id} AND "tenantId" = ${tenantId}`;
```

### 2.2 `knowledge-base.service.ts:759` - LEFT JOIN missing tenantId
```typescript
// CURRENT:
LEFT JOIN emails e ON ...

// FIX:
LEFT JOIN emails e ON e.id = emb."emailId" AND e."tenantId" = emb."tenantId"
```

### 2.3 `knowledge-base.service.ts:781` - Same pattern
```typescript
// Add tenantId to JOIN condition
```

### 2.4 `optimistic-lock.ts:220` - SELECT FOR UPDATE missing tenantId
```typescript
// CURRENT:
SELECT * FROM ... FOR UPDATE WHERE id = ${id}

// FIX:
SELECT * FROM ... FOR UPDATE WHERE id = ${id} AND "tenantId" = ${tenantId}
```

**Files to Modify:**
- `backend/src/modules/email-sync/services/base-email-sync.service.ts`
- `backend/src/modules/ai/services/knowledge-base.service.ts`
- `backend/src/common/utils/optimistic-lock.ts`

---

## Phase 3: Prisma Schema Updates (8h)

### 3.1 Model Changes Pattern

```prisma
// BEFORE
model Email {
  id       String @id @default(cuid())
  tenantId String
  // ...
  @@index([tenantId])
}

// AFTER (Citus-ready)
model Email {
  id       String
  tenantId String
  // ...
  @@id([id, tenantId])  // Composite PK
  @@index([tenantId])
}
```

### 3.2 Foreign Key Changes

```prisma
// BEFORE
model EmailAttachment {
  id      String @id @default(cuid())
  emailId String
  email   Email  @relation(fields: [emailId], references: [id])
}

// AFTER
model EmailAttachment {
  id       String
  tenantId String
  emailId  String
  email    Email  @relation(fields: [tenantId, emailId], references: [tenantId, id])
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  @@id([id, tenantId])
}
```

### 3.3 Tables Needing tenantId Column Added

These child tables currently lack `tenantId` and need it:
1. `email_attachments` - Add `tenantId`, populate from parent email
2. `email_labels` - Add `tenantId`, populate from parent email
3. `email_analyses` - Add `tenantId`, populate from parent email
4. `calendar_sync_state` - Add `tenantId`, populate from parent provider

---

## Phase 4: Application Code Audit (4h)

### 4.1 Verify All Queries Include tenantId

Run grep audit:
```bash
# Find potential violations
grep -r "prisma\.\$queryRaw" backend/src/ | grep -v "tenantId"
grep -r "prisma\.\$executeRaw" backend/src/ | grep -v "tenantId"
```

### 4.2 Update Query Patterns

Any Prisma query that joins tables MUST include tenantId in the join:
```typescript
// ❌ WRONG (will fail on Citus)
await prisma.email.findMany({
  where: { id },
  include: { attachments: true }
});

// ✅ CORRECT
await prisma.email.findMany({
  where: { id, tenantId },
  include: { attachments: { where: { tenantId } } }
});
```

---

## Phase 5: Migration Execution (8h)

### 5.1 Pre-Migration Checklist

```bash
# 1. Full backup
pg_dump -Fc mailagent > mailagent_pre_citus_$(date +%Y%m%d).dump

# 2. Run type-check
npm run type-check

# 3. Run existing tests
npm run test
```

### 5.2 Migration Order (CRITICAL - Must follow order)

1. **Add tenantId to child tables** (email_attachments, email_labels, etc.)
2. **Populate tenantId** from parent records
3. **Drop existing PKs**
4. **Add composite PKs**
5. **Update unique constraints**
6. **Update foreign keys**
7. **Regenerate Prisma client**

### 5.3 SQL Migration Script Structure

```sql
-- migrate-to-citus-schema.sql

BEGIN;

-- Step 1: Add tenantId to child tables
ALTER TABLE email_attachments ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE email_attachments ea
SET "tenantId" = e."tenantId"
FROM emails e WHERE ea."emailId" = e.id;
ALTER TABLE email_attachments ALTER COLUMN "tenantId" SET NOT NULL;

-- Step 2-6: Drop/recreate constraints (see prepare-citus-schema.sql)

COMMIT;
```

---

## Phase 6: Citus Distribution (4h) - AFTER Schema Ready

### 6.1 Install Citus Extension

```sql
CREATE EXTENSION IF NOT EXISTS citus;
SELECT * FROM citus_version();
```

### 6.2 Distribute Tables (Order Matters!)

```sql
-- Reference tables first (small, replicated to all nodes)
SELECT create_reference_table('tenants');
SELECT create_reference_table('users');

-- Then distributed tables
SELECT create_distributed_table('emails', 'tenantId');
SELECT create_distributed_table('embeddings', 'tenantId');
SELECT create_distributed_table('unified_contacts', 'tenantId');
SELECT create_distributed_table('folders', 'tenantId');
SELECT create_distributed_table('calendar_events', 'tenantId');
SELECT create_distributed_table('provider_configs', 'tenantId');

-- Child tables (co-located via FK)
SELECT create_distributed_table('email_attachments', 'tenantId');
SELECT create_distributed_table('email_labels', 'tenantId');
SELECT create_distributed_table('email_analyses', 'tenantId');
SELECT create_distributed_table('follow_ups', 'tenantId');
```

### 6.3 Verify Co-location

```sql
SELECT logicalrelid::regclass, partmethod, partkey
FROM pg_dist_partition
ORDER BY logicalrelid;
```

---

## Verification Plan

### Test 1: Type Check
```bash
npm run type-check
```

### Test 2: Unit Tests
```bash
npm run test
```

### Test 3: Tenant Isolation Test
```bash
npx ts-node backend/scripts/test-tenant-isolation.ts
```

### Test 4: RAG Isolation Test
```bash
npx ts-node backend/scripts/test-contact-rag-isolation.ts
```

### Test 5: Multi-Tenant Stress Test
```bash
npx ts-node backend/scripts/stress-test-multi-tenant.ts
```

### Test 6: Citus Query Routing
```sql
-- After Citus distribution, verify queries route to single shard
EXPLAIN (ANALYZE, COSTS OFF)
SELECT * FROM emails WHERE "tenantId" = 'test-tenant-1' LIMIT 10;
-- Should show "Task Count: 1" (single shard)
```

---

## Rollback Plan

### Before Citus Distribution
- Standard Prisma migration rollback: `npx prisma migrate reset`

### After Citus Distribution
- **CRITICAL:** Restore from backup - distributed tables cannot be easily un-distributed
- Always keep backup before `create_distributed_table()`

```bash
# Restore from backup
pg_restore -d mailagent mailagent_pre_citus_YYYYMMDD.dump
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `backend/prisma/migrations/XXX_citus_composite_pks/migration.sql` | Main migration |
| `backend/scripts/migrate-to-citus-schema.sql` | Comprehensive SQL script |
| `backend/scripts/verify-citus-schema.sql` | Verification queries |
| `backend/scripts/distribute-tables.sql` | Citus distribution commands |

### Files to Modify
| File | Changes |
|------|---------|
| `backend/prisma/schema.prisma` | Composite PKs, FK updates |
| `backend/src/modules/email-sync/services/base-email-sync.service.ts` | Add tenantId to raw SQL |
| `backend/src/modules/ai/services/knowledge-base.service.ts` | Add tenantId to JOINs |
| `backend/src/common/utils/optimistic-lock.ts` | Add tenantId to SELECT FOR UPDATE |

---

## Timeline

| Week | Phase | Tasks |
|------|-------|-------|
| 1 | Schema Prep | Add tenantId to child tables, fix unique constraints |
| 2 | PKs & FKs | Convert to composite PKs, update FK references |
| 3 | Code & Test | Fix raw SQL, application audit, testing |
| 4 (optional) | Citus | Install extension, distribute tables, verify |

---

## Success Criteria

- [ ] All tables have composite PK including `tenantId`
- [ ] All unique constraints include `tenantId`
- [ ] All FK references use composite keys
- [ ] All raw SQL queries include `tenantId` filter
- [ ] Type check passes
- [ ] All tests pass
- [ ] Tenant isolation verified
- [ ] (Optional) Citus distribution successful

---

---

# MailAgent Consolidation - FOCUSED Implementation Plan (ARCHIVED)

## ✅ Previously COMPLETED

### ✅ COMPLETED (This Session)

| Item | Status | Evidence |
|------|--------|----------|
| Email Search | ✅ REAL | EmailSearchBar → Store → API → Prisma `contains` query |
| Analytics.service.ts | ✅ FIXED | Now queries REAL database counts (was hardcoded) |
| Email Signature | ✅ WORKING | CRUD + appended on send via `getSignatureForSend()` |
| FollowUp Snooze | ✅ WORKING | UI snooze menu calls backend API |
| Auth Cache | ✅ ISOLATED | Keys use `{tenantId}:{sessionId}` format |
| CommandPalette | ✅ INTEGRATED | Renders in Layout, Cmd+K works, REAL API search |
| Learning Stats UI | ✅ REMOVED | No more 404 errors on page load |
| Reset Learning Button | ✅ REMOVED | No backend = no button |
| **HITL → Learning** | ✅ WIRED | LearningService persists feedback to DB, cleanup cron added |
| **categorizeEmail** | ✅ FIXED | Now fetches from UserLabel table |
| **Data Cleanup Cron** | ✅ ADDED | Daily 3AM: AgentActionFeedback, AgentLearningProfile, AIMemory, ActionQueue |

---

## 🔴 FIX #1: Wire HITL → Learning Feedback Loop (2h)

### The Gap

```
CURRENT (BROKEN):
  User approves/rejects action
    → hitlService.approveAction/rejectAction()
    → Status updated in DB
    → Real-time event emitted
    ✗ STOPS HERE - learning.recordFeedback() NEVER CALLED

EXPECTED:
  User approves/rejects action
    → hitlService.approveAction/rejectAction()
    → Status updated in DB
    → learning.recordFeedback() called ← ADD THIS
    → Profile updated, confidence adjusted
```

### Files to Modify

1. **`backend/src/modules/ai/voltagent/services/hitl.service.ts`**
   - Import `createLearningObservability` from observability
   - Add `recordFeedback()` call in `approveAction()` (after line 418)
   - Add `recordFeedback()` call in `rejectAction()` (after line 475)

2. **`backend/src/modules/ai/voltagent/voltagent.module.ts`**
   - Ensure learning system is instantiated and available

### Implementation

```typescript
// In hitl.service.ts - approveAction() after status update:
await this.learning.recordFeedback({
  actionId: action.id,
  tenantId: action.tenantId,
  userId: action.userId,
  agentName: action.agentName,
  actionType: action.actionType,
  wasApproved: true,
  wasExecuted: true,
  originalConfidence: action.confidence,
  timestamp: Date.now(),
});

// In hitl.service.ts - rejectAction() after status update:
await this.learning.recordFeedback({
  actionId: action.id,
  tenantId: action.tenantId,
  userId: action.userId,
  agentName: action.agentName,
  actionType: action.actionType,
  wasApproved: false,
  wasExecuted: false,
  userFeedback: reason,
  originalConfidence: action.confidence,
  timestamp: Date.now(),
});
```

### Verification

```bash
# 1. Type check
npm run type-check

# 2. Manual test
# - Trigger AI action requiring approval
# - Approve it via frontend
# - Check logs for "Recording feedback" message
# - Reject another action
# - Verify learning profile updates in logs
```

---

## 🔴 FIX #2: categorizeEmail() Use UserLabel Table (1.5h)

### The Gap

```typescript
// CURRENT (HARDCODED) - email-insights.service.ts lines 36-45:
private readonly allowedLabels = [
  'Important', 'Follow-up', 'Action Items', 'Info',
  'Personal', 'Finance', 'Promotions', 'Updates',
];

// PROBLEM:
// - Every tenant sees same 8 labels
// - User-created labels completely ignored
// - UserLabel table exists but never queried
```

### Files to Modify

1. **`backend/src/modules/ai/services/email-insights.service.ts`**
   - Add method `getUserLabels(tenantId)` to fetch from database
   - Update `categorizeEmail()` to use dynamic labels
   - Update filter logic to use fetched labels

### Implementation

```typescript
// Add new method:
private async getUserLabels(tenantId: string): Promise<string[]> {
  try {
    const labels = await this.prisma.userLabel.findMany({
      where: {
        tenantId,
        isArchived: false,
      },
      select: { name: true },
      orderBy: { orderIndex: 'asc' },
    });

    if (labels.length === 0) {
      return this.allowedLabels; // Fallback to defaults if no custom labels
    }

    return labels.map(l => l.name);
  } catch (error) {
    this.logger.warn(`Failed to fetch labels for ${tenantId}, using defaults`);
    return this.allowedLabels;
  }
}

// Update categorizeEmail() - replace hardcoded usage:
async categorizeEmail(tenantId: string, emailId: string, locale?: string) {
  const email = await this.getEmailOrThrow(tenantId, emailId);
  const lang = this.resolveLocale(locale);
  const supportedLocale = getLocale(locale);
  const t = getToolTranslations(supportedLocale);

  // ✅ FIXED: Fetch from database
  const allowedLabels = await this.getUserLabels(tenantId);
  const labelsList = allowedLabels.join(', ');

  // ... rest uses allowedLabels variable instead of this.allowedLabels
}
```

### Verification

```bash
# 1. Type check
npm run type-check

# 2. Create test label via API or DB
# INSERT INTO user_labels (id, tenant_id, name, slug, type)
# VALUES (cuid(), 'tenant-id', 'My Custom Label', 'my-custom-label', 'USER');

# 3. Call categorize API - should now include custom label in possible results
# POST /api/v1/ai/insights/emails/{emailId}/categorize

# 4. Verify LLM receives custom labels in prompt
```

---

## 📋 Execution Order (Updated)

### ✅ COMPLETED
| Step | Task | Status |
|------|------|--------|
| 1 | Wire HITL → Learning in hitl.service.ts | ✅ Done |
| 2 | Add AgentLearningProfile + AgentActionFeedback to Prisma | ✅ Done |
| 3 | Create DataCleanupService (daily cron) | ✅ Done |
| 4 | Add getUserLabels() to categorizeEmail() | ✅ Done |

### 🔴 NEXT: Remaining Items (FIX #3 RAG + GDPR already done, FIX #4 already done, FIX #5 ✅ DONE)

| Step | Task | Time | Priority |
|------|------|------|----------|
| **P0 - GDPR (DO FIRST)** | | | |
| 5 | Add `tenantId:userId` to web-search cache keys | 30m | **P0** |
| **P1 - RAG Infrastructure** | | | |
| 6 | Cache analyzeEmail() in EmailAnalysis table | 2h | P1 |
| 7 | RAG for search_emails (use UnifiedRetriever) | 2h | P1 |
| 8 | Add ContactEmbedding model + generation hook | 2h | P1 |
| 9 | Add searchContacts() RAG to KnowledgeBaseService | 1h | P1 |
| 10 | Follow-up detection via RAG (not regex) | 2h | P1 |
| **P2 - Tool Consolidation (61% reduction)** | | | |
| 11 | Consolidate insights.tools.ts: 10 → 3 | 3h | P2 |
| 12 | Consolidate email.tools.ts: 14 → 5 | 2h | P2 |
| 13 | Consolidate contacts/calendar/folder CRUD | 2h | P2 |
| 14 | Consolidate document-library: 3 → 1 | 30m | P2 |
| **P2 - Prompt Quality (FIX #5)** | | | ✅ DONE |
| 15 | Fix generic agent personas (web-search, analytics) | ✅ | Already done |
| 16 | Add examples to all tool descriptions | ✅ | Already done |
| 17 | Add tool selection guides to agents | ✅ | Already done |
| 18 | Calendar agent: `<MY_TOOLS>`, `<WORKFLOW>`, examples | ✅ | 2026-01-11 |
| 19 | Contacts agent: `<MY_TOOLS>`, `<WORKFLOW>`, examples | ✅ | 2026-01-11 |
| **Total** | | **~20h** | |

---

## 🔴 FIX #3: RAG-First Architecture + GDPR Cache Fix (CRITICAL)

### Problem 1: 🚨 GDPR VIOLATION - Web Search Cache

**File:** `backend/src/modules/ai/voltagent/tools/web-search.tools.ts`

```
CURRENT (CRITICAL BREACH):
  Cache key: query.toLowerCase().trim()  ← NO TENANT/USER ISOLATION!

  User A (Tenant1) searches "confidential merger strategy"
    → Cached at: "websearch:result:confidential merger strategy"
  User B (Tenant2) searches same query
    → Gets User A's results! ← GDPR BREACH

  Agent pool key: `agent:{locale}`
    → ALL tenants share same agent instance for 1 hour
```

**Fix (P0 - IMMEDIATE):**
```typescript
// line 67: Add tenant + user to cache key
const key = `${tenantId}:${userId}:${query.toLowerCase().trim()}`;

// line 143: Add tenant to agent pool key
const agentKey = `${locale}:${tenantId}`;
```

### Problem 2: RAG Underutilized - Tools Use Dumb Prisma

| Tool | Current | Should Be |
|------|---------|-----------|
| `search_emails` | Prisma text search | RAG semantic search |
| `search_contacts` | Prisma + raw SQL (2 queries) | RAG with contact embeddings |
| `follow-up detection` | Regex + LLM per email | RAG candidates → verify top hits |

**Agent Flow Should Be:**
```
USER QUERY → RAG → Relevant IDs + Scores → Fetch by ID → Provider if needed
              │
              └── Single intelligent query instead of N dumb ones
```

### Problem 3: No Contact/Calendar Embeddings

```
KnowledgeBaseService only handles emails.
Contacts/Calendar have NO embeddings = NO semantic search.

Agent asking "find emails from that investor John" must:
  1. Keyword search contacts for "John"
  2. Get IDs
  3. Search emails by sender
  = 3 queries

With RAG:
  1. Semantic search "investor John" → returns contact + relevant emails
  = 1 query
```

### Problem 4: Email Analysis Never Cached

```
analyzeEmail(emailId)
  → ALWAYS calls LLM (even if analyzed yesterday)
  → EmailAnalysis table EXISTS but NEVER CHECKED
  → 100K emails × 10% re-analysis = 10K wasted LLM calls
```

---

### What Already Exists (PARTIALLY ABANDONED)

| Component | Status | Location |
|-----------|--------|----------|
| `UnifiedRetriever` | ✅ FULL RAG | voltagent/rag/unified-retriever.ts - hybrid search (vector+keyword+RRF) |
| `KnowledgeBaseService` | ✅ EMAILS ONLY | ai/services/knowledge-base.service.ts - NO contacts/calendar |
| `EmailAnalysis` model | ✅ EXISTS | schema.prisma - NEVER queried by analyzeEmail() |
| `EmbeddingsService` | ✅ WORKING | ai/services/embeddings.service.ts - pgvector + HNSW |
| `semantic_search_emails` tool | ✅ USES RAG | voltagent/tools/insights.tools.ts - ONLY this tool uses RAG |
| `search_emails` tool | ❌ PRISMA | voltagent/tools/email.tools.ts - text search, ignores RAG |
| `search_contacts` tool | ❌ PRISMA | voltagent/tools/contacts.tools.ts - no embeddings |

### Cache Isolation Audit Summary

| Component | Isolation | Status |
|-----------|-----------|--------|
| QueryEmbeddingCache | `qemb:{tenantId}:{hash}` | ✅ GDPR OK |
| Email Insights Cache | `{tenantId}:{emailId}` | ✅ GDPR OK |
| Contacts Cache | `{tenantId}:contact:{id}` | ✅ GDPR OK |
| Calendar Cache | `{tenantId}:event:{id}` | ✅ GDPR OK |
| **Web Search Results** | **query only** | **❌ GDPR BREACH** |
| **Web Search Agent** | **locale only** | **❌ GDPR BREACH** |

### Implementation Plan (5 Phases)

---

#### 🚨 Phase 0: GDPR Fix - Web Search Cache (P0 - DO FIRST)

**File:** `backend/src/modules/ai/voltagent/tools/web-search.tools.ts`

```typescript
// BEFORE (line 67):
const key = query.toLowerCase().trim();

// AFTER:
const key = `${tenantId}:${userId}:${query.toLowerCase().trim()}`;

// BEFORE (line 143):
const agentKey = `agent:${locale}`;

// AFTER:
const agentKey = `agent:${locale}:${tenantId}`;
```

**Time:** 30 minutes
**Risk:** HIGH - Without this, tenants can see each other's search results

---

#### Phase 1: Cache analyzeEmail() (2h)

**File:** `backend/src/modules/ai/services/email-insights.service.ts`

```typescript
async analyzeEmail(tenantId: string, emailId: string, locale?: string) {
  // Check cache (tenant-isolated)
  const cached = await this.prisma.emailAnalysis.findFirst({
    where: {
      emailId,
      tenantId,  // ← GDPR: tenant isolation
      analysisType: 'COMPREHENSIVE',
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  if (cached) {
    this.logger.debug(`Cache hit: ${emailId}`);
    return JSON.parse(cached.result);
  }

  // LLM call only if not cached
  const analysis = await this.runComprehensiveAnalysis(tenantId, emailId, locale);

  // Store with tenant isolation
  await this.prisma.emailAnalysis.upsert({
    where: { emailId_analysisType: { emailId, analysisType: 'COMPREHENSIVE' } },
    update: { result: JSON.stringify(analysis), tenantId },
    create: { emailId, tenantId, analysisType: 'COMPREHENSIVE', result: JSON.stringify(analysis) },
  });

  return analysis;
}
```

---

#### Phase 2: RAG for search_emails Tool (2h)

**File:** `backend/src/modules/ai/voltagent/tools/email.tools.ts`

Replace Prisma text search with UnifiedRetriever:

```typescript
// BEFORE (dumb Prisma):
const emails = await prisma.email.findMany({
  where: {
    tenantId,
    OR: [
      { subject: { contains: query } },
      { snippet: { contains: query } },
    ],
  },
});

// AFTER (smart RAG):
import { UnifiedRetriever } from '../rag/unified-retriever';

const retriever = new UnifiedRetriever({
  tenantId,
  userId,
  locale,
  prisma,
  mistralService: this.mistral,
  embeddingsService: this.embeddings,
  emailLimit: limit,
});

const results = await retriever.searchEmails(query);
// Returns: IDs + scores + snippets (semantic + keyword fusion)

// Then fetch full records by ID
const emails = await prisma.email.findMany({
  where: { id: { in: results.map(r => r.id) }, tenantId },
});
```

---

#### Phase 3: Contact Embeddings + RAG Search (3h) - UPDATED 2025-01-08

**🔴 BUG FOUND:** Schema has `emailId` field with index, but code uses slow JSONB `metadata` queries!

### Implementation Order (Step-by-Step)

| Step | Task | Time | Files |
|------|------|------|-------|
| 1 | FIX JSONB: Update embeddings.service.ts to use `emailId` field | 15m | embeddings.service.ts |
| 2 | FIX JSONB: Update knowledge-base.service.ts to use `emailId` field | 15m | knowledge-base.service.ts |
| 3 | Schema: Add `contactId` field + index to Embedding | 10m | schema.prisma |
| 4 | Schema: Add `embeddings` relation to Contact | 5m | schema.prisma |
| 5 | Run migration | 5m | `npx prisma migrate dev` |
| 6 | Service: Add contact methods to EmbeddingsService | 30m | embeddings.service.ts |
| 7 | Service: Add contact methods to KnowledgeBaseService | 45m | knowledge-base.service.ts |
| 8 | Queue: Create ContactEmbeddingQueueService | 30m | contact-embedding.queue.ts |
| 9 | Wire: Add queue to ContactsService | 20m | contacts.service.ts |
| 10 | RAG: Add searchContacts to UnifiedRetriever | 30m | unified-retriever.ts |
| **Total** | | **~3h** | |

### Verification Test Script

```typescript
// backend/scripts/test-contact-embeddings.ts
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const tenant = await prisma.tenant.findFirst();

  // 1. Check embedding uses direct contactId (not JSONB)
  const embedding = await prisma.embedding.findFirst({
    where: { contactId: { not: null } }
  });
  console.log('✅ Direct contactId field works:', !!embedding);

  // 2. Check index is used (EXPLAIN ANALYZE)
  const explain = await prisma.$queryRaw`
    EXPLAIN ANALYZE
    SELECT * FROM embeddings
    WHERE "tenantId" = ${tenant.id} AND "contactId" IS NOT NULL
    LIMIT 10
  `;
  console.log('Index scan:', JSON.stringify(explain, null, 2));

  // 3. Verify NO JSONB queries for emailId
  const emailEmbed = await prisma.embedding.count({
    where: { tenantId: tenant.id, emailId: { not: null } }
  });
  console.log('✅ Email embeddings using direct field:', emailEmbed);

  await prisma.$disconnect();
}

main();
```

**A. Schema: Add `contactId` to existing Embedding model (NO new table)**

```prisma
// schema.prisma - MODIFY existing Embedding model
model Embedding {
  id             String                 @id @default(cuid())
  tenantId       String
  documentName   String?
  content        String
  vector         Unsupported("vector")?
  embeddingModel String                 @default("mistral-embed")
  metadata       Json?
  createdAt      DateTime               @default(now())
  emailId        String?                // ✅ EXISTS - but code uses JSONB instead!
  contactId      String?                // 🆕 ADD THIS
  email          Email?                 @relation(fields: [emailId], references: [id], onDelete: Cascade)
  contact        Contact?               @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tenant         Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([emailId])
  @@index([contactId])                  // 🆕 ADD THIS
  @@map("embeddings")
}

// Also add to Contact model:
model Contact {
  // ... existing fields ...
  embeddings     Embedding[]            // 🆕 ADD RELATION
}
```

**B. FIX: Update EmbeddingsService to use direct fields (NOT JSONB)**

```typescript
// embeddings.service.ts - FIX existing methods

// BEFORE (SLOW - full table scan):
async hasEmbeddingForEmail(tenantId: string, emailId: string) {
  return this.prisma.embedding.count({
    where: {
      tenantId,
      metadata: { path: ['emailId'], equals: emailId },  // ❌ JSONB = O(n)
    },
  }) > 0;
}

// AFTER (FAST - indexed lookup):
async hasEmbeddingForEmail(tenantId: string, emailId: string) {
  return this.prisma.embedding.count({
    where: { tenantId, emailId },  // ✅ Direct field = O(log n)
  }) > 0;
}

// ADD: Contact version
async hasEmbeddingForContact(tenantId: string, contactId: string) {
  return this.prisma.embedding.count({
    where: { tenantId, contactId },
  }) > 0;
}

// ADD: Semantic search for contacts
async findSimilarContacts<T>(
  tenantId: string,
  embedding: number[],
  limit: number,
): Promise<T[]> {
  const vectorLiteral = Prisma.raw(`'[${embedding.join(',')}]'::vector`);
  return this.prisma.$queryRaw<T[]>(
    Prisma.sql`
      WITH tenant_contacts AS (
        SELECT "id", "content", "contactId", "metadata", "vector"
        FROM "embeddings"
        WHERE "tenantId" = ${tenantId} AND "contactId" IS NOT NULL
      )
      SELECT "id", "content", "contactId", "metadata", ("vector" <-> ${vectorLiteral}) AS "distance"
      FROM tenant_contacts
      ORDER BY "vector" <-> ${vectorLiteral}
      LIMIT ${limit};
    `,
  );
}
```

**C. FIX: Update KnowledgeBaseService.saveEmbedding() to use direct field**

```typescript
// knowledge-base.service.ts - Update saveEmbedding calls

// BEFORE:
await this.embeddingsService.saveEmbedding({
  tenantId,
  content: chunk.content,
  embedding,
  model: this.mistralService.getEmbeddingModel(),
  documentName: options.subject,
  metadata: {
    source: 'email',
    emailId: options.emailId,  // ❌ In metadata = slow lookup
    // ...
  },
});

// AFTER:
await this.embeddingsService.saveEmbedding({
  tenantId,
  content: chunk.content,
  embedding,
  model: this.mistralService.getEmbeddingModel(),
  documentName: options.subject,
  emailId: options.emailId,  // ✅ Direct field = fast lookup
  metadata: {
    source: 'email',
    subject: options.subject,  // Keep other metadata
    from: options.from,
    receivedAt: receivedAtIso,
  },
});
```

**D. Create Contact Embedding Queue (follow email pattern)**

```typescript
// backend/src/modules/ai/services/contact-embedding.queue.ts
// Copy email-embedding.queue.ts pattern with:
// - QUEUE_NAMES.CONTACT_EMBEDDING = 'contact-embedding'
// - ContactEmbeddingJob interface
// - Worker calls knowledgeBaseService.createEmbeddingForContact()
```

**E. Add to KnowledgeBaseService**

```typescript
// knowledge-base.service.ts - Add contact methods

async createEmbeddingForContact(options: {
  tenantId: string;
  contactId: string;
  name: string;
  company?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
  emails?: string[];
  phones?: string[];
}): Promise<boolean> {
  // Check existing (using direct field!)
  if (await this.embeddingsService.hasEmbeddingForContact(options.tenantId, options.contactId)) {
    return false;
  }

  // Compose content
  const content = this.composeContactEmbeddingContent(options);
  if (!content) return false;

  // Generate embedding
  const client = await this.mistralService.createMistralClient();
  const embedding = await this.mistralService.generateEmbedding(content, client, { tenantId: options.tenantId });

  // Save with direct contactId field
  await this.embeddingsService.saveEmbedding({
    tenantId: options.tenantId,
    content,
    embedding,
    model: this.mistralService.getEmbeddingModel(),
    documentName: options.name,
    contactId: options.contactId,  // ✅ Direct field
    metadata: {
      source: 'contact',
      company: options.company,
      jobTitle: options.jobTitle,
    },
  });

  return true;
}

private composeContactEmbeddingContent(contact: {
  name: string;
  company?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
  emails?: string[];
  phones?: string[];
}): string | null {
  const pieces = [
    `Name: ${contact.name}`,
    contact.company && `Company: ${contact.company}`,
    contact.jobTitle && `Role: ${contact.jobTitle}`,
    contact.notes && `Notes: ${contact.notes}`,
    contact.emails?.length && `Email: ${contact.emails.join(', ')}`,
    contact.phones?.length && `Phone: ${contact.phones.join(', ')}`,
  ].filter(Boolean);

  return pieces.length > 1 ? pieces.join('\n') : null;
}
```

**F. Wire up in ContactsService**

```typescript
// contacts.service.ts - Add embedding generation hooks

constructor(
  // ... existing deps ...
  private readonly contactEmbeddingQueue: ContactEmbeddingQueueService,
) {}

async createContact(data: CreateContactDto): Promise<Contact> {
  const contact = await this.prisma.contact.create({ ... });

  // Queue embedding generation (non-blocking)
  await this.contactEmbeddingQueue.enqueue({
    tenantId: contact.tenantId,
    contactId: contact.id,
    name: contact.name,
    company: contact.company,
    jobTitle: contact.jobTitle,
    notes: contact.notes,
    emails: contact.emails,
    phones: contact.phones,
  });

  return contact;
}

async updateContact(id: string, data: UpdateContactDto): Promise<Contact> {
  const contact = await this.prisma.contact.update({ ... });

  // Re-generate embedding on significant changes
  if (data.name || data.company || data.jobTitle || data.notes) {
    await this.contactEmbeddingQueue.enqueue({ ... });
  }

  return contact;
}
```

**G. Add to UnifiedRetriever**

```typescript
// unified-retriever.ts - Add contact search

export type SearchSource = 'emails' | 'contacts' | 'deadlines' | 'followups' | 'actions' | 'memories';

private async searchContacts(query: string): Promise<SourceResult> {
  // Same RRF pattern as searchEmails
  const RRF_K = 60;
  const rrfScores = new Map<string, { score: number; content: string; metadata: Record<string, unknown> }>();

  // 1. Vector search
  if (this.mistralService && this.embeddingsService) {
    const embedding = await this.mistralService.generateEmbedding(query, undefined, { tenantId: this.tenantId });
    const vectorResults = await this.embeddingsService.findSimilarContacts(this.tenantId, embedding, 10);
    vectorResults.forEach((vr, idx) => {
      // Add RRF score...
    });
  }

  // 2. Keyword search
  const keywordResults = await this.prisma.contact.findMany({
    where: {
      tenantId: this.tenantId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { company: { contains: query, mode: 'insensitive' } },
        { notes: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 10,
  });
  // Add RRF scores...

  return { source: 'contacts', items: [...] };
}
```

---

### 🔴 CRITICAL: JSONB Performance Audit (FIX BEFORE PHASE 3)

**JSONB path queries are O(n) full table scans. Must add indexed fields!**

| File | Line | Query | Table | Fix |
|------|------|-------|-------|-----|
| `embeddings.service.ts` | 185-186 | `metadata.path['emailId']` | embeddings | ✅ Use existing `emailId` field |
| `knowledge-base.service.ts` | 524-525 | `metadata.path['emailId']` | embeddings | ✅ Use existing `emailId` field |
| `knowledge-base.service.ts` | 1076 | `metadata.path['emailId']` | embeddings | ✅ Use existing `emailId` field |
| `hitl.service.ts` | 151 | `metadata.path['actionHash']` | ActionQueue | ⚠️ Add `actionHash` field |
| `hitl.service.ts` | 285 | `metadata.path['agentName']` | AgentLearningProfile | ⚠️ Add `agentName` field |
| `episodic-memory.service.ts` | 41 | `metadata.path['agentName']` | AIMemory | ⚠️ Add `agentName` field |
| `sync-scheduler.service.ts` | 608+ | `metadata.path['lastAuthError']` | ProviderConfig | OK (admin only) |
| `health.service.ts` | 380+ | `metadata.path['lastRateLimitAt']` | ProviderConfig | OK (admin only) |

**Priority Fixes (user-facing queries):**

1. **embeddings.service.ts** - FIX NOW (breaks RAG performance)
2. **knowledge-base.service.ts** - FIX NOW (breaks search)
3. **hitl.service.ts** - FIX (user approval flows)
4. **episodic-memory.service.ts** - DEFER (low frequency)

**Schema Changes Required:**

```prisma
model ActionQueue {
  // Add indexed field
  actionHash     String?
  @@index([actionHash])
}

model AgentLearningProfile {
  // Add indexed field
  agentName      String?
  @@index([agentName])
}

model AIMemory {
  // Add indexed field
  agentName      String?
  @@index([agentName])
}
```

---

#### Phase 4: Follow-Up RAG Detection (2h) - ✅ IMPLEMENTED 2026-01-09

**File:** `backend/src/modules/ai/voltagent/services/follow-up.service.ts`

**Implementation Details:**
- Added `EmbeddingsService` dependency to `FollowUpService`
- Created `scanEmailsForFollowUps()` method using `UnifiedRetriever`
- Semantic query: "waiting for reply, action required, please respond, follow up needed, deadline approaching, let me know, confirm receipt, need your input"
- Filters: Sent emails only, no existing follow-ups, no replies in thread
- Confidence thresholds: High (>0.8) → create directly, Medium (0.6-0.8) → LLM verify, Low (<0.6) → skip

**Benefits:**
- Reduced LLM calls: Only medium-confidence candidates need verification
- Semantic understanding: Catches follow-up intent beyond regex patterns
- Configurable thresholds via options parameter

**Before:** Regex on ALL emails → LLM on ALL matches → 100K calls
**After:** RAG → top 50 → LLM on ~10 medium-confidence → 50 calls

---

#### Phase 5: (Optional) Calendar Embeddings

Same pattern as contacts but for calendar events. Lower priority since calendar queries are usually date-based.

---

### Verification Checklist

```bash
# Phase 0: GDPR Fix
npm run type-check  # Verify web-search.tools.ts compiles
# Test: Two tenants search same query → different cache entries

# Phase 1: Cache test
curl -X POST /api/v1/ai/insights/emails/{id}/analyze  # First call → LLM
curl -X POST /api/v1/ai/insights/emails/{id}/analyze  # Second → cache hit (check logs)
SELECT * FROM email_analyses WHERE email_id = 'xxx';  # Verify record

# Phase 2-4: RAG tests
# Use semantic queries, verify vector search is used (check logs for "hybrid search")
```

### Cost Savings Projection

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| analyzeEmail (100K, 10% re-query) | 110K LLM | 10K LLM | **91%** |
| Follow-up scan (daily) | 100K regex + LLM | RAG → 50 LLM | **99.95%** |
| search_emails (agent) | Prisma text | RAG vector+keyword | **Smarter** |
| search_contacts (agent) | 2 SQL queries | 1 RAG query | **50%** |

---

## 🔴 FIX #4: Agent Tool Consolidation (CRITICAL - Performance)

### Research Findings (2025 Best Practices)

**Validated Sources (quality-checked):**
- ✅ [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) - EXCELLENT engineering guide
- ✅ [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) - Official docs, <100 tools limit
- ✅ [LangChain: Speed Up Agents](https://blog.langchain.com/how-do-i-speed-up-my-agent/) - Production latency tips
- ✅ [LangChain: State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering) - 2025 industry survey

**Key Insights:**
1. **50+ tools = performance collapse** - Embedding similarity takes over, LLM can't reason
2. **Task interference causes >20% accuracy reduction** with many tools
3. **Quality over quantity** - "More tools don't always lead to better outcomes"
4. **Combine related operations** - Single tool for multi-step workflows
5. **Router + specialized sub-agents** - Better than one mega-agent

### Current Tool Inventory: 44 TOOLS (TOO MANY!)

| File | Tools | Redundancy |
|------|-------|------------|
| `insights.tools.ts` | 10 | `summarize` + `sentiment` + `intent` + `priority` = same analysis |
| `email.tools.ts` | 14 | `mark_read` + `mark_unread` + `star` + `archive` = flag updates |
| `contacts.tools.ts` | 5 | CRUD can be 1 tool with action param |
| `calendar.tools.ts` | 5 | CRUD can be 1 tool with action param |
| `folder.tools.ts` | 5 | CRUD can be 1 tool with action param |
| `document-library.tools.ts` | 3 | Query + list + create = 1 tool |
| `web-search.tools.ts` | 1 | ✅ OK |
| `analytics.tools.ts` | 1 | ✅ OK |
| **TOTAL** | **44** | **~60% redundant** |

### Consolidation Plan: 44 → 17 tools (61% reduction)

#### insights.tools.ts: 10 → 3 tools

**BEFORE (10 tools with overlapping LLM calls):**
```
summarize_email, analyze_sentiment, detect_intent, calculate_priority,
analyze_email, compose_reply, generate_smart_replies, categorize_email,
extract_action_items, semantic_search_emails
```

**AFTER (3 tools):**

| Tool | Purpose | Merges |
|------|---------|--------|
| `analyze_email` | One LLM call returns summary, sentiment, intent, priority, actions, category | 6 tools |
| `compose_email` | Reply OR smart_replies with tone control | 2 tools |
| `semantic_search_emails` | RAG search (keep as-is) | 1 tool |

#### email.tools.ts: 14 → 5 tools

| Tool | Purpose | Merges |
|------|---------|--------|
| `list_accounts` | List email providers | 1 |
| `search_emails` | Search + count (countOnly flag) | 2 |
| `get_email` | Single email details | 1 |
| `send_email` | New/reply/forward (action param) | 3 |
| `update_email` | Mark read/starred/archive/delete + bulk support | 7 |

#### contacts/calendar/folder: CRUD → 2 tools each

| Category | Tools | Pattern |
|----------|-------|---------|
| Contacts | `search_contacts`, `manage_contact` | Search + CRUD |
| Calendar | `get_calendar`, `manage_event` | Query + CRUD |
| Folders | `list_folders`, `manage_folder` | List + CRUD |

#### documents: 3 → 1 tool

Single `documents` tool with action: `query` / `list` / `create`

### Final Tool Count: 44 → 17 (61% reduction)

| Category | Before | After | Savings |
|----------|--------|-------|---------|
| insights | 10 | 3 | **-70%** |
| email | 14 | 5 | **-64%** |
| contacts | 5 | 2 | **-60%** |
| calendar | 5 | 2 | **-60%** |
| folder | 5 | 2 | **-60%** |
| documents | 3 | 1 | **-67%** |
| web-search | 1 | 1 | 0% |
| analytics | 1 | 1 | 0% |
| **TOTAL** | **44** | **17** | **-61%** |

### Benefits

1. **Performance**: Fewer tools = better LLM reasoning accuracy
2. **Cost**: One `analyze_email` call vs 5 separate LLM calls (80% reduction)
3. **Latency**: Batch operations reduce round-trips
4. **Maintainability**: Fewer files, less code duplication

---

## ✅ FIX #5: Prompt Quality Audit - COMPLETED (2026-01-11)

### Audit Summary

| Category | Status | Issues |
|----------|--------|--------|
| Supervisor/Email agents | ✅ GOOD | Has `<GROUNDING_RULES>`, `<REASONING_REQUIRED>`, `<MY_TOOLS>` |
| Knowledge agent | ✅ GOOD | Has explicit grounding rules and source citations |
| Web Search agent | ✅ DONE | Has `<DOMAIN_CONTEXT>`, `<GROUNDING_RULES>`, `<OUTPUT_FORMAT>` |
| Analytics agent | ✅ DONE | Has `<DATA_SCHEMA>`, `<ANALYSIS_GUIDELINES>`, `<OUTPUT_FORMAT>` |
| Calendar/Contacts agents | ✅ DONE | Has `<CORE_IDENTITY>`, `<MY_TOOLS>` with examples, `<WORKFLOW>` |
| Tool descriptions | ✅ DONE | Examples in email.tools.ts, insights.tools.ts, consolidated tools |

### Problem 1: Generic Agent Personas (No Domain Context)

**Bad (web-search.tools.ts line 175):**
```typescript
instructions: `You are a helpful search assistant. When asked a question...`
// No mention of MailAgent, email context, or user's domain
```

**Bad (analytics.tools.ts line 221):**
```typescript
instructions: `You are a data analytics assistant. When asked to analyze data...`
// No MailAgent email schema, no metrics definitions
```

**Bad (calendar/contacts agents):**
```typescript
instructions: `You are a calendar management assistant. ALWAYS respond in English.`
// No integration context, no cross-agent awareness
```

### Problem 2: Missing Examples in Tool Descriptions

**Current (no examples):**
```typescript
description: 'Search emails by query. Returns matching emails from the inbox.'
```

**2025 Best Practice (Anthropic guide):**
```typescript
description: `Search emails by query. Returns matching emails from the inbox.
Examples:
- "emails from John about budget" → searches sender + subject/body
- "unread emails this week" → filters by isRead=false + date range
- "attachments from legal" → filters by hasAttachments + sender domain`
```

### Problem 3: Ambiguous Parameters

| Tool | Parameter | Issue |
|------|-----------|-------|
| `delete_email` | N/A | Doesn't specify: moves to trash or permanent delete? |
| `search_contacts` | `query` | Says "other fields" but never defines what fields |
| `search_emails` | `query` | No distinction from `semantic_search_emails` |
| `create_event` | `attendees` | No format specified (email array? objects?) |

### Problem 4: No Tool Relationship Explanations

**Issue:** Agent doesn't know when to use `search_emails` vs `semantic_search_emails`

- `search_emails` = Prisma text search (exact matches, faster, cheaper)
- `semantic_search_emails` = RAG vector search (meaning-based, slower, more accurate)

**Fix:** Add to EmailAgent instructions:
```typescript
<TOOL_SELECTION>
- search_emails: Use for EXACT queries (sender:john, subject:invoice)
- semantic_search_emails: Use for MEANING queries (emails about payment issues)
</TOOL_SELECTION>
```

### Problem 5: No Output Format Specifications

**Many tools have no format guidance:**
- `summarize_email`: No max length, no structure
- `extract_action_items`: JSON format only in systemPrompt, not in description
- `search_contacts`: What fields are returned?

### Good Patterns Found (Keep These)

```typescript
// GOOD: Grounding rules in knowledge.instructions
<GROUNDING_RULES>
1.  I must ONLY provide information found in the available sources.
2.  If I cannot find the information, I must state "I couldn't find..."
3.  I must explicitly cite where I found the info.
</GROUNDING_RULES>

// GOOD: Reasoning required in supervisor/email
<REASONING_REQUIRED>
Before executing ANY tool, I MUST:
1.  Identify the user's core intent.
2.  Check if I need to verify data first.
3.  Choose the most specific tool for the job.
</REASONING_REQUIRED>

// GOOD: Tool inventory in email agent
<MY_TOOLS>
get_email_content | send_email | reply_email | forward_email
search_emails | archive_email | delete_email | star_email
</MY_TOOLS>
```

### Implementation Plan (3h)

#### Phase 1: Fix Generic Agent Personas (1h)

**web-search.tools.ts - Add domain context:**
```typescript
instructions: `You are a web search specialist for MailAgent.

<DOMAIN_CONTEXT>
You help users find current information about:
- Email best practices and etiquette
- Business contacts and companies
- Meeting scheduling and time zones
- Industry news relevant to the user's domain: {{userContext.industry}}
</DOMAIN_CONTEXT>

<GROUNDING_RULES>
1. Always provide source URLs
2. Indicate information freshness (date found)
3. If no reliable source, say so explicitly
</GROUNDING_RULES>`
```

**analytics.tools.ts - Add MailAgent schema:**
```typescript
instructions: `You are a data analytics specialist for MailAgent.

<DATA_SCHEMA>
Available metrics:
- Email volume: sent/received by day/week/month
- Response times: avg time to reply
- Sender/recipient frequency
- Label distribution
- Thread length analysis
</DATA_SCHEMA>

<OUTPUT_FORMATS>
- Tables: For comparison data
- Line charts: For trends over time
- Bar charts: For categorical comparisons
- Numbers: For single metrics
</OUTPUT_FORMATS>`
```

#### Phase 2: Add Examples to Tool Descriptions (1h)

Update each tool description to include 2-3 examples:

```typescript
// search_emails
description: `Search emails by text query. For semantic/meaning-based search, use semantic_search_emails instead.

Examples:
- "from:john subject:invoice" → exact sender + subject match
- "meeting agenda" → keyword search in subject/body
- "this week unread" → combines date filter + read status`

// delete_email
description: `Move email to trash (recoverable for 30 days).
Use archive_email for non-destructive removal from inbox.

Example: delete_email(emailId: "abc123") → moves to Trash folder`

// semantic_search_emails
description: `Find emails by meaning using AI vector search.
Use for: concepts, similar topics, "emails like this one".
DO NOT use for: exact sender/date queries (use search_emails).

Examples:
- "payment problems" → finds emails about invoices, billing, late payments
- "project updates" → finds status reports, progress emails`
```

#### Phase 3: Add Tool Selection Guidance to Agents (1h)

Add `<TOOL_SELECTION>` section to EmailAgent and SupervisorAgent:

```typescript
<TOOL_SELECTION_GUIDE>
| Need | Tool | When |
|------|------|------|
| Exact search | search_emails | Known sender, subject, date |
| Meaning search | semantic_search_emails | Topic, similar emails |
| Single email | get_email | Have ID, need details |
| Compose new | send_email | List accounts first! |
| Reply | reply_email | Have original emailId |
| Organize | archive_email | Non-destructive cleanup |
| Remove | delete_email | Move to trash |
</TOOL_SELECTION_GUIDE>
```

### Files to Modify

| File | Changes |
|------|---------|
| `voltagent/tools/web-search.tools.ts` | Add domain context, grounding rules (lines 175-185) |
| `voltagent/tools/analytics.tools.ts` | Add data schema, output formats (lines 221-235) |
| `voltagent/tools/email.tools.ts` | Add examples to all 14 tool descriptions |
| `voltagent/tools/insights.tools.ts` | Add examples to all 10 tool descriptions |
| `voltagent/tools/contacts.tools.ts` | Clarify parameter formats, add examples |
| `voltagent/tools/calendar.tools.ts` | Clarify attendee format, add examples |
| `voltagent/locales/en.ts` | Update agent instructions with domain context |
| `voltagent/agents/email.agent.ts` | Add `<TOOL_SELECTION_GUIDE>` section |

### Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| Agent task completion rate | ~70% | ~90% (fewer wrong tool choices) |
| First-try success | ~50% | ~80% (clear examples guide usage) |
| User confusion | High | Low (output formats documented) |
| Cross-agent coordination | Unclear | Clear (tool selection guides) |

---

## ⏭️ DEFERRED (V2)

| Item | Reason |
|------|--------|
| Auto-Triage scheduler | Requires event system refactor |
| ~~Memory Cleanup cron~~ | ✅ DONE - DataCleanupService |
| communicationStyle preference | UI-only enhancement |
| FeedbackQueueService integration | Learning works without queue for MVP |

---

## SINGLE DEV EXECUTION ORDER

### WEEK 1: Fix Broken Shit First

| # | Task | Hours | Why |
|---|------|-------|-----|
| 1 | Remove `getLearningStats()` 404 call | 0.5h | Errors on every page load |
| 2 | Remove Reset Learning button | 0.5h | Nothing to reset |
| 3 | Signature: Prisma model + migration | 1h | Foundation |
| 4 | Signature: Backend CRUD service | 3h | Core feature |
| 5 | Signature: Controller + swagger | 1h | Expose API |
| 6 | Signature: Wire frontend SignatureSettings | 2h | Connect UI |
| 7 | Signature: Append on send | 1h | Actually use it |
| 8 | Fix hardcoded labels → UserLabel table | 2h | categorizeEmail broken |
| **Total** | | **11h** | |

### WEEK 2: Email Roadmap + Subscription

| Phase | Do | Skip | Hours |
|-------|-----|------|-------|
| **5: Compose** | Draft autosave, attachments, recipients | Templates, scheduling | 12h |
| **8: AI Integration** | Summarize button, smart reply chips | Sentiment badges, priority icons | 8h |
| **6: Search** | Basic search + global command palette | Date pickers | 4h |
| **7: Subscription** | Autumn integration, pricing page, usage limits | Enterprise features | 8h |
| **Total** | | | **32h** |

### WEEK 3: Connect Orphan Code

| # | Task | Hours | Why |
|---|------|-------|-----|
| 1 | Wire HITL → Learning feedback | 2h | Approvals mean nothing without this |
| 2 | Connect `communicationStyle` → compose tone | 1h | Setting exists but unused |
| 3 | Add `email.new` event emission | 2h | Enable auto-triage |
| 4 | Create email-triage.listener | 3h | Superhuman feature |
| 5 | Add memory cleanup (expiresAt) | 2h | Memories grow forever |
| 6 | End-to-end HITL test | 2h | Prove it works |
| **Total** | | **12h** | |

---

## CRM: Stop Lying

**Reality:**
- You have CONTACTS MANAGEMENT, not CRM
- `Deal` table exists but has NO API - it's vaporware
- No DealsController, no DealsService, no frontend

**Recommendation:**
- Remove "CRM" branding until you build deals
- Keep: Contacts, relationship scoring, stale alerts
- Kill: Any deals UI mockups that don't work
- Later (V2): Pipeline, Kanban, forecasting

---

## DELETE OR FIX THESE (No Excuses)

| What | Action | Why |
|------|--------|-----|
| Reset Learning button | DELETE | No backend, never worked |
| `emailDensity` in AI Settings | MOVE | It's UI, not AI. Move to Appearance |
| Learning stats section in AI Settings | DELETE | 404 on load |
| `analytics.service.ts` fake data | REWRITE | Returns hardcoded fake data, even negative values |
| `dashboard/widgets/FollowUpWidget.tsx` | DELETE | Duplicate of productivity version, use one |
| `EmailSearchBar.tsx` | REWRITE | Client-side only, no real search |
| Follow-ups `onSnooze` prop | WIRE UP | Prop exists, button doesn't call it |

---

## PART A: AI Settings Consolidation

### Issues Identified

| Issue | Status | Action |
|-------|--------|--------|
| `GET /voltagent/stats/learning` returns 404 | Missing endpoint | Remove from frontend |
| `POST /voltagent/learning/reset` missing | No implementation | Implement or remove button |
| Email Density setting | Pure UI, not AI | Move to Appearance section |
| Working Hours/Job Details | Stored but NEVER used by AI | Consider removing or implement usage |
| `communicationStyle` not used in compose | Stored but not connected | Connect to compose tone parameter |

### Phase A1: Remove Non-Existent Endpoints

**Frontend API** (`frontend/lib/api/ai.ts`):
- Remove `getLearningStats()` if it exists (calls non-existent endpoint)
- Keep working endpoints only

**Frontend Settings Container** (`frontend/pages/dashboard/settings.tsx` or parent):
- Remove `onResetLearning` functionality (no backend implementation)
- OR implement backend endpoint if feature is wanted

### Phase A2: Move Email Density to Appearance

Email Density (`comfortable`, `compact`, `spacious`) is a **UI preference**, not AI:
1. Remove from `AiSettings.tsx`
2. Move to Appearance/Display settings section
3. Update parent container to pass props correctly

### Phase A3: Connect CommunicationStyle to Compose

Currently `communicationStyle` (FORMAL, CASUAL, TECHNICAL, CREATIVE) is stored in UserPreferences but NOT used when composing emails.

**Fix**: When calling `aiApi.composeEmail()`:
1. Fetch user's `communicationStyle` preference
2. Map to compose `tone` parameter:
   - FORMAL → 'formal'
   - CASUAL → 'casual'
   - TECHNICAL → 'technical'
   - CREATIVE → 'casual' (or add support)

**Files to modify**:
- `frontend/components/email/compose/ComposeEditor.tsx` - get preference and pass to API
- OR `frontend/hooks/queries/use-preferences.ts` - create hook if not exists

### Phase A4: Decide on Working Hours/Job Details

These settings (jobTitle, department, industry, companySize, workingHoursStart, workingHoursEnd, workingDays) are:
- Stored in UserPreferences via `personalizationApi.updateProfile()`
- NEVER read or used by any AI service

**Options**:
1. **Remove**: Delete from UI if not used
2. **Implement**: Use in AI context (e.g., include in compose prompt for better personalization)
3. **Keep for future**: Leave UI but mark as "beta" or future feature

**Recommendation**: Option 2 - Add to AI compose context for better email generation

### Phase A5: Learning Validation

The backend has two learning systems that need validation:

#### 1. WritingStyleService (`writing-style.service.ts`)
- Analyzes user email writing patterns (sentence length, formality, greetings, sign-offs)
- Stores profile in `WritingStyleProfile` Prisma model
- **Endpoint**: `GET /voltagent/stats/writing-style` - EXISTS and works
- **Status**: ✅ IMPLEMENTED

#### 2. Agent Learning System (`learning.ts`)
- Tracks approval/rejection feedback to adjust confidence
- Uses `LearningProfile` interface (NOT a Prisma model!)
- Uses in-memory cache + optional persistence callbacks
- **Endpoint**: `GET /voltagent/stats/learning` - DOES NOT EXIST (404)
- **Status**: ❌ NO API ENDPOINT

**Validation Tasks**:
1. Check if `AgentLearningProfile` exists in Prisma schema → NO, it doesn't
2. Check if learning persistence is wired up → Only in-memory, no DB persistence
3. Either:
   a. **Remove** Reset Learning button (no persistence = nothing to reset)
   b. **Implement** full learning persistence (Prisma model + endpoints)

**Recommendation**: Option A for now (remove button), add TODO for future full implementation.

---

## PART B: Email Signature Feature (Priority 2)

## Architecture Decision

### Storage Approach: **Per-Provider Signatures**
- Users may have multiple email accounts (work, personal)
- Each account should have its own default signature
- Stored in database for persistence across devices

### Signature Appending: **Backend-side**
- Append signature in `EmailSendService.sendEmail()` before building ComposeMessage
- Ensures consistency and prevents signature bypassing
- Frontend sends `signatureId` (or uses default), backend appends HTML

---

## Implementation Phases

### Phase 1: Database Schema
**File:** `backend/prisma/schema.prisma`

Add `EmailSignature` model:
```prisma
model EmailSignature {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  providerId String?  // null = applies to all providers
  name       String
  content    String   // HTML content
  isDefault  Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user     User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider EmailProvider? @relation(fields: [providerId], references: [id], onDelete: SetNull)

  @@index([tenantId, userId])
  @@index([providerId])
}
```

Update User model to add relation.

### Phase 2: Backend API
**Files to create/modify:**

1. **DTO:** `backend/src/modules/email/dto/signature.dto.ts`
   - `CreateSignatureDto`: name, content, providerId?, isDefault?
   - `UpdateSignatureDto`: Partial<CreateSignatureDto>

2. **Service:** `backend/src/modules/email/services/email-signature.service.ts`
   - `create(tenantId, userId, dto)` - create signature, handle isDefault logic
   - `findAll(tenantId, userId, providerId?)` - list signatures
   - `findDefault(tenantId, userId, providerId?)` - get default signature
   - `update(tenantId, userId, id, dto)` - update signature
   - `delete(tenantId, userId, id)` - delete signature
   - `setDefault(tenantId, userId, id)` - set as default (unset others)

3. **Controller:** `backend/src/modules/email/controllers/signatures.controller.ts`
   - `GET /emails/signatures` - list all
   - `GET /emails/signatures/default?providerId=xxx` - get default
   - `POST /emails/signatures` - create
   - `PATCH /emails/signatures/:id` - update
   - `DELETE /emails/signatures/:id` - delete
   - `POST /emails/signatures/:id/set-default` - set as default

4. **Modify SendEmailDto:** Add optional `signatureId` field
   - If provided: use that signature
   - If not provided: use default for provider
   - If explicitly null: no signature

5. **Modify EmailSendService.sendEmail():**
   - After receiving `SendEmailDto`, fetch signature
   - Append signature HTML to bodyHtml: `bodyHtml + "<br><br>" + signature.content`
   - Pass modified body to ComposeMessage

### Phase 3: Frontend API
**File:** `frontend/lib/api/emails.ts`

Add signature API methods:
```typescript
export const signatureApi = {
  list(providerId?: string)
  getDefault(providerId?: string)
  create(dto: CreateSignatureDto)
  update(id: string, dto: UpdateSignatureDto)
  delete(id: string)
  setDefault(id: string)
}
```

### Phase 4: Frontend Query Hooks
**File:** `frontend/hooks/queries/use-signatures.ts`

- `useSignatures(providerId?)` - list signatures
- `useDefaultSignature(providerId?)` - get default
- `useCreateSignature()` - mutation
- `useUpdateSignature()` - mutation
- `useDeleteSignature()` - mutation
- `useSetDefaultSignature()` - mutation

### Phase 5: Settings UI
**File:** `frontend/components/settings/SignatureSettings.tsx` (already created, needs integration)

Connect to real API:
- Fetch signatures from backend
- Wire up CRUD operations
- Add provider selector (optional)
- Preview signatures with proper HTML rendering

### Phase 6: Compose Integration
**File:** `frontend/components/email/compose/ComposeDialog.tsx`

- Add signature selector dropdown (optional)
- Load default signature for selected provider
- Display signature preview below editor (read-only)
- Pass `signatureId` to send API

### Phase 7: Translations
**Files:** `frontend/locales/en.ts`, `frontend/locales/it.ts`

Add signature-related translations:
```typescript
settings: {
  signature: {
    title: 'Email Signatures',
    description: 'Create and manage your email signatures',
    addSignature: 'Add Signature',
    editSignature: 'Edit Signature',
    // ... etc
  }
}
```

---

## Files to Modify

### Backend (create)
- `backend/prisma/schema.prisma` - Add EmailSignature model
- `backend/src/modules/email/dto/signature.dto.ts` - DTOs
- `backend/src/modules/email/services/email-signature.service.ts` - Service
- `backend/src/modules/email/controllers/signatures.controller.ts` - Controller

### Backend (modify)
- `backend/src/modules/email/dto/send-email.dto.ts` - Add signatureId
- `backend/src/modules/email/services/email-send.service.ts` - Append signature
- `backend/src/modules/email/email.module.ts` - Register new service/controller

### Frontend (create)
- `frontend/lib/api/signatures.ts` - API client
- `frontend/hooks/queries/use-signatures.ts` - Query hooks
- `frontend/hooks/queries/signature-keys.ts` - Query keys

### Frontend (modify)
- `frontend/components/settings/SignatureSettings.tsx` - Connect to API
- `frontend/components/email/compose/ComposeDialog.tsx` - Add signature support
- `frontend/components/dashboard/Settings.tsx` - Add signature section
- `frontend/locales/en.ts` - Add translations
- `frontend/locales/it.ts` - Add translations
- `frontend/locales/index.ts` - Add types

---

## Complete Implementation Order

### Step 1: AI Settings Cleanup (PART A)
1. **Remove broken endpoint call** - Remove stats/learning API call from frontend
2. **Remove Reset Learning button** - No backend persistence exists (in-memory only)
3. **Validate WritingStyle** - Confirm `/voltagent/stats/writing-style` endpoint works
4. **Move Email Density** - Not AI-related, move to Appearance settings

### Step 2: Signature Database (PART B)
1. Add `EmailSignature` model to Prisma schema
2. Run migration: `npx prisma migrate dev`

### Step 3: Signature Backend API
1. Create DTOs: `signature.dto.ts`
2. Create Service: `email-signature.service.ts`
3. Create Controller: `signatures.controller.ts`
4. Register in email.module.ts
5. Add signatureId to SendEmailDto
6. Update EmailSendService to append signature

### Step 4: Signature Frontend
1. Create API client: `frontend/lib/api/signatures.ts`
2. Create query hooks: `frontend/hooks/queries/use-signatures.ts`
3. Connect SignatureSettings.tsx to real API
4. Add signature selector to ComposeDialog (optional)

### Step 5: Translations
1. Add signature translations to en.ts and it.ts
2. Update types in locales/index.ts

### Step 6: HITL + Learning Wiring (PART C)
1. **Wire HITL → Learning** - Inject learning into hitl.service.ts
2. **Record feedback on approve/reject** - Call `recordFeedback()` in approve/reject methods
3. **Connect learning → confidence** - Use `getAdjustedConfidenceAsync()` before action proposals

### Step 7: AI Context Enrichment (PART C continued)
1. **Fetch WritingStyleProfile** in compose - Add to system prompt
2. **Fetch UserPreferences** in compose - Add job context to prompt
3. **Map communicationStyle → tone** - FORMAL/CASUAL/TECHNICAL/CREATIVE

### Step 8: Auto-Triage Implementation (PART D) - Superhuman Feature
1. **Fix categorizeEmail()** - Use UserLabel from database, not hardcoded
2. **Add event emission** - Emit `email.new` after saving in sync
3. **Create triage listener** - `email-triage.listener.ts` handles auto-labeling + priority
4. **Add AI fields to Email** - `aiPriority`, `aiUrgency`, `aiAnalyzedAt`
5. **User preference** - Add `autoTriageEnabled`, `autoLabelEnabled` to UserPreferences
6. **Frontend toggle** - Add auto-triage switch in AI Settings

### Step 9: Validation & Testing
1. Test AI compose with full context (WritingStyle, Preferences, Signature)
2. Test HITL approve/reject updates learning profiles
3. Test signature CRUD in settings
4. Test signature appending on email send
5. Verify adjusted confidence affects auto-approve threshold
6. **Test auto-triage** - New email arrives → labels applied automatically
7. **Test auto-priority** - Email gets priority score on arrival

---

## User Decisions (Already Confirmed)

| Question | Answer |
|----------|--------|
| Per-provider signatures? | Yes (like Outlook) |
| Multiple signatures per provider? | Yes, with one default |
| Auto-include in replies? | Yes |
| Edit signature in compose? | No (edit in settings only) |

---

## Files Summary

### PART A - AI Settings (modify only)
- `frontend/lib/api/ai.ts` - Remove stats/learning if exists
- `frontend/components/settings/AiSettings.tsx` - Remove emailDensity, resetLearning button
- `frontend/components/email/compose/ComposeEditor.tsx` - Use communicationStyle as tone
- Parent settings container - Move emailDensity to Appearance
- `backend/src/modules/ai/voltagent/services/writing-style.service.ts` - Validate working
- `backend/src/modules/ai/voltagent/observability/learning.ts` - Document as in-memory only

### PART B - Signature Feature (create + modify)
**Create:**
- `backend/prisma/schema.prisma` (add EmailSignature)
- `backend/src/modules/email/dto/signature.dto.ts`
- `backend/src/modules/email/services/email-signature.service.ts`
- `backend/src/modules/email/controllers/signatures.controller.ts`
- `frontend/lib/api/signatures.ts`
- `frontend/hooks/queries/use-signatures.ts`

**Modify:**
- `backend/src/modules/email/dto/send-email.dto.ts` (add signatureId)
- `backend/src/modules/email/services/email-send.service.ts` (append signature)
- `backend/src/modules/email/email.module.ts` (register)
- `frontend/components/settings/SignatureSettings.tsx` (wire to API)
- `frontend/locales/en.ts`, `frontend/locales/it.ts` (translations)

---

## PART C: HITL + Learning Consolidation (Priority 3)

### Current State Analysis

| Component | Status | Issue |
|-----------|--------|-------|
| `hitl.service.ts` | ✅ Works | Uses Prisma `ActionQueue` model |
| `hitl.service.shouldAutoApprove()` | ⚠️ Broken | Uses `adjustedConfidence` but learning never updates it |
| `learning.ts` | ❌ In-Memory Only | 482 lines of code, NO persistence |
| `GET /voltagent/stats/learning` | ❌ 404 | No endpoint exists |
| `use-ai-actions.ts` | ⚠️ Broken | Calls `getLearningStats()` which returns 404 |
| Feedback loop | ❌ Missing | HITL approve/reject never calls `learning.recordFeedback()` |

### Phase C1: Wire HITL → Learning Feedback

When user approves/rejects action, record feedback to learning system:

**File:** `backend/src/modules/ai/voltagent/services/hitl.service.ts`

1. Inject `LearningObservability` into HitlService
2. In `approveAction()` → call `learning.recordFeedback({ wasApproved: true, ... })`
3. In `rejectAction()` → call `learning.recordFeedback({ wasApproved: false, ... })`

### Phase C2: Persist Learning Profiles

**Option A (Recommended for MVP):** Remove learning stats from frontend
- Delete `getLearningStats()` call from `use-ai-actions.ts`
- Remove learning stats UI (it always fails)
- Document learning.ts as internal optimization (in-memory)

**Option B (Full Implementation):** Add Prisma model + endpoints
- Add `AgentLearningProfile` Prisma model
- Add `GET /voltagent/stats/learning` endpoint
- Add `POST /voltagent/learning/reset` endpoint
- Wire persistence callbacks in `createLearningObservability()`

### Phase C3: Connect Learning → Confidence Adjustment

Before proposing any action, check learning profile:

**File:** `backend/src/modules/ai/voltagent/tools/*.tools.ts`

For each tool that creates actions:
1. Before `createPendingAction()`, call `learning.getAdjustedConfidenceAsync()`
2. Set `action.adjustedConfidence` from learning profile
3. `shouldAutoApprove()` will then use the learned confidence

### Phase C4: Integrate WritingStyle → Compose

WritingStyleProfile exists in Prisma but is never used by compose.

**File:** `backend/src/modules/ai/voltagent/voltagent.service.ts`

In `composeEmail()`:
1. Fetch `WritingStyleProfile` for user
2. Add to system prompt:
   - Preferred greetings: `${profile.preferredGreetings.join(', ')}`
   - Preferred sign-offs: `${profile.preferredSignOffs.join(', ')}`
   - Formality score: `${profile.formalityScore}` (0-1 scale)
   - Average sentence length: `${profile.avgSentenceLength}` words

### Phase C5: Integrate UserPreferences → Compose

UserPreferences stores job context that AI never sees.

**File:** `backend/src/modules/ai/voltagent/voltagent.service.ts`

In `composeEmail()`:
1. Fetch `UserPreferences` for user
2. Add to system prompt:
   ```
   User Context:
   - Job Title: ${preferences.jobTitle || 'Not specified'}
   - Department: ${preferences.department || 'Not specified'}
   - Industry: ${preferences.industry || 'Not specified'}
   - Communication Style Preference: ${preferences.communicationStyle}
   ```
3. Map `communicationStyle` to `tone` parameter:
   - FORMAL → 'formal'
   - CASUAL → 'casual'
   - TECHNICAL → 'technical'
   - CREATIVE → 'creative'

### Files to Modify (PART C)

**Backend (modify):**
- `backend/src/modules/ai/voltagent/services/hitl.service.ts` - Wire to learning
- `backend/src/modules/ai/voltagent/voltagent.service.ts` - Add WritingStyle + Preferences to compose
- `backend/src/modules/ai/voltagent/tools/email.tools.ts` - Use adjusted confidence

**Frontend (modify):**
- `frontend/hooks/ai/use-ai-actions.ts` - Remove broken `getLearningStats()` call
- `frontend/lib/api/ai.ts` - Remove/fix `getLearningStats` export

**Frontend (optional - if Option B):**
- Add learning stats UI after implementing backend endpoint

---

## PART D: Auto-Labeling & Auto-Triage Validation (Priority 4)

### Current State Analysis

| Component | Status | Issue |
|-----------|--------|-------|
| `UserLabel` Prisma model | ✅ Exists | Has name, slug, color, type, hierarchy |
| `EmailLabel` join table | ✅ Exists | Links emails to labels |
| `categorizeEmail()` backend | ❌ Hardcoded | Uses `allowedLabels` array, NOT database |
| `calculatePriority()` backend | ⚠️ Works | But doesn't persist priority anywhere |
| `analyzeEmail()` backend | ⚠️ Works | Comprehensive but no persistence |
| Auto-triage on sync | ❌ Missing | Not integrated with email sync |
| **Event system** | ❌ Missing | Email sync emits NO events when emails saved |
| `FeedbackQueueService` | ✅ Exists | BullMQ queue for learning signals (can reuse pattern) |
| **Frontend API** | ✅ Exists | `aiApi.categorizeEmail()`, `aiApi.calculatePriority()` |
| **Frontend UI** | ❌ ORPHANED | **NO component calls these APIs!** Only test file uses them |

### Phase D1: Fix Auto-Labeling to Use Database Labels

**File:** `backend/src/modules/ai/services/email-insights.service.ts`

Current (BROKEN):
```typescript
private readonly allowedLabels = [
  'Important', 'Follow-up', 'Action Items', 'Info',
  'Personal', 'Finance', 'Promotions', 'Updates'
];
```

Fix:
1. Inject `PrismaService` (already done)
2. Fetch user's labels: `prisma.userLabel.findMany({ where: { tenantId } })`
3. Pass label names to AI prompt
4. Map AI response back to label IDs
5. Create `EmailLabel` records

**New method signature:**
```typescript
async categorizeEmailAndApply(
  tenantId: string,
  emailId: string,
  locale?: string,
  applyLabels: boolean = false  // Actually create EmailLabel records
): Promise<{ labels: string[]; labelIds?: string[] }>
```

### Phase D2: Add Priority Persistence

**File:** `backend/prisma/schema.prisma`

Add to Email model:
```prisma
model Email {
  // existing fields...
  aiPriority       Int?       // 1-10 priority score
  aiUrgency        String?    // 'low' | 'medium' | 'high' | 'critical'
  aiAnalyzedAt     DateTime?  // when last analyzed
}
```

**File:** `backend/src/modules/ai/services/email-insights.service.ts`

After `calculatePriority()`:
```typescript
await this.prisma.email.update({
  where: { id: emailId },
  data: {
    aiPriority: result.score,
    aiUrgency: result.urgency,
    aiAnalyzedAt: new Date()
  }
});
```

### Phase D3: Integrate with Email Sync (Auto-Triage)

**Option A (Event-driven):** Emit event after saving new email
- `email.new` event triggers async processing
- Non-blocking, respects user settings

**File:** `backend/src/modules/email-sync/services/base-email-sync.service.ts`

After saving email:
```typescript
if (userPrefs.autoTriageEnabled) {
  this.eventEmitter.emit('email.new', { emailId, tenantId });
}
```

**File:** `backend/src/modules/ai/listeners/email-triage.listener.ts` (NEW)

```typescript
@OnEvent('email.new')
async handleNewEmail({ emailId, tenantId }) {
  await this.emailInsightsService.analyzeEmail(tenantId, emailId);
  await this.emailInsightsService.categorizeEmailAndApply(tenantId, emailId, undefined, true);
}
```

### Phase D4: User Preference for Auto-Triage

**File:** `backend/prisma/schema.prisma`

Add to UserPreferences:
```prisma
model UserPreferences {
  // existing fields...
  autoTriageEnabled  Boolean @default(false)
  autoLabelEnabled   Boolean @default(false)
}
```

**Frontend:** Add toggle in AI Settings

### Phase D5: Validation Tests

Create test scripts:
1. `backend/scripts/test-auto-labeling.ts`
   - Create test labels in database
   - Call `categorizeEmail()`
   - Verify labels come from database, not hardcoded
   - Verify `EmailLabel` records created

2. `backend/scripts/test-auto-triage.ts`
   - Call `calculatePriority()` and `analyzeEmail()`
   - Verify Email record updated with priority
   - Test priority-based email sorting

### Files to Modify (PART D)

**Backend (modify):**
- `backend/src/modules/ai/services/email-insights.service.ts` - Use DB labels, persist priority
- `backend/prisma/schema.prisma` - Add aiPriority fields, autoTriage prefs

**Backend (create):**
- `backend/src/modules/ai/listeners/email-triage.listener.ts` - Event handler for auto-triage

**Frontend (modify):**
- `frontend/components/settings/AiSettings.tsx` - Add auto-triage toggle

---

## PART E: VoltAgent System Validation (Priority 5)

### Current State Analysis

| Component | File | Size | Status |
|-----------|------|------|--------|
| **Supervisor Agent** | `supervisor.agent.ts` | 397 lines | ✅ Works - orchestrates sub-agents |
| **Email Agent** | `email.agent.ts` | 78 lines | ✅ Works - has WritingStyleService |
| **Calendar Agent** | `calendar.agent.ts` | ~100 lines | ✅ Needs validation |
| **Contacts Agent** | `contacts.agent.ts` | ~100 lines | ✅ Needs validation |
| **Knowledge Agent** | `knowledge.agent.ts` | ~100 lines | ✅ Needs validation |
| **General Agent** | `general.agent.ts` | ~50 lines | ✅ Needs validation |
| **WebSearch Agent** | `websearch.agent.ts` | ~100 lines | ⚠️ Optional, needs ConfigService |
| **Analytics Agent** | `analytics.agent.ts` | ~100 lines | ⚠️ Optional, needs ConfigService |
| **DocumentLibrary Agent** | `document-library.agent.ts` | ~100 lines | ⚠️ Optional, needs service |

### Tools Analysis

| Tool File | Size | Status | Issue |
|-----------|------|--------|-------|
| `email.tools.ts` | 800+ lines | ✅ Works | HITL pattern correct |
| `insights.tools.ts` | 1000+ lines | ⚠️ Partial | Uses hardcoded labels |
| `calendar.tools.ts` | ~300 lines | ⚠️ Needs validation | |
| `contacts.tools.ts` | ~300 lines | ⚠️ Needs validation | |
| `folder.tools.ts` | ~200 lines | ✅ Works | |
| `analytics.tools.ts` | ~200 lines | ⚠️ Needs validation | |
| `web-search.tools.ts` | ~200 lines | ⚠️ Needs validation | |
| `document-library.tools.ts` | ~200 lines | ⚠️ Needs validation | |

### Validation Findings

#### ✅ WORKING CORRECTLY

1. **Supervisor Agent** (`supervisor.agent.ts`)
   - `buildDynamicInstructions()` injects UserContext correctly (lines 135-248)
   - `communicationStyle` IS in the prompt (lines 183-190)
   - Locale instruction added for response language
   - Connected providers listed for multi-account awareness

2. **VoltAgentService** (`voltagent.service.ts`)
   - `getUserContext()` fetches UserPreferences and ProviderConfig (lines 438-523)
   - Injects userContext into supervisor agent (line 607-624)
   - WritingStyleService is injected (line 215)
   - HITL integration works via `observabilityHooks.onPendingAction`

3. **Email Compose** (`email-insights.service.ts`)
   - `composeEmail()` DOES use WritingStyleService (lines 142-150)
   - Calls `writingStyle.getStylePromptSection()` to inject writing style
   - Sender name and signature are included in prompt

#### ⚠️ ISSUES FOUND

1. **Learning NOT Wired to HITL**
   - `hitl.service.ts` has NO import of learning module
   - `approveAction()` and `rejectAction()` don't call `recordFeedback()`
   - Learning profiles never update from user feedback

2. **communicationStyle in Supervisor vs Compose**
   - Supervisor agent HAS communicationStyle in instructions
   - BUT `email-insights.service.ts.composeEmail()` doesn't receive it directly
   - The `tone` parameter comes from frontend, NOT from UserPreferences
   - **Gap**: Frontend should read UserPreferences.communicationStyle and pass as tone

3. **Insights Tools Use Hardcoded Labels**
   - `email-insights.service.ts` line 36-45 has hardcoded `allowedLabels`
   - Should fetch from `UserLabel` table instead

4. **No Event Emission for New Emails**
   - `base-email-sync.service.ts` doesn't emit events
   - Auto-triage can't be triggered

### Phase E1: Validate All Agents

For each agent, verify:
1. Instructions are correct and localized
2. Tools are properly registered
3. Hooks are connected for observability
4. Memory is available if needed

**Files to check:**
- `backend/src/modules/ai/voltagent/agents/calendar.agent.ts`
- `backend/src/modules/ai/voltagent/agents/contacts.agent.ts`
- `backend/src/modules/ai/voltagent/agents/knowledge.agent.ts`
- `backend/src/modules/ai/voltagent/agents/general.agent.ts`
- `backend/src/modules/ai/voltagent/agents/websearch.agent.ts`
- `backend/src/modules/ai/voltagent/agents/analytics.agent.ts`
- `backend/src/modules/ai/voltagent/agents/document-library.agent.ts`

### Phase E2: Validate All Tools

For each tool set, verify:
1. Tenant isolation via `tenantId` parameter
2. Proper error handling and localization
3. HITL pattern for destructive actions (`requiresApproval: true`)
4. Cache integration where applicable

**Files to check:**
- `backend/src/modules/ai/voltagent/tools/calendar.tools.ts`
- `backend/src/modules/ai/voltagent/tools/contacts.tools.ts`
- `backend/src/modules/ai/voltagent/tools/analytics.tools.ts`
- `backend/src/modules/ai/voltagent/tools/web-search.tools.ts`
- `backend/src/modules/ai/voltagent/tools/document-library.tools.ts`

### Phase E3: Validate Localization

Verify all prompts use centralized locale system:
- `backend/src/modules/ai/voltagent/locales/en.ts` - English prompts
- `backend/src/modules/ai/voltagent/locales/it.ts` - Italian prompts
- `backend/src/modules/ai/voltagent/locales/index.ts` - Export + types

### Phase E4: Fix Identified Gaps

1. **Wire Learning → HITL**
   - In `hitl.service.ts`, inject LearningObservability
   - Call `recordFeedback()` in approve/reject methods

2. **Connect communicationStyle → Compose**
   - Frontend: Read `UserPreferences.communicationStyle`
   - Pass as `tone` parameter to compose API

3. **Fix insights.tools.ts**
   - Use database labels instead of hardcoded

### Files to Modify (PART E)

**Backend (validate + fix):**
- `backend/src/modules/ai/voltagent/agents/*.agent.ts` - Validate all agents
- `backend/src/modules/ai/voltagent/tools/*.tools.ts` - Validate all tools
- `backend/src/modules/ai/voltagent/locales/*.ts` - Validate translations
- `backend/src/modules/ai/voltagent/services/hitl.service.ts` - Wire to learning

**Frontend (fix):**
- `frontend/components/email/compose/ComposeEditor.tsx` - Use communicationStyle as tone

---

## Implementation Priority Order (FINAL)

### 🔴 Priority 1: Fix Broken Features
1. Remove `getLearningStats()` 404 call from frontend
2. Remove Reset Learning button (no backend)
3. Fix hardcoded labels → use UserLabel table

### 🟠 Priority 2: Email Signature Feature
1. Add EmailSignature Prisma model
2. Create backend CRUD API
3. Wire frontend SignatureSettings.tsx
4. Append signature on send

### 🟡 Priority 3: Connect Existing Code
1. Wire HITL → Learning feedback loop
2. Connect communicationStyle → compose tone
3. Add event emission for new emails

### 🟢 Priority 4: Auto-Triage (Superhuman Feature)
1. Create email-triage.listener.ts
2. Add aiPriority fields to Email model
3. Add autoTriageEnabled preference
4. Add frontend toggle

### 🔵 Priority 5: Full Validation
1. Validate all VoltAgent agents
2. Validate all tools
3. Run end-to-end tests

---

## Test Checklist

| Feature | Test |
|---------|------|
| Signature CRUD | Create, update, delete, set default |
| Signature on send | New email includes signature HTML |
| Signature in replies | Reply includes signature |
| Learning feedback | Approve/reject updates profile |
| CommunicationStyle | FORMAL user gets formal compose |
| Auto-triage | New email gets labels + priority |
| HITL approval | Action executes after approve |
| WritingStyle | Compose uses learned greetings |

---

## PART F: AI Memory - Reality Check

### What Exists (3 Services)

| Service | Purpose | Status |
|---------|---------|--------|
| `AIMemoryService` | Long-term storage in Postgres | ✅ Works |
| `MemoryIntelligenceService` | Semantic search + fact extraction | ⚠️ Passive only |
| `EpisodicMemoryService` | Learn from rejections | ✅ Works |

### What's Broken

| Issue | Reality |
|-------|---------|
| `expiresAt` field | Exists but NEVER checked - memories grow forever |
| Memory extraction | Only on user messages, not agent actions |
| Conversation → Memory | Messages stored but NOT converted to AIMemory |
| Memory consolidation | No dedup, no merging similar facts |

### Minimal Fixes (2h total)

1. **Add memory cleanup job** - Delete expired memories (1h)
   - `backend/src/modules/ai/voltagent/jobs/memory-cleanup.processor.ts`
   - Cron job: daily, delete where `expiresAt < now()`

2. **Set default expiry on creation** (0.5h)
   - PREFERENCE: 1 year
   - FACT: never expires
   - INTERACTION: 90 days
   - PATTERN: 6 months

3. **Log memory stats** (0.5h)
   - Add count by type to `/voltagent/memory/stats`
   - Show storage usage warning if > 10k memories

### Skip (V2)

- Memory consolidation/dedup
- Conversation → Memory conversion
- Cross-source profile merging

---

## PART G: Agent Speed Optimization

### Current State

| Agent | maxSteps | Avg Latency |
|-------|----------|-------------|
| Supervisor | 5 (was 10) | ~1000ms per step |
| Email | 3 (was 5) | ~500ms per step |
| Calendar | 5 | ~500ms per step |
| General | 3 | ~200ms per step |

### Model Router (Already Implemented)

`ModelRouterService` routes by complexity:
- Simple queries → `mistral-small` (200ms, 3x cheaper)
- Moderate → `mistral-medium` (500ms)
- Complex → `mistral-large` (1000ms)

**Estimated savings: 40-60% cost**

### Speed Fixes (Low Effort)

| Fix | Effort | Impact |
|-----|--------|--------|
| Reduce Supervisor maxSteps 5→3 | 5min | Less LLM calls |
| Reduce Calendar maxSteps 5→3 | 5min | Faster responses |
| Cache common tool results | 2h | Skip DB queries |
| Parallel tool execution | Already done | - |

### Skip (Marginal Gains)

- Streaming responses (complex frontend work)
- Model fine-tuning (expensive, overkill)
- Edge deployment (infrastructure change)

---

## PART H: CRM Audit - Honest Assessment

### What You ACTUALLY Have

| Feature | Status | Notes |
|---------|--------|-------|
| Contacts CRUD | ✅ Full | All operations work |
| Google/Microsoft sync | ✅ Full | Webhooks, manual, scheduled |
| vCard import | ✅ Works | Basic import |
| Email extraction | ✅ Works | Pulls from headers |
| Relationship scoring | ✅ Works | Basic algorithm |
| Stale contact alerts | ✅ Works | CrmAlertsWidget |
| Interaction history | ✅ Works | Linked to emails |

### What's VAPORWARE (Delete from Marketing)

| Feature | Reality |
|---------|---------|
| **Deals/Pipeline** | Prisma model exists, NO API, NO UI |
| **Companies** | Just a string field on Contact |
| **Pipeline stages** | No management, no Kanban |
| **Deal forecasting** | Nothing implemented |
| **Activity timeline** | Partial (interactions exist but no timeline UI) |

### Recommendation

1. **Rename** "CRM" to "Contacts" in UI until deals work
2. **Keep** what works: contacts, scoring, alerts
3. **Later (V2)**: Build deals module properly:
   - DealsService + Controller
   - DealsPage frontend
   - Pipeline configuration
   - Activity timeline

---

## FINAL: 3-Week Execution Summary

| Week | Focus | Hours | Deliverable |
|------|-------|-------|-------------|
| 1 | Fix broken + Signatures | 11h | Working signature feature |
| 2 | Email Compose + AI | 24h | Draft, attachments, summarize, smart-reply |
| 3 | Connect orphan code | 12h | HITL→Learning, auto-triage, memory cleanup |
| **Total** | | **47h** | MVP polished |

### NOT in This Plan (V2)

- Deals/Pipeline CRM
- Keyboard shortcuts
- Model fine-tuning

---

## PART I: Dashboard Review - Complete Redesign

### Current State (BRUTAL TRUTH)

| Component | Status | Reality |
|-----------|--------|---------|
| `analytics.service.ts` | ❌ **FRAUD** | QUERIES real data (`_sent`, `_received`) then THROWS IT AWAY and returns hardcoded fake numbers! Even has `received: -2910` (NEGATIVE!) |
| `AnalyticsChart.tsx` | ❌ BROKEN | Uses fake backend data, no loading states |
| Main Dashboard | ⚠️ Useless | 6 widgets but **NO trend graphs** |
| Follow-ups widget | ⚠️ Theater | `onSnooze` prop exists but **NO BUTTON calls it**. Dashboard widget is READ-ONLY. Backend API is complete! |
| Search | ❌ Fake | Just stores text in Zustand, does client-side filter. **NO backend search**. No command palette. |
| Two Follow-up components | ⚠️ Duplication | `dashboard/widgets/FollowUpWidget.tsx` AND `productivity/FollowUpWidget.tsx` - confusing |

### The Analytics Fraud (Line 9-35 of analytics.service.ts)

```typescript
// The CRIME: queries DB then throws it away!
const _sent = await this.prisma.email.count({ ... });   // Real data
const _received = await this.prisma.email.count({ ... }); // Real data

return [
  { name: 'Jan', emails: 4000, sent: 2400, received: 1600 },  // FAKE
  { name: 'Jul', emails: 3490, sent: 4300, received: -810 },  // NEGATIVE VALUE!
];
```

### What Dashboard NEEDS (Superhuman-level)

| Widget | Current | Needed |
|--------|---------|--------|
| **Trend Graphs** | ❌ Missing | Email volume, response time, AI usage over time |
| **Stats Cards** | ⚠️ Basic | Add % change vs last period |
| **Priority Inbox** | ❌ Missing | Top 5 urgent emails |
| **Follow-ups** | ⚠️ Basic | Add snooze, quick actions, filtering |
| **Analytics** | ❌ Broken | Fix backend, add real metrics |

### Phase I1: Create Analytics Backend (CRITICAL)

**File:** `backend/src/modules/analytics/analytics.controller.ts` (NEW)

```typescript
@Get('emails')
async getEmailAnalytics(@Query() dto: AnalyticsQueryDto) {
  // Aggregate email counts by day/week/month
  // Calculate response times
  // Track AI compose/reply usage
  return { data: [], period: dto.period };
}

@Get('ai-usage')
async getAiUsage(@Query() dto: AnalyticsQueryDto) {
  // Count: composes, summaries, smart replies
  // Track savings (time, tokens)
}
```

**File:** `backend/src/modules/analytics/analytics.service.ts` (NEW)

- `getEmailVolumeByDay(tenantId, startDate, endDate)`
- `getResponseTimeStats(tenantId, period)`
- `getAiUsageStats(tenantId, period)`
- `getProductivityMetrics(tenantId, period)`

### Phase I2: Fix AnalyticsChart.tsx

**File:** `frontend/components/dashboard/AnalyticsChart.tsx`

Current (BROKEN):
```typescript
const data = await analyticsApi.getEmailAnalytics(); // 404!
```

Fix:
1. Use TanStack Query hook
2. Handle loading/error states
3. Add period selector (7d, 30d, 90d)
4. Use Recharts properly

### Phase I3: Redesign Main Dashboard

**File:** `frontend/components/dashboard/DashboardContainer.tsx`

Add new widgets:
1. **TrendWidget** - Email volume line chart (last 7 days)
2. **StatsGridWithChange** - Stats cards with % change indicator
3. **PriorityInboxWidget** - Top 5 urgent emails
4. **ImprovedFollowUpsWidget** - With snooze and quick actions

### Phase I4: Improve Follow-ups Widget

**File:** `frontend/components/dashboard/widgets/FollowUpsWidget.tsx` or AI section

Current Issues:
- Just a list, no actions
- No snooze functionality
- No filtering (overdue, today, upcoming)

Improvements:
1. Add snooze button (1h, 1d, 1w)
2. Add quick reply action
3. Filter tabs: Overdue | Today | Upcoming
4. Show urgency indicator
5. Link to email thread

### Phase I5: Add Search Consolidation

**Files to audit:**
- `frontend/components/email/search/` - Check current state
- `backend/src/modules/email/services/email-search.service.ts` - Validate

Current Issues:
- Search may be fragmented (email list vs global)
- Need unified search component
- Need keyboard shortcut (Cmd+K)

Fix:
1. Create `SearchCommand.tsx` - Global command palette
2. Wire to email search backend
3. Add to layout (always accessible)
4. Support: emails, contacts, calendar (later)

---

## PART J: E2E Tests + Memory Consolidation (IN SCOPE)

### E2E Tests (4h total)

| Test | Coverage |
|------|----------|
| `e2e/signature.spec.ts` | Create, edit, delete, set default, send with signature |
| `e2e/compose.spec.ts` | Draft save, attachments, AI compose, send |
| `e2e/hitl.spec.ts` | Action approval, rejection, auto-approve threshold |
| `e2e/auto-triage.spec.ts` | New email → labels applied, priority set |

Framework: Playwright (already in devDependencies)

### Memory Consolidation (3h total)

| Task | Hours |
|------|-------|
| Add memory cleanup cron job | 1h |
| Memory dedup on similar facts | 1h |
| Memory stats endpoint | 0.5h |
| Set proper expiry defaults | 0.5h |

**Files:**
- `backend/src/modules/ai/voltagent/jobs/memory-cleanup.processor.ts` (NEW)
- `backend/src/modules/ai/services/ai-memory.service.ts` (modify)

---

---

## PART K: Subscription & Billing (Autumn Integration)

### Autumn Overview

**What is Autumn?** ([useautumn.com](https://useautumn.com/))
- YC S25 open-source billing platform over Stripe
- **FREE until $8K monthly revenue**, then $375/month
- Handles: checkouts, upgrades/downgrades, usage tracking, paywalls
- Official SDK: `autumn-js` (server) + `autumn-js/react` (frontend)

**Why Autumn over raw Stripe:**
- No webhook handling needed
- Usage-based billing built-in
- Credits system ready
- Upgrade/downgrade logic automatic
- **Official React hooks** - no custom API needed!

### Reference Implementation: Zero-staging

**Location**: `D:\MailAgent\esempio\Zero-staging`

Zero uses this exact stack - we copy their battle-tested pattern:

| File | Purpose |
|------|---------|
| `apps/mail/hooks/use-billing.ts` | Frontend hook wrapping `autumn-js/react` |
| `apps/server/src/routes/autumn.ts` | Backend routes wrapping `autumn-js` SDK |
| `apps/mail/lib/utils.ts` | `isProCustomer()` helper |

### Current State (Already Exists)

```prisma
model Subscription {
  autumnCustomerId     String?   // ← Ready for Autumn
  autumnSubscriptionId String?   // ← Ready for Autumn
  plan                 SubscriptionPlan   @default(FREE)
  monthlyEmailLimit    Int       @default(100)
  monthlyAICallLimit   Int       @default(50)
  maxUsers             Int       @default(1)
  emailsProcessed      Int       @default(0)
  aiCallsUsed          Int       @default(0)
}

enum SubscriptionPlan { FREE, STARTER, PROFESSIONAL, ENTERPRISE }
```

**PROBLEM**: Model exists but NO service, NO controller, NO integration!

### Recommended Pricing Tiers for MailAgent

| Plan | Price | Emails/mo | AI Calls/mo | Accounts | Features |
|------|-------|-----------|-------------|----------|----------|
| **Free** | $0 | 100 | 50 | 1 | Basic sync |
| **Starter** | $9/mo | 1,000 | 500 | 3 | Signatures, auto-triage |
| **Pro** | $29/mo | 10,000 | 2,000 | Unlimited | Priority support, API |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | SSO, SLA |

**Feature IDs in Autumn Dashboard:**
- `emails-monthly` (usage, resets monthly)
- `ai-calls-monthly` (usage, resets monthly)
- `email-accounts` (limit)

**Pro Plan Detection** (from Zero):
```typescript
const PRO_PLANS = ['starter', 'pro', 'enterprise'] as const;

export const isProCustomer = (customer: Customer) => {
  return customer?.products?.some(product =>
    PRO_PLANS.some(plan => product.id?.includes(plan) || product.name?.includes(plan))
  ) ?? false;
};
```

### Implementation Plan (6h) - Zero Pattern

#### Phase K1: Install Dependencies (0.5h)

```bash
# Backend
cd backend && npm install autumn-js

# Frontend
cd frontend && npm install autumn-js
```

Add to `.env`:
```env
AUTUMN_SECRET_KEY=sk_live_... # Only this one needed!
```

#### Phase K2: Backend Controller (2h)

**File:** `backend/src/modules/subscription/subscription.controller.ts`

Copy Zero's pattern - wrap Autumn SDK:

```typescript
import { Autumn, fetchPricingTable } from 'autumn-js';

@Controller('subscription')
export class SubscriptionController {
  private autumn: Autumn;

  constructor(private configService: ConfigService) {
    this.autumn = new Autumn({
      secretKey: this.configService.get('AUTUMN_SECRET_KEY')
    });
  }

  // Create customer on signup (call from auth)
  @Post('customers')
  async createCustomer(@Req() req) {
    const user = req.user;
    return this.autumn.customers.create({
      id: user.tenantId,  // Use tenantId as customer_id
      name: user.name,
      email: user.email,
    });
  }

  // Attach plan (checkout/upgrade)
  @Post('attach')
  async attach(@Req() req, @Body() body: AttachDto) {
    return this.autumn.attach({
      ...body,
      customer_id: req.user.tenantId,
      customer_data: { name: req.user.name, email: req.user.email },
    });
  }

  // Cancel subscription
  @Post('cancel')
  async cancel(@Req() req, @Body() body) {
    return this.autumn.cancel({
      ...body,
      customer_id: req.user.tenantId,
    });
  }

  // Check feature access
  @Post('check')
  async check(@Req() req, @Body() body: CheckDto) {
    return this.autumn.check({
      ...body,
      customer_id: req.user.tenantId,
      customer_data: { name: req.user.name, email: req.user.email },
    });
  }

  // Track usage
  @Post('track')
  async track(@Req() req, @Body() body: TrackDto) {
    return this.autumn.track({
      ...body,
      customer_id: req.user.tenantId,
      customer_data: { name: req.user.name, email: req.user.email },
    });
  }

  // Open billing portal
  @Post('billing-portal')
  async billingPortal(@Req() req) {
    return this.autumn.customers.billingPortal(req.user.tenantId, {
      return_url: this.configService.get('FRONTEND_URL'),
    });
  }

  // Get pricing table for display
  @Get('pricing-table')
  async pricingTable(@Req() req) {
    return fetchPricingTable({
      instance: this.autumn,
      params: { customer_id: req.user?.tenantId },
    });
  }
}
```

#### Phase K3: Frontend Hook (1.5h)

**File:** `frontend/hooks/use-billing.ts`

Copy Zero's pattern using `autumn-js/react`:

```typescript
import { useAutumn, useCustomer } from 'autumn-js/react';
import { useMemo } from 'react';

type FeatureState = {
  total: number;
  remaining: number;
  unlimited: boolean;
  enabled: boolean;
  usage: number;
  nextResetAt: number | null;
};

const FEATURE_IDS = {
  EMAILS: 'emails-monthly',
  AI_CALLS: 'ai-calls-monthly',
  ACCOUNTS: 'email-accounts',
} as const;

export const useBilling = () => {
  const { customer, refetch, isLoading, error } = useCustomer();
  const { attach, track, openBillingPortal } = useAutumn();

  const { isPro, emailsFeature, aiCallsFeature, accountsFeature } = useMemo(() => {
    const isPro = customer?.products?.some(p =>
      ['starter', 'pro', 'enterprise'].some(plan => p.id?.includes(plan))
    ) ?? false;

    const getFeature = (id: string): FeatureState => {
      const f = customer?.features?.[id];
      return {
        total: f?.included_usage || 0,
        remaining: f?.balance || 0,
        unlimited: f?.unlimited ?? false,
        enabled: (f?.unlimited ?? false) || Number(f?.balance) > 0,
        usage: f?.usage || 0,
        nextResetAt: f?.next_reset_at ?? null,
      };
    };

    return {
      isPro,
      emailsFeature: getFeature(FEATURE_IDS.EMAILS),
      aiCallsFeature: getFeature(FEATURE_IDS.AI_CALLS),
      accountsFeature: getFeature(FEATURE_IDS.ACCOUNTS),
    };
  }, [customer]);

  return {
    isLoading,
    customer,
    refetch,
    attach,      // Start checkout: attach({ product_id: 'pro' })
    track,       // Track usage: track({ feature_id: 'ai-calls-monthly' })
    openBillingPortal,  // Opens Stripe portal
    isPro,
    emailsFeature,
    aiCallsFeature,
    accountsFeature,
  };
};
```

#### Phase K4: Usage Tracking Integration (1h)

**Track AI calls** in `email-insights.service.ts`:
```typescript
// After any AI call
await fetch(`${process.env.BACKEND_URL}/subscription/track`, {
  method: 'POST',
  body: JSON.stringify({ feature_id: 'ai-calls-monthly' })
});
```

**Track email sync** in `email-sync.service.ts`:
```typescript
// After syncing emails
await this.trackUsage(tenantId, 'emails-monthly', emailCount);
```

#### Phase K5: UI Components (1h)

**File:** `frontend/components/common/UsageBanner.tsx`

```typescript
export function UsageBanner() {
  const { aiCallsFeature, attach } = useBilling();

  if (aiCallsFeature.unlimited || aiCallsFeature.remaining > aiCallsFeature.total * 0.2) {
    return null; // Don't show if unlimited or >20% remaining
  }

  const percentUsed = (aiCallsFeature.usage / aiCallsFeature.total) * 100;

  return (
    <Alert severity="warning">
      <AlertTitle>{percentUsed.toFixed(0)}% of AI calls used</AlertTitle>
      {aiCallsFeature.remaining} calls remaining this month.
      <Button onClick={() => attach({ product_id: 'pro' })}>
        Upgrade to Pro
      </Button>
    </Alert>
  );
}
```

### Files to Create

**Backend:**
- `backend/src/modules/subscription/subscription.module.ts`
- `backend/src/modules/subscription/subscription.controller.ts`
- `backend/src/modules/subscription/dto/subscription.dto.ts`

**Frontend:**
- `frontend/hooks/use-billing.ts`
- `frontend/components/common/UsageBanner.tsx`
- `frontend/pages/pricing.tsx` (optional - Autumn has built-in pricing table)

### Environment Variables

```env
AUTUMN_SECRET_KEY=sk_live_...  # Only this one needed!
```

### Autumn Dashboard Setup

1. Create account at [app.useautumn.com](https://app.useautumn.com)
2. Connect Stripe account
3. Create products:
   - `free` (default, no checkout needed)
   - `starter` ($9/mo)
   - `pro` ($29/mo)
   - `enterprise` (custom)
4. Add features to each product:
   - `emails-monthly`: 100 / 1000 / 10000 / unlimited
   - `ai-calls-monthly`: 50 / 500 / 2000 / unlimited
   - `email-accounts`: 1 / 3 / unlimited / unlimited

### Test Checklist

| Test | Expected |
|------|----------|
| Free user hits AI limit | Shows upgrade modal |
| Starter user hits email limit | Shows upgrade modal |
| Checkout flow | Redirects to Stripe, returns success |
| Upgrade from Free to Starter | Instant access, no checkout |
| Downgrade from Pro to Starter | Takes effect at period end |
| Usage tracking | Counter increments after each AI call |
| Usage reset | Monthly limits reset on billing date |

---

## PART L: Auth Performance Optimization (CRITICAL)

### The Problem: 2 DB Queries Per Request

**Comparison with Zero-staging:**

| Aspect | Zero (FAST) | MailAgent (SLOW) |
|--------|-------------|------------------|
| Auth Library | `better-auth` | Passport.js + JWT |
| Session Cache | Redis `secondaryStorage` (30 days) | **NO CACHE - DB hit every request** |
| Cookie Cache | `cookieCache.enabled: true` | None |
| Session Expiry | 30 days | 24 hours |
| DB Queries/Request | 0 (from cache) | **2 queries EVERY request** |
| Token Refresh | Middleware pattern (async) | Synchronous blocking |

### Root Cause: `jwt.strategy.ts` Lines 98-143

Every authenticated request executes **2 database queries**:

```typescript
// Query 1: Session lookup - EVERY REQUEST
const session = await this.prisma.session.findUnique({
  where: { id: payload.sessionId },
});

// Query 2: User + Tenant lookup - EVERY REQUEST
const user = await this.prisma.user.findUnique({
  where: { id: payload.userId },
  include: { tenant: true },
});
```

**Impact**: With 50ms average per query, that's **100ms overhead per request** before any business logic runs.

### Zero's Solution: Redis Session Cache

```typescript
// Zero's auth.ts - Sessions cached in Redis
secondaryStorage: {
  get: async (key: string) => await redis.get(key),
  set: async (key: string, value: string, ttl?: number) =>
    await redis.set(key, value, { ex: ttl }),
  delete: async (key: string) => await redis.del(key),
},
session: {
  cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30 }, // 30 days
  expiresIn: 60 * 60 * 24 * 30, // 30 days
}
```

### Fix Options

#### Option A: Add Redis Cache to Existing JwtStrategy (4h)

**Recommended** - Minimal changes, big impact.

**File:** `backend/src/modules/auth/strategies/jwt.strategy.ts`

1. Inject `CacheService` (already uses Redis)
2. Cache session + user data for 5 minutes
3. Invalidate cache on logout/role change

```typescript
async validate(payload: any) {
  const cacheKey = `session:${payload.sessionId}`;

  // Try cache first
  const cached = await this.cacheService.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Existing DB queries...
  const session = await this.prisma.session.findUnique({...});
  const user = await this.prisma.user.findUnique({...});

  // Cache result for 5 minutes
  const result = { id: user.id, tenantId: user.tenantId, ... };
  await this.cacheService.set(cacheKey, JSON.stringify(result), 300);

  return result;
}
```

**Cache Invalidation Points:**
- `auth.service.ts:logout()` → Delete `session:{id}` from cache
- `auth.service.ts:resetPassword()` → Delete all user sessions from cache
- User role change → Delete user's session cache

#### Option B: Migrate to `better-auth` (16h)

**Full rewrite** - Better long-term but high effort.

1. Replace Passport.js with `better-auth`
2. Use Drizzle adapter (already have Drizzle)
3. Add Redis secondary storage
4. Update all auth endpoints
5. Migrate session schema

**Skip for now** - Option A gives 90% of the benefit with 25% of the work.

### OAuth Token Refresh Optimization (2h)

**Problem:** Token refresh blocks the request in `getProviderWithTokens()`.

**Fix:** Background refresh when token is near expiry (5 min buffer instead of 60s).

**File:** `backend/src/modules/providers/services/google-oauth.service.ts` + `microsoft-oauth.service.ts`

```typescript
async getProviderWithTokens(tenantId: string, providerId: string) {
  // ...existing code...

  // Change: Refresh in background if expires within 5 minutes
  const needsRefresh = provider.tokenExpiresAt?.getTime() <= Date.now() + 5 * 60 * 1000;

  if (needsRefresh && provider.refreshToken) {
    // Non-blocking refresh
    this.refreshTokenInBackground(provider).catch(err =>
      this.logger.warn(`Background token refresh failed: ${err.message}`)
    );
  }

  return { provider, accessToken };
}

private async refreshTokenInBackground(provider: any) {
  // Same refresh logic, but doesn't block the request
}
```

### Implementation Plan (6h total)

| Task | Hours | File |
|------|-------|------|
| Add session cache to JwtStrategy | 2h | `jwt.strategy.ts` |
| Add cache invalidation to logout | 0.5h | `auth.service.ts` |
| Add cache invalidation on password reset | 0.5h | `auth.service.ts` |
| Implement background token refresh (Google) | 1h | `google-oauth.service.ts` |
| Implement background token refresh (Microsoft) | 1h | `microsoft-oauth.service.ts` |
| Test auth performance improvement | 1h | Manual testing |
| **Total** | **6h** | |

### Files to Modify

**Backend:**
- `backend/src/modules/auth/strategies/jwt.strategy.ts` - Add Redis cache
- `backend/src/modules/auth/services/auth.service.ts` - Cache invalidation
- `backend/src/modules/providers/services/google-oauth.service.ts` - Background refresh
- `backend/src/modules/providers/services/microsoft-oauth.service.ts` - Background refresh

### Expected Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| Auth overhead per request | ~100ms | ~5ms (cache hit) |
| OAuth token refresh | Blocks request | Background |
| Session validation | 2 DB queries | 0 DB queries (cached) |

### Test Checklist

| Test | Expected |
|------|----------|
| First request (cold cache) | 2 DB queries, cache populated |
| Subsequent requests | 0 DB queries, from cache |
| Logout | Cache invalidated, next request hits DB |
| Password reset | All sessions invalidated |
| Token refresh | Happens in background, doesn't block |

---

## UPDATED: 4-Week Execution Summary

| Week | Focus | Hours | Deliverable |
|------|-------|-------|-------------|
| 1 | Fix broken + Signatures + **Auth Cache** | 17h | Working signature + **fast auth** |
| 2 | Email Compose + AI + Subscription | 32h | Draft, attachments, smart-reply, pricing page |
| 3 | Dashboard + Search + Memory | 16h | Trend graphs, search command, memory cleanup |
| 4 | E2E Tests + Polish | 10h | Full test coverage, follow-ups improvements |
| **Total** | | **75h** | MVP polished with monetization + **fast auth** |
