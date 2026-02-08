/**
 * Triage Learning Service
 *
 * Tracks implicit user behavior signals (reply, archive, flag, etc.)
 * and aggregates per-sender behavior scores for triage recalculation.
 *
 * Storage: In-memory Map + Redis hash (triage:sender-scores:{tenantId}).
 * 30-day TTL on Redis hashes. Zero DB writes.
 *
 * @see AttentionScoreService - consumes sender behavior during scoring
 * @see TriageBackfillSchedulerService - triggers recalculation using learned weights
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../../../common/config';

// ============================================================================
// Interfaces
// ============================================================================

export interface TriageSignal {
  tenantId: string;
  userId: string;
  emailId: string;
  senderEmail: string;
  signalType: 'reply' | 'archive' | 'delete' | 'flag' | 'forward';
  /** Time between email receivedAt and user action (ms) */
  responseTimeMs?: number;
}

export interface SenderBehaviorScore {
  /** Fraction of emails replied to (0.0-1.0) */
  replyRate: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** Fraction archived without reply (0.0-1.0) */
  archiveWithoutReplyRate: number;
  /** Fraction of emails flagged (0.0-1.0) */
  flagRate: number;
  /** Total signals recorded for this sender */
  totalSignals: number;
  /** ISO date of last update */
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Redis key prefix for sender score hashes */
const REDIS_KEY_PREFIX = 'triage:sender-scores';

/** Flush buffer when sender accumulates this many signals */
const FLUSH_THRESHOLD = 5;

/** Flush all buffers on this interval (ms) */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** TTL for Redis hash keys (seconds) */
const REDIS_TTL_SECONDS = 30 * 24 * 3600; // 30 days

/** EMA weight for previous score (0.0-1.0) */
const EMA_PREV_WEIGHT = 0.7;

// ============================================================================
// Helpers
// ============================================================================

/**
 * EMA-blend two SenderBehaviorScores.
 * prevWeight controls how much history matters (0.7 = 70% previous, 30% new).
 */
function blendScores(
  prev: SenderBehaviorScore,
  curr: SenderBehaviorScore,
  prevWeight: number,
): SenderBehaviorScore {
  const currWeight = 1 - prevWeight;
  return {
    replyRate: prev.replyRate * prevWeight + curr.replyRate * currWeight,
    avgResponseTimeMs:
      prev.avgResponseTimeMs * prevWeight +
      curr.avgResponseTimeMs * currWeight,
    archiveWithoutReplyRate:
      prev.archiveWithoutReplyRate * prevWeight +
      curr.archiveWithoutReplyRate * currWeight,
    flagRate: prev.flagRate * prevWeight + curr.flagRate * currWeight,
    totalSignals: prev.totalSignals + curr.totalSignals,
    lastUpdated: curr.lastUpdated,
  };
}

/**
 * Compute a SenderBehaviorScore from a batch of signals.
 */
function computeScoreFromSignals(signals: TriageSignal[]): SenderBehaviorScore {
  const total = signals.length;
  if (total === 0) {
    return {
      replyRate: 0,
      avgResponseTimeMs: 0,
      archiveWithoutReplyRate: 0,
      flagRate: 0,
      totalSignals: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const replyCount = signals.filter((s) => s.signalType === 'reply').length;
  const archiveCount = signals.filter((s) => s.signalType === 'archive').length;
  const flagCount = signals.filter((s) => s.signalType === 'flag').length;

  const responseTimes = signals
    .filter((s) => s.responseTimeMs !== undefined && s.responseTimeMs > 0)
    .map((s) => s.responseTimeMs!);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : 0;

  return {
    replyRate: replyCount / total,
    avgResponseTimeMs,
    archiveWithoutReplyRate: archiveCount / total,
    flagRate: flagCount / total,
    totalSignals: total,
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class TriageLearningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TriageLearningService.name);

  /** Redis client for persistent storage */
  private readonly redis: Redis;

  /** In-memory buffer keyed by `${tenantId}:${senderEmail}` */
  private readonly signalBuffer = new Map<string, TriageSignal[]>();

  /** In-memory cache of computed scores, populated from Redis on first access */
  private readonly scoreCache = new Map<string, SenderBehaviorScore>();

  /** Periodic flush interval handle */
  private flushIntervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const redisOptions = getRedisConnectionOptions();
    this.redis = new Redis({
      host: redisOptions.host,
      port: redisOptions.port,
      password: redisOptions.password,
      db: redisOptions.db ?? 0,
      maxRetriesPerRequest: redisOptions.maxRetriesPerRequest,
      enableReadyCheck: redisOptions.enableReadyCheck,
      lazyConnect: true,
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    this.redis.connect().catch((error) => {
      this.logger.warn(
        `Failed to connect to Redis on startup: ${error.message}. Learning signals will buffer in-memory only.`,
      );
    });
  }

  onModuleInit() {
    // Start periodic flush interval
    this.flushIntervalHandle = setInterval(() => {
      this.flushAllBuffers().catch((err) => {
        this.logger.error(
          `Periodic flush failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, FLUSH_INTERVAL_MS);

    this.logger.log(
      `TriageLearningService initialized (flush interval: ${FLUSH_INTERVAL_MS / 1000}s, threshold: ${FLUSH_THRESHOLD} signals)`,
    );
  }

  async onModuleDestroy() {
    // Clear flush interval
    if (this.flushIntervalHandle) {
      clearInterval(this.flushIntervalHandle);
      this.flushIntervalHandle = null;
    }

    // Flush all remaining buffered signals
    await this.flushAllBuffers();

    // Close Redis connection
    try {
      if (this.redis.status !== 'end' && this.redis.status !== 'close') {
        await this.redis.quit();
        this.logger.debug('Redis connection closed gracefully');
      }
    } catch (error) {
      this.logger.warn(
        `Failed to close Redis: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Record an implicit user action as a triage signal.
   * Signals are buffered and flushed in batches to avoid per-signal writes.
   */
  recordSignal(signal: TriageSignal): void {
    const key = `${signal.tenantId}:${signal.senderEmail.toLowerCase()}`;

    let buffer = this.signalBuffer.get(key);
    if (!buffer) {
      buffer = [];
      this.signalBuffer.set(key, buffer);
    }
    buffer.push(signal);

    // Flush when buffer reaches threshold
    if (buffer.length >= FLUSH_THRESHOLD) {
      const signals = buffer.splice(0);
      this.signalBuffer.delete(key);
      this.flushSenderSignals(key, signals).catch((err) => {
        this.logger.error(
          `Flush failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  /**
   * Get sender behavior score for a specific sender.
   * Checks in-memory cache first, then falls back to Redis.
   */
  async getSenderBehavior(
    tenantId: string,
    senderEmail: string,
  ): Promise<SenderBehaviorScore | null> {
    const key = `${tenantId}:${senderEmail.toLowerCase()}`;

    // Check in-memory cache
    const cached = this.scoreCache.get(key);
    if (cached) return cached;

    // Fall back to Redis
    try {
      const raw = await this.redis.hget(
        `${REDIS_KEY_PREFIX}:${tenantId}`,
        senderEmail.toLowerCase(),
      );
      if (raw) {
        const score = JSON.parse(raw) as SenderBehaviorScore;
        this.scoreCache.set(key, score);
        return score;
      }
    } catch (error) {
      this.logger.warn(
        `Redis lookup failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return null;
  }

  /**
   * Get top sender scores for a tenant, sorted by totalSignals descending.
   * Reads from Redis hash via HGETALL (no JSONB queries).
   */
  async getTopSenderScores(
    tenantId: string,
    limit: number,
  ): Promise<Array<{ senderEmail: string; score: SenderBehaviorScore }>> {
    try {
      const all = await this.redis.hgetall(
        `${REDIS_KEY_PREFIX}:${tenantId}`,
      );

      const entries: Array<{
        senderEmail: string;
        score: SenderBehaviorScore;
      }> = [];

      for (const [senderEmail, raw] of Object.entries(all)) {
        try {
          const score = JSON.parse(raw) as SenderBehaviorScore;
          entries.push({ senderEmail, score });
          // Populate cache while we're at it
          this.scoreCache.set(`${tenantId}:${senderEmail}`, score);
        } catch {
          this.logger.warn(
            `Invalid score data for sender ${senderEmail} in tenant ${tenantId}`,
          );
        }
      }

      // Sort by totalSignals descending, take top N
      entries.sort((a, b) => b.score.totalSignals - a.score.totalSignals);
      return entries.slice(0, limit);
    } catch (error) {
      this.logger.warn(
        `Failed to get top sender scores for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  /**
   * Flush signals for a single sender: compute score, EMA-blend, persist.
   */
  private async flushSenderSignals(
    key: string,
    signals: TriageSignal[],
  ): Promise<void> {
    if (signals.length === 0) return;

    const [tenantId, senderEmail] = this.parseKey(key);
    if (!tenantId || !senderEmail) return;

    const newScore = computeScoreFromSignals(signals);

    // EMA-blend with existing score (if any)
    const prevScore = await this.getSenderBehavior(tenantId, senderEmail);
    const blended = prevScore
      ? blendScores(prevScore, newScore, EMA_PREV_WEIGHT)
      : newScore;

    // Update in-memory cache
    this.scoreCache.set(key, blended);

    // Persist to Redis hash
    try {
      await this.redis.hset(
        `${REDIS_KEY_PREFIX}:${tenantId}`,
        senderEmail,
        JSON.stringify(blended),
      );
      await this.redis.expire(
        `${REDIS_KEY_PREFIX}:${tenantId}`,
        REDIS_TTL_SECONDS,
      );

      this.logger.debug(
        `Flushed ${signals.length} signals for ${senderEmail} (tenant ${tenantId}), totalSignals=${blended.totalSignals}`,
      );
    } catch (error) {
      this.logger.error(
        `Redis write failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Flush all buffered signals across all senders.
   */
  private async flushAllBuffers(): Promise<void> {
    const entries = Array.from(this.signalBuffer.entries());
    this.signalBuffer.clear();

    if (entries.length === 0) return;

    this.logger.debug(`Flushing ${entries.length} buffered sender signal groups`);

    for (const [key, signals] of entries) {
      await this.flushSenderSignals(key, signals);
    }
  }

  /**
   * Parse a cache key into [tenantId, senderEmail].
   * Key format: `${tenantId}:${senderEmail}`
   */
  private parseKey(key: string): [string | null, string | null] {
    const idx = key.indexOf(':');
    if (idx === -1) return [null, null];
    return [key.substring(0, idx), key.substring(idx + 1)];
  }
}
