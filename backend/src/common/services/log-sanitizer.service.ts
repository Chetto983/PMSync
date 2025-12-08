import { Injectable } from '@nestjs/common';

/**
 * Log Sanitizer Service
 *
 * Removes sensitive data from objects before logging.
 * Prevents accidental exposure of tokens, passwords, and email content.
 *
 * Based on security best practices:
 * https://dev.to/drbenzene/best-security-implementation-practices-in-nestjs-a-comprehensive-guide-2p88
 */
@Injectable()
export class LogSanitizerService {
  private readonly sensitiveFields = [
    // Authentication tokens
    'password',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',

    // Encryption keys/IVs
    'iv',
    'encryptionIv',
    'tokenEncryptionIv',
    'refreshTokenEncryptionIv',
    'imapEncryptionIv',
    'smtpEncryptionIv',
    'caldavEncryptionIv',
    'carddavEncryptionIv',

    // Passwords
    'imapPassword',
    'smtpPassword',
    'caldavPassword',
    'carddavPassword',

    // Email content (can contain PII)
    'body',
    'htmlBody',
    'textBody',
    'emailBody',
    'content',
    'snippet',

    // Personal identifiable information
    'ssn',
    'socialSecurityNumber',
    'creditCard',
    'cardNumber',
    'cvv',
    'pin',
  ];

  private readonly redactedValue = '[REDACTED]';
  private readonly maxDepth = 10;

  /**
   * Sanitize an object by removing sensitive fields
   * @param obj - Object to sanitize
   * @param depth - Current recursion depth (internal use)
   * @returns Sanitized copy of the object
   */
  sanitize<T>(obj: T, depth = 0): T {
    if (depth > this.maxDepth) {
      return '[MAX_DEPTH_EXCEEDED]' as unknown as T;
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item, depth + 1)) as unknown as T;
    }

    if (obj instanceof Date) {
      return obj;
    }

    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack,
      } as unknown as T;
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = this.redactedValue;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value, depth + 1);
      } else if (typeof value === 'string' && this.mightContainSensitiveData(value)) {
        sanitized[key] = this.truncateAndRedact(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as T;
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const lowerName = fieldName.toLowerCase();
    return this.sensitiveFields.some(
      (sensitive) =>
        lowerName === sensitive.toLowerCase() ||
        lowerName.includes(sensitive.toLowerCase()),
    );
  }

  /**
   * Check if a string value might contain sensitive data
   * (e.g., JWT tokens, API keys)
   */
  private mightContainSensitiveData(value: string): boolean {
    // Check for JWT tokens (eyJ...)
    if (value.startsWith('eyJ') && value.includes('.')) {
      return true;
    }

    // Check for Bearer tokens
    if (value.toLowerCase().startsWith('bearer ')) {
      return true;
    }

    // Check for base64 encoded data that might be credentials
    if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
      return true;
    }

    return false;
  }

  /**
   * Truncate long strings and redact if they contain sensitive patterns
   */
  private truncateAndRedact(value: string): string {
    const maxLength = 100;

    if (this.mightContainSensitiveData(value)) {
      return this.redactedValue;
    }

    if (value.length > maxLength) {
      return `${value.substring(0, maxLength)}... [TRUNCATED]`;
    }

    return value;
  }

  /**
   * Create a sanitized log message
   * @param message - Log message
   * @param context - Additional context to sanitize
   */
  createSafeLogMessage(message: string, context?: Record<string, any>): string {
    const sanitizedContext = context ? this.sanitize(context) : {};
    return JSON.stringify({ message, ...sanitizedContext });
  }

  /**
   * Sanitize error for logging
   */
  sanitizeError(error: Error | unknown): Record<string, any> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: this.truncateAndRedact(error.message),
        stack: error.stack?.split('\n').slice(0, 5).join('\n'), // Limit stack trace
      };
    }
    return { error: String(error) };
  }
}
