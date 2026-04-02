import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

export class BulkDeleteLabelsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  labelIds!: string[];
}

export class CreateLabelWizardDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LabelColorDto)
  color?: LabelColorDto;

  @IsString()
  @IsIn(['workflow', 'semantic', 'suppression', 'custom'])
  category!: string;

  @IsArray()
  @IsString({ each: true })
  roles!: string[];

  @IsArray()
  @IsString({ each: true })
  contents!: string[];

  @IsString()
  @IsIn(['none', 'followup', 'urgent', 'decide'])
  actionType!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mutuallyExclusiveWith?: string[];

  @IsOptional()
  @IsBoolean()
  suppressUrgency?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  aiPrompt?: string;
}

export class UpdateLabelWizardDto extends CreateLabelWizardDto {}

export class LabelPreviewDto {
  @ApiProperty({
    description: 'Email ID to preview this label against',
    example: 'cmnhcur3q001201mt8umm2fwe',
  })
  @IsString()
  @IsNotEmpty()
  emailId!: string;

  @ApiProperty({
    required: false,
    description: 'Optional locale used by the unified email analysis',
    example: 'it',
  })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  locale?: string;
}

export class LabelWizardPreviewDto extends CreateLabelWizardDto {
  @ApiProperty({
    description: 'Email ID to preview this draft label against',
    example: 'cmnhcur3q001201mt8umm2fwe',
  })
  @IsString()
  @IsNotEmpty()
  emailId!: string;

  @ApiProperty({
    required: false,
    description: 'Existing label ID when previewing edits to an already saved label',
    example: 'cmnhdwnn8000101ppd5b6qnvi',
  })
  @IsOptional()
  @IsString()
  labelId?: string;

  @ApiProperty({
    required: false,
    description: 'Optional locale used by the unified email analysis',
    example: 'it',
  })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  locale?: string;
}

export class TriageOnboardingRulesDto {
  @ApiProperty({
    required: false,
    type: [String],
    description: 'Customer email domains that should bias triage toward customer context',
    example: ['acme.com', 'contoso.it'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerDomains?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Specific senders that deserve higher operational attention',
    example: ['cto@acme.com', 'ops@railway.app'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  importantSenders?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Projects or phrases that often imply real work',
    example: ['PMSync production deploy', 'customer migration'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  projectTopics?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Alert sources that should map to operational system labels',
    example: ['GitHub Actions', 'Railway'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  systemAlertSources?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Billing or finance phrases to reinforce the finance label',
    example: ['invoice overdue', 'subscription renewal'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  billingTopics?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    description: 'FYI topics that should stay visible but low-urgency',
    example: ['weekly digest', 'product newsletter'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reviewLaterTopics?: string[];

  @ApiProperty({
    required: false,
    description: 'Default follow-up revisit target in hours',
    example: 24,
    minimum: 4,
    maximum: 240,
  })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(240)
  followUpSlaHours?: number;
}
