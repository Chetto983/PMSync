import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  getRedisConnectionOptions,
  QUEUE_NAMES,
  scaleForReplicas,
} from '../../../../common/config/queue.config';

/** Job data for SLA escalation */
interface SlaEscalationJobData {
  ticketId: string;
  tenantId: string;
  slaPolicyId: string;
}

const QUEUE_NAME = 'sla-escalation';

/**
 * SLA Timer Service
 *
 * On ticket creation, schedules a BullMQ delayed job based on the matching
 * SLAPolicy's resolutionTimeMinutes. When the job fires, it re-reads the
 * ticket and escalates if the SLA deadline is still exceeded.
 *
 * Escalation: bumps priority one level (low→medium, medium→high, high→urgent).
 */
@Injectable()
export class SlaTimerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaTimerService.name);
  private queue: Queue<SlaEscalationJobData>;
  private worker: Worker<SlaEscalationJobData>;
  private redisConnection: Redis;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.queue = new Queue<SlaEscalationJobData>(QUEUE_NAME, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    });

    this.worker = new Worker<SlaEscalationJobData>(
      QUEUE_NAME,
      (job) => this.processEscalation(job),
      {
        connection: new Redis(redisOptions),
        concurrency: scaleForReplicas(5),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `SLA escalation job ${job?.id} failed: ${err.message}`,
      );
    });

    this.logger.log('SLA timer service initialized');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    if (
      this.redisConnection &&
      this.redisConnection.status !== 'end' &&
      this.redisConnection.status !== 'close'
    ) {
      await this.redisConnection.quit();
    }
  }

  /**
   * Schedule SLA timer for a newly created ticket.
   * Looks up the SLAPolicy for the ticket's priority, calculates deadline,
   * and schedules a delayed job.
   */
  async scheduleForTicket(
    ticketId: string,
    tenantId: string,
    priority: string,
  ): Promise<{ slaPolicyId: string; slaDeadline: Date } | null> {
    const policy = await this.prisma.slaPolicy.findUnique({
      where: { tenantId_priority: { tenantId, priority } },
    });

    if (!policy) {
      this.logger.debug(
        `No SLA policy for priority="${priority}" in tenant ${tenantId}`,
      );
      return null;
    }

    const delayMs = policy.resolutionTimeMinutes * 60 * 1000;
    const slaDeadline = new Date(Date.now() + delayMs);

    // Remove any existing SLA job for this ticket (e.g. priority changed)
    await this.cancelForTicket(ticketId);

    await this.queue.add(
      'sla-check',
      { ticketId, tenantId, slaPolicyId: policy.id },
      {
        delay: delayMs,
        jobId: `sla-${ticketId}`,
      },
    );

    this.logger.log(
      `SLA timer set for ticket ${ticketId}: ${policy.resolutionTimeMinutes}min (deadline: ${slaDeadline.toISOString()})`,
    );

    return { slaPolicyId: policy.id, slaDeadline };
  }

  /**
   * Cancel SLA timer for a ticket (e.g. ticket resolved/closed).
   */
  async cancelForTicket(ticketId: string): Promise<void> {
    const jobId = `sla-${ticketId}`;
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.debug(`SLA timer cancelled for ticket ${ticketId}`);
    }
  }

  /**
   * Process SLA escalation: re-read ticket, check if SLA is still breached,
   * then escalate priority one level.
   */
  private async processEscalation(
    job: Job<SlaEscalationJobData>,
  ): Promise<void> {
    const { ticketId, tenantId } = job.data;

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) {
      this.logger.warn(`SLA escalation: ticket ${ticketId} not found, skipping`);
      return;
    }

    // Don't escalate if already resolved or closed
    if (['resolved', 'closed'].includes(ticket.status)) {
      this.logger.debug(
        `SLA escalation: ticket ${ticketId} is ${ticket.status}, skipping`,
      );
      return;
    }

    // Verify the SLA deadline is actually exceeded
    if (ticket.slaDeadline && new Date(ticket.slaDeadline) > new Date()) {
      this.logger.debug(
        `SLA escalation: ticket ${ticketId} deadline not yet reached, skipping`,
      );
      return;
    }

    const escalationMap: Record<string, string> = {
      low: 'medium',
      medium: 'high',
      high: 'urgent',
    };

    const newPriority = escalationMap[ticket.priority];
    if (!newPriority) {
      this.logger.debug(
        `SLA escalation: ticket ${ticketId} already at max priority (${ticket.priority})`,
      );
      return;
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { priority: newPriority },
    });

    this.logger.warn(
      `SLA ESCALATION: ticket ${ticketId} priority ${ticket.priority} → ${newPriority}`,
    );

    // Schedule next escalation at the new priority level
    await this.scheduleForTicket(ticketId, tenantId, newPriority);
  }
}
