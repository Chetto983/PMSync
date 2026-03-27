import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProviderTokenService } from '../provider-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { MicrosoftDriver } from '../../drivers/microsoft/microsoft.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { SyncJobData } from '../../interfaces/sync-job.interface';
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

  // MS-C1 FIX: Track current sync context for token refresh wiring
  private currentSyncProviderId: string | undefined;
  private currentSyncTenantId: string | undefined;

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
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
    this.fullSyncMaxMessages = this.config.get<number>('MS_FULL_MAX_MESSAGES', 2500);
  }

  /** MS-C4: Maximum age for delta tokens before forcing full resync */
  private readonly DELTA_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * MS-C1 FIX: Override syncProvider to capture providerId/tenantId context
   * so createDriver can wire the token refresher.
   * MS-C4 FIX: Check delta token age before sync — stale tokens cause 410 Gone.
   */
  async syncProvider(jobData: SyncJobData) {
    this.currentSyncProviderId = jobData.providerId;
    this.currentSyncTenantId = jobData.tenantId;
    try {
      // MS-C4 FIX: Validate delta token age before sync
      await this.validateDeltaTokenAge(jobData.providerId);
      const result = await super.syncProvider(jobData);

      // MS-C4 FIX: Store deltaTokenUpdatedAt when sync token changes
      if (result.lastSyncToken) {
        await this.prisma.providerConfig.update({
          where: { id: jobData.providerId },
          data: {
            metadata: {
              ...(await this.getProviderMetadata(jobData.providerId)),
              deltaTokenUpdatedAt: new Date().toISOString(),
            },
          },
        });
      }

      return result;
    } finally {
      this.currentSyncProviderId = undefined;
      this.currentSyncTenantId = undefined;
    }
  }

  /** Helper to get current provider metadata for atomic updates */
  private async getProviderMetadata(providerId: string): Promise<Record<string, any>> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { metadata: true },
    });
    return (provider?.metadata as Record<string, any>) || {};
  }

  /**
   * MS-C4 FIX: Check if delta token is too old and clear it to force full sync.
   * Old delta tokens cause Graph API to return 410 Gone or silently skip changes.
   */
  private async validateDeltaTokenAge(providerId: string): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { metadata: true },
    });

    const metadata = (provider?.metadata as Record<string, any>) || {};
    const deltaTokenUpdatedAt = metadata.deltaTokenUpdatedAt;

    if (!deltaTokenUpdatedAt || !metadata.lastSyncToken) return;

    const tokenAge = Date.now() - new Date(deltaTokenUpdatedAt).getTime();
    if (tokenAge > this.DELTA_TOKEN_MAX_AGE_MS) {
      this.logger.warn(
        `MS-C4: Delta token for provider ${providerId} is ${Math.round(tokenAge / (24 * 60 * 60 * 1000))}d old (max 7d) — clearing to force full sync`,
      );
      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: {
          metadata: {
            ...metadata,
            lastSyncToken: null,
            deltaTokenUpdatedAt: null,
          },
        },
      });
    }
  }

  // ============================================
  // Abstract Method Implementations (Required)
  // ============================================

  // Phase 45-03: getEmbeddingQueue() removed -- embedding enqueue via domain event

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
   * MS-C1 FIX: Sets token refresher for mid-operation 401 recovery.
   * The refresher uses ProviderTokenService (distributed-locked) to get a fresh token.
   */
  protected async createDriver(driverType: string, credentials: any): Promise<IEmailDriver> {
    const driver = await this.driverFactory.createConnectedDriver(driverType as any, credentials);

    // MS-C1 FIX: Wire token refresher so driver can recover from 401 mid-operation
    if (driver instanceof MicrosoftDriver && this.currentSyncProviderId) {
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
