/**
 * Error Utils Tests
 *
 * Tests for centralized error handling utilities.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Test mocks require any for flexibility */
import { AxiosError, AxiosHeaders } from 'axios';
import {
  getErrorMessage,
  getErrorCode,
  handleApiError,
  isAxiosError,
  isNetworkError,
  isTimeoutError,
  ERROR_CODES,
  AppError,
  type ApiErrorResponse,
} from './error-utils';

// Mock the logger to prevent console output during tests
jest.mock('./logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('error-utils', () => {
  describe('isAxiosError', () => {
    it('should return true for Axios errors', () => {
      const axiosError = new AxiosError('Test error');
      expect(isAxiosError(axiosError)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const regularError = new Error('Test error');
      expect(isAxiosError(regularError)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAxiosError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAxiosError(undefined)).toBe(false);
    });

    it('should return false for strings', () => {
      expect(isAxiosError('error string')).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should return true for network errors (no response)', () => {
      const networkError = new AxiosError('Network Error');
      // Network errors have no response
      expect(isNetworkError(networkError)).toBe(true);
    });

    it('should return false for errors with response', () => {
      const error = new AxiosError('Server Error');
      error.response = {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {},
      };
      expect(isNetworkError(error)).toBe(false);
    });

    it('should return false for timeout errors', () => {
      const timeoutError = new AxiosError('timeout of 1000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      expect(isNetworkError(timeoutError)).toBe(false);
    });

    it('should return false for non-Axios errors', () => {
      expect(isNetworkError(new Error('Test'))).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('should return true for ECONNABORTED errors', () => {
      const timeoutError = new AxiosError('timeout');
      timeoutError.code = 'ECONNABORTED';
      expect(isTimeoutError(timeoutError)).toBe(true);
    });

    it('should return true for errors with timeout in message', () => {
      const timeoutError = new AxiosError('Request timeout exceeded');
      expect(isTimeoutError(timeoutError)).toBe(true);
    });

    it('should return false for network errors', () => {
      const networkError = new AxiosError('Network Error');
      expect(isTimeoutError(networkError)).toBe(false);
    });

    it('should return false for non-Axios errors', () => {
      expect(isTimeoutError(new Error('timeout'))).toBe(false);
    });
  });

  describe('getErrorCode', () => {
    it('should return NETWORK_ERROR for network errors', () => {
      const networkError = new AxiosError('Network Error');
      expect(getErrorCode(networkError)).toBe('NETWORK_ERROR');
    });

    it('should return TIMEOUT for timeout errors', () => {
      const timeoutError = new AxiosError('timeout');
      timeoutError.code = 'ECONNABORTED';
      expect(getErrorCode(timeoutError)).toBe('TIMEOUT');
    });

    it('should return UNAUTHORIZED for 401 status', () => {
      const error = createAxiosErrorWithStatus(401);
      expect(getErrorCode(error)).toBe('UNAUTHORIZED');
    });

    it('should return FORBIDDEN for 403 status', () => {
      const error = createAxiosErrorWithStatus(403);
      expect(getErrorCode(error)).toBe('FORBIDDEN');
    });

    it('should return NOT_FOUND for 404 status', () => {
      const error = createAxiosErrorWithStatus(404);
      expect(getErrorCode(error)).toBe('NOT_FOUND');
    });

    it('should return CONFLICT for 409 status', () => {
      const error = createAxiosErrorWithStatus(409);
      expect(getErrorCode(error)).toBe('CONFLICT');
    });

    it('should return TOO_MANY_REQUESTS for 429 status', () => {
      const error = createAxiosErrorWithStatus(429);
      expect(getErrorCode(error)).toBe('TOO_MANY_REQUESTS');
    });

    it('should return SERVER_ERROR for 500 status', () => {
      const error = createAxiosErrorWithStatus(500);
      expect(getErrorCode(error)).toBe('SERVER_ERROR');
    });

    it('should return SERVER_ERROR for 502 status', () => {
      const error = createAxiosErrorWithStatus(502);
      expect(getErrorCode(error)).toBe('SERVER_ERROR');
    });

    it('should return SERVER_ERROR for 503 status', () => {
      const error = createAxiosErrorWithStatus(503);
      expect(getErrorCode(error)).toBe('SERVER_ERROR');
    });

    it('should return VALIDATION_ERROR for 400 status', () => {
      const error = createAxiosErrorWithStatus(400);
      expect(getErrorCode(error)).toBe('VALIDATION_ERROR');
    });

    it('should return UNKNOWN for unrecognized status codes', () => {
      const error = createAxiosErrorWithStatus(418); // I'm a teapot
      expect(getErrorCode(error)).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for non-Axios errors', () => {
      expect(getErrorCode(new Error('Test'))).toBe('UNKNOWN');
    });
  });

  describe('getErrorMessage', () => {
    it('should return default message for network errors', () => {
      const networkError = new AxiosError('Network Error');
      const message = getErrorMessage(networkError);
      expect(message).toBe('Unable to connect to server. Please check your internet connection.');
    });

    it('should return default message for timeout errors', () => {
      const timeoutError = new AxiosError('timeout');
      timeoutError.code = 'ECONNABORTED';
      const message = getErrorMessage(timeoutError);
      expect(message).toBe('Request timed out. Please try again.');
    });

    it('should return backend message if available', () => {
      const error = createAxiosErrorWithStatus(400, { message: 'Invalid email format' });
      const message = getErrorMessage(error);
      expect(message).toBe('Invalid email format');
    });

    it('should return backend error field if message is not available', () => {
      const error = createAxiosErrorWithStatus(400, { error: 'Validation failed' });
      const message = getErrorMessage(error);
      expect(message).toBe('Validation failed');
    });

    it('should use i18n translations when provided', () => {
      const error = createAxiosErrorWithStatus(401);
      const translations = {
        errors: {
          unauthorized: 'La tua sessione è scaduta. Accedi di nuovo.',
        },
      };
      const message = getErrorMessage(error, translations as any);
      expect(message).toBe('La tua sessione è scaduta. Accedi di nuovo.');
    });

    it('should skip nested object translations', () => {
      const error = createAxiosErrorWithStatus(404);
      const translations = {
        errors: {
          notFoundMessage: {
            title: '404',
            subtitle: 'Not Found',
          },
        },
      };
      const message = getErrorMessage(error, translations as any);
      // Should fall back to default since notFoundMessage is an object, not a string
      expect(message).toBe('The requested resource was not found.');
    });

    it('should return default unknown error for unrecognized errors', () => {
      const message = getErrorMessage('some string error');
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });

    it('should handle errors with Network Error in message', () => {
      const error = new Error('Network Error');
      const message = getErrorMessage(error);
      expect(message).toBe('Unable to connect to server. Please check your internet connection.');
    });

    it('should handle errors with ECONNREFUSED in message', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const message = getErrorMessage(error);
      expect(message).toBe('Unable to connect to server. Please check your internet connection.');
    });
  });

  describe('handleApiError', () => {
    it('should return message and code', () => {
      const error = createAxiosErrorWithStatus(404);
      const result = handleApiError('TestContext', error);

      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toBe('The requested resource was not found.');
    });

    it('should log the error', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('./logger');
      const error = createAxiosErrorWithStatus(500);

      handleApiError('TestContext', error);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should use translations when provided', () => {
      const error = createAxiosErrorWithStatus(403);
      const translations = {
        errors: {
          forbidden: 'Accesso negato',
        },
      };
      const result = handleApiError('TestContext', error, translations as any);

      expect(result.code).toBe('FORBIDDEN');
      expect(result.message).toBe('Accesso negato');
    });
  });

  describe('AppError', () => {
    it('should create an error with code and default message', () => {
      const error = new AppError('NOT_FOUND');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('The requested resource was not found.');
      expect(error.name).toBe('AppError');
    });

    it('should create an error with code and custom message', () => {
      const error = new AppError('NOT_FOUND', 'User not found');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
    });

    it('should be an instance of Error', () => {
      const error = new AppError('UNKNOWN');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ERROR_CODES', () => {
    it('should have all expected error codes', () => {
      expect(ERROR_CODES.NETWORK_ERROR).toBe('networkError');
      expect(ERROR_CODES.TIMEOUT).toBe('timeoutError');
      expect(ERROR_CODES.SERVER_ERROR).toBe('serverErrorMessage');
      expect(ERROR_CODES.UNAUTHORIZED).toBe('unauthorized');
      expect(ERROR_CODES.FORBIDDEN).toBe('forbidden');
      expect(ERROR_CODES.SESSION_EXPIRED).toBe('sessionExpired');
      expect(ERROR_CODES.NOT_FOUND).toBe('notFoundMessage');
      expect(ERROR_CODES.CONFLICT).toBe('conflict');
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('validationError');
      expect(ERROR_CODES.TOO_MANY_REQUESTS).toBe('tooManyRequests');
      expect(ERROR_CODES.UNKNOWN).toBe('unknownError');
    });
  });
});

// Helper function to create Axios errors with specific status codes
function createAxiosErrorWithStatus(
  status: number,
  data: Partial<ApiErrorResponse> = {}
): AxiosError<ApiErrorResponse> {
  const error = new AxiosError<ApiErrorResponse>(`Request failed with status ${status}`);
  error.response = {
    status,
    statusText: getStatusText(status),
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: data as ApiErrorResponse,
  };
  return error;
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    418: "I'm a teapot",
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusTexts[status] || 'Unknown';
}
