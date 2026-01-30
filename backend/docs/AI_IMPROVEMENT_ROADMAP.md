# AI Improvement Roadmap (MailAgent)

**Date**: 2026-01-29  
**Source**: `backend/docs/ESEMPIO_FOLDER_FINDINGS.md` + repo audit

## Goals

- Improve retrieval accuracy, safety, and usability of AI flows.
- Reduce token/cost with targeted compaction and smarter prompts.
- Strengthen CRM intelligence and triage quality.
- Reuse existing Voltagent services/tools to avoid reinvention.
- Apply RLM patterns only where they outperform RAG.

## Guiding Constraints

- Multi-tenant isolation in all queries.
- Prefer existing patterns and services.
- Avoid new root-level docs (store under `backend/docs/`).
- No unsafe REPL execution in multi-tenant runtime.
- Do NOT store compaction summaries inside VoltAgent memory; keep them in a dedicated table.

---

## Phase 0: Baseline & Safety (Prompt Consistency)

**Why now**: Immediate impact, low risk, minimal dependencies.

### Deliverables

- Add `<self_check>` and `<thinking_process>` to system prompts.
- Add workflow examples to main agents (Supervisor, Unified, Actions, Intelligence).
- Ensure bulk safety module is consistently included for write/bulk intents.

### Files

- `backend/src/modules/ai/voltagent/prompts/*.prompt.ts`
- `backend/src/modules/ai/voltagent/prompts/shared.prompt.ts`
- `backend/src/modules/ai/voltagent/agents/unified.agent.ts`

### Notes

- Bulk thresholds currently exist in prompts, but not enforced by HITL logic.
- Actions prompt uses BULK_MODULE only in legacy export.

---

## Phase 1: Conversation Compaction (Cost + Quality)

**Why**: Docs reference a missing `ConversationCompactionService`.

### Deliverables

- Implement `ConversationCompactionService` (incremental re-summarization).
- Apply strict summarization guidelines (no filler, preserve chronology).
- Wire into chat context builder / conversation pipeline.
- Add RLM-style incremental update mode for very long threads (opt-in).
- Store compaction summaries in a dedicated table keyed by `tenantId + conversationId`.

### Files

- `backend/src/modules/ai/voltagent/services/conversation-compaction.service.ts` (new)
- `backend/src/modules/ai/voltagent/services/chat-context-builder.service.ts`
- Prompt updates in locales (summary guidelines)

---

## Phase 2: Search Query Builder (NL → Provider Query)

**Why**: Improve recall and user search accuracy.

### Deliverables

- Add `SearchQueryBuilderService` with multilingual patterns.
- Integrate into `search_emails` / Gmail/IMAP query builders.
- Include plural/synonym expansion rules.

### Files

- `backend/src/modules/ai/voltagent/services/search-query-builder.service.ts` (new)
- `backend/src/modules/ai/voltagent/tools/email.tools.ts`

---

## Phase 3: CRM Intelligence Enhancements

**Why**: Build on existing relationship intelligence.

### Deliverables

- Add response rate + average response time to contact stats.
- Add escalation priority field and logic in relationship service.
- Add company domain enrichment hook (optional external data source later).

### Files

- `backend/src/modules/ai/voltagent/services/relationship-intelligence.service.ts`
- Prisma schema updates (if storing new metrics)

---

## Phase 4: Auto-Labeling

**Why**: Improve inbox organization and triage automation.

### Deliverables

- Implement `AutoLabelingService` with labeling rules.
- Integrate with folder sync/triage pipeline.
- Guardrails to avoid system labels and personal names.

### Files

- `backend/src/modules/ai/voltagent/services/auto-labeling.service.ts` (new)
- `backend/src/modules/ai/voltagent/tools/folder.tools.ts`

---

## Phase 5: Writing Style Expansion (Optional)

**Why**: Higher quality personalization for replies.

### Deliverables

- Expand `WritingStyleService` metrics (toward 52-metric profile).
- Update prompts for compose/smart reply to consume richer style signals.

### Files

- `backend/src/modules/ai/voltagent/services/writing-style.service.ts`
- `backend/src/modules/ai/voltagent/tools/insights.tools.ts`

---

## Reuse-First Map (Voltagent)

**Use existing components before adding new ones.**

### Orchestration & Prompts

- Unified agent + dynamic tool loading: `backend/src/modules/ai/voltagent/agents/unified.agent.ts`
- Prompt modules: `backend/src/modules/ai/voltagent/prompts/*.prompt.ts`
- Shared safety modules: `backend/src/modules/ai/voltagent/prompts/shared.prompt.ts`

### Retrieval & Knowledge

- Hybrid RAG retriever: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`
- Unified knowledge service: `backend/src/modules/ai/voltagent/services/unified-knowledge.service.ts`
- Memory intelligence + rerank: `backend/src/modules/ai/voltagent/services/memory-intelligence.service.ts`

### Safety / HITL

- HITL service: `backend/src/modules/ai/voltagent/services/hitl.service.ts`
- Approval workflow: `backend/src/modules/ai/voltagent/workflows/approval.workflow.ts`
- Executors: `backend/src/modules/ai/voltagent/services/executors/*`

### CRM & Triage

- Attention score: `backend/src/modules/ai/voltagent/services/attention-score.service.ts`
- Relationship intelligence: `backend/src/modules/ai/voltagent/services/relationship-intelligence.service.ts`

### Tools (Reuse Instead of New APIs)

- Email: `backend/src/modules/ai/voltagent/tools/email.tools.ts`, `email-rlm.tools.ts`
- Insights: `backend/src/modules/ai/voltagent/tools/insights.tools.ts`
- Contacts/Calendar/Folders: `backend/src/modules/ai/voltagent/tools/*.tools.ts`

---

## RLM (Recurrent / Recursive LLM) Integration

**Source**: https://github.com/alexzhang13/rlm-minimal (conceptual reference)

### Where RLM Helps (Replace/augment custom logic)

- **Conversation compaction**: RLM-style “context as variable” for incremental updates on very long threads.
- **Deep document read**: Optional fallback for large documents when RAG misses context.
- **Offline analysis**: Batch jobs for “read everything and synthesize.”

### Where RLM Should NOT Replace Voltagent

- RAG retrieval and unified search (keep `unified-retriever.ts`).
- HITL workflows, approvals, and safety logic.
- Tool orchestration, agents, and multi-tenant safeguards.

### Integration Strategy (Safe by Default)

- **No direct exec REPL** in production runtime.
- If adopted, isolate RLM in a sandboxed worker or separate service.
- Keep RLM opt-in behind flags for high-context requests.

---

## Dependencies & Risks

- **ConversationCompactionService missing** blocks incremental summarization.
- Prompt changes should be staged and monitored (risk: regressions in tool use).
- Schema changes for CRM metrics require migration planning.
- New services should prefer existing tool/service hooks to avoid parallel implementations.
- RLM-style processing must be sandboxed; never run exec in tenant runtime.
- VoltAgent memory is not suitable for compaction summaries (tool parts + no metadata contract).

---

## Test Plan (per phase)

- **Phase 0**: Prompt snapshot + agent behavior sanity test.
- **Phase 1**: Conversation compaction script (`backend/scripts/test-p5-conversation-context.ts`).
- **Phase 2**: Search queries against real providers (Gmail/Microsoft scripts).
- **Phase 3**: CRM backfill + relationship score recalculation.
- **Phase 4**: Folder/label safety checks (system labels excluded).
- **Phase 5**: Style profile generation on sample user data.

---

## Success Metrics

- Lower LLM usage per conversation (compaction hit rate).
- Higher triage precision (fewer false positives).
- Improved search recall on ambiguous queries.
- Fewer HITL errors on bulk operations.
- Reduction in duplicate services (reuse-first compliance).
- Reliable long-context handling without degrading safety.
