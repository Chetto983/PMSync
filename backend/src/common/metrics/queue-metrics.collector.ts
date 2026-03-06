/**
 * QueueMetricsCollector - Scheduled BullMQ gauge collector.
 *
 * Phase 46-02: Polls QueueHealthService every 15s and updates the
 * bullmq_queue_depth Prometheus gauge with waiting/active/delayed/failed
 * counts per queue.
 *
 * QueueHealthService is @Optional() to avoid circular module dependencies.
 * At runtime it is always available because HealthModule is imported in AppModule.
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { QueueHealthService } from '../services/queue-health.service';

const COLLECT_INTERVAL_MS = 15_000;

@Injectable()
export class QueueMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsCollector.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectMetric('bullmq_queue_depth') private readonly queueDepth: Gauge,
    @Optional() private readonly queueHealthService?: QueueHealthService,
  ) {}

  onModuleInit(): void {
    if (!this.queueHealthService) {
      this.logger.warn(
        'QueueHealthService not available -- queue depth collection disabled',
      );
      return;
    }

    this.logger.log(
      `Starting queue depth collection every ${COLLECT_INTERVAL_MS / 1000}s`,
    );
    this.intervalHandle = setInterval(() => this.collect(), COLLECT_INTERVAL_MS);

    // Fire an initial collection immediately (fire-and-forget)
    void this.collect();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async collect(): Promise<void> {
    try {
      const statuses = await this.queueHealthService!.getQueueStatuses();
      for (const s of statuses) {
        this.queueDepth.set({ queue: s.name, state: 'waiting' }, s.waiting);
        this.queueDepth.set({ queue: s.name, state: 'active' }, s.active);
        this.queueDepth.set({ queue: s.name, state: 'delayed' }, s.delayed);
        this.queueDepth.set({ queue: s.name, state: 'failed' }, s.failed);
      }
    } catch (err) {
      this.logger.warn(`Queue depth collection failed: ${err}`);
    }
  }
}
