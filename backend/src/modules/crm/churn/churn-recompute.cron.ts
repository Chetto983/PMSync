import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChurnAssessmentService } from './churn-assessment.service';
import { ScheduledJobsQueueService, ScheduledJobType } from '../../../common/services/scheduled-jobs.queue';

/**
 * Weekly cron job to recompute churn probability for all active contacts.
 * Runs every Sunday at 03:00 UTC (after forecast refresh at 02:00).
 */
@Injectable()
export class ChurnRecomputeCron implements OnModuleInit {
  private readonly logger = new Logger(ChurnRecomputeCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assessmentService: ChurnAssessmentService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
  ) {}

  onModuleInit() {
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.CHURN_RECOMPUTE,
      async () => this.recomputeAll(),
    );
  }

  async recomputeAll(): Promise<void> {
    this.logger.log('Starting weekly churn recompute...');

    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });

      let totalContacts = 0;
      let totalAccounts = 0;
      let newHighRisk = 0;

      for (const tenant of tenants) {
        // Get contacts that have CRM deal activity (worth scoring)
        const contactIds = await this.prisma.dealContact.findMany({
          where: { tenantId: tenant.id },
          select: { contactId: true },
          distinct: ['contactId'],
        });

        for (const { contactId } of contactIds) {
          try {
            await this.assessmentService.computeAndStore(
              tenant.id,
              contactId,
            );
            totalContacts++;
          } catch (err) {
            this.logger.warn(
              `Failed churn assessment for contact ${contactId}: ${(err as Error).message}`,
            );
          }
        }

        // Also assess accounts with linked contacts
        const accountIds = await this.prisma.accountContact.findMany({
          where: { tenantId: tenant.id },
          select: { accountId: true },
          distinct: ['accountId'],
        });

        for (const { accountId } of accountIds) {
          try {
            await this.assessmentService.computeAndStoreAccount(
              tenant.id,
              accountId,
            );
            totalAccounts++;
          } catch (err) {
            this.logger.warn(
              `Failed churn assessment for account ${accountId}: ${(err as Error).message}`,
            );
          }
        }

        // Count new high-risk signals for this tenant
        const highRiskCount = await this.prisma.churnSignal.count({
          where: {
            tenantId: tenant.id,
            riskLevel: 'HIGH',
            acknowledgedAt: null,
          },
        });
        newHighRisk += highRiskCount;
      }

      this.logger.log(
        `Churn recompute complete: ${totalContacts} contacts, ${totalAccounts} accounts assessed. ${newHighRisk} high-risk signals active.`,
      );
    } catch (err) {
      this.logger.error('Churn recompute cron failed', err);
    }
  }
}
