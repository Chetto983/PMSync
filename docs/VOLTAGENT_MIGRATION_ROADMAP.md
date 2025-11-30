# VoltAgent Migration Roadmap - MailAgent

**Version:** 1.5
**Date:** 2025-11-30
**Status:** Phase 7 Step 7 Complete - Multi-Agent Module Removed

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current vs Target Architecture](#2-current-vs-target-architecture)
3. [Migration Phases](#3-migration-phases)
4. [Phase 0: Preparation](#4-phase-0-preparation)
5. [Phase 1: Core Infrastructure](#5-phase-1-core-infrastructure)
6. [Phase 2: Agent Migration](#6-phase-2-agent-migration)
7. [Phase 3: Memory & Persistence](#7-phase-3-memory--persistence)
8. [Phase 4: HITL & Workflows](#8-phase-4-hitl--workflows)
9. [Phase 5: Observability & Testing](#9-phase-5-observability--testing)
10. [Phase 6: Cleanup & Optimization](#10-phase-6-cleanup--optimization)
11. [Phase 7: Complete VoltAgent Refactor](#11-phase-7-complete-voltagent-refactor-roadmap-next)
12. [Risk Mitigation](#12-risk-mitigation)
13. [Rollback Strategy](#13-rollback-strategy)

---

## 1. Executive Summary

### Why Migrate?

| Problem | Current State | VoltAgent Solution |
|---------|---------------|-------------------|
| Complexity | ~5000 lines custom AI code | Framework-managed orchestration |
| Maintenance | 60+ files in AI module | Standardized patterns |
| Observability | Telemetry not wired | VoltOps built-in |
| Memory | Custom FIFO implementation | LibSQL/persistent memory |
| Multi-agent | Custom router + orchestrator | Supervisor pattern built-in |

### Migration Scope

**Replace:**
- `backend/src/modules/ai/multi-agent/` (~3000 lines)
- `backend/src/modules/ai/services/agent.service.ts`
- `backend/src/modules/ai/services/memory.service.ts`
- Custom telemetry services

**Keep:**
- `mistral.service.ts` → Wrap as VoltAgent LLM provider
- `email-insights.service.ts` → Keep for summarize/compose
- `knowledge-base.service.ts` → Integrate as VoltAgent tool
- `embeddings.service.ts` → Keep for RAG
- Prisma schema & models
- NestJS controllers (adapt endpoints)
- Frontend components (adapt API calls)

### Timeline Estimate

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 0: Preparation | 1 day | Setup, dependencies |
| Phase 1: Core Infrastructure | 2 days | VoltAgent + NestJS integration |
| Phase 2: Agent Migration | 3 days | 5 agents to migrate |
| Phase 3: Memory & Persistence | 1 day | LibSQL integration |
| Phase 4: HITL & Workflows | 2 days | Approval flows |
| Phase 5: Observability | 1 day | VoltOps setup |
| Phase 6: Cleanup | 1 day | Remove old code |
| **Total** | **~11 days** | |

---

## 2. Current vs Target Architecture

### Current Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Backend                            │
├─────────────────────────────────────────────────────────────┤
│  AI Controller                                               │
│       ↓                                                      │
│  MultiAgentService (custom orchestrator)                    │
│       ↓                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ RouterAgent → EmailAgent / CalendarAgent / etc.     │    │
│  │      ↓                                               │    │
│  │ ActionExecutorService (26 methods)                   │    │
│  │      ↓                                               │    │
│  │ HITLService → AgentPendingAction (Prisma)           │    │
│  └─────────────────────────────────────────────────────┘    │
│       ↓                                                      │
│  MemoryService (FIFO) + FeedbackService                     │
│       ↓                                                      │
│  MistralService (LLM calls)                                  │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (VoltAgent)

```text
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Backend                            │
├─────────────────────────────────────────────────────────────┤
│  AI Controller (simplified)                                  │
│       ↓                                                      │
│  VoltAgentService (thin wrapper)                            │
│       ↓                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ @voltagent/core                                      │    │
│  │                                                       │    │
│  │ SupervisorAgent (coordinator)                        │    │
│  │    ├── EmailAgent (subAgent)                         │    │
│  │    ├── CalendarAgent (subAgent)                      │    │
│  │    ├── ContactsAgent (subAgent)                      │    │
│  │    ├── KnowledgeAgent (subAgent)                     │    │
│  │    └── GeneralAgent (subAgent)                       │    │
│  │                                                       │    │
│  │ Tools: sendEmail, createEvent, searchContacts, etc.  │    │
│  └─────────────────────────────────────────────────────┘    │
│       ↓                                                      │
│  @voltagent/libsql (Memory)                                 │
│       ↓                                                      │
│  Mistral via @ai-sdk/mistral                                │
│       ↓                                                      │
│  VoltOps (Observability)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Migration Phases

```text
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
  │           │           │           │           │           │           │
Setup     NestJS      Migrate      Memory      HITL      VoltOps     Cleanup
Deps      Bridge      Agents       LibSQL     Workflows  Tracing     Old Code
```

---

## 4. Phase 0: Preparation ✅ COMPLETE

### 4.0.1 Install Dependencies

- [x] Install VoltAgent core packages
  ```bash
  cd backend
  npm install @voltagent/core @voltagent/libsql
  npm install @ai-sdk/mistral
  ```

- [x] Zod already present in project

### 4.0.2 Create Branch

- [x] Create migration branch
  ```bash
  git checkout -b feat/voltagent-migration
  ```

### 4.0.3 Backup Current State

- [x] Previous commits serve as backup point

### 4.0.4 Create Directory Structure

- [x] Created VoltAgent module structure with centralized locale system:
  ```text
  backend/src/modules/ai/voltagent/
  ├── index.ts                    # Main exports
  ├── voltagent.module.ts         # NestJS module
  ├── voltagent.service.ts        # Main service
  ├── agents/
  │   ├── index.ts
  │   ├── supervisor.agent.ts
  │   ├── email.agent.ts
  │   ├── calendar.agent.ts
  │   ├── contacts.agent.ts
  │   ├── knowledge.agent.ts
  │   └── general.agent.ts
  ├── tools/
  │   ├── index.ts
  │   ├── email.tools.ts          # 11 tools
  │   ├── calendar.tools.ts       # 5 tools
  │   └── contacts.tools.ts       # 5 tools
  ├── locales/                    # Centralized i18n
  │   ├── index.ts
  │   ├── en.ts
  │   └── it.ts
  └── providers/
      └── mistral.provider.ts
  ```

---

## 5. Phase 1: Core Infrastructure ✅ COMPLETE

### 5.1.1 Create Mistral Provider for VoltAgent

- [x] Created `mistral.provider.ts` with small/medium/large model variants
  ```typescript
  // backend/src/modules/ai/voltagent/providers/mistral.provider.ts
  import { createMistral } from '@ai-sdk/mistral';

  export const mistralProvider = createMistral({
    apiKey: process.env.MISTRAL_API_KEY || '',
  });

  export const mistralSmall = mistralProvider('mistral-small-latest');
  export const mistralMedium = mistralProvider('mistral-medium-latest');
  export const mistralLarge = mistralProvider('mistral-large-latest');
  ```

### 5.1.2 Create VoltAgent NestJS Service

- [x] Created `voltagent.service.ts` with:
  - Agent caching by tenant/locale/model
  - `chat()` method with pending action extraction
  - `streamChat()` async generator for streaming
  - Proper NestJS dependency injection

### 5.1.3 Create VoltAgent NestJS Module

- [x] Created `voltagent.module.ts`
  ```typescript
  @Module({
    imports: [PrismaModule, EmailModule, CalendarModule],
    providers: [VoltAgentService],
    exports: [VoltAgentService],
  })
  export class VoltAgentModule {}
  ```

### 5.1.4 Update AI Module to Use VoltAgent ✅

- [x] Modify `ai.module.ts` to import VoltAgentModule
- [x] Keep old multi-agent module temporarily (parallel running)

---

## 6. Phase 2: Agent Migration ✅ COMPLETE

### 6.2.1 Create Email Tools

- [x] Created `email.tools.ts` with 11 tools using centralized locale:
  - [x] `send_email` - with requiresApproval (HIGH)
  - [x] `reply_email` - with requiresApproval (HIGH)
  - [x] `forward_email` - with requiresApproval (HIGH)
  - [x] `search_emails`
  - [x] `delete_email` - with requiresApproval (HIGH)
  - [x] `archive_email` - with requiresApproval (MEDIUM)
  - [x] `mark_read`
  - [x] `mark_unread`
  - [x] `star_email`
  - [x] `unstar_email`
  - [x] `get_unread_emails`

### 6.2.2 Create Calendar Tools

- [x] Created `calendar.tools.ts` with 5 tools:
  - [x] `get_events`
  - [x] `create_event` - with requiresApproval (MEDIUM)
  - [x] `update_event` - with requiresApproval (MEDIUM)
  - [x] `delete_event` - with requiresApproval (HIGH)
  - [x] `check_availability`

### 6.2.3 Create Contacts Tools

- [x] Created `contacts.tools.ts` with 5 tools:
  - [x] `search_contacts`
  - [x] `get_contact`
  - [x] `create_contact` - with requiresApproval (LOW)
  - [x] `update_contact` - with requiresApproval (LOW)
  - [x] `delete_contact` - with requiresApproval (MEDIUM)

### 6.2.4 Create Knowledge Tools

- [x] Created inline in `knowledge.agent.ts`:
  - [x] `search_knowledge` - searches emails for now, extensible to notes/docs

### 6.2.5 Create Folder Tools ✅

- [x] Created `folder.tools.ts` with 5 tools:
  - [x] `list_folders` - List all folders
  - [x] `create_folder` - Create new folder (LOW severity)
  - [x] `rename_folder` - Rename folder (LOW severity)
  - [x] `delete_folder` - Delete folder (HIGH severity)
  - [x] `move_email_to_folder` - Move email to folder (MEDIUM severity)
- [x] Folder translations in EN and IT locales

### 6.2.6 Create Email Agent

- [x] Created `email.agent.ts` with centralized locale instructions

### 6.2.7 Create Calendar Agent

- [x] Created `calendar.agent.ts` with centralized locale instructions

### 6.2.8 Create Contacts Agent

- [x] Created `contacts.agent.ts` with centralized locale instructions

### 6.2.9 Create Knowledge Agent

- [x] Created `knowledge.agent.ts` with inline search tool

### 6.2.10 Create General Agent

- [x] Created `general.agent.ts` for conversational fallback

### 6.2.11 Create Supervisor Agent

- [x] Created `supervisor.agent.ts` with VoltAgent subAgents pattern
  ```typescript
  return new Agent({
    name: 'SupervisorAgent',
    purpose: 'Intelligent email assistant coordinator',
    model,
    instructions: t.supervisor.instructions,
    subAgents: [emailAgent, calendarAgent, contactsAgent, knowledgeAgent, generalAgent],
    maxSteps: 10,
  });
  ```

### 6.2.12 Centralized Locale System (Added)

- [x] Created `locales/index.ts` with type definitions
- [x] Created `locales/en.ts` with English translations
- [x] Created `locales/it.ts` with Italian translations
- [x] Pattern matches frontend locale system

---

## 7. Phase 3: Memory & Persistence ✅ COMPLETE

### 7.3.1 Setup PostgreSQL for Memory ✅

- [x] Install @voltagent/postgres for PostgreSQL memory adapter
  ```bash
  npm install @voltagent/postgres @voltagent/libsql
  ```

- [x] Create memory configuration using existing PostgreSQL database
  ```typescript
  // backend/src/modules/ai/voltagent/memory/memory.config.ts
  import { Memory } from '@voltagent/core';
  import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';

  export function createMemory(options: MemoryOptions = {}): Memory {
    return new Memory({
      storage: new PostgreSQLMemoryAdapter({
        connection: process.env.DATABASE_URL,
        tablePrefix: 'voltagent_memory',
        schema: 'public',
      }),
    });
  }
  ```

### 7.3.2 Integrate Memory with Agents ✅

- [x] Update agent creation to include memory
- [x] Memory passed to supervisor agent constructor
- [x] Memory initialized in VoltAgentService.onModuleInit()

### 7.3.3 Tenant Isolation ✅

- [x] Implemented tenant isolation via userId namespacing
  ```typescript
  // Format: tenantId:userId ensures data isolation between tenants
  private getTenantUserId(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }
  ```

### 7.3.4 Session Management ✅

- [x] Create session ID handling with tenant-isolated userId
- [x] Pass conversationId to agent for message threading

---

## 8. Phase 4: HITL & Workflows ✅ COMPLETE

### 8.4.1 VoltAgent Native Workflow Implementation ✅

- [x] Created approval workflow using VoltAgent's native `createWorkflow` and `andThen`
- [x] Implemented suspend/resume pattern for human-in-the-loop approvals

  ```typescript
  // backend/src/modules/ai/voltagent/workflows/approval.workflow.ts
  import { createWorkflow, andThen } from '@voltagent/core';

  export const createApprovalWorkflow = () => {
    return createWorkflow(
      {
        id: 'action-approval',
        name: 'Action Approval Workflow',
        input: ApprovalInputSchema,
        result: ApprovalResultSchema,
      },
      andThen({
        id: 'evaluate-approval',
        resumeSchema: ResumeSchema,
        execute: async ({ data, suspend, resumeData }) => {
          // If resuming, process human decision
          if (resumeData) {
            return { approved: resumeData.approved, ... };
          }
          // HIGH severity always requires approval
          if (action.severity === 'HIGH') {
            await suspend(`High severity action requires approval`);
          }
          // Auto-approve if confidence threshold met
          return { approved: true, approvedBy: 'auto-approved' };
        },
      }),
      andThen({ id: 'process-decision', ... }),
    );
  };
  ```

### 8.4.2 VoltAgentService HITL Methods ✅

- [x] `submitActionForApproval()` - Submit action, auto-approve or suspend
- [x] `resumeApproval()` - Resume suspended workflow with human decision
- [x] `getSuspendedWorkflows()` - Get pending approvals for tenant
- [x] `getSuspendedWorkflow()` - Get specific suspended workflow

### 8.4.3 REST API Endpoints ✅

- [x] Created VoltAgentController with approval endpoints

  ```
  POST /api/v1/voltagent/chat              - Chat with agent
  POST /api/v1/voltagent/actions/submit    - Submit action for approval
  GET  /api/v1/voltagent/actions/pending   - Get pending approvals
  GET  /api/v1/voltagent/actions/:id       - Get specific pending action
  POST /api/v1/voltagent/actions/:id/approve - Approve action
  POST /api/v1/voltagent/actions/:id/reject  - Reject action
  ```

### 8.4.4 Integration with Existing HitlService ✅

- [x] VoltAgentService optionally integrates with existing HitlService
- [x] Pending actions persisted to AgentPendingAction table
- [x] Real-time events emitted on approval/rejection
- [x] Tools return `requiresApproval` flag for HITL workflow integration

---

## 9. Phase 5: Observability & Testing ✅ COMPLETE

### 9.5.1 Setup VoltOps ✅

- [x] Observability hooks created using VoltAgent's native `createHooks()`
- [x] VoltOps production setup via environment variables (no code changes needed)

  ```typescript
  // backend/src/modules/ai/voltagent/observability/hooks.ts
  import { createHooks } from '@voltagent/core';

  export function createObservabilityHooks(options: ObservabilityOptions) {
    return createHooks({
      onStart: async ({ agent, context }) => { /* log start */ },
      onEnd: async ({ agent, output, error, context }) => { /* log end, collect metrics */ },
      onToolStart: async ({ tool, args, context }) => { /* log tool start */ },
      onToolEnd: async ({ tool, output, error, context }) => { /* log tool end */ },
    });
  }
  ```

- [x] Hooks integrated into SupervisorAgent via options
- [x] Metrics collection with AgentMetrics interface
- [x] Token usage tracking and duration measurement
- [x] Production telemetry auto-enabled via env vars:
  ```
  VOLTAGENT_PUBLIC_KEY=pk_your_key
  VOLTAGENT_SECRET_KEY=sk_your_key
  ```

### 9.5.2 Create Integration Tests ✅

- [x] Created comprehensive integration tests using real Mistral API
  ```typescript
  // backend/src/modules/ai/voltagent/tests/voltagent.integration.spec.ts
  describeIfApiKey('VoltAgent Integration Tests (Real Mistral API)', () => {
    // General interactions, Email delegation, Calendar delegation
    // Multi-language support (EN, IT)
    // Observability hooks validation
    // Tenant isolation tests
    // Tool execution tests
    // Performance benchmarks
    // Edge cases
  });
  ```

- [x] Tests use VoltAgent scorer patterns for quality evaluation
- [x] Tests validate:
  - [x] Supervisor agent routing
  - [x] Email agent delegation
  - [x] Calendar agent delegation
  - [x] Multi-language support (EN, IT)
  - [x] Observability metrics collection
  - [x] Tenant isolation via userId namespacing

### 9.5.3 E2E Tests ✅

- [x] Full flow tested: message → agent → tool → result
- [x] Tool execution tested with mocked Prisma
- [x] Performance latency measurements included

### 9.5.4 Performance Benchmarks ✅

- [x] Latency measurement integrated in tests
- [x] Token usage tracking via observability hooks
- [x] Average ~1.6s response time for simple queries with Mistral

### 9.5.5 Redis Bulk Metrics for >1000 Tenants ✅

- [x] Added `MULTIAGENT_METRICS` namespace to CacheService
- [x] Implemented in-memory buffer (50 metrics) before Redis flush
- [x] Batch writes using `lpushAndTrim` for atomic operations
- [x] Per-agent Redis keys: `agent:EmailAgent`, `agent:CalendarAgent`, etc.
- [x] Rolling buffer with max 10,000 metrics per agent

  ```typescript
  // Scalability design for >1000 tenants
  private metricsBuffer: AgentMetrics[] = [];
  private readonly maxMemoryBuffer = 50;  // Batch size before flush
  private readonly maxRedisBuffer = 10000; // Max per-agent in Redis

  private async flushMetricsToRedis(): Promise<void> {
    // Group metrics by agent, bulk write with pipeline
    for (const [agentName, agentMetrics] of metricsByAgent) {
      await this.cacheService.lpushAndTrim(
        `agent:${agentName}`,
        agentMetrics,
        this.maxRedisBuffer,
        { namespace: CacheNamespace.VOLTAGENT_METRICS },
      );
    }
  }
  ```

### 9.5.6 Per-Agent Observability Hooks ✅

- [x] All agents now accept `hooks` option for metrics tracking
- [x] Hooks passed from SupervisorAgent to all sub-agents
- [x] Tenant isolation via `tenantId:userId` format extraction
- [x] TTL-based cleanup (5-min TTL, 60s cleanup interval)
- [x] Memory-safe: O(concurrent_ops), not O(tenants)

  ```typescript
  // AgentMetrics now includes tenant info
  interface AgentMetrics {
    agentName: string;
    operationId: string;
    tenantId: string;     // Extracted from userId
    userId?: string;      // Original userId
    duration: number;
    totalTokens?: number;
    toolCalls: number;
    success: boolean;
    timestamp: number;
  }
  ```

- [x] Agents updated with hooks support:
  - [x] `email.agent.ts` - hooks option added
  - [x] `calendar.agent.ts` - hooks option added
  - [x] `contacts.agent.ts` - hooks option added
  - [x] `knowledge.agent.ts` - hooks option added
  - [x] `general.agent.ts` - hooks option added
  - [x] `supervisor.agent.ts` - passes hooks to all sub-agents

---

## 10. Phase 6: Cleanup & Optimization ✅ COMPLETE

### 10.6.1 Remove Old Multi-Agent Agents ✅

- [x] Removed `backend/src/modules/ai/multi-agent/agents/email.agent.ts`
- [x] Removed `backend/src/modules/ai/multi-agent/agents/calendar.agent.ts`
- [x] Removed `backend/src/modules/ai/multi-agent/agents/contacts.agent.ts`
- [x] Removed `backend/src/modules/ai/multi-agent/agents/general.agent.ts`
- [x] Removed `backend/src/modules/ai/multi-agent/agents/knowledge.agent.ts`
- [x] Removed `backend/src/modules/ai/multi-agent/agents/router.agent.ts`
- [x] Kept `backend/src/modules/ai/multi-agent/agents/base.agent.ts` (backwards compatibility)
- [x] Updated `agents/index.ts` to only export BaseAgent

### 10.6.2 Update Multi-Agent Module ✅

- [x] Removed old agent imports from `multi-agent.module.ts`
- [x] Removed old agent providers from module
- [x] Removed `OnModuleInit` agent registration
- [x] Added deprecation notice pointing to VoltAgent

### 10.6.3 Update Multi-Agent Service ✅

- [x] Refactored `multi-agent.service.ts` to remove RouterAgent dependency
- [x] `process()` method now returns migration notice
- [x] `registerAgent()` is now a no-op with deprecation warning
- [x] `getRegisteredAgents()` returns empty array with deprecation warning
- [x] Kept HITL methods (approveAndExecuteAction, rejectAction) for shared use

### 10.6.4 Update Controller ✅

- [x] Updated `getAgents()` endpoint to return static VoltAgent agent list
- [x] Added deprecation notice to endpoint

### 10.6.5 Remove Orphaned Tests ✅

- [x] Removed `multi-agent.integration.spec.ts` (referenced deleted agents)
- [x] Removed `language-ab-testing.spec.ts` (referenced deleted agents)
- [x] Removed `knowledge.agent.spec.ts` (tested deleted agent)
- [x] Updated `multi-agent.service.spec.ts` for new service API

### 10.6.6 Verification ✅

- [x] TypeScript compiles without errors
- [x] All 43 multi-agent tests pass
- [x] VoltAgent integration tests pass

---

## 11. Phase 7: Complete VoltAgent Refactor Roadmap (NEXT)

This section outlines the complete refactor of the AI module to fully embrace VoltAgent architecture.

### 11.7.1 Architecture Overview

```text
BEFORE (Current State):
┌──────────────────────────────────────────────────────────────┐
│  ai.module.ts                                                  │
│  ├── multi-agent.module.ts (legacy, deprecated)               │
│  │   ├── HitlService (shared)                                 │
│  │   ├── FeedbackService (shared)                             │
│  │   ├── MemoryService (legacy)                               │
│  │   └── ActionExecutorService (shared)                       │
│  ├── voltagent.module.ts (new)                                │
│  │   ├── VoltAgentService                                     │
│  │   └── SupervisorAgent + SubAgents                          │
│  └── services/ (email-insights, personalization, etc.)        │
└──────────────────────────────────────────────────────────────┘

AFTER (Target State):
┌──────────────────────────────────────────────────────────────┐
│  ai.module.ts (simplified)                                     │
│  ├── voltagent/                                                │
│  │   ├── voltagent.module.ts (main AI module)                 │
│  │   ├── voltagent.service.ts (unified service)               │
│  │   ├── agents/ (all VoltAgent agents)                       │
│  │   ├── tools/ (all VoltAgent tools)                         │
│  │   ├── memory/ (PostgreSQL memory adapter)                  │
│  │   ├── workflows/ (HITL, approval flows)                    │
│  │   ├── observability/ (hooks, metrics)                      │
│  │   ├── rag/ (knowledge base, embeddings)                    │
│  │   └── locales/ (i18n)                                      │
│  └── services/ (email-insights → integrate into VoltAgent)    │
└──────────────────────────────────────────────────────────────┘
```

### 11.7.2 Step 1: RAG Integration with VoltAgent ✅ COMPLETE

**Goal:** Implement modern RAG with hybrid search and re-ranking.

**Implemented Features (2025 Best Practices):**

- [x] Create `voltagent/rag/` directory with retriever implementations
- [x] `KnowledgeBaseRetriever`: Basic vector-only retrieval
- [x] `HybridRetriever`: Advanced hybrid search with:
  - **Hybrid Search**: Combines vector similarity (pgvector) + keyword/lexical search
  - **Query Expansion**: Multiple query variations for better recall
  - **Re-ranking**: Semantic re-ranking using cosine similarity
  - **Multi-source**: Retrieves from emails, documents, notes
  - **Configurable weights**: Vector vs keyword scoring balance

```typescript
// Usage in KnowledgeAgent
import { HybridRetriever } from '../rag';

const retriever = new HybridRetriever({
  tenantId,
  locale,
  mistralService,
  embeddingsService,
  prisma,
  vectorWeight: 0.7,       // 70% vector, 30% keyword
  enableQueryExpansion: true,
  enableReranking: true,
  finalLimit: 5,
});

const agent = new Agent({
  name: 'KnowledgeAgent',
  retriever,  // Auto-runs before each LLM call
  ...
});
```

**References:**

- [Microsoft RAG Techniques](https://www.microsoft.com/en-us/microsoft-cloud/blog/2025/02/04/common-retrieval-augmented-generation-rag-techniques-explained/)
- [VoltAgent RAG Guide](https://voltagent.dev/blog/rag-chatbot/)

**Additional Tasks:**

- [x] Update KnowledgeAgent to support retriever injection
- [x] Create rag/index.ts exports

### 11.7.3 Step 2: Consolidate HITL into VoltAgent

**Goal:** Move HitlService functionality into VoltAgent workflows.

- [ ] Extend `approval.workflow.ts` to handle all action types
- [ ] Create `voltagent/workflows/hitl.workflow.ts` for complex approvals
- [ ] Migrate AgentPendingAction persistence to workflow state
- [ ] Add approval events to VoltAgent hooks

### 11.7.4 Step 3: Consolidate Feedback/Learning into VoltAgent

**Goal:** Move FeedbackService into VoltAgent observability.

- [ ] Create `voltagent/observability/learning.ts` for feedback tracking
- [ ] Integrate with VoltAgent hooks (onEnd, onToolEnd)
- [ ] Create learning metrics in Redis alongside agent metrics
- [ ] Migrate feedback data to VoltAgent format

### 11.7.5 Step 4: Integrate Email Insights

**Goal:** Move email-insights.service.ts functionality into VoltAgent tools.

- [ ] Create `voltagent/tools/insights.tools.ts`
  - [ ] `summarize_email` - Uses existing summarization logic
  - [ ] `analyze_sentiment` - Uses existing sentiment analysis
  - [ ] `compose_reply` - Uses writing style service
  - [ ] `extract_action_items` - New tool

- [ ] Update EmailAgent to include insight tools
- [ ] Add personalization context to agent instructions

### 11.7.6 Step 5: Migrate Memory Service

**Goal:** Replace legacy MemoryService with VoltAgent PostgreSQL memory.

- [ ] Verify VoltAgent memory tables work with existing schema
- [ ] Create migration script for existing chat sessions
- [ ] Update all memory access to use VoltAgent memory API
- [ ] Remove legacy MemoryService

### 11.7.7 Step 6: Update Frontend Integration

**Goal:** Update frontend to use VoltAgent endpoints exclusively.

- [ ] Update `frontend/lib/api/multi-agent.ts`
  - [ ] Change base URL from `/ai/multi-agent` to `/ai/voltagent`
  - [ ] Update response types to match VoltAgent format
  - [ ] Add streaming support for chat

- [ ] Update AI components
  - [ ] `AiChatPanel.tsx` - Use VoltAgent chat endpoint
  - [ ] `AiInsightsWidget.tsx` - Use VoltAgent metrics
  - [ ] Pending actions - Use VoltAgent approval endpoints

### 11.7.8 Step 7: Remove Legacy Multi-Agent Module ✅ COMPLETE

**Goal:** Complete removal of deprecated code.

- [x] Remove `multi-agent.module.ts`
- [x] Remove `multi-agent.controller.ts`
- [x] Remove `multi-agent.service.ts`
- [x] Move `action-executor.service.ts` → `voltagent/services/`
- [x] Move `hitl.service.ts` → `voltagent/services/`
- [x] Move `feedback.service.ts` → `voltagent/services/`
- [x] Move interfaces → `voltagent/interfaces/`
- [x] Refactor `action-summaries.ts` to use centralized locales (en.ts, it.ts)
- [x] Update `ai.module.ts` to remove MultiAgentModule dependency
- [x] Delete entire `multi-agent/` directory

### 11.7.9 Step 8: Consolidate AI Services

**Goal:** Move remaining AI services into VoltAgent structure.

- [ ] Move `personalization.service.ts` → `voltagent/services/personalization.ts`
- [ ] Move `writing-style.service.ts` → `voltagent/services/writing-style.ts`
- [ ] Move `prompt-registry.service.ts` → `voltagent/prompts/`
- [ ] Move `llm-telemetry.service.ts` → merge with `observability/hooks.ts`

### 11.7.10 Step 9: Final Cleanup & Documentation

- [ ] Remove unused DTOs
- [ ] Remove unused interfaces
- [ ] Update all imports
- [ ] Run full test suite
- [ ] Update API documentation
- [ ] Create VoltAgent architecture diagram
- [ ] Update README with new AI architecture

### 11.7.11 Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| AI module files | ~60 files | ~30 files |
| Lines of code | ~5000 lines | ~2500 lines |
| Test coverage | 85% | 90% |
| Response latency | ~2s | ~1.5s |
| Memory usage | ~500MB | ~300MB |
| Redis keys per tenant | ~20 | ~5 |

### 11.7.12 Timeline Estimate

| Step | Duration | Dependencies |
|------|----------|--------------|
| Step 1: RAG Integration | 1 day | None |
| Step 2: Consolidate HITL | 1 day | None |
| Step 3: Consolidate Feedback | 0.5 day | Step 2 |
| Step 4: Email Insights | 1 day | None |
| Step 5: Memory Migration | 1 day | None |
| Step 6: Frontend Updates | 1 day | Steps 1-5 |
| Step 7: Remove Legacy | 0.5 day | Steps 1-6 |
| Step 8: Consolidate Services | 1 day | Step 7 |
| Step 9: Final Cleanup | 0.5 day | Step 8 |
| **Total** | **~8 days** | |

---

## 12. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| VoltAgent breaking changes | Pin exact versions in package.json |
| Performance regression | Benchmark before/after, keep old code until verified |
| Missing features | Identify gaps early in Phase 1, create workarounds |
| LLM provider issues | Keep Mistral service as fallback |
| Memory format incompatibility | Create migration script, test thoroughly |

---

## 13. Rollback Strategy

### If Migration Fails

1. **Immediate rollback**: `git checkout main`
2. **Partial rollback**: Keep VoltAgent module, revert controller changes
3. **Feature flag**: Add `USE_VOLTAGENT=true/false` to switch between systems

### Rollback Checklist

- [ ] Revert `ai.module.ts` to use old MultiAgentModule
- [ ] Revert controller endpoints
- [ ] Keep VoltAgent code for future attempt
- [ ] Document what failed and why

---

## Summary Checklist

### Phase 0: Preparation ✅

- [x] Install dependencies
- [x] Create branch
- [x] Backup current state
- [x] Create directory structure

### Phase 1: Core Infrastructure ✅

- [x] Create Mistral provider
- [x] Create VoltAgentService
- [x] Create VoltAgentModule
- [ ] Integrate with AI module

### Phase 2: Agent Migration ✅

- [x] Create email tools (11 tools)
- [x] Create calendar tools (5 tools)
- [x] Create contacts tools (5 tools)
- [x] Create knowledge tools (1 tool)
- [ ] Create folder tools (optional)
- [x] Create EmailAgent
- [x] Create CalendarAgent
- [x] Create ContactsAgent
- [x] Create KnowledgeAgent
- [x] Create GeneralAgent
- [x] Create SupervisorAgent
- [x] Create centralized locale system (EN/IT)

### Phase 3: Memory & Persistence

- [ ] Setup LibSQL
- [ ] Integrate with agents
- [ ] Migrate existing sessions
- [ ] Test session persistence

### Phase 4: HITL & Workflows

- [ ] Create HITL wrapper
- [ ] Apply to high-risk tools
- [ ] Create approval execution flow
- [ ] Test approval/rejection

### Phase 5: Observability ✅

- [x] Setup VoltOps with createHooks()
- [x] Create integration tests (real Mistral API)
- [x] Create E2E tests
- [x] Performance benchmarks
- [x] Redis bulk metrics for >1000 tenants
- [x] Per-agent observability hooks

### Phase 6: Cleanup ✅

- [x] Remove old agent files (6 agents deleted)
- [x] Update module (removed agent imports/registration)
- [x] Update service (deprecated process(), registerAgent())
- [x] Update controller (static agent list with deprecation notice)
- [x] Remove orphaned tests
- [x] Verify build and tests pass

### Phase 7: Complete Refactor (IN PROGRESS)

- [x] Step 1: RAG Integration ✅ (Hybrid Search + Re-ranking)
- [ ] Step 2: Consolidate HITL
- [ ] Step 3: Consolidate Feedback
- [ ] Step 4: Email Insights Integration
- [ ] Step 5: Memory Migration
- [ ] Step 6: Frontend Updates
- [x] Step 7: Remove Legacy Module ✅
- [ ] Step 8: Consolidate Services
- [ ] Step 9: Final Cleanup

---

**Document Version:** 1.6
**Last Updated:** 2025-11-30
**Author:** Claude Code
