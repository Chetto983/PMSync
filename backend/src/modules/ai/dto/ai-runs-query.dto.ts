import { IsOptional, IsInt, Min, Max, IsDateString, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query parameters for GET /ai/runs and GET /ai/runs/cost-summary.
 *
 * Phase 35 Plan 02 -- validates pagination, date range, and runType filters.
 */
export class AiRunsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter runs starting from this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter runs up to this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by run type (e.g., chat, briefing, draft)' })
  @IsOptional()
  @IsString()
  runType?: string;
}
