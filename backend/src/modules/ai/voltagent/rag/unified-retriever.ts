/** Unified Retriever - Memory-First RAG with RRF fusion (Phase 11-02). */
import { Logger } from '@nestjs/common';
import { BaseRetriever, type BaseMessage } from '@voltagent/core';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import type { SupportedLocale } from '../locales';
import type { QueryAnalyzerService, QueryAnalysis } from './query-analyzer.service';
import { VectorSearchService, type VectorSearchResult } from './vector-search.service';
import { KeywordSearchService, type KeywordSearchResult } from './keyword-search.service';

const EMAIL_ADDRESS_REGEX = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;
const STOPWORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'how', 'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'then', 'there', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your', 'che', 'chi', 'come', 'da', 'dei', 'degli', 'delle', 'del', 'della', 'di', 'e', 'gli', 'il', 'in', 'la', 'le', 'lo', 'ma', 'nel', 'nella', 'nelle', 'nello', 'no', 'non', 'o', 'per', 'perche', 'quando', 'questo', 'su', 'un', 'una', 'uno', 'si']);

export type SearchSource = 'emails' | 'contacts' | 'deadlines' | 'followups' | 'actions' | 'memories';

type MemItem = { id: string; content: string; category: string; score: number };
export interface MemoryContext { facts: MemItem[]; preferences: MemItem[]; contacts: MemItem[]; history: Array<{ id: string; content: string; score: number }>; }
type SrcItem = { id: string; content: string; score: number; metadata?: Record<string, unknown> };
export interface SourceResult { source: SearchSource; items: SrcItem[]; }
interface RankedResult { source: SearchSource; content: string; score: number; metadata?: Record<string, unknown>; }
export interface UnifiedRetrieverOptions { tenantId: string; userId: string; locale: SupportedLocale; prisma: PrismaService; mistralService?: MistralService; embeddingsService?: EmbeddingsService; queryAnalyzer?: QueryAnalyzerService; memoryLimit?: number; emailLimit?: number; contactLimit?: number; deadlineLimit?: number; followupLimit?: number; actionLimit?: number; finalLimit?: number; memoryBoost?: number; diversityLambda?: number; recencyBoost?: number; recencyHalfLifeDays?: number; }

/** Advanced Unified RAG Retriever with memory-first approach. */
export class UnifiedRetriever extends BaseRetriever {
  private readonly nestLogger = new Logger(UnifiedRetriever.name);
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly locale: SupportedLocale;
  private readonly prisma: PrismaService;
  private readonly mistralService?: MistralService;
  private readonly embeddingsService?: EmbeddingsService;
  private readonly queryAnalyzer?: QueryAnalyzerService;

  private readonly vectorSearch = new VectorSearchService();
  private readonly keywordSearch = new KeywordSearchService();

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

  private readonly MIN_RESULT_SCORE = 0.01;
  private readonly MIN_RESULTS_THRESHOLD = 3;

  constructor(options: UnifiedRetrieverOptions) {
    super();
    this.tenantId = options.tenantId;
    this.userId = options.userId;
    this.locale = options.locale;
    this.prisma = options.prisma;
    this.mistralService = options.mistralService;
    this.embeddingsService = options.embeddingsService;
    this.queryAnalyzer = options.queryAnalyzer;

    // Wire up dependencies for search services
    if (this.mistralService && this.embeddingsService) {
      this.vectorSearch.setDependencies({ mistralService: this.mistralService, embeddingsService: this.embeddingsService, prisma: this.prisma });
    }
    this.keywordSearch.setDependencies({ prisma: this.prisma });

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

  /** Main retrieval method - implements memory-first unified RAG. */
  async retrieve(input: string | BaseMessage[]): Promise<string> {
    const query = this.extractQuery(input);
    if (!query || query.trim().length < 3) return '';

    try {
      let queryAnalysis: QueryAnalysis | undefined;
      let sourcesToSearch: SearchSource[];

      if (this.queryAnalyzer) {
        queryAnalysis = await this.queryAnalyzer.analyze(query);
        sourcesToSearch = queryAnalysis.primarySources;
        this.nestLogger.debug(`[RAG] QueryAnalyzer: intent=${queryAnalysis.intent}, sources=${sourcesToSearch.join(',')}`);
      } else {
        sourcesToSearch = this.analyzeQuerySources(query);
      }

      const memoryContext: MemoryContext = { facts: [], preferences: [], contacts: [], history: [] };
      const results = await this.searchSources(query, sourcesToSearch);
      let rankedResults = this.fuseAndRerank(query, results, memoryContext);
      rankedResults = this.validateAndExpandResults(rankedResults, query, queryAnalysis);

      if (rankedResults.length === 0 && this.getMemoryCount(memoryContext) === 0) return '';
      return this.formatContext(rankedResults, memoryContext);
    } catch (error) {
      this.nestLogger.error('Error in unified retrieval', error instanceof Error ? error.stack : String(error));
      return '';
    }
  }

  private extractQuery(input: string | BaseMessage[]): string {
    if (typeof input === 'string') return input.trim();
    for (let i = input.length - 1; i >= 0; i--) {
      const msg = input[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') return msg.content.trim();
        if (Array.isArray(msg.content)) {
          const textPart = msg.content.find((p: unknown) => typeof p === 'object' && p !== null && 'type' in p && (p as { type: string }).type === 'text');
          if (textPart && 'text' in textPart) return (textPart as { text: string }).text.trim();
        }
      }
    }
    return '';
  }

  analyzeQuerySources(query: string): SearchSource[] {
    const sources: SearchSource[] = ['emails'];
    const lowerQuery = this.normalizeQuery(query);
    if (/deadline|due|when|by when|urgent|scadenza|entro|quando/.test(lowerQuery)) sources.push('deadlines');
    if (/follow.?up|waiting|response|reply|pending|attesa|risposta|sollecito/.test(lowerQuery)) sources.push('followups');
    if (/task|action|todo|need to|should|must|compito|fare|azione|attivit/.test(lowerQuery)) sources.push('actions');
    if (/contact|person|who|from|sender|colleague|client|customer|contatto|persona|chi|da|mittente|collega|cliente/.test(lowerQuery)) sources.push('contacts');
    if (EMAIL_ADDRESS_REGEX.test(query) && !sources.includes('contacts')) sources.push('contacts');
    return sources;
  }

  async getMemoryContext(_query: string): Promise<MemoryContext> {
    return { facts: [], preferences: [], contacts: [], history: [] };
  }

  /** Multi-Source Retrieval with RRF Fusion. */
  async searchSources(query: string, sources: SearchSource[]): Promise<SourceResult[]> {
    const promises: Promise<SourceResult>[] = [];
    const sourceNames: SearchSource[] = [];

    if (sources.includes('emails')) { promises.push(this.searchEmails(query)); sourceNames.push('emails'); }
    if (sources.includes('contacts')) { promises.push(this.searchContacts(query)); sourceNames.push('contacts'); }
    if (sources.includes('deadlines')) { promises.push(this.searchDeadlines(query)); sourceNames.push('deadlines'); }
    if (sources.includes('followups')) { promises.push(this.searchFollowUps(query)); sourceNames.push('followups'); }
    if (sources.includes('actions')) { promises.push(this.searchActionItems(query)); sourceNames.push('actions'); }

    const results = await Promise.allSettled(promises);
    return results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      this.nestLogger.warn(`Search failed for source ${sourceNames[index]}: ${result.reason}`);
      return { source: sourceNames[index], items: [] };
    });
  }

  /** Hybrid email search with RRF fusion (vector + keyword). */
  private async searchEmails(query: string): Promise<SourceResult> {
    const RRF_K = 60;
    const rrfScores = new Map<string, { score: number; content: string; metadata: Record<string, unknown> }>();

    const addRrfScore = (id: string, rank: number, content: string, metadata: Record<string, unknown>, source: 'vector' | 'keyword') => {
      const contribution = 1 / (RRF_K + rank);
      const existing = rrfScores.get(id);
      if (existing) {
        existing.score += contribution;
        existing.metadata.sources = [...((existing.metadata.sources as string[]) || []), source];
      } else {
        rrfScores.set(id, { score: contribution, content, metadata: { ...metadata, type: 'email', sources: [source] } });
      }
    };

    // Vector search
    if (this.mistralService && this.embeddingsService) {
      const { results } = await this.vectorSearch.searchEmails(query, { limit: this.emailLimit, tenantId: this.tenantId });
      results.forEach((r, idx) => addRrfScore(r.id, idx + 1, r.content, r.metadata, 'vector'));
    }

    // Keyword search
    const keywordResults = await this.keywordSearch.searchEmails(query, { limit: this.emailLimit, tenantId: this.tenantId });
    keywordResults.forEach((r, idx) => addRrfScore(r.id, idx + 1, r.content, r.metadata, 'keyword'));

    const items = Array.from(rrfScores.entries())
      .map(([id, data]) => ({ id, content: data.content, score: data.score, metadata: data.metadata }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.emailLimit);

    const vectorOnly = items.filter((i) => (i.metadata?.sources as string[])?.length === 1 && (i.metadata?.sources as string[])[0] === 'vector').length;
    const keywordOnly = items.filter((i) => (i.metadata?.sources as string[])?.length === 1 && (i.metadata?.sources as string[])[0] === 'keyword').length;
    const both = items.filter((i) => (i.metadata?.sources as string[])?.length === 2).length;
    this.nestLogger.debug(`Hybrid email search: ${vectorOnly} vector-only, ${keywordOnly} keyword-only, ${both} both`);

    return { source: 'emails', items };
  }

  /** Hybrid contact search with RRF fusion (vector + keyword). */
  private async searchContacts(query: string): Promise<SourceResult> {
    const RRF_K = 60;
    const rrfScores = new Map<string, { score: number; content: string; metadata: Record<string, unknown> }>();

    const addRrfScore = (id: string, rank: number, content: string, metadata: Record<string, unknown>, source: 'vector' | 'keyword') => {
      const contribution = 1 / (RRF_K + rank);
      const existing = rrfScores.get(id);
      if (existing) {
        existing.score += contribution;
        existing.metadata.sources = [...((existing.metadata.sources as string[]) || []), source];
      } else {
        rrfScores.set(id, { score: contribution, content, metadata: { ...metadata, type: 'contact', sources: [source] } });
      }
    };

    // Vector search
    if (this.mistralService && this.embeddingsService) {
      const { results } = await this.vectorSearch.searchContacts(query, { limit: this.contactLimit, tenantId: this.tenantId });
      results.forEach((r, idx) => addRrfScore(r.id, idx + 1, r.content, r.metadata, 'vector'));
    }

    // Keyword search
    const keywordResults = await this.keywordSearch.searchContacts(query, { limit: this.contactLimit, tenantId: this.tenantId });
    keywordResults.forEach((r, idx) => addRrfScore(r.id, idx + 1, r.content, r.metadata, 'keyword'));

    const items = Array.from(rrfScores.entries())
      .map(([id, data]) => ({ id, content: data.content, score: data.score, metadata: data.metadata }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.contactLimit);

    return { source: 'contacts', items };
  }

  /** Search deadlines from EmailAnalysis. */
  private async searchDeadlines(_query: string): Promise<SourceResult> {
    try {
      const providers = await this.prisma.providerConfig.findMany({
        where: { tenantId: this.tenantId, userId: this.userId, isActive: true }, select: { id: true },
      });
      if (providers.length === 0) return { source: 'deadlines', items: [] };

      const analyses = await this.prisma.emailAnalysis.findMany({
        where: { tenantId: this.tenantId, email: { providerId: { in: providers.map((p) => p.id) } }, hasDeadline: true, deadlineDate: { gte: new Date() } },
        take: this.deadlineLimit, orderBy: { deadlineDate: 'asc' }, include: { email: { select: { subject: true, snippet: true } } },
      });

      return {
        source: 'deadlines',
        items: analyses.map((a) => ({
          id: a.id,
          content: `Deadline: ${a.email?.subject || 'Untitled'}\nDue: ${a.deadlineDate?.toLocaleDateString() || 'N/A'}\nPriority: ${a.priority}\n${a.summary || ''}`,
          score: 0.7, metadata: { type: 'deadline', dueDate: a.deadlineDate, priority: a.priority },
        })),
      };
    } catch (error) {
      this.nestLogger.warn(`Deadline search failed: ${error instanceof Error ? error.message : String(error)}`);
      return { source: 'deadlines', items: [] };
    }
  }

  /** Search follow-ups. */
  private async searchFollowUps(query: string): Promise<SourceResult> {
    try {
      const followups = await this.prisma.emailFollowUp.findMany({
        where: { tenantId: this.tenantId, userId: this.userId, status: { in: ['PENDING', 'REMINDED'] }, OR: [{ reason: { contains: query, mode: 'insensitive' } }] },
        take: this.followupLimit, orderBy: { dueDate: 'asc' }, select: { id: true, emailId: true, reason: true, dueDate: true, status: true },
      });

      const emailIds = followups.map((f) => f.emailId);
      const emails = emailIds.length > 0 ? await this.prisma.email.findMany({ where: { id: { in: emailIds }, tenantId: this.tenantId }, select: { id: true, subject: true, from: true } }) : [];
      const emailMap = new Map(emails.map((e) => [e.id, e]));

      return {
        source: 'followups',
        items: followups.map((f) => {
          const email = emailMap.get(f.emailId);
          return {
            id: f.id,
            content: `Follow-up: ${email?.subject || 'Unknown'}\nFrom: ${email?.from || 'Unknown'}\nReason: ${f.reason || 'Awaiting response'}\nDue: ${f.dueDate.toLocaleDateString()}`,
            score: 0.7, metadata: { type: 'followup', dueDate: f.dueDate, status: f.status },
          };
        }),
      };
    } catch (error) {
      this.nestLogger.warn(`Follow-up search failed: ${error instanceof Error ? error.message : String(error)}`);
      return { source: 'followups', items: [] };
    }
  }

  /** Search action items from ActionQueue. */
  private async searchActionItems(_query: string): Promise<SourceResult> {
    try {
      const actions = await this.prisma.actionQueue.findMany({
        where: { tenantId: this.tenantId, userId: this.userId, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
        take: this.actionLimit, orderBy: [{ createdAt: 'desc' }], include: { email: { select: { subject: true } } },
      });

      return {
        source: 'actions',
        items: actions.map((a) => ({
          id: a.id,
          content: `Action: ${a.actionType}\nConfidence: ${(a.confidence * 100).toFixed(0)}%\nStatus: ${a.status}\nEmail: ${a.email?.subject || 'N/A'}`,
          score: a.confidence, metadata: { type: 'action', actionType: a.actionType, status: a.status, createdAt: a.createdAt },
        })),
      };
    } catch (error) {
      this.nestLogger.warn(`Action item search failed: ${error instanceof Error ? error.message : String(error)}`);
      return { source: 'actions', items: [] };
    }
  }

  /** Fusion & Re-ranking with memory boost and recency boost. */
  fuseAndRerank(
    _query: string,
    results: SourceResult[],
    memoryContext: MemoryContext,
  ): Array<{ source: SearchSource; content: string; score: number }> {
    const allResults: RankedResult[] = [];

    for (const result of results) {
      for (const item of result.items) {
        let score = item.score;
        const contentLower = item.content.toLowerCase();

        for (const contact of memoryContext.contacts) {
          if (contentLower.includes(contact.content.toLowerCase())) { score *= 1 + this.memoryBoost; break; }
        }
        for (const pref of memoryContext.preferences) {
          if (contentLower.includes(pref.content.toLowerCase())) { score *= 1 + this.memoryBoost * 0.5; break; }
        }
        score = this.applyRecencyBoost(score, item.metadata);
        allResults.push({ source: result.source, content: item.content, score, metadata: item.metadata });
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    const diversified = this.applyDiversityRerank(allResults);
    return diversified.map((item) => ({ source: item.source, content: item.content, score: item.score }));
  }

  private validateAndExpandResults(
    results: Array<{ source: SearchSource; content: string; score: number }>,
    query: string,
    analysis?: QueryAnalysis,
  ): Array<{ source: SearchSource; content: string; score: number }> {
    const validResults = results.filter((r) => r.score >= this.MIN_RESULT_SCORE);
    if (validResults.length < this.MIN_RESULTS_THRESHOLD) {
      this.nestLogger.warn(`[RAG] Low result count (${validResults.length}/${this.MIN_RESULTS_THRESHOLD}) for query: "${query.substring(0, 50)}..."` + (analysis ? ` intent=${analysis.intent}` : ''));
    }
    return validResults;
  }

  private normalizeQuery(query: string): string {
    return query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@]+/g, ' ').replace(/\s+/g, ' ').trim();
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
    for (const token of a) if (b.has(token)) intersection++;
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
        if (mmrScore > bestScore) { bestScore = mmrScore; bestIndex = i; }
      }
      selected.push(candidates[bestIndex]);
      candidates.splice(bestIndex, 1);
    }
    return selected;
  }

  private applyRecencyBoost(score: number, metadata?: Record<string, unknown>): number {
    if (!metadata || this.recencyBoost <= 0 || this.recencyHalfLifeDays <= 0) return score;

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
    return score * (1 + this.recencyBoost * Math.max(...boosts));
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

  private getMemoryCount(memoryContext: MemoryContext): number {
    return memoryContext.facts.length + memoryContext.preferences.length + memoryContext.contacts.length + memoryContext.history.length;
  }

  formatContext(
    results: Array<{ source: SearchSource; content: string; score: number }>,
    memoryContext: MemoryContext,
  ): string {
    const sections: string[] = [];
    const allMemories = [...memoryContext.facts, ...memoryContext.preferences, ...memoryContext.contacts];

    if (allMemories.length > 0) {
      const memoryHeader = this.locale === 'it' ? '## Contesto Utente (dalla memoria)' : '## User Context (from memory)';
      sections.push(memoryHeader);
      for (const memory of allMemories) sections.push(`- ${memory.content}`);
      sections.push('');
    }

    if (memoryContext.history.length > 0) {
      const historyHeader = this.locale === 'it' ? '## Storico Conversazioni' : '## Conversation History';
      sections.push(historyHeader);
      for (const hist of memoryContext.history.slice(0, 3)) sections.push(`- ${hist.content}`);
      sections.push('');
    }

    const bySource = new Map<SearchSource, string[]>();
    for (const result of results) {
      if (!bySource.has(result.source)) bySource.set(result.source, []);
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
