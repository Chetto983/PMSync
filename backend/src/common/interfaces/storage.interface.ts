/**
 * Interface contract for storage operations.
 * Phase 31: Contract only. Phase 32: Extended with getSignedDownloadUrl for AI module.
 * Used by email module to decouple from direct attachment storage imports.
 */
export interface IStorageService {
  uploadFile(
    tenantId: string,
    key: string,
    data: Buffer,
    mimeType?: string,
  ): Promise<string>;
  getFileUrl(tenantId: string, key: string): Promise<string>;
  deleteFile(tenantId: string, key: string): Promise<void>;
  /** Generate a pre-signed download URL for an S3 object */
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('IStorageService');
