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
 * - VoltAgent conversations (30 day retention)
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
      conversations: 0,
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

      // 5. Clean old VoltAgent conversations (30 days)
      results.conversations = await this.cleanupOldConversations(now);

      results.duration = Date.now() - startTime;
      const total =
        results.agentFeedback +
        results.learningProfiles +
        results.aiMemories +
        results.expiredActions +
        results.conversations;

      this.logger.log(
        `Data cleanup complete: ${total} records deleted in ${results.duration}ms ` +
          `(feedback: ${results.agentFeedback}, profiles: ${results.learningProfiles}, ` +
          `memories: ${results.aiMemories}, actions: ${results.expiredActions}, ` +
          `conversations: ${results.conversations})`,
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
    const conversationCutoff = new Date();
    conversationCutoff.setDate(conversationCutoff.getDate() - 30);

    const [feedback, profiles, memories, actions, conversations] = await Promise.all([
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
      this.getOldConversationCount(conversationCutoff),
    ]);

    return {
      agentFeedback: feedback,
      learningProfiles: profiles,
      aiMemories: memories,
      expiredActions: actions,
      conversations,
      total: feedback + profiles + memories + actions + conversations,
    };
  }

  /**
   * Clean up old VoltAgent conversations (30 days).
   * VoltAgent uses voltagent_memory_* tables with PostgreSQLMemoryAdapter.
   */
  private async cleanupOldConversations(now: Date): Promise<number> {
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    try {
      // Check if VoltAgent tables exist
      const tableExists = await this.checkVoltAgentTablesExist();
      if (!tableExists) {
        this.logger.debug('VoltAgent memory tables not found, skipping conversation cleanup');
        return 0;
      }

      // Delete messages first (FK constraint), then conversations
      await this.prisma.$executeRaw`
        DELETE FROM voltagent_memory_messages
        WHERE conversation_id IN (
          SELECT id FROM voltagent_memory_conversations
          WHERE updated_at < ${cutoffDate}
        )
      `;

      const result = await this.prisma.$executeRaw`
        DELETE FROM voltagent_memory_conversations
        WHERE updated_at < ${cutoffDate}
      `;

      this.logger.debug(`Deleted ${result} old conversations`);
      return result;
    } catch (error) {
      // Table might not exist yet
      if (String(error).includes('does not exist') || String(error).includes('relation')) {
        this.logger.debug('VoltAgent memory tables not found, skipping');
        return 0;
      }
      this.logger.error(`Failed to cleanup conversations: ${error}`);
      return 0;
    }
  }

  /**
   * Check if VoltAgent memory tables exist.
   */
  private async checkVoltAgentTablesExist(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'voltagent_memory_conversations'
        ) as exists
      `;
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get count of old conversations for statistics.
   */
  private async getOldConversationCount(cutoffDate: Date): Promise<number> {
    try {
      const tableExists = await this.checkVoltAgentTablesExist();
      if (!tableExists) return 0;

      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM voltagent_memory_conversations
        WHERE updated_at < ${cutoffDate}
      `;
      return Number(result[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }
}

interface CleanupResult {
  agentFeedback: number;
  learningProfiles: number;
  aiMemories: number;
  expiredActions: number;
  conversations: number;
  duration: number;
}

interface ExpiredCounts {
  agentFeedback: number;
  learningProfiles: number;
  aiMemories: number;
  expiredActions: number;
  conversations: number;
  total: number;
}
