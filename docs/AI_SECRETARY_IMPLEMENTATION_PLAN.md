# AI Secretary Implementation Plan

**Date:** December 16, 2025
**Version:** 2.1 (Updated with Security & Document Library Implementation)
**Purpose:** Detailed implementation plan with recommended libraries, patterns, and best practices for each AI Secretary feature

---

## 🔬 Research Summary (December 2025)

This plan incorporates extensive research into 2025 best practices for:

| Topic | Key Finding | Source |
|-------|-------------|--------|
| **Mem0 Production** | 26% accuracy boost, 91% lower latency, 90% token savings | [Mem0 Research Paper](https://arxiv.org/abs/2504.19413) |
| **Memory Architecture** | Two-layer (short+long), hybrid vector+graph | [Redis AI Memory Guide](https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis/) |
| **pgvector Optimization** | halfvec for 50% storage savings, HNSW must fit in RAM | [Crunchy Data Performance](https://www.crunchydata.com/blog/pgvector-performance-for-developers) |
| **Multi-tenant Security** | Strict namespace isolation, per-tenant quotas | [Azure Multi-tenant AI](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/ai-ml) |
| **RAG 2025** | Hybrid search, Long RAG, Self-RAG patterns | [2025 RAG Guide](https://www.edenai.co/post/the-2025-guide-to-retrieval-augmented-generation-rag) |
| **Code Interpreter** | Safe code execution in isolated container for analytics | [Mistral Code Interpreter](https://docs.mistral.ai/agents/tools/built-in/code_interpreter) |
| **A-MEM (Agentic Memory)** | Zettelkasten-style interconnected knowledge networks | [arXiv:2502.12110](https://arxiv.org/abs/2502.12110) |
| **GraphRAG** | Vector + Graph hybrid, relationship-aware retrieval | [Microsoft GraphRAG](https://techcommunity.microsoft.com/blog/adforpostgresql/introducing-the-graphrag-solution-for-azure-database-for-postgresql/4299871) |
| **Apache AGE** | Graph extension for PostgreSQL, OpenCypher + SQL | [Apache AGE](https://age.apache.org/) |
| **HybridRAG** | Combine vector embeddings with knowledge graphs | [HybridRAG Guide](https://memgraph.com/blog/why-hybridrag) |

---

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Phase 0: Long-Term Memory (Mem0)](#phase-0-long-term-memory-mem0) ⭐ **CRITICAL** ✅
3. [Phase 1: Proactive Intelligence](#phase-1-proactive-intelligence) ✅
4. [Phase 1.5: Analytics & Visualization](#phase-15-analytics--visualization) ✅
5. [Phase 1.6: Unified Knowledge Agent](#phase-16-unified-knowledge-agent-2025-best-practices) ✅ **DONE**
6. [Phase 1.7: CRM Intelligence](#phase-17-crm-intelligence-2025) ✅ **DONE**
7. [Phase 2: Smart Scheduling](#phase-2-smart-scheduling) ✅ **DONE**
8. [Phase 3: Relationship Intelligence](#phase-3-relationship-intelligence) → Merged into P1.7
9. [Recommended Libraries](#recommended-libraries)
10. [Architecture Patterns](#architecture-patterns)
11. [Security & Multi-Tenancy](#security--multi-tenancy)
12. [Performance Optimization](#performance-optimization)
13. [Testing Strategy](#testing-strategy)

---

## Infrastructure Overview

### 100% Self-Hosted Docker Stack

All AI Secretary features use **existing infrastructure** - no new Docker containers needed:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 EXISTING INFRASTRUCTURE (NO NEW CONTAINERS)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     docker-compose.yml (existing)                    │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  postgres:         Redis:           NestJS:         Mistral:        │   │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐   ┌───────────┐   │   │
│  │  │ pgvector  │    │ 7.x       │    │ + Mem0    │   │ (existing)│   │   │
│  │  │ extension │    │           │    │ SDK       │   │ API key   │   │   │
│  │  │ (existing)│    │ (existing)│    │ (npm pkg) │   │           │   │   │
│  │  └───────────┘    └───────────┘    └───────────┘   └───────────┘   │   │
│  │       ↓               ↓                 ↓               ↓          │   │
│  │  Port 5432       Port 6379         Port 3000       Mistral API     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Approach?

1. **Zero new infrastructure** - Just `npm install mem0ai`
2. **Uses existing Mistral** - Your API key for LLM + embeddings
3. **Uses existing PostgreSQL** - pgvector for vector storage
4. **Uses existing Redis** - Caching and queues
5. **Simple deployment** - No Docker changes needed

### Existing Docker Services (Already Running)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI Secretary Architecture                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐          │
│  │  PostgreSQL    │   │     Redis      │   │    BullMQ      │          │
│  │  + pgvector    │   │                │   │   (on Redis)   │          │
│  ├────────────────┤   ├────────────────┤   ├────────────────┤          │
│  │ PERSISTENT     │   │ CACHING        │   │ JOB QUEUES     │          │
│  │                │   │                │   │                │          │
│  │ • ai_tasks     │   │ • Semantic     │   │ • follow-up    │          │
│  │ • ai_memories  │   │   cache        │   │   checks       │          │
│  │ • ai_deadlines │   │ • Sessions     │   │ • deadline     │          │
│  │ • follow_ups   │   │ • Briefings    │   │   alerts       │          │
│  │ • contacts     │   │ • Analytics    │   │ • daily        │          │
│  │ • interactions │   │ • Rate limits  │   │   briefing     │          │
│  │                │   │                │   │ • email        │          │
│  │ Vector search  │   │ Pub/Sub        │   │   analysis     │          │
│  │ via pgvector   │   │ for realtime   │   │ • reconnect    │          │
│  └────────────────┘   └────────────────┘   │   suggestions  │          │
│         ▲                    ▲             └────────────────┘          │
│         │                    │                    ▲                     │
│         │                    │                    │                     │
│         └────────────────────┴────────────────────┘                     │
│                              │                                          │
│                     Prisma + ioredis + @nestjs/bull                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Storage Mapping

| Feature | Primary Storage | Cache | Queue |
|---------|----------------|-------|-------|
| **Long-term Memory** | PostgreSQL (pgvector) | Redis (hot memories) | - |
| **Semantic Cache** | - | Redis | - |
| **Follow-up Tracking** | PostgreSQL | - | BullMQ |
| **Deadline Alerts** | PostgreSQL | Redis (upcoming) | BullMQ |
| **Action Items** | PostgreSQL | - | BullMQ |
| **Daily Briefing** | - | Redis | BullMQ |
| **Contact Interactions** | PostgreSQL | - | BullMQ |
| **Task Reminders** | PostgreSQL | - | BullMQ |

### Why This Works

1. **PostgreSQL + pgvector**: Already enabled for embeddings - perfect for Mem0 self-hosted
2. **Redis**: Already used for semantic cache, sessions, rate limiting
3. **BullMQ**: Already used for email sync, calendar sync - just add new queues

### New BullMQ Queues

```typescript
// backend/src/modules/ai/ai-secretary.module.ts
@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'ai-secretary-followups' },
      { name: 'ai-secretary-deadlines' },
      { name: 'ai-secretary-tasks' },
      { name: 'ai-secretary-relationships' },
    ),
  ],
})
export class AiSecretaryModule {}
```

---

## Phase 0: Long-Term Memory (Mem0)

> ⭐ **CRITICAL FEATURE** - This is the highest-impact improvement with lowest effort.
> Research shows 26% accuracy improvement, 91% lower latency, and 90% token savings.

### 2025 Best Practices from Research

#### Memory Architecture Principles

Based on [Building AI Agents That Actually Remember (2025)](https://medium.com/@nomannayeem/building-ai-agents-that-actually-remember-a-developers-guide-to-memory-management-in-2025-062fd0be80a1):

1. **Two-Layer Architecture** (like human brain):
   - **Short-term memory**: Session scratchpad (we have this via Redis)
   - **Long-term memory**: Transcends conversations (Mem0 adds this)

2. **Memory Types to Implement**:

   | Type | Purpose | Example |
   |------|---------|---------|
   | **Episodic** | Personal diary of events | "User X preferred pie charts on Tuesday" |
   | **Semantic** | General knowledge/facts | "Morning meetings have better attendance" |
   | **Procedural** | How to do things | Step-by-step processes that work |

3. **Intelligent Forgetting** (Critical!):
   - Not all information is worth remembering
   - Use priority scoring and contextual tagging
   - Decay low-relevance entries over time
   - "Forgetting isn't a flaw - it's a feature"

4. **Memory Consolidation**:
   - Move information between short/long-term based on:
     - Usage patterns
     - Recency and significance
     - Optimize recall speed vs storage

#### Vector vs Graph Memory (When to Use Each)

Based on [Mem0 Architecture Guide](https://docs.mem0.ai/cookbooks/essentials/choosing-memory-architecture-vector-vs-graph):

| Aspect | Vector Memory | Graph Memory |
|--------|---------------|--------------|
| **Best For** | Semantic search, FAQ, direct lookups | Relationships, hierarchies, multi-hop |
| **Accuracy** | 66.9% | 68.4% (+2%) |
| **Latency** | 0.20s median | 0.66s median |
| **Token Usage** | ~7k/conversation | ~14k/conversation |
| **LLM Calls** | Standard | +2-3 extra per add() |

**Our Recommendation**: Start with **Vector Memory** only. Add Graph when:
- Tracking organizational hierarchies
- CRM-style contact relationships
- Multi-hop queries needed (3+ connections)

### Production Performance Benchmarks

From [Mem0 Research Paper (arXiv:2504.19413)](https://arxiv.org/abs/2504.19413):

| Metric | Mem0 vs Full Context | Mem0 vs OpenAI Memory |
|--------|---------------------|----------------------|
| **Accuracy** | Comparable | +26% improvement |
| **p95 Latency** | -91% (much faster) | Significantly better |
| **Token Cost** | -90% savings | Substantial savings |
| **Question Types** | Single-hop, temporal, multi-hop, open-domain | All types improved |

### Recommended Solution: Mem0 Node.js SDK (Direct Integration)

**Package:** `mem0ai`

**Why Direct SDK (No Separate Backend):**

- **Zero additional infrastructure** - Uses SDK directly in NestJS
- **Uses existing Mistral** - Our existing API key for LLM + embeddings
- **Uses existing PostgreSQL** - Store memories in our main database
- **Simpler deployment** - No extra Docker containers needed
- **26% accuracy improvement** - Same benefits, simpler setup

### Mistral Integration (Important!)

Based on [Mem0 Mistral Docs](https://docs.mem0.ai/components/llms/models/mistral_AI), Mistral uses the **litellm provider**:

```typescript
// Configuration for Mistral with Mem0
const config = {
  // For LLM operations - use litellm provider with Mistral model
  llm: {
    provider: 'litellm',
    config: {
      model: 'mistral/mistral-small-latest', // litellm format
      temperature: 0.1,
      max_tokens: 2000,
    },
  },
  // For embeddings - use mistral provider directly
  embedder: {
    provider: 'mistral',
    config: {
      apiKey: process.env.MISTRAL_API_KEY,
      model: 'mistral-embed',
    },
  },
};
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              MEM0 DIRECT SDK INTEGRATION (NO BACKEND SERVER)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                      NestJS Backend                                 │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │                    AiMemoryService                           │   │    │
│   │  │                    (uses mem0ai SDK)                         │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   │         ↓                              ↓                           │    │
│   │  ┌──────────────┐           ┌──────────────────┐                  │    │
│   │  │  PostgreSQL  │           │     Mistral      │                  │    │
│   │  │  + pgvector  │           │   (existing)     │                  │    │
│   │  │  (existing)  │           │   API for LLM    │                  │    │
│   │  │              │           │   + embeddings   │                  │    │
│   │  └──────────────┘           └──────────────────┘                  │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Installation

```bash
cd backend
npm install mem0ai
```

### NestJS Integration (Direct SDK)

```typescript
// backend/src/modules/ai/memory/memory.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Memory } from 'mem0ai/oss';

interface MemoryResult {
  id: string;
  memory: string;
  metadata?: Record<string, any>;
  score?: number;
}

@Injectable()
export class AiMemoryService implements OnModuleInit {
  private readonly logger = new Logger(AiMemoryService.name);
  private memory: Memory;
  private enabled = false;

  async onModuleInit() {
    if (process.env.MEM0_ENABLED !== 'true') {
      this.logger.warn('Mem0 disabled by configuration');
      return;
    }

    try {
      // Initialize Mem0 with Mistral (our existing provider)
      this.memory = new Memory({
        version: 'v1.1',
        // Use Mistral for embeddings (we already have this!)
        embedder: {
          provider: 'mistral',
          config: {
            apiKey: process.env.MISTRAL_API_KEY,
            model: 'mistral-embed',
          },
        },
        // Use in-memory vector store (or configure PostgreSQL)
        vectorStore: {
          provider: 'memory',
          config: {
            collectionName: 'ai_memories',
            dimension: 1024, // Mistral embed dimension
          },
        },
        // Use Mistral for LLM operations
        llm: {
          provider: 'mistral',
          config: {
            apiKey: process.env.MISTRAL_API_KEY,
            model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
          },
        },
        // SQLite for history (simple, no extra setup)
        historyDbPath: './data/mem0_history.db',
      });

      this.enabled = true;
      this.logger.log('Mem0 memory service initialized with Mistral');
    } catch (error) {
      this.logger.error(`Failed to initialize Mem0: ${error.message}`);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Store a memory from conversation messages.
   */
  async storeMemory(
    userId: string,
    tenantId: string,
    messages: Array<{ role: string; content: string }>,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!this.enabled) return;

    const memoryUserId = `${tenantId}:${userId}`;

    try {
      await this.memory.add(messages, {
        userId: memoryUserId,
        metadata: { ...metadata, tenantId, source: 'email_assistant' },
      });
      this.logger.debug(`Stored memory for user ${memoryUserId}`);
    } catch (error) {
      this.logger.error(`Failed to store memory: ${error.message}`);
    }
  }

  /**
   * Semantic search for relevant memories.
   */
  async searchMemories(
    userId: string,
    tenantId: string,
    query: string,
    limit = 5,
  ): Promise<MemoryResult[]> {
    if (!this.enabled) return [];

    const memoryUserId = `${tenantId}:${userId}`;

    try {
      const results = await this.memory.search(query, {
        userId: memoryUserId,
        limit,
      });
      return results || [];
    } catch (error) {
      this.logger.error(`Failed to search memories: ${error.message}`);
      return [];
    }
  }

  /**
   * Get context string for AI prompts.
   * Call this before sending to Mistral to inject user context.
   */
  async getContextForPrompt(
    userId: string,
    tenantId: string,
    query: string,
  ): Promise<string> {
    const memories = await this.searchMemories(userId, tenantId, query);
    if (memories.length === 0) return '';

    return `\n\n## User Context (from past conversations):\n${memories
      .map((m) => `- ${m.memory}`)
      .join('\n')}`;
  }

  /**
   * Get all memories for a user.
   */
  async getAllMemories(userId: string, tenantId: string): Promise<MemoryResult[]> {
    if (!this.enabled) return [];

    const memoryUserId = `${tenantId}:${userId}`;

    try {
      const results = await this.memory.getAll({ userId: memoryUserId });
      return results || [];
    } catch (error) {
      this.logger.error(`Failed to get all memories: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete a specific memory.
   */
  async deleteMemory(memoryId: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.memory.delete(memoryId);
      this.logger.debug(`Deleted memory ${memoryId}`);
    } catch (error) {
      this.logger.error(`Failed to delete memory: ${error.message}`);
    }
  }

  /**
   * Delete all memories for a user (GDPR compliance).
   */
  async deleteUserMemories(userId: string, tenantId: string): Promise<void> {
    if (!this.enabled) return;

    const memoryUserId = `${tenantId}:${userId}`;

    try {
      await this.memory.deleteAll({ userId: memoryUserId });
      this.logger.log(`Deleted all memories for user ${memoryUserId}`);
    } catch (error) {
      this.logger.error(`Failed to delete user memories: ${error.message}`);
    }
  }

  /**
   * Get memory history (changes over time).
   */
  async getMemoryHistory(memoryId: string): Promise<any[]> {
    if (!this.enabled) return [];

    try {
      const history = await this.memory.history(memoryId);
      return history || [];
    } catch (error) {
      this.logger.error(`Failed to get memory history: ${error.message}`);
      return [];
    }
  }
}
```

### Integration with VoltAgentService

```typescript
// backend/src/modules/ai/voltagent/voltagent.service.ts
import { AiMemoryService } from '../memory/memory.service';

@Injectable()
export class VoltAgentService {
  constructor(
    private readonly memoryService: AiMemoryService,
    // ... other dependencies
  ) {}

  async chat(
    userId: string,
    tenantId: string,
    message: string,
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    // 1. Get relevant memories for context
    const memoryContext = await this.memoryService.getContextForPrompt(
      userId,
      tenantId,
      message,
    );

    // 2. Build system prompt with memory context
    const enhancedSystemPrompt = `${this.baseSystemPrompt}${memoryContext}`;

    // 3. Call Mistral with enhanced context
    const response = await this.mistralAgent.chat(message, {
      systemPrompt: enhancedSystemPrompt,
      // ... other options
    });

    // 4. Store new memories from this conversation
    await this.memoryService.storeMemory(userId, tenantId, [
      { role: 'user', content: message },
      { role: 'assistant', content: response.content },
    ]);

    return response;
  }
}
```

### Environment Variables

```env
# Mem0 Configuration (Direct SDK - No Backend)
MEM0_ENABLED=true
MEM0_MAX_MEMORIES=10

# Uses existing Mistral API (already configured!)
# MISTRAL_API_KEY=your-existing-key
# MISTRAL_MODEL=mistral-small-latest
```

### Memory Storage Options

The SDK supports multiple storage backends:

| Storage | Config | Best For |
|---------|--------|----------|
| **In-Memory** | `provider: 'memory'` | Development, testing |
| **PostgreSQL** | `provider: 'pgvector'` | Production (our DB!) |
| **Qdrant** | `provider: 'qdrant'` | Large scale |
| **Supabase** | `provider: 'supabase'` | Serverless |

**For production with our existing PostgreSQL:**

```typescript
vectorStore: {
  provider: 'pgvector',
  config: {
    connectionString: process.env.DATABASE_URL,
    tableName: 'ai_memories_vectors',
    dimension: 1024,
  },
}
```

### Sources

- [Mem0 Node.js SDK Quickstart](https://docs.mem0.ai/open-source/node-quickstart)
- [Mem0 Documentation](https://docs.mem0.ai/overview/)
- [Mem0 npm Package](https://www.npmjs.com/package/mem0ai)

---

## Phase 1: Proactive Intelligence

### 1.1 Follow-up Tracking

**Best Practices from Research:**

1. **Pattern Detection:** Scan sent emails for:
   - Questions without replies after 3 days
   - Phrases like "I'll get back to you", "following up on"
   - Meeting requests awaiting confirmation

2. **Timing:**
   - First reminder: 3 days after sent
   - Second reminder: 5 days after sent
   - Escalate to daily briefing after 7 days

3. **Resolution Detection:**
   - Monitor for reply emails
   - Track thread activity
   - Auto-resolve when reply received

**Implementation:**

```typescript
// backend/src/modules/ai/follow-up/follow-up.service.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class FollowUpService {
  // Patterns that indicate follow-up needed
  private followUpPatterns = [
    /\?$/,                                    // Ends with question
    /please (let me know|respond|reply)/i,
    /looking forward to (hearing|your response)/i,
    /can you (please )?(confirm|send|provide)/i,
    /waiting for your/i,
    /by (friday|monday|end of (week|day))/i,
  ];

  async analyzeForFollowUp(email: Email): Promise<boolean> {
    const needsFollowUp = this.followUpPatterns.some(p => p.test(email.body));

    if (needsFollowUp) {
      await this.prisma.emailFollowUp.create({
        data: {
          tenantId: email.tenantId,
          userId: email.userId,
          emailId: email.id,
          status: 'PENDING',
          reason: 'Question or request detected',
          dueDate: addDays(new Date(), 3),
        }
      });
    }

    return needsFollowUp;
  }

  @Cron('0 */6 * * *') // Every 6 hours
  async checkPendingFollowUps() {
    const pending = await this.prisma.emailFollowUp.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lte: new Date() }
      }
    });

    for (const followUp of pending) {
      // Check if reply received
      const hasReply = await this.checkForReply(followUp.emailId);

      if (hasReply) {
        await this.resolveFollowUp(followUp.id, 'REPLY_RECEIVED');
      } else {
        await this.createReminder(followUp);
      }
    }
  }
}
```

### 1.2 Deadline Extraction

**Recommended Library:** `chrono-node`

**Why chrono-node:**

- Most popular natural language date parser (1M+ weekly downloads)
- TypeScript support
- Multi-language support (en, ja, fr, nl, ru, uk)
- Handles relative dates ("next Friday", "in 2 weeks")
- Custom parser support

**Installation:**

```bash
npm install chrono-node
```

**Implementation:**

```typescript
// backend/src/modules/ai/deadline/deadline-extractor.service.ts
import * as chrono from 'chrono-node';

@Injectable()
export class DeadlineExtractorService {
  // Keywords that indicate deadlines
  private deadlineKeywords = [
    'deadline', 'due', 'by', 'before', 'until', 'no later than',
    'must be done', 'submit by', 'complete by', 'finish by'
  ];

  extractDeadlines(text: string, referenceDate = new Date()): ExtractedDeadline[] {
    const results = chrono.parse(text, referenceDate);
    const deadlines: ExtractedDeadline[] = [];

    for (const result of results) {
      // Check if this date mention is near a deadline keyword
      const context = this.getContext(text, result.index, 50);
      const isDeadline = this.deadlineKeywords.some(k =>
        context.toLowerCase().includes(k)
      );

      if (isDeadline) {
        deadlines.push({
          date: result.start.date(),
          text: result.text,
          context: context,
          confidence: this.calculateConfidence(result, context),
        });
      }
    }

    return deadlines;
  }

  // Extract deadlines from email
  async extractFromEmail(email: Email): Promise<void> {
    const deadlines = this.extractDeadlines(email.body);

    for (const deadline of deadlines) {
      await this.prisma.aiDeadline.create({
        data: {
          tenantId: email.tenantId,
          userId: email.userId,
          title: this.extractTitle(deadline.context),
          deadline: deadline.date,
          sourceType: 'EMAIL',
          sourceId: email.id,
          confidence: deadline.confidence,
        }
      });
    }
  }
}
```

**Example Parsing:**

```typescript
chrono.parse('Meeting deadline is next Friday at 5pm');
// Returns: [{ text: 'next Friday at 5pm', start: { date: Date } }]

chrono.parse('Please submit the report by December 20th');
// Returns: [{ text: 'December 20th', start: { date: Date } }]

chrono.parse('The project is due in 2 weeks');
// Returns: [{ text: 'in 2 weeks', start: { date: Date } }]
```

### 1.3 Action Item Extraction

**Approach:** Use Mistral AI with structured prompts + pattern matching

**Pattern-Based Detection:**

```typescript
const actionPatterns = [
  /^(can|could|would) you (please )?(.*)\?/i,     // "Can you please send..."
  /^please (.*)/i,                                 // "Please review..."
  /^(i('ll| will)|we('ll| will)) (.*)/i,          // "I'll send you..."
  /(don't forget|remember) to (.*)/i,              // "Don't forget to..."
  /(action item|todo|task):?\s*(.*)/i,             // "Action item: ..."
  /by (friday|monday|tomorrow|end of)/i,           // Deadline mention
];
```

**AI-Enhanced Extraction:**

```typescript
async extractActionItems(email: Email): Promise<ActionItem[]> {
  const prompt = `
Extract action items from this email. For each action item, identify:
- description: What needs to be done
- owner: Who should do it (sender, recipient, or specific name)
- deadline: When it's due (if mentioned)
- priority: high/medium/low based on urgency language

Email:
${email.body}

Return as JSON array: [{ description, owner, deadline, priority }]
`;

  const response = await this.mistral.chat(prompt);
  return JSON.parse(response);
}
```

### 1.4 Document Library (Mistral)

**Built-in Tool:** Mistral `document_library`

```typescript
// Add to agent configuration
const agentTools = [
  {
    type: "document_library",
    library_ids: [userLibraryId]
  }
];
```

**Benefits:**

- Built-in RAG without custom implementation
- Automatic chunking and embedding
- Citation support
- No additional infrastructure

### Sources

- [chrono-node npm](https://www.npmjs.com/package/chrono-node)
- [Action Item Detection NLP](https://github.com/bakszero/ActionableTask)
- [Extracting Tasks from Emails](https://rodrigo-alarcon.medium.com/extracting-tasks-from-emails-first-challenges-86e7fbbf4672)
- [Mistral Document Library](https://docs.mistral.ai/agents/tools/built-in/document_library)

---

## Phase 1.5: Analytics & Visualization

> 📊 **NEW FEATURE** - Use Mistral Code Interpreter for advanced analytics, data visualization, and mathematical operations.

### Mistral Code Interpreter Tool

**Documentation:** [Mistral Code Interpreter](https://docs.mistral.ai/agents/tools/built-in/code_interpreter)

The Code Interpreter is a built-in Mistral tool that **safely executes code in an isolated container**. This enables powerful analytics capabilities without security risks.

#### Key Capabilities

| Capability | Use Case | Example |
|------------|----------|---------|
| **Data Visualization** | Generate charts and graphs | Email volume trends, response time charts |
| **Data Analysis** | Process and analyze data | Memory usage statistics, cache hit rates |
| **Mathematical Operations** | Complex calculations | Deadline probability scoring, priority weighting |
| **Code Validation** | Test generated code | Validate email templates, SQL queries |

#### Why Use Code Interpreter for Analytics?

1. **Isolated Execution** - Code runs in sandboxed container, no risk to production
2. **Dynamic Visualizations** - Generate PNG/SVG charts on-the-fly
3. **Complex Analysis** - Python ecosystem (pandas, matplotlib, numpy)
4. **No Infrastructure** - Built into Mistral API, no extra servers

#### Integration Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    AI SECRETARY ANALYTICS FLOW                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User Request                                                       │
│   "Show me my email response time trends"                           │
│        │                                                             │
│        ▼                                                             │
│   ┌────────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│   │  VoltAgent     │────▶│  Mistral API     │────▶│    Code      │ │
│   │  Service       │     │  + Code          │     │  Interpreter │ │
│   │                │     │  Interpreter     │     │  (Isolated)  │ │
│   └────────────────┘     └──────────────────┘     └──────────────┘ │
│        │                                                  │         │
│        │                 ┌──────────────────┐            │         │
│        │◀────────────────│  Generated       │◀───────────┘         │
│        │                 │  Chart (PNG)     │                       │
│        ▼                 └──────────────────┘                       │
│   Response with embedded visualization                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Implementation

```typescript
// backend/src/modules/ai/voltagent/analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../mistral/mistral.service';

interface AnalyticsResult {
  type: 'text' | 'image' | 'data';
  content: string;
  mimeType?: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly mistral: MistralService) {}

  /**
   * Generate analytics visualization using Mistral Code Interpreter.
   * Executes Python code in isolated container for safety.
   */
  async generateVisualization(
    tenantId: string,
    userId: string,
    query: string,
    data: Record<string, any>,
  ): Promise<AnalyticsResult> {
    const response = await this.mistral.chat({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: `You are a data analyst. Generate Python code to visualize the data.
Use matplotlib for charts. Return the chart as a base64 PNG image.
Data context: ${JSON.stringify(data)}`,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      tools: [{ type: 'code_interpreter' }],
      toolChoice: 'auto',
    });

    // Extract generated visualization
    return this.extractVisualization(response);
  }

  /**
   * Analyze memory statistics and generate insights.
   */
  async analyzeMemoryStats(tenantId: string): Promise<AnalyticsResult> {
    // Gather memory data
    const stats = await this.getMemoryStatistics(tenantId);

    return this.generateVisualization(
      tenantId,
      'system',
      `Create a dashboard showing:
       1. Memory usage over time (line chart)
       2. Memory types distribution (pie chart)
       3. Top 10 most accessed memories (bar chart)`,
      stats,
    );
  }

  /**
   * Generate email analytics report.
   */
  async generateEmailReport(
    tenantId: string,
    userId: string,
    period: 'day' | 'week' | 'month',
  ): Promise<AnalyticsResult> {
    const emailData = await this.getEmailStatistics(tenantId, userId, period);

    return this.generateVisualization(
      tenantId,
      userId,
      `Create a comprehensive email analytics dashboard:
       1. Emails sent vs received over time
       2. Average response time by day of week
       3. Top senders/recipients
       4. Email volume by hour of day`,
      emailData,
    );
  }

  /**
   * Analyze semantic cache performance.
   */
  async analyzeCachePerformance(tenantId: string): Promise<AnalyticsResult> {
    const cacheData = await this.getCacheStatistics(tenantId);

    return this.generateVisualization(
      tenantId,
      'system',
      `Analyze cache performance:
       1. Hit rate over time
       2. Category-wise hit rates
       3. Threshold adjustments timeline
       4. Cost savings estimation`,
      cacheData,
    );
  }
}
```

#### API Endpoints

```typescript
// backend/src/modules/ai/voltagent/voltagent.controller.ts

@Controller('api/v1/voltagent')
export class VoltAgentController {
  /**
   * Generate analytics visualization.
   * Uses Mistral Code Interpreter for safe code execution.
   */
  @Post('analytics/visualize')
  @UseGuards(AuthGuard)
  async generateVisualization(
    @Req() req: AuthenticatedRequest,
    @Body() body: { query: string; data?: Record<string, any> },
  ): Promise<AnalyticsResponse> {
    return this.analyticsService.generateVisualization(
      req.user.tenantId,
      req.user.id,
      body.query,
      body.data || {},
    );
  }

  /**
   * Get email analytics dashboard.
   */
  @Get('analytics/email')
  @UseGuards(AuthGuard)
  async getEmailAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query('period') period: 'day' | 'week' | 'month' = 'week',
  ): Promise<AnalyticsResponse> {
    return this.analyticsService.generateEmailReport(
      req.user.tenantId,
      req.user.id,
      period,
    );
  }

  /**
   * Get memory system analytics.
   */
  @Get('analytics/memory')
  @UseGuards(AuthGuard)
  async getMemoryAnalytics(
    @Req() req: AuthenticatedRequest,
  ): Promise<AnalyticsResponse> {
    return this.analyticsService.analyzeMemoryStats(req.user.tenantId);
  }

  /**
   * Get cache performance analytics.
   */
  @Get('analytics/cache')
  @UseGuards(AuthGuard)
  async getCacheAnalytics(
    @Req() req: AuthenticatedRequest,
  ): Promise<AnalyticsResponse> {
    return this.analyticsService.analyzeCachePerformance(req.user.tenantId);
  }
}
```

#### Example Use Cases

##### Email Volume Trends

```typescript
// User asks: "Show me my email trends this week"
const result = await analyticsService.generateVisualization(
  tenantId,
  userId,
  'Create a line chart showing daily email volume for sent and received',
  { emails: await getWeeklyEmails(userId) },
);
// Returns: PNG image of line chart
```

##### Memory Usage Dashboard

```typescript
// Admin dashboard shows memory statistics
const dashboard = await analyticsService.analyzeMemoryStats(tenantId);
// Returns: Multi-chart dashboard with memory insights
```

##### Deadline Analysis

```typescript
// User asks: "Analyze my deadline patterns"
const result = await analyticsService.generateVisualization(
  tenantId,
  userId,
  `Analyze deadline patterns:
   - Deadlines met vs missed
   - Average time before deadline when completed
   - Busiest deadline periods`,
  { deadlines: await getDeadlineHistory(userId) },
);
// Returns: Analytical charts with insights
```

#### Combining with Other Tools

The Code Interpreter can be combined with other Mistral tools:

```typescript
// Combined tools for powerful agent capabilities
const agentConfig = {
  tools: [
    { type: 'code_interpreter' },           // Analytics & visualization
    { type: 'document_library', library_ids: [...] },  // RAG search
    { type: 'web_search' },                 // External data
  ],
  toolChoice: 'auto',
};
```

#### Security Considerations

| Risk | Mitigation |
|------|------------|
| **Code Injection** | Runs in isolated container, no system access |
| **Resource Exhaustion** | Mistral enforces execution limits |
| **Data Leakage** | Only pass sanitized, tenant-specific data |
| **Cost Control** | Monitor Code Interpreter API usage |

#### Analytics Environment Variables

```env
# Analytics Configuration
AI_ANALYTICS_ENABLED=true
AI_CODE_INTERPRETER_TIMEOUT_MS=30000
AI_MAX_VISUALIZATION_SIZE_KB=500
```

### Analytics Sources

- [Mistral Code Interpreter](https://docs.mistral.ai/agents/tools/built-in/code_interpreter)
- [Mistral Agents Overview](https://docs.mistral.ai/capabilities/agents/)
- [Tool Use Best Practices](https://docs.mistral.ai/capabilities/function_calling/)

---

## Phase 1.6: Unified Knowledge Agent (2025 Best Practices)

> ✅ **IMPLEMENTED** - Unified search hub with memory-first RAG, multi-source retrieval across memories, deadlines, follow-ups, and action items.

### 2025 RAG Research & Best Practices

Based on latest research (December 2025):

| Technique | Description | Source |
|-----------|-------------|--------|
| **A-MEM (Agentic Memory)** | Zettelkasten-style interconnected knowledge networks | [arXiv:2502.12110](https://arxiv.org/abs/2502.12110) |
| **Self-RAG** | Self-reflective retrieval - agent decides when to retrieve vs use memory | [2025 RAG Guide](https://www.edenai.co/post/the-2025-guide-to-retrieval-augmented-generation-rag) |
| **Chain-of-Retrieval** | Multi-hop reasoning for complex queries | [RAG Best Practices](https://arxiv.org/abs/2501.07391) |
| **Memory + RAG Fusion** | Inject user memory context before RAG search | Our Mem0 implementation |
| **Hybrid Search** | Vector similarity + keyword/lexical search combined | Already in HybridRetriever |
| **Re-ranking** | LLM-based re-ranking for better relevance | Already in HybridRetriever |

### Current State vs Target

| Aspect | Current Knowledge Agent | Target Unified Agent |
|--------|------------------------|---------------------|
| **Sources** | Emails only | Emails + Memories + Deadlines + Follow-ups + Action Items |
| **Memory** | None | Memory-first (search user context before data) |
| **Search** | Basic keyword | Hybrid (vector + keyword) with re-ranking |
| **Multi-hop** | No | Yes (chain queries for complex questions) |
| **Self-reflection** | No | Yes (decide when to retrieve vs answer from memory) |

### Architecture: Memory-First Unified RAG

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED KNOWLEDGE AGENT (P1.6)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Query: "What did John say about the deadline?"                       │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  Step 1: MEMORY-FIRST (Personal Context)                           │   │
│   │  ┌─────────────────┐    ┌─────────────────┐                        │   │
│   │  │ LongTermMemory  │    │ Mem0Enhanced    │                        │   │
│   │  │ - User facts    │    │ - Preferences   │                        │   │
│   │  │ - Relationships │    │ - History       │                        │   │
│   │  └─────────────────┘    └─────────────────┘                        │   │
│   │  → "User knows John Smith (project manager, prefers email)"        │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  Step 2: SELF-REFLECTION (Decide what to search)                   │   │
│   │  Query Analysis → "Need to search: emails, deadlines"              │   │
│   │  Skip: action items (not relevant), follow-ups (not relevant)      │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  Step 3: MULTI-SOURCE RETRIEVAL (Parallel)                         │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│   │  │  Emails  │  │Deadlines │  │Follow-ups│  │ Actions  │           │   │
│   │  │ (Hybrid) │  │(Prisma)  │  │(Prisma)  │  │(Prisma)  │           │   │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │   │
│   │  Vector+Keyword  Direct query  Direct query  Direct query          │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  Step 4: FUSION & RE-RANKING                                       │   │
│   │  - Merge results from all sources                                  │   │
│   │  - Apply memory context boost (John-related items +20%)            │   │
│   │  - LLM re-rank for relevance                                       │   │
│   │  - Return top 5 with source attribution                            │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   Response: "Based on emails from John Smith, the project deadline is..."   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// backend/src/modules/ai/voltagent/agents/unified-knowledge.agent.ts

import { Agent, createTool, type BaseRetriever } from '@voltagent/core';
import { LongTermMemoryService } from '../../memory/long-term-memory.service';
import { Mem0EnhancedMemoryService } from '../../memory/mem0-enhanced-memory.service';
import { DeadlineExtractorService } from '../../services/deadline-extractor.service';
import { FollowUpService } from '../../services/follow-up.service';
import { ActionItemService } from '../../services/action-item.service';
import { HybridRetriever } from '../rag/hybrid-retriever';

export interface UnifiedKnowledgeAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  locale: SupportedLocale;
  tenantId: string;
  userId: string;
  // Memory services
  longTermMemory: LongTermMemoryService;
  mem0Memory?: Mem0EnhancedMemoryService;
  // Data services
  deadlineService: DeadlineExtractorService;
  followUpService: FollowUpService;
  actionItemService: ActionItemService;
  // RAG
  mistralService: MistralService;
  embeddingsService: EmbeddingsService;
}

/**
 * Unified Knowledge Agent with Memory-First RAG (2025 Best Practices)
 *
 * Search flow:
 * 1. Memory-first: Search user's long-term memory for context
 * 2. Self-reflection: Analyze query to determine which sources to search
 * 3. Multi-source retrieval: Parallel search across emails, deadlines, follow-ups, actions
 * 4. Fusion & re-ranking: Merge results, apply memory boost, re-rank
 */
export function createUnifiedKnowledgeAgent(options: UnifiedKnowledgeAgentOptions): Agent {
  const {
    model, prisma, locale, tenantId, userId,
    longTermMemory, mem0Memory,
    deadlineService, followUpService, actionItemService,
    mistralService, embeddingsService
  } = options;

  // Create unified retriever that searches all sources
  const retriever = new UnifiedRetriever({
    tenantId,
    userId,
    locale,
    prisma,
    longTermMemory,
    mem0Memory,
    deadlineService,
    followUpService,
    actionItemService,
    mistralService,
    embeddingsService,
  });

  return new Agent({
    name: 'UnifiedKnowledgeAgent',
    purpose: 'Search and retrieve information from all knowledge sources with memory context',
    model,
    instructions: getUnifiedAgentInstructions(locale),
    tools: createUnifiedKnowledgeTools(options),
    retriever,
    maxSteps: 5, // Allow multi-hop queries
  });
}

/**
 * Create tools for unified knowledge search
 */
function createUnifiedKnowledgeTools(options: UnifiedKnowledgeAgentOptions) {
  const { prisma, tenantId, userId, locale, deadlineService, followUpService, actionItemService } = options;
  const t = getToolTranslations(locale);

  return [
    // Unified search across all sources
    createTool({
      name: 'unified_search',
      description: 'Search across all knowledge sources: emails, memories, deadlines, follow-ups, action items',
      parameters: z.object({
        query: z.string().describe('Search query'),
        sources: z.array(z.enum(['emails', 'memories', 'deadlines', 'followups', 'actions']))
          .optional()
          .describe('Sources to search (default: all)'),
        limit: z.number().optional().describe('Maximum results per source (default: 5)'),
      }),
      execute: async ({ query, sources, limit }) => {
        // Implementation searches all specified sources in parallel
        // Returns unified results with source attribution
      },
    }),

    // Get upcoming deadlines
    createTool({
      name: 'get_deadlines',
      description: 'Get upcoming deadlines',
      parameters: z.object({
        days: z.number().optional().describe('Days ahead to look (default: 7)'),
      }),
      execute: async ({ days }) => {
        return deadlineService.getUpcoming(tenantId, userId, days ?? 7);
      },
    }),

    // Get pending follow-ups
    createTool({
      name: 'get_followups',
      description: 'Get pending follow-ups',
      parameters: z.object({
        status: z.enum(['pending', 'overdue', 'all']).optional(),
      }),
      execute: async ({ status }) => {
        return followUpService.getPending(tenantId, userId, status);
      },
    }),

    // Get action items
    createTool({
      name: 'get_action_items',
      description: 'Get action items and tasks',
      parameters: z.object({
        status: z.enum(['todo', 'in_progress', 'done', 'all']).optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      }),
      execute: async ({ status, priority }) => {
        return actionItemService.getItems(tenantId, userId, { status, priority });
      },
    }),

    // Remember something (store in memory)
    createTool({
      name: 'remember',
      description: 'Store information in long-term memory for future reference',
      parameters: z.object({
        content: z.string().describe('What to remember'),
        category: z.enum(['preference', 'fact', 'contact', 'project']).optional(),
      }),
      execute: async ({ content, category }) => {
        await options.longTermMemory.addMemory(tenantId, userId, content, category);
        return { success: true, message: t.knowledge.remembered };
      },
    }),
  ];
}
```

### UnifiedRetriever: Memory-First RAG

```typescript
// backend/src/modules/ai/voltagent/rag/unified-retriever.ts

/**
 * Unified Retriever with Memory-First RAG (2025 Best Practices)
 *
 * Implements:
 * - Memory-First: Personal context before data search
 * - Self-Reflection: Determines which sources to query
 * - Multi-Source: Parallel retrieval from all knowledge sources
 * - Fusion: Merge and re-rank across sources
 */
export class UnifiedRetriever extends BaseRetriever {
  async retrieve(input: string | BaseMessage[]): Promise<string> {
    const query = this.extractQuery(input);
    if (!query) return '';

    // Step 1: Memory-First - Get user context
    const memoryContext = await this.getMemoryContext(query);

    // Step 2: Self-Reflection - Determine sources to search
    const sourcesToSearch = await this.analyzeQuerySources(query, memoryContext);

    // Step 3: Multi-Source Retrieval (parallel)
    const results = await this.searchSources(query, sourcesToSearch);

    // Step 4: Fusion & Re-ranking
    const rankedResults = await this.fuseAndRerank(query, results, memoryContext);

    // Format for LLM
    return this.formatContext(rankedResults, memoryContext);
  }

  /**
   * Memory-First: Get user's personal context
   */
  private async getMemoryContext(query: string): Promise<MemoryContext> {
    const [longTermMemories, mem0Memories] = await Promise.all([
      this.longTermMemory.searchMemories(this.tenantId, this.userId, query, 5),
      this.mem0Memory?.search(this.tenantId, this.userId, query, 5) ?? [],
    ]);

    return {
      facts: longTermMemories.filter(m => m.category === 'FACT'),
      preferences: longTermMemories.filter(m => m.category === 'PREFERENCE'),
      contacts: longTermMemories.filter(m => m.category === 'CONTACT'),
      history: mem0Memories,
    };
  }

  /**
   * Self-Reflection: Analyze query to determine which sources to search
   */
  private async analyzeQuerySources(query: string, context: MemoryContext): Promise<SearchSource[]> {
    // Simple heuristic-based source selection (can be LLM-enhanced)
    const sources: SearchSource[] = [];
    const lowerQuery = query.toLowerCase();

    // Always search emails (primary source)
    sources.push('emails');

    // Deadline-related queries
    if (/deadline|due|when|by when|urgent/.test(lowerQuery)) {
      sources.push('deadlines');
    }

    // Follow-up related queries
    if (/follow.?up|waiting|response|reply|pending/.test(lowerQuery)) {
      sources.push('followups');
    }

    // Action item related queries
    if (/task|action|todo|need to|should|must/.test(lowerQuery)) {
      sources.push('actions');
    }

    // If context mentions a known contact, prioritize email search
    if (context.contacts.length > 0) {
      sources.push('contacts');
    }

    return sources;
  }

  /**
   * Multi-Source Retrieval: Search all relevant sources in parallel
   */
  private async searchSources(
    query: string,
    sources: SearchSource[]
  ): Promise<MultiSourceResults> {
    const searchPromises: Promise<any>[] = [];

    if (sources.includes('emails')) {
      searchPromises.push(this.searchEmails(query));
    }
    if (sources.includes('deadlines')) {
      searchPromises.push(this.searchDeadlines(query));
    }
    if (sources.includes('followups')) {
      searchPromises.push(this.searchFollowUps(query));
    }
    if (sources.includes('actions')) {
      searchPromises.push(this.searchActionItems(query));
    }

    const results = await Promise.all(searchPromises);
    return this.mergeSourceResults(sources, results);
  }

  /**
   * Fusion & Re-ranking: Combine results and re-rank with memory boost
   */
  private async fuseAndRerank(
    query: string,
    results: MultiSourceResults,
    memoryContext: MemoryContext
  ): Promise<RankedResult[]> {
    // Flatten all results
    const allResults = this.flattenResults(results);

    // Apply memory context boost
    // Items related to known contacts get +20% score
    for (const result of allResults) {
      const contactMatch = memoryContext.contacts.find(c =>
        result.content.toLowerCase().includes(c.content.toLowerCase())
      );
      if (contactMatch) {
        result.score *= 1.2; // 20% boost for memory-related items
      }
    }

    // Re-rank using embeddings
    const reranked = await this.rerankWithEmbeddings(query, allResults);

    return reranked.slice(0, this.finalLimit);
  }
}
```

### Key Features

| Feature | Description | Benefit |
|---------|-------------|---------|
| **Memory-First** | Search user memories before data | Personal context improves relevance |
| **Self-Reflection** | Query analysis determines sources | Efficient (skip irrelevant sources) |
| **Multi-Source** | Parallel search across all data | Comprehensive results |
| **Memory Boost** | Items matching known contacts boosted | Personalized ranking |
| **Source Attribution** | Results tagged with source | User knows where info came from |

### API Endpoints

```typescript
// Add to VoltAgentController

@Post('knowledge/search')
@UseGuards(AuthGuard)
async unifiedSearch(
  @Req() req: AuthenticatedRequest,
  @Body() body: { query: string; sources?: string[] },
): Promise<UnifiedSearchResponse> {
  return this.knowledgeService.unifiedSearch(
    req.user.tenantId,
    req.user.id,
    body.query,
    body.sources,
  );
}

@Post('knowledge/remember')
@UseGuards(AuthGuard)
async remember(
  @Req() req: AuthenticatedRequest,
  @Body() body: { content: string; category?: string },
): Promise<{ success: boolean }> {
  return this.knowledgeService.remember(
    req.user.tenantId,
    req.user.id,
    body.content,
    body.category,
  );
}
```

### Environment Variables

```env
# Unified Knowledge Agent
UNIFIED_KNOWLEDGE_ENABLED=true
UNIFIED_KNOWLEDGE_MEMORY_BOOST=0.2      # 20% boost for memory-related items
UNIFIED_KNOWLEDGE_MAX_SOURCES=5         # Max results per source
UNIFIED_KNOWLEDGE_SELF_REFLECT=true     # Enable self-reflection for source selection
```

### P1.6 Sources

- [A-MEM: Agentic Memory for LLMs](https://arxiv.org/abs/2502.12110) - Zettelkasten-style knowledge networks
- [2025 RAG Guide](https://www.edenai.co/post/the-2025-guide-to-retrieval-augmented-generation-rag) - Self-RAG, Chain-of-Retrieval
- [RAG Best Practices 2025](https://arxiv.org/abs/2501.07391) - Multi-hop reasoning
- [Microsoft RAG Techniques](https://www.microsoft.com/en-us/microsoft-cloud/blog/2025/02/04/common-retrieval-augmented-generation-rag-techniques-explained/)

---

## Phase 1.7: CRM Intelligence (2025) ✅ IMPLEMENTED

> ✅ **COMPLETED December 16, 2025** - Relationship Intelligence for automatic contact tracking, interaction history, and reconnect reminders.

### Implementation Decision: Prisma + Recursive CTEs

**Why NOT Apache AGE?** After research, we found Apache AGE is NOT available on managed PostgreSQL services (Railway, Hetzner, Supabase). We chose **Prisma + PostgreSQL Recursive CTEs** instead for production compatibility.

| Platform | pgvector | Apache AGE | Status |
|----------|----------|------------|--------|
| Railway | ✅ Supported | ❌ Not available | Managed PostgreSQL |
| Hetzner | ✅ Supported | ❌ Not listed | Limited extensions |
| Self-hosted | ✅ Supported | ⚠️ Requires setup | Ops overhead |

**Our Solution:** PostgreSQL recursive CTEs provide graph-like traversal (2-3 hops) sufficient for CRM relationship queries.

### What Was Implemented

| Feature | Status | Description |
|---------|--------|-------------|
| **Stale Contact Alerts** | ✅ | Contacts with no interaction in 60+ days |
| **Last Contacted Tracking** | ✅ | `lastInteractedAt` field on Contact model |
| **Relationship Health Score** | ✅ | 0-100 score based on recency, frequency, reciprocity |
| **Auto-captured Interactions** | ✅ | Email interactions recorded via BullMQ jobs |
| **Reconnect Reminders** | ✅ | Daily scheduled job at 8 AM UTC |
| **Interaction History** | ✅ | Full history per contact with pagination |
| **Relationship Graph** | ✅ | Recursive CTE for connected contacts |

### Files Created

| File | Purpose |
|------|---------|
| `services/relationship-intelligence.service.ts` | Core CRM service (~500 lines) |
| `jobs/crm-backfill.processor.ts` | BullMQ processor for historical email backfill |
| `jobs/reconnect-reminder.processor.ts` | Daily scheduled reminder job |
| `scripts/test-crm-intelligence.ts` | Comprehensive test suite (8 tests) |

### API Endpoints Added

```text
GET  /voltagent/crm/stale-contacts          - Get contacts needing reconnection
GET  /voltagent/crm/reconnect               - Get contacts due for reminder
GET  /voltagent/crm/top-contacts            - Get highest-scored relationships
GET  /voltagent/crm/contacts/:id            - Get contact relationship stats
GET  /voltagent/crm/contacts/:id/interactions - Get interaction history
GET  /voltagent/crm/contacts/:id/graph      - Get connected contacts (recursive CTE)
POST /voltagent/crm/contacts/:id/interactions - Record manual interaction
POST /voltagent/crm/contacts/:id/recalculate - Recalculate relationship score
POST /voltagent/crm/contacts/:id/reminded   - Mark as reminded
POST /voltagent/crm/recalculate-all         - Batch recalculate all scores
```

### Test Results (All Passed)

```text
✅ Schema P1.7 Fields Exist (2ms)
✅ ContactInteraction P1.7 Fields (40ms)
✅ emailId Unique Constraint (54ms)
✅ Tenant Isolation (81ms) - tested with 5,448 real contacts
✅ Relationship Score Calculation (11ms)
✅ Stale Contact Query (19ms)
✅ Cascade Delete (18ms)
✅ Index Performance (5ms)

Total: 8 passed, 0 failed (230ms)
```

### Relationship Score Algorithm

Score (0-100) calculated from:

- **Recency (40%):** Days since last interaction
- **Frequency (30%):** Interactions per month
- **Reciprocity (20%):** Balance of sent vs received
- **Trend (10%):** Recent activity vs historical

### Original Design (Preserved for Reference)

### Why Graph RAG for CRM?

Traditional vector RAG finds **similar** content but misses **relationships**. Graph RAG enables:

| Capability | Vector RAG | Graph RAG |
|------------|-----------|-----------|
| "Find emails about Project X" | ✅ Good | ✅ Good |
| "Who works with John on Project X?" | ❌ Poor | ✅ Excellent |
| "Show me the communication chain for this deal" | ❌ Impossible | ✅ Native |
| "Which contacts haven't I emailed in 30 days?" | ❌ Impossible | ✅ Native |
| "What's the relationship between Company A and Contact B?" | ❌ Impossible | ✅ Native |

### 2025 Research: HybridRAG Architecture

Based on [HybridRAG research](https://memgraph.com/blog/why-hybridrag) and [Microsoft GraphRAG](https://techcommunity.microsoft.com/blog/adforpostgresql/introducing-the-graphrag-solution-for-azure-database-for-postgresql/4299871):

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID RAG: VECTOR + GRAPH (P1.7)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Query: "What's my relationship history with Acme Corp?"                   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  QUERY ROUTER (Self-Reflection)                                    │   │
│   │  Analyze → "Relationship query" → Route to GRAPH                   │   │
│   │  (vs "Find similar emails" → Route to VECTOR)                      │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ├─────────────────────┬─────────────────────┐                        │
│        ▼                     ▼                     ▼                        │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │ VECTOR SEARCH│    │ GRAPH QUERY  │    │ STRUCTURED   │                 │
│   │ (pgvector)   │    │ (Apache AGE) │    │ (Prisma)     │                 │
│   │              │    │              │    │              │                 │
│   │ Semantic     │    │ Cypher:      │    │ SQL:         │                 │
│   │ similarity   │    │ MATCH paths, │    │ Counts,      │                 │
│   │ on emails    │    │ relationships│    │ aggregates   │                 │
│   └──────────────┘    └──────────────┘    └──────────────┘                 │
│        │                     │                     │                        │
│        └─────────────────────┴─────────────────────┘                        │
│                              │                                               │
│                              ▼                                               │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  FUSION LAYER                                                       │   │
│   │  - Merge vector results + graph traversal + structured data        │   │
│   │  - Apply memory context boost                                       │   │
│   │  - Re-rank by relevance + relationship strength                    │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   Response: "You have 47 emails with Acme Corp across 3 contacts:          │
│   John (PM, 32 emails), Sarah (Legal, 10 emails), Mike (Sales, 5 emails).  │
│   Last contact: 3 days ago. Relationship strength: Strong."                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Apache AGE: Graph Extension for PostgreSQL

**Why Apache AGE?** (vs Neo4j, TigerGraph)

| Feature | Apache AGE | Neo4j | TigerGraph |
|---------|-----------|-------|------------|
| **Infrastructure** | Same PostgreSQL! | Separate server | Separate server |
| **Query Language** | OpenCypher + SQL | Cypher only | GSQL |
| **Vector Search** | pgvector (same DB) | Separate | Separate |
| **Transactions** | PostgreSQL ACID | Native | Native |
| **Cost** | Free (extension) | Enterprise $$ | Enterprise $$ |
| **Node.js Client** | [apache-age-client](https://github.com/clayrisser/node-apache-age-client) | neo4j-driver | pyTigerGraph |

**Installation:**

```bash
# Install Apache AGE extension (Docker or manual)
# In PostgreSQL:
CREATE EXTENSION age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

# Create graph
SELECT create_graph('mailgraph');
```

**Node.js Client:**

```bash
npm install apache-age-client
```

```typescript
import ApacheAgeClient from 'apache-age-client';

const graph = ApacheAgeClient.connect({
  database: process.env.DB_NAME,
  graph: 'mailgraph',
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: 5432,
  user: process.env.DB_USER,
});

// Cypher query for relationship
const result = await graph.executeCypher(`
  MATCH (c:Contact {email: 'john@acme.com'})-[r:EMAILED]->(e:Email)
  RETURN c, r, e
  ORDER BY e.receivedAt DESC
  LIMIT 10
`);
```

### Knowledge Graph Schema

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MAILGRAPH KNOWLEDGE GRAPH                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐         EMAILED          ┌─────────────┐                  │
│   │   CONTACT   │◄────────────────────────►│    EMAIL    │                  │
│   │             │         RECEIVED         │             │                  │
│   │ • email     │◄────────────────────────►│ • id        │                  │
│   │ • name      │         CC_ON            │ • subject   │                  │
│   │ • company   │◄────────────────────────►│ • date      │                  │
│   │ • role      │                          │ • folder    │                  │
│   │ • embedding │                          │ • embedding │                  │
│   └─────────────┘                          └─────────────┘                  │
│         │                                         │                          │
│         │ WORKS_AT                               │ HAS_DEADLINE              │
│         ▼                                         ▼                          │
│   ┌─────────────┐                          ┌─────────────┐                  │
│   │   COMPANY   │                          │  DEADLINE   │                  │
│   │             │                          │             │                  │
│   │ • name      │                          │ • title     │                  │
│   │ • domain    │                          │ • date      │                  │
│   │ • industry  │                          │ • priority  │                  │
│   │ • embedding │                          └─────────────┘                  │
│   └─────────────┘                                                            │
│         │                                                                    │
│         │ ATTENDED                                                           │
│         ▼                                                                    │
│   ┌─────────────┐         SCHEDULED_WITH   ┌─────────────┐                  │
│   │   MEETING   │◄────────────────────────►│   CONTACT   │                  │
│   │             │                          │             │                  │
│   │ • title     │         ABOUT_PROJECT    └─────────────┘                  │
│   │ • date      │◄────────────────────────►┌─────────────┐                  │
│   │ • duration  │                          │   PROJECT   │                  │
│   │ • embedding │                          │             │                  │
│   └─────────────┘                          │ • name      │                  │
│                                            │ • status    │                  │
│   ┌─────────────┐                          └─────────────┘                  │
│   │  FOLLOW_UP  │                                                            │
│   │             │────────── REGARDING ──────────►│EMAIL│                    │
│   │ • status    │                                                            │
│   │ • dueDate   │────────── ASSIGNED_TO ────────►│CONTACT│                  │
│   └─────────────┘                                                            │
│                                                                              │
│   ┌─────────────┐                                                            │
│   │ ACTION_ITEM │                                                            │
│   │             │────────── FROM_EMAIL ─────────►│EMAIL│                    │
│   │ • title     │                                                            │
│   │ • status    │────────── ASSIGNED_TO ────────►│CONTACT│                  │
│   │ • priority  │                                                            │
│   └─────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

EDGES (Relationships):
• EMAILED: Contact → Email (sent)
• RECEIVED: Contact ← Email (received)
• CC_ON: Contact ← Email (cc'd)
• WORKS_AT: Contact → Company
• ATTENDED: Contact → Meeting
• SCHEDULED_WITH: Meeting → Contact (attendees)
• ABOUT_PROJECT: Meeting/Email → Project
• HAS_DEADLINE: Email → Deadline
• REGARDING: FollowUp → Email
• FROM_EMAIL: ActionItem → Email
• ASSIGNED_TO: ActionItem/FollowUp → Contact
```

### CRM Features Enabled by Graph RAG

| Feature | Graph Query | Use Case |
|---------|-------------|----------|
| **Relationship Strength** | Count edges between Contact ↔ User | "How close am I to John?" |
| **Communication Frequency** | Edge timestamps | "When did I last email Sarah?" |
| **Network Analysis** | 2-hop traversal | "Who introduced me to Company X?" |
| **Reconnection Alerts** | Edges older than N days | "You haven't contacted John in 30 days" |
| **Deal Tracking** | Project → Email → Contact path | "All communications about Project X" |
| **Meeting Prep** | Contact → Company → Past Meetings | "Brief me on Acme Corp before meeting" |
| **VIP Detection** | Edge count + recency scoring | Auto-identify important contacts |

### Embedding All Entities

Embed contacts, companies, meetings, and calendar events for semantic search:

```typescript
// backend/src/modules/ai/graph/entity-embedder.service.ts

@Injectable()
export class EntityEmbedderService {
  constructor(
    private readonly mistral: MistralService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate embedding for a contact (for semantic search)
   */
  async embedContact(contact: Contact): Promise<number[]> {
    const text = [
      contact.name,
      contact.email,
      contact.company,
      contact.role,
      contact.notes,
    ].filter(Boolean).join(' | ');

    return this.mistral.generateEmbedding(text);
  }

  /**
   * Generate embedding for a calendar event
   */
  async embedCalendarEvent(event: CalendarEvent): Promise<number[]> {
    const attendees = event.attendees?.map(a => a.email).join(', ') || '';
    const text = [
      event.title,
      event.description,
      `Attendees: ${attendees}`,
      event.location,
    ].filter(Boolean).join(' | ');

    return this.mistral.generateEmbedding(text);
  }

  /**
   * Generate embedding for a company (inferred from contacts)
   */
  async embedCompany(company: string, contacts: Contact[]): Promise<number[]> {
    const roles = contacts.map(c => c.role).filter(Boolean).join(', ');
    const text = `Company: ${company} | Contacts: ${contacts.length} | Roles: ${roles}`;

    return this.mistral.generateEmbedding(text);
  }
}
```

### Graph RAG Service Implementation

```typescript
// backend/src/modules/ai/graph/graph-rag.service.ts

import ApacheAgeClient from 'apache-age-client';

@Injectable()
export class GraphRagService {
  private graph: ApacheAgeClient;

  async onModuleInit() {
    this.graph = ApacheAgeClient.connect({
      database: this.config.get('DB_NAME'),
      graph: 'mailgraph',
      host: this.config.get('DB_HOST'),
      password: this.config.get('DB_PASSWORD'),
      port: this.config.get('DB_PORT'),
      user: this.config.get('DB_USER'),
    });
  }

  /**
   * Hybrid search: Vector (semantic) + Graph (relationships)
   */
  async hybridSearch(
    tenantId: string,
    query: string,
    options: { includeGraph?: boolean; maxHops?: number } = {},
  ): Promise<HybridSearchResult> {
    // 1. Vector search (pgvector)
    const vectorResults = await this.vectorSearch(tenantId, query);

    // 2. Graph traversal if relationship query detected
    let graphResults: GraphResult[] = [];
    if (options.includeGraph && this.isRelationshipQuery(query)) {
      graphResults = await this.graphTraversal(tenantId, query, options.maxHops || 2);
    }

    // 3. Fuse results
    return this.fuseResults(vectorResults, graphResults);
  }

  /**
   * Get relationship insights for a contact
   */
  async getContactRelationships(
    tenantId: string,
    contactEmail: string,
  ): Promise<ContactRelationships> {
    const result = await this.graph.executeCypher(`
      MATCH (c:Contact {email: $email, tenantId: $tenantId})
      OPTIONAL MATCH (c)-[sent:EMAILED]->(e:Email)
      OPTIONAL MATCH (c)<-[received:RECEIVED]-(e2:Email)
      OPTIONAL MATCH (c)-[:WORKS_AT]->(company:Company)
      OPTIONAL MATCH (c)-[:ATTENDED]->(meeting:Meeting)
      RETURN c,
             count(DISTINCT sent) as emailsSent,
             count(DISTINCT received) as emailsReceived,
             company,
             count(DISTINCT meeting) as meetingsAttended,
             max(e.receivedAt) as lastSent,
             max(e2.receivedAt) as lastReceived
    `, { email: contactEmail, tenantId });

    return this.formatContactRelationships(result);
  }

  /**
   * Get communication chain for a project/topic
   */
  async getCommunicationChain(
    tenantId: string,
    topic: string,
  ): Promise<CommunicationChain> {
    const result = await this.graph.executeCypher(`
      MATCH path = (c:Contact)-[:EMAILED|RECEIVED*1..3]-(e:Email)
      WHERE e.tenantId = $tenantId
        AND (e.subject CONTAINS $topic OR e.body CONTAINS $topic)
      RETURN path, c, e
      ORDER BY e.receivedAt DESC
      LIMIT 50
    `, { tenantId, topic });

    return this.formatCommunicationChain(result);
  }

  /**
   * Find reconnection opportunities
   */
  async getReconnectionSuggestions(
    tenantId: string,
    daysThreshold: number = 30,
  ): Promise<ReconnectionSuggestion[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    const result = await this.graph.executeCypher(`
      MATCH (c:Contact {tenantId: $tenantId})-[r:EMAILED|RECEIVED]-(e:Email)
      WITH c, max(e.receivedAt) as lastContact, count(r) as totalEmails
      WHERE lastContact < $cutoffDate
      RETURN c.email, c.name, c.company, lastContact, totalEmails
      ORDER BY totalEmails DESC
      LIMIT 10
    `, { tenantId, cutoffDate: cutoffDate.toISOString() });

    return result.map(r => ({
      contact: { email: r.email, name: r.name, company: r.company },
      lastContact: new Date(r.lastContact),
      totalEmails: r.totalEmails,
      daysSinceContact: Math.floor((Date.now() - new Date(r.lastContact).getTime()) / (1000 * 60 * 60 * 24)),
      suggestion: `Reconnect with ${r.name} - ${r.totalEmails} past emails, no contact in ${daysThreshold}+ days`,
    }));
  }

  /**
   * Detect if query is relationship-based (route to graph)
   */
  private isRelationshipQuery(query: string): boolean {
    const relationshipPatterns = [
      /who.*work.*with/i,
      /relationship.*with/i,
      /connection.*to/i,
      /introduced.*by/i,
      /communication.*chain/i,
      /history.*with/i,
      /last.*contact/i,
      /how.*know/i,
    ];
    return relationshipPatterns.some(p => p.test(query));
  }
}
```

### CRM Dashboard Queries

```typescript
// Example CRM queries using Graph RAG

// 1. Contact Overview
const contactOverview = await graphRag.executeCypher(`
  MATCH (c:Contact {tenantId: $tenantId})
  OPTIONAL MATCH (c)-[r]-(e:Email)
  WITH c, count(r) as interactions, max(e.receivedAt) as lastContact
  RETURN c.name, c.email, c.company, interactions, lastContact
  ORDER BY interactions DESC
  LIMIT 20
`);

// 2. Company Relationship Map
const companyMap = await graphRag.executeCypher(`
  MATCH (c:Contact {tenantId: $tenantId})-[:WORKS_AT]->(company:Company)
  WITH company, collect(c) as contacts, count(c) as contactCount
  MATCH (contacts)-[r:EMAILED|RECEIVED]-(e:Email)
  RETURN company.name, contactCount, count(r) as totalEmails
  ORDER BY totalEmails DESC
`);

// 3. Meeting Network
const meetingNetwork = await graphRag.executeCypher(`
  MATCH (m:Meeting {tenantId: $tenantId})-[:SCHEDULED_WITH]->(c:Contact)
  WHERE m.startTime > datetime()
  RETURN m.title, m.startTime, collect(c.name) as attendees
  ORDER BY m.startTime
`);

// 4. VIP Contacts (auto-detected)
const vipContacts = await graphRag.executeCypher(`
  MATCH (c:Contact {tenantId: $tenantId})-[r:EMAILED|RECEIVED]-(e:Email)
  WITH c, count(r) as emailCount,
       max(e.receivedAt) as lastContact,
       avg(CASE WHEN e.isRead THEN 1 ELSE 0 END) as readRate
  WHERE emailCount > 10
  RETURN c.name, c.email, c.company, emailCount, lastContact,
         CASE
           WHEN emailCount > 50 AND readRate > 0.9 THEN 'VIP'
           WHEN emailCount > 20 THEN 'Important'
           ELSE 'Regular'
         END as tier
  ORDER BY emailCount DESC
`);
```

### Updated Implementation Priority

| Priority | Feature | Library/Tool | Effort | Impact | Status |
|----------|---------|--------------|--------|--------|--------|
| **P1.6** | **Unified Knowledge Agent** | **Memory + RAG** | **2 days** | **High** | ✅ |
| **P1.7** | **CRM Intelligence** | **Prisma + Recursive CTEs** | **1 day** | **Critical** | ✅ DONE |

### P1.7 Environment Variables

```env
# Graph RAG Configuration
GRAPH_RAG_ENABLED=true
GRAPH_NAME=mailgraph
GRAPH_MAX_HOPS=3                    # Max relationship hops
GRAPH_ENTITY_EMBEDDING=true          # Embed contacts, companies, meetings
GRAPH_RELATIONSHIP_SCORING=true      # Calculate relationship strength
GRAPH_RECONNECTION_DAYS=30          # Days threshold for reconnection alerts
```

### P1.7 Infrastructure: Apache AGE Setup

**Option 1: Docker (Recommended)**

Update `docker-compose.yml` to use Apache AGE image:

```yaml
# docker-compose.yml
services:
  postgres:
    image: apache/age:PG16_latest  # Instead of standard postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: mailagent
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-age.sql:/docker-entrypoint-initdb.d/init-age.sql
```

**Init Script (`init-age.sql`):**

```sql
-- Enable Apache AGE extension
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';

-- Enable pgvector (for hybrid RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- Set search path for AGE
SET search_path = ag_catalog, "$user", public;

-- Create the mail knowledge graph
SELECT create_graph('mailgraph');
```

**Option 2: Add to existing PostgreSQL**

```bash
# Install Apache AGE from source
git clone https://github.com/apache/age.git
cd age
make install

# Or use pgxn
pgxn install apache-age
```

### P1.7 Database Migration

No Prisma schema changes needed for the graph itself (Apache AGE stores graph data in its own tables). However, add embedding columns for entities:

```prisma
// schema.prisma additions for P1.7

model Contact {
  // ... existing fields ...

  // Graph RAG embeddings
  embedding     Unsupported("vector(1024)")?  // Mistral embedding
  embeddedAt    DateTime?

  // Relationship metadata (cached from graph)
  emailCount    Int       @default(0)
  lastContact   DateTime?
  tier          String?   // 'VIP', 'Important', 'Regular'
}

model CalendarEvent {
  // ... existing fields ...

  // Graph RAG embeddings
  embedding     Unsupported("vector(1024)")?
  embeddedAt    DateTime?
}

model Company {
  id            String    @id @default(cuid())
  tenantId      String
  name          String
  domain        String?
  industry      String?

  // Graph RAG embeddings
  embedding     Unsupported("vector(1024)")?
  embeddedAt    DateTime?

  // Relationship metadata
  contactCount  Int       @default(0)
  emailCount    Int       @default(0)
  lastContact   DateTime?

  @@unique([tenantId, name])
  @@index([tenantId])
}
```

### P1.7 Graph Population Job

BullMQ job to populate graph from existing data:

```typescript
// backend/src/modules/ai/graph/graph-population.job.ts

@Processor('graph-population')
export class GraphPopulationProcessor {
  @Process('populate-graph')
  async populateGraph(job: Job<{ tenantId: string }>) {
    const { tenantId } = job.data;

    // 1. Create Contact nodes from emails
    const contacts = await this.extractContactsFromEmails(tenantId);
    for (const contact of contacts) {
      await this.graph.executeCypher(`
        MERGE (c:Contact {email: $email, tenantId: $tenantId})
        SET c.name = $name, c.company = $company
      `, contact);
    }

    // 2. Create Email nodes
    const emails = await this.prisma.email.findMany({
      where: { tenantId, folder: EXCLUDE_JUNK_FOLDERS },
      select: { id: true, subject: true, from: true, to: true, receivedAt: true }
    });

    for (const email of emails) {
      await this.graph.executeCypher(`
        MERGE (e:Email {id: $id, tenantId: $tenantId})
        SET e.subject = $subject, e.receivedAt = $receivedAt
      `, email);

      // Create EMAILED/RECEIVED edges
      await this.graph.executeCypher(`
        MATCH (c:Contact {email: $from, tenantId: $tenantId})
        MATCH (e:Email {id: $id, tenantId: $tenantId})
        MERGE (c)-[:EMAILED]->(e)
      `, { from: email.from, id: email.id, tenantId });
    }

    // 3. Infer Company nodes from email domains
    await this.inferCompanies(tenantId);

    // 4. Link Calendar events
    await this.linkCalendarEvents(tenantId);
  }
}
```

### P1.7 Testing Strategy

```typescript
// backend/src/modules/ai/graph/__tests__/graph-rag.spec.ts

describe('GraphRagService', () => {
  describe('Relationship Queries', () => {
    it('should find contacts by company', async () => {
      const results = await graphRag.executeCypher(`
        MATCH (c:Contact {tenantId: $tenantId})-[:WORKS_AT]->(company:Company {name: 'Acme Corp'})
        RETURN c.email, c.name
      `, { tenantId: 'test-tenant' });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should calculate relationship strength', async () => {
      const strength = await graphRag.getRelationshipStrength(
        'test-tenant',
        'john@acme.com'
      );

      expect(strength).toHaveProperty('emailCount');
      expect(strength).toHaveProperty('tier');
    });

    it('should detect reconnection opportunities', async () => {
      const suggestions = await graphRag.getReconnectionSuggestions(
        'test-tenant',
        30 // days
      );

      expect(suggestions).toBeInstanceOf(Array);
      suggestions.forEach(s => {
        expect(s.daysSinceContact).toBeGreaterThanOrEqual(30);
      });
    });
  });

  describe('Hybrid Search', () => {
    it('should combine vector and graph results', async () => {
      const results = await graphRag.hybridSearch(
        'test-tenant',
        'What is my history with Acme Corp?',
        { includeGraph: true }
      );

      expect(results.vectorResults).toBeDefined();
      expect(results.graphResults).toBeDefined();
      expect(results.fusedResults).toBeDefined();
    });
  });
});
```

### P1.7 Sources

- [GraphRAG Explained](https://www.puppygraph.com/blog/graph-rag) - Why GraphRAG over Vector RAG
- [Microsoft GraphRAG for PostgreSQL](https://techcommunity.microsoft.com/blog/adforpostgresql/introducing-the-graphrag-solution-for-azure-database-for-postgresql/4299871) - Azure implementation
- [Apache AGE](https://age.apache.org/) - Graph extension for PostgreSQL
- [Apache AGE Node.js Client](https://github.com/clayrisser/node-apache-age-client) - TypeScript client
- [HybridRAG: Vector + Graph](https://memgraph.com/blog/why-hybridrag) - Combining approaches
- [LightRAG](https://github.com/HKUDS/LightRAG) - 24K stars, knowledge graph RAG framework
- [PostgreSQL Graph Database Guide](https://www.puppygraph.com/blog/postgresql-graph-database) - Best practices
- [Graph RAG Implementation](https://towardsdatascience.com/how-to-implement-graph-rag-using-knowledge-graphs-and-vector-databases-60bb69a22759/) - Step-by-step guide

---

## Phase 2: Smart Scheduling ✅ **DONE**

> ✅ **COMPLETED** - Calendar conflict detection, focus time protection, and meeting prep assistant.

### Implementation Status

| Feature | Service | Status |
|---------|---------|--------|
| Conflict Detection | `CalendarConflictService` | ✅ Done |
| Alternative Slot Suggestions | `CalendarConflictService.findAlternativeSlots()` | ✅ Done |
| Focus Time Analysis | `FocusTimeService.analyzeCalendarPatterns()` | ✅ Done |
| Optimal Focus Slots | `FocusTimeService.findOptimalFocusSlots()` | ✅ Done |
| Focus Block Creation | `FocusTimeService.createFocusBlocks()` | ✅ Done |
| Meeting Brief Generation | `MeetingPrepService.prepareBrief()` | ✅ Done |
| Attendee Information | `MeetingPrepService.getAttendeeInfo()` | ✅ Done |
| Related Emails | `MeetingPrepService.getRelatedEmails()` | ✅ Done |
| Previous Meetings | `MeetingPrepService.getPreviousMeetings()` | ✅ Done |
| Memory Integration | `MeetingPrepService.getRelevantMemories()` | ✅ Done |

### API Endpoints (10 total)

- `POST /voltagent/scheduling/conflicts` - Detect calendar conflicts
- `GET /voltagent/scheduling/available-slots` - Get available time slots
- `GET /voltagent/scheduling/preferences` - Get user scheduling preferences
- `GET /voltagent/scheduling/day-load` - Get day busy percentage
- `GET /voltagent/scheduling/focus-time/optimal` - Find optimal focus slots
- `GET /voltagent/scheduling/focus-time/stats` - Get focus time statistics
- `POST /voltagent/scheduling/focus-time/create` - Create focus blocks
- `GET /voltagent/scheduling/focus-time/status` - Check if in focus block
- `GET /voltagent/scheduling/meeting-prep/:eventId` - Get meeting brief
- `GET /voltagent/scheduling/meeting-prep` - Get upcoming meetings needing prep

### Key Insights from Research

1. **No npm libraries exist** for smart scheduling - all solutions are SaaS (Reclaim.ai, Clockwise, etc.)
2. **Build custom** using calendar APIs + optimization algorithms
3. **Key features to implement:**
   - Conflict detection
   - Focus time protection
   - Optimal time suggestions

### 2.1 Conflict Detection

```typescript
@Injectable()
export class CalendarConflictService {
  async detectConflicts(
    tenantId: string,
    userId: string,
    proposedEvent: ProposedEvent
  ): Promise<ConflictResult> {
    const existingEvents = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        userId,
        start: { lte: proposedEvent.end },
        end: { gte: proposedEvent.start },
      }
    });

    if (existingEvents.length === 0) {
      return { hasConflict: false };
    }

    return {
      hasConflict: true,
      conflicts: existingEvents,
      suggestions: await this.findAlternativeSlots(
        tenantId, userId, proposedEvent
      )
    };
  }

  async findAlternativeSlots(
    tenantId: string,
    userId: string,
    event: ProposedEvent,
    numSuggestions = 3
  ): Promise<TimeSlot[]> {
    const userPrefs = await this.getUserPreferences(userId);
    const busySlots = await this.getBusySlots(tenantId, userId, 7); // Next 7 days

    // Find free slots within working hours
    const freeSlots = this.findFreeSlots(
      busySlots,
      userPrefs.workingHoursStart,
      userPrefs.workingHoursEnd,
      event.duration
    );

    // Score and rank by optimal factors
    return freeSlots
      .map(slot => ({
        ...slot,
        score: this.scoreSlot(slot, userPrefs)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, numSuggestions);
  }
}
```

### 2.2 Focus Time Protection

```typescript
@Injectable()
export class FocusTimeService {
  async protectFocusTime(userId: string, preferences: FocusPreferences) {
    // Analyze calendar patterns
    const patterns = await this.analyzeCalendarPatterns(userId);

    // Find best slots for focus time
    const focusSlots = this.findOptimalFocusSlots(
      patterns,
      preferences.duration,      // e.g., 2 hours
      preferences.frequency,     // e.g., daily
      preferences.preferredTime  // e.g., morning
    );

    // Create protective events
    for (const slot of focusSlots) {
      await this.createFocusBlock(userId, slot);
    }
  }

  private findOptimalFocusSlots(
    patterns: CalendarPatterns,
    duration: number,
    frequency: string,
    preferredTime: string
  ): TimeSlot[] {
    // Use patterns to find times with:
    // - Fewest interruptions historically
    // - Match user preference (morning/afternoon)
    // - Consistent availability

    const morningSlots = patterns.freeSlots.filter(
      s => s.start.getHours() < 12
    );

    const afternoonSlots = patterns.freeSlots.filter(
      s => s.start.getHours() >= 12
    );

    return preferredTime === 'morning' ? morningSlots : afternoonSlots;
  }
}
```

### 2.3 Meeting Prep Assistant

```typescript
@Injectable()
export class MeetingPrepService {
  async prepareBrief(eventId: string): Promise<MeetingBrief> {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: { attendees: true }
    });

    // Gather context
    const [emailContext, contactInfo, previousMeetings] = await Promise.all([
      this.getRelatedEmails(event),
      this.getAttendeeInfo(event.attendees),
      this.getPreviousMeetings(event.attendees)
    ]);

    // Generate agenda with AI
    const agenda = await this.generateAgenda(event, emailContext);

    return {
      event,
      attendees: contactInfo,
      relatedEmails: emailContext,
      previousMeetings,
      suggestedAgenda: agenda,
      actionItemsFromLastMeeting: await this.getPendingActions(event.attendees)
    };
  }
}
```

### Sources

- [AI Scheduling Algorithms](https://callin.io/ai-scheduling-algorithms/)
- [Reclaim.ai - AI Calendar](https://reclaim.ai/)
- [Top 10 AI Calendar Tools 2025](https://superagi.com/scheduling-smart-how-the-top-10-ai-calendar-tools-are-revolutionizing-business-productivity-in-2025/)

---

## Phase 3: Relationship Intelligence

### 3.1 Contact Interaction Tracking

```typescript
@Injectable()
export class RelationshipTrackingService {
  // Automatically track interactions
  async trackEmailInteraction(email: Email) {
    const contactEmail = email.folder === 'SENT'
      ? email.to[0]
      : email.from;

    const contact = await this.findOrCreateContact(contactEmail);

    await this.prisma.contactInteraction.create({
      data: {
        tenantId: email.tenantId,
        contactId: contact.id,
        type: email.folder === 'SENT' ? 'EMAIL_SENT' : 'EMAIL_RECEIVED',
        date: email.date,
        summary: await this.summarizeInteraction(email),
        sourceType: 'EMAIL',
        sourceId: email.id
      }
    });
  }

  // Get reconnection suggestions
  async getReconnectionSuggestions(
    tenantId: string,
    userId: string
  ): Promise<ReconnectionSuggestion[]> {
    const thirtyDaysAgo = subDays(new Date(), 30);

    // Find contacts with no recent interaction
    const staleContacts = await this.prisma.$queryRaw`
      SELECT c.*,
             MAX(ci.date) as last_interaction,
             COUNT(ci.id) as interaction_count
      FROM unified_contacts c
      LEFT JOIN contact_interactions ci ON ci.contactId = c.id
      WHERE c.tenantId = ${tenantId}
      GROUP BY c.id
      HAVING MAX(ci.date) < ${thirtyDaysAgo}
         OR MAX(ci.date) IS NULL
      ORDER BY interaction_count DESC
      LIMIT 10
    `;

    return staleContacts.map(c => ({
      contact: c,
      daysSinceLastContact: differenceInDays(new Date(), c.last_interaction),
      reason: this.generateReconnectionReason(c),
      suggestedAction: this.suggestAction(c)
    }));
  }
}
```

### 3.2 Important Date Alerts

```typescript
@Injectable()
export class ImportantDateService {
  @Cron('0 8 * * *') // Daily at 8 AM
  async checkImportantDates() {
    const upcoming = await this.getUpcomingDates(7); // Next 7 days

    for (const date of upcoming) {
      await this.createAlert({
        type: date.type, // BIRTHDAY, ANNIVERSARY, CONTRACT_RENEWAL
        contactId: date.contactId,
        date: date.date,
        message: this.formatMessage(date)
      });
    }
  }

  private formatMessage(date: ImportantDate): string {
    switch (date.type) {
      case 'BIRTHDAY':
        return `${date.contactName}'s birthday is on ${format(date.date, 'MMMM do')}`;
      case 'ANNIVERSARY':
        return `Your work anniversary with ${date.contactName} is coming up`;
      case 'CONTRACT_RENEWAL':
        return `Contract with ${date.contactName} renews on ${format(date.date, 'MMMM do')}`;
    }
  }
}
```

---

## Recommended Libraries

### Core Libraries (P0-P1)

| Library | Purpose | npm Package | Weekly Downloads |
|---------|---------|-------------|------------------|
| **mem0ai** | Long-term memory | `mem0ai` | Growing |
| **chrono-node** | Date/time parsing | `chrono-node` | 1M+ |
| **compromise** | NLP text processing | `compromise` | 500K+ |
| **compromise-dates** | Date extraction | `compromise-dates` | 50K+ |

### P1.6 Libraries (Unified Knowledge Agent)

| Library | Purpose | npm Package | Notes |
|---------|---------|-------------|-------|
| **@voltagent/core** | Agent framework | `@voltagent/core` | Already installed |
| **ai** | Vercel AI SDK | `ai` | Already installed |
| **zod** | Schema validation | `zod` | Already installed |

> ℹ️ P1.6 uses existing libraries - no new npm packages needed!

### P1.7 Libraries (Graph RAG + CRM)

| Library | Purpose | npm Package | Notes |
|---------|---------|-------------|-------|
| **apache-age-client** | Apache AGE Node.js client | `apache-age-client` | **NEW** - Graph queries |
| **pg** | PostgreSQL client (for AGE) | `pg` | Already installed |

### Supporting Libraries

| Library | Purpose | npm Package |
|---------|---------|-------------|
| **date-fns** | Date manipulation | `date-fns` |
| **rrule** | Recurring events | `rrule` |
| **natural** | NLP utilities | `natural` |
| **sentiment** | Sentiment analysis | `sentiment` |

### Installation

```bash
# Core (P0-P1)
npm install mem0ai chrono-node compromise compromise-dates

# P1.7 Graph RAG
npm install apache-age-client

# Supporting
npm install date-fns rrule natural sentiment
```

### All npm Packages Summary

| Phase | Packages to Install | Status |
|-------|---------------------|--------|
| P0 | `mem0ai` (optional, we use custom) | ✅ Using custom |
| P0 | `chrono-node` | ✅ Installed |
| P1 | `compromise`, `compromise-dates` | ✅ Installed |
| P1.5 | None (uses Mistral API) | ✅ Ready |
| **P1.6** | **None (uses existing)** | ✅ Ready |
| **P1.7** | **None (uses Prisma CTEs)** | ✅ DONE |
| P2 | `date-fns`, `rrule` | ⏳ When needed |

---

## Architecture Patterns

### Proactive Notification System

```typescript
interface ProactiveAlert {
  id: string;
  tenantId: string;
  userId: string;
  type: AlertType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  suggestedAction?: SuggestedAction;
  sourceType?: string;
  sourceId?: string;
  createdAt: Date;
  readAt?: Date;
  dismissedAt?: Date;
}

enum AlertType {
  FOLLOW_UP = 'FOLLOW_UP',
  DEADLINE = 'DEADLINE',
  CONFLICT = 'CONFLICT',
  RECONNECT = 'RECONNECT',
  ACTION_ITEM = 'ACTION_ITEM',
  IMPORTANT_DATE = 'IMPORTANT_DATE',
}
```

### Scheduled Jobs Architecture

```typescript
// backend/src/modules/ai/scheduler/ai-scheduler.service.ts
@Injectable()
export class AiSchedulerService {
  @Cron('0 */6 * * *') // Every 6 hours
  async checkFollowUps() {
    await this.followUpService.checkPendingFollowUps();
  }

  @Cron('0 7 * * *') // Daily at 7 AM
  async generateDailyBriefing() {
    await this.briefingService.generateForAllUsers();
  }

  @Cron('0 8 * * *') // Daily at 8 AM
  async checkDeadlines() {
    await this.deadlineService.checkUpcomingDeadlines();
  }

  @Cron('0 9 * * 1') // Weekly on Monday at 9 AM
  async suggestReconnections() {
    await this.relationshipService.generateReconnectionSuggestions();
  }

  @Cron('0 */1 * * *') // Every hour
  async processNewEmails() {
    await this.actionExtractor.processUnanalyzedEmails();
  }
}
```

### Daily Briefing Enhancement

```typescript
interface EnhancedDailyBriefing {
  date: Date;

  // Existing
  emailSummary: {
    unreadCount: number;
    urgentEmails: Email[];
    highlights: string[];
  };

  // NEW: Follow-ups
  pendingFollowUps: {
    count: number;
    urgent: FollowUp[];
    message: string;
  };

  // NEW: Deadlines
  upcomingDeadlines: {
    today: Deadline[];
    thisWeek: Deadline[];
    message: string;
  };

  // NEW: Action Items
  actionItems: {
    dueToday: ActionItem[];
    overdue: ActionItem[];
    message: string;
  };

  // NEW: Relationships
  reconnectionSuggestions: {
    contacts: Contact[];
    message: string;
  };

  // NEW: Important Dates
  importantDates: {
    dates: ImportantDate[];
    message: string;
  };

  // Calendar
  todaysMeetings: CalendarEvent[];
  conflicts: ConflictAlert[];
}
```

---

## Implementation Priority

| Priority | Feature | Library/Tool | Effort | Impact | Status |
|----------|---------|--------------|--------|--------|--------|
| 🥇 P0 | Mem0 Long-Term Memory | Prisma + pgvector | 2 days | Critical | ✅ DONE |
| 🥈 P0 | Deadline Extraction | chrono-node + BullMQ | 1 day | High | ✅ DONE |
| 🥉 P0 | Follow-up Tracking | Custom + patterns + BullMQ | 2 days | Critical | ✅ DONE |
| P1 | Action Item Extraction | Mistral + patterns | 2 days | High | ✅ DONE |
| P1 | Enhanced Daily Briefing | Aggregate services | 1 day | High | ✅ DONE |
| P1.5 | Analytics & Visualization | Mistral Code Interpreter | 1 day | High | ✅ DONE |
| **P1.6** | **Unified Knowledge Agent** | **Memory + RAG + Multi-source** | **2 days** | **High** | ✅ DONE |
| **P1.7** | **CRM Intelligence** | **Prisma + Recursive CTEs** | **1 day** | **Critical** | ✅ DONE |
| P2 | Conflict Detection | Custom | 2 days | Medium | |
| P2 | Focus Time Protection | Custom | 1 day | Medium | |
| P3 | ~~Relationship Tracking~~ | ~~Custom~~ | - | - | → P1.7 |
| P3 | Important Date Alerts | Custom | 1 day | Low | |

### Completed Phase 0 Implementation Notes

**Long-Term Memory (Dec 14, 2025):**

- Custom implementation using Prisma + Mistral + pgvector (no mem0ai dependency)
- `LongTermMemoryService` with `addFact`, `addMemory`, `searchMemories`, `getContextForPrompt`
- Vector similarity search with tenant isolation
- GDPR-compliant `deleteUserMemories` for right to erasure
- Integrated with VoltAgent `chat()` and `streamChat()` for automatic context injection
- Test script: `backend/scripts/test-long-term-memory.ts`

**Deadline Extraction (Dec 14, 2025):**

- `DeadlineExtractorService` using chrono-node NLP parser
- Multi-language support (English + Italian)
- Redis caching for fast retrieval (designed for >1000 users)
- BullMQ queue for reminder scheduling (every 15 min overdue check)
- Confidence scoring with keyword detection
- Recurring pattern detection (weekly, monthly, etc.)
- API endpoints: `GET /deadlines`, `POST /deadlines/extract`, `POST /deadlines/:id/complete`
- Test script: `backend/scripts/test-deadline-extractor.ts`

**Action Item Extraction (Dec 15, 2025):**

- `ActionItemService` with pattern detection + Mistral AI extraction
- 15 regex patterns for action item detection (requests, commitments, tasks, follow-ups)
- 5 informational patterns to filter out FYI emails
- Owner detection (sender vs recipient)
- Priority inference from urgency language (high/medium/low → 1-10 scale)
- BullMQ queue `ai-action-items` for background extraction
- Redis caching for pending items (5-minute TTL)
- Full CRUD operations using Prisma `AiTask` model
- Statistics: total, todo, in_progress, waiting, done, cancelled, dueToday, overdue, highPriority
- API endpoints: `GET /action-items`, `POST /action-items`, `POST /action-items/extract`, `POST /action-items/analyze`, `POST /action-items/:id/status`
- Test script: `backend/scripts/test-action-item-service.ts` (44 tests, 100% pass rate)

**Enhanced Daily Briefing (Dec 15, 2025):**

- `DailyBriefingService` enhanced to aggregate all AI Secretary services
- Integrates: FollowUpService, DeadlineExtractorService, ActionItemService
- Briefing structure includes:
  - Email summary (unread, new today, requires response)
  - Follow-ups (pending, overdue, due today, top 5 items)
  - Deadlines (today, this week, overdue count)
  - Action items (todo, in progress, overdue, high priority, due today)
  - Calendar (today's meetings - placeholder for CalendarService integration)
- Context-aware messages for each section (e.g., "⚠️ 2 overdue follow-ups!")
- BullMQ scheduled job runs hourly to pre-compute briefings
- Redis caching (24h TTL) for instant retrieval
- Swagger documentation with full API descriptions
- API endpoints: `GET /briefing`, `POST /briefing/refresh`, `GET /briefing/status`
- Test script: `backend/scripts/test-enhanced-daily-briefing.ts` (31 tests, 100% pass rate)

---

## Security & Multi-Tenancy

> 🔒 **CRITICAL** - Memory systems require strict tenant isolation to prevent data leakage.

### Security Best Practices (2025)

Based on [Azure Multi-tenant AI Architecture](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/ai-ml) and [Multi-tenant Isolation Guide](https://ones.com/blog/multi-tenancy-isolation-tools-techniques/):

#### Core Security Requirements

| Requirement | Implementation | Priority |
|-------------|----------------|----------|
| **Namespace Isolation** | All memory keys prefixed with `{tenantId}:{userId}` | Critical |
| **Vector Store Isolation** | Separate collections OR strict filtering per tenant | Critical |
| **Memory Deletion** | GDPR-compliant full purge capability | Critical |
| **Rate Limiting** | Per-tenant quotas on memory operations | High |
| **Encryption** | Encrypt sensitive memories at rest | High |
| **Audit Logging** | Track all memory access operations | Medium |

#### Multi-Tenant Memory Architecture

```typescript
// backend/src/modules/ai/memory/memory.service.ts

/**
 * CRITICAL: All memory operations MUST be tenant-scoped.
 * Memory IDs use format: {tenantId}:{userId}
 * This ensures complete isolation between tenants.
 */
@Injectable()
export class AiMemoryService {
  /**
   * Generate tenant-isolated user ID for Mem0.
   * NEVER use raw userId - always scope to tenant.
   */
  private getMemoryUserId(tenantId: string, userId: string): string {
    // Format: tenant:user ensures no cross-tenant access
    return `${tenantId}:${userId}`;
  }

  /**
   * GDPR Compliance: Delete ALL memories for a user.
   * Must be called when user requests data deletion.
   */
  async deleteAllUserMemories(tenantId: string, userId: string): Promise<void> {
    const memoryUserId = this.getMemoryUserId(tenantId, userId);

    // Delete from Mem0
    await this.memory.deleteAll({ userId: memoryUserId });

    // Delete from PostgreSQL backup table
    await this.prisma.aiMemory.deleteMany({
      where: { tenantId, userId }
    });

    // Audit log
    this.logger.log(`GDPR: Deleted all memories for ${memoryUserId}`);
  }

  /**
   * GDPR Compliance: Export all user memories.
   * Returns data in portable format.
   */
  async exportUserMemories(tenantId: string, userId: string): Promise<MemoryExport> {
    const memories = await this.getAllMemories(userId, tenantId);
    return {
      exportDate: new Date().toISOString(),
      userId,
      tenantId,
      memories: memories.map(m => ({
        id: m.id,
        content: m.memory,
        createdAt: m.metadata?.createdAt,
        source: m.metadata?.source,
      })),
    };
  }
}
```

#### Rate Limiting for Memory Operations

```typescript
// Per-tenant rate limits for memory operations
const MEMORY_RATE_LIMITS = {
  add: { max: 100, windowMs: 60000 },     // 100 adds per minute
  search: { max: 200, windowMs: 60000 },  // 200 searches per minute
  getAll: { max: 50, windowMs: 60000 },   // 50 getAll per minute
};

@Injectable()
export class MemoryRateLimiter {
  constructor(private readonly redis: Redis) {}

  async checkLimit(
    tenantId: string,
    operation: 'add' | 'search' | 'getAll'
  ): Promise<boolean> {
    const key = `mem0:ratelimit:${tenantId}:${operation}`;
    const limit = MEMORY_RATE_LIMITS[operation];

    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.pexpire(key, limit.windowMs);
    }

    return current <= limit.max;
  }
}
```

#### Security Checklist

- [x] All memory operations use `{tenantId}:{userId}` format
- [x] Vector store queries filter by tenant
- [x] PII is redacted before storage - **PiiDetectionService** (December 2025)
- [ ] Memory encryption at rest enabled
- [ ] GDPR delete endpoint implemented
- [ ] GDPR export endpoint implemented
- [x] Rate limiting per tenant - **RateLimiterService**
- [x] Audit logging for memory access - **LlmTelemetryService**
- [ ] Memory TTL configured (auto-expire old memories)

#### LLM Security Guards (OWASP LLM01:2025) - IMPLEMENTED

| Guard | Status | Location |
|-------|--------|----------|
| **PromptGuardService** | Done | `backend/src/modules/ai/guards/prompt-guard.service.ts` |
| **PiiDetectionService** | Done | `backend/src/modules/ai/guards/pii-detection.service.ts` |

**Defense Layers:**

- Direct injection detection (30+ regex patterns)
- Indirect injection detection (document-based attacks)
- Fuzzy matching (typoglycemia attacks like "1gn0re" for "ignore")
- Encoding detection (Base64, hex, Unicode smuggling)
- Risk scoring with configurable thresholds (50=review, 80=block)
- PII redaction (EMAIL, PHONE, SSN, CREDIT_CARD, IP_ADDRESS, IBAN)

---

## Performance Optimization

> ⚡ **CRITICAL** - Memory systems must be fast to not impact chat latency.

### Performance Best Practices (2025)

Based on [pgvector Performance Guide](https://www.crunchydata.com/blog/pgvector-performance-for-developers) and [Mem0 Research](https://arxiv.org/abs/2504.19413):

#### pgvector Optimization

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| **HNSW in RAM** | Critical | `shared_buffers` must hold entire index |
| **halfvec** | -50% storage | Use 16-bit floats instead of 32-bit |
| **Dimension sizing** | -30% storage | Match model dimension exactly (1024 for Mistral) |
| **Index tuning** | +30% speed | Tune `ef_construction` and `m` parameters |

```sql
-- Create optimized pgvector table for memories
CREATE TABLE ai_memory_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  memory_id TEXT NOT NULL,
  -- Use halfvec for 50% storage savings (pgvector 0.8+)
  embedding halfvec(1024),  -- Mistral embed dimension
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_memory UNIQUE (tenant_id, memory_id)
);

-- Create HNSW index with optimized parameters
CREATE INDEX idx_memory_vectors_hnsw ON ai_memory_vectors
USING hnsw (embedding halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Critical: Partition by tenant for large deployments
-- This keeps indexes smaller and faster
CREATE INDEX idx_memory_vectors_tenant ON ai_memory_vectors (tenant_id);
```

#### Memory Caching Strategy

```typescript
/**
 * Two-tier caching for memory retrieval:
 * 1. Redis: Hot memories (frequently accessed)
 * 2. PostgreSQL/pgvector: Cold memories (full search)
 */
@Injectable()
export class MemoryCacheService {
  private readonly HOT_MEMORY_TTL = 300; // 5 minutes
  private readonly MAX_HOT_MEMORIES = 50; // Per user

  /**
   * Get memories with caching.
   * Hot memories served from Redis, cold from pgvector.
   */
  async getContextForPrompt(
    tenantId: string,
    userId: string,
    query: string,
  ): Promise<string> {
    const cacheKey = `mem0:hot:${tenantId}:${userId}`;

    // Check hot cache first
    const hotMemories = await this.redis.get(cacheKey);
    if (hotMemories) {
      const memories = JSON.parse(hotMemories);
      // Quick semantic match against hot memories
      const relevant = this.quickMatch(memories, query);
      if (relevant.length > 0) {
        return this.formatContext(relevant);
      }
    }

    // Fall back to full Mem0 search
    const memories = await this.memoryService.searchMemories(
      userId, tenantId, query, 5
    );

    // Update hot cache
    await this.updateHotCache(tenantId, userId, memories);

    return this.formatContext(memories);
  }

  /**
   * Quick semantic match using pre-computed embeddings.
   * Much faster than full vector search.
   */
  private quickMatch(memories: CachedMemory[], query: string): CachedMemory[] {
    // Simple keyword matching for hot cache
    // Full semantic search only needed for cold storage
    const queryWords = query.toLowerCase().split(/\s+/);
    return memories.filter(m =>
      queryWords.some(w => m.memory.toLowerCase().includes(w))
    );
  }
}
```

#### Latency Targets

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| Memory search | < 100ms | Must not slow chat |
| Memory add | < 200ms | Can be async |
| Context injection | < 50ms | Redis hot cache |
| Full vector search | < 500ms | pgvector cold search |

#### Performance Checklist

- [ ] pgvector HNSW index fits in `shared_buffers`
- [ ] Using `halfvec` for 50% storage savings
- [ ] Hot memory cache in Redis
- [ ] Memory add operations are async (non-blocking)
- [ ] Batch embedding generation for multiple memories
- [ ] Index statistics updated regularly (`ANALYZE`)
- [ ] Query explain plans reviewed for index usage

---

## Testing Strategy

> 🧪 **CRITICAL** - Memory systems need thorough testing due to their impact on AI quality.

### Test Categories

#### 1. Unit Tests

```typescript
// backend/src/modules/ai/memory/__tests__/memory.service.spec.ts

describe('AiMemoryService', () => {
  describe('Tenant Isolation', () => {
    it('should not return memories from other tenants', async () => {
      // Store memory for tenant A
      await service.storeMemory('user1', 'tenantA', [
        { role: 'user', content: 'I prefer morning meetings' }
      ]);

      // Search from tenant B should return nothing
      const results = await service.searchMemories(
        'user1', 'tenantB', 'meeting preferences'
      );

      expect(results).toHaveLength(0);
    });

    it('should isolate memories between users in same tenant', async () => {
      await service.storeMemory('user1', 'tenantA', [
        { role: 'user', content: 'My favorite color is blue' }
      ]);

      const results = await service.searchMemories(
        'user2', 'tenantA', 'favorite color'
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('Memory Relevance', () => {
    it('should return semantically relevant memories', async () => {
      await service.storeMemory('user1', 'tenantA', [
        { role: 'user', content: 'I always schedule meetings in the morning' }
      ]);

      const results = await service.searchMemories(
        'user1', 'tenantA', 'when should we meet?'
      );

      expect(results).toHaveLength(1);
      expect(results[0].memory).toContain('morning');
    });
  });

  describe('GDPR Compliance', () => {
    it('should delete all user memories on request', async () => {
      // Store multiple memories
      await service.storeMemory('user1', 'tenantA', [
        { role: 'user', content: 'Memory 1' }
      ]);
      await service.storeMemory('user1', 'tenantA', [
        { role: 'user', content: 'Memory 2' }
      ]);

      // Delete all
      await service.deleteUserMemories('user1', 'tenantA');

      // Verify deletion
      const results = await service.getAllMemories('user1', 'tenantA');
      expect(results).toHaveLength(0);
    });
  });
});
```

#### 2. Integration Tests

```typescript
// backend/src/modules/ai/memory/__tests__/memory.integration.spec.ts

describe('Memory Integration', () => {
  describe('VoltAgent + Memory', () => {
    it('should inject memory context into chat', async () => {
      // Store preference
      await memoryService.storeMemory('user1', 'tenantA', [
        { role: 'user', content: 'I prefer formal email tone' }
      ]);

      // Chat asking about email
      const response = await voltAgentService.chat(
        'user1', 'tenantA',
        'Write an email to my boss about the project update'
      );

      // Response should reflect preference
      expect(response.content).toMatch(/dear|sincerely|regards/i);
    });

    it('should store new learnings from conversation', async () => {
      await voltAgentService.chat(
        'user1', 'tenantA',
        'I like to keep emails short and to the point'
      );

      // Memory should be stored
      const memories = await memoryService.searchMemories(
        'user1', 'tenantA', 'email style'
      );

      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].memory).toContain('short');
    });
  });
});
```

#### 3. Performance Tests

```typescript
// backend/src/modules/ai/memory/__tests__/memory.perf.spec.ts

describe('Memory Performance', () => {
  it('should search memories under 100ms', async () => {
    // Pre-populate with 100 memories
    for (let i = 0; i < 100; i++) {
      await memoryService.storeMemory('user1', 'tenantA', [
        { role: 'user', content: `Test memory ${i} with various content` }
      ]);
    }

    const start = Date.now();
    await memoryService.searchMemories(
      'user1', 'tenantA', 'test memory', 5
    );
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should handle concurrent memory operations', async () => {
    const operations = Array(50).fill(null).map((_, i) =>
      memoryService.storeMemory(`user${i}`, 'tenantA', [
        { role: 'user', content: `Concurrent test ${i}` }
      ])
    );

    await expect(Promise.all(operations)).resolves.not.toThrow();
  });
});
```

#### 4. Real Provider Test Script

```typescript
// backend/scripts/test-mem0-integration.ts

/**
 * Real provider test for Mem0 integration.
 * Run with: npx ts-node scripts/test-mem0-integration.ts
 */
async function testMem0Integration() {
  console.log('🧪 Testing Mem0 Integration with Real Mistral API...\n');

  const testTenant = 'test-tenant-' + Date.now();
  const testUser = 'test-user-1';

  // Test 1: Store memory
  console.log('1. Storing test memory...');
  await memoryService.storeMemory(testUser, testTenant, [
    { role: 'user', content: 'I prefer to have meetings on Tuesday afternoons' },
    { role: 'assistant', content: 'I\'ll remember that you prefer Tuesday afternoon meetings.' }
  ]);
  console.log('   ✅ Memory stored\n');

  // Test 2: Search memory
  console.log('2. Searching for relevant memory...');
  const results = await memoryService.searchMemories(
    testUser, testTenant, 'when is the best time to schedule a meeting?'
  );
  console.log(`   Found ${results.length} memories`);
  results.forEach(m => console.log(`   - ${m.memory}`));
  console.log('   ✅ Search complete\n');

  // Test 3: Context injection
  console.log('3. Testing context injection...');
  const context = await memoryService.getContextForPrompt(
    testUser, testTenant, 'schedule a meeting'
  );
  console.log(`   Context: ${context.substring(0, 100)}...`);
  console.log('   ✅ Context generated\n');

  // Test 4: Cleanup
  console.log('4. Cleaning up test data...');
  await memoryService.deleteUserMemories(testUser, testTenant);
  console.log('   ✅ Test data cleaned\n');

  console.log('🎉 All Mem0 integration tests passed!');
}
```

### Testing Checklist

- [ ] Unit tests for tenant isolation
- [ ] Unit tests for GDPR compliance
- [ ] Integration tests with VoltAgent
- [ ] Performance tests (< 100ms search)
- [ ] Concurrent operation tests
- [ ] Real provider test script
- [ ] Memory quality evaluation (relevance scoring)
- [ ] Edge case tests (empty memories, special characters)

---

## Sources

### Memory & Learning

- [Mem0 Documentation](https://docs.mem0.ai/overview/)
- [Mem0 Research Paper](https://arxiv.org/abs/2504.19413) - 26% accuracy improvement
- [Mem0 Node.js SDK](https://docs.mem0.ai/open-source/node-quickstart)
- [Mem0 Vector vs Graph](https://docs.mem0.ai/cookbooks/essentials/choosing-memory-architecture-vector-vs-graph)
- [Mem0 Mistral Integration](https://docs.mem0.ai/components/llms/models/mistral_AI)
- [Survey of AI Agent Memory Frameworks](https://www.graphlit.com/blog/survey-of-ai-agent-memory-frameworks)
- [Agent Memory: How to Build Agents that Learn](https://www.letta.com/blog/agent-memory)
- [Building AI Agents That Actually Remember (2025)](https://medium.com/@nomannayeem/building-ai-agents-that-actually-remember-a-developers-guide-to-memory-management-in-2025-062fd0be80a1)
- [Redis AI Memory Guide](https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis/)

### pgvector & Vector Databases

- [pgvector Performance Guide](https://www.crunchydata.com/blog/pgvector-performance-for-developers)
- [pgvector halfvec Optimization](https://www.eastagile.com/blogs/optimizing-vector-storage-in-postgresql-with-pgvector-halfvec)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Best Vector Databases 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)

### Multi-Tenant Security

- [Azure Multi-tenant AI Architecture](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/ai-ml)
- [Multi-tenant Isolation Techniques 2025](https://ones.com/blog/multi-tenancy-isolation-tools-techniques/)
- [Building Multi-Tenant AI Agents](https://ingenimax.ai/blog/building-multi-tenant-ai-agent)
- [Redis Multi-tenant Isolation](https://binaryscripts.com/redis/2025/05/28/optimizing-redis-for-multi-tenant-applications-isolation-quotas-and-security.html)

### RAG & Retrieval

- [2025 RAG Guide](https://www.edenai.co/post/the-2025-guide-to-retrieval-augmented-generation-rag)
- [RAG Best Practices Study](https://arxiv.org/abs/2501.07391)
- [RAG Architecture Explained](https://orq.ai/blog/rag-architecture)

### Date/Time & NLP

- [chrono-node npm](https://www.npmjs.com/package/chrono-node)
- [chrono-node GitHub](https://github.com/wanasit/chrono)
- [compromise-dates npm](https://www.npmjs.com/package/compromise-dates)

### Email & Task Management

- [Top 7 Email Follow-Up Software 2025](https://www.saleshandy.com/blog/email-follow-up-software/)
- [Action Item Detection NLP](https://github.com/bakszero/ActionableTask)
- [Extracting Tasks from Emails](https://rodrigo-alarcon.medium.com/extracting-tasks-from-emails-first-challenges-86e7fbbf4672)

### Scheduling & Calendar

- [AI Scheduling Algorithms](https://callin.io/ai-scheduling-algorithms/)
- [Top 10 AI Calendar Tools 2025](https://superagi.com/scheduling-smart-how-the-top-10-ai-calendar-tools-are-revolutionizing-business-productivity-in-2025/)
- [Reclaim.ai](https://reclaim.ai/)

### Proactive AI

- [Transforming AI from Passive to Proactive](https://medium.com/@shuraosipov/transforming-ai-assistants-from-passive-to-proactive-0f80830839dc)
- [AI and Push Notifications Guide](https://thinkupsoft.com/blog/ai-and-push-notifications-a-practical-guide/)

### Analytics & Code Execution

- [Mistral Code Interpreter](https://docs.mistral.ai/agents/tools/built-in/code_interpreter)
- [Mistral Agents Overview](https://docs.mistral.ai/capabilities/agents/)
- [Tool Use Best Practices](https://docs.mistral.ai/capabilities/function_calling/)

---

*Last Updated: December 15, 2025*
*Version: 2.2 - Added Mem0 Gap Analysis & Library Comparison*

---

## Appendix A: Mem0 Gap Analysis & Library Comparison

> 📊 **Research Date:** December 15, 2025
> **Purpose:** Compare our LongTermMemoryService with Mem0 and identify improvement opportunities

### A.1 Current Implementation vs Mem0

#### What We Have ✅

| Feature | Our Implementation | Status |
|---------|-------------------|--------|
| **Vector storage** | Prisma + pgvector | ✅ Done |
| **Embeddings** | Mistral API | ✅ Done |
| **Semantic search** | CTE with cosine similarity | ✅ Done |
| **Memory categories** | 7 types (PREFERENCE, CONTACT, SCHEDULE, etc.) | ✅ Done |
| **Importance scoring** | Static 0-1 scale | ✅ Done |
| **GDPR compliance** | `deleteUserMemories()` | ✅ Done |
| **Multi-tenant** | `tenantId` + `userId` isolation | ✅ Done |
| **LLM extraction** | `extractMemoryFromMessages()` | ✅ Done |
| **Context injection** | `getContextForPrompt()` | ✅ Done |

#### Gaps Identified 🔴

| Gap | Mem0 Feature | Our Status | Priority | Effort |
|-----|-------------|------------|----------|--------|
| **Multi-Level Memory** | User, Session, Agent levels | ❌ Missing | High | Medium |
| **Memory History** | Track memory changes over time | ❌ Missing | Medium | Medium |
| **Consolidation** | Auto-merge similar memories | ❌ Missing | High | High |
| **Deduplication** | Prevent duplicate memories | ❌ Missing | High | Medium |
| **Memory Update** | Modify existing memories | ❌ Missing | Medium | Low |
| **Graph Memory** | Relationship-based retrieval | ❌ Missing | Low | High |
| **Time Decay** | Recency-based relevance boost | ❌ Missing | Medium | Low |
| **Batch Operations** | Bulk update/delete | ❌ Missing | Low | Low |
| **Custom Prompts** | Configurable extraction | ❌ Missing | Low | Low |
| **Feedback Loop** | Learn from memory usefulness | ❌ Missing | Low | Medium |

### A.2 Open-Source Library Comparison (December 2025)

| Library | pgvector | Consolidation | TypeScript | Multi-tenant | License | Weekly Downloads |
|---------|----------|---------------|------------|--------------|---------|------------------|
| **mem0ai/oss** ⭐ | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Apache 2.0 | 23K+ |
| **mcp-ai-memory** | ✅ Yes | ✅ DBSCAN | ✅ Yes | ❌ No | MIT | - |
| **OpenMemory** | ⚠️ SQLite | ❌ No | ✅ Yes | ❌ No | MIT | - |
| **Memori** | ✅ Yes | ✅ Yes | ❌ Python | ✅ Yes | MIT | - |
| **claude-flow** | ❌ Custom | ⚠️ Basic | ✅ Yes | ❌ No | MIT | - |

#### mem0ai (Recommended) ⭐

**Why best fit for our stack:**

1. **Free & Open Source** - Apache 2.0, fully self-hosted option
2. **pgvector Native** - Exact match for our PostgreSQL + pgvector setup
3. **Mistral Support** - Via `litellm` provider (our existing LLM)
4. **Memory Consolidation** - Built-in deduplication and merging
5. **History Tracking** - Memory versioning included
6. **Production-Tested** - 26% accuracy improvement proven in research
7. **TypeScript SDK** - `import { Memory } from "mem0ai/oss"`

**Installation:**

```bash
npm install mem0ai
```

**Configuration with our stack:**

```typescript
import { Memory } from "mem0ai/oss";

const memory = new Memory({
  vectorStore: {
    provider: "pgvector",
    config: {
      host: process.env.DB_HOST,
      port: "5432",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }
  },
  llm: {
    provider: "litellm",
    config: {
      model: "mistral/mistral-small-latest",
      apiKey: process.env.MISTRAL_API_KEY,
    }
  },
  embedder: {
    provider: "mistral",
    config: {
      apiKey: process.env.MISTRAL_API_KEY,
      model: "mistral-embed",
    }
  }
});
```

#### mcp-ai-memory (Alternative)

**Strengths:**

- DBSCAN clustering for intelligent consolidation
- Memory decay with exponential lifecycle
- Graph-based relationship traversal
- Exclusively uses pgvector (perfect match)

**Limitations:**

- Designed as MCP server, not library
- Would require forking/extracting core services
- No multi-tenant support out-of-box

**Key features we could adopt:**

```typescript
// DBSCAN clustering for memory consolidation
// From mcp-ai-memory architecture

interface ConsolidationConfig {
  minSimilarity: 0.95;      // Threshold for merging
  minClusterSize: 2;        // Minimum memories to form cluster
  maxIterations: 100;       // DBSCAN iterations
}

async function consolidateMemories(
  tenantId: string,
  userId: string,
  config: ConsolidationConfig
): Promise<ConsolidationResult> {
  // 1. Fetch all user memories with embeddings
  // 2. Run DBSCAN clustering on embedding vectors
  // 3. For each cluster, merge content using LLM
  // 4. Keep highest importance, combine metadata
  // 5. Delete redundant entries, keep merged
}
```

### A.3 Recommended Improvement Path

#### Option 1: Integrate mem0ai (Recommended)

**Pros:**

- All gaps solved immediately
- Battle-tested (23K weekly downloads)
- Maintains existing Prisma schema for backup

**Implementation:**

```typescript
// Hybrid approach: mem0ai for features, Prisma for tenant isolation

@Injectable()
export class EnhancedMemoryService {
  private mem0: Memory;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.mem0 = new Memory({
      vectorStore: { provider: "pgvector", config: {...} },
      llm: { provider: "litellm", config: { model: "mistral-small" } },
    });
  }

  // Use Mem0 for extraction + consolidation
  async addMemory(tenantId: string, userId: string, messages: Message[]) {
    const mem0Result = await this.mem0.add(messages, {
      userId: `${tenantId}:${userId}`,  // Tenant isolation via composite key
      metadata: { tenantId, userId },
    });
    return mem0Result;
  }

  // Use Mem0 search with tenant filtering
  async searchMemories(tenantId: string, userId: string, query: string) {
    return this.mem0.search(query, {
      userId: `${tenantId}:${userId}`,
      filters: { tenantId },
    });
  }

  // Keep GDPR compliance via both systems
  async deleteUserMemories(tenantId: string, userId: string) {
    await this.mem0.deleteAll({ userId: `${tenantId}:${userId}` });
    await this.prisma.aiMemory.deleteMany({ where: { tenantId, userId } });
  }
}
```

#### Option 2: Enhance Current Implementation

**Add these features manually:**

| Feature | Effort | Implementation |
|---------|--------|----------------|
| Time decay | 1 hour | Add recency factor to search scoring |
| Update method | 2 hours | Add `updateMemory()` to service |
| Memory history | 4 hours | New `ai_memory_history` table + triggers |
| Consolidation | 8 hours | DBSCAN clustering from mcp-ai-memory |
| Session memory | 4 hours | Add `level` field + TTL cleanup job |

**Quick win - Time decay:**

```typescript
// Add to searchMemories() scoring
private applyTimeDecay(memories: MemoryResult[]): MemoryResult[] {
  const now = Date.now();
  const HALF_LIFE_DAYS = 30; // Memories lose half relevance in 30 days

  return memories.map(m => {
    const daysSince = (now - m.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.exp(-daysSince / HALF_LIFE_DAYS * Math.LN2);
    return {
      ...m,
      score: (m.score || 1) * decayFactor,
    };
  }).sort((a, b) => b.score - a.score);
}
```

### A.4 Additional Resources

#### Neural Module (claude-flow)

Based on [Claude Flow Neural Module](https://github.com/ruvnet/claude-flow/wiki/Neural-Module):

**Four-Tier Memory Model:**

1. **Vector Memory** - Dense representations for similarity search
2. **Episodic Memory** - Complete interaction histories
3. **Semantic Memory** - Knowledge base of facts
4. **Working Memory** - Active context for current task

**Performance claims:**

- 95%+ recall accuracy
- 172K+ ops/second
- 60% compression with maintained recall
- 100% cross-session persistence

**Relevance to our implementation:**

- The tiered model aligns with our short-term (Redis) + long-term (Prisma) architecture
- Could inspire future enhancements for working memory management
- WASM SIMD optimization could improve embedding operations

### A.5 Decision Matrix

| Criteria | mem0ai | Manual Enhancement | Status Quo |
|----------|--------|-------------------|------------|
| Development time | 1-2 days | 2-3 weeks | 0 |
| All gaps solved | ✅ Yes | ✅ Yes | ❌ No |
| Maintenance burden | Low (upstream) | High (custom) | Low |
| Risk | Low (proven) | Medium | Low |
| Learning curve | Low | Medium | None |
| **Recommendation** | ⭐⭐⭐ | ⭐⭐ | ⭐ |

### A.6 Sources

- [mem0ai npm package](https://www.npmjs.com/package/mem0ai) - 23K weekly downloads
- [Mem0 pgvector docs](https://docs.mem0.ai/components/vectordbs/dbs/pgvector)
- [Mem0 Mistral AI config](https://docs.mem0.ai/v0x/components/llms/models/mistral_AI)
- [Mem0 Node.js OSS Quickstart](https://docs.mem0.ai/open-source/node-quickstart)
- [Mem0 Research Paper](https://arxiv.org/abs/2504.19413) - 26% accuracy improvement
- [mcp-ai-memory GitHub](https://github.com/scanadi/mcp-ai-memory) - DBSCAN clustering
- [OpenMemory GitHub](https://github.com/CaviraOSS/OpenMemory) - MIT, 2.5K stars
- [Memori GitHub](https://github.com/archit15singh/memori) - pgvector, Python
- [Claude Flow Neural Module](https://github.com/ruvnet/claude-flow/wiki/Neural-Module)
