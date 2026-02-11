/**
 * Audit Log Interceptor (AUDIT-01)
 *
 * Global NestJS interceptor that auto-logs all authenticated HTTP data access
 * events to the audit_logs table via AuditService.logDataAccess().
 *
 * Exclusions:
 * - Unauthenticated requests (no request.user)
 * - Health check, metrics, and favicon endpoints
 *
 * Fire-and-forget: audit logging never blocks or fails the request.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../../common/services/audit.service';

/** Paths excluded from audit logging (health/metrics/static) */
const EXCLUDED_PATH_PATTERNS = [/\/health/, /\/metrics/, /\/favicon/];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    // Skip unauthenticated requests
    if (!request.user) {
      return next.handle();
    }

    // Skip health/metrics/favicon endpoints
    const path: string = request.path || '';
    if (EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget audit log (never awaited, never throws)
        this.auditService
          .logDataAccess({
            tenantId: request.user.tenantId,
            userId: request.user.userId || request.user.id,
            action: request.method,
            entity: context.getClass().name,
            entityId: request.params?.id,
            path,
            ipAddress: request.ip,
          })
          .catch(() => {
            // Swallowed intentionally - audit must never break requests
          });
      }),
    );
  }
}
