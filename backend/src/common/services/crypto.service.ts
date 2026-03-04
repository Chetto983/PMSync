import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { getConfiguration } from '../../config/configuration';

@Injectable()
export class CryptoService {
  private logger = new Logger(CryptoService.name);
  private secretKey: Buffer;
  private config = getConfiguration();

  /** GCM ciphertext prefix to distinguish from legacy CBC */
  private readonly GCM_PREFIX = 'gcm:';
  /** GCM uses 12-byte (96-bit) IV per NIST recommendation */
  private readonly GCM_IV_LENGTH = 12;

  constructor() {
    // Initialize secret key from centralized config
    try {
      this.secretKey = Buffer.from(this.config.encryption.aesSecretKey, 'base64');
      if (this.secretKey.length !== 32) {
        throw new Error(`AES secret key must be 32 bytes, got ${this.secretKey.length}`);
      }
    } catch (error) {
      this.logger.error('Failed to initialize encryption key:', error);
      throw new Error('Invalid AES_SECRET_KEY configuration');
    }
  }

  /**
   * Encrypt data using AES-256-GCM (authenticated encryption).
   *
   * Output format: { encrypted: "gcm:<ciphertext_hex>:<authtag_hex>", iv: "<24-char hex>" }
   * The gcm: prefix allows decrypt() to distinguish GCM from legacy CBC ciphertext.
   *
   * Method signature unchanged -- all 30+ consumers continue to work without modification.
   */
  encrypt(text: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(this.GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.secretKey, iv);

    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted: `${this.GCM_PREFIX}${ciphertext}:${authTag}`,
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt data -- handles both GCM (prefixed) and legacy CBC (unprefixed) ciphertext.
   *
   * GCM path: parses "gcm:<ciphertext>:<authTag>" format.
   * CBC path: legacy fallback for data encrypted before the GCM migration.
   *
   * Method signature unchanged -- all 30+ consumers continue to work without modification.
   */
  decrypt(encrypted: string, ivHex: string): string {
    if (encrypted.startsWith(this.GCM_PREFIX)) {
      return this.decryptGcm(encrypted, ivHex);
    }
    return this.decryptCbc(encrypted, ivHex);
  }

  /**
   * Decrypt AES-256-GCM ciphertext.
   * Format: "gcm:<ciphertext_hex>:<authtag_hex>"
   */
  private decryptGcm(data: string, ivHex: string): string {
    const withoutPrefix = data.slice(this.GCM_PREFIX.length);
    const lastColon = withoutPrefix.lastIndexOf(':');
    if (lastColon === -1) {
      throw new Error('Invalid GCM ciphertext format: missing auth tag separator');
    }

    const ciphertextHex = withoutPrefix.slice(0, lastColon);
    const authTagHex = withoutPrefix.slice(lastColon + 1);

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.secretKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypt legacy AES-256-CBC ciphertext (backward compatibility).
   * Used for data encrypted before the GCM migration. No auth tag -- CBC without HMAC.
   */
  private decryptCbc(encrypted: string, ivHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.secretKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
