# Email Modules Consolidation - ENTRY POINT

**START HERE** - Single entry point for the consolidation project.

---

## Quick Status

| Phase | Status | Test Required |
|-------|--------|---------------|
| Phase 1: Prisma Retry | NOT STARTED | `test-prisma-retry.ts` |
| Phase 2: IMAP Utils | NOT STARTED | `test-imap-sync.ts` |
| Phase 3: Folder Utils | NOT STARTED | `stress-test-atomic-sync.ts` |
| Phase 4: Error Utils | NOT STARTED | `npm run type-check` |
| Phase 5: Dead Code | NOT STARTED | `npm run type-check` |
| Phase 6: Race Conditions | NOT STARTED | `stress-test-atomic-sync.ts` |
| Phase 7: P2034 Handling | NOT STARTED | `test-prisma-retry.ts` |
| Phase 8: Final Validation | NOT STARTED | All tests |
| Phase 9: Production Stress | NOT STARTED | `stress-test-production-scenarios.ts` |

---

## Execution Timeline

```
PHASE 1 ──> PHASE 2 ──> PHASE 3 ──> PHASE 4 ──> PHASE 5
   │           │           │           │           │
   ▼           ▼           ▼           ▼           ▼
  TEST       TEST        TEST        TEST        TEST
   │           │           │           │           │
   └───────────┴───────────┴───────────┴───────────┘
                           │
                           ▼
PHASE 6 ──> PHASE 7 ──> PHASE 8 ──> PHASE 9
   │           │           │           │
   ▼           ▼           ▼           ▼
  TEST       TEST     ALL TESTS   PRODUCTION
                                   STRESS
```

**RULE**: Never proceed to next phase until current phase test PASSES. update memory before compact and at the end of every phase!!.

---

## Phase Details

### Phase 1: Prisma Retry Service (1 hour)

**Goal**: Add P2002/P2034 retry with exponential backoff

**Create**:
- `backend/src/common/services/prisma-retry.service.ts`

**Test**:
```bash
npx ts-node backend/scripts/test-prisma-retry.ts
```

**Pass Criteria**:
- P2002 retry works (3 attempts)
- P2034 retry works (2 attempts)
- Exponential backoff verified

---

### Phase 2: IMAP Utils Consolidation (1 hour)

**Goal**: Single source for `parseImapExternalId`

**Create**:
- `backend/src/common/utils/imap-utils.ts`

**Update** (3 files):
- `email/services/email-fetch.service.ts`
- `email/services/attachment-on-demand.service.ts`
- `email-sync/services/base-email-sync.service.ts`

**Test**:
```bash
npx ts-node backend/scripts/test-imap-sync.ts
```

**Pass Criteria**:
- IMAP connection works
- parseImapExternalId works
- No duplicate function definitions

---

### Phase 3: Folder Utils Consolidation (1 hour)

**Goal**: Single source for `normalizeFolderName`

**Create**:
- `backend/src/common/utils/folder-utils.ts`

**Update** (2 files):
- `base-email-sync.service.ts`
- `folder-sync.service.ts`

**Test**:
```bash
npx ts-node backend/scripts/stress-test-atomic-sync.ts
```

**Pass Criteria**:
- No duplicate emails
- Folder mapping correct

---

### Phase 4: Error Utils Extension (30 min)

**Goal**: Add `isNotFoundError`, `isRateLimitError`, `isServerError`

**Update**:
- `backend/src/common/utils/error.utils.ts`

**Delete from** `base-email-sync.service.ts`:
- Lines 1255-1310 (inline error functions)

**Test**:
```bash
npm run type-check
npm run lint -- backend/src/modules/email-sync
```

**Pass Criteria**:
- 0 type errors
- 0 lint errors

---

### Phase 5: Dead Code Deletion (15 min)

**Goal**: Remove unused `extractPlainText`

**Delete from** `base-email-sync.service.ts`:
- Lines 1314-1346 (32 lines)

**Test**:
```bash
npm run type-check
```

**Pass Criteria**:
- 0 type errors (confirms nothing used it)

---

### Phase 6: Race Condition Fixes (2 hours)

**Goal**: Fix RC-A1 and RC-A8 in folder-sync.service.ts

**Fix RC-A1**: Add Redis lock to `syncProviderFolders`
**Fix RC-A8**: Add Redis lock to folder CRUD

**Test**:
```bash
npx ts-node backend/scripts/stress-test-atomic-sync.ts
npx ts-node backend/scripts/stress-test-multi-tenant.ts
```

**Pass Criteria**:
- No duplicate emails
- No race conditions detected
- Redis locks acquired/released

---

### Phase 7: P2034 Handling (1 hour)

**Goal**: Add deadlock retry to existing P2002 logic

**Update** `base-email-sync.service.ts`:
- Lines 1036-1068: Add P2034 to retry conditions

**Test**:
```bash
npx ts-node backend/scripts/test-prisma-retry.ts
```

**Pass Criteria**:
- P2034 retry verified

---

### Phase 8: Final Validation (1 hour)

**Goal**: All tests pass

**Run ALL tests**:
```bash
npm run type-check
npm run lint -- backend/src/modules/email
npm run lint -- backend/src/modules/email-sync
npx ts-node backend/scripts/stress-test-atomic-sync.ts
npx ts-node backend/scripts/stress-test-multi-tenant.ts
npx ts-node backend/scripts/test-full-integration.ts
npx ts-node backend/scripts/test-email-operations.ts
```

**Pass Criteria**:
- ALL tests pass
- 0 type errors
- 0 lint errors

---

### Phase 9: Production Stress Test (2 hours)

**Goal**: Verify production scenarios don't fail

**Create**:
- `backend/scripts/stress-test-production-scenarios.ts`

**Test Scenarios**:
1. Multi-tenant concurrent sync (10 at once)
2. Folder rename during sync
3. P2034 deadlock recovery
4. System folder delete protection
5. Redis lock contention (20 workers)
6. Large batch operation (1000+ emails)
7. Token expiry during sync

**Run**:
```bash
npx ts-node backend/scripts/stress-test-production-scenarios.ts
```

**Pass Criteria**:
- 7/7 tests pass
- Production-Ready: YES

---

## Document Index

| Document | Purpose |
|----------|---------|
| **EMAIL_CONSOLIDATION_ENTRY.md** | THIS FILE - Start here |
| [EMAIL_CONSOLIDATION_ROADMAP.md](./EMAIL_CONSOLIDATION_ROADMAP.md) | Detailed implementation |
| [EMAIL_MODULES_CONSOLIDATION_MASTER.md](./EMAIL_MODULES_CONSOLIDATION_MASTER.md) | Audit + Prisma 7.2 |
| [EMAIL_SYNC_MASTER_INDEX.md](./EMAIL_SYNC_MASTER_INDEX.md) | Architecture overview |
| [EMAIL_SYNC_REFACTOR_PLAN.md](./EMAIL_SYNC_REFACTOR_PLAN.md) | Driver split (AFTER consolidation) |

---

## Emergency Rollback

If any phase breaks production:

```bash
# Revert to last working commit
git log --oneline -10
git revert <commit-hash>

# Or restore from backup
git stash
git checkout main
```

---

## Completion Checklist

- [ ] Phase 1 complete + test passes
- [ ] Phase 2 complete + test passes
- [ ] Phase 3 complete + test passes
- [ ] Phase 4 complete + test passes
- [ ] Phase 5 complete + test passes
- [ ] Phase 6 complete + test passes
- [ ] Phase 7 complete + test passes
- [ ] Phase 8 complete + ALL tests pass
- [ ] Phase 9 complete + production stress passes
- [ ] Update this document status to COMPLETE

---

**Total Estimated Time**: 10-12 hours

**NEVER skip a test. NEVER proceed if test fails.**
