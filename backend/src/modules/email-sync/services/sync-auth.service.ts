import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SyncAuthService implements OnModuleInit {
  private readonly logger = new Logger(SyncAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.assertTokenConfiguration();
  }

  /**
   * Ensure required tokens are present; warn in dev, optionally fail in strict mode.
   */
  private assertTokenConfiguration(): void {
    const missing: string[] = [];
    const webhookToken = this.configService.get<string>('EMAIL_SYNC_WEBHOOK_TOKEN');
    const workerToken = this.configService.get<string>('EMAIL_SYNC_WORKER_TOKEN');
    const requireTokensRaw = this.configService.get<string>('EMAIL_SYNC_REQUIRE_TOKENS');
    const requireTokens =
      requireTokensRaw === undefined
        ? false
        : requireTokensRaw.toLowerCase() !== 'false';

    if (!webhookToken) {
      missing.push('EMAIL_SYNC_WEBHOOK_TOKEN');
    }
    if (!workerToken) {
      missing.push('EMAIL_SYNC_WORKER_TOKEN');
    }

    if (missing.length === 0) {
      return;
    }

    const message = `Email sync tokens missing: ${missing.join(
      ', ',
    )}. Set these env vars to protect webhook and worker traffic.`;

    if (requireTokens) {
      throw new UnauthorizedException(message);
    }

    this.logger.warn(message);
  }

  validateWebhookToken(tokenFromHeader?: string, tokenFromQuery?: string) {
    const expected = this.configService.get<string>('EMAIL_SYNC_WEBHOOK_TOKEN');
    if (!expected) {
      return;
    }

    const provided = tokenFromHeader || tokenFromQuery;
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid webhook token');
    }
  }

  validateJobToken(tokenFromJob?: string) {
    const expected = this.configService.get<string>('EMAIL_SYNC_WORKER_TOKEN');
    if (!expected) {
      return;
    }

    if (!tokenFromJob || tokenFromJob !== expected) {
      throw new UnauthorizedException('Invalid worker job token');
    }
  }
}
