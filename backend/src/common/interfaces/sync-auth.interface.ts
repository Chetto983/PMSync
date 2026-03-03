/**
 * Interface contract for sync authentication/token operations.
 * Phase 31: Contract only. Implementation in Phase 32.
 * Used by email-sync module to decouple from direct providers module imports.
 */
export interface ISyncAuthService {
  getAccessToken(tenantId: string, providerId: string): Promise<string>;
  refreshToken(tenantId: string, providerId: string): Promise<string>;
  isTokenValid(tenantId: string, providerId: string): Promise<boolean>;
}

export const SYNC_AUTH_SERVICE = Symbol('ISyncAuthService');
