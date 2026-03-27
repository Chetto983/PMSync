import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { FeatureStoreService } from './feature-store.service';

const BATCH_SIZE = 100;

/**
 * BullMQ scheduled job: iterates all active contacts per tenant,
 * computes features, and persists to the feature store.
 * Runs nightly at 3 AM via ScheduledJobsQueueService.
 */
@Injectable()
export class LeadFeatureJobService implements OnModuleInit {
  private readonly logger = new Logger(LeadFeatureJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
    private readonly featureStore: FeatureStoreService,
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

    for (const tenant of tenants) {
      const processed = await this.processTenan(tenant.id);
      totalProcessed += processed;
    }

    // Cleanup expired feature records
    const cleaned = await this.featureStore.cleanupExpired();

    this.logger.log(
      `Lead feature compute complete: ${totalProcessed} contacts processed across ${tenants.length} tenants, ${cleaned} expired records cleaned`,
    );
  }

  private async processTenan(tenantId: string): Promise<number> {
    let processed = 0;
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
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
