import axios from 'axios';
import { authClient } from '@/lib/auth-client';

// =============================================================================
// CSRF Token Management (SEC-04)
// =============================================================================
// Stored in memory, not localStorage, to prevent XSS token theft
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

const serverApiOrigin =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined);

// Browser traffic goes through the Next.js proxy so Better Auth cookies stay first-party.
export const API_BASE_URL = typeof window !== 'undefined' ? '' : serverApiOrigin;

if (typeof window === 'undefined' && !serverApiOrigin) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is not configured. Set it for the frontend proxy or rely on the default http://localhost:3000 in development.',
  );
}

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  // CRITICAL FIX: Add timeout to prevent requests hanging indefinitely
  // Increased to 90s to support RAG/AI operations
  timeout: 90000, // 90 seconds default
});

/**
 * Fetch CSRF token from backend (SEC-04)
 * Uses promise caching to prevent concurrent token fetches
 */
export async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  // Prevent concurrent token fetches
  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = apiClient
    .get('/auth/csrf-token')
    .then((res) => {
      csrfToken = res.data.csrfToken;
      csrfTokenPromise = null;
      return csrfToken!;
    })
    .catch((_err) => {
      csrfTokenPromise = null;
      //console.warn('Failed to fetch CSRF token:', err);
      return '';
    });

  return csrfTokenPromise;
}

/**
 * Clear cached CSRF token (SEC-04)
 * Call on logout or 403 response to trigger re-fetch on next request
 */
export function clearCsrfToken(): void {
  csrfToken = null;
}

/**
 * Helper to extract user-friendly error message from API errors
 * @param error - Any error (axios or otherwise)
 * @returns User-friendly error message
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // Check for new envelope error shape first: { error: { code, message, details } }
    const envelopeMessage = error.response?.data?.error?.message;
    if (envelopeMessage) {
      return typeof envelopeMessage === 'string' ? envelopeMessage : JSON.stringify(envelopeMessage);
    }
    // Fallback: legacy error shape { message }
    const serverMessage = error.response?.data?.message;
    if (serverMessage) {
      return typeof serverMessage === 'string' ? serverMessage : JSON.stringify(serverMessage);
    }
    // Check for validation errors: new shape first, then legacy
    const envelopeValidationErrors = error.response?.data?.error?.details?.fields;
    const validationErrors = Array.isArray(envelopeValidationErrors)
      ? envelopeValidationErrors
      : error.response?.data?.errors;
    if (Array.isArray(validationErrors) && validationErrors.length > 0) {
      return validationErrors.map((e: { message?: string }) => e.message || String(e)).join(', ');
    }
    // Network errors
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Network error. Please check your connection.';
    }
    // Fallback to axios message
    return error.message || 'An error occurred';
  }
  // Non-axios errors
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

// Add CSRF header to mutation requests (SEC-04)
// Auth is handled by httpOnly cookie sent automatically via withCredentials: true
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    // CSRF token for mutations (SEC-04)
    const method = config.method?.toUpperCase();
    if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrf = await getCsrfToken();
      if (csrf) {
        config.headers['X-CSRF-Token'] = csrf;
      }
    }
  }
  return config;
});

// Phase 33: Auto-unwrap API response envelope { data, meta } -> data
// MUST be registered BEFORE the 401/403 error handler
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap envelope: { data, meta } -> data
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data &&
      'meta' in response.data
    ) {
      // Store meta for optional access
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response as any)._meta = response.data.meta;
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    // Structured console logging on API errors (Phase 33: PERF-04)
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      const meta = error.response.data.meta;
      console.error('[API Error]', {
        code: apiError.code,
        requestId: meta?.requestId,
        endpoint: `${error.config?.method?.toUpperCase()} ${error.config?.url}`,
      });
    }
    return Promise.reject(error);
  },
);

// ==================== 401 SESSION EXPIRED INTERCEPTOR ====================
// With better-auth DB sessions, there is no JWT refresh flow.
// On 401, sign out and redirect to login. Session refresh is handled
// automatically by better-auth's cookieCache strategy.

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // 401 handling: sign out and redirect to login
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        authClient.signOut().then(() => {
          const returnTo = window.location.pathname;
          window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
        });
      }
      return Promise.reject(error);
    }

    // Auto-retry once on CSRF 403: clear stale token, refetch, replay request (SEC-04)
    // Only retry if error code is CSRF_TOKEN_INVALID -- non-CSRF 403s (authorization) pass through
    if (error.response?.status === 403 && !error.config._csrfRetried) {
      const errorCode = error.response?.data?.error?.code;
      if (errorCode === 'CSRF_TOKEN_INVALID') {
        clearCsrfToken();
        error.config._csrfRetried = true;
        const freshToken = await getCsrfToken();
        if (freshToken) {
          error.config.headers['X-CSRF-Token'] = freshToken;
        }
        return apiClient.request(error.config);
      }

      // Legal acceptance 403: redirect to onboarding so user can accept TOS/PP
      const message = error.response?.data?.message || error.response?.data?.error?.message || '';
      if (
        typeof window !== 'undefined' &&
        typeof message === 'string' &&
        message.includes('Terms of Service and Privacy Policy')
      ) {
        const currentPath = window.location.pathname;
        if (currentPath !== '/onboarding' && currentPath !== '/auth/login' && currentPath !== '/auth/register') {
          window.location.href = '/onboarding';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
