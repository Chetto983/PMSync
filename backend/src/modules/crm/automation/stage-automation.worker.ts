import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
  getSharedRedisConnection,
  releaseSharedRedisConnection,
  scaleForReplicas,
} from '../../../common/config';
import type {
  StageAutomationJobData,
  StageAutomationRule,
  NotifyParams,
  CreateTaskParams,
} from './types';

@Injectable()
export class StageAutomationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StageAutomationWorker.name);
  private worker!: Worker<StageAutomationJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    getSharedRedisConnection(); // acquire ref
    this.worker = new Worker<StageAutomationJobData>(
      QUEUE_NAMES.CRM_STAGE_AUTOMATION,
      async (job: Job<StageAutomationJobData>) => this.process(job),
      {
        connection: getRedisConnectionOptions(),
        concurrency: scaleForReplicas(3),
        lockDuration: 30_000,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Stage automation job ${job?.id} failed: ${err.message}`,
      );
    });

    this.logger.log('Stage automation worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    releaseSharedRedisConnection();
  }

  private async process(job: Job<StageAutomationJobData>): Promise<void> {
    const { tenantId, dealId, dealName, newStageId, newStageName } = job.data;

    // Load automations config for the target stage
    const stage = await this.prisma.crmStage.findUnique({
      where: { id: newStageId },
      select: { automations: true },
    });

    if (!stage?.automations) {
      this.logger.debug(`No automations configured for stage ${newStageId}`);
      return;
    }

    const rules = stage.automations as unknown as StageAutomationRule[];
    if (!Array.isArray(rules)) return;

    const enabledRules = rules.filter((r) => r.enabled);
    if (enabledRules.length === 0) return;

    this.logger.log(
      `Executing ${enabledRules.length} automation(s) for deal "${dealName}" -> stage "${newStageName}"`,
    );

    for (const rule of enabledRules) {
      try {
        switch (rule.type) {
          case 'NOTIFY':
            await this.executeNotify(tenantId, dealId, dealName, newStageName, rule.params as NotifyParams);
            break;
          case 'CREATE_TASK':
            await this.executeCreateTask(tenantId, dealId, dealName, newStageName, rule.params as CreateTaskParams);
            break;
          default:
            this.logger.warn(`Unknown automation type: ${rule.type}`);
        }
      } catch (err) {
        this.logger.error(
          `Automation ${rule.type} failed for deal ${dealId}: ${(err as Error).message}`,
        );
        // Continue with other automations — don't let one failure block others
      }
    }
  }

  private async executeNotify(
    tenantId: string,
    dealId: string,
    dealName: string,
    stageName: string,
    params: NotifyParams,
  ): Promise<void> {
    const message = params.message
      ? params.message
          .replace('{dealName}', dealName)
          .replace('{stageName}', stageName)
      : `Deal "${dealName}" entered stage "${stageName}"`;

    // Emit via Socket.IO for real-time notification
    this.realtimeEvents.emitCrmAutomationNotify(tenantId, {
      dealId,
      dealName,
      stageName,
      message,
      timestamp: new Date().toISOString(),
    });

    // Record as activity
    await this.prisma.crmActivity.create({
      data: {
        tenantId,
        dealId,
        type: 'TASK',
        content: `[Automation] ${message}`,
        metadata: { automationType: 'NOTIFY', stageName },
      },
    });

    this.logger.debug(`Notification sent for deal ${dealId}: ${message}`);
  }

  private async executeCreateTask(
    tenantId: string,
    dealId: string,
    dealName: string,
    stageName: string,
    params: CreateTaskParams,
  ): Promise<void> {
    const title = params.taskTitle
      ? params.taskTitle
          .replace('{dealName}', dealName)
          .replace('{stageName}', stageName)
      : `Follow up: ${dealName}`;

    const description = params.taskDescription
      ? params.taskDescription
          .replace('{dealName}', dealName)
          .replace('{stageName}', stageName)
      : `Auto-created when deal entered stage "${stageName}"`;

    // Record as activity on the deal timeline
    await this.prisma.crmActivity.create({
      data: {
        tenantId,
        dealId,
        type: 'TASK',
        content: title,
        metadata: {
          automationType: 'CREATE_TASK',
          stageName,
          description,
        },
      },
    });

    this.logger.debug(`Task created for deal ${dealId}: ${title}`);
  }
}
