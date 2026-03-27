import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProviderTokenService } from '../provider-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { SyncJobData } from '../../interfaces/sync-job.interface';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { GoogleDriver } from '../../drivers/google/google.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { GmailAttachmentHandler } from './gmail-attachment-handler';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { SyncOrchestrationService } from '../sync-orchestration.service';
import { SyncMessageProcessorService } from '../sync-message-processor.service';
import { SyncTokenService } from '../sync-token.service';

/**
 * GoogleSyncService - Driver-based implementation
 *
 * This service uses the GoogleDriver abstraction for all Gmail operations.
 * DC-2,3,4 consolidation: syncProvider, syncFullWithDriver, syncIncrementalWithDriver
 * now inherited from BaseEmailSyncService (saves ~215 lines)
 * DC-6 consolidation: Attachment processing delegated to GmailAttachmentHandler
 */
@Injectable()
export class GoogleSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(GoogleSyncService.name);

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private providerTokenService: ProviderTokenService,
    private driverFactory: EmailDriverFactory,
    private gmailAttachmentHandler: GmailAttachmentHandler,
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
    this.gmailAttachmentHandler.setRedisLockService(redisLockService);
    // Phase 32: Set EventEmitter2 for domain events
    this.setEventEmitter(eventEmitter);
  }

  // G-C1 FIX: Track current sync context for token refresh wiring
  private currentSyncProviderId: string | undefined;
  private currentSyncTenantId: string | undefined;

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Gmail-specific configuration overrides
    this.batchSize = this.config.get<number>('GMAIL_BATCH_GET_SIZE', 100);
    this.fullSyncMaxMessages = this.config.get<number>('GMAIL_FULL_MAX_MESSAGES', 2500);
  }

  /**
   * G-C1 FIX: Override syncProvider to capture providerId/tenantId for token refresh wiring.
   * These are stored as instance state so createDriver (called multiple times during sync,
   * including mid-sync CRIT-3 driver swaps) can wire the refresher.
   */
  async syncProvider(jobData: SyncJobData) {
    this.currentSyncProviderId = jobData.providerId;
    this.currentSyncTenantId = jobData.tenantId;
    try {
      return await super.syncProvider(jobData);
    } finally {
      this.currentSyncProviderId = undefined;
      this.currentSyncTenantId = undefined;
    }
  }

  // ============================================
  // Abstract Method Implementations (Required)
  // ============================================

  // Phase 45-03: getEmbeddingQueue() removed -- embedding enqueue via domain event

  /**
   * Get driver credentials for Gmail OAuth2
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
      driverType: 'google',
    };
  }

  /**
   * Create and connect Google driver
   * G-C1 FIX: Sets token refresher for mid-operation 401 recovery.
   * The refresher uses ProviderTokenService (distributed-locked) to get a fresh token.
   */
  protected async createDriver(driverType: string, credentials: any): Promise<IEmailDriver> {
    const driver = await this.driverFactory.createConnectedDriver(driverType as any, credentials);

    // G-C1 FIX: Wire token refresher so driver can recover from 401 mid-operation
    if (driver instanceof GoogleDriver && this.currentSyncProviderId) {
      const providerId = this.currentSyncProviderId;
      const tenantId = this.currentSyncTenantId;
      driver.setTokenRefresher(async () => {
        const { accessToken } = await this.providerTokenService.getProviderWithToken(
          providerId,
          tenantId,
        );
        return accessToken;
      });
    }

    return driver;
  }

  /**
   * Process attachments for Gmail messages
   * Implements the abstract method from BaseEmailSyncService
   * DC-6 consolidation: Delegates to GmailAttachmentHandler
   */
  protected async processAttachmentsForMessage(
    driver: IEmailDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    // Cast to GoogleDriver and delegate to handler
    const googleDriver = driver as GoogleDriver;
    await this.gmailAttachmentHandler.processGmailAttachments(
      googleDriver,
      emailId,
      externalMessageId,
      attachments,
      tenantId,
      providerId,
    );
  }

  // syncProvider(), syncFullWithDriver(), syncIncrementalWithDriver()
  // are now inherited from BaseEmailSyncService (DC-2,3,4 consolidation)
  // handleMessageDeletion is now inherited from BaseEmailSyncService
}
