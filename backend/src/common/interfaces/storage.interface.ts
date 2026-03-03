/**
 * Interface contract for storage operations.
 * Phase 31: Contract only. Implementation in Phase 32.
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
}

export const STORAGE_SERVICE = Symbol('IStorageService');
