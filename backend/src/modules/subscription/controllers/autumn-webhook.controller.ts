/**
 * AutumnWebhookController - Webhook receiver with Svix signature verification
 *
 * Accepts POST /webhooks/autumn from Autumn billing (via Svix).
 * Verifies webhook signature using raw body, delegates to AutumnWebhookService.
 *
 * Route excluded from:
 * - Global prefix (main.ts: webhooks/{*path})
 * - CSRF middleware (csrf.middleware.ts: /webhooks)
 * - Auth guard (@Public decorator)
 */

import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Webhook } from 'svix';
import { Public } from '../../../common/auth/public.decorator';
import { AutumnWebhookService } from '../services/autumn-webhook.service';
import { AutumnWebhookPayload } from '../dto/subscription.dto';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks/autumn')
export class AutumnWebhookController {
  private readonly logger = new Logger(AutumnWebhookController.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly webhookService: AutumnWebhookService,
    configService: ConfigService,
  ) {
    this.webhookSecret = configService.get<string>('AUTUMN_WEBHOOK_SECRET');
    if (!this.webhookSecret) {
      this.logger.warn(
        'AUTUMN_WEBHOOK_SECRET not configured -- webhook verification disabled',
      );
    }
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ): Promise<{ received: true }> {
    // Raw body is stashed by the verify callback in main.ts
    const rawBody = (req as any).rawBody?.toString() ?? '';

    if (this.webhookSecret) {
      try {
        const wh = new Webhook(this.webhookSecret);
        wh.verify(rawBody, {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        });
      } catch (err) {
        this.logger.warn(
          `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const payload = JSON.parse(rawBody) as AutumnWebhookPayload;
    await this.webhookService.processEvent(svixId, payload);
    return { received: true };
  }
}
