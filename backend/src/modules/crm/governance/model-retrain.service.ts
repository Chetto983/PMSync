import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
} from '../../../common/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface RetrainJobData {
  tenantId: string;
  modelType: string;
  triggeredBy: 'manual' | 'accuracy_alert' | 'drift_alert';
}

export interface ModelRegistryEntry {
  modelType: string;
  version: string;
  isActive: boolean;
  lastTrained: string;
  accuracy: number | null;
}

@Injectable()
export class ModelRetrainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModelRetrainService.name);
  private queue!: Queue<RetrainJobData>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue<RetrainJobData>(
      QUEUE_NAMES.CRM_MODEL_RETRAIN,
      {
        connection: getRedisConnectionOptions(),
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      },
    );
    this.logger.log('Model retrain queue initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  /**
   * Enqueue a retraining job for a specific model type.
   */
  async triggerRetrain(
    tenantId: string,
    modelType: string,
    triggeredBy: 'manual' | 'accuracy_alert' | 'drift_alert' = 'manual',
  ): Promise<{ jobId: string }> {
    const job = await this.queue.add(
      `retrain-${modelType}`,
      { tenantId, modelType, triggeredBy },
      { jobId: `retrain-${tenantId}-${modelType}-${Date.now()}` },
    );

    this.logger.log(
      `Retrain job enqueued: ${modelType} for tenant ${tenantId} (trigger: ${triggeredBy})`,
    );

    return { jobId: job.id ?? 'unknown' };
  }

  /**
   * Get model registry for a tenant — all models with their status.
   */
  async getModelRegistry(tenantId: string): Promise<ModelRegistryEntry[]> {
    const evaluations = await this.prisma.modelEvaluation.findMany({
      where: { tenantId },
      orderBy: [{ modelType: 'asc' }, { trainedAt: 'desc' }],
      select: {
        modelType: true,
        version: true,
        isActive: true,
        trainedAt: true,
        metrics: true,
      },
    });

    // Deduplicate: keep latest per modelType
    const seen = new Set<string>();
    const result: ModelRegistryEntry[] = [];

    for (const ev of evaluations) {
      if (seen.has(ev.modelType)) continue;
      seen.add(ev.modelType);

      const m = ev.metrics as Record<string, number> | null;
      result.push({
        modelType: ev.modelType,
        version: ev.version,
        isActive: ev.isActive,
        lastTrained: ev.trainedAt.toISOString(),
        accuracy: m?.aucRoc ?? m?.precision ?? null,
      });
    }

    // Add known model types even if no evaluations exist
    const knownTypes = ['lead_scoring', 'churn_prediction', 'forecast'];
    for (const mt of knownTypes) {
      if (!seen.has(mt)) {
        result.push({
          modelType: mt,
          version: 'v0 (rule-based)',
          isActive: true,
          lastTrained: new Date().toISOString(),
          accuracy: null,
        });
      }
    }

    return result;
  }
}
