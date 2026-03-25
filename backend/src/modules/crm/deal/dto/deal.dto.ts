import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsInt,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const DEAL_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const DEAL_SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'COLD_CALL',
  'EMAIL',
  'SOCIAL_MEDIA',
  'TRADE_SHOW',
  'OTHER',
] as const;

export class CreateDealDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  pipelineId!: string;

  @IsString()
  stageId!: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(DEAL_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  @IsIn(DEAL_SOURCES)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsString()
  accountId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string | null;

  @IsOptional()
  @IsDateString()
  closedAt?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(DEAL_PRIORITIES)
  priority?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(DEAL_SOURCES)
  source?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class ListDealsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDateFrom?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDateTo?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amountMin?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amountMax?: number;

  @IsOptional()
  @IsString()
  @IsIn(DEAL_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 25;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

export class ChangeStageDto {
  @IsString()
  stageId!: string;
}

export class LinkDealContactDto {
  @IsString()
  contactId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;
}
