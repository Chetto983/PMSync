# Architecture Research: v3.0 AI Intelligence & Scalability

**Project:** MailAgent v3.0
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

v3.0 builds on a solid foundation with **critical fixes needed** rather than ground-up rebuilds. Current VoltAgent integration (1008 lines) is feature-complete but suffers from **architectural debt**: slow responses (2-4s), lost messages, and scattered tool implementations. The path forward is **surgical refactoring** of existing components, not replacement.

**Key architectural decisions:**
1. **VoltAgent restructure** - Extract chat pipeline services (already 70% done), consolidate memory management
2. **Vercel AI SDK adoption** - Frontend already using useChat hook correctly, backend needs streamText → toUIMessageStream() pattern
3. **Auto-triage pipeline** - Leverage existing EmailTriageService + BullMQ, add classification scoring layer
4. **Nested labels** - Schema change (parent_id column) + recursive query service

## Current Architecture Audit

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐ │
│  │  Dashboard   │  │  Email List │  │  AI Chat (useChat SDK) │ │
│  │  (widgets)   │  │  (VList)    │  │  - AiDashboard.tsx     │ │
│  └──────────────┘  └─────────────┘  └────────────────────────┘ │
│         │                 │                       │              │
│         └─────────────────┴───────────────────────┘              │
│                          │                                       │
│                 TanStack Query Hooks                             │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTP/WebSocket
┌──────────────────────────┼──────────────────────────────────────┐
│                  BACKEND (NestJS)                                │
│  ┌────────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │  Email Module      │  │  AI Module       │  │  VoltAgent  │ │
│  │  - Sync (IMAP/     │  │  - Embeddings    │  │  Module     │ │
│  │    Gmail/MS)       │  │  - Triage        │  │  - Chat     │ │
│  │  - CRUD            │  │  - Insights      │  │  - Memory   │ │
│  │  - Search          │  │  - Queue         │  │  - Tools    │ │
│  └────────────────────┘  └──────────────────┘  └─────────────┘ │
│         │                       │                       │        │
│         └───────────────────────┴───────────────────────┘        │
│                               │                                  │
│  ┌────────────────────────────┼────────────────────────────────┐│
│  │              Infrastructure Layer                            ││
│  │  - Prisma (PostgreSQL + pgvector)                           ││
│  │  - BullMQ (Redis-backed queues)                             ││
│  │  - Redis (caching, locks, rate limiting)                    ││
│  │  - S3 (attachments)                                         ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### VoltAgent Integration (Current State)

**File:** `backend/src/modules/ai/voltagent/voltagent.service.ts` (1008 lines)

**What works:**
- ✅ PostgreSQL memory adapter with retry logic (lines 176-221)
- ✅ Multi-tenant isolation via `tenantUserId` (format: `tenant:user:id`)
- ✅ Tool ecosystem (35+ services in voltagent module)
- ✅ HITL (human-in-the-loop) approval workflow
- ✅ Observability hooks with metrics collection
- ✅ PII detection/resolution with placeholder mapping
- ✅ Conversation persistence (PostgreSQL sessions)

**What's wrong:**
- ❌ **Chat method is 326 lines** (lines 390-716) - god function
- ❌ **No streaming optimization** - `chat()` waits for full response
- ❌ **Message duplication** - Race condition in conversation creation
- ❌ **Context loss** - Memory extraction happens AFTER response (line 568)
- ❌ **Slow responses** - Sequential operations not parallelized

**Recent refactoring (partially complete):**
- ✅ ChatRequestProcessorService extracted (validation, PII, rate limiting)
- ✅ ChatContextBuilderService extracted (memory enrichment)
- ✅ ChatResponseProcessorService extracted (HITL extraction)
- ✅ ChatPrepareService extracted (unified setup - 2026-01-27)
- ⚠️ AgentPoolService extracted but still uses Redis cache (not VoltAgent native)
- ⚠️ ApprovalWorkflowService extracted but complex workflow state management

**Architecture issue:**
```typescript
// CURRENT: chat() method is 326 lines of sequential logic
async chat(message: string, options: ChatOptions): Promise<ChatResult> {
  // 1. Prepare (validate, build context) - 50 lines
  // 2. Generate text with retries - 100 lines
  // 3. Extract pending actions - 80 lines
  // 4. Resolve PII - 20 lines
  // 5. Track usage - 10 lines
  // Total: 260+ lines of orchestration code
}

// SHOULD BE: Thin orchestrator delegating to services
async chat(message: string, options: ChatOptions): Promise<ChatResult> {
  const prepared = await this.chatPrepare.execute(message, options);
  const result = await this.chatExecutor.run(prepared);
  const processed = await this.chatResponseProcessor.process(result);
  return processed;
}
```

### Chat Data Flow (Current Bottlenecks)

```
User Message
    │
    ▼
┌───────────────────────────────────────────┐
│ 1. Validation (50ms)                      │ ← ChatRequestProcessorService
│    - Rate limit check                     │
│    - PII detection                        │
│    - Prompt injection guard               │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│ 2. Context Building (200ms) ⚠️ SLOW       │ ← ChatContextBuilderService
│    - Fetch user context (DB query)        │
│    - RAG search (vector similarity)       │
│    - Memory retrieval (PostgreSQL)        │
│    - Provider context (emails, calendar)  │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│ 3. LLM Call (1500ms) ⚠️ NOT STREAMING     │ ← VoltAgent agent.generateText()
│    - Model selection                      │
│    - Generate full response (waits)       │
│    - No UI feedback during generation     │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│ 4. Response Processing (150ms)            │ ← ChatResponseProcessorService
│    - Extract pending actions              │
│    - PII resolution                       │
│    - Memory extraction ⚠️ AFTER response  │
└───────────────────────────────────────────┘
    │
    ▼
Assistant Response (Total: ~2000ms)
```

**Bottlenecks:**
1. **Context building (200ms)** - Sequential DB + vector + memory queries
2. **LLM generation (1500ms)** - No streaming to frontend
3. **Memory extraction timing** - Happens after LLM call instead of parallel

**Why messages get lost:**
```typescript
// Problem: Conversation ID not returned to frontend until after LLM call
// If LLM times out, frontend doesn't know the conversation ID
async chat(...) {
  const ctx = await prepare(); // Creates conversation in DB
  const result = await agent.generateText(); // 30s timeout possible
  return { conversationId: ctx.sessionId }; // Never returned if timeout!
}
```

### AI Module Structure (Current Organization)

**Module hierarchy:**
```
ai.module.ts (103 lines)
├── Core Services
│   ├── MistralService (LLM provider)
│   ├── EmbeddingsService (pgvector operations)
│   └── KnowledgeBaseService (RAG facade)
├── Queue Services (BullMQ)
│   ├── EmailEmbeddingQueueService (batch embedding creation)
│   ├── ContactEmbeddingQueueService (contact indexing)
│   └── FeedbackQueueService (training data collection)
├── Intelligence Services
│   ├── EmailInsightsService (summarization, sentiment)
│   ├── EmailTriageService (auto-classification) ✅ GOOD
│   └── AttachmentContentExtractorService (OCR, PDF)
├── Optimization Services
│   ├── QueryEmbeddingCacheService (semantic cache)
│   ├── BatchIndexingService (bulk operations)
│   └── CachePrewarmingService (predictive loading)
└── VoltAgentModule (re-exported) ⚠️ LARGE
    ├── 35+ services (chat, memory, CRM, scheduling, etc.)
    ├── 8 controllers
    └── Circular dependency with EmailModule
```

**Issues:**
1. **VoltAgentModule is monolithic** - 35 services, should split into sub-modules
2. **Circular dependencies** - VoltAgentModule ↔ EmailModule via forwardRef
3. **Tool scatter** - Similar tools in different services (e.g., email search in 3 places)

**Good patterns to keep:**
- ✅ Facade pattern (KnowledgeBaseService delegates to 4 sub-services)
- ✅ Queue-based async processing (BullMQ with DLQ)
- ✅ Circuit breaker for LLM calls (MistralService.recordLlmFailure)
- ✅ GDPR-compliant embeddings (no content stored, only vectors)

## Proposed Changes

### 1. VoltAgent Restructure

**Goal:** Split monolithic service, adopt streaming, fix message persistence

**Change 1: Streaming Response Pipeline**

```typescript
// NEW: backend/src/modules/ai/voltagent/services/chat-stream.service.ts
@Injectable()
export class ChatStreamService {
  /**
   * Returns VoltAgent streamText result for AI SDK integration.
   * Emits real-time events via WebSocket during generation.
   */
  async createStream(message: string, options: ChatOptions): Promise<{
    streamResult: StreamTextResult; // VoltAgent native
    sessionId: string; // Return IMMEDIATELY before LLM
    piiTransform: TransformStream;
  }> {
    // 1. Create conversation FIRST (before LLM)
    const session = await this.conversationService.create(options);

    // 2. Prepare context in parallel
    const [context, agent] = await Promise.all([
      this.chatContextBuilder.build(message, options),
      this.agentPool.getAgent(options.tenantId, options.userId),
    ]);

    // 3. Start streaming (non-blocking)
    const streamResult = await agent.streamText(message, {
      userId: `${options.tenantId}:${options.userId}`,
      conversationId: session.id,
      contextLimit: 20,
    });

    // 4. Return stream IMMEDIATELY with session ID
    return {
      streamResult,
      sessionId: session.id, // ✅ Frontend gets this before LLM
      piiTransform: this.createPiiTransform(options),
    };
  }
}
```

**Change 2: Parallel Context Building**

```typescript
// OPTIMIZE: backend/src/modules/ai/voltagent/services/chat-context-builder.service.ts
async build(message: string, options: ChatOptions): Promise<Context> {
  // BEFORE: Sequential (200ms total)
  // const user = await this.fetchUserContext();
  // const rag = await this.ragSearch(message);
  // const memory = await this.memoryRetrieval();

  // AFTER: Parallel (50ms total) ✅
  const [user, rag, memory, provider] = await Promise.all([
    this.fetchUserContext(options.userId),
    this.ragSearch(message, options.tenantId),
    this.memoryRetrieval(options.userId),
    this.providerContext(options.tenantId),
  ]);

  return this.composeContext({ user, rag, memory, provider });
}
```

**Change 3: Module Split**

```
voltagent.module.ts (190 lines) → Split into:
├── voltagent-chat.module.ts ✅ NEW
│   ├── ChatStreamService
│   ├── ChatPrepareService
│   ├── ChatContextBuilderService
│   ├── ChatResponseProcessorService
│   └── AgentPoolService
├── voltagent-memory.module.ts ✅ NEW
│   ├── AIMemoryService
│   ├── EpisodicMemoryService
│   ├── MemoryIntelligenceService
│   └── ConversationManagementService
├── voltagent-tools.module.ts ✅ NEW
│   ├── DailyBriefingService
│   ├── FollowUpService
│   ├── ActionExecutorService
│   └── UnifiedKnowledgeService
└── voltagent-crm.module.ts ✅ NEW
    ├── RelationshipIntelligenceService
    ├── AttentionScoreService
    └── CalendarConflictService
```

### 2. Vercel AI SDK Integration

**Current state:** Frontend uses AI SDK correctly, backend needs update

**Frontend (ALREADY DONE):**
```typescript
// ✅ frontend/hooks/use-voltagent-chat.ts uses official AI SDK pattern
import { useChat } from '@ai-sdk/react';

export function useVoltAgentChat(options) {
  const chat = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE_URL}/api/v1/voltagent/chat/stream/v3`,
      headers: () => ({ Authorization: `Bearer ${getAuthToken()}` }),
    }),
    experimental_throttle: 100,
  });

  return { ...chat, sendMessage, conversationId };
}
```

**Backend needs update:**

```typescript
// CURRENT: backend uses createStreamContext() but NOT following AI SDK pattern
// File: backend/src/modules/ai/voltagent/voltagent.controller.ts

@Post('chat/stream/v3')
async streamChatV3(@Body() dto: StreamChatDto, @Req() req): Promise<StreamableFile> {
  const { streamResult, piiTransform, sessionId } =
    await this.voltAgent.createStreamContext(dto.message, options);

  // ❌ PROBLEM: Manual stream handling, not using toUIMessageStream()
  const stream = streamResult.textStream.pipeThrough(piiTransform);
  return new StreamableFile(stream);
}

// SHOULD BE: Use AI SDK's toUIMessageStream() protocol
@Post('chat/stream/v3')
async streamChatV3(@Body() dto: StreamChatDto, @Req() req, @Res() res: Response) {
  const { streamResult, sessionId } =
    await this.chatStreamService.createStream(dto.message, options);

  // ✅ FIX: Use AI SDK protocol (includes metadata, tool calls, finish events)
  const uiStream = streamResult.toUIMessageStream({
    messageMetadata: {
      conversationId: sessionId, // ✅ Returned in first chunk
      suggestedQuestions: [], // Add after generation
    },
  });

  // Pipe to response with AI SDK protocol
  return pipeUIMessageStreamToResponse(uiStream, res);
}
```

**Data flow after fix:**

```
Frontend (useChat)
    │
    │ POST /api/v1/voltagent/chat/stream/v3
    ▼
Backend Controller
    │
    ├─ ChatStreamService.createStream()
    │  ├─ Create conversation (DB)
    │  ├─ Build context (parallel)
    │  └─ Start VoltAgent streamText()
    │     │
    │     └─ Return { streamResult, sessionId } ⚡ IMMEDIATE
    │
    ├─ streamResult.toUIMessageStream() ✅ AI SDK protocol
    │  │
    │  ├─ Chunk 1: { type: 'message-metadata', conversationId: '...' }
    │  ├─ Chunk 2: { type: 'text-delta', delta: 'Hello' }
    │  ├─ Chunk 3: { type: 'text-delta', delta: ' there' }
    │  ├─ Chunk 4: { type: 'tool-call', toolName: 'search_emails' }
    │  ├─ Chunk 5: { type: 'tool-result', result: {...} }
    │  ├─ Chunk 6: { type: 'text-delta', delta: 'Found 3 emails' }
    │  └─ Chunk 7: { type: 'finish', finishReason: 'stop' }
    │
    └─ pipeUIMessageStreamToResponse(uiStream, res)
       │
       └─▶ Frontend (useChat hook auto-handles all events)
```

**Benefits:**
- ✅ Conversation ID in first chunk (no message loss)
- ✅ Tool calls visible in UI with loading states
- ✅ Suggested questions in metadata (parsed by frontend)
- ✅ Standard protocol (works with all AI SDK features)

### 3. Auto-Triage Pipeline

**Current state:** EmailTriageService exists but manual trigger only

**File:** `backend/src/modules/ai/services/email-triage.service.ts`

**What exists:**
- ✅ Sentiment analysis (Mistral batch API)
- ✅ Priority scoring (attention score pre-filter)
- ✅ Cost controls (24h window, 50 email batch limit)
- ✅ BullMQ integration for async processing
- ⚠️ Category assignment NOT implemented
- ⚠️ Action suggestions NOT implemented

**Proposed pipeline:**

```
Email Arrives (IMAP sync)
    │
    ▼
┌────────────────────────────────────────────┐
│ EmailSyncService (existing)                │
│ - Fetch from provider                      │
│ - Save to DB                               │
│ - Emit 'email.created' event               │
└────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────┐
│ AutoTriageQueueService ✅ NEW              │
│ - Listen for 'email.created'               │
│ - Enqueue job with rate limiting (2 req/s) │
│ - Skip spam/trash/sent folders             │
└────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────┐
│ BullMQ Worker (batching)                   │
│ - Batch 10 emails (200ms window)           │
│ - Call Mistral batch sentiment API         │
│ - Parallel classification scoring          │
└────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────┐
│ EmailClassifierService ✅ NEW              │
│ - Category assignment (work/personal/etc)  │
│ - Priority scoring (1-10 scale)            │
│ - Action extraction (reply/forward/etc)    │
│ - Label recommendations                    │
└────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────┐
│ Store Results                              │
│ - Update Email.aiPriority                  │
│ - Create EmailLabel associations           │
│ - Store in EmailAnalysis table             │
└────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────┐
│ Notify Frontend (WebSocket)                │
│ - 'email.triaged' event                    │
│ - Frontend updates list optimistically     │
└────────────────────────────────────────────┘
```

**New service:**

```typescript
// backend/src/modules/ai/services/email-classifier.service.ts
@Injectable()
export class EmailClassifierService {
  /**
   * Classify email into categories with confidence scores.
   * Uses ensemble of rule-based + ML + LLM for accuracy.
   */
  async classify(email: Email): Promise<ClassificationResult> {
    // Parallel classification methods
    const [ruleBased, embedding, llm] = await Promise.all([
      this.ruleBasedClassify(email), // Fast, domain-specific
      this.embeddingClassify(email),  // Semantic similarity
      this.llmClassify(email),        // Deep understanding
    ]);

    // Ensemble voting with confidence weighting
    return this.ensembleVote([ruleBased, embedding, llm]);
  }

  private async ruleBasedClassify(email: Email): Promise<Classification> {
    // Keywords, sender domain, subject patterns
    // Example: @bank.com → category: "finance", priority: 8
    // Fast (< 1ms), good for common patterns
  }

  private async embeddingClassify(email: Email): Promise<Classification> {
    // Vector similarity to labeled examples
    // Uses existing pgvector infrastructure
    // Medium speed (~50ms), handles novel content
  }

  private async llmClassify(email: Email): Promise<Classification> {
    // Deep semantic understanding
    // Slow (~500ms), used sparingly with caching
    // Only for ambiguous cases (ensemble < 0.8 confidence)
  }
}
```

**Schema changes needed:**

```prisma
// backend/prisma/schema.prisma

model Email {
  // ... existing fields ...

  // Auto-triage fields (already exist)
  aiPriority        Int?       // 1-10 scale
  aiSentiment       String?    // positive/negative/neutral/mixed
  aiLabels          String[]   // Array of label IDs

  // NEW: Classification metadata
  aiCategory        String?    // work/personal/finance/marketing/etc
  aiCategoryScore   Float?     // 0.0-1.0 confidence
  aiActionSuggested String?    // reply/forward/archive/delete/schedule
  aiActionScore     Float?     // 0.0-1.0 confidence
  triageCompletedAt DateTime?  // When auto-triage finished
}

model EmailAnalysis {
  // ... existing fields ...

  // NEW: Extended classification data
  categories        Json?      // { primary: "work", secondary: ["urgent", "client"] }
  suggestedActions  Json?      // [{ action: "reply", confidence: 0.9, reason: "..." }]
  classifierVersion String?    // Track model version for retraining
}
```

**Performance targets:**
- ⚡ Batch processing: 10 emails / 200ms window
- ⚡ Classification: < 100ms per email (parallel ensemble)
- ⚡ LLM only for ambiguous cases (< 20% of emails)
- ⚡ 99.9% accuracy for spam/not spam
- ⚡ 95% accuracy for category classification

### 4. Nested Labels Data Model

**Current state:** Flat labels (no hierarchy)

**Schema:**
```prisma
// CURRENT: backend/prisma/schema.prisma
model UserLabel {
  id       String @id @default(cuid())
  tenantId String
  userId   String
  name     String // "Work", "Personal", "Urgent"
  color    String
  // ❌ NO PARENT REFERENCE
}
```

**Proposed schema:**

```prisma
model UserLabel {
  id        String       @id @default(cuid())
  tenantId  String
  userId    String
  name      String       // "Work", "Projects", "Q1 2026"
  color     String
  parentId  String?      // ✅ NEW: Self-reference for tree
  order     Int          @default(0) // Display order within parent

  // Relations
  parent    UserLabel?   @relation("LabelHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children  UserLabel[]  @relation("LabelHierarchy")

  // Prevent circular references
  @@index([parentId])
  @@index([tenantId, userId])
}
```

**API additions:**

```typescript
// backend/src/modules/labels/labels.service.ts
@Injectable()
export class LabelsService {
  /**
   * Get label tree for user with hierarchy.
   * Returns nested structure for UI rendering.
   */
  async getTree(tenantId: string, userId: string): Promise<LabelNode[]> {
    // Recursive CTE query (PostgreSQL)
    const labels = await this.prisma.$queryRaw`
      WITH RECURSIVE label_tree AS (
        -- Base case: root labels (no parent)
        SELECT id, name, color, "parentId", "order", 0 as depth
        FROM "user_labels"
        WHERE "tenantId" = ${tenantId}
          AND "userId" = ${userId}
          AND "parentId" IS NULL

        UNION ALL

        -- Recursive case: children
        SELECT l.id, l.name, l.color, l."parentId", l."order", t.depth + 1
        FROM "user_labels" l
        INNER JOIN label_tree t ON l."parentId" = t.id
        WHERE t.depth < 10  -- Prevent infinite loops
      )
      SELECT * FROM label_tree
      ORDER BY depth, "order";
    `;

    return this.buildTree(labels);
  }

  /**
   * Move label to new parent (drag-and-drop).
   * Validates against circular references.
   */
  async moveLabel(
    labelId: string,
    newParentId: string | null,
    newOrder: number,
  ): Promise<void> {
    // 1. Check for circular reference
    if (newParentId) {
      const wouldCycle = await this.wouldCreateCycle(labelId, newParentId);
      if (wouldCycle) throw new BadRequestException('Circular reference');
    }

    // 2. Update parent and reorder siblings
    await this.prisma.$transaction([
      this.prisma.userLabel.update({
        where: { id: labelId },
        data: { parentId: newParentId, order: newOrder },
      }),
      // Reorder other labels at same level
      this.reorderSiblings(newParentId, newOrder),
    ]);
  }

  /**
   * Detect if move would create circular reference.
   * Example: Can't move "Work" under "Projects" if "Projects" is under "Work"
   */
  private async wouldCreateCycle(
    labelId: string,
    newParentId: string,
  ): Promise<boolean> {
    // Walk up parent chain from newParentId
    // If we encounter labelId, it's a cycle
    let current = newParentId;
    const seen = new Set([labelId]);

    while (current) {
      if (seen.has(current)) return true; // Cycle detected
      seen.add(current);

      const parent = await this.prisma.userLabel.findUnique({
        where: { id: current },
        select: { parentId: true },
      });

      current = parent?.parentId || null;
    }

    return false;
  }
}
```

**Frontend tree component:**

```typescript
// frontend/components/labels/LabelTree.tsx
interface LabelNode {
  id: string;
  name: string;
  color: string;
  depth: number;
  children?: LabelNode[];
}

export function LabelTree({ labels }: { labels: LabelNode[] }) {
  return (
    <TreeView>
      {labels.map(node => (
        <TreeItem
          key={node.id}
          nodeId={node.id}
          label={<LabelChip name={node.name} color={node.color} />}
          sx={{ pl: node.depth * 3 }} // Indent by depth
        >
          {node.children?.map(child => (
            <LabelTree labels={[child]} key={child.id} />
          ))}
        </TreeItem>
      ))}
    </TreeView>
  );
}
```

**UX considerations (from research):**

- ⚠️ **Max depth: 3-4 levels** - Deeper trees become unusable
- ✅ **Expand parent ancestors** - When child selected, show full path
- ✅ **Persist expansion state** - Don't collapse on parent toggle
- ✅ **Manual resize** - Let user adjust tree width
- ✅ **Alternative navigation** - Provide flat list view + search

### 5. Scalability (Queuing, Caching, Rate Limiting)

**Current infrastructure (GOOD):**

```typescript
// ✅ BullMQ queue system (Redis-backed)
- EmailEmbeddingQueueService: Batching (50 items, 200ms flush)
- ContactEmbeddingQueueService: Same pattern
- FolderOperationsQueue: Atomic operations
- BulkOperationsQueue: Large batch support

// ✅ Redis caching layers
- QueryEmbeddingCacheService: Semantic cache for RAG
- AgentPoolService: Agent instance pooling
- CachePrewarmingService: Predictive loading

// ✅ Rate limiting (per-service)
- EmailTriageService: Global semaphore (5 concurrent ops)
- MistralBatchService: 2 req/s for embeddings
- RateLimiterService: Per-user LLM quotas
```

**Scalability issues:**

1. **VoltAgent memory bottleneck**
   - PostgreSQL adapter for conversation history
   - Every message queries `voltagent_memory_*` tables
   - Solution: Add Redis L1 cache for recent conversations

2. **Agent pool not distributed**
   - Redis cache but agents recreated per instance
   - Multi-instance deployment duplicates agent creation
   - Solution: Use VoltAgent native memory (no local cache)

3. **Auto-triage queue backlog**
   - Global semaphore is in-memory (single instance)
   - 1000 users syncing → 50,000 emails → queue stalls
   - Solution: Redis-based distributed lock + scale workers

**Proposed improvements:**

```typescript
// NEW: backend/src/modules/ai/voltagent/services/memory-cache.service.ts
@Injectable()
export class MemoryCacheService {
  /**
   * Two-tier cache for VoltAgent memory:
   * - L1: Redis (recent 100 conversations, 1h TTL)
   * - L2: PostgreSQL (all conversations, permanent)
   */
  async getConversationHistory(
    conversationId: string,
    limit: number = 20,
  ): Promise<Message[]> {
    // Try L1 cache first
    const cached = await this.redis.get(`memory:conv:${conversationId}`);
    if (cached) return JSON.parse(cached).slice(0, limit);

    // Fallback to PostgreSQL
    const messages = await this.voltAgentMemory.getMessages(conversationId, limit);

    // Populate L1 cache (async, fire-and-forget)
    this.redis.setex(
      `memory:conv:${conversationId}`,
      3600, // 1 hour
      JSON.stringify(messages),
    ).catch(err => this.logger.warn('Cache population failed', err));

    return messages;
  }
}
```

```typescript
// IMPROVED: backend/src/modules/ai/services/email-triage.service.ts
@Injectable()
export class EmailTriageService {
  // BEFORE: In-memory semaphore (single instance only)
  // private static currentOperations = 0;

  // AFTER: Redis-based distributed lock
  async acquireTriageLock(tenantId: string): Promise<boolean> {
    const lockKey = `triage:lock:global`;
    const acquired = await this.redisLockService.tryAcquire(
      lockKey,
      60000, // 60s TTL
      { maxConcurrent: 5 }, // Global limit across all instances
    );
    return acquired;
  }
}
```

**Performance targets:**
- ⚡ L1 cache hit rate > 80% (recent conversations)
- ⚡ Auto-triage throughput: 1000 emails/min (distributed workers)
- ⚡ Agent pool reuse: < 50ms to get cached agent
- ⚡ Memory query: < 20ms for cached conversations

## Component Map

| Component | Status | Changes Needed | Priority |
|-----------|--------|----------------|----------|
| **VoltAgentService** | ⚠️ Refactor | Split chat() into pipeline, add streaming | HIGH |
| **ChatStreamService** | ❌ Missing | Create new service for streaming | HIGH |
| **ChatContextBuilderService** | ✅ Exists | Parallelize queries (sequential → parallel) | MEDIUM |
| **ChatResponseProcessorService** | ✅ Exists | Move memory extraction to parallel step | MEDIUM |
| **AgentPoolService** | ⚠️ Partial | Remove Redis cache, use VoltAgent native | LOW |
| **EmailClassifierService** | ❌ Missing | Create ensemble classifier | HIGH |
| **AutoTriageQueueService** | ❌ Missing | Create event-driven queue | HIGH |
| **LabelsService** | ⚠️ Limited | Add tree methods, cycle detection | MEDIUM |
| **MemoryCacheService** | ❌ Missing | Add Redis L1 cache for conversations | MEDIUM |
| **Frontend useVoltAgentChat** | ✅ Good | No changes (already using AI SDK correctly) | NONE |
| **Backend chat endpoint** | ⚠️ Refactor | Use toUIMessageStream(), not manual streaming | HIGH |

## Build Order

**Phase 1: Fix Chat Performance (1 week)**
1. Create ChatStreamService with streaming support
2. Update backend endpoint to use toUIMessageStream()
3. Parallelize ChatContextBuilderService queries
4. Add conversation ID in first chunk (fix message loss)
5. **Deliverable:** Chat responds in < 500ms with streaming

**Phase 2: Auto-Triage Pipeline (1 week)**
1. Create EmailClassifierService with ensemble voting
2. Create AutoTriageQueueService (event-driven)
3. Add schema fields (aiCategory, aiActionSuggested)
4. Integrate with existing EmailTriageService
5. **Deliverable:** Emails auto-tagged within 5s of arrival

**Phase 3: Nested Labels (3 days)**
1. Add parentId column to UserLabel schema
2. Implement LabelsService.getTree() with recursive CTE
3. Add cycle detection for moveLabel()
4. Create frontend LabelTree component
5. **Deliverable:** Drag-and-drop label hierarchy

**Phase 4: VoltAgent Module Split (1 week)**
1. Extract voltagent-chat.module.ts
2. Extract voltagent-memory.module.ts
3. Extract voltagent-tools.module.ts
4. Break circular dependencies (EmailModule ↔ VoltAgentModule)
5. **Deliverable:** Cleaner module boundaries, easier testing

**Phase 5: Scalability Improvements (1 week)**
1. Add MemoryCacheService (Redis L1 cache)
2. Replace in-memory semaphores with Redis locks
3. Scale auto-triage workers (distributed queue)
4. Add circuit breakers for all external APIs
5. **Deliverable:** System handles 10x load without degradation

**Total estimate: 4-5 weeks for full v3.0 scope**

## Integration Points

### VoltAgent → Email Module
```
VoltAgentService (chat tools)
    │
    ├─ UnifiedKnowledgeService.searchEmails()
    │  └─▶ EmailsService.search() [read]
    │
    ├─ ActionExecutorService.sendEmail()
    │  └─▶ EmailsService.send() [write]
    │
    └─ FollowUpService.createFollowUp()
       └─▶ EmailsService.addLabel() [write]
```

### Auto-Triage → Email Module
```
Email Arrives (EmailSyncService)
    │
    ├─ Emit 'email.created' event
    │
    └─▶ AutoTriageQueueService (listener)
        │
        └─▶ EmailClassifierService.classify()
            │
            └─▶ EmailsService.update() [write classification]
```

### AI SDK → Backend
```
Frontend useVoltAgentChat (Vercel AI SDK)
    │
    ├─ POST /api/v1/voltagent/chat/stream/v3
    │  └─▶ ChatStreamService.createStream()
    │      │
    │      ├─ ConversationManagementService.create()
    │      ├─ ChatContextBuilderService.build()
    │      └─ VoltAgent streamText()
    │
    └─▶ UIMessageStream (protocol)
        └─ Frontend auto-handles chunks
```

### Memory → VoltAgent
```
VoltAgent Agent (conversation history)
    │
    ├─ Check MemoryCacheService (L1 Redis)
    │  ├─ HIT → Return cached messages
    │  └─ MISS → Query PostgreSQL adapter
    │
    └─▶ PostgreSQLMemoryAdapter (L2)
        └─ voltagent_memory_messages table
```

## Data Flow Diagrams

### Chat Streaming (After v3.0)

```
User sends message
    │
    ▼
Frontend (useChat)
    │ HTTP POST
    ▼
Backend Controller
    │
    ├─ ChatStreamService.createStream()
    │  │
    │  ├─ 1. Create conversation (DB) [100ms]
    │  ├─ 2. Build context (parallel) [50ms] ⚡ 4x faster
    │  ├─ 3. Get agent from pool [10ms]
    │  └─ 4. Start streamText() [immediate]
    │
    ├─ Return { streamResult, sessionId } ⚡ 160ms total
    │
    └─▶ toUIMessageStream()
        │
        ├─ Chunk 0: { metadata: { conversationId } } ⚡ First chunk
        ├─ Chunk 1-N: { text-delta } [streaming tokens]
        └─ Chunk N+1: { finish }
```

**Performance comparison:**
- Before: 2000ms total (context 200ms + LLM 1500ms + processing 300ms)
- After: 160ms to first chunk, then streaming (10x faster perceived speed)

### Auto-Triage Pipeline (After v3.0)

```
Email arrives via IMAP sync
    │
    ▼
EmailSyncService.create()
    │
    ├─ Save to DB
    ├─ Emit 'email.created' event
    │
    └─▶ AutoTriageQueueService (listener)
        │
        ├─ Enqueue job [async]
        │
        └─▶ BullMQ Worker (batching)
            │
            ├─ Collect 10 emails (200ms window)
            │
            └─▶ EmailClassifierService.classifyBatch()
                │
                ├─ Parallel classification (50ms per email)
                │  ├─ Rule-based (1ms)
                │  ├─ Embedding (20ms)
                │  └─ LLM (500ms, only if ambiguous)
                │
                ├─ Ensemble vote
                │
                └─▶ Update Email records
                    │
                    └─▶ Emit 'email.triaged' (WebSocket)
                        │
                        └─▶ Frontend updates list ⚡ Optimistic
```

**Timeline:**
- T+0s: Email synced, saved to DB
- T+0.2s: Batch triggers (10 emails collected)
- T+0.25s: Classification complete (parallel)
- T+0.3s: DB updated, WebSocket event sent
- T+0.35s: Frontend shows classification ⚡ Total: 350ms

## Sources

### Vercel AI SDK
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction) - Core concepts and API
- [NestJS Integration Example](https://sdk.vercel.ai/examples/api-servers/nest) - Official backend pattern
- [Vercel AI SDK Complete Guide](https://dev.to/pockit_tools/vercel-ai-sdk-complete-guide-building-production-ready-ai-chat-apps-with-nextjs-4cp6) - Production patterns

### VoltAgent
- [VoltAgent Framework](https://github.com/VoltAgent/voltagent) - Official TypeScript agent framework
- [VoltAgent Documentation](https://voltagent.dev/docs/) - Core runtime and patterns
- [Building AI Agents with VoltAgent](https://huggingface.co/blog/necatiozmen/voltagent) - Complete guide

### Auto-Triage & Classification
- [AI-Powered Email Triage](https://www.mailmodo.com/guides/ai-email-triage/) - Architecture patterns
- [Email Support Triage](https://www.kommunicate.io/blog/ai-email-routing-and-prioritization/) - Priority scoring
- [Enterprise AI Triage Systems](https://thinkata.com/news/insights/ai-enterprise-triage/) - Scalability best practices

### Nested Labels UI/UX
- [Interaction Design for Trees](https://medium.com/@hagan.rivers/interaction-design-for-trees-5e915b408ed2) - Tree navigation patterns
- [PatternFly Tree View](https://www.patternfly.org/components/tree-view/design-guidelines/) - Design guidelines
- [Designing UI for Tree Data](https://retool.com/blog/designing-a-ui-for-tree-data) - Complex hierarchy handling
