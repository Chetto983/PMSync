/**
 * AI Health Controller
 *
 * Public probe endpoint for load balancers and monitoring systems.
 * Admin-only detailed endpoint for circuit breaker and service diagnostics.
 */
import { Controller, Get, Post, Delete, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { MistralService } from '../services/mistral.service';
import { CacheService } from '../../../common/services/cache.service';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { EmailEmbeddingQueueService } from '../services/email-embedding.queue';
import { ContactEmbeddingQueueService } from '../services/contact-embedding.queue';

/**
 * Detailed AI health status response (admin only)
 */
export interface AiHealthDetailedResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    mistral: {
      status: string;
      circuitBreaker: string;
      failures: number;
      lastSuccess: string | null;
    };
    cache: {
      status: string;
      connected: boolean;
    };
    /** T-0405: DLQ stats for embedding queues */
    dlq?: {
      totalFailed: number;
      byQueue: Record<string, number>;
    };
    /** OBS-M2: Embedding queue depth metrics */
    embeddingQueues?: {
      email: { waiting: number; active: number; failed: number };
      contact: { waiting: number; active: number; failed: number };
    };
  };
}

@ApiTags('AI')
@Controller('ai')
export class AiHealthController {
  /** OBS-M2: DLQ items above this count trigger degraded status. */
  private static readonly DLQ_DEGRADED_THRESHOLD = 100;

  constructor(
    private readonly mistralService: MistralService,
    private readonly cacheService: CacheService,
    private readonly dlqService: DeadLetterQueueService,
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    private readonly contactEmbeddingQueue: ContactEmbeddingQueueService,
  ) { }

  /**
   * AI module health probe
   * Public endpoint for load balancer health probes and monitoring systems.
   * Returns only status -- no internal details exposed.
   */
  @Get('health')
  @Public()
  @ApiOperation({
    summary: 'AI module health probe',
    description: 'Returns simple health status (ok/degraded/unhealthy). No internal details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health probe status',
    schema: {
      properties: {
        status: { type: 'string', enum: ['ok', 'degraded', 'unhealthy'] },
      },
    },
  })
  getHealth(): { status: string } {
    const circuitBreaker = this.mistralService.getCircuitBreakerStatus();
    const mistralHealthy = circuitBreaker.state === 'closed';
    const cacheConnected = this.cacheService.isHealthy();

    let status: string;
    if (mistralHealthy && cacheConnected) {
      status = 'ok';
    } else if (circuitBreaker.state === 'open' && !cacheConnected) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return { status };
  }

  /**
   * AI module detailed health (admin only)
   * Returns full circuit breaker info, provider status, failure counts.
   * Requires authentication and admin role.
   */
  @Get('health/detailed')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'AI module detailed health (admin only)',
    description: 'Returns detailed health status including circuit breaker state and failure counts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Detailed health status returned',
    schema: {
      properties: {
        status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
        timestamp: { type: 'string', format: 'date-time' },
        services: {
          type: 'object',
          properties: {
            mistral: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                circuitBreaker: { type: 'string' },
                failures: { type: 'number' },
                lastSuccess: { type: 'string', format: 'date-time', nullable: true },
              },
            },
            cache: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                connected: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  })
  async getHealthDetailed(): Promise<AiHealthDetailedResponse> {
    const circuitBreaker = this.mistralService.getCircuitBreakerStatus();
    const mistralHealthy = circuitBreaker.state === 'closed';
    const mistralDegraded = circuitBreaker.state === 'half-open';
    const cacheConnected = this.cacheService.isHealthy();

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (mistralHealthy && cacheConnected) {
      overallStatus = 'healthy';
    } else if (circuitBreaker.state === 'open' && !cacheConnected) {
      overallStatus = 'unhealthy';
    } else {
      overallStatus = 'degraded';
    }

    // T-0405: Include DLQ stats for embedding queues
    let dlq: { totalFailed: number; byQueue: Record<string, number> } | undefined;
    try {
      const stats = await this.dlqService.getStats();
      dlq = { totalFailed: stats.totalFailed, byQueue: stats.byQueue };
      // OBS-M2: DLQ > threshold downgrades overall status
      if (stats.totalFailed > AiHealthController.DLQ_DEGRADED_THRESHOLD && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    } catch {
      // DLQ stats are non-critical — omit on failure
    }

    // OBS-M2: Embedding queue depth metrics
    let embeddingQueues: AiHealthDetailedResponse['services']['embeddingQueues'];
    try {
      const [emailStats, contactStats] = await Promise.all([
        this.emailEmbeddingQueue.getQueueStats(),
        this.contactEmbeddingQueue.getQueueStats(),
      ]);
      embeddingQueues = { email: emailStats, contact: contactStats };
    } catch {
      // Queue stats are non-critical — omit on failure
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        mistral: {
          status: mistralHealthy ? 'healthy' : mistralDegraded ? 'degraded' : 'unhealthy',
          circuitBreaker: circuitBreaker.state,
          failures: circuitBreaker.failures,
          lastSuccess: circuitBreaker.lastSuccess ? new Date(circuitBreaker.lastSuccess).toISOString() : null,
        },
        cache: {
          status: cacheConnected ? 'healthy' : 'unhealthy',
          connected: cacheConnected,
        },
        dlq,
        embeddingQueues,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // DLQ Management (admin only)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * List DLQ jobs with stats and error breakdown.
   * Use this to diagnose failure patterns before deciding to retry or clean.
   */
  @Get('health/dlq')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'List DLQ jobs with error breakdown (admin only)' })
  @ApiQuery({ name: 'queue', required: false, description: 'Filter by original queue (e.g. email-embedding)' })
  @ApiQuery({ name: 'errorType', required: false, description: 'Filter by error type (e.g. RateLimit, Timeout)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getDlqJobs(
    @Query('queue') queue?: string,
    @Query('errorType') errorType?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const safeLimit = Math.min(limit ?? 50, 100);
    const [stats, jobs] = await Promise.all([
      this.dlqService.getStats(),
      this.dlqService.getJobs({ queue, errorType, limit: safeLimit, offset: offset ?? 0 }),
    ]);

    return {
      stats,
      jobs: jobs.map((j) => ({
        originalJobId: j.originalJobId,
        originalQueue: j.originalQueue,
        failedAt: j.failedAt,
        attemptsMade: j.attemptsMade,
        lastError: j.lastError,
        metadata: j.metadata,
      })),
      pagination: { limit: safeLimit, offset: offset ?? 0, returned: jobs.length },
    };
  }

  /**
   * Retry DLQ jobs, optionally filtered by queue.
   * Re-enqueues failed jobs into their original queue with fresh retry budget.
   */
  @Post('health/dlq/retry')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Retry DLQ jobs (admin only)' })
  @ApiQuery({ name: 'queue', required: false, description: 'Filter by original queue name' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max jobs to retry (default 100)' })
  async retryDlqJobs(
    @Query('queue') queue?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    const safeLimit = Math.min(limit ?? 100, 500);
    const jobs = await this.dlqService.getJobs({ queue, limit: safeLimit });

    if (jobs.length === 0) {
      return { retried: 0, total: 0, message: 'No matching DLQ jobs found' };
    }

    const retried = await this.dlqService.retryBulk(
      jobs.map((j) => j.dlqJobId),
      { maxRetries: 3, retryDelay: 5000 },
    );

    return { retried, total: jobs.length };
  }

  /**
   * Remove old DLQ failures.
   * Use olderThanDays=0 to purge all, or a positive value to keep recent failures for analysis.
   */
  @Delete('health/dlq')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Clean DLQ failures (admin only)' })
  @ApiQuery({ name: 'olderThanDays', required: false, type: Number, description: 'Remove jobs older than N days (0 = all)' })
  async cleanDlq(
    @Query('olderThanDays', new DefaultValuePipe(0), ParseIntPipe) olderThanDays?: number,
  ) {
    const removed = await this.dlqService.cleanOldFailures(olderThanDays ?? 0);
    return { removed, olderThanDays: olderThanDays ?? 0 };
  }
}
