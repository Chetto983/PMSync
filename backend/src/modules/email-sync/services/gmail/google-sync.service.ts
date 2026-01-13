import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { BatchIndexingService } from '../../../ai/services/batch-indexing.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { ProviderTokenService } from '../provider-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { GoogleDriver } from '../../drivers/google/google.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { GmailAttachmentHandler } from './gmail-attachment-handler';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { FollowUpService } from '../../../ai/voltagent/services/follow-up.service';
import { WritingStyleService } from '../../../ai/voltagent/services/writing-style.service';

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
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private batchIndexingService: BatchIndexingService, // P11: Batch API for 100+ emails
    private providerTokenService: ProviderTokenService,
    private driverFactory: EmailDriverFactory,
    private gmailAttachmentHandler: GmailAttachmentHandler,
    // RACE CONDITION FIX RC-5: Redis lock for attachment processing
    private redisLockService: RedisLockService,
    followUpService: FollowUpService,
    writingStyleService: WritingStyleService,
  ) {
    super(prisma, realtimeEvents, config, followUpService, writingStyleService);
    // Inject Redis lock service into base class for email upsert locking
    this.setRedisLockService(redisLockService);
    // Inject Redis lock service into attachment handler for attachment processing locking
    this.gmailAttachmentHandler.setRedisLockService(redisLockService);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Gmail-specific configuration overrides
    this.batchSize = this.config.get<number>('GMAIL_BATCH_GET_SIZE', 100);
    this.fullSyncMaxMessages = this.config.get<number>('GMAIL_FULL_MAX_MESSAGES', 200);
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
   * P11: Provide the batch indexing service for 100+ emails (50% cheaper)
   */
  protected getBatchIndexingService(): BatchIndexingService {
    return this.batchIndexingService;
  }

  /**
   * Get driver credentials for Gmail OAuth2
   * DC-4 consolidation: Provider-specific credential fetching
   */
  protected async getDriverCredentials(providerId: string): Promise<{
    provider: any;
    credentials: any;
    driverType: 'google' | 'microsoft' | 'imap';
  }> {
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
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
   */
  protected async createDriver(driverType: string, credentials: any): Promise<IEmailDriver> {
    return this.driverFactory.createConnectedDriver(driverType as any, credentials);
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
