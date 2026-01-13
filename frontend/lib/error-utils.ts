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
import { getTranslations, type AppTranslations } from '@/locales';
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
  SERVER_ERROR: 'serverErrorMessage',

  // Auth errors
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  SESSION_EXPIRED: 'sessionExpired',

  // Resource errors
  NOT_FOUND: 'notFoundMessage',
  CONFLICT: 'conflict',
  VALIDATION_ERROR: 'validationError',

  // Rate limiting
  TOO_MANY_REQUESTS: 'tooManyRequests',

  // Generic
  UNKNOWN: 'unknownError',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

const fallbackTranslations = getTranslations('en');

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

  if (error instanceof Error && error.message) {
    const message = error.message.toLowerCase();
    if (message.includes('network error') || message.includes('econnrefused')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('etimedout') || message.includes('timeout')) {
      return 'TIMEOUT';
    }
  }

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
  const translations = t ?? fallbackTranslations;

  // Check status code first for errors we want to translate (not use backend message)
  if (isAxiosError(error) && error.response?.status) {
    const status = error.response.status;
    // For rate limiting (429), always use translated message, not backend "ThrottlerException" text
    if (status === 429) {
      const tooManyRequestsMsg = translations.errors?.tooManyRequests;
      if (typeof tooManyRequestsMsg === 'string') {
        return tooManyRequestsMsg;
      }
      return fallbackTranslations.errors.tooManyRequests as string;
    }
  }

  // If it's an Axios error, try to use backend message or translate known messages
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data;

    // Backend returns { message: string } or { error: string }
    if (typeof data.message === 'string' && data.message.length > 0) {
      // Map known backend error messages to i18n keys
      const knownMessages: Record<string, string> = {
        'Invalid credentials': 'invalidCredentials',
      };
      const i18nKey = knownMessages[data.message];
      if (i18nKey && translations.errors && typeof (translations.errors as Record<string, unknown>)[i18nKey] === 'string') {
        return (translations.errors as Record<string, unknown>)[i18nKey] as string;
      }
      return data.message;
    }
    if (typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  }

  const errorCode = getErrorCode(error);
  const i18nKey = ERROR_CODES[errorCode];

  // Try to get translated message
  if (translations.errors && typeof translations.errors === 'object' && i18nKey in translations.errors) {
    const errorValue = (translations.errors as Record<string, unknown>)[i18nKey];
    // Only use string values, skip nested objects like notFound: { title, subtitle, ... }
    if (typeof errorValue === 'string') {
      return errorValue;
    }
  }

  // Fallback to default locale strings
  const fallback = (fallbackTranslations.errors as Record<string, unknown>)[i18nKey];
  if (typeof fallback === 'string') {
    return fallback;
  }
  return fallbackTranslations.errors.unknownError;
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
    const defaultMessage = (() => {
      const key = ERROR_CODES[code];
      const value = (fallbackTranslations.errors as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : fallbackTranslations.errors.unknownError;
    })();

    super(message || defaultMessage);
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
