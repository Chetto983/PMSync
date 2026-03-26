import {
  getSafeReturnToPath,
  hasCompletedOnboardingCookie,
  resolvePostLoginPath,
} from '@/lib/auth-redirects';

describe('auth-redirects', () => {
  describe('getSafeReturnToPath', () => {
    it('keeps relative dashboard paths', () => {
      expect(getSafeReturnToPath('/dashboard/inbox?tab=all')).toBe('/dashboard/inbox?tab=all');
    });

    it('falls back for empty or malformed targets', () => {
      expect(getSafeReturnToPath(undefined)).toBe('/dashboard');
      expect(getSafeReturnToPath('')).toBe('/dashboard');
      expect(getSafeReturnToPath('https://evil.example/phish')).toBe('/dashboard');
      expect(getSafeReturnToPath('//evil.example/phish')).toBe('/dashboard');
    });
  });

  describe('hasCompletedOnboardingCookie', () => {
    it('detects the onboarding cookie when present', () => {
      expect(hasCompletedOnboardingCookie('foo=bar; pmsync:onboarding-complete=1; theme=dark')).toBe(true);
    });

    it('returns false when the onboarding cookie is missing', () => {
      expect(hasCompletedOnboardingCookie('foo=bar; theme=dark')).toBe(false);
    });
  });

  describe('resolvePostLoginPath', () => {
    it('routes first-login dashboard traffic to onboarding when the cookie is absent', () => {
      expect(resolvePostLoginPath('/dashboard', 'theme=dark')).toBe('/onboarding');
      expect(resolvePostLoginPath('/dashboard/inbox', '')).toBe('/onboarding');
    });

    it('preserves dashboard traffic when onboarding is already complete', () => {
      expect(resolvePostLoginPath('/dashboard', 'pmsync:onboarding-complete=1')).toBe('/dashboard');
    });

    it('preserves non-dashboard paths', () => {
      expect(resolvePostLoginPath('/settings/profile', '')).toBe('/settings/profile');
    });
  });
});
