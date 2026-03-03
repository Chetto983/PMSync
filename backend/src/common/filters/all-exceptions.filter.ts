import { Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';

    if (exception instanceof HttpException) {
      // NestJS exceptions (guards, pipes, interceptors)
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as { message?: string }).message || exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
      // http-errors (e.g. csrf-csrf ForbiddenError) have statusCode
      const statusCode = (exception as { statusCode?: number }).statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 600) {
        status = statusCode;
      }
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${status} ${message} - ${request.method} ${request.url}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
