/**
 * Tests for PrismaRetryService
 *
 * Validates P2002/P2034 retry logic with exponential backoff
 */
import { PrismaRetryService, withPrismaRetry, PRISMA_RETRYABLE_CODES } from '../prisma-retry.service';
import { Prisma } from '@prisma/client';

describe('PrismaRetryService', () => {
  let service: PrismaRetryService;

  beforeEach(() => {
    service = new PrismaRetryService();
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await service.withRetry(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on P2002 (unique constraint) and succeed', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      const fn = jest
        .fn()
        .mockRejectedValueOnce(p2002Error)
        .mockResolvedValue('recovered');

      const result = await service.withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        jitter: false,
      });
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on P2034 (deadlock/write conflict) and succeed', async () => {
      const p2034Error = new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '5.0.0',
      });
      const fn = jest
        .fn()
        .mockRejectedValueOnce(p2034Error)
        .mockResolvedValue('recovered');

      const result = await service.withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        jitter: false,
      });
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on non-retryable errors', async () => {
      const genericError = new Error('Connection refused');
      const fn = jest.fn().mockRejectedValue(genericError);

      await expect(
        service.withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 }),
      ).rejects.toThrow('Connection refused');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      const fn = jest.fn().mockRejectedValue(p2002Error);

      await expect(
        service.withRetry(fn, { maxAttempts: 2, initialDelayMs: 1, jitter: false }),
      ).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle plain error objects with code property', async () => {
      const plainError = { code: 'P2034', message: 'Deadlock' };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(plainError)
        .mockResolvedValue('recovered');

      const result = await service.withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        jitter: false,
      });
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('isRetryable', () => {
    it('should return true for P2002', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      expect(service.isRetryable(error)).toBe(true);
    });

    it('should return true for P2034', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Deadlock', {
        code: 'P2034',
        clientVersion: '5.0.0',
      });
      expect(service.isRetryable(error)).toBe(true);
    });

    it('should return false for non-Prisma errors', () => {
      expect(service.isRetryable(new Error('generic'))).toBe(false);
    });

    it('should return false for non-retryable Prisma codes', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      expect(service.isRetryable(error)).toBe(false);
    });
  });

  describe('isUniqueConstraintError / isDeadlockError', () => {
    it('should identify P2002 correctly', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      expect(service.isUniqueConstraintError(error)).toBe(true);
      expect(service.isDeadlockError(error)).toBe(false);
    });

    it('should identify P2034 correctly', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Deadlock', {
        code: 'P2034',
        clientVersion: '5.0.0',
      });
      expect(service.isDeadlockError(error)).toBe(true);
      expect(service.isUniqueConstraintError(error)).toBe(false);
    });
  });

  describe('PRISMA_RETRYABLE_CODES', () => {
    it('should contain P2002 and P2034', () => {
      expect(PRISMA_RETRYABLE_CODES.P2002).toBe('P2002');
      expect(PRISMA_RETRYABLE_CODES.P2034).toBe('P2034');
    });
  });
});

describe('withPrismaRetry (standalone)', () => {
  it('should work without NestJS DI', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const result = await withPrismaRetry(fn, { maxAttempts: 2 });
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
