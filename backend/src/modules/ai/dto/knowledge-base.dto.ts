import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * CUID validation pattern for tenant/entity IDs
 * CUIDs from Prisma are lowercase alphanumeric strings starting with 'c'
 * Example: cjld2cjxh0000qzrmn831i7rn
 */
const CUID_PATTERN = /^c[a-z0-9]{20,}$/;

export class BackfillEmailsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  batchSize?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean;

  /** Admin override: target tenant ID (must be valid CUID) */
  @IsOptional()
  @IsString()
  @Matches(CUID_PATTERN, { message: 'tenantId must be a valid CUID' })
  tenantId?: string;
}

export class ListEmbeddingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Admin override: target tenant ID (must be valid CUID) */
  @IsOptional()
  @IsString()
  @Matches(CUID_PATTERN, { message: 'tenantId must be a valid CUID' })
  tenantId?: string;
}

export class TenantScopedQueryDto {
  /** Admin override: target tenant ID (must be valid CUID) */
  @IsOptional()
  @IsString()
  @Matches(CUID_PATTERN, { message: 'tenantId must be a valid CUID' })
  tenantId?: string;
}

export class SearchKnowledgeBaseDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  emailId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @IsOptional()
  @IsString()
  locale?: string;
}
