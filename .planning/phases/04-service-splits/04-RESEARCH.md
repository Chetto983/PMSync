# Phase 4: Service Splits - Research

**Question:** What do I need to know to PLAN this phase well?

**Researched:** 2026-02-01

---

## 1. Phase Dependencies

### What Phase 3 Proved
Phase 3 (IMAP Driver Split) established the pattern we must follow:

1. **Facade + DI-Injected Instances**: The driver factory returns DI-injected instances, not `new X()`. This is critical because facades require multiple sub-service dependencies.
2. **Line Count Targets**: Facade <250 lines, sub-services <500 lines (one exception documented at 811 lines for cohesion)
3. **Barrel Exports**: Public API exports facade, internal services exported for testing
4. **Module Registration Order**: Sub-services must register BEFORE facade for DI ordering
5. **Test Preservation**: All 100 existing tests passed after refactor

### Key Decision from Phase 3
> "IMAPDriver facade uses DI-injected instance in factory instead of new" - 03-06-01

This same pattern applies to service splits.

---

## 2. Current Service Analysis

### 2.1 folder-sync.service.ts (1,653 lines)

**Location:** `backend/src/modules/email-sync/services/folder-sync.service.ts`

**Responsibilities (mixed across providers):**

| Method | Lines | Provider | Responsibility |
|--------|-------|----------|----------------|
| `syncProviderFolders` | 62-109 | Orchestrator | Routes to provider-specific sync |
| `syncImapFolders` | 114-184 | IMAP | Full IMAP folder sync |
| `parseImapFolders` | 189-243 | IMAP | Parse IMAP folder list |
| `determineSpecialUse` | 248-273 | IMAP | Detect special folder types |
| `syncFoldersToDatabase` | 278-439 | Shared | DB sync with P2002/P2034 retry |
| `syncGmailFolders` | 444-582 | Gmail | Gmail label sync |
| `syncMicrosoftFolders` | 587-694 | Microsoft | Microsoft folder sync |
| `determineMicrosoftFolderType` | 696-703 | Microsoft | Folder type detection |
| `fetchMicrosoftFolders` | 705-722 | Microsoft | Graph API pagination |
| `getFolders` | 727-735 | Query | Get folders for provider |
| `getFolderByPath` | 740-752 | Query | Get single folder |
| `updateFolderCounts` | 757-833 | Query | Update single folder counts |
| `updateAllFolderCounts` | 840-969 | Query | Batch update all folder counts |
| `getFolderKeys` | 976-1003 | Utility | Normalize folder keys |
| `auditFolderSync` | 1011-1118 | Audit | Compare DB vs server |
| `cleanupOrphanedFolders` | 1123-1147 | Audit | Delete orphaned folders |
| `createFolder` | 1156-1205 | CRUD | Create folder (all providers) |
| `renameFolder` | 1211-1265 | CRUD | Rename folder (all providers) |
| `deleteFolder` | 1274-1340 | CRUD | Delete folder (all providers) |
| IMAP CRUD methods | 1344-1514 | IMAP | IMAP-specific CRUD |
| Gmail CRUD methods | 1518-1599 | Gmail | Gmail-specific CRUD |
| Microsoft CRUD methods | 1603-1653 | Microsoft | Microsoft-specific CRUD |

**Existing Extractions:**
- `GmailFolderService` (307 lines) - `services/gmail/gmail-folder.service.ts`
- `MicrosoftFolderService` (390 lines) - `services/microsoft/microsoft-folder.service.ts`

**Problem:** The existing provider-specific services are NOT used consistently. `folder-sync.service.ts` still contains Gmail and Microsoft logic directly.

### 2.2 emails.service.ts (1,705 lines)

**Location:** `backend/src/modules/email/services/emails.service.ts`

**Responsibilities:**

| Category | Methods | Lines (approx) |
|----------|---------|----------------|
| CRUD | `listEmails`, `getEmailById`, `getEmailsByIds`, `updateEmail`, `deleteEmail` | ~350 |
| Bulk Operations | `bulkUpdateRead`, `bulkUpdateStarred`, `bulkUpdateFlagged`, `bulkMoveToFolder`, `bulkDelete`, `bulkAddLabels`, `bulkRemoveLabels` | ~550 |
| Draft Operations | `saveDraft`, `getDraft`, `deleteDraft` | ~100 |
| Search/Stats | `searchEmails`, `getStats`, `getConversations`, `getThread` | ~350 |
| Attachments | `getAttachmentDownloadUrl` | ~50 |
| Private Helpers | `syncChangesToProvider`, `ensureProvidersActive`, `validateBulkInput` | ~100 |

**Existing Extractions:**
- `EmailFolderService` (527 lines) - `services/email-folder.service.ts` - folder cache, WHERE building, count updates
- `EmailCleanupService` (615 lines) - `services/email-cleanup.service.ts` - retention, cleanup jobs

---

## 3. Proposed Split Strategy

### 3.1 folder-sync.service.ts Split

**Target Architecture:**
```
FolderSyncService (facade, <200 lines)
    |
    +-- ImapFolderSyncService (<400 lines) - IMAP-specific sync + CRUD
    +-- GmailFolderSyncService (<400 lines) - Gmail label sync + CRUD
    +-- MicrosoftFolderSyncService (<400 lines) - Microsoft folder sync + CRUD
    +-- FolderSyncQueryService (<400 lines) - Shared queries, counts, audit
```

**Method Distribution:**

| New Service | Methods |
|-------------|---------|
| FolderSyncService (facade) | `syncProviderFolders`, `createFolder`, `renameFolder`, `deleteFolder`, `getFolders`, `getFolderByPath` |
| ImapFolderSyncService | `syncImapFolders`, `parseImapFolders`, `determineSpecialUse`, `createImapFolder`, `renameImapFolder`, `deleteImapFolder` |
| GmailFolderSyncService | `syncGmailFolders`, Gmail CRUD methods (or delegate to existing `GmailFolderService`) |
| MicrosoftFolderSyncService | `syncMicrosoftFolders`, `determineMicrosoftFolderType`, `fetchMicrosoftFolders`, Microsoft CRUD methods |
| FolderSyncQueryService | `syncFoldersToDatabase`, `updateFolderCounts`, `updateAllFolderCounts`, `getFolderKeys`, `auditFolderSync`, `cleanupOrphanedFolders` |

**Decision Point:** Should we use existing `GmailFolderService` and `MicrosoftFolderService` or create new `GmailFolderSyncService`/`MicrosoftFolderSyncService`?

- **Option A (Recommended):** Extend existing services to include sync methods, rename to `*FolderSyncService`
- **Option B:** Create new sync services that delegate to existing services for CRUD
- **Option C:** Merge existing services into new sync services

Recommend **Option A**: It consolidates provider logic and follows Single Responsibility Principle better.

### 3.2 emails.service.ts Split

**Target Architecture:**
```
EmailsService (facade, <200 lines)
    |
    +-- EmailCrudService (<400 lines) - Single email CRUD
    +-- EmailBulkService (<500 lines) - Bulk operations
    +-- EmailDraftService (<200 lines) - Draft management
    +-- EmailSearchService (<300 lines) - Search, stats, conversations
    +-- EmailFolderService (existing, 527 lines) - Already extracted
    +-- EmailCleanupService (existing, 615 lines) - Already extracted
```

**Method Distribution:**

| New Service | Methods |
|-------------|---------|
| EmailsService (facade) | Re-export all methods, maintain backward compatibility |
| EmailCrudService | `listEmails`, `getEmailById`, `getEmailsByIds`, `updateEmail`, `deleteEmail`, `ensureProvidersActive`, `syncChangesToProvider` |
| EmailBulkService | `bulkUpdateRead`, `bulkUpdateStarred`, `bulkUpdateFlagged`, `bulkMoveToFolder`, `bulkDelete`, `bulkAddLabels`, `bulkRemoveLabels`, `validateBulkInput` |
| EmailDraftService | `saveDraft`, `getDraft`, `deleteDraft` |
| EmailSearchService | `searchEmails`, `getStats`, `getConversations`, `getThread`, `getAttachmentDownloadUrl` |

---

## 4. Key Technical Considerations

### 4.1 Facade Pattern Implementation

Follow Phase 3 pattern exactly:

```typescript
// EmailsService as facade
@Injectable()
export class EmailsService {
  constructor(
    private crud: EmailCrudService,
    private bulk: EmailBulkService,
    private drafts: EmailDraftService,
    private search: EmailSearchService,
  ) {}

  // Delegation methods
  listEmails(params: EmailListParams) { return this.crud.listEmails(params); }
  bulkUpdateRead(ids, tenantId, isRead) { return this.bulk.bulkUpdateRead(ids, tenantId, isRead); }
  // ... etc
}
```

### 4.2 Backward Compatibility (SERV-05)

**Critical:** All existing imports must continue to work:
```typescript
// Must still work after split
import { EmailsService } from './emails.service';
import { FolderSyncService } from './folder-sync.service';
```

**Implementation:**
1. Facade re-exports all public types
2. Barrel exports (`index.ts`) expose facade + sub-services for testing
3. Module registration order: sub-services first, then facade

### 4.3 Shared Dependencies

Both services share these dependencies:
- `PrismaService` - Database access
- `RealtimeEventsService` - WebSocket events
- `RedisLockService` - Distributed locks
- `ProviderTokenService` - Token management
- `EmailSyncBackService` - Sync back to provider

### 4.4 Test Strategy (TEST-05)

Phase 3 approach:
1. Create unit tests for each new sub-service
2. Existing tests continue to use facade (no changes needed)
3. Add integration tests for cross-service operations

Target: 80%+ coverage for new modules.

---

## 5. Existing Provider-Specific Services

### 5.1 GmailFolderService (307 lines)

**Location:** `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`

**Current Methods:**
- `getFolderPathForLabel(labelId, labelName)` - Convert label to folder path
- `getSpecialUseForLabel(labelId)` - Get specialUse from label
- `determineFolderFromLabels(labelIds, fallback)` - Primary folder from labels
- `syncGmailFolders(gmail, tenantId, providerId)` - Full sync (different signature!)
- `labelIdToFolderPath(labelId, labelName)` - Private mapping
- `determineFolderTypeFromLabelId(labelId)` - Private type detection

**Problem:** `syncGmailFolders` signature differs from `folder-sync.service.ts` version. The existing service takes `gmail_v1.Gmail` client, the folder-sync version builds its own client.

### 5.2 MicrosoftFolderService (390 lines)

**Location:** `backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts`

**Current Methods:**
- `determineFolderFromParentId(parentFolderId, providerId, isDraft)` - Folder lookup
- `specialUseToCanonical(specialUse)` - Private conversion
- `displayNameToCanonical(displayName)` - Private conversion
- `syncMicrosoftFolders(tenantId, providerId)` - Full sync (matches folder-sync signature)
- `determineMicrosoftFolderType(folderName)` - Private type detection

**Note:** `syncMicrosoftFolders` is duplicated between `folder-sync.service.ts` and `MicrosoftFolderService`. This is the code duplication we need to consolidate.

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking backward compatibility | High | Facade re-exports all public APIs; no import changes needed |
| Circular dependencies | Medium | Use callback pattern (proven in Phase 3) for cross-service calls |
| Missing shared state | Medium | Shared dependencies injected via DI; no service-local state |
| Test failures | Low | Facade preserves existing tests; new tests for sub-services |
| P2002/P2034 retry duplication | Low | Keep retry logic in shared query service |

---

## 7. Line Count Projections

### folder-sync.service.ts Split

| File | Estimated Lines | Target | Status |
|------|-----------------|--------|--------|
| folder-sync.service.ts (facade) | ~150 | <200 | OK |
| imap-folder-sync.service.ts | ~350 | <400 | OK |
| gmail-folder-sync.service.ts | ~400 | <400 | Borderline |
| microsoft-folder-sync.service.ts | ~350 | <400 | OK |
| folder-sync-query.service.ts | ~450 | <500 | OK |

### emails.service.ts Split

| File | Estimated Lines | Target | Status |
|------|-----------------|--------|--------|
| emails.service.ts (facade) | ~150 | <200 | OK |
| email-crud.service.ts | ~400 | <400 | Borderline |
| email-bulk.service.ts | ~450 | <500 | OK |
| email-draft.service.ts | ~150 | <200 | OK |
| email-search.service.ts | ~350 | <400 | OK |

---

## 8. Recommended Plan Sequence

### folder-sync.service.ts (SERV-01)

1. **04-01**: Extract `FolderSyncQueryService` (shared queries, counts, P2002/P2034 retry)
2. **04-02**: Extend `GmailFolderService` to `GmailFolderSyncService` (merge duplicated sync)
3. **04-03**: Extend `MicrosoftFolderService` to `MicrosoftFolderSyncService` (merge duplicated sync)
4. **04-04**: Extract `ImapFolderSyncService` (IMAP-specific operations)
5. **04-05**: Convert `FolderSyncService` to thin facade

### emails.service.ts (SERV-03)

6. **04-06**: Extract `EmailCrudService` (single email operations)
7. **04-07**: Extract `EmailBulkService` (bulk operations)
8. **04-08**: Extract `EmailDraftService` (draft management)
9. **04-09**: Extract `EmailSearchService` (search, stats, conversations)
10. **04-10**: Convert `EmailsService` to thin facade + wiring

---

## 9. Questions for Planning

1. **GmailFolderService signature:** Should we change `syncGmailFolders` to match `folder-sync.service.ts` pattern (just tenantId, providerId) or keep the gmail client parameter?

2. **Code duplication:** The `syncMicrosoftFolders` method is nearly identical in both files. Should we delete the `folder-sync.service.ts` version during consolidation?

3. **Existing EmailFolderService:** This is already 527 lines. Should we leave it as-is or consider splitting it further?

4. **Order of execution:** Should we do folder-sync split first (simpler, fewer dependencies) or emails.service split first (more impactful)?

**Recommendation:** Execute folder-sync.service.ts split first (04-01 through 04-05), then emails.service.ts split (04-06 through 04-10). This follows Phase 3 precedent and keeps complexity manageable.

---

## 10. Success Criteria (from REQUIREMENTS.md)

- [ ] **SERV-01**: folder-sync.service.ts split by provider (<400 lines each)
- [ ] **SERV-03**: emails.service.ts split into CRUD, bulk, cleanup services (<500 lines each)
- [ ] **SERV-05**: Backward-compatible facade pattern maintained
- [ ] **TEST-05**: Unit tests for each new split module (80%+ coverage)

---

## 11. References

- Phase 3 Summary: `.planning/phases/03-imap-driver-split/03-06-SUMMARY.md`
- Requirements: `.planning/REQUIREMENTS.md`
- Existing GmailFolderService: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`
- Existing MicrosoftFolderService: `backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts`
- Existing EmailFolderService: `backend/src/modules/email/services/email-folder.service.ts`
- Existing EmailCleanupService: `backend/src/modules/email/services/email-cleanup.service.ts`
