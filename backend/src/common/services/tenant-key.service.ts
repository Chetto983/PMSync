import { Injectable, Logger } from '@nestjs/common';
import { hkdfSync } from 'crypto';
import { getConfiguration } from '../../config/configuration';

const INFO_LABEL = 'mailagent-field-enc-v1';
const MIN_KEY_BYTES = 32;

@Injectable()
export class TenantKeyService {
  private readonly logger = new Logger(TenantKeyService.name);
  private readonly masterKey: Buffer;
  private readonly oldMasterKeys: Buffer[];
  private readonly cache = new Map<string, Buffer>();

  constructor() {
    const config = getConfiguration();
    const masterKeyB64 = config.fieldEncryption.masterKey;

    if (!masterKeyB64) {
      this.masterKey = Buffer.alloc(0);
      this.oldMasterKeys = [];
      this.logger.warn('FIELD_ENCRYPTION_MASTER_KEY not set — encryption disabled');
      return;
    }

    this.masterKey = Buffer.from(masterKeyB64, 'base64');
    if (this.masterKey.length < MIN_KEY_BYTES) {
      throw new Error(
        `FIELD_ENCRYPTION_MASTER_KEY must decode to >= ${MIN_KEY_BYTES} bytes, got ${this.masterKey.length}`,
      );
    }

    const oldKeysRaw = config.fieldEncryption.oldMasterKeys;
    this.oldMasterKeys = oldKeysRaw
      ? oldKeysRaw
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
          .map((k) => Buffer.from(k, 'base64'))
      : [];

    this.logger.log(
      `Initialized with ${1 + this.oldMasterKeys.length} key(s) in keychain`,
    );
  }

  /** Derive a per-tenant 256-bit key from the given master key via HKDF-SHA256. */
  private deriveKey(masterKey: Buffer, tenantId: string): Buffer {
    return Buffer.from(hkdfSync('sha256', masterKey, tenantId, INFO_LABEL, 32));
  }

  /** Get (or cache) the current derived key for a tenant. */
  getCurrentKey(tenantId: string): Buffer {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;

    const key = this.deriveKey(this.masterKey, tenantId);
    this.cache.set(tenantId, key);
    return key;
  }

  /** Return all decryption keys for a tenant: current first, then old keys. */
  getDecryptionKeys(tenantId: string): Buffer[] {
    const keys = [this.getCurrentKey(tenantId)];
    for (const oldMaster of this.oldMasterKeys) {
      keys.push(this.deriveKey(oldMaster, tenantId));
    }
    return keys;
  }

  /** Clear the in-memory key cache (call after key rotation). */
  clearCache(): void {
    this.cache.clear();
  }

  /** Whether encryption is enabled (master key configured). */
  get isEnabled(): boolean {
    return this.masterKey.length >= MIN_KEY_BYTES;
  }
}
