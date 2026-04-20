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
      defaultLabels: {
        instance: process.env.RAILWAY_REPLICA_ID || 'local',
      },
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

    // Phase 148 D-13: per-window micro-averaged triage accuracy.
    // `tenant_id` label gated by TRIAGE_METRICS_PER_TENANT=true (default off) to
    // stay under 2026 Prometheus cardinality budget (1000 tenants × 20 labels ×
    // 3 windows × 3 sources = 180k series, capped to 100 values per label name).
    // Evaluated at module-load time; flipping the env at runtime requires a
    // process restart to take effect.
    makeGaugeProvider({
      name: 'triage_accuracy_precision',
      help: 'Micro-averaged triage precision per window (sum(tp)/sum(tp+fp))',
      labelNames:
        process.env.TRIAGE_METRICS_PER_TENANT === 'true'
          ? ['tenant_id', 'window']
          : ['window'],
    }),
    makeGaugeProvider({
      name: 'triage_accuracy_recall',
      help: 'Micro-averaged triage recall per window (sum(tp)/sum(tp+fn))',
      labelNames:
        process.env.TRIAGE_METRICS_PER_TENANT === 'true'
          ? ['tenant_id', 'window']
          : ['window'],
    }),
    makeGaugeProvider({
      name: 'triage_accuracy_f1',
      help: 'Micro-averaged triage F1 per window (2*p*r/(p+r))',
      labelNames:
        process.env.TRIAGE_METRICS_PER_TENANT === 'true'
          ? ['tenant_id', 'window']
          : ['window'],
    }),
    // Per-kind correction counter — bounded cardinality 2/3 × 4 × 4 = 48 series
    // max (signal × triage_source × kind). NO tenant_id (D-13 cardinality cap).
    makeCounterProvider({
      name: 'triage_accuracy_corrections_total',
      help: 'Total triage accuracy mutations by signal × triage_source × kind',
      labelNames: ['signal', 'triage_source', 'kind'],
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
    // Phase 148 D-13 triage accuracy metrics
    getToken('triage_accuracy_precision'),
    getToken('triage_accuracy_recall'),
    getToken('triage_accuracy_f1'),
    getToken('triage_accuracy_corrections_total'),
  ],
})
export class MetricsModule {}
