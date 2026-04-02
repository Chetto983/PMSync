import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TriageRuleDto {
  @ApiProperty({
    enum: ['domain', 'sender', 'keyword', 'phrase'],
    example: 'domain',
  })
  @IsIn(['domain', 'sender', 'keyword', 'phrase'])
  type: 'domain' | 'sender' | 'keyword' | 'phrase';

  @ApiProperty({ example: 'acme.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  pattern: string;

  @ApiProperty({
    enum: ['important', 'customer-vip', 'system-alert', 'review-later', 'suppress', 'billing', 'follow-up'],
    example: 'customer-vip',
  })
  @IsIn(['important', 'customer-vip', 'system-alert', 'review-later', 'suppress', 'billing', 'follow-up'])
  action: 'important' | 'customer-vip' | 'system-alert' | 'review-later' | 'suppress' | 'billing' | 'follow-up';

  @ApiPropertyOptional({ example: 'Customer' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelName?: string;
}

export class UpdateTriageRulesDto {
  @ApiProperty({ type: [TriageRuleDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TriageRuleDto)
  rules: TriageRuleDto[];
}

export class TriagePreviewDto {
  @ApiProperty({ example: 'clxyz123' })
  @IsString()
  emailId: string;
}
