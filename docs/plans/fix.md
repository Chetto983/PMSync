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
