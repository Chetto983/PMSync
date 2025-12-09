/**
 * Correlation Interceptor
 *
 * Sets up correlation context for all HTTP requests.
 * Enables request tracing across services and logs.
 *
 * The correlation ID is:
 * - Taken from X-Request-ID header if provided
 * - Generated using nanoid if not provided
 * - Passed to all downstream services
 * - Included in response headers
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CorrelationContext } from '../services/correlation-context.service';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();

    // Get correlation ID from request (set by RequestIdMiddleware) or headers
    const correlationId =
      (req as { id?: string }).id ||
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string);

    // Get tenant and user from authenticated request
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId || req.user?.id;
    const sessionId = req.user?.sessionId;

    // Run the request handler within correlation context
    return new Observable((subscriber) => {
      CorrelationContext.run(
        {
          correlationId,
          tenantId,
          userId,
          sessionId,
        },
        () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
