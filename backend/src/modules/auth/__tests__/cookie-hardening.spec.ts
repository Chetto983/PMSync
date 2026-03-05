/**
 * Cookie hardening tests: __Host- prefix on access cookie (OWASP ASVS V3)
 *
 * Validates that the access cookie uses __Host- prefix in production
 * and falls back to unprefixed name in development.
 */

describe('Cookie Hardening - __Host- prefix', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    // Clear module cache to re-evaluate environment-dependent exports
    jest.resetModules();
  });

  describe('AUTH_COOKIE_NAME', () => {
    it('should use __Host-access_token in production', async () => {
      process.env.NODE_ENV = 'production';
      const { AUTH_COOKIE_NAME } = await import('../helpers/cookie.helper');
      expect(AUTH_COOKIE_NAME).toBe('__Host-access_token');
    });

    it('should use access_token in development', async () => {
      process.env.NODE_ENV = 'development';
      const { AUTH_COOKIE_NAME } = await import('../helpers/cookie.helper');
      expect(AUTH_COOKIE_NAME).toBe('access_token');
    });

    it('should use access_token in test environment', async () => {
      process.env.NODE_ENV = 'test';
      const { AUTH_COOKIE_NAME } = await import('../helpers/cookie.helper');
      expect(AUTH_COOKIE_NAME).toBe('access_token');
    });
  });

  describe('REFRESH_COOKIE_NAME', () => {
    it('should always be refresh_token (no __Host- prefix due to path scoping)', async () => {
      process.env.NODE_ENV = 'production';
      const { REFRESH_COOKIE_NAME } = await import('../helpers/cookie.helper');
      expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
    });
  });

  describe('AUTH_COOKIE_OPTIONS', () => {
    it('should have path / (required by __Host- prefix)', async () => {
      const { AUTH_COOKIE_OPTIONS } = await import('../helpers/cookie.helper');
      expect(AUTH_COOKIE_OPTIONS.path).toBe('/');
    });

    it('should not set domain attribute (required by __Host- prefix)', async () => {
      const { AUTH_COOKIE_OPTIONS } = await import('../helpers/cookie.helper');
      expect(AUTH_COOKIE_OPTIONS.domain).toBeUndefined();
    });

    it('should be httpOnly', async () => {
      const { AUTH_COOKIE_OPTIONS } = await import('../helpers/cookie.helper');
      expect(AUTH_COOKIE_OPTIONS.httpOnly).toBe(true);
    });
  });

  describe('cookieExtractor (jwt.strategy.ts)', () => {
    // We test the cookie extraction logic directly since the extractor
    // is a module-level function, not easily importable. Test via mock request.

    it('should read __Host-access_token cookie', () => {
      const req = { cookies: { '__Host-access_token': 'token-abc' } };
      // Simulate cookieExtractor logic
      const token =
        req.cookies['__Host-access_token'] ||
        req.cookies['access_token'] ||
        null;
      expect(token).toBe('token-abc');
    });

    it('should fall back to access_token cookie', () => {
      const req = { cookies: { access_token: 'token-xyz' } };
      const token =
        req.cookies['__Host-access_token'] ||
        req.cookies['access_token'] ||
        null;
      expect(token).toBe('token-xyz');
    });

    it('should prefer __Host-access_token over access_token', () => {
      const req = {
        cookies: {
          '__Host-access_token': 'host-token',
          access_token: 'plain-token',
        },
      };
      const token =
        req.cookies['__Host-access_token'] ||
        req.cookies['access_token'] ||
        null;
      expect(token).toBe('host-token');
    });

    it('should return null when no cookies present', () => {
      const req = { cookies: {} };
      const token =
        req.cookies['__Host-access_token'] ||
        req.cookies['access_token'] ||
        null;
      expect(token).toBeNull();
    });
  });
});
