/**
 * Unified Retriever with Memory-First RAG (2025 Best Practices)
 *
 * Implements:
 * - Memory-First: Personal context before data search
 * - Self-Reflection: Determines which sources to query
 * - Multi-Source: Parallel retrieval from all knowledge sources
 * - Fusion: Merge and re-rank across sources
 *
 * @see docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md P1.6
 */
import { Logger } from '@nestjs/common';
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

/**
 * Advanced Unified RAG Retriever with memory-first approach.
 * Searches across all knowledge sources: memories, emails, deadlines, follow-ups, action items.
 */
export class UnifiedRetriever extends BaseRetriever {
  private readonly nestLogger = new Logger(UnifiedRetriever.name);
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
    if (!query || query.trim().length < 3) {
      return '';
    }

    try {
      // Step 1: Memory-First - Get user context
      const memoryContext = await this.getMemoryContext(query);

      // Step 2: Self-Reflection - Determine sources to search
      const sourcesToSearch = this.analyzeQuerySources(query, memoryContext);

      // Step 3: Multi-Source Retrieval (parallel)
      const results = await this.searchSources(query, sourcesToSearch);

      // Step 4: Fusion & Re-ranking
      const rankedResults = this.fuseAndRerank(query, results, memoryContext);

      if (rankedResults.length === 0 && this.getMemoryCount(memoryContext) === 0) {
        return '';
      }

      // Step 5: Format for LLM
      return this.formatContext(rankedResults, memoryContext);
    } catch (error) {
      this.nestLogger.error('Error in unified retrieval', error instanceof Error ? error.stack : String(error));
      return '';
    }
  }

  /**
   * Extract query string from input
   */
  private extractQuery(input: string | BaseMessage[]): string {
    if (typeof input === 'string') {
      return input.trim();
    }
    // Extract from last user message
    for (let i = input.length - 1; i >= 0; i--) {
      const msg = input[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') return msg.content.trim();
        if (Array.isArray(msg.content)) {
          const textPart = msg.content.find(
            (p) => typeof p === 'object' && 'type' in p && p.type === 'text',
          );
          if (textPart && 'text' in textPart) return (textPart as { text: string }).text.trim();
        }
      }
    }
    return '';
  }

  /**
   * Memory-First: Get user's personal context
   */
  async getMemoryContext(query: string): Promise<MemoryContext> {
    const emptyContext: MemoryContext = {
      facts: [],
      preferences: [],
      contacts: [],
      history: [],
    };

    try {
      const [longTermMemories, mem0Memories] = await Promise.all([
        this.longTermMemory.searchMemories(this.tenantId, this.userId, query, {
          limit: this.memoryLimit,
        }).catch(() => []),
        this.mem0Memory?.searchMemories(this.tenantId, this.userId, query, {
          limit: this.memoryLimit,
        }).catch(() => []) ?? Promise.resolve([]),
      ]);

      return {
        facts: longTermMemories
          .filter((m: any) => m.category === 'FACT' || m.category === 'GENERAL')
          .map((m: any) => ({ id: m.id, content: m.content, category: m.category, score: m.score ?? 0.5 })),
        preferences: longTermMemories
          .filter((m: any) => m.category === 'PREFERENCE' || m.category === 'HABIT')
          .map((m: any) => ({ id: m.id, content: m.content, category: m.category, score: m.score ?? 0.5 })),
        contacts: longTermMemories
          .filter((m: any) => m.category === 'CONTACT' || m.category === 'RELATIONSHIP')
          .map((m: any) => ({ id: m.id, content: m.content, category: m.category, score: m.score ?? 0.5 })),
        history: mem0Memories.map((m: any) => ({
          id: m.id,
          content: m.memory || m.content,
          score: m.score ?? 0.5,
        })),
      };
    } catch (error) {
      this.nestLogger.warn(`Memory retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
      return emptyContext;
    }
  }

  /**
   * Self-Reflection: Analyze query to determine which sources to search
   */
  analyzeQuerySources(query: string, _context?: MemoryContext): SearchSource[] {
    const sources: SearchSource[] = [];
    const lowerQuery = query.toLowerCase();

    // Always search emails (primary source)
    sources.push('emails');

    // Deadline-related queries (en + it)
    if (/deadline|due|when|by when|urgent|scadenza|entro|quando/.test(lowerQuery)) {
      sources.push('deadlines');
    }

    // Follow-up related queries (en + it)
    if (/follow.?up|waiting|response|reply|pending|attesa|risposta|sollecito/.test(lowerQuery)) {
      sources.push('followups');
    }

    // Action item related queries (en + it)
    if (/task|action|todo|need to|should|must|compito|fare|azione|attività/.test(lowerQuery)) {
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
   * Search emails using hybrid retriever logic (vector + keyword)
   */
  private async searchEmails(query: string): Promise<SourceResult> {
    const items: SourceResult['items'] = [];
    const seenIds = new Set<string>();

    try {
      // Vector search for semantic similarity
      const embedding = await this.mistralService.generateEmbedding(query);
      if (embedding && embedding.length > 0) {
        const vectorResults = await this.embeddingsService.findSimilarContent<{
          id: string;
          content: string;
          documentName: string | null;
          metadata: any;
          distance?: number;
        }>(this.tenantId, embedding, this.emailLimit);

        for (const vr of vectorResults) {
          if (!seenIds.has(vr.id)) {
            seenIds.add(vr.id);
            // Convert distance (0-2) to score (1-0)
            const score = vr.distance !== undefined ? 1 - vr.distance / 2 : 0.5;
            items.push({
              id: vr.id,
              content: vr.content,
              score,
              metadata: { type: 'email', source: 'vector', ...vr.metadata },
            });
          }
        }
      }
    } catch (error) {
      this.nestLogger.warn(`Vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      // Keyword search fallback
      const keywordResults = await this.prisma.email.findMany({
        where: {
          tenantId: this.tenantId,
          folder: EXCLUDE_JUNK_FOLDERS,
          OR: [
            { subject: { contains: query, mode: 'insensitive' } },
            { snippet: { contains: query, mode: 'insensitive' } },
            { from: { contains: query, mode: 'insensitive' } },
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

      for (const kr of keywordResults) {
        if (!seenIds.has(kr.id)) {
          seenIds.add(kr.id);
          items.push({
            id: kr.id,
            content: `Email: ${kr.subject || 'No subject'}\nFrom: ${kr.from || 'Unknown'}\n${kr.snippet || ''}`,
            score: 0.3, // Lower score for keyword matches
            metadata: {
              type: 'email',
              source: 'keyword',
              from: kr.from,
              subject: kr.subject,
              receivedAt: kr.receivedAt,
            },
          });
        }
      }
    } catch (error) {
      this.nestLogger.warn(`Keyword search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { source: 'emails', items };
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
          status: { in: ['UPCOMING', 'DUE_SOON'] },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: this.deadlineLimit,
        orderBy: { deadline: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          deadline: true,
          status: true,
          confidence: true,
        },
      });

      return {
        source: 'deadlines',
        items: deadlines.map((d) => ({
          id: d.id,
          content: `Deadline: ${d.title}\nDue: ${d.deadline.toLocaleDateString()}\nStatus: ${d.status}\n${d.description || ''}`,
          score: 0.7,
          metadata: { type: 'deadline', dueDate: d.deadline, status: d.status },
        })),
      };
    } catch (error) {
      this.nestLogger.warn(`Deadline search failed: ${error instanceof Error ? error.message : String(error)}`);
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
          status: { in: ['PENDING', 'REMINDED'] },
          OR: [
            { reason: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: this.followupLimit,
        orderBy: { dueDate: 'asc' },
        select: {
          id: true,
          emailId: true,
          reason: true,
          dueDate: true,
          status: true,
        },
      });

      // Fetch email details for each follow-up
      const emailIds = followups.map((f: { emailId: string }) => f.emailId);
      const emails: Array<{ id: string; subject: string | null; from: string | null }> = emailIds.length > 0
        ? await (this.prisma as any).email.findMany({
            where: { id: { in: emailIds } },
            select: { id: true, subject: true, from: true },
          })
        : [];
      const emailMap = new Map(emails.map((e) => [e.id, e]));

      return {
        source: 'followups',
        items: followups.map((f) => {
          const email = emailMap.get(f.emailId);
          return {
            id: f.id,
            content: `Follow-up: ${email?.subject || 'Unknown'}\nFrom: ${email?.from || 'Unknown'}\nReason: ${f.reason || 'Awaiting response'}\nDue: ${f.dueDate.toLocaleDateString()}`,
            score: 0.7,
            metadata: { type: 'followup', dueDate: f.dueDate, status: f.status },
          };
        }),
      };
    } catch (error) {
      this.nestLogger.warn(`Follow-up search failed: ${error instanceof Error ? error.message : String(error)}`);
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
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
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
          content: `Task: ${a.title}\nPriority: ${this.priorityToLabel(a.priority)}\nStatus: ${a.status}${a.dueDate ? `\nDue: ${a.dueDate.toLocaleDateString()}` : ''}\n${a.description || ''}`,
          score: 0.7,
          metadata: { type: 'action', priority: a.priority, status: a.status, dueDate: a.dueDate },
        })),
      };
    } catch (error) {
      this.nestLogger.warn(`Action item search failed: ${error instanceof Error ? error.message : String(error)}`);
      return { source: 'actions', items: [] };
    }
  }

  /**
   * Convert priority number to label
   */
  private priorityToLabel(priority: number): string {
    if (priority <= 3) return 'High';
    if (priority <= 6) return 'Medium';
    return 'Low';
  }

  /**
   * Fusion & Re-ranking: Combine results and re-rank with memory boost
   */
  fuseAndRerank(
    _query: string,
    results: SourceResult[],
    memoryContext: MemoryContext,
  ): Array<{ source: SearchSource; content: string; score: number }> {
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

        // Items matching user preferences get bonus
        for (const pref of memoryContext.preferences) {
          if (item.content.toLowerCase().includes(pref.content.toLowerCase())) {
            score *= 1 + this.memoryBoost * 0.5;
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
   * Get total memory count
   */
  private getMemoryCount(memoryContext: MemoryContext): number {
    return (
      memoryContext.facts.length +
      memoryContext.preferences.length +
      memoryContext.contacts.length +
      memoryContext.history.length
    );
  }

  /**
   * Format context for LLM consumption
   */
  formatContext(
    results: Array<{ source: SearchSource; content: string; score: number }>,
    memoryContext: MemoryContext,
  ): string {
    const sections: string[] = [];

    // Add memory context first (memory-first approach)
    const allMemories = [
      ...memoryContext.facts,
      ...memoryContext.preferences,
      ...memoryContext.contacts,
    ];

    if (allMemories.length > 0) {
      const memoryHeader = this.locale === 'it' ? '## Contesto Utente (dalla memoria)' : '## User Context (from memory)';
      sections.push(memoryHeader);
      for (const memory of allMemories) {
        sections.push(`- ${memory.content}`);
      }
      sections.push('');
    }

    // Add conversation history if available
    if (memoryContext.history.length > 0) {
      const historyHeader = this.locale === 'it' ? '## Storico Conversazioni' : '## Conversation History';
      sections.push(historyHeader);
      for (const hist of memoryContext.history.slice(0, 3)) {
        sections.push(`- ${hist.content}`);
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

    const sourceLabels: Record<SearchSource, { en: string; it: string }> = {
      emails: { en: 'Relevant Emails', it: 'Email Rilevanti' },
      deadlines: { en: 'Upcoming Deadlines', it: 'Scadenze Imminenti' },
      followups: { en: 'Pending Follow-ups', it: 'Follow-up in Sospeso' },
      actions: { en: 'Action Items', it: 'Azioni da Completare' },
      memories: { en: 'Memories', it: 'Ricordi' },
    };

    for (const [source, items] of bySource) {
      if (items.length > 0) {
        const label = sourceLabels[source][this.locale] || sourceLabels[source].en;
        sections.push(`## ${label}`);
        sections.push(items.join('\n\n---\n\n'));
        sections.push('');
      }
    }

    return sections.join('\n');
  }
}
