import { Test, TestingModule } from '@nestjs/testing';
import { PasswordHashingService } from '../services/password-hashing.service';
import { AuthConfigService } from '../services/auth-config.service';

// Minimal mock of AuthConfigService for Argon2id params
const mockAuthConfig = {
  argon2MemoryCost: 65536,
  argon2TimeCost: 3,
  argon2Parallelism: 1,
};

describe('PasswordHashingService', () => {
  let service: PasswordHashingService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordHashingService,
        { provide: AuthConfigService, useValue: mockAuthConfig },
      ],
    }).compile();

    service = module.get(PasswordHashingService);
  });

  describe('hashPassword', () => {
    it('should produce Argon2id hash with $argon2id$ prefix', async () => {
      const hash = await service.hashPassword('test123');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should produce different hashes for same input (random salt)', async () => {
      const h1 = await service.hashPassword('samePassword');
      const h2 = await service.hashPassword('samePassword');
      expect(h1).not.toBe(h2);
    });
  });

  describe('verifyPassword - Argon2id', () => {
    let argon2Hash: string;

    beforeAll(async () => {
      argon2Hash = await service.hashPassword('correct-password');
    });

    it('should return valid=true, needsRehash=false for correct password', async () => {
      const result = await service.verifyPassword('correct-password', argon2Hash);
      expect(result).toEqual({ valid: true, needsRehash: false });
    });

    it('should return valid=false, needsRehash=false for wrong password', async () => {
      const result = await service.verifyPassword('wrong-password', argon2Hash);
      expect(result).toEqual({ valid: false, needsRehash: false });
    });
  });

  describe('verifyPassword - bcrypt migration', () => {
    // Pre-generated bcrypt hash of "bcrypt-password" with cost 10
    // We generate it at test time to avoid hardcoding a specific hash
    let bcryptHash: string;

    beforeAll(async () => {
      const bcrypt = await import('bcrypt');
      bcryptHash = await bcrypt.hash('bcrypt-password', 10);
    });

    it('should return valid=true, needsRehash=true for correct bcrypt password', async () => {
      const result = await service.verifyPassword('bcrypt-password', bcryptHash);
      expect(result).toEqual({ valid: true, needsRehash: true });
    });

    it('should return valid=false, needsRehash=false for wrong bcrypt password', async () => {
      const result = await service.verifyPassword('wrong-password', bcryptHash);
      expect(result).toEqual({ valid: false, needsRehash: false });
    });
  });

  describe('verifyPassword - garbage hash', () => {
    it('should return valid=false, needsRehash=false for unrecognized hash format', async () => {
      const result = await service.verifyPassword('anything', 'garbage-not-a-hash');
      expect(result).toEqual({ valid: false, needsRehash: false });
    });
  });

  describe('dummyHash', () => {
    it('should complete without error (timing protection)', async () => {
      await expect(service.dummyHash()).resolves.toBeUndefined();
    });

    it('should take non-trivial time (actual hashing occurs)', async () => {
      const start = Date.now();
      await service.dummyHash();
      const elapsed = Date.now() - start;
      // Argon2id with 64 MiB should take at least a few ms
      expect(elapsed).toBeGreaterThan(0);
    });
  });
});
