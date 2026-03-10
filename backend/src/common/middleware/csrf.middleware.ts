import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';
import type { HttpError } from 'http-errors';

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.BETTER_AUTH_SECRET;

if (!CSRF_SECRET) {
  throw new Error('CSRF_SECRET or BETTER_AUTH_SECRET must be set for CSRF protection');
}

/**
 * Double Submit Cookie CSRF Protection (SEC-04)
 *
 * Uses HMAC-signed cookies for stateless CSRF validation.
 * Token is sent in X-CSRF-Token header, cookie is httpOnly.
 */
// Cross-site mode: when frontend and backend are on different domains,
// sameSite must be 'none' + secure for cookies to travel cross-origin.
const isProduction = process.env.NODE_ENV === 'production';
const frontendUrl = process.env.FRONTEND_URL || '';
const backendUrl = process.env.API_PUBLIC_URL || process.env.BETTER_AUTH_URL || '';
const isCrossSite = (() => {
  try {
    if (!frontendUrl || !backendUrl) return false;
    return new URL(frontendUrl).hostname !== new URL(backendUrl).hostname;
  } catch { return false; }
})();
const isCrossSiteDev = !isProduction && (
  ['1', 'true', 'yes'].includes((process.env.CORS_ALLOW_ALL || '').toLowerCase())
  || (process.env.API_PUBLIC_URL || '').startsWith('https')
);

const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  // Session identifier: always IP-based for consistency.
  // Use req.ip (trust-proxy aware) instead of raw X-Forwarded-For header.
  // The /auth/csrf-token endpoint runs without BetterAuthGuard, so req.user
  // is never set during token generation. Using userId here would cause a
  // mismatch between generation (IP) and validation (userId) = "invalid csrf token".
  getSessionIdentifier: (req: Request) => {
    const ip = req.ip || req.socket?.remoteAddress || 'anonymous';
    return ip;
  },
  cookieName: (isProduction && !isCrossSite) ? '__Host-csrf' : 'csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: (isCrossSite || isCrossSiteDev) ? 'none' as const : 'strict' as const,
    secure: isProduction || isCrossSiteDev || isCrossSite,
    path: '/',
    maxAge: 60 * 60 * 24 * 1000, // 24 hours in ms
  },
  getCsrfTokenFromRequest: (req: Request) => req.headers['x-csrf-token'] as string,
});

/**
 * Routes to exclude from CSRF protection
 */
const CSRF_EXCLUDED_PATHS = [
  '/health',
  '/health/ready',
  '/api/v1/auth/csrf-token', // Token fetch endpoint itself
  '/api/v1/auth/login',      // Pre-auth: no session yet to protect
  '/api/v1/auth/register',   // Pre-auth: no session yet to protect
  '/api/v1/auth/send-otp',   // Pre-auth: OTP flow before session
  '/api/v1/auth/verify-otp', // Pre-auth: OTP verification before session
  '/api/v1/auth/mfa/verify', // Pre-auth: MFA challenge verify before session
  '/api/v1/auth/forgot-password', // Pre-auth: password reset request
  '/api/v1/auth/reset-password',  // Pre-auth: password reset with token
  '/api/v1/auth/refresh',    // Token refresh uses httpOnly cookie, not session
  '/api/v1/webhooks',        // Webhook endpoints use signatures
  '/webhooks',               // Webhook endpoints excluded from global prefix
  '/api/v1/providers/oauth', // OAuth callbacks
  '/auth/gmail/callback',    // OAuth callbacks (excluded from global prefix)
  '/auth/microsoft/callback', // OAuth callbacks (excluded from global prefix)
  '/api/auth',               // better-auth handles its own CSRF via trustedOrigins
];

/**
 * Check if request should skip CSRF validation
 */
function shouldSkipCsrf(req: Request): boolean {
  // Skip safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return true;
  }

  // Skip excluded paths
  const path = req.path || req.url;
  return CSRF_EXCLUDED_PATHS.some(
    (excluded) => path === excluded || path.startsWith(`${excluded}/`),
  );
}

/**
 * CSRF middleware that skips safe methods and excluded routes
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldSkipCsrf(req)) {
    return next();
  }
  return doubleCsrfProtection(req, res, (err?: unknown) => {
    if (err) {
      if (err === invalidCsrfTokenError || (err as { code?: string })?.code === 'EBADCSRFTOKEN') {
        const csrfErr: Error & { statusCode?: number; code?: string } = new Error('Security token expired. Please retry.');
        csrfErr.statusCode = 403;
        csrfErr.code = 'CSRF_TOKEN_INVALID';
        return next(csrfErr);
      }
      return next(err);
    }
    next();
  });
}

// Re-export with explicit types for TypeScript declaration files
const csrfTokenGenerator = generateCsrfToken;
const csrfInvalidTokenError: HttpError = invalidCsrfTokenError;

export { csrfTokenGenerator as generateCsrfToken, csrfInvalidTokenError as invalidCsrfTokenError };
