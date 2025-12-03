import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  Query,
  Get,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { GmailWebhookService } from '../services/gmail-webhook.service';
import { MicrosoftWebhookService } from '../services/microsoft-webhook.service';
import {
  GmailPubSubMessage,
  MicrosoftGraphWebhookPayload,
} from '../interfaces/webhook.interface';
import { SyncAuthService } from '../services/sync-auth.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private gmailWebhook: GmailWebhookService,
    private microsoftWebhook: MicrosoftWebhookService,
    private readonly syncAuth: SyncAuthService,
  ) {}

  /**
   * Gmail Pub/Sub webhook endpoint
   * Receives push notifications from Google Cloud Pub/Sub
   */
  @Post('gmail/push')
  @HttpCode(HttpStatus.OK)
  async handleGmailPush(
    @Body() payload: GmailPubSubMessage,
    @Query('token') queryToken?: string,
    @Headers('x-webhook-token') webhookToken?: string,
  ) {
    try {
      this.logger.debug('[WEBHOOK] Gmail push received, validating token...');
      this.syncAuth.validateWebhookToken(webhookToken, queryToken);
      this.logger.log('[WEBHOOK] Token validated, received Gmail Pub/Sub notification');

      this.logger.debug('[WEBHOOK] Payload:', JSON.stringify(payload).substring(0, 200));

      // Decode and process the message
      await this.gmailWebhook.handleNotification(payload);

      this.logger.log('[WEBHOOK] Gmail notification processed successfully');
      return { success: true };
    } catch (error) {
      this.logger.error('[WEBHOOK] Error handling Gmail webhook:', error);
      this.logger.error('[WEBHOOK] Error stack:', error instanceof Error ? error.stack : 'No stack');
      // Return 200 anyway to prevent Pub/Sub retries
      return { success: false, error: 'Processing failed' };
    }
  }

  /**
   * Microsoft Graph webhook endpoint
   * Receives notifications from Microsoft Graph API
   * Handles both validation and notifications
   */
  @Post('microsoft/notifications')
  @HttpCode(HttpStatus.OK)
  async handleMicrosoftNotification(
    @Body() payload: MicrosoftGraphWebhookPayload,
    @Query('validationToken') validationToken?: string,
    @Query('token') token?: string,
    @Headers('x-webhook-token') webhookToken?: string,
  ) {
    try {
      // Handle subscription validation (initial setup)
      if (validationToken) {
      this.logger.log('Microsoft webhook validation requested');
      // Optionally validate webhook token if configured
      this.syncAuth.validateWebhookToken(webhookToken, token);
      // Return the validation token in plain text
      return validationToken;
    }
    this.syncAuth.validateWebhookToken(webhookToken, token);

      // Handle notification
      this.logger.log(
        `Received Microsoft Graph notification with ${payload.value?.length || 0} items`,
      );

      if (!payload.value || payload.value.length === 0) {
        throw new BadRequestException('No notifications in payload');
      }

      // Process each notification
      await this.microsoftWebhook.handleNotifications(payload.value);

      return { success: true };
    } catch (error) {
      this.logger.error('Error handling Microsoft webhook:', error);
      // Return error to Microsoft for retry
      throw error;
    }
  }

  /**
   * Health check endpoint for webhook service
   */
  @Get('health')
  async getWebhookHealth() {
    const gmailStats = await this.gmailWebhook.getStats();
    const microsoftStats = await this.microsoftWebhook.getStats();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      gmail: gmailStats,
      microsoft: microsoftStats,
    };
  }
}
