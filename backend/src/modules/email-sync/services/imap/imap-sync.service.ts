import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CryptoService } from '../../../../common/services/crypto.service';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { SyncOrchestrationService } from '../sync-orchestration.service';
import { SyncMessageProcessorService } from '../sync-message-processor.service';
import { SyncTokenService } from '../sync-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { IMAPDriver } from '../../drivers/imap/imap.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { ImapAttachmentHandler } from './imap-attachment-handler';

/**
 * ImapSyncService - Driver-based implementation
 *
 * This service uses the IMAPDriver abstraction for all IMAP operations.
 * DC-2,3,4 consolidation: syncProvider, syncFullWithDriver, syncIncrementalWithDriver
 * now inherited from BaseEmailSyncService (saves ~270 lines)
 *
 * IMAP Protocol Best Practices (2025):
 * - Use TLS encryption by default (port 993)
 * - CONDSTORE/QRESYNC for efficient incremental sync
 * - HIGHESTMODSEQ tracking for change detection
 * - Polling strategy (5-15 min intervals) for reliability
 * - Handle servers without CONDSTORE gracefully
 */
@Injectable()
export class ImapSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(ImapSyncService.name);

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private crypto: CryptoService,
    private driverFactory: EmailDriverFactory,
    private imapAttachmentHandler: ImapAttachmentHandler,
    // BUG-5 FIX: Inject RedisLockService for distributed locking (matching Google/Microsoft)
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
    // BUG-5 FIX: Set RedisLockService for base class email upsert locking
    this.setRedisLockService(redisLockService);
    // Also set for attachment handler
    this.imapAttachmentHandler.setRedisLockService(redisLockService);
    // Phase 32: Set EventEmitter2 for domain events
    this.setEventEmitter(eventEmitter);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // IMAP-specific configuration overrides
    this.batchSize = this.config.get<number>('IMAP_BATCH_FETCH_SIZE', 100);
    this.fullSyncMaxMessages = this.config.get<number>('IMAP_FULL_MAX_MESSAGES', 500);
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
   * Get driver credentials for IMAP basic auth
   * DC-4 consolidation: Provider-specific credential fetching
   */
  protected async getDriverCredentials(providerId: string): Promise<{
    provider: any;
    credentials: any;
    driverType: 'google' | 'microsoft' | 'imap';
  }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider || !provider.imapPassword) {
      throw new Error('Provider not found or missing IMAP credentials');
    }

    // Decrypt IMAP password
    const imapPassword = this.crypto.decrypt(
      provider.imapPassword,
      provider.imapEncryptionIv!,
    );

    return {
      provider,
      credentials: {
        type: 'basic',
        username: provider.imapUsername!,
        password: imapPassword,
        imapHost: provider.imapHost!,
        imapPort: provider.imapPort || 993,
        imapTls: provider.imapUseTls ?? true,
        smtpHost: provider.smtpHost || undefined,
        smtpPort: provider.smtpPort || undefined,
        smtpTls: provider.smtpUseTls ?? true,
      },
      driverType: 'imap',
    };
  }

  /**
   * Create and connect IMAP driver
   */
  protected async createDriver(driverType: string, credentials: any): Promise<IEmailDriver> {
    return this.driverFactory.createConnectedDriver(driverType as any, credentials);
  }

  /**
   * Process attachments for IMAP messages
   * Implements the abstract method from BaseEmailSyncService
   * Uses ImapAttachmentHandler for IMAP-specific handling
   */
  protected async processAttachmentsForMessage(
    driver: IEmailDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    // Cast to IMAPDriver and delegate to IMAP-specific handler
    const imapDriver = driver as IMAPDriver;
    await this.imapAttachmentHandler.processImapAttachments(
      imapDriver,
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
   * IMAP-specific pre-sync logic: Check server capabilities
   * DC-2 consolidation: Preserves CONDSTORE capability checking
   */
  protected override async onBeforeSync(driver: IEmailDriver, provider: any): Promise<void> {
    const imapDriver = driver as IMAPDriver;
    const caps = imapDriver.getCapabilities();
    if (!caps.condstore) {
      this.logger.warn(
        `IMAP server ${provider.imapHost} does not support CONDSTORE - using less efficient date-based sync`,
      );
    }
  }

  /**
   * IMAP-specific listMessages options
   * DC-2 consolidation: Preserves includeBody for IMAP
   */
  protected override getListMessagesOptions(): Record<string, any> {
    return { includeBody: true };
  }

  // syncProvider(), syncFullWithDriver(), syncIncrementalWithDriver()
  // are now inherited from BaseEmailSyncService (DC-2,3,4 consolidation)
}
