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
import type { QueryAnalyzerService, QueryAnalysis } from './query-analyzer.service';

const EMAIL_ADDRESS_REGEX = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'how', 'if', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'then', 'there', 'this', 'to', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
  'che', 'chi', 'come', 'da', 'dei', 'degli', 'delle', 'del', 'della', 'di', 'e', 'gli', 'il', 'in', 'la', 'le',
  'lo', 'ma', 'nel', 'nella', 'nelle', 'nello', 'no', 'non', 'o', 'per', 'perche', 'quando', 'questo', 'su', 'un',
  'una', 'uno', 'si',
]);

export type SearchSource = 'emails' | 'contacts' | 'deadlines' | 'followups' | 'actions' | 'memories';

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

interface RankedResult {
  source: SearchSource;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface UnifiedRetrieverOptions {
  tenantId: string;
  userId: string;
  locale: SupportedLocale;
  prisma: PrismaService;

  // RAG services (optional - will use basic text search if not available)
  mistralService?: MistralService;
  embeddingsService?: EmbeddingsService;
  queryAnalyzer?: QueryAnalyzerService;
  // Limits
  memoryLimit?: number;
  emailLimit?: number;
  contactLimit?: number;
  deadlineLimit?: number;
  followupLimit?: number;
  actionLimit?: number;
  finalLimit?: number;
  // Weights
  memoryBoost?: number;
  diversityLambda?: number;
  recencyBoost?: number;
  recencyHalfLifeDays?: number;
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
  private readonly queryAnalyzer?: QueryAnalyzerService;

  // Limits
  private readonly memoryLimit: number;
  private readonly emailLimit: number;
  private readonly contactLimit: number;
  private readonly deadlineLimit: number;
  private readonly followupLimit: number;
  private readonly actionLimit: number;
  private readonly finalLimit: number;
  private readonly memoryBoost: number;
  private readonly diversityLambda: number;
  private readonly recencyBoost: number;
  private readonly recencyHalfLifeDays: number;

  constructor(options: UnifiedRetrieverOptions) {
    super();
    this.tenantId = options.tenantId;
    this.userId = options.userId;
    this.locale = options.locale;
    this.prisma = options.prisma;

    this.mistralService = options.mistralService;
    this.embeddingsService = options.embeddingsService;
    this.queryAnalyzer = options.queryAnalyzer;

    // Defaults
    this.memoryLimit = options.memoryLimit ?? 5;
    this.emailLimit = options.emailLimit ?? 10;
    this.contactLimit = options.contactLimit ?? 10;
    this.deadlineLimit = options.deadlineLimit ?? 5;
    this.followupLimit = options.followupLimit ?? 5;
    this.actionLimit = options.actionLimit ?? 5;
    this.finalLimit = options.finalLimit ?? 10;
    this.memoryBoost = options.memoryBoost ?? 0.2;
    this.diversityLambda = options.diversityLambda ?? 0.7;
    this.recencyBoost = options.recencyBoost ?? 0.15;
    this.recencyHalfLifeDays = options.recencyHalfLifeDays ?? 30;
  }

  /** Minimum score threshold for valid results */
  private readonly MIN_RESULT_SCORE = 0.01;
  /** Minimum results before triggering expansion */
  private readonly MIN_RESULTS_THRESHOLD = 3;

  /**
   * Main retrieval method - implements memory-first unified RAG
   *
   * Phase D Enhancement: Uses QueryAnalyzer for smarter source selection
   * and adds result validation with automatic expansion.
   */
  async retrieve(input: string | BaseMessage[]): Promise<string> {
    const query = this.extractQuery(input);
    if (!query || query.trim().length < 3) {
      return '';
    }

    try {
      // Step 1: Query Analysis (Phase D) - Use analyzer if available
      let queryAnalysis: QueryAnalysis | undefined;
      let sourcesToSearch: SearchSource[];

      if (this.queryAnalyzer) {
        queryAnalysis = await this.queryAnalyzer.analyze(query);
        sourcesToSearch = queryAnalysis.primarySources;
        this.nestLogger.debug(
          `[RAG] QueryAnalyzer: intent=${queryAnalysis.intent}, sources=${sourcesToSearch.join(',')}, entities=${queryAnalysis.entities.length}`,
        );
      } else {
        // Fallback to legacy method (no memory context needed - handled by ChatContextBuilder)
        sourcesToSearch = this.analyzeQuerySources(query);
      }

      // Step 2: Memory context placeholder (actual memory is injected by ChatContextBuilder)
      // This empty context is kept for formatContext() compatibility
      const memoryContext: MemoryContext = { facts: [], preferences: [], contacts: [], history: [] };

      // Step 3: Multi-Source Retrieval (parallel)
      const results = await this.searchSources(query, sourcesToSearch);

      // Step 4: Fusion & Re-ranking
      let rankedResults = this.fuseAndRerank(query, results, memoryContext);

      // Step 5: Result Validation (Phase D) - Check if results are sufficient
      rankedResults = this.validateAndExpandResults(rankedResults, query, queryAnalysis);

      if (rankedResults.length === 0 && this.getMemoryCount(memoryContext) === 0) {
        return '';
      }

      // Step 6: Format for LLM
      return this.formatContext(rankedResults, memoryContext);
    } catch (error) {
      this.nestLogger.error('Error in unified retrieval', error instanceof Error ? error.stack : String(error));
      return '';
    }
  }

  /**
   * Validate results and potentially expand search (Phase D)
   *
   * - Filters out low-score results
   * - Logs warning if too few results (expansion would require re-search)
   */
  private validateAndExpandResults(
    results: Array<{ source: SearchSource; content: string; score: number }>,
    query: string,
    analysis?: QueryAnalysis,
  ): Array<{ source: SearchSource; content: string; score: number }> {
    // Filter out very low score results
    const validResults = results.filter((r) => r.score >= this.MIN_RESULT_SCORE);

    // Check if we have enough results
    if (validResults.length < this.MIN_RESULTS_THRESHOLD) {
      this.nestLogger.warn(
        `[RAG] Low result count (${validResults.length}/${this.MIN_RESULTS_THRESHOLD}) for query: "${query.substring(0, 50)}..."` +
        (analysis ? ` intent=${analysis.intent}` : ''),
      );
      // Future: Could trigger broader search here
    }

    return validResults;
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
   *
   * NOTE: This method returns empty context. User memory is now handled by:
   * - VoltAgent Working Memory: Structured preferences (tone, language)
   * - AIMemoryService via search_memory tool: Semantic search on user facts
   *
   * See tools/memory.tools.ts for the new implementation.
   */
  async getMemoryContext(_query: string): Promise<MemoryContext> {
    // Memory is now handled via VoltAgent tools, not RAG retriever
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
    const lowerQuery = this.normalizeQuery(query);

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

    // Contact-related queries (en + it)
    if (/contact|person|who|from|sender|colleague|client|customer|contatto|persona|chi|da|mittente|collega|cliente/.test(lowerQuery)) {
      sources.push('contacts');
    }
    if (EMAIL_ADDRESS_REGEX.test(query) && !sources.includes('contacts')) {
      sources.push('contacts');
    }

    return sources;
  }

  /**
   * Multi-Source Retrieval: Search all relevant sources in parallel
   *
   * MS-4 FIX: Uses Promise.allSettled() to prevent cascading failures.
   * If one source fails, others still return results.
   */
  async searchSources(query: string, sources: SearchSource[]): Promise<SourceResult[]> {
    const searchPromises: Promise<SourceResult>[] = [];
    const sourceNames: SearchSource[] = [];

    if (sources.includes('emails')) {
      searchPromises.push(this.searchEmails(query));
      sourceNames.push('emails');
    }
    if (sources.includes('contacts')) {
      searchPromises.push(this.searchContacts(query));
      sourceNames.push('contacts');
    }
    if (sources.includes('deadlines')) {
      searchPromises.push(this.searchDeadlines(query));
      sourceNames.push('deadlines');
    }
    if (sources.includes('followups')) {
      searchPromises.push(this.searchFollowUps(query));
      sourceNames.push('followups');
    }
    if (sources.includes('actions')) {
      searchPromises.push(this.searchActionItems(query));
      sourceNames.push('actions');
    }

    // MS-4 FIX: Use allSettled to prevent cascading failures
    const results = await Promise.allSettled(searchPromises);

    return results
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        // Log error but return empty result instead of failing
        this.nestLogger.warn(`Search failed for source ${sourceNames[index]}: ${result.reason}`);
        return { source: sourceNames[index], items: [] };
      });
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
    const keywords = this.extractKeywords(query);

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
    // FIX H2: Use emailId from embedding, not embedding.id
    // GDPR FIX: Fetch content from Email table if embedding content is null
    try {
      if (this.mistralService && this.embeddingsService) {
        const embedding = await this.mistralService.generateEmbedding(query, undefined, { tenantId: this.tenantId });
        if (embedding && embedding.length > 0) {
          const vectorResults = await this.embeddingsService.findSimilarContent<{
            id: string;
            emailId: string | null;
            contactId: string | null;
            content: string | null;
            documentName: string | null;
            metadata: Record<string, unknown> | null;
            distance?: number;
          }>(this.tenantId, embedding, this.emailLimit * 2); // Fetch more for fusion

          // Collect emailIds that need content fetched from source table
          const emailIdsNeedingContent = vectorResults
            .filter((vr) => vr.emailId && !vr.content)
            .map((vr) => vr.emailId as string);

          // Batch fetch email content if needed (GDPR-compliant: content not stored in embeddings)
          const emailContentMap = new Map<string, { content: string; receivedAt: Date | null; from: string | null; subject: string | null }>();
          if (emailIdsNeedingContent.length > 0) {
            const emails = await this.prisma.email.findMany({
              where: { id: { in: emailIdsNeedingContent }, tenantId: this.tenantId },
              select: { id: true, subject: true, snippet: true, from: true, receivedAt: true },
            });
            emails.forEach((e) => {
              emailContentMap.set(e.id, {
                content: `Email: ${e.subject || 'No subject'}\nFrom: ${e.from || 'Unknown'}\n${e.snippet || ''}`,
                receivedAt: e.receivedAt ?? null,
                from: e.from ?? null,
                subject: e.subject ?? null,
              });
            });
          }

          vectorResults.forEach((vr, idx) => {
            // FIX H2: Use emailId for email results, skip if no emailId (document embeddings)
            if (vr.emailId) {
              // Use embedding content if available, otherwise fetch from source table
              const emailMeta = emailContentMap.get(vr.emailId);
              const content = vr.content || emailMeta?.content || '';
              const metadata: Record<string, unknown> = { ...(vr.metadata || {}) };
              if (emailMeta?.receivedAt) metadata.receivedAt = emailMeta.receivedAt;
              if (emailMeta?.from) metadata.from = emailMeta.from;
              if (emailMeta?.subject) metadata.subject = emailMeta.subject;
              addRrfScore(vr.emailId, idx + 1, content, metadata, 'vector');
            }
          });
        }
      }
    } catch (error) {
      this.nestLogger.warn(`Vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Keyword search for exact matches
    try {
      // Split query into keywords for better matching
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
              ...keywords.slice(0, 3).flatMap((kw) => ([
                { subject: { contains: kw, mode: 'insensitive' as const } },
                { snippet: { contains: kw, mode: 'insensitive' as const } },
                { from: { contains: kw, mode: 'insensitive' as const } },
              ])),
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
    this.nestLogger.debug(`Hybrid email search: ${vectorOnly} vector-only, ${keywordOnly} keyword-only, ${both} both`);

    return { source: 'emails', items };
  }

  /**
   * Search contacts using hybrid retriever logic (vector + keyword with RRF fusion)
   *
   * 2025 Best Practice: Same RRF pattern as emails
   * - Vector search for semantic similarity (job title, notes, company context)
   * - Keyword search for exact name/email/company matches
   */
  private async searchContacts(query: string): Promise<SourceResult> {
    const RRF_K = 60;
    const rrfScores = new Map<string, { score: number; content: string; metadata: Record<string, unknown> }>();
    const keywords = this.extractKeywords(query);

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
        existing.score += rrfContribution;
        existing.metadata.sources = [...((existing.metadata.sources as string[]) || []), source];
      } else {
        rrfScores.set(id, {
          score: rrfContribution,
          content,
          metadata: { ...metadata, type: 'contact', sources: [source] },
        });
      }
    };

    // 1. Vector search for semantic similarity (uses contactId indexed field)
    // GDPR FIX: Fetch content from Contact table if embedding content is null
    try {
      if (this.mistralService && this.embeddingsService) {
        const embedding = await this.mistralService.generateEmbedding(query, undefined, { tenantId: this.tenantId });
        if (embedding && embedding.length > 0) {
          // Query embeddings where contactId is not null (contact embeddings only)
          const vectorResults = await this.embeddingsService.findSimilarContent<{
            id: string;
            content: string | null;
            documentName: string | null;
            metadata: Record<string, unknown> | null;
            distance?: number;
            contactId?: string | null;
          }>(this.tenantId, embedding, this.contactLimit * 2, { maxDistance: 0.5 });

          // Filter to only contact embeddings
          const contactEmbeddings = vectorResults.filter(
            (vr) => vr.metadata?.source === 'contact' || vr.contactId
          );

          // Collect contactIds that need content fetched from source table
          const contactIdsNeedingContent = contactEmbeddings
            .filter((vr) => !vr.content)
            .map((vr) => vr.contactId || (vr.metadata as Record<string, unknown>)?.contactId)
            .filter((id): id is string => !!id);

          // Batch fetch contact content if needed (GDPR-compliant)
          const contactContentMap = new Map<string, { content: string; updatedAt: Date | null }>();
          if (contactIdsNeedingContent.length > 0) {
            const contacts = await this.prisma.contact.findMany({
              where: { id: { in: contactIdsNeedingContent }, tenantId: this.tenantId },
              select: { id: true, displayName: true, firstName: true, lastName: true, company: true, jobTitle: true, notes: true, emails: true, updatedAt: true },
            });
            contacts.forEach((c) => {
              const name = c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown';
              const emailList = (c.emails as Array<{ value: string }> | null)?.map((e) => e.value).join(', ') || '';
              contactContentMap.set(c.id, {
                content: [
                  `Contact: ${name}`,
                  c.company && `Company: ${c.company}`,
                  c.jobTitle && `Role: ${c.jobTitle}`,
                  emailList && `Email: ${emailList}`,
                  c.notes && `Notes: ${c.notes}`,
                ].filter(Boolean).join('\n'),
                updatedAt: c.updatedAt ?? null,
              });
            });
          }

          for (let idx = 0; idx < contactEmbeddings.length; idx++) {
            const vr = contactEmbeddings[idx];
            const contactId = vr.contactId || (vr.metadata as Record<string, unknown>)?.contactId as string | undefined;
            // Use embedding content if available, otherwise fetch from source table
            const contactMeta = contactId ? contactContentMap.get(contactId) : undefined;
            const content = vr.content || contactMeta?.content || '';
            const metadata: Record<string, unknown> = { ...(vr.metadata || {}) };
            if (contactMeta?.updatedAt) metadata.updatedAt = contactMeta.updatedAt;
            addRrfScore(contactId || vr.id, idx + 1, content, metadata, 'vector');
          }
        }
      }
    } catch (error) {
      this.nestLogger.warn(`Contact vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Keyword search for exact matches on name, email, company
    try {
      if (keywords.length > 0) {
        const keywordResults = await this.prisma.contact.findMany({
          where: {
            tenantId: this.tenantId,
            OR: [
              { displayName: { contains: query, mode: 'insensitive' } },
              { firstName: { contains: query, mode: 'insensitive' } },
              { lastName: { contains: query, mode: 'insensitive' } },
              { company: { contains: query, mode: 'insensitive' } },
              { jobTitle: { contains: query, mode: 'insensitive' } },
              { notes: { contains: query, mode: 'insensitive' } },
              // Search individual keywords in name/company
              ...keywords.slice(0, 3).flatMap((kw) => [
                { displayName: { contains: kw, mode: 'insensitive' as const } },
                { company: { contains: kw, mode: 'insensitive' as const } },
              ]),
            ],
          },
          take: this.contactLimit * 2,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            company: true,
            jobTitle: true,
            department: true,
            notes: true,
            emails: true,
            phoneNumbers: true,
            updatedAt: true,
          },
        });

        keywordResults.forEach((kr, idx) => {
          const name = kr.displayName || `${kr.firstName || ''} ${kr.lastName || ''}`.trim() || 'Unknown';
          const emailList = (kr.emails as Array<{ value: string }> | null)?.map((e) => e.value).join(', ') || '';
          const content = [
            `Contact: ${name}`,
            kr.company && `Company: ${kr.company}`,
            kr.jobTitle && `Role: ${kr.jobTitle}`,
            kr.department && `Department: ${kr.department}`,
            emailList && `Email: ${emailList}`,
            kr.notes && `Notes: ${kr.notes}`,
          ].filter(Boolean).join('\n');

          addRrfScore(kr.id, idx + 1, content, {
            name,
            company: kr.company,
            jobTitle: kr.jobTitle,
            emails: kr.emails,
            updatedAt: kr.updatedAt,
          }, 'keyword');
        });
      }
    } catch (error) {
      this.nestLogger.warn(`Contact keyword search failed: ${error instanceof Error ? error.message : String(error)}`);
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
      .slice(0, this.contactLimit);

    // Log hybrid search stats
    const vectorOnly = items.filter((i) => (i.metadata?.sources as string[])?.length === 1 && (i.metadata?.sources as string[])[0] === 'vector').length;
    const keywordOnly = items.filter((i) => (i.metadata?.sources as string[])?.length === 1 && (i.metadata?.sources as string[])[0] === 'keyword').length;
    const both = items.filter((i) => (i.metadata?.sources as string[])?.length === 2).length;
    this.nestLogger.debug(`Hybrid contact search: ${vectorOnly} vector-only, ${keywordOnly} keyword-only, ${both} both`);

    return { source: 'contacts', items };
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
          metadata: { type: 'action', actionType: a.actionType, status: a.status, createdAt: a.createdAt },
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
    const allResults: RankedResult[] = [];

    for (const result of results) {
      for (const item of result.items) {
        let score = item.score;
        const contentLower = item.content.toLowerCase();

        // Apply memory context boost
        // Items related to known contacts get bonus
        for (const contact of memoryContext.contacts) {
          if (contentLower.includes(contact.content.toLowerCase())) {
            score *= 1 + this.memoryBoost;
            break;
          }
        }

        // Items matching user preferences get bonus
        for (const pref of memoryContext.preferences) {
          if (contentLower.includes(pref.content.toLowerCase())) {
            score *= 1 + this.memoryBoost * 0.5;
            break;
          }
        }

        score = this.applyRecencyBoost(score, item.metadata);

        allResults.push({
          source: result.source,
          content: item.content,
          score,
          metadata: item.metadata,
        });
      }
    }

    // Sort by score descending
    allResults.sort((a, b) => b.score - a.score);

    // Apply diversity-aware re-ranking (MMR)
    const diversified = this.applyDiversityRerank(allResults);

    // Return top results (drop metadata)
    return diversified.map((item) => ({
      source: item.source,
      content: item.content,
      score: item.score,
    }));
  }

  private normalizeQuery(query: string): string {
    return query
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9@]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractKeywords(query: string): string[] {
    const normalized = this.normalizeQuery(query);
    if (!normalized) return [];
    const tokens = normalized.split(' ').filter((token) => token.length > 2 && !STOPWORDS.has(token));
    return Array.from(new Set(tokens));
  }

  private tokenizeForSimilarity(text: string): Set<string> {
    const normalized = this.normalizeQuery(text);
    if (!normalized) return new Set();
    const tokens = normalized.split(' ').filter((token) => token.length > 2 && !STOPWORDS.has(token));
    return new Set(tokens.slice(0, 80));
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private applyDiversityRerank(items: RankedResult[]): RankedResult[] {
    if (items.length <= 1) return items.slice(0, this.finalLimit);
    const lambda = Math.min(1, Math.max(0, this.diversityLambda));
    if (lambda >= 0.99) return items.slice(0, this.finalLimit);

    const maxScore = Math.max(...items.map((i) => i.score), 1);
    const candidates = items.slice(0, this.finalLimit * 3);
    const selected: RankedResult[] = [];
    const tokenCache = new Map<RankedResult, Set<string>>();

    const getTokens = (item: RankedResult): Set<string> => {
      const cached = tokenCache.get(item);
      if (cached) return cached;
      const tokens = this.tokenizeForSimilarity(item.content);
      tokenCache.set(item, tokens);
      return tokens;
    };

    while (selected.length < this.finalLimit && candidates.length > 0) {
      let bestIndex = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const relevance = candidate.score / maxScore;
        let maxSim = 0;
        for (const chosen of selected) {
          const similarity = this.jaccardSimilarity(getTokens(candidate), getTokens(chosen));
          if (similarity > maxSim) maxSim = similarity;
        }
        const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      selected.push(candidates[bestIndex]);
      candidates.splice(bestIndex, 1);
    }

    return selected;
  }

  private applyRecencyBoost(score: number, metadata?: Record<string, unknown>): number {
    if (!metadata || this.recencyBoost <= 0 || this.recencyHalfLifeDays <= 0) {
      return score;
    }

    const now = Date.now();
    const halfLifeMs = this.recencyHalfLifeDays * 24 * 60 * 60 * 1000;
    const boosts: number[] = [];

    const addPastBoost = (value: unknown) => {
      const date = this.parseDate(value);
      if (!date) return;
      const deltaMs = now - date.getTime();
      if (deltaMs < 0) return;
      boosts.push(Math.exp(-deltaMs / halfLifeMs));
    };

    const addFutureBoost = (value: unknown) => {
      const date = this.parseDate(value);
      if (!date) return;
      const deltaMs = date.getTime() - now;
      if (deltaMs < 0) return;
      boosts.push(Math.exp(-deltaMs / halfLifeMs));
    };

    addPastBoost(metadata.receivedAt);
    addPastBoost(metadata.updatedAt);
    addPastBoost(metadata.createdAt);
    addFutureBoost(metadata.dueDate);

    if (boosts.length === 0) return score;

    const bestBoost = Math.max(...boosts);
    return score * (1 + this.recencyBoost * bestBoost);
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
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
      contacts: { en: 'Relevant Contacts', it: 'Contatti Rilevanti' },
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
