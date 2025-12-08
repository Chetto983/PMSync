/**
 * Error Handling Utilities
 *
 * Centralized error handling for API calls with user-friendly messages.
 * Supports i18n error messages and structured error responses.
 *
 * @example
 * ```tsx
 * try {
 *   await emailApi.deleteEmail(id);
 * } catch (error) {
 *   const message = getErrorMessage(error, t);
 *   showSnackbar(message, 'error');
 * }
 * ```
 */
import { AxiosError } from 'axios';
import type { AppTranslations } from '@/locales';
import { logger } from './logger';

/**
 * Standard API error response structure from backend
 */
export interface ApiErrorResponse {
  message: string;
  error?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

/**
 * Error codes mapped to i18n keys
 */
export const ERROR_CODES = {
  // Network errors
  NETWORK_ERROR: 'networkError',
  TIMEOUT: 'timeoutError',
  SERVER_ERROR: 'serverError',

  // Auth errors
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  SESSION_EXPIRED: 'sessionExpired',

  // Resource errors
  NOT_FOUND: 'notFound',
  CONFLICT: 'conflict',
  VALIDATION_ERROR: 'validationError',

  // Rate limiting
  TOO_MANY_REQUESTS: 'tooManyRequests',

  // Generic
  UNKNOWN: 'unknownError',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Default error messages (fallback when no translations available)
 */
const DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  networkError: 'Unable to connect to server. Please check your internet connection.',
  timeoutError: 'Request timed out. Please try again.',
  serverError: 'Server error. Please try again later.',
  unauthorized: 'Your session has expired. Please log in again.',
  forbidden: 'You do not have permission to perform this action.',
  sessionExpired: 'Your session has expired. Please log in again.',
  notFound: 'The requested resource was not found.',
  conflict: 'This action conflicts with another operation. Please refresh and try again.',
  validationError: 'Please check your input and try again.',
  tooManyRequests: 'Too many requests. Please wait a moment and try again.',
  unknownError: 'An unexpected error occurred. Please try again.',
};

/**
 * Map HTTP status codes to error codes
 */
function getErrorCodeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'SERVER_ERROR';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Check if error is an Axios error
 */
export function isAxiosError(error: unknown): error is AxiosError<ApiErrorResponse> {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Check if error is a network error (no response from server)
 */
export function isNetworkError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  return !error.response && error.code !== 'ECONNABORTED';
}

/**
 * Check if error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  return error.code === 'ECONNABORTED' || error.message?.includes('timeout');
}

/**
 * Get error code from error object
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (isNetworkError(error)) return 'NETWORK_ERROR';
  if (isTimeoutError(error)) return 'TIMEOUT';

  if (isAxiosError(error) && error.response) {
    return getErrorCodeFromStatus(error.response.status);
  }

  return 'UNKNOWN';
}

/**
 * Extract error message from various error formats
 *
 * @param error - The error object
 * @param t - Optional translations object for i18n support
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown, t?: AppTranslations): string {
  const errorCode = getErrorCode(error);
  const i18nKey = ERROR_CODES[errorCode];

  // Try to get translated message
  if (t?.errors && typeof t.errors === 'object' && i18nKey in t.errors) {
    const errorValue = (t.errors as Record<string, unknown>)[i18nKey];
    // Only use string values, skip nested objects like notFound: { title, subtitle, ... }
    if (typeof errorValue === 'string') {
      return errorValue;
    }
  }

  // If it's an Axios error, try to use backend message
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data;

    // Backend returns { message: string } or { error: string }
    if (typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
    if (typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  }

  // If it's a regular Error object
  if (error instanceof Error && error.message) {
    // Don't expose technical error messages to users
    if (
      error.message.includes('Network Error') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return DEFAULT_ERROR_MESSAGES.networkError;
    }
  }

  // Fallback to default message
  return DEFAULT_ERROR_MESSAGES[i18nKey] || DEFAULT_ERROR_MESSAGES.unknownError;
}

/**
 * Log error with context for debugging
 */
export function logError(
  context: string,
  error: unknown,
  additionalData?: Record<string, unknown>
): void {
  const errorCode = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  logger.error(`[${context}] ${errorCode}`, {
    message,
    errorCode,
    ...additionalData,
    ...(isAxiosError(error) && {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
    }),
  });
}

/**
 * Handle API error with logging and message extraction
 *
 * @param context - Context string for logging (e.g., 'EmailActions.delete')
 * @param error - The error object
 * @param t - Optional translations object
 * @returns Object with error message and code
 */
export function handleApiError(
  context: string,
  error: unknown,
  t?: AppTranslations
): { message: string; code: ErrorCode } {
  logError(context, error);

  return {
    message: getErrorMessage(error, t),
    code: getErrorCode(error),
  };
}

/**
 * Create a typed error for throwing
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string
  ) {
    super(message || DEFAULT_ERROR_MESSAGES[ERROR_CODES[code]]);
    this.name = 'AppError';
  }
}

const errorUtils = {
  getErrorMessage,
  getErrorCode,
  handleApiError,
  logError,
  isAxiosError,
  isNetworkError,
  isTimeoutError,
  ERROR_CODES,
  AppError,
};

export default errorUtils;
