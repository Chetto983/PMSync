import { RATE_TIER_KEY, RateTierDecorator } from './rate-tier.decorator';

describe('RateTierDecorator', () => {
  it('should set metadata RATE_TIER_KEY="send" on handler', () => {
    class TestController {
      @RateTierDecorator('send')
      handler() {}
    }
    const metadata = Reflect.getMetadata(
      RATE_TIER_KEY,
      TestController.prototype.handler,
    );
    expect(metadata).toBe('send');
  });

  it('should set metadata RATE_TIER_KEY="read" on handler', () => {
    class TestController {
      @RateTierDecorator('read')
      handler() {}
    }
    const metadata = Reflect.getMetadata(
      RATE_TIER_KEY,
      TestController.prototype.handler,
    );
    expect(metadata).toBe('read');
  });

  it('should set metadata RATE_TIER_KEY="safe-write" on handler', () => {
    class TestController {
      @RateTierDecorator('safe-write')
      handler() {}
    }
    const metadata = Reflect.getMetadata(
      RATE_TIER_KEY,
      TestController.prototype.handler,
    );
    expect(metadata).toBe('safe-write');
  });

  it('should set metadata RATE_TIER_KEY="destructive-write" on handler', () => {
    class TestController {
      @RateTierDecorator('destructive-write')
      handler() {}
    }
    const metadata = Reflect.getMetadata(
      RATE_TIER_KEY,
      TestController.prototype.handler,
    );
    expect(metadata).toBe('destructive-write');
  });
});
