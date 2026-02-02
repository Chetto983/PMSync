import { Injectable, Logger } from '@nestjs/common';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';

/**
 * Callback type for getting fresh driver credentials
 * Avoids circular dependency with provider-specific services
 */
export type GetDriverCredentialsCallback = (providerId: string) => Promise<{
  provider: any;
  credentials: any;
  driverType: 'google' | 'microsoft' | 'imap';
}>;

/**
 * Callback type for creating connected driver
 */
export type CreateDriverCallback = (
  driverType: string,
  credentials: any,
) => Promise<IEmailDriver>;

/**
 * Result from driver refresh operation
 */
export interface RefreshResult {
  driver: IEmailDriver;
  tokenExpiresAt: Date | null | undefined;
}

/**
 * SyncTokenService
 *
 * Manages OAuth token lifecycle during sync operations.
 * Extracted from base-email-sync.service.ts (Phase 6 Plan 02).
 *
 * Key features:
 * - CRIT-3 FIX: 2-minute threshold before expiry for proactive refresh
 * - Graceful driver swap: disconnect old, create new with fresh token
 * - Uses callback pattern to avoid circular dependencies
 */
@Injectable()
export class SyncTokenService {
  private readonly logger = new Logger(SyncTokenService.name);

  // CRIT-3 FIX: Token refresh threshold (refresh if less than 2 min remaining)
  private readonly TOKEN_REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

  /**
   * CRIT-3 FIX: Check if token is about to expire and needs refresh
   * Compares current time against token expiry with threshold buffer
   *
   * @param tokenExpiresAt - Token expiration time
   * @returns true if token expires within threshold
   */
  isTokenExpiringSoon(tokenExpiresAt: Date | null | undefined): boolean {
    if (!tokenExpiresAt) {
      return false; // Can't check without expiry time
    }
    const now = Date.now();
    const expiresAt = new Date(tokenExpiresAt).getTime();
    return now >= expiresAt - this.TOKEN_REFRESH_THRESHOLD_MS;
  }

  /**
   * CRIT-3 FIX: Refresh driver with new credentials if token is expiring
   * Returns new driver if refreshed, or existing driver if still valid
   *
   * Uses callback pattern to avoid circular dependencies with provider services.
   * The parent class provides callbacks for getDriverCredentials and createDriver.
   *
   * @param currentDriver - Current connected driver
   * @param providerId - Provider ID for credential lookup
   * @param tokenExpiresAt - Current token expiry time
   * @param getDriverCredentials - Callback to get fresh credentials
   * @param createDriver - Callback to create new driver
   * @returns RefreshResult with driver and new token expiry
   */
  async refreshDriverIfNeeded(
    currentDriver: IEmailDriver,
    providerId: string,
    tokenExpiresAt: Date | null | undefined,
    getDriverCredentials: GetDriverCredentialsCallback,
    createDriver: CreateDriverCallback,
  ): Promise<RefreshResult> {
    if (!this.isTokenExpiringSoon(tokenExpiresAt)) {
      return { driver: currentDriver, tokenExpiresAt };
    }

    this.logger.log(`CRIT-3: Token expiring soon, refreshing driver for provider ${providerId}`);

    try {
      // Disconnect old driver
      await currentDriver.disconnect();

      // Get fresh credentials (will trigger token refresh via ProviderTokenService)
      const { provider, credentials, driverType } = await getDriverCredentials(providerId);

      // Create new driver with fresh token
      const newDriver = await createDriver(driverType, credentials);

      if (!newDriver.isConnected()) {
        throw new Error('New driver failed to connect');
      }

      this.logger.log(`CRIT-3: Driver refreshed successfully for provider ${providerId}`);
      return { driver: newDriver, tokenExpiresAt: provider.tokenExpiresAt };
    } catch (error) {
      this.logger.error(
        `CRIT-3: Failed to refresh driver: ${error instanceof Error ? error.message : String(error)}`,
      );
      // FIX Phase 1.3: Throw error instead of returning expired driver
      // Returning expired driver causes all subsequent operations to fail silently
      // Better to fail fast and let caller handle the token refresh failure
      throw new Error(
        `Token refresh failed for provider ${providerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
