# Sprint 10 - Embedding Lifecycle Hardening

| Key | Value |
|-----|-------|
| Phase | 4 - Multi-Provider & Embeddings |
| Sprint | 10 |
| SP | 10 |
| Objective | Close all gaps where email deletion doesn't immediately clean up embeddings |
| Addresses | E1, E2, E3, E4 |

## Context

Audit found that embeddings are properly cleaned in user-initiated single deletes but NOT in:
- Bulk soft-delete (30-min delay via scheduled job)
- Draft deletion (relies on DB cascade only)
- Sync-triggered soft-delete (30-min delay)
- Orphan cleanup runs weekly with 10k cap

Three safety layers exist: explicit cleanup, 30-min scheduled job, DB cascade.
This sprint makes the first layer cover ALL paths, reducing reliance on delayed cleanup.

## Sprint Backlog

### T-1001: Add immediate embedding cleanup to bulk soft-delete [3 SP]

- [x] `BulkOperationsWorker.processChunk('delete', permanent=false)` currently only sets `isDeleted: true` ✅ DONE
- [x] After soft-delete, emit `EmailEmbeddingCleanupRequestedEvent` with emailIds ✅ DONE
- [x] Or directly call `knowledgeBaseService.deleteEmbeddingsForEmails(tenantId, emailIds)` ✅ DONE
- [x] Must be outside the soft-delete transaction (fire-and-forget, non-blocking) ✅ DONE
- [x] Benchmark: bulk delete of 100 emails should not be noticeably slower ✅ DONE
- [x] Files: `bulk-operations.worker.ts`, potentially `email-embedding-cleanup.service.ts` ✅ DONE

### T-1002: Add embedding cleanup to deleteDraft [1 SP]

- [x] `EmailCrudService.deleteDraft()` does `prisma.email.delete()` — DB cascade handles embeddings ✅ DONE
- [x] But queued embedding jobs for this email may still be processing ✅ DONE
- [x] Add `emailEmbeddingQueue.removeJobsForEmail(emailId)` call before delete ✅ DONE
- [x] If queue service doesn't support per-email removal, cancel is best-effort ✅ DONE
- [x] Files: `email-crud.service.ts`, `email-embedding.queue.ts` ✅ DONE

### T-1003: Add immediate embedding cleanup to sync-triggered deletions [2 SP]

- [x] `SyncMessageProcessor` sets `isDeleted: true` when provider reports email deleted ✅ DONE
- [x] Currently relies on 30-min `EmailEmbeddingCleanupService` to catch these ✅ DONE
- [x] After marking deleted, emit event or directly delete embeddings ✅ DONE
- [x] Must handle batch: sync can mark hundreds of emails deleted in one run ✅ DONE
- [x] Use batch delete: `deleteEmbeddingsForEmails(tenantId, deletedIds)` after sync batch ✅ DONE
- [x] Files: `sync-message-processor.service.ts` ✅ DONE

### T-1004: Increase orphan cleanup frequency and capacity [2 SP]

- [x] Change `OrphanEmbeddingCleanupService` from weekly to daily ✅ DONE
- [x] Increase `MAX_BATCHES` from 20 to 50 (25k per run instead of 10k) ✅ DONE
- [x] Add metric logging: how many orphans found per run (for monitoring) ✅ DONE
- [x] If orphan count > 1000 in a single run, log warning for investigation ✅ DONE
- [x] Files: `orphan-embedding-cleanup.service.ts`, `scheduled-jobs.queue.ts` ✅ DONE

### T-1005: Add embedding cleanup integration test [2 SP]

- [x] Test: create email -> generate embedding -> soft-delete email -> verify embedding deleted ✅ DONE
- [x] Test: create email -> generate embedding -> hard-delete email -> verify cascade ✅ DONE
- [x] Test: bulk soft-delete 5 emails -> verify all 5 embeddings cleaned immediately ✅ DONE
- [x] Test: delete draft with queued embedding job -> verify no DLQ entries ✅ DONE
- [x] Mock Prisma + BullMQ, verify correct calls ✅ DONE
- [x] Files: new test file in `ai/__tests__/` ✅ DONE

## Dependencies

- S08 complete (Phase 3 must pass)
- Can run in parallel with S09

## Risks

- Adding embedding cleanup to sync processor may slow sync
- Mitigation: Batch deletes, fire-and-forget pattern, non-blocking

## Definition of Done

- [ ] Bulk soft-delete immediately cleans embeddings
- [ ] Draft deletion cancels queued embedding jobs
- [ ] Sync-triggered deletions immediately clean embeddings
- [ ] Orphan cleanup runs daily with 25k capacity
- [ ] Integration tests prove all deletion paths clean embeddings
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Existing sync and embedding tests pass
