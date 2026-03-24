import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';

@Injectable()
export class PushService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY', '');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY', '');
    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        'mailto:admin@pmsync.local',
        publicKey,
        privateKey,
      );
    }
  }

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

  async getSubscriptionsForUser(tenantId: string, userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { tenantId, userId },
    });
  }

  async deleteStaleSubscription(
    id: string,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { id, tenantId },
    });
  }

  async sendNotification(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<webpush.SendResult> {
    return webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
    );
  }

  async getUserPushPreferences(
    tenantId: string,
    userId: string,
  ) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: {
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      },
    });
    return (
      prefs ?? {
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      }
    );
  }
}
