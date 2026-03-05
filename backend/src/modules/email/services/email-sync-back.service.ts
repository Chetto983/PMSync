import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { GmailSyncBackService } from './gmail-sync-back.service';
import { MicrosoftSyncBackService } from './microsoft-sync-back.service';
import { ImapSyncBackService } from './imap-sync-back.service';
import { SyncBackOrchestratorService } from './sync-back-orchestrator.service';

export interface EmailSyncOperation {
  emailId: string;
  externalId: string;
  providerId: string;
  tenantId: string;
  operation: 'delete' | 'hardDelete' | 'markRead' | 'markUnread' | 'star' | 'unstar' | 'flag' | 'unflag' | 'moveToFolder';
  /** For moveToFolder: target folder. For delete: unused (use sourceFolder) */
  folder?: string;
  /** Source folder where message currently resides on IMAP server.
   * Critical for IMAP sync-back since DB folder may already be updated. */
  sourceFolder?: string;
}

/**
 * Facade for syncing email changes back to providers (Gmail/Outlook/IMAP).
 * Delegates to provider-specific sub-services and orchestrator.
 *
 * Phase 43: Split from 1429-line god-file into facade + 4 sub-services.
 */
@Injectable()
export class EmailSyncBackService {
  private readonly logger = new Logger(EmailSyncBackService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private googleOAuth: GoogleOAuthService,
    private microsoftOAuth: MicrosoftOAuthService,
    private redisLock: RedisLockService,
    private gmailSync: GmailSyncBackService,
    private microsoftSync: MicrosoftSyncBackService,
    private imapSync: ImapSyncBackService,
    private orchestrator: SyncBackOrchestratorService,
  ) {}

  /**
   * Sync an email operation back to the provider.
   * RACE CONDITION FIX RC-5: Uses per-email lock to serialize operations.
   */
  async syncOperationToProvider(operation: EmailSyncOperation): Promise<void> {
    const lockKey = `sync-back:${operation.emailId}`;
    const lockTtlMs = 60000;

    await this.redisLock.withLock(
      lockKey,
      lockTtlMs,
      async () => {
        try {
          if (!operation.externalId || operation.externalId.trim() === '') {
            throw new Error(`Invalid externalId for email ${operation.emailId}: externalId is empty or missing`);
          }
          if (!operation.providerId) {
            throw new Error(`Missing providerId for email ${operation.emailId}`);
          }

          const provider = await this.prisma.providerConfig.findFirst({
            where: { id: operation.providerId, tenantId: operation.tenantId },
          });

          if (!provider) {
            throw new Error(`Provider not found: ${operation.providerId} for tenant ${operation.tenantId}`);
          }

          const providerType = provider.providerType?.toUpperCase();

          switch (providerType) {
            case 'GOOGLE': {
              const accessToken = await this.orchestrator.getValidAccessToken(provider);
              await this.gmailSync.syncToGmail(operation, accessToken);
              break;
            }
            case 'MICROSOFT': {
              const accessToken = await this.orchestrator.getValidAccessToken(provider);
              await this.microsoftSync.syncToMicrosoft(operation, accessToken);
              break;
            }
            case 'IMAP':
            case 'GENERIC':
              await this.imapSync.syncToImap(operation, provider);
              break;
            default:
              this.logger.warn(`Unsupported provider type: ${provider.providerType}`);
          }

          this.logger.log(`Synced ${operation.operation} for email ${operation.emailId} to ${provider.providerType}`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Failed to sync operation to provider: ${err.message}`, err.stack);
          throw error;
        }
      },
      { maxRetries: 2 },
    );
  }

  /**
   * Batch sync multiple operations
   */
  async syncOperationsBatch(operations: EmailSyncOperation[]): Promise<void> {
    return this.orchestrator.syncOperationsBatch(
      operations,
      (op) => this.syncOperationToProvider(op),
    );
  }
}
