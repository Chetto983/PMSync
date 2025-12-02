import { UnauthorizedException } from '@nestjs/common';
import { SyncAuthService } from './sync-auth.service';

const configWith = (values: Record<string, any>) =>
  ({
    get: (key: string) => values[key],
  } as any);

describe('SyncAuthService', () => {
  it('throws on missing tokens when strict mode is enabled', () => {
    const service = new SyncAuthService(
      configWith({
        EMAIL_SYNC_REQUIRE_TOKENS: 'true',
      }),
    );

    expect(() => service.onModuleInit()).toThrow(UnauthorizedException);
  });

  it('allows startup without tokens when strict is disabled but validates when set', () => {
    const service = new SyncAuthService(
      configWith({
        EMAIL_SYNC_WEBHOOK_TOKEN: 'abc',
        EMAIL_SYNC_WORKER_TOKEN: 'xyz',
      }),
    );

    expect(() => service.onModuleInit()).not.toThrow();

    expect(() => service.validateWebhookToken('abc')).not.toThrow();
    expect(() => service.validateJobToken('xyz')).not.toThrow();
    expect(() => service.validateJobToken('bad')).toThrow(UnauthorizedException);
  });
});
