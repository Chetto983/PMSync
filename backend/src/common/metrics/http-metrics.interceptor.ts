import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram, Gauge } from 'prom-client';

/**
 * Phase 46-01: Global HTTP metrics interceptor.
 *
 * Records request duration in `http_request_duration_seconds` histogram
 * with method/route/status_code labels, and tracks in-flight request
 * count via `http_requests_in_flight` gauge.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private readonly duration: Histogram,
    @InjectMetric('http_requests_in_flight')
    private readonly inFlight: Gauge,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const method: string = req.method;

    this.inFlight.inc({ method });
    const endTimer = this.duration.startTimer({ method });

    let inFlightDecremented = false;

    const decInFlight = () => {
      if (!inFlightDecremented) {
        inFlightDecremented = true;
        this.inFlight.dec({ method });
      }
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const route: string = req.route?.path || 'unmatched';
          const statusCode = String(res.statusCode);
          endTimer({ route, status_code: statusCode });
          decInFlight();
        },
        error: (error: any) => {
          const route: string = req.route?.path || 'unmatched';
          const statusCode = String(error?.status || error?.statusCode || 500);
          endTimer({ route, status_code: statusCode });
          decInFlight();
        },
      }),
      // Safety net: if the stream is cancelled without tap firing
      finalize(() => {
        decInFlight();
      }),
    );
  }
}
