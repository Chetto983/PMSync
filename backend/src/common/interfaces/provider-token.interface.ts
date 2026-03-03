/**
 * Interface contract for provider token operations.
 * Phase 32: Decouples email-sync from direct ProviderToken imports.
 * Implementations live in ProvidersModule; consumers inject via Symbol.
 */
export interface IProviderTokenService {
  getAccessToken(tenantId: string, providerId: string): Promise<string>;
  refreshAccessToken(tenantId: string, providerId: string): Promise<string>;
  getProviderConfig(
    tenantId: string,
    providerId: string,
  ): Promise<{ type: string; email: string }>;
}

export const PROVIDER_TOKEN_SERVICE = Symbol('IProviderTokenService');
