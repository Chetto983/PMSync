# AI Secretary Implementation Plan

**Date:** December 14, 2025
**Purpose:** Detailed implementation plan with recommended libraries, patterns, and best practices for each AI Secretary feature

---

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Phase 0: Long-Term Memory (Mem0)](#phase-0-long-term-memory-mem0)
3. [Phase 1: Proactive Intelligence](#phase-1-proactive-intelligence)
4. [Phase 2: Smart Scheduling](#phase-2-smart-scheduling)
5. [Phase 3: Relationship Intelligence](#phase-3-relationship-intelligence)
6. [Recommended Libraries](#recommended-libraries)
7. [Architecture Patterns](#architecture-patterns)

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

### Recommended Solution: Mem0 Node.js SDK (Direct Integration - No Backend!)

**Package:** `mem0ai`

**Why Direct SDK (No Separate Backend):**

- **Zero additional infrastructure** - Uses SDK directly in NestJS
- **Uses existing Mistral** - Our existing API key for LLM + embeddings
- **Uses existing PostgreSQL** - Store memories in our main database
- **Simpler deployment** - No extra Docker containers needed
- **26% accuracy improvement** - Same benefits, simpler setup

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
| P2 | Conflict Detection | Custom | 2 days | Medium |
| P2 | Focus Time Protection | Custom | 1 day | Medium |
| P3 | Relationship Tracking | Custom | 2 days | Medium |
| P3 | Important Date Alerts | Custom | 1 day | Low |

---

## Sources

### Memory & Learning
- [Mem0 Documentation](https://docs.mem0.ai/overview/)
- [Survey of AI Agent Memory Frameworks](https://www.graphlit.com/blog/survey-of-ai-agent-memory-frameworks)
- [Agent Memory: How to Build Agents that Learn](https://www.letta.com/blog/agent-memory)

### Date & Time Parsing
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

---

*Last Updated: December 14, 2025*
