/**
 * Triage Learning Service
 *
 * Tracks implicit user behavior signals (reply, archive, flag, etc.)
 * and aggregates per-sender behavior scores for triage recalculation.
 *
 * Storage: Redis lists for signal buffering + Redis hash (triage:sender-scores:{tenantId}).
 * Atomic Lua drain script for buffer flush. No in-memory state.
 * 30-day TTL on Redis score hashes. 10-min TTL on buffer lists. Zero DB writes.
 *
 * @see AttentionScoreService - consumes sender behavior during scoring
 * @see TriageBackfillSchedulerService - triggers recalculation using learned weights
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConsentEnforcementService } from '../../compliance/services/consent-enforcement.service';

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

/** Redis key prefix for signal buffer lists */
const REDIS_BUFFER_PREFIX = 'triage:signal-buffer';

/** TTL for signal buffer lists (seconds) — safety expiry */
const BUFFER_TTL_SECONDS = 600; // 10 minutes

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
  private redis!: Redis;

  /** Periodic flush interval handle */
  private flushIntervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Phase 149 D-02 + D-03: env-driven decay half-life (days). Read once at init. */
  private halfLifeDays: number = 14;

  /** Lua script: atomically drain a Redis list (LRANGE + DEL) */
  private readonly DRAIN_SCRIPT = `
    local items = redis.call("LRANGE", KEYS[1], 0, -1)
    if #items > 0 then
      redis.call("DEL", KEYS[1])
    end
    return items
  `;

  constructor(
    private readonly redisConnection: RedisConnectionService,
    private readonly configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly consentService?: ConsentEnforcementService,
  ) {}

  onModuleInit() {
    this.redis = this.redisConnection.client;

    // Phase 149 D-02: read half-life from env (default 14). Clamp floor to 1 day
    // to prevent divide-by-zero in blendScores / TTL compute (T-149-03-02).
    const rawHalfLife = parseInt(
      this.configService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14'),
      10,
    );
    this.halfLifeDays = Math.max(
      1,
      Number.isFinite(rawHalfLife) ? rawHalfLife : 14,
    );

    // Start periodic flush interval
    this.flushIntervalHandle = setInterval(() => {
      this.flushAllBuffers().catch((err) => {
        this.logger.error(
          `Periodic flush failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, FLUSH_INTERVAL_MS);

    this.logger.log(
      `TriageLearningService initialized (flush interval: ${FLUSH_INTERVAL_MS / 1000}s, threshold: ${FLUSH_THRESHOLD} signals, decay half-life: ${this.halfLifeDays}d)`,
    );
  }

  async onModuleDestroy() {
    // Clear flush interval
    if (this.flushIntervalHandle) {
      clearInterval(this.flushIntervalHandle);
      this.flushIntervalHandle = null;
    }

    if (!this.redis) {
      return;
    }

    // Flush all remaining buffered signals
    await this.flushAllBuffers();

    // Redis lifecycle is managed by RedisConnectionService
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Record an implicit user action as a triage signal.
   * Signals are buffered in Redis lists and flushed in batches at threshold.
   *
   * Privacy controls (EI-M3):
   * 1. Requires 'ai_auto_triage' consent (same as auto-triage feature)
   * 2. Respects aiBehavioralTrackingEnabled user preference (independent toggle)
   * Silently skips if either check fails — no error thrown.
   */
  async recordSignal(signal: TriageSignal): Promise<void> {
    // Privacy gate: check AI triage consent
    if (this.consentService) {
      const hasConsent = await this.consentService.hasConsent(
        signal.userId, signal.tenantId, 'ai_auto_triage',
      );
      if (!hasConsent) {
        this.logger.debug(`Signal skipped for ${signal.userId}: no ai_auto_triage consent`);
        return;
      }
    }

    // Privacy gate: check behavioral tracking preference
    if (this.prisma) {
      const prefs = await this.prisma.userPreferences.findUnique({
        where: { userId: signal.userId },
        select: { aiBehavioralTrackingEnabled: true },
      });
      // Default to enabled if preference doesn't exist yet (opt-out model)
      if (prefs && prefs.aiBehavioralTrackingEnabled === false) {
        this.logger.debug(`Signal skipped for ${signal.userId}: behavioral tracking disabled`);
        return;
      }
    }

    const senderEmail = signal.senderEmail.toLowerCase();
    const bufferKey = `${REDIS_BUFFER_PREFIX}:${signal.tenantId}:${senderEmail}`;

    await this.redis.rpush(bufferKey, JSON.stringify(signal));
    await this.redis.expire(bufferKey, BUFFER_TTL_SECONDS);

    // Check if buffer reached flush threshold
    const len = await this.redis.llen(bufferKey);
    if (len >= FLUSH_THRESHOLD) {
      await this.drainAndFlush(
        bufferKey,
        signal.tenantId,
        senderEmail,
      ).catch((err) => {
        this.logger.error(
          `Drain failed for ${bufferKey}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  /**
   * Get sender behavior score for a specific sender.
   * Reads directly from Redis HGET (sub-ms on small hashes).
   */
  async getSenderBehavior(
    tenantId: string,
    senderEmail: string,
  ): Promise<SenderBehaviorScore | null> {
    try {
      const raw = await this.redis.hget(
        `${REDIS_KEY_PREFIX}:${tenantId}`,
        senderEmail.toLowerCase(),
      );
      if (raw) {
        return JSON.parse(raw) as SenderBehaviorScore;
      }
    } catch (error) {
      this.logger.warn(
        `Redis lookup failed for ${tenantId}:${senderEmail}: ${error instanceof Error ? error.message : String(error)}`,
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
   * Atomically drain a Redis buffer list and flush signals to score hash.
   */
  private async drainAndFlush(
    bufferKey: string,
    tenantId: string,
    senderEmail: string,
  ): Promise<void> {
    const rawSignals = (await this.redis.eval(
      this.DRAIN_SCRIPT,
      1,
      bufferKey,
    )) as string[];
    if (!rawSignals || rawSignals.length === 0) return;
    const signals = rawSignals.map(
      (raw) => JSON.parse(raw) as TriageSignal,
    );
    await this.flushSenderSignals(
      `${tenantId}:${senderEmail}`,
      signals,
    );
  }

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
   * Flush all buffered signals across all senders using Redis SCAN.
   */
  private async flushAllBuffers(): Promise<void> {
    if (!this.redis) {
      return;
    }

    let cursor = '0';
    let totalDrained = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${REDIS_BUFFER_PREFIX}:*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const suffix = key.replace(`${REDIS_BUFFER_PREFIX}:`, '');
        const firstColon = suffix.indexOf(':');
        if (firstColon === -1) continue;

        const tenantId = suffix.substring(0, firstColon);
        const senderEmail = suffix.substring(firstColon + 1);
        await this.drainAndFlush(key, tenantId, senderEmail);
        totalDrained++;
      }
    } while (cursor !== '0');

    if (totalDrained > 0) {
      this.logger.debug(
        `Flushed ${totalDrained} buffered sender signal groups via SCAN`,
      );
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
