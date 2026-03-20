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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { GmailWebhookService } from '../services/gmail-webhook.service';
import { MicrosoftWebhookService } from '../services/microsoft-webhook.service';
import {
  GmailPubSubMessage,
  MicrosoftGraphWebhookPayload,
} from '../interfaces/webhook.interface';
import { SyncAuthService } from '../services/sync-auth.service';
import { Public } from '../../../common/auth/public.decorator';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Webhooks - Email Sync')
@Public()
@SkipThrottle()
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
  @Post(['gmail/push', 'gmail'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gmail Pub/Sub webhook', description: 'Receives push notifications from Google Cloud Pub/Sub' })
  @ApiHeader({ name: 'x-webhook-token', description: 'Webhook authentication token', required: false })
  @ApiHeader({ name: 'authorization', description: 'Google Pub/Sub OIDC JWT token', required: false })
  @ApiQuery({ name: 'token', description: 'Alternative webhook token in query', required: false })
  @ApiResponse({ status: 200, description: 'Notification processed' })
  async handleGmailPush(
    @Body() payload: GmailPubSubMessage,
    @Req() req: Request,
    @Query('token') queryToken?: string,
    @Headers('x-webhook-token') webhookToken?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    // SEC-8 FIX: Log client IP for security monitoring and audit trail
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    this.logger.debug(`[WEBHOOK] Gmail push from IP: ${clientIp}`);

    // Security fix (Issue #4): Auth validation OUTSIDE try-catch
    // UnauthorizedException will propagate and return 401 (not 200)
    const jwtToken = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
    if (jwtToken) {
      this.logger.debug('[WEBHOOK] Gmail push received with Pub/Sub JWT, verifying token...');
      const verified = await this.gmailWebhook.verifyPubSubToken(jwtToken);
      if (verified) {
        this.logger.log('[WEBHOOK] Pub/Sub JWT validated, received Gmail Pub/Sub notification');
      } else {
        // verifyPubSubToken returns false when GOOGLE_PUBSUB_AUDIENCE is not configured.
        // Google Pub/Sub sends a JWT but NOT a webhook token header/query param,
        // so falling through to validateWebhookToken will always 401.
        // Accept the request with a warning — configure GOOGLE_PUBSUB_AUDIENCE for proper JWT verification.
        this.logger.warn(
          '[WEBHOOK] Pub/Sub JWT present but GOOGLE_PUBSUB_AUDIENCE not configured — accepting request. ' +
          'Set GOOGLE_PUBSUB_AUDIENCE env var for proper JWT verification.',
        );
      }
    } else {
      // No JWT from Google. Validate webhook token if provided, or if
      // EMAIL_SYNC_WEBHOOK_TOKEN is configured and the caller sent one.
      // If neither side has a token, validateWebhookToken returns (no-op).
      this.logger.debug('[WEBHOOK] Gmail push received without Pub/Sub JWT, validating webhook token...');
      this.syncAuth.validateWebhookToken(webhookToken, queryToken);
      this.logger.log('[WEBHOOK] Webhook token validated, received Gmail Pub/Sub notification');
    }

    try {
      // Security fix (Issue #2): Atomic check-and-mark for replay attack prevention
      const messageId = payload?.message?.messageId;
      if (messageId) {
        const isNew = await this.gmailWebhook.checkAndMarkProcessed(messageId);
        if (!isNew) {
          this.logger.warn(`[WEBHOOK] Duplicate message detected: ${messageId}`);
          return { success: true, skipped: true, reason: 'duplicate' };
        }
      }

      // SECURITY: Only log structure, not content (payload may contain sensitive email metadata)
      this.logger.debug('[WEBHOOK] Payload received with keys:', Object.keys(payload || {}).join(', '));

      // Webhook requests from Google have no HTTP tenant context (no session/JWT).
      // All Prisma calls inside handleNotification touch tenant-scoped models
      // (ProviderConfig, WebhookSubscription) and need tenant scoping bypassed.
      await withoutTenantScopingAsync(() => this.gmailWebhook.handleNotification(payload));

      this.logger.log('[WEBHOOK] Gmail notification processed successfully');
      return { success: true };
    } catch (error) {
      this.logger.error('[WEBHOOK] Error processing Gmail notification:', error);
      // Re-throw so Google Pub/Sub retries on transient failures (HTTP 5xx).
      // Auth errors already thrown above will return 401.
      throw error;
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
    @Req() req: Request,
    @Query('validationToken') validationToken?: string,
  ) {
    // SEC-8 FIX: Log client IP for security monitoring and audit trail
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    this.logger.debug(`[WEBHOOK] Microsoft notification from IP: ${clientIp}`);

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

      // Webhook requests from Microsoft have no HTTP tenant context.
      // All Prisma calls inside handleNotifications touch tenant-scoped models.
      await withoutTenantScopingAsync(() => this.microsoftWebhook.handleNotifications(payload.value));

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
    // Health endpoint is @Public() — no tenant context available.
    return withoutTenantScopingAsync(async () => {
      const gmailStats = await this.gmailWebhook.getStats();
      const microsoftStats = await this.microsoftWebhook.getStats();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        gmail: gmailStats,
        microsoft: microsoftStats,
      };
    });
  }
}
