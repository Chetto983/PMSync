import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ForecastQueryDto {
  @ApiPropertyOptional({ description: 'Pipeline ID to forecast' })
  @IsOptional()
  @IsString()
  pipelineId?: string;

  @ApiPropertyOptional({
    description: 'Period granularity',
    enum: ['month', 'quarter'],
    default: 'quarter',
  })
  @IsOptional()
  @IsIn(['month', 'quarter'])
  period?: 'month' | 'quarter';
}
