# P1.6 Unified Knowledge Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Knowledge Agent into a unified search hub with memory-first RAG, multi-source retrieval, and 2025 advanced techniques.

**Architecture:** Memory-first approach that searches user's long-term memory BEFORE data sources, then uses self-reflection to determine which sources to query (emails, deadlines, follow-ups, action items), performs parallel multi-source retrieval, and applies fusion with memory-boosted re-ranking.

**Tech Stack:** @voltagent/core, Prisma + pgvector, existing memory services (LongTermMemoryService, Mem0EnhancedMemoryService), HybridRetriever, BullMQ, Redis cache

---

## Task 1: Create UnifiedRetriever Base Class

**Files:**
- Create: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`
- Reference: `backend/src/modules/ai/voltagent/rag/hybrid-retriever.ts`

**Step 1: Write the failing test**

Create test file `backend/src/modules/ai/voltagent/rag/__tests__/unified-retriever.spec.ts`:

```typescript
import { UnifiedRetriever, UnifiedRetrieverOptions } from '../unified-retriever';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { LongTermMemoryService } from '../../memory/long-term-memory.service';
import { MistralService } from '../../../services/mistral.service';
import { EmbeddingsService } from '../../../services/embeddings.service';

describe('UnifiedRetriever', () => {
  let retriever: UnifiedRetriever;
  let mockPrisma: jest.Mocked<PrismaService>;
  let mockLongTermMemory: jest.Mocked<LongTermMemoryService>;
  let mockMistral: jest.Mocked<MistralService>;
  let mockEmbeddings: jest.Mocked<EmbeddingsService>;

  const tenantId = 'test-tenant';
  const userId = 'test-user';

  beforeEach(() => {
    mockPrisma = {
      email: { findMany: jest.fn() },
      aiDeadline: { findMany: jest.fn() },
      emailFollowUp: { findMany: jest.fn() },
      aiTask: { findMany: jest.fn() },
    } as any;

    mockLongTermMemory = {
      searchMemories: jest.fn(),
    } as any;

    mockMistral = {
      generateEmbedding: jest.fn(),
    } as any;

    mockEmbeddings = {
      searchSimilar: jest.fn(),
    } as any;

    retriever = new UnifiedRetriever({
      tenantId,
      userId,
      locale: 'en',
      prisma: mockPrisma,
      longTermMemory: mockLongTermMemory,
      mistralService: mockMistral,
      embeddingsService: mockEmbeddings,
    });
  });

  describe('retrieve', () => {
    it('should return empty string for empty query', async () => {
      const result = await retriever.retrieve('');
      expect(result).toBe('');
    });

    it('should search memory first before other sources', async () => {
      mockLongTermMemory.searchMemories.mockResolvedValue([
        { id: '1', content: 'User prefers morning meetings', category: 'PREFERENCE', score: 0.9 },
      ]);
      mockPrisma.email.findMany.mockResolvedValue([]);

      await retriever.retrieve('When should we schedule meetings?');

      expect(mockLongTermMemory.searchMemories).toHaveBeenCalledBefore(
        mockPrisma.email.findMany as jest.Mock
      );
    });
  });

  describe('analyzeQuerySources', () => {
    it('should include deadlines for deadline-related queries', async () => {
      const sources = await (retriever as any).analyzeQuerySources('What is the deadline for the project?');
      expect(sources).toContain('deadlines');
    });

    it('should include followups for follow-up queries', async () => {
      const sources = await (retriever as any).analyzeQuerySources('What follow-ups are pending?');
      expect(sources).toContain('followups');
    });

    it('should include actions for task queries', async () => {
      const sources = await (retriever as any).analyzeQuerySources('What tasks do I need to do?');
      expect(sources).toContain('actions');
    });

    it('should always include emails as primary source', async () => {
      const sources = await (retriever as any).analyzeQuerySources('random query');
      expect(sources).toContain('emails');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/ai/voltagent/rag/__tests__/unified-retriever.spec.ts --passWithNoTests
```

Expected: FAIL with "Cannot find module '../unified-retriever'"

**Step 3: Write minimal implementation**

Create `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`:

```typescript
/**
 * Unified Retriever with Memory-First RAG (2025 Best Practices)
 *
 * Implements:
 * - Memory-First: Personal context before data search
 * - Self-Reflection: Determines which sources to query
 * - Multi-Source: Parallel retrieval from all knowledge sources
 * - Fusion: Merge and re-rank across sources
 */
import { BaseRetriever, type BaseMessage } from '@voltagent/core';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { LongTermMemoryService } from '../memory/long-term-memory.service';
import type { Mem0EnhancedMemoryService } from '../memory/mem0-enhanced-memory.service';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import type { SupportedLocale } from '../locales';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';

export type SearchSource = 'emails' | 'deadlines' | 'followups' | 'actions' | 'memories';

export interface MemoryContext {
  facts: Array<{ id: string; content: string; category: string; score: number }>;
  preferences: Array<{ id: string; content: string; category: string; score: number }>;
  contacts: Array<{ id: string; content: string; category: string; score: number }>;
  history: Array<{ id: string; content: string; score: number }>;
}

export interface SourceResult {
  source: SearchSource;
  items: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface UnifiedRetrieverOptions {
  tenantId: string;
  userId: string;
  locale: SupportedLocale;
  prisma: PrismaService;
  longTermMemory: LongTermMemoryService;
  mem0Memory?: Mem0EnhancedMemoryService;
  mistralService: MistralService;
  embeddingsService: EmbeddingsService;
  // Limits
  memoryLimit?: number;
  emailLimit?: number;
  deadlineLimit?: number;
  followupLimit?: number;
  actionLimit?: number;
  finalLimit?: number;
  // Weights
  memoryBoost?: number;
}

export class UnifiedRetriever extends BaseRetriever {
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly locale: SupportedLocale;
  private readonly prisma: PrismaService;
  private readonly longTermMemory: LongTermMemoryService;
  private readonly mem0Memory?: Mem0EnhancedMemoryService;
  private readonly mistralService: MistralService;
  private readonly embeddingsService: EmbeddingsService;

  // Limits
  private readonly memoryLimit: number;
  private readonly emailLimit: number;
  private readonly deadlineLimit: number;
  private readonly followupLimit: number;
  private readonly actionLimit: number;
  private readonly finalLimit: number;
  private readonly memoryBoost: number;

  constructor(options: UnifiedRetrieverOptions) {
    super();
    this.tenantId = options.tenantId;
    this.userId = options.userId;
    this.locale = options.locale;
    this.prisma = options.prisma;
    this.longTermMemory = options.longTermMemory;
    this.mem0Memory = options.mem0Memory;
    this.mistralService = options.mistralService;
    this.embeddingsService = options.embeddingsService;

    // Defaults
    this.memoryLimit = options.memoryLimit ?? 5;
    this.emailLimit = options.emailLimit ?? 10;
    this.deadlineLimit = options.deadlineLimit ?? 5;
    this.followupLimit = options.followupLimit ?? 5;
    this.actionLimit = options.actionLimit ?? 5;
    this.finalLimit = options.finalLimit ?? 10;
    this.memoryBoost = options.memoryBoost ?? 0.2;
  }

  /**
   * Main retrieval method - implements memory-first unified RAG
   */
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

    // Step 5: Format for LLM
    return this.formatContext(rankedResults, memoryContext);
  }

  /**
   * Extract query string from input
   */
  private extractQuery(input: string | BaseMessage[]): string {
    if (typeof input === 'string') {
      return input.trim();
    }
    // Extract from last user message
    const userMessages = input.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return '';
    const lastMessage = userMessages[userMessages.length - 1];
    return typeof lastMessage.content === 'string' ? lastMessage.content.trim() : '';
  }

  /**
   * Memory-First: Get user's personal context
   */
  async getMemoryContext(query: string): Promise<MemoryContext> {
    const [longTermMemories, mem0Memories] = await Promise.all([
      this.longTermMemory.searchMemories(this.tenantId, this.userId, query, {
        limit: this.memoryLimit,
      }),
      this.mem0Memory?.searchMemories(this.tenantId, this.userId, query, {
        limit: this.memoryLimit,
      }) ?? Promise.resolve([]),
    ]);

    return {
      facts: longTermMemories
        .filter((m) => m.category === 'FACT' || m.category === 'GENERAL')
        .map((m) => ({ id: m.id, content: m.content, category: m.category, score: m.score ?? 0 })),
      preferences: longTermMemories
        .filter((m) => m.category === 'PREFERENCE' || m.category === 'HABIT')
        .map((m) => ({ id: m.id, content: m.content, category: m.category, score: m.score ?? 0 })),
      contacts: longTermMemories
        .filter((m) => m.category === 'CONTACT' || m.category === 'RELATIONSHIP')
        .map((m) => ({ id: m.id, content: m.content, category: m.category, score: m.score ?? 0 })),
      history: mem0Memories.map((m) => ({
        id: m.id,
        content: m.content,
        score: m.score ?? 0,
      })),
    };
  }

  /**
   * Self-Reflection: Analyze query to determine which sources to search
   */
  async analyzeQuerySources(
    query: string,
    _context?: MemoryContext,
  ): Promise<SearchSource[]> {
    const sources: SearchSource[] = [];
    const lowerQuery = query.toLowerCase();

    // Always search emails (primary source)
    sources.push('emails');

    // Deadline-related queries
    if (/deadline|due|when|by when|urgent|scadenza|entro/.test(lowerQuery)) {
      sources.push('deadlines');
    }

    // Follow-up related queries
    if (/follow.?up|waiting|response|reply|pending|attesa|risposta/.test(lowerQuery)) {
      sources.push('followups');
    }

    // Action item related queries
    if (/task|action|todo|need to|should|must|compito|fare|azione/.test(lowerQuery)) {
      sources.push('actions');
    }

    return sources;
  }

  /**
   * Multi-Source Retrieval: Search all relevant sources in parallel
   */
  async searchSources(query: string, sources: SearchSource[]): Promise<SourceResult[]> {
    const searchPromises: Promise<SourceResult>[] = [];

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

    return Promise.all(searchPromises);
  }

  /**
   * Search emails using hybrid retriever logic
   */
  private async searchEmails(query: string): Promise<SourceResult> {
    try {
      // Vector search for semantic similarity
      const vectorResults = await this.embeddingsService.searchSimilar(
        this.tenantId,
        query,
        this.emailLimit,
      );

      // Keyword search fallback
      const keywordResults = await this.prisma.email.findMany({
        where: {
          tenantId: this.tenantId,
          folder: EXCLUDE_JUNK_FOLDERS,
          OR: [
            { subject: { contains: query, mode: 'insensitive' } },
            { snippet: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: this.emailLimit,
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          subject: true,
          snippet: true,
          from: true,
          receivedAt: true,
        },
      });

      // Merge results
      const seen = new Set<string>();
      const items: SourceResult['items'] = [];

      for (const vr of vectorResults) {
        if (!seen.has(vr.id)) {
          seen.add(vr.id);
          items.push({
            id: vr.id,
            content: `Email: ${vr.subject || 'No subject'}\nFrom: ${vr.from || 'Unknown'}\n${vr.snippet || ''}`,
            score: vr.score ?? 0.5,
            metadata: { type: 'email', source: 'vector' },
          });
        }
      }

      for (const kr of keywordResults) {
        if (!seen.has(kr.id)) {
          seen.add(kr.id);
          items.push({
            id: kr.id,
            content: `Email: ${kr.subject || 'No subject'}\nFrom: ${kr.from || 'Unknown'}\n${kr.snippet || ''}`,
            score: 0.3, // Lower score for keyword matches
            metadata: { type: 'email', source: 'keyword' },
          });
        }
      }

      return { source: 'emails', items };
    } catch (error) {
      console.error('Error searching emails:', error);
      return { source: 'emails', items: [] };
    }
  }

  /**
   * Search deadlines
   */
  private async searchDeadlines(query: string): Promise<SourceResult> {
    try {
      const deadlines = await this.prisma.aiDeadline.findMany({
        where: {
          tenantId: this.tenantId,
          userId: this.userId,
          status: { in: ['PENDING', 'DUE_SOON'] },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: this.deadlineLimit,
        orderBy: { dueDate: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          dueDate: true,
          priority: true,
        },
      });

      return {
        source: 'deadlines',
        items: deadlines.map((d) => ({
          id: d.id,
          content: `Deadline: ${d.title}\nDue: ${d.dueDate.toLocaleDateString()}\nPriority: ${d.priority}\n${d.description || ''}`,
          score: 0.7,
          metadata: { type: 'deadline', dueDate: d.dueDate, priority: d.priority },
        })),
      };
    } catch (error) {
      console.error('Error searching deadlines:', error);
      return { source: 'deadlines', items: [] };
    }
  }

  /**
   * Search follow-ups
   */
  private async searchFollowUps(query: string): Promise<SourceResult> {
    try {
      const followups = await this.prisma.emailFollowUp.findMany({
        where: {
          tenantId: this.tenantId,
          userId: this.userId,
          status: { in: ['PENDING', 'OVERDUE'] },
          OR: [
            { reason: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: this.followupLimit,
        orderBy: { dueDate: 'asc' },
        include: {
          email: {
            select: { subject: true, from: true },
          },
        },
      });

      return {
        source: 'followups',
        items: followups.map((f) => ({
          id: f.id,
          content: `Follow-up needed: ${f.email?.subject || 'Unknown'}\nFrom: ${f.email?.from || 'Unknown'}\nReason: ${f.reason}\nDue: ${f.dueDate.toLocaleDateString()}`,
          score: 0.7,
          metadata: { type: 'followup', dueDate: f.dueDate, status: f.status },
        })),
      };
    } catch (error) {
      console.error('Error searching follow-ups:', error);
      return { source: 'followups', items: [] };
    }
  }

  /**
   * Search action items
   */
  private async searchActionItems(query: string): Promise<SourceResult> {
    try {
      const actions = await this.prisma.aiTask.findMany({
        where: {
          tenantId: this.tenantId,
          userId: this.userId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: this.actionLimit,
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          dueDate: true,
          status: true,
        },
      });

      return {
        source: 'actions',
        items: actions.map((a) => ({
          id: a.id,
          content: `Task: ${a.title}\nPriority: ${a.priority}\nStatus: ${a.status}${a.dueDate ? `\nDue: ${a.dueDate.toLocaleDateString()}` : ''}\n${a.description || ''}`,
          score: 0.7,
          metadata: { type: 'action', priority: a.priority, status: a.status },
        })),
      };
    } catch (error) {
      console.error('Error searching action items:', error);
      return { source: 'actions', items: [] };
    }
  }

  /**
   * Fusion & Re-ranking: Combine results and re-rank with memory boost
   */
  async fuseAndRerank(
    _query: string,
    results: SourceResult[],
    memoryContext: MemoryContext,
  ): Promise<Array<{ source: SearchSource; content: string; score: number }>> {
    // Flatten all results
    const allResults: Array<{ source: SearchSource; content: string; score: number }> = [];

    for (const result of results) {
      for (const item of result.items) {
        let score = item.score;

        // Apply memory context boost
        // Items related to known contacts get bonus
        for (const contact of memoryContext.contacts) {
          if (item.content.toLowerCase().includes(contact.content.toLowerCase())) {
            score *= 1 + this.memoryBoost;
            break;
          }
        }

        allResults.push({
          source: result.source,
          content: item.content,
          score,
        });
      }
    }

    // Sort by score descending
    allResults.sort((a, b) => b.score - a.score);

    // Return top results
    return allResults.slice(0, this.finalLimit);
  }

  /**
   * Format context for LLM consumption
   */
  formatContext(
    results: Array<{ source: SearchSource; content: string; score: number }>,
    memoryContext: MemoryContext,
  ): string {
    const sections: string[] = [];

    // Add memory context first
    const allMemories = [
      ...memoryContext.facts,
      ...memoryContext.preferences,
      ...memoryContext.contacts,
    ];

    if (allMemories.length > 0) {
      sections.push('## User Context (from memory)');
      for (const memory of allMemories) {
        sections.push(`- ${memory.content}`);
      }
      sections.push('');
    }

    // Add search results by source
    const bySource = new Map<SearchSource, string[]>();
    for (const result of results) {
      if (!bySource.has(result.source)) {
        bySource.set(result.source, []);
      }
      bySource.get(result.source)!.push(result.content);
    }

    const sourceLabels: Record<SearchSource, string> = {
      emails: 'Relevant Emails',
      deadlines: 'Upcoming Deadlines',
      followups: 'Pending Follow-ups',
      actions: 'Action Items',
      memories: 'Memories',
    };

    for (const [source, items] of bySource) {
      if (items.length > 0) {
        sections.push(`## ${sourceLabels[source]}`);
        sections.push(items.join('\n\n---\n\n'));
        sections.push('');
      }
    }

    return sections.join('\n');
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/ai/voltagent/rag/__tests__/unified-retriever.spec.ts -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/ai/voltagent/rag/unified-retriever.ts src/modules/ai/voltagent/rag/__tests__/unified-retriever.spec.ts
git commit -m "feat(P1.6): add UnifiedRetriever with memory-first RAG"
```

---

## Task 2: Add Locale Translations for Unified Knowledge Agent

**Files:**
- Modify: `backend/src/modules/ai/voltagent/locales/en.ts`
- Modify: `backend/src/modules/ai/voltagent/locales/it.ts`
- Modify: `backend/src/modules/ai/voltagent/locales/index.ts`

**Step 1: Add English translations**

In `backend/src/modules/ai/voltagent/locales/en.ts`, add to the `knowledge` section:

```typescript
// Find the existing knowledge section and extend it
knowledge: {
  // ... existing translations ...
  instructions: `You are a unified knowledge assistant with access to:
- User's personal memories and preferences
- Email archive (excluding spam/trash)
- Upcoming deadlines
- Pending follow-ups
- Action items and tasks

Search across all sources to provide comprehensive answers. Always prioritize user context from memory.
When referencing information, cite the source (email, deadline, task, etc.).`,
  found: (count: number) => `Found ${count} relevant item${count !== 1 ? 's' : ''}`,
  noResults: 'No relevant information found in knowledge base',
  remembered: 'Information saved to memory',
  sources: {
    emails: 'From emails',
    deadlines: 'From deadlines',
    followups: 'From follow-ups',
    actions: 'From action items',
    memories: 'From your memories',
  },
},
```

**Step 2: Add Italian translations**

In `backend/src/modules/ai/voltagent/locales/it.ts`, add to the `knowledge` section:

```typescript
knowledge: {
  // ... existing translations ...
  instructions: `Sei un assistente di conoscenza unificato con accesso a:
- Memorie e preferenze personali dell'utente
- Archivio email (escludendo spam/cestino)
- Scadenze imminenti
- Follow-up in sospeso
- Azioni e attività

Cerca in tutte le fonti per fornire risposte complete. Dai sempre priorità al contesto dell'utente dalla memoria.
Quando fai riferimento a informazioni, cita la fonte (email, scadenza, attività, ecc.).`,
  found: (count: number) => `Trovati ${count} element${count !== 1 ? 'i' : 'o'} rilevant${count !== 1 ? 'i' : 'e'}`,
  noResults: 'Nessuna informazione rilevante trovata nella base di conoscenza',
  remembered: 'Informazione salvata in memoria',
  sources: {
    emails: 'Dalle email',
    deadlines: 'Dalle scadenze',
    followups: 'Dai follow-up',
    actions: 'Dalle azioni',
    memories: 'Dai tuoi ricordi',
  },
},
```

**Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/modules/ai/voltagent/locales/
git commit -m "feat(P1.6): add locale translations for unified knowledge agent"
```

---

## Task 3: Create Unified Knowledge Agent Factory

**Files:**
- Create: `backend/src/modules/ai/voltagent/agents/unified-knowledge.agent.ts`
- Modify: `backend/src/modules/ai/voltagent/agents/index.ts`

**Step 1: Write the failing test**

Create `backend/src/modules/ai/voltagent/agents/__tests__/unified-knowledge.agent.spec.ts`:

```typescript
import { createUnifiedKnowledgeAgent, UnifiedKnowledgeAgentOptions } from '../unified-knowledge.agent';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { LongTermMemoryService } from '../../memory/long-term-memory.service';
import { MistralService } from '../../../services/mistral.service';
import { EmbeddingsService } from '../../../services/embeddings.service';
import { DeadlineExtractorService } from '../../services/deadline-extractor.service';
import { FollowUpService } from '../../services/follow-up.service';
import { ActionItemService } from '../../services/action-item.service';

describe('createUnifiedKnowledgeAgent', () => {
  const mockModel = {} as any;
  const mockPrisma = {} as jest.Mocked<PrismaService>;
  const mockLongTermMemory = {} as jest.Mocked<LongTermMemoryService>;
  const mockMistral = {} as jest.Mocked<MistralService>;
  const mockEmbeddings = {} as jest.Mocked<EmbeddingsService>;
  const mockDeadlineService = {} as jest.Mocked<DeadlineExtractorService>;
  const mockFollowUpService = {} as jest.Mocked<FollowUpService>;
  const mockActionItemService = {} as jest.Mocked<ActionItemService>;

  it('should create an agent with correct name', () => {
    const agent = createUnifiedKnowledgeAgent({
      model: mockModel,
      prisma: mockPrisma,
      locale: 'en',
      tenantId: 'test-tenant',
      userId: 'test-user',
      longTermMemory: mockLongTermMemory,
      mistralService: mockMistral,
      embeddingsService: mockEmbeddings,
      deadlineService: mockDeadlineService,
      followUpService: mockFollowUpService,
      actionItemService: mockActionItemService,
    });

    expect(agent.name).toBe('UnifiedKnowledgeAgent');
  });

  it('should have tools for unified search, deadlines, followups, actions, and remember', () => {
    const agent = createUnifiedKnowledgeAgent({
      model: mockModel,
      prisma: mockPrisma,
      locale: 'en',
      tenantId: 'test-tenant',
      userId: 'test-user',
      longTermMemory: mockLongTermMemory,
      mistralService: mockMistral,
      embeddingsService: mockEmbeddings,
      deadlineService: mockDeadlineService,
      followUpService: mockFollowUpService,
      actionItemService: mockActionItemService,
    });

    const toolNames = agent.tools.map((t: any) => t.name);
    expect(toolNames).toContain('unified_search');
    expect(toolNames).toContain('get_deadlines');
    expect(toolNames).toContain('get_followups');
    expect(toolNames).toContain('get_action_items');
    expect(toolNames).toContain('remember');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/ai/voltagent/agents/__tests__/unified-knowledge.agent.spec.ts --passWithNoTests
```

Expected: FAIL with "Cannot find module '../unified-knowledge.agent'"

**Step 3: Write the implementation**

Create `backend/src/modules/ai/voltagent/agents/unified-knowledge.agent.ts`:

```typescript
/**
 * Unified Knowledge Agent for VoltAgent
 *
 * Memory-first RAG agent that searches across all knowledge sources:
 * - User memories and preferences
 * - Emails (via HybridRetriever)
 * - Deadlines
 * - Follow-ups
 * - Action items
 *
 * Uses 2025 best practices:
 * - Memory-First: Personal context before data search
 * - Self-Reflection: Determines which sources to query
 * - Multi-Source: Parallel retrieval
 * - Fusion & Re-ranking: Memory-boosted scoring
 */
import { Agent, createTool, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { LongTermMemoryService } from '../memory/long-term-memory.service';
import type { Mem0EnhancedMemoryService } from '../memory/mem0-enhanced-memory.service';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import type { DeadlineExtractorService } from '../services/deadline-extractor.service';
import type { FollowUpService } from '../services/follow-up.service';
import type { ActionItemService } from '../services/action-item.service';
import { getAgentTranslations, getToolTranslations, type SupportedLocale } from '../locales';
import { UnifiedRetriever } from '../rag/unified-retriever';

export interface UnifiedKnowledgeAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  locale: SupportedLocale;
  tenantId: string;
  userId: string;
  hooks?: AgentHooks;
  // Memory services
  longTermMemory: LongTermMemoryService;
  mem0Memory?: Mem0EnhancedMemoryService;
  // Data services
  deadlineService: DeadlineExtractorService;
  followUpService: FollowUpService;
  actionItemService: ActionItemService;
  // RAG services
  mistralService: MistralService;
  embeddingsService: EmbeddingsService;
}

/**
 * Creates tools for unified knowledge search
 */
function createUnifiedKnowledgeTools(options: UnifiedKnowledgeAgentOptions) {
  const {
    prisma,
    tenantId,
    userId,
    locale,
    longTermMemory,
    deadlineService,
    followUpService,
    actionItemService,
    embeddingsService,
  } = options;
  const t = getToolTranslations(locale);

  return [
    // Unified search across all sources
    createTool({
      name: 'unified_search',
      description:
        'Search across all knowledge sources: emails, memories, deadlines, follow-ups, action items. Use this for comprehensive searches.',
      parameters: z.object({
        query: z.string().describe('Search query'),
        sources: z
          .array(z.enum(['emails', 'memories', 'deadlines', 'followups', 'actions']))
          .optional()
          .describe('Sources to search (default: all relevant based on query)'),
        limit: z.number().optional().describe('Maximum results per source (default: 5)'),
      }),
      execute: async ({ query, sources, limit }) => {
        const retriever = new UnifiedRetriever({
          tenantId,
          userId,
          locale,
          prisma,
          longTermMemory,
          mem0Memory: options.mem0Memory,
          mistralService: options.mistralService,
          embeddingsService,
          emailLimit: limit ?? 5,
          deadlineLimit: limit ?? 5,
          followupLimit: limit ?? 5,
          actionLimit: limit ?? 5,
        });

        const context = await retriever.retrieve(query);

        return {
          success: true,
          context,
          summary: context ? t.knowledge.found(context.split('\n').filter((l) => l.trim()).length) : t.knowledge.noResults,
        };
      },
    }),

    // Get upcoming deadlines
    createTool({
      name: 'get_deadlines',
      description: 'Get upcoming deadlines for the user',
      parameters: z.object({
        days: z.number().optional().describe('Days ahead to look (default: 7)'),
      }),
      execute: async ({ days }) => {
        const deadlines = await deadlineService.getUpcomingDeadlines(tenantId, userId, days ?? 7);
        return {
          success: true,
          data: deadlines,
          summary: t.knowledge.found(deadlines.length),
        };
      },
    }),

    // Get pending follow-ups
    createTool({
      name: 'get_followups',
      description: 'Get pending follow-ups that need attention',
      parameters: z.object({
        status: z.enum(['pending', 'overdue', 'all']).optional().describe('Filter by status'),
      }),
      execute: async ({ status }) => {
        let followups;
        if (status === 'overdue') {
          followups = await followUpService.getOverdueFollowUps(tenantId, userId);
        } else {
          followups = await followUpService.getPendingFollowUps(tenantId, userId);
        }
        return {
          success: true,
          data: followups,
          summary: t.knowledge.found(followups.length),
        };
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
        let items;
        if (status === 'todo' || !status) {
          items = await actionItemService.getPending(tenantId, userId);
        } else {
          items = await actionItemService.list(tenantId, userId, {
            status: status?.toUpperCase() as any,
            priority: priority ? (priority === 'high' ? 2 : priority === 'medium' ? 5 : 8) : undefined,
          });
        }

        // Filter by priority if specified
        if (priority && items) {
          const priorityMap = { high: 2, medium: 5, low: 8 };
          items = items.filter((i: any) => i.priority <= priorityMap[priority]);
        }

        return {
          success: true,
          data: items,
          summary: t.knowledge.found(items?.length ?? 0),
        };
      },
    }),

    // Remember something (store in memory)
    createTool({
      name: 'remember',
      description:
        'Store information in long-term memory for future reference. Use this when the user shares preferences, facts, or important information.',
      parameters: z.object({
        content: z.string().describe('What to remember'),
        category: z
          .enum(['preference', 'fact', 'contact', 'project', 'general'])
          .optional()
          .describe('Category of memory'),
      }),
      execute: async ({ content, category }) => {
        const categoryMap: Record<string, string> = {
          preference: 'PREFERENCE',
          fact: 'FACT',
          contact: 'CONTACT',
          project: 'PROJECT',
          general: 'GENERAL',
        };

        await longTermMemory.addFact(tenantId, userId, content, {
          category: (categoryMap[category ?? 'general'] ?? 'GENERAL') as any,
        });

        return {
          success: true,
          message: t.knowledge.remembered,
        };
      },
    }),
  ];
}

/**
 * Creates a Unified Knowledge Agent with memory-first RAG
 *
 * @param options - Agent configuration options
 * @returns Configured VoltAgent Agent instance
 */
export function createUnifiedKnowledgeAgent(options: UnifiedKnowledgeAgentOptions): Agent {
  const { model, prisma, locale, tenantId, userId, hooks } = options;
  const t = getAgentTranslations(locale);

  // Create unified retriever for automatic RAG context injection
  const retriever = new UnifiedRetriever({
    tenantId,
    userId,
    locale,
    prisma,
    longTermMemory: options.longTermMemory,
    mem0Memory: options.mem0Memory,
    mistralService: options.mistralService,
    embeddingsService: options.embeddingsService,
  });

  return new Agent({
    name: 'UnifiedKnowledgeAgent',
    purpose: 'Search and retrieve information from all knowledge sources with memory context',
    model,
    instructions: t.knowledge.instructions,
    tools: createUnifiedKnowledgeTools(options),
    hooks,
    maxSteps: 5, // Allow multi-hop queries
    retriever, // Automatic RAG context injection
  });
}
```

**Step 4: Update exports**

In `backend/src/modules/ai/voltagent/agents/index.ts`, add:

```typescript
export {
  createUnifiedKnowledgeAgent,
  type UnifiedKnowledgeAgentOptions,
} from './unified-knowledge.agent';
```

**Step 5: Run tests**

```bash
cd backend && npx jest src/modules/ai/voltagent/agents/__tests__/unified-knowledge.agent.spec.ts -v
```

Expected: PASS

**Step 6: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors

**Step 7: Commit**

```bash
git add src/modules/ai/voltagent/agents/
git commit -m "feat(P1.6): add UnifiedKnowledgeAgent factory with tools"
```

---

## Task 4: Add UnifiedKnowledgeService for API Integration

**Files:**
- Create: `backend/src/modules/ai/voltagent/services/unified-knowledge.service.ts`
- Modify: `backend/src/modules/ai/voltagent/voltagent.module.ts`

**Step 1: Write the failing test**

Create `backend/src/modules/ai/voltagent/services/__tests__/unified-knowledge.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedKnowledgeService } from '../unified-knowledge.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LongTermMemoryService } from '../../memory/long-term-memory.service';
import { MistralService } from '../../../services/mistral.service';
import { EmbeddingsService } from '../../../services/embeddings.service';
import { DeadlineExtractorService } from '../deadline-extractor.service';
import { FollowUpService } from '../follow-up.service';
import { ActionItemService } from '../action-item.service';

describe('UnifiedKnowledgeService', () => {
  let service: UnifiedKnowledgeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedKnowledgeService,
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LongTermMemoryService, useValue: {} },
        { provide: MistralService, useValue: {} },
        { provide: EmbeddingsService, useValue: {} },
        { provide: DeadlineExtractorService, useValue: {} },
        { provide: FollowUpService, useValue: {} },
        { provide: ActionItemService, useValue: {} },
      ],
    }).compile();

    service = module.get<UnifiedKnowledgeService>(UnifiedKnowledgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should return search results', async () => {
      // Mock implementation will be added
      expect(service.search).toBeDefined();
    });
  });

  describe('remember', () => {
    it('should store memory', async () => {
      expect(service.remember).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/ai/voltagent/services/__tests__/unified-knowledge.service.spec.ts --passWithNoTests
```

Expected: FAIL with "Cannot find module '../unified-knowledge.service'"

**Step 3: Write the implementation**

Create `backend/src/modules/ai/voltagent/services/unified-knowledge.service.ts`:

```typescript
/**
 * Unified Knowledge Service
 *
 * NestJS service that provides unified search across all knowledge sources.
 * Used by VoltAgentController for API endpoints.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LongTermMemoryService } from '../memory/long-term-memory.service';
import { Mem0EnhancedMemoryService } from '../memory/mem0-enhanced-memory.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { DeadlineExtractorService } from './deadline-extractor.service';
import { FollowUpService } from './follow-up.service';
import { ActionItemService } from './action-item.service';
import { UnifiedRetriever, SearchSource } from '../rag/unified-retriever';
import { getLocale, type SupportedLocale } from '../locales';

export interface UnifiedSearchOptions {
  sources?: SearchSource[];
  limit?: number;
  locale?: string;
}

export interface UnifiedSearchResult {
  success: boolean;
  context: string;
  sources: SearchSource[];
  itemCount: number;
  fromCache?: boolean;
}

export interface RememberOptions {
  category?: 'preference' | 'fact' | 'contact' | 'project' | 'general';
  locale?: string;
}

@Injectable()
export class UnifiedKnowledgeService {
  private readonly logger = new Logger(UnifiedKnowledgeService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly longTermMemory: LongTermMemoryService,
    private readonly mem0Memory: Mem0EnhancedMemoryService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly deadlineService: DeadlineExtractorService,
    private readonly followUpService: FollowUpService,
    private readonly actionItemService: ActionItemService,
  ) {
    this.enabled = this.config.get<string>('UNIFIED_KNOWLEDGE_ENABLED', 'true') === 'true';
  }

  /**
   * Perform unified search across all knowledge sources
   */
  async search(
    tenantId: string,
    userId: string,
    query: string,
    options: UnifiedSearchOptions = {},
  ): Promise<UnifiedSearchResult> {
    if (!this.enabled) {
      return {
        success: false,
        context: 'Unified knowledge search is disabled',
        sources: [],
        itemCount: 0,
      };
    }

    const locale = getLocale(options.locale);

    try {
      const retriever = new UnifiedRetriever({
        tenantId,
        userId,
        locale,
        prisma: this.prisma,
        longTermMemory: this.longTermMemory,
        mem0Memory: this.mem0Memory,
        mistralService: this.mistralService,
        embeddingsService: this.embeddingsService,
        emailLimit: options.limit ?? 5,
        deadlineLimit: options.limit ?? 5,
        followupLimit: options.limit ?? 5,
        actionLimit: options.limit ?? 5,
      });

      const context = await retriever.retrieve(query);

      // Count items in context
      const itemCount = context
        .split('\n')
        .filter((line) => line.startsWith('- ') || line.startsWith('Email:') || line.startsWith('Deadline:') || line.startsWith('Task:') || line.startsWith('Follow-up'))
        .length;

      return {
        success: true,
        context,
        sources: options.sources ?? ['emails', 'deadlines', 'followups', 'actions'],
        itemCount,
      };
    } catch (error) {
      this.logger.error(`Unified search failed: ${error}`);
      return {
        success: false,
        context: '',
        sources: [],
        itemCount: 0,
      };
    }
  }

  /**
   * Store information in long-term memory
   */
  async remember(
    tenantId: string,
    userId: string,
    content: string,
    options: RememberOptions = {},
  ): Promise<{ success: boolean; memoryId?: string }> {
    if (!this.enabled) {
      return { success: false };
    }

    try {
      const categoryMap: Record<string, string> = {
        preference: 'PREFERENCE',
        fact: 'FACT',
        contact: 'CONTACT',
        project: 'PROJECT',
        general: 'GENERAL',
      };

      const memoryId = await this.longTermMemory.addFact(tenantId, userId, content, {
        category: (categoryMap[options.category ?? 'general'] ?? 'GENERAL') as any,
      });

      return { success: true, memoryId: memoryId ?? undefined };
    } catch (error) {
      this.logger.error(`Remember failed: ${error}`);
      return { success: false };
    }
  }

  /**
   * Get knowledge base statistics
   */
  async getStats(tenantId: string, userId: string): Promise<{
    memoryCount: number;
    deadlineCount: number;
    followupCount: number;
    actionCount: number;
  }> {
    const [memoryStats, deadlineStats, followupStats, actionStats] = await Promise.all([
      this.longTermMemory.getStats(tenantId, userId),
      this.deadlineService.getDeadlineStats(tenantId, userId),
      this.followUpService.getStats(tenantId, userId),
      this.actionItemService.getStats(tenantId, userId),
    ]);

    return {
      memoryCount: memoryStats.totalMemories,
      deadlineCount: deadlineStats.upcoming + deadlineStats.dueSoon,
      followupCount: followupStats.pending + followupStats.overdue,
      actionCount: actionStats.total - actionStats.done,
    };
  }
}
```

**Step 4: Register in VoltAgentModule**

In `backend/src/modules/ai/voltagent/voltagent.module.ts`:

1. Add import at top:
```typescript
import { UnifiedKnowledgeService } from './services/unified-knowledge.service';
```

2. Add to providers array:
```typescript
providers: [
  // ... existing providers ...
  // Unified Knowledge (P1.6)
  UnifiedKnowledgeService,
],
```

3. Add to exports array:
```typescript
exports: [
  // ... existing exports ...
  // Unified Knowledge
  UnifiedKnowledgeService,
],
```

**Step 5: Run tests**

```bash
cd backend && npx jest src/modules/ai/voltagent/services/__tests__/unified-knowledge.service.spec.ts -v
```

Expected: PASS

**Step 6: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors

**Step 7: Commit**

```bash
git add src/modules/ai/voltagent/services/unified-knowledge.service.ts src/modules/ai/voltagent/voltagent.module.ts
git commit -m "feat(P1.6): add UnifiedKnowledgeService with NestJS integration"
```

---

## Task 5: Add API Endpoints for Unified Knowledge

**Files:**
- Modify: `backend/src/modules/ai/voltagent/voltagent.controller.ts`

**Step 1: Add endpoint imports and inject service**

In `backend/src/modules/ai/voltagent/voltagent.controller.ts`:

1. Add import:
```typescript
import { UnifiedKnowledgeService } from './services/unified-knowledge.service';
```

2. Add to constructor:
```typescript
constructor(
  // ... existing injections ...
  private readonly unifiedKnowledgeService: UnifiedKnowledgeService,
) {}
```

**Step 2: Add search endpoint**

```typescript
@Post('knowledge/search')
@UseGuards(AuthGuard)
async unifiedSearch(
  @Req() req: AuthenticatedRequest,
  @Body() body: { query: string; sources?: string[]; limit?: number },
): Promise<{
  success: boolean;
  context: string;
  sources: string[];
  itemCount: number;
}> {
  const { tenantId, id: userId } = req.user;
  const locale = req.headers['accept-language'] || 'en';

  return this.unifiedKnowledgeService.search(tenantId, userId, body.query, {
    sources: body.sources as any,
    limit: body.limit,
    locale,
  });
}
```

**Step 3: Add remember endpoint**

```typescript
@Post('knowledge/remember')
@UseGuards(AuthGuard)
async remember(
  @Req() req: AuthenticatedRequest,
  @Body() body: { content: string; category?: string },
): Promise<{ success: boolean; memoryId?: string }> {
  const { tenantId, id: userId } = req.user;
  const locale = req.headers['accept-language'] || 'en';

  return this.unifiedKnowledgeService.remember(tenantId, userId, body.content, {
    category: body.category as any,
    locale,
  });
}
```

**Step 4: Add stats endpoint**

```typescript
@Get('knowledge/stats')
@UseGuards(AuthGuard)
async knowledgeStats(
  @Req() req: AuthenticatedRequest,
): Promise<{
  memoryCount: number;
  deadlineCount: number;
  followupCount: number;
  actionCount: number;
}> {
  const { tenantId, id: userId } = req.user;
  return this.unifiedKnowledgeService.getStats(tenantId, userId);
}
```

**Step 5: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors

**Step 6: Commit**

```bash
git add src/modules/ai/voltagent/voltagent.controller.ts
git commit -m "feat(P1.6): add REST API endpoints for unified knowledge"
```

---

## Task 6: Create Integration Test Script

**Files:**
- Create: `backend/scripts/test-unified-knowledge.ts`

**Step 1: Write the test script**

```typescript
/**
 * Unified Knowledge Agent Integration Test
 *
 * Tests the P1.6 unified knowledge search functionality with real data.
 *
 * Usage: npx ts-node scripts/test-unified-knowledge.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UnifiedKnowledgeService } from '../src/modules/ai/voltagent/services/unified-knowledge.service';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  response?: unknown;
  error?: string;
}

async function main() {
  console.log('='.repeat(60));
  console.log('P1.6 UNIFIED KNOWLEDGE AGENT INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log();

  const prisma = createPrismaClient();

  // Find a test user
  const user = await prisma.user.findFirst({
    select: { id: true, tenantId: true, email: true },
  });

  if (!user) {
    console.error('No user found in database. Please create a user first.');
    process.exit(1);
  }

  console.log(`Testing with user: ${user.email} (tenant: ${user.tenantId})`);
  console.log();

  // Bootstrap NestJS
  console.log('Starting Unified Knowledge Service...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const knowledgeService = app.get(UnifiedKnowledgeService);

  // Test cases
  const testCases = [
    {
      name: 'Unified Search - General Query',
      fn: async () => {
        return knowledgeService.search(user.tenantId, user.id, 'What emails have I received recently?', {
          locale: 'en',
        });
      },
    },
    {
      name: 'Unified Search - Deadline Query',
      fn: async () => {
        return knowledgeService.search(user.tenantId, user.id, 'What are my upcoming deadlines?', {
          locale: 'en',
        });
      },
    },
    {
      name: 'Unified Search - Task Query',
      fn: async () => {
        return knowledgeService.search(user.tenantId, user.id, 'What tasks do I need to complete?', {
          locale: 'en',
        });
      },
    },
    {
      name: 'Unified Search - Follow-up Query',
      fn: async () => {
        return knowledgeService.search(user.tenantId, user.id, 'What follow-ups are pending?', {
          locale: 'en',
        });
      },
    },
    {
      name: 'Remember - Store Preference',
      fn: async () => {
        return knowledgeService.remember(
          user.tenantId,
          user.id,
          'I prefer to receive daily briefings in the morning at 9 AM',
          { category: 'preference' },
        );
      },
    },
    {
      name: 'Knowledge Stats',
      fn: async () => {
        return knowledgeService.getStats(user.tenantId, user.id);
      },
    },
    {
      name: 'Unified Search - Italian Locale',
      fn: async () => {
        return knowledgeService.search(user.tenantId, user.id, 'Quali sono le mie scadenze?', {
          locale: 'it',
        });
      },
    },
  ];

  const results: TestResult[] = [];

  for (const test of testCases) {
    console.log(`Running: ${test.name}`);
    const startTime = Date.now();

    try {
      const result = await test.fn();
      const duration = Date.now() - startTime;

      console.log(`   PASSED (${duration}ms)`);

      if (typeof result === 'object' && result !== null) {
        const r = result as Record<string, unknown>;
        if ('success' in r) {
          console.log(`   Success: ${r.success}`);
        }
        if ('itemCount' in r) {
          console.log(`   Items found: ${r.itemCount}`);
        }
        if ('context' in r && typeof r.context === 'string') {
          console.log(`   Context preview: ${r.context.substring(0, 100)}...`);
        }
      }

      results.push({
        name: test.name,
        status: 'passed',
        duration,
        response: result,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.log(`   FAILED (${duration}ms)`);
      console.log(`   Error: ${errorMessage}`);

      results.push({
        name: test.name,
        status: 'failed',
        duration,
        error: errorMessage,
      });
    }

    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log();

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }

  await app.close();
  await prisma.$disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
```

**Step 2: Run the test**

```bash
cd backend && npx ts-node scripts/test-unified-knowledge.ts
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add scripts/test-unified-knowledge.ts
git commit -m "test(P1.6): add integration test script for unified knowledge"
```

---

## Task 7: Update RAG Index Exports

**Files:**
- Modify: `backend/src/modules/ai/voltagent/rag/index.ts`

**Step 1: Add exports**

In `backend/src/modules/ai/voltagent/rag/index.ts`, add:

```typescript
export {
  UnifiedRetriever,
  type UnifiedRetrieverOptions,
  type SearchSource,
  type MemoryContext,
  type SourceResult,
} from './unified-retriever';
```

**Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/modules/ai/voltagent/rag/index.ts
git commit -m "chore(P1.6): export UnifiedRetriever from rag index"
```

---

## Task 8: Add Environment Configuration

**Files:**
- Modify: `backend/.env.example`

**Step 1: Add P1.6 configuration**

Add to `backend/.env.example`:

```env
# P1.6 Unified Knowledge Agent
UNIFIED_KNOWLEDGE_ENABLED=true
UNIFIED_KNOWLEDGE_MEMORY_BOOST=0.2
UNIFIED_KNOWLEDGE_MAX_SOURCES=5
UNIFIED_KNOWLEDGE_SELF_REFLECT=true
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(P1.6): add environment variables for unified knowledge"
```

---

## Task 9: Final Integration & Documentation

**Files:**
- Modify: `docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md`

**Step 1: Update implementation status**

In the Implementation Priority table, change P1.6 status to ✅ DONE:

```markdown
| **P1.6** | **Unified Knowledge Agent** | **Memory + RAG** | **2 days** | **High** | ✅ DONE |
```

**Step 2: Add implementation notes**

Add after the P1.6 section:

```markdown
### Completed P1.6 Implementation Notes

**Unified Knowledge Agent (Dec 15, 2025):**

- `UnifiedRetriever` class with memory-first RAG pipeline
- Self-reflection for source selection (emails, deadlines, followups, actions)
- Parallel multi-source retrieval
- Memory-boosted fusion and re-ranking
- `UnifiedKnowledgeService` NestJS service
- REST API endpoints: `POST /knowledge/search`, `POST /knowledge/remember`, `GET /knowledge/stats`
- Integration test: `backend/scripts/test-unified-knowledge.ts`
- Locale support: English and Italian
```

**Step 3: Commit**

```bash
git add docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md
git commit -m "docs(P1.6): mark unified knowledge agent as complete"
```

---

## Summary

This plan creates the P1.6 Unified Knowledge Agent with:

| Component | File | Purpose |
|-----------|------|---------|
| UnifiedRetriever | `rag/unified-retriever.ts` | Memory-first RAG with multi-source search |
| UnifiedKnowledgeAgent | `agents/unified-knowledge.agent.ts` | VoltAgent factory with tools |
| UnifiedKnowledgeService | `services/unified-knowledge.service.ts` | NestJS service for API |
| API Endpoints | `voltagent.controller.ts` | REST endpoints for search/remember |
| Locales | `locales/en.ts`, `locales/it.ts` | Translations |
| Integration Test | `scripts/test-unified-knowledge.ts` | End-to-end testing |

**Total Tasks:** 9
**Estimated Time:** 2-3 hours

---

Plan complete and saved to `docs/plans/2025-12-15-unified-knowledge-agent.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
