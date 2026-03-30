import { IsOptional, IsString, IsEnum, IsInt, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ChurnSortField {
  PROBABILITY = 'probability',
  COMPUTED_AT = 'computedAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListChurnSignalsQueryDto {
  @ApiPropertyOptional({ enum: ChurnSortField, default: ChurnSortField.PROBABILITY })
  @IsOptional()
  @IsEnum(ChurnSortField)
  sort?: ChurnSortField = ChurnSortField.PROBABILITY;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: 'Minimum churn probability threshold (0.0-1.0)', minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Filter by risk level: LOW, MEDIUM, HIGH' })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional({ description: 'Filter by accountId' })
  @IsOptional()
  @IsString()
  accountId?: string;

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
