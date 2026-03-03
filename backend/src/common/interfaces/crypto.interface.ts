/**
 * Interface contract for cryptographic operations.
 * Phase 32: Decouples modules from direct CryptoService imports.
 * Implementation lives in a dedicated module; consumers inject via Symbol.
 */
export interface ICryptoService {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export const CRYPTO_SERVICE = Symbol('ICryptoService');
