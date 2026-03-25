import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
} from '../../../common/config';
import type { StageAutomationJobData } from './types';

@Injectable()
export class StageAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StageAutomationService.name);
  private queue!: Queue<StageAutomationJobData>;

  async onModuleInit(): Promise<void> {
    this.queue = new Queue<StageAutomationJobData>(
      QUEUE_NAMES.CRM_STAGE_AUTOMATION,
      {
        connection: getRedisConnectionOptions(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );
    this.logger.log('Stage automation queue initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueueStageChange(data: StageAutomationJobData): Promise<void> {
    if (data.triggeredByAutomation) {
      this.logger.debug(
        `Skipping automation for deal ${data.dealId} — triggered by automation (loop prevention)`,
      );
      return;
    }

    await this.queue.add('stage-changed', data, {
      priority: 5,
    });

    this.logger.debug(
      `Enqueued stage automation for deal ${data.dealId} -> stage ${data.newStageName}`,
    );
  }
}
