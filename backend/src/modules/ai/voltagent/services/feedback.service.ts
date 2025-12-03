import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Options for recording feedback after action approval/rejection.
 */
export interface RecordFeedbackOptions {
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
  userRating?: number; // 1-5 stars
  executionTimeMs?: number;
  errorMessage?: string;
  contextSnapshot?: Record<string, any>;
}

/**
 * Learning profile with computed statistics.
 */
export interface LearningProfileStats {
  agentName: string;
  actionType: string;
  totalAttempts: number;
  approvalRate: number;
  successRate: number;
  confidenceBoost: number;
  avgOriginalConfidence: number;
  avgAdjustedConfidence: number;
}

/**
 * FeedbackService manages the learning loop for the multi-agent system.
 * It records user feedback and updates learning profiles to improve
 * future confidence predictions.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  // Configuration for confidence adjustment
  private readonly LEARNING_CONFIG = {
    // How much to boost confidence when user approves
    approvalBoostFactor: 0.05,
    // How much to reduce confidence when user rejects
    rejectionPenaltyFactor: 0.1,
    // Minimum confidence boost/penalty
    minAdjustment: 0.01,
    // Maximum confidence boost/penalty
    maxAdjustment: 0.15,
    // Minimum attempts needed before applying learning
    minAttemptsForLearning: 3,
    // Decay factor for older feedback (exponential moving average)
    decayFactor: 0.9,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record feedback for an action (approval/rejection).
   * This is called after the user makes a decision.
   */
  async recordFeedback(options: RecordFeedbackOptions): Promise<void> {
    const {
      actionId,
      tenantId,
      userId,
      agentName,
      actionType,
      wasApproved,
      wasExecuted,
      wasSuccessful,
      originalConfidence,
      adjustedConfidence,
      userFeedback,
      userRating,
      executionTimeMs,
      errorMessage,
      contextSnapshot,
    } = options;

    this.logger.debug(
      `Recording feedback for action ${actionId}: approved=${wasApproved}, executed=${wasExecuted}`,
    );

    // Create feedback record
    await this.prisma.agentActionFeedback.create({
      data: {
        actionId,
        tenantId,
        userId,
        agentName,
        actionType,
        wasApproved,
        wasExecuted,
        wasSuccessful,
        originalConfidence,
        adjustedConfidence,
        userFeedback,
        userRating,
        executionTimeMs,
        errorMessage,
        contextSnapshot: contextSnapshot as Prisma.JsonObject,
      },
    });

    // Update learning profile
    await this.updateLearningProfile(
      tenantId,
      userId,
      agentName,
      actionType,
      wasApproved,
      wasExecuted,
      wasSuccessful ?? wasExecuted,
      originalConfidence,
    );

    this.logger.log(
      `Feedback recorded and learning profile updated for ${agentName}:${actionType}`,
    );
  }

  /**
   * Update the learning profile based on new feedback.
   * Uses exponential moving average for smooth learning.
   */
  private async updateLearningProfile(
    tenantId: string,
    userId: string,
    agentName: string,
    actionType: string,
    wasApproved: boolean,
    wasExecuted: boolean,
    wasSuccessful: boolean,
    originalConfidence: number,
  ): Promise<void> {
    // Find or create learning profile
    const existingProfile = await this.prisma.agentLearningProfile.findUnique({
      where: {
        tenantId_userId_agentName_actionType: {
          tenantId,
          userId,
          agentName,
          actionType,
        },
      },
    });

    if (existingProfile) {
      // Update existing profile
      const newTotalAttempts = existingProfile.totalAttempts + 1;
      const newApprovedCount = existingProfile.approvedCount + (wasApproved ? 1 : 0);
      const newRejectedCount = existingProfile.rejectedCount + (wasApproved ? 0 : 1);
      const newAutoExecutedCount =
        existingProfile.autoExecutedCount + (wasExecuted && wasApproved ? 1 : 0);

      // Calculate new averages using exponential moving average
      const decay = this.LEARNING_CONFIG.decayFactor;
      const newAvgOriginalConfidence =
        decay * existingProfile.avgOriginalConfidence +
        (1 - decay) * originalConfidence;

      // Calculate approval rate
      const approvalRate = newApprovedCount / newTotalAttempts;

      // Calculate success rate (only from executed actions)
      const executedCount = newAutoExecutedCount + newApprovedCount;
      const successRate = executedCount > 0
        ? (wasSuccessful ? 1 : 0) * (1 - decay) + decay * existingProfile.successRate
        : existingProfile.successRate;

      // Calculate confidence boost/penalty
      const confidenceBoost = this.calculateConfidenceBoost(
        approvalRate,
        successRate,
        newTotalAttempts,
      );

      const newAvgAdjustedConfidence = Math.max(
        0,
        Math.min(1, newAvgOriginalConfidence + confidenceBoost),
      );

      await this.prisma.agentLearningProfile.update({
        where: {
          tenantId_userId_agentName_actionType: {
            tenantId,
            userId,
            agentName,
            actionType,
          },
        },
        data: {
          totalAttempts: newTotalAttempts,
          approvedCount: newApprovedCount,
          rejectedCount: newRejectedCount,
          autoExecutedCount: newAutoExecutedCount,
          avgOriginalConfidence: newAvgOriginalConfidence,
          avgAdjustedConfidence: newAvgAdjustedConfidence,
          successRate,
          confidenceBoost,
          lastLearningAt: new Date(),
        },
      });
    } else {
      // Create new profile
      const confidenceBoost = 0; // No boost for first attempt

      await this.prisma.agentLearningProfile.create({
        data: {
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
          successRate: wasSuccessful ? 1.0 : 0.0,
          confidenceBoost,
          lastLearningAt: new Date(),
        },
      });
    }
  }

  /**
   * Calculate confidence boost based on historical performance.
   */
  private calculateConfidenceBoost(
    approvalRate: number,
    successRate: number,
    totalAttempts: number,
  ): number {
    // Need minimum attempts before applying learning
    if (totalAttempts < this.LEARNING_CONFIG.minAttemptsForLearning) {
      return 0;
    }

    // Base boost on approval rate deviation from 50%
    // If approval rate > 50%, positive boost; otherwise negative
    const approvalDeviation = approvalRate - 0.5;
    let boost = approvalDeviation * this.LEARNING_CONFIG.approvalBoostFactor * 2;

    // Factor in success rate (executed actions that succeeded)
    if (successRate > 0) {
      const successDeviation = successRate - 0.5;
      boost += successDeviation * this.LEARNING_CONFIG.approvalBoostFactor;
    }

    // Clamp to min/max
    const clampedBoost = Math.max(
      -this.LEARNING_CONFIG.maxAdjustment,
      Math.min(this.LEARNING_CONFIG.maxAdjustment, boost),
    );

    // Ignore very small adjustments
    if (Math.abs(clampedBoost) < this.LEARNING_CONFIG.minAdjustment) {
      return 0;
    }

    return clampedBoost;
  }

  /**
   * Get the adjusted confidence for an action based on learning profile.
   * This is called before proposing an action to apply learned adjustments.
   */
  async getAdjustedConfidence(
    tenantId: string,
    userId: string,
    agentName: string,
    actionType: string,
    originalConfidence: number,
  ): Promise<{ adjustedConfidence: number; boost: number; profileAttempts: number }> {
    const profile = await this.prisma.agentLearningProfile.findUnique({
      where: {
        tenantId_userId_agentName_actionType: {
          tenantId,
          userId,
          agentName,
          actionType,
        },
      },
    });

    if (!profile || profile.totalAttempts < this.LEARNING_CONFIG.minAttemptsForLearning) {
      // No learning data available, return original confidence
      return {
        adjustedConfidence: originalConfidence,
        boost: 0,
        profileAttempts: profile?.totalAttempts ?? 0,
      };
    }

    const adjustedConfidence = Math.max(
      0,
      Math.min(1, originalConfidence + profile.confidenceBoost),
    );

    return {
      adjustedConfidence,
      boost: profile.confidenceBoost,
      profileAttempts: profile.totalAttempts,
    };
  }

  /**
   * Get learning profile statistics for a tenant/user.
   */
  async getLearningStats(
    tenantId: string,
    userId?: string,
  ): Promise<LearningProfileStats[]> {
    const where: Prisma.AgentLearningProfileWhereInput = { tenantId };
    if (userId) {
      where.userId = userId;
    }

    const profiles = await this.prisma.agentLearningProfile.findMany({
      where,
      orderBy: [{ agentName: 'asc' }, { actionType: 'asc' }],
    });

    return profiles.map((profile) => ({
      agentName: profile.agentName,
      actionType: profile.actionType,
      totalAttempts: profile.totalAttempts,
      approvalRate:
        profile.totalAttempts > 0
          ? profile.approvedCount / profile.totalAttempts
          : 0,
      successRate: profile.successRate,
      confidenceBoost: profile.confidenceBoost,
      avgOriginalConfidence: profile.avgOriginalConfidence,
      avgAdjustedConfidence: profile.avgAdjustedConfidence,
    }));
  }

  /**
   * Get feedback history for a tenant/user.
   */
  async getFeedbackHistory(
    tenantId: string,
    options: {
      userId?: string;
      agentName?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { userId, agentName, limit = 50, offset = 0 } = options;

    const where: Prisma.AgentActionFeedbackWhereInput = { tenantId };
    if (userId) {
      where.userId = userId;
    }
    if (agentName) {
      where.agentName = agentName;
    }

    const [feedback, total] = await Promise.all([
      this.prisma.agentActionFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          action: {
            select: {
              id: true,
              actionType: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.agentActionFeedback.count({ where }),
    ]);

    return { feedback, total, limit, offset };
  }

  /**
   * Reset learning profile for a specific agent/action type.
   * Useful when agent behavior has changed significantly.
   */
  async resetLearningProfile(
    tenantId: string,
    userId: string,
    agentName: string,
    actionType?: string,
  ): Promise<void> {
    const where: Prisma.AgentLearningProfileWhereInput = {
      tenantId,
      userId,
      agentName,
    };

    if (actionType) {
      where.actionType = actionType;
    }

    await this.prisma.agentLearningProfile.deleteMany({ where });

    this.logger.log(
      `Reset learning profile for ${agentName}${actionType ? `:${actionType}` : ''} (tenant: ${tenantId}, user: ${userId})`,
    );
  }

  /**
   * Get aggregate statistics across all agents for a tenant.
   */
  async getAggregateStats(tenantId: string) {
    const profiles = await this.prisma.agentLearningProfile.findMany({
      where: { tenantId },
    });

    if (profiles.length === 0) {
      return {
        totalAttempts: 0,
        overallApprovalRate: 0,
        overallSuccessRate: 0,
        agentBreakdown: {},
      };
    }

    const totalAttempts = profiles.reduce((sum, p) => sum + p.totalAttempts, 0);
    const totalApproved = profiles.reduce((sum, p) => sum + p.approvedCount, 0);

    // Weight success rate by attempts
    const weightedSuccessRate = profiles.reduce(
      (sum, p) => sum + p.successRate * p.totalAttempts,
      0,
    );

    // Group by agent
    const agentBreakdown: Record<string, {
      totalAttempts: number;
      approvalRate: number;
      actionTypes: string[];
    }> = {};

    profiles.forEach((p) => {
      if (!agentBreakdown[p.agentName]) {
        agentBreakdown[p.agentName] = {
          totalAttempts: 0,
          approvalRate: 0,
          actionTypes: [],
        };
      }
      agentBreakdown[p.agentName].totalAttempts += p.totalAttempts;
      agentBreakdown[p.agentName].actionTypes.push(p.actionType);
    });

    // Calculate approval rates per agent
    Object.keys(agentBreakdown).forEach((agent) => {
      const agentProfiles = profiles.filter((p) => p.agentName === agent);
      const agentApproved = agentProfiles.reduce(
        (sum, p) => sum + p.approvedCount,
        0,
      );
      const agentTotal = agentProfiles.reduce(
        (sum, p) => sum + p.totalAttempts,
        0,
      );
      agentBreakdown[agent].approvalRate =
        agentTotal > 0 ? agentApproved / agentTotal : 0;
    });

    return {
      totalAttempts,
      overallApprovalRate: totalAttempts > 0 ? totalApproved / totalAttempts : 0,
      overallSuccessRate: totalAttempts > 0 ? weightedSuccessRate / totalAttempts : 0,
      agentBreakdown,
    };
  }
}
