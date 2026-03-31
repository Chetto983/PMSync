import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RuleConditionDto {
  @IsString()
  @IsIn(['subject_keyword', 'sender_domain', 'priority'])
  field!: string;

  @IsString()
  @IsIn(['contains', 'equals', 'not_equals'])
  operator!: string;

  @IsString()
  @MaxLength(200)
  value!: string;
}

export class RuleActionDto {
  @IsOptional()
  @IsString()
  assignTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  setPriority?: string;
}

export class CreateRoutingRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions!: RuleConditionDto[];

  @ValidateNested()
  @Type(() => RuleActionDto)
  action!: RuleActionDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRoutingRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RuleActionDto)
  action?: RuleActionDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
