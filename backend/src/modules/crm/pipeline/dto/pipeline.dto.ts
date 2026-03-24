import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  MaxLength,
  Min,
  Max,
  Matches,
  ArrayMinSize,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
  type ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'wonLostExclusive', async: false })
class WonLostExclusiveConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const obj = args.object as { isWon?: boolean; isLost?: boolean };
    return !(obj.isWon && obj.isLost);
  }

  defaultMessage() {
    return 'A stage cannot be both Won and Lost';
  }
}

// ---- Pipeline DTOs ----

export class CreatePipelineDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePipelineDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---- Stage DTOs ----

export class CreateStageDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  probability?: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color (e.g. #6B7280)' })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  @Validate(WonLostExclusiveConstraint)
  isLost?: boolean;
}

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  probability?: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color (e.g. #6B7280)' })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  @Validate(WonLostExclusiveConstraint)
  isLost?: boolean;
}

export class ReorderStagesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  orderedIds!: string[];
}
