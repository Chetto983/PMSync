/**
 * AI Health Controller
 *
 * Public probe endpoint for load balancers and monitoring systems.
 * Admin-only detailed endpoint for circuit breaker and service diagnostics.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { MistralService } from '../services/mistral.service';
import { CacheService } from '../../../common/services/cache.service';

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
  };
}

@ApiTags('AI')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('ai')
export class AiHealthController {
  constructor(
    private readonly mistralService: MistralService,
    private readonly cacheService: CacheService,
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
  getHealthDetailed(): AiHealthDetailedResponse {
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
