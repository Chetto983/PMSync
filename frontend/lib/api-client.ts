import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

// =============================================================================
// CSRF Token Management (SEC-04)
// =============================================================================
// Stored in memory, not localStorage, to prevent XSS token theft
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

const apiBaseURL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined);

export const API_BASE_URL = apiBaseURL;

if (!apiBaseURL) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is not configured. Set it in the environment or rely on the default http://localhost:3000 for development.',
  );
}

export const apiClient = axios.create({
  baseURL: `${apiBaseURL}/api/v1`,
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

// ==================== 401 REFRESH INTERCEPTOR (AUTH-04) ====================
// On 401, attempt to refresh the access token via POST /auth/refresh.
// Concurrent 401s are queued behind a single refresh call.
// If refresh fails, logout the user (no infinite loop).

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v?: unknown) => void; reject: (e?: unknown) => void }> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 401 handling: refresh-then-retry (AUTH-04)
    // Skip refresh for the refresh endpoint itself to prevent infinite loops (Pitfall 5)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        // Queue this request behind the in-progress refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => apiClient(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post('/auth/refresh');
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (typeof window !== 'undefined') {
          useAuthStore.getState().logout();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Auto-retry once on CSRF 403: clear stale token, refetch, replay request (SEC-04)
    if (error.response?.status === 403 && !error.config._csrfRetried) {
      clearCsrfToken();
      error.config._csrfRetried = true;
      const freshToken = await getCsrfToken();
      if (freshToken) {
        error.config.headers['X-CSRF-Token'] = freshToken;
      }
      return apiClient.request(error.config);
    }

    return Promise.reject(error);
  },
);
