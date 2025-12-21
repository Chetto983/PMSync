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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiHeader, ApiBody } from '@nestjs/swagger';
import { GmailWebhookService } from '../services/gmail-webhook.service';
import { MicrosoftWebhookService } from '../services/microsoft-webhook.service';
import {
  GmailPubSubMessage,
  MicrosoftGraphWebhookPayload,
} from '../interfaces/webhook.interface';
import { SyncAuthService } from '../services/sync-auth.service';

@ApiTags('Webhooks - Email Sync')
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
  @ApiOperation({ summary: 'Gmail Pub/Sub webhook', description: 'Receives push notifications from Google Cloud Pub/Sub' })
  @ApiHeader({ name: 'x-webhook-token', description: 'Webhook authentication token', required: false })
  @ApiQuery({ name: 'token', description: 'Alternative webhook token in query', required: false })
  @ApiResponse({ status: 200, description: 'Notification processed' })
  async handleGmailPush(
    @Body() payload: GmailPubSubMessage,
    @Query('token') queryToken?: string,
    @Headers('x-webhook-token') webhookToken?: string,
  ) {
    // Security fix (Issue #4): Auth validation OUTSIDE try-catch
    // UnauthorizedException will propagate and return 401 (not 200)
    this.logger.debug('[WEBHOOK] Gmail push received, validating token...');
    this.syncAuth.validateWebhookToken(webhookToken, queryToken);
    this.logger.log('[WEBHOOK] Token validated, received Gmail Pub/Sub notification');

    try {

      // SECURITY: Only log structure, not content (payload may contain sensitive email metadata)
      this.logger.debug('[WEBHOOK] Payload received with keys:', Object.keys(payload || {}).join(', '));

      // Decode and process the message
      await this.gmailWebhook.handleNotification(payload);

      this.logger.log('[WEBHOOK] Gmail notification processed successfully');
      return { success: true };
    } catch (error) {
      this.logger.error('[WEBHOOK] Error processing Gmail notification:', error);
      // Processing errors return 200 to prevent Pub/Sub retries (intentional)
      // Auth errors already thrown above will return 401
      return { success: false, error: 'Processing failed' };
    }
  }

  /**
   * Microsoft Graph webhook endpoint
   * Receives notifications from Microsoft Graph API
   * Handles both validation and notifications
   *
   * NOTE: Microsoft Graph uses clientState in the notification BODY for validation,
   * not URL tokens like Google Pub/Sub. The clientState is validated in
   * MicrosoftWebhookService.handleSingleNotification()
   * @see https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
   */
  @Post('microsoft/notifications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Microsoft Graph webhook', description: 'Receives notifications from Microsoft Graph API' })
  @ApiQuery({ name: 'validationToken', description: 'Microsoft subscription validation token', required: false })
  @ApiResponse({ status: 200, description: 'Notification processed or validation token returned' })
  async handleMicrosoftNotification(
    @Body() payload: MicrosoftGraphWebhookPayload,
    @Query('validationToken') validationToken?: string,
  ) {
    try {
      // Microsoft sends validationToken as query param during subscription creation
      if (validationToken) {
        this.logger.log('Microsoft webhook validation requested');
        // Return the validation token in plain text (required by Microsoft)
        return validationToken;
      }

      // Handle notification
      // clientState validation happens in MicrosoftWebhookService.handleSingleNotification()
      this.logger.log(
        `Received Microsoft Graph notification with ${payload.value?.length || 0} items`,
      );

      if (!payload.value || payload.value.length === 0) {
        throw new BadRequestException('No notifications in payload');
      }

      // Process each notification (includes clientState validation)
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
