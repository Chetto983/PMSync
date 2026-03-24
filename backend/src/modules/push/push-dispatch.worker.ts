import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PushService } from './push.service';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../common/config';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';
import type { PushDispatchJob } from './push-dispatch.handler';

@Injectable()
export class PushDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDispatchWorker.name);
  private worker!: Worker<PushDispatchJob>;
  private redis!: Redis;

  constructor(private readonly pushService: PushService) {}

  async onModuleInit(): Promise<void> {
    const connection = getRedisConnectionOptions();
    this.redis = getSharedRedisConnection();
    this.worker = new Worker<PushDispatchJob>(
      QUEUE_NAMES.PUSH_DISPATCH,
      async (job: Job<PushDispatchJob>) => this.process(job),
      {
        connection,
        concurrency: 5,
        lockDuration: 30_000,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Push job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    releaseSharedRedisConnection();
  }

  private async process(job: Job<PushDispatchJob>): Promise<void> {
    const { tenantId, userId, emailId, subject, from, threadId, category } =
      job.data;

    // Get all subscriptions for this user (PUSH-04: multi-device)
    const subscriptions = await withoutTenantScopingAsync(() =>
      this.pushService.getSubscriptionsForUser(tenantId, userId),
    );

    if (subscriptions.length === 0) {
      this.logger.debug(`No push subscriptions for user ${userId}`);
      return;
    }

    // Build payload based on job name
    let payload: {
      title: string;
      body: string;
      icon: string;
      badge: string;
      tag?: string;
      renotify: boolean;
      data: { url: string };
    };

    if (job.name === 'push-email-grouped' && threadId) {
      // PUSH-07: Grouped notification -- count emails in thread window
      const dedupKey = `push:thread:${tenantId}:${userId}:${threadId}`;
      const countStr = await this.redis.get(dedupKey);
      const count = parseInt(countStr || '1', 10);

      const truncatedSubject =
        subject.length > 120 ? subject.substring(0, 117) + '...' : subject;

      payload = {
        title: `${count} new emails in "${truncatedSubject}"`,
        body: `from ${from}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: threadId,
        renotify: true,
        data: { url: `/mail/${emailId}` },
      };

      // Clean up Redis key after sending
      await this.redis.del(dedupKey);
    } else {
      // Single email notification
      const senderName = from.includes('<')
        ? from.split('<')[0].trim()
        : from;
      const truncatedSubject =
        subject.length > 120 ? subject.substring(0, 117) + '...' : subject;

      payload = {
        title: `New email from ${senderName}`,
        body: truncatedSubject,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: threadId || emailId,
        renotify: true,
        data: { url: `/mail/${emailId}` },
      };
    }

    const payloadStr = JSON.stringify(payload);

    // Fan out to all subscriptions (PUSH-04: multi-device delivery)
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await this.pushService.sendNotification(
            {
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
            payloadStr,
          );
        } catch (error: unknown) {
          const statusCode = (error as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            // PUSH-03: Stale subscription cleanup
            this.logger.log(
              `Deleting stale subscription ${sub.endpoint} (${statusCode})`,
            );
            await withoutTenantScopingAsync(() =>
              this.pushService.deleteStaleSubscription(sub.id, tenantId),
            );
          } else {
            throw error; // Let BullMQ retry
          }
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length}/${subscriptions.length} push sends failed for user ${userId}`,
      );
    }
  }
}
