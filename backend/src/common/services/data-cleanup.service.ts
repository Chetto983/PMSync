import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data Cleanup Service
 *
 * Removes expired data from tables with expiresAt field to prevent DB bloat.
 *
 * Tables cleaned:
 * - AgentActionFeedback (30 day retention)
 * - AgentLearningProfile (90 day retention, auto-renews on update)
 * - AIMemory (variable retention via expiresAt)
 * - ActionQueue (expired pending actions)
 *
 * Runs daily at 3 AM (low traffic period)
 */
@Injectable()
export class DataCleanupService implements OnModuleInit {
  private readonly logger = new Logger(DataCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Data cleanup service initialized');
  }

  /**
   * Daily cleanup of expired records (runs at 3 AM)
   */
  @Cron('0 3 * * *')
  async cleanupExpiredData(): Promise<CleanupResult> {
    this.logger.log('Starting daily data cleanup...');
    const startTime = Date.now();
    const now = new Date();
    const results: CleanupResult = {
      agentFeedback: 0,
      learningProfiles: 0,
      aiMemories: 0,
      expiredActions: 0,
      duration: 0,
    };

    try {
      // 1. Clean expired AgentActionFeedback
      const feedbackResult = await this.prisma.agentActionFeedback.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
      results.agentFeedback = feedbackResult.count;
      this.logger.debug(`Deleted ${feedbackResult.count} expired feedback records`);

      // 2. Clean expired AgentLearningProfile
      const profileResult = await this.prisma.agentLearningProfile.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
      results.learningProfiles = profileResult.count;
      this.logger.debug(`Deleted ${profileResult.count} expired learning profiles`);

      // 3. Clean expired AIMemory
      const memoryResult = await this.prisma.aIMemory.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
      results.aiMemories = memoryResult.count;
      this.logger.debug(`Deleted ${memoryResult.count} expired AI memories`);

      // 4. Clean expired ActionQueue entries (still pending after expiration)
      const actionResult = await this.prisma.actionQueue.deleteMany({
        where: {
          status: 'PENDING_APPROVAL',
          expiresAt: {
            lt: now,
          },
        },
      });
      results.expiredActions = actionResult.count;
      this.logger.debug(`Deleted ${actionResult.count} expired pending actions`);

      results.duration = Date.now() - startTime;
      const total =
        results.agentFeedback +
        results.learningProfiles +
        results.aiMemories +
        results.expiredActions;

      this.logger.log(
        `Data cleanup complete: ${total} records deleted in ${results.duration}ms ` +
          `(feedback: ${results.agentFeedback}, profiles: ${results.learningProfiles}, ` +
          `memories: ${results.aiMemories}, actions: ${results.expiredActions})`,
      );

      return results;
    } catch (error) {
      this.logger.error(`Data cleanup failed: ${error}`);
      throw error;
    }
  }

  /**
   * Manual cleanup trigger (for testing or admin use)
   */
  async runManualCleanup(): Promise<CleanupResult> {
    this.logger.log('Running manual data cleanup...');
    return this.cleanupExpiredData();
  }

  /**
   * Get cleanup statistics without deleting
   */
  async getExpiredCounts(): Promise<ExpiredCounts> {
    const now = new Date();

    const [feedback, profiles, memories, actions] = await Promise.all([
      this.prisma.agentActionFeedback.count({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.agentLearningProfile.count({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.aIMemory.count({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.actionQueue.count({
        where: { status: 'PENDING_APPROVAL', expiresAt: { lt: now } },
      }),
    ]);

    return {
      agentFeedback: feedback,
      learningProfiles: profiles,
      aiMemories: memories,
      expiredActions: actions,
      total: feedback + profiles + memories + actions,
    };
  }
}

interface CleanupResult {
  agentFeedback: number;
  learningProfiles: number;
  aiMemories: number;
  expiredActions: number;
  duration: number;
}

interface ExpiredCounts {
  agentFeedback: number;
  learningProfiles: number;
  aiMemories: number;
  expiredActions: number;
  total: number;
}
