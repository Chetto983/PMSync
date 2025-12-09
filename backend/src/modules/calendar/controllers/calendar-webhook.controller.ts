import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { GoogleCalendarWebhookService } from '../services/google-calendar-webhook.service';
import { MicrosoftCalendarWebhookService, MicrosoftCalendarNotification } from '../services/microsoft-calendar-webhook.service';
import { SyncAuthService } from '../../email-sync/services/sync-auth.service';

@Controller('webhooks/calendar')
export class CalendarWebhookController {
  private readonly logger = new Logger(CalendarWebhookController.name);

  constructor(
    private readonly googleCalendarWebhook: GoogleCalendarWebhookService,
    private readonly microsoftCalendarWebhook: MicrosoftCalendarWebhookService,
    private readonly syncAuth: SyncAuthService,
  ) {}

  /**
   * Google Calendar Push Notifications endpoint
   * Receives push notifications from Google Calendar API
   */
  @Post('google/push')
  @HttpCode(HttpStatus.OK)
  async handleGoogleCalendarPush(
    @Headers() headers: Record<string, string>,
    @Headers('x-webhook-token') webhookToken?: string,
    @Query('token') queryToken?: string,
  ) {
    try {
      // Validate webhook authentication (token can be in header or query param)
      this.syncAuth.validateWebhookToken(webhookToken, queryToken);

      this.logger.log('Received Google Calendar push notification');

      // Validate Google-specific headers
      const channelId = headers['x-goog-channel-id'];
      const resourceId = headers['x-goog-resource-id'];

      if (!channelId || !resourceId) {
        throw new UnauthorizedException('Missing required Google webhook headers');
      }

      // Process the notification
      await this.googleCalendarWebhook.handleNotification(headers);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Error handling Google Calendar webhook', {
        error: errorMessage,
        stack: errorStack,
        channelId: headers['x-goog-channel-id'],
        resourceId: headers['x-goog-resource-id'],
        resourceState: headers['x-goog-resource-state'],
      });

      // Return 200 anyway to prevent retries for transient errors
      // But throw for authentication errors
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      return { success: false, error: 'Processing failed' };
    }
  }

  /**
   * Microsoft Graph Calendar webhook endpoint
   * Receives notifications from Microsoft Graph API
   * Handles both validation and notifications
   *
   * NOTE: Microsoft Graph uses clientState in notification BODY for validation,
   * not URL tokens. The clientState is validated in MicrosoftCalendarWebhookService
   * @see https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
   */
  @Post('microsoft/notifications')
  @HttpCode(HttpStatus.OK)
  async handleMicrosoftCalendarNotification(
    @Body() payload: { value?: MicrosoftCalendarNotification[] },
    @Query('validationToken') validationToken?: string,
  ) {
    try {
      // Handle subscription validation (initial setup)
      // Microsoft sends validationToken as query param during subscription creation
      if (validationToken) {
        this.logger.log('Microsoft Calendar webhook validation requested');
        // Return the validation token in plain text (required by Microsoft)
        return validationToken;
      }

      // Handle notification
      // clientState validation happens in MicrosoftCalendarWebhookService.handleNotifications()
      this.logger.log(
        `Received Microsoft Calendar notification with ${payload.value?.length || 0} items`,
      );

      if (!payload.value || payload.value.length === 0) {
        this.logger.warn('No notifications in Microsoft Calendar payload');
        return { success: true };
      }

      // Process each notification (includes clientState validation)
      await this.microsoftCalendarWebhook.handleNotifications(payload.value);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Error handling Microsoft Calendar webhook', {
        error: errorMessage,
        stack: errorStack,
        notificationCount: payload.value?.length || 0,
        subscriptionIds: payload.value?.map((n) => n.subscriptionId).filter(Boolean),
      });

      // Return error to Microsoft for retry
      throw error;
    }
  }

  /**
   * Health check endpoint for calendar webhook service
   */
  @Get('health')
  async getWebhookHealth() {
    const googleStats = await this.googleCalendarWebhook.getStats();
    const microsoftStats = await this.microsoftCalendarWebhook.getStats();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      google: googleStats,
      microsoft: microsoftStats,
    };
  }
}
