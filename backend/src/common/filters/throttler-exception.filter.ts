import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

/**
 * Custom filter for rate limit exceeded responses (SEC-05)
 * Returns 429 with Retry-After header as per HTTP spec
 */
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ThrottlerExceptionFilter.name);

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Default retry after 60 seconds (1 minute TTL)
    const retryAfter = 60;

    const userId = request.user?.userId || 'anonymous';
    this.logger.warn(
      `Rate limit exceeded for ${request.method} ${request.url} ` +
        `(IP: ${request.ip}, User: ${userId})`,
    );

    response
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .header('Retry-After', String(retryAfter))
      .header('X-RateLimit-Limit', '100') // Default tier
      .json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please slow down.',
        retryAfter,
      });
  }
}
