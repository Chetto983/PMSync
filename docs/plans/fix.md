# VoltAgent Tools Audit

Date: 2026-01-22
Scope: backend/src/modules/ai/voltagent/tools/*.ts
Focus: bugs, race conditions, atomicity

## Summary
Reviewed VoltAgent tool implementations for correctness, tenant isolation, concurrency safety, and atomic behavior around data access, caching, and agent lifecycle management.

## Findings

### High
- Tenant scoping missing on attachments query in list_emails content mode. This violates the tenant-scoped query rule and can leak attachment metadata across tenants if IDs collide or are guessed.
  - File: backend/src/modules/ai/voltagent/tools/email.tools.ts
  - Area: list_emails -> mode "content" -> emailAttachment.findMany
  - Risk: cross-tenant data exposure

### Medium
- Agent creation race: concurrent requests can create multiple Mistral agents for the same tenant/locale. Only one is persisted; the others leak and are never cleaned.
  - Files: backend/src/modules/ai/voltagent/tools/analytics.tools.ts, backend/src/modules/ai/voltagent/tools/web-search.tools.ts
  - Area: getOrCreate*Agent
  - Risk: leaked agents, higher costs, inconsistent reuse

- Agent verification treats any error as "not found" and may delete valid DB records during transient outages.
  - Files: backend/src/modules/ai/voltagent/tools/analytics.tools.ts, backend/src/modules/ai/voltagent/tools/web-search.tools.ts
  - Area: verifyAgentExists
  - Risk: unnecessary agent recreation, lost DB records

- Tenant cleanup is not atomic: DB records are deleted even when remote deletion fails, leaving orphaned remote agents with no DB record to retry later.
  - Files: backend/src/modules/ai/voltagent/tools/analytics.tools.ts, backend/src/modules/ai/voltagent/tools/web-search.tools.ts
  - Area: deleteTenant*Agents
  - Risk: orphaned remote resources, billing/cost leakage

- Bulk actions build payloads from separate count and ID queries. The approval payload can imply full coverage while only a subset of IDs is included (due to take limits), and the snapshot is non-atomic.
  - File: backend/src/modules/ai/voltagent/tools/email.tools.ts
  - Area: bulk_email_actions for delete/empty_folder/archive/mark_read
  - Risk: mismatched approvals vs actual operations, inconsistent results

### Low
- System folder protection is name-based and case-sensitive; ignores canonical/specialUse/isSystem semantics. Some system folders could be renamed/deleted.
  - File: backend/src/modules/ai/voltagent/tools/folder.tools.ts
  - Area: manage_folder delete
  - Risk: policy bypass for system folders

- Folder matching is inconsistent across bulk actions (uppercasing equals vs contains/insensitive); can lead to no-op or incorrect targeting for IMAP paths.
  - File: backend/src/modules/ai/voltagent/tools/email.tools.ts
  - Area: bulk_email_actions archive/mark_read
  - Risk: unexpected behavior in mixed-case or nested folder names

## Recommendations (fix order)
1. Add tenantId to EmailAttachment query in list_emails content mode.
2. Add a distributed lock or DB-level guard to agent creation to ensure single agent per tenant/locale.
3. Differentiate transient errors vs "not found" in verifyAgentExists; only delete DB record on confirmed 404.
4. Make agent cleanup idempotent and only remove DB record after successful remote deletion (or track failure states for retry).
5. For bulk actions, either:
   - put the full query filters in the approval payload and let the executor re-query atomically, or
   - include all IDs in the payload and cap the count to the actual number of IDs included.
6. Use canonical folder metadata (specialUse/isSystem) for system folder protections and folder targeting logic.

## Open Questions
- Should bulk actions operate strictly on provided emailIds, or should the executor re-query by filter at execution time?
- Is system folder protection expected to be enforced only in tools, or also downstream (services/DB constraints)?

---

# AI Interface Deep Audit Roadmap (Update)

Date: 2026-01-22
Scope: backend/src/modules/ai/voltagent (agents, tools, memory, PII, chat)
Focus: safety, usability, PII handling, tenant isolation, reliability

## Key Risks (priority order)
### P0 (Critical)
- PII mapping key mismatch: storeMapping uses `pii:${tenantId}:${userId}` when conversationId is absent, while tool resolution uses `sessionId` (conversationId). This breaks rehydration and tool execution in many flows.
- Placeholder collision: redaction style `TYPE_LABEL` uses a single `[EMAIL_REDACTED]`, causing multiple emails to collapse to the same placeholder and resolve incorrectly.
- Tool LLM leakage: insights tools pass full email headers/body to Mistral without PII redaction, bypassing the chat redaction gate.
- Long-term memory extraction uses the original (non-redacted) message, storing PII in ai_memories + embeddings.

### P1 (High)
- Streaming responses output redacted placeholders and internal markers; no rehydration or output sanitization before sending to client.
- Conversation history cleanup is missing; existing stored messages remain polluted and appear in UI.

### P2 (Medium)
- Embeddings are generated from memory content; if memory contains PII, embeddings persist it long-term.
- Email insights prompts include raw headers by default; even partial redaction won’t prevent email disclosure.

## Roadmap (Proposed Fix Order)
1. **PII mapping correctness**
   - Use a single canonical `sessionId` for both `storeMapping` and `resolvePayload`.
   - Switch to unique placeholders (e.g., hash-based) to avoid collisions.
2. **LLM input hardening**
   - Apply redaction to all LLM inputs, including tool calls (insights tools, memory intelligence).
   - Add a shared redaction helper to avoid drift across call sites.
3. **User-visible output safety**
   - Sanitize all outputs for internal markers.
   - Rehydrate placeholders before sending to client (while storing redacted content in memory).
4. **Memory safety**
   - Ensure long-term memory extraction uses redacted input only.
   - Keep embeddings free of PII by redacting before storage.
5. **Cleanup**
   - One-time scrub of stored messages to remove internal markers and placeholders.

## Follow-Up Checklist
- [x] Verify PII store/resolve uses identical sessionId for chat + tools.
- [x] Unique placeholder strategy implemented (hash-based).
- [x] Tool LLM calls redacted (insights + memory intelligence).
- [x] Streaming output sanitized + rehydrated for user visibility.
- [x] Memory extraction uses redacted input (rehydrated before storage).
- [ ] Embeddings stay clean (memory embeddings still need redaction strategy).
- [ ] One-time cleanup run on existing stored conversations.

## Phase 1 Results (2026-01-22) - PII/LLM Hardening
- Added onPrepareMessages hook to strip internal markers before LLM calls.
- Switched PII redaction to unique hash placeholders and updated resolver pattern.
- Fixed PII sessionId mismatch (use canonical sessionId for store/resolve + HITL execution).
- Redacted insights + memory-intelligence LLM prompts; rehydrated outputs locally.
- Streaming output now sanitized and rehydrated before client delivery.
- Supervisor prompt updated to answer "what's my name?" from Current User Profile.
- Validation: `npx ts-node backend/scripts/validate-real-providers.ts` (6/6 passed).

---

# Storage Architecture Decision (Citus Primary + Redis Hot)

Date: 2026-01-22
Scope: AI + platform-wide storage strategy (no JSONB in query-path tables)
Goal: tenant-isolated scalability for 10k+ users with durable storage and safe PII handling.

## Decision
- Citus/Postgres is the system of record for all durable data.
- Redis is used for hot/session data only (PII placeholder maps, caches, HITL state).
- Object storage (MinIO/S3) holds large/raw payloads not required for query-path behavior.

## Core Principles
- All tenant-scoped tables must be distributed by a common tenant_id column.
- Cross-tenant small tables should be reference tables.
- Replace JSON/JSONB arrays with normalized child tables.
- PII is stored in DB/Redis but redacted only for LLM calls; tools always use raw data.

## Roadmap (Phased)
### Phase 0: Audit + Instrumentation (Now)
- Add storage audit debugger script.
- Inventory JSON/JSONB columns and usage hotspots.
- Validate Citus distribution coverage for all tenant-scoped tables.
- Inventory Redis keyspace for PII and cache domains.

### Phase 1: VoltAgent Memory Normalization
- New tables for messages/parts/tool calls (no JSONB in query path).
- Dual-write from current memory tables + backfill for existing conversations.
- Cutover read-path to normalized tables with compatibility fallback.

### Phase 2: HITL + Tool Payload Normalization
- Store tool arguments/results in typed tables.
- Move large payloads to object storage with DB pointers.
- Ensure tenant-scoped query filters for all tool traces.

### Phase 3: Domain Models (Contacts/Email/Calendar)
- Split JSON arrays into child tables (emails, phones, attendees, attachments, headers).
- Backfill + dual-write + cutover for each domain with per-tenant validation.

### Phase 4: Cleanup + Deletion of JSONB Columns
- Enforce DB constraints to block JSON/JSONB in query-path tables.
- Remove legacy JSONB columns and update Prisma schema.

### Phase 5: Performance + Safety Validation
- Citus distribution validation for all tenant-scoped tables.
- Redis hot-path validation for PII placeholder mapping.
- Run e2e AI tests + real provider tests.

## Phase 0 Checklist
- [ ] Run `npx ts-node backend/scripts/debug-voltagent-storage.ts`.
- [ ] Review JSON/JSONB inventory and top offenders.
- [ ] Verify Citus distribution for tenant-scoped tables.
- [ ] Verify Redis keyspace isolation for PII/cache.

## Phase 0 Results (2026-01-22)
- Script run: `npx ts-node backend/scripts/debug-voltagent-storage.ts`
- JSON/JSONB columns detected in 21 tables (key offenders: emails, unified_contacts, calendar_events, voltagent_memory_*).
- VoltAgent memory rows: conversations=5, messages=116, steps=57.
- Citus distribution: 0 distributed tables detected; 44 tenant-scoped tables require distribution (includes users, emails, unified_contacts, calendar_events, ai_memories, embeddings).
- Redis keyspace: 858 keys; top prefixes are Bull queue keys (ai follow-ups, webhooks, embeddings, sync, daily-briefing).
- Warnings: DB_PASSWORD weak; MinIO default credentials in use (non-prod OK, must rotate before production).
- Real provider validation (tenant with Google+Microsoft+IMAP): 6/6 tests passed, queues and locks healthy, data present across 3 providers.
