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
// LongTermMemoryService removed - AI module refactor v2.0

import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import type { SupportedLocale } from '../locales';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';

export type SearchSource = 'emails' | 'deadlines' | 'followups' | 'actions' | 'memories';

/** Memory record returned from LongTermMemoryService (preserved for future use) */
interface _LongTermMemoryRecord {
  id: string;
  content: string;
  category: string;
  score?: number;
}



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

  // RAG services (optional - will use basic text search if not available)
  mistralService?: MistralService;
  embeddingsService?: EmbeddingsService;
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

  private readonly mistralService?: MistralService;
  private readonly embeddingsService?: EmbeddingsService;

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
            (p: unknown) => typeof p === 'object' && p !== null && 'type' in p && (p as { type: string }).type === 'text',
          );
          if (textPart && 'text' in textPart) return (textPart as { text: string }).text.trim();
        }
      }
    }
    return '';
  }

  /**
   * Memory-First: Get user's personal context
   * NOTE: LongTermMemory removed in AI refactor v2.0 - returns empty context
   */
  async getMemoryContext(_query: string): Promise<MemoryContext> {
    // Memory retrieval disabled - LongTermMemoryService removed in AI refactor v2.0
    // Future: use EmailAnalysis patterns for user preferences
    return {
      facts: [],
      preferences: [],
      contacts: [],
      history: [],
    };
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
   * Search emails using hybrid retriever logic (vector + keyword with RRF fusion)
   *
   * 2025 Best Practice: Reciprocal Rank Fusion (RRF)
   * - Items found by BOTH vector AND keyword get boosted
   * - Vector results prioritized for semantic understanding
   * - Keyword helps with exact matches (IDs, names)
   */
  private async searchEmails(query: string): Promise<SourceResult> {
    const RRF_K = 60; // Standard RRF constant
    const rrfScores = new Map<string, { score: number; content: string; metadata: Record<string, unknown> }>();

    // Helper to add RRF score
    const addRrfScore = (
      id: string,
      rank: number,
      content: string,
      metadata: Record<string, unknown>,
      source: 'vector' | 'keyword'
    ) => {
      const rrfContribution = 1 / (RRF_K + rank);
      const existing = rrfScores.get(id);
      if (existing) {
        // Item found by both sources - boost it!
        existing.score += rrfContribution;
        existing.metadata.sources = [...((existing.metadata.sources as string[]) || []), source];
      } else {
        rrfScores.set(id, {
          score: rrfContribution,
          content,
          metadata: { ...metadata, type: 'email', sources: [source] },
        });
      }
    };

    // 1. Vector search for semantic similarity
    try {
      if (this.mistralService && this.embeddingsService) {
        const embedding = await this.mistralService.generateEmbedding(query);
        if (embedding && embedding.length > 0) {
          const vectorResults = await this.embeddingsService.findSimilarContent<{
            id: string;
            content: string;
            documentName: string | null;
            metadata: Record<string, unknown> | null;
            distance?: number;
          }>(this.tenantId, embedding, this.emailLimit * 2); // Fetch more for fusion

          vectorResults.forEach((vr, idx) => {
            addRrfScore(vr.id, idx + 1, vr.content, vr.metadata || {}, 'vector');
          });
        }
      }
    } catch (error) {
      this.nestLogger.warn(`Vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Keyword search for exact matches
    try {
      // Split query into keywords for better matching
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      if (keywords.length > 0) {
        const keywordResults = await this.prisma.email.findMany({
          where: {
            tenantId: this.tenantId,
            folder: EXCLUDE_JUNK_FOLDERS,
            OR: [
              { subject: { contains: query, mode: 'insensitive' } },
              { snippet: { contains: query, mode: 'insensitive' } },
              { from: { contains: query, mode: 'insensitive' } },
              // Also search for individual keywords
              ...keywords.slice(0, 3).map((kw) => ({ subject: { contains: kw, mode: 'insensitive' as const } })),
            ],
          },
          take: this.emailLimit * 2,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            snippet: true,
            from: true,
            receivedAt: true,
          },
        });

        keywordResults.forEach((kr, idx) => {
          const content = `Email: ${kr.subject || 'No subject'}\nFrom: ${kr.from || 'Unknown'}\n${kr.snippet || ''}`;
          addRrfScore(kr.id, idx + 1, content, { from: kr.from, subject: kr.subject, receivedAt: kr.receivedAt }, 'keyword');
        });
      }
    } catch (error) {
      this.nestLogger.warn(`Keyword search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. Convert to sorted items array
    const items: SourceResult['items'] = Array.from(rrfScores.entries())
      .map(([id, data]) => ({
        id,
        content: data.content,
        score: data.score,
        metadata: data.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.emailLimit);

    // Log hybrid search stats
    const vectorOnly = items.filter((i) => (i.metadata?.sources as string[])?.length === 1 && (i.metadata?.sources as string[])[0] === 'vector').length;
    const keywordOnly = items.filter((i) => (i.metadata?.sources as string[])?.length === 1 && (i.metadata?.sources as string[])[0] === 'keyword').length;
    const both = items.filter((i) => (i.metadata?.sources as string[])?.length === 2).length;
    this.nestLogger.debug(`Hybrid search: ${vectorOnly} vector-only, ${keywordOnly} keyword-only, ${both} both`);

    return { source: 'emails', items };
  }

  /**
   * Search deadlines from EmailAnalysis
   */
  private async searchDeadlines(_query: string): Promise<SourceResult> {
    try {
      // Use EmailAnalysis model (AI refactor v2.0)
      // First get user's provider IDs
      const providers = await this.prisma.providerConfig.findMany({
        where: { tenantId: this.tenantId, userId: this.userId, isActive: true },
        select: { id: true },
      });
      const providerIds = providers.map((p) => p.id);

      if (providerIds.length === 0) {
        return { source: 'deadlines', items: [] };
      }

      const analyses = await this.prisma.emailAnalysis.findMany({
        where: {
          tenantId: this.tenantId,
          email: { providerId: { in: providerIds } },
          hasDeadline: true,
          deadlineDate: { gte: new Date() },
        },
        take: this.deadlineLimit,
        orderBy: { deadlineDate: 'asc' },
        include: {
          email: { select: { subject: true, snippet: true } },
        },
      });

      // Type assertion for included relation
      type AnalysisWithEmail = typeof analyses[number] & { email: { subject: string | null; snippet: string | null } | null };

      return {
        source: 'deadlines',
        items: (analyses as AnalysisWithEmail[]).map((a) => ({
          id: a.id,
          content: `Deadline: ${a.email?.subject || 'Untitled'}\nDue: ${a.deadlineDate?.toLocaleDateString() || 'N/A'}\nPriority: ${a.priority}\n${a.summary || ''}`,
          score: 0.7,
          metadata: { type: 'deadline', dueDate: a.deadlineDate, priority: a.priority },
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
        ? await this.prisma.email.findMany({
          where: { id: { in: emailIds }, tenantId: this.tenantId },
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
   * Search action items from ActionQueue
   */
  private async searchActionItems(_query: string): Promise<SourceResult> {
    try {
      // Use ActionQueue model (AI refactor v2.0)
      const actions = await this.prisma.actionQueue.findMany({
        where: {
          tenantId: this.tenantId,
          userId: this.userId,
          status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
        },
        take: this.actionLimit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          email: { select: { subject: true } },
        },
      });

      return {
        source: 'actions',
        items: actions.map((a) => ({
          id: a.id,
          content: `Action: ${a.actionType}\nConfidence: ${(a.confidence * 100).toFixed(0)}%\nStatus: ${a.status}\nEmail: ${a.email?.subject || 'N/A'}`,
          score: a.confidence,
          metadata: { type: 'action', actionType: a.actionType, status: a.status },
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
