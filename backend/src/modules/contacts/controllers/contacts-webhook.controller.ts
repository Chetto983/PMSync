import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { GoogleContactsWebhookService } from '../services/google-contacts-webhook.service';
import {
  MicrosoftContactsWebhookService,
  MicrosoftContactsNotification,
} from '../services/microsoft-contacts-webhook.service';
import { SyncAuthService } from '../../email-sync/services/sync-auth.service';

@Controller('webhooks/contacts')
export class ContactsWebhookController {
  private readonly logger = new Logger(ContactsWebhookController.name);

  constructor(
    private readonly googleContactsWebhook: GoogleContactsWebhookService,
    private readonly microsoftContactsWebhook: MicrosoftContactsWebhookService,
    private readonly syncAuth: SyncAuthService,
  ) {}

  /**
   * Google Contacts sync trigger endpoint
   * Note: Google People API doesn't support push notifications,
   * so this is a manual trigger endpoint
   */
  @Post('google/sync')
  @HttpCode(HttpStatus.OK)
  async triggerGoogleContactsSync(
    @Body() body: { providerId: string },
    @Headers('x-webhook-token') webhookToken?: string,
  ) {
    try {
      // Validate webhook authentication
      this.syncAuth.validateWebhookToken(webhookToken);

      this.logger.log(`Manual Google Contacts sync triggered for provider ${body.providerId}`);

      if (!body.providerId) {
        throw new UnauthorizedException('Missing providerId in request body');
      }

      await this.googleContactsWebhook.handleNotification(body.providerId);

      return { success: true };
    } catch (error) {
      this.logger.error('Error handling Google Contacts sync:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      return { success: false, error: 'Processing failed' };
    }
  }

  /**
   * Microsoft Graph Contacts webhook endpoint
   * Receives notifications from Microsoft Graph API
   * Handles both validation and notifications
   *
   * NOTE: Microsoft Graph uses clientState in notification BODY for validation,
   * not URL tokens. The clientState is validated in MicrosoftContactsWebhookService
   * @see https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
   */
  @Post('microsoft/notifications')
  @HttpCode(HttpStatus.OK)
  async handleMicrosoftContactsNotification(
    @Body() payload: { value?: MicrosoftContactsNotification[] },
    @Query('validationToken') validationToken?: string,
  ) {
    try {
      // Handle subscription validation (initial setup)
      // Microsoft sends validationToken as query param during subscription creation
      if (validationToken) {
        this.logger.log('Microsoft Contacts webhook validation requested');
        // Return the validation token in plain text (required by Microsoft)
        return validationToken;
      }

      // Handle notification
      // clientState validation happens in MicrosoftContactsWebhookService.handleNotifications()
      this.logger.log(
        `Received Microsoft Contacts notification with ${payload.value?.length || 0} items`,
      );

      if (!payload.value || payload.value.length === 0) {
        this.logger.warn('No notifications in Microsoft Contacts payload');
        return { success: true };
      }

      // Process each notification (includes clientState validation)
      await this.microsoftContactsWebhook.handleNotifications(payload.value);

      return { success: true };
    } catch (error) {
      this.logger.error('Error handling Microsoft Contacts webhook:', error);
      // Return error to Microsoft for retry
      throw error;
    }
  }

  /**
   * Health check endpoint for contacts webhook service
   */
  @Get('health')
  async getWebhookHealth() {
    const googleStats = await this.googleContactsWebhook.getStats();
    const microsoftStats = await this.microsoftContactsWebhook.getStats();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      google: googleStats,
      microsoft: microsoftStats,
    };
  }
}
