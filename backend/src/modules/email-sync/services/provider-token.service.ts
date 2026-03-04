import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import type { ProviderConfig as ProviderEntity } from '@prisma/client';

type ProviderWithToken = {
  provider: ProviderEntity;
  accessToken: string;
};

/**
 * Centralizza recupero/refresh token provider per i servizi di sync.
 * Rimuove duplicazioni tra Google/Microsoft e IMAP.
 *
 * SCALABLE: Uses RedisLockService for distributed locking to prevent token refresh
 * race conditions when running multiple instances.
 *
 * RC-A4 FIX: Now uses RedisLockService instead of custom lock implementation.
 * This ensures safe lock release with Lua script ownership verification.
 */
@Injectable()
export class ProviderTokenService {
  private readonly logger = new Logger(ProviderTokenService.name);

  // Redis key prefix for token refresh locks
  private readonly KEY_PREFIX_LOCK = 'token-refresh:';

  // Lock TTL in milliseconds (30 seconds should be enough for token refresh)
  private readonly LOCK_TTL_MS = 30000;

  // Max wait time for lock in ms
  private readonly MAX_WAIT_MS = 10000;

  // Poll interval when waiting for lock
  private readonly POLL_INTERVAL_MS = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly redisLock: RedisLockService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly config: ConfigService,
  ) {}

  async getProviderWithToken(providerId: string, tenantId?: string): Promise<ProviderWithToken> {
    // P0-5 FIX: When tenantId is provided, enforce tenant isolation in the query
    // to prevent cross-tenant data access. Uses findFirst with composite WHERE
    // instead of findUnique to include tenantId constraint.
    const provider = tenantId
      ? await this.prisma.providerConfig.findFirst({
          where: { id: providerId, tenantId },
        })
      : await this.prisma.providerConfig.findUnique({
          where: { id: providerId },
        });

    if (!provider) {
      throw new NotFoundException(`Provider not found: ${providerId}`);
    }

    switch (provider.providerType) {
      case 'google':
        return { provider, accessToken: await this.getGoogleToken(provider) };
      case 'microsoft':
        return { provider, accessToken: await this.getMicrosoftToken(provider) };
      case 'imap':
      case 'generic':
        // IMAP/generic providers use password auth, not OAuth tokens
        return { provider, accessToken: await this.getImapToken(provider) };
      default:
        throw new BadRequestException(`Unsupported provider type: ${provider.providerType}`);
    }
  }

  private async getMicrosoftToken(provider: ProviderEntity): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new BadRequestException(`Provider ${provider.id} missing access token`);
    }

    const now = new Date();
    // RC-15 FIX: Proactive refresh 5 minutes BEFORE expiration
    const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
    const expiresSoon = provider.tokenExpiresAt
      ? now.getTime() >= new Date(provider.tokenExpiresAt).getTime() - REFRESH_BUFFER_MS
      : true;

    let accessToken = this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
    const tokenLooksValid = accessToken.includes('.');

    const canRefresh = provider.refreshToken && provider.refreshTokenEncryptionIv;

    if ((!tokenLooksValid || expiresSoon) && canRefresh) {
      // Use distributed lock to prevent race condition
      accessToken = await this.refreshMicrosoftTokenWithLock(provider);
    } else if (!tokenLooksValid && !canRefresh) {
      this.logger.error(
        `Microsoft token invalid and no refresh token available for ${provider.email} (${provider.id})`,
      );
      throw new UnauthorizedException(
        `Microsoft provider ${provider.email} requires re-authentication (invalid access token)`,
      );
    }

    return accessToken;
  }

  /**
   * Refresh Microsoft token with distributed lock
   * RC-A4 FIX: Uses RedisLockService with safe Lua-based release
   */
  private async refreshMicrosoftTokenWithLock(provider: ProviderEntity): Promise<string> {
    const lockKey = `${this.KEY_PREFIX_LOCK}${provider.id}`;

    // Try to acquire lock with retries (RedisLockService handles exponential backoff)
    const lockId = await this.redisLock.acquireLock(lockKey, this.LOCK_TTL_MS, { maxRetries: 3 });

    if (!lockId) {
      // Lock held by another instance - wait for it to complete, then re-read token
      const lockInfo = await this.redisLock.isLocked(lockKey);
      if (lockInfo) {
        this.logger.debug(`Waiting for token refresh lock: ${provider.email}`);
        await this.waitForLockRelease(lockKey);

        // Re-read provider from DB to get fresh token (other instance refreshed it)
        const freshProvider = await this.prisma.providerConfig.findUnique({
          where: { id: provider.id },
        });

        if (!freshProvider?.accessToken || !freshProvider.tokenEncryptionIv) {
          throw new ServiceUnavailableException(
            `Microsoft provider ${provider.id} token not available after waiting for refresh`,
          );
        }

        return this.crypto.decrypt(freshProvider.accessToken, freshProvider.tokenEncryptionIv);
      }

      throw new ServiceUnavailableException(
        `Failed to acquire Microsoft token refresh lock for ${provider.email}`,
      );
    }

    try {
      // We hold the lock, do the refresh
      const refreshToken = this.crypto.decrypt(
        provider.refreshToken!,
        provider.refreshTokenEncryptionIv!,
      );

      const refreshed = await this.microsoftOAuth.refreshAccessToken(refreshToken);
      const accessToken = refreshed.accessToken;

      const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
      const updateData: Record<string, any> = {
        accessToken: encryptedAccess.encrypted,
        tokenEncryptionIv: encryptedAccess.iv,
        tokenExpiresAt: refreshed.expiresAt,
      };

      if (refreshed.refreshToken) {
        const encryptedRefresh = this.crypto.encrypt(refreshed.refreshToken);
        updateData.refreshToken = encryptedRefresh.encrypted;
        updateData.refreshTokenEncryptionIv = encryptedRefresh.iv;
      }

      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: updateData,
      });

      this.logger.log(`Microsoft token refreshed for ${provider.email}`);
      return accessToken;
    } finally {
      // RC-A4 FIX: Safe release with ownership verification via Lua script
      await this.redisLock.releaseLock(lockKey, lockId);
    }
  }

  private async getGoogleToken(provider: ProviderEntity): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new BadRequestException(`Google provider ${provider.id} missing access token`);
    }

    const now = new Date();
    // RC-15 FIX: Proactive refresh 5 minutes BEFORE expiration
    // Increased from 60 seconds to provide larger window for token refresh
    // This prevents token expiry during active API operations
    const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
    const expiresSoon = provider.tokenExpiresAt
      ? now.getTime() >= new Date(provider.tokenExpiresAt).getTime() - REFRESH_BUFFER_MS
      : true;

    let accessToken = this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
    const tokenLooksValid = accessToken.length > 50; // Google access tokens are long

    const canRefresh = provider.refreshToken && provider.refreshTokenEncryptionIv;

    if ((!tokenLooksValid || expiresSoon) && canRefresh) {
      // Use distributed lock to prevent race condition
      accessToken = await this.refreshGoogleTokenWithLock(provider);
    } else if (!tokenLooksValid && !canRefresh) {
      this.logger.error(
        `Google token invalid and no refresh token available for ${provider.email} (${provider.id})`,
      );
      throw new UnauthorizedException(
        `Google provider ${provider.email} requires re-authentication (invalid access token)`,
      );
    }

    return accessToken;
  }

  /**
   * Refresh Google token with distributed lock
   * RC-A4 FIX: Uses RedisLockService with safe Lua-based release
   */
  private async refreshGoogleTokenWithLock(provider: ProviderEntity): Promise<string> {
    const lockKey = `${this.KEY_PREFIX_LOCK}${provider.id}`;

    // Try to acquire lock with retries (RedisLockService handles exponential backoff)
    const lockId = await this.redisLock.acquireLock(lockKey, this.LOCK_TTL_MS, { maxRetries: 3 });

    if (!lockId) {
      // Lock held by another instance - wait for it to complete, then re-read token
      const lockInfo = await this.redisLock.isLocked(lockKey);
      if (lockInfo) {
        this.logger.debug(`Waiting for token refresh lock: ${provider.email}`);
        await this.waitForLockRelease(lockKey);

        // Re-read provider from DB to get fresh token (other instance refreshed it)
        const freshProvider = await this.prisma.providerConfig.findUnique({
          where: { id: provider.id },
        });

        if (!freshProvider?.accessToken || !freshProvider.tokenEncryptionIv) {
          throw new ServiceUnavailableException(
            `Google provider ${provider.id} token not available after waiting for refresh`,
          );
        }

        return this.crypto.decrypt(freshProvider.accessToken, freshProvider.tokenEncryptionIv);
      }

      throw new ServiceUnavailableException(
        `Failed to acquire Google token refresh lock for ${provider.email}`,
      );
    }

    try {
      this.logger.log(`Google token expiring soon or invalid for ${provider.email}, refreshing...`);

      const refreshToken = this.crypto.decrypt(
        provider.refreshToken!,
        provider.refreshTokenEncryptionIv!,
      );

      const refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);
      const accessToken = refreshed.accessToken;

      const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);

      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: {
          accessToken: encryptedAccess.encrypted,
          tokenEncryptionIv: encryptedAccess.iv,
          tokenExpiresAt: refreshed.expiresAt,
        },
      });

      this.logger.log(`Google token refreshed successfully for ${provider.email}`);
      return accessToken;
    } finally {
      // RC-A4 FIX: Safe release with ownership verification via Lua script
      await this.redisLock.releaseLock(lockKey, lockId);
    }
  }

  private async getImapToken(provider: ProviderEntity): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      return '';
    }
    return this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
  }

  /**
   * IMAP credentials helper (uses provider values or env defaults).
   */
  getImapCredentials(provider: ProviderEntity): {
    host: string;
    port: number;
    useTls: boolean;
    username: string;
    password: string;
  } {
    const host = provider.imapHost || this.config.get<string>('IMAP_HOST', 'imap.local');
    const port = provider.imapPort || this.config.get<number>('IMAP_PORT', 993);
    const useTls = typeof provider.imapUseTls === 'boolean'
      ? provider.imapUseTls
      : this.config.get<boolean>('IMAP_SECURE', true);
    const username =
      provider.imapUsername || this.config.get<string>('IMAP_USER', '');

    let password = '';
    if (provider.imapPassword && provider.imapEncryptionIv) {
      password = this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
    } else {
      password = this.config.get<string>('IMAP_PASSWORD', '');
    }

    return { host, port, useTls, username, password };
  }

  // ==================== DISTRIBUTED LOCKING ====================

  /**
   * Wait for a lock to be released by another instance
   * Uses RedisLockService.isLocked for checking lock status
   * HIGH-6 FIX (2025-01-05): Use exponential backoff instead of constant polling
   * to reduce CPU waste during lock contention
   */
  private async waitForLockRelease(key: string): Promise<void> {
    const startTime = Date.now();
    let currentInterval = this.POLL_INTERVAL_MS; // Start at 100ms
    const MAX_INTERVAL = 1000; // Cap at 1 second

    while (Date.now() - startTime < this.MAX_WAIT_MS) {
      const lockInfo = await this.redisLock.isLocked(key);
      if (!lockInfo) {
        return; // Lock released
      }

      // HIGH-6 FIX: Exponential backoff (100ms -> 200ms -> 400ms -> 800ms -> 1000ms cap)
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
      currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
    }

    this.logger.warn(`Lock wait timeout for ${key}`);
  }
}
