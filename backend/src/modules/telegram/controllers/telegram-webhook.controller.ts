import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import { TelegramBotService } from '../services/telegram-bot.service';
import { TelegramWebhookService } from '../services/telegram-webhook.service';

/**
 * Receives Telegram webhook POSTs. Public endpoint — validated via secret token header.
 * Rate limited to 60 req/min to mitigate abuse on the public endpoint.
 */
@ApiExcludeController()
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('telegram/webhook')
export class TelegramWebhookController {
  constructor(
    private readonly webhookService: TelegramWebhookService,
    private readonly botService: TelegramBotService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: boolean }> {
    const expectedSecret = this.botService.getWebhookSecret();
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    await this.webhookService.handleUpdate(body as Record<string, unknown>);
    return { ok: true };
  }
}
