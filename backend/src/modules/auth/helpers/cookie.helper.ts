import { Response, CookieOptions } from 'express';

/**
 * Auth cookie configuration for httpOnly JWT token storage (SEC-01)
 *
 * Cookie-based auth eliminates localStorage XSS attack vector.
 * Backend sets httpOnly cookie on auth success; frontend never touches the token.
 *
 * sameSite: 'lax' (not 'strict') to avoid breaking OAuth callback flows.
 * In cross-site dev mode (ngrok/HTTPS proxy), uses 'none' + secure.
 */

// Cross-site dev detection: reuse same pattern as csrf.middleware.ts
const isProduction = process.env.NODE_ENV === 'production';
const isCrossSiteDev =
  !isProduction &&
  (['1', 'true', 'yes'].includes(
    (process.env.CORS_ALLOW_ALL || '').toLowerCase(),
  ) ||
    (process.env.API_PUBLIC_URL || '').startsWith('https'));

export const AUTH_COOKIE_NAME = 'access_token';

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction || isCrossSiteDev,
  sameSite: isCrossSiteDev ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches session TTL)
};

/**
 * Set httpOnly auth cookie on the response.
 * Call this after any successful auth that produces an accessToken.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

/**
 * Clear the httpOnly auth cookie.
 * Call this on logout. Options must match setAuthCookie for browsers to clear it.
 */
export function clearAuthCookie(res: Response): void {
  // clearCookie needs matching path and domain; maxAge is not needed
  const { maxAge: _maxAge, ...clearOptions } = AUTH_COOKIE_OPTIONS;
  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
}
