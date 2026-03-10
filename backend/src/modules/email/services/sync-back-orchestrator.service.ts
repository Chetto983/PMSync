import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { GmailSyncBackService } from './gmail-sync-back.service';
import { MicrosoftSyncBackService } from './microsoft-sync-back.service';
import { ImapSyncBackService } from './imap-sync-back.service';
import type { ProviderConfig } from '@prisma/client';
import type { EmailSyncOperation } from '../types/sync-back.types';

/**
 * Orchestrates batch sync-back operations and manages token refresh.
 * Extracted from EmailSyncBackService for maintainability.
 */
@Injectable()
export class SyncBackOrchestratorService {
  private readonly logger = new Logger(SyncBackOrchestratorService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private googleOAuth: GoogleOAuthService,
    private microsoftOAuth: MicrosoftOAuthService,
    private redisLock: RedisLockService,
    private gmailSync: GmailSyncBackService,
    private microsoftSync: MicrosoftSyncBackService,
    private imapSync: ImapSyncBackService,
  ) {}

  /**
   * Get a valid access token, refreshing if necessary
   * RACE CONDITION FIX RC-2: Uses distributed lock to prevent concurrent token refresh
   */
  async getValidAccessToken(provider: ProviderConfig): Promise<string> {
    const now = new Date();
    const isExpired = provider.tokenExpiresAt && now > new Date(provider.tokenExpiresAt);

    if (isExpired && provider.refreshToken && provider.refreshTokenEncryptionIv) {
      const lockKey = `token-refresh:${provider.id}`;
      const lockTtlMs = 30000;

      return await this.redisLock.withLock(
        lockKey,
        lockTtlMs,
        async () => {
          const freshProvider = await this.prisma.providerConfig.findUnique({
            where: { id: provider.id },
          });

          if (!freshProvider) {
            throw new Error(`Provider ${provider.id} not found during token refresh`);
          }

          const stillExpired = freshProvider.tokenExpiresAt && now > new Date(freshProvider.tokenExpiresAt);
          if (!stillExpired) {
            this.logger.debug(`Token already refreshed by another process for provider ${provider.id}`);
            return this.crypto.decrypt(freshProvider.accessToken!, freshProvider.tokenEncryptionIv!);
          }

          this.logger.log(`Token expired, refreshing...`);

          const refreshToken = this.crypto.decrypt(
            freshProvider.refreshToken!,
            freshProvider.refreshTokenEncryptionIv!,
          );

          const providerType = freshProvider.providerType?.toUpperCase();

          try {
            if (providerType === 'GOOGLE') {
              const refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);
              const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
              await this.prisma.providerConfig.update({
                where: { id: provider.id },
                data: {
                  accessToken: encryptedAccess.encrypted,
                  tokenEncryptionIv: encryptedAccess.iv,
                  tokenExpiresAt: refreshed.expiresAt,
                },
              });
              return refreshed.accessToken;
            } else if (providerType === 'MICROSOFT') {
              const refreshed = await this.microsoftOAuth.refreshAccessToken(refreshToken);
              const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
              await this.prisma.providerConfig.update({
                where: { id: provider.id },
                data: {
                  accessToken: encryptedAccess.encrypted,
                  tokenEncryptionIv: encryptedAccess.iv,
                  tokenExpiresAt: refreshed.expiresAt,
                },
              });
              return refreshed.accessToken;
            }

            throw new Error(`Cannot refresh token for provider type: ${providerType}`);
          } catch (refreshError) {
            const errMsg = refreshError instanceof Error ? refreshError.message : String(refreshError);
            this.logger.error(`Failed to refresh ${providerType} token for provider ${provider.id}: ${errMsg}`);

            await this.prisma.providerConfig.update({
              where: { id: provider.id },
              data: {
                isActive: false,
                metadata: {
                  ...((freshProvider.metadata as Record<string, unknown>) || {}),
                  lastTokenError: errMsg,
                  lastTokenErrorAt: new Date().toISOString(),
                },
              },
            }).catch((dbErr) => {
              this.logger.warn(`Failed to update provider error status: ${dbErr}`);
            });

            throw new Error(
              `Authentication failed for ${providerType}. Please reconnect your email account.`,
            );
          }
        },
        { maxRetries: 3 },
      );
    }

    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new Error(`Provider ${provider.id} has no access token configured`);
    }
    return this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
  }

  /**
   * Batch sync multiple operations -- groups by provider type and delegates
   */
  async syncOperationsBatch(
    operations: EmailSyncOperation[],
    syncSingleOp: (op: EmailSyncOperation) => Promise<void>,
  ): Promise<void> {
    if (!operations.length) return;

    this.logger.log(`[SYNC-BACK] Starting batch sync for ${operations.length} operations`);
    this.logger.debug(`[SYNC-BACK] Operations: ${JSON.stringify(operations.map(op => ({ operation: op.operation, externalId: op.externalId })))}`);

    const gmailByProvider = new Map<string, EmailSyncOperation[]>();
    const microsoftByProvider = new Map<string, EmailSyncOperation[]>();
    const imapByProvider = new Map<string, EmailSyncOperation[]>();
    const otherOps: EmailSyncOperation[] = [];
    const providerTenantMap = new Map<string, string>();

    // BULK FIX: Pre-fetch all providers in 1 query instead of N individual findFirst() calls
    const uniqueProviderIds = [...new Set(operations.map((op) => op.providerId).filter(Boolean))];
    const providers = uniqueProviderIds.length > 0
      ? await this.prisma.providerConfig.findMany({
          where: { id: { in: uniqueProviderIds } },
          select: { id: true, providerType: true, tenantId: true },
        })
      : [];
    const providerMap = new Map(providers.map((p) => [p.id, p]));

    for (const op of operations) {
      if (!op.externalId || op.externalId.trim() === '') {
        this.logger.error(`Skipping operation with invalid externalId for email ${op.emailId}`);
        continue;
      }
      if (!op.providerId) {
        this.logger.error(`Skipping operation with missing providerId for email ${op.emailId}`);
        continue;
      }
      const existingTenantId = providerTenantMap.get(op.providerId);
      if (existingTenantId && existingTenantId !== op.tenantId) {
        this.logger.error(
          `Provider ${op.providerId} referenced by multiple tenants in batch sync; skipping operation for email ${op.emailId}`,
        );
        continue;
      }

      const provider = providerMap.get(op.providerId);
      if (!provider || provider.tenantId !== op.tenantId) {
        this.logger.error(`Provider ${op.providerId} not found for operation ${op.operation} on email ${op.emailId}`);
        continue;
      }
      providerTenantMap.set(op.providerId, op.tenantId);
      const type = provider.providerType?.toUpperCase();
      if (type === 'GOOGLE') {
        const list = gmailByProvider.get(op.providerId) ?? [];
        list.push(op);
        gmailByProvider.set(op.providerId, list);
      } else if (type === 'MICROSOFT') {
        const list = microsoftByProvider.get(op.providerId) ?? [];
        list.push(op);
        microsoftByProvider.set(op.providerId, list);
      } else if (type === 'IMAP' || type === 'GENERIC') {
        const list = imapByProvider.get(op.providerId) ?? [];
        list.push(op);
        imapByProvider.set(op.providerId, list);
      } else {
        otherOps.push(op);
      }
    }

    // BULK FIX: Pre-fetch full provider records for token access (1 query for all active providers)
    const activeProviderIds = [
      ...gmailByProvider.keys(),
      ...microsoftByProvider.keys(),
      ...imapByProvider.keys(),
    ];
    const fullProviders = activeProviderIds.length > 0
      ? await this.prisma.providerConfig.findMany({
          where: { id: { in: activeProviderIds } },
        })
      : [];
    const fullProviderMap = new Map(fullProviders.map((p) => [p.id, p]));

    // Process Gmail batches
    for (const [providerId, ops] of gmailByProvider) {
      const provider = fullProviderMap.get(providerId);
      if (!provider) {
        this.logger.error(`Gmail provider ${providerId} not found during batch sync, skipping ${ops.length} operations`);
        continue;
      }
      const accessToken = await this.getValidAccessToken(provider);
      await this.gmailSync.syncGmailBatch(accessToken, ops, syncSingleOp);
    }

    // Process Microsoft batches
    for (const [providerId, ops] of microsoftByProvider) {
      const provider = fullProviderMap.get(providerId);
      if (!provider) {
        this.logger.error(`Microsoft provider ${providerId} not found during batch sync, skipping ${ops.length} operations`);
        continue;
      }
      const accessToken = await this.getValidAccessToken(provider);
      await this.microsoftSync.syncMicrosoftBatch(accessToken, providerId, ops, syncSingleOp);
    }

    // Process IMAP batches
    for (const [providerId, ops] of imapByProvider) {
      const provider = fullProviderMap.get(providerId);
      if (!provider) {
        this.logger.error(`IMAP provider ${providerId} not found during batch sync, skipping ${ops.length} operations`);
        continue;
      }
      await this.imapSync.syncImapBatch(provider, ops);
    }

    // Process remaining operations individually
    if (otherOps.length) {
      const promises = otherOps.map((op) => syncSingleOp(op));
      await Promise.allSettled(promises);
    }
  }
}
