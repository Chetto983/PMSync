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
});

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
