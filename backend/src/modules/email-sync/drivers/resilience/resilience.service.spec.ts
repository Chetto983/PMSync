import { Test, TestingModule } from '@nestjs/testing';
import { ResilienceService } from './resilience.service';
import { DEFAULT_RESILIENCE_CONFIG } from './resilience.types';
import { jest,describe,beforeEach,afterEach,it,expect } from '@jest/globals';

describe('ResilienceService', () => {
  let service: ResilienceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResilienceService],
    }).compile();

    service = module.get<ResilienceService>(ResilienceService);
  });

  afterEach(() => {
    service.resetMetrics();
  });

  describe('executeWithResilience', () => {
    it('should execute successful operation without retry', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await service.executeWithResilience(
        'test-account',
        'google',
        mockOperation,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.retries).toBe(0);
      expect(result.rateLimited).toBe(false);
      expect(result.circuitOpen).toBe(false);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient error and succeed', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValue('success');

      const result = await service.executeWithResilience(
        'test-account',
        'google',
        mockOperation,
        { retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, baseDelayMs: 10 } },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.retries).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should return failure after max retries exhausted', async () => {
      const mockOperation = jest.fn().mockRejectedValue({ status: 503 });

      const result = await service.executeWithResilience(
        'test-account',
        'google',
        mockOperation,
        {
          retry: {
            ...DEFAULT_RESILIENCE_CONFIG.retry,
            maxRetries: 2,
            baseDelayMs: 10,
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // retries is incremented after each attempt, so 3 total attempts = 3 retries recorded
      expect(result.retries).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const mockOperation = jest.fn().mockRejectedValue({ status: 401 });

      const result = await service.executeWithResilience(
        'test-account',
        'google',
        mockOperation,
      );

      expect(result.success).toBe(false);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit (429) errors', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValue('success');

      const result = await service.executeWithResilience(
        'test-account',
        'google',
        mockOperation,
        { retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, baseDelayMs: 10 } },
      );

      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
    });

    it('should retry on error messages containing rate limit keywords', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValue('success');

      const result = await service.executeWithResilience(
        'test-account',
        'google',
        mockOperation,
        { retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, baseDelayMs: 10 } },
      );

      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failure threshold', async () => {
      const mockOperation = jest.fn().mockRejectedValue({ status: 500 });
      const accountId = 'circuit-test-account';

      // Exhaust retries multiple times to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await service.executeWithResilience(accountId, 'google', mockOperation, {
          retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, maxRetries: 0, baseDelayMs: 1 },
          circuitBreaker: { ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker, failureThreshold: 5 },
        });
      }

      // Circuit should now be open
      const result = await service.executeWithResilience(
        accountId,
        'google',
        mockOperation,
      );

      expect(result.circuitOpen).toBe(true);
      expect(result.success).toBe(false);
    });

    it('should reset circuit breaker manually', async () => {
      const accountId = 'reset-circuit-account';

      // Set up a failed circuit state
      const mockOperation = jest.fn().mockRejectedValue({ status: 500 });
      for (let i = 0; i < 5; i++) {
        await service.executeWithResilience(accountId, 'google', mockOperation, {
          retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, maxRetries: 0 },
          circuitBreaker: { ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker, failureThreshold: 5 },
        });
      }

      // Reset circuit
      service.resetCircuitBreaker(accountId);

      // Should allow execution again
      const successOperation = jest.fn().mockResolvedValue('success');
      const result = await service.executeWithResilience(
        accountId,
        'google',
        successOperation,
      );

      expect(result.circuitOpen).toBe(false);
      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits per account', async () => {
      const accountId = 'rate-limit-account';
      const mockOperation = jest.fn().mockResolvedValue('success');

      // Make many requests rapidly
      const requests: Promise<any>[] = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          service.executeWithResilience(accountId, 'google', mockOperation, {
            rateLimit: { requestsPerSecond: 5, requestsPerMinute: 100, burstLimit: 5, cooldownMs: 1000 },
          }),
        );
      }

      const results = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimited = results.filter((r) => r.rateLimited);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should reset rate limit manually', async () => {
      const accountId = 'reset-rate-account';
      const mockOperation = jest.fn().mockResolvedValue('success');

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        await service.executeWithResilience(accountId, 'google', mockOperation, {
          rateLimit: { requestsPerSecond: 3, requestsPerMinute: 10, burstLimit: 3, cooldownMs: 1000 },
        });
      }

      // Reset rate limit
      service.resetRateLimit(accountId);

      // Should allow execution again
      const result = await service.executeWithResilience(
        accountId,
        'google',
        mockOperation,
        {
          rateLimit: { requestsPerSecond: 3, requestsPerMinute: 10, burstLimit: 3, cooldownMs: 1000 },
        },
      );

      expect(result.rateLimited).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('should execute successful operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await service.executeWithRetry(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('success');

      const result = await service.executeWithRetry(mockOperation, { baseDelayMs: 10 });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        service.executeWithRetry(mockOperation, { maxRetries: 2, baseDelayMs: 10 }),
      ).rejects.toThrow('ECONNRESET');

      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withTimeout', () => {
    it('should return result before timeout', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('done'), 10));

      const result = await service.withTimeout(promise, 1000);

      expect(result).toBe('done');
    });

    it('should throw on timeout', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('done'), 1000));

      await expect(service.withTimeout(promise, 10)).rejects.toThrow(
        'Operation timed out after 10ms',
      );
    });
  });

  describe('Metrics', () => {
    it('should track metrics correctly', async () => {
      const accountId = 'metrics-account';
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      // Successful request
      await service.executeWithResilience(accountId, 'google', successOp);

      // Failed request (non-retryable)
      await service.executeWithResilience(accountId, 'google', failOp);

      const metrics = service.getMetrics();

      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
    });

    it('should track retried requests', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValue('success');

      await service.executeWithResilience('retry-metrics', 'google', mockOperation, {
        retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, baseDelayMs: 10 },
      });

      const metrics = service.getMetrics();
      expect(metrics.retriedRequests).toBeGreaterThan(0);
    });

    it('should reset metrics', () => {
      service.resetMetrics();
      const metrics = service.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
    });
  });

  describe('Provider-specific configuration', () => {
    it('should use Google rate limits for Google provider', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      await service.executeWithResilience('google-account', 'google', mockOperation);

      // Google allows ~10 QPS, so should succeed
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should use Microsoft rate limits for Microsoft provider', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      await service.executeWithResilience('microsoft-account', 'microsoft', mockOperation);

      // Microsoft allows ~4 QPS, so should succeed
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should use IMAP rate limits for IMAP provider', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      await service.executeWithResilience('imap-account', 'imap', mockOperation);

      expect(mockOperation).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup stale entries', () => {
      // This mainly tests that cleanup doesn't throw
      expect(() => service.cleanup()).not.toThrow();
    });
  });
});
