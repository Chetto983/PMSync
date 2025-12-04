/**
 * VoltAgent Learning Module
 *
 * Integrates feedback/learning with VoltAgent observability.
 * Tracks user feedback and updates confidence predictions over time.
 *
 * Features:
 * - Exponential moving average for smooth learning
 * - Per-tenant, per-user, per-agent, per-action type profiles
 * - Redis-compatible for fast access + Prisma for persistence
 * - Integrates with VoltAgent hooks (onEnd, onToolEnd)
 */
import type { AgentHooks } from '@voltagent/core';
import { createHooks } from '@voltagent/core';
import { getObservabilityTranslations, type SupportedLocale } from '../locales';

/**
 * Learning configuration constants
 */
export const LEARNING_CONFIG = {
  /** How much to boost confidence when user approves */
  approvalBoostFactor: 0.05,
  /** How much to reduce confidence when user rejects */
  rejectionPenaltyFactor: 0.1,
  /** Minimum confidence boost/penalty */
  minAdjustment: 0.01,
  /** Maximum confidence boost/penalty */
  maxAdjustment: 0.15,
  /** Minimum attempts needed before applying learning */
  minAttemptsForLearning: 3,
  /** Decay factor for older feedback (exponential moving average) */
  decayFactor: 0.9,
} as const;

/**
 * Feedback record for an action
 */
export interface ActionFeedback {
  actionId: string;
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  wasApproved: boolean;
  wasExecuted: boolean;
  wasSuccessful?: boolean;
  originalConfidence: number;
  adjustedConfidence?: number;
  userFeedback?: string;
  userRating?: number;
  executionTimeMs?: number;
  errorMessage?: string;
  contextSnapshot?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Learning profile for a specific agent/action type combination
 */
export interface LearningProfile {
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  totalAttempts: number;
  approvedCount: number;
  rejectedCount: number;
  autoExecutedCount: number;
  avgOriginalConfidence: number;
  avgAdjustedConfidence: number;
  successRate: number;
  confidenceBoost: number;
  lastLearningAt: number;
}

/**
 * Learning metrics for observability
 */
export interface LearningMetrics {
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  event: 'feedback_recorded' | 'profile_updated' | 'confidence_adjusted';
  feedback?: ActionFeedback;
  profile?: LearningProfile;
  adjustedConfidence?: number;
  originalConfidence?: number;
  boost?: number;
  timestamp: number;
}

/**
 * Options for creating learning observability
 */
export interface LearningObservabilityOptions {
  /** Logger for learning events */
  logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    debug: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Locale for log messages */
  locale?: SupportedLocale;
  /** Callback for learning metrics (for Redis/external storage) */
  onLearningMetrics?: (metrics: LearningMetrics) => void;
  /** Callback to persist feedback to database */
  onPersistFeedback?: (feedback: ActionFeedback) => Promise<void>;
  /** Callback to persist profile to database */
  onPersistProfile?: (profile: LearningProfile) => Promise<void>;
  /** Callback to load profile from database */
  onLoadProfile?: (
    tenantId: string,
    userId: string,
    agentName: string,
    actionType: string,
  ) => Promise<LearningProfile | null>;
}

/**
 * Calculate confidence boost based on historical performance
 */
export function calculateConfidenceBoost(
  approvalRate: number,
  successRate: number,
  totalAttempts: number,
): number {
  if (totalAttempts < LEARNING_CONFIG.minAttemptsForLearning) {
    return 0;
  }

  // Base boost on approval rate deviation from 50%
  const approvalDeviation = approvalRate - 0.5;
  let boost = approvalDeviation * LEARNING_CONFIG.approvalBoostFactor * 2;

  // Factor in success rate
  if (successRate > 0) {
    const successDeviation = successRate - 0.5;
    boost += successDeviation * LEARNING_CONFIG.approvalBoostFactor;
  }

  // Clamp to min/max
  const clampedBoost = Math.max(
    -LEARNING_CONFIG.maxAdjustment,
    Math.min(LEARNING_CONFIG.maxAdjustment, boost),
  );

  // Ignore very small adjustments
  if (Math.abs(clampedBoost) < LEARNING_CONFIG.minAdjustment) {
    return 0;
  }

  return clampedBoost;
}

/**
 * Update learning profile with new feedback
 */
export function updateLearningProfile(
  existingProfile: LearningProfile | null,
  feedback: ActionFeedback,
): LearningProfile {
  const { tenantId, userId, agentName, actionType, wasApproved, wasExecuted, wasSuccessful, originalConfidence } =
    feedback;

  if (existingProfile) {
    const newTotalAttempts = existingProfile.totalAttempts + 1;
    const newApprovedCount = existingProfile.approvedCount + (wasApproved ? 1 : 0);
    const newRejectedCount = existingProfile.rejectedCount + (wasApproved ? 0 : 1);
    const newAutoExecutedCount = existingProfile.autoExecutedCount + (wasExecuted && wasApproved ? 1 : 0);

    // Exponential moving average
    const decay = LEARNING_CONFIG.decayFactor;
    const newAvgOriginalConfidence = decay * existingProfile.avgOriginalConfidence + (1 - decay) * originalConfidence;

    // Calculate approval rate
    const approvalRate = newApprovedCount / newTotalAttempts;

    // Calculate success rate
    const executedCount = newAutoExecutedCount + newApprovedCount;
    const successRate =
      executedCount > 0
        ? (wasSuccessful ?? wasExecuted ? 1 : 0) * (1 - decay) + decay * existingProfile.successRate
        : existingProfile.successRate;

    // Calculate confidence boost
    const confidenceBoost = calculateConfidenceBoost(approvalRate, successRate, newTotalAttempts);

    const newAvgAdjustedConfidence = Math.max(0, Math.min(1, newAvgOriginalConfidence + confidenceBoost));

    return {
      tenantId,
      userId,
      agentName,
      actionType,
      totalAttempts: newTotalAttempts,
      approvedCount: newApprovedCount,
      rejectedCount: newRejectedCount,
      autoExecutedCount: newAutoExecutedCount,
      avgOriginalConfidence: newAvgOriginalConfidence,
      avgAdjustedConfidence: newAvgAdjustedConfidence,
      successRate,
      confidenceBoost,
      lastLearningAt: Date.now(),
    };
  }

  // Create new profile
  return {
    tenantId,
    userId,
    agentName,
    actionType,
    totalAttempts: 1,
    approvedCount: wasApproved ? 1 : 0,
    rejectedCount: wasApproved ? 0 : 1,
    autoExecutedCount: wasExecuted && wasApproved ? 1 : 0,
    avgOriginalConfidence: originalConfidence,
    avgAdjustedConfidence: originalConfidence,
    successRate: wasSuccessful ?? wasExecuted ? 1.0 : 0.0,
    confidenceBoost: 0,
    lastLearningAt: Date.now(),
  };
}

/**
 * Get adjusted confidence based on learning profile
 */
export function getAdjustedConfidence(
  profile: LearningProfile | null,
  originalConfidence: number,
): { adjustedConfidence: number; boost: number; profileAttempts: number } {
  if (!profile || profile.totalAttempts < LEARNING_CONFIG.minAttemptsForLearning) {
    return {
      adjustedConfidence: originalConfidence,
      boost: 0,
      profileAttempts: profile?.totalAttempts ?? 0,
    };
  }

  const adjustedConfidence = Math.max(0, Math.min(1, originalConfidence + profile.confidenceBoost));

  return {
    adjustedConfidence,
    boost: profile.confidenceBoost,
    profileAttempts: profile.totalAttempts,
  };
}

/**
 * Creates learning observability callbacks.
 *
 * These callbacks integrate with VoltAgent and the feedback system to track:
 * - Feedback records
 * - Learning profile updates
 * - Confidence adjustments
 *
 * @example
 * ```typescript
 * const learning = createLearningObservability({
 *   logger: console,
 *   onLearningMetrics: (metrics) => cacheService.lpush('learning:metrics', metrics),
 *   onPersistFeedback: (feedback) => prisma.agentActionFeedback.create({ data: feedback }),
 *   onPersistProfile: (profile) => prisma.agentLearningProfile.upsert({ ... }),
 *   onLoadProfile: (tenantId, userId, agentName, actionType) =>
 *     prisma.agentLearningProfile.findUnique({ where: { ... } }),
 * });
 *
 * // Record feedback after action approval/rejection
 * await learning.recordFeedback(feedback);
 *
 * // Get adjusted confidence before proposing an action
 * const { adjustedConfidence, boost } = await learning.getAdjustedConfidence(
 *   tenantId, userId, agentName, actionType, originalConfidence
 * );
 * ```
 */
export function createLearningObservability(options: LearningObservabilityOptions = {}) {
  const { logger, locale = 'en', onLearningMetrics, onPersistFeedback, onPersistProfile, onLoadProfile } = options;

  const t = getObservabilityTranslations(locale);

  // In-memory cache for profiles (tenant:user:agent:action -> profile)
  const profileCache = new Map<string, LearningProfile>();

  const getCacheKey = (tenantId: string, userId: string, agentName: string, actionType: string) =>
    `${tenantId}:${userId}:${agentName}:${actionType}`;

  const emitMetrics = (metrics: LearningMetrics) => {
    if (onLearningMetrics) {
      onLearningMetrics(metrics);
    }
  };

  return {
    /**
     * Record feedback for an action
     */
    recordFeedback: async (feedback: ActionFeedback) => {
      logger?.info(t.hitl.actionExecuted, {
        actionId: feedback.actionId,
        tenantId: feedback.tenantId,
        agentName: feedback.agentName,
        actionType: feedback.actionType,
        wasApproved: feedback.wasApproved,
      });

      // Persist feedback
      if (onPersistFeedback) {
        await onPersistFeedback(feedback);
      }

      emitMetrics({
        tenantId: feedback.tenantId,
        userId: feedback.userId,
        agentName: feedback.agentName,
        actionType: feedback.actionType,
        event: 'feedback_recorded',
        feedback,
        timestamp: Date.now(),
      });

      // Update learning profile
      const cacheKey = getCacheKey(feedback.tenantId, feedback.userId, feedback.agentName, feedback.actionType);

      // Load existing profile
      let existingProfile = profileCache.get(cacheKey) ?? null;
      if (!existingProfile && onLoadProfile) {
        existingProfile = await onLoadProfile(
          feedback.tenantId,
          feedback.userId,
          feedback.agentName,
          feedback.actionType,
        );
      }

      // Update profile
      const updatedProfile = updateLearningProfile(existingProfile, feedback);
      profileCache.set(cacheKey, updatedProfile);

      // Persist profile
      if (onPersistProfile) {
        await onPersistProfile(updatedProfile);
      }

      logger?.debug('Learning profile updated', {
        agentName: feedback.agentName,
        actionType: feedback.actionType,
        totalAttempts: updatedProfile.totalAttempts,
        confidenceBoost: updatedProfile.confidenceBoost,
      });

      emitMetrics({
        tenantId: feedback.tenantId,
        userId: feedback.userId,
        agentName: feedback.agentName,
        actionType: feedback.actionType,
        event: 'profile_updated',
        profile: updatedProfile,
        timestamp: Date.now(),
      });
    },

    /**
     * Get adjusted confidence based on learning profile
     */
    getAdjustedConfidenceAsync: async (
      tenantId: string,
      userId: string,
      agentName: string,
      actionType: string,
      originalConfidence: number,
    ) => {
      const cacheKey = getCacheKey(tenantId, userId, agentName, actionType);

      // Try cache first
      let profile = profileCache.get(cacheKey) ?? null;

      // Load from database if not in cache
      if (!profile && onLoadProfile) {
        profile = await onLoadProfile(tenantId, userId, agentName, actionType);
        if (profile) {
          profileCache.set(cacheKey, profile);
        }
      }

      const result = getAdjustedConfidence(profile, originalConfidence);

      if (result.boost !== 0) {
        logger?.debug('Confidence adjusted', {
          agentName,
          actionType,
          originalConfidence,
          adjustedConfidence: result.adjustedConfidence,
          boost: result.boost,
        });

        emitMetrics({
          tenantId,
          userId,
          agentName,
          actionType,
          event: 'confidence_adjusted',
          originalConfidence,
          adjustedConfidence: result.adjustedConfidence,
          boost: result.boost,
          timestamp: Date.now(),
        });
      }

      return result;
    },

    /**
     * Clear cache for a specific profile
     */
    clearCache: (tenantId: string, userId: string, agentName?: string, actionType?: string) => {
      if (agentName && actionType) {
        profileCache.delete(getCacheKey(tenantId, userId, agentName, actionType));
      } else {
        // Clear all profiles for tenant/user
        for (const key of profileCache.keys()) {
          if (key.startsWith(`${tenantId}:${userId}:`)) {
            profileCache.delete(key);
          }
        }
      }
    },

    /**
     * Get cached profile (for testing/debugging)
     */
    getCachedProfile: (tenantId: string, userId: string, agentName: string, actionType: string) => {
      return profileCache.get(getCacheKey(tenantId, userId, agentName, actionType));
    },
  };
}

/**
 * Creates VoltAgent hooks that integrate learning observability.
 *
 * These hooks automatically track agent completion metrics
 * that can be used to improve learning profiles.
 */
export function createLearningHooks(
  learning: ReturnType<typeof createLearningObservability>,
  options: {
    logger?: {
      info: (message: string, context?: Record<string, unknown>) => void;
      debug: (message: string, context?: Record<string, unknown>) => void;
    };
  } = {},
): AgentHooks {
  const { logger } = options;

  return createHooks({
    onEnd: async ({ agent, output, error, context }) => {
      // Track agent completion for potential learning
      logger?.debug('Agent completed for learning tracking', {
        agentName: agent.name,
        operationId: context.operationId,
        success: !error,
        hasOutput: !!output,
      });

      // Note: Actual feedback recording happens through the learning.recordFeedback
      // callback when the user explicitly approves/rejects an action.
      // This hook is for tracking agent-level metrics that could influence learning.
    },

    onToolEnd: async ({ agent, tool, output: _output, error, context }) => {
      // Track tool completion for potential learning
      logger?.debug('Tool completed for learning tracking', {
        agentName: agent.name,
        toolName: tool.name,
        operationId: context.operationId,
        success: !error,
      });
    },
  });
}
