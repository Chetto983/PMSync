import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(
    tenantId: string,
    userId: string,
    dto: CreatePushSubscriptionDto,
    userAgent?: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: {
        tenantId_endpoint: { tenantId, endpoint: dto.endpoint },
      },
      update: {
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userId,
        userAgent,
      },
      create: {
        tenantId,
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent,
      },
    });
  }

  async unsubscribe(tenantId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { tenantId, endpoint },
    });
  }
}
