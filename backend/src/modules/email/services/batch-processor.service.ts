import { Injectable, Logger } from '@nestjs/common';

/**
 * Result of a batched operation
 */
export interface BatchResult<T> {
  /** Successfully processed items */
  successful: T[];
  /** Failed items with their errors */
  failed: Array<{ item: T; error: Error }>;
  /** Total processing time in milliseconds */
  durationMs: number;
  /** Number of batches processed */
  batchCount: number;
}

/**
 * Configuration for batch processing
 */
export interface BatchConfig {
  /** Maximum items per batch (default: 10) */
  batchSize?: number;
  /** Maximum concurrent batch operations (default: 3) */
  concurrency?: number;
  /** Delay between batches in ms (default: 0) */
  delayBetweenBatches?: number;
  /** Continue processing if individual items fail (default: true) */
  continueOnError?: boolean;
}

/**
 * BatchProcessorService - Concurrent batch processing with throttling
 *
 * Features:
 * - Configurable batch size and concurrency
 * - Error handling with continue-on-error option
 * - Progress tracking and timing
 * - Rate limiting via batch delays
 *
 * Use cases:
 * - Batch attachment uploads with concurrency guard
 * - Parallel S3 deletions with rate limiting
 * - Bulk email processing
 *
 * @example
 * ```typescript
 * const results = await batchProcessor.processBatch(
 *   attachments,
 *   async (attachment) => uploadToS3(attachment),
 *   { batchSize: 5, concurrency: 2 }
 * );
 * ```
 *
 * @see EMAIL_MODULE_ROADMAP.md Phase 5 - Performance & Scale
 */
@Injectable()
export class BatchProcessorService {
  private readonly logger = new Logger(BatchProcessorService.name);

  /**
   * Process items in batches with concurrency control
   *
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @param config - Batch configuration
   * @returns Batch result with successful/failed items
   */
  async processBatch<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    config: BatchConfig = {},
  ): Promise<BatchResult<{ input: T; output: R }>> {
    const {
      batchSize = 10,
      concurrency = 3,
      delayBetweenBatches = 0,
      continueOnError = true,
    } = config;

    const startTime = Date.now();
    const successful: Array<{ input: T; output: R }> = [];
    const failed: Array<{ item: { input: T; output: R }; error: Error }> = [];

    // Split items into batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    this.logger.debug(
      JSON.stringify({
        event: 'batch_processing_start',
        totalItems: items.length,
        batchSize,
        batchCount: batches.length,
        concurrency,
      }),
    );

    // Process batches with concurrency control
    let batchIndex = 0;
    while (batchIndex < batches.length) {
      // Get next set of concurrent batches
      const concurrentBatches = batches.slice(batchIndex, batchIndex + concurrency);

      // Process concurrent batches in parallel
      const batchPromises = concurrentBatches.map(async (batch, localBatchIdx) => {
        const globalBatchIdx = batchIndex + localBatchIdx;

        // Process all items in this batch in parallel
        const itemPromises = batch.map(async (item, itemIdx) => {
          const globalIdx = globalBatchIdx * batchSize + itemIdx;
          try {
            const output = await processor(item, globalIdx);
            return { success: true as const, input: item, output };
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (!continueOnError) {
              throw err;
            }
            return { success: false as const, input: item, error: err };
          }
        });

        return Promise.all(itemPromises);
      });

      // Wait for all concurrent batches
      const batchResults = await Promise.all(batchPromises);

      // Collect results
      for (const batchResult of batchResults) {
        for (const result of batchResult) {
          if (result.success) {
            successful.push({ input: result.input, output: result.output });
          } else {
            failed.push({
              item: { input: result.input, output: undefined as unknown as R },
              error: result.error,
            });
          }
        }
      }

      batchIndex += concurrency;

      // Apply delay between batch groups
      if (delayBetweenBatches > 0 && batchIndex < batches.length) {
        await this.delay(delayBetweenBatches);
      }
    }

    const durationMs = Date.now() - startTime;

    this.logger.log(
      JSON.stringify({
        event: 'batch_processing_complete',
        totalItems: items.length,
        successful: successful.length,
        failed: failed.length,
        batchCount: batches.length,
        durationMs,
        avgItemMs: items.length > 0 ? durationMs / items.length : 0,
      }),
    );

    return {
      successful,
      failed: failed.map((f) => ({ item: f.item.input as unknown as { input: T; output: R }, error: f.error })),
      durationMs,
      batchCount: batches.length,
    };
  }

  /**
   * Process items with a concurrency limit (no batching)
   *
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @param concurrency - Maximum concurrent operations
   * @returns Batch result
   */
  async processWithConcurrencyLimit<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    concurrency: number = 5,
  ): Promise<BatchResult<{ input: T; output: R }>> {
    return this.processBatch(items, processor, {
      batchSize: concurrency,
      concurrency: 1,
      continueOnError: true,
    });
  }

  /**
   * Simple delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * ConcurrencyGuard - Limits concurrent operations
 *
 * Useful for rate-limiting API calls or database operations.
 *
 * @example
 * ```typescript
 * const guard = new ConcurrencyGuard(5);
 * await guard.acquire();
 * try {
 *   await expensiveOperation();
 * } finally {
 *   guard.release();
 * }
 * ```
 */
export class ConcurrencyGuard {
  private currentCount = 0;
  private waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  /**
   * Acquire a slot (waits if at max concurrency)
   */
  async acquire(): Promise<void> {
    if (this.currentCount < this.maxConcurrency) {
      this.currentCount++;
      return;
    }

    // Wait for a slot to become available
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.currentCount++;
        resolve();
      });
    });
  }

  /**
   * Release a slot
   */
  release(): void {
    this.currentCount--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Execute function with automatic acquire/release
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get current concurrency stats
   */
  getStats(): { current: number; waiting: number; max: number } {
    return {
      current: this.currentCount,
      waiting: this.waitQueue.length,
      max: this.maxConcurrency,
    };
  }
}

/**
 * FolderLookupCache - Caches folder lookups to reduce database queries
 *
 * @example
 * ```typescript
 * const cache = new FolderLookupCache(300000); // 5 minute TTL
 * const folderId = await cache.getOrFetch('INBOX', async () => {
 *   return await prisma.folder.findFirst({ where: { name: 'INBOX' } });
 * });
 * ```
 */
export class FolderLookupCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private readonly logger = new Logger(FolderLookupCache.name);

  constructor(private readonly ttlMs: number = 300000) {} // 5 minutes default

  /**
   * Get value from cache or fetch and cache it
   */
  async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      this.logger.debug(`Cache hit for key: ${key}`);
      return cached.value;
    }

    this.logger.debug(`Cache miss for key: ${key}`);
    const value = await fetcher();
    this.cache.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  /**
   * Invalidate specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached values
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; ttlMs: number } {
    return { size: this.cache.size, ttlMs: this.ttlMs };
  }
}
