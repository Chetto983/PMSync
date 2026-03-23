import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query parameters for GET /ai/runs/analytics.
 * NeMo-inspired profiler: time-series, model breakdown, burn rate.
 */
export class AiAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to look back (1-90)', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  @Type(() => Number)
  days?: number;
}
