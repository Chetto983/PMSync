# AI Secretary Implementation Plan

**Date:** December 14, 2025
**Version:** 2.0 (Updated with 2025 Best Practices Research)
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

---

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Phase 0: Long-Term Memory (Mem0)](#phase-0-long-term-memory-mem0) ⭐ **CRITICAL**
3. [Phase 1: Proactive Intelligence](#phase-1-proactive-intelligence)
4. [Phase 1.5: Analytics & Visualization](#phase-15-analytics--visualization) 📊 **NEW**
5. [Phase 2: Smart Scheduling](#phase-2-smart-scheduling)
6. [Phase 3: Relationship Intelligence](#phase-3-relationship-intelligence)
7. [Recommended Libraries](#recommended-libraries)
8. [Architecture Patterns](#architecture-patterns)
9. [Security & Multi-Tenancy](#security--multi-tenancy) 🔒 **NEW**
10. [Performance Optimization](#performance-optimization) ⚡ **NEW**
11. [Testing Strategy](#testing-strategy) 🧪 **NEW**

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

## Phase 2: Smart Scheduling

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

### Core Libraries

| Library | Purpose | npm Package | Weekly Downloads |
|---------|---------|-------------|------------------|
| **mem0ai** | Long-term memory | `mem0ai` | Growing |
| **chrono-node** | Date/time parsing | `chrono-node` | 1M+ |
| **compromise** | NLP text processing | `compromise` | 500K+ |
| **compromise-dates** | Date extraction | `compromise-dates` | 50K+ |

### Supporting Libraries

| Library | Purpose | npm Package |
|---------|---------|-------------|
| **date-fns** | Date manipulation | `date-fns` |
| **rrule** | Recurring events | `rrule` |
| **natural** | NLP utilities | `natural` |
| **sentiment** | Sentiment analysis | `sentiment` |

### Installation

```bash
# Core
npm install mem0ai chrono-node compromise compromise-dates

# Supporting
npm install date-fns rrule natural sentiment
```

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

| Priority | Feature | Library/Tool | Effort | Impact |
|----------|---------|--------------|--------|--------|
| 🥇 P0 | Mem0 Long-Term Memory | mem0ai | 2 days | Critical |
| 🥈 P0 | Deadline Extraction | chrono-node | 1 day | High |
| 🥉 P0 | Follow-up Tracking | Custom + patterns | 2 days | Critical |
| P1 | Action Item Extraction | Mistral + patterns | 2 days | High |
| P1 | Enhanced Daily Briefing | Aggregate services | 1 day | High |
| P1.5 | Analytics & Visualization | Mistral Code Interpreter | 1 day | High |
| P2 | Conflict Detection | Custom | 2 days | Medium |
| P2 | Focus Time Protection | Custom | 1 day | Medium |
| P3 | Relationship Tracking | Custom | 2 days | Medium |
| P3 | Important Date Alerts | Custom | 1 day | Low |

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

- [ ] All memory operations use `{tenantId}:{userId}` format
- [ ] Vector store queries filter by tenant
- [ ] PII is redacted before storage (configurable)
- [ ] Memory encryption at rest enabled
- [ ] GDPR delete endpoint implemented
- [ ] GDPR export endpoint implemented
- [ ] Rate limiting per tenant
- [ ] Audit logging for memory access
- [ ] Memory TTL configured (auto-expire old memories)

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

*Last Updated: December 14, 2025*
*Version: 2.1 - Added Mistral Code Interpreter for Analytics*
