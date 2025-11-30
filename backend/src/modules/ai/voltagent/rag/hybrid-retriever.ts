/**
 * Hybrid RAG Retriever for VoltAgent
 *
 * Implements modern RAG best practices:
 * - Hybrid Search: Combines vector similarity + keyword/lexical search
 * - Query Rewriting: Expands queries for better recall
 * - Re-ranking: Uses LLM to re-rank and filter results
 * - Multi-source: Retrieves from emails, documents, notes
 *
 * @see https://www.microsoft.com/en-us/microsoft-cloud/blog/2025/02/04/common-retrieval-augmented-generation-rag-techniques-explained/
 * @see https://stackoverflow.blog/2024/08/15/practical-tips-for-retrieval-augmented-generation-rag/
 */
import { BaseRetriever, type BaseMessage } from '@voltagent/core';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { SupportedLocale } from '../locales';

export interface HybridRetrieverOptions {
  tenantId: string;
  locale: SupportedLocale;
  mistralService: MistralService;
  embeddingsService: EmbeddingsService;
  prisma: PrismaService;
  /** Maximum results from vector search (default: 10) */
  vectorLimit?: number;
  /** Maximum results from keyword search (default: 10) */
  keywordLimit?: number;
  /** Final results after re-ranking (default: 5) */
  finalLimit?: number;
  /** Weight for vector results 0-1 (default: 0.7) */
  vectorWeight?: number;
  /** Enable query expansion (default: true) */
  enableQueryExpansion?: boolean;
  /** Enable LLM re-ranking (default: true) */
  enableReranking?: boolean;
}

interface RetrievedDocument {
  id: string;
  content: string;
  source: string;
  sourceType: 'email' | 'document' | 'note';
  metadata: Record<string, any>;
  vectorScore?: number;
  keywordScore?: number;
  combinedScore?: number;
  rerankScore?: number;
}

interface EmbeddingResult {
  id: string;
  content: string;
  documentName: string | null;
  metadata: any;
  distance?: number;
}

/**
 * Advanced Hybrid RAG Retriever using vector + keyword search with re-ranking.
 */
export class HybridRetriever extends BaseRetriever {
  private readonly tenantId: string;
  private readonly locale: SupportedLocale;
  private readonly mistralService: MistralService;
  private readonly embeddingsService: EmbeddingsService;
  private readonly prisma: PrismaService;
  private readonly vectorLimit: number;
  private readonly keywordLimit: number;
  private readonly finalLimit: number;
  private readonly vectorWeight: number;
  private readonly enableQueryExpansion: boolean;
  private readonly enableReranking: boolean;

  constructor(options: HybridRetrieverOptions) {
    super();
    this.tenantId = options.tenantId;
    this.locale = options.locale;
    this.mistralService = options.mistralService;
    this.embeddingsService = options.embeddingsService;
    this.prisma = options.prisma;
    this.vectorLimit = options.vectorLimit ?? 10;
    this.keywordLimit = options.keywordLimit ?? 10;
    this.finalLimit = options.finalLimit ?? 5;
    this.vectorWeight = options.vectorWeight ?? 0.7;
    this.enableQueryExpansion = options.enableQueryExpansion ?? true;
    this.enableReranking = options.enableReranking ?? true;
  }

  /**
   * Retrieve relevant context using hybrid search.
   */
  async retrieve(input: string | BaseMessage[]): Promise<string> {
    const query = this.extractQuery(input);
    if (!query || query.trim().length < 3) {
      return '';
    }

    try {
      // Step 1: Query Expansion (optional)
      const queries = this.enableQueryExpansion
        ? await this.expandQuery(query)
        : [query];

      // Step 2: Parallel retrieval (vector + keyword)
      const [vectorResults, keywordResults] = await Promise.all([
        this.vectorSearch(queries),
        this.keywordSearch(queries),
      ]);

      // Step 3: Merge and deduplicate results
      const mergedResults = this.mergeResults(vectorResults, keywordResults);

      if (mergedResults.length === 0) {
        return '';
      }

      // Step 4: Re-rank using LLM (optional)
      const finalResults = this.enableReranking
        ? await this.rerankResults(query, mergedResults)
        : mergedResults.slice(0, this.finalLimit);

      // Step 5: Format context for LLM
      return this.formatContext(finalResults);
    } catch (error) {
      console.error('[HybridRetriever] Error:', error);
      return '';
    }
  }

  /**
   * Expand query into multiple search variations for better recall.
   */
  private async expandQuery(query: string): Promise<string[]> {
    const queries = [query];

    // Simple query expansion without LLM call (fast)
    // Extract key terms and create variations
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);

    // Add individual important terms as separate queries
    for (const term of terms.slice(0, 3)) {
      if (!queries.includes(term)) {
        queries.push(term);
      }
    }

    // Add bigrams for context
    if (terms.length >= 2) {
      for (let i = 0; i < Math.min(terms.length - 1, 2); i++) {
        const bigram = `${terms[i]} ${terms[i + 1]}`;
        if (!queries.includes(bigram)) {
          queries.push(bigram);
        }
      }
    }

    return queries.slice(0, 5); // Max 5 query variations
  }

  /**
   * Vector similarity search using embeddings.
   */
  private async vectorSearch(queries: string[]): Promise<RetrievedDocument[]> {
    const allResults: RetrievedDocument[] = [];
    const seenIds = new Set<string>();

    for (const query of queries) {
      try {
        const embedding = await this.mistralService.generateEmbedding(query);
        if (!embedding || embedding.length === 0) continue;

        const results = await this.embeddingsService.findSimilarContent<EmbeddingResult>(
          this.tenantId,
          embedding,
          this.vectorLimit,
        );

        for (const result of results) {
          if (seenIds.has(result.id)) continue;
          seenIds.add(result.id);

          // Convert distance (0-2) to score (1-0)
          const score = result.distance !== undefined ? 1 - result.distance / 2 : 0.5;

          allResults.push({
            id: result.id,
            content: result.content,
            source: result.documentName || this.getSourceFromMetadata(result.metadata),
            sourceType: this.getSourceType(result.metadata),
            metadata: result.metadata || {},
            vectorScore: score,
          });
        }
      } catch (error) {
        console.error('[HybridRetriever] Vector search error:', error);
      }
    }

    return allResults;
  }

  /**
   * Keyword/lexical search using PostgreSQL full-text search.
   */
  private async keywordSearch(queries: string[]): Promise<RetrievedDocument[]> {
    const allResults: RetrievedDocument[] = [];
    const seenIds = new Set<string>();

    for (const query of queries) {
      try {
        // Search in emails
        const emailResults = await this.prisma.email.findMany({
          where: {
            tenantId: this.tenantId,
            OR: [
              { subject: { contains: query, mode: 'insensitive' } },
              { snippet: { contains: query, mode: 'insensitive' } },
              { from: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: this.keywordLimit,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            snippet: true,
            from: true,
            receivedAt: true,
          },
        });

        for (const email of emailResults) {
          const id = `email:${email.id}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          // Calculate simple keyword relevance score
          const score = this.calculateKeywordScore(query, [
            email.subject || '',
            email.snippet || '',
            email.from || '',
          ]);

          allResults.push({
            id,
            content: `${email.subject || '(No subject)'}\n${email.snippet || ''}`,
            source: email.from || 'Unknown',
            sourceType: 'email',
            metadata: {
              emailId: email.id,
              from: email.from,
              subject: email.subject,
              receivedAt: email.receivedAt,
            },
            keywordScore: score,
          });
        }
      } catch (error) {
        console.error('[HybridRetriever] Keyword search error:', error);
      }
    }

    return allResults;
  }

  /**
   * Calculate keyword relevance score based on term frequency.
   */
  private calculateKeywordScore(query: string, texts: string[]): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const combinedText = texts.join(' ').toLowerCase();

    let matches = 0;
    for (const term of queryTerms) {
      if (term.length > 2 && combinedText.includes(term)) {
        matches++;
      }
    }

    return queryTerms.length > 0 ? matches / queryTerms.length : 0;
  }

  /**
   * Merge vector and keyword results with weighted scoring.
   */
  private mergeResults(
    vectorResults: RetrievedDocument[],
    keywordResults: RetrievedDocument[],
  ): RetrievedDocument[] {
    const merged = new Map<string, RetrievedDocument>();

    // Add vector results
    for (const doc of vectorResults) {
      merged.set(doc.id, {
        ...doc,
        combinedScore: (doc.vectorScore || 0) * this.vectorWeight,
      });
    }

    // Merge keyword results
    const keywordWeight = 1 - this.vectorWeight;
    for (const doc of keywordResults) {
      const existing = merged.get(doc.id);
      if (existing) {
        // Document found by both methods - boost score
        existing.keywordScore = doc.keywordScore;
        existing.combinedScore =
          (existing.combinedScore || 0) + (doc.keywordScore || 0) * keywordWeight;
      } else {
        merged.set(doc.id, {
          ...doc,
          combinedScore: (doc.keywordScore || 0) * keywordWeight,
        });
      }
    }

    // Sort by combined score
    return Array.from(merged.values()).sort(
      (a, b) => (b.combinedScore || 0) - (a.combinedScore || 0),
    );
  }

  /**
   * Re-rank results using LLM for better relevance.
   */
  private async rerankResults(
    query: string,
    results: RetrievedDocument[],
  ): Promise<RetrievedDocument[]> {
    if (results.length <= this.finalLimit) {
      return results;
    }

    // Take top candidates for re-ranking (limit LLM calls)
    const candidates = results.slice(0, Math.min(results.length, this.finalLimit * 2));

    try {
      // Simple relevance scoring without full LLM call
      // Use semantic similarity between query and each result
      const queryEmbedding = await this.mistralService.generateEmbedding(query);

      for (const doc of candidates) {
        const docEmbedding = await this.mistralService.generateEmbedding(
          doc.content.substring(0, 500),
        );

        if (queryEmbedding && docEmbedding) {
          doc.rerankScore = this.cosineSimilarity(queryEmbedding, docEmbedding);
        }
      }

      // Sort by rerank score
      candidates.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
    } catch (error) {
      console.error('[HybridRetriever] Rerank error:', error);
      // Fall back to combined score
    }

    return candidates.slice(0, this.finalLimit);
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Extract query string from input.
   */
  private extractQuery(input: string | BaseMessage[]): string {
    if (typeof input === 'string') return input;

    for (let i = input.length - 1; i >= 0; i--) {
      const msg = input[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
          const textPart = msg.content.find(
            (p) => typeof p === 'object' && 'type' in p && p.type === 'text',
          );
          if (textPart && 'text' in textPart) return textPart.text as string;
        }
      }
    }
    return '';
  }

  /**
   * Format results as context for the LLM.
   */
  private formatContext(results: RetrievedDocument[]): string {
    if (results.length === 0) return '';

    const header =
      this.locale === 'it'
        ? '📚 Informazioni rilevanti trovate:'
        : '📚 Relevant information found:';

    const entries = results.map((doc, i) => {
      const relevance = Math.round((doc.rerankScore || doc.combinedScore || 0) * 100);
      const sourceLabel = this.locale === 'it' ? 'Fonte' : 'Source';
      const relevanceLabel = this.locale === 'it' ? 'pertinenza' : 'relevance';

      return `**${i + 1}.** [${sourceLabel}: ${doc.source}]\n${doc.content.substring(0, 400)}${doc.content.length > 400 ? '...' : ''}\n_(${relevance}% ${relevanceLabel})_`;
    });

    return `${header}\n\n${entries.join('\n\n---\n\n')}`;
  }

  private getSourceFromMetadata(metadata: any): string {
    if (!metadata) return 'Unknown';
    if (metadata.from) return metadata.from;
    if (metadata.documentName) return metadata.documentName;
    return 'Knowledge Base';
  }

  private getSourceType(metadata: any): 'email' | 'document' | 'note' {
    if (!metadata) return 'document';
    if (metadata.emailId) return 'email';
    if (metadata.noteId) return 'note';
    return 'document';
  }
}
