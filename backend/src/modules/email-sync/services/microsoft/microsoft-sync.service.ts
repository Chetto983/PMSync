import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProviderTokenService } from '../provider-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { MicrosoftDriver } from '../../drivers/microsoft/microsoft.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { MicrosoftAttachmentHandler } from './microsoft-attachment-handler';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { SyncOrchestrationService } from '../sync-orchestration.service';
import { SyncMessageProcessorService } from '../sync-message-processor.service';
import { SyncTokenService } from '../sync-token.service';

/**
 * MicrosoftSyncService - Driver-based implementation
 *
 * This service uses the MicrosoftDriver abstraction for all Microsoft Graph operations.
 * DC-2,3,4 consolidation: syncProvider, syncFullWithDriver, syncIncrementalWithDriver
 * now inherited from BaseEmailSyncService (saves ~270 lines)
 * DC-6 consolidation: Attachment processing delegated to MicrosoftAttachmentHandler
 *
 * Microsoft Graph API Best Practices (2025):
 * - Rate limit: 10,000 requests/10 min per app (Sept 2025 reduction)
 * - Delta query for incremental sync (deltaLink tokens)
 * - Batch requests: Max 20 per batch
 * - Handle 429 with Retry-After header (RedisCircuitBreakerService)
 * - Handle 410 Gone for expired delta tokens
 */
@Injectable()
export class MicrosoftSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(MicrosoftSyncService.name);

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private providerTokenService: ProviderTokenService,
    private driverFactory: EmailDriverFactory,
    private microsoftAttachmentHandler: MicrosoftAttachmentHandler,
    // RACE CONDITION FIX RC-5: Redis lock for attachment processing
    private redisLockService: RedisLockService,
    // Phase 6: Extracted services
    syncOrchestration: SyncOrchestrationService,
    messageProcessor: SyncMessageProcessorService,
    tokenService: SyncTokenService,
    // Phase 32: EventEmitter2 for domain events
    eventEmitter: EventEmitter2,
  ) {
    super(
      prisma,
      realtimeEvents,
      config,
      syncOrchestration,
      messageProcessor,
      tokenService,
    );
    // Inject Redis lock service into base class for email upsert locking
    this.setRedisLockService(redisLockService);
    // Inject Redis lock service into attachment handler for attachment processing locking
    this.microsoftAttachmentHandler.setRedisLockService(redisLockService);
    // Phase 32: Set EventEmitter2 for domain events
    this.setEventEmitter(eventEmitter);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Microsoft-specific configuration overrides
    this.batchSize = this.config.get<number>('MS_BATCH_FETCH_SIZE', 20);
    this.fullSyncMaxMessages = this.config.get<number>('MS_FULL_MAX_MESSAGES', 200);
  }

  // ============================================
  // Abstract Method Implementations (Required)
  // ============================================

  /**
   * Provide the embedding queue service to the base class
   */
  protected getEmbeddingQueue(): EmailEmbeddingQueueService {
    return this.emailEmbeddingQueue;
  }

  /**
   * Get driver credentials for Microsoft OAuth2
   * DC-4 consolidation: Provider-specific credential fetching
   */
  // P0-5 FIX: Added tenantId for tenant isolation enforcement
  protected async getDriverCredentials(providerId: string, tenantId?: string): Promise<{
    provider: any;
    credentials: any;
    driverType: 'google' | 'microsoft' | 'imap';
  }> {
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(providerId, tenantId);
    return {
      provider,
      credentials: {
        type: 'oauth2',
        accessToken,
        emailHint: provider.email,
      },
      driverType: 'microsoft',
    };
  }

  /**
   * Create and connect Microsoft driver
   */
  protected async createDriver(driverType: string, credentials: any): Promise<IEmailDriver> {
    return this.driverFactory.createConnectedDriver(driverType as any, credentials);
  }

  /**
   * Process attachments for Microsoft messages
   * Implements the abstract method from BaseEmailSyncService
   * DC-6 consolidation: Delegates to MicrosoftAttachmentHandler
   */
  protected async processAttachmentsForMessage(
    driver: IEmailDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    // Cast to MicrosoftDriver and delegate to handler
    const msDriver = driver as MicrosoftDriver;
    await this.microsoftAttachmentHandler.processMicrosoftAttachments(
      msDriver,
      emailId,
      externalMessageId,
      attachments,
      tenantId,
      providerId,
    );
  }

  // ============================================
  // Provider-Specific Hooks (Override)
  // ============================================

  /**
   * Microsoft-specific incremental sync processing
   * Detects delta token expiration (410/400 errors cause token change)
   * DC-3 consolidation: Preserves special Microsoft delta token handling
   */
  protected override onIncrementalChanges(
    changesResult: { changes: Array<{ type: string; messageId: string }>; newSyncToken: string },
    lastSyncToken: string,
  ): { skipProcessing: boolean; logMessage?: string } {
    // Detect delta token expiration
    // If sync token changed significantly but no changes returned, token may have expired
    const tokenChanged = changesResult.newSyncToken !== lastSyncToken;
    const tokenChangedSignificantly = tokenChanged &&
      !changesResult.newSyncToken.includes(lastSyncToken.substring(0, 20));

    if (changesResult.changes.length === 0) {
      if (tokenChangedSignificantly) {
        return {
          skipProcessing: true,
          logMessage:
            'Delta token appears to have expired (token changed but no changes returned). ' +
            'Consider triggering a full sync on next scheduled interval.',
        };
      }
      return { skipProcessing: true, logMessage: 'No changes detected' };
    }

    return { skipProcessing: false };
  }

  // syncProvider(), syncFullWithDriver(), syncIncrementalWithDriver()
  // are now inherited from BaseEmailSyncService (DC-2,3,4 consolidation)
  // handleMessageDeletion is now inherited from BaseEmailSyncService
}
