# VoltAgent Code Audit Findings (2026-01-29)

Scope: backend/src/modules/ai/voltagent
Method: static audit only (no runtime tests)

## Critical

### C1 - Document library query missing tenant filter
- Location: `backend/src/modules/ai/voltagent/services/document-library.service.ts:591`
- Problem: `queryDocuments` loads libraries by ID without `tenantId` filtering. If caller supplies libraryIds from another tenant, the Mistral library IDs are used to query and return cross-tenant content.
- Fix: Add `tenantId` to the `findMany` where clause and intersect `libraryIds` with `listLibraries(tenantId)` before querying.
- Impact: Cross-tenant data exposure and compliance breach.

### C2 - Approval workflow uses mismatched IDs
- Location: `backend/src/modules/ai/voltagent/services/approval-workflow.service.ts:117,120,164,166,214,239,242,268`
- Problem: `createPendingAction` stores `sessionId: executionId`, then `resumeApproval` calls `approveAction/rejectAction` with `executionId`. `HitlService.getPendingAction` expects an ActionQueue ID, not the workflow execution ID. `getSerializableSuspended` also maps `executionId` from `action.id`, creating ID confusion.
- Fix: Persist and return the ActionQueue ID from `createPendingAction`, store it in the suspended workflow record, and use it for approve/reject. Keep `executionId` separate for workflow resumption.
- Impact: HITL approvals cannot find the pending action, leading to stuck or unresumable workflows.

## High

### H1 - ActionType enum drift and fallback classification
- Location: `backend/src/modules/ai/voltagent/tools/email.tools.ts:388,404,420,436,806,858,918,966`; `backend/src/modules/ai/voltagent/tools/folder.tools.ts:196,216,257,292`; `backend/src/modules/ai/voltagent/services/hitl.service.ts:90-112`; `backend/prisma/schema.prisma:1465-1480`; `backend/src/modules/ai/voltagent/services/action-executor.service.ts:302`
- Problem: Tools emit action types (MARK_READ, MARK_UNREAD, STAR_EMAIL, UNSTAR_EMAIL, EMPTY_FOLDER, BULK_*, CREATE/RENAME/DELETE_FOLDER, MOVE_EMAIL) that are missing from Prisma `ActionType`. `HitlService.mapActionType` does not cover them and defaults to CREATE_TASK. MOVE_EMAIL is mapped to ARCHIVE_EMAIL and has no executor case.
- Fix: Align Prisma `ActionType` and Hitl mappings with the actual `AgentActionType` values used by tools. Add explicit executor handling for MOVE_EMAIL or stop emitting it.
- Impact: Approvals are misclassified, audit trails are wrong, and unknown action types can fail at execution time.

### H2 - RAG email search uses embedding IDs as email IDs
- Location: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts:320`; `backend/src/modules/ai/voltagent/tools/email.tools.ts:490-493`; `backend/src/modules/ai/services/embeddings.service.ts:135-178`
- Problem: `findSimilarContent` returns embedding row IDs, which are used as email IDs in `search_emails`. Email lookup then fails or returns wrong results.
- Fix: Include `emailId` in the embedding similarity query (or use `metadata.emailId`) and use that ID in RRF and email fetch.
- Impact: Semantic email search returns empty or incorrect results.

### H3 - Bulk email actions can span providers
- Location: `backend/src/modules/ai/voltagent/tools/email.tools.ts:763,829,871`; `backend/src/modules/ai/voltagent/services/executors/bulk-email-executor.ts:76-91`
- Problem: Bulk queries select emails only by tenantId/folder, then executor chooses the provider from the first email and sends all IDs to that provider. Mixed-provider email sets will fail or be applied to the wrong provider.
- Fix: Partition emails by providerId and enqueue per provider, or add providerId filter at selection time.
- Impact: Bulk operations can partially fail or mutate the wrong mailbox.

### H4 - Contact schema mismatch across tools and services
- Location: `backend/src/modules/ai/voltagent/tools/contacts.tools.ts:240,274`; `backend/src/modules/ai/voltagent/services/executors/contact-executor.ts:47,87,210-237`; `backend/src/modules/ai/voltagent/services/attention-score.service.ts:455-456`; `backend/src/modules/ai/voltagent/services/relationship-intelligence.service.ts:1065-1086`; `backend/src/modules/ai/voltagent/jobs/crm-backfill.processor.ts:363-368`
- Problem: Tools create emails/phoneNumbers as `{ value, type }`, but executor stores string arrays. Downstream readers expect object form and fail to extract values.
- Fix: Standardize on one contact schema (object array preferred) and update executor + readers; migrate existing data.
- Impact: VIP detection, relationship scoring, and CRM backfill become unreliable.

## Medium

### M1 - Reply/forward payload mismatch
- Location: `backend/src/modules/ai/voltagent/tools/email.tools.ts:312-335,340-351`; `backend/src/modules/ai/voltagent/services/executors/email-executor.ts:89,138`
- Problem: Reply payload includes `replyAll` but executor ignores it; forward payload uses `additionalMessage` while executor expects `body`.
- Fix: Align payload contract or map fields in executor; implement replyAll handling.
- Impact: Replies/forwards may omit content or use incorrect recipients.

### M2 - Relationship graph ignores root contact emails
- Location: `backend/src/modules/ai/voltagent/services/relationship-intelligence.service.ts:939-963`
- Problem: `rootEmails` are computed but not used in the query. The CTE only checks for any interactions and can include unrelated contacts.
- Fix: Join `contact_interactions` by rootEmails or by the root contact ID to scope results.
- Impact: Relationship graphs include irrelevant contacts, lowering trust.

### M3 - CRM backfill scans only first 100 contacts
- Location: `backend/src/modules/ai/voltagent/jobs/crm-backfill.processor.ts:345`
- Problem: `findContactByEmail` loads 100 contacts max, missing matches for the majority of tenants.
- Fix: Query with JSON containment or normalize emails to a searchable table; paginate if needed.
- Impact: Interaction backfill is incomplete.

### M4 - Conversation management N+1 and weak tenant scoping
- Location: `backend/src/modules/ai/voltagent/services/conversation-management.service.ts:132-145,180,286,313`
- Problem: `listConversations` fetches up to 1000 messages per conversation (N+1). `get/update/deleteConversation` use conversationId only; tenant/user context is not enforced at this layer.
- Fix: Add a message-count API or cached counts; ensure memory calls are tenant/user scoped.
- Impact: High latency for users with many conversations; potential cross-tenant access if IDs collide.

### M5 - AI memory update/delete/usage not tenant scoped
- Location: `backend/src/modules/ai/voltagent/services/ai-memory.service.ts:223,270,391,398`
- Problem: Update/delete/recordUsage use only `id` in Prisma where clauses. `recordUsage` has no ownership checks.
- Fix: Use compound where clauses with tenantId/userId; add guard in recordUsage.
- Impact: Weak tenant isolation and potential misuse if memoryId is exposed.

### M6 - AgentPool cache invalidation mismatch
- Location: `backend/src/modules/ai/voltagent/services/agent-pool.service.ts:90,260`
- Problem: Cache key uses `userContext.email`, but invalidation uses `userId`. This misses keys during GDPR deletion.
- Fix: Normalize to a single canonical user key and use it for both cache key creation and invalidation.
- Impact: Stale cached agents after account deletion.

### M7 - Meeting prep performance and case mismatch
- Location: `backend/src/modules/ai/voltagent/services/meeting-prep.service.ts:287-300,423`
- Problem: Loads all contacts and filters in memory. Also compares `attendeeEmails` to lowercased attendees without normalizing the list.
- Fix: Query contacts by email in DB; normalize attendeeEmails to lowercase once.
- Impact: Slow meeting prep and missed attendee matches.

## Low

### L1 - Bulk delete "permanent" flag ignored
- Location: `backend/src/modules/ai/voltagent/services/executors/bulk-email-executor.ts:92`
- Problem: `operation` is set to `delete` regardless of `permanent` flag.
- Fix: Pass an explicit hard-delete operation when permanent is true.
- Impact: User intent not honored.

### L2 - Tool end logging at info level for all calls
- Location: `backend/src/modules/ai/voltagent/observability/hooks.ts:309`
- Problem: Every tool end event logs at info; high-volume for production workloads.
- Fix: Gate behind config flag or log only slow/error cases.
- Impact: Log noise and potential latency/cost increase.

### L3 - JSONB path filters on ActionQueue
- Location: `backend/src/modules/ai/voltagent/services/hitl.service.ts:231,412,460`; `backend/src/modules/ai/voltagent/services/episodic-memory.service.ts:42`
- Problem: Filtering on JSONB paths (agentName/sessionId) can cause full scans.
- Fix: Promote agentName/sessionId to indexed columns or add JSONB GIN indexes.
- Impact: Query latency grows with ActionQueue size.

### L4 - UnifiedKnowledgeService ignores sources option
- Location: `backend/src/modules/ai/voltagent/services/unified-knowledge.service.ts:98,115`
- Problem: `options.sources` is returned but not applied to retrieval; all sources are always queried.
- Fix: Pass the requested sources into `UnifiedRetriever` and filter retrieval.
- Impact: Unnecessary latency and irrelevant context.

### L5 - Document library agent cache invalidation ineffective
- Location: `backend/src/modules/ai/voltagent/services/document-library.service.ts:147,736,635`
- Problem: Agent cache key lacks tenantId but invalidation looks for tenantId in the key. Query cache keys also omit tenantId.
- Fix: Include tenantId in cache keys or use namespace-level invalidation.
- Impact: Stale cached agents; potential cross-tenant cache collisions.

### L6 - HybridRetriever unused (dead code)
- Location: `backend/src/modules/ai/voltagent/rag/hybrid-retriever.ts:64`; `backend/src/modules/ai/voltagent/rag/index.ts:11`
- Problem: No references to `HybridRetriever`; UnifiedRetriever is used instead.
- Fix: Remove or wire it into UnifiedRetriever; update docs accordingly.
- Impact: Maintenance overhead and confusion.

### L7 - Supervisor agent eagerly creates optional agents
- Location: `backend/src/modules/ai/voltagent/agents/supervisor.agent.ts:328-403`
- Problem: Optional agents are created whenever services are present, even if not used.
- Fix: Lazy-initialize optional agents on demand or consolidate as tool sets in the IntelligenceAgent.
- Impact: Unnecessary startup latency and memory use.

### L8 - Role casing mismatch for admin checks
- Location: `backend/src/modules/ai/voltagent/services/hitl.service.ts:866`; `backend/src/modules/ai/voltagent/voltagent.controller.ts:571`
- Problem: One path expects lowercase roles, the other uppercase.
- Fix: Normalize role casing at auth boundary or compare case-insensitively.
- Impact: Inconsistent admin authorization.

## Consolidation Opportunities (no functional loss)
- Merge optional agents (web search, analytics, document library) into IntelligenceAgent as tool groups, or lazy-load them in `supervisor.agent.ts` when invoked.
- Remove or integrate the unused `HybridRetriever` into `UnifiedRetriever` to reduce duplication.
- Unify action type definitions (AgentActionType, Prisma ActionType, HITL mapping) into a single source of truth to reduce drift.

## Notes / Assumptions
- Findings are based on static code inspection only (no provider tests run).
- Risk severity assumes tenant IDs are not globally unique across all entity IDs.
