import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  createLearningObservability,
  ActionFeedback,
  LearningProfile,
} from '../observability';

/**
 * Learning Service - Persists HITL feedback and learning profiles
 *
 * Retention policy:
 * - Feedback records: 30 days
 * - Learning profiles: 90 days (auto-renews on update)
 */
@Injectable()
export class LearningService implements OnModuleInit {
  private readonly logger = new Logger(LearningService.name);
  private learning: ReturnType<typeof createLearningObservability>;

  // Retention periods in days
  private readonly FEEDBACK_RETENTION_DAYS = 30;
  private readonly PROFILE_RETENTION_DAYS = 90;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.learning = createLearningObservability({
      logger: {
        info: (msg, ctx) => this.logger.log(msg, ctx),
        debug: (msg, ctx) => this.logger.debug(msg, ctx),
        warn: (msg, ctx) => this.logger.warn(msg, ctx),
      },
      onPersistFeedback: this.persistFeedback.bind(this),
      onPersistProfile: this.persistProfile.bind(this),
      onLoadProfile: this.loadProfile.bind(this),
    });
    this.logger.log('Learning service initialized with persistence');
  }

  /**
   * Record feedback for an action (called from HitlService)
   */
  async recordFeedback(feedback: ActionFeedback): Promise<void> {
    await this.learning.recordFeedback(feedback);
  }

  /**
   * Get adjusted confidence for an action (called before proposing actions)
   */
  async getAdjustedConfidence(
    tenantId: string,
    userId: string,
    agentName: string,
    actionType: string,
    originalConfidence: number,
  ): Promise<{ adjustedConfidence: number; boost: number }> {
    return this.learning.getAdjustedConfidenceAsync(
      tenantId,
      userId,
      agentName,
      actionType,
      originalConfidence,
    );
  }

  /**
   * Persist feedback to database
   */
  private async persistFeedback(feedback: ActionFeedback): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.FEEDBACK_RETENTION_DAYS);

    try {
      await this.prisma.agentActionFeedback.create({
        data: {
          tenantId: feedback.tenantId,
          userId: feedback.userId,
          actionId: feedback.actionId,
          agentName: feedback.agentName,
          actionType: feedback.actionType,
          wasApproved: feedback.wasApproved,
          wasExecuted: feedback.wasExecuted,
          wasSuccessful: feedback.wasSuccessful,
          originalConfidence: feedback.originalConfidence,
          adjustedConfidence: feedback.adjustedConfidence,
          userFeedback: feedback.userFeedback,
          userRating: feedback.userRating,
          executionTimeMs: feedback.executionTimeMs,
          errorMessage: feedback.errorMessage,
          contextSnapshot: feedback.contextSnapshot ? JSON.parse(JSON.stringify(feedback.contextSnapshot)) : undefined,
          expiresAt,
        },
      });
      this.logger.debug(`Persisted feedback for action ${feedback.actionId}`);
    } catch (error) {
      this.logger.error(`Failed to persist feedback: ${error}`);
      // Don't throw - learning should continue even if persistence fails
    }
  }

  /**
   * Persist learning profile to database (upsert)
   */
  private async persistProfile(profile: LearningProfile): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.PROFILE_RETENTION_DAYS);

    try {
      await this.prisma.agentLearningProfile.upsert({
        where: {
          tenantId_userId_agentName_actionType: {
            tenantId: profile.tenantId,
            userId: profile.userId,
            agentName: profile.agentName,
            actionType: profile.actionType,
          },
        },
        create: {
          tenantId: profile.tenantId,
          userId: profile.userId,
          agentName: profile.agentName,
          actionType: profile.actionType,
          totalAttempts: profile.totalAttempts,
          approvedCount: profile.approvedCount,
          rejectedCount: profile.rejectedCount,
          autoExecutedCount: profile.autoExecutedCount,
          avgOriginalConfidence: profile.avgOriginalConfidence,
          avgAdjustedConfidence: profile.avgAdjustedConfidence,
          successRate: profile.successRate,
          confidenceBoost: profile.confidenceBoost,
          lastLearningAt: new Date(profile.lastLearningAt),
          expiresAt,
        },
        update: {
          totalAttempts: profile.totalAttempts,
          approvedCount: profile.approvedCount,
          rejectedCount: profile.rejectedCount,
          autoExecutedCount: profile.autoExecutedCount,
          avgOriginalConfidence: profile.avgOriginalConfidence,
          avgAdjustedConfidence: profile.avgAdjustedConfidence,
          successRate: profile.successRate,
          confidenceBoost: profile.confidenceBoost,
          lastLearningAt: new Date(profile.lastLearningAt),
          expiresAt, // Renew expiration on update
        },
      });
      this.logger.debug(
        `Persisted profile for ${profile.agentName}:${profile.actionType}`,
      );
    } catch (error) {
      this.logger.error(`Failed to persist profile: ${error}`);
    }
  }

  /**
   * Load learning profile from database
   */
  private async loadProfile(
    tenantId: string,
    userId: string,
    agentName: string,
    actionType: string,
  ): Promise<LearningProfile | null> {
    try {
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

      if (!profile) return null;

      return {
        tenantId: profile.tenantId,
        userId: profile.userId,
        agentName: profile.agentName,
        actionType: profile.actionType,
        totalAttempts: profile.totalAttempts,
        approvedCount: profile.approvedCount,
        rejectedCount: profile.rejectedCount,
        autoExecutedCount: profile.autoExecutedCount,
        avgOriginalConfidence: profile.avgOriginalConfidence,
        avgAdjustedConfidence: profile.avgAdjustedConfidence,
        successRate: profile.successRate,
        confidenceBoost: profile.confidenceBoost,
        lastLearningAt: profile.lastLearningAt.getTime(),
      };
    } catch (error) {
      this.logger.error(`Failed to load profile: ${error}`);
      return null;
    }
  }
}
