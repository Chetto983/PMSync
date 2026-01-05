import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

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
  baseURL: apiBaseURL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  withCredentials: true,
  // CRITICAL FIX: Add timeout to prevent requests hanging indefinitely
  // Increased to 90s to support RAG/AI operations
  timeout: 90000, // 90 seconds default
});

/**
 * Helper to extract user-friendly error message from API errors
 * @param error - Any error (axios or otherwise)
 * @returns User-friendly error message
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // Check for server error message
    const serverMessage = error.response?.data?.message;
    if (serverMessage) {
      return typeof serverMessage === 'string' ? serverMessage : JSON.stringify(serverMessage);
    }
    // Check for validation errors array
    const validationErrors = error.response?.data?.errors;
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

// Add token to requests
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // Read token from Zustand persist storage (auth-storage)
    // Format: {"state":{"token":"..."},"version":0}
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  }
  return config;
});

// Handle token expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        useAuthStore.getState().logout();
        // Don't redirect here - let the RouteGuard in _app.tsx handle it
        // This preserves the 'next' parameter for OAuth callbacks
      }
    }
    return Promise.reject(error);
  },
);
