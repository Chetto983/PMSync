import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum TimeRange {
  LAST_7D = '7d',
  LAST_30D = '30d',
  LAST_90D = '90d',
}

export class GovernanceQueryDto {
  @ApiPropertyOptional({ enum: TimeRange, default: TimeRange.LAST_30D })
  @IsOptional()
  @IsEnum(TimeRange)
  range?: TimeRange = TimeRange.LAST_30D;
}

export class RetrainModelDto {
  @ApiPropertyOptional({ description: 'Model type to retrain' })
  @IsString()
  modelType!: string;
}
