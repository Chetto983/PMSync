import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserThrottlerGuard } from './user-throttler.guard';
import { RATE_TIER_KEY } from '../decorators/rate-tier.decorator';

/**
 * Unit tests for tier-aware UserThrottlerGuard.
 *
 * Strategy: We mock the parent ThrottlerGuard's canActivate to capture
 * which throttlers are active when it's called. The guard should filter
 * this.throttlers to a single tier before calling super.canActivate().
 */

// Helper to create a mock ExecutionContext
function createMockContext(
  overrides: {
    method?: string;
    url?: string;
    user?: { id: string } | undefined;
    tierMetadata?: string | undefined;
  } = {},
): ExecutionContext {
  const { method = 'GET', url = '/api/test', user, tierMetadata } = overrides;

  const handler = jest.fn();
  const classRef = jest.fn();

  // Set tier metadata on handler if provided
  if (tierMetadata) {
    Reflect.defineMetadata(RATE_TIER_KEY, tierMetadata, handler);
  }

  const request = { method, url, user, ip: '127.0.0.1' };

  return {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getType: () => 'http',
    getArgs: () => [request, {}],
    getArgByIndex: (idx: number) => [request, {}][idx],
    switchToRpc: () => ({ getData: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;
  let reflector: Reflector;
  let capturedThrottlers: Array<{ name: string }>;
  let parentCanActivateSpy: jest.SpyInstance;

  beforeEach(() => {
    reflector = new Reflector();

    // Create guard with minimal deps
    guard = new (UserThrottlerGuard as any)(
      {
        throttlers: [
          { name: 'read', ttl: 60000, limit: 300 },
          { name: 'safe-write', ttl: 60000, limit: 100 },
          { name: 'destructive-write', ttl: 60000, limit: 30 },
          { name: 'send', ttl: 60000, limit: 10 },
        ],
      },
      {}, // storageService (not needed for these tests)
      reflector,
    );

    // Simulate onModuleInit to populate throttlers
    (guard as any).throttlers = [
      { name: 'read', ttl: 60000, limit: 300 },
      { name: 'safe-write', ttl: 60000, limit: 100 },
      { name: 'destructive-write', ttl: 60000, limit: 30 },
      { name: 'send', ttl: 60000, limit: 10 },
    ];

    // Spy on the parent canActivate to capture which throttlers are active
    // We override the parent's canActivate to record the throttlers at call time
    capturedThrottlers = [];
    const originalProto = Object.getPrototypeOf(
      Object.getPrototypeOf(guard),
    );
    parentCanActivateSpy = jest
      .spyOn(originalProto, 'canActivate')
      .mockImplementation(async function (this: any) {
        // Capture the throttlers at time of call
        capturedThrottlers = [...(this.throttlers || [])];
        return true;
      });
  });

  afterEach(() => {
    parentCanActivateSpy.mockRestore();
  });

  it('GET request with no @RateTier -> checks only read throttler', async () => {
    const ctx = createMockContext({ method: 'GET' });
    await guard.canActivate(ctx);

    expect(capturedThrottlers).toHaveLength(1);
    expect(capturedThrottlers[0].name).toBe('read');
  });

  it('POST request with no @RateTier -> checks only safe-write throttler', async () => {
    const ctx = createMockContext({ method: 'POST' });
    await guard.canActivate(ctx);

    expect(capturedThrottlers).toHaveLength(1);
    expect(capturedThrottlers[0].name).toBe('safe-write');
  });

  it('@RateTier("send") -> checks only send throttler regardless of method', async () => {
    const ctx = createMockContext({ method: 'POST', tierMetadata: 'send' });
    await guard.canActivate(ctx);

    expect(capturedThrottlers).toHaveLength(1);
    expect(capturedThrottlers[0].name).toBe('send');
  });

  it('@RateTier("destructive-write") -> checks only destructive-write throttler', async () => {
    const ctx = createMockContext({
      method: 'DELETE',
      tierMetadata: 'destructive-write',
    });
    await guard.canActivate(ctx);

    expect(capturedThrottlers).toHaveLength(1);
    expect(capturedThrottlers[0].name).toBe('destructive-write');
  });

  it('health endpoint -> skips entirely', async () => {
    const ctx = createMockContext({ url: '/health' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    // Parent canActivate should NOT have been called
    expect(capturedThrottlers).toHaveLength(0);
  });

  it('getTracker returns user:{id} for authenticated, IP for unauthenticated', async () => {
    const tracker = (guard as any).getTracker;

    const authResult = await tracker.call(guard, {
      user: { id: 'user-123' },
      ip: '10.0.0.1',
    });
    expect(authResult).toBe('user:user-123');

    const anonResult = await tracker.call(guard, {
      ip: '10.0.0.1',
    });
    expect(anonResult).toBe('10.0.0.1');
  });

  it('HEAD and OPTIONS requests auto-assign to read tier', async () => {
    for (const method of ['HEAD', 'OPTIONS']) {
      capturedThrottlers = [];
      const ctx = createMockContext({ method });
      await guard.canActivate(ctx);

      expect(capturedThrottlers).toHaveLength(1);
      expect(capturedThrottlers[0].name).toBe('read');
    }
  });

  it('PUT and DELETE without decorator auto-assign to safe-write tier', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      capturedThrottlers = [];
      const ctx = createMockContext({ method });
      await guard.canActivate(ctx);

      expect(capturedThrottlers).toHaveLength(1);
      expect(capturedThrottlers[0].name).toBe('safe-write');
    }
  });

  it('restores full throttlers list after canActivate (no state leak)', async () => {
    const ctx = createMockContext({ method: 'GET' });
    await guard.canActivate(ctx);

    // After canActivate completes, throttlers should be restored to all 4
    expect((guard as any).throttlers).toHaveLength(4);
  });
});
