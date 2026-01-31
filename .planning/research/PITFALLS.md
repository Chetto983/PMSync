# Pitfalls Research: Refactoring Risks

## Summary

NestJS refactoring projects fail most commonly from three causes: (1) circular dependency explosions when splitting services without proper module boundaries, (2) distributed lock misconfigurations that cause race conditions worse than the original problem, and (3) testing strategies that miss concurrency edge cases. This document maps each pitfall to detection methods, prevention strategies, and the specific phase where it must be addressed.

---

## Critical Pitfalls

### Pitfall 1: Circular Dependency Hell After Service Splitting

**Warning signs:**
- `Error: Nest can't resolve dependencies of X` at runtime
- Services suddenly stop injecting after refactoring
- Need to add `forwardRef()` to make things work
- Module imports form a cycle (A imports B imports C imports A)

**Prevention:**
1. **Map dependencies BEFORE splitting**: Draw the dependency graph of the service being split. If ServiceA calls ServiceB which calls ServiceA, you have a cycle that will explode when you split.
2. **Extract shared logic to a common module first**: Before splitting `folder-sync.service.ts`, extract any shared utilities (normalization, validation) to `common/utils/`.
3. **Use interface injection for cross-module deps**: When `imap-folder-sync.ts` needs to call `gmail-folder-sync.ts`, inject via interface not concrete class.
4. **Never use `forwardRef()` as first solution**: If you need `forwardRef()`, you have a design problem. Refactor the cycle out.

**Phase relevance:** Phase 1 (Large File Splits) - Before any service is split, verify no hidden cycles exist. Add dependency graph to each split PR.

**MailAgent-specific risk:** `folder-sync.service.ts` (1,629 lines) calls into `gmail-folder.service.ts` which calls back into folder-sync for normalization. This must be broken before splitting.

---

### Pitfall 2: Exported Service Not Registered in Module

**Warning signs:**
- `Error: Nest can't resolve dependencies of Y (?, ConfigService, ...)` - the `?` indicates missing provider
- Service works in tests but fails at runtime
- Service works when injected in same module but fails cross-module

**Prevention:**
1. **Checklist for every extracted service:**
   - [ ] Added to `providers` array in its module
   - [ ] Added to `exports` array if used by other modules
   - [ ] Importing module imports the exporting module (not just the service)
2. **Use IDE search for all injection points**: Before moving a service, grep for `constructor(...ServiceName` to find all consumers.
3. **Test cross-module injection in integration tests**: Unit tests with mocks won't catch missing exports.

**Phase relevance:** All phases involving service extraction. Create a module checklist template and require it in PR descriptions.

**MailAgent-specific risk:** `RedisLockService` is currently in `common/services/` and exported from `CommonModule`. If anyone extracts a new locking utility, they must verify exports.

---

### Pitfall 3: Interface Injection Without Token

**Warning signs:**
- TypeScript compiles but runtime throws `Cannot read property of undefined`
- Injection works in tests (where you manually provide mocks) but fails in production
- Error: `Nest can't resolve dependencies` pointing at an interface type

**Prevention:**
1. **Never use TypeScript interfaces for injection tokens**: Interfaces don't exist at runtime. Use abstract classes or injection tokens.
2. **Pattern for interface-based injection:**
   ```typescript
   // tokens.ts
   export const EMAIL_DRIVER = Symbol('EMAIL_DRIVER');

   // module.ts
   { provide: EMAIL_DRIVER, useClass: GmailDriver }

   // service.ts
   constructor(@Inject(EMAIL_DRIVER) private driver: IEmailDriver) {}
   ```
3. **Search for `interface I` in injection positions**: Any `private service: ISomething` is suspicious.

**Phase relevance:** Phase 1 (Driver Splits) - When splitting `imap.driver.ts`, `google.driver.ts`, `microsoft.driver.ts`, they share the same interface. Injection tokens required.

---

### Pitfall 4: Scope Mismatch (Singleton Injecting Request-Scoped)

**Warning signs:**
- Random data leaks between requests
- `Error: Scope of a provider cannot be changed after injection`
- Request-specific data appearing in wrong user's response

**Prevention:**
1. **Audit scope of all services BEFORE refactoring:**
   ```bash
   grep -r "Scope.REQUEST" backend/src/
   grep -r "Scope.TRANSIENT" backend/src/
   ```
2. **Rule: Singleton services cannot inject REQUEST-scoped services**: If you need request context in a singleton, pass it as a method parameter.
3. **Never change scope during refactoring**: If a service is REQUEST-scoped, all extracted sub-services must also be REQUEST-scoped.

**Phase relevance:** Phase 1 - Before splitting any service, document its scope. Add scope annotation to all new services.

**MailAgent-specific risk:** `VoltAgentService` handles user-specific AI context. If any extracted service (like `ChatContextBuilder`) accidentally becomes singleton, user data could leak.

---

## Race Condition Specific Pitfalls

### Pitfall 5: Non-Atomic Lock Acquisition

**Warning signs:**
- Intermittent duplicate records appearing
- P2002 errors (unique constraint violation) under load
- Lock appears to work in tests but fails in production

**Prevention:**
1. **NEVER use SETNX + EXPIRE separately**: This is the most common Redis lock bug. If process crashes between SETNX and EXPIRE, lock never expires.
   ```typescript
   // WRONG - NOT ATOMIC
   await redis.setnx(key, value);
   await redis.expire(key, ttl);

   // CORRECT - ATOMIC
   await redis.set(key, value, 'PX', ttlMs, 'NX');
   ```
2. **Always verify lock implementation uses atomic command**: MailAgent's `RedisLockService` correctly uses `SET ... NX PX` (line 115).
3. **Test lock under failure**: Kill process between operations and verify lock eventually expires.

**Phase relevance:** Phase RC-A1/RC-A8 (Race Condition Fixes) - Audit all lock usages before adding new ones.

**MailAgent current state:** `RedisLockService` is correctly implemented. Risk is when developers copy-paste and simplify.

---

### Pitfall 6: Lock TTL Shorter Than Operation Duration

**Warning signs:**
- Sync completes successfully but database has duplicate/corrupted data
- Logs show "Lock acquired" for same key by two processes
- Lock timeout errors followed by successful operations

**Prevention:**
1. **Lock TTL must exceed MAXIMUM expected operation time, not average**:
   - Average folder sync: 30 seconds
   - Maximum folder sync (10k folders): 5 minutes
   - Lock TTL must be: ≥5 minutes
2. **Add monitoring for lock duration**:
   ```typescript
   const startTime = Date.now();
   await redisLock.withLock(key, ttl, async () => {
     // ... operation ...
     const duration = Date.now() - startTime;
     if (duration > ttl * 0.8) {
       logger.warn(`Lock ${key} used ${duration}ms of ${ttl}ms TTL`);
     }
   });
   ```
3. **For long operations, use lock extension**: MailAgent has `extendLock()` (line 253) - use it for folder syncs.

**Phase relevance:** Phase RC-A1 - When adding monitoring for folder sync lock timeout (>4 min alert), also add TTL usage alerts.

**MailAgent-specific:** Current 5-minute TTL for folder-sync (line 64 of folder-sync.service.ts) is safe but needs monitoring.

---

### Pitfall 7: Releasing Someone Else's Lock

**Warning signs:**
- Random "concurrent modification" errors
- Operations that should be protected are overlapping
- Logs show lock released but another process is still holding it

**Prevention:**
1. **Always store unique lock ID and verify before release**:
   ```typescript
   // WRONG - Releases ANY lock
   await redis.del(lockKey);

   // CORRECT - Only releases OUR lock
   const script = `
     if redis.call("get", KEYS[1]) == ARGV[1] then
       return redis.call("del", KEYS[1])
     else
       return 0
     end
   `;
   await redis.eval(script, 1, lockKey, ourLockId);
   ```
2. **MailAgent's pattern is correct**: `releaseLock()` (line 152) uses Lua script for atomic check-and-delete.
3. **Never use raw `redis.del()` for locks**: Search for `redis.del` on lock keys - this is always wrong.

**Phase relevance:** Phase RC-A8 - When adding locks to folder CRUD, use `withLock()` wrapper, not manual acquire/release.

---

### Pitfall 8: Lock Scope Too Wide or Too Narrow

**Warning signs:**
- Too wide: Operations that could run in parallel are serialized, causing performance issues
- Too narrow: Race conditions still occur because lock doesn't cover all related operations

**Prevention:**
1. **Document what each lock protects**:
   ```typescript
   // GOOD: Clear scope
   // Lock protects: folder upsert + email count update + real-time notification
   await redisLock.withLock(`folder:${folderId}`, 30000, async () => {
     await upsertFolder(folder);
     await updateEmailCount(folderId);
     await notifyClients(folderId);
   });
   ```
2. **Lock granularity guide:**
   - Provider-level lock: For folder sync (affects all folders)
   - Folder-level lock: For folder CRUD (affects single folder)
   - Email-level lock: Almost never needed (use database constraints)
3. **Test concurrent operations at each granularity level**

**Phase relevance:** Phase RC-A8 - Lock key design: `folder:crud:{providerId}:{folderId}` is correct granularity.

---

### Pitfall 9: Transaction + Lock Ordering Mismatch

**Warning signs:**
- Database transaction commits but operation is duplicated
- Lock is released but data isn't visible to other processes
- Prisma transaction isolation errors (P2034)

**Prevention:**
1. **Lock must be acquired BEFORE transaction starts**:
   ```typescript
   // WRONG: Transaction starts before lock
   @Transaction()
   async updateFolder() {
     await this.redisLock.withLock(key, ttl, async () => {
       // Lock acquired AFTER transaction started
     });
   }

   // CORRECT: Lock wraps transaction
   async updateFolder() {
     await this.redisLock.withLock(key, ttl, async () => {
       await this.prisma.$transaction(async (tx) => {
         // Transaction is inside lock scope
       });
     });
   }
   ```
2. **For NestJS decorators**: Never use `@Transaction()` decorator with `withLock()` - the decorator runs first.

**Phase relevance:** Phase RC-A8 - All folder CRUD operations must follow lock → transaction → release order.

---

## Testing Pitfalls

### Pitfall 10: Testing Refactored Code with Mocks Instead of Real Concurrency

**Warning signs:**
- Tests pass but production has race conditions
- "Works on my machine" for concurrent scenarios
- Test coverage reports 100% but bugs still exist

**Prevention:**
1. **Race condition tests MUST use real Redis and real database**:
   ```typescript
   // WRONG: Mocked lock always succeeds
   jest.mock('../redis-lock.service');

   // CORRECT: Real Redis, concurrent execution
   it('prevents concurrent folder sync', async () => {
     const promises = Array(10).fill(null).map(() =>
       folderSyncService.syncProviderFolders(tenantId, providerId)
     );
     await Promise.all(promises);
     // Verify no duplicates, no corruption
   });
   ```
2. **Use stress test scripts for production scenarios**: MailAgent has `stress-test-production-scenarios.ts` - require these to pass before merging.
3. **Test failure modes, not just success**: What happens when Redis is down during lock acquisition?

**Phase relevance:** Phase Testing - All race condition fixes must include stress tests, not just unit tests.

**MailAgent-specific:** Scripts in `backend/scripts/` (e.g., `stress-test-multi-tenant-sync.ts`) are the gold standard.

---

### Pitfall 11: Refactored Module Works But Imports Are Broken

**Warning signs:**
- `npm run build` succeeds but runtime fails
- Circular import warnings
- Module loads in isolation but fails when full app starts

**Prevention:**
1. **Test full application startup after each refactoring PR**:
   ```bash
   npm run build && npm run start:dev
   # Wait for "Nest application successfully started"
   ```
2. **Check for barrel file cycles**: `index.ts` files that re-export can create cycles.
3. **Use `madge` to visualize import graph**:
   ```bash
   npx madge --circular --extensions ts src/
   ```

**Phase relevance:** Every phase - Add full startup test to CI pipeline.

---

### Pitfall 12: Test Coverage Doesn't Cover Multi-Tenant Isolation

**Warning signs:**
- Single-tenant tests pass but production shows data leaks
- Cache entries contain wrong tenant's data
- Query results include records from other tenants

**Prevention:**
1. **Every refactored service needs multi-tenant test**:
   ```typescript
   it('tenant isolation', async () => {
     // Create data for tenant A
     await service.createFolder(tenantA, folderData);

     // Query as tenant B
     const result = await service.listFolders(tenantB);

     // Must NOT see tenant A's data
     expect(result.find(f => f.id === tenantAFolder.id)).toBeUndefined();
   });
   ```
2. **Test cache isolation specifically**: Clear cache for tenant A, verify tenant B's cache is unaffected.
3. **Use different provider IDs per tenant in tests**: Real isolation bugs happen when providerId is unique but tenantId is wrong.

**Phase relevance:** Phase Testing - Required for all refactored email/folder services.

---

## Prisma-Specific Pitfalls

### Pitfall 13: Missing P2002/P2034 Retry Logic in New Code

**Warning signs:**
- Unique constraint violations (P2002) crash the operation instead of retrying
- Transaction deadlocks (P2034) cause request failures
- Batch operations fail completely when one item conflicts

**Prevention:**
1. **All upsert operations must use `PrismaRetryService`**:
   ```typescript
   // WRONG: No retry on race condition
   await prisma.folder.upsert({ where: { externalId }, ... });

   // CORRECT: Retry on P2002
   await prismaRetry.withRetry(
     () => prisma.folder.upsert({ where: { externalId }, ... }),
     { loggerName: 'FolderSync' }
   );
   ```
2. **Verify `PrismaRetryService` is injected in all new services**: Search new code for `prisma.` calls without retry wrapper.
3. **Transaction isolation level**: For bulk operations with unique constraints, use `RepeatableRead` or `Serializable`.

**Phase relevance:** All phases - Every PR touching Prisma must pass retry audit.

**MailAgent current state:** `PrismaRetryService` exists (line 69 of prisma-retry.service.ts) but adoption is inconsistent.

---

### Pitfall 14: Breaking Existing Queries During Schema Refactoring

**Warning signs:**
- Queries return wrong data after refactoring
- Performance degrades because index is no longer used
- Null values where data used to exist

**Prevention:**
1. **No schema changes during code refactoring**: This milestone explicitly excludes migrations. If you need schema changes, it's a separate milestone.
2. **If query optimization is needed, do it with the same data model**: Add indexes, rewrite queries, but don't change column types or relationships.
3. **Test query plans before and after**:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM folders WHERE provider_id = '...';
   ```

**Phase relevance:** Out of scope check - If any PR includes `schema.prisma` changes, it must be rejected.

---

## Rollback Strategy

### Immediate Rollback (Within Minutes)

**When to use:** Production is broken, users are affected.

**Steps:**
1. Revert the merge commit:
   ```bash
   git revert -m 1 <merge-commit-hash>
   git push origin main
   ```
2. Deploy the revert immediately.
3. Do NOT try to "fix forward" under pressure.

**Pre-requisites:**
- Each refactoring PR is atomic (one logical change per PR)
- No mixed commits (feature + refactor in same PR)

### Gradual Rollback (Within Hours)

**When to use:** Subtle bugs discovered, users not immediately affected.

**Steps:**
1. Feature flag the new code path:
   ```typescript
   if (config.useNewFolderSync) {
     await newFolderSyncService.sync();
   } else {
     await legacyFolderSyncService.sync();
   }
   ```
2. Switch flag to `false` in production.
3. Investigate with new code disabled.

**Pre-requisites:**
- Feature flags must be added BEFORE refactoring (not during incident)
- Legacy code path must remain functional until refactoring is proven stable (typically 2 weeks)

### Data Recovery

**When to use:** Race condition caused data corruption.

**Steps:**
1. Identify affected records by timestamp (when bug was deployed to when fixed).
2. For duplicates: Delete newer record, keep older.
3. For missing data: Trigger full re-sync for affected providers.
4. For corrupted data: Restore from point-in-time backup.

**Pre-requisites:**
- Point-in-time recovery enabled in PostgreSQL.
- All sync operations are idempotent (re-running fixes state).

---

## Phase-Specific Checklist

### Before Each Refactoring PR

- [ ] Dependency graph drawn - no hidden cycles
- [ ] All services registered in modules
- [ ] Scope annotations verified
- [ ] Multi-tenant test included
- [ ] No schema changes in PR
- [ ] Rollback plan documented

### After Each Refactoring PR Merged

- [ ] Full app startup verified in staging
- [ ] Stress tests passed in staging
- [ ] Lock usage monitoring enabled
- [ ] Feature flag ready for rollback
- [ ] Wait 24 hours before next major refactor

---

## References

- [NestJS Dependency Injection Mistakes](https://dev.to/adamthedeveloper/nestjs-dependency-injection-why-your-services-wont-inject-and-how-to-fix-it-properly-3phf)
- [How to Avoid Circular Dependencies in NestJS - LogRocket](https://blog.logrocket.com/avoid-circular-dependencies-nestjs/)
- [Redis Distributed Locks: 10 Common Mistakes](https://leapcell.io/blog/redis-distributed-locks-10-common-mistakes)
- [Redis Distributed Locks Explained - C# Corner](https://www.c-sharpcorner.com/article/redis-distributed-locks-explained-safe-patterns-pitfalls-and-real-world-usage/)
- [Redis Official: Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [10 Prisma Transaction Patterns That Avoid Deadlocks](https://medium.com/@connect.hashblock/10-prisma-transaction-patterns-that-avoid-deadlocks-4f52a174760b)
- [Prisma Error Reference - P2002, P2034](https://www.prisma.io/docs/orm/reference/error-reference)
- [Prisma Transactions and Batch Queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- MailAgent Codebase: `backend/src/common/services/redis-lock.service.ts`
- MailAgent Codebase: `backend/src/common/services/prisma-retry.service.ts`
- MailAgent Codebase: `.planning/codebase/CONCERNS.md`

---

*Research date: 2026-01-31*
