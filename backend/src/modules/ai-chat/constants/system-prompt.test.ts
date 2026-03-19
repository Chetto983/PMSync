import { describe, expect, it } from 'vitest';
import { buildExtendedRuntimeContext } from './system-prompt';

describe('buildExtendedRuntimeContext', () => {
  it('includes user identity and saved AI profile preferences', () => {
    const context = buildExtendedRuntimeContext({
      timezone: 'Europe/Rome',
      providerType: 'google',
      locale: 'it',
      displayName: 'Davide Marchetto',
      jobTitle: 'Developer',
      communicationStyle: 'CASUAL',
      responseLength: 'MODERATE',
      proactivityLevel: 'HIGH',
    });

    expect(context).toContain('Authenticated user: Davide Marchetto');
    expect(context).toContain('Profile role/title: Developer');
    expect(context).toContain('Preferred communication style: CASUAL');
    expect(context).toContain('Preferred response length: MODERATE');
    expect(context).toContain('Preferred proactivity level: HIGH');
    expect(context).toContain('Email provider: google');
    expect(context).toContain('User locale: it');
  });
});
