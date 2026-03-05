import { Response, CookieOptions } from 'express';

/**
 * Auth cookie configuration for httpOnly JWT token storage (SEC-01, AUTH-01)
 *
 * Dual cookie strategy:
 * - access_token: 15-minute httpOnly cookie (short-lived for security)
 * - refresh_token: 7-day httpOnly cookie scoped to /api/v1/auth/refresh
 *
 * Cookie-based auth eliminates localStorage XSS attack vector.
 * Backend sets httpOnly cookies on auth success; frontend never touches tokens.
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

// ==================== ACCESS TOKEN COOKIE (15m) ====================

export const AUTH_COOKIE_NAME = isProduction ? '__Host-access_token' : 'access_token';

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction || isCrossSiteDev,
  sameSite: isCrossSiteDev ? 'none' : 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes (AUTH-01: short-lived access tokens)
};

/**
 * Set httpOnly access token cookie on the response.
 * Call this after any successful auth that produces an accessToken.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

/**
 * Clear the httpOnly access token cookie.
 * Call this on logout. Options must match setAuthCookie for browsers to clear it.
 */
export function clearAuthCookie(res: Response): void {
  const { maxAge: _maxAge, ...clearOptions } = AUTH_COOKIE_OPTIONS;
  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
}

// ==================== REFRESH TOKEN COOKIE (7d) ====================

export const REFRESH_COOKIE_NAME = 'refresh_token';

export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction || isCrossSiteDev,
  sameSite: isCrossSiteDev ? 'none' : 'lax',
  path: '/api/v1/auth/refresh', // Only sent to the refresh endpoint
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Set httpOnly refresh token cookie on the response.
 * Scoped to /api/v1/auth/refresh path for minimal exposure.
 */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

/**
 * Clear the httpOnly refresh token cookie.
 * Call this on logout alongside clearAuthCookie.
 */
export function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...clearOptions } = REFRESH_COOKIE_OPTIONS;
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
}
