import { IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Hex color regex: #RGB, #RRGGBB, or #RRGGBBAA */
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export class LabelColorDto {
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'backgroundColor must be a valid hex color (e.g. #FF0000)' })
  backgroundColor!: string;

  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color (e.g. #FFFFFF)' })
  textColor!: string;
}

export class CreateLabelDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LabelColorDto)
  color?: LabelColorDto;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  aiPrompt?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LabelColorDto)
  color?: LabelColorDto | null;

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  aiPrompt?: string | null;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class AddEmailsToLabelDto {
  @IsArray()
  @IsString({ each: true })
  emailIds!: string[];
}

export class ReorderLabelsDto {
  @IsArray()
  @IsString({ each: true })
  labelIds!: string[];
}
