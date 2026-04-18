import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../../common/config';
import type { StageAutomationJobData } from './types';

@Injectable()
export class StageAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StageAutomationService.name);
  private queue: Queue<StageAutomationJobData> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // D-12: CRM module-level worker toggle. When CRM_WORKERS_ENABLED=false
    // this instance does not create the stage-automation producer queue.
    const crmWorkersEnabled =
      this.configService.get<string>('CRM_WORKERS_ENABLED') || 'true';
    if (crmWorkersEnabled.toLowerCase() === 'false') {
      this.logger.warn(
        'Stage automation queue disabled (CRM_WORKERS_ENABLED=false)',
      );
      return;
    }

    // D-01: use shared producer connection (was `getRedisConnectionOptions()`).
    // D-08/D-09: drop hardcoded `removeOnComplete: 100` / `removeOnFail: 50` in
    // favour of the phase-wide retention mandate — DLQ captures failures.
    this.queue = new Queue<StageAutomationJobData>(
      QUEUE_NAMES.CRM_STAGE_AUTOMATION,
      {
        connection: getSharedRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true, // D-08: immediate removal (was 100)
          removeOnFail: { count: 20 }, // D-09: keep last 20 (was 50)
        },
      },
    );
    this.logger.log('Stage automation queue initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    // D-01: release ref-counted shared connection. Guard handles the
    // CRM_WORKERS_ENABLED=false early-return case (no ref was acquired).
    if (this.queue) {
      releaseSharedRedisConnection();
      this.queue = null;
    }
  }

  async enqueueStageChange(data: StageAutomationJobData): Promise<void> {
    if (data.triggeredByAutomation) {
      this.logger.debug(
        `Skipping automation for deal ${data.dealId} — triggered by automation (loop prevention)`,
      );
      return;
    }

    // D-12: queue is null when CRM_WORKERS_ENABLED=false
    if (!this.queue) {
      this.logger.debug(
        `Stage automation queue unavailable (CRM workers disabled) — skipping deal ${data.dealId}`,
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
