import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class CalendarWebhookAuthService implements OnModuleInit {
  private readonly logger = new Logger(CalendarWebhookAuthService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.getGoogleWebhookToken()) {
      this.logger.warn(
        'Google Calendar webhook token is not configured. Set GOOGLE_CALENDAR_WEBHOOK_TOKEN to protect calendar webhook traffic.',
      );
    }
  }

  getGoogleWebhookToken(): string | undefined {
    return (
      this.config.get<string>('GOOGLE_CALENDAR_WEBHOOK_TOKEN') ||
      this.config.get<string>('CALENDAR_WEBHOOK_TOKEN') ||
      this.config.get<string>('EMAIL_SYNC_WEBHOOK_TOKEN') ||
      undefined
    );
  }

  validateGoogleWebhookToken(
    channelToken?: string,
    legacyHeaderToken?: string,
    queryToken?: string,
  ): void {
    const expected = this.getGoogleWebhookToken();
    if (!expected) {
      return;
    }

    const provided = channelToken || legacyHeaderToken || queryToken;
    if (!provided || !this.safeCompare(provided, expected)) {
      throw new UnauthorizedException('Invalid Google Calendar webhook token');
    }
  }

  private safeCompare(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) {
      const paddedProvided = Buffer.alloc(expected.length, provided);
      timingSafeEqual(paddedProvided, Buffer.from(expected));
      return false;
    }

    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }
}
