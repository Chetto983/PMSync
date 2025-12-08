import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TotpService, TotpSetupResult, TotpVerifyResult } from './totp.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { authenticator } from 'otplib';
import {describe, it, expect, beforeEach, jest} from '@jest/globals';

describe('TotpService', () => {
  let service: TotpService;

  const mockPrismaService = {
    mfaSecret: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long',
        TOTP_ISSUER: 'TestApp',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long';
    process.env.TOTP_ISSUER = 'TestApp';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TotpService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TotpService>(TotpService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('generateSecret', () => {
    it('should generate a TOTP secret and QR code', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      mockPrismaService.mfaSecret.upsert.mockResolvedValue({
        id: 'secret-123',
        userId,
        secret: 'encrypted-secret',
        encryptionIv: 'iv-hex',
        isEnabled: false,
        verifiedAt: null,
      });

      const result: TotpSetupResult = await service.generateSecret(userId, email);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeDataUrl');
      expect(result).toHaveProperty('otpauthUrl');
      expect(result.secret).toHaveLength(32); // Base32 encoded 160-bit secret
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain(encodeURIComponent(email));
      expect(result.otpauthUrl).toContain('TestApp');

      expect(mockPrismaService.mfaSecret.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          update: expect.objectContaining({
            isEnabled: false,
            verifiedAt: null,
          }),
          create: expect.objectContaining({
            userId,
            isEnabled: false,
          }),
        }),
      );
    });
  });

  describe('verifyAndActivate', () => {
    it('should verify and activate TOTP on first valid code', async () => {
      const userId = 'user-123';
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);

      // Encrypt once and use both values
      const encrypted = service['encryptSecret'](secret);

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue({
        id: 'secret-123',
        userId,
        secret: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        isEnabled: false,
        verifiedAt: null,
      });

      mockPrismaService.mfaSecret.update.mockResolvedValue({
        id: 'secret-123',
        userId,
        isEnabled: true,
        verifiedAt: new Date(),
      });

      mockPrismaService.user.update.mockResolvedValue({
        id: userId,
        isMfaEnabled: true,
      });

      const result: TotpVerifyResult = await service.verifyAndActivate(userId, validCode);

      expect(result.success).toBe(true);
      expect(result.reason).toBe('valid');
      expect(mockPrismaService.mfaSecret.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          data: expect.objectContaining({
            isEnabled: true,
          }),
        }),
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: { isMfaEnabled: true },
        }),
      );
    });

    it('should return not_setup if no secret exists', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue(null);

      const result = await service.verifyAndActivate(userId, '123456');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('not_setup');
    });

    it('should return invalid for wrong code', async () => {
      const userId = 'user-123';
      const secret = authenticator.generateSecret();

      // Encrypt once and use both values
      const encrypted = service['encryptSecret'](secret);

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue({
        id: 'secret-123',
        userId,
        secret: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        isEnabled: false,
        verifiedAt: null,
      });

      const result = await service.verifyAndActivate(userId, '000000');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid');
    });
  });

  describe('verifyCode', () => {
    it('should verify TOTP code for login', async () => {
      const userId = 'user-123';
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);

      // Encrypt once and use both values
      const encrypted = service['encryptSecret'](secret);

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue({
        id: 'secret-123',
        userId,
        secret: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        isEnabled: true,
        verifiedAt: new Date(),
      });

      const result = await service.verifyCode(userId, validCode);

      expect(result.success).toBe(true);
      expect(result.reason).toBe('valid');
    });

    it('should return not_enabled if TOTP is not activated', async () => {
      const userId = 'user-123';
      const secret = authenticator.generateSecret();

      // Encrypt once and use both values
      const encrypted = service['encryptSecret'](secret);

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue({
        id: 'secret-123',
        userId,
        secret: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        isEnabled: false,
        verifiedAt: null,
      });

      const result = await service.verifyCode(userId, '123456');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('not_enabled');
    });
  });

  describe('isEnabled', () => {
    it('should return true if TOTP is enabled', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue({
        isEnabled: true,
      });

      const result = await service.isEnabled(userId);

      expect(result).toBe(true);
    });

    it('should return false if TOTP is not enabled', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue({
        isEnabled: false,
      });

      const result = await service.isEnabled(userId);

      expect(result).toBe(false);
    });

    it('should return false if no secret exists', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaSecret.findUnique.mockResolvedValue(null);

      const result = await service.isEnabled(userId);

      expect(result).toBe(false);
    });
  });

  describe('disable', () => {
    it('should delete TOTP secret', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaSecret.delete.mockResolvedValue({
        id: 'secret-123',
        userId,
      });

      await service.disable(userId);

      expect(mockPrismaService.mfaSecret.delete).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should not throw if secret does not exist', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaSecret.delete.mockRejectedValue(new Error('Not found'));

      await expect(service.disable(userId)).resolves.not.toThrow();
    });
  });
});
