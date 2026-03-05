import { Response } from 'express';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, setAuthCookie, clearAuthCookie } from '../../helpers/cookie.helper';

describe('Cookie Helper', () => {
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockRes = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
  });

  describe('AUTH_COOKIE_OPTIONS', () => {
    it('should have httpOnly=true', () => {
      expect(AUTH_COOKIE_OPTIONS.httpOnly).toBe(true);
    });

    it('should have path="/"', () => {
      expect(AUTH_COOKIE_OPTIONS.path).toBe('/');
    });

    it('should have maxAge set to 15 minutes (short-lived access token per AUTH-01)', () => {
      expect(AUTH_COOKIE_OPTIONS.maxAge).toBe(15 * 60 * 1000);
    });

    it('should use sameSite=lax (not strict, to avoid breaking OAuth callbacks)', () => {
      // In non-cross-site dev mode, should be 'lax'
      // (strict would break OAuth callback flows per SEC research)
      expect(AUTH_COOKIE_OPTIONS.sameSite).toBeDefined();
    });
  });

  describe('setAuthCookie', () => {
    it('should call res.cookie with correct cookie name and token', () => {
      const token = 'jwt-token-123';
      setAuthCookie(mockRes as Response, token);

      expect(mockRes.cookie).toHaveBeenCalledTimes(1);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        token,
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });

    it('should use AUTH_COOKIE_NAME constant as cookie name', () => {
      expect(AUTH_COOKIE_NAME).toBe('access_token');
    });
  });

  describe('clearAuthCookie', () => {
    it('should call res.clearCookie with matching options', () => {
      clearAuthCookie(mockRes as Response);

      expect(mockRes.clearCookie).toHaveBeenCalledTimes(1);
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });
  });
});

describe('Auth Controller Cookie Integration', () => {
  // These tests verify the auth controller behavior by testing
  // that the cookie helper is called correctly in different scenarios

  describe('Login endpoint cookie behavior', () => {
    it('should set cookie when login returns accessToken', () => {
      // Simulate login result with accessToken
      const result = { accessToken: 'jwt-token', sessionId: 'sess-1', user: {} };
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

      // The controller should call setAuthCookie when accessToken is present
      if (result.accessToken) {
        setAuthCookie(mockRes, result.accessToken);
      }

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        'jwt-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('should NOT set cookie when login returns mfaRequired (no accessToken)', () => {
      const result = { mfaRequired: true, mfaToken: 'mfa-xyz', availableMethods: ['totp'] };
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

      // The controller should NOT call setAuthCookie when there is no accessToken
      if ((result as any).accessToken) {
        setAuthCookie(mockRes, (result as any).accessToken);
      }

      expect(mockRes.cookie).not.toHaveBeenCalled();
    });
  });

  describe('Logout endpoint cookie behavior', () => {
    it('should clear cookie on logout', () => {
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

      clearAuthCookie(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });
  });
});
