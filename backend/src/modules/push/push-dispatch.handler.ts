import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { EmailIndexedEvent } from '../../common/events/email.events';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from './push.service';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
  getDefaultJobOptions,
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../common/config';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';

export interface PushDispatchJob {
  tenantId: string;
  userId: string;
  emailId: string;
  subject: string;
  from: string;
  threadId: string | null;
  category: 'email' | 'calendar' | 'ai';
}

@Injectable()
export class PushDispatchHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDispatchHandler.name);
  private queue!: Queue<PushDispatchJob>;
  private redis!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = getRedisConnectionOptions();
    this.queue = new Queue<PushDispatchJob>(QUEUE_NAMES.PUSH_DISPATCH, {
      connection,
      defaultJobOptions: getDefaultJobOptions('HIGH'),
    });
    this.redis = getSharedRedisConnection();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    releaseSharedRedisConnection();
  }

  @OnEvent(EmailIndexedEvent.eventName)
  async handleEmailIndexed(event: EmailIndexedEvent): Promise<void> {
    try {
      // Look up userId from providerId (event doesn't carry userId)
      const result = await withoutTenantScopingAsync(() =>
        this.prisma.providerConfig.findUnique({
          where: { id: event.providerId },
          select: { userId: true },
        }),
      );

      if (!result?.userId) {
        this.logger.warn(
          `No userId for provider ${event.providerId}, skipping push`,
        );
        return;
      }

      const userId = result.userId;

      // Check user push preferences
      const prefs = await withoutTenantScopingAsync(() =>
        this.pushService.getUserPushPreferences(event.tenantId, userId),
      );

      if (!prefs.pushEmailEnabled) {
        return;
      }

      // Look up threadId for grouping
      const email = await withoutTenantScopingAsync(() =>
        this.prisma.email.findFirst({
          where: { id: event.emailId, tenantId: event.tenantId },
          select: { threadId: true },
        }),
      );

      // Thread grouping via Redis TTL (PUSH-07)
      const threadId = email?.threadId;
      if (threadId) {
        const dedupKey = `push:thread:${event.tenantId}:${userId}:${threadId}`;
        const count = await this.redis.incr(dedupKey);
        if (count === 1) {
          // First email in thread window -- set TTL and schedule delayed job
          await this.redis.expire(dedupKey, 60);
          await this.queue.add(
            'push-email-grouped',
            {
              tenantId: event.tenantId,
              userId,
              emailId: event.emailId,
              subject: event.subject,
              from: event.from,
              threadId,
              category: 'email',
            },
            {
              delay: 60_000, // 60-second grouping window
              jobId: dedupKey.replaceAll(':', '_'), // BullMQ forbids : in custom job IDs
            },
          );
        }
        // count > 1 means another email in same thread within window -- skip
        return;
      }

      // No threadId -- send immediately
      await this.queue.add('push-email', {
        tenantId: event.tenantId,
        userId,
        emailId: event.emailId,
        subject: event.subject,
        from: event.from,
        threadId: null,
        category: 'email',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to enqueue push for email ${event.emailId}: ${message}`,
      );
    }
  }
}
