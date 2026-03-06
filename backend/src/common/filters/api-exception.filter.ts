import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

interface ResolvedError {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}

/**
 * Unified API exception filter.
 *
 * All HTTP errors produce the shape:
 *   { error: { code, message, details }, meta: { requestId } }
 *
 * No `statusCode` field in the body -- HTTP status is in the status line only.
 * 5xx: logger.error with stack. 4xx: logger.warn.
 */
@Catch()
export class ApiExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = (request as { id?: string }).id || 'unknown';

    const resolved = this.resolveException(exception);

    if (resolved.status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${resolved.status} ${resolved.code} - ${request.method} ${request.url}`,
      );
    }

    // Set Retry-After header for rate-limited responses
    if (resolved.status === HttpStatus.TOO_MANY_REQUESTS) {
      response.header('Retry-After', String(resolved.details?.retryAfter ?? 60));
    }

    response.status(resolved.status).json({
      error: {
        code: resolved.code,
        message: resolved.message,
        details: resolved.details,
      },
      meta: { requestId },
    });
  }

  private resolveException(exception: unknown): ResolvedError {
    // 1. ThrottlerException (check BEFORE HttpException since it extends HttpException)
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please slow down.',
        details: { retryAfter: 60 },
      };
    }

    // 2. HttpException (NestJS guards, pipes, manual throws)
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    // 3. PrismaClientKnownRequestError (duck-type to avoid hard import issues in tests)
    if (this.isPrismaKnownError(exception)) {
      return this.resolvePrismaError(exception);
    }

    // 4a. CSRF token error (from csrf.middleware.ts)
    if (
      exception instanceof Error &&
      (exception as { code?: string }).code === 'CSRF_TOKEN_INVALID'
    ) {
      return {
        status: 403,
        code: 'CSRF_TOKEN_INVALID',
        message: exception.message || 'Security token expired. Please retry.',
        details: null,
      };
    }

    // 4. Error with statusCode (e.g. http-errors from csrf-csrf)
    if (exception instanceof Error) {
      const statusCode = (exception as { statusCode?: number }).statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 600) {
        return {
          status: statusCode,
          code: this.statusToCode(statusCode),
          message: statusCode >= 500 ? 'Internal server error' : exception.message,
          details: null,
        };
      }
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: null,
      };
    }

    // 5. Unknown throw (string, number, etc.)
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
    };
  }

  private resolveHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const exResponse = exception.getResponse();
    const rawMessage =
      typeof exResponse === 'string'
        ? exResponse
        : (exResponse as { message?: string | string[] }).message || exception.message;

    // ValidationPipe returns message as array
    if (Array.isArray(rawMessage)) {
      return {
        status,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          fields: rawMessage.map((m: string) => ({
            field: this.extractFieldFromMessage(m),
            message: m,
          })),
        },
      };
    }

    return {
      status,
      code: this.statusToCode(status),
      message: typeof rawMessage === 'string' ? rawMessage : exception.message,
      details: null,
    };
  }

  private isPrismaKnownError(
    err: unknown,
  ): err is Error & { code: string; meta?: Record<string, unknown> } {
    return (
      err instanceof Error &&
      err.constructor.name === 'PrismaClientKnownRequestError' &&
      'code' in err
    );
  }

  private resolvePrismaError(
    err: Error & { code: string; meta?: Record<string, unknown> },
  ): ResolvedError {
    switch (err.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'RESOURCE_DUPLICATE',
          message: 'A record with the given unique constraint already exists',
          details: { target: err.meta?.target ?? null },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested record was not found',
          details: { model: err.meta?.modelName ?? null },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: null,
        };
    }
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
    };
    return map[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'CLIENT_ERROR');
  }

  private extractFieldFromMessage(msg: string): string {
    // NestJS ValidationPipe messages often start with "fieldName ..."
    const match = msg.match(/^(\w+)\s/);
    return match ? match[1] : 'unknown';
  }
}
