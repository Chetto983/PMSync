import { IsOptional, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum LeadScoreSortField {
  SCORE = 'score',
  COMPUTED_AT = 'computedAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListLeadScoresQueryDto {
  @ApiPropertyOptional({ enum: LeadScoreSortField, default: LeadScoreSortField.SCORE })
  @IsOptional()
  @IsEnum(LeadScoreSortField)
  sort?: LeadScoreSortField = LeadScoreSortField.SCORE;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: 'Filter by minimum score', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Filter by tier: hot, warm, cold' })
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
