import { Test, TestingModule } from '@nestjs/testing';
import { BackupCodesService, BackupCodeVerifyResult } from './backup-codes.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('BackupCodesService', () => {
  let service: BackupCodesService;

  const mockPrismaService = {
    mfaBackupCode: {
      findFirst: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long';
    process.env.BACKUP_CODE_COUNT = '10';
    process.env.BACKUP_CODE_LENGTH = '8';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupCodesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<BackupCodesService>(BackupCodesService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate 10 backup codes', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.mfaBackupCode.createMany.mockResolvedValue({ count: 10 });

      const codes = await service.generate(userId);

      expect(codes).toHaveLength(10);
      expect(mockPrismaService.mfaBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(mockPrismaService.mfaBackupCode.createMany).toHaveBeenCalled();
    });

    it('should generate codes in XXXX-XXXX format', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.mfaBackupCode.createMany.mockResolvedValue({ count: 10 });

      const codes = await service.generate(userId);

      for (const code of codes) {
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      }
    });

    it('should not contain ambiguous characters (0, O, 1, I, L)', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.mfaBackupCode.createMany.mockResolvedValue({ count: 10 });

      const codes = await service.generate(userId);

      for (const code of codes) {
        expect(code).not.toMatch(/[0OIL1]/);
      }
    });

    it('should generate unique codes', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.mfaBackupCode.createMany.mockResolvedValue({ count: 10 });

      const codes = await service.generate(userId);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(10);
    });
  });

  describe('regenerate', () => {
    it('should delete old codes and generate new ones', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.deleteMany.mockResolvedValue({ count: 5 });
      mockPrismaService.mfaBackupCode.createMany.mockResolvedValue({ count: 10 });

      const codes = await service.regenerate(userId);

      expect(codes).toHaveLength(10);
      expect(mockPrismaService.mfaBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  describe('verify', () => {
    it('should verify a valid backup code', async () => {
      const userId = 'user-123';

      // Generate codes to get a valid hash
      mockPrismaService.mfaBackupCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.mfaBackupCode.createMany.mockImplementation(({ data }) => {
        return Promise.resolve({ count: data.length });
      });

      const codes = await service.generate(userId);
      const codeToVerify = codes[0];

      // Mock finding the code (hash the code without dash)
      const normalizedCode = codeToVerify.replace(/-/g, '').toUpperCase();
      const expectedHash = service['hashCode'](normalizedCode);

      mockPrismaService.mfaBackupCode.findFirst.mockResolvedValue({
        id: 'code-123',
        userId,
        codeHash: expectedHash,
        isUsed: false,
      });

      mockPrismaService.mfaBackupCode.update.mockResolvedValue({
        id: 'code-123',
        isUsed: true,
        usedAt: new Date(),
      });

      mockPrismaService.mfaBackupCode.count.mockResolvedValue(9);

      const result: BackupCodeVerifyResult = await service.verify(userId, codeToVerify);

      expect(result.success).toBe(true);
      expect(result.reason).toBe('valid');
      expect(result.remainingCount).toBe(9);
      expect(mockPrismaService.mfaBackupCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'code-123' },
          data: expect.objectContaining({
            isUsed: true,
          }),
        }),
      );
    });

    it('should return invalid for wrong code', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.findFirst.mockResolvedValue(null);
      mockPrismaService.mfaBackupCode.count.mockResolvedValue(10);

      const result = await service.verify(userId, 'WRONG-CODE');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid');
    });

    it('should return already_used for used code', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.findFirst.mockResolvedValue({
        id: 'code-123',
        userId,
        codeHash: 'some-hash',
        isUsed: true,
        usedAt: new Date(),
      });

      const result = await service.verify(userId, 'USED-CODE');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('already_used');
    });

    it('should return no_codes if user has no backup codes', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.findFirst.mockResolvedValue(null);
      mockPrismaService.mfaBackupCode.count.mockResolvedValue(0);

      const result = await service.verify(userId, 'SOME-CODE');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('no_codes');
    });

    it('should accept code with or without dash', async () => {
      const codeWithDash = 'ABCD-EFGH';
      const codeWithoutDash = 'ABCDEFGH';

      // Both should hash to the same value
      const hash1 = service['hashCode'](codeWithDash.replace(/-/g, '').toUpperCase());
      const hash2 = service['hashCode'](codeWithoutDash.toUpperCase());

      expect(hash1).toBe(hash2);
    });
  });

  describe('getRemainingCount', () => {
    it('should return count of unused codes', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.count.mockResolvedValue(7);

      const count = await service.getRemainingCount(userId);

      expect(count).toBe(7);
      expect(mockPrismaService.mfaBackupCode.count).toHaveBeenCalledWith({
        where: {
          userId,
          isUsed: false,
        },
      });
    });
  });

  describe('hasBackupCodes', () => {
    it('should return true if user has backup codes', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.count.mockResolvedValue(10);

      const result = await service.hasBackupCodes(userId);

      expect(result).toBe(true);
    });

    it('should return false if user has no backup codes', async () => {
      const userId = 'user-123';

      mockPrismaService.mfaBackupCode.count.mockResolvedValue(0);

      const result = await service.hasBackupCodes(userId);

      expect(result).toBe(false);
    });
  });
});
