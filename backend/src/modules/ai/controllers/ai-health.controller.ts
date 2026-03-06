/**
 * AI Health Controller
 *
 * Public endpoint for monitoring AI module health status.
 * Used by load balancers, Kubernetes probes, and monitoring systems.
 *
 * No authentication required - designed for infrastructure monitoring.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { MistralService } from '../services/mistral.service';
import { CacheService } from '../../../common/services/cache.service';

/**
 * AI health status response
 */
export interface AiHealthResponse {
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
  };
}

@ApiTags('AI')
@Public()
@Controller('ai')
export class AiHealthController {
  constructor(
    private readonly mistralService: MistralService,
    private readonly cacheService: CacheService,
  ) { }

  /**
   * AI module health check
   * Public endpoint for load balancer health probes and monitoring systems.
   *
   * Status values:
   * - healthy: All services operational
   * - degraded: Some services impaired (circuit breaker half-open, cache down)
   * - unhealthy: Critical services unavailable
   */
  @Get('health')
  @ApiOperation({
    summary: 'AI module health check',
    description:
      'Returns health status of AI services (Mistral, Redis cache). Public endpoint for monitoring.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status returned',
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
  getHealth(): AiHealthResponse {
    // Get Mistral circuit breaker status
    const circuitBreaker = this.mistralService.getCircuitBreakerStatus();
    const mistralHealthy = circuitBreaker.state === 'closed';
    const mistralDegraded = circuitBreaker.state === 'half-open';

    // Get Redis cache status
    const cacheConnected = this.cacheService.isHealthy();

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (mistralHealthy && cacheConnected) {
      overallStatus = 'healthy';
    } else if (circuitBreaker.state === 'open' && !cacheConnected) {
      overallStatus = 'unhealthy';
    } else {
      overallStatus = 'degraded';
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
      },
    };
  }
}
