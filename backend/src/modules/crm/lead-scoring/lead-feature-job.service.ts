import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { FeatureStoreService } from './feature-store.service';
import { LeadScoringService } from './lead-scoring.service';

const BATCH_SIZE = 100;

/**
 * BullMQ scheduled job: iterates all active contacts per tenant,
 * computes features, persists to the feature store, then scores
 * all contacts via LLM.
 * Runs nightly at 3 AM via ScheduledJobsQueueService.
 */
@Injectable()
export class LeadFeatureJobService implements OnModuleInit {
  private readonly logger = new Logger(LeadFeatureJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
    private readonly featureStore: FeatureStoreService,
    private readonly leadScoring: LeadScoringService,
  ) {}

  onModuleInit() {
    this.scheduledJobs.registerHandler(
      ScheduledJobType.LEAD_FEATURE_COMPUTE,
      () => this.run(),
    );
  }

  async run(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });

    let totalProcessed = 0;
    let totalScored = 0;

    for (const tenant of tenants) {
      const processed = await this.processTenant(tenant.id);
      totalProcessed += processed;

      // Score contacts after features are computed
      const scored = await this.leadScoring.scoreAllContacts(tenant.id);
      totalScored += scored;
    }

    // Cleanup expired feature records
    const cleaned = await this.featureStore.cleanupExpired();

    this.logger.log(
      `Lead pipeline complete: ${totalProcessed} features computed, ${totalScored} contacts scored, ${cleaned} expired records cleaned`,
    );
  }

  private async processTenant(tenantId: string): Promise<number> {
    let processed = 0;
    let cursor: string | undefined;

     
    while (true) {
      const contacts = await this.prisma.contact.findMany({
        where: {
          tenantId,
          isDeleted: false,
        },
        select: { id: true },
        take: BATCH_SIZE,
        skip: cursor ? 1 : 0,
        ...(cursor
          ? {
              cursor: { id_tenantId: { id: cursor, tenantId } },
            }
          : {}),
        orderBy: { id: 'asc' },
      });

      if (contacts.length === 0) break;

      for (const contact of contacts) {
        try {
          await this.featureStore.computeAndStore(tenantId, contact.id);
          processed++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to compute features for contact ${contact.id}: ${message}`,
          );
        }
      }

      cursor = contacts[contacts.length - 1].id;

      if (contacts.length < BATCH_SIZE) break;
    }

    return processed;
  }
}
