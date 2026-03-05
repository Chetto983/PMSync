import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

/**
 * Generate a test ES256 keypair for use in tests.
 */
function generateTestKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

describe('JWT ES256 Migration', () => {
  describe('AuthConfigService ES256 fields', () => {
    // Dynamically import to allow env manipulation before module load
    let AuthConfigService: any;

    beforeEach(() => {
      jest.resetModules();
    });

    it('should set isEs256Enabled=true when JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are present', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_SECRET: 'a'.repeat(32),
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      expect(svc.isEs256Enabled).toBe(true);
      expect(svc.jwtPrivateKey).toBeDefined();
      expect(svc.jwtPublicKey).toBeDefined();
    });

    it('should compute kid as first 8 hex chars of SHA-256 of public key', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const expectedKid = crypto
        .createHash('sha256')
        .update(publicKey)
        .digest('hex')
        .substring(0, 8);

      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_SECRET: 'a'.repeat(32),
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      expect(svc.jwtKeyId).toBe(expectedKid);
    });

    it('should fall back to HS256 when ES256 keys are missing', async () => {
      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_SECRET: 'a'.repeat(32),
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      expect(svc.isEs256Enabled).toBe(false);
      expect(svc.jwtAlgorithm).toBe('HS256');
    });

    it('should populate jwtLegacyHmacSecret from JWT_LEGACY_HMAC_SECRET env', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const legacySecret = 'legacy-hmac-secret-' + 'x'.repeat(20);
      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_SECRET: 'a'.repeat(32),
          JWT_LEGACY_HMAC_SECRET: legacySecret,
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      expect(svc.jwtLegacyHmacSecret).toBe(legacySecret);
    });

    it('should populate jwtLegacyHmacSecret from JWT_SECRET when ES256 enabled and no explicit legacy secret', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const jwtSecret = 'a'.repeat(32);
      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_SECRET: jwtSecret,
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      expect(svc.jwtLegacyHmacSecret).toBe(jwtSecret);
    });

    it('should return algorithm ES256 from getAccessTokenOptions when ES256 enabled', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_SECRET: 'a'.repeat(32),
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      const opts = svc.getAccessTokenOptions();
      expect(opts.algorithm).toBe('ES256');
    });

    it('should always return HS256 from getPasswordResetTokenOptions regardless of mode', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const configGet = jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
          JWT_SECRET: 'a'.repeat(32),
          PASSWORD_RESET_SECRET: 'b'.repeat(32),
          REFRESH_TOKEN_SECRET: 'c'.repeat(32),
        };
        return map[key];
      });
      const mockConfig = { get: configGet } as unknown as ConfigService;

      const { AuthConfigService: Cls } = await import('../services/auth-config.service');
      const svc = new Cls(mockConfig);
      const opts = svc.getPasswordResetTokenOptions();
      expect(opts.algorithm).toBe('HS256');
      expect(opts.secret).toBe('b'.repeat(32));
    });
  });

  describe('JwtModule ES256 signing', () => {
    it('should produce ES256 tokens with kid header when keys are configured', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const kid = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 8);

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          JwtModule.register({
            privateKey,
            publicKey,
            signOptions: {
              algorithm: 'ES256',
              expiresIn: '15m',
              issuer: 'pmsync-auth',
              audience: 'pmsync-api',
              keyid: kid,
            },
          }),
        ],
      }).compile();

      const jwtService = module.get(JwtService);
      const token = jwtService.sign({ sub: 'test-user', tenantId: 'tenant-1' });

      // Decode header
      const headerB64 = token.split('.')[0];
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      expect(header.alg).toBe('ES256');
      expect(header.kid).toBe(kid);

      // Verify with public key
      const payload = jwtService.verify(token);
      expect(payload.sub).toBe('test-user');
    });

    it('should fall back to HS256 when no ES256 keys', async () => {
      const secret = 'a'.repeat(32);
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          JwtModule.register({
            secret,
            signOptions: { expiresIn: '15m', issuer: 'pmsync-auth', audience: 'pmsync-api' },
          }),
        ],
      }).compile();

      const jwtService = module.get(JwtService);
      const token = jwtService.sign({ sub: 'test-user' });

      const headerB64 = token.split('.')[0];
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      expect(header.alg).toBe('HS256');
    });
  });

  describe('Password reset token HS256 pinning', () => {
    it('should sign password reset tokens with HS256 even when module uses ES256', async () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const resetSecret = 'b'.repeat(32);

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          JwtModule.register({
            privateKey,
            publicKey,
            signOptions: { algorithm: 'ES256', expiresIn: '15m' },
          }),
        ],
      }).compile();

      const jwtService = module.get(JwtService);

      // Simulate password reset sign with explicit HS256 pin
      const token = jwtService.sign(
        { email: 'test@test.com', type: 'password-reset' },
        { secret: resetSecret, expiresIn: '15m', algorithm: 'HS256' as any },
      );

      const headerB64 = token.split('.')[0];
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      expect(header.alg).toBe('HS256');

      // Verify with HS256
      const payload = jwtService.verify(token, {
        secret: resetSecret,
        algorithms: ['HS256'],
      } as any);
      expect(payload.type).toBe('password-reset');
    });
  });
});
