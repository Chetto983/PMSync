import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';
import type { HttpError } from 'http-errors';

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET;

if (!CSRF_SECRET) {
  throw new Error('CSRF_SECRET or JWT_SECRET must be set for CSRF protection');
}

/**
 * Double Submit Cookie CSRF Protection (SEC-04)
 *
 * Uses HMAC-signed cookies for stateless CSRF validation.
 * Token is sent in X-CSRF-Token header, cookie is httpOnly.
 */
const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  // Session identifier from JWT user ID or IP as fallback for anonymous requests
  getSessionIdentifier: (req: Request) => {
    // For authenticated requests, use user ID from JWT (if available on request)
    const user = (req as any).user;
    if (user?.userId) {
      return user.userId;
    }
    // For anonymous/pre-auth requests (login, register), use IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket?.remoteAddress
      || 'anonymous';
    return ip;
  },
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-csrf' : 'csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
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
  '/api/v1/webhooks',        // Webhook endpoints use signatures
  '/api/v1/providers/oauth', // OAuth callbacks
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
    (excluded) => path === excluded || path.startsWith(excluded),
  );
}

/**
 * CSRF middleware that skips safe methods and excluded routes
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldSkipCsrf(req)) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
}

// Re-export with explicit types for TypeScript declaration files
const csrfTokenGenerator = generateCsrfToken;
const csrfInvalidTokenError: HttpError = invalidCsrfTokenError;

export { csrfTokenGenerator as generateCsrfToken, csrfInvalidTokenError as invalidCsrfTokenError };
