import { Global, Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeHistogramProvider,
  makeGaugeProvider,
  makeCounterProvider,
  getToken,
} from '@willsoto/nestjs-prometheus';
import { QueueMetricsCollector } from './queue-metrics.collector';

/**
 * Phase 46-01: Global metrics module providing Prometheus exposition endpoint
 * and all metric provider definitions for downstream injection.
 *
 * Registers /metrics endpoint with default Node.js metrics (event loop, heap, GC)
 * plus 6 application-level metrics for HTTP, queue, and AI observability.
 */
@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    // HTTP metrics (consumed by HttpMetricsInterceptor)
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeGaugeProvider({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method'],
    }),

    // Queue metrics (consumed by Plan 02 queue-depth collector)
    makeGaugeProvider({
      name: 'bullmq_queue_depth',
      help: 'BullMQ queue depth by queue and state',
      labelNames: ['queue', 'state'],
    }),

    // AI metrics (consumed by Plan 02 AI interceptor)
    makeCounterProvider({
      name: 'ai_tokens_total',
      help: 'Total AI tokens consumed',
      labelNames: ['model', 'type'],
    }),
    makeCounterProvider({
      name: 'ai_cost_usd_total',
      help: 'Total estimated AI cost in USD',
      labelNames: ['model'],
    }),
    makeCounterProvider({
      name: 'ai_requests_total',
      help: 'Total AI requests',
      labelNames: ['model', 'run_type', 'status'],
    }),

    // Phase 46-02: Scheduled queue depth collector
    QueueMetricsCollector,
  ],
  exports: [
    PrometheusModule,
    // Export metric providers so global interceptors/services outside this module can inject them.
    getToken('http_request_duration_seconds'),
    getToken('http_requests_in_flight'),
    getToken('bullmq_queue_depth'),
    getToken('ai_tokens_total'),
    getToken('ai_cost_usd_total'),
    getToken('ai_requests_total'),
  ],
})
export class MetricsModule {}
