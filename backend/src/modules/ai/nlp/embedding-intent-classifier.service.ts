/**
 * Embedding-Based Intent Classifier
 *
 * Uses semantic embeddings for intent classification.
 * Advantages over FastText:
 * - Multilingual: Same embedding space for EN/IT
 * - No training required: Just embed reference examples
 * - Better generalization: Semantic similarity vs pattern matching
 *
 * Works by:
 * 1. Pre-compute embeddings for all reference intent examples
 * 2. On classification: embed query, find nearest neighbors
 * 3. Vote by intent of top-K neighbors
 *
 * @see EmbeddingsService for the underlying embedding API
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MistralService } from '../services/mistral.service';
import { INTENT_TAXONOMY, type PrimaryIntent, PRIMARY_INTENTS } from './intent-taxonomy';

interface IntentEmbedding {
  intent: PrimaryIntent;
  text: string;
  embedding: number[];
  lang: 'en' | 'it';
}

export interface EmbeddingClassificationResult {
  intent: PrimaryIntent;
  confidence: number;
  lang: 'en' | 'it' | 'unknown';
  topMatches: Array<{ intent: PrimaryIntent; similarity: number; example: string }>;
  latencyMs: number;
}

@Injectable()
export class EmbeddingIntentClassifierService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingIntentClassifierService.name);
  private intentEmbeddings: IntentEmbedding[] = [];
  private initialized = false;
  private readonly topK = 5; // Number of neighbors for voting

  constructor(private readonly mistralService: MistralService) {}

  async onModuleInit(): Promise<void> {
    // Initialize asynchronously to not block startup
    this.initializeEmbeddings().catch((err) => {
      this.logger.warn(`Failed to initialize intent embeddings: ${err.message}`);
    });
  }

  /**
   * Pre-compute embeddings for all reference intent examples
   */
  private async initializeEmbeddings(): Promise<void> {
    this.logger.log('Initializing embedding-based intent classifier...');
    const startTime = Date.now();

    const allExamples: Array<{ intent: PrimaryIntent; text: string; lang: 'en' | 'it' }> = [];

    // Collect all examples from taxonomy
    for (const intentDef of INTENT_TAXONOMY) {
      // English examples
      for (const example of intentDef.examples.en) {
        // Skip slot templates, just use clean examples
        if (!example.includes('{')) {
          allExamples.push({
            intent: intentDef.intent,
            text: example,
            lang: 'en',
          });
        }
      }
      // Italian examples
      for (const example of intentDef.examples.it) {
        if (!example.includes('{')) {
          allExamples.push({
            intent: intentDef.intent,
            text: example,
            lang: 'it',
          });
        }
      }
    }

    this.logger.log(`Embedding ${allExamples.length} reference examples...`);

    // Batch embed all examples
    const batchSize = 50;
    for (let i = 0; i < allExamples.length; i += batchSize) {
      const batch = allExamples.slice(i, i + batchSize);
      const texts = batch.map((ex) => ex.text);

      try {
        const embeddings = await this.mistralService.generateBulkEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
          if (embeddings[j]) {
            this.intentEmbeddings.push({
              ...batch[j],
              embedding: embeddings[j],
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to embed batch ${i}-${i + batchSize}: ${error}`);
      }
    }

    const elapsed = Date.now() - startTime;
    this.initialized = true;
    this.logger.log(
      `Intent embeddings initialized: ${this.intentEmbeddings.length} examples in ${elapsed}ms`,
    );
  }

  /**
   * Classify intent using embedding similarity
   */
  async classify(text: string): Promise<EmbeddingClassificationResult> {
    const startTime = Date.now();

    if (!this.initialized || this.intentEmbeddings.length === 0) {
      // Fallback to unknown if not initialized
      return {
        intent: 'unknown',
        confidence: 0,
        lang: 'unknown',
        topMatches: [],
        latencyMs: Date.now() - startTime,
      };
    }

    // Embed the query
    const queryEmbedding = await this.mistralService.generateEmbedding(text);

    // Find top-K nearest neighbors
    const similarities = this.intentEmbeddings.map((ie) => ({
      intent: ie.intent,
      similarity: this.cosineSimilarity(queryEmbedding, ie.embedding),
      example: ie.text,
      lang: ie.lang,
    }));

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topK = similarities.slice(0, this.topK);

    // Vote by intent
    const votes: Record<string, { count: number; totalSim: number }> = {};
    let dominantLang: 'en' | 'it' = 'en';
    const langCount = { en: 0, it: 0 };

    for (const match of topK) {
      if (!votes[match.intent]) {
        votes[match.intent] = { count: 0, totalSim: 0 };
      }
      votes[match.intent].count++;
      votes[match.intent].totalSim += match.similarity;
      langCount[match.lang]++;
    }

    dominantLang = langCount.it > langCount.en ? 'it' : 'en';

    // Find winning intent
    let winningIntent: PrimaryIntent = 'unknown';
    let maxVotes = 0;
    let maxSim = 0;

    for (const [intent, { count, totalSim }] of Object.entries(votes)) {
      if (count > maxVotes || (count === maxVotes && totalSim > maxSim)) {
        winningIntent = intent as PrimaryIntent;
        maxVotes = count;
        maxSim = totalSim;
      }
    }

    // Validate intent
    if (!PRIMARY_INTENTS.includes(winningIntent)) {
      winningIntent = 'unknown';
    }

    // Calculate confidence from similarity
    const avgSimilarity = topK.length > 0 ? topK.reduce((s, m) => s + m.similarity, 0) / topK.length : 0;
    const confidence = Math.min(avgSimilarity, 0.99);

    return {
      intent: winningIntent,
      confidence,
      lang: dominantLang,
      topMatches: topK.map((m) => ({
        intent: m.intent,
        similarity: m.similarity,
        example: m.example,
      })),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Cosine similarity between two vectors
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Check if embeddings are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get stats about loaded embeddings
   */
  getStats(): { totalEmbeddings: number; intentsWithEmbeddings: number } {
    const intentSet = new Set(this.intentEmbeddings.map((ie) => ie.intent));
    return {
      totalEmbeddings: this.intentEmbeddings.length,
      intentsWithEmbeddings: intentSet.size,
    };
  }
}
