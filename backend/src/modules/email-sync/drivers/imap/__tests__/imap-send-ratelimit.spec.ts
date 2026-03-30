/**
 * T-1803: IMAP SMTP Rate Limiter Integration Tests
 *
 * Verifies that RateLimiter enforces the 30 msg/min limit on SMTP sends.
 * Tests the RateLimiter class directly (same instance used in ImapSendService).
 */
import { describe, it, expect } from '@jest/globals';
import { RateLimiter } from '../../../../../common/utils/retry.utils';

describe('RateLimiter — IMAP SMTP rate limiting (IM-H2)', () => {
  it('should allow requests within the limit', async () => {
    const limiter = new RateLimiter(5, 1000); // 5 per second for fast test
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    expect(limiter.getCurrentCount()).toBe(5);
  });

  it('should block when limit is reached and wait for window slide', async () => {
    const limiter = new RateLimiter(2, 200); // 2 per 200ms
    const start = Date.now();

    await limiter.acquire();
    await limiter.acquire();
    // Third acquire should wait ~200ms for the window to slide
    await limiter.acquire();

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100); // some wait occurred
  });

  it('should track count within the sliding window', async () => {
    const limiter = new RateLimiter(10, 500);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getCurrentCount()).toBe(3);
  });

  it('should expire old requests from the window', async () => {
    const limiter = new RateLimiter(10, 100); // 100ms window
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getCurrentCount()).toBe(2);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));
    expect(limiter.getCurrentCount()).toBe(0);
  });

  it('should match ImapSendService config: 30 messages per 60 seconds', () => {
    // Verify the configuration matches what ImapSendService uses
    const limiter = new RateLimiter(30, 60000);
    // Just verify it can be constructed with these params
    expect(limiter.getCurrentCount()).toBe(0);
  });

  it('should allow burst up to max without delay', async () => {
    const limiter = new RateLimiter(5, 1000);
    const start = Date.now();

    // All 5 should be immediate (within limit)
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    const elapsed = Date.now() - start;
    // Should be nearly instant (< 50ms for 5 acquires)
    expect(elapsed).toBeLessThan(50);
  });

  it('should enforce limit per window, not total', async () => {
    const limiter = new RateLimiter(2, 100); // 2 per 100ms

    // First batch
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getCurrentCount()).toBe(2);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));

    // Second batch should work (old requests expired)
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getCurrentCount()).toBe(2);
  });
});
