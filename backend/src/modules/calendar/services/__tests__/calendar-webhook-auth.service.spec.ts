import { UnauthorizedException } from '@nestjs/common';
import { CalendarWebhookAuthService } from '../calendar-webhook-auth.service';

describe('CalendarWebhookAuthService', () => {
  it('prefers the calendar-specific token and validates Google channel tokens', () => {
    const service = new CalendarWebhookAuthService({
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_CALENDAR_WEBHOOK_TOKEN') return 'calendar-secret';
        if (key === 'EMAIL_SYNC_WEBHOOK_TOKEN') return 'email-secret';
        return undefined;
      }),
    } as any);

    expect(service.getGoogleWebhookToken()).toBe('calendar-secret');
    expect(() => service.validateGoogleWebhookToken('calendar-secret')).not.toThrow();
    expect(() => service.validateGoogleWebhookToken('wrong-secret')).toThrow(
      UnauthorizedException,
    );
  });

  it('falls back to the legacy email token when no calendar token is configured', () => {
    const service = new CalendarWebhookAuthService({
      get: jest.fn((key: string) => {
        if (key === 'EMAIL_SYNC_WEBHOOK_TOKEN') return 'legacy-secret';
        return undefined;
      }),
    } as any);

    expect(service.getGoogleWebhookToken()).toBe('legacy-secret');
    expect(() => service.validateGoogleWebhookToken(undefined, undefined, 'legacy-secret')).not.toThrow();
  });
});
